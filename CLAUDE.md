# CLAUDE.md — DrawIt AI Image Editor

Canonical reference for developers and AI agents working on this codebase.

---

## 1. Project Overview

DrawIt is a single-page, AI-powered image editor built on Next.js 14. Users upload images onto an infinite canvas (powered by Excalidraw), draw labeled selection boxes over regions of interest, and then describe edits in a chat panel. The edit prompt and selected images are sent to Google Gemini, which returns a modified image that replaces the original in-place. A full version history (up to 20 snapshots) is maintained so any AI edit can be rolled back. Projects are persisted to local disk (not a cloud database); authentication is handled by Supabase and controls which users may invoke the AI.

Key capabilities:
- Drag-and-drop or file-picker image upload onto an Excalidraw canvas
- Draw named selection boxes (`@01`, `@02`, …) over any region of a picture
- AI chat with `@mention` syntax to reference pictures and boxes by name
- Gemini annotates referenced regions before sending to the image-generation model
- **Box-based AI target resolution**: when a box mention is present the picture containing that box is always the edit destination, regardless of mention order
- Automatic and manual project save (every 5 s when dirty, or Ctrl+S)
- Per-AI-edit version snapshots; one-click restore (restores both image files and Excalidraw scene)
- Export: download current PNG or AI-upscaled version
- Admin panel: manage user roles, toggle image compression
- **Multiple projects**: create, switch, and delete projects from a Projects modal
- **Keyboard shortcuts**: `V` select · `B` draw-box · `Delete`/`Backspace` delete selection · `Ctrl+Z` undo canvas edits · `Ctrl+S` save

---

## 2. Tech Stack

| Layer | Library | Version |
|---|---|---|
| Framework | Next.js (App Router) | ^14.2.29 |
| UI | React / React DOM | ^18.3.1 |
| Canvas | @excalidraw/excalidraw | ^0.17.6 |
| AI | @google/generative-ai | ^0.21.0 |
| Auth / DB | @supabase/supabase-js + @supabase/ssr | ^2.49.4 / ^0.5.2 |
| State | Zustand | ^5.0.3 |
| Image processing | sharp | ^0.33.5 |
| Styling | Tailwind CSS | ^3.4.17 |
| Class utilities | clsx + tailwind-merge | ^2.1.1 / ^2.6.0 |
| Icons | lucide-react | ^0.503.0 |
| ID generation | nanoid | ^5.1.5 |
| Toast notifications | react-hot-toast | ^2.5.2 |
| Unit tests | vitest + @testing-library/react | ^4.1.4 / ^16.3.2 |
| E2E tests | @playwright/test | ^1.59.1 |
| TypeScript | typescript | ^5.8.3 |

Gemini model used:
- `gemini-3.1-flash-image-preview` — image editing and upscaling (`responseModalities` suppressed with `@ts-expect-error` as it is not yet typed in the SDK)

---

## 3. Architecture

```
Browser (React client)
│
├── Zustand store (EditorStore) — single source of truth for all UI + project state
│                                  includes a 50-entry client-side undo stack
│
├── CanvasEditor
│   ├── Excalidraw (background: pan/zoom/vector drawing)
│   └── PictureLayer (positioned overlay: images + selection boxes)
│
├── ChatPanel → POST /api/ai/edit → Gemini → updated picture file on disk
│
├── TopBar / LayersPanel / HistoryPanel → read/write Zustand store
│
├── ProjectsModal → GET /api/projects · POST/DELETE /api/project
│
└── AuthModal / AdminPanel → Supabase auth + /api/admin/* routes
```

**Storage model (local disk, no cloud storage):**
- All project data lives under `data/projects/<projectId>/`:
  - `project.json` — serialised `Project` object (metadata, picture list, boxes, versions, chat)
  - `pictures/<pictureId>.png` — current image file for each picture
  - `versions/<versionId>/<pictureId>.png` — snapshot files per version
