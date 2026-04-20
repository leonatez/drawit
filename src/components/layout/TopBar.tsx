'use client';

import React, { useState } from 'react';
import {
  MousePointer2, Square, Upload, Settings, LogOut,
  LogIn, Save, ChevronDown, FolderOpen, KeyRound,
} from 'lucide-react';
import { useEditorStore } from '@/store';
import { sceneSerializerRef } from '@/lib/scene-ref';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

export default function TopBar() {
  const {
    tool, setTool, user, setShowAuth, setShowAdmin, setShowProjects, setShowChangePw,
    projectName, setProjectName, isDirty, toProject,
    markClean, adminSettings,
  } = useEditorStore();

  const [showUserMenu, setShowUserMenu] = useState(false);

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
    <div className="h-10 bg-[#1e293b] border-b border-[#334155] flex items-center px-3 gap-2 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-1.5 mr-1">
        <svg width="20" height="20" viewBox="0 0 80 80" fill="none">
          <rect width="80" height="80" rx="20" fill="#1e293b" stroke="#14b8a6" strokeWidth="2.5"/>
          <rect x="34" y="18" width="14" height="34" rx="4" transform="rotate(30 34 18)" fill="#14b8a6"/>
          <path d="M52 52 L57 62 L47 57 Z" fill="#0d9488"/>
          <line x1="38" y1="21" x2="44" y2="37" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
          <path d="M62 16 L63.2 19.8 L67 21 L63.2 22.2 L62 26 L60.8 22.2 L57 21 L60.8 19.8 Z" fill="#f1f5f9"/>
          <path d="M18 32 L18.7 34 L20.7 34.7 L18.7 35.4 L18 37.4 L17.3 35.4 L15.3 34.7 L17.3 34 Z" fill="#14b8a6"/>
        </svg>
        <span className="text-sm font-bold text-[#f1f5f9]">draw<span className="text-[#14b8a6]">it</span></span>
        <span className="text-[9px] text-[#64748b] font-mono">v0.5</span>
      </div>

      {/* Projects switcher */}
      <button
        onClick={() => setShowProjects(true)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#64748b] hover:text-[#f1f5f9] hover:bg-[#334155] transition-colors mr-1"
        title="Manage projects"
      >
        <FolderOpen size={12} />
      </button>

      {/* Project name */}
      <input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="bg-transparent text-xs text-[#f1f5f9] border-b border-transparent hover:border-[#334155] focus:border-[#14b8a6] outline-none px-1 w-36"
        title="Project name"
      />

      {/* Dirty indicator */}
      {isDirty && (
        <span className="text-[10px] text-[#64748b]">●</span>
      )}

      <div className="h-4 w-px bg-[#334155] mx-1" />

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

      <div className="h-4 w-px bg-[#334155] mx-1" />

      {/* Upload */}
      <label
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#f1f5f9] hover:bg-[#334155] cursor-pointer transition-colors"
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
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#f1f5f9] hover:bg-[#334155] transition-colors"
        title="Save project (Ctrl+S)"
      >
        <Save size={12} />
        <span>Save</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Compression indicator */}
      {adminSettings.compress_images && (
        <div className="text-[10px] text-[#fb923c] bg-[#fb923c1a] px-2 py-0.5 rounded">
          Compress ON ({adminSettings.compress_width}px)
        </div>
      )}

      {/* Admin settings */}
      {isAdmin && (
        <button
          onClick={() => setShowAdmin(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#f1f5f9] hover:bg-[#334155] transition-colors"
          title="Admin panel"
        >
          <Settings size={12} />
        </button>
      )}

      {/* User menu */}
      <div className="relative">
        {user ? (
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-[#f1f5f9] hover:bg-[#334155] transition-colors"
            onClick={() => setShowUserMenu((v) => !v)}
          >
            <div className="w-5 h-5 rounded-full bg-[#14b8a6] flex items-center justify-center text-[#0f172a] text-[9px] font-bold">
              {user.display_name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <span className="max-w-[80px] truncate">{user.display_name}</span>
            <span
              className="text-[8px] px-1 py-0.5 rounded"
              style={{
                background: user.user_type === 'admin' ? 'rgba(248,113,113,0.12)' :
                  user.user_type === 'premium' ? 'rgba(251,146,60,0.12)' :
                  user.user_type === 'member' ? 'rgba(74,222,128,0.12)' : 'rgba(100,116,139,0.25)',
                color: user.user_type === 'admin' ? '#f87171' :
                  user.user_type === 'premium' ? '#fb923c' :
                  user.user_type === 'member' ? '#4ade80' : '#64748b',
              }}
            >
              {user.user_type}
            </span>
            <ChevronDown size={10} />
          </button>
        ) : (
          <button
            onClick={() => setShowAuth(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#f1f5f9] hover:bg-[#334155] transition-colors"
          >
            <LogIn size={12} />
            <span>Sign In</span>
          </button>
        )}

        {showUserMenu && user && (
          <div
            className="absolute right-0 top-full mt-1 w-44 bg-[#1e293b] border border-[#334155] rounded-lg shadow-xl z-50 py-1"
            onMouseLeave={() => setShowUserMenu(false)}
          >
            <div className="px-3 py-2 border-b border-[#334155]">
              <p className="text-xs font-medium text-[#f1f5f9] truncate">{user.email}</p>
              <p className="text-[10px] text-[#64748b] capitalize">{user.user_type} account</p>
            </div>
            {isAdmin && (
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#f1f5f9] hover:bg-[#334155] text-left"
                onClick={() => { setShowAdmin(true); setShowUserMenu(false); }}
              >
                <Settings size={11} /> Admin Panel
              </button>
            )}
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#f1f5f9] hover:bg-[#334155] text-left"
              onClick={() => { setShowChangePw(true); setShowUserMenu(false); }}
            >
              <KeyRound size={11} /> Change Password
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#f87171] hover:bg-[#334155] text-left"
              onClick={handleSignOut}
            >
              <LogOut size={11} /> Sign Out
            </button>
          </div>
        )}
      </div>

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
          ? 'bg-[#14b8a6] text-[#0f172a] font-semibold'
          : 'text-[#f1f5f9] hover:bg-[#334155]'
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
