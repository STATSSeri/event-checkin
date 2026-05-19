'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PLANS } from '@/lib/stripe';
import type { PlanId } from '@/types';
import {
  PASSWORD_MIN_LENGTH,
  validatePasswordOrError,
} from '@/lib/password-policy';
import { PasswordStrengthHint } from '@/components/PasswordStrengthHint';

/** 価格表示用フォーマッタ（円・カンマ区切り） */
function formatPrice(value: number): string {
  return `月額 ${value.toLocaleString('ja-JP')}円`;
}

function SignupForm() {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  /**
   * URLパラメータ `?plan=pro` でプロプランを選択。
   * 後方互換: 旧パラメータ `?plan=expert` も `pro` として扱う。
   * デフォルトは starter。
   */
  const selectedPlan = useMemo<PlanId>(() => {
    const raw = searchParams.get('plan');
    if (raw === 'pro' || raw === 'expert') return 'pro';
    return 'starter';
  }, [searchParams]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const pwError = validatePasswordOrError(password);
    if (pwError) {
      setError(pwError);
      return;
    }

    setLoading(true);
    // メール認証完了後はプラン選択画面へ誘導（Stripe Checkout の起点）
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=/billing/select-plan`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          company_name: companyName.trim(),
          contact_name: contactName.trim(),
          requested_plan: selectedPlan,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // signUp 直後に session が返るケース（メール認証無効環境）→ プラン選択へ
    if (data.session) {
      router.push('/billing/select-plan');
      return;
    }

    setMessage('確認メールを送信しました。メール内のリンクから登録を完了してください。');
    setLoading(false);
  };

  const plan = PLANS[selectedPlan];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1
            className="text-3xl text-forest tracking-[0.32em] mb-2"
            style={{
              fontFamily: 'var(--font-mark)',
              fontWeight: 700,
              paddingLeft: '0.32em',
            }}
          >
            S/PASS
          </h1>
          <p
            className="text-[10px] uppercase tracking-[0.28em] text-forest-60"
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            Create Account
          </p>
        </div>

        {/* 選択中のプラン + トライアル訴求 */}
        <div className="bg-white rounded-lg shadow-lg p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-forest-60">選択中のプラン</p>
            <span className="text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-forest text-cream">
              14日間 無料
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-forest">{plan.name}</h2>
              <p className="text-xs text-forest-60 mt-1 leading-relaxed">
                {plan.description}
              </p>
            </div>
            <p className="text-sm font-bold text-forest whitespace-nowrap">
              {formatPrice(plan.priceMonthly)}
            </p>
          </div>
          <p className="text-[11px] text-forest-60 mt-3 leading-relaxed">
            登録後にプラン選択 → 決済情報の入力へ進みます。
            <br />
            14日間は課金されません。期間中はいつでも解約できます。
          </p>
        </div>

        <form onSubmit={handleSignup} className="bg-white rounded-lg shadow-lg p-6 space-y-4">
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
              会社名
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900"
            />
          </div>
          <div>
            <label htmlFor="contactName" className="block text-sm font-medium text-gray-700 mb-1">
              ご担当者名
            </label>
            <input
              id="contactName"
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900"
              autoComplete="new-password"
            />
            <PasswordStrengthHint password={password} />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {message && <p className="text-emerald-700 text-sm leading-relaxed">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-50 font-medium text-sm tracking-[0.08em] transition-opacity"
          >
            {loading ? '登録中...' : '無料で始める'}
          </button>
        </form>

        <p className="text-center text-xs text-forest-60 mt-5">
          登録済みの方は <a className="underline" href="/">ログイン</a>
        </p>

        <p className="text-center text-[11px] text-forest-60 mt-5 leading-relaxed">
          「無料で始める」を押すと、
          <a href="/legal/terms-of-service" className="underline">利用規約</a>
          および
          <a href="/legal/privacy-policy" className="underline">プライバシーポリシー</a>
          に同意したものとみなします。
        </p>

        <nav className="mt-3 text-[11px] text-forest-60 flex flex-wrap justify-center gap-x-3 gap-y-1">
          <a href="/legal/specified-commercial-transaction" className="hover:text-forest underline">特定商取引法に基づく表記</a>
          <a href="/legal" className="hover:text-forest underline">その他の規程</a>
        </nav>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-forest-60">読み込み中...</p>
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
