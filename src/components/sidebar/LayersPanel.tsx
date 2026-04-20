'use client';

import React from 'react';
import { Layers, Image as ImageIcon, Square, Trash2 } from 'lucide-react';
import { useEditorStore } from '@/store';

export default function LayersPanel() {
  const {
    pictures, selectionBoxes,
    selectedPictureId, selectedBoxId,
    selectPicture, selectBox,
    removePicture, removeSelectionBox,
    renamePicture,
  } = useEditorStore();

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-[#334155] flex items-center gap-2 flex-shrink-0">
        <Layers size={13} className="text-[#14b8a6]" />
        <span className="text-xs font-semibold text-[#f1f5f9]">Layers</span>
      </div>

      <div className="overflow-y-auto flex-1 p-1">
        {pictures.length === 0 && (
          <p className="text-[10px] text-[#64748b] text-center mt-4 px-2">
            Drop images onto the canvas to get started
          </p>
        )}

        {pictures.map((pic) => {
          const boxes = selectionBoxes.filter((b) => b.pictureId === pic.id);
          const isSelected = selectedPictureId === pic.id;

          return (
            <div key={pic.id}>
              {/* Picture row */}
              <div
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer group transition-colors ${
                  isSelected ? 'bg-[#14b8a6]/15 text-[#f1f5f9]' : 'hover:bg-[#334155] text-[#f1f5f9]'
                }`}
                onClick={() => selectPicture(pic.id)}
              >
                <ImageIcon size={11} className="text-[#14b8a6] flex-shrink-0" />
                <span
                  className="flex-1 text-[11px] truncate font-medium"
                  title={pic.name}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    const name = prompt('Rename picture:', pic.name);
                    if (name) {
                      const ok = renamePicture(pic.id, name.trim());
                      if (!ok) alert('Name already in use');
                    }
                  }}
                >
                  {pic.name}
                </span>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#f87171] hover:text-[#f87171]"
                  onClick={(e) => { e.stopPropagation(); removePicture(pic.id); }}
                  title="Delete picture"
                >
                  <Trash2 size={10} />
                </button>
              </div>

              {/* Boxes under this picture */}
              {boxes.map((box) => {
                const isBoxSelected = selectedBoxId === box.id;
                return (
                  <div
                    key={box.id}
                    className={`flex items-center gap-1.5 px-2 py-1 ml-3 rounded-md cursor-pointer group transition-colors ${
                      isBoxSelected ? 'bg-[#14b8a6]/10' : 'hover:bg-[#334155]'
                    }`}
                    onClick={() => selectBox(box.id)}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0 border"
                      style={{ background: `${box.color}40`, borderColor: box.color }}
                    />
                    <span className="flex-1 text-[10px] text-[#f1f5f9] font-mono truncate">
                      @{box.label}
                    </span>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[#f87171]"
                      onClick={(e) => { e.stopPropagation(); removeSelectionBox(box.id); }}
                      title="Delete box"
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
