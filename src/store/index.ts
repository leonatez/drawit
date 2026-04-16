import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  Picture,
  SelectionBox,
  VersionSnapshot,
  ChatMessage,
  Project,
  UserProfile,
  AdminSettings,
  Viewport,
} from '@/types';
import { BOX_COLORS } from '@/types';
import { formatLabel } from '@/lib/utils';

const MAX_VERSIONS = 20;

interface EditorStore {
  // ── Project ────────────────────────────────────────────────────────────────
  projectId: string;
  projectName: string;
  pictures: Picture[];
  selectionBoxes: SelectionBox[];
  versions: VersionSnapshot[];
  chatMessages: ChatMessage[];
  nextBoxNumber: number;
  sceneJSON: string;
  isDirty: boolean;

  // ── UI ────────────────────────────────────────────────────────────────────
  tool: 'select' | 'draw-box';
  viewport: Viewport;
  selectedPictureId: string | null;
  selectedBoxId: string | null;
  contextMenu: { x: number; y: number; type: 'picture' | 'box'; id: string } | null;
  showAuth: boolean;
  showAdmin: boolean;
  isAiLoading: boolean;

  // ── Auth ──────────────────────────────────────────────────────────────────
  user: UserProfile | null;

  // ── Admin settings ────────────────────────────────────────────────────────
  adminSettings: AdminSettings;

  // ── Actions ───────────────────────────────────────────────────────────────
  // Project
  loadProject: (project: Project) => void;
  setProjectName: (name: string) => void;
  setSceneJSON: (json: string) => void;
  markDirty: () => void;
  markClean: () => void;

  // Pictures
  addPicture: (pic: Picture) => void;
  removePicture: (id: string) => void;
  renamePicture: (id: string, name: string) => boolean;
  updatePictureBase64: (id: string, base64: string) => Promise<void>;
  updatePictureCanvas: (id: string, x: number, y: number, w: number, h: number) => void;

  // Selection boxes
  addSelectionBox: (box: Omit<SelectionBox, 'id' | 'label' | 'color'>) => SelectionBox;
  removeSelectionBox: (id: string) => void;
  updateSelectionBox: (id: string, patch: Partial<SelectionBox>) => void;

  // Versions
  createVersion: (description: string) => void;
  restoreVersion: (versionId: string) => void;

  // Chat
  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => void;

  // UI
  setTool: (t: 'select' | 'draw-box') => void;
  setViewport: (v: Viewport) => void;
  selectPicture: (id: string | null) => void;
  selectBox: (id: string | null) => void;
  setContextMenu: (m: EditorStore['contextMenu']) => void;
  setShowAuth: (v: boolean) => void;
  setShowAdmin: (v: boolean) => void;
  setAiLoading: (v: boolean) => void;

  // Auth
  setUser: (u: UserProfile | null) => void;

  // Admin
  setAdminSettings: (s: AdminSettings) => void;

  // Helpers
  getPictureByName: (name: string) => Picture | undefined;
  getBoxByLabel: (label: string) => SelectionBox | undefined;
  toProject: () => Project;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  projectId: nanoid(),
  projectName: 'Untitled Project',
  pictures: [],
  selectionBoxes: [],
  versions: [],
  chatMessages: [],
  nextBoxNumber: 1,
  sceneJSON: '{}',
  isDirty: false,

  tool: 'select',
  viewport: { scrollX: 0, scrollY: 0, zoom: 1 },
  selectedPictureId: null,
  selectedBoxId: null,
  contextMenu: null,
  showAuth: false,
  showAdmin: false,
  isAiLoading: false,

  user: null,
  adminSettings: { compress_images: false, compress_width: 500 },

  // ── Project ────────────────────────────────────────────────────────────────
  loadProject: (project) =>
    set({
      projectId: project.id,
      projectName: project.name,
      pictures: project.pictures,
      selectionBoxes: project.selectionBoxes,
      versions: project.versions,
      chatMessages: project.chatMessages,
      nextBoxNumber: project.nextBoxNumber,
      sceneJSON: project.sceneJSON,
      isDirty: false,
    }),

  setProjectName: (name) => set({ projectName: name, isDirty: true }),

  setSceneJSON: (json) => set({ sceneJSON: json }),

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  // ── Pictures ───────────────────────────────────────────────────────────────
  addPicture: (pic) =>
    set((s) => ({ pictures: [...s.pictures, pic], isDirty: true })),

  removePicture: (id) =>
    set((s) => ({
      pictures: s.pictures.filter((p) => p.id !== id),
      selectionBoxes: s.selectionBoxes.filter((b) => b.pictureId !== id),
      selectedPictureId: s.selectedPictureId === id ? null : s.selectedPictureId,
      isDirty: true,
    })),

