'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type ScanResult = {
  type: 'success' | 'already' | 'invalid';
  name?: string;
  checkedInAt?: string;
};

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-500">読み込み中...</p>
        </div>
      }
    >
      <ScanContent />
    </Suspense>
  );
}

function ScanContent() {
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<unknown>(null);
  const processedRef = useRef(false);
  const supabase = createClient();
  const searchParams = useSearchParams();

  // tokenでチェックイン処理
  const processToken = useCallback(
    async (token: string) => {
      if (processedRef.current) return;
      processedRef.current = true;
      setProcessing(true);

      // スキャン中は一時停止
      try {
        const scanner = html5QrCodeRef.current as { pause?: () => void };
        if (scanner?.pause) scanner.pause();
      } catch {
        /* 無視 */
      }

      // RPC関数でatomicにチェックイン（同時スキャン競合防止）
      const { data, error } = await supabase.rpc('checkin_guest', {
        guest_token: token,
      });

      if (error || !data) {
        setResult({ type: 'invalid' });
      } else if (data.status === 'not_found') {
        setResult({ type: 'invalid' });
      } else if (data.status === 'already_checked_in') {
        setResult({
          type: 'already',
          name: data.name,
          checkedInAt: data.checked_in_at,
        });
      } else if (data.status === 'success') {
        setResult({
          type: 'success',
          name: data.name,
        });
      }

      setProcessing(false);

      // 3秒後に自動リセット
      setTimeout(() => {
        setResult(null);
        processedRef.current = false;
        try {
          const scanner = html5QrCodeRef.current as { resume?: () => void };
          if (scanner?.resume) scanner.resume();
        } catch {
          /* 無視 */
        }
      }, 3000);
    },
    [supabase]
  );

  // URLパラメータにtokenがあれば自動処理
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      processToken(token);
    }
  }, [searchParams, processToken]);

  // QRスキャン結果処理
  const handleScan = useCallback(
    async (decodedText: string) => {
      if (processedRef.current) return;

      // URLからtokenを抽出
      let token: string | null = null;
      try {
        const url = new URL(decodedText);
        token = url.searchParams.get('token');
      } catch {
        token = decodedText;
      }

      if (!token) {
        setResult({ type: 'invalid' });
        setTimeout(() => {
          setResult(null);
          processedRef.current = false;
        }, 3000);
        return;
      }

      await processToken(token);
    },
    [processToken]
  );

  // カメラ起動
  useEffect(() => {
    // URLにtokenがある場合はカメラ不要
    if (searchParams.get('token')) return;

    let mounted = true;

    const startScanner = async () => {
      if (!scannerRef.current || !mounted) return;

      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            if (mounted) handleScan(decodedText);
          },
          () => {}
        );
        if (mounted) setScanning(true);
      } catch (err) {
        console.error('カメラ起動エラー:', err);
        if (mounted) {
          setCameraError(
            'カメラを起動できませんでした。\nブラウザの設定でカメラへのアクセスを許可してください。'
          );
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      const scanner = html5QrCodeRef.current as {
        stop?: () => Promise<void>;
        clear?: () => void;
      };
      if (scanner?.stop) {
        scanner.stop().catch(() => {});
      }
      if (scanner?.clear) {
        scanner.clear();
      }
    };
  }, [handleScan, searchParams]);

  // 結果表示の背景色
  const getBgColor = () => {
    if (!result) return 'bg-gray-50';
    switch (result.type) {
      case 'success':
        return 'bg-green-500';
      case 'already':
        return 'bg-red-500';
      case 'invalid':
        return 'bg-gray-700';
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${getBgColor()}`}
    >
      {/* 結果オーバーレイ */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
          <div className="text-center text-white">
            {result.type === 'success' && (
              <>
                <div className="text-8xl mb-4">✓</div>
                <p className="text-3xl font-bold mb-2">{result.name}</p>
                <p className="text-xl">入場OK</p>
              </>
            )}
            {result.type === 'already' && (
              <>
                <div className="text-6xl mb-4">⚠️</div>
                <p className="text-3xl font-bold mb-2">{result.name}</p>
                <p className="text-xl mb-2">入場済みです</p>
                {result.checkedInAt && (
                  <p className="text-sm opacity-80">
                    入場時刻:{' '}
                    {new Date(result.checkedInAt).toLocaleTimeString('ja-JP')}
                  </p>
                )}
              </>
            )}
            {result.type === 'invalid' && (
              <>
                <div className="text-6xl mb-4">✕</div>
                <p className="text-2xl font-bold">無効なQRコードです</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* 処理中 */}
      {processing && !result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50">
          <p className="text-xl text-gray-600">確認中...</p>
        </div>
      )}

      {/* スキャナー */}
      {!searchParams.get('token') && (
        <div
          className={`${result ? 'opacity-0' : 'opacity-100'} transition-opacity`}
        >
          <div className="max-w-lg mx-auto p-4">
            <h1 className="text-xl font-bold text-center text-gray-800 mb-4 pt-4">
              QRスキャン
            </h1>

            <div
              id="qr-reader"
              ref={scannerRef}
              className="w-full rounded-lg overflow-hidden"
            />

            {!scanning && !cameraError && (
              <p className="text-center text-gray-500 mt-4">
                カメラを起動中...
              </p>
            )}

            {cameraError && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-center whitespace-pre-line">
                  {cameraError}
                </p>
              </div>
            )}

            {scanning && (
              <p className="text-center text-gray-400 text-sm mt-4">
                QRコードをカメラにかざしてください
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
