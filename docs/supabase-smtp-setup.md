# Supabase Auth SMTP 設定（Resend 経由）

Supabase Auth のメール送信を、組み込みサービスから **Resend (SMTP)** に切替える手順。

最終更新：2026-05-19

---

## 切替の理由

Supabase 組み込みメール送信の問題点：

| 問題 | 影響 |
|---|---|
| レート制限が厳しい（無料 30通/h、Pro 100通/h） | 商用利用で送信エラーが発生 |
| 送信元が `noreply@mail.app.supabase.io` | スパム判定されやすい、ブランド不一致 |
| SPF/DKIM/DMARC が当社ドメインで認証されない | エンタープライズのメールフィルタで弾かれる |

Resend SMTP に切り替えると：

| メリット |
|---|
| ✅ 送信元が `noreply@spass.tokyo`（既に Resend 検証済みドメイン） |
| ✅ Resend のレート制限（無料でも 100通/日、Pro なら 50,000通/月）に従う |
| ✅ SPF/DKIM/DMARC が当社ドメインで認証 |
| ✅ Resend ダッシュボードで配信ログを一元監視 |

---

## セットアップ手順

### ステップ1：Resend ダッシュボードで専用 API キーを発行

既存の `RESEND_API_KEY`（招待メール送信に使用中）を流用せず、**Supabase Auth 専用の新しいキー** を発行することを推奨。漏洩時の影響範囲を限定するため。

1. [Resend Dashboard](https://resend.com/api-keys) を開く
2. **Create API Key** をクリック
3. 以下のとおり入力：
   - **Name**: `Supabase Auth SMTP`
   - **Permission**: **Sending access** を選択（管理権限不要）
   - **Domain**: `spass.tokyo`（Specific Domain）または All Domains
4. **Add** をクリック
5. **発行された API キー（`re_xxxxx`）をコピーしておく** — 一度しか表示されません

### ステップ2：Supabase で SMTP 設定

1. [Supabase Dashboard](https://supabase.com/dashboard/project/afrclbogxbhvtzgymjjw/auth/templates) →
   **Authentication** → **Emails** → **SMTP Settings** タブ
2. 上部の **Set up custom SMTP** トグルを ON
3. 以下のフィールドを入力：

| 項目 | 値 |
|---|---|
| **Sender email** | `noreply@spass.tokyo` |
| **Sender name** | `S/PASS` |
| **Host** | `smtp.resend.com` |
| **Port number** | `465` |
| **Minimum interval between emails** | `1`（秒。デフォルト推奨） |
| **Username** | `resend` |
| **Password** | （ステップ1で発行した `re_xxxxx` を貼り付け） |

4. **Save changes** をクリック

> Port は `465`（SSL）または `587`（STARTTLS）どちらでも可。`465` の方が一般的。

### ステップ3：動作確認

#### テスト1：認証メール
1. シークレットモード等で `https://spass.tokyo/signup?plan=starter` にアクセス
2. テスト用メアドで新規登録
3. 受信した認証メールを確認：
   - 送信元が **`S/PASS <noreply@spass.tokyo>`** になっているか
   - 件名と本文が S/PASS のブランドデザインで表示されているか（テンプレ適用後）

#### テスト2：Resend ダッシュボード確認
[Resend Dashboard → Emails](https://resend.com/emails) で当該メールがログされていることを確認

#### テスト3：他テンプレートも順次確認（任意）
- パスワード再設定メール
- メールアドレス変更確認メール

### ステップ4：Webhook 設定の確認（任意）

既存の `/api/webhooks/resend` ルートは「招待メール等のトランザクションメール」用の Webhook を受けている。
Supabase Auth 経由のメールは別途 Webhook を発行するわけではないため、追加設定は不要。

---

## トラブルシューティング

### メールが届かない

1. **Resend ダッシュボード → Emails** でエラーログを確認
2. SPF/DKIM レコードが DNS に正しく設定されているか確認（Resend ダッシュボードの Domains セクション）
3. Supabase Dashboard → **Logs** → **Auth** でエラーを確認

### "Invalid credentials" エラー

- API キーの先頭 3 文字が `re_` で始まっているか
- ステップ1の Permission が "Sending access"（または All）であるか

### 送信元が反映されない

- Sender email の `noreply@spass.tokyo` が Resend で検証済みドメインのアドレスであるか
- Resend ダッシュボード → Domains で `spass.tokyo` が verified 状態であるか

---

## ロールバック手順（緊急時）

Supabase 組み込みに戻したい場合：

1. Supabase Dashboard → Authentication → Emails → SMTP Settings
2. **Set up custom SMTP** トグルを OFF
3. Save changes

→ 即座に組み込み送信に戻ります（レート制限あり）。

---

## 改定履歴

| 日付 | 内容 |
|---|---|
| 2026-05-19 | 初版作成 |
