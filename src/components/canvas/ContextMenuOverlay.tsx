'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Download, Trash2, Pencil, X, ChevronRight, Camera, Wand2, Scissors } from 'lucide-react';
import { useEditorStore } from '@/store';
import type { Picture } from '@/types';
import toast from 'react-hot-toast';

const VIEW_OPTIONS = [
  { label: 'From above', prompt: 'Change the camera perspective to a top-down bird\'s eye view looking straight down at the subject. Keep all content and style the same.' },
  { label: 'From below', prompt: 'Change the camera perspective to a worm\'s eye view looking straight up at the subject from below. Keep all content and style the same.' },
  { label: 'From front', prompt: 'Change the camera perspective to a straight-on front view facing the subject directly. Keep all content and style the same.' },
  { label: 'From behind', prompt: 'Change the camera perspective to a rear view looking at the back of the subject. Keep all content and style the same.' },
  { label: 'From left', prompt: 'Change the camera perspective to a side view from the left of the subject. Keep all content and style the same.' },
  { label: 'From right', prompt: 'Change the camera perspective to a side view from the right of the subject. Keep all content and style the same.' },
  { label: 'From upper-left', prompt: 'Change the camera perspective to a three-quarter angle view from the upper-left of the subject. Keep all content and style the same.' },
  { label: 'From upper-right', prompt: 'Change the camera perspective to a three-quarter angle view from the upper-right of the subject. Keep all content and style the same.' },
];

