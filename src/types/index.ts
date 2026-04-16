export type GuestStatus = 'invited' | 'attending' | 'declined' | 'checked_in';

export interface Event {
  id: string;
  organizer_id: string;
  name: string;
  description: string | null;
  event_date: string | null;
  event_time: string | null;
  venue: string | null;
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
