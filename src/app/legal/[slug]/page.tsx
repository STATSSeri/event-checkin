/**
 * /legal/[slug] — docs/*.md を表示する動的ルート。
 *
 * generateStaticParams で全ページをビルド時に静的生成するため、
 * 実行時のファイル読み込みコストはなく、Vercel エッジから即配信される。
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { LEGAL_DOCS, findLegalDoc, loadLegalDocHtml } from '@/lib/legal-docs';

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const doc = findLegalDoc(params.slug);
  if (!doc) return { title: 'Not Found | S/PASS' };
  return {
    title: `${doc.shortTitle} | S/PASS`,
    description: doc.description,
  };
}

export default async function LegalDocPage({
  params,
}: {
  params: { slug: string };
}) {
  const doc = findLegalDoc(params.slug);
  if (!doc) notFound();

  const html = await loadLegalDocHtml(doc);

  return (
    <article
      className="legal-prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
