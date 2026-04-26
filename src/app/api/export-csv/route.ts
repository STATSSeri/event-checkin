import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyEventOwnership } from '@/lib/auth';
import type { GuestStatus } from '@/types';

// ステータスの日本語マッピング
const statusMap: Record<GuestStatus, string> = {
  invited: '未回答',
  attending: '出席',
  declined: '欠席',
  checked_in: 'チェックイン済',
};

// 日時フォーマット
function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// CSVエスケープ（カンマやダブルクォートを含む値の処理）
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId は必須です' },
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

    // イベント名を取得（ファイル名用）
    const { data: event } = await supabase
      .from('events')
      .select('name')
      .eq('id', eventId)
      .single();

    // ゲスト一覧を取得
    const { data: guests, error } = await supabase
      .from('guests')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'データの取得に失敗しました' },
        { status: 500 }
      );
    }

    // CSV生成
    const header = '名前,メール,所属,ステータス,回答日時,チェックイン日時';
    const rows = (guests || []).map((guest) => {
      return [
        escapeCsv(guest.name || ''),
        escapeCsv(guest.email || ''),
        escapeCsv(guest.organization || ''),
        escapeCsv(statusMap[guest.status as GuestStatus] || guest.status),
        escapeCsv(formatDateTime(guest.rsvp_responded_at)),
        escapeCsv(formatDateTime(guest.checked_in_at)),
      ].join(',');
    });

    const csv = '\uFEFF' + [header, ...rows].join('\n'); // BOM付きUTF-8

    // ファイル名（イベント名 + 日付）
    const date = new Date().toISOString().slice(0, 10);
    const filename = event?.name
      ? `${event.name}_ゲスト一覧_${date}.csv`
      : `guests_${date}.csv`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err) {
    console.error('CSVエクスポートエラー:', err);
    return NextResponse.json(
      { error: 'エクスポート中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
