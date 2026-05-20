# S/PASS Meta広告 入稿キット

> 作成日: 2026-05-16 / 想定: Meta広告マネージャ（Facebook/Instagram）
> 関連ドキュメント: [marketing-plan.md](marketing-plan.md)（戦略全体）

---

## 0. 入稿前チェックリスト

| # | 項目 | 状態 |
|---|------|------|
| 1 | Meta Business Manager アカウント有効 | ☐ |
| 2 | Meta Pixel ID 取得済み | ☐ |
| 3 | `NEXT_PUBLIC_META_PIXEL_ID` を Vercel 環境変数（spass.tokyo / spass-lp 両方）に設定 | ☐ |
| 4 | Pixel が PageView を発火していることをイベントマネージャで確認 | ☐ |
| 5 | spass.tokyo 側で signup 完了時に `CompleteRegistration` イベントが発火 | ☐ |
| 6 | LP（lp.spass.tokyo）の料金統一改修がデプロイ済み | ☐ |
| 7 | 広告クリエイティブ画像（Higgsfield生成9枚）のDL＆Canvaでテキスト合成完了 | ☐ |
| 8 | 利用規約・プライバシーポリシーの実体ページ（現状 `#`）を仮でも公開 | ☐ |
| 9 | 広告アカウントの支払い方法（クレカ）設定済み | ☐ |
| 10 | Meta広告審査ガイドライン確認（ブランド名直書きNG、誇大表現NG） | ☐ |

---

## 1. Meta Pixel 設定手順

### Step 1: Pixel ID を取得
1. Business Manager → イベントマネージャ → データソース → ピクセル作成
2. 名前: `S/PASS Pixel`
3. 発行された **Pixel ID（数字16桁）** をコピー

### Step 2: 環境変数を Vercel に設定

両プロジェクトの Project Settings → Environment Variables に追加:

```
NEXT_PUBLIC_META_PIXEL_ID=（取得したID）
```

対象:
- ✅ `event-checkin`（spass.tokyo） — `app/layout.tsx` で全ページに自動挿入。signup完了時に `CompleteRegistration` 発火
- ✅ `S_PASS_LP`（lp.spass.tokyo） — `app/layout.tsx` で全ページに自動挿入。Apply フォーム送信成功時に `Lead` 発火

