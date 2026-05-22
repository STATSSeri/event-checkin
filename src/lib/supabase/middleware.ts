import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * メールOTP検証後、再検証なしで通過させる最大経過秒数（12時間）。
 * src/lib/mfa-email.ts の OTP_VERIFIED_VALID_SECONDS と一致させること。
 * （middleware は Edge ランタイムで動く場合があり、Node 専用モジュールを
 *  import できないため定数をここに重複定義する）
 */
const OTP_VERIFIED_VALID_SECONDS = 12 * 60 * 60;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const requiresAuth =
    pathname.startsWith('/dashboard') || pathname.startsWith('/scan');

  // /dashboard と /scan は認証必須
  if (!user && requiresAuth) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (!user || !requiresAuth || pathname.startsWith('/mfa-challenge')) {
    return supabaseResponse;
  }

  // MFA フロー判定
  //   preferred_mfa_method = 'email' → メールOTPフロー
  //     last_mfa_verified_at が直近 12 時間以内なら通す。
  //     それ以外は /mfa-challenge へ。
  //   それ以外 (= 'totp' または NULL = レガシー扱い) → 従来の AAL2 フロー
  //     Supabase の TOTP factor がアカウントに紐付いていて
  //     nextLevel='aal2' なら currentLevel='aal1' のうちは /mfa-challenge へ。
  const { data: meta } = await supabase
    .from('user_security_meta')
    .select('preferred_mfa_method, last_mfa_verified_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (meta?.preferred_mfa_method === 'email') {
    const verifiedAt = meta.last_mfa_verified_at
      ? new Date(meta.last_mfa_verified_at).getTime()
      : 0;
    const fresh = verifiedAt > 0 &&
      Date.now() - verifiedAt < OTP_VERIFIED_VALID_SECONDS * 1000;
    if (!fresh) {
      const url = request.nextUrl.clone();
      url.pathname = '/mfa-challenge';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // レガシー / TOTP ユーザー: AAL2 を要求
  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (
    aalData?.currentLevel === 'aal1' &&
    aalData?.nextLevel === 'aal2'
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/mfa-challenge';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
