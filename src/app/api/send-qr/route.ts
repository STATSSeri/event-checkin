import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { generateQRBuffer } from '@/lib/qr';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { guestId } = await request.json();

    if (!guestId) {
      return NextResponse.json(
        { error: 'guestId は必須です' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // ゲスト+イベント情報を取得
    const { data: guest, error: guestError } = await supabase
      .from('guests')
      .select('*, events(*)')
      .eq('id', guestId)
      .single();

    if (guestError || !guest) {
      return NextResponse.json(
        { error: 'ゲストが見つかりません' },
        { status: 404 }
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

    // QRコード付きメール送信
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@example.com',
      to: guest.email,
      subject: `「${event.name}」入場QRコード`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #059669, #10B981); padding: 30px; border-radius: 12px 12px 0 0; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px;">${event.name}</h1>
            <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">入場QRコード</p>
          </div>

          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color: #374151; margin-bottom: 20px;">
              ${guest.name} 様
            </p>

            <p style="color: #374151; line-height: 1.8;">
              ご出席のご回答ありがとうございます。<br>
              下記のQRコードが入場チケットとなります。
            </p>

            <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 20px 0;">
              ${eventDate ? `<p style="margin: 4px 0; color: #374151;">📅 <strong>日時:</strong> ${eventDate}${event.event_time ? ` ${event.event_time}` : ''}</p>` : ''}
              ${event.venue ? `<p style="margin: 4px 0; color: #374151;">📍 <strong>会場:</strong> ${event.venue}</p>` : ''}
            </div>

            <div style="text-align: center; margin: 30px 0; padding: 20px; background: #f9fafb; border-radius: 12px;">
              <img src="${qrImageUrl}" alt="入場QRコード" width="250" height="250" style="width: 250px; height: 250px; display: block; margin: 0 auto;" />
              <p style="color: #059669; font-weight: bold; margin-top: 12px; font-size: 16px;">
                このQRコードを受付でご提示ください
              </p>
            </div>

            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              このQRコードは1回のみ有効です。スクリーンショットでの保存をお勧めします。
            </p>
          </div>

          <div style="padding: 16px; text-align: center; border-radius: 0 0 12px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color: #9ca3af; font-size: 11px; margin: 0;">
              イベント受付管理システム
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
      .eq('id', guestId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('QRコード送信エラー:', err);
    return NextResponse.json(
      { error: 'QRコード送信中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
