import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * API Route用: 呼び出し元ユーザーが指定イベントの主催者であることを検証する
 *
 * service_roleクライアントはRLSをバイパスするため、各APIで明示的に
 * 「呼び出しユーザーが対象イベントの主催者か」を確認する必要がある。
 *
 * @param eventId 検証対象のイベントID
 * @returns 認可OKなら { userId }、NGなら null
 */
export async function verifyEventOwnership(
  eventId: string
): Promise<{ userId: string } | null> {
  // ユーザーセッションをcookieから取得
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;

  // service_roleでイベントの主催者IDを取得（RLSバイパスして直接確認）
  const serviceClient = createServiceClient();
  const { data: event } = await serviceClient
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single();

  if (!event || event.organizer_id !== user.id) return null;
  return { userId: user.id };
}
