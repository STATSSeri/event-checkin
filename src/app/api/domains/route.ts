import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { isValidDomainName } from '@/lib/email-validation';
import { createResendDomain } from '@/lib/resend-domains';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';

// 動的ルート扱い（cookie 参照のため）
export const dynamic = 'force-dynamic';

/**
 * GET /api/domains
 * 自分が登録したドメイン一覧を返す。
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const rateLimitId = getRateLimitIdentifier(request, auth.userId);
  const rateLimit = await checkRateLimit('api', rateLimitId);
  if (!rateLimit.success) return rateLimitExceededResponse(rateLimit);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('sender_domains')
    .select('*')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ domains: data ?? [] });
}

/**
 * POST /api/domains
 * 新規ドメインを Resend に登録し、DB に保存して返す。
 * Body: { domain: string }
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const rateLimitId = getRateLimitIdentifier(request, auth.userId);
  const rateLimit = await checkRateLimit('domain', rateLimitId);
  if (!rateLimit.success) return rateLimitExceededResponse(rateLimit);

  let body: { domain?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON が不正です' }, { status: 400 });
  }

  const rawDomain =
    typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : '';
  if (!isValidDomainName(rawDomain)) {
    return NextResponse.json(
      {
        error:
          'ドメイン形式が不正です。例: goal.dentsu.co.jp（http:// や @ を含めないでください）',
      },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // 同一ユーザーで同じドメインの2重登録を防ぐ
  const { data: existing } = await supabase
    .from('sender_domains')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('domain', rawDomain)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'このドメインは既に登録されています' },
      { status: 409 },
    );
  }

  // Resend にドメイン作成
  const created = await createResendDomain(rawDomain);
  if (!created.ok) {
    return NextResponse.json(
      { error: `Resend へのドメイン登録に失敗しました: ${created.error}` },
      { status: created.statusCode ?? 502 },
    );
  }

  // DB に保存
  const { data: inserted, error: insertError } = await supabase
    .from('sender_domains')
    .insert({
      user_id: auth.userId,
      domain: rawDomain,
      resend_domain_id: created.data.resendDomainId,
      status: created.data.status,
      dns_records: created.data.records,
      last_checked_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    // Resend には作成済みだが DB 保存失敗。孤立を防ぐため Resend からも削除を試みる。
    // ここで失敗してもユーザーには「登録失敗」として返し、整合性は管理者運用で吸収する。
    console.error(
      '[domains] DB insert failed after Resend create:',
      insertError,
      'orphaned resend_domain_id:',
      created.data.resendDomainId,
    );
    return NextResponse.json(
      { error: 'DBへの保存に失敗しました（管理者にお問い合わせください）' },
      { status: 500 },
    );
  }

  return NextResponse.json({ domain: inserted }, { status: 201 });
}
