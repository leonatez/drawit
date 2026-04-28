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
const MAX_UNDO = 50;

// ─── Undo stack ────────────────────────────────────────────────────────────────

type UndoEntry =
  | { type: 'remove-picture'; picture: Picture; boxes: SelectionBox[] }
  | { type: 'add-picture'; pictureId: string }
  | { type: 'remove-box'; box: SelectionBox }
  | { type: 'add-box'; boxId: string }
  | { type: 'move-picture'; pictureId: string; canvasX: number; canvasY: number; canvasWidth: number; canvasHeight: number };

// ─── Store interface ───────────────────────────────────────────────────────────

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
  showProjects: boolean;
  showChangePw: boolean;
  showPayment: boolean;
  isAiLoading: boolean;
  limitExceeded: { limitType: 'daily' | 'monthly'; limit: number; used: number; tier: string } | null;

  // ── Undo ──────────────────────────────────────────────────────────────────
  undoStack: UndoEntry[];

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
  setShowProjects: (v: boolean) => void;
  setShowChangePw: (v: boolean) => void;
  setShowPayment: (v: boolean) => void;
  setAiLoading: (v: boolean) => void;
  setLimitExceeded: (v: EditorStore['limitExceeded']) => void;

  // Undo
  pushUndo: (entry: UndoEntry) => void;
  undo: () => void;

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
  showProjects: false,
  showChangePw: false,
  showPayment: false,
  isAiLoading: false,
  limitExceeded: null,

  undoStack: [],

  user: null,
  adminSettings: {
    compress_images: false,
    compress_width: 500,
    vec_n_colors: 12,
    vec_min_area: 8,
    vec_smoothing: 0.6,
    rmbg_model: 'modnet',
  },

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
      undoStack: [],
    }),

  setProjectName: (name) => set({ projectName: name, isDirty: true }),

  setSceneJSON: (json) => set({ sceneJSON: json }),

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  // ── Pictures ───────────────────────────────────────────────────────────────
  addPicture: (pic) => {
    get().pushUndo({ type: 'add-picture', pictureId: pic.id });
    set((s) => ({ pictures: [...s.pictures, pic], isDirty: true }));
  },

  removePicture: (id) => {
    const s = get();
    const pic = s.pictures.find((p) => p.id === id);
    const boxes = s.selectionBoxes.filter((b) => b.pictureId === id);
    if (pic) get().pushUndo({ type: 'remove-picture', picture: pic, boxes });
    set((s) => ({
      pictures: s.pictures.filter((p) => p.id !== id),
      selectionBoxes: s.selectionBoxes.filter((b) => b.pictureId !== id),
      selectedPictureId: s.selectedPictureId === id ? null : s.selectedPictureId,
      isDirty: true,
    }));
  },

  renamePicture: (id, name) => {
    const s = get();
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
    const s = get();
    const pic = s.pictures.find((p) => p.id === id);
    if (!pic) return;

    await fetch('/api/picture/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: s.projectId, pictureId: id, base64 }),
    });

    set(() => ({ isDirty: true }));
  },

  updatePictureCanvas: (id, x, y, w, h) => {
    const pic = get().pictures.find((p) => p.id === id);
    if (pic) {
      get().pushUndo({
        type: 'move-picture',
        pictureId: id,
        canvasX: pic.canvasX,
        canvasY: pic.canvasY,
        canvasWidth: pic.canvasWidth,
        canvasHeight: pic.canvasHeight,
      });
    }
    set((s) => ({
      pictures: s.pictures.map((p) =>
        p.id === id ? { ...p, canvasX: x, canvasY: y, canvasWidth: w, canvasHeight: h } : p,
      ),
      isDirty: true,
    }));
  },

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
    get().pushUndo({ type: 'add-box', boxId: box.id });
    return box;
  },

  removeSelectionBox: (id) => {
    const box = get().selectionBoxes.find((b) => b.id === id);
    if (box) get().pushUndo({ type: 'remove-box', box });
    set((s) => ({
      selectionBoxes: s.selectionBoxes.filter((b) => b.id !== id),
      selectedBoxId: s.selectedBoxId === id ? null : s.selectedBoxId,
      isDirty: true,
    }));
  },

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
      pictureData: {},
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
  setShowProjects: (v) => set({ showProjects: v }),
  setShowChangePw: (v) => set({ showChangePw: v }),
  setAiLoading: (v) => set({ isAiLoading: v }),
  setLimitExceeded: (v) => set({ limitExceeded: v }),
  setShowPayment: (v) => set({ showPayment: v }),

  // ── Undo ───────────────────────────────────────────────────────────────────
  pushUndo: (entry) =>
    set((s) => ({ undoStack: [entry, ...s.undoStack].slice(0, MAX_UNDO) })),

  undo: () => {
    const s = get();
    if (s.undoStack.length === 0) return;
    const [entry, ...rest] = s.undoStack;
    set({ undoStack: rest });

    switch (entry.type) {
      case 'remove-picture':
        set((s) => ({
          pictures: [...s.pictures, entry.picture],
          selectionBoxes: [...s.selectionBoxes, ...entry.boxes],
          isDirty: true,
        }));
        break;
      case 'add-picture':
        set((s) => ({
          pictures: s.pictures.filter((p) => p.id !== entry.pictureId),
          selectionBoxes: s.selectionBoxes.filter((b) => b.pictureId !== entry.pictureId),
          isDirty: true,
        }));
        break;
      case 'remove-box':
        set((s) => ({
          selectionBoxes: [...s.selectionBoxes, entry.box],
          isDirty: true,
        }));
        break;
      case 'add-box':
        set((s) => ({
          selectionBoxes: s.selectionBoxes.filter((b) => b.id !== entry.boxId),
          isDirty: true,
        }));
        break;
      case 'move-picture':
        set((s) => ({
          pictures: s.pictures.map((p) =>
            p.id === entry.pictureId
              ? { ...p, canvasX: entry.canvasX, canvasY: entry.canvasY, canvasWidth: entry.canvasWidth, canvasHeight: entry.canvasHeight }
              : p,
          ),
          isDirty: true,
        }));
        break;
    }
  },

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
