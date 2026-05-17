/**
 * POST /api/billing/checkout
 *
 * Stripe Checkout Session を作成し、ホスト型決済ページへのリダイレクトURLを返す。
 *
 * フロー:
 *   1. 認証ユーザー取得
 *   2. subscriptions テーブルから既存レコード取得（または新規作成）
 *   3. Stripe Customer を取得（既存があれば再利用、なければ新規作成）
 *   4. Checkout Session を作成（trial_period_days = 14、カード必須）
 *   5. Session URL を返却
 *
 * Body: { plan: 'starter' | 'pro' }
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import {
  stripe,
  getStripePriceId,
  getCheckoutUrls,
  TRIAL_PERIOD_DAYS,
} from '@/lib/stripe';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';
import type { PlanId } from '@/types';

// cookie 参照のため動的ルート
export const dynamic = 'force-dynamic';

function isPlanId(value: unknown): value is PlanId {
  return value === 'starter' || value === 'pro';
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const rateLimitId = getRateLimitIdentifier(request, auth.userId);
  const rateLimit = await checkRateLimit('api', rateLimitId);
  if (!rateLimit.success) return rateLimitExceededResponse(rateLimit);

  // 入力検証
  let body: { plan?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON が不正です' }, { status: 400 });
  }
  if (!isPlanId(body.plan)) {
    return NextResponse.json(
      { error: 'plan は "starter" または "pro" を指定してください' },
      { status: 400 },
    );
  }
  const plan: PlanId = body.plan;

  const supabase = createServiceClient();

  // 認証ユーザーの情報（メールアドレス取得用）
  const { data: { user: userRecord }, error: userErr } = await supabase.auth.admin.getUserById(auth.userId);
  if (userErr || !userRecord) {
    console.error('[billing/checkout] failed to fetch user:', userErr);
    return NextResponse.json({ error: 'ユーザー情報の取得に失敗しました' }, { status: 500 });
  }
  const email = userRecord.email;
  if (!email) {
    return NextResponse.json(
      { error: 'メールアドレスが未設定のためチェックアウトできません' },
      { status: 400 },
    );
  }

  // 既存サブスクレコードを取得
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', auth.userId)
    .maybeSingle();

  // 既に課金中（active / trialing）の場合は二重チェックアウトを防止
  if (existingSub && (existingSub.status === 'active' || existingSub.status === 'trialing')) {
    return NextResponse.json(
      { error: '既に有効なサブスクリプションがあります。プラン変更はカスタマーポータルから行ってください。' },
      { status: 409 },
    );
  }

  // Stripe Customer 取得 or 作成
  let stripeCustomerId = existingSub?.stripe_customer_id ?? null;
  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        email,
        metadata: {
          supabase_user_id: auth.userId,
        },
      });
      stripeCustomerId = customer.id;
    } catch (err) {
      console.error('[billing/checkout] customer create failed:', err);
      return NextResponse.json(
        { error: 'Stripe Customer の作成に失敗しました' },
        { status: 502 },
      );
    }
  }

  // subscriptions テーブルに upsert（Stripe Customer ID を確保しておく）
  const { error: upsertErr } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: auth.userId,
        stripe_customer_id: stripeCustomerId,
        // status は既存維持。Webhook で trialing に更新される
        status: existingSub?.status ?? 'incomplete',
      },
      { onConflict: 'user_id' },
    );
  if (upsertErr) {
    console.error('[billing/checkout] subscriptions upsert failed:', upsertErr);
    return NextResponse.json(
      { error: 'サブスク情報の保存に失敗しました' },
      { status: 500 },
    );
  }

  // Checkout Session 作成
  const { successUrl, cancelUrl } = getCheckoutUrls();
  let priceId: string;
  try {
    priceId = getStripePriceId(plan);
  } catch (err) {
    console.error('[billing/checkout] price id resolve failed:', err);
    return NextResponse.json(
      { error: 'プラン設定エラー（環境変数を確認してください）' },
      { status: 500 },
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: {
          supabase_user_id: auth.userId,
          plan,
        },
      },
      // カード登録必須（トライアル中でも payment method を確保）
      payment_method_collection: 'always',
      locale: 'ja',
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Webhook で照合できるよう metadata を付与
      metadata: {
        supabase_user_id: auth.userId,
        plan,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Checkout URL の取得に失敗しました' },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing/checkout] session create failed:', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { error: `Checkout Session の作成に失敗しました: ${message}` },
      { status: 502 },
    );
  }
}
