/**
 * 監査ログ記録ユーティリティ。
 *
 * IS10 外部プラットフォームチェックシート #22「ログ確認機能の有無」に対応。
 * サーバ側 (service_role) からのみ書き込み、ユーザーは自分の履歴を SELECT 可能。
 *
 * 取扱う action 種別:
 *   - login              ：ダッシュボード到達時の throttle 付きログイン記録
 *   - password_change    ：/api/auth/change-password から
 *   - mfa_enroll         ：MFA 有効化完了時
 *   - mfa_unenroll       ：MFA 無効化時
 *   - email_change       ：将来用（メアド変更フロー実装時に使用）
 */

import { createServiceClient } from '@/lib/supabase/server';

export type AuditAction =
  | 'login'
  | 'password_change'
  | 'mfa_enroll'
  | 'mfa_unenroll'
  | 'email_change';

export interface AuditLog {
  id: string;
  user_id: string;
  action: AuditAction;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Headers-like：Request.headers でも next/headers の headers() 結果でも受け取れる */
type HeaderSource = Pick<Headers, 'get'>;

interface RecordAuditLogInput {
  userId: string;
  action: AuditAction;
  /** Request オブジェクト（IP / UA 抽出用） */
  request?: Request;
  /** Server Component 等で使う場合、headers() の戻り値を渡せる */
  headers?: HeaderSource;
  /** 追加情報 */
  metadata?: Record<string, unknown>;
}

/**
 * 監査ログを 1 件記録する。
 * 失敗してもアプリの主処理を止めないよう、エラーはログ出力のみで握り潰す。
 */
export async function recordAuditLog({
  userId,
  action,
  request,
  headers,
  metadata,
}: RecordAuditLogInput): Promise<void> {
  const source: HeaderSource | undefined = request?.headers ?? headers;
  const ipAddress = source ? extractIp(source) : null;
  const userAgent = source ? truncate(source.get('user-agent'), 512) : null;

  const service = createServiceClient();
  const { error } = await service.from('audit_logs').insert({
    user_id: userId,
    action,
    ip_address: ipAddress,
    user_agent: userAgent,
    metadata: metadata ?? null,
  });
  if (error) {
    console.error('[audit-log] insert failed:', error.message, { userId, action });
  }
}

/**
 * Login イベントを throttle 付きで記録。
 * 直近 N 分以内に同ユーザーの login ログがあればスキップする
 * （同一セッション内のダッシュボード再アクセスでログが溢れるのを防止）。
 *
 * 返り値: 実際に記録したか否か
 */
export async function recordLoginIfStale(
  userId: string,
  source: Request | HeaderSource,
  throttleMinutes = 30,
): Promise<boolean> {
  const service = createServiceClient();
  const cutoff = new Date(Date.now() - throttleMinutes * 60 * 1000).toISOString();

  const { data: recent } = await service
    .from('audit_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('action', 'login')
    .gt('created_at', cutoff)
    .limit(1)
    .maybeSingle();

  if (recent) return false;

  // Request か Headers のどちらでも渡せるよう分岐
  if (source instanceof Request) {
    await recordAuditLog({ userId, action: 'login', request: source });
  } else {
    await recordAuditLog({ userId, action: 'login', headers: source });
  }

  // 同時に user_security_meta.last_login_at も更新（前回ログイン日時表示用）
  await service.from('user_security_meta').upsert(
    {
      user_id: userId,
      last_login_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  return true;
}

/** Headers から IP を抽出（X-Forwarded-For 優先、Vercel 環境を信頼） */
function extractIp(headers: HeaderSource): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip');
}

function truncate(s: string | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}
