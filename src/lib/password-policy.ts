/**
 * パスワードポリシー（外部プラットフォームチェックシート IS10 #19 準拠）
 *
 * 要件:
 *  - 10文字以上
 *  - 大文字 / 小文字 / 数字 / 特殊文字 のうち 3 種類以上を含む
 *
 * 純粋関数のみ提供し、クライアント・サーバ双方から呼び出す。
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_REQUIRED_CLASS_COUNT = 3;

/** 1日 (秒) — 同一ユーザーが再度パスワードを変更可能になるまでの最低待ち時間 */
export const PASSWORD_MIN_AGE_SECONDS = 24 * 60 * 60;

/** 履歴で再利用を禁じる過去パスワード件数 */
export const PASSWORD_HISTORY_COUNT = 10;

export type PasswordClass = 'upper' | 'lower' | 'digit' | 'special';

export interface PasswordCheck {
  /** 4種類のうち含まれているもの */
  classesPresent: PasswordClass[];
  /** 文字数 */
  length: number;
  /** 10文字以上か */
  hasMinLength: boolean;
  /** 3種類以上含まれているか */
  hasEnoughClasses: boolean;
  /** 総合判定 */
  ok: boolean;
}

const SPECIAL_PATTERN = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/**
 * パスワードを検査して各条件の充足状況を返す。
 * UI 側のリアルタイム表示にも使う。
 */
export function checkPassword(pw: string): PasswordCheck {
  const classesPresent: PasswordClass[] = [];
  if (/[A-Z]/.test(pw)) classesPresent.push('upper');
  if (/[a-z]/.test(pw)) classesPresent.push('lower');
  if (/[0-9]/.test(pw)) classesPresent.push('digit');
  if (SPECIAL_PATTERN.test(pw)) classesPresent.push('special');

  const length = pw.length;
  const hasMinLength = length >= PASSWORD_MIN_LENGTH;
  const hasEnoughClasses = classesPresent.length >= PASSWORD_REQUIRED_CLASS_COUNT;

  return {
    classesPresent,
    length,
    hasMinLength,
    hasEnoughClasses,
    ok: hasMinLength && hasEnoughClasses,
  };
}

/**
 * サーバ側でポリシー違反時に投げ返すエラーメッセージを返す。
 * 違反がなければ null。
 */
export function validatePasswordOrError(pw: string): string | null {
  const r = checkPassword(pw);
  if (r.ok) return null;
  const reasons: string[] = [];
  if (!r.hasMinLength) {
    reasons.push(`${PASSWORD_MIN_LENGTH}文字以上`);
  }
  if (!r.hasEnoughClasses) {
    reasons.push(
      `大文字・小文字・数字・特殊文字のうち${PASSWORD_REQUIRED_CLASS_COUNT}種類以上を含むこと`,
    );
  }
  return `パスワードは ${reasons.join(' / ')} を満たす必要があります。`;
}

/** UI 表示用のラベル */
export const CLASS_LABELS: Record<PasswordClass, string> = {
  upper: '大文字 (A-Z)',
  lower: '小文字 (a-z)',
  digit: '数字 (0-9)',
  special: '特殊文字 (!@#$ 等)',
};
