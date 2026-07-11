# Codebase Summary

## Project Overview

DrawIt is a Next.js 14 AI-powered single-page image editor built with:
- **Canvas**: Excalidraw for infinite pan/zoom and vector drawing
- **AI Backends**: Gemini (Google Generative AI) and VILAO (OpenAI-compatible) for image editing
- **Auth**: Supabase email+password authentication
- **Storage**: Local-disk project persistence (not cloud-based)
- **State**: Zustand for unified app state management
- **Styling**: Tailwind CSS with custom canvas overlays

## Key Statistics

- **Total Files**: 83
- **Total Code**: ~565K tokens, 1.5M characters
- **Language**: TypeScript/React (98% of source code)
- **Tech Stack**: Next.js 14 (App Router), React 18, Zustand, Excalidraw, Supabase, sharp, Tailwind

## Directory Structure

```
drawit/
├── data/                           # Runtime data (gitignored)
├── src/
│   ├── app/
│   │   ├── api/                   # API routes (Next.js 14 App Router)
│   │   │   ├── ai/                # AI provider routes (edit, models)
│   │   │   ├── project/           # Project CRUD
│   │   │   ├── picture/           # Image file serving & updates
│   │   │   ├── admin/             # Admin settings & user management
│   │   │   ├── upload/            # Image upload with optional compression
│   │   │   ├── upscale/           # Gemini-only upscaling
│   │   │   └── ... (other routes)
│   │   ├── page.tsx               # Main SPA entry, auth bootstrap, auto-save, keyboard shortcuts
│   │   ├── layout.tsx             # Root layout, global CSS, Toaster
│   │   └── globals.css            # Tailwind + custom canvas styles
│   ├── components/
│   │   ├── canvas/                # Canvas core (CanvasEditor, PictureLayer, ContextMenu)
│   │   ├── chat/                  # AI chat (ChatPanel, MentionInput with @autocomplete)
│   │   ├── sidebar/               # Left panel (LayersPanel, HistoryPanel)
│   │   ├── layout/                # App header (TopBar with model dropdown)
│   │   ├── auth/                  # Sign-in/register modal
│   │   ├── admin/                 # Admin settings & user management modal
│   │   └── projects/              # Project list & switch modal
│   ├── lib/
│   │   ├── ai/                    # AI provider abstraction
│   │   │   ├── providers/         # Multi-provider system (types, gemini-provider, vilao-provider, index)
│   │   │   └── gemini.ts          # Upscale-only wrapper (legacy)
│   │   ├── supabase/              # Supabase client (browser + server)
│   │   ├── auth-guard.ts          # Auth checks, member-gating, usage quota
│   │   ├── storage.ts             # Disk I/O for projects, pictures, versions
│   │   ├── image-utils.server.ts  # sharp-based: box annotation, mask generation, upscale
│   │   ├── scene-ref.ts           # Excalidraw API bridge (serialize/restore scene)
│   │   └── utils.ts               # cn(), formatLabel(), parseMentions()
│   ├── store/                     # Zustand state (EditorStore)
│   ├── types/                     # TypeScript interfaces
│   └── test/                      # Unit tests (Vitest)
├── e2e/                           # End-to-end tests (Playwright)
├── supabase/
│   └── schema.sql                 # Database schema: profiles, admin_settings, RLS, triggers
├── scripts/
│   ├── setup-db.mjs               # Database initialization helper
│   ├── remove_bg.py               # Image background removal (external service)
│   └── vectorize.py               # Image vectorization (external service)
├── vitest.config.ts               # Unit test config
├── playwright.config.ts           # E2E test config
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript config
└── tailwind.config.ts             # Tailwind configuration
```

## Core Components

### Canvas System
- **CanvasEditor** (`src/components/canvas/CanvasEditor.tsx`): Excalidraw wrapper with scene state tracking, draw-box mode, file drag-drop
- **PictureLayer** (`src/components/canvas/PictureLayer.tsx`): Overlay (z-index 10) with draggable/resizable images and selection boxes
- **SelectionBoxEl**: Colored bordered box (editable coordinates stored as ratios)
- **PictureFrame**: Image frame with drag-to-move and 8-handle resize
- **ContextMenuOverlay**: Right-click menu for pictures/boxes (rename, export, delete)

### Chat & AI
- **ChatPanel** (`src/components/chat/ChatPanel.tsx`): Chat history, send logic, member-gating
- **MentionInput** (`src/components/chat/MentionInput.tsx`): Textarea with `@mention` autocomplete (pictures/boxes)
- **Model Dropdown** (in TopBar/ChatPanel): Session-only model selection (fetches from `GET /api/ai/models`)
- **Error Handling**: Red-tinted error bubbles with exact provider error messages

### Sidebar
- **LayersPanel** (`src/components/sidebar/LayersPanel.tsx`): Picture hierarchy with nested boxes
- **HistoryPanel** (`src/components/sidebar/HistoryPanel.tsx`): Version snapshots with restore buttons

