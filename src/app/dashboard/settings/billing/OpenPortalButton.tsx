'use client';

/**
 * Stripe Customer Portal を開くボタン。
 * クリック → /api/billing/portal で Portal Session を生成 → リダイレクト。
 */

import { useState } from 'react';

export function OpenPortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? 'Portal を開けませんでした');
      }
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2.5 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-50 font-medium text-sm tracking-[0.08em] transition-opacity"
      >
        {loading ? '読み込み中...' : '請求情報を管理する'}
      </button>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </>
  );
}
