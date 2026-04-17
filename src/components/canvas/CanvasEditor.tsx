'use client';

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';
import { useEditorStore } from '@/store';
import type { Picture, SelectionBox, Viewport } from '@/types';
import { nanoid } from 'nanoid';
import toast from 'react-hot-toast';
import PictureLayer from './PictureLayer';
import ContextMenuOverlay from './ContextMenuOverlay';

// ─── Coordinate helpers ────────────────────────────────────────────────────

function toScene(screenX: number, screenY: number, vp: Viewport) {
  return {
    x: screenX / vp.zoom - vp.scrollX,
    y: screenY / vp.zoom - vp.scrollY,
  };
}

import { sceneSerializerRef, sceneRestorerRef } from '@/lib/scene-ref';

// ─── Main component ────────────────────────────────────────────────────────

export default function CanvasEditor() {
  // ── Local state (no Zustand subscription for viewport/scene) ──────────────
  const [viewport, setViewport] = useState<Viewport>({ scrollX: 0, scrollY: 0, zoom: 1 });
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const excalidrawAPI = useRef<ExcalidrawImperativeAPI | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRestored = useRef(false);

  // ── Subscribe only to what drives re-renders ──────────────────────────────
  const pictures       = useEditorStore(s => s.pictures);
  const selectionBoxes = useEditorStore(s => s.selectionBoxes);
  const tool           = useEditorStore(s => s.tool);
  const selectedPictureId = useEditorStore(s => s.selectedPictureId);
  const selectedBoxId     = useEditorStore(s => s.selectedBoxId);
  const contextMenu       = useEditorStore(s => s.contextMenu);
  const sceneJSON         = useEditorStore(s => s.sceneJSON);

  // ── Stable callback: expose API ref without triggering re-renders ─────────
  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawAPI.current = api;
  }, []);

  // ── Register scene serializer once ────────────────────────────────────────
  useEffect(() => {
    sceneSerializerRef.current = () => {
      if (!excalidrawAPI.current) return '{}';
      try {
        const { serializeAsJSON } = require('@excalidraw/excalidraw');
        return serializeAsJSON(
          excalidrawAPI.current.getSceneElements(),
          excalidrawAPI.current.getAppState(),
          excalidrawAPI.current.getFiles(),
          'local',
        );
      } catch {
        return '{}';
      }
    };

    sceneRestorerRef.current = (json: string) => {
      const api = excalidrawAPI.current;
      if (!api || !json || json === '{}') return;
      try {
        const { restore } = require('@excalidraw/excalidraw');
        const restored = restore(JSON.parse(json), null, null);
        api.updateScene({
          elements: restored.elements ?? [],
          appState: { ...restored.appState, collaborators: new Map() },
        });
      } catch { /* ignore */ }
    };
  }, []);

  // ── Debounced sceneJSON update (not on every onChange) ────────────────────
  const sceneFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushScene = useCallback(() => {
    if (sceneFlushTimer.current) clearTimeout(sceneFlushTimer.current);
    sceneFlushTimer.current = setTimeout(() => {
      const json = sceneSerializerRef.current();
      if (json !== '{}') useEditorStore.getState().setSceneJSON(json);
    }, 2000); // write to store at most every 2 s
  }, []);

  // ── Stable onChange: only updates local viewport state ────────────────────
  const handleExcalidrawChange = useCallback(
    (_elements: unknown, appState: { scrollX: number; scrollY: number; zoom: { value: number } }) => {
      setViewport({
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom.value,
      });
      flushScene();
    },
    [flushScene],
  );

  // ── Restore scene once when the API ref becomes available ─────────────────
  const doRestoreScene = useCallback(() => {
    if (sceneRestored.current) return;
    const api = excalidrawAPI.current;
    const json = useEditorStore.getState().sceneJSON;
    if (!api || !json || json === '{}') return;
    try {
      const { restore } = require('@excalidraw/excalidraw');
      const restored = restore(JSON.parse(json), null, null);
      api.updateScene({
        elements: restored.elements ?? [],
        appState: { ...restored.appState, collaborators: new Map() },
      });
      sceneRestored.current = true;
    } catch { /* ignore */ }
  }, []);

  // Try to restore after a short delay to ensure excalidrawAPI is ready
  useEffect(() => {
    const timer = setTimeout(doRestoreScene, 300);
    return () => clearTimeout(timer);
  }, [doRestoreScene]);

  // ── Stable Excalidraw props ────────────────────────────────────────────────
  const initialData = useMemo(() => ({
    appState: {
      viewBackgroundColor: '#1e1e2e',
      gridSize: null as null,
      collaborators: new Map(),
    },
  }), []);

  const uiOptions = useMemo(() => ({
    canvasActions: {
      export: false as const,
      saveToActiveFile: false,
      saveAsImage: false,
      clearCanvas: false,
      changeViewBackgroundColor: false,
      loadScene: false,
      toggleTheme: false,
    },
    tools: { image: false },
  }), []);

  // ── File drop ──────────────────────────────────────────────────────────────
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    await uploadFiles(files, e.clientX, e.clientY, containerRef.current, viewport);
  }, [viewport]);

  // ── Draw-box mouse handling ────────────────────────────────────────────────
  const drawState = useRef<{
    active: boolean;
    startX: number; startY: number;
    pictureId: string | null;
    preview: { x: number; y: number; w: number; h: number } | null;
  }>({ active: false, startX: 0, startY: 0, pictureId: null, preview: null });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool !== 'draw-box' || e.button !== 0) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const scene = toScene(e.clientX - rect.left, e.clientY - rect.top, viewport);
    const pic = findPictureAtScene(scene.x, scene.y);
    if (!pic) { toast('Draw the box on a picture', { icon: '⚠️' }); return; }
    drawState.current = { active: true, startX: scene.x, startY: scene.y, pictureId: pic.id, preview: null };
  }, [tool, viewport]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawState.current.active) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const scene = toScene(e.clientX - rect.left, e.clientY - rect.top, viewport);
    const x = Math.min(drawState.current.startX, scene.x);
    const y = Math.min(drawState.current.startY, scene.y);
    const w = Math.abs(scene.x - drawState.current.startX);
    const h = Math.abs(scene.y - drawState.current.startY);
    drawState.current.preview = { x, y, w, h };
    setDrawPreview({ x, y, w, h });
  }, [viewport]);

  const handleMouseUp = useCallback(() => {
    const ds = drawState.current;
    if (!ds.active) return;
    ds.active = false;
    setDrawPreview(null);
    const preview = ds.preview;
    if (!preview || !ds.pictureId || preview.w < 10 || preview.h < 10) return;

    const pic = useEditorStore.getState().pictures.find(p => p.id === ds.pictureId);
    if (!pic) return;

    const box = useEditorStore.getState().addSelectionBox({
      pictureId: ds.pictureId,
      relX: Math.max(0, Math.min(1, (preview.x - pic.canvasX) / pic.canvasWidth)),
      relY: Math.max(0, Math.min(1, (preview.y - pic.canvasY) / pic.canvasHeight)),
      relW: Math.min(1, preview.w / pic.canvasWidth),
      relH: Math.min(1, preview.h / pic.canvasHeight),
    });

    toast.success(`Box @${box.label} created`);
    useEditorStore.getState().setTool('select');
    drawState.current.pictureId = null;
  }, []);

  // ── Context menu ──────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const picId = target.closest('[data-picture-id]')?.getAttribute('data-picture-id');
    const boxId = target.closest('[data-box-id]')?.getAttribute('data-box-id');
    const { setContextMenu } = useEditorStore.getState();
    if (picId) {
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'picture', id: picId });
    } else if (boxId) {
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'box', id: boxId });
    } else {
      setContextMenu(null);
    }
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const { setContextMenu, selectPicture, selectBox } = useEditorStore.getState();
    if (contextMenu) { setContextMenu(null); return; }
    const target = e.target as HTMLElement;
    if (!target.closest('[data-picture-id]') && !target.closest('[data-box-id]')) {
      selectPicture(null);
      selectBox(null);
    }
  }, [contextMenu]);

  const cursor = tool === 'draw-box' ? 'crosshair' : 'default';

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={{ cursor }}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleCanvasClick}
      onContextMenu={handleContextMenu}
    >
      {/* Excalidraw background: pan/zoom/grid only */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: tool === 'draw-box' ? 'none' : 'auto' }}
      >
        <Excalidraw
          excalidrawAPI={handleExcalidrawAPI}
          onChange={handleExcalidrawChange}
          theme="dark"
          UIOptions={uiOptions}
          initialData={initialData}
        />
      </div>

      {/* Picture + selection-box overlay */}
      <PictureLayer
        viewport={viewport}
        drawPreview={drawPreview}
        pictures={pictures}
        selectionBoxes={selectionBoxes}
        selectedPictureId={selectedPictureId}
        selectedBoxId={selectedBoxId}
      />

      {/* Context menu */}
      {contextMenu && <ContextMenuOverlay />}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findPictureAtScene(sx: number, sy: number): Picture | null {
  const pics = useEditorStore.getState().pictures;
  for (let i = pics.length - 1; i >= 0; i--) {
    const p = pics[i];
    if (sx >= p.canvasX && sx <= p.canvasX + p.canvasWidth &&
        sy >= p.canvasY && sy <= p.canvasY + p.canvasHeight) {
      return p;
    }
  }
  return null;
}

