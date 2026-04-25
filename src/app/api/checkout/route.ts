import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminSupabase } from '@/lib/supabase/server';
import { generateOrderCode, buildQrUrl } from '@/lib/payment/sepay-utils';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { planId } = await request.json();
  if (!planId) {
    return NextResponse.json({ error: 'planId is required.' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Fetch the plan
  const { data: plan, error: planError } = await admin
    .from('pricing_plans')
    .select('*')
    .eq('id', planId)
    .eq('active', true)
    .single();

  if (planError || !plan) {
    return NextResponse.json({ error: 'Plan not found.' }, { status: 404 });
  }

  // Generate unique order code (retry on collision)
  let orderCode = generateOrderCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await admin
      .from('payment_orders')
      .select('id')
      .eq('order_code', orderCode)
      .single();
    if (!existing) break;
    orderCode = generateOrderCode();
    attempts++;
  }

  // Create pending order
  const { data: order, error: orderError } = await admin
    .from('payment_orders')
    .insert({
      user_id: user.id,
      plan_id: plan.id,
      order_code: orderCode,
      amount_vnd: plan.price_vnd,
      status: 'pending',
    })
    .select()
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Failed to create order.' }, { status: 500 });
  }

  const accountNumber = process.env.NEXT_PUBLIC_SEPAY_ACCOUNT_NUMBER ?? '';
  const bankCode = process.env.NEXT_PUBLIC_SEPAY_BANK_CODE ?? '';
  const qrUrl = buildQrUrl(accountNumber, bankCode, plan.price_vnd, orderCode);

  return NextResponse.json({
    orderId: order.id,
    orderCode,
    amount: plan.price_vnd,
    planName: plan.name,
    qrUrl,
    accountNumber,
    bankCode,
  });
}
