'use client';

/**
 * パスワード変更フォーム（client component）。
 * /api/auth/change-password に POST し、ポリシー検証はサーバ側に任せる。
 * 入力中のリアルタイム強度表示のため checkPassword を併用する。
 */

import { useState } from 'react';
import { PasswordStrengthHint } from '@/components/PasswordStrengthHint';
import { PASSWORD_MIN_LENGTH, checkPassword } from '@/lib/password-policy';

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const strengthOk = checkPassword(newPassword).ok;
  const matches = newPassword.length > 0 && newPassword === confirm;
  const submittable =
    currentPassword.length > 0 && strengthOk && matches && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'パスワードの変更に失敗しました');
        return;
      }
      setMessage('パスワードを変更しました。');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch {
      setError('通信エラーが発生しました。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="cur-pw"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          現在のパスワード
        </label>
        <input
          id="cur-pw"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900"
        />
      </div>

      <div>
        <label
          htmlFor="new-pw"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          新しいパスワード
        </label>
        <input
          id="new-pw"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900"
        />
        <PasswordStrengthHint password={newPassword} />
      </div>

      <div>
        <label
          htmlFor="confirm-pw"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          新しいパスワード（確認）
        </label>
        <input
          id="confirm-pw"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900"
        />
        {confirm.length > 0 && !matches && (
          <p className="text-[11px] text-red-600 mt-1">
            確認用パスワードが一致しません
          </p>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {message && (
        <p className="text-emerald-700 text-sm leading-relaxed">{message}</p>
      )}

      <button
        type="submit"
        disabled={!submittable}
        className="w-full py-2.5 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm tracking-[0.08em] transition-opacity"
      >
        {loading ? '変更中...' : 'パスワードを変更'}
      </button>

      <p className="text-[11px] text-forest-60 leading-relaxed">
        ※ 直近10回分のパスワードと同じものは設定できません。
        <br />
        ※ 一度変更すると、次の変更まで24時間お待ちいただきます。
      </p>
    </form>
  );
}