- Admin settings: `data/admin-settings.json`
- The `data/` directory is **not committed** to git; it is created at runtime.

**Auth model (Supabase):**
- Session cookies managed by `@supabase/ssr` via Next.js cookies API.
- Each authenticated user has a row in a `profiles` table with `user_type` (`guest` | `member` | `admin`).
- `requireMember()` in `src/lib/auth-guard.ts` enforces member/admin role on the AI edit and upscale routes server-side.

**Canvas rendering:**
- Excalidraw handles pan/zoom and any freehand vector drawing.
- Pictures and selection boxes are rendered in a separate absolutely-positioned `PictureLayer` overlay (z-index 10) that converts scene coordinates to screen coordinates using the Excalidraw viewport state.
- Image files are loaded via `/api/picture/[id]?path=...` with a `?t=<timestamp>` cache-bust appended after AI edits.

**Shared canvas refs (`src/lib/scene-ref.ts`):**
- `sceneSerializerRef` — populated by `CanvasEditor`; called by auto-save and TopBar to serialise the Excalidraw scene to JSON without subscribing to it.
- `sceneRestorerRef` — populated by `CanvasEditor`; called by `HistoryPanel` and `ProjectsModal` to imperatively apply a scene JSON to the live Excalidraw instance.

---

## 4. Directory Structure

