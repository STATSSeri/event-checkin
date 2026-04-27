'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('メールアドレスまたはパスワードが正しくありません');
      setLoading(false);
      return;
    }
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* S/PASS ワードマーク（LPと同じFuturaスタイル） */}
        <div className="text-center mb-10">
          <h1
            className="text-5xl text-forest tracking-[0.32em] mb-4"
            style={{
              fontFamily: 'var(--font-mark)',
              fontWeight: 700,
              paddingLeft: '0.32em', // tracking分の右ズレ補正
            }}
          >
            S/PASS
          </h1>
          <p
            className="text-[10px] uppercase tracking-[0.28em] text-forest-60"
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            Event Reception System
          </p>
          <div className="mx-auto mt-6 mb-5 w-8 h-px bg-forest-30" />
          <p className="text-xs text-forest-60 tracking-[0.06em]">
            ブランドのための、招待と受付。
          </p>
        </div>

        {/* フォーム（読みやすさ重視で枠付き） */}
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-lg shadow-md p-6 space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
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
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-50 font-medium text-sm tracking-[0.08em] transition-opacity"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        {/* サポート文言 */}
        <p className="text-center text-xs text-forest-60 mt-6 leading-relaxed">
          ログインできない場合は
          <br />
          運営までお問い合わせください
        </p>
      </div>

      {/* 小フッター */}
      <p
        className="text-xs text-forest-60 mt-12 tracking-[0.08em]"
        style={{ fontFamily: 'var(--font-jp)', fontWeight: 700 }}
      >
        運営：スタッツ株式会社
      </p>
    </div>
  );
}
