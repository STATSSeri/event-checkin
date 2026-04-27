'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Event, Guest } from '@/types';

export default function RemindPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [event, setEvent] = useState<Event | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  const fetchData = useCallback(async () => {
    const [eventRes, guestsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase
        .from('guests')
        .select('*')
        .eq('event_id', eventId)
        .eq('status', 'invited')
        .order('created_at', { ascending: true }),
    ]);
    setEvent(eventRes.data);
    setGuests(guestsRes.data || []);
    setLoading(false);
  }, [supabase, eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleAll = () => {
    if (selected.size === guests.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(guests.map((g) => g.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  const handleSend = async () => {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size}名にリマインドメールを送信しますか？`)) return;

    setSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, guestIds: Array.from(selected) }),
      });
      const data = await res.json();

      if (res.ok) {
        setResult({ success: data.success || selected.size, failed: data.failed || 0 });
        setSelected(new Set());
        await fetchData();
      } else {
        alert(`送信エラー: ${data.error || '不明なエラー'}`);
      }
    } catch {
      alert('送信に失敗しました');
    }
    setSending(false);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
      <button
        onClick={() => router.push(`/dashboard/events/${eventId}`)}
        className="text-[10px] uppercase tracking-[0.22em] text-forest-60 hover:text-forest mb-6 inline-block transition-colors"
        style={{ fontFamily: 'var(--font-mark)' }}
      >
        &larr; Back to Event
      </button>

      <h1
        className="text-2xl md:text-3xl text-forest italic mb-1"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Send Reminder
      </h1>
      <p
        className="text-sm text-forest-60 mb-1 font-jp"
        style={{ fontFamily: 'var(--font-jp)' }}
      >
        {event?.name}
      </p>
      <p
        className="text-xs text-forest-60 mb-6 font-jp"
        style={{ fontFamily: 'var(--font-jp)' }}
      >
        未回答（招待済ステータス）のゲストにリマインドメールを送信します
      </p>

      {result && (
        <div
          className="bg-mist border-[0.5px] border-forest-30 p-3 mb-4 text-sm text-forest font-jp"
          style={{ fontFamily: 'var(--font-jp)' }}
        >
          送信完了: 成功 {result.success}件{result.failed > 0 && `、失敗 ${result.failed}件`}
        </div>
      )}

      {guests.length === 0 ? (
        <div className="bg-cream border-[0.5px] border-forest-30 p-8 text-center">
          <p
            className="text-forest-60 text-sm font-jp"
            style={{ fontFamily: 'var(--font-jp)' }}
          >
            リマインド対象のゲストがいません
          </p>
          <p
            className="text-xs text-forest-60 mt-1 font-jp"
            style={{ fontFamily: 'var(--font-jp)' }}
          >
            全てのゲストが回答済みか、ゲストがまだ追加されていません
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between bg-mist border-[0.5px] border-forest-30 p-3 mb-4">
            <label
              className="flex items-center gap-2 text-sm text-forest cursor-pointer font-jp"
              style={{ fontFamily: 'var(--font-jp)' }}
            >
              <input
                type="checkbox"
                checked={selected.size === guests.length && guests.length > 0}
                onChange={toggleAll}
                className="accent-forest"
              />
              全て選択（{guests.length}名）
            </label>
            <button
              onClick={handleSend}
              disabled={sending || selected.size === 0}
              className="px-4 py-2 text-[11px] uppercase tracking-[0.22em] bg-forest text-cream hover:opacity-90 disabled:opacity-40 transition-opacity"
              style={{ fontFamily: 'var(--font-mark)' }}
            >
              {sending ? 'Sending...' : `Remind ${selected.size}`}
            </button>
          </div>

          <div className="bg-cream border-[0.5px] border-forest-30 overflow-hidden">
            {guests.map((g, i) => (
              <label
                key={g.id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-mist transition-colors cursor-pointer ${
                  i > 0 ? 'border-t-[0.5px] border-forest-30' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(g.id)}
                  onChange={() => toggleOne(g.id)}
                  className="accent-forest"
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm text-forest truncate font-jp"
                    style={{ fontFamily: 'var(--font-jp)' }}
                  >
                    {g.name}
                  </div>
                  <div className="text-xs text-forest-60 truncate">
                    {g.email}
                  </div>
                </div>
                <div className="text-right hidden md:block">
                  {g.organization && (
                    <div
                      className="text-xs text-forest-60 font-jp"
                      style={{ fontFamily: 'var(--font-jp)' }}
                    >
                      {g.organization}
                    </div>
                  )}
                  {g.invitation_sent_at && (
                    <div
                      className="text-xs text-forest-60 font-jp"
                      style={{ fontFamily: 'var(--font-jp)' }}
                    >
                      招待送信: {new Date(g.invitation_sent_at).toLocaleDateString('ja-JP')}
                    </div>
                  )}
                  {g.reminder_sent_at && (
                    <div
                      className="text-xs text-orange-500 font-jp"
                      style={{ fontFamily: 'var(--font-jp)' }}
                    >
                      前回リマインド: {new Date(g.reminder_sent_at).toLocaleDateString('ja-JP')}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
