import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyDomainOwnership } from '@/lib/auth';
import { getResendDomain } from '@/lib/resend-domains';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/domains/[id]/refresh
 * Resend から最新の状態（status, dns_records）を取得して DB を更新する。
 * 検証は行わず、純粋に表示用の情報を最新化する用途。
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
  const rateLimit = await checkRateLimit('api', rateLimitId);
  if (!rateLimit.success) return rateLimitExceededResponse(rateLimit);

  const fresh = await getResendDomain(auth.resendDomainId);
  if (!fresh.ok) {
    console.error('[domains/refresh] Resend get failed:', fresh.error);
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
    console.error('[domains/refresh] DB update failed:', error);
    return NextResponse.json(
      { error: `DB更新に失敗しました: ${error?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ domain: data });
}
