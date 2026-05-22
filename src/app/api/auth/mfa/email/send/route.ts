/**
 * POST /api/auth/mfa/email/send
 *
 * 認証済み（AAL1 以上）ユーザーの登録メールアドレス宛に、6桁の OTP コードを
 * 送信する。送信先はユーザーが選べず、必ず auth.users.email を使う。
 *
 * 流れ:
 *   1. 認証チェック（パスワードログイン後 = AAL1 で OK）
 *   2. レート制限（auth 枠 = 1分5回）
 *   3. コード生成・ハッシュ保存（既存コードがあれば UNIQUE 制約により上書き）
 *   4. Resend で送信
 *   5. 監査ログ記録
 *
 * 本ルートは Node ランタイム必須（scrypt 利用のため）。
 */

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import {
  generateOtpCode,
  upsertEmailOtp,
  OTP_TTL_SECONDS,
} from '@/lib/mfa-email';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';
import { getFromAddress, REPLY_TO, htmlToPlainText, PLAIN_FOOTER } from '@/lib/email';
import { recordAuditLog } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  // レート制限: 認証系の厳しめ枠を流用（同一ユーザー 5req/60s）
  const rl = await checkRateLimit('auth', getRateLimitIdentifier(request, auth.userId));
  if (!rl.success) return rateLimitExceededResponse(rl);

  // 登録メールアドレスを取得（service_role 経由で auth.users から確実に取る）
  const service = createServiceClient();
  const { data: userData, error: userErr } = await service.auth.admin.getUserById(
    auth.userId,
  );
  const email = userData?.user?.email;
  if (userErr || !email) {
    return NextResponse.json(
      { error: 'ユーザー情報を取得できませんでした' },
      { status: 500 },
    );
  }

  // コード生成 + 保存
  const code = generateOtpCode();
  try {
    await upsertEmailOtp({ userId: auth.userId, code });
  } catch (e) {
    console.error('[mfa-email-send] upsert failed:', e);
    return NextResponse.json(
      { error: '認証コードの発行に失敗しました' },
      { status: 500 },
    );
  }

  // メール送信
  const ttlMinutes = Math.floor(OTP_TTL_SECONDS / 60);
  const html = buildOtpEmailHtml({ code, ttlMinutes });
  const subject = `[S/PASS] 認証コード: ${code}`;

  try {
    const { error: sendErr } = await resend.emails.send({
      from: getFromAddress(),
      to: email,
      replyTo: REPLY_TO,
      subject,
      html,
      text: htmlToPlainText(html) + '\n\n' + PLAIN_FOOTER,
    });
    if (sendErr) {
      throw new Error(sendErr.message);
    }
  } catch (e) {
    console.error('[mfa-email-send] resend failed:', e);
    return NextResponse.json(
      { error: '認証コードの送信に失敗しました。時間をおいて再度お試しください。' },
      { status: 502 },
    );
  }

  // 監査ログ（コードは記録しない、宛先メアドのドメイン部のみ記録）
  await recordAuditLog({
    userId: auth.userId,
    action: 'mfa_email_otp_sent',
    request,
    metadata: { email_domain: email.split('@')[1] ?? null },
  });

  return NextResponse.json({
    ok: true,
    // フロント側で「xxx@example.com に送信しました」表示用にマスク済みメアドを返す
    sentTo: maskEmail(email),
    expiresInSeconds: OTP_TTL_SECONDS,
  });
}

/** "yamada@example.com" → "y****@example.com" */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

function buildOtpEmailHtml({
  code,
  ttlMinutes,
}: {
  code: string;
  ttlMinutes: number;
}): string {
  return `<!DOCTYPE html>
<html lang="ja">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; line-height: 1.7; color: #1a1f1c; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>S/PASS の認証コードをお送りします。</p>
  <div style="margin: 24px 0; padding: 24px; background: #f4f6f3; border-radius: 8px; text-align: center;">
    <div style="font-size: 12px; color: #5b6b5e; margin-bottom: 8px;">認証コード</div>
    <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; font-family: 'SF Mono', 'Menlo', monospace;">${code}</div>
  </div>
  <p>このコードは <strong>${ttlMinutes}分間</strong> 有効です。<br>
     画面に戻り、コードを入力してログインを完了してください。</p>
  <p style="color: #5b6b5e; font-size: 13px; margin-top: 32px;">
    心当たりがない場合は、このメールを無視してください。<br>
    第三者がコードを試行した場合は、念のためパスワードを変更してください。
  </p>
</body>
</html>`;
}
