/**
 * /dashboard/settings
 *
 * 設定画面のインデックス。各種設定項目への入口。
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SettingItem = {
  href: string;
  title: string;
  description: string;
  icon: string;
};

const ITEMS: SettingItem[] = [
  {
    href: '/dashboard/settings/billing',
    title: '請求情報の管理',
    description: 'プラン・カード・解約・領収書のダウンロード',
    icon: '💳',
  },
  {
    href: '/dashboard/settings/domains',
    title: '送信元ドメインの設定',
    description: '自社ドメインから招待メールを送信（プロプラン以上）',
    icon: '✉️',
  },
];

export default async function SettingsIndexPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">設定</h1>
        <a
          href="/dashboard"
          className="text-sm text-forest-60 hover:text-forest underline"
        >
          ← ダッシュボードに戻る
        </a>
      </div>

      <div className="space-y-3">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block bg-white rounded-lg shadow-md p-5 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl">{item.icon}</span>
              <div className="flex-1">
                <h2 className="text-base font-bold text-forest mb-1">{item.title}</h2>
                <p className="text-xs text-forest-60 leading-relaxed">{item.description}</p>
              </div>
              <span className="text-forest-60">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
