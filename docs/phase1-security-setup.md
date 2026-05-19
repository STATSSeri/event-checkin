# Phase 1 セキュリティ強化 セットアップガイド

外部プラットフォームチェックシート IS10 #19（ユーザー認証）の要件への対応として、
Phase 1 で以下を実装した。本ドキュメントはデプロイ後に **Mikiya が手作業で行う**
セットアップ手順をまとめたもの。

| # | 要件 | 実装 |
|---|------|------|
| 19-1 | パスワード文字数（10文字以上 + 4種類中3種類） | `src/lib/password-policy.ts` + Supabase ダッシュボード設定 |
| 19-2 | 多要素認証（TOTP） | `src/app/dashboard/settings/security/MfaSection.tsx` + Supabase ダッシュボード設定 |
| 19-3 | パスワード履歴（過去10回分の再利用禁止） | `password_history` テーブル + `/api/auth/change-password` |
| 19-4 | パスワード最低有効期間（1日） | `user_security_meta.password_changed_at` |
| 19-5 | ログイン後の MFA チャレンジ | `/mfa-challenge` + middleware の AAL2 強制 |

---

## 1. DB マイグレーション

Supabase ダッシュボード → SQL Editor で実行:

```
tasks/migrations/003_password_security.sql
```

完了確認:
- Table Editor で `password_history` と `user_security_meta` が作成されている
- RLS バッジが両方に付いている

---

## 2. Supabase ダッシュボード設定

### 2-1. Authentication → Sign In / Providers → Email

| 項目 | 値 |
|---|---|
| Minimum password length | **10** |
| Password Requirements | **`Lowercase, uppercase letters, digits, and symbols`** を選択 |

> Supabase は「種類×4 全部」と「種類×3 のうち〜」を区別しない。
> 要件「4種類のうち3種類」はアプリ側の `validatePasswordOrError()` で担保し、
> Supabase 側は最も厳しい設定（全種類必須相当）を選んでおく。最終判定はサーバ側で行う。

### 2-2. Authentication → Multi-Factor

| 項目 | 値 |
|---|---|
| TOTP (App Authenticator) | **Enable** |

### 2-3. Authentication → Rate Limits

デフォルトのままで構わないが、確認のみ:

| 項目 | 推奨 |
|---|---|
| Sign-in attempts | 30 / 5 min（デフォルト） |
| Token refresh | 150 / 5 min |

Supabase 側のレート制限と、`src/lib/rate-limit.ts` の Upstash レート制限は
二重防御として並行稼働する。

---

## 3. 動作確認

### 3-1. 既存ユーザーへの影響

- **既存パスワードはそのまま使える** — ポリシー強化はサインアップ・変更時のみ作用
- 既存ユーザーが弱いパスワードを使っている場合、次回のパスワード変更時に
  新ポリシー（10文字以上 + 3種類）を満たす必要がある
- `password_history` には既存パスワードが入っていない — 初回変更後のみ蓄積開始

### 3-2. 新規ユーザー（サインアップ）

1. `/signup` で 9 文字以下のパスワード → エラー表示
2. `Abcdefghij` のように 1 種類だけ → エラー表示
3. `Abcdefghij1` のように 3 種類 + 10 文字以上 → 通過

### 3-3. MFA 有効化フロー

1. ログイン → 設定 → セキュリティ → 「多要素認証を有効化する」
2. QR コードを Google Authenticator / 1Password 等でスキャン
3. 6桁コードを入力 → 有効化完了
4. **ログアウト** して再ログイン → `/mfa-challenge` にリダイレクトされる
5. コードを入力 → `/dashboard` に進める

### 3-4. パスワード変更フロー

1. 設定 → セキュリティ → パスワード変更
2. 現在のパスワード + 新パスワード入力
3. 即座に再度パスワード変更を試行 → 「24時間お待ちください」エラー（最低有効期間）
4. 24時間後、再度同じパスワードに戻そうとする → 「直近10回分と同じものは使用不可」エラー

---

## 4. 既知の制約と今後の TODO

### 4-1. パスワード履歴の取りこぼし
- 新規サインアップ時の初期パスワードは履歴に記録されない（クライアント直接の
  `supabase.auth.signUp` を経由するため、サーバが平文を受け取らない）
- 結果として「サインアップ直後に同じパスワードに『戻す』ことが理論上可能」だが、
  最初の変更操作以降は通常通り 10 回分の履歴チェックが効く
- 必要なら、サインアップフローを `/api/auth/signup` 経由に置き換えて履歴に
  初期ハッシュを記録する追加実装が可能（Phase 2 候補）

### 4-2. パスワード最大有効期間（強制ローテーション）
- 要件は「MFA 有: 365日 / MFA 無: 90日」
- `password_changed_at` を持つ DB は用意済みだが、強制ローテーションのバナー /
  ログイン後の強制リダイレクトは未実装（Phase 2 候補）
- 期限超過時の挙動は CRM 系では「警告のみ表示」が一般的、厳格運用なら強制変更

### 4-3. アカウントロック（5回失敗 → 15分）
- Supabase Auth 標準のレート制限（30 attempts / 5min）+ Upstash の `auth` 枠
  （5 attempts / 60s）で実質的にブルートフォース耐性は確保済み
- 要件文書の「5回失敗で自動ロック・15分後解除」へのピンポイント準拠が必要なら、
  `user_security_meta.failed_login_count` + `locked_until` カラムを追加して
  ログイン API をサーバ側でラップする方針が必要（Phase 2 候補）

### 4-4. MFA 強制
- 現状: 個々のユーザーが任意で MFA を有効化する設計
- 「MFA は組織として必須」とする場合、有効化していないユーザーに対する
  バナー警告 → 強制セットアップ画面への誘導が必要（Phase 2 候補）