```
drawit/
├── data/                        # Runtime data dir (gitignored); created on first run
│   ├── admin-settings.json      # Persisted admin settings
│   └── projects/
│       └── <projectId>/
│           ├── project.json
│           ├── pictures/        # Current picture PNG files
│           └── versions/        # Per-version snapshot PNG files
│
├── src/
│   ├── app/
│   │   ├── page.tsx             # Main SPA entry: layout, auth bootstrap, auto-save, keyboard shortcuts
│   │   ├── layout.tsx           # Root layout: metadata, global CSS, Toaster
│   │   ├── globals.css          # Global Tailwind + custom CSS (picture-frame, sel-box, ctx-menu)
│   │   ├── admin/
│   │   │   └── page.tsx         # /admin route — immediately redirects to /?admin=1
│   │   └── api/
│   │       ├── ai/edit/         # POST — AI image edit via Gemini (requires member/admin)
│   │       ├── project/         # GET/POST/PUT/DELETE — load, create, save, delete project
│   │       ├── projects/        # GET — list all projects (id, name, updatedAt, pictureCount)
│   │       ├── picture/
│   │       │   ├── [id]/        # GET — serve a picture file (no-cache)
│   │       │   └── update/      # POST — overwrite a picture file with new base64
│   │       ├── upload/          # POST — upload a new image file (with optional compression)
│   │       ├── export/          # GET — download a picture as attachment
│   │       ├── upscale/         # POST — AI upscale via Gemini (requires member/admin)
│   │       ├── version/restore/ # POST — restore project to a previous version snapshot
│   │       └── admin/
│   │           ├── settings/    # GET (public) / PUT (admin-only) — admin settings
│   │           └── users/       # GET/PUT (admin-only) — list and update user profiles
│   │
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── CanvasEditor.tsx     # Main canvas: Excalidraw wrapper + event handling
│   │   │   ├── PictureLayer.tsx     # Overlay: renders PictureFrame + SelectionBoxEl + DrawPreview
│   │   │   └── ContextMenuOverlay.tsx # Right-click context menu for pictures and boxes
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx        # AI chat history + send logic, auth gate
│   │   │   └── MentionInput.tsx     # Textarea with @mention autocomplete dropdown
│   │   ├── sidebar/
│   │   │   ├── LayersPanel.tsx      # Left sidebar: list of pictures and their selection boxes
│   │   │   └── HistoryPanel.tsx     # Left sidebar (below layers): version history with restore button
│   │   ├── layout/
│   │   │   └── TopBar.tsx           # App header: tools, upload, save, projects button, user menu
│   │   ├── auth/
│   │   │   └── AuthModal.tsx        # Sign in / register modal (Supabase email+password)
│   │   ├── admin/
│   │   │   └── AdminPanel.tsx       # Modal: settings tab (compression) + users tab (role management)
│   │   └── projects/
│   │       └── ProjectsModal.tsx    # Modal: list, open, create, and delete projects
│   │
│   ├── lib/
│   │   ├── ai/
│   │   │   └── gemini.ts            # editImage() and upscaleImage() — Gemini API wrappers
│   │   ├── supabase/
│   │   │   ├── client.ts            # Browser Supabase client (createBrowserClient)
│   │   │   └── server.ts            # Server Supabase client (cookie-based) + admin client (service role)
│   │   ├── auth-guard.ts            # requireMember() — server-side auth check for AI routes
│   │   ├── storage.ts               # All disk I/O: project CRUD, picture files, version snapshots, admin settings
│   │   ├── image-utils.server.ts    # Server-only: annotateImageWithBox() (SVG overlay via sharp), resizeImage()
│   │   ├── scene-ref.ts             # sceneSerializerRef + sceneRestorerRef — bridges Excalidraw API to other components
│   │   └── utils.ts                 # cn(), formatLabel(), parseMentions()
│   │
│   ├── store/
│   │   └── index.ts                 # Zustand EditorStore — complete app state, all actions, undo stack
│   │
│   ├── types/
│   │   └── index.ts                 # All TypeScript interfaces and type aliases
│   │
│   └── test/
│       ├── setup.ts                 # Vitest setup: imports @testing-library/jest-dom
│       └── utils.test.ts            # Unit tests for cn(), formatLabel(), parseMentions()
│
├── e2e/                         # Playwright end-to-end tests
├── supabase/
│   └── schema.sql               # Supabase schema: profiles table, admin_settings, RLS policies, trigger
├── vitest.config.ts
├── playwright.config.ts
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

---

## 5. API Routes

All routes live under `src/app/api/`.

### `POST /api/ai/edit`
Runs an AI image edit using Gemini. **Requires member or admin session** (enforced server-side via `requireMember()`).

**Body:** `{ projectId, prompt, mentions: ResolvedMention[] }`

**Target picture resolution:**
The picture to be edited is determined by the first **box** mention (the box's parent picture). If no box mentions exist, the first picture mention is used, then finally the first picture in the project. This ensures that when a user references both a source picture and a destination box, the box's picture is always the edit target.

**Flow:**
1. Verify session + member role via `requireMember()`.
2. Load project from disk.
3. Snapshot all current picture files into `data/projects/<id>/versions/<versionId>/` **before** editing.
4. Prepend the new version record to `project.versions` (max 20 kept).
5. For each mentioned picture, load its base64. For box mentions, call `annotateImageWithBox()` to overlay a coloured bounding box + label on the image.
6. Call `gemini.editImage()` with all images and the translated prompt.
7. If Gemini returns an edited image, overwrite the **target** picture file via `savePictureFile()`.
8. Save updated project JSON.

**Returns:** `{ success, editedImages: [{pictureId, base64}], message, versionId }`

---

### `GET /api/project?id=<id>`
Load an existing project by ID. Returns `{ project }` or 404.

### `POST /api/project`
Create a new project. Body: `{ id?, name? }`. If the project already exists, returns it unchanged.

### `PUT /api/project`
Save (upsert) a project. Body: full `Project` object. Updates `updatedAt` automatically.

### `DELETE /api/project?id=<id>`
Delete a project and all its files from disk (`data/projects/<id>/` removed recursively).

---

### `GET /api/projects`
List all projects on disk, sorted newest-first by `updatedAt`.

**Returns:** `{ projects: Array<{ id, name, updatedAt, pictureCount }> }`

---

### `GET /api/picture/[id]?path=<storagePath>`
Serve a picture PNG file. `Cache-Control: no-cache`. The `id` param in the URL is informational; `path` is what is actually read from disk.

### `POST /api/picture/update`
Overwrite a picture file with new base64 data.

**Body:** `{ projectId, pictureId, base64 }`

---

### `POST /api/upload`
Upload a new image file (multipart form data). Converts to PNG via sharp. Optionally resizes to `compress_width` if admin compression is enabled.

**Form fields:** `file` (binary), `projectId`

**Returns:** `{ pictureId, storagePath, originalWidth, originalHeight, storedWidth, storedHeight, compressed }`

---

### `GET /api/export?path=<storagePath>&name=<filename>`
Download a picture file as an attachment (`Content-Disposition: attachment`).

---

### `POST /api/upscale`
AI upscale an image using Gemini. **Requires member or admin session.** Returns binary PNG directly (for download).

**Body:** `{ projectId?, pictureId?, storagePath, targetWidth, download? }`

If `projectId` and `pictureId` are provided, the upscaled image is also saved to disk as `<pictureId>_upscaled.png`.

---

### `POST /api/version/restore`
Restore a project to a previous version snapshot.

**Body:** `{ projectId, versionId }`

Reads picture files from the version snapshot directory, overwrites current picture files, restores `sceneJSON` in the project JSON.

**Returns:** `{ ok, sceneJSON, restoredImages: { [pictureId]: base64 } }`

---

### `GET /api/admin/settings`
Public (no auth required). Returns current admin settings: `{ settings: { compress_images, compress_width } }`.

### `PUT /api/admin/settings`
Admin-only. Update admin settings.

**Body:** `{ compress_images?, compress_width? }`

---

### `GET /api/admin/users`
Admin-only. Returns all rows from the Supabase `profiles` table ordered by `created_at` desc.

### `PUT /api/admin/users`
Admin-only. Update a user's `user_type`.

**Body:** `{ userId, user_type: 'guest' | 'member' | 'admin' }`

---

## 6. Key Components

### `CanvasEditor` (`src/components/canvas/CanvasEditor.tsx`)
The central canvas component. Rendered client-side only (`dynamic(..., { ssr: false })`).

- Mounts Excalidraw in a dark theme with most built-in tools disabled.
- Tracks viewport in local React state; writes to Zustand store via a debounced (2 s) `sceneJSON` flush.
- Registers both `sceneSerializerRef.current` (serialise scene → JSON) and `sceneRestorerRef.current` (apply JSON → Excalidraw `updateScene`) once, after the Excalidraw API ref is available. Both refs are used by other components that need to read or write the Excalidraw state without being in the React tree under `CanvasEditor`.
- Restores a saved `sceneJSON` to Excalidraw 300 ms after mount (one-shot via `sceneRestored` ref).
- Implements draw-box mode: `mousedown`/`mousemove`/`mouseup` handlers compute scene-space coordinates and call `store.addSelectionBox()` on release.
- File drag-and-drop: POSTs to `/api/upload` and adds a `Picture` to the store.

### `PictureLayer` (`src/components/canvas/PictureLayer.tsx`)
Absolutely-positioned overlay (z-index 10, pointer-events on individual elements).

Contains three sub-components:
- **`PictureFrame`** — renders an `<img>` tag loaded from `/api/picture/[id]?path=...&t=<cacheBust>`. Listens for `drawit:picture-updated` custom event to refresh after AI edits or version restores. Supports drag-to-move and 8-handle resize; commits final position to store via `updatePictureCanvas()`.
- **`SelectionBoxEl`** — renders a coloured bordered box at relative coordinates within its parent picture. Also draggable and resizable; coordinates are stored as ratios (0–1) relative to picture dimensions.
- **`DrawPreview`** — dashed blue rectangle shown while the user is dragging to create a new box.

### `ChatPanel` (`src/components/chat/ChatPanel.tsx`)
Right sidebar AI chat interface.

- Blocked for `guest` users (shows "Sign in to use AI" button).
- `handleSend()`: parses `@mentions`, resolves them to `SelectionBox` or `Picture` objects, POSTs to `/api/ai/edit`.
- Mention resolution prioritises boxes first, then pictures. The API route further ensures the edit target is the picture that owns the first box mention.
- After a successful AI edit, dispatches `drawit:picture-updated` to trigger image cache-busting in `PictureLayer`.

### `MentionInput` (`src/components/chat/MentionInput.tsx`)
Textarea with live `@mention` autocomplete. Suggests both selection boxes and pictures. Arrow keys, Enter/Tab to select, Escape to dismiss. Auto-resizes up to 120px height.

### `TopBar` (`src/components/layout/TopBar.tsx`)
App header bar with: DrawIt logo, **Projects button** (folder icon, opens `ProjectsModal`), editable project name (with dirty indicator dot), tool buttons (Select `V` / Draw Box `B`), Upload, Save, admin settings indicator, admin panel button (admins only), user menu with sign-out.

### `ProjectsModal` (`src/components/projects/ProjectsModal.tsx`)
Full-screen modal for project management.

- On open: fetches `GET /api/projects` and displays all projects sorted by last modified.
- Each row shows: project name, last-modified time (human-relative), image count. Currently open project is highlighted with an "open" badge.
- **Open**: auto-saves current project, fetches the selected project, calls `loadProject()` to hydrate the store, calls `sceneRestorerRef.current()` to apply the Excalidraw scene, dispatches `drawit:picture-updated`, updates `localStorage['drawit-project-id']`.
- **New Project**: same save flow, then creates a blank project via `POST /api/project`.
- **Delete** (hover to reveal): `DELETE /api/project?id=<id>`. Cannot delete the currently open project.

### `LayersPanel` (`src/components/sidebar/LayersPanel.tsx`)
Left sidebar showing the picture hierarchy. Each picture shows its child selection boxes indented below it. Double-click a picture name to rename. Trash icon to delete (cascades to child boxes). Clicking selects in store.

### `HistoryPanel` (`src/components/sidebar/HistoryPanel.tsx`)
Collapsible panel below LayersPanel. Lists version snapshots newest-first. Hover to reveal a restore button, which POSTs to `/api/version/restore`, then calls `sceneRestorerRef.current(data.sceneJSON)` to imperatively update the Excalidraw canvas, and dispatches `drawit:picture-updated` to reload all picture frames.

### `AuthModal` (`src/components/auth/AuthModal.tsx`)
Email+password sign-in / registration modal. Calls Supabase `signInWithPassword` or `signUp`. New accounts are created as `guest`; an admin must manually upgrade them to `member`.

### `AdminPanel` (`src/components/admin/AdminPanel.tsx`)
Modal accessible to admin users only (also via `/admin` URL or `?admin=1` query param). Two tabs:
- **Settings** — toggle image compression on upload, set max width.
- **Users** — list all profiles, change `user_type` via dropdown.

### `ContextMenuOverlay` (`src/components/canvas/ContextMenuOverlay.tsx`)
Right-click context menu positioned at cursor coordinates. For pictures: Rename, Export (opens `ExportDialog`), Delete. For selection boxes: Delete only. The embedded `ExportDialog` offers download of current file or AI-upscaled version.

---

## 7. State Management

Single Zustand store: `useEditorStore` at `src/store/index.ts`.

**Project state** (persisted to disk via auto-save):
| Field | Type | Description |
|---|---|---|
| `projectId` | `string` | nanoid; persisted to `localStorage` as `drawit-project-id` |
| `projectName` | `string` | Editable in TopBar |
| `pictures` | `Picture[]` | All uploaded images with canvas positions |
| `selectionBoxes` | `SelectionBox[]` | All drawn boxes with relative coords |
| `versions` | `VersionSnapshot[]` | Up to 20 version records (newest first) |
| `chatMessages` | `ChatMessage[]` | Full conversation history |
| `nextBoxNumber` | `number` | Auto-increment counter for box labels |
| `sceneJSON` | `string` | Excalidraw scene JSON (no binary image data) |
| `isDirty` | `boolean` | True when unsaved changes exist |

**UI state** (ephemeral):
| Field | Type | Description |
|---|---|---|
| `tool` | `'select' \| 'draw-box'` | Active canvas tool |
| `viewport` | `Viewport` | Current Excalidraw scroll + zoom |
| `selectedPictureId` | `string \| null` | Currently selected picture |
| `selectedBoxId` | `string \| null` | Currently selected box |
| `contextMenu` | object \| null | Context menu position and target |
| `showAuth` | `boolean` | Auth modal visibility |
| `showAdmin` | `boolean` | Admin panel visibility |
| `showProjects` | `boolean` | Projects modal visibility |
| `isAiLoading` | `boolean` | AI request in progress |
| `undoStack` | `UndoEntry[]` | Client-side undo history (max 50, cleared on project switch) |

**Auth / settings state:**
| Field | Type | Description |
|---|---|---|
| `user` | `UserProfile \| null` | Authenticated user (populated from Supabase `profiles`) |
| `adminSettings` | `AdminSettings` | `{ compress_images, compress_width }` |

**Undo stack (`UndoEntry` union type):**

| Entry type | Triggered by | Undo effect |
|---|---|---|
| `add-picture` | `addPicture()` | Removes picture + its boxes from store |
| `remove-picture` | `removePicture()` | Re-inserts picture and all its boxes |
| `add-box` | `addSelectionBox()` | Removes box from store |
| `remove-box` | `removeSelectionBox()` | Re-inserts box |
| `move-picture` | `updatePictureCanvas()` | Restores previous `canvasX/Y/W/H` |

Undo actions call `set()` directly (not other store actions) to avoid pushing new entries onto the stack.

**Key actions:**
- `loadProject(project)` — hydrates all project state; clears the undo stack
- `toProject()` — serialises current store state to a `Project` object for saving
- `addSelectionBox(...)` — auto-assigns label (`01`, `02`, …) and color; pushes `add-box` undo entry
- `removePicture(id)` — removes picture and cascades boxes; pushes `remove-picture` undo entry
- `updatePictureCanvas(...)` — saves previous position as `move-picture` undo entry before updating
- `undo()` — pops top entry from `undoStack` and reverses it
- `renamePicture(id, name)` — enforces uniqueness across both picture names and box labels; returns `false` on collision
- `createVersion(description)` — adds a client-side version record (actual file snapshot is done server-side in `/api/ai/edit`)

---

## 8. Keyboard Shortcuts

| Key | Action |
|---|---|
| `V` | Switch to Select tool |
| `B` | Switch to Draw Box tool |
| `Delete` / `Backspace` | Delete selected box or picture (skipped when focus is in an input/textarea) |
| `Ctrl+Z` / `Cmd+Z` | Undo last canvas edit (add/remove picture or box, move/resize picture) |
| `Ctrl+S` / `Cmd+S` | Save project immediately |

**Undo scope:** client-side structural changes only (add, delete, move). AI edits are reverted via the History panel (server-side version snapshots), not via Ctrl+Z.

---

## 9. Data Flow

### Typical AI Edit

```
1. User types "add the monster from @picture-2 to @01"

