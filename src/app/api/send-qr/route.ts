import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { generateQRBuffer } from '@/lib/qr';
import { getFromAddress, REPLY_TO, PLAIN_FOOTER } from '@/lib/email';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { rsvpToken } = await request.json();

    // 認可: rsvpToken（メール内リンクのトークン）保有者のみ呼び出し可能
    if (!rsvpToken) {
      return NextResponse.json(
        { error: 'rsvpToken は必須です' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // ゲスト+イベント情報をrsvp_tokenで取得
    const { data: guest, error: guestError } = await supabase
      .from('guests')
      .select('*, events(*)')
      .eq('rsvp_token', rsvpToken)
      .single();

    if (guestError || !guest) {
      return NextResponse.json(
        { error: 'ゲストが見つかりません' },
        { status: 404 }
      );
    }

    // 出席回答済みのゲストのみQR送信を許可（攻撃者によるスパム防止）
    if (guest.status !== 'attending' && guest.status !== 'checked_in') {
      return NextResponse.json(
        { error: '出席回答済みのゲストのみQRコードを送信できます' },
        { status: 400 }
      );
    }

    const event = guest.events;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    // QRコード生成（添付ファイル用Buffer）
    // メール本文の表示は /api/qr/[token] エンドポイント経由で行う
    // （Resend SDK は cid: 参照を未サポートのためURL方式を採用）
    const checkinUrl = `${appUrl}/scan?token=${guest.checkin_token}`;
    const qrImageUrl = `${appUrl}/api/qr/${guest.checkin_token}`;
    const qrBuffer = await generateQRBuffer(checkinUrl);

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

ご出席のご回答ありがとうございます。
入場QRコードをお送りいたします。

【イベント詳細】
${eventDate ? `日時: ${eventDate}${event.event_time ? ` ${event.event_time}` : ''}\n` : ''}${event.venue ? `会場: ${event.venue}\n` : ''}
※入場用のQRコード画像はこのメール本文（HTML）または添付ファイル（qr-ticket.png）でご確認ください。
※QRコードは1回のみ有効です。スクリーンショットでの保存をお勧めします。

${PLAIN_FOOTER}`;

    // QRコード付きメール送信
    await resend.emails.send({
      from: getFromAddress(event.from_email),
      replyTo: REPLY_TO,
      to: guest.email,
      subject: `「${event.name}」入場QRコード`,
      text: plainText,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #F1E6D2;">
          <div style="background: #1F3B2F; padding: 40px 30px; text-align: center; color: #F1E6D2;">
            <p style="margin: 0 0 12px; opacity: 0.7; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase;">Entry Pass</p>
            <h1 style="margin: 0; font-size: 24px; font-weight: 700; line-height: 1.4;">${event.name}</h1>
          </div>

          <div style="background: #F1E6D2; padding: 36px 30px; border-left: 0.5px solid rgba(31, 59, 47, 0.3); border-right: 0.5px solid rgba(31, 59, 47, 0.3);">
            <p style="color: #1F3B2F; margin-bottom: 24px; font-weight: 700;">
              ${guest.name} 様
            </p>

            <p style="color: rgba(31, 59, 47, 0.8); line-height: 1.8;">
              ご出席のご回答ありがとうございます。<br>
              下記のQRコードが入場チケットとなります。
            </p>

            <div style="background: #ECEAE3; padding: 20px; margin: 24px 0;">
              ${eventDate ? `<p style="margin: 4px 0; color: #1F3B2F;">📅 <strong>日時:</strong> ${eventDate}${event.event_time ? ` ${event.event_time}` : ''}</p>` : ''}
              ${event.venue ? `<p style="margin: 4px 0; color: #1F3B2F;">📍 <strong>会場:</strong> ${event.venue}</p>` : ''}
            </div>

            <div style="text-align: center; margin: 36px 0; padding: 28px 20px; background: #ECEAE3;">
              <img src="${qrImageUrl}" alt="入場QRコード" width="250" height="250" style="width: 250px; height: 250px; display: block; margin: 0 auto; background: #ffffff; padding: 12px;" />
              <p style="color: #1F3B2F; font-weight: 700; margin-top: 16px; font-size: 14px; letter-spacing: 0.06em;">
                このQRコードを受付でご提示ください
              </p>
            </div>

            <p style="color: rgba(31, 59, 47, 0.6); font-size: 12px; text-align: center;">
              このQRコードは1回のみ有効です。スクリーンショットでの保存をお勧めします。
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
        'X-Entity-Ref-ID': `qr-${guest.id}`,
      },
    });

    // QR送信日時を更新
    await supabase
      .from('guests')
      .update({ qr_sent_at: new Date().toISOString() })
      .eq('id', guest.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('QRコード送信エラー:', err);
    return NextResponse.json(
      { error: 'QRコード送信中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
