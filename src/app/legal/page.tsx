/**
 * /legal — 法務・運用ドキュメントの一覧（ハブページ）
 */

import Link from 'next/link';
import { LEGAL_DOCS } from '@/lib/legal-docs';

export const metadata = {
  title: '法務・運用ドキュメント | S/PASS',
  description: 'S/PASS の利用規約・プライバシーポリシー等',
};

export default function LegalIndexPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-forest mb-2">
        法務・運用ドキュメント
      </h1>
      <p className="text-sm text-forest-60 mb-8 leading-relaxed">
        S/PASS のご利用にあたっての各種ドキュメントです。
        ご利用前にご一読ください。
      </p>
      <ul className="space-y-3">
        {LEGAL_DOCS.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/legal/${d.slug}`}
              className="block bg-white rounded-lg shadow-md p-5 hover:shadow-lg transition-shadow"
            >
              <h2 className="text-base font-bold text-forest mb-1">
                {d.shortTitle}
              </h2>
              <p className="text-xs text-forest-60 leading-relaxed">
                {d.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