2. ChatPanel.handleSend():
   a. parseMentions → ["picture-2", "01"]
   b. @01 → box (pictureId = picture-1.id), @picture-2 → picture
   c. mentions = [{ label:"picture-2", type:"picture", pictureId:pic2.id },
                  { label:"01", type:"box", pictureId:pic1.id, box }]
   d. POST /api/ai/edit { projectId, prompt, mentions }

3. /api/ai/edit (server):
   a. requireMember() — verify session + role
   b. loadProject from disk
   c. saveVersionSnapshot() — copies current picture PNGs to versions/<versionId>/
   d. targetPictureId = first box mention's pictureId → picture-1 (correct destination)
   e. load base64 for picture-1 (annotated with box @01) and picture-2 (context)
   f. editImage() → Gemini API
   g. Gemini returns edited picture-1 with monster added in box region
   h. savePictureFile(projectId, picture-1.id, buffer)
   i. saveProject → writes project.json
   j. Returns { success, editedImages:[{pictureId:pic1.id, ...}], versionId }

4. ChatPanel dispatches drawit:picture-updated
5. PictureFrame for picture-1 busts cache and fetches updated PNG
```

### Version Restore

```
HistoryPanel.restoreVersion(versionId):
  POST /api/version/restore { projectId, versionId }
    → server reads versions/<versionId>/<picId>.png for each picture
    → overwrites current pictures/<picId>.png files
    → restores sceneJSON in project.json
    → returns { ok, sceneJSON, restoredImages }

  Client:
    setSceneJSON(data.sceneJSON)          // update Zustand store
    sceneRestorerRef.current(sceneJSON)   // apply to live Excalidraw canvas
    dispatchEvent('drawit:picture-updated') // reload all picture frames
