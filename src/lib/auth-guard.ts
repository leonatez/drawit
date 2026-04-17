import { NextResponse } from 'next/server';
import { createClient, createAdminSupabase } from '@/lib/supabase/server';

export type AuthGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Verifies the request has a valid Supabase session AND the user's profile
 * has user_type of 'member' or 'admin'. Returns 401 or 403 otherwise.
 */
export async function requireMember(): Promise<AuthGuardResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 },
      ),
    };
  }

  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  const role = profile?.user_type ?? 'guest';
  if (role !== 'member' && role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Your account must be upgraded to Member by an admin before you can use AI features.' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, userId: user.id };
}
