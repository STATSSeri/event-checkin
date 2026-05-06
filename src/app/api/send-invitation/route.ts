import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyEventOwnership } from '@/lib/auth';
import { getFromAddress, REPLY_TO, htmlToPlainText, PLAIN_FOOTER } from '@/lib/email';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { eventId, guestIds } = await request.json();

    if (!eventId || !guestIds?.length) {
      return NextResponse.json(
        { error: 'eventId と guestIds は必須です' },
        { status: 400 }
      );
    }

    // 認可チェック: 呼び出し元が当該イベントの主催者か検証
    const auth = await verifyEventOwnership(eventId);
    if (!auth) {
      return NextResponse.json(
        { error: 'このイベントへの操作権限がありません' },
        { status: 403 }
      );
    }

    // レート制限チェック（メール送信濫用対策）
    const rateLimitId = getRateLimitIdentifier(request, auth.userId);
    const rateLimit = await checkRateLimit('email', rateLimitId);
    if (!rateLimit.success) {
      return rateLimitExceededResponse(rateLimit);
    }

    const supabase = createServiceClient();

    // イベント情報を取得
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'イベントが見つかりません' },
        { status: 404 }
      );
    }

    // ゲスト情報を取得
    const { data: guests, error: guestsError } = await supabase
      .from('guests')
      .select('*')
      .in('id', guestIds);

    if (guestsError || !guests?.length) {
      return NextResponse.json(
        { error: 'ゲストが見つかりません' },
        { status: 404 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    let success = 0;
    let failed = 0;

    // 各ゲストに招待メールを送信
    for (const guest of guests) {
      try {
        const rsvpUrl = `${appUrl}/rsvp/${guest.rsvp_token}`;

        // イベント日時のフォーマット
        const eventDate = event.event_date
          ? new Date(event.event_date).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'short',
            })
          : '';

        // プレーンテキスト版（HTMLが見れない環境向け＋スパムスコア改善）
        const plainText = `${guest.name} 様

このたびは「${event.name}」にご招待申し上げます。

【イベント詳細】
${eventDate ? `日時: ${eventDate}${event.event_time ? ` ${event.event_time}` : ''}\n` : ''}${event.venue ? `会場: ${event.venue}\n` : ''}${event.description ? `詳細: ${htmlToPlainText(event.description)}\n` : ''}
下記URLより出欠のご回答をお願いいたします:
${rsvpUrl}

${PLAIN_FOOTER}`;

        await resend.emails.send({
          from: getFromAddress(event.from_email),
          replyTo: REPLY_TO,
          to: guest.email,
          subject: `「${event.name}」へのご招待`,
          text: plainText,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #F1E6D2;">
              <div style="background: #1F3B2F; padding: 40px 30px; text-align: center; color: #F1E6D2;">
                <p style="margin: 0 0 12px; opacity: 0.7; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase;">You are Invited</p>
                <h1 style="margin: 0; font-size: 24px; font-weight: 700; line-height: 1.4;">${event.name}</h1>
              </div>

              <div style="background: #F1E6D2; padding: 36px 30px; border-left: 0.5px solid rgba(31, 59, 47, 0.3); border-right: 0.5px solid rgba(31, 59, 47, 0.3);">
                <p style="color: #1F3B2F; margin-bottom: 24px; font-weight: 700;">
                  ${guest.name} 様
                </p>

                <p style="color: rgba(31, 59, 47, 0.8); line-height: 1.8;">
                  このたびは「${event.name}」にご招待申し上げます。
                </p>

                <div style="background: #ECEAE3; padding: 20px; margin: 24px 0;">
                  ${eventDate ? `<p style="margin: 4px 0; color: #1F3B2F;">📅 <strong>日時:</strong> ${eventDate}${event.event_time ? ` ${event.event_time}` : ''}</p>` : ''}
                  ${event.venue ? `<p style="margin: 4px 0; color: #1F3B2F;">📍 <strong>会場:</strong> ${event.venue}</p>` : ''}
                  ${event.description ? `<div style="margin-top: 14px; padding-top: 14px; border-top: 0.5px solid rgba(31, 59, 47, 0.3); color: rgba(31, 59, 47, 0.8); font-size: 14px; line-height: 1.7;">${event.description}</div>` : ''}
                </div>

                <p style="color: rgba(31, 59, 47, 0.8); line-height: 1.8;">
                  下記ボタンより出欠のご回答をお願いいたします。
                </p>

                <div style="text-align: center; margin: 36px 0;">
                  <a href="${rsvpUrl}"
                     style="display: inline-block; background: #1F3B2F; color: #F1E6D2; text-decoration: none; padding: 14px 40px; font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase;">
                    Reply / 出欠を回答する
                  </a>
                </div>

                <p style="color: rgba(31, 59, 47, 0.6); font-size: 12px; text-align: center;">
                  このメールに心当たりがない場合は無視してください。
                </p>
              </div>

              <div style="padding: 20px; text-align: center; background: #ECEAE3; border: 0.5px solid rgba(31, 59, 47, 0.3); border-top: none;">
                <p style="color: rgba(31, 59, 47, 0.6); font-size: 10px; margin: 0; letter-spacing: 0.22em; text-transform: uppercase;">
                  S/PASS · Event Reception System
                </p>
              </div>
            </div>
          `,
        });

        // 送信日時を更新
        await supabase
          .from('guests')
          .update({ invitation_sent_at: new Date().toISOString() })
          .eq('id', guest.id);

        success++;
      } catch (err) {
        console.error(`招待メール送信失敗 (${guest.email}):`, err);
        failed++;
      }
    }

    return NextResponse.json({ success, failed });
  } catch (err) {
    console.error('招待メール送信エラー:', err);
    return NextResponse.json(
      { error: '送信処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
