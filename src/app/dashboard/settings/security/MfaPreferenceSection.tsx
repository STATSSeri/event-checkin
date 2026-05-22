'use client';

/**
 * 「二段階認証で使う方式」のラジオセレクタ。
 *
 *  - メールOTP : 登録メールアドレスに 6 桁コードを送る方式
 *  - TOTP      : 認証アプリの 6 桁コード（要 MfaSection での事前登録）
 *  - 無効      : MFA を要求しない（preferred_mfa_method = NULL）
 *                ただし TOTP factor が verified のまま残っている場合は
 *                Supabase 側で AAL2 が要求されるため、MfaSection で
 *                ファクター無効化が別途必要。本セレクタは案内文で誘導する
 *
 * 保存後はサーバ側の middleware が次回アクセスから新方式で判定する。
 */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Method = 'email' | 'totp' | 'none';

const OPTIONS: ReadonlyArray<{
  value: Method;
  label: string;
  description: string;
}> = [
  {
    value: 'email',
    label: 'メール（推奨）',
    description:
      'ログイン時にご登録メールアドレスへ 6 桁のコードを送信します。スマートフォンアプリは不要です。',
  },
  {
    value: 'totp',
    label: '認証アプリ（TOTP）',
    description:
      'Google Authenticator / 1Password / Authy 等で 30 秒ごとに更新される 6 桁コードを使用します。事前に下のセクションで「認証アプリを有効化」してください。',
  },
  {
    value: 'none',
    label: '無効化（非推奨）',
    description:
      'MFA を要求しません。セキュリティ上の理由でおすすめしません。',
  },
];

export function MfaPreferenceSection() {
  const supabase = createClient();
  const [current, setCurrent] = useState<Method | null>(null);
  const [selected, setSelected] = useState<Method>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [initializing, setInitializing] = useState(true);

  const load = useCallback(async () => {
    const { data, error: selErr } = await supabase
      .from('user_security_meta')
      .select('preferred_mfa_method')
      .maybeSingle();
    if (selErr) {
      setError(`現在の設定を取得できませんでした: ${selErr.message}`);
      setInitializing(false);
      return;
    }
    const value = (data?.preferred_mfa_method ?? null) as Exclude<Method, 'none'> | null;
    const initial: Method = value ?? 'none';
    setCurrent(initial);
    setSelected(initial);
    setInitializing(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: selected }),
      });
      const data: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? '設定の保存に失敗しました');
      }
      setCurrent(selected);
      setMessage('設定を保存しました。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '設定の保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return <p className="text-sm text-forest-60">読み込み中...</p>;
  }

  const dirty = current !== selected;

  return (
    <div className="space-y-3">
      {OPTIONS.map((opt) => {
        const id = `mfa-method-${opt.value}`;
        return (
          <label
            key={opt.value}
            htmlFor={id}
            className={`flex gap-3 p-3 border rounded-md cursor-pointer transition ${
              selected === opt.value
                ? 'border-forest bg-forest/5'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input
              id={id}
              type="radio"
              name="mfa-method"
              value={opt.value}
              checked={selected === opt.value}
              onChange={() => setSelected(opt.value)}
              className="mt-1 accent-forest"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-800">{opt.label}</div>
              <p className="text-xs text-forest-60 leading-relaxed mt-1">
                {opt.description}
              </p>
            </div>
          </label>
        );
      })}

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {message && !error && <p className="text-forest text-sm">{message}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={loading || !dirty}
        className="py-2 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-40 font-medium text-sm tracking-[0.08em]"
      >
        {loading ? '保存中...' : '設定を保存'}
      </button>
    </div>
  );
}
