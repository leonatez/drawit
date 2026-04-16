'use client';

import React, { useEffect, useState } from 'react';
import { X, Settings, Users, Save } from 'lucide-react';
import { useEditorStore } from '@/store';
import type { UserProfile, UserType, AdminSettings } from '@/types';
import toast from 'react-hot-toast';

export default function AdminPanel() {
  const { setShowAdmin, adminSettings, setAdminSettings } = useEditorStore();
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

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => setShowAdmin(false)}
    >
      <div
        className="bg-[#2a2a3e] border border-[#3a3a4e] rounded-2xl w-2xl max-w-[90vw] shadow-2xl flex flex-col max-h-[80vh]"
        style={{ width: 600 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3a4e] flex-shrink-0">
          <h2 className="text-sm font-bold text-[#cdd6f4]">Admin Panel</h2>
          <button onClick={() => setShowAdmin(false)} className="text-[#6c7086] hover:text-[#cdd6f4]">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#3a3a4e] flex-shrink-0">
          {([['settings', 'Settings', Settings], ['users', 'Users', Users]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-[#89b4fa] text-[#89b4fa]'
                  : 'border-transparent text-[#6c7086] hover:text-[#cdd6f4]'
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
                <h3 className="text-xs font-semibold text-[#cdd6f4] mb-3">Image Compression</h3>

                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <div
                    onClick={() => setLocalSettings((s) => ({ ...s, compress_images: !s.compress_images }))}
                    className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                      localSettings.compress_images ? 'bg-[#89b4fa]' : 'bg-[#3a3a4e]'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        localSettings.compress_images ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-[#cdd6f4] font-medium">Compress uploaded images</p>
                    <p className="text-[10px] text-[#6c7086]">
                      Resize uploads exceeding the max width to save storage
                    </p>
                  </div>
                </label>

                {localSettings.compress_images && (
                  <div className="ml-0 bg-[#1e1e2e] rounded-lg p-4">
                    <label className="text-xs text-[#6c7086] block mb-1">Max width (px)</label>
                    <input
                      type="number"
                      value={localSettings.compress_width}
                      onChange={(e) =>
                        setLocalSettings((s) => ({ ...s, compress_width: Math.max(100, Number(e.target.value)) }))
                      }
                      min={100}
                      max={4096}
                      className="w-32 bg-[#2a2a3e] text-[#cdd6f4] border border-[#3a3a4e] rounded px-2 py-1 text-sm outline-none focus:border-[#89b4fa]"
                    />
                    <p className="text-[10px] text-[#6c7086] mt-1">
                      Images wider than this will be scaled down proportionally.
                      <br />Users can still request AI upscaling on export.
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={saveSettings}
                className="flex items-center gap-2 bg-[#89b4fa] text-[#1e1e2e] px-4 py-2 rounded-lg text-sm font-bold"
              >
                <Save size={13} /> Save Settings
              </button>
            </div>
          )}

          {tab === 'users' && (
            <div>
              {loadingUsers ? (
                <p className="text-xs text-[#6c7086]">Loading users…</p>
              ) : (
                <div className="space-y-1">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 bg-[#1e1e2e] rounded-lg px-3 py-2"
                    >
                      <div className="w-7 h-7 rounded-full bg-[#89b4fa]/20 flex items-center justify-center text-[10px] font-bold text-[#89b4fa]">
                        {u.display_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#cdd6f4] truncate">{u.display_name}</p>
                        <p className="text-[10px] text-[#6c7086] truncate">{u.email}</p>
                      </div>
                      <select
                        value={u.user_type}
                        onChange={(e) => updateUserType(u.id, e.target.value as UserType)}
                        className="bg-[#2a2a3e] text-[#cdd6f4] border border-[#3a3a4e] rounded px-2 py-1 text-[11px] outline-none focus:border-[#89b4fa]"
                      >
                        <option value="guest">Guest</option>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <p className="text-xs text-[#6c7086] text-center py-4">No users yet</p>
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
