/**
 * POST /api/audit/log
 *
 * クライアント側で完結する認証操作（MFA enroll/unenroll 等）を
 * 監査ログに記録するためのエンドポイント。
 *
 * 設計方針:
 *   - 認可：自身のユーザー ID 分のみ書き込める
 *   - 受け付ける action は許可リストで制限（任意の文字列を書かせない）
 *   - レート制限：濫用防止に auth 枠を適用
 */

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { recordAuditLog, type AuditAction } from '@/lib/audit-log';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// クライアントから書き込み可能な action のホワイトリスト
// （パスワード変更等のサーバ完結処理はサーバ内で直接 recordAuditLog するため
//  ここには含めない。クライアント完結する MFA 系のみ）
const ALLOWED_CLIENT_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  'mfa_enroll',
  'mfa_unenroll',
]);

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const rl = await checkRateLimit('auth', getRateLimitIdentifier(request, auth.userId));
  if (!rl.success) return rateLimitExceededResponse(rl);

  let body: { action?: unknown; metadata?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 });
  }

  const action = body.action;
  if (typeof action !== 'string' || !ALLOWED_CLIENT_ACTIONS.has(action as AuditAction)) {
    return NextResponse.json({ error: '許可されていない action です' }, { status: 400 });
  }

  const metadata =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  await recordAuditLog({
    userId: auth.userId,
    action: action as AuditAction,
    request,
    metadata,
  });

  return NextResponse.json({ ok: true });
}
