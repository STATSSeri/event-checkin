# Lessons Learned（同じミスを繰り返さないためのルール）

## 2026-05-17: Stripe決済導入で得た教訓

### L-001: PRマージ前にVercel CIの ✅ を必ず確認する
**起きたこと**: PR #7 をVercelビルド完了前にマージ → main が壊れた状態に。
**ルール**: 
- PR画面の「Checks」欄でVercelが ✅ になるまで待ってからマージする
- 推奨: GitHub設定「**Require status checks to pass before merging**」を有効化
- 緊急時の止血: 別ブランチでfix → 新PR → マージ

### L-002: Stripeの「Product ID」と「Price ID」を絶対混同しない
**起きたこと**: `STRIPE_PRICE_STARTER` に `prod_xxx`（Product ID）を入れてCheckout失敗。
**ルール**: 
- Stripeで「料金」を扱うAPIに渡すのは必ず `price_xxxxx`（`price_`から始まる方）
- `prod_xxxxx` は商品本体IDで、Checkout では使わない
- 取得経路: 商品カタログ → 商品クリック → 「料金」セクション → 行右の「API ID」をコピー

### L-003: フロント側で参照する URL 系の環境変数は Production にも必ず設定
**起きたこと**: `NEXT_PUBLIC_SITE_URL` がProduction未設定で、Stripe Checkout 完了後の戻り先が `localhost:3000` になった。
**ルール**: 
- `NEXT_PUBLIC_*` の URL 系変数は **Production / Preview / Development の3環境すべて** に設定する
- 値の末尾スラッシュなし、プロトコル（`https://`）含める
- セットアップガイドのチェックリストに必ず含める

### L-004: ESLintの `no-unused-vars` は import type にも適用される
**起きたこと**: `import type { Subscription, SubscriptionStatus } from '@/types';` で型定義内に名前だけ書いた `SubscriptionStatus` が「未使用」判定されビルド失敗。
**ルール**:
- import した型は実コードで参照していること（型定義内の文字列リテラル `'trialing'` などはカウントされない）
- ローカルで `npm run build` 通すか、せめてVercel CI待つ

### L-005: Build時にエラーで落ちるモジュールは lazy 初期化で回避
**起きたこと**: `new Resend(process.env.RESEND_API_KEY)` がモジュール読み込み時評価で、env未設定のローカルビルドが落ちる既存バグを発見。
**ルール**:
- 外部SDKを env var で初期化する場合は、**lazy 初期化**（呼び出し時に初めて `new` する）を採用
- もしくは fallback ダミー値を許容（例: `process.env.X ?? 'dummy_for_build'`）
- 参考実装: `src/lib/stripe.ts`, `src/lib/resend-domains.ts`, `src/lib/billing-emails.ts`

### L-006: Stripe Webhookエンドポイントは「本番ドメイン1個」だけで運用する方が楽
**起きたこと**: Preview用Webhookを毎回作るのが面倒。Vercel本番URLにWebhookを登録すれば再登録不要と気付いた。
**ルール**:
- 本番ドメインに Webhook を1個登録（テストモード）
- 環境変数は3環境全てに同じテストキー
- Preview/開発時もこの本番Webhookに飛ぶ
- 本番モード切替時（Sprint G）は別途Live mode Webhookを登録

### L-007: 既存ユーザーがいる状態での破壊的変更は「暫定処理」を入れる
**起きたこと**: dashboard/layout.tsx を追加すると既存ユーザー（subscriptionsレコードなし）が全員プラン選択画面に強制リダイレクトされる問題を事前にキャッチ。
**ルール**:
- 既存ユーザーがいる状態でガード/フィルタを追加するときは「`no_subscription` 等の特殊状態は素通り」する暫定処理を必ず入れる
- 暫定処理にはコメントで「Sprint X-Y 完了後に削除」を明記
- マイグレーション SQL（既存ユーザーに状態付与）と連動して削除する