export default function ContextMenuOverlay() {
  const { contextMenu, setContextMenu, pictures, selectionBoxes, removePicture, removeSelectionBox, renamePicture, addPicture, markDirty, projectId, isAiLoading, setAiLoading } = useEditorStore();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showViewSubmenu, setShowViewSubmenu] = useState(false);

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

  const handleVectorize = async () => {
    if (!picture) return;
    setContextMenu(null);
    const toastId = toast.loading('Vectorizing…');
    try {
      const res = await fetch('/api/vectorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, pictureId: picture.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Vectorization failed', { id: toastId }); return; }

      const newPic: Picture = {
        id: data.pictureId,
        projectId,
        name: 'Vector',
        filename: `${data.pictureId}.svg`,
        storagePath: data.storagePath,
        originalWidth: data.originalWidth,
        originalHeight: data.originalHeight,
        excalidrawFileId: data.pictureId,
        canvasX: picture.canvasX + picture.canvasWidth + 24,
        canvasY: picture.canvasY,
        canvasWidth: picture.canvasWidth,
        canvasHeight: picture.canvasHeight,
        isVector: true,
      };
      addPicture(newPic);
      markDirty();
      toast.success('Vectorized!', { id: toastId });
    } catch {
      toast.error('Vectorization failed', { id: toastId });
    }
  };

  const handleRemoveBg = async () => {
    if (!picture) return;
    setContextMenu(null);
    const toastId = toast.loading('Removing background…');
    try {
      const res = await fetch('/api/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, pictureId: picture.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Background removal failed', { id: toastId }); return; }

      const newPic: Picture = {
        id: data.pictureId,
        projectId,
        name: picture.name + ' (no bg)',
        filename: `${data.pictureId}.png`,
        storagePath: data.storagePath,
        originalWidth: data.originalWidth,
        originalHeight: data.originalHeight,
        excalidrawFileId: data.pictureId,
        canvasX: picture.canvasX + picture.canvasWidth + 24,
        canvasY: picture.canvasY,
        canvasWidth: picture.canvasWidth,
        canvasHeight: picture.canvasHeight,
      };
      addPicture(newPic);
      markDirty();
      toast.success('Background removed!', { id: toastId });
    } catch {
      toast.error('Background removal failed', { id: toastId });
    }
  };

  const handleDownloadSvg = () => {
    if (!picture) return;
    const url = `/api/picture/${picture.id}?path=${encodeURIComponent(picture.storagePath)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${picture.name}.svg`;
    a.click();
    setContextMenu(null);
  };

  const handleChangeView = async (viewPrompt: string) => {
    if (!picture) return;
    if (isAiLoading) { toast('AI is busy, please wait'); return; }
    setContextMenu(null);
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          prompt: viewPrompt,
          mentions: [{ label: picture.name, type: 'picture', pictureId: picture.id }],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || 'View change failed');
        return;
      }
      window.dispatchEvent(new CustomEvent('drawit:picture-updated'));
      toast.success('View changed');
    } catch {
      toast.error('View change failed');
    } finally {
      setAiLoading(false);
    }
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
          <p className="text-xs text-[#64748b] mb-1">Rename picture</p>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenaming(false); }}
            className="w-full bg-[#0f172a] text-[#f1f5f9] border border-[#334155] rounded px-2 py-1 text-sm outline-none focus:border-[#14b8a6]"
          />
          <div className="flex gap-1 mt-2">
            <button onClick={submitRename} className="flex-1 bg-[#14b8a6] text-[#0f172a] rounded px-2 py-1 text-xs font-bold">OK</button>
            <button onClick={() => setRenaming(false)} className="flex-1 bg-[#334155] text-[#f1f5f9] rounded px-2 py-1 text-xs">Cancel</button>
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
      {isPicture && picture?.isVector && (
        <>
          <div className="ctx-item" onClick={handleRename}>
            <Pencil size={13} /> Rename
          </div>
          <div className="ctx-item" onClick={handleDownloadSvg}>
            <Download size={13} /> Download SVG
          </div>
          <div className="ctx-separator" />
        </>
      )}
      {isPicture && !picture?.isVector && (
        <>
          <div className="ctx-item" onClick={handleRename}>
            <Pencil size={13} /> Rename
          </div>
          <div className="ctx-item" onClick={handleExport}>
            <Download size={13} /> Export
          </div>
          <div className="ctx-separator" />
          <div
            className="ctx-item relative"
            onMouseEnter={() => setShowViewSubmenu(true)}
            onMouseLeave={() => setShowViewSubmenu(false)}
          >
            <Camera size={13} /> Change view <ChevronRight size={11} className="ml-auto" />
            {showViewSubmenu && (
              <div className="ctx-submenu">
                {VIEW_OPTIONS.map((v) => (
                  <div key={v.label} className="ctx-item" onClick={() => handleChangeView(v.prompt)}>
                    {v.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="ctx-separator" />
          <div className="ctx-item" onClick={handleVectorize}>
            <Wand2 size={13} /> Vectorize
          </div>
          <div className="ctx-item" onClick={handleRemoveBg}>
            <Scissors size={13} /> Remove background
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
      <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#f1f5f9]">Export "{picture.name}"</h2>
          <button onClick={onClose}><X size={14} className="text-[#64748b]" /></button>
        </div>

        {isCompressed ? (
          <>
            <p className="text-xs text-[#64748b] mb-4">Image was compressed. Choose download option:</p>
            <div className="space-y-2 mb-4">
              {(['current', 'upscale'] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer text-sm text-[#f1f5f9]">
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                  {m === 'current' ? 'Download current (compressed) size' : 'Upscale with AI'}
                </label>
              ))}
            </div>
            {mode === 'upscale' && (
              <div className="mb-4">
                <label className="text-xs text-[#64748b] block mb-1">Target width (px)</label>
                <input
                  type="number"
                  value={upscaleWidth}
                  onChange={(e) => setUpscaleWidth(Number(e.target.value))}
                  min={100}
                  max={4096}
                  className="w-full bg-[#0f172a] text-[#f1f5f9] border border-[#334155] rounded px-2 py-1 text-sm outline-none focus:border-[#14b8a6]"
                />
                <p className="text-xs text-[#64748b] mt-1">Height will scale proportionally</p>
              </div>
            )}
            <button
              onClick={mode === 'current' ? downloadCurrent : downloadUpscaled}
              disabled={loading}
              className="w-full bg-[#14b8a6] text-[#0f172a] rounded-lg py-2 text-sm font-bold disabled:opacity-50"
            >
              {loading ? 'Upscaling…' : 'Download'}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-[#64748b] mb-4">Download the picture in its current quality.</p>
            <button
              onClick={downloadCurrent}
              className="w-full bg-[#14b8a6] text-[#0f172a] rounded-lg py-2 text-sm font-bold"
            >
              Download PNG
            </button>
          </>
        )}
      </div>
    </div>
  );
}
