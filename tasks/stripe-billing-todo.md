# Stripe決済導入 実装計画

## ゴール
14日間無料トライアル → 月額自動課金 のサブスクリプション基盤を導入する。
カード登録必須、2プラン（スターター / プロ）、上限超過は作成不可。
既存ユーザーも全員「今日から14日トライアル」扱いで開始。

## 最終仕様（確定）

### プラン構成
| プラン | 月額 | 月間イベント上限 | Stripe管理 |
|---|---|---|---|
| **スターター** | 5,000円 | 2件 | ✅ |
| **プロ** | 29,800円 | 30件 | ✅ |
| **エンタープライズ** | 個別見積 | 無制限 | ❌（請求書払い・別管理）|

### トライアル
- 期間: 14日
- カード登録: **必須**（signup直後にStripe Checkoutへ誘導）
- 終了時: **自動課金**（15日目に自動で初回請求）
- トライアル中も全機能利用可能

### 上限超過時
- 月間イベント数を超えた状態で新規イベント作成しようとすると **作成不可**
- 「アップグレードが必要です」モーダル表示 → カスタマーポータルへ

### 既存ユーザー
- 全員に `trial_end = now() + 14 days` を付与（カード未登録状態）
- 初回ログイン時にバナー表示「14日間無料トライアル中。継続利用にはカード登録が必要です」
- 14日経過後、カード未登録ユーザーはダッシュボードロック → Checkoutへ強制誘導

### 適格請求書
- **保留**。Stripe標準の領収書機能のみ。要望が出てから対応。

---

## Sprint A: DB & Stripe初期セットアップ（1日）

- [ ] **A-1**: Stripeアカウント作成（テストモード）
  - スタータープラン Product + Price作成（5,000円/月）
  - プロプラン Product + Price作成（29,800円/月）
  - 取得した Price ID をメモ
- [ ] **A-2**: DBマイグレーション `tasks/migrations/002_subscriptions.sql` 作成
  ```sql
  CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL, -- 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing_no_card'
    plan TEXT, -- 'starter' | 'pro' | null
    trial_end TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  -- RLS: 自分のサブスクのみ閲覧可
  ```
  **Mikiya が Supabase SQL Editor で手動実行**
