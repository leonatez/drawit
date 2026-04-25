import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';

export async function GET() {
  const admin = createAdminSupabase();
  const { data: plans, error } = await admin
    .from('pricing_plans')
    .select('id, name, description, user_type, price_vnd, ai_daily_limit, ai_monthly_limit, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to load plans.' }, { status: 500 });
  }

  return NextResponse.json({ plans: plans ?? [] });
}
