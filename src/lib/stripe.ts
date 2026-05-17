/**
 * Stripe SDK 初期化 + プラン定義のマスタ。
 *
 * 設計方針:
 *   - サーバー側専用。クライアントには絶対に import しない（SECRET_KEY 露出防止）。
 *   - プラン定義は本ファイルに集約し、Stripe Price ID は環境変数経由で参照する。
 *   - トライアル期間・月間上限などのビジネスルールも本ファイルで定義する。
 */

import Stripe from 'stripe';
import type { PlanDefinition, PlanId } from '@/types';

// =============================================================================
// Stripe SDK 初期化
// =============================================================================

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  // ビルド時の環境変数未設定でランタイムエラーを早期に出す
  // （本番では Vercel 環境変数で必ず設定すること）
  console.warn('[stripe] STRIPE_SECRET_KEY is not set. Stripe API calls will fail.');
}

// apiVersion は明示せず Stripe SDK のデフォルト（インストール時点の最新固定版）に任せる。
// 互換性のため SDK バージョン更新時は CHANGELOG を確認すること。
export const stripe = new Stripe(secretKey ?? 'sk_test_dummy_for_build', {
  // typescript: true で型補完を強化
  typescript: true,
});

// =============================================================================
// プラン定義（コード側マスタ）
// =============================================================================

/**
 * プラン定義。価格・件数上限の Source of Truth。
 * Stripe Price ID は環境変数から取得（テスト/本番で差し替え可能）。
 */
export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'スタータープラン',
    priceMonthly: 5000,
    monthlyEventLimit: 2,
    description: '月2件までのイベント運用に。個人主催・小規模向け。',
  },
  pro: {
    id: 'pro',
    name: 'プロプラン',
    priceMonthly: 29800,
    monthlyEventLimit: 30,
    description: '月30件までのイベント運用に。中規模主催者向け。',
  },
};

/** プラン → Stripe Price ID マップ（環境変数から解決） */
export function getStripePriceId(plan: PlanId): string {
  const priceId =
    plan === 'starter'
      ? process.env.STRIPE_PRICE_STARTER
      : process.env.STRIPE_PRICE_PRO;
  if (!priceId) {
    throw new Error(`[stripe] STRIPE_PRICE_${plan.toUpperCase()} is not set.`);
  }
  return priceId;
}

/** Stripe Price ID → プラン識別子 への逆引き（Webhook で利用） */
export function resolvePlanFromPriceId(priceId: string): PlanId | null {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  return null;
}

// =============================================================================
// ビジネスルール定数
// =============================================================================

/** トライアル期間（日数） */
export const TRIAL_PERIOD_DAYS = 14;

/** Stripe Checkout の戻り URL（環境変数 NEXT_PUBLIC_SITE_URL を起点） */
export function getCheckoutUrls(): { successUrl: string; cancelUrl: string } {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    successUrl: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/billing/cancel`,
  };
}
