'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Trash2, Pencil, X } from 'lucide-react';
import { useEditorStore } from '@/store';
import toast from 'react-hot-toast';

export default function ContextMenuOverlay() {
  const { contextMenu, setContextMenu, pictures, selectionBoxes, removePicture, removeSelectionBox, renamePicture } = useEditorStore();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showExportDialog, setShowExportDialog] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setContextMenu]);

  if (!contextMenu) return null;

  const isPicture = contextMenu.type === 'picture';
  const picture = isPicture ? pictures.find((p) => p.id === contextMenu.id) : null;
  const box = !isPicture ? selectionBoxes.find((b) => b.id === contextMenu.id) : null;

  const handleDelete = () => {
    if (isPicture && picture) {
      removePicture(picture.id);
      toast.success(`Deleted ${picture.name}`);
    } else if (box) {
      removeSelectionBox(box.id);
      toast.success(`Deleted @${box.label}`);
    }
    setContextMenu(null);
  };

  const handleRename = () => {
    if (isPicture && picture) {
      setRenameValue(picture.name);
      setRenaming(true);
    }
  };

  const submitRename = () => {
    if (!picture) return;
    const ok = renamePicture(picture.id, renameValue.trim());
    if (!ok) {
      toast.error('Name already in use');
    } else {
      toast.success(`Renamed to "${renameValue.trim()}"`);
      setContextMenu(null);
    }
    setRenaming(false);
  };

  const handleExport = () => {
    setShowExportDialog(true);
  };

  if (showExportDialog && picture) {
    return (
      <ExportDialog
        picture={picture}
        onClose={() => { setShowExportDialog(false); setContextMenu(null); }}
      />
    );
  }

  if (renaming && picture) {
    return (
      <div
        ref={menuRef}
        className="ctx-menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-2">
          <p className="text-xs text-[#6c7086] mb-1">Rename picture</p>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenaming(false); }}
            className="w-full bg-[#1e1e2e] text-[#cdd6f4] border border-[#3a3a4e] rounded px-2 py-1 text-sm outline-none focus:border-[#89b4fa]"
          />
          <div className="flex gap-1 mt-2">
            <button onClick={submitRename} className="flex-1 bg-[#89b4fa] text-[#1e1e2e] rounded px-2 py-1 text-xs font-bold">OK</button>
            <button onClick={() => setRenaming(false)} className="flex-1 bg-[#3a3a4e] text-[#cdd6f4] rounded px-2 py-1 text-xs">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {isPicture && (
        <>
          <div className="ctx-item" onClick={handleRename}>
            <Pencil size={13} /> Rename
          </div>
          <div className="ctx-item" onClick={handleExport}>
            <Download size={13} /> Export
          </div>
          <div className="ctx-separator" />
        </>
      )}
      <div className="ctx-item danger" onClick={handleDelete}>
        <Trash2 size={13} /> Delete {isPicture ? 'picture' : `@${box?.label}`}
      </div>
    </div>
  );
}

// ─── Export dialog ─────────────────────────────────────────────────────────

function ExportDialog({ picture, onClose }: { picture: { id: string; name: string; storagePath: string; originalWidth: number }; onClose: () => void }) {
  const [mode, setMode] = useState<'current' | 'upscale'>('current');
  const [upscaleWidth, setUpscaleWidth] = useState(picture.originalWidth * 2);
  const [loading, setLoading] = useState(false);
  const { adminSettings } = useEditorStore();

  const downloadCurrent = () => {
    const url = `/api/export?path=${encodeURIComponent(picture.storagePath)}&name=${encodeURIComponent(picture.name)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${picture.name}.png`;
    a.click();
    onClose();
  };

  const downloadUpscaled = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: picture.storagePath,
          targetWidth: upscaleWidth,
        }),
      });
      if (!res.ok) { toast.error('Upscale failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${picture.name}_upscaled.png`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const isCompressed = adminSettings.compress_images;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#2a2a3e] border border-[#3a3a4e] rounded-xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#cdd6f4]">Export "{picture.name}"</h2>
          <button onClick={onClose}><X size={14} className="text-[#6c7086]" /></button>
        </div>

        {isCompressed ? (
          <>
            <p className="text-xs text-[#6c7086] mb-4">Image was compressed. Choose download option:</p>
            <div className="space-y-2 mb-4">
              {(['current', 'upscale'] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer text-sm text-[#cdd6f4]">
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                  {m === 'current' ? 'Download current (compressed) size' : 'Upscale with AI'}
                </label>
              ))}
            </div>
            {mode === 'upscale' && (
              <div className="mb-4">
                <label className="text-xs text-[#6c7086] block mb-1">Target width (px)</label>
                <input
                  type="number"
                  value={upscaleWidth}
                  onChange={(e) => setUpscaleWidth(Number(e.target.value))}
                  min={100}
                  max={4096}
                  className="w-full bg-[#1e1e2e] text-[#cdd6f4] border border-[#3a3a4e] rounded px-2 py-1 text-sm outline-none focus:border-[#89b4fa]"
                />
                <p className="text-xs text-[#6c7086] mt-1">Height will scale proportionally</p>
              </div>
            )}
            <button
              onClick={mode === 'current' ? downloadCurrent : downloadUpscaled}
              disabled={loading}
              className="w-full bg-[#89b4fa] text-[#1e1e2e] rounded-lg py-2 text-sm font-bold disabled:opacity-50"
            >
              {loading ? 'Upscaling…' : 'Download'}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-[#6c7086] mb-4">Download the picture in its current quality.</p>
            <button
              onClick={downloadCurrent}
              className="w-full bg-[#89b4fa] text-[#1e1e2e] rounded-lg py-2 text-sm font-bold"
            >
              Download PNG
            </button>
          </>
        )}
      </div>
    </div>
  );
}
