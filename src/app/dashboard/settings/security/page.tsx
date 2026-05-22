/**
 * /dashboard/settings/security
 *
 * セキュリティ設定（パスワード変更 + 多要素認証）。
 * 認証チェックは layout で行われているため、ここでは UI のみ。
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PasswordChangeForm } from './PasswordChangeForm';
import { MfaPreferenceSection } from './MfaPreferenceSection';
import { MfaSection } from './MfaSection';
import { ActivitySection } from './ActivitySection';

export const dynamic = 'force-dynamic';

export default async function SecuritySettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">
          セキュリティ
        </h1>
        <a
          href="/dashboard/settings"
          className="text-sm text-forest-60 hover:text-forest underline"
        >
          ← 設定に戻る
        </a>
      </div>

      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-base font-bold text-forest mb-4">
          パスワードの変更
        </h2>
        <PasswordChangeForm />
      </section>

      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-base font-bold text-forest mb-1">
          二段階認証の方式
        </h2>
        <p className="text-xs text-forest-60 leading-relaxed mb-4">
          ログイン時に求められる第二要素の方式を選択します。
        </p>
        <MfaPreferenceSection />
      </section>

      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-base font-bold text-forest mb-1">
          認証アプリ（TOTP）の有効化／無効化
        </h2>
        <p className="text-xs text-forest-60 leading-relaxed mb-4">
          認証アプリ（Google Authenticator、1Password、Authy 等）の TOTP コードを
          使用する場合は、こちらで有効化してください。
        </p>
        <MfaSection />
      </section>

      <section className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-base font-bold text-forest mb-1">
          アクティビティ履歴
        </h2>
        <p className="text-xs text-forest-60 leading-relaxed mb-4">
          ご自身のアカウントに関する主要な操作の記録です。
        </p>
        <ActivitySection userId={user.id} />
      </section>
    </div>
  );
}