### Modals
- **AuthModal** (`src/components/auth/AuthModal.tsx`): Supabase email+password sign-in/register
- **AdminPanel** (`src/components/admin/AdminPanel.tsx`): Settings (compression) + users (role management)
- **ProjectsModal** (`src/components/projects/ProjectsModal.tsx`): List, open, create, delete projects
- **ExportDialog**: Download as PNG or AI-upscaled

### UI & Navigation
- **TopBar** (`src/components/layout/TopBar.tsx`): Logo, tools (Select/Draw), upload, save, projects, admin, user menu

## State Management (Zustand)

**useEditorStore** (`src/store/index.ts`):

**Project State** (persisted to disk):
- `projectId`, `projectName`: unique identifier and display name
- `pictures`: image frames with canvas position (x, y, w, h, rotation)
- `selectionBoxes`: drawn regions with relative coordinates (0–1 ratio), color, label
- `versions`: up to 20 version snapshots (newest first); each has metadata + disk-backed PNG files
- `chatMessages`: conversation history (HTML-escaped to prevent stored XSS)
- `nextBoxNumber`: auto-increment for box label generation
- `sceneJSON`: serialized Excalidraw scene (no binary data)
- `isDirty`: unsaved changes flag

**UI State** (ephemeral):
- `tool`: 'select' | 'draw-box'
- `viewport`: Excalidraw scroll/zoom state
- `selectedPictureId`, `selectedBoxId`: current selection
- `contextMenu`: right-click menu (position, target)
- `showAuth`, `showAdmin`, `showProjects`: modal visibility
- `isAiLoading`: AI request in progress
- `selectedModel`: currently selected model ID (session-only, not persisted)
- `undoStack`: client-side undo history (max 50, cleared on project switch)

**Undo System**:
- Tracks: add/remove/move picture or box
- Does NOT track: AI edits (use History panel version restore instead)
- Cleared when switching projects

## API Routes

### AI & Image Editing

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/ai/edit` | POST | member+ | AI image edit via Gemini or VILAO |
| `/api/ai/models` | GET | member+ | List configured models (for dropdown) |
| `/api/upscale` | POST | member+ | Gemini-only upscaling (not multi-provider) |
| `/api/remove-bg` | POST | member+ | Background removal (external service) |
| `/api/vectorize` | POST | member+ | Vectorization (external service) |

### Project Management

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/project` | GET | public | Load project by ID |
| `/api/project` | POST | public | Create new project |
| `/api/project` | PUT | public | Save/update project |
| `/api/project` | DELETE | public | Delete project |
| `/api/projects` | GET | public | List all projects |

### Image Files

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/picture/[id]` | GET | public | Serve PNG file (no-cache) |
| `/api/picture/update` | POST | public | Overwrite picture with new base64 |
| `/api/upload` | POST | public | Upload & convert to PNG |
| `/api/export` | GET | public | Download picture as attachment |

### Version Management

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/version/restore` | POST | public | Restore to previous version snapshot |

### Admin

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/admin/settings` | GET | public | Get admin settings (compression) |
| `/api/admin/settings` | PUT | admin | Update admin settings |
| `/api/admin/users` | GET | admin | List all user profiles |
| `/api/admin/users` | PUT | admin | Change user role |

### Ancillary

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/profile` | GET | auth | Get current user profile |
| `/api/checkout` | POST | member+ | Stripe checkout (payment processing) |
| `/api/pricing-plans` | GET | public | List available plans |

## Authentication Model

**Provider**: Supabase (email + password only; no OAuth).

**User Types**:
- `guest`: Default on signup; read-only canvas, no AI access
- `member`: Full AI access; promoted by admin
- `admin`: Settings + user management

**Session Management**:
- Browser: `createBrowserClient` (cookies via `@supabase/ssr`)
- Server: `createServerClient` (reads cookies via Next.js `cookies()`)
- Admin: `createAdminSupabase()` (service role, bypasses RLS)

**Auth Guards**:
- `requireMember()`: enforces member/admin role on AI routes
- `requireAdmin()` / `isAdmin()`: enforces admin-only routes

## Multi-Provider AI System

### Architecture

**Provider Abstraction** (`src/lib/ai/providers/`):
```
types.ts              # Interfaces, model parsing, config
├── ProviderEditInput  # Input: prompt, mentions, pictures, target
├── ProviderEditResult # Output: base64 or error message
├── parseModelId()     # Split "<provider>/<model>" on first /
└── getConfiguredModels() # Parse MODELS env var

gemini-provider.ts    # Gemini implementation
vilao-provider.ts     # VILAO (OpenAI-compatible) implementation
index.ts              # Router: editImageWithProvider()
```

### Gemini Provider
- **Model**: `gemini-3.1-flash-image-preview`
- **SDK**: @google/generative-ai
- **Images**: single or multi-image via parts array
- **Errors**: blockReason (safety), finishReason, safetyRatings
- **Mask**: not needed (text-based region description)

