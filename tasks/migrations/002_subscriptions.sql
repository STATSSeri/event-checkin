-- =============================================================================
-- Migration 002: subscriptions テーブル追加（Stripe決済導入）
-- =============================================================================
--
-- 目的:
--   ユーザー単位の Stripe サブスクリプション状態を保持する。
--   Stripe Webhook を Single Source of Truth として常時同期する。
--
-- 実行手順:
--   1. Supabase ダッシュボード → SQL Editor を開く
--   2. このファイル全体をコピペして実行
--   3. 「Success. No rows returned」が出れば完了
--   4. Table Editor で `subscriptions` テーブルが作成されているか確認
--
-- ロールバック手順（緊急時）:
--   DROP TABLE IF EXISTS public.subscriptions;
-- =============================================================================

-- ① テーブル本体
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  -- Stripe Customer ID（cus_xxx）。Checkout 初回作成時に発行。
  stripe_customer_id       TEXT        UNIQUE,
  -- Stripe Subscription ID（sub_xxx）。トライアル開始時に発行。
  stripe_subscription_id   TEXT        UNIQUE,
  -- ステータス（Stripe 準拠 + 独自の trialing_no_card）
  --   trialing_no_card : カード未登録のトライアル中（既存ユーザー用）
  --   trialing         : Stripe 上でトライアル中（カード登録済み）
  --   active           : 正常課金中
  --   past_due         : 課金失敗（再試行中）
  --   canceled         : 解約済み
  --   incomplete       : 初回決済未完了
  --   unpaid           : 課金失敗継続
  status                   TEXT        NOT NULL DEFAULT 'trialing_no_card'
                           CHECK (status IN ('trialing_no_card','trialing','active','past_due','canceled','incomplete','unpaid')),
  -- プラン識別子。Stripe Price ID とは別の内部キー（'starter' | 'pro' | NULL）
  plan                     TEXT
                           CHECK (plan IS NULL OR plan IN ('starter','pro')),
  -- トライアル終了日時（Stripe 同期 or 既存ユーザー付与時に設定）
  trial_end                TIMESTAMPTZ,
  -- 現在の課金期間終了日時（次回請求日）
  current_period_end       TIMESTAMPTZ,
  -- 期間末解約予約フラグ
  cancel_at_period_end     BOOLEAN     NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ② 検索用インデックス
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx
  ON public.subscriptions (status);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_idx
  ON public.subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx
  ON public.subscriptions (stripe_subscription_id);

-- ③ updated_at 自動更新トリガー
--    （001_sender_domains.sql で public.set_updated_at() を作成済みのため再利用）
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ④ Row Level Security 有効化
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- ⑤ RLS ポリシー: 自分のサブスクのみ閲覧可（書き込みは Service Role からのみ）
DROP POLICY IF EXISTS "Users can read their own subscription" ON public.subscriptions;
CREATE POLICY "Users can read their own subscription"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE は Service Role（API ルート）のみ。
-- ユーザー側からの直接書き込みは禁止し、Stripe Webhook を Single Source of Truth とする。
-- → ポリシーを作成しないことで auth.uid() ベースの書き込みを遮断。

-- =============================================================================
-- 既存ユーザーへの 14日トライアル付与（Sprint F-1 で実行予定。今は実行しない）
-- =============================================================================
-- 以下は Sprint F-1 のタイミングで実行する。Sprint A では「テーブル作成のみ」。
--
-- INSERT INTO public.subscriptions (user_id, status, trial_end)
-- SELECT id, 'trialing_no_card', NOW() + INTERVAL '14 days'
-- FROM auth.users
-- WHERE id NOT IN (SELECT user_id FROM public.subscriptions);

-- =============================================================================
-- 確認クエリ（実行後に動作確認用）
-- =============================================================================
-- SELECT * FROM public.subscriptions;  -- 空のテーブルが返るはず
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'subscriptions';
