import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateQRBuffer } from '@/lib/qr';

// メール本文に埋め込むQR画像を返す公開エンドポイント
// セキュリティ: トークン自体が秘密値（推測不能）。トークンが正しい場合のみQR返却
export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const token = params.token;
  if (!token) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: guest, error } = await supabase
    .from('guests')
    .select('checkin_token')
    .eq('checkin_token', token)
    .single();

  if (error || !guest) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const checkinUrl = `${appUrl}/scan?token=${guest.checkin_token}`;
  const buffer = await generateQRBuffer(checkinUrl);
  // Buffer → Uint8Array に変換（NextResponse の型要件のため）
  const body = new Uint8Array(buffer);

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline; filename="qr-ticket.png"',
    },
  });
}
