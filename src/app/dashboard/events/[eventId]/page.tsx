'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Event, Guest, GuestStatus } from '@/types';
import { RichTextEditor } from '@/components/RichTextEditor';
import { isValidFromHeader } from '@/lib/email-validation';

// 表示用ステータス: DB上は status='invited' + invitation_sent_at IS NULL の状態を
// 「招待メール未送信(pending)」として表示し分ける
type DisplayStatus = 'pending' | GuestStatus;

const STATUS_BADGE: Record<DisplayStatus, { label: string; color: string }> = {
  pending: { label: '招待メール未送信', color: 'bg-orange-50 text-orange-700 border border-orange-200' },
  invited: { label: '招待済', color: 'bg-gray-100 text-gray-700' },
  attending: { label: '出席', color: 'bg-blue-100 text-blue-700' },
  declined: { label: '欠席', color: 'bg-red-100 text-red-700' },
  checked_in: { label: '入場済', color: 'bg-green-100 text-green-700' },
};

// ゲストの実際のDB値から表示用ステータスを算出
function getDisplayStatus(g: Guest): DisplayStatus {
  if (g.status === 'invited' && !g.invitation_sent_at) {
    return 'pending';
  }
  return g.status;
}

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
  const [editFromEmail, setEditFromEmail] = useState('');
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

  // ステータス別カウント（表示用ステータスベース）
  const statusCounts = guests.reduce(
    (acc, g) => {
      const ds = getDisplayStatus(g);
      acc[ds] = (acc[ds] || 0) + 1;
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
    setEditFromEmail(event.from_email || '');
    setIsEditing(true);
  };

  // イベント編集を保存
  const handleEditSave = async () => {
    if (!editName.trim()) {
      alert('イベント名は必須です');
      return;
    }

    // 送信元アドレスのバリデーション（ヘッダーインジェクション対策）
    const trimmedFromEmail = editFromEmail.trim();
    if (trimmedFromEmail && !isValidFromHeader(trimmedFromEmail)) {
      alert(
        '送信元メールアドレスの形式が正しくありません。\n' +
          '例: events@brand.com\n' +
          '例: ブランド名 <events@brand.com>\n' +
          '改行や制御文字、引用符などは使用できません。',
      );
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
        from_email: trimmedFromEmail || null,
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
      [g.name, g.email, g.organization || '', STATUS_BADGE[getDisplayStatus(g)].label, g.checked_in_at || ''].join(',')
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
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 gap-4">
        <p>イベントが見つかりません</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-blue-600 underline"
        >
          ダッシュボードに戻る
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
      {/* ヘッダ */}
      <button
        onClick={() => router.push('/dashboard')}
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        &larr; ダッシュボードに戻る
      </button>

      {!isEditing ? (
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">
              {event.name}
            </h1>
            <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-1">
              {event.event_date && <span>📅 {event.event_date}</span>}
              {event.event_time && <span>🕐 {event.event_time}</span>}
              {event.venue && <span>📍 {event.venue}</span>}
            </div>
            {event.description && (
              <div
                className="rich-content text-sm text-gray-600 mt-2"
                dangerouslySetInnerHTML={{ __html: event.description }}
              />
            )}
          </div>
          <button
            onClick={handleEditOpen}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex-shrink-0"
          >
            編集
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 space-y-3 border border-blue-200">
          <h2 className="text-sm font-bold text-gray-700">イベント情報を編集</h2>
          <input
            type="text"
            placeholder="イベント名 *"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-gray-800"
            />
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-gray-800"
            />
          </div>
          <input
            type="text"
            placeholder="会場"
            value={editVenue}
            onChange={(e) => setEditVenue(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800"
          />
          <div>
            <p className="text-xs text-gray-500 mb-1">
              説明（太字/斜体/リンク使用可、招待メールにも記載されます）
            </p>
            <RichTextEditor
              value={editDescription}
              onChange={setEditDescription}
              minHeightClass="min-h-[100px]"
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">
              送信元メールアドレス（任意）
            </p>
            <input
              type="text"
              placeholder="例: events@brand.com  または  ブランド名 <events@brand.com>"
              value={editFromEmail}
              onChange={(e) => setEditFromEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800 text-sm"
            />
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
              未指定時はデフォルト送信元（spass.tokyo）から送信されます。
              <br />
              ※ 事前に Resend で認証済みのドメインのアドレスのみ使用可能（未認証だと送信失敗）
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleEditSave}
              disabled={editSaving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {editSaving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              disabled={editSaving}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* ステータスカウント（招待メール未送信を含む5区分） */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {(['pending', 'invited', 'attending', 'declined', 'checked_in'] as DisplayStatus[]).map((s) => (
          <div
            key={s}
            className="bg-white rounded-lg shadow-sm p-3 text-center"
          >
            <div className="text-2xl font-bold text-gray-800">
              {statusCounts[s] || 0}
            </div>
            <div
              className={`text-xs font-medium mt-1 inline-block px-2 py-0.5 rounded-full ${STATUS_BADGE[s].color}`}
            >
              {STATUS_BADGE[s].label}
            </div>
          </div>
        ))}
      </div>

      {/* アクションボタン（元の機能色＋日本語ラベル） */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}/invite`)}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          招待メール送信
        </button>
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}/remind`)}
          className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
        >
          リマインド送信
        </button>
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}/day-before`)}
          className="px-3 py-1.5 text-sm bg-amber-700 text-white rounded-md hover:bg-amber-800"
        >
          前日リマインド
        </button>
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}/checkin`)}
          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
        >
          入場状況
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
          onClick={handleCsvExport}
          className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          CSVエクスポート
        </button>
      </div>

      {/* ゲスト追加フォーム */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-3">ゲスト追加</h2>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            type="text"
            placeholder="名前 *"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-800"
          />
          <input
            type="email"
            placeholder="メール *"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-800"
          />
          <input
            type="text"
            placeholder="組織名（任意）"
            value={guestOrg}
            onChange={(e) => setGuestOrg(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-800"
          />
          <button
            onClick={handleAddGuest}
            disabled={addingGuest}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {addingGuest ? '追加中...' : '追加'}
          </button>
        </div>
      </div>

      {/* ファイルアップロード（CSV / Excel） */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <h2 className="text-sm font-bold text-gray-700 mb-2">
          ファイルインポート（CSV / Excel）
        </h2>
        <p className="text-xs text-gray-500 mb-2">
          列の順序: <strong>名前</strong>, <strong>メール</strong>, 組織名(任意)
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
            className="text-sm text-gray-600"
          />
          {csvUploading && (
            <span className="text-sm text-gray-500">処理中...</span>
          )}
        </div>
        {csvResult && (
          <p
            className={`text-sm mt-2 ${
              csvResult.startsWith('エラー') ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {csvResult}
          </p>
        )}
      </div>

      {/* ゲストテーブル */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700">
            ゲスト一覧（{guests.length}名）
          </h2>
        </div>
        {guests.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            ゲストがいません。上のフォームから追加してください。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">
                    名前
                  </th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">
                    メール
                  </th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium hidden md:table-cell">
                    組織
                  </th>
                  <th className="text-center px-4 py-2 text-gray-600 font-medium">
                    ステータス
                  </th>
                  <th className="text-center px-4 py-2 text-gray-600 font-medium">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr
                    key={g.id}
                    className="border-t border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2 text-gray-800">{g.name}</td>
                    <td className="px-4 py-2 text-gray-600">{g.email}</td>
                    <td className="px-4 py-2 text-gray-600 hidden md:table-cell">
                      {g.organization || '-'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {(() => {
                        const ds = getDisplayStatus(g);
                        return (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[ds].color}`}
                          >
                            {STATUS_BADGE[ds].label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2 text-center">
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
