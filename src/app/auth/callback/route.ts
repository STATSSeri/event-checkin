import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // 新規ユーザーには「メールOTPによる二段階認証」をデフォルトで有効化する。
      //
      // user_security_meta レコードが未作成の場合のみ INSERT する
      // (ignoreDuplicates: true)。既存ユーザーが過去に明示的に方式を
      // 選択している場合 (= レコード存在) は ON CONFLICT DO NOTHING で
      // その設定が保たれる。
      //
      // パスワードリセットや既存メアド変更フローでこの callback が呼ばれた場合:
      //   - 既にレコードがあるユーザー: 影響なし(挿入スキップ)
      //   - 稀に存在するレコード未作成の旧ユーザー: メールOTPが有効化される
      //     -> 次回 /dashboard アクセス時に登録メールに OTP が届く流れ
      //        受信できない事態を避けるためあえて挿入する設計
      const service = createServiceClient();
      const { error: upsertError } = await service
        .from('user_security_meta')
        .upsert(
          {
            user_id: data.user.id,
            preferred_mfa_method: 'email',
          },
          { onConflict: 'user_id', ignoreDuplicates: true },
        );
      if (upsertError) {
        // 失敗してもログインフロー自体は止めない (デフォルト適用が失敗するだけ)
        console.error('[auth-callback] preferred mfa default upsert failed:', upsertError);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/?error=auth`);
}
