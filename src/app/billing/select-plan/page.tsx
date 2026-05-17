'use client';

/**
 * /billing/select-plan
 *
 * プラン選択画面。signup 直後、またはダッシュボードガードからの誘導で表示される。
 * 「選ぶ」ボタン → /api/billing/checkout → Stripe Checkout へリダイレクト。
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type PlanCard = {
  id: 'starter' | 'pro';
  name: string;
  price: string;
  caption: string;
  features: string[];
  recommended?: boolean;
};

const PLANS: PlanCard[] = [
  {
    id: 'starter',
    name: 'スタータープラン',
    price: '月額 5,000円',
    caption: '月2件までのイベント運用に。個人主催・小規模向け。',
    features: [
      '月2件までイベント作成',
      'メール招待・QRコード発行',
      '当日受付・チェックイン管理',
      '14日間の無料トライアル',
    ],
  },
  {
    id: 'pro',
    name: 'プロプラン',
    price: '月額 29,800円',
    caption: '月30件までのイベント運用に。中規模主催者向け。',
    features: [
      '月30件までイベント作成',
      'メール招待・QRコード発行',
      '当日受付・チェックイン管理',
      '自社ドメイン送信（要設定）',
      '14日間の無料トライアル',
    ],
    recommended: true,
  },
];

export default function SelectPlanPage() {
  const [loading, setLoading] = useState<'starter' | 'pro' | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSelect = async (plan: 'starter' | 'pro') => {
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
    <div className="min-h-screen px-4 py-12 bg-cream">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1
            className="text-5xl text-forest tracking-[0.32em] mb-3"
            style={{ fontFamily: 'var(--font-mark)', fontWeight: 700, paddingLeft: '0.32em' }}
          >
            S/PASS
          </h1>
          <p className="text-sm text-forest-60">
            14日間の無料トライアルでスタート。<br className="md:hidden" />
            いつでも解約・プラン変更が可能です。
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-lg shadow-md p-6 border-2 ${
                plan.recommended ? 'border-forest' : 'border-transparent'
              }`}
            >
              {plan.recommended && (
                <div className="text-[10px] uppercase tracking-[0.28em] text-forest mb-2">
                  Recommended
                </div>
              )}
              <h2 className="text-xl font-bold text-forest mb-1">{plan.name}</h2>
              <p className="text-2xl font-bold text-forest mb-3">{plan.price}</p>
              <p className="text-sm text-forest-60 mb-4 leading-relaxed">{plan.caption}</p>
              <ul className="text-sm text-forest space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-forest-60">・</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSelect(plan.id)}
                disabled={loading !== null}
                className="w-full py-2.5 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-50 font-medium text-sm tracking-[0.08em] transition-opacity"
              >
                {loading === plan.id ? '読み込み中...' : 'このプランで開始する'}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-center text-red-600 text-sm mt-6">{error}</p>
        )}

        <p className="text-center text-xs text-forest-60 mt-8 leading-relaxed">
          ボタンを押すと Stripe の安全な決済ページに移動します。<br />
          14日間は課金されません。トライアル期間中の解約も可能です。
        </p>

        <p className="text-center text-xs text-forest-60 mt-4">
          <button onClick={() => router.push('/')} className="underline">
            ログイン画面に戻る
          </button>
        </p>
      </div>
    </div>
  );
}
