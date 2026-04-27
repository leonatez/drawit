'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { X, CheckCircle, Loader2, Copy } from 'lucide-react';
import { useEditorStore } from '@/store';
import type { PricingPlan } from '@/types';
import toast from 'react-hot-toast';

type Step = 'plans' | 'qr' | 'success';

interface OrderInfo {
  orderId: string;
  orderCode: string;
  amount: number;
  planName: string;
  qrUrl: string;
  accountNumber: string;
  bankCode: string;
}

export default function PaymentModal() {
  const { showPayment, setShowPayment, setUser, user } = useEditorStore();
  const [step, setStep] = useState<Step>('plans');
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (showPayment) {
      setStep('plans');
      setOrder(null);
      setSelectedPlan(null);
    }
  }, [showPayment]);

  // Load plans when modal opens
  useEffect(() => {
    if (!showPayment || plans.length > 0) return;
    fetch('/api/pricing-plans')
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []))
      .catch(() => toast.error('Failed to load plans.'));
  }, [showPayment, plans.length]);

  const handleSelectPlan = async (plan: PricingPlan) => {
    setLoadingPlanId(plan.id);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create order.');
      setSelectedPlan(plan);
      setOrder(data);
      setStep('qr');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order.');
    } finally {
      setLoadingPlanId(null);
    }
  };

  const POLL_TIMEOUT_MS = 15 * 60 * 1000; // stop polling after 15 minutes
  const pollStartRef = React.useRef<number>(0);

  // Poll order status every 4 seconds while on QR step
  const checkStatus = useCallback(async () => {
    if (!order) return;
    try {
      const res = await fetch(`/api/checkout/status?orderId=${order.orderId}`);
      const data = await res.json();
      if (data.status === 'paid') {
        setStep('success');
        setPolling(false);
        // Refresh user profile to reflect new user_type
        if (user) {
          const profileRes = await fetch('/api/profile');
          if (profileRes.ok) {
            const profile = await profileRes.json();
            if (profile.user) setUser(profile.user);
          }
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, [order, user, setUser]);

  useEffect(() => {
    if (step !== 'qr' || !order) { setPolling(false); return; }
    setPolling(true);
    pollStartRef.current = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        setPolling(false);
        return;
      }
      checkStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, [step, order, checkStatus, POLL_TIMEOUT_MS]);

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  if (!showPayment) return null;

  const close = () => setShowPayment(false);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={close}>
      <div
        className="bg-[#1e293b] border border-[#334155] rounded-2xl p-8 w-[480px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-[#f1f5f9]">
            {step === 'plans' && 'Upgrade your plan'}
            {step === 'qr' && `Pay for ${selectedPlan?.name}`}
            {step === 'success' && 'Payment confirmed!'}
          </h2>
          <button onClick={close} className="text-[#64748b] hover:text-[#f1f5f9]">
            <X size={16} />
          </button>
        </div>

        {/* Step: Plan selection */}
        {step === 'plans' && (
          <div className="space-y-3">
            {plans.length === 0 && (
              <div className="text-center py-8 text-[#64748b] text-sm">
                <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                Loading plans…
              </div>
            )}
            {plans.map((plan) => {
              const isCurrent = user?.user_type === plan.user_type;
              const isRecommended = user?.user_type === 'member' && plan.user_type === 'premium';
              return (
                <button
                  key={plan.id}
                  onClick={() => handleSelectPlan(plan)}
                  disabled={loadingPlanId !== null}
                  className={`w-full text-left rounded-xl p-4 transition-colors disabled:opacity-60 border ${
                    isRecommended
                      ? 'bg-[#0f172a] border-[#fb923c] hover:border-[#fb923c]'
                      : 'bg-[#0f172a] border-[#334155] hover:border-[#14b8a6]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#f1f5f9]">{plan.name}</span>
                      {isCurrent && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#14b8a61a] text-[#14b8a6] font-semibold">
                          Current
                        </span>
                      )}
                      {isRecommended && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#fb923c1a] text-[#fb923c] font-semibold">
                          Recommended
                        </span>
                      )}
                    </div>
                    {loadingPlanId === plan.id
                      ? <Loader2 size={14} className="animate-spin text-[#14b8a6]" />
                      : <span className={`text-sm font-bold ${isRecommended ? 'text-[#fb923c]' : 'text-[#14b8a6]'}`}>
                          {plan.price_vnd.toLocaleString('vi-VN')} ₫/mo
                        </span>
                    }
                  </div>
                  <p className="text-xs text-[#64748b]">{plan.description}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Step: QR payment */}
        {step === 'qr' && order && (
          <div className="space-y-4">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.qrUrl}
                alt="VietQR payment"
                className="w-52 h-52 rounded-xl border border-[#334155]"
              />
            </div>

            <div className="bg-[#0f172a] rounded-xl p-4 space-y-2 text-sm">
              <Row label="Bank" value={order.bankCode} />
              <Row label="Account" value={order.accountNumber} onCopy={() => copyCode(order.accountNumber)} />
              <Row
                label="Amount"
                value={`${order.amount.toLocaleString('vi-VN')} ₫`}
                onCopy={() => copyCode(String(order.amount))}
              />
              <Row
                label="Description"
                value={order.orderCode}
                highlight
                onCopy={() => copyCode(order.orderCode)}
              />
            </div>

            <p className="text-[11px] text-[#64748b] text-center">
              Transfer with <strong className="text-[#f1f5f9]">exactly</strong> the description above so we can match your payment automatically.
            </p>

            <div className="flex items-center justify-center gap-2 text-xs text-[#64748b]">
              {polling && <Loader2 size={12} className="animate-spin" />}
              <span>
                {polling
                  ? 'Waiting for payment…'
                  : 'Auto-check timed out. Refresh the page after transferring.'}
              </span>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && selectedPlan && (
          <div className="text-center py-4 space-y-4">
            <CheckCircle size={48} className="text-[#14b8a6] mx-auto" />
            <div>
              <p className="text-sm font-semibold text-[#f1f5f9]">You&apos;re now on {selectedPlan.name}!</p>
              <p className="text-xs text-[#64748b] mt-1">
                {selectedPlan.ai_daily_limit} AI requests/day · {selectedPlan.ai_monthly_limit}/month
              </p>
            </div>
            <button
              onClick={close}
              className="w-full bg-[#14b8a6] text-[#0f172a] rounded-lg py-2.5 text-sm font-bold"
            >
              Start using AI
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label, value, highlight, onCopy,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[#64748b] shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className={`truncate font-mono text-xs ${highlight ? 'text-[#14b8a6] font-bold' : 'text-[#f1f5f9]'}`}>
          {value}
        </span>
        {onCopy && (
          <button onClick={onCopy} className="text-[#475569] hover:text-[#94a3b8] shrink-0">
            <Copy size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
