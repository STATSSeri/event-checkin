'use client';

import { Suspense, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Guest, Event } from '@/types';

type GuestWithEvent = Guest & { events: Event };

export default function RSVPPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-500">読み込み中...</p>
        </div>
      }
    >
      <RSVPContent />
    </Suspense>
  );
}

function RSVPContent() {
  const params = useParams();
  const token = params.token as string;
  const supabase = createClient();

  const [guest, setGuest] = useState<GuestWithEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responded, setResponded] = useState(false);
  const [respondedStatus, setRespondedStatus] = useState<'attending' | 'declined' | null>(null);

  // ゲスト情報を取得（SECURITY DEFINER関数経由：直接テーブルアクセス禁止）
  useEffect(() => {
    const fetchGuest = async () => {
      const { data, error } = await supabase.rpc('get_guest_by_rsvp_token', {
        token,
      });

      if (error || !data || data.status === 'not_found') {
        setNotFound(true);
      } else if (data.status === 'success' && data.guest) {
        const g = data.guest as GuestWithEvent;
        setGuest(g);
        // 既に回答済みの場合
        if (g.status !== 'invited') {
          setResponded(true);
          setRespondedStatus(g.status as 'attending' | 'declined');
        }
      } else {
        setNotFound(true);
      }
      setLoading(false);
    };

    if (token) fetchGuest();
  }, [token, supabase]);

  // 出欠回答を送信（SECURITY DEFINER関数経由：書き換え可能カラムをサーバ側で制限）
  const handleResponse = async (status: 'attending' | 'declined') => {
    if (!guest || submitting) return;
    setSubmitting(true);

    const { data, error } = await supabase.rpc('respond_to_rsvp', {
      token,
      response: status,
    });

    if (error || !data || data.status !== 'success') {
      alert('エラーが発生しました。もう一度お試しください。');
      setSubmitting(false);
      return;
    }

    // 出席の場合、QRコードを自動送信
    // guestIdではなくrsvpTokenを渡すことで、API側でゲストID推測攻撃を防止
    if (status === 'attending') {
      try {
        await fetch('/api/send-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rsvpToken: token }),
        });
      } catch {
        // QR送信失敗してもRSVP自体は成功
        console.error('QRコード送信に失敗しました');
      }
    }

    setResponded(true);
    setRespondedStatus(status);
    setSubmitting(false);
  };

  // ローディング中
  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div
          className="animate-pulse text-forest-60 text-xs uppercase tracking-[0.22em]"
          style={{ fontFamily: 'var(--font-mark)' }}
        >
          Loading...
        </div>
      </div>
    );
  }

  // 無効なリンク
  if (notFound) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="bg-cream border-[0.5px] border-forest-30 p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🔗</div>
          <h1
            className="text-xl text-forest mb-3 italic"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Link Invalid
          </h1>
          <p
            className="text-forest-60 text-sm font-jp"
            style={{ fontFamily: 'var(--font-jp)' }}
          >
            このリンクは無効か、既に期限切れです。
          </p>
        </div>
      </div>
    );
  }

  if (!guest) return null;

  const event = guest.events;

  // イベント日時フォーマット
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="bg-cream border-[0.5px] border-forest-30 max-w-md w-full overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-forest px-6 py-10 text-cream text-center">
          <p
            className="text-[10px] uppercase tracking-[0.25em] opacity-70 mb-3"
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            You&apos;re Invited
          </p>
          <h1
            className="text-2xl md:text-3xl font-jp leading-snug"
            style={{ fontFamily: 'var(--font-jp)' }}
          >
            {event.name}
          </h1>
        </div>

        {/* イベント情報 */}
        <div className="px-6 py-6 space-y-4 border-b-[0.5px] border-forest-30">
          {event.event_date && (
            <div className="flex items-start gap-3">
              <span className="text-forest-30 mt-0.5">📅</span>
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.22em] text-forest-60"
                  style={{ fontFamily: 'var(--font-mark)' }}
                >
                  Date
                </p>
                <p
                  className="text-forest font-jp mt-1"
                  style={{ fontFamily: 'var(--font-jp)' }}
                >
                  {formatDate(event.event_date)}
                  {event.event_time && ` ${event.event_time}`}
                </p>
              </div>
            </div>
          )}
          {event.venue && (
            <div className="flex items-start gap-3">
              <span className="text-forest-30 mt-0.5">📍</span>
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.22em] text-forest-60"
                  style={{ fontFamily: 'var(--font-mark)' }}
                >
                  Venue
                </p>
                <p
                  className="text-forest font-jp mt-1"
                  style={{ fontFamily: 'var(--font-jp)' }}
                >
                  {event.venue}
                </p>
              </div>
            </div>
          )}
          {event.description && (
            <div className="flex items-start gap-3">
              <span className="text-forest-30 mt-0.5">📝</span>
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.22em] text-forest-60"
                  style={{ fontFamily: 'var(--font-mark)' }}
                >
                  Details
                </p>
                <p
                  className="text-forest-80 text-sm whitespace-pre-wrap mt-1 font-jp"
                  style={{ fontFamily: 'var(--font-jp)' }}
                >
                  {event.description}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ゲスト名 */}
        <div className="px-6 py-4 bg-mist text-center">
          <p
            className="text-sm text-forest-80 font-jp"
            style={{ fontFamily: 'var(--font-jp)' }}
          >
            {guest.name} 様
            {guest.organization && (
              <span className="text-forest-60">（{guest.organization}）</span>
            )}
          </p>
        </div>

        {/* 回答セクション */}
        <div className="px-6 py-8">
          {responded ? (
            // 回答済み（成功円アイコンの色は機能色として保持）
            <div className="text-center space-y-3">
              {respondedStatus === 'attending' ? (
                <>
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-3xl">✓</span>
                  </div>
                  <h2
                    className="text-lg text-forest italic"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    Thank you for accepting
                  </h2>
                  <p
                    className="text-sm text-forest-60 font-jp"
                    style={{ fontFamily: 'var(--font-jp)' }}
                  >
                    QRコードをメールで送信しました
                  </p>
                  <p
                    className="text-xs text-forest-60 font-jp"
                    style={{ fontFamily: 'var(--font-jp)' }}
                  >
                    当日はQRコードを受付でご提示ください
                  </p>
                </>
              ) : respondedStatus === 'declined' ? (
                <>
                  <div className="w-16 h-16 bg-mist rounded-full flex items-center justify-center mx-auto border-[0.5px] border-forest-30">
                    <span className="text-3xl text-forest-60">✕</span>
                  </div>
                  <h2
                    className="text-lg text-forest italic"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    Thank you for your reply
                  </h2>
                  <p
                    className="text-sm text-forest-60 font-jp"
                    style={{ fontFamily: 'var(--font-jp)' }}
                  >
                    欠席で承りました
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-3xl">📋</span>
                  </div>
                  <h2
                    className="text-lg text-forest italic"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    Already Responded
                  </h2>
                  <p
                    className="text-sm text-forest-60 font-jp"
                    style={{ fontFamily: 'var(--font-jp)' }}
                  >
                    現在のステータス:{' '}
                    {respondedStatus === 'attending' ? '出席' : '欠席'}
                  </p>
                </>
              )}
            </div>
          ) : (
            // 未回答 - 出欠ボタン
            <div className="space-y-3">
              <p
                className="text-center text-forest-60 text-sm mb-5 font-jp"
                style={{ fontFamily: 'var(--font-jp)' }}
              >
                出欠をお知らせください
              </p>
              <button
                onClick={() => handleResponse('attending')}
                disabled={submitting}
                className="w-full py-4 bg-forest text-cream text-[11px] uppercase tracking-[0.25em] hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ fontFamily: 'var(--font-mark)' }}
              >
                {submitting ? 'Sending...' : 'Accept · 出席する'}
              </button>
              <button
                onClick={() => handleResponse('declined')}
                disabled={submitting}
                className="w-full py-4 border-[0.5px] border-forest text-forest text-[11px] uppercase tracking-[0.25em] hover:bg-forest hover:text-cream disabled:opacity-50 transition-colors"
                style={{ fontFamily: 'var(--font-mark)' }}
              >
                {submitting ? 'Sending...' : 'Decline · 欠席する'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
