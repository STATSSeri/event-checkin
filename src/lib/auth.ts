import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * API Route用: 呼び出し元のユーザー ID を返す
 * @returns 認証済みなら { userId }、未認証なら null
 */
export async function requireUser(): Promise<{ userId: string } | null> {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;
  return { userId: user.id };
}

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
  const auth = await requireUser();
  if (!auth) return null;

  // service_roleでイベントの主催者IDを取得（RLSバイパスして直接確認）
  const serviceClient = createServiceClient();
  const { data: event } = await serviceClient
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single();

  if (!event || event.organizer_id !== auth.userId) return null;
  return { userId: auth.userId };
}

/**
 * API Route用: 呼び出し元ユーザーが指定 sender_domain の所有者であることを検証
 * @returns 認可OKなら { userId, resendDomainId }、NGなら null
 */
export async function verifyDomainOwnership(
  domainId: string,
): Promise<{ userId: string; resendDomainId: string } | null> {
  const auth = await requireUser();
  if (!auth) return null;

  const serviceClient = createServiceClient();
  const { data } = await serviceClient
    .from('sender_domains')
    .select('user_id, resend_domain_id')
    .eq('id', domainId)
    .single();

  if (!data || data.user_id !== auth.userId) return null;
  return { userId: auth.userId, resendDomainId: data.resend_domain_id };
}
