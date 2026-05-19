/**
 * 法務・運用ドキュメントの一覧定義と読み込みヘルパー。
 *
 * 真のソースは `docs/*.md`。/legal ルート配下のページはこのファイル経由で
 * MD を取得し、marked で HTML に変換して表示する。
 *
 * 公開対象（フッターからリンク可能）：
 *  - privacy-policy
 *  - terms-of-service
 *  - specified-commercial-transaction
 *  - data-retention-policy
 *  - subprocessors
 *
 * 非公開（社内・取引先個別共有のみ）：
 *  - security-whitepaper（B2B 提案向け）
 *  - incident-response（内部運用）
 *  - phase1-security-setup（社内手順）
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

export interface LegalDoc {
  slug: string;
  /** 一覧・パンくず表示用の短いタイトル */
  shortTitle: string;
  /** メタ description 用の説明 */
  description: string;
  /** docs/ 配下のファイル名 */
  filename: string;
}

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: 'privacy-policy',
    shortTitle: 'プライバシーポリシー',
    description: 'S/PASS における個人情報の取扱いについて',
    filename: 'privacy-policy.md',
  },
  {
    slug: 'terms-of-service',
    shortTitle: '利用規約',
    description: 'S/PASS のご利用条件',
    filename: 'terms-of-service.md',
  },
  {
    slug: 'specified-commercial-transaction',
    shortTitle: '特定商取引法に基づく表記',
    description: '販売業者・料金・解約条件等の法定表示',
    filename: 'specified-commercial-transaction.md',
  },
  {
    slug: 'data-retention-policy',
    shortTitle: 'データ保管・廃棄ポリシー',
    description: 'データの保管期間および廃棄手順',
    filename: 'data-retention-policy.md',
  },
  {
    slug: 'subprocessors',
    shortTitle: 'サブプロセッサー一覧',
    description: '個人データ処理を委託する事業者の一覧',
    filename: 'subprocessors.md',
  },
];

export function findLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}

/**
 * docs/<filename> を読み込んで HTML に変換する。
 *
 * - 相対リンク `./xxx.md` → `/legal/xxx`（Web 上での遷移先に書き換え）
 * - GFM テーブル等をサポート（marked デフォルト）
 */
export async function loadLegalDocHtml(doc: LegalDoc): Promise<string> {
  const filePath = path.join(process.cwd(), 'docs', doc.filename);
  const raw = await fs.readFile(filePath, 'utf-8');

  // 内部相対リンク（./xxx.md）を /legal/xxx に書き換え
  const rewritten = raw.replace(/\]\(\.\/([\w-]+)\.md\)/g, (_m, slug) => `](/legal/${slug})`);

  const html = await marked.parse(rewritten, {
    gfm: true,
    breaks: false,
  });
  return html;
}
