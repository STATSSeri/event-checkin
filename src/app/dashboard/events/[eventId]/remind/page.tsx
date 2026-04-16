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
      <button onClick={() => router.push(`/dashboard/events/${eventId}`)}
        className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        &larr; イベント詳細に戻る
      </button>

      <h1 className="text-xl font-bold text-gray-800 mb-1">リマインド送信</h1>
      <p className="text-sm text-gray-500 mb-1">{event?.name}</p>
      <p className="text-xs text-gray-400 mb-6">未回答（招待済ステータス）のゲストにリマインドメールを送信します</p>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-700">
          送信完了: 成功 {result.success}件{result.failed > 0 && `、失敗 ${result.failed}件`}
        </div>
      )}

      {guests.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <p className="text-gray-500">リマインド対象のゲストがいません</p>
          <p className="text-xs text-gray-400 mt-1">全てのゲストが回答済みか、ゲストがまだ追加されていません</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between bg-white rounded-lg shadow-sm p-3 mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={selected.size === guests.length && guests.length > 0}
                onChange={toggleAll} className="rounded" />
              全て選択（{guests.length}名）
            </label>
            <button onClick={handleSend} disabled={sending || selected.size === 0}
              className="px-4 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50">
              {sending ? '送信中...' : `${selected.size}名にリマインド送信`}
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {guests.map((g) => (
              <label key={g.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(g.id)}
                  onChange={() => toggleOne(g.id)} className="rounded" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{g.name}</div>
                  <div className="text-xs text-gray-500 truncate">{g.email}</div>
                </div>
                <div className="text-right hidden md:block">
                  {g.organization && (
                    <div className="text-xs text-gray-400">{g.organization}</div>
                  )}
                  {g.invitation_sent_at && (
                    <div className="text-xs text-gray-400">
                      招待送信: {new Date(g.invitation_sent_at).toLocaleDateString('ja-JP')}
                    </div>
                  )}
                  {g.reminder_sent_at && (
                    <div className="text-xs text-orange-500">
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
