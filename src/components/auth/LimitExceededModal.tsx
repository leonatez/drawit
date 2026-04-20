'use client';

import React from 'react';
import { X, Zap } from 'lucide-react';
import { useEditorStore } from '@/store';
import { TIER_LIMITS } from '@/types';

export default function LimitExceededModal() {
  const { limitExceeded, setLimitExceeded } = useEditorStore();
  if (!limitExceeded) return null;

  const { limitType, limit, used, tier } = limitExceeded;
  const close = () => setLimitExceeded(null);

  const resetLabel = limitType === 'daily' ? 'tomorrow' : 'the 1st of next month';
  const nextTier = tier === 'member' ? 'Premium' : null;
  const nextLimits = nextTier ? TIER_LIMITS['premium'] : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={close}
    >
      <div
        className="bg-[#1e293b] border border-[#334155] rounded-2xl p-8 w-[420px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-[#fb923c]" />
            <h2 className="text-base font-bold text-[#f1f5f9]">
              {limitType === 'daily' ? 'Daily' : 'Monthly'} limit reached
            </h2>
          </div>
          <button onClick={close} className="text-[#64748b] hover:text-[#f1f5f9]">
            <X size={16} />
          </button>
        </div>

        <p className="text-sm text-[#94a3b8] mb-5">
          You&apos;ve used <strong className="text-[#f1f5f9]">{used}</strong> of your{' '}
          <strong className="text-[#f1f5f9]">{limit}</strong> {limitType} AI requests on the{' '}
          <span className="capitalize text-[#14b8a6] font-medium">{tier}</span> plan.
          Your limit resets <strong className="text-[#f1f5f9]">{resetLabel}</strong>.
        </p>

        {/* Tier comparison */}
        {nextTier && nextLimits && (
          <div className="bg-[#0f172a] rounded-xl p-4 mb-5 border border-[#334155]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748b] mb-3">
              Upgrade to {nextTier}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-[10px] text-[#64748b] mb-1">Your plan · {tier}</p>
                <p className="text-lg font-bold text-[#f1f5f9]">{TIER_LIMITS[tier]?.daily ?? 0}</p>
                <p className="text-[10px] text-[#64748b]">requests / day</p>
                <p className="text-lg font-bold text-[#f1f5f9] mt-1">{TIER_LIMITS[tier]?.monthly ?? 0}</p>
                <p className="text-[10px] text-[#64748b]">requests / month</p>
              </div>
              <div className="text-center border-l border-[#334155]">
                <p className="text-[10px] text-[#14b8a6] mb-1 font-semibold">{nextTier} plan</p>
                <p className="text-lg font-bold text-[#14b8a6]">{nextLimits.daily}</p>
                <p className="text-[10px] text-[#64748b]">requests / day</p>
                <p className="text-lg font-bold text-[#14b8a6] mt-1">{nextLimits.monthly}</p>
                <p className="text-[10px] text-[#64748b]">requests / month</p>
              </div>
            </div>
            <p className="text-[10px] text-[#64748b] mt-3 text-center">
              Contact an admin to upgrade your account.
            </p>
          </div>
        )}

        <button
          onClick={close}
          className="w-full bg-[#334155] hover:bg-[#475569] text-[#f1f5f9] rounded-lg py-2.5 text-sm font-medium transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
