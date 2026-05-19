-- =============================================================================
-- Migration 003: パスワード履歴 + セキュリティメタデータ
-- =============================================================================
--
-- 目的:
--   IS10 外部プラットフォームチェックシート #19 のセキュリティ要件に対応する。
--    - 過去 10 回分のパスワード再利用禁止 (password_history)
--    - パスワード最低有効期間 1 日 (user_security_meta.password_changed_at)
--    - パスワード最大有効期間ポリシー（MFA 有 365 日 / MFA 無 90 日）
--      → コード側で password_changed_at と auth.users の aal を併用して判定
--
-- 実行手順:
--   1. Supabase ダッシュボード → SQL Editor を開く
--   2. このファイル全体をコピペして実行
--   3. 「Success. No rows returned」が出れば完了
--   4. Table Editor で `password_history` と `user_security_meta` が
--      作成されているか確認
--
-- ロールバック手順（緊急時）:
--   DROP TABLE IF EXISTS public.password_history;
--   DROP TABLE IF EXISTS public.user_security_meta;
-- =============================================================================

-- ① パスワード履歴テーブル
--   過去のパスワード（scrypt ハッシュ）を保持する。
--   サーバ側 (src/app/api/auth/change-password/route.ts) からのみ書き込み。
CREATE TABLE IF NOT EXISTS public.password_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- scrypt 形式の文字列: "scrypt$<saltHex>$<hashHex>"
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user_created
  ON public.password_history (user_id, created_at DESC);

-- RLS: 一般ユーザーからは一切アクセス不可（service_role のみが読み書きする）
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;
-- ポリシー定義なし = 一般ロールからの SELECT/INSERT/UPDATE/DELETE は全て拒否される


-- ② ユーザーセキュリティメタデータ
--   - password_changed_at : 直近のパスワード変更時刻（最低有効期間 1 日のチェック用）
--   - last_login_at       : 最終ログイン時刻（前回ログイン日時表示の素材）
CREATE TABLE IF NOT EXISTS public.user_security_meta (
  user_id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at        TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: 自分のレコードのみ SELECT 可能（書き込みはサーバ側 service_role 経由）
ALTER TABLE public.user_security_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_security_meta_select"
  ON public.user_security_meta;

CREATE POLICY "own_security_meta_select"
  ON public.user_security_meta
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());


-- ③ updated_at 自動更新トリガー（user_security_meta 用）
CREATE OR REPLACE FUNCTION public.tg_user_security_meta_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_user_security_meta_updated_at
  ON public.user_security_meta;

CREATE TRIGGER trg_user_security_meta_updated_at
  BEFORE UPDATE ON public.user_security_meta
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_user_security_meta_set_updated_at();
