'use client';

import React, { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

interface Props {
  onClose: () => void;
}

export default function ChangePasswordModal({ onClose }: Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirm) {
      toast.error('Please fill in all fields.');
      return;
    }
    if (newPassword !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await createClient().auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated successfully.');
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#2a2a3e] border border-[#3a3a4e] rounded-2xl p-8 w-96 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-[#cdd6f4]">Change Password</h2>
          <button onClick={onClose} className="text-[#6c7086] hover:text-[#cdd6f4]">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-[#6c7086] block mb-1">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
                className="w-full bg-[#1e1e2e] text-[#cdd6f4] border border-[#3a3a4e] rounded-lg px-3 py-2 pr-9 text-sm outline-none focus:border-[#89b4fa]"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6c7086]"
              >
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-[#6c7086] block mb-1">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-[#1e1e2e] text-[#cdd6f4] border border-[#3a3a4e] rounded-lg px-3 py-2 pr-9 text-sm outline-none focus:border-[#89b4fa]"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6c7086]"
              >
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#89b4fa] text-[#1e1e2e] rounded-lg py-2.5 text-sm font-bold disabled:opacity-50 mt-2"
          >
            {loading ? '…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
