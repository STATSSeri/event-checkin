export type GuestStatus = 'invited' | 'attending' | 'declined' | 'checked_in';

export interface Event {
  id: string;
  organizer_id: string;
  name: string;
  description: string | null;
  event_date: string | null;
  event_time: string | null;
  venue: string | null;
  /** 送信元アドレス（任意）。null時はデフォルト送信元（環境変数）を使用。
   *  形式: "events@example.com" or "表示名 <events@example.com>" */
  from_email: string | null;
  created_at: string;
}

/** 送信元ドメインの検証ステータス（Resend 準拠） */
export type SenderDomainStatus =
  | 'pending'
  | 'verified'
  | 'failed'
  | 'temporary_failure'
  | 'not_started';

/** DNS レコード（Resend が返す形式に合わせる） */
export interface DnsRecord {
  /** レコード種別（'SPF' | 'DKIM' | 'MX' 等） */
  record: string;
  /** DNS レコード名（例: 'resend._domainkey.goal.dentsu.co.jp'） */
  name: string;
  /** DNS レコード値（CNAME ターゲット or TXT 値） */
  value: string;
  /** DNS レコードタイプ（'CNAME' | 'TXT' | 'MX' 等） */
  type: string;
  /** TTL（例: 'Auto' or '3600'） */
  ttl?: string;
  /** 個別レコードの検証状況 */
  status?: SenderDomainStatus;
  /** MX 用の優先度 */
  priority?: number;
}

/** ユーザーが登録した送信元ドメイン（自社ドメイン送信フロー用） */
export interface SenderDomain {
  id: string;
  user_id: string;
  /** 例: 'goal.dentsu.co.jp' */
  domain: string;
  /** Resend 側のドメインID */
  resend_domain_id: string;
  status: SenderDomainStatus;
  /** Resend が返した DNS レコード一覧（IT部に渡す情報） */
  dns_records: DnsRecord[] | null;
  last_checked_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Guest {
  id: string;
  event_id: string;
  name: string;
  email: string;
  organization: string | null;
  rsvp_token: string;
  checkin_token: string;
  status: GuestStatus;
  rsvp_responded_at: string | null;
  checked_in_at: string | null;
  invitation_sent_at: string | null;
  reminder_sent_at: string | null;
  qr_sent_at: string | null;
  created_at: string;
}
