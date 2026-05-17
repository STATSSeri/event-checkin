/**
 * POST /api/webhooks/stripe
 *
 * Stripe Webhook 受信エンドポイント。
 *
 * 受信イベント:
 *   - customer.subscription.created / updated / deleted → subscriptions テーブル同期
 *   - customer.subscription.trial_will_end → トライアル終了3日前リマインドメール
 *   - invoice.payment_succeeded → status を active に確定
 *   - invoice.payment_failed → status を past_due に + 通知メール
 *   - checkout.session.completed → 任意ログ（実状態は subscription.created で同期）
 *
 * 設計方針:
 *   - 署名検証は必須（環境変数 STRIPE_WEBHOOK_SECRET）
 *   - Raw body が必要なので request.text() を使用、JSON.parse は SDK に任せる
 *   - Node.js runtime（crypto 使用のため Edge 不可）
 *   - 失敗時も 200 を返すケース: 業務エラー（DBは落ちてないがアプリ的に処理不能）
 *     → Stripe にリトライさせる必要がない時のみ。基本は 5xx を返してリトライさせる
 *   - 認識しないイベントは 200 で受け流す（Stripe 側で再送ループにならない）
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe, resolvePlanFromPriceId } from '@/lib/stripe';
import { createServiceClient } from '@/lib/supabase/server';
import type { SubscriptionStatus } from '@/types';
import {
  sendTrialWillEndEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
} from '@/lib/billing-emails';

// Edge では crypto.subtle ベースの SDK 検証が必要だが、現状は Node runtime で十分
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Stripe の unix timestamp(秒) を ISO 文字列に変換 */
function unixToIso(unix: number | null | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

/** Stripe Subscription → DB 更新ペイロードに変換 */
function buildSubscriptionUpdate(sub: Stripe.Subscription): {
  status: SubscriptionStatus;
  plan: 'starter' | 'pro' | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string;
} {
  // Stripe status から内部 status へのマッピング
  // 'incomplete_expired' は内部では canceled 扱い
  const mapStatus = (s: Stripe.Subscription.Status): SubscriptionStatus => {
    switch (s) {
      case 'trialing':
        return 'trialing';
      case 'active':
        return 'active';
      case 'past_due':
        return 'past_due';
      case 'canceled':
      case 'incomplete_expired':
        return 'canceled';
      case 'unpaid':
        return 'unpaid';
      case 'incomplete':
        return 'incomplete';
      case 'paused':
        // 想定外。canceled 扱いで安全側に倒す
        return 'canceled';
      default:
        return 'incomplete';
    }
  };

  const priceId = sub.items.data[0]?.price?.id ?? '';
  const plan = priceId ? resolvePlanFromPriceId(priceId) : null;

  // current_period_end は items の period_end を使うか、SDK バージョンによっては
  // sub.current_period_end が無い場合があるため両対応する
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subAny = sub as any;
  const periodEndUnix: number | null =
    sub.items.data[0]?.current_period_end ??
    subAny.current_period_end ??
    null;

  return {
    status: mapStatus(sub.status),
    plan,
    trial_end: unixToIso(sub.trial_end),
    current_period_end: unixToIso(periodEndUnix),
    cancel_at_period_end: sub.cancel_at_period_end,
    stripe_subscription_id: sub.id,
  };
}

/** stripe_customer_id から Supabase ユーザーIDを引く */
async function findUserIdByCustomer(
  stripeCustomerId: string,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  if (error) {
    console.error('[webhook/stripe] findUserIdByCustomer error:', error);
    return null;
  }
  return data?.user_id ?? null;
}

/** ユーザーIDからメールアドレスを引く（通知メール送信用） */
async function getUserEmail(userId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) {
    console.error('[webhook/stripe] getUserEmail error:', error);
    return null;
  }
  return data.user.email ?? null;
}

/** subscription.created / updated を処理 */
async function handleSubscriptionUpsert(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const userId = await findUserIdByCustomer(customerId);
  if (!userId) {
    // metadata に supabase_user_id があれば fallback
    const fallback = sub.metadata?.supabase_user_id;
    if (!fallback) {
      console.warn('[webhook/stripe] no user for customer:', customerId);
      return;
    }
    console.warn(
      '[webhook/stripe] customer not in DB, using metadata user:',
      fallback,
    );
    const supabase = createServiceClient();
    const update = buildSubscriptionUpdate(sub);
    await supabase.from('subscriptions').upsert(
      {
        user_id: fallback,
        stripe_customer_id: customerId,
        ...update,
      },
      { onConflict: 'user_id' },
    );
    return;
  }

  const supabase = createServiceClient();
  const update = buildSubscriptionUpdate(sub);
  const { error } = await supabase
    .from('subscriptions')
    .update(update)
    .eq('user_id', userId);
  if (error) {
    console.error('[webhook/stripe] subscription update error:', error);
    throw error;
  }
}

/** subscription.deleted を処理 */
async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const userId = await findUserIdByCustomer(customerId);
  if (!userId) return;

  const supabase = createServiceClient();
  await supabase
    .from('subscriptions')
    .update({
      status: 'canceled' as SubscriptionStatus,
      cancel_at_period_end: false,
    })
    .eq('user_id', userId);

  const email = await getUserEmail(userId);
  if (email) await sendSubscriptionCanceledEmail({ to: email });
}

/** subscription.trial_will_end を処理（3日前リマインド） */
async function handleTrialWillEnd(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const userId = await findUserIdByCustomer(customerId);
  if (!userId) return;

  const email = await getUserEmail(userId);
  if (!email) return;

  if (!sub.trial_end) return;
  await sendTrialWillEndEmail({
    to: email,
    trialEndDate: new Date(sub.trial_end * 1000),
  });
}

/** invoice.payment_failed を処理 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) return;

  const userId = await findUserIdByCustomer(customerId);
  if (!userId) return;

  // status を past_due に更新（Subscription Webhook が来ない場合の保険）
  const supabase = createServiceClient();
  await supabase
    .from('subscriptions')
    .update({ status: 'past_due' as SubscriptionStatus })
    .eq('user_id', userId);

  const email = await getUserEmail(userId);
  if (email) await sendPaymentFailedEmail({ to: email });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook/stripe] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'webhook secret not configured' },
      { status: 500 },
    );
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  // 署名検証には raw body が必要
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[webhook/stripe] signature verification failed:', message);
    return NextResponse.json({ error: 'signature mismatch' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // 実状態は subscription.created で同期する。ここは log のみ。
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(
          '[webhook/stripe] checkout.session.completed',
          session.id,
          'mode=',
          session.mode,
        );
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded': {
        // subscription Webhook が active 確定するので、ここでは特に処理しない
        const inv = event.data.object as Stripe.Invoice;
        console.log('[webhook/stripe] invoice.payment_succeeded', inv.id);
        break;
      }

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // 想定外イベントは 200 で受け流す（Stripeの再送ループ回避）
        console.log('[webhook/stripe] unhandled event:', event.type);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // ハンドラ内エラーは 5xx で返して Stripe にリトライさせる
    console.error('[webhook/stripe] handler error for', event.type, err);
    return NextResponse.json(
      { error: 'handler failed', type: event.type },
      { status: 500 },
    );
  }
}
