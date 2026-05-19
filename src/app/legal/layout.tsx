/**
 * /legal 配下の共通レイアウト。
 * 認証は不要（誰でも閲覧可能な公開ページ）。
 */

import Link from 'next/link';
import { LEGAL_DOCS } from '@/lib/legal-docs';

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ヘッダー（簡素） */}
      <header className="border-b border-forest-30 bg-cream">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-xl text-forest tracking-[0.32em]"
            style={{
              fontFamily: 'var(--font-mark)',
              fontWeight: 700,
              paddingLeft: '0.32em',
            }}
          >
            S/PASS
          </Link>
          <Link
            href="/legal"
            className="text-xs text-forest-60 hover:text-forest underline"
          >
            法務・運用ドキュメント一覧
          </Link>
        </div>
      </header>

      {/* 本文 */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 md:py-12">
        {children}
      </main>

      {/* フッター（各ドキュメントへの導線） */}
      <footer className="border-t border-forest-30 bg-mist">
        <div className="max-w-3xl mx-auto px-4 py-6 text-xs text-forest-60">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {LEGAL_DOCS.map((d) => (
              <Link
                key={d.slug}
                href={`/legal/${d.slug}`}
                className="hover:text-forest underline"
              >
                {d.shortTitle}
              </Link>
            ))}
          </div>
          <p className="text-[11px]">© スタッツ株式会社</p>
        </div>
      </footer>
    </div>
  );
}