let picCounter = 0;
function generatePictureName(): string {
  const existing = new Set(useEditorStore.getState().pictures.map(p => p.name));
  const boxes = new Set(useEditorStore.getState().selectionBoxes.map(b => b.label));
  let name: string;
  do { picCounter++; name = `picture-${picCounter}`; }
  while (existing.has(name) || boxes.has(name));
  return name;
}

async function uploadFiles(
  files: File[],
  dropClientX: number,
  dropClientY: number,
  container: HTMLDivElement | null,
  viewport: Viewport,
) {
  const projectId = useEditorStore.getState().projectId;
  const rect = container?.getBoundingClientRect();
  const screenX = dropClientX - (rect?.left ?? 0);
  const screenY = dropClientY - (rect?.top ?? 0);
  const scenePos = toScene(screenX, screenY, viewport);

  for (const file of files) {
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

      const pic: Picture = {
        id: data.pictureId,
        projectId,
        name: generatePictureName(),
        filename: `${data.pictureId}.png`,
        storagePath: data.storagePath,
        originalWidth: data.originalWidth,
        originalHeight: data.originalHeight,
        excalidrawFileId: nanoid(),
        canvasX: scenePos.x - displayW / 2,
        canvasY: scenePos.y - displayH / 2,
        canvasWidth: displayW,
        canvasHeight: displayH,
      };
      useEditorStore.getState().addPicture(pic);
      toast.success(`Uploaded ${file.name}`, { id: toastId });
    } catch (err) {
      toast.error(`Upload failed: ${err}`, { id: toastId });
    }
  }
}
