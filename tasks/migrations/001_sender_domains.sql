-- =============================================================================
-- Migration 001: sender_domains テーブル追加（送信元ドメイン検証フロー）
-- =============================================================================
--
-- 目的:
--   ユーザーが自社ドメインを Resend に登録・検証して、検証済みドメインの
--   任意のローカルパート（例: sunada@goal.dentsu.co.jp）を From に使えるようにする。
--
-- 実行手順:
--   1. Supabase ダッシュボード → SQL Editor を開く
--   2. このファイル全体をコピペして実行
--   3. 「Success. No rows returned」が出れば完了
--   4. Table Editor で `sender_domains` テーブルが作成されているか確認
--
-- ロールバック手順（緊急時）:
--   DROP TABLE IF EXISTS public.sender_domains;
-- =============================================================================

-- ① テーブル本体
CREATE TABLE IF NOT EXISTS public.sender_domains (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ユーザー入力のドメイン（小文字正規化）。例: 'goal.dentsu.co.jp'
  domain            TEXT        NOT NULL,
  -- Resend 側のドメインID（Resend API で発行される）
  resend_domain_id  TEXT        NOT NULL,
  -- pending: 未検証 / verified: 検証済 / failed: 検証失敗 / temporary_failure: 一時失敗 / not_started: 検証未開始
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','verified','failed','temporary_failure','not_started')),
  -- DKIM/SPF 等の DNS レコード（Resend が返す配列をそのまま保存）
  dns_records       JSONB,
  -- 最後に Resend から状態を取得した時刻（クライアント表示用）
  last_checked_at   TIMESTAMPTZ,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 同じユーザーが同じドメインを2重登録できないよう制約
  CONSTRAINT sender_domains_user_domain_unique UNIQUE (user_id, domain)
);

-- ② 検索用インデックス
CREATE INDEX IF NOT EXISTS sender_domains_user_id_idx
  ON public.sender_domains (user_id);
CREATE INDEX IF NOT EXISTS sender_domains_status_idx
  ON public.sender_domains (status);

-- ③ updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sender_domains_set_updated_at ON public.sender_domains;
CREATE TRIGGER sender_domains_set_updated_at
  BEFORE UPDATE ON public.sender_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ④ Row Level Security 有効化
ALTER TABLE public.sender_domains ENABLE ROW LEVEL SECURITY;

-- ⑤ RLS ポリシー: 自分のドメインのみ全操作可能
DROP POLICY IF EXISTS "Users can read their own domains" ON public.sender_domains;
CREATE POLICY "Users can read their own domains"
  ON public.sender_domains
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own domains" ON public.sender_domains;
CREATE POLICY "Users can insert their own domains"
  ON public.sender_domains
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own domains" ON public.sender_domains;
CREATE POLICY "Users can update their own domains"
  ON public.sender_domains
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own domains" ON public.sender_domains;
CREATE POLICY "Users can delete their own domains"
  ON public.sender_domains
  FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- 確認クエリ（実行後に動作確認用）
-- =============================================================================
-- SELECT * FROM public.sender_domains;  -- 空のテーブルが返るはず
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'sender_domains';
