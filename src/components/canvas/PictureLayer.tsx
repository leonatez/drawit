'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store';
import type { Picture, SelectionBox, Viewport } from '@/types';

interface Props {
  viewport: Viewport;
  drawPreview: { x: number; y: number; w: number; h: number } | null;
  pictures: Picture[];
  selectionBoxes: SelectionBox[];
  selectedPictureId: string | null;
  selectedBoxId: string | null;
}

// ─── Coordinate helpers ────────────────────────────────────────────────────

function sceneToScreen(sceneX: number, sceneY: number, vp: Viewport) {
  return {
    x: (sceneX + vp.scrollX) * vp.zoom,
    y: (sceneY + vp.scrollY) * vp.zoom,
  };
}

function sizeToScreen(w: number, h: number, vp: Viewport) {
  return { w: w * vp.zoom, h: h * vp.zoom };
}

// ─── PictureLayer ─────────────────────────────────────────────────────────

export default function PictureLayer({
  viewport, drawPreview, pictures, selectionBoxes, selectedPictureId, selectedBoxId,
}: Props) {

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      {/* Pictures */}
      {pictures.map((pic) => (
        <PictureFrame
          key={pic.id}
          picture={pic}
          viewport={viewport}
          isSelected={selectedPictureId === pic.id}
        />
      ))}

      {/* Selection boxes on each picture */}
      {selectionBoxes.map((box) => {
        const pic = pictures.find((p) => p.id === box.pictureId);
        if (!pic) return null;
        return (
          <SelectionBoxEl
            key={box.id}
            box={box}
            picture={pic}
            viewport={viewport}
            isSelected={selectedBoxId === box.id}
          />
        );
      })}

      {/* Draw preview box */}
      {drawPreview && (
        <DrawPreview preview={drawPreview} viewport={viewport} />
      )}
    </div>
  );
}

// ─── PictureFrame ─────────────────────────────────────────────────────────

