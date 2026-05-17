/**
 * /dashboard 配下の共通レイアウト。
 *
 * 役割: サブスクリプション状態のサーバーサイドガード。
 *   - 認証されていなければ / へリダイレクト
 *   - サブスクが利用不可状態（no_subscription / trial_expired / canceled / unpaid 等）
 *     なら /billing/select-plan へリダイレクト
 *   - past_due の場合は警告バナーを表示
 *
 * 注: クライアントコンポーネントの page.tsx を server component で包むパターン。
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSubscription, evaluateDashboardAccess } from '@/lib/billing';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 認証チェック
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/');
  }

  // サブスク状態チェック
  const sub = await getSubscription(user.id);
  const access = evaluateDashboardAccess(sub);

  // ============================================================
  // 暫定処理（Sprint F-1 完了後に削除すること）
  //
  // 既存ユーザーは subscriptions テーブルにまだレコードが無いため、
  // 「no_subscription」だけは素通りさせて従来通りダッシュボードを使えるようにする。
  // Sprint F-1 の SQL（既存ユーザーへ trialing_no_card レコード一括付与）実行後は、
  // この if ブロックを削除して本来のガードを有効化する。
  // ============================================================
  const isLegacyUserWithoutSubscription =
    !access.allowed && access.reason === 'no_subscription';

  if (!access.allowed && !isLegacyUserWithoutSubscription) {
    // 利用不可 → プラン選択へ
    redirect('/billing/select-plan');
  }

  // past_due は警告バナー表示してダッシュボードへ進める
  const showPastDueBanner = access.allowed && access.reason === 'past_due';

  return (
    <>
      {showPastDueBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <p className="text-xs text-amber-900 text-center">
            ⚠️ お支払いに問題があります。カード情報をご確認ください。
            <a href="/dashboard/settings/billing" className="underline ml-2">
              請求情報を確認
            </a>
          </p>
        </div>
      )}
      {children}
    </>
  );
}
