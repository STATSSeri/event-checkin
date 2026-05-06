import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyDomainOwnership } from '@/lib/auth';
import { removeResendDomain } from '@/lib/resend-domains';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/domains/[id]
 * Resend と Supabase の両方からドメインを削除する。
 * Resend 側削除に失敗しても DB は削除する（孤立は管理者運用で吸収）。
 */
export async function DELETE(
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

  // Resend から削除（失敗してもログに残して DB 削除を継続）
  const removed = await removeResendDomain(auth.resendDomainId);
  if (!removed.ok) {
    console.error(
      '[domains] Failed to remove from Resend (continuing with DB delete):',
      removed.error,
      'resend_domain_id:',
      auth.resendDomainId,
    );
  }

  // DB から削除
  const supabase = createServiceClient();
  const { error: deleteError } = await supabase
    .from('sender_domains')
    .delete()
    .eq('id', params.id);

  if (deleteError) {
    return NextResponse.json(
      { error: `DBからの削除に失敗しました: ${deleteError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    deleted: true,
    resendCleanup: removed.ok,
  });
}
