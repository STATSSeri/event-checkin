import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyEventOwnership } from '@/lib/auth';
import { generateQRBuffer } from '@/lib/qr';
import { getFromAddress, REPLY_TO, htmlToPlainText, PLAIN_FOOTER } from '@/lib/email';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * 前日リマインド送信API
 * - 出席確定（status='attending'）のゲストにのみ送信
 * - QRは初回送信時と同じ checkin_token から生成（決定的）
 * - チェックイン済の人には送らない（無意味＋誤解防止）
 */
export async function POST(request: Request) {
  try {
    const { eventId, guestIds } = await request.json();

    if (!eventId || !guestIds?.length) {
      return NextResponse.json(
        { error: 'eventId と guestIds は必須です' },
        { status: 400 }
      );
    }

    // 認可チェック
    const auth = await verifyEventOwnership(eventId);
    if (!auth) {
      return NextResponse.json(
        { error: 'このイベントへの操作権限がありません' },
        { status: 403 }
      );
    }

    const supabase = createServiceClient();

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

    // 出席確定者のみ取得（attendingステータス・指定ID・このイベント所属）
    // checked_inの人は除外（既に入場済みのため不要）
    const { data: guests, error: guestsError } = await supabase
      .from('guests')
      .select('*')
      .in('id', guestIds)
      .eq('event_id', eventId)
      .eq('status', 'attending');

    if (guestsError || !guests?.length) {
      return NextResponse.json(
        { error: '対象ゲストが見つかりません（出席確定者のみ送信可能です）' },
        { status: 404 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    let success = 0;
    let failed = 0;

    for (const guest of guests) {
      try {
        // QRは初回QRメールと同じ checkin_token から生成（同一QR保証）
        const qrImageUrl = `${appUrl}/api/qr/${guest.checkin_token}`;
        const checkinUrl = `${appUrl}/scan?token=${guest.checkin_token}`;
        const qrBuffer = await generateQRBuffer(checkinUrl);

        const eventDate = event.event_date
          ? new Date(event.event_date).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'short',
            })
          : '';

        // プレーンテキスト版
        const plainText = `${guest.name} 様

ご来場が間近となりましたので、改めてご案内申し上げます。
当日は受付にて下記のQRコードをご提示ください。

【イベント詳細】
${eventDate ? `日時: ${eventDate}${event.event_time ? ` ${event.event_time}` : ''}\n` : ''}${event.venue ? `会場: ${event.venue}\n` : ''}${event.description ? `詳細: ${htmlToPlainText(event.description)}\n` : ''}
※入場用のQRコード画像はこのメール本文（HTML）または添付ファイル（qr-ticket.png）でご確認ください。
※こちらのQRコードは出欠ご回答時にお送りしたものと同じです。以前のメールに添付されたQRコードもそのままご利用いただけます。

${PLAIN_FOOTER}`;

        await resend.emails.send({
          from: getFromAddress(),
          replyTo: REPLY_TO,
          to: guest.email,
          subject: `【ご来場前のご案内】「${event.name}」`,
          text: plainText,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #F1E6D2;">
              <div style="background: #1F3B2F; padding: 40px 30px; text-align: center; color: #F1E6D2;">
                <p style="margin: 0 0 12px; opacity: 0.7; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase;">Final Notice</p>
                <h1 style="margin: 0; font-size: 24px; font-weight: 700; line-height: 1.4;">${event.name}</h1>
              </div>

              <div style="background: #F1E6D2; padding: 36px 30px; border-left: 0.5px solid rgba(31, 59, 47, 0.3); border-right: 0.5px solid rgba(31, 59, 47, 0.3);">
                <p style="color: #1F3B2F; margin-bottom: 24px; font-weight: 700;">
                  ${guest.name} 様
                </p>

                <p style="color: rgba(31, 59, 47, 0.8); line-height: 1.8;">
                  ご来場が間近となりましたので、改めてご案内申し上げます。<br>
                  当日は受付にて下記のQRコードをご提示ください。
                </p>

                <div style="background: #ECEAE3; padding: 20px; margin: 24px 0;">
                  ${eventDate ? `<p style="margin: 4px 0; color: #1F3B2F;">📅 <strong>日時:</strong> ${eventDate}${event.event_time ? ` ${event.event_time}` : ''}</p>` : ''}
                  ${event.venue ? `<p style="margin: 4px 0; color: #1F3B2F;">📍 <strong>会場:</strong> ${event.venue}</p>` : ''}
                  ${event.description ? `<div style="margin-top: 14px; padding-top: 14px; border-top: 0.5px solid rgba(31, 59, 47, 0.3); color: rgba(31, 59, 47, 0.8); font-size: 14px; line-height: 1.7;">${event.description}</div>` : ''}
                </div>

                <div style="text-align: center; margin: 36px 0; padding: 28px 20px; background: #ECEAE3;">
                  <img src="${qrImageUrl}" alt="入場QRコード" width="250" height="250" style="width: 250px; height: 250px; display: block; margin: 0 auto; background: #ffffff; padding: 12px;" />
                  <p style="color: #1F3B2F; font-weight: 700; margin-top: 16px; font-size: 14px; letter-spacing: 0.06em;">
                    このQRコードを受付でご提示ください
                  </p>
                </div>

                <p style="color: rgba(31, 59, 47, 0.6); font-size: 12px; text-align: center; line-height: 1.6;">
                  ※こちらのQRコードは出欠ご回答時にお送りしたものと同じです。<br>
                  以前のメールに添付されたQRコードもそのままご利用いただけます。
                </p>
              </div>

              <div style="padding: 20px; text-align: center; background: #ECEAE3; border: 0.5px solid rgba(31, 59, 47, 0.3); border-top: none;">
                <p style="color: rgba(31, 59, 47, 0.6); font-size: 10px; margin: 0; letter-spacing: 0.22em; text-transform: uppercase;">
                  S/PASS · Event Reception System
                </p>
              </div>
            </div>
          `,
          attachments: [
            {
              filename: 'qr-ticket.png',
              content: qrBuffer,
              contentType: 'image/png',
            },
          ],
          headers: {
            'X-Entity-Ref-ID': `day-before-${guest.id}-${Date.now()}`,
          },
        });

        success++;
      } catch (err) {
        console.error(`前日リマインド送信失敗 (${guest.email}):`, err);
        failed++;
      }
    }

    return NextResponse.json({ success, failed });
  } catch (err) {
    console.error('前日リマインド送信エラー:', err);
    return NextResponse.json(
      { error: '送信処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
