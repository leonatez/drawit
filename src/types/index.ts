// ─── Core data types ────────────────────────────────────────────────────────

export interface Picture {
  id: string;                // also used as Excalidraw element ID
  projectId: string;
  name: string;              // user-defined, e.g. "picture-1"
  filename: string;          // stored filename on disk
  storagePath: string;       // relative path: data/projects/<id>/pictures/<filename>
  originalWidth: number;
  originalHeight: number;
  excalidrawFileId: string;  // Excalidraw BinaryFile ID for the current version
  // Canvas position/size stored here for persistence (mirrors excalidraw element)
  canvasX: number;
  canvasY: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface SelectionBox {
  id: string;        // also used as Excalidraw element ID
  label: string;     // "01", "02", etc. – globally unique per project
  color: string;     // hex color
  pictureId: string; // which picture this box belongs to
  // Relative coords (0–1) within the picture's canvas dimensions
  relX: number;
  relY: number;
  relW: number;
  relH: number;
}

export interface VersionSnapshot {
  id: string;
  description: string;
  createdAt: string;
  // Maps pictureId → base64 PNG data at the time of snapshot
  pictureData: Record<string, string>;
  // Excalidraw scene JSON (without image binary data)
  sceneJSON: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  editedPictureId?: string;  // if AI returned an edited picture, store which one
  createdAt: string;
}

// ─── Project (persisted to disk) ────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  userId: string | null;
  pictures: Picture[];
  selectionBoxes: SelectionBox[];
  versions: VersionSnapshot[];
  chatMessages: ChatMessage[];
  nextBoxNumber: number;     // auto-increment for label generation
  sceneJSON: string;         // Excalidraw scene JSON (no binary)
  createdAt: string;
  updatedAt: string;
}

// ─── Auth / Users ────────────────────────────────────────────────────────────

export type UserType = 'guest' | 'member' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  user_type: UserType;
  created_at: string;
}

// ─── Admin settings ──────────────────────────────────────────────────────────

export interface AdminSettings {
  compress_images: boolean;
  compress_width: number;
}

// ─── API payloads ────────────────────────────────────────────────────────────

export interface EditRequest {
  projectId: string;
  prompt: string;
  // Resolved mentions: { mentionLabel, type, pictureId, box? }
  mentions: ResolvedMention[];
}

export interface ResolvedMention {
  label: string;           // "@01" or "@picture-1"
  type: 'box' | 'picture';
  pictureId: string;
  box?: SelectionBox;
}

export interface EditResponse {
  success: boolean;
  editedImages: { pictureId: string; base64: string }[];
  message: string;
}

// ─── Viewport (from Excalidraw appState) ────────────────────────────────────

export interface Viewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

// ─── Box colors palette ──────────────────────────────────────────────────────

export const BOX_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
  '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
  '#C44569', '#F8B739', '#3DC1D3', '#575FCF', '#EF5777',
];
