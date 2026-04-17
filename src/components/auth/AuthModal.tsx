'use client';

import React, { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { useEditorStore } from '@/store';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

type Mode = 'login' | 'register';

export default function AuthModal() {
  const { setShowAuth } = useEditorStore();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter your email and password.');
      return;
    }
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Signed in');
        setShowAuth(false);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success('Account created! Check your email to confirm. An admin will upgrade your account to Member.');
        setShowAuth(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => setShowAuth(false)}
    >
      <div
        className="bg-[#2a2a3e] border border-[#3a3a4e] rounded-2xl p-8 w-96 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-[#cdd6f4]">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          <button onClick={() => setShowAuth(false)} className="text-[#6c7086] hover:text-[#cdd6f4]">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="text-xs text-[#6c7086] block mb-1">Email</label>
            <input
              id="auth-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full bg-[#1e1e2e] text-[#cdd6f4] border border-[#3a3a4e] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#89b4fa]"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="text-xs text-[#6c7086] block mb-1">Password</label>
            <div className="relative">
              <input
                id="auth-password"
                name="password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-[#1e1e2e] text-[#cdd6f4] border border-[#3a3a4e] rounded-lg px-3 py-2 pr-9 text-sm outline-none focus:border-[#89b4fa]"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6c7086]"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#89b4fa] text-[#1e1e2e] rounded-lg py-2.5 text-sm font-bold disabled:opacity-50 mt-2"
          >
            {loading ? '…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-[#6c7086] mt-4">
          {mode === 'login' ? (
            <>No account?{' '}
              <button className="text-[#89b4fa] hover:underline" onClick={() => setMode('register')}>
                Register
              </button>
            </>
          ) : (
            <>Already have one?{' '}
              <button className="text-[#89b4fa] hover:underline" onClick={() => setMode('login')}>
                Sign in
              </button>
            </>
          )}
        </p>

        {mode === 'register' && (
          <p className="text-[10px] text-[#6c7086] text-center mt-3 bg-[#1e1e2e] rounded-lg p-2">
            New accounts start as <strong>Guest</strong>. An admin will upgrade you to{' '}
            <strong>Member</strong> to enable AI features.
          </p>
        )}
      </div>
    </div>
  );
}