### VILAO Provider (Not Yet Production-Verified)
- **API**: OpenAI-compatible POST `/v1/images/edits`
- **Images**: target + context images via multipart FormData `image[]` array
- **Mask**: transparent PNG generated from selection box coordinates
- **Timeout**: 120 seconds (AbortController)
- **Errors**: verbatim OpenAI/VILAO error messages
- **Status**: Implemented, awaiting user-supplied real API key + endpoint confirmation

## Image Processing

**Server-Only** (`src/lib/image-utils.server.ts`):
- `annotateImageWithBox()`: Overlay colored bounding box + label on image (via sharp + SVG)
- `generateEditMask()`: Create transparent PNG mask from selection box coordinates
- `resizeImage()`: Compress to admin-configured max width

**Format**: All images converted to PNG on upload via sharp (supports JPEG, WebP, GIF input).

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Switch to Select tool |
| `B` | Switch to Draw Box tool |
| `Delete` / `Backspace` | Delete selected picture/box |
| `Ctrl+Z` / `Cmd+Z` | Undo (client-side only; AI edits use History panel) |
| `Ctrl+S` / `Cmd+S` | Save project immediately |

## Data Persistence

**Local Disk** (not cloud-based):
```
data/projects/<projectId>/
├── project.json           # Metadata, pictures, boxes, versions, chat
├── pictures/
│   └── <pictureId>.png    # Current image file
└── versions/<versionId>/
    └── <pictureId>.png    # Per-version snapshot
```

**Auto-Save**: Every 5 seconds if dirty (or manual Ctrl+S).

**Version History**: Up to 20 snapshots kept; oldest deleted when limit reached.

## Security Highlights

1. **Model Allowlisting**: Client-supplied `model` validated against server's `MODELS` list (prevents API key abuse)
2. **HTML Escaping**: Chat messages escaped before @mention highlighting (prevents stored XSS)
3. **Member-Gating**: AI routes require member/admin role
4. **Never-Throws Contract**: Provider functions never throw; route has backstop try/catch
5. **Timeout & Abort**: VILAO fetch has 120s timeout with AbortController
6. **RLS Policies**: Supabase Row-Level Security controls profile access

## Testing

**Unit Tests** (Vitest):
- Config: `vitest.config.ts` (jsdom, @vitejs/plugin-react)
- Setup: `src/test/setup.ts` (@testing-library/jest-dom)
- Tests: `src/test/utils.test.ts` (cn, formatLabel, parseMentions)

**E2E Tests** (Playwright):
- Config: `playwright.config.ts` (Chromium only)
- Tests: `e2e/smoke.spec.ts` (core workflows)
- Auto-starts dev server if needed

**CI/CD**: GitHub Actions (lint, test, build on push to main).

## Known Constraints

1. **Local-disk only**: no serverless persistence; designed for self-hosted
2. **No concurrent access protection**: race condition on `project.json` if multiple tabs edit same project
3. **Version metadata stored twice**: `project.json` entries + file snapshots; out-of-sync breaks restore
4. **Box label namespace shared**: no picture name = any box label
5. **Excalidraw no SSR**: small loading flash; scene restored 300ms after mount
6. **Undo scope**: client-side structural changes only (add/remove/move); AI edits use History panel
7. **Project deletion permanent**: no recycle bin
8. **No password reset**: sign-in and registration only
9. **VILAO not production-verified**: needs user confirmation of API key + base URL before shipping

## Development Commands

```bash
npm install              # Install dependencies
npm run dev             # Start dev server (http://localhost:3000)
npm run build           # Production build
npm run start           # Start production server
npm run lint            # ESLint
npm run test            # Run unit tests (single pass)
npm run test:watch     # Run unit tests (watch mode)
npm run test:e2e       # Run E2E tests (Playwright)
```

## Environment Variables

See `deployment-guide.md` for detailed setup. Key additions for multi-provider system:

- `MODELS`: Comma-separated `<provider>/<model>` list (defaults to Gemini only)
- `VILAO_API_KEY`: Required only if `vilao/*` models configured
- `VILAO_BASE_URL`: VILAO endpoint (defaults to `https://api.vilao.ai/v1/images/edits`)

All others (SUPABASE_*, GEMINI_API_KEY) remain required as before.

## Maintenance Notes

- **Max file size**: 200 LOC per file (split large components into focused modules)
- **Naming**: kebab-case for files; describe purpose clearly
- **Code comments**: Add for complex logic or non-obvious design decisions
- **Type safety**: Strict TypeScript; no `any` without justification
- **Testing**: Unit tests for utilities, E2E for core workflows
- **Docs**: Keep in sync with code; mark unverified features clearly

## Links

- **System Architecture**: `docs/system-architecture.md`
- **Deployment Guide**: `docs/deployment-guide.md`
- **Project README**: `README.md` (setup & quick start)
