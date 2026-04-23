'use client';

import React, { useEffect, useState } from 'react';
import { X, Settings, Users, Save } from 'lucide-react';
import { useEditorStore } from '@/store';
import type { UserProfile, UserType, AdminSettings } from '@/types';
import toast from 'react-hot-toast';

// ── Slider helper ────────────────────────────────────────────────────────────

function SettingSlider({
  label, hint, value, min, max, step, format, onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#f1f5f9] font-medium">{label}</span>
        <span className="text-xs font-mono text-[#14b8a6] w-12 text-right">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#14b8a6]"
      />
      <p className="text-[10px] text-[#64748b] mt-0.5">{hint}</p>
    </div>
  );
}

export default function AdminPanel() {
  const { setShowAdmin, adminSettings, setAdminSettings, user } = useEditorStore();
  const [tab, setTab] = useState<'settings' | 'users'>('settings');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [localSettings, setLocalSettings] = useState<AdminSettings>({ ...adminSettings });
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (tab === 'users') loadUsers();
  }, [tab]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) setUsers(data.users);
    } finally {
      setLoadingUsers(false);
    }
  };

  const saveSettings = async () => {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localSettings),
    });
    if (res.ok) {
      setAdminSettings(localSettings);
      toast.success('Settings saved');
    } else {
      toast.error('Failed to save settings');
    }
  };

  const updateUserType = async (userId: string, user_type: UserType) => {
    const res = await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, user_type }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, user_type } : u)));
      toast.success('User updated');
    } else {
      toast.error('Failed to update user');
    }
  };

  if (user?.user_type !== 'admin') {
    return (
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
        onClick={() => setShowAdmin(false)}
      >
        <div
          className="bg-[#1e293b] border border-[#334155] rounded-2xl p-8 shadow-2xl text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[#f1f5f9] text-sm mb-4">You must be signed in as an admin to access this panel.</p>
          <button
            onClick={() => setShowAdmin(false)}
            className="bg-[#14b8a6] text-[#0f172a] rounded-lg px-4 py-2 text-sm font-bold"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => setShowAdmin(false)}
    >
      <div
        className="bg-[#1e293b] border border-[#334155] rounded-2xl w-2xl max-w-[90vw] shadow-2xl flex flex-col max-h-[80vh]"
        style={{ width: 600 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155] flex-shrink-0">
          <h2 className="text-sm font-bold text-[#f1f5f9]">Admin Panel</h2>
          <button onClick={() => setShowAdmin(false)} className="text-[#64748b] hover:text-[#f1f5f9]">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#334155] flex-shrink-0">
          {([['settings', 'Settings', Settings], ['users', 'Users', Users]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-[#14b8a6] text-[#14b8a6]'
                  : 'border-transparent text-[#64748b] hover:text-[#f1f5f9]'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'settings' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-[#f1f5f9] mb-3">Image Compression</h3>

                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <div
                    onClick={() => setLocalSettings((s) => ({ ...s, compress_images: !s.compress_images }))}
                    className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                      localSettings.compress_images ? 'bg-[#14b8a6]' : 'bg-[#334155]'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        localSettings.compress_images ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-[#f1f5f9] font-medium">Compress uploaded images</p>
                    <p className="text-[10px] text-[#64748b]">
                      Resize uploads exceeding the max width to save storage
                    </p>
                  </div>
                </label>

                {localSettings.compress_images && (
                  <div className="ml-0 bg-[#0f172a] rounded-lg p-4">
                    <label className="text-xs text-[#64748b] block mb-1">Max width (px)</label>
                    <input
                      type="number"
                      value={localSettings.compress_width}
                      onChange={(e) =>
                        setLocalSettings((s) => ({ ...s, compress_width: Math.max(100, Number(e.target.value)) }))
                      }
                      min={100}
                      max={4096}
                      className="w-32 bg-[#1e293b] text-[#f1f5f9] border border-[#334155] rounded px-2 py-1 text-sm outline-none focus:border-[#14b8a6]"
                    />
                    <p className="text-[10px] text-[#64748b] mt-1">
                      Images wider than this will be scaled down proportionally.
                      <br />Users can still request AI upscaling on export.
                    </p>
                  </div>
                )}
              </div>

              {/* ── Vectorize ── */}
              <div>
                <h3 className="text-xs font-semibold text-[#f1f5f9] mb-3">Vectorize</h3>
                <div className="bg-[#0f172a] rounded-lg p-4 space-y-4">
                  <SettingSlider
                    label="Colors (k-means clusters)"
                    hint="More colors = more detail preserved, slower"
                    value={localSettings.vec_n_colors}
                    min={4} max={20} step={1}
                    format={(v) => String(v)}
                    onChange={(v) => setLocalSettings((s) => ({ ...s, vec_n_colors: v }))}
                  />
                  <SettingSlider
                    label="Min detail size (px)"
                    hint="Shapes smaller than this are dropped. Lower = more detail"
                    value={localSettings.vec_min_area}
                    min={1} max={100} step={1}
                    format={(v) => `${v} px`}
                    onChange={(v) => setLocalSettings((s) => ({ ...s, vec_min_area: v }))}
                  />
                  <SettingSlider
                    label="Edge smoothing"
                    hint="Higher = smoother curves, less faithful to pixel edges"
                    value={localSettings.vec_smoothing}
                    min={0.1} max={3.0} step={0.1}
                    format={(v) => v.toFixed(1)}
                    onChange={(v) => setLocalSettings((s) => ({ ...s, vec_smoothing: v }))}
                  />
                </div>
              </div>

              {/* ── Remove Background ── */}
              <div>
                <h3 className="text-xs font-semibold text-[#f1f5f9] mb-3">Remove Background</h3>
                <div className="bg-[#0f172a] rounded-lg p-4 space-y-4">
                  <SettingSlider
                    label="Saturation threshold"
                    hint="Pixels with HSV saturation below this are treated as background. Lower = stricter (keeps more colors)"
                    value={localSettings.rmbg_sat_thresh}
                    min={5} max={80} step={1}
                    format={(v) => String(v)}
                    onChange={(v) => setLocalSettings((s) => ({ ...s, rmbg_sat_thresh: v }))}
                  />
                  <SettingSlider
                    label="Brightness threshold"
                    hint="Pixels with HSV brightness above this are treated as background. Higher = stricter (only removes near-pure white)"
                    value={localSettings.rmbg_val_thresh}
                    min={150} max={255} step={1}
                    format={(v) => String(v)}
                    onChange={(v) => setLocalSettings((s) => ({ ...s, rmbg_val_thresh: v }))}
                  />
                </div>
              </div>

              <button
                onClick={saveSettings}
                className="flex items-center gap-2 bg-[#14b8a6] text-[#0f172a] px-4 py-2 rounded-lg text-sm font-bold"
              >
                <Save size={13} /> Save Settings
              </button>
            </div>
          )}

          {tab === 'users' && (
            <div>
              {loadingUsers ? (
                <p className="text-xs text-[#64748b]">Loading users…</p>
              ) : (
                <div className="space-y-1">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 bg-[#0f172a] rounded-lg px-3 py-2"
                    >
                      <div className="w-7 h-7 rounded-full bg-[#14b8a6]/20 flex items-center justify-center text-[10px] font-bold text-[#14b8a6]">
                        {u.display_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#f1f5f9] truncate">{u.display_name}</p>
                        <p className="text-[10px] text-[#64748b] truncate">{u.email}</p>
                      </div>
                      <select
                        value={u.user_type}
                        onChange={(e) => updateUserType(u.id, e.target.value as UserType)}
                        className="bg-[#1e293b] text-[#f1f5f9] border border-[#334155] rounded px-2 py-1 text-[11px] outline-none focus:border-[#14b8a6]"
                      >
                        <option value="guest">Guest</option>
                        <option value="member">Member</option>
                        <option value="premium">Premium</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <p className="text-xs text-[#64748b] text-center py-4">No users yet</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
