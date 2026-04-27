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

  // イベント編集フォーム
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSaving, setEditSaving] = useState(false);

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

  // イベント編集を開始
  const handleEditOpen = () => {
    if (!event) return;
    setEditName(event.name);
    setEditDate(event.event_date || '');
    setEditTime(event.event_time || '');
    setEditVenue(event.venue || '');
    setEditDescription(event.description || '');
    setIsEditing(true);
  };

  // イベント編集を保存
  const handleEditSave = async () => {
    if (!editName.trim()) {
      alert('イベント名は必須です');
      return;
    }
    setEditSaving(true);
    const { error } = await supabase
      .from('events')
      .update({
        name: editName.trim(),
        event_date: editDate || null,
        event_time: editTime || null,
        venue: editVenue.trim() || null,
        description: editDescription.trim() || null,
      })
      .eq('id', eventId);
    setEditSaving(false);
    if (error) {
      alert(`更新に失敗しました: ${error.message}`);
      return;
    }
    setIsEditing(false);
    await fetchData();
  };

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
    } else if (error.code === '23505') {
      // PostgreSQL unique constraint violation
      alert('このメールアドレスは既にこのイベントに登録されています');
    } else {
      alert(`追加エラー: ${error.message}`);
    }
    setAddingGuest(false);
  };

  // CSV1行を引用符・カンマエスケープ対応でパース
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // エスケープされた引用符
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // ヘッダ行判定（英語/日本語両対応）
  const isHeaderRow = (cols: string[]): boolean => {
    const joined = cols.join(' ').toLowerCase();
    if (joined.includes('name') || joined.includes('email') || joined.includes('mail')) {
      return true;
    }
    return cols.some(
      (c) =>
        c.includes('名前') ||
        c.includes('氏名') ||
        c.includes('メール') ||
        c.includes('Eメール')
    );
  };

  // ファイルアップロード（CSV / Excel 両対応）
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    setCsvResult(null);

    let rawRows: string[][] = [];

    try {
      const ext = file.name.toLowerCase().split('.').pop() || '';
      const isExcel =
        ext === 'xlsx' ||
        ext === 'xls' ||
        file.type ===
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel';

      if (isExcel) {
        // Excelファイル: xlsxライブラリを動的インポート（CSVのみ利用者には負荷ゼロ）
        const XLSX = await import('xlsx');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setCsvResult('ファイルにシートが含まれていません');
          setCsvUploading(false);
          return;
        }
        const sheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
        });
        rawRows = json
          .map((row) =>
            Array.isArray(row)
              ? row.map((cell) => String(cell ?? '').trim())
              : []
          )
          .filter((row) => row.some((c) => c)); // 完全空行はスキップ
      } else {
        // CSVファイル
        let text = await file.text();
        // BOM除去
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l);
        rawRows = lines.map(parseCsvLine);
      }
    } catch (err) {
      console.error('ファイル読み込みエラー:', err);
      setCsvResult('ファイルの読み込みに失敗しました');
      setCsvUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // ヘッダ判定
    const dataRows =
      rawRows.length > 0 && isHeaderRow(rawRows[0])
        ? rawRows.slice(1)
        : rawRows;

    const rows: {
      event_id: string;
      name: string;
      email: string;
      organization: string | null;
    }[] = [];
    for (const cols of dataRows) {
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
      setCsvResult(
        '有効な行がありませんでした。形式: 名前,メール,組織名(任意)'
      );
      setCsvUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // ファイル内の重複（同じメール）を排除：後勝ちで1件にまとめる
    const dedupedMap = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      dedupedMap.set(row.email.toLowerCase(), row);
    }
    const dedupedRows = Array.from(dedupedMap.values());
    const fileDupCount = rows.length - dedupedRows.length;

    // 既存ゲストとの重複をチェック
    const { data: existingGuests } = await supabase
      .from('guests')
      .select('email')
      .eq('event_id', eventId)
      .in(
        'email',
        dedupedRows.map((r) => r.email)
      );
    const existingEmails = new Set(
      (existingGuests || []).map((g) => g.email.toLowerCase())
    );
    const newRows = dedupedRows.filter(
      (r) => !existingEmails.has(r.email.toLowerCase())
    );
    const existingDupCount = dedupedRows.length - newRows.length;

    if (newRows.length === 0) {
      const parts = [`全${rows.length}件のゲストは既に登録済みのためスキップしました`];
      if (fileDupCount > 0)
        parts.push(`（うちファイル内重複 ${fileDupCount}件）`);
      setCsvResult(parts.join(''));
    } else {
      const { error } = await supabase.from('guests').insert(newRows);
      if (error) {
        setCsvResult(`エラー: ${error.message}`);
      } else {
        const parts = [`${newRows.length}件のゲストを追加しました`];
        if (existingDupCount > 0)
          parts.push(`（${existingDupCount}件は既に登録済みのためスキップ）`);
        if (fileDupCount > 0)
          parts.push(`（ファイル内重複 ${fileDupCount}件はスキップ）`);
        setCsvResult(parts.join(''));
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
    return (
      <div
        className="min-h-screen flex items-center justify-center text-forest-60 text-sm font-jp"
        style={{ fontFamily: 'var(--font-jp)' }}
      >
        読み込み中...
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p
          className="text-forest-60 font-jp"
          style={{ fontFamily: 'var(--font-jp)' }}
        >
          イベントが見つかりません
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-[10px] uppercase tracking-[0.22em] text-forest hover:opacity-70 transition-opacity"
          style={{ fontFamily: 'var(--font-mark)' }}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // S/PASS Design System: 共通スタイル
  const inputBase =
    'w-full bg-transparent border-b-[0.5px] border-forest-30 focus:border-forest outline-none py-2 text-sm text-forest placeholder:text-forest-30 transition-colors';
  const primaryBtn =
    'px-4 py-2 text-[11px] uppercase tracking-[0.22em] bg-forest text-cream hover:opacity-90 transition-opacity disabled:opacity-40';
  const secondaryBtn =
    'px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] border-[0.5px] border-forest text-forest hover:bg-forest hover:text-cream transition-colors';

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
      {/* ヘッダ */}
      <button
        onClick={() => router.push('/dashboard')}
        className="text-[10px] uppercase tracking-[0.22em] text-forest-60 hover:text-forest mb-6 inline-block transition-colors"
        style={{ fontFamily: 'var(--font-mark)' }}
      >
        &larr; Back to Dashboard
      </button>

      {!isEditing ? (
        <div className="mb-8 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1
              className="text-2xl md:text-3xl text-forest font-jp"
              style={{ fontFamily: 'var(--font-jp)' }}
            >
              {event.name}
            </h1>
            <div
              className="flex flex-wrap gap-3 text-xs text-forest-60 mt-2 font-jp"
              style={{ fontFamily: 'var(--font-jp)' }}
            >
              {event.event_date && <span>📅 {event.event_date}</span>}
              {event.event_time && <span>🕐 {event.event_time}</span>}
              {event.venue && <span>📍 {event.venue}</span>}
            </div>
            {event.description && (
              <p
                className="text-sm text-forest-80 mt-3 whitespace-pre-wrap font-jp"
                style={{ fontFamily: 'var(--font-jp)' }}
              >
                {event.description}
              </p>
            )}
          </div>
          <button
            onClick={handleEditOpen}
            className={`${secondaryBtn} flex-shrink-0`}
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="bg-mist border-[0.5px] border-forest p-5 mb-8 space-y-4">
          <h2
            className="text-[10px] uppercase tracking-[0.22em] text-forest-60"
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            Edit Event
          </h2>
          <input
            type="text"
            placeholder="イベント名 *"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className={`${inputBase} font-jp`}
            style={{ fontFamily: 'var(--font-jp)' }}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className={inputBase}
            />
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className={inputBase}
            />
          </div>
          <input
            type="text"
            placeholder="会場"
            value={editVenue}
            onChange={(e) => setEditVenue(e.target.value)}
            className={`${inputBase} font-jp`}
            style={{ fontFamily: 'var(--font-jp)' }}
          />
          <textarea
            placeholder="説明（招待メールにも記載されます）"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            rows={3}
            className={`${inputBase} resize-none font-jp`}
            style={{ fontFamily: 'var(--font-jp)' }}
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleEditSave}
              disabled={editSaving}
              className={primaryBtn}
              style={{ fontFamily: 'var(--font-mark)' }}
            >
              {editSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              disabled={editSaving}
              className={secondaryBtn}
              style={{ fontFamily: 'var(--font-mark)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ステータスカウント（バッジ色は機能色として保持） */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {(['invited', 'attending', 'declined', 'checked_in'] as GuestStatus[]).map((s) => (
          <div
            key={s}
            className="bg-cream border-[0.5px] border-forest-30 p-4 text-center"
          >
            <div
              className="text-3xl text-forest italic"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {statusCounts[s] || 0}
            </div>
            <div
              className={`text-xs font-medium mt-2 inline-block px-2 py-0.5 rounded-full ${STATUS_BADGE[s].color}`}
            >
              {STATUS_BADGE[s].label}
            </div>
          </div>
        ))}
      </div>

      {/* アクションボタン（招待=Primary、他=Secondary） */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}/invite`)}
          className={primaryBtn}
          style={{ fontFamily: 'var(--font-mark)' }}
        >
          Send Invitation
        </button>
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}/remind`)}
          className={secondaryBtn}
          style={{ fontFamily: 'var(--font-mark)' }}
        >
          Send Reminder
        </button>
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}/checkin`)}
          className={secondaryBtn}
          style={{ fontFamily: 'var(--font-mark)' }}
        >
          Check-in Status
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
          onClick={handleCsvExport}
          className={secondaryBtn}
          style={{ fontFamily: 'var(--font-mark)' }}
        >
          Export CSV
        </button>
      </div>

      {/* ゲスト追加フォーム */}
      <div className="bg-cream border-[0.5px] border-forest-30 p-5 mb-4">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-forest-60 mb-4"
          style={{ fontFamily: 'var(--font-mark)' }}
        >
          Add Guest
        </h2>
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <input
            type="text"
            placeholder="名前 *"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className={`flex-1 ${inputBase} font-jp`}
            style={{ fontFamily: 'var(--font-jp)' }}
          />
          <input
            type="email"
            placeholder="メール *"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className={`flex-1 ${inputBase}`}
          />
          <input
            type="text"
            placeholder="組織名（任意）"
            value={guestOrg}
            onChange={(e) => setGuestOrg(e.target.value)}
            className={`flex-1 ${inputBase} font-jp`}
            style={{ fontFamily: 'var(--font-jp)' }}
          />
          <button
            onClick={handleAddGuest}
            disabled={addingGuest}
            className={`${primaryBtn} whitespace-nowrap`}
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            {addingGuest ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>

      {/* ファイルアップロード（CSV / Excel） */}
      <div className="bg-cream border-[0.5px] border-forest-30 p-5 mb-8">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-forest-60 mb-2"
          style={{ fontFamily: 'var(--font-mark)' }}
        >
          File Import (CSV / Excel)
        </h2>
        <p
          className="text-xs text-forest-60 mb-3 font-jp leading-relaxed"
          style={{ fontFamily: 'var(--font-jp)' }}
        >
          列の順序: <strong className="text-forest">名前</strong>,{' '}
          <strong className="text-forest">メール</strong>, 組織名(任意)
          <br />
          ※1行目がヘッダ（「名前」「メール」「name」等）の場合は自動スキップ
          <br />
          ※Excelの場合は最初のシートが読み込まれます
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFileUpload}
            className="text-sm text-forest-60"
          />
          {csvUploading && (
            <span
              className="text-sm text-forest-60 font-jp"
              style={{ fontFamily: 'var(--font-jp)' }}
            >
              処理中...
            </span>
          )}
        </div>
        {csvResult && (
          <p
            className={`text-sm mt-3 font-jp ${
              csvResult.startsWith('エラー') ? 'text-red-700' : 'text-forest'
            }`}
            style={{ fontFamily: 'var(--font-jp)' }}
          >
            {csvResult}
          </p>
        )}
      </div>

      {/* ゲストテーブル */}
      <div className="bg-cream border-[0.5px] border-forest-30 overflow-hidden">
        <div className="px-4 py-3 border-b-[0.5px] border-forest-30 flex items-center gap-2">
          <h2
            className="text-[10px] uppercase tracking-[0.22em] text-forest-60"
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            Guest List
          </h2>
          <span
            className="text-[10px] uppercase tracking-[0.22em] text-forest-60"
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            ({guests.length})
          </span>
        </div>
        {guests.length === 0 ? (
          <p
            className="text-sm text-forest-60 text-center py-10 font-jp"
            style={{ fontFamily: 'var(--font-jp)' }}
          >
            ゲストがいません。上のフォームから追加してください。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-mist">
                <tr>
                  <th
                    className="text-left px-4 py-2.5 text-forest-60 text-[10px] uppercase tracking-[0.22em]"
                    style={{ fontFamily: 'var(--font-mark)' }}
                  >
                    Name
                  </th>
                  <th
                    className="text-left px-4 py-2.5 text-forest-60 text-[10px] uppercase tracking-[0.22em]"
                    style={{ fontFamily: 'var(--font-mark)' }}
                  >
                    Email
                  </th>
                  <th
                    className="text-left px-4 py-2.5 text-forest-60 text-[10px] uppercase tracking-[0.22em] hidden md:table-cell"
                    style={{ fontFamily: 'var(--font-mark)' }}
                  >
                    Organization
                  </th>
                  <th
                    className="text-center px-4 py-2.5 text-forest-60 text-[10px] uppercase tracking-[0.22em]"
                    style={{ fontFamily: 'var(--font-mark)' }}
                  >
                    Status
                  </th>
                  <th
                    className="text-center px-4 py-2.5 text-forest-60 text-[10px] uppercase tracking-[0.22em]"
                    style={{ fontFamily: 'var(--font-mark)' }}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr
                    key={g.id}
                    className="border-t-[0.5px] border-forest-30 hover:bg-mist transition-colors"
                  >
                    <td
                      className="px-4 py-3 text-forest font-jp"
                      style={{ fontFamily: 'var(--font-jp)' }}
                    >
                      {g.name}
                    </td>
                    <td className="px-4 py-3 text-forest-80">{g.email}</td>
                    <td
                      className="px-4 py-3 text-forest-60 hidden md:table-cell font-jp"
                      style={{ fontFamily: 'var(--font-jp)' }}
                    >
                      {g.organization || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[g.status].color}`}
                      >
                        {STATUS_BADGE[g.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteGuest(g)}
                        className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
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
