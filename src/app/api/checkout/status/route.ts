import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const orderId = request.nextUrl.searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required.' }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: order, error } = await admin
    .from('payment_orders')
    .select('status, paid_at, subscription_expires_at')
    .eq('id', orderId)
    .eq('user_id', user.id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  return NextResponse.json({
    status: order.status,
    paidAt: order.paid_at,
    subscriptionExpiresAt: order.subscription_expires_at,
  });
}
