/**
 * POST /api/billing/portal
 *
 * Stripe Customer Portal セッションを作成して URL を返す。
 * 認証済みかつ stripe_customer_id を持つユーザーのみ呼び出し可能。
 *
 * Portal では以下が可能（Stripe Dashboard の Portal 設定に依存）:
 *   - プラン変更（スターター ⇄ プロ）
 *   - 期間末解約 / 解約キャンセル
 *   - カード情報の変更
 *   - 請求書 / 領収書のダウンロード
 *   - 請求先住所・連絡先メールの変更
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const rateLimitId = getRateLimitIdentifier(request, auth.userId);
  const rateLimit = await checkRateLimit('api', rateLimitId);
  if (!rateLimit.success) return rateLimitExceededResponse(rateLimit);

  const supabase = createServiceClient();
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: '請求情報が見つかりません。先にプランを開始してください。' },
      { status: 404 },
    );
  }

  // 戻り先 URL（設定の請求情報画面へ）
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const returnUrl = `${base}/dashboard/settings/billing`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: returnUrl,
      locale: 'ja',
    });
    if (!session.url) {
      return NextResponse.json(
        { error: 'Portal URL の取得に失敗しました' },
        { status: 502 },
      );
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing/portal] session create failed:', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { error: `Portal セッションの作成に失敗しました: ${message}` },
      { status: 502 },
    );
  }
}
