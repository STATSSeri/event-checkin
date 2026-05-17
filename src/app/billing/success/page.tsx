/**
 * /billing/success
 *
 * Stripe Checkout 完了後の戻り先。
 * Webhook によるサブスク状態反映は数秒〜数十秒のラグがあるため、
 * クライアント側で短いポーリングを行い、状態確定後にダッシュボードへ遷移する。
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function SuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<'waiting' | 'ready' | 'timeout'>('waiting');
  const supabase = createClient();

  useEffect(() => {
    // 最大 20 秒（2秒×10回）ポーリングして Webhook 反映を待つ
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    const INTERVAL_MS = 2000;

    const tick = async () => {
      attempts += 1;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // セッション切れ。ログイン画面へ
        router.replace('/');
        return;
      }
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, plan')
        .eq('user_id', user.id)
        .maybeSingle();

      if (sub && (sub.status === 'trialing' || sub.status === 'active') && sub.plan) {
        setStatus('ready');
        // 1秒見せてからダッシュボードへ
        setTimeout(() => router.replace('/dashboard'), 1000);
        return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        setStatus('timeout');
        return;
      }
      setTimeout(tick, INTERVAL_MS);
    };

    tick();
    // 依存は意図的に空（マウント時のみ起動）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-cream">
      <div className="max-w-md w-full text-center">
        <h1
          className="text-5xl text-forest tracking-[0.32em] mb-6"
          style={{ fontFamily: 'var(--font-mark)', fontWeight: 700, paddingLeft: '0.32em' }}
        >
          S/PASS
        </h1>
        {status === 'waiting' && (
          <>
            <p className="text-forest font-medium mb-2">ご登録ありがとうございます</p>
            <p className="text-sm text-forest-60">
              プランを反映しています...
              <br />
              （数秒かかる場合があります）
            </p>
          </>
        )}
        {status === 'ready' && (
          <>
            <p className="text-forest font-medium mb-2">準備が完了しました</p>
            <p className="text-sm text-forest-60">ダッシュボードへ移動します...</p>
          </>
        )}
        {status === 'timeout' && (
          <>
            <p className="text-forest font-medium mb-2">反映に時間がかかっています</p>
            <p className="text-sm text-forest-60 mb-4">
              通常は数秒で完了します。問題が続く場合はサポートまでご連絡ください。
            </p>
            <button
              onClick={() => router.replace('/dashboard')}
              className="px-4 py-2 bg-forest text-cream rounded-md text-sm hover:opacity-90"
            >
              ダッシュボードへ進む
            </button>
          </>
        )}
        {sessionId && (
          <p className="text-[10px] text-forest-60 mt-8 break-all">session: {sessionId}</p>
        )}
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-forest-60">読み込み中...</p>
      </div>
    }>
      <SuccessInner />
    </Suspense>
  );
}
