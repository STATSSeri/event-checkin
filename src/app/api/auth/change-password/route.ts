/**
 * POST /api/auth/change-password
 *
 * 認証済みユーザーが自分のパスワードを変更するエンドポイント。
 * IS10 #19 のセキュリティ要件を一括で適用する：
 *  - 新パスワードの強度（10文字以上 / 4種類中3種類）
 *  - 過去 10 回分のパスワード再利用禁止
 *  - 最低有効期間 1 日（直近変更から 24h 以内は変更不可）
 *  - 現在のパスワードを併せて受け取り、本人確認を行う
 *
 * 本ルートは Node ランタイム必須（scrypt 利用のため）。
 */

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  createClient,
  createServiceClient,
} from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import {
  PASSWORD_HISTORY_COUNT,
  PASSWORD_MIN_AGE_SECONDS,
  validatePasswordOrError,
} from '@/lib/password-policy';
import { hashForHistory, matchesHistoryHash } from '@/lib/password-hash';
import { recordAuditLog } from '@/lib/audit-log';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChangePasswordBody {
  currentPassword?: unknown;
  newPassword?: unknown;
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  // ブルートフォース防止。auth 系の厳しめ枠を再利用。
  const rateLimitId = getRateLimitIdentifier(request, auth.userId);
  const rateLimit = await checkRateLimit('auth', rateLimitId);
  if (!rateLimit.success) return rateLimitExceededResponse(rateLimit);

  let body: ChangePasswordBody;
  try {
    body = (await request.json()) as ChangePasswordBody;
  } catch {
    return NextResponse.json(
      { error: 'リクエスト形式が不正です' },
      { status: 400 },
    );
  }

  const currentPassword =
    typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword =
    typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: '現在のパスワードと新しいパスワードを入力してください' },
      { status: 400 },
    );
  }

  // ① 新パスワード強度チェック
  const strengthError = validatePasswordOrError(newPassword);
  if (strengthError) {
    return NextResponse.json({ error: strengthError }, { status: 400 });
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: '新しいパスワードは現在のパスワードと異なる必要があります' },
      { status: 400 },
    );
  }

  // ② 現在のパスワードを検証する（再認証）。
  //   既存セッションに影響しないよう、専用クライアントで signInWithPassword を試す。
  const userClient = createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email) {
    return NextResponse.json(
      { error: 'ユーザー情報を取得できませんでした' },
      { status: 500 },
    );
  }

  const standaloneClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: reauthError } = await standaloneClient.auth.signInWithPassword(
    { email: user.email, password: currentPassword },
  );
  if (reauthError) {
    return NextResponse.json(
      { error: '現在のパスワードが正しくありません' },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  // ③ 最低有効期間チェック（24時間以内の連続変更を禁止）
  const { data: meta } = await service
    .from('user_security_meta')
    .select('password_changed_at')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (meta?.password_changed_at) {
    const lastChange = new Date(meta.password_changed_at).getTime();
    const ageSec = (Date.now() - lastChange) / 1000;
    if (ageSec < PASSWORD_MIN_AGE_SECONDS) {
      const hoursLeft = Math.ceil(
        (PASSWORD_MIN_AGE_SECONDS - ageSec) / 3600,
      );
      return NextResponse.json(
        {
          error: `パスワードの最低有効期間（1日）が経過していません。あと約 ${hoursLeft} 時間後に再度お試しください。`,
        },
        { status: 400 },
      );
    }
  }

  // ④ パスワード履歴チェック（過去10回分との一致を拒否）
  const { data: history } = await service
    .from('password_history')
    .select('password_hash')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(PASSWORD_HISTORY_COUNT);

  if (history) {
    for (const row of history) {
      if (matchesHistoryHash(newPassword, row.password_hash)) {
        return NextResponse.json(
          {
            error: `直近 ${PASSWORD_HISTORY_COUNT} 回分のパスワードと同じものは使用できません`,
          },
          { status: 400 },
        );
      }
    }
  }

  // ⑤ Supabase Auth 側のパスワードを更新（service_role の admin API 経由）
  const { error: updateError } = await service.auth.admin.updateUserById(
    auth.userId,
    { password: newPassword },
  );
  if (updateError) {
    return NextResponse.json(
      { error: `パスワードの更新に失敗しました: ${updateError.message}` },
      { status: 500 },
    );
  }

  // ⑥ 履歴に新ハッシュを追加し、古いものを削除して 10 件以内に維持
  const newHash = hashForHistory(newPassword);
  await service.from('password_history').insert({
    user_id: auth.userId,
    password_hash: newHash,
  });

  // 直近 PASSWORD_HISTORY_COUNT 件より古いものは削除
  const { data: latest } = await service
    .from('password_history')
    .select('created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .range(PASSWORD_HISTORY_COUNT - 1, PASSWORD_HISTORY_COUNT - 1);

  const cutoff = latest?.[0]?.created_at;
  if (cutoff) {
    await service
      .from('password_history')
      .delete()
      .eq('user_id', auth.userId)
      .lt('created_at', cutoff);
  }

  // ⑦ user_security_meta を upsert
  await service.from('user_security_meta').upsert(
    {
      user_id: auth.userId,
      password_changed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  // ⑧ 監査ログに記録（IS10 #22 対応）
  await recordAuditLog({
    userId: auth.userId,
    action: 'password_change',
    request,
  });

  return NextResponse.json({ ok: true });
}
