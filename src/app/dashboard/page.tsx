'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Event } from '@/types';
import { RichTextEditor } from '@/components/RichTextEditor';

export default function DashboardPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false, nullsFirst: false });
    setEvents(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('events').insert({
      organizer_id: user.id,
      name: name.trim(),
      description: description.trim() || null,
      event_date: eventDate || null,
      event_time: eventTime || null,
      venue: venue.trim() || null,
    });

    if (!error) {
      setName(''); setEventDate(''); setEventTime(''); setVenue(''); setDescription('');
      setShowForm(false);
      await fetchEvents();
    }
  };

  const handleDelete = async (event: Event) => {
    if (!confirm(`「${event.name}」を削除しますか？紐づくゲストも全て削除されます。`)) return;
    await supabase.from('events').delete().eq('id', event.id);
    await fetchEvents();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">
          イベント一覧
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            ＋ 新規イベント
          </button>
          <a
            href="/scan"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 inline-flex items-center gap-1"
          >
            📷 受付スキャン
          </a>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600"
          >
            ログアウト
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 space-y-3">
          <input
            type="text"
            placeholder="イベント名 *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-gray-800"
            />
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-gray-800"
            />
          </div>
          <input
            type="text"
            placeholder="会場"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800"
          />
          <div>
            <p className="text-xs text-gray-500 mb-1">
              説明（任意・太字/斜体/リンク使用可、招待メールにも記載されます）
            </p>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              minHeightClass="min-h-[80px]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              作成
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-center py-8">読み込み中...</p>
      ) : events.length === 0 ? (
        <p className="text-gray-500 text-center py-8">
          イベントがありません。「＋ 新規イベント」で作成してください。
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/dashboard/events/${event.id}`)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-gray-800">{event.name}</h2>
                  <div className="flex gap-3 text-sm text-gray-500 mt-1">
                    {event.event_date && <span>📅 {event.event_date}</span>}
                    {event.event_time && <span>🕐 {event.event_time}</span>}
                    {event.venue && <span>📍 {event.venue}</span>}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(event);
                  }}
                  className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
