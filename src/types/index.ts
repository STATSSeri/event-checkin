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
