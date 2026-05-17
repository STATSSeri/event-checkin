/**
 * /billing/cancel
 *
 * Stripe Checkout をユーザーがキャンセル（戻る）した際の戻り先。
 * プラン選択画面に戻れる導線を提供する。
 */

'use client';

import { useRouter } from 'next/navigation';

export default function BillingCancelPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-cream">
      <div className="max-w-md w-full text-center">
        <h1
          className="text-5xl text-forest tracking-[0.32em] mb-6"
          style={{ fontFamily: 'var(--font-mark)', fontWeight: 700, paddingLeft: '0.32em' }}
        >
          S/PASS
        </h1>
        <p className="text-forest font-medium mb-2">決済が完了しませんでした</p>
        <p className="text-sm text-forest-60 mb-6 leading-relaxed">
          プラン登録は完了していません。<br />
          14日間の無料トライアルは、カード登録後すぐに開始されます。<br />
          途中で解約しても料金は発生しません。
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => router.push('/billing/select-plan')}
            className="px-4 py-2 bg-forest text-cream rounded-md text-sm hover:opacity-90"
          >
            プラン選択に戻る
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-forest-60 text-sm underline"
          >
            ログイン画面に戻る
          </button>
        </div>
      </div>
    </div>
  );
}
