import { NextResponse } from 'next/server';
import { createClient, createAdminSupabase } from '@/lib/supabase/server';
import { TIER_LIMITS } from '@/types';

export type AuthGuardResult =
  | { ok: true; userId: string; userType: string }
  | { ok: false; response: NextResponse };

export type UsageCheckResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Verifies session and that user_type is member, premium, or admin.
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
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('user_type, subscription_expires_at')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('[auth-guard] Profile query failed:', profileError.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Failed to load user profile. Please try again.' },
        { status: 500 },
      ),
    };
  }

  const role = profile?.user_type ?? 'guest';
  if (role !== 'member' && role !== 'premium' && role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Your account must be upgraded to Member before you can use AI features.' },
        { status: 403 },
      ),
    };
  }

  // Check subscription expiry for paid tiers (admins are exempt)
  if (role !== 'admin' && profile?.subscription_expires_at) {
    const expired = new Date(profile.subscription_expires_at) < new Date();
    if (expired) {
      // Lazily downgrade — best-effort, log failures
      admin
        .from('profiles')
        .update({ user_type: 'guest', subscription_expires_at: null })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error) console.error('[auth-guard] Failed to downgrade expired subscription:', error.message);
        });
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Your subscription has expired. Please renew to continue using AI features.' },
          { status: 403 },
        ),
      };
    }
  }

  return { ok: true, userId: user.id, userType: role };
}

/**
 * Checks usage limits for the user and increments counters if within limits.
 * Admins are exempt. Resets daily/monthly counters automatically.
 */
export async function checkAndIncrementUsage(
  userId: string,
  userType: string,
): Promise<UsageCheckResult> {
  // Admins have unlimited usage
  if (userType === 'admin') return { ok: true };

  const limits = TIER_LIMITS[userType];
  if (!limits) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No AI access for this account tier.' }, { status: 403 }),
    };
  }

  const admin = createAdminSupabase();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('ai_daily_count, ai_daily_reset_date, ai_monthly_count, ai_monthly_reset_month, ai_monthly_reset_year')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Failed to read usage data.' }, { status: 500 }),
    };
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  let dailyCount: number = profile.ai_daily_count ?? 0;
  let monthlyCount: number = profile.ai_monthly_count ?? 0;
  let resetDate: string = profile.ai_daily_reset_date ?? todayStr;
  let resetMonth: number = profile.ai_monthly_reset_month ?? currentMonth;
  let resetYear: number = profile.ai_monthly_reset_year ?? currentYear;

  // Reset daily counter if it's a new day
  if (resetDate < todayStr) {
    dailyCount = 0;
    resetDate = todayStr;
  }

  // Reset monthly counter if it's a new month/year
  if (resetYear < currentYear || (resetYear === currentYear && resetMonth < currentMonth)) {
    monthlyCount = 0;
    resetMonth = currentMonth;
    resetYear = currentYear;
  }

  // Check daily limit
  if (dailyCount >= limits.daily) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return {
      ok: false,
      response: NextResponse.json({
        error: `Daily limit of ${limits.daily} requests reached.`,
        limitExceeded: true,
        limitType: 'daily',
        limit: limits.daily,
        used: dailyCount,
        tier: userType,
        resetAt: tomorrow.toISOString(),
      }, { status: 429 }),
    };
  }

  // Check monthly limit
  if (monthlyCount >= limits.monthly) {
    const nextMonth = new Date(currentYear, currentMonth, 1); // 1st of next month
    return {
      ok: false,
      response: NextResponse.json({
        error: `Monthly limit of ${limits.monthly} requests reached.`,
        limitExceeded: true,
        limitType: 'monthly',
        limit: limits.monthly,
        used: monthlyCount,
        tier: userType,
        resetAt: nextMonth.toISOString(),
      }, { status: 429 }),
    };
  }

  // Increment counters
  await admin
    .from('profiles')
    .update({
      ai_daily_count: dailyCount + 1,
      ai_daily_reset_date: resetDate,
      ai_monthly_count: monthlyCount + 1,
      ai_monthly_reset_month: resetMonth,
      ai_monthly_reset_year: resetYear,
    })
    .eq('id', userId);

  return { ok: true };
}
