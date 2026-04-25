import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Resolve the public origin: prefer NEXT_PUBLIC_APP_URL (set in Caprover env)
// to handle reverse-proxy deployments where request.url has the internal address.
function getPublicOrigin(requestUrl: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && appUrl !== 'http://localhost:3000') {
    return appUrl.replace(/\/$/, '');
  }
  return new URL(requestUrl).origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/';
  // Prevent open redirect: only allow same-origin relative paths
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const origin = getPublicOrigin(request.url);

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    } catch (err) {
      console.error('[auth/callback] unexpected error:', err);
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
