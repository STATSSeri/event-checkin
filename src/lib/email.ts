/**
 * メール送信の共通設定
 * Mimecast 等のコーポレートメールフィルタ通過率を上げるための設定を集約
 */

/**
 * 表示名つき From アドレス
 * 例: "S/PASS <noreply@spass.tokyo>"
 *
 * イベント別の送信元（events.from_email）が指定されている場合はそれを優先：
 * - "events@brand.com" 形式 → "S/PASS <events@brand.com>" に整形
 * - "ブランド名 <events@brand.com>" 形式 → そのまま使用
 *
 * Display name があるとスパムスコアが下がる傾向がある
 */
export function getFromAddress(eventFromEmail?: string | null): string {
  if (eventFromEmail) {
    const trimmed = eventFromEmail.trim();
    // 既に "Display Name <email>" 形式なら手を加えない
    if (trimmed.includes('<') && trimmed.includes('>')) {
      return trimmed;
    }
    // 単純なメールアドレスならデフォルトの表示名を付与
    return `S/PASS <${trimmed}>`;
  }
  const email = process.env.RESEND_FROM_EMAIL || 'noreply@spass.tokyo';
  return `S/PASS <${email}>`;
}

/**
 * 返信先アドレス
 * Reply-To が設定されているとスパム判定スコアが下がる
 */
export const REPLY_TO = 'serita@statsworks.tokyo';

/**
 * HTMLからプレーンテキストへの変換
 * 全てのメールにプレーンテキスト版を併記することでスパムスコアを下げる
 */
export function htmlToPlainText(html: string): string {
  return (
    html
      // <a href="URL">テキスト</a> → "テキスト (URL)"
      .replace(
        /<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi,
        '$2 ($1)'
      )
      // <br> や </p> 等を改行に置換
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      // 残りのHTMLタグを除去
      .replace(/<[^>]*>/g, '')
      // HTMLエンティティを戻す
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      // 連続する空行を圧縮
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * 共通フッター（プレーンテキスト用）
 */
export const PLAIN_FOOTER = `
---
S/PASS · Event Reception System
運営: 株式会社スタッツ
このメールに心当たりがない場合は無視してください。`.trim();
