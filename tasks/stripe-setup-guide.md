# Stripe アカウント設定手順（Sprint A-1, A-4 用）

このドキュメントは **Mikiya が手動で実施する作業** の手順書です。
Sprint A の DBマイグレーション・コード実装は私が並行で進めます。

---

## 所要時間
- アカウント作成: 10〜15分
- Products/Prices 作成: 5分
- 環境変数設定: 5分
- 合計 **約25分**

---

## ステップ1: Stripe アカウント作成（テストモード）

### 1-1. アカウント登録
1. https://dashboard.stripe.com/register にアクセス
2. メールアドレス（Stats 法人代表メール推奨）/ 氏名 / 国「日本」を入力
3. メール認証を完了

### 1-2. 事業者情報（本番化前に最終確認、今は仮入力でOK）
- 事業形態: 株式会社
- 法人名: Stats株式会社（スタッツ株式会社）
- 業種: ソフトウェア / SaaS
- 事業内容: イベント受付管理SaaS（S/PASS）

> 💡 ここでは **テストモードのまま** で進めればOK。本番モード切替は Sprint G で実施。

### 1-3. テストモード確認
- ダッシュボード右上に「テストモード」のトグルが表示されていることを確認
- URL に `?test=true` が含まれていればテストモード

---

## ステップ2: Products / Prices 作成（2プラン分）

### 2-1. スタータープラン作成
1. 左メニュー「商品カタログ」→ 「+ 商品を追加」
2. 入力:
   - **商品名**: `S/PASS スタータープラン`
   - **説明**: `月2件までのイベント運用に対応。個人主催・小規模向け。`
   - **画像**: 不要
3. 料金設定:
   - **モデル**: 定期支払い（Recurring）
   - **金額**: `5000` JPY
   - **請求期間**: 月次
   - **料金体系**: 標準価格
4. 「商品を保存」
5. 作成後の **Price ID（`price_xxxx`）をコピー** → 後で環境変数に使用

### 2-2. プロプラン作成
同様に:
- **商品名**: `S/PASS プロプラン`
- **説明**: `月30件までのイベント運用に対応。中規模主催者向け。`
- **金額**: `29800` JPY、月次
- 作成後の **Price ID（`price_xxxx`）をコピー**

---

## ステップ3: API キー取得

### 3-1. 開発者キー取得
1. 左メニュー「開発者」→「APIキー」
2. テストモードであることを再確認
3. 以下2つをコピー:
   - **公開可能キー**: `pk_test_xxxx`
   - **シークレットキー**: `sk_test_xxxx`（「表示」ボタンで露出）
   - ⚠️ シークレットキーは漏洩厳禁。Slack/メール送信NG

---

## ステップ4: Webhook エンドポイント登録（Sprint C で使うが先に登録）

> ⚠️ 注意: ローカル開発時は `stripe listen` CLI で OK。
> 以下は **Vercel Preview/本番 URL が確定してから** 登録する。
> Sprint C 着手時に Claude から URL を指定するので、その時点で実施でも可。

### 4-1. Webhook 登録
1. 左メニュー「開発者」→「Webhook」→ 「エンドポイントを追加」
2. エンドポイント URL: `https://<your-vercel-domain>/api/webhooks/stripe`
3. リッスンするイベント（以下7つ）:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `checkout.session.completed`
4. 「エンドポイントを追加」
5. 作成後の **署名シークレット（`whsec_xxxx`）をコピー**

---

## ステップ5: 環境変数を Vercel に設定

### 5-1. Vercel ダッシュボードに設定
プロジェクト → Settings → Environment Variables で以下5つを追加:

| 変数名 | 値の例 | 環境 |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_xxxx` | Development, Preview |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_xxxx` | Development, Preview |
| `STRIPE_PRICE_STARTER` | `price_xxxx`（2-1で取得） | Development, Preview |
| `STRIPE_PRICE_PRO` | `price_xxxx`（2-2で取得） | Development, Preview |
| `STRIPE_WEBHOOK_SECRET` | `whsec_xxxx`（4-1で取得） | Development, Preview |

> 💡 まず Development と Preview のみに設定。Production は Sprint G で本番モードキーを別途設定する。

### 5-2. ローカル開発用 `.env.local` にも追加
プロジェクトルートの `.env.local` に同じ5変数を追加:
```bash
STRIPE_SECRET_KEY=sk_test_xxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxx
STRIPE_PRICE_STARTER=price_xxxx
STRIPE_PRICE_PRO=price_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## ステップ6: DBマイグレーション実行

1. Supabase ダッシュボード → SQL Editor
2. `tasks/migrations/002_subscriptions.sql` の全文をコピペ
3. 「RUN」実行
4. Table Editor で `subscriptions` テーブルが作成されていることを確認

---

## 完了報告

すべて完了したら、Claude に以下を共有してください:
- [x] Stripe アカウント作成完了
- [x] スタータープラン Price ID: `price_xxxx`
- [x] プロプラン Price ID: `price_xxxx`
- [x] Vercel 環境変数設定完了
- [x] `.env.local` 設定完了
- [x] `subscriptions` テーブル作成完了

→ これで Sprint B（Checkoutフロー実装）に進めます。
