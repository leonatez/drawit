'use client';

import React, { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { useEditorStore } from '@/store';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

type Mode = 'login' | 'register' | 'forgot';

export default function AuthModal() {
  const { setShowAuth } = useEditorStore();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'forgot') {
        if (!email) { toast.error('Please enter your email.'); return; }
        const redirectTo = typeof window !== 'undefined' ? window.location.origin : '';
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setForgotSent(true);
        return;
      }

      if (!email || !password) { toast.error('Please enter your email and password.'); return; }

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
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Reset Password';

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => setShowAuth(false)}
    >
      <div
        className="bg-[#1e293b] border border-[#334155] rounded-2xl p-8 w-96 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-[#f1f5f9]">{title}</h2>
          <button onClick={() => setShowAuth(false)} className="text-[#64748b] hover:text-[#f1f5f9]">
            <X size={16} />
          </button>
        </div>

        {mode === 'forgot' && forgotSent ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-[#f1f5f9]">Check your email</p>
            <p className="text-xs text-[#64748b]">
              We sent a password reset link to{' '}
              <strong className="text-[#f1f5f9]">{email}</strong>.
            </p>
            <button
              onClick={() => { setMode('login'); setForgotSent(false); }}
              className="text-xs text-[#14b8a6] hover:underline"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="text-xs text-[#64748b] block mb-1">Email</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                className="w-full bg-[#0f172a] text-[#f1f5f9] border border-[#334155] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#14b8a6]"
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label htmlFor="auth-password" className="text-xs text-[#64748b] block mb-1">Password</label>
                <div className="relative">
                  <input
                    id="auth-password"
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#0f172a] text-[#f1f5f9] border border-[#334155] rounded-lg px-3 py-2 pr-9 text-sm outline-none focus:border-[#14b8a6]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748b]"
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div className="text-right -mt-1">
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-[11px] text-[#64748b] hover:text-[#14b8a6] transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#14b8a6] text-[#0f172a] rounded-lg py-2.5 text-sm font-bold disabled:opacity-50 mt-2"
            >
              {loading ? '…' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </form>
        )}

        {!forgotSent && (
          <p className="text-center text-xs text-[#64748b] mt-4">
            {mode === 'login' && (
              <>No account?{' '}
                <button className="text-[#14b8a6] hover:underline" onClick={() => setMode('register')}>Register</button>
              </>
            )}
            {mode === 'register' && (
              <>Already have one?{' '}
                <button className="text-[#14b8a6] hover:underline" onClick={() => setMode('login')}>Sign in</button>
              </>
            )}
            {mode === 'forgot' && (
              <button className="text-[#14b8a6] hover:underline" onClick={() => setMode('login')}>Back to Sign In</button>
            )}
          </p>
        )}

        {mode === 'register' && (
          <p className="text-[10px] text-[#64748b] text-center mt-3 bg-[#0f172a] rounded-lg p-2">
            New accounts start as <strong>Guest</strong>. An admin will upgrade you to{' '}
            <strong>Member</strong> to enable AI features.
          </p>
        )}
      </div>
    </div>
  );
}
