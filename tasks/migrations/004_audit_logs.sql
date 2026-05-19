-- =============================================================================
-- Migration 004: 監査ログテーブル
-- =============================================================================
--
-- 目的:
--   IS10 外部プラットフォームチェックシート #22 のセキュリティ要件
--   「ユーザーまたは管理者でのログ確認機能の有無」に対応する。
--
--   ユーザー自身が自分のアカウントに関する操作履歴
--   （ログイン、パスワード変更、MFA有効化等）を確認できるようにする。
--
-- 実行手順:
--   1. Supabase ダッシュボード → SQL Editor を開く
--   2. このファイル全体をコピペして実行
--   3. 「Success. No rows returned」が出れば完了
--   4. Table Editor で `audit_logs` テーブルが作成されていることを確認
--
-- ロールバック手順（緊急時）:
--   DROP TABLE IF EXISTS public.audit_logs;
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 操作種別: 'login' / 'password_change' / 'mfa_enroll' / 'mfa_unenroll' / 'email_change' 等
  action      TEXT        NOT NULL,
  -- 操作元 IP アドレス（X-Forwarded-For ヘッダから取得）
  ip_address  TEXT,
  -- 操作元 User-Agent（最大 512 文字に切り詰めて保存）
  user_agent  TEXT,
  -- 追加情報（factor_id, friendly_name 等を JSON で保管）
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ユーザーごとの時系列クエリ高速化
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON public.audit_logs (user_id, created_at DESC);

-- RLS: 自分のレコードのみ SELECT 可能
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_audit_logs_select"
  ON public.audit_logs;

CREATE POLICY "own_audit_logs_select"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE は service_role のみ（サーバ側 API 経由）
-- 一般ロールには CREATE POLICY を作らないことで黙示的に拒否される
