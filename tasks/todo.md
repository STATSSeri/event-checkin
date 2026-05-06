# 送信元ドメインカスタマイズ機能 実装計画

## ゴール
セキュリティの厳しい大手企業（電通レベル）のIT部門に出されるセキュリティ質問票に**全項目"問題なし"で回答できる**状態を作る。並行して、メールが届かない問題の根本解決（ドメイン検証フロー）も実装する。

## 設計の前提
- **マルチテナント**: ユーザー単位でドメイン管理、複数会社対応
- **ドメイン単位検証 + ローカルパート自由入力**: 1回検証すれば社員個人名（`sunada@goal.dentsu.co.jp`）で送り放題
- **本番テスト中のクライアント影響ゼロ**: 既存機能を壊さない
- **Resend Pro契約前提**: ドメイン上限・Webhook利用可

---

## Sprint 1: 重大セキュリティ欠陥修正（最優先・先行着手）

既存システムに対する独立した修正。本番テスト中のクライアント影響なし。

- [ ] **S1-1: ヘッダーインジェクション対策**
  - `from_email` 入力に `\r\n` 等のCRLF混入を完全拒否するバリデーション
  - メールアドレス形式チェック（RFC 5321準拠の簡易版）
  - 既存 `events.from_email` のサニタイズ（DB既存値のチェック）
  - 対象: `src/app/dashboard/page.tsx`, `src/app/dashboard/events/[eventId]/page.tsx`, `src/lib/email.ts`
- [ ] **S1-2: セキュリティヘッダー設定**
  - `next.config.js` の `headers()` で CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy 設定
  - middleware.ts は既存があれば確認、なければ作成しない（Vercel auth middleware と競合させない）
- [ ] **S1-3: レート制限基盤**
  - 認証API（signup, login）と send-* API系に IP/userベースのレート制限
  - シンプルに In-memory or Vercel KV（Upstash）。Pro 契約があるなら Upstash 推奨
  - まずは `@upstash/ratelimit` でラップ
- [ ] **S1-4: Dependabot 有効化**
  - `.github/dependabot.yml` 作成
  - 週1で npm 依存の脆弱性チェック

**Sprint 1 完了基準**: 既存機能が壊れていない（テスト動作確認）+ 上記4項目のコード追加 + コミット・push

---

## Sprint 2: ドメイン検証機能のコア（並行作業可）

- [ ] **S2-1: DBマイグレーションSQL作成**
  - `tasks/migrations/001_sender_domains.sql` 作成
  - `sender_domains` テーブル + RLS ポリシー
  - **Mikiya が Supabase SQL Editor で手動実行**
  - 検証完了の確認手順をMDで記載
- [ ] **S2-2: 型定義追加**
  - `types/index.ts` に `SenderDomain` 型
  - DNSレコード型 `DnsRecord`
- [ ] **S2-3: Resend SDK ラッパー作成**
  - `src/lib/resend-domains.ts`（Domains API のラッパー）
  - エラーハンドリング・型付け
- [ ] **S2-4: API ルート実装**
  - `POST /api/domains` — Resendドメイン作成 + Supabase保存
  - `GET /api/domains` — 一覧（自分のだけ）
  - `POST /api/domains/[id]/verify` — Resend 検証依頼
  - `POST /api/domains/[id]/refresh` — 最新状態取得
  - `DELETE /api/domains/[id]` — Resend + Supabase 両方から削除
  - `POST /api/webhooks/resend` — bounce/complaint Webhook 受信
  - **入力バリデーション完備（ドメイン形式チェック、所有権警告）**

---

## Sprint 3: 設定画面UI + イベント画面改修

- [ ] **S3-1: 設定画面UI**
  - `/dashboard/settings/domains/page.tsx` 新規作成
  - ドメイン追加フォーム（"goal.dentsu.co.jp" を入力）
  - 一覧表示（domain, status バッジ, 作成日, 最終確認）
  - 「DNS設定を表示」モーダル → TYPE/NAME/VALUE をコピーボタン付きで表示
  - 「IT部向け依頼書をダウンロード」ボタン → 静的 MD/PDF
  - 「検証する」ボタン
  - 4ステップ進捗バー（① 担当者操作 → ② IT部依頼中 → ③ DNS反映待ち → ④ 検証完了）
- [ ] **S3-2: イベント作成画面改修**
  - 既存の `from_email` 自由入力を残しつつ、追加で「検証済みドメインから選択」モードを追加
  - UI: ドロップダウン（検証済みドメイン）+ ローカルパート入力欄 → 結合プレビュー
  - 旧自由入力モードは互換のため残す（"高度な設定"扱い）
  - **既存イベントへの影響なし**（DB スキーマ変更なし、UI のみ拡張）
