/**
 * /dashboard/settings/billing
 *
 * 請求情報の管理画面。サブスクの現状（プラン・ステータス・次回請求日・トライアル残）を表示し、
 * Stripe Customer Portal への入口を提供する。
 *
 * 設計方針:
 *   - サーバーコンポーネントでサブスクを取得して表示（最新状態を毎回反映）
 *   - 解約・プラン変更・カード変更は Stripe Customer Portal に委譲（実装コスト・税務対応の観点）
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSubscription } from '@/lib/billing';
import { PLANS } from '@/lib/stripe';
import { OpenPortalButton } from './OpenPortalButton';

export const dynamic = 'force-dynamic';

/** ISO 文字列を「YYYY年M月D日」形式（Asia/Tokyo）で表示 */
function formatJpDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  });
}

/** トライアル/期間終了までの残日数を整数で返す */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default async function BillingSettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const sub = await getSubscription(user.id);

  // 表示用テキストの組み立て
  let statusLabel = '';
  let statusColor = 'text-forest';
  let helperText: string | null = null;

  if (!sub) {
    statusLabel = '未登録';
    statusColor = 'text-gray-500';
    helperText = 'まだプランを開始していません。';
  } else {
    switch (sub.status) {
      case 'trialing': {
        const days = daysUntil(sub.trial_end);
        statusLabel = `無料トライアル中（残り ${days ?? '—'}日）`;
        statusColor = 'text-emerald-700';
        helperText = `${formatJpDate(sub.trial_end)} に自動課金が開始されます。期間中の解約は無料です。`;
        break;
      }
      case 'active':
        statusLabel = '契約中';
        statusColor = 'text-emerald-700';
        helperText = `次回請求日: ${formatJpDate(sub.current_period_end)}`;
        if (sub.cancel_at_period_end) {
          statusLabel = '解約予約中';
          statusColor = 'text-amber-700';
          helperText = `${formatJpDate(sub.current_period_end)} に解約されます。それまでは引き続きご利用いただけます。`;
        }
        break;
      case 'past_due':
        statusLabel = '課金失敗（再試行中）';
        statusColor = 'text-amber-700';
        helperText = 'お支払いに問題があります。下のボタンからカード情報をご確認ください。';
        break;
      case 'canceled':
        statusLabel = '解約済み';
        statusColor = 'text-gray-500';
        helperText = '再開する場合はダッシュボード入口からプランを選び直してください。';
        break;
      case 'trialing_no_card':
        statusLabel = '無料トライアル中（カード未登録）';
        statusColor = 'text-amber-700';
        helperText = 'カード登録後、14日間の無料トライアルが正式に開始されます。';
        break;
      case 'incomplete':
      case 'unpaid':
        statusLabel = '決済情報の確認が必要';
        statusColor = 'text-amber-700';
        helperText = '決済の完了に問題があります。Stripeのサポート画面で対応してください。';
        break;
    }
  }

  const planDef = sub?.plan ? PLANS[sub.plan] : null;
  const canOpenPortal = Boolean(sub?.stripe_customer_id);

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">請求情報の管理</h1>
        <a
          href="/dashboard"
          className="text-sm text-forest-60 hover:text-forest underline"
        >
          ← ダッシュボードに戻る
        </a>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-4 space-y-4">
        <div>
          <p className="text-xs text-forest-60 mb-1">ステータス</p>
          <p className={`text-lg font-bold ${statusColor}`}>{statusLabel}</p>
          {helperText && (
            <p className="text-xs text-forest-60 mt-1 leading-relaxed">{helperText}</p>
          )}
        </div>

        {planDef && (
          <div>
            <p className="text-xs text-forest-60 mb-1">現在のプラン</p>
            <p className="text-base font-bold text-forest">{planDef.name}</p>
            <p className="text-sm text-forest-60">
              月額 {planDef.priceMonthly.toLocaleString('ja-JP')}円 ／ 月{planDef.monthlyEventLimit}件まで
            </p>
          </div>
        )}

        {sub?.trial_end && sub.status === 'trialing' && (
          <div>
            <p className="text-xs text-forest-60 mb-1">トライアル終了日</p>
            <p className="text-sm text-forest">{formatJpDate(sub.trial_end)}</p>
          </div>
        )}

        {sub?.current_period_end && (sub.status === 'active' || sub.status === 'past_due') && (
          <div>
            <p className="text-xs text-forest-60 mb-1">
              {sub.cancel_at_period_end ? '解約予定日' : '次回請求日'}
            </p>
            <p className="text-sm text-forest">{formatJpDate(sub.current_period_end)}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-base font-bold text-forest mb-2">プラン変更・解約・カード変更</h2>
        <p className="text-xs text-forest-60 mb-4 leading-relaxed">
          Stripeの安全な管理画面に移動して、以下の操作が可能です:
        </p>
        <ul className="text-xs text-forest-60 mb-4 space-y-1 ml-4 list-disc">
          <li>プラン変更（スターター ⇄ プロ）</li>
          <li>期間末での解約 / 解約のキャンセル</li>
          <li>クレジットカード情報の更新</li>
          <li>領収書・請求書のダウンロード</li>
          <li>請求先メールアドレスの変更</li>
        </ul>

        {canOpenPortal ? (
          <OpenPortalButton />
        ) : (
          <p className="text-sm text-gray-500">
            プランを開始するとここから管理できるようになります。
          </p>
        )}
      </div>
    </div>
  );
}