- [ ] **A-3**: `npm install stripe` + `src/lib/stripe.ts` 作成（SDK初期化、Price ID マップ）
- [ ] **A-4**: 環境変数追加（`.env.local` + Vercel）
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_PRICE_STARTER`
  - `STRIPE_PRICE_PRO`
- [ ] **A-5**: 型定義追加 `types/index.ts` に `Subscription` 型

---

## Sprint B: Checkoutフロー（1〜2日）

- [ ] **B-1**: `POST /api/billing/checkout` API
  - 入力: `plan: 'starter' | 'pro'`
  - Stripe Customer 作成（既存があれば再利用）
  - Checkout Session 作成
    - `mode: 'subscription'`
    - `subscription_data.trial_period_days: 14`
    - `payment_method_collection: 'always'`（カード必須）
    - `success_url: /billing/success?session_id={CHECKOUT_SESSION_ID}`
    - `cancel_url: /billing/cancel`
  - レート制限適用
- [ ] **B-2**: signupページ改修
  - 登録完了後、選択プランのCheckout URLへリダイレクト
  - メール認証必須の場合は、認証完了後にCheckoutへ
- [ ] **B-3**: 結果ページ作成
  - `/billing/success/page.tsx` — Webhookでの状態反映を待つUI
  - `/billing/cancel/page.tsx` — 中断時、プラン選択へ戻す
- [ ] **B-4**: ダッシュボード入口ガード
  - サーバーコンポーネントでサブスク状態チェック
  - 未契約 or `trialing_no_card` で14日経過 → `/billing/select-plan` へ
- [ ] **B-5**: `/billing/select-plan` ページ
  - 2プラン比較表示、選択 → Checkout API へ

---

## Sprint C: Webhook & 状態同期（1日）

- [ ] **C-1**: `POST /api/webhooks/stripe`（署名検証必須）
  - `customer.subscription.created` → `subscriptions` INSERT/UPDATE
  - `customer.subscription.updated` → status, plan, period 更新
  - `customer.subscription.deleted` → status='canceled'
  - `invoice.payment_succeeded` → status='active' に確定
  - `invoice.payment_failed` → status='past_due' + 通知メール
  - `customer.subscription.trial_will_end` (3日前) → リマインドメール
- [ ] **C-2**: Resend経由のメール送信
  - トライアル終了3日前リマインド
  - 課金失敗通知
  - 解約完了通知

---

## Sprint D: アクセス制御 & UIバッジ（1日）

- [ ] **D-1**: サブスク状態取得ヘルパー `src/lib/billing.ts`
  - `getActiveSubscription(userId)` 
  - `canCreateEvent(userId): { allowed, reason?, eventCountThisMonth, limit }`
- [ ] **D-2**: ダッシュボードにステータスバッジ
  - 「トライアル残り◯日」「○○プラン契約中」「次回請求日: ◯月◯日」
  - 解約予約中なら「◯月◯日に解約予定」
- [ ] **D-3**: イベント作成APIに上限チェック
  - スターター: 当月作成数 >= 2 で拒否
  - プロ: 当月作成数 >= 30 で拒否
  - 拒否時は専用エラーコードを返す
- [ ] **D-4**: フロント側のアップグレード導線
  - 拒否レスポンス受信時にアップグレードモーダル表示
  - 「プロプランへアップグレード」→ カスタマーポータルへ

---

## Sprint E: カスタマーポータル（半日）

- [ ] **E-1**: `POST /api/billing/portal` — Stripe Billing Portal セッション作成
- [ ] **E-2**: 設定画面に「請求情報の管理」ボタン追加
  - `/dashboard/settings` 内に配置
  - クリック → Portal セッション作成 → リダイレクト
- [ ] **E-3**: Stripe Dashboard でポータル機能設定
  - プラン変更可（スターター ⇄ プロ）
  - 解約方法（期間末で解約）
  - 領収書ダウンロード有効化
  - カード変更可

---

## Sprint F: 既存ユーザーマイグレーション（半日）

- [ ] **F-1**: 既存全ユーザーに trial 付与 SQL
  ```sql
  INSERT INTO subscriptions (user_id, status, trial_end)
  SELECT id, 'trialing_no_card', NOW() + INTERVAL '14 days'
  FROM auth.users
  WHERE id NOT IN (SELECT user_id FROM subscriptions);
  ```
- [ ] **F-2**: 初回ログイン時バナー
  - 既存ユーザーが初めてログインしたとき表示
  - 「14日間無料トライアル中。継続利用にはカード登録が必要です」+ Checkout導線
- [ ] **F-3**: 14日経過後の強制ロック
  - middleware or サーバーコンポーネントで判定
  - `trialing_no_card` かつ `trial_end < now()` → ダッシュボード閲覧不可
  - 強制的に `/billing/select-plan` へ

---

## Sprint G: 本番切替（半日）

- [ ] **G-1**: Stripe本番モードへ切替
  - 本番Products/Prices作成
  - 本番Price IDを Vercel環境変数に設定
- [ ] **G-2**: Webhook エンドポイント本番URL登録
- [ ] **G-3**: テスト用カード（`4242 4242 4242 4242`）で全フロー再確認
- [ ] **G-4**: 本番カードで1件実テスト（小額確認 → 即時解約）
- [ ] **G-5**: signupページの「Stripe決済導入後は〜」プレースホルダー文言削除

---

## 想定スケジュール
合計 **5〜6営業日** で本番投入可能。

```
Day 1:   Sprint A 全部 → Mikiya に SQL 実行依頼
Day 2-3: Sprint B + C
Day 4:   Sprint D
Day 5:   Sprint E + F
Day 6:   Sprint G（本番切替・実テスト）
```

## 完了基準（各Sprint共通）
1. `npx tsc --noEmit` 通る
2. `npm run build` 通る
3. 既存機能が壊れていない
4. コミット・push
5. Vercel Preview デプロイ確認

## 環境変数追加リスト
- `STRIPE_SECRET_KEY`（テスト用 sk_test_... → 本番用 sk_live_... に切替）
- `STRIPE_WEBHOOK_SECRET`（whsec_...）
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`

## リスク管理
- **本番影響なし** = Sprint A, B, C, E（全て追加のみ、既存DBスキーマ変更なし）
- **本番影響あり** = Sprint D（イベント作成API改修）、Sprint F（既存ユーザー強制ロック）、Sprint G（本番切替）
  → これらは Mikiya 手動テスト必須

## 開始前 確認事項
- [x] プラン構成: スターター（月2件/5,000円）/ プロ（月30件/29,800円）
- [x] 14日経過で自動課金
- [x] 上限超過は作成不可
- [x] 適格請求書は保留
- [ ] **Stripeアカウントは既存？新規作成？**
- [ ] **Sprint A から着手してよいか**
