/**
 * 課金関連の通知メール送信ヘルパー（Resend経由）。
 *
 * - lazy 初期化で build time エラー回避（resend-domains.ts と同パターン）
 * - 失敗してもユーザー操作は中断させない（ログだけ残す）
 */

import { Resend } from 'resend';
import { getFromAddress, REPLY_TO, htmlToPlainText } from '@/lib/email';

let resendClient: Resend | null = null;
function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[billing-emails] RESEND_API_KEY is not set, skipping email send');
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const client = getResend();
  if (!client) return;

  try {
    const result = await client.emails.send({
      from: getFromAddress(null),
      to,
      replyTo: REPLY_TO,
      subject,
      html,
      text: htmlToPlainText(html),
    });
    if (result.error) {
      console.error('[billing-emails] send failed:', subject, result.error);
    }
  } catch (err) {
    console.error('[billing-emails] send threw:', subject, err);
  }
}

/**
 * トライアル終了3日前リマインド。
 * Stripe からの `customer.subscription.trial_will_end` 受信時に送信。
 */
export async function sendTrialWillEndEmail(opts: {
  to: string;
  trialEndDate: Date;
}): Promise<void> {
  const dateStr = opts.trialEndDate.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  });
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color:#1f2937; line-height:1.7;">
      <p>S/PASS をご利用いただきありがとうございます。</p>
      <p>14日間の無料トライアルが <strong>${dateStr}</strong> に終了します。</p>
      <p>終了後は登録いただいたカードに自動で課金が開始されます。<br />
      継続して S/PASS をお使いいただける場合、お手続きは不要です。</p>
      <p>プランの変更や解約は、ダッシュボードの「請求情報の管理」からいつでも可能です。</p>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color:#6b7280;">
        ご不明な点があれば、このメールに返信してください。
      </p>
    </div>
  `;
  await sendMail(opts.to, 'S/PASS 無料トライアルがまもなく終了します', html);
}

/**
 * 課金失敗通知。
 * Stripe からの `invoice.payment_failed` 受信時に送信。
 */
export async function sendPaymentFailedEmail(opts: {
  to: string;
}): Promise<void> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color:#1f2937; line-height:1.7;">
      <p>S/PASS の自動課金が失敗しました。</p>
      <p>カードの有効期限切れ、残高不足、または発行会社による拒否が考えられます。</p>
      <p><strong>そのままにすると S/PASS のご利用が停止されます。</strong><br />
      ダッシュボードの「請求情報の管理」からカード情報をご確認・更新ください。</p>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color:#6b7280;">
        ご不明な点があれば、このメールに返信してください。
      </p>
    </div>
  `;
  await sendMail(opts.to, '【重要】S/PASS の課金が失敗しました', html);
}

/**
 * 解約完了通知（任意）。
 * `customer.subscription.deleted` 受信時に送信。
 */
export async function sendSubscriptionCanceledEmail(opts: {
  to: string;
}): Promise<void> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color:#1f2937; line-height:1.7;">
      <p>S/PASS のサブスクリプション解約を承りました。</p>
      <p>ご利用いただきありがとうございました。<br />
      再開をご希望の場合はいつでもログインしてプランを選択いただけます。</p>
    </div>
  `;
  await sendMail(opts.to, 'S/PASS の解約を承りました', html);
}