function PictureFrame({
  picture, viewport, isSelected,
}: {
  picture: Picture; viewport: Viewport; isSelected: boolean;
}) {
  const { selectPicture, updatePictureCanvas } = useEditorStore.getState();
  const [imageUrl, setImageUrl] = useState<string>('');
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false, startX: 0, startY: 0, origX: 0, origY: 0,
  });
  const resizeRef = useRef<{
    active: boolean; handle: string;
    startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  }>({ active: false, handle: '', startX: 0, startY: 0, origX: 0, origY: 0, origW: 0, origH: 0 });

  const [localPos, setLocalPos] = useState({
    x: picture.canvasX, y: picture.canvasY,
    w: picture.canvasWidth, h: picture.canvasHeight,
  });

  // Update local pos when store changes (e.g. after restore)
  useEffect(() => {
    setLocalPos({ x: picture.canvasX, y: picture.canvasY, w: picture.canvasWidth, h: picture.canvasHeight });
  }, [picture.canvasX, picture.canvasY, picture.canvasWidth, picture.canvasHeight]);

  // Load image URL (cache-bust after AI edits via custom event)
  const [cacheBust, setCacheBust] = useState(Date.now());

  useEffect(() => {
    const handler = () => setCacheBust(Date.now());
    window.addEventListener('drawit:picture-updated', handler);
    return () => window.removeEventListener('drawit:picture-updated', handler);
  }, []);

  useEffect(() => {
    const url = `/api/picture/${picture.id}?path=${encodeURIComponent(picture.storagePath)}&t=${cacheBust}`;
    setImageUrl(url);
  }, [picture.id, picture.storagePath, cacheBust]);

  const screen = sceneToScreen(localPos.x, localPos.y, viewport);
  const size = sizeToScreen(localPos.w, localPos.h, viewport);

  // Drag to move
  const onDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (useEditorStore.getState().tool === 'draw-box') return;
    e.stopPropagation();
    selectPicture(picture.id);
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, origX: localPos.x, origY: localPos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = (ev.clientX - dragRef.current.startX) / viewport.zoom;
      const dy = (ev.clientY - dragRef.current.startY) / viewport.zoom;
      setLocalPos((p) => ({ ...p, x: dragRef.current.origX + dx, y: dragRef.current.origY + dy }));
    };
    const onUp = () => {
      dragRef.current.active = false;
      const pos = { x: localPos.x, y: localPos.y, w: localPos.w, h: localPos.h };
      // Use latest localPos via ref
      setLocalPos((p) => {
        updatePictureCanvas(picture.id, p.x, p.y, p.w, p.h);
        return p;
      });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Resize handles
  const onResizeStart = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = {
      active: true, handle,
      startX: e.clientX, startY: e.clientY,
      origX: localPos.x, origY: localPos.y, origW: localPos.w, origH: localPos.h,
    };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current.active) return;
      const { handle: h, startX, startY, origX, origY, origW, origH } = resizeRef.current;
      const dx = (ev.clientX - startX) / viewport.zoom;
      const dy = (ev.clientY - startY) / viewport.zoom;

      setLocalPos((p) => {
        let { x, y, w, h: ht } = p;
        if (h.includes('e')) { w = Math.max(50, origW + dx); }
        if (h.includes('w')) { x = origX + dx; w = Math.max(50, origW - dx); }
        if (h.includes('s')) { ht = Math.max(50, origH + dy); }
        if (h.includes('n')) { y = origY + dy; ht = Math.max(50, origH - dy); }
        return { x, y, w, h: ht };
      });
    };
    const onUp = () => {
      resizeRef.current.active = false;
      setLocalPos((p) => {
        updatePictureCanvas(picture.id, p.x, p.y, p.w, p.h);
        return p;
      });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handles = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const handlePos: Record<string, React.CSSProperties> = {
    n:  { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
    ne: { top: -4, right: -4, cursor: 'ne-resize' },
    e:  { top: '50%', right: -4, transform: 'translateY(-50%)', cursor: 'e-resize' },
    se: { bottom: -4, right: -4, cursor: 'se-resize' },
    s:  { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
    sw: { bottom: -4, left: -4, cursor: 'sw-resize' },
    w:  { top: '50%', left: -4, transform: 'translateY(-50%)', cursor: 'w-resize' },
    nw: { top: -4, left: -4, cursor: 'nw-resize' },
  };

  return (
    <div
      data-picture-id={picture.id}
      className={`picture-frame ${isSelected ? 'selected' : ''}`}
      style={{
        left: screen.x,
        top: screen.y,
        width: size.w,
        height: size.h,
        pointerEvents: 'auto',
      }}
      onMouseDown={onDragStart}
      onClick={(e) => { e.stopPropagation(); selectPicture(picture.id); }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={picture.name}
          style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }}
          draggable={false}
        />
      )}

      {/* Picture name badge */}
      <div
        style={{
          position: 'absolute', top: -24, left: 0,
          background: 'rgba(30,30,46,0.85)',
          color: '#f1f5f9', fontSize: 11, padding: '2px 7px',
          borderRadius: '4px 4px 0 0', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {picture.name}
      </div>

      {/* Resize handles (only when selected) */}
      {isSelected && handles.map((h) => (
        <div
          key={h}
          className="resize-handle"
          style={handlePos[h]}
          onMouseDown={(e) => onResizeStart(e, h)}
        />
      ))}
    </div>
  );
}

// ─── SelectionBoxEl ────────────────────────────────────────────────────────

function SelectionBoxEl({
  box, picture, viewport, isSelected,
}: {
  box: SelectionBox; picture: Picture; viewport: Viewport; isSelected: boolean;
}) {
  const { selectBox, updateSelectionBox } = useEditorStore.getState();

  const [rel, setRel] = useState({ x: box.relX, y: box.relY, w: box.relW, h: box.relH });
  useEffect(() => setRel({ x: box.relX, y: box.relY, w: box.relW, h: box.relH }), [box]);

  // Compute screen position from relative coords + picture screen pos
  const picScreen = sceneToScreen(picture.canvasX, picture.canvasY, viewport);
  const picSize = sizeToScreen(picture.canvasWidth, picture.canvasHeight, viewport);

  const bx = picScreen.x + rel.x * picSize.w;
  const by = picScreen.y + rel.y * picSize.h;
  const bw = rel.w * picSize.w;
  const bh = rel.h * picSize.h;

  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origRelX: number; origRelY: number }>({
    active: false, startX: 0, startY: 0, origRelX: 0, origRelY: 0,
  });
  const resizeRef = useRef<{ active: boolean; handle: string; startX: number; startY: number; orig: typeof rel }>({
    active: false, handle: '', startX: 0, startY: 0, orig: rel,
  });

  const onDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    selectBox(box.id);
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, origRelX: rel.x, origRelY: rel.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dRelX = (ev.clientX - dragRef.current.startX) / picSize.w;
      const dRelY = (ev.clientY - dragRef.current.startY) / picSize.h;
      setRel((r) => ({
        ...r,
        x: Math.max(0, Math.min(1 - r.w, dragRef.current.origRelX + dRelX)),
        y: Math.max(0, Math.min(1 - r.h, dragRef.current.origRelY + dRelY)),
      }));
    };
    const onUp = () => {
      dragRef.current.active = false;
      setRel((r) => {
        updateSelectionBox(box.id, { relX: r.x, relY: r.y, relW: r.w, relH: r.h });
        return r;
      });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onResizeStart = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = { active: true, handle, startX: e.clientX, startY: e.clientY, orig: { ...rel } };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current.active) return;
      const { handle: h, startX, startY, orig } = resizeRef.current;
      const dx = (ev.clientX - startX) / picSize.w;
      const dy = (ev.clientY - startY) / picSize.h;

      setRel((r) => {
        let { x, y, w, h: ht } = orig;
        const MIN = 0.02;
        if (h.includes('e')) { w = Math.max(MIN, orig.w + dx); }
        if (h.includes('w')) { x = orig.x + dx; w = Math.max(MIN, orig.w - dx); }
        if (h.includes('s')) { ht = Math.max(MIN, orig.h + dy); }
        if (h.includes('n')) { y = orig.y + dy; ht = Math.max(MIN, orig.h - dy); }
        // Clamp
        x = Math.max(0, Math.min(1 - w, x));
        y = Math.max(0, Math.min(1 - ht, y));
        return { x, y, w, h: ht };
      });
    };
    const onUp = () => {
      resizeRef.current.active = false;
      setRel((r) => {
        updateSelectionBox(box.id, { relX: r.x, relY: r.y, relW: r.w, relH: r.h });
        return r;
      });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handles = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const handlePos: Record<string, React.CSSProperties> = {
    n:  { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
    ne: { top: -4, right: -4, cursor: 'ne-resize' },
    e:  { top: '50%', right: -4, transform: 'translateY(-50%)', cursor: 'e-resize' },
    se: { bottom: -4, right: -4, cursor: 'se-resize' },
    s:  { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
    sw: { bottom: -4, left: -4, cursor: 'sw-resize' },
    w:  { top: '50%', left: -4, transform: 'translateY(-50%)', cursor: 'w-resize' },
    nw: { top: -4, left: -4, cursor: 'nw-resize' },
  };

  return (
    <div
      data-box-id={box.id}
      className="sel-box"
      style={{
        left: bx, top: by, width: bw, height: bh,
        border: `2px solid ${box.color}`,
        background: `${box.color}18`,
        pointerEvents: 'auto',
        outline: isSelected ? `1.5px solid white` : 'none',
      }}
      onMouseDown={onDragStart}
      onClick={(e) => { e.stopPropagation(); selectBox(box.id); }}
    >
      {/* Label badge */}
      <div
        style={{
          position: 'absolute', top: -20, left: -1,
          background: box.color, color: 'white',
          fontSize: 10, fontWeight: 700, padding: '1px 5px',
          borderRadius: '3px 3px 0 0', fontFamily: 'monospace',
          pointerEvents: 'none',
        }}
      >
        @{box.label}
      </div>

      {/* Resize handles */}
      {isSelected && handles.map((h) => (
        <div
          key={h}
          className="resize-handle"
          style={{ ...handlePos[h], background: box.color }}
          onMouseDown={(e) => onResizeStart(e, h)}
        />
      ))}
    </div>
  );
}

// ─── DrawPreview ──────────────────────────────────────────────────────────

function DrawPreview({ preview, viewport }: { preview: { x: number; y: number; w: number; h: number }; viewport: Viewport }) {
  const screen = sceneToScreen(preview.x, preview.y, viewport);
  const size = sizeToScreen(preview.w, preview.h, viewport);

  return (
    <div
      style={{
        position: 'absolute',
        left: screen.x, top: screen.y,
        width: size.w, height: size.h,
        border: '2px dashed #14b8a6',
        background: 'rgba(137,180,250,0.08)',
        pointerEvents: 'none',
      }}
    />
  );
}
