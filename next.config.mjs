/** @type {import('next').NextConfig} */

/**
 * セキュリティヘッダー設定
 *
 * 大手企業のIT部門のセキュリティ要件をクリアするための基本ヘッダー一式。
 * CSP は誤って既存機能を壊さないよう、一旦は緩めの設定で開始し、
 * 動作確認しながら段階的に締めていく方針。
 */
const securityHeaders = [
  // HTTPS 強制（HTTP Strict Transport Security）
  // Vercel ですでに HTTPS なので 2 年 + サブドメイン + preload を有効化
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // MIME スニッフィング防止
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  // クリックジャッキング防止（iframe 埋め込み禁止）
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  // Referrer 情報を最小化
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // 不要なブラウザ機能を無効化（カメラは /scan で必要なので self は許可）
  {
    key: 'Permissions-Policy',
    value:
      'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()',
  },
  // 旧 IE 系の XSS フィルタ（modern ブラウザでは無視されるが念のため）
  {
    key: 'X-XSS-Protection',
    value: '0',
  },
  // CSP は最小限から始める
  // - default-src 'self' で同一オリジンのみ
  // - 'unsafe-inline'/'unsafe-eval' は Next.js dev/inline script のため当面許可
  //   （本格的に締める場合は nonce 方式に移行）
  // - Supabase / Resend へのアクセスを許可
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig = {
  async headers() {
    return [
      {
        // 全ルート対象
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
