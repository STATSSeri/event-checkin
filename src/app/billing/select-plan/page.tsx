'use client';

/**
 * /billing/select-plan
 *
 * プラン選択画面。signup 直後、またはダッシュボードガードからの誘導で表示される。
 * 「選ぶ」ボタン → /api/billing/checkout → Stripe Checkout へリダイレクト。
 *
 * 設計方針:
 *   - 「お試し → 本格運用」の自然な流れに見えるよう、フラットな2カード並置（RECOMMENDED 等の押し付けはしない）
 *   - 14日間無料トライアルを最上部に強調表示
 *   - プラン定義のマスタは src/lib/stripe.ts の PLANS を参照
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLANS } from '@/lib/stripe';
import type { PlanId } from '@/types';

/** 価格表示用フォーマッタ（円・カンマ区切り） */
function formatPrice(value: number): string {
  return `${value.toLocaleString('ja-JP')}円`;
}

/** プランごとの特典リスト（マスタとは別に UI 上の訴求用） */
const PLAN_FEATURES: Record<PlanId, string[]> = {
  starter: [
    '月2件までイベント作成',
    'メール招待・QRコード発行',
    '当日受付・チェックイン管理',
  ],
  pro: [
    '月30件までイベント作成',
    'メール招待・QRコード発行',
    '当日受付・チェックイン管理',
    '自社ドメインからメール送信',
  ],
};

export default function SelectPlanPage() {
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSelect = async (plan: PlanId) => {
    setError('');
    setLoading(plan);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? 'Checkout 生成に失敗しました');
      }
      // Stripe Checkout へリダイレクト
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 bg-cream">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1
            className="text-3xl text-forest tracking-[0.32em] mb-3"
            style={{
              fontFamily: 'var(--font-mark)',
              fontWeight: 700,
              paddingLeft: '0.32em',
            }}
          >
            S/PASS
          </h1>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-forest text-cream text-[11px] tracking-[0.16em] uppercase mb-4">
            14日間 無料トライアル
          </div>
          <p className="text-sm text-forest-60 leading-relaxed">
            まずは14日間、すべての機能を無料でお試しいただけます。
            <br className="md:hidden" />
            期間中の解約・プラン変更はいつでも可能です。
          </p>
        </div>

        {/* プラン2枚 */}
        <div className="grid md:grid-cols-2 gap-5">
          {(Object.keys(PLANS) as PlanId[]).map((id) => {
            const plan = PLANS[id];
            const features = PLAN_FEATURES[id];
            const isLoading = loading === id;
            return (
              <div
                key={id}
                className="flex flex-col bg-white rounded-lg shadow-lg p-6 border border-forest/10"
              >
                <h2 className="text-xl font-bold text-forest mb-1">{plan.name}</h2>
                <p className="text-xs text-forest-60 mb-4 leading-relaxed min-h-[2.5rem]">
                  {plan.description}
                </p>

                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-3xl font-bold text-forest">
                    {formatPrice(plan.priceMonthly)}
                  </span>
                  <span className="text-xs text-forest-60">/ 月</span>
                </div>

                <ul className="text-sm text-forest space-y-2 mb-6 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex gap-2 items-start">
                      <span className="text-forest-60 flex-shrink-0 mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelect(id)}
                  disabled={loading !== null}
                  className="w-full py-3 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-50 font-medium text-sm tracking-[0.08em] transition-opacity"
                >
                  {isLoading ? '読み込み中...' : '14日間 無料で始める'}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="text-center text-red-600 text-sm mt-6">{error}</p>
        )}

        <div className="text-center mt-8 space-y-2">
          <p className="text-xs text-forest-60 leading-relaxed">
            ボタンを押すと Stripe の安全な決済ページに移動します。
            <br />
            14日間は課金されません。期間中の解約も可能です。
          </p>
          <p className="text-xs text-forest-60">
            <button onClick={() => router.push('/')} className="underline">
              ログイン画面に戻る
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