### Step 3: 発火確認
- Chrome 拡張 [Meta Pixel Helper](https://chrome.google.com/webstore/detail/meta-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc) をインストール
- spass.tokyo を開き、Pixel Helper が `PageView` を検出することを確認
- `/signup` で登録完了時、`CompleteRegistration` イベントが発火することを確認

---

## 2. キャンペーン構成

```
[キャンペーン] S/PASS リード獲得 2026Q2
 ├─ 目的: コンバージョン（CompleteRegistration）
 ├─ 予算: ¥100,000 / 2週間（テスト期）
 └─ 入札戦略: 最低コスト

   ├─ [広告セットA] PR/広告代理店
   │   オーディエンス: 詳細ターゲット ↓
   │   配置: IG Feed + IG Stories
   │   日予算: ¥3,500
   │
   ├─ [広告セットB] ブランド企業PR/宣伝
   │   オーディエンス: 詳細ターゲット ↓
   │   配置: IG Feed + FB Feed
   │   日予算: ¥3,500
   │
   └─ [広告セットC] 類似1%（後段）
       オーディエンス: signup完了者の類似1%（30件以上たまり次第）
       配置: 自動
       日予算: ¥3,500
```

### 広告セットA：PR/広告代理店 ターゲット詳細

| 項目 | 設定 |
|------|------|
| 地域 | 東京都・大阪府・愛知県・福岡県 |
| 年齢 | 27〜45 |
| 性別 | すべて |
| 言語 | 日本語 |
| 詳細ターゲット設定（興味・関心） | 広告、広報、イベント企画、ファッション業界、PR、マーケティング、ラグジュアリーブランド |
| 詳細ターゲット設定（行動） | 中小企業の所有者 |
| 役職（職業情報がある場合） | アカウントエグゼクティブ、PRマネージャー、イベントプランナー、マーケティングマネージャー |
| 配置 | Instagramフィード、Instagramストーリーズ |
| デバイス | スマートフォン優先（モバイル90%以上） |

### 広告セットB：ブランド企業PR/宣伝 ターゲット詳細

| 項目 | 設定 |
|------|------|
| 地域 | 東京都・大阪府（メイン） |
| 年齢 | 30〜50 |
| 性別 | すべて |
| 言語 | 日本語 |
| 詳細ターゲット設定（興味・関心） | ファッション、ラグジュアリー、ジュエリー、ビューティー、コスメ、ハイブランド |
| 詳細ターゲット設定（行動） | 高所得世帯、ぜいたく品の購入者 |
| 役職 | PR、広報、マーケティング、ブランドマネージャー、コミュニケーション |
| 配置 | Instagramフィード、Facebookフィード |

---

## 3. クリエイティブ × コピー対応表

### 共通：ランディングページ URL

| 用途 | URL（UTM付き） |
|------|----------------|
| LP経由（標準） | `https://lp.spass.tokyo/?utm_source=meta&utm_medium=cpc&utm_campaign=lead_gen_2026q2&utm_content={creative_id}` |
| signup直結（高CV狙い） | `https://spass.tokyo/signup?plan=starter&utm_source=meta&utm_medium=cpc&utm_campaign=lead_gen_2026q2&utm_content={creative_id}` |

`{creative_id}` は各クリエイティブで差し替え（例: `a1_invitation`, `b1_before_after` 等）。

### 推奨配分

- **広告セットA（代理店）**: LP経由（情報量多めの代理店は LP を読んでから判断したい）
- **広告セットB（ブランド）**: signup直結（決裁早い／無料トライアルで即試したい）

---

### クリエイティブ A1「招待状の格」 — 推奨：広告セットB（ブランド向け）

| 項目 | 内容 |
|------|------|
| 画像 | A1（1:1、Higgsfield job_id: `c0da660e-a39d-4498-854d-a2b31e48dcc3`）にコピーを後乗せ |
| 配置 | IGフィード / FBフィード |
| プライマリテキスト | ブランドの招待状は、ブランドの第一印象です。<br>送信元アドレス、デザイン、当日の受付動線まで—招待状の格を最後まで守る、ブランド招待制イベント専用のRSVP＋QR受付システム。<br><br>14日間無料でお試しいただけます。 |
| 見出し | 招待状の格を、行列で台無しにしない。 |
| 説明 | 月額¥5,000〜 / クレカ登録不要で14日間無料 |
| CTAボタン | 「無料体験」または「詳しくはこちら」 |
| LP/CV先 | LP経由 → `?utm_content=a1_invitation` |

### クリエイティブ A2「招待状の格」9:16 — 推奨：広告セットB（ブランド向け）

| 項目 | 内容 |
|------|------|
| 画像 | A2（9:16、Higgsfield job_id: `11d84d64-153c-4295-9cd0-e829b3d9309d`）。**上部1/3にコピーを後乗せ前提** |
| 配置 | IGストーリーズ / リール |
| 上部コピー（画像内） | 招待状の格を、<br>行列で台無しにしない。 |
| プライマリテキスト | ブランド招待制イベント専用の受付システム。月額¥5,000〜、14日間無料。 |
| CTAボタン | 「無料体験」 |
| LP/CV先 | LP経由 → `?utm_content=a2_invitation_story` |

### クリエイティブ B1「Before / After」 — 推奨：広告セットA（代理店向け）

| 項目 | 内容 |
|------|------|
| 画像 | B1（1:1、Higgsfield job_id: `d647e46b-5f30-4445-a7c4-082d28c7da6f`）にラベル「BEFORE / AFTER」と数字「30秒/人 → 3秒/人」を後乗せ |
| 配置 | IGフィード / IGストーリーズ（縦版があれば差し替え） |
| プライマリテキスト | 紙の名簿で1人30秒。QRで1人3秒。<br>レセプション開始15分で生まれる行列、Excel管理の煩雑さ、当日の人手不足—代理店の現場が抱えるイベント受付の課題を、ブランド世界観を保ったまま解消します。<br><br>14日間無料、月額¥5,000〜。 |
| 見出し | 受付の体感速度、10倍。 |
| 説明 | Peatixより上品。Excelよりラク。 |
| CTAボタン | 「詳しくはこちら」 |
| LP/CV先 | LP経由 → `?utm_content=b1_before_after` |

### クリエイティブ カルーセル C1〜C5 — 推奨：広告セットA・B 両方

| 枚数 | 画像 | コピー |
|------|------|--------|
| 1/5 | C1（扉モチーフ、job_id: `9d0b6f11-2612-4acd-891f-e96a18854e53`） | 見出し: `ブランドの世界観を、招待から受付まで。` 説明: `S/PASS — Event Reception System` |
| 2/5 | D1（New Collection Launch、job_id: `4f02483b-d6d7-495c-a552-3b09b51b10ac`） | 見出し: `新作発表会で、招待者の格に見合う一通を。` |
| 3/5 | D3（Press Day、job_id: `26b09851-5176-4b25-987e-038012b2d217`） | 見出し: `プレスデーの出欠と来場時間を、一望で。` |
| 4/5 | D4（Influencer Dinner、job_id: `27a0a648-b830-4255-859f-374e0a2a0729`） | 見出し: `限られた席を、限られた方へ。` |
| 5/5 | C5（CTA枠、job_id: `163d2b6c-9a40-4c85-9ed2-df11dfa47f31`） | **画像内コピー（Canvaで後乗せ）**: `14 DAYS FREE / START NOW →` |

| 項目 | 内容 |
|------|------|
| プライマリテキスト（カルーセル全体共通） | ラグジュアリーブランドA・グローバルファッションメゾンB のレセプション運営にも採用された、招待制イベント専用のRSVP＋QR受付システム。<br><br>14日間無料、月額¥5,000〜。クレカ登録不要で今すぐ始められます。 |
| 各カードのCTAボタン | 「無料体験」 |
| LP/CV先 | 各カードに別UTM: `?utm_content=carousel_01` ... `carousel_05` |

---

## 4. UTM ヘルパー早見表

| 配信元 | utm_source | utm_medium | utm_campaign | utm_content |
|--------|-----------|------------|--------------|-------------|
| Meta広告 全般 | `meta` | `cpc` | `lead_gen_2026q2` | クリエイティブID（例: `a1_invitation`） |
| Meta オーガニック投稿 | `meta` | `social` | `organic_2026q2` | 投稿ID |
| Google検索広告（将来） | `google` | `cpc` | `branded_2026q2` | キーワード |
| メルマガ | `email` | `newsletter` | `配信日YYYYMMDD` | リンク位置 |

LP経由でも signup 直結でも、上記UTMがアプリ側で `auth.user.user_metadata` に保存されるので、Supabaseで集計可能。

---

## 5. KPI と運用ルール

### 計測KPI

| KPI | 目標値 | 集計方法 |
|-----|--------|---------|
| 表示回数（Impression） | — | Meta広告マネージャ |
| CTR（リンククリック率） | **1.5%以上** | Meta広告マネージャ |
| CPC（クリック単価） | ¥200以下 | Meta広告マネージャ |
| LP→signup遷移率 | **8%以上** | Meta Pixel: PageView → CompleteRegistration |
| CPL（リード単価=CompleteRegistration） | **¥5,000以下** | Meta広告マネージャ（コンバージョン列） |
| 14日後の有償転換率 | 15%以上（中長期） | Supabase集計 |

### 運用判断ルール

| シグナル | アクション |
|---------|-----------|
| CTR < 1.0%（3日連続） | クリエイティブ差し替え（プライマリテキストor見出しの先頭2行を書き換え） |
| CPC > ¥300（3日連続） | 入札戦略変更 or オーディエンス絞り直し |
| LP→signup < 5% | LPのCTA上部の表示・無料訴求文言を見直し |
| CPL > ¥8,000 | 該当広告セット停止、配分を勝ち広告セットへ寄せる |
| 1週間で勝ち広告判明 | 負け広告を停止、予算をWinnerに集中（70%目安） |

### レポート頻度
- 日次: CPL・CPCを朝チェック（5分）
- 週次: 詳細レポート作成（Mikiya/Claude協働で）
- 月次: 学びを次キャンペーンの仮説にフィードバック

---

## 6. 法務・ブランド利用ルール

| 項目 | ルール |
|------|--------|
| クライアント実名 | **使わない**。「ラグジュアリーブランドA」「グローバルファッションメゾンB」等の匿名表記 |
| 競合名 | 名指し批判禁止（Peatix、EventHub等を直接貶めるコピーNG） |
| 効果保証表現 | 「必ず」「絶対」「成功する」等の断定表現NG |
| 価格表記 | 「月額¥5,000〜」「14日間無料」は明示。トライアル終了後課金開始の旨も明記 |
| 個人情報 | 画像内に人物が写る場合はAI生成で識別不能なシルエットに限定（既存画像はすべて準拠済み） |

---

## 7. 入稿後7日間の運用カレンダー（テンプレート）

| Day | アクション |
|-----|-----------|
| Day 1 | 配信開始、Pixel発火確認、初期24時間のCTR/CPCを朝晩2回チェック |
| Day 2 | 表示が伸びていない場合は予算を10%増額。CTR悪い場合はクリエイティブ温存判断 |
| Day 3 | クリエイティブ別CTR比較。下位2つを停止候補に |
| Day 4 | 下位停止、上位の予算配分を増やす |
| Day 5 | 初CV発生の有無確認。CV0なら LP→signup フォーム導線を疑う |
| Day 6 | 中間レポート作成、Mikiyaレビュー |
| Day 7 | 翌週の予算配分・新クリエイティブ案を決定 |

---

## 8. 画像素材ダウンロード一覧（Higgsfield生成）

| ID | 用途 | URL |
|----|------|-----|
| A1 | 招待状の格 1:1 | https://d8j0ntlcm91z4.cloudfront.net/user_313RpD6dlueeQzjbaME1xBcHtAn/hf_20260516_064858_c0da660e-a39d-4498-854d-a2b31e48dcc3.png |
| A2 | 招待状の格 9:16 | https://d8j0ntlcm91z4.cloudfront.net/user_313RpD6dlueeQzjbaME1xBcHtAn/hf_20260516_065246_11d84d64-153c-4295-9cd0-e829b3d9309d.png |
| B1 | Before/After 1:1 | https://d8j0ntlcm91z4.cloudfront.net/user_313RpD6dlueeQzjbaME1xBcHtAn/hf_20260516_065252_d647e46b-5f30-4445-a7c4-082d28c7da6f.png |
| C1 | 扉モチーフ 1:1 | https://d8j0ntlcm91z4.cloudfront.net/user_313RpD6dlueeQzjbaME1xBcHtAn/hf_20260516_065257_9d0b6f11-2612-4acd-891f-e96a18854e53.png |
| C5 | CTA枠 1:1 | https://d8j0ntlcm91z4.cloudfront.net/user_313RpD6dlueeQzjbaME1xBcHtAn/hf_20260516_065302_163d2b6c-9a40-4c85-9ed2-df11dfa47f31.png |
| D1 | New Collection Launch | https://d8j0ntlcm91z4.cloudfront.net/user_313RpD6dlueeQzjbaME1xBcHtAn/hf_20260516_065750_4f02483b-d6d7-495c-a552-3b09b51b10ac.png |
| D2 | Pop-up Reception | https://d8j0ntlcm91z4.cloudfront.net/user_313RpD6dlueeQzjbaME1xBcHtAn/hf_20260516_065755_152ef5fc-e2c6-4ef3-afe1-40ce16eefe61.png |
| D3 | Press Day | https://d8j0ntlcm91z4.cloudfront.net/user_313RpD6dlueeQzjbaME1xBcHtAn/hf_20260516_065801_26b09851-5176-4b25-987e-038012b2d217.png |
| D4 | Influencer Dinner | https://d8j0ntlcm91z4.cloudfront.net/user_313RpD6dlueeQzjbaME1xBcHtAn/hf_20260516_065805_27a0a648-b830-4255-859f-374e0a2a0729.png |

---

## 9. 次のアクション（Mikiya想定タスク）

1. **Pixel ID 取得＆Vercel環境変数設定**（推定30分）
2. **Higgsfield画像9枚をローカルにDL**（推定10分）
3. **Canvaで広告クリエイティブにコピー後乗せ**（推定2〜3時間）
   - A1/A2/B1/C1〜C5/カルーセル4枚 = 計10〜12デザイン
4. **Meta広告マネージャでキャンペーン作成**（推定1〜2時間、本ドキュメントの§2〜3を参照）
5. **配信開始 → Day1-7運用カレンダーに従って運用**

---

## 10. 不明点／決め切れていないこと

- 利用規約・プライバシーポリシーの実体ページ — 現状 `#` リンクのまま。Meta広告審査で弾かれる可能性あり、要事前準備
- Stripe決済の signup後接続 — 14日間トライアル終了後の課金フロー。今は無くてもトライアル取得まではOKだが、有償転換率を追うなら必須
- 14日間トライアルの実装ロジック — 現状 signup 後すぐ dashboard に入る挙動のため、トライアル期間の管理（DBに `trial_ends_at` 等）が未実装。リーガル文言だけ広告に出して実装なし、は信頼性的にNGなので早めに着手推奨