- [ ] **S3-3: Reply-To 欄追加**
  - イベント単位で Reply-To をカスタマイズ可能に
  - 検証不要（受信側が信頼判定に使わないため）
  - DBスキーマ変更: `events.reply_to TEXT`（NULL可）

---

## Sprint 4: 認証強化 + 監査ログ

- [ ] **S4-1: パスワード強度強化**
  - signup ページで最低8文字 + 英大小文字・数字混在
  - フロント側バリデーション + Supabase 側のパスワードポリシー設定
- [ ] **S4-2: MFA（TOTP）有効化**
  - Supabase Auth で TOTP 対応
  - 設定画面で MFA セットアップフロー（QRコード）
  - ログイン時の TOTP プロンプト
- [ ] **S4-3: 監査ログテーブル**
  - `audit_logs` テーブル新設（user_id, action, target_type, target_id, metadata, ip, user_agent, created_at）
  - 主要操作で書き込み: domain追加/削除/検証、event作成/編集/削除、招待送信、ログイン
  - RLS: 自分のログのみ閲覧可
- [ ] **S4-4: 監査ログ閲覧UI**
  - `/dashboard/settings/audit/page.tsx`
  - 直近30日分の操作履歴

---

## Sprint 5: データ削除ポリシー + bounce通知UI

- [ ] **S5-1: データ削除機能**
  - イベント単位の手動削除（既存があれば確認、なければ追加）
  - ユーザー単位の自己削除リクエストフロー
  - イベント終了 X日後の自動削除（任意設定）
- [ ] **S5-2: bounce/complaint 通知UI**
  - Webhook で受信した bounce/complaint をダッシュボードに通知
  - イベント詳細画面でゲスト単位の bounce ステータス表示

---

## Sprint 6: ドキュメント類

実装とは別に必要なドキュメント。雛形をMikiyaが法務確認・調整。

- [ ] **D-1: IT部向け技術ドキュメント** (`docs/it-team-setup-guide.md`)
- [ ] **D-2: セキュリティホワイトペーパー** (`docs/security-whitepaper.md`)
- [ ] **D-3: 個人情報保護方針 雛形** (`docs/privacy-policy.md`)
- [ ] **D-4: 利用規約 雛形** (`docs/terms-of-service.md`)
- [ ] **D-5: サブプロセッサー一覧** (`docs/subprocessors.md`) — Supabase / Resend / Vercel
- [ ] **D-6: データ削除ポリシー文書** (`docs/data-retention-policy.md`)
- [ ] **D-7: インシデント対応プロセス** (`docs/incident-response.md`)

---

## 推奨実行順序（並行作業）

```
Day 1:    Sprint 1 全部（独立、リスク低）→ コミット・push
Day 2-3:  Sprint 2 (S2-1 → Mikiyaに SQL 実行依頼 → S2-2〜S2-4)
Day 4-5:  Sprint 3 (S3-1 → S3-2 → S3-3)
Day 6:    Sprint 4 全部
Day 7:    Sprint 5 全部
Day 8:    Sprint 6（ドキュメント類）+ 全体動作確認
```

## 各 Sprint 完了時の必須アクション

1. ローカルで `npx tsc --noEmit` 通る
2. `npm run build` 通る（環境変数ダミーで）
3. 既存機能の動作確認（ログイン、イベント作成、招待送信）
4. コミット・push
5. Vercel デプロイ確認

## 本番影響リスクの管理

- **本番システム影響なし** = Sprint 1 全項目、Sprint 2 S2-1〜S2-4（追加のみ）、Sprint 3 S3-1（新規ページのみ）、Sprint 4 S4-3, S4-4（追加のみ）、Sprint 5 全項目、Sprint 6 全項目
- **本番システムに変更が及ぶ** = Sprint 3 S3-2, S3-3、Sprint 4 S4-1, S4-2
  → これらは特に慎重に。動作確認は Mikiya による手動テストも必須

## 環境変数追加予定

- `RESEND_WEBHOOK_SECRET`（Webhook署名検証用）
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（レート制限用、Vercel Marketplace から自動）

---

## 開始前 確認事項

- [ ] このスケジュール感（合計8日相当の作業）で問題ないか
- [ ] **Sprint 1 から着手してよいか**（最も独立性が高く、本番影響なし）
- [ ] 各 Sprint 完了時に Mikiya レビューしてから次へ進めるか、それとも Sprint 1〜3 まとめて進めるか
- [ ] Upstash の Vercel Marketplace 連携を許可するか（レート制限用）