  renamePicture: (id, name) => {
    const s = get();
    // Check uniqueness: no other picture with this name, no box with this label
    const duplicate =
      s.pictures.some((p) => p.name === name && p.id !== id) ||
      s.selectionBoxes.some((b) => b.label === name);
    if (duplicate) return false;
    set((s) => ({
      pictures: s.pictures.map((p) => (p.id === id ? { ...p, name } : p)),
      isDirty: true,
    }));
    return true;
  },

  updatePictureBase64: async (id, base64) => {
    // Persist to server then update local storage path reference
    const s = get();
    const pic = s.pictures.find((p) => p.id === id);
    if (!pic) return;

    await fetch('/api/picture/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: s.projectId, pictureId: id, base64 }),
    });

    set((s) => ({ isDirty: true }));
  },

  updatePictureCanvas: (id, x, y, w, h) =>
    set((s) => ({
      pictures: s.pictures.map((p) =>
        p.id === id ? { ...p, canvasX: x, canvasY: y, canvasWidth: w, canvasHeight: h } : p,
      ),
      isDirty: true,
    })),

  // ── Selection boxes ────────────────────────────────────────────────────────
  addSelectionBox: (boxData) => {
    const s = get();
    const label = formatLabel(s.nextBoxNumber);
    const color = BOX_COLORS[(s.nextBoxNumber - 1) % BOX_COLORS.length];
    const box: SelectionBox = { id: nanoid(), label, color, ...boxData };
    set((s) => ({
      selectionBoxes: [...s.selectionBoxes, box],
      nextBoxNumber: s.nextBoxNumber + 1,
      isDirty: true,
    }));
    return box;
  },

  removeSelectionBox: (id) =>
    set((s) => ({
      selectionBoxes: s.selectionBoxes.filter((b) => b.id !== id),
      selectedBoxId: s.selectedBoxId === id ? null : s.selectedBoxId,
      isDirty: true,
    })),

  updateSelectionBox: (id, patch) =>
    set((s) => ({
      selectionBoxes: s.selectionBoxes.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      isDirty: true,
    })),

  // ── Versions ───────────────────────────────────────────────────────────────
  createVersion: (description) => {
    const s = get();
    const version: VersionSnapshot = {
      id: nanoid(),
      description,
      createdAt: new Date().toISOString(),
      pictureData: {},  // populated server-side in the API route
      sceneJSON: s.sceneJSON,
    };
    set((s) => ({
      versions: [version, ...s.versions].slice(0, MAX_VERSIONS),
    }));
  },

  restoreVersion: (versionId) => {
    const s = get();
    const version = s.versions.find((v) => v.id === versionId);
    if (!version) return;
    set({ sceneJSON: version.sceneJSON });
    // The Canvas component watches sceneJSON and restores the Excalidraw scene
  },

  // ── Chat ───────────────────────────────────────────────────────────────────
  addChatMessage: (msg) =>
    set((s) => ({
      chatMessages: [
        ...s.chatMessages,
        { ...msg, id: nanoid(), createdAt: new Date().toISOString() },
      ],
    })),

  // ── UI ─────────────────────────────────────────────────────────────────────
  setTool: (t) => set({ tool: t }),
  setViewport: (v) => set({ viewport: v }),
  selectPicture: (id) => set({ selectedPictureId: id, selectedBoxId: null }),
  selectBox: (id) => set({ selectedBoxId: id, selectedPictureId: null }),
  setContextMenu: (m) => set({ contextMenu: m }),
  setShowAuth: (v) => set({ showAuth: v }),
  setShowAdmin: (v) => set({ showAdmin: v }),
  setAiLoading: (v) => set({ isAiLoading: v }),

  // ── Auth ───────────────────────────────────────────────────────────────────
  setUser: (u) => set({ user: u }),

  // ── Admin ──────────────────────────────────────────────────────────────────
  setAdminSettings: (s) => set({ adminSettings: s }),

  // ── Helpers ────────────────────────────────────────────────────────────────
  getPictureByName: (name) => get().pictures.find((p) => p.name === name),
  getBoxByLabel: (label) => get().selectionBoxes.find((b) => b.label === label),

  toProject: (): Project => {
    const s = get();
    return {
      id: s.projectId,
      name: s.projectName,
      userId: s.user?.id ?? null,
      pictures: s.pictures,
      selectionBoxes: s.selectionBoxes,
      versions: s.versions,
      chatMessages: s.chatMessages,
      nextBoxNumber: s.nextBoxNumber,
      sceneJSON: s.sceneJSON,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
}));

// Re-export types for convenience
export { BOX_COLORS };
