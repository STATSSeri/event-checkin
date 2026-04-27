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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1
          className="text-3xl text-center mb-2 text-forest italic"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          S/PASS
        </h1>
        <p
          className="text-center text-forest-60 text-xs mb-10 tracking-[0.22em] uppercase"
          style={{ fontFamily: 'var(--font-mark)' }}
        >
          Host Sign In
        </p>

        <form
          onSubmit={handleLogin}
          className="bg-cream border-[0.5px] border-forest-30 p-6 space-y-5"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-[10px] uppercase tracking-[0.22em] text-forest-60 mb-1"
              style={{ fontFamily: 'var(--font-mark)' }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-transparent border-b-[0.5px] border-forest-30 focus:border-forest outline-none py-2 text-sm text-forest placeholder:text-forest-30 transition-colors font-jp"
              style={{ fontFamily: 'var(--font-jp)' }}
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-[10px] uppercase tracking-[0.22em] text-forest-60 mb-1"
              style={{ fontFamily: 'var(--font-mark)' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-transparent border-b-[0.5px] border-forest-30 focus:border-forest outline-none py-2 text-sm text-forest placeholder:text-forest-30 transition-colors font-jp"
              style={{ fontFamily: 'var(--font-jp)' }}
            />
          </div>
          {error && (
            <p
              className="text-red-700 text-sm font-jp"
              style={{ fontFamily: 'var(--font-jp)' }}
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-forest text-cream text-[11px] uppercase tracking-[0.22em] hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
