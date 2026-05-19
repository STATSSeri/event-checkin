/**
 * パスワード履歴チェック用のハッシュ関数。
 *
 * Supabase Auth の内部ハッシュは外部から取り出せないため、
 * パスワード変更時に「我々のサーバが受け取った平文」を独自に scrypt で
 * ハッシュ化して password_history に積み上げる。
 *
 * 履歴比較のためだけに保管するハッシュであり、ログイン認証には使わない。
 * Node の組み込み crypto.scrypt を使うため外部依存は不要。
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const PREFIX = 'scrypt';

/** 平文パスワード → 保管用ハッシュ文字列 `scrypt$<saltHex>$<hashHex>` */
export function hashForHistory(plain: string): string {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN).toString('hex');
  return `${PREFIX}$${salt}$${hash}`;
}

/** 平文パスワードが保管済みハッシュと一致するかを定数時間比較で確認 */
export function matchesHistoryHash(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  const candidate = scryptSync(plain, salt, SCRYPT_KEYLEN);
  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(expected, candidate);
}
