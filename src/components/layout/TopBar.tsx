'use client';

import React, { useState } from 'react';
import {
  MousePointer2, Square, Upload, Settings, LogOut,
  LogIn, Save, ChevronDown, Sparkles, FolderOpen, KeyRound,
} from 'lucide-react';
import ChangePasswordModal from '@/components/auth/ChangePasswordModal';
import { useEditorStore } from '@/store';
import { sceneSerializerRef } from '@/lib/scene-ref';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

export default function TopBar() {
  const {
    tool, setTool, user, setShowAuth, setShowAdmin, setShowProjects,
    projectName, setProjectName, isDirty, toProject,
    markClean, adminSettings,
  } = useEditorStore();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);

  const isAdmin = user?.user_type === 'admin';

  const handleSave = async () => {
    try {
      // Serialize the latest Excalidraw scene before saving
      const json = sceneSerializerRef.current();
      if (json !== '{}') useEditorStore.getState().setSceneJSON(json);

      await fetch('/api/project', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toProject()),
      });
      markClean();
      toast.success('Saved');
    } catch {
      toast.error('Save failed');
    }
  };

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    useEditorStore.getState().setUser(null);
    setShowUserMenu(false);
    toast('Signed out');
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const projectId = useEditorStore.getState().projectId;
    const vp = useEditorStore.getState().viewport;

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('projectId', projectId);
      const toastId = toast.loading(`Uploading ${file.name}…`);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const displayW = 400;
        const displayH = Math.round((data.storedHeight / data.storedWidth) * displayW);

        const { nanoid } = await import('nanoid');
        const pic = {
          id: data.pictureId,
          projectId,
          name: generatePictureName(),
          filename: `${data.pictureId}.png`,
          storagePath: data.storagePath,
          originalWidth: data.originalWidth,
          originalHeight: data.originalHeight,
          excalidrawFileId: nanoid(),
          canvasX: -displayW / 2,
          canvasY: -displayH / 2,
          canvasWidth: displayW,
          canvasHeight: displayH,
        };
        useEditorStore.getState().addPicture(pic);
        toast.success(`Uploaded ${file.name}`, { id: toastId });
      } catch (err) {
        toast.error(`Upload failed: ${err}`, { id: toastId });
      }
    }
    e.target.value = '';
  };

  return (
    <div className="h-10 bg-[#2a2a3e] border-b border-[#3a3a4e] flex items-center px-3 gap-2 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-1.5 mr-1">
        <Sparkles size={14} className="text-[#89b4fa]" />
        <span className="text-sm font-bold text-[#cdd6f4]">DrawIt</span>
        <span className="text-[9px] text-[#6c7086] font-mono">v0.5</span>
      </div>

      {/* Projects switcher */}
      <button
        onClick={() => setShowProjects(true)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313145] transition-colors mr-1"
        title="Manage projects"
      >
        <FolderOpen size={12} />
      </button>

      {/* Project name */}
      <input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="bg-transparent text-xs text-[#cdd6f4] border-b border-transparent hover:border-[#3a3a4e] focus:border-[#89b4fa] outline-none px-1 w-36"
        title="Project name"
      />

      {/* Dirty indicator */}
      {isDirty && (
        <span className="text-[10px] text-[#6c7086]">●</span>
      )}

      <div className="h-4 w-px bg-[#3a3a4e] mx-1" />

      {/* Tool buttons */}
      <ToolButton
        active={tool === 'select'}
        onClick={() => setTool('select')}
        title="Select / Pan (V)"
      >
        <MousePointer2 size={13} />
      </ToolButton>

      <ToolButton
        active={tool === 'draw-box'}
        onClick={() => setTool('draw-box')}
        title="Draw selection box (B)"
      >
        <Square size={13} />
        <span className="text-[10px]">Box</span>
      </ToolButton>

      <div className="h-4 w-px bg-[#3a3a4e] mx-1" />

      {/* Upload */}
      <label
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#cdd6f4] hover:bg-[#313145] cursor-pointer transition-colors"
        title="Upload images"
      >
        <Upload size={12} />
        <span>Upload</span>
        <input
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={handleFileInput}
        />
      </label>

      {/* Save */}
      <button
        onClick={handleSave}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#cdd6f4] hover:bg-[#313145] transition-colors"
        title="Save project (Ctrl+S)"
      >
        <Save size={12} />
        <span>Save</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Compression indicator */}
      {adminSettings.compress_images && (
        <div className="text-[10px] text-[#fab387] bg-[#fab38720] px-2 py-0.5 rounded">
          Compress ON ({adminSettings.compress_width}px)
        </div>
      )}

      {/* Admin settings */}
      {isAdmin && (
        <button
          onClick={() => setShowAdmin(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#cdd6f4] hover:bg-[#313145] transition-colors"
          title="Admin panel"
        >
          <Settings size={12} />
        </button>
      )}

      {/* User menu */}
      <div className="relative">
        {user ? (
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-[#cdd6f4] hover:bg-[#313145] transition-colors"
            onClick={() => setShowUserMenu((v) => !v)}
          >
            <div className="w-5 h-5 rounded-full bg-[#89b4fa] flex items-center justify-center text-[#1e1e2e] text-[9px] font-bold">
              {user.display_name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <span className="max-w-[80px] truncate">{user.display_name}</span>
            <span
              className="text-[8px] px-1 py-0.5 rounded"
              style={{
                background: user.user_type === 'admin' ? '#f38ba820' :
                  user.user_type === 'member' ? '#a6e3a120' : '#6c708640',
                color: user.user_type === 'admin' ? '#f38ba8' :
                  user.user_type === 'member' ? '#a6e3a1' : '#6c7086',
              }}
            >
              {user.user_type}
            </span>
            <ChevronDown size={10} />
          </button>
        ) : (
          <button
            onClick={() => setShowAuth(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#cdd6f4] hover:bg-[#313145] transition-colors"
          >
            <LogIn size={12} />
            <span>Sign In</span>
          </button>
        )}

        {showUserMenu && user && (
          <div
            className="absolute right-0 top-full mt-1 w-44 bg-[#2a2a3e] border border-[#3a3a4e] rounded-lg shadow-xl z-50 py-1"
            onMouseLeave={() => setShowUserMenu(false)}
          >
            <div className="px-3 py-2 border-b border-[#3a3a4e]">
              <p className="text-xs font-medium text-[#cdd6f4] truncate">{user.email}</p>
              <p className="text-[10px] text-[#6c7086] capitalize">{user.user_type} account</p>
            </div>
            {isAdmin && (
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#cdd6f4] hover:bg-[#313145] text-left"
                onClick={() => { setShowAdmin(true); setShowUserMenu(false); }}
              >
                <Settings size={11} /> Admin Panel
              </button>
            )}
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#cdd6f4] hover:bg-[#313145] text-left"
              onClick={() => { setShowChangePw(true); setShowUserMenu(false); }}
            >
              <KeyRound size={11} /> Change Password
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#f38ba8] hover:bg-[#313145] text-left"
              onClick={handleSignOut}
            >
              <LogOut size={11} /> Sign Out
            </button>
          </div>
        )}
      </div>

      {showChangePw && (
        <ChangePasswordModal onClose={() => setShowChangePw(false)} />
      )}
    </div>
  );
}

// ─── Tool button ────────────────────────────────────────────────────────────

function ToolButton({
  active, onClick, title, children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors ${
        active
          ? 'bg-[#89b4fa] text-[#1e1e2e] font-semibold'
          : 'text-[#cdd6f4] hover:bg-[#313145]'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Helper ────────────────────────────────────────────────────────────────

let counter = 0;
function generatePictureName(): string {
  const existing = new Set(useEditorStore.getState().pictures.map((p) => p.name));
  const boxes = new Set(useEditorStore.getState().selectionBoxes.map((b) => b.label));
  let name: string;
  do {
    counter++;
    name = `picture-${counter}`;
  } while (existing.has(name) || boxes.has(name));
  return name;
}
