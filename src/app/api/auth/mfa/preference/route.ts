/**
 * POST /api/auth/mfa/preference
 *
 * ユーザーが希望する MFA 方式（メールOTP / TOTP / 無効）を保存する。
 *  - body.method: 'email' | 'totp' | 'none'
 *  - 'totp' を選択する場合は事前に MfaSection で TOTP factor を verified に
 *    していること（このAPIは要求しない。verify済みでない状態で 'totp' を
 *    選んだ場合、middleware は AAL2 が満たせず /mfa-challenge にリダイレクトし続ける）
 *  - 'none' は preferred_mfa_method を NULL に戻す（= MFA 必須化解除）
 *    ただし TOTP factor が verified のまま残っていれば AAL2 が要求されるので、
 *    'none' に下げたいユーザーは別途 MfaSection で TOTP を解除する必要がある
 */

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';
import { recordAuditLog } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

type PreferenceInput = 'email' | 'totp' | 'none';
const VALID_INPUTS: ReadonlySet<PreferenceInput> = new Set<PreferenceInput>([
  'email',
  'totp',
  'none',
]);

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const rl = await checkRateLimit('auth', getRateLimitIdentifier(request, auth.userId));
  if (!rl.success) return rateLimitExceededResponse(rl);

  let body: { method?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 });
  }

  const method = body.method;
  if (typeof method !== 'string' || !VALID_INPUTS.has(method as PreferenceInput)) {
    return NextResponse.json(
      { error: 'method は email / totp / none のいずれかを指定してください' },
      { status: 400 },
    );
  }

  const dbValue = method === 'none' ? null : method;

  const service = createServiceClient();
  const { error: upsertErr } = await service.from('user_security_meta').upsert(
    {
      user_id: auth.userId,
      preferred_mfa_method: dbValue,
    },
    { onConflict: 'user_id' },
  );
  if (upsertErr) {
    console.error('[mfa-preference] upsert failed:', upsertErr);
    return NextResponse.json(
      { error: '設定の保存に失敗しました' },
      { status: 500 },
    );
  }

  await recordAuditLog({
    userId: auth.userId,
    action: 'mfa_preference_change',
    request,
    metadata: { method: dbValue },
  });

  return NextResponse.json({ ok: true, method: dbValue });
}
