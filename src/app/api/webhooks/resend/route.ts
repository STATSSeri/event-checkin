import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/resend
 * Resend からの Webhook 受信エンドポイント。
 * bounce / complaint / delivered などのイベントを受け取り、
 * 必要に応じて DB に記録する（Sprint 2 の本実装は最小限。bounce 通知UIは Sprint 5 で）。
 *
 * セキュリティ：
 *  - Resend は svix 互換の HMAC SHA-256 署名を `svix-signature` ヘッダで送る
 *  - `RESEND_WEBHOOK_SECRET` を Resend ダッシュボードで取得し環境変数に設定
 *  - 未設定時は 503 を返して受信を拒否（誤検知より安全側）
 *
 * 参考：https://resend.com/docs/dashboard/webhooks/introduction
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      '[webhooks/resend] RESEND_WEBHOOK_SECRET is not set; rejecting',
    );
    return NextResponse.json(
      { error: 'Webhook is not configured on this server' },
      { status: 503 },
    );
  }

  // 生のボディが必要（署名検証のため request.json() を先に呼ばない）
  const rawBody = await request.text();

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 },
    );
  }

  // 署名検証（svix 形式: "v1,<base64>" のセミコロン区切り複数候補を含む）
  // 仕様: https://docs.svix.com/receiving/verifying-payloads/how-manual
  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const secretKey = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf-8');
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(signedPayload)
    .digest('base64');

  const candidates = svixSignature.split(' ').map((s) => s.split(',')[1]);
  const matched = candidates.some((sig) => {
    if (!sig) return false;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig, 'base64'),
        Buffer.from(expectedSignature, 'base64'),
      );
    } catch {
      return false;
    }
  });

  if (!matched) {
    console.error('[webhooks/resend] Signature verification failed');
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 },
    );
  }

  // タイムスタンプの古すぎる/新しすぎるリクエストを拒否（5分許容）
  const tsSec = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(tsSec) || Math.abs(Date.now() / 1000 - tsSec) > 300) {
    return NextResponse.json(
      { error: 'Timestamp out of tolerance' },
      { status: 400 },
    );
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Sprint 2 の段階では受信ログのみ。bounce/complaint の DB 反映と通知UIは Sprint 5。
  console.log(
    '[webhooks/resend] Received event:',
    event.type,
    JSON.stringify(event.data ?? {}).slice(0, 500),
  );

  return NextResponse.json({ received: true });
}
