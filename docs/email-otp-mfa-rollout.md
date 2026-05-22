# メールOTP MFA ロールアウト手順

## 背景

S/PASS はこれまで Supabase Auth 標準の **TOTP（認証アプリ）** のみを多要素認証として
サポートしてきた。しかしスマートフォンアプリでの 6 桁コードコピー操作が手間という
フィードバックがあり、**ご登録メールアドレス宛 6 桁コード方式（メールOTP）** を
新たにデフォルト選択肢として追加する。

- 既存 TOTP ユーザーは影響を受けない（`preferred_mfa_method = NULL` のままで従来挙動）
- 新規ユーザーは設定画面でメールOTPを選択できる
- セキュリティ質問票には「メールOTPおよびTOTPの両方をサポート、ユーザー選択可」と回答可能

## 変更ファイル一覧

新規:
- `tasks/migrations/004_email_otp_mfa.sql`
- `src/lib/mfa-email.ts`
- `src/app/api/auth/mfa/email/send/route.ts`
- `src/app/api/auth/mfa/email/verify/route.ts`
- `src/app/api/auth/mfa/preference/route.ts`
- `src/app/dashboard/settings/security/MfaPreferenceSection.tsx`

変更:
- `src/lib/supabase/middleware.ts` — preferred_mfa_method='email' 分岐を追加
- `src/app/mfa-challenge/page.tsx` — メールOTP / TOTP の切替UIに改修
- `src/app/dashboard/settings/security/page.tsx` — MfaPreferenceSection を表示
- `src/lib/audit-log.ts` — 新規 action 種別を追加
- `src/app/dashboard/settings/security/ActivitySection.tsx` — 新規 action のラベル追加

## ロールアウト手順

### 1. Supabase で migration を実行（Mikiya 手動）

1. Supabase ダッシュボード → SQL Editor を開く
2. `tasks/migrations/004_email_otp_mfa.sql` の中身を全てコピペして実行
3. 「Success. No rows returned」が表示されることを確認
4. Table Editor で以下を確認:
   - `email_otp_verifications` テーブルが新規作成されている
   - `user_security_meta` に `preferred_mfa_method` と `last_mfa_verified_at` 列が追加されている

> **重要**: migration はコードデプロイより **先** に実行すること。
> 順序が逆だと middleware が新カラムを参照して 500 エラーになる。

### 2. コードのデプロイ

通常通り PR を作成し main にマージ → Vercel が自動デプロイ。

```
git push origin feat/email-otp-mfa
gh pr create --title "メールOTPによる多要素認証を追加" --body "..."
```

### 3. デプロイ後の動作確認

#### 3-1. 既存 TOTP ユーザーへの影響ゼロ確認（最優先）

1. TOTP を有効化済みのテストアカウントでログイン
2. /mfa-challenge にリダイレクトされること
3. 「認証アプリ（TOTP）で認証する」フォームが表示される
   - もしメール送信フォームが先に出る場合は、フォーム下部の切替リンクで戻れる
4. TOTP コードを入力して /dashboard に到達できる

#### 3-2. 新規メールOTPフロー確認

1. 新規ユーザー（または TOTP 未設定のユーザー）でログイン
2. /dashboard/settings/security に移動
3. 「二段階認証の方式」セクションで「メール（推奨）」を選択 → 保存
4. ログアウト → 再度ログイン
5. /mfa-challenge にリダイレクトされ、「メールで認証コードを送信」ボタンが出ること
6. ボタンクリック → 登録メールに 6 桁コードが届く
7. コード入力 → /dashboard に遷移できる

#### 3-3. 監査ログ確認

`/dashboard/settings/security` のアクティビティ履歴に以下が表示されることを確認:
- 「メールOTP 送信」
- 「メールOTP 認証成功」
- 「MFA方式 変更」

### 4. ロールバック手順（緊急時）

#### コードのロールバック
Vercel のダッシュボードから前回デプロイにロールバック。

#### DB のロールバック（必要な場合のみ）
```sql
DROP TABLE IF EXISTS public.email_otp_verifications;
ALTER TABLE public.user_security_meta
  DROP COLUMN IF EXISTS preferred_mfa_method,
  DROP COLUMN IF EXISTS last_mfa_verified_at;
```

> 注意: カラム DROP すると `preferred_mfa_method = 'email'` を保存済みのユーザーの
> 選択が失われる。コードのみロールバックすれば DB はそのまま残してよい
> （新カラムは古いコードからは参照されないため互換）。

## 設定上のチューニング項目

| 項目 | 既定値 | 変更箇所 |
|------|--------|---------|
| OTP コード長 | 6 桁 | `src/lib/mfa-email.ts` の `OTP_LENGTH` |
| OTP 有効期限 | 5 分 | `src/lib/mfa-email.ts` の `OTP_TTL_SECONDS` |
| 試行回数上限 | 5 回 | `src/lib/mfa-email.ts` の `OTP_MAX_ATTEMPTS` |
| 検証後の有効期間 | 12 時間 | `src/lib/mfa-email.ts` と `src/lib/supabase/middleware.ts` の `OTP_VERIFIED_VALID_SECONDS`（**両方** 揃えること） |
| レート制限 | 1分5回 | `src/lib/rate-limit.ts` の `auth` 枠 |

## セキュリティチェックシート上の扱い

質問票への記載例:

> 多要素認証（MFA）として、TOTP（時刻同期型ワンタイムパスワード）および
> メールアドレス宛 6 桁ワンタイムコードの両方式をサポート。
> ユーザーごとに任意の方式を選択可能。コードはサーバ側で scrypt ハッシュとして
> 保管し、平文では一切保持しない。試行回数上限・有効期限・レート制限により
> ブルートフォースを防御。
