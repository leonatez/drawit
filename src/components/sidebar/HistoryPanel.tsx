'use client';

import React, { useState } from 'react';
import { History, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { useEditorStore } from '@/store';
import toast from 'react-hot-toast';

export default function HistoryPanel() {
  const { versions, projectId, loadProject } = useEditorStore();
  const [expanded, setExpanded] = useState(true);

  const restoreVersion = async (versionId: string) => {
    const confirmed = window.confirm('Restore this version? Current state will be overwritten.');
    if (!confirmed) return;

    const toastId = toast.loading('Restoring version…');
    try {
      const res = await fetch('/api/version/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, versionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Update scene JSON and force re-render
      useEditorStore.getState().setSceneJSON(data.sceneJSON);
      // Force picture reload
      window.dispatchEvent(new CustomEvent('drawit:picture-updated'));

      toast.success('Version restored', { id: toastId });
    } catch (err) {
      toast.error(`Restore failed: ${err}`, { id: toastId });
    }
  };

  if (versions.length === 0) return null;

  return (
    <div className="border-t border-[#3a3a4e] flex flex-col max-h-48 flex-shrink-0">
      {/* Header toggle */}
      <button
        className="px-3 py-2 flex items-center gap-2 text-left hover:bg-[#313145] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <History size={13} className="text-[#89b4fa] flex-shrink-0" />
        <span className="text-xs font-semibold text-[#cdd6f4] flex-1">History</span>
        <span className="text-[10px] text-[#6c7086]">{versions.length}</span>
        {expanded ? <ChevronDown size={11} className="text-[#6c7086]" /> : <ChevronRight size={11} className="text-[#6c7086]" />}
      </button>

      {expanded && (
        <div className="overflow-y-auto flex-1 p-1">
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-start gap-1.5 px-2 py-1.5 rounded-md hover:bg-[#313145] group cursor-default"
            >
              <div className="w-1 h-1 rounded-full bg-[#89b4fa] mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-[#cdd6f4] truncate">{v.description}</p>
                <p className="text-[9px] text-[#6c7086]">
                  {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 text-[#89b4fa] transition-opacity flex-shrink-0"
                onClick={() => restoreVersion(v.id)}
                title="Restore this version"
              >
                <RotateCcw size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
