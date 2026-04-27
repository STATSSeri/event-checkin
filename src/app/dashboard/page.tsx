'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Event } from '@/types';

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

  // S/PASS Design System: 共通スタイル
  const inputBase =
    'w-full bg-transparent border-b-[0.5px] border-forest-30 focus:border-forest outline-none py-2 text-sm text-forest placeholder:text-forest-30 transition-colors';
  const primaryBtn =
    'px-4 py-2 text-[11px] uppercase tracking-[0.22em] bg-forest text-cream hover:opacity-90 transition-opacity';
  const secondaryBtn =
    'px-4 py-2 text-[11px] uppercase tracking-[0.22em] border-[0.5px] border-forest text-forest hover:bg-forest hover:text-cream transition-colors';

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <h1
          className="text-3xl md:text-4xl text-forest italic"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Events
        </h1>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => setShowForm(!showForm)}
            className={primaryBtn}
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            ＋ New Event
          </button>
          <a
            href="/scan"
            target="_blank"
            rel="noopener noreferrer"
            className={`${secondaryBtn} inline-flex items-center gap-1`}
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            📷 Scan
          </a>
          <button
            onClick={handleLogout}
            className="text-[10px] uppercase tracking-[0.22em] text-forest-60 hover:text-forest transition-colors px-2 py-2"
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-mist border-[0.5px] border-forest-30 p-5 mb-6 space-y-4">
          <input
            type="text"
            placeholder="イベント名 *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputBase} font-jp`}
            style={{ fontFamily: 'var(--font-jp)' }}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={inputBase}
            />
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className={inputBase}
            />
          </div>
          <input
            type="text"
            placeholder="会場"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className={`${inputBase} font-jp`}
            style={{ fontFamily: 'var(--font-jp)' }}
          />
          <textarea
            placeholder="説明（任意）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`${inputBase} resize-none font-jp`}
            style={{ fontFamily: 'var(--font-jp)' }}
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              className={primaryBtn}
              style={{ fontFamily: 'var(--font-mark)' }}
            >
              Create
            </button>
            <button
              onClick={() => setShowForm(false)}
              className={secondaryBtn}
              style={{ fontFamily: 'var(--font-mark)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p
          className="text-forest-60 text-center py-8 text-sm font-jp"
          style={{ fontFamily: 'var(--font-jp)' }}
        >
          読み込み中...
        </p>
      ) : events.length === 0 ? (
        <p
          className="text-forest-60 text-center py-8 text-sm font-jp"
          style={{ fontFamily: 'var(--font-jp)' }}
        >
          イベントがありません。「＋ New Event」で作成してください。
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-cream border-[0.5px] border-forest-30 p-5 hover:border-forest transition-colors cursor-pointer"
              onClick={() => router.push(`/dashboard/events/${event.id}`)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    className="text-forest font-jp text-base"
                    style={{ fontFamily: 'var(--font-jp)' }}
                  >
                    {event.name}
                  </h2>
                  <div
                    className="flex flex-wrap gap-3 text-xs text-forest-60 mt-2 font-jp"
                    style={{ fontFamily: 'var(--font-jp)' }}
                  >
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
                  className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 flex-shrink-0"
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
