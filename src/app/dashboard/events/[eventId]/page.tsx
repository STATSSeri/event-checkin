'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Event, Guest, GuestStatus } from '@/types';

const STATUS_BADGE: Record<GuestStatus, { label: string; color: string }> = {
  invited: { label: '招待済', color: 'bg-gray-100 text-gray-700' },
  attending: { label: '出席', color: 'bg-blue-100 text-blue-700' },
  declined: { label: '欠席', color: 'bg-red-100 text-red-700' },
  checked_in: { label: '入場済', color: 'bg-green-100 text-green-700' },
};

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [event, setEvent] = useState<Event | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);

  // ゲスト追加フォーム
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestOrg, setGuestOrg] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);

  // CSV アップロード
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [eventRes, guestsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('guests').select('*').eq('event_id', eventId).order('created_at', { ascending: true }),
    ]);
    setEvent(eventRes.data);
    setGuests(guestsRes.data || []);
    setLoading(false);
  }, [supabase, eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ステータス別カウント
  const statusCounts = guests.reduce(
    (acc, g) => {
      acc[g.status] = (acc[g.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // ゲスト個別追加
  const handleAddGuest = async () => {
    if (!guestName.trim() || !guestEmail.trim()) return;
    setAddingGuest(true);
    const { error } = await supabase.from('guests').insert({
      event_id: eventId,
      name: guestName.trim(),
      email: guestEmail.trim(),
      organization: guestOrg.trim() || null,
    });
    if (!error) {
      setGuestName('');
      setGuestEmail('');
      setGuestOrg('');
      await fetchData();
    } else {
      alert(`追加エラー: ${error.message}`);
    }
    setAddingGuest(false);
  };

  // CSV アップロード
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    setCsvResult(null);

    const text = await file.text();
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l);

    // ヘッダ行判定: 1行目に"name"が含まれていればスキップ
    const startIdx = lines[0]?.toLowerCase().includes('name') ? 1 : 0;

    const rows: { event_id: string; name: string; email: string; organization: string | null }[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 2 && cols[0] && cols[1]) {
        rows.push({
          event_id: eventId,
          name: cols[0],
          email: cols[1],
          organization: cols[2] || null,
        });
      }
    }

    if (rows.length === 0) {
      setCsvResult('有効な行がありませんでした。CSV形式: 名前,メール,組織名(任意)');
    } else {
      const { error } = await supabase.from('guests').insert(rows);
      if (error) {
        setCsvResult(`エラー: ${error.message}`);
      } else {
        setCsvResult(`${rows.length}件のゲストを追加しました`);
        await fetchData();
      }
    }
    setCsvUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // CSV エクスポート
  const handleCsvExport = () => {
    const header = '名前,メール,組織,ステータス,チェックイン時刻';
    const body = guests.map((g) =>
      [g.name, g.email, g.organization || '', STATUS_BADGE[g.status].label, g.checked_in_at || ''].join(',')
    );
    const csv = [header, ...body].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event?.name || 'guests'}_ゲスト一覧.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ゲスト削除
  const handleDeleteGuest = async (guest: Guest) => {
    if (!confirm(`「${guest.name}」を削除しますか？`)) return;
    await supabase.from('guests').delete().eq('id', guest.id);
    await fetchData();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>;
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 gap-4">
        <p>イベントが見つかりません</p>
        <button onClick={() => router.push('/dashboard')} className="text-blue-600 underline">ダッシュボードに戻る</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
      {/* ヘッダ */}
      <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        &larr; ダッシュボードに戻る
      </button>

      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">{event.name}</h1>
        <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-1">
          {event.event_date && <span>{event.event_date}</span>}
          {event.event_time && <span>{event.event_time}</span>}
          {event.venue && <span>{event.venue}</span>}
        </div>
        {event.description && <p className="text-sm text-gray-600 mt-2">{event.description}</p>}
      </div>

      {/* ステータスカウント */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(['invited', 'attending', 'declined', 'checked_in'] as GuestStatus[]).map((s) => (
          <div key={s} className="bg-white rounded-lg shadow-sm p-3 text-center">
            <div className="text-2xl font-bold text-gray-800">{statusCounts[s] || 0}</div>
            <div className={`text-xs font-medium mt-1 inline-block px-2 py-0.5 rounded-full ${STATUS_BADGE[s].color}`}>
              {STATUS_BADGE[s].label}
            </div>
          </div>
        ))}
      </div>

      {/* アクションボタン */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => router.push(`/dashboard/events/${eventId}/invite`)}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
          招待メール送信
        </button>
        <button onClick={() => router.push(`/dashboard/events/${eventId}/remind`)}
          className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700">
          リマインド送信
        </button>
        <button onClick={() => router.push(`/dashboard/events/${eventId}/checkin`)}
          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700">
          入場状況
        </button>
        <a href="/scan" target="_blank" rel="noopener noreferrer"
          className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 inline-flex items-center gap-1">
          📷 受付スキャン
        </a>
        <button onClick={handleCsvExport}
          className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700">
          CSVエクスポート
        </button>
      </div>

      {/* ゲスト追加フォーム */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-3">ゲスト追加</h2>
        <div className="flex flex-col md:flex-row gap-2">
          <input type="text" placeholder="名前 *" value={guestName} onChange={(e) => setGuestName(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-800" />
          <input type="email" placeholder="メール *" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-800" />
          <input type="text" placeholder="組織名（任意）" value={guestOrg} onChange={(e) => setGuestOrg(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-800" />
          <button onClick={handleAddGuest} disabled={addingGuest}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
            {addingGuest ? '追加中...' : '追加'}
          </button>
        </div>
      </div>

      {/* CSV アップロード */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <h2 className="text-sm font-bold text-gray-700 mb-2">CSVインポート</h2>
        <p className="text-xs text-gray-500 mb-2">CSV形式: 名前,メール,組織名(任意) ※1行目がヘッダの場合は自動スキップ</p>
        <div className="flex items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvUpload}
            className="text-sm text-gray-600" />
          {csvUploading && <span className="text-sm text-gray-500">処理中...</span>}
        </div>
        {csvResult && (
          <p className={`text-sm mt-2 ${csvResult.startsWith('エラー') ? 'text-red-600' : 'text-green-600'}`}>
            {csvResult}
          </p>
        )}
      </div>

      {/* ゲストテーブル */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700">ゲスト一覧（{guests.length}名）</h2>
        </div>
        {guests.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">ゲストがいません。上のフォームから追加してください。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">名前</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">メール</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium hidden md:table-cell">組織</th>
                  <th className="text-center px-4 py-2 text-gray-600 font-medium">ステータス</th>
                  <th className="text-center px-4 py-2 text-gray-600 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-800">{g.name}</td>
                    <td className="px-4 py-2 text-gray-600">{g.email}</td>
                    <td className="px-4 py-2 text-gray-600 hidden md:table-cell">{g.organization || '-'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[g.status].color}`}>
                        {STATUS_BADGE[g.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => handleDeleteGuest(g)}
                        className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
