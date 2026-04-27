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
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        &larr; イベント詳細に戻る
      </button>

      <h1 className="text-xl font-bold text-gray-800 mb-1">入場状況</h1>
      <p className="text-sm text-gray-500 mb-6">{event?.name}</p>

      {/* カウンター & プログレスバー */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="text-center mb-4">
          <span className="text-4xl font-bold text-green-600">
            {checkedInCount}
          </span>
          <span className="text-2xl text-gray-400 mx-2">/</span>
          <span className="text-2xl text-gray-600">{totalTarget}</span>
          <span className="text-sm text-gray-500 ml-2">名入場</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className="bg-green-500 h-4 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="text-center text-sm text-gray-500 mt-2">
          {progressPercent}%
        </div>
      </div>

      {/* ソートボタン & 更新ボタン */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setSortMode('checkin_time')}
            className={`px-3 py-1.5 text-sm rounded-md ${
              sortMode === 'checkin_time'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            チェックイン時間順
          </button>
          <button
            onClick={() => setSortMode('name')}
            className={`px-3 py-1.5 text-sm rounded-md ${
              sortMode === 'name'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            名前順
          </button>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          更新
        </button>
      </div>

      {/* ゲストリスト */}
      {sortedGuests.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <p className="text-gray-500">出席予定・入場済のゲストがいません</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {sortedGuests.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-50"
            >
              {/* ステータスドット */}
              <div
                className={`w-3 h-3 rounded-full flex-shrink-0 ${
                  g.status === 'checked_in' ? 'bg-green-500' : 'bg-gray-300'
                }`}
              />

              {/* ゲスト情報 */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">
                  {g.name}
                </div>
                {g.organization && (
                  <div className="text-xs text-gray-400 truncate">
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
                  <div className="text-xs text-gray-400">未入場</div>
                )}
              </div>

              {/* 取消ボタン */}
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
