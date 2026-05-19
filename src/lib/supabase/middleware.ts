import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  // MFA 有効ユーザーは AAL2 に達してから /dashboard, /scan へ入れる
  //   - currentLevel: 現在のセッションの AAL
  //   - nextLevel:    アカウントが要求する最低 AAL（MFA 登録済なら 'aal2'）
  // 例外: /mfa-challenge 自身と /api 配下、ログアウト中は素通し。
  if (user && requiresAuth) {
    const { data: aalData } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (
      aalData?.currentLevel === 'aal1' &&
      aalData?.nextLevel === 'aal2' &&
      !pathname.startsWith('/mfa-challenge')
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/mfa-challenge';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
