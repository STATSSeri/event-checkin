/**
 * メールOTP多要素認証のサーバサイドロジック
 *
 * Supabase Auth の標準 factor type は totp / phone のみのため、メールOTPは
 * 独自テーブル email_otp_verifications で管理する。生コードは保管せず、
 * scrypt ハッシュのみを保持。
 *
 * 設計原則:
 *  - 1ユーザー1アクティブコード（UNIQUE(user_id) で物理的に担保）
 *  - 有効期限 5 分、試行回数上限 5 回
 *  - 失効時刻と試行回数の判定はサーバ側のみ
 *  - service_role 経由でのみアクセス（RLS は deny_all）
 */

import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';

const OTP_LENGTH = 6;
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const PREFIX = 'scrypt';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
/** メールOTP検証後、再検証なしで通過させる最大経過秒数（12時間） */
export const OTP_VERIFIED_VALID_SECONDS = 12 * 60 * 60;

/** 6桁のランダムコードを返す（"123456" 形式、先頭ゼロも許容） */
export function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH;
  const n = randomInt(0, max);
  return String(n).padStart(OTP_LENGTH, '0');
}

/** 平文コード → 保管用ハッシュ文字列 `scrypt$<saltHex>$<hashHex>` */
export function hashOtpCode(code: string, salt: string): string {
  const hash = scryptSync(code, salt, SCRYPT_KEYLEN).toString('hex');
  return `${PREFIX}$${salt}$${hash}`;
}

/** ハッシュからソルトを抽出してコードを照合（定数時間比較） */
export function verifyOtpCode(code: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  const candidate = scryptSync(code, salt, SCRYPT_KEYLEN);
  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(expected, candidate);
}

/** ランダムなソルト（hex 32文字 = 16 byte） */
export function generateSalt(): string {
  return randomBytes(SALT_BYTES).toString('hex');
}

interface UpsertOtpInput {
  userId: string;
  code: string;
}

/**
 * 新規コードを upsert（既存コードは上書き）。
 * UNIQUE(user_id) 制約により旧コードは自動的に置換される。
 */
export async function upsertEmailOtp({
  userId,
  code,
}: UpsertOtpInput): Promise<void> {
  const salt = generateSalt();
  const codeHash = hashOtpCode(code, salt);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

  const service = createServiceClient();
  const { error } = await service.from('email_otp_verifications').upsert(
    {
      user_id: userId,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      verified_at: null,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    throw new Error(`email_otp upsert failed: ${error.message}`);
  }
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'invalid' };

/**
 * 入力されたコードを検証し、成功なら verified_at をセット。
 * 試行回数はインクリメント、上限到達でレコードを使用不能化する。
 */
export async function verifyEmailOtp(
  userId: string,
  inputCode: string,
): Promise<VerifyOtpResult> {
  const service = createServiceClient();
  const { data: row, error } = await service
    .from('email_otp_verifications')
    .select('code_hash, expires_at, attempts, verified_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`email_otp select failed: ${error.message}`);
  }
  if (!row) {
    return { ok: false, reason: 'not_found' };
  }

  // 既に使用済みコードの再使用は拒否
  if (row.verified_at) {
    return { ok: false, reason: 'invalid' };
  }

  const expiresAt = new Date(row.expires_at).getTime();
  if (Date.now() > expiresAt) {
    return { ok: false, reason: 'expired' };
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  const match = verifyOtpCode(inputCode, row.code_hash);

  if (!match) {
    // 試行回数をインクリメント。エラーは握り潰す（記録できなくても拒否は確定）
    await service
      .from('email_otp_verifications')
      .update({ attempts: row.attempts + 1 })
      .eq('user_id', userId);
    return { ok: false, reason: 'invalid' };
  }

  // 成功: verified_at をセット + user_security_meta.last_mfa_verified_at を更新
  const now = new Date().toISOString();
  await service
    .from('email_otp_verifications')
    .update({ verified_at: now, attempts: row.attempts + 1 })
    .eq('user_id', userId);

  await service.from('user_security_meta').upsert(
    {
      user_id: userId,
      last_mfa_verified_at: now,
    },
    { onConflict: 'user_id' },
  );

  return { ok: true };
}

/** ユーザーの直近メールOTP検証時刻が有効期限内かを判定 */
export function isMfaVerificationFresh(
  lastVerifiedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (!lastVerifiedAt) return false;
  const verifiedTs = new Date(lastVerifiedAt).getTime();
  if (Number.isNaN(verifiedTs)) return false;
  return now - verifiedTs < OTP_VERIFIED_VALID_SECONDS * 1000;
}
