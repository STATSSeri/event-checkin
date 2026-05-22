/**
 * 監査ログ表示セクション（Server Component）
 *
 * /dashboard/settings/security に埋め込む。
 *  - 前回ログイン日時（user_security_meta.last_login_at）
 *  - 最近のアクティビティ（audit_logs 直近 30 件）
 *
 * IS10 外部プラットフォームチェックシート #22「ユーザーまたは管理者でのログ確認機能」
 * への対応。
 */

import { createServiceClient } from '@/lib/supabase/server';
import type { AuditAction } from '@/lib/audit-log';

interface AuditLogRow {
  id: string;
  action: AuditAction;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface SecurityMetaRow {
  last_login_at: string | null;
  password_changed_at: string | null;
}

const ACTION_LABEL: Record<AuditAction, string> = {
  login: 'ログイン',
  password_change: 'パスワード変更',
  mfa_enroll: '多要素認証 有効化',
  mfa_unenroll: '多要素認証 無効化',
  email_change: 'メールアドレス変更',
  mfa_email_otp_sent: 'メールOTP 送信',
  mfa_email_otp_verify_success: 'メールOTP 認証成功',
  mfa_email_otp_verify_failure: 'メールOTP 認証失敗',
  mfa_preference_change: 'MFA方式 変更',
};

/** ISO 文字列を「2026年5月19日 15:30」形式（Asia/Tokyo）で表示 */
function formatJpDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}

/** User-Agent から代表的なブラウザ・OS の概略を返す */
function shortenUserAgent(ua: string | null): string {
  if (!ua) return '—';
  const m = ua.match(/(Chrome|Safari|Firefox|Edge|Opera)\/[\d.]+/);
  const browser = m ? m[1] : 'Browser';
  const os = ua.includes('iPhone')
    ? 'iPhone'
    : ua.includes('iPad')
      ? 'iPad'
      : ua.includes('Android')
        ? 'Android'
        : ua.includes('Mac')
          ? 'Mac'
          : ua.includes('Windows')
            ? 'Windows'
            : ua.includes('Linux')
              ? 'Linux'
              : '—';
  return `${browser} / ${os}`;
}

export async function ActivitySection({ userId }: { userId: string }) {
  const service = createServiceClient();

  const [{ data: meta }, { data: logs }] = await Promise.all([
    service
      .from('user_security_meta')
      .select('last_login_at, password_changed_at')
      .eq('user_id', userId)
      .maybeSingle<SecurityMetaRow>(),
    service
      .from('audit_logs')
      .select('id, action, ip_address, user_agent, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
      .returns<AuditLogRow[]>(),
  ]);

  return (
    <div>
      {/* 前回ログイン + パスワード最終変更 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="border border-gray-200 rounded-md p-3">
          <p className="text-[11px] text-forest-60 mb-1">前回ログイン</p>
          <p className="text-sm text-forest">{formatJpDateTime(meta?.last_login_at ?? null)}</p>
        </div>
        <div className="border border-gray-200 rounded-md p-3">
          <p className="text-[11px] text-forest-60 mb-1">パスワード最終変更</p>
          <p className="text-sm text-forest">{formatJpDateTime(meta?.password_changed_at ?? null)}</p>
        </div>
      </div>

      {/* アクティビティ表 */}
      <h3 className="text-sm font-bold text-forest mb-2">最近のアクティビティ（最大30件）</h3>
      {!logs || logs.length === 0 ? (
        <p className="text-xs text-forest-60">記録されたアクティビティはまだありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-forest-60">
                <th className="text-left py-2 pr-3 font-medium">日時</th>
                <th className="text-left py-2 pr-3 font-medium">操作</th>
                <th className="text-left py-2 pr-3 font-medium">IP</th>
                <th className="text-left py-2 font-medium">環境</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3 whitespace-nowrap text-forest">
                    {formatJpDateTime(log.created_at)}
                  </td>
                  <td className="py-2 pr-3 text-forest">
                    {ACTION_LABEL[log.action] ?? log.action}
                  </td>
                  <td className="py-2 pr-3 text-forest-60">{log.ip_address ?? '—'}</td>
                  <td className="py-2 text-forest-60">{shortenUserAgent(log.user_agent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-forest-60 mt-4 leading-relaxed">
        ※ ご自身の操作に心当たりがないアクティビティが表示されている場合は、
        パスワードの変更および多要素認証の有効化を強く推奨します。
      </p>
    </div>
  );
}
