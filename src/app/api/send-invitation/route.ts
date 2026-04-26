import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyEventOwnership } from '@/lib/auth';

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
    let sent = 0;
    let errors = 0;

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

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'noreply@example.com',
          to: guest.email,
          subject: `「${event.name}」へのご招待`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 30px; border-radius: 12px 12px 0 0; text-align: center; color: white;">
                <p style="margin: 0 0 8px; opacity: 0.8; font-size: 14px;">ご招待</p>
                <h1 style="margin: 0; font-size: 24px;">${event.name}</h1>
              </div>

              <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
                <p style="color: #374151; margin-bottom: 20px;">
                  ${guest.name} 様
                </p>

                <p style="color: #374151; line-height: 1.8;">
                  このたびは「${event.name}」にご招待申し上げます。
                </p>

                <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 20px 0;">
                  ${eventDate ? `<p style="margin: 4px 0; color: #374151;">📅 <strong>日時:</strong> ${eventDate}${event.event_time ? ` ${event.event_time}` : ''}</p>` : ''}
                  ${event.venue ? `<p style="margin: 4px 0; color: #374151;">📍 <strong>会場:</strong> ${event.venue}</p>` : ''}
                  ${event.description ? `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #4b5563; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${event.description}</div>` : ''}
                </div>

                <p style="color: #374151; line-height: 1.8;">
                  下記ボタンより出欠のご回答をお願いいたします。
                </p>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${rsvpUrl}"
                     style="display: inline-block; background: #4F46E5; color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    出欠を回答する
                  </a>
                </div>

                <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                  このメールに心当たりがない場合は無視してください。
                </p>
              </div>

              <div style="padding: 16px; text-align: center; border-radius: 0 0 12px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none;">
                <p style="color: #9ca3af; font-size: 11px; margin: 0;">
                  イベント受付管理システム
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

        sent++;
      } catch (err) {
        console.error(`招待メール送信失敗 (${guest.email}):`, err);
        errors++;
      }
    }

    return NextResponse.json({ sent, errors });
  } catch (err) {
    console.error('招待メール送信エラー:', err);
    return NextResponse.json(
      { error: '送信処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
