/**
 * メール関連の入力バリデーション（Client/Server 両用）
 *
 * 主目的：ヘッダーインジェクション対策
 * From / Reply-To 等のヘッダー値に CR/LF を混入されると、
 * 任意の Bcc/CC ヘッダを追加されて第三者に情報漏洩する重大脆弱性に繋がるため、
 * 入力段階・送信直前の両方で防御する（多重防衛）。
 */

/**
 * メールヘッダ値として安全か判定
 * 制御文字（CR, LF, NULL, その他 C0/C1）を含む場合は不正
 */
export function isSafeHeaderValue(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[\r\n\0\x00-\x1f\x7f]/.test(value);
}

/**
 * メールアドレスの実用的バリデーション
 * RFC 5322 完全準拠は複雑すぎるので、現実のアドレスを広くカバーする範囲に限定
 *  - ローカルパート: 英数字 + . _ % + -
 *  - ドメイン: 英数字 + - + .（先頭末尾はハイフン不可、TLD は2文字以上）
 */
const SIMPLE_EMAIL_REGEX =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function isValidEmailAddress(value: string): boolean {
  if (!isSafeHeaderValue(value)) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false; // RFC 5321 上限
  return SIMPLE_EMAIL_REGEX.test(trimmed);
}

/**
 * From / Reply-To ヘッダ値の検証
 * 受け付ける形式：
 *   1) "addr@example.com"
 *   2) "Display Name <addr@example.com>"
 *
 * Display Name は引用符無し前提。引用符 / 山括弧 / @ を含む場合は拒否（パース複雑化を避ける）。
 */
export function isValidFromHeader(value: string): boolean {
  if (!isSafeHeaderValue(value)) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) return false;

  // "Display <email>" 形式
  const angleMatch = trimmed.match(/^([^<>]*?)\s*<([^<>]+)>$/);
  if (angleMatch) {
    const displayName = angleMatch[1].trim();
    const email = angleMatch[2].trim();
    // Display 名は空でも OK（"<addr>" 形式）。ただし不正文字は拒否
    if (displayName) {
      // ダブルクォート / 山括弧 / @ を含む display 名は弾く（簡略化のため）
      if (/["@<>]/.test(displayName)) return false;
    }
    return isValidEmailAddress(email);
  }

  // 単体メアド
  // 山括弧が片方だけ含まれているケースは弾く
  if (trimmed.includes('<') || trimmed.includes('>')) return false;
  return isValidEmailAddress(trimmed);
}

/**
 * ローカルパート（@ より左側）の検証
 * ドメイン検証フローと組み合わせて、検証済みドメイン × 自由ローカルパート で
 * From アドレスを組み立てる用途
 */
export function isValidLocalPart(value: string): boolean {
  if (!isSafeHeaderValue(value)) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return false; // RFC 5321 上限
  return /^[A-Za-z0-9._%+-]+$/.test(trimmed);
}

/**
 * ドメイン部のみの検証（ドメイン登録機能用）
 */
export function isValidDomainName(value: string): boolean {
  if (!isSafeHeaderValue(value)) return false;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 253) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
    trimmed,
  );
}
