'use client';

/**
 * /mfa-challenge
 *
 * MFA を有効化済みのユーザーが、パスワードログイン直後に TOTP コードを
 * 入力して AAL2 まで昇格させるためのページ。
 *
 * 入場フロー:
 *   1. / (ログイン) で signInWithPassword 成功 → セッションは AAL1
 *   2. middleware.ts が /dashboard アクセス時に AAL レベルを判定し、
 *      MFA 必須なら /mfa-challenge へリダイレクト
 *   3. ここで verify 成功 → /dashboard へ遷移
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function ChallengeForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/dashboard';

  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const init = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setError(error.message);
      setInitializing(false);
      return;
    }
    const totp = (data.totp ?? []).find((f) => f.status === 'verified');
    if (!totp) {
      // MFA未登録ならそのまま遷移
      router.replace(nextPath);
      return;
    }
    setFactorId(totp.id);
    setInitializing(false);
  }, [supabase, router, nextPath]);

  useEffect(() => {
    init();
  }, [init]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setError('');
    setLoading(true);
    const { data: challenge, error: challengeErr } =
      await supabase.auth.mfa.challenge({ factorId });
    if (challengeErr || !challenge) {
      setError(`チャレンジの生成に失敗しました: ${challengeErr?.message ?? ''}`);
      setLoading(false);
      return;
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setLoading(false);
    if (verifyErr) {
      setError('認証コードが正しくありません');
      return;
    }
    router.replace(nextPath);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (initializing) {
    return (
      <p className="text-sm text-forest-60 text-center">読み込み中...</p>
    );
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      <p className="text-sm text-forest-60 leading-relaxed">
        認証アプリに表示されている6桁の認証コードを入力してください。
      </p>
      <div>
        <label
          htmlFor="totp-code"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          認証コード
        </label>
        <input
          id="totp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))
          }
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900 tracking-widest text-center text-lg"
          placeholder="123456"
        />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="w-full py-2.5 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-40 font-medium text-sm tracking-[0.08em]"
      >
        {loading ? '確認中...' : '確認'}
      </button>
      <button
        type="button"
        onClick={handleSignOut}
        className="w-full text-xs text-forest-60 hover:text-forest underline"
      >
        別のアカウントでログイン
      </button>
    </form>
  );
}

export default function MfaChallengePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
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
            Two-Factor Authentication
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <Suspense
            fallback={
              <p className="text-sm text-forest-60 text-center">
                読み込み中...
              </p>
            }
          >
            <ChallengeForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
