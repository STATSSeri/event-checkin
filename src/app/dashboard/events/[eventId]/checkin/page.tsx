'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Event, Guest } from '@/types';

type SortMode = 'checkin_time' | 'name';

export default function CheckinPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [event, setEvent] = useState<Event | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('checkin_time');

  const fetchData = useCallback(async () => {
    const [eventRes, guestsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase
        .from('guests')
        .select('*')
        .eq('event_id', eventId)
        .in('status', ['attending', 'checked_in'])
        .order('created_at', { ascending: true }),
    ]);
    setEvent(eventRes.data);
    setGuests(guestsRes.data || []);
    setLoading(false);
  }, [supabase, eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Supabase Realtime サブスクリプション
  useEffect(() => {
    const channel = supabase
      .channel(`guests-realtime-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guests',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // ゲストテーブルに変更があったら再取得
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, eventId, fetchData]);

  // チェックイン取消
  const handleUndoCheckin = async (guest: Guest) => {
    if (!confirm(`「${guest.name}」のチェックインを取り消しますか？`)) return;
    await supabase
      .from('guests')
      .update({ status: 'attending', checked_in_at: null })
      .eq('id', guest.id);
    await fetchData();
  };

  // ソート済みゲストリスト
  const sortedGuests = [...guests].sort((a, b) => {
    if (sortMode === 'name') {
      return a.name.localeCompare(b.name, 'ja');
    }
    // チェックイン時間順: checked_in を先頭に、時間降順
    if (a.status === 'checked_in' && b.status !== 'checked_in') return -1;
    if (a.status !== 'checked_in' && b.status === 'checked_in') return 1;
    if (a.checked_in_at && b.checked_in_at) {
      return new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime();
    }
    return 0;
  });

  const checkedInCount = guests.filter((g) => g.status === 'checked_in').length;
  const totalTarget = guests.length; // attending + checked_in
  const progressPercent = totalTarget > 0 ? Math.round((checkedInCount / totalTarget) * 100) : 0;

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
        Check-in Status
      </h1>
      <p
        className="text-sm text-forest-60 mb-6 font-jp"
        style={{ fontFamily: 'var(--font-jp)' }}
      >
        {event?.name}
      </p>

      {/* カウンター & プログレスバー */}
      <div className="bg-cream border-[0.5px] border-forest-30 p-6 mb-6">
        <div className="text-center mb-4">
          {/* 入場者数は機能色（green）を保持：意味伝達のため */}
          <span className="text-5xl text-green-600 italic" style={{ fontFamily: 'var(--font-display)' }}>
            {checkedInCount}
          </span>
          <span className="text-2xl text-forest-30 mx-2">/</span>
          <span
            className="text-2xl text-forest-60 italic"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {totalTarget}
          </span>
          <span
            className="text-xs text-forest-60 ml-3 uppercase tracking-[0.22em]"
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            Checked In
          </span>
        </div>
        <div className="w-full bg-mist h-3 overflow-hidden">
          <div
            className="bg-green-500 h-3 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="text-center text-xs text-forest-60 mt-2">
          {progressPercent}%
        </div>
      </div>

      {/* ソートボタン & 更新ボタン */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setSortMode('checkin_time')}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] transition-colors ${
              sortMode === 'checkin_time'
                ? 'bg-forest text-cream'
                : 'border-[0.5px] border-forest-30 text-forest-60 hover:border-forest hover:text-forest'
            }`}
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            By Time
          </button>
          <button
            onClick={() => setSortMode('name')}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] transition-colors ${
              sortMode === 'name'
                ? 'bg-forest text-cream'
                : 'border-[0.5px] border-forest-30 text-forest-60 hover:border-forest hover:text-forest'
            }`}
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            By Name
          </button>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] border-[0.5px] border-forest-30 text-forest-60 hover:border-forest hover:text-forest transition-colors"
          style={{ fontFamily: 'var(--font-mark)' }}
        >
          Refresh
        </button>
      </div>

      {/* ゲストリスト */}
      {sortedGuests.length === 0 ? (
        <div className="bg-cream border-[0.5px] border-forest-30 p-8 text-center">
          <p
            className="text-forest-60 text-sm font-jp"
            style={{ fontFamily: 'var(--font-jp)' }}
          >
            出席予定・入場済のゲストがいません
          </p>
        </div>
      ) : (
        <div className="bg-cream border-[0.5px] border-forest-30 overflow-hidden">
          {sortedGuests.map((g, i) => (
            <div
              key={g.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                i > 0 ? 'border-t-[0.5px] border-forest-30' : ''
              }`}
            >
              {/* ステータスドット：機能色を保持 */}
              <div
                className={`w-3 h-3 rounded-full flex-shrink-0 ${
                  g.status === 'checked_in' ? 'bg-green-500' : 'bg-forest-30'
                }`}
              />

              {/* ゲスト情報 */}
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm text-forest truncate font-jp"
                  style={{ fontFamily: 'var(--font-jp)' }}
                >
                  {g.name}
                </div>
                {g.organization && (
                  <div
                    className="text-xs text-forest-60 truncate font-jp"
                    style={{ fontFamily: 'var(--font-jp)' }}
                  >
                    {g.organization}
                  </div>
                )}
              </div>

              {/* チェックイン時刻 */}
              <div className="text-right flex-shrink-0">
                {g.status === 'checked_in' && g.checked_in_at ? (
                  <div className="text-xs text-green-600">
                    {new Date(g.checked_in_at).toLocaleTimeString('ja-JP', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                ) : (
                  <div
                    className="text-xs text-forest-60 font-jp"
                    style={{ fontFamily: 'var(--font-jp)' }}
                  >
                    未入場
                  </div>
                )}
              </div>

              {/* 取消ボタン：機能色を保持 */}
              {g.status === 'checked_in' && (
                <button
                  onClick={() => handleUndoCheckin(g)}
                  className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 flex-shrink-0"
                >
                  取消
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
