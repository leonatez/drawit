import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';
import { verifyWebhookApiKey, extractOrderCode, addSubscriptionMonth } from '@/lib/payment/sepay-utils';

export async function POST(request: NextRequest) {
  // SePay sends: Authorization: Apikey <secret>
  const authHeader = request.headers.get('Authorization') ?? '';
  const apiKey = authHeader.startsWith('Apikey ') ? authHeader.slice(7) : authHeader;
  if (!verifyWebhookApiKey(apiKey)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  // Only process incoming transfers
  if (body.transferType !== 'in') {
    return NextResponse.json({ success: true });
  }

  const content = String(body.content ?? body.transferContent ?? body.description ?? '');
  // Use only transferAmount — never fall back to body.amount to avoid zero-VND exploit
  const transferAmount = Number(body.transferAmount ?? 0);

  if (!content) {
    // Not a transfer we care about — acknowledge without error
    return NextResponse.json({ success: true });
  }

  const admin = createAdminSupabase();

  // Only scan orders created in the last 24 hours to avoid full-table scans
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pendingOrders } = await admin
    .from('payment_orders')
    .select('id, order_code, amount_vnd, user_id, plan_id')
    .eq('status', 'pending')
    .gte('created_at', cutoff);

  if (!pendingOrders?.length) {
    return NextResponse.json({ success: true });
  }

  const matchedCode = extractOrderCode(content, pendingOrders.map((o) => o.order_code));
  const matched = pendingOrders.find((o) => o.order_code === matchedCode);

  if (!matched) {
    return NextResponse.json({ success: true });
  }

  if (transferAmount < matched.amount_vnd) {
    console.warn(`[sepay-webhook] Order ${matched.order_code}: insufficient amount ${transferAmount} < ${matched.amount_vnd}`);
    return NextResponse.json({ success: true });
  }

  const paidAt = new Date();
  const subscriptionExpiresAt = addSubscriptionMonth(paidAt);

  // Atomic update: only succeeds if status is still 'pending' — prevents double-payment on webhook retry
  const { data: updatedOrder } = await admin
    .from('payment_orders')
    .update({
      status: 'paid',
      paid_at: paidAt.toISOString(),
      subscription_expires_at: subscriptionExpiresAt.toISOString(),
    })
    .eq('id', matched.id)
    .eq('status', 'pending')
    .select('plan_id, user_id')
    .single();

  // If no row returned, another webhook request already processed this order
  if (!updatedOrder) {
    console.log(`[sepay-webhook] Order ${matched.order_code} already processed — skipping`);
    return NextResponse.json({ success: true });
  }

  // Fetch plan to get target user_type
  const { data: plan } = await admin
    .from('pricing_plans')
    .select('user_type')
    .eq('id', updatedOrder.plan_id)
    .single();

  if (!plan) {
    console.error(`[sepay-webhook] Plan not found for order ${matched.order_code}`);
    return NextResponse.json({ success: true });
  }

  // Upgrade user profile
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      user_type: plan.user_type,
      subscription_expires_at: subscriptionExpiresAt.toISOString(),
    })
    .eq('id', updatedOrder.user_id);

  if (profileError) {
    console.error(`[sepay-webhook] Failed to upgrade profile for user ${updatedOrder.user_id}:`, profileError.message);
  } else {
    console.log(`[sepay-webhook] Upgraded user ${updatedOrder.user_id} to ${plan.user_type}, expires ${subscriptionExpiresAt.toISOString()}`);
  }

  return NextResponse.json({ success: true });
}
