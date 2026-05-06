import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyDomainOwnership } from '@/lib/auth';
import { verifyResendDomain, getResendDomain } from '@/lib/resend-domains';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/domains/[id]/verify
 * Resend に検証を依頼し、最新の状態を取得して DB に反映する。
 * 検証通過すると status='verified' + verified_at が入る。
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await verifyDomainOwnership(params.id);
  if (!auth) {
    return NextResponse.json(
      { error: 'このドメインを操作する権限がありません' },
      { status: 403 },
    );
  }

  const rateLimitId = getRateLimitIdentifier(request, auth.userId);
  const rateLimit = await checkRateLimit('domain', rateLimitId);
  if (!rateLimit.success) return rateLimitExceededResponse(rateLimit);

  // Resend に検証依頼
  const verifyResult = await verifyResendDomain(auth.resendDomainId);
  if (!verifyResult.ok) {
    return NextResponse.json(
      { error: `検証依頼に失敗しました: ${verifyResult.error}` },
      { status: verifyResult.statusCode ?? 502 },
    );
  }

  // 最新状態を改めて取得（dns_records も最新化）
  const fresh = await getResendDomain(auth.resendDomainId);
  if (!fresh.ok) {
    return NextResponse.json(
      { error: `状態取得に失敗しました: ${fresh.error}` },
      { status: fresh.statusCode ?? 502 },
    );
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: fresh.data.status,
    dns_records: fresh.data.records,
    last_checked_at: now,
  };
  if (fresh.data.status === 'verified') {
    updates.verified_at = now;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('sender_domains')
    .update(updates)
    .eq('id', params.id)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `DB更新に失敗しました: ${error?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ domain: data });
}
