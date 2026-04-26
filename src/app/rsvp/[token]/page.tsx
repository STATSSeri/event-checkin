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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">読み込み中...</div>
      </div>
    );
  }

  // 無効なリンク
  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🔗</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">無効なリンクです</h1>
          <p className="text-gray-500 text-sm">
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
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-8 text-white text-center">
          <p className="text-sm opacity-80 mb-1">ご招待</p>
          <h1 className="text-2xl font-bold">{event.name}</h1>
        </div>

        {/* イベント情報 */}
        <div className="px-6 py-6 space-y-3 border-b border-gray-100">
          {event.event_date && (
            <div className="flex items-start gap-3">
              <span className="text-gray-400 mt-0.5">📅</span>
              <div>
                <p className="text-sm text-gray-500">日時</p>
                <p className="text-gray-800 font-medium">
                  {formatDate(event.event_date)}
                  {event.event_time && ` ${event.event_time}`}
                </p>
              </div>
            </div>
          )}
          {event.venue && (
            <div className="flex items-start gap-3">
              <span className="text-gray-400 mt-0.5">📍</span>
              <div>
                <p className="text-sm text-gray-500">会場</p>
                <p className="text-gray-800 font-medium">{event.venue}</p>
              </div>
            </div>
          )}
          {event.description && (
            <div className="flex items-start gap-3">
              <span className="text-gray-400 mt-0.5">📝</span>
              <div>
                <p className="text-sm text-gray-500">詳細</p>
                <p className="text-gray-700 text-sm">{event.description}</p>
              </div>
            </div>
          )}
        </div>

        {/* ゲスト名 */}
        <div className="px-6 py-4 bg-gray-50 text-center">
          <p className="text-sm text-gray-500">
            {guest.name} 様
            {guest.organization && (
              <span className="text-gray-400">（{guest.organization}）</span>
            )}
          </p>
        </div>

        {/* 回答セクション */}
        <div className="px-6 py-6">
          {responded ? (
            // 回答済み
            <div className="text-center space-y-3">
              {respondedStatus === 'attending' ? (
                <>
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-3xl">✓</span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">
                    ご出席ありがとうございます
                  </h2>
                  <p className="text-sm text-gray-500">
                    QRコードをメールで送信しました
                  </p>
                  <p className="text-xs text-gray-400">
                    当日はQRコードを受付でご提示ください
                  </p>
                </>
              ) : respondedStatus === 'declined' ? (
                <>
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-3xl text-gray-400">✕</span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">
                    ご回答ありがとうございます
                  </h2>
                  <p className="text-sm text-gray-500">欠席で承りました</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-3xl">📋</span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">回答済みです</h2>
                  <p className="text-sm text-gray-500">
                    現在のステータス:{' '}
                    {respondedStatus === 'attending' ? '出席' : '欠席'}
                  </p>
                </>
              )}
            </div>
          ) : (
            // 未回答 - 出欠ボタン
            <div className="space-y-4">
              <p className="text-center text-gray-600 text-sm mb-4">
                出欠をお知らせください
              </p>
              <button
                onClick={() => handleResponse('attending')}
                disabled={submitting}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white text-lg font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {submitting ? '送信中...' : '出席する'}
              </button>
              <button
                onClick={() => handleResponse('declined')}
                disabled={submitting}
                className="w-full py-4 bg-gray-200 hover:bg-gray-300 text-gray-700 text-lg font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '送信中...' : '欠席する'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
