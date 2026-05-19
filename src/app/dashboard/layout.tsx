/**
 * /dashboard 配下の共通レイアウト。
 *
 * 役割:
 *   - 認証チェック（未認証なら / へリダイレクト）
 *   - サブスクリプション状態ガード（利用不可状態なら /billing/select-plan へ）
 *   - サブスク状態バナー表示（トライアル残日数、解約予約、課金失敗 等）
 *
 * 注: クライアントコンポーネントの page.tsx を server component で包むパターン。
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getSubscription, evaluateDashboardAccess } from '@/lib/billing';
import { PLANS } from '@/lib/stripe';
import { recordLoginIfStale } from '@/lib/audit-log';
import type { Subscription } from '@/types';

export const dynamic = 'force-dynamic';

/** ISO 文字列を「M月D日」形式（Asia/Tokyo）で表示 */
function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  });
}

/** 残日数（整数） */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * 表示するサブスク状態バナーの種類と文言を決定する。
 * - 「無視可能」な状態（active で解約予約なし、画面に毎回出す必要なし）は null。
 * - past_due は強い警告色、解約予約・トライアル中は中庸、active+解約予約はカウントダウン。
 */
type BannerKind = 'info' | 'warning' | 'success' | 'neutral';
type BannerInfo = {
  kind: BannerKind;
  message: React.ReactNode;
};

function resolveBanner(sub: Subscription | null): BannerInfo | null {
  if (!sub) return null;

  // past_due は専用の強警告バナー（既存ロジック）
  if (sub.status === 'past_due') {
    return {
      kind: 'warning',
      message: (
        <>
          ⚠️ お支払いに問題があります。カード情報をご確認ください。
          <a href="/dashboard/settings/billing" className="underline ml-2">
            請求情報を確認
          </a>
        </>
      ),
    };
  }

  if (sub.status === 'trialing_no_card') {
    const days = daysUntil(sub.trial_end);
    return {
      kind: 'info',
      message: (
        <>
          14日間無料トライアル中（残り {days ?? '—'}日）。継続利用には決済情報の登録が必要です。
          <a href="/billing/select-plan" className="underline ml-2">
            プランを選んで継続する
          </a>
        </>
      ),
    };
  }

  if (sub.status === 'trialing') {
    const days = daysUntil(sub.trial_end);
    const planName = sub.plan ? PLANS[sub.plan].name : 'トライアル';
    return {
      kind: 'success',
      message: (
        <>
          {planName} の無料トライアル中（残り {days ?? '—'}日）。
          {formatShortDate(sub.trial_end)} に自動課金が開始されます。
          <a href="/dashboard/settings/billing" className="underline ml-2">
            管理する
          </a>
        </>
      ),
    };
  }

  if (sub.status === 'active' && sub.cancel_at_period_end) {
    return {
      kind: 'warning',
      message: (
        <>
          {formatShortDate(sub.current_period_end)} に解約予定です。
          <a href="/dashboard/settings/billing" className="underline ml-2">
            解約を取り消す
          </a>
        </>
      ),
    };
  }

  // active で解約予約なしの通常状態はバナーを出さない（ノイズ防止）
  return null;
}

function bannerClasses(kind: BannerKind): string {
  switch (kind) {
    case 'warning':
      return 'bg-amber-50 border-amber-200 text-amber-900';
    case 'info':
      return 'bg-blue-50 border-blue-200 text-blue-900';
    case 'success':
      return 'bg-emerald-50 border-emerald-200 text-emerald-900';
    case 'neutral':
      return 'bg-gray-50 border-gray-200 text-gray-700';
  }
}

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

  // ログイン追跡（throttle 30 分、IS10 #22 対応）
  // 失敗してもダッシュボード表示は止めない
  recordLoginIfStale(user.id, headers()).catch(() => {});

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
    redirect('/billing/select-plan');
  }

  const banner = resolveBanner(sub);

  return (
    <>
      {banner && (
        <div className={`border-b px-4 py-2 ${bannerClasses(banner.kind)}`}>
          <p className="text-xs text-center leading-relaxed">{banner.message}</p>
        </div>
      )}
      {children}
    </>
  );
}