```

### Project Switch

```
ProjectsModal.switchToProject(id):
  1. saveCurrentProject() — serialize scene, PUT /api/project
  2. GET /api/project?id=<id>
  3. loadProject(project) — hydrate Zustand store (clears undo stack)
  4. localStorage['drawit-project-id'] = id
  5. sceneRestorerRef.current(project.sceneJSON) — restore Excalidraw canvas
  6. dispatchEvent('drawit:picture-updated') — reload all picture frames
```

### Auto-Save

```
page.tsx setInterval (5000ms):
  if isDirty:
    sceneSerializerRef.current() → serialise Excalidraw scene to JSON
    store.setSceneJSON(json)
    PUT /api/project { ...store.toProject() }
    markClean()
```

---

## 10. Auth Model

**Provider:** Supabase (email + password only; no OAuth).

**Session handling:**
- Browser-side: `createBrowserClient` from `@supabase/ssr`. Session is stored in cookies.
- Server-side (API routes): `createServerClient` reads/writes cookies via Next.js `cookies()`.
- Admin operations: `createAdminSupabase()` uses the service role key to bypass RLS.

**User types** (stored in Supabase `profiles.user_type`):

| Type | AI Chat / Upscale | Admin Panel | Description |
|---|---|---|---|
| `guest` | No | No | Default for new registrations |
| `member` | Yes | No | Manually upgraded by admin |
| `admin` | Yes | Yes | Full access; set in Supabase |

**Auth guards (API routes):**
- `src/lib/auth-guard.ts` exports `requireMember()` — verifies a valid Supabase session and that `profiles.user_type` is `'member'` or `'admin'`. Returns `{ ok: false, response: 401/403 }` on failure.
- Used in `POST /api/ai/edit` and `POST /api/upscale`.
- Admin routes (`/api/admin/*`) use their own `requireAdmin()` / `isAdmin()` helpers that require `'admin'` role.

**Client bootstrap (page.tsx):**
On mount, `supabase.auth.getUser()` is called. If a session exists, user info is fetched from `profiles` and stored in Zustand. `onAuthStateChange` keeps the store in sync for sign-in/sign-out events.

**Guest access:**
The app is fully usable without login — users can upload images, draw boxes, and rearrange them. The AI chat panel is gated: clicking "Send" when unauthenticated or when `user_type === 'guest'` shows the AuthModal. The AI routes also enforce this server-side.

---

## 11. Environment Variables

Create a `.env.local` file at the project root with the following variables:

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (exposed to browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key (exposed to browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key — server-only, bypasses RLS; used in admin routes and `requireMember()` |
| `GEMINI_API_KEY` | Yes | Google Gemini API key — server-only, used in `src/lib/ai/gemini.ts` |

---

## 12. Dev Setup

### Prerequisites
- Node.js 18+
- npm

### Install and run

```bash
npm install
npm run dev
# App runs at http://localhost:3000
```

### Other commands

```bash
npm run build       # Production build
npm run start       # Start production server (after build)
npm run lint        # ESLint
npm run test        # Run vitest unit tests (single pass)
npm run test:watch  # Run vitest in watch mode
npm run test:e2e    # Run Playwright E2E tests (starts dev server automatically)
```

### First-run notes
- The `data/` directory is created automatically on the first API call; no manual setup needed.
- Add `.env.local` with the four variables listed above before starting the dev server.
- Run `supabase/schema.sql` in the Supabase SQL editor to create the `profiles` and `admin_settings` tables, RLS policies, and the `handle_new_user` trigger.

---

## 13. Testing

### Unit tests (Vitest)
- Config: `vitest.config.ts` — jsdom environment, `@vitejs/plugin-react`, `@/` path alias.
- Setup file: `src/test/setup.ts` — imports `@testing-library/jest-dom`.
- Existing tests: `src/test/utils.test.ts` — covers `cn()`, `formatLabel()`, `parseMentions()`.
- Run: `npm run test` (single pass) or `npm run test:watch`.

### E2E tests (Playwright)
- Config: `playwright.config.ts` — Chromium only, `baseURL: http://localhost:3000`, spins up `npm run dev` if no server is running on port 3000.
- Test directory: `e2e/`.
- In CI: `forbidOnly: true`, 2 retries, 1 worker.
- Run: `npm run test:e2e`.

---

## 14. Known Constraints and Gotchas

**Local-only storage.** All project files and images are written to `data/` on the server's local filesystem. In serverless deployments (Vercel, etc.) the `data/` directory will not persist between function invocations. The app is designed for self-hosted or local use. Concurrent access to the same project from multiple browser tabs or users will cause race conditions on `project.json`.

**Project ID is stored in `localStorage`.** If localStorage is cleared, the active project ID is lost and a new blank project is created; old data remains on disk but can be recovered via the Projects modal (which lists all projects by reading `data/projects/`).

**`sceneSerializerRef` / `sceneRestorerRef` are mutable singletons.** Both refs are registered in `CanvasEditor` once the Excalidraw API is ready. If `CanvasEditor` unmounts (loaded with `ssr: false` via `next/dynamic`), the refs fall back to no-ops until the component remounts.

**Excalidraw loaded with `ssr: false`.** Adds a small initial loading flash. Scene restoration is delayed 300 ms after mount to ensure the Excalidraw API ref is ready.

**Version history is stored twice.** Version metadata lives in `project.json` (up to 20 entries). Picture pixels are stored as separate PNG files in `versions/<versionId>/`. If `project.json` is reset but `versions/` is not (or vice versa), restore will fail or have orphaned files.

**Box label namespace is shared with picture names.** `renamePicture()` and `addSelectionBox()` enforce that no picture name equals any box label. `@mention` resolution tries boxes first, then pictures.

**Gemini model.** `gemini-3.1-flash-image-preview` is a preview model. The `responseModalities` generation config field is suppressed with `@ts-expect-error` as it is not yet typed in the `@google/generative-ai` SDK.

**sharp is a native module.** Must not be imported in client components. `image-utils.server.ts` enforces this by convention (`.server.ts` suffix). In the upscale route, sharp is imported with a dynamic `import()` to avoid bundling issues.

**No password reset flow.** The `AuthModal` only supports sign-in and registration.

**`dangerouslySetInnerHTML` in `MessageBubble`.** Chat messages are rendered with `dangerouslySetInnerHTML` to highlight `@mentions`. Input is not sanitised — do not expose this to untrusted user content in a multi-user deployment.

**Undo does not cover AI edits.** Ctrl+Z only reverses client-side structural changes (add/remove/move). To revert an AI image edit, use the History panel (server-side version snapshot restore).

**Project deletion is permanent.** `DELETE /api/project` removes the entire `data/projects/<id>/` directory including all picture files and version snapshots. There is no recycle bin.
