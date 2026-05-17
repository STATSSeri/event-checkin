/**
 * サブスクリプション状態のヘルパー。
 *
 * 設計方針:
 *   - サブスク状態の判定ロジックを本ファイルに集約する。
 *   - DB レコードを Single Source of Truth として扱い、Stripe API は Webhook 経由でのみ書き込む。
 *   - ダッシュボード入口ガードや UI バッジから共通で呼ぶ。
 */

import { createServiceClient } from '@/lib/supabase/server';
import type { Subscription } from '@/types';
import { PLANS } from '@/lib/stripe';

/**
 * 指定ユーザーのサブスクリプションレコードを取得。
 * 存在しなければ null。
 */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[billing] getSubscription error:', error);
    return null;
  }
  return (data as Subscription) ?? null;
}

/**
 * サブスクの「現在ダッシュボード利用可能か」を判定。
 *
 * 利用可能:
 *   - status='trialing'（Stripeトライアル中、カード登録済み）
 *   - status='active'（正常課金中）
 *   - status='past_due'（リトライ中だが一時的に許可。UIで警告表示）
 *   - status='trialing_no_card' かつ trial_end が未到来（既存ユーザー猶予中）
 *
 * 利用不可:
 *   - サブスクレコードなし
 *   - status='trialing_no_card' で trial_end 経過
 *   - status='canceled' / 'unpaid' / 'incomplete'
 */
export type DashboardAccess =
  | { allowed: true; reason: 'trialing' | 'active' | 'past_due' | 'trial_no_card' }
  | { allowed: false; reason: 'no_subscription' | 'trial_expired' | 'canceled' | 'unpaid' | 'incomplete' };

export function evaluateDashboardAccess(sub: Subscription | null): DashboardAccess {
  if (!sub) return { allowed: false, reason: 'no_subscription' };

  const now = Date.now();

  switch (sub.status) {
    case 'trialing':
      return { allowed: true, reason: 'trialing' };
    case 'active':
      return { allowed: true, reason: 'active' };
    case 'past_due':
      return { allowed: true, reason: 'past_due' };
    case 'trialing_no_card': {
      const trialEnd = sub.trial_end ? new Date(sub.trial_end).getTime() : 0;
      if (trialEnd > now) return { allowed: true, reason: 'trial_no_card' };
      return { allowed: false, reason: 'trial_expired' };
    }
    case 'canceled':
      return { allowed: false, reason: 'canceled' };
    case 'unpaid':
      return { allowed: false, reason: 'unpaid' };
    case 'incomplete':
      return { allowed: false, reason: 'incomplete' };
    default:
      return { allowed: false, reason: 'no_subscription' };
  }
}

/**
 * 指定ユーザーが今月（暦月ベース、Asia/Tokyo）に作成済みのイベント数を取得。
 * 上限チェックに使用。
 */
export async function getMonthlyEventCount(userId: string): Promise<number> {
  const supabase = createServiceClient();

  // 今月の開始（Asia/Tokyo の月初 00:00 を UTC で算出）
  const now = new Date();
  // JST = UTC+9。簡易的に UTC で月初を取ってから -9h する
  const utcMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const jstMonthStart = new Date(utcMonthStart.getTime() - 9 * 60 * 60 * 1000);

  const { count, error } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('organizer_id', userId)
    .gte('created_at', jstMonthStart.toISOString());

  if (error) {
    console.error('[billing] getMonthlyEventCount error:', error);
    return 0;
  }
  return count ?? 0;
}

/**
 * 新規イベント作成の可否を判定。
 * - サブスクが利用不可状態なら拒否
 * - プラン未設定（trialing_no_card など）は「上限なし」で許可（トライアル特典）
 *   → ただしダッシュボードガード側で先にブロックされている前提
 * - プラン設定済みなら月間上限を確認
 */
export async function canCreateEvent(userId: string): Promise<{
  allowed: boolean;
  reason?: 'no_subscription' | 'subscription_inactive' | 'monthly_limit_reached';
  monthlyCount: number;
  monthlyLimit: number | null;
  plan: 'starter' | 'pro' | null;
}> {
  const sub = await getSubscription(userId);
  const access = evaluateDashboardAccess(sub);

  if (!access.allowed) {
    return {
      allowed: false,
      reason: sub ? 'subscription_inactive' : 'no_subscription',
      monthlyCount: 0,
      monthlyLimit: null,
      plan: null,
    };
  }

  // プラン未確定（trial_no_card）→ 制限なし（猶予期間）
  if (!sub!.plan) {
    return {
      allowed: true,
      monthlyCount: 0,
      monthlyLimit: null,
      plan: null,
    };
  }

  const planDef = PLANS[sub!.plan];
  const count = await getMonthlyEventCount(userId);
  if (count >= planDef.monthlyEventLimit) {
    return {
      allowed: false,
      reason: 'monthly_limit_reached',
      monthlyCount: count,
      monthlyLimit: planDef.monthlyEventLimit,
      plan: sub!.plan,
    };
  }
  return {
    allowed: true,
    monthlyCount: count,
    monthlyLimit: planDef.monthlyEventLimit,
    plan: sub!.plan,
  };
}
