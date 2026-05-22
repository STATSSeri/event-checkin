/**
 * POST /api/auth/mfa/email/verify
 *
 * ユーザーが入力した 6桁コードを検証し、成功なら
 * user_security_meta.last_mfa_verified_at を更新する。
 * middleware はこの時刻を見て /dashboard・/scan へのアクセスを許可する。
 *
 * 流れ:
 *   1. 認証チェック（AAL1 で OK）
 *   2. レート制限（auth 枠 = 厳しめ）
 *   3. コード形式チェック（6桁数字）
 *   4. verifyEmailOtp で照合
 *   5. 監査ログ記録
 *
 * 本ルートは Node ランタイム必須（scrypt 利用のため）。
 */

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { verifyEmailOtp, type VerifyOtpResult } from '@/lib/mfa-email';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';
import { recordAuditLog } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODE_PATTERN = /^\d{6}$/;

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const rl = await checkRateLimit('auth', getRateLimitIdentifier(request, auth.userId));
  if (!rl.success) return rateLimitExceededResponse(rl);

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!CODE_PATTERN.test(code)) {
    return NextResponse.json(
      { error: '6桁の認証コードを入力してください' },
      { status: 400 },
    );
  }

  let result: VerifyOtpResult;
  try {
    result = await verifyEmailOtp(auth.userId, code);
  } catch (e) {
    console.error('[mfa-email-verify] error:', e);
    return NextResponse.json(
      { error: '検証中にエラーが発生しました' },
      { status: 500 },
    );
  }

  if (!result.ok) {
    await recordAuditLog({
      userId: auth.userId,
      action: 'mfa_email_otp_verify_failure',
      request,
      metadata: { reason: result.reason },
    });
    return NextResponse.json(
      { error: errorMessageFor(result.reason) },
      { status: 400 },
    );
  }

  await recordAuditLog({
    userId: auth.userId,
    action: 'mfa_email_otp_verify_success',
    request,
  });

  return NextResponse.json({ ok: true });
}

function errorMessageFor(reason: Exclude<VerifyOtpResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'not_found':
      return '認証コードが見つかりません。コードを再送信してください。';
    case 'expired':
      return '認証コードの有効期限が切れました。コードを再送信してください。';
    case 'too_many_attempts':
      return '試行回数の上限に達しました。コードを再送信してください。';
    case 'invalid':
      return '認証コードが正しくありません。';
  }
}
