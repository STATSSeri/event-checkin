'use client';

/**
 * /mfa-challenge
 *
 * MFA 有効ユーザーが、パスワードログイン直後に第二要素を検証して
 * ダッシュボードへ進むためのページ。
 *
 * 入場フロー:
 *   1. / (ログイン) で signInWithPassword 成功 → セッションは AAL1
 *   2. middleware.ts が /dashboard アクセス時に MFA フローを判定し、
 *      MFA 必須なら /mfa-challenge へリダイレクト
 *   3. ここで verify 成功 → /dashboard へ遷移
 *
 * 対応する方式:
 *   - email : 独自実装。登録メールに 6 桁コードを送信し、サーバ側で検証
 *             (`user_security_meta.last_mfa_verified_at` を更新)
 *   - totp  : Supabase Auth 標準。AAL2 に昇格させる
 *
 *   ユーザーごとの preferred は `user_security_meta.preferred_mfa_method`。
 *   両方使えるユーザーは画面下部のリンクで切替可能。
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'email' | 'totp';

interface InitState {
  /** どちらのフォームを最初に出すか */
  initialMode: Mode;
  /** TOTP factor が登録済か（切替UIの可否判定に使う） */
  hasTotpFactor: boolean;
  /** 表示用のマスク済みメアド */
  maskedEmail: string | null;
  /** TOTP の verified factor id（あれば） */
  totpFactorId: string | null;
}

function ChallengeForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/dashboard';

  const [state, setState] = useState<InitState | null>(null);
  const [mode, setMode] = useState<Mode>('email');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // TOTP 用
  const [totpCode, setTotpCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);

  // Email OTP 用
  const [emailCode, setEmailCode] = useState('');
  const [emailSendLoading, setEmailSendLoading] = useState(false);
  const [emailVerifyLoading, setEmailVerifyLoading] = useState(false);
  const [emailCodeRequested, setEmailCodeRequested] = useState(false);

  const init = useCallback(async () => {
    // ユーザーの preferred_mfa_method と TOTP factor を並行取得
    const [factorsResult, metaResult, userResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase
        .from('user_security_meta')
        .select('preferred_mfa_method')
        .maybeSingle(),
      supabase.auth.getUser(),
    ]);

    const totp = (factorsResult.data?.totp ?? []).find(
      (f) => f.status === 'verified',
    );
    const preferred = (metaResult.data?.preferred_mfa_method ?? null) as
      | Mode
      | null;
    const email = userResult.data.user?.email ?? null;

    // MFA 未設定（preferred=NULL かつ TOTP factor もない）ならそのまま遷移
    if (!preferred && !totp) {
      router.replace(nextPath);
      return;
    }

    const initialMode: Mode = preferred ?? (totp ? 'totp' : 'email');
    setMode(initialMode);
    setState({
      initialMode,
      hasTotpFactor: Boolean(totp),
      maskedEmail: email ? maskEmail(email) : null,
      totpFactorId: totp?.id ?? null,
    });
  }, [supabase, router, nextPath]);

  useEffect(() => {
    init();
  }, [init]);

  const handleSendEmail = async () => {
    setError('');
    setInfo('');
    setEmailSendLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/email/send', { method: 'POST' });
      const data: { ok?: boolean; error?: string; sentTo?: string } =
        await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? '認証コードの送信に失敗しました');
      }
      setEmailCodeRequested(true);
      setInfo(`認証コードを ${data.sentTo ?? 'ご登録のメール'} に送信しました。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '認証コードの送信に失敗しました');
    } finally {
      setEmailSendLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailVerifyLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: emailCode.trim() }),
      });
      const data: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? '認証コードが正しくありません');
      }
      // サーバ側で last_mfa_verified_at が更新済み。
      // middleware が再判定するようフルリロードする。
      window.location.replace(nextPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : '認証コードの検証に失敗しました');
      setEmailVerifyLoading(false);
    }
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state?.totpFactorId) return;
    setError('');
    setTotpLoading(true);
    const { data: challenge, error: challengeErr } =
      await supabase.auth.mfa.challenge({ factorId: state.totpFactorId });
    if (challengeErr || !challenge) {
      setError(`チャレンジの生成に失敗しました: ${challengeErr?.message ?? ''}`);
      setTotpLoading(false);
      return;
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: state.totpFactorId,
      challengeId: challenge.id,
      code: totpCode.trim(),
    });
    if (verifyErr) {
      setTotpLoading(false);
      setError(
        verifyErr.message?.includes('Invalid') ||
          verifyErr.message?.includes('expired')
          ? '認証コードが正しくありません（コードは30秒で期限切れになります）'
          : `認証エラー: ${verifyErr.message}`,
      );
      return;
    }
    // verify 成功時、Supabase の cookie / session が AAL2 に更新される。
    // router.replace だと middleware が古い cookie を読んで /mfa-challenge に
    // ループバックする事例があるため、明示的にセッション再取得 → フルリロードする。
    await supabase.auth.refreshSession();
    window.location.replace(nextPath);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
    setEmailCode('');
    setTotpCode('');
  };

  if (!state) {
    return <p className="text-sm text-forest-60 text-center">読み込み中...</p>;
  }

  return (
    <div className="space-y-4">
      {mode === 'email' ? (
        <EmailForm
          maskedEmail={state.maskedEmail}
          code={emailCode}
          setCode={setEmailCode}
          codeRequested={emailCodeRequested}
          sendLoading={emailSendLoading}
          verifyLoading={emailVerifyLoading}
          onSend={handleSendEmail}
          onVerify={handleVerifyEmail}
          error={error}
          info={info}
        />
      ) : (
        <TotpForm
          code={totpCode}
          setCode={setTotpCode}
          loading={totpLoading}
          onVerify={handleVerifyTotp}
          error={error}
        />
      )}

      {state.hasTotpFactor && mode === 'email' && (
        <button
          type="button"
          onClick={() => switchMode('totp')}
          className="w-full text-xs text-forest-60 hover:text-forest underline"
        >
          認証アプリ（TOTP）で認証する
        </button>
      )}
      {mode === 'totp' && (
        <button
          type="button"
          onClick={() => switchMode('email')}
          className="w-full text-xs text-forest-60 hover:text-forest underline"
        >
          メールで認証コードを受け取る
        </button>
      )}

      <button
        type="button"
        onClick={handleSignOut}
        className="w-full text-xs text-forest-60 hover:text-forest underline"
      >
        別のアカウントでログイン
      </button>
    </div>
  );
}

interface EmailFormProps {
  maskedEmail: string | null;
  code: string;
  setCode: (v: string) => void;
  codeRequested: boolean;
  sendLoading: boolean;
  verifyLoading: boolean;
  onSend: () => void;
  onVerify: (e: React.FormEvent) => void;
  error: string;
  info: string;
}

function EmailForm(props: EmailFormProps) {
  const {
    maskedEmail,
    code,
    setCode,
    codeRequested,
    sendLoading,
    verifyLoading,
    onSend,
    onVerify,
    error,
    info,
  } = props;

  return (
    <form onSubmit={onVerify} className="space-y-4">
      <p className="text-sm text-forest-60 leading-relaxed">
        {maskedEmail
          ? `ご登録のメールアドレス ${maskedEmail} に6桁の認証コードを送信します。`
          : 'ご登録のメールアドレスに6桁の認証コードを送信します。'}
      </p>

      {!codeRequested && (
        <button
          type="button"
          onClick={onSend}
          disabled={sendLoading}
          className="w-full py-2.5 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-40 font-medium text-sm tracking-[0.08em]"
        >
          {sendLoading ? '送信中...' : 'メールで認証コードを送信'}
        </button>
      )}

      {codeRequested && (
        <>
          <div>
            <label
              htmlFor="email-code"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              認証コード
            </label>
            <input
              id="email-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))
              }
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900 tracking-widest text-center text-lg"
              placeholder="123456"
            />
          </div>
          <button
            type="submit"
            disabled={verifyLoading || code.length !== 6}
            className="w-full py-2.5 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-40 font-medium text-sm tracking-[0.08em]"
          >
            {verifyLoading ? '確認中...' : '確認'}
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={sendLoading}
            className="w-full text-xs text-forest-60 hover:text-forest underline"
          >
            {sendLoading ? '再送信中...' : '認証コードを再送信'}
          </button>
        </>
      )}

      {info && !error && <p className="text-forest text-xs">{info}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}

interface TotpFormProps {
  code: string;
  setCode: (v: string) => void;
  loading: boolean;
  onVerify: (e: React.FormEvent) => void;
  error: string;
}

function TotpForm(props: TotpFormProps) {
  const { code, setCode, loading, onVerify, error } = props;
  return (
    <form onSubmit={onVerify} className="space-y-4">
      <p className="text-sm text-forest-60 leading-relaxed">
        認証アプリに表示されている6桁の認証コードを入力してください。
      </p>
      <div>
        <label
          htmlFor="totp-code"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          認証コード
        </label>
        <input
          id="totp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))
          }
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forest text-gray-900 tracking-widest text-center text-lg"
          placeholder="123456"
        />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="w-full py-2.5 px-4 bg-forest text-cream rounded-md hover:opacity-90 disabled:opacity-40 font-medium text-sm tracking-[0.08em]"
      >
        {loading ? '確認中...' : '確認'}
      </button>
    </form>
  );
}

/** "yamada@example.com" → "y****@example.com" */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

export default function MfaChallengePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1
            className="text-3xl text-forest tracking-[0.32em] mb-2"
            style={{
              fontFamily: 'var(--font-mark)',
              fontWeight: 700,
              paddingLeft: '0.32em',
            }}
          >
            S/PASS
          </h1>
          <p
            className="text-[10px] uppercase tracking-[0.28em] text-forest-60"
            style={{ fontFamily: 'var(--font-mark)' }}
          >
            Two-Factor Authentication
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <Suspense
            fallback={
              <p className="text-sm text-forest-60 text-center">
                読み込み中...
              </p>
            }
          >
            <ChallengeForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
