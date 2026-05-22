-- =============================================================================
-- Migration 004: メールOTPによる多要素認証
-- =============================================================================
--
-- 目的:
--   既存の Supabase Auth 標準 TOTP に加えて、メールアドレス宛 6 桁コードによる
--   多要素認証（メールOTP）を導入する。Supabase Auth の factor type は
--   totp / phone のみのため、メールOTPは独自テーブルで管理する。
--
--   ユーザーは設定画面で preferred_mfa_method を 'email' または 'totp' から
--   選択でき、新規ユーザーは 'email' をデフォルトとする想定。
--   既存 TOTP ユーザー（preferred_mfa_method = NULL）は完全に従来挙動を維持。
--
-- 実行手順:
--   1. Supabase ダッシュボード → SQL Editor を開く
--   2. このファイル全体をコピペして実行
--   3. 「Success. No rows returned」が出れば完了
--   4. Table Editor で `email_otp_verifications` が作成されているか確認
--   5. `user_security_meta` に preferred_mfa_method と last_mfa_verified_at の
--      カラムが追加されていることを確認
--
-- ロールバック手順（緊急時）:
--   DROP TABLE IF EXISTS public.email_otp_verifications;
--   ALTER TABLE public.user_security_meta
--     DROP COLUMN IF EXISTS preferred_mfa_method,
--     DROP COLUMN IF EXISTS last_mfa_verified_at;
-- =============================================================================

-- ① メールOTP検証テーブル
--   1ユーザー1アクティブコードの制約を UNIQUE(user_id) で表現。
--   新規コード生成は ON CONFLICT (user_id) DO UPDATE で常に上書き。
--   サーバ側 (service_role) からのみ書き込み・読み込み。
CREATE TABLE IF NOT EXISTS public.email_otp_verifications (
  user_id      UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- scrypt 形式の文字列: "scrypt$<saltHex>$<hashHex>"
  --   生のコードは保管せず、ハッシュのみ。
  code_hash    TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER     NOT NULL DEFAULT 0,
  -- 検証成功した時刻。同一コードの再使用検出に利用（NULL なら未検証）。
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 期限切れ古いレコード一掃用インデックス（運用バッチで利用予定、必須ではない）
CREATE INDEX IF NOT EXISTS idx_email_otp_expires_at
  ON public.email_otp_verifications (expires_at);

-- RLS: クライアントロールからは一切アクセス不可（service_role のみが読み書き）
ALTER TABLE public.email_otp_verifications ENABLE ROW LEVEL SECURITY;
-- ポリシー定義なし = 一般ロールからの SELECT/INSERT/UPDATE/DELETE は全て拒否


-- ② user_security_meta にメールOTP関連カラム追加
--   - preferred_mfa_method : 'email' | 'totp' （NULL = 未設定 = レガシー扱い）
--                            レガシーは AAL ベースの従来挙動で判定するため
--                            NULL の場合は TOTP 相当として middleware が処理する
--   - last_mfa_verified_at : メールOTP検証成功時刻（middleware の通過判定に使用）
ALTER TABLE public.user_security_meta
  ADD COLUMN IF NOT EXISTS preferred_mfa_method TEXT
    CHECK (preferred_mfa_method IN ('email', 'totp')),
  ADD COLUMN IF NOT EXISTS last_mfa_verified_at TIMESTAMPTZ;

-- ③ 既存ユーザーのデータ移行は不要
--   - 既存 TOTP ユーザー: preferred_mfa_method は NULL のまま → AAL2 判定で従来挙動
--   - 既存 MFA 未設定ユーザー: preferred_mfa_method は NULL のまま → MFA 無効状態継続
--   ユーザーが設定画面で明示的に方式を選択した時点で preferred_mfa_method が
--   セットされる。
