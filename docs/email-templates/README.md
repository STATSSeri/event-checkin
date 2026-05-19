# Supabase Auth メールテンプレート

S/PASS ブランディングに統一した Supabase Auth のメール通知テンプレート。
Supabase Dashboard 上で設定するため、コードからの自動適用はできない（手動で貼り付け）。

最終更新：2026-05-19

---

## テンプレート一覧

| ファイル | 対応する Supabase テンプレート | 件名 |
|---|---|---|
| [confirm-signup.html](./confirm-signup.html) | Confirm signup | 【S/PASS】アカウント認証のお願い |
| [reset-password.html](./reset-password.html) | Reset password | 【S/PASS】パスワード再設定のご案内 |
| [change-email.html](./change-email.html) | Change email address | 【S/PASS】メールアドレス変更の確認 |

## 設定手順

### 1. Supabase Dashboard を開く

[Supabase Dashboard](https://supabase.com/dashboard/project/afrclbogxbhvtzgymjjw/auth/templates) →
**Authentication** → **Emails** → **Templates**

### 2. 各テンプレートに適用

各テンプレートタブで以下を設定：

#### Confirm signup
- **Subject heading**: `【S/PASS】アカウント認証のお願い`
- **Message body**: [confirm-signup.html](./confirm-signup.html) の中身を全てコピペ
- **Save changes** を押す

#### Reset password
- **Subject heading**: `【S/PASS】パスワード再設定のご案内`
- **Message body**: [reset-password.html](./reset-password.html) の中身を全てコピペ
- **Save changes** を押す

#### Change email address
- **Subject heading**: `【S/PASS】メールアドレス変更の確認`
- **Message body**: [change-email.html](./change-email.html) の中身を全てコピペ
- **Save changes** を押す

### 3. 動作確認

- 新規アカウント作成 → 認証メールがブランドデザインで届くこと
- 「パスワードをお忘れですか」フロー → 再設定メールが届くこと
- 設定画面からメールアドレス変更 → 確認メールが届くこと

## デザイン要件

すべてのテンプレートで以下を遵守：

- **ブランド配色**: forest `#1F3B2F` + cream `#F1E6D2`
- **ワードマーク**: `S/PASS`（letter-spacing 0.32em）+ Event Reception System サブテキスト
- **CTA ボタン**: forest 背景・cream テキスト
- **フォールバックURL**: ボタンが開かない場合に備えて URL を平文でも記載
- **セキュリティノート**: 心当たりがない場合の対応を明示
- **フッター**: 「スタッツ株式会社」+ legal リンク + support 連絡先

## メールクライアント互換性

以下の主要クライアントで描画確認済の設計：

- Gmail（Web / iOS / Android）
- Outlook（Web / 365 / Windows / Mac）
- Apple Mail（macOS / iOS）
- Yahoo メール

技術的な配慮：

- テーブルベースレイアウト（Outlook 対応）
- 全スタイルをインライン化（`<style>` タグ非対応の Gmail Webview 対応）
- ウェブフォント非依存（システムフォントフォールバック）
- ダークモード非対応（forest/cream はライト寄りで両モードで可読）

## 将来の拡張

未使用だが、必要になったら追加：

- Magic link
- Invite user
- Reauthentication

その際は本ディレクトリに同名で追加し、本 README に追記する。

---

## 改定履歴

| 日付 | 内容 |
|---|---|
| 2026-05-19 | 初版作成（confirm-signup / reset-password / change-email の3本） |
