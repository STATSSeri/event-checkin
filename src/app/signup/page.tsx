'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type SignupPlan = 'starter' | 'expert';

const plans: Record<SignupPlan, {
  name: string;
  price: string;
  caption: string;
}> = {
  starter: {
    name: 'スタータープラン',
    price: '月額 5,000円',
    caption: 'イベント数は月9件まで。まずはこちらで開始できます。',
  },
  expert: {
    name: 'エキスパートプラン',
    price: '個別お見積り',
    caption: '月10件以上のイベント運用に対応します。',
  },
};

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

  const selectedPlan = useMemo<SignupPlan>(() => {
    return searchParams.get('plan') === 'expert' ? 'expert' : 'starter';
  }, [searchParams]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }

    setLoading(true);
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
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

    if (data.session) {
      router.push('/dashboard');
      return;
    }

    setMessage('確認メールを送信しました。メール内のリンクから登録を完了してください。');
    setLoading(false);
  };

  const plan = plans[selectedPlan];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1
            className="text-5xl text-forest tracking-[0.32em] mb-4"
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

        <div className="bg-white rounded-lg shadow-md p-6 mb-4">
          <p className="text-xs text-forest-60 mb-1">選択中のプラン</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-forest">{plan.name}</h2>
              <p className="text-xs text-forest-60 mt-1 leading-relaxed">{plan.caption}</p>
            </div>
            <p className="text-sm font-bold text-forest whitespace-nowrap">{plan.price}</p>
          </div>
          {selectedPlan === 'starter' && (
            <p className="text-[11px] text-forest-60 mt-3">
              Stripe決済導入後は、この登録後に決済画面へ接続します。
            </p>
          )}
        </div>

        <form onSubmit={handleSignup} className="bg-white rounded-lg shadow-md p-6 space-y-4">
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
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {message && <p className="text-emerald-700 text-sm leading-relaxed">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-50 font-medium text-sm tracking-[0.08em] transition-opacity"
          >
            {loading ? '登録中...' : '新規登録する'}
          </button>
        </form>

        <p className="text-center text-xs text-forest-60 mt-6">
          登録済みの方は <a className="underline" href="/">ログイン</a>
        </p>
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
