'use client';

/**
 * 多要素認証（TOTP）の有効化・無効化 UI。
 *
 * 仕様:
 *  - 未登録: 「有効化する」ボタン → enroll() → QR コードと verify 入力
 *  - 登録済: factor 名と「無効化」ボタン
 *
 * 注意:
 *  - Supabase プロジェクト側で MFA が有効になっている必要がある
 *    （Dashboard → Authentication → Multi-Factor Auth）
 *  - 別ファクター（SMS 等）は対象外。TOTP のみ扱う
 */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface EnrolledFactor {
  id: string;
  friendlyName: string | null;
  status: 'verified' | 'unverified';
  createdAt: string | null;
}

interface PendingEnrollment {
  factorId: string;
  qrSvg: string;
  secret: string;
  uri: string;
}

export function MfaSection() {
  const supabase = createClient();
  const [factors, setFactors] = useState<EnrolledFactor[]>([]);
  const [pending, setPending] = useState<PendingEnrollment | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [friendlyName, setFriendlyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadFactors = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setError(error.message);
      return;
    }
    setFactors(
      (data.totp ?? []).map((f) => ({
        id: f.id,
        friendlyName: f.friendly_name ?? null,
        status: f.status,
        createdAt: f.created_at ?? null,
      })),
    );
  }, [supabase]);

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  const handleStartEnroll = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: friendlyName.trim() || `TOTP ${new Date().toISOString().slice(0, 10)}`,
    });
    setLoading(false);
    if (error) {
      setError(`有効化を開始できませんでした: ${error.message}`);
      return;
    }
    setPending({
      factorId: data.id,
      qrSvg: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
  };

  const handleVerify = async () => {
    if (!pending) return;
    setError('');
    setMessage('');
    setLoading(true);
    const { data: challenge, error: challengeErr } =
      await supabase.auth.mfa.challenge({ factorId: pending.factorId });
    if (challengeErr || !challenge) {
      setLoading(false);
      setError(`チャレンジ生成に失敗しました: ${challengeErr?.message ?? ''}`);
      return;
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: pending.factorId,
      challengeId: challenge.id,
      code: verifyCode.trim(),
    });
    setLoading(false);
    if (verifyErr) {
      setError(`認証コードが正しくありません: ${verifyErr.message}`);
      return;
    }
    setMessage('多要素認証を有効化しました。');
    setPending(null);
    setVerifyCode('');
    setFriendlyName('');
    await loadFactors();
  };

  const handleCancelEnroll = async () => {
    if (!pending) return;
    // unverified なファクターは残しておくと邪魔なので削除
    await supabase.auth.mfa.unenroll({ factorId: pending.factorId });
    setPending(null);
    setVerifyCode('');
    await loadFactors();
  };

  const handleUnenroll = async (factorId: string) => {
    if (!confirm('多要素認証を無効化しますか？セキュリティ要件上、有効化を推奨します。')) {
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setLoading(false);
    if (error) {
      setError(`無効化に失敗しました: ${error.message}`);
      return;
    }
    setMessage('多要素認証を無効化しました。');
    await loadFactors();
  };

  const verifiedFactors = factors.filter((f) => f.status === 'verified');

  return (
    <div className="space-y-4">
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {message && (
        <p className="text-emerald-700 text-sm leading-relaxed">{message}</p>
      )}

      {verifiedFactors.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-emerald-700 font-medium">
            ✓ 多要素認証は有効です
          </p>
          {verifiedFactors.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2"
            >
              <div className="text-sm">
                <p className="text-gray-800">
                  {f.friendlyName ?? '(無名のTOTP)'}
                </p>
                {f.createdAt && (
                  <p className="text-[11px] text-forest-60">
                    登録日:{' '}
                    {new Date(f.createdAt).toLocaleString('ja-JP', {
                      timeZone: 'Asia/Tokyo',
                    })}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleUnenroll(f.id)}
                disabled={loading}
                className="text-xs text-red-600 hover:underline disabled:opacity-40"
              >
                無効化
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-amber-700">
          ⚠ 多要素認証は無効です。アカウントの保護のため、有効化を推奨します。
        </p>
      )}

      {pending ? (
        <div className="border border-forest-30 rounded-md p-4 space-y-3 bg-cream">
          <p className="text-sm text-forest font-medium">
            認証アプリで以下のQRコードをスキャンしてください
          </p>
          <div
            className="bg-white p-3 inline-block rounded-md"
            // qrSvg は Supabase が生成した data: URI（SVG）
            // dangerouslySetInnerHTML ではなく img として埋め込む
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pending.qrSvg}
              alt="TOTP QR code"
              className="w-48 h-48"
            />
          </div>
          <p className="text-[11px] text-forest-60 leading-relaxed">
            QRコードを読み取れない場合は、シークレットを手動入力:
            <br />
            <code className="bg-white px-2 py-1 rounded mt-1 inline-block break-all">
              {pending.secret}
            </code>
          </p>
          <div>
            <label
              htmlFor="totp-code"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              6桁の認証コード
            </label>
            <input
              id="totp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verifyCode}
              onChange={(e) =>
                setVerifyCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900 tracking-widest text-center"
              placeholder="123456"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleVerify}
              disabled={loading || verifyCode.length !== 6}
              className="flex-1 py-2 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-40 font-medium text-sm"
            >
              {loading ? '確認中...' : '有効化を完了'}
            </button>
            <button
              type="button"
              onClick={handleCancelEnroll}
              disabled={loading}
              className="py-2 px-4 border border-gray-300 rounded-md hover:bg-gray-50 text-sm text-gray-700"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        verifiedFactors.length === 0 && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="friendly-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                端末ニックネーム（任意）
              </label>
              <input
                id="friendly-name"
                type="text"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder="例: iPhone Authenticator"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900"
              />
            </div>
            <button
              type="button"
              onClick={handleStartEnroll}
              disabled={loading}
              className="w-full py-2.5 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-40 font-medium text-sm tracking-[0.08em]"
            >
              {loading ? '準備中...' : '多要素認証を有効化する'}
            </button>
          </div>
        )
      )}
    </div>
  );
}
