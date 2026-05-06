/**
 * レート制限ユーティリティ（Upstash Redis ベース）
 *
 * 設計方針：
 * - Upstash の環境変数（UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）が
 *   設定されていれば有効化、未設定ならスキップ（常に許可）
 * - これにより、Upstash 連携前でも本番デプロイ可能
 * - 連携後は自動で有効化される（再デプロイ不要）
 *
 * 想定使用箇所：
 * - 認証系API（signup / login）→ ブルートフォース対策
 * - メール送信系API（send-invitation / reminder / qr / day-before）→ 濫用対策
 * - ドメイン登録/検証API → Resend API レート保護
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Upstash 環境変数の存在確認
const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN,
);

// シングルトンの Redis クライアント
const redis = hasUpstash
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

/**
 * 用途別のレート制限定義
 * - prefix で Redis キーを分離
 * - sliding window で公平に制限
 */
function createLimiter(prefix: string, requests: number, windowSec: number) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    prefix: `ratelimit:${prefix}`,
    limiter: Ratelimit.slidingWindow(requests, `${windowSec} s`),
    analytics: true,
  });
}

// 認証系：厳しめ（5回 / 60秒）
const authLimiter = createLimiter('auth', 5, 60);
// メール送信系：1分あたり最大 30 通分のリクエスト
const emailLimiter = createLimiter('email', 30, 60);
// 一般API：1分あたり 60 リクエスト
const apiLimiter = createLimiter('api', 60, 60);
// ドメイン操作：1時間あたり 20 リクエスト（Resend API 保護）
const domainLimiter = createLimiter('domain', 20, 60 * 60);

export type LimiterKind = 'auth' | 'email' | 'api' | 'domain';

const LIMITERS: Record<LimiterKind, Ratelimit | null> = {
  auth: authLimiter,
  email: emailLimiter,
  api: apiLimiter,
  domain: domainLimiter,
};

/**
 * 識別子（IPアドレスまたはユーザーID）に基づいて制限チェック
 * @returns { success: true } で許可、{ success: false, ...info } で拒否
 *          Upstash 未設定時は常に { success: true, skipped: true }
 */
export async function checkRateLimit(
  kind: LimiterKind,
  identifier: string,
): Promise<{
  success: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
  skipped?: boolean;
}> {
  const limiter = LIMITERS[kind];
  if (!limiter) {
    return { success: true, skipped: true };
  }

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (err) {
    // Upstash 障害時は本来の機能を止めない方針（fail open）
    // ログだけ残して通す
    console.error('[rate-limit] limiter error, failing open:', err);
    return { success: true, skipped: true };
  }
}

/**
 * リクエストから識別子を抽出するヘルパー
 * 認証済みユーザーがいれば user.id を優先、なければ IP
 */
export function getRateLimitIdentifier(
  req: Request,
  userId?: string | null,
): string {
  if (userId) return `user:${userId}`;

  // Vercel が付ける X-Forwarded-For を信頼
  // (Vercel 上では X-Forwarded-For は信頼できる前提)
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0]?.trim();
    if (ip) return `ip:${ip}`;
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return `ip:${realIp}`;

  return 'ip:unknown';
}

/**
 * レート制限超過時に返す標準レスポンス
 */
export function rateLimitExceededResponse(info: {
  limit?: number;
  remaining?: number;
  reset?: number;
}): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (info.limit !== undefined) {
    headers['X-RateLimit-Limit'] = String(info.limit);
  }
  if (info.remaining !== undefined) {
    headers['X-RateLimit-Remaining'] = String(info.remaining);
  }
  if (info.reset !== undefined) {
    headers['X-RateLimit-Reset'] = String(info.reset);
    const retryAfterSec = Math.max(
      1,
      Math.ceil((info.reset - Date.now()) / 1000),
    );
    headers['Retry-After'] = String(retryAfterSec);
  }

  return new Response(
    JSON.stringify({
      error:
        'リクエストが多すぎます。しばらく時間をおいてから再度お試しください。',
    }),
    {
      status: 429,
      headers,
    },
  );
}

/**
 * Upstash 連携状態を返す（運用・デバッグ用）
 */
export function isRateLimitEnabled(): boolean {
  return hasUpstash;
}
