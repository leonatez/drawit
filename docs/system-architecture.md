# System Architecture

## Overview

DrawIt is a Next.js 14 AI-powered image editor with an Excalidraw canvas, Gemini (and VILAO) AI image-editing backends, Supabase authentication, and local-disk project storage.

## Core Components

### Frontend Application Layer
- **Single Page App (SPA)**: React 18 with Zustand state management, no server-side rendering for the main editor
- **Canvas**: Excalidraw (0.17.6) for pan/zoom and vector drawing; custom `PictureLayer` overlay (z-index 10) renders image frames and selection boxes
- **UI**: Tailwind CSS (3.4.17), Lucide icons, React Hot Toast notifications
- **Chat Interface**: `MentionInput` textarea with `@mention` autocomplete + model selection dropdown (session-only state)

### Backend Architecture

#### Auth Layer (`src/lib/auth-guard.ts`)
- Supabase session management via `@supabase/ssr` (cookies stored in Next.js request/response)
- Three user types: `guest` (read-only), `member` (AI access), `admin` (settings + user management)
- `requireMember()` enforces member/admin role on AI routes server-side
- Usage quota tracking per user (checked before each AI edit/upscale)

#### AI Provider Abstraction (`src/lib/ai/providers/`)
Multi-provider image-editing system supporting Gemini and VILAO (OpenAI-compatible).

**Structure:**
```
src/lib/ai/providers/
├── types.ts                # Interfaces, model parsing, config
├── gemini-provider.ts      # Gemini image-edit implementation
├── vilao-provider.ts       # VILAO image-edit implementation  
└── index.ts                # Router (editImageWithProvider)
```

**Key Design:**
- **Model ID format**: `"<provider>/<modelName>"` (split on first `/` only, since VILAO model names contain slashes, e.g., `"vilao/gtm/gpt-image-2"`)
- **Configuration**: `MODELS` env var holds comma-separated list of supported model IDs; first entry is default
- **Dispatch**: `editImageWithProvider(modelId, input)` routes to the correct provider
- **Never-throws contract**: Both provider functions return `ProviderEditResult` and never throw (defense-in-depth for route stability)

**ProviderEditInput** (sent to provider):
- `prompt`: user's AI instruction
- `mentions`: ResolvedMention array (pictures + boxes with coordinates)
- `pictureBase64Map`: map of pictureId → current image base64
- `targetPictureId`: the picture to edit (determined by first box mention, falls back to first picture mention)

**ProviderEditResult** (from provider):
- `editedBase64`: resulting PNG base64 (null on failure)
- `message`: success confirmation or exact provider error (e.g., Gemini safety filter block reason, VILAO API error)

#### Image Storage (`src/lib/storage.ts`)
Local-disk persistence under `data/projects/<projectId>/`:
```
data/projects/<projectId>/
├── project.json                    # Project metadata, pictures, boxes, versions, chat
├── pictures/<pictureId>.png        # Current image files
└── versions/<versionId>/
    └── <pictureId>.png             # Per-version snapshots (max 20 versions)
```

#### Image Processing (`src/lib/image-utils.server.ts`)
- Sharp-based server-only utilities: resize, annotate, upscale
- **Box annotation**: overlays colored bounding box + label on images (called before Gemini to show context)
- **Edit mask generation**: creates transparent SVG mask for VILAO (defines editable regions via selection box coordinates; clamped to image bounds)

### API Routes

#### `POST /api/ai/edit` (AI Image Edit)
**Auth**: requires member/admin

**Body**: `{ projectId, prompt, mentions[], model? }`

**Flow**:
1. Validate `model` against `MODELS` allowlist (returns 400 if unsupported — **RED TEAM Finding 1: critical security gate**)
2. Load project, create version snapshot (all picture files backed up)
3. Load picture base64 data; annotate box mentions with colored overlays
4. Dispatch to resolved provider via `editImageWithProvider()`
5. On success: overwrite target picture file, save updated project.json, return edited image
6. On failure: return exact provider error message (never crashes past the snapshot point)

**Returns**: `{ success, editedImages?, message, versionId }`

#### `GET /api/ai/models` (List Configured Models)
**Auth**: requires member/admin

**Returns**: `{ models: string[], default: string }`

Lists all models configured in the `MODELS` env var (or defaults to Gemini-only if unset). Allows the frontend to populate the chat panel's model dropdown.

#### `GET /api/project?id=<id>`, `POST /api/project`, `PUT /api/project`, `DELETE /api/project?id=<id>`
Load, create, save, and delete projects.

#### `GET /api/projects`
List all projects on disk, sorted by `updatedAt` (newest first).

#### `POST /api/upload`
Upload and convert image to PNG; optionally compress to admin-configured max width.

#### `GET /api/picture/[id]?path=...`
Serve picture PNG with `Cache-Control: no-cache` (bust on AI edits via `?t=<timestamp>`).

#### `POST /api/upscale`
AI upscale via Gemini (Gemini-only, not multi-provider). **Requires member/admin.**

#### `POST /api/version/restore`
Restore project to a previous version snapshot.

#### `GET /api/export`, `POST /api/remove-bg`, `POST /api/vectorize`
Export, background removal, and vectorization (ancillary features).

#### Admin Routes (`/api/admin/*`)
- `GET /api/admin/settings` — public, no auth (returns compression settings)
- `PUT /api/admin/settings` — admin-only, update settings
- `GET /api/admin/users` — admin-only, list all user profiles
- `PUT /api/admin/users` — admin-only, change user role

### State Management (`src/store/index.ts`)

Single Zustand store: `useEditorStore`.

**Project state** (persisted to disk):
- `projectId`, `projectName`
- `pictures`: uploaded images with canvas position/size
- `selectionBoxes`: drawn regions with relative coordinates
- `versions`: up to 20 version snapshots (newest first)
- `chatMessages`: full conversation history (HTML-escaped before rendering — **RED TEAM Finding 2: stored XSS fix**)
- `nextBoxNumber`, `sceneJSON`, `isDirty`

**UI state** (ephemeral):
- `tool`: 'select' | 'draw-box'
- `viewport`: current Excalidraw scroll/zoom
- `selectedPictureId`, `selectedBoxId`
- `contextMenu`: right-click menu position/target
- `showAuth`, `showAdmin`, `showProjects`: modal visibility flags
- `isAiLoading`: AI request in progress
- `selectedModel`: currently selected model ID (session-only, not persisted)
- `undoStack`: client-side undo history (max 50 entries)

**Undo System**:
- Tracks structural changes: add/remove/move picture or box
- Does not cover AI edits (use History panel version restore instead)
- Cleared when switching projects

### Chat Panel & Error Handling
- **MentionInput**: textarea with `@mention` autocomplete for pictures/boxes
- **Model dropdown**: allows selecting from `GET /api/ai/models` result (session-only; default is first in list)
- **Error handling**: on AI failure, displays red-tinted chat bubble with exact provider error message (not generic "failed" text)
- **HTML escaping**: chat messages are HTML-escaped before `@mention` highlighting to prevent stored XSS injection

### Authentication & User Model
- Supabase email+password (no OAuth)
- User types: `guest` (default, no AI), `member` (full access), `admin` (settings + user mgmt)
- Session stored in cookies, managed by `@supabase/ssr`
- New accounts created as `guest`; must be manually promoted by admin

## Data Flow

### Typical AI Edit
1. User types `"add monster from @picture-2 to @01"` in chat
2. ChatPanel parses mentions, shows model dropdown (defaults to first in `MODELS` list)
3. On send: POST to `/api/ai/edit` with mentions + selected modelId
4. Server validates modelId against allowlist, creates version snapshot, loads picture base64, annotates box mentions
5. Dispatches to provider (Gemini or VILAO), receives edited image or error
6. Returns result; on success, client dispatches `drawit:picture-updated` custom event
7. PictureLayer busts cache and reloads the edited picture frame

### Version Restore
1. User clicks restore button in History panel
2. POST to `/api/version/restore` with versionId
3. Server reads picture files from `versions/<versionId>/`, overwrites current pictures, restores scene JSON
4. Client applies scene to Excalidraw, reloads all picture frames

### Project Switch
1. User clicks project in ProjectsModal
2. Saves current project state, fetches selected project, calls `loadProject()` (clears undo stack)
3. Restores Excalidraw scene, reloads picture frames, updates localStorage

## Provider Details

### Gemini Provider
- Model: `gemini-3.1-flash-image-preview`
- API: Google Generative AI SDK (@google/generative-ai)
- Image handling: single or multi-image via `parts: [{ inlineData: { mimeType, data } }, ...]`
- Error signals: `blockReason` (safety refusal), `finishReason` (incomplete), `safetyRatings` (content flags)
- No mask needed (Gemini understands text descriptions of regions)

### VILAO Provider (OpenAI-Compatible, Not Yet Production-Verified)
- Model name format: provider/modelname (e.g., `vilao/gtm/gpt-image-2`)
- API: POST `/v1/images/edits` with multipart FormData
- Image handling: primary target + optional context images in `image[]` array
- Mask: generated from selection box coordinates, sent as transparent SVG → PNG overlay
- Timeout: 120s (AbortController)
- Error signals: verbatim `error.message` from OpenAI/VILAO API response
- **Status**: Implemented but NOT live-verified. VILAO_API_KEY and VILAO_BASE_URL require user confirmation before adding `vilao/*` entries to MODELS env.

## Environment Variables

See `deployment-guide.md` for detailed setup.

| Variable | Required | Scope | Notes |
|----------|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server | Bypasses RLS; used in admin routes |
| `GEMINI_API_KEY` | Yes | Server | Google Generative AI API key |
| `MODELS` | No | Server | Comma-separated list of `<provider>/<model>` IDs; defaults to `gemini/gemini-3.1-flash-image-preview` |
| `VILAO_API_KEY` | Conditional | Server | VILAO API key; required if `vilao/*` entries in `MODELS` |
| `VILAO_BASE_URL` | No | Server | VILAO API base URL; defaults to `https://api.vilao.ai/v1/images/edits` |

## Known Constraints

1. **Local-disk storage only**: no persistence across serverless invocations; designed for self-hosted or local use
2. **No concurrent access protection**: race condition on `project.json` and picture files if multiple tabs/users edit the same project
3. **Version metadata stored twice**: entries in `project.json` + file snapshots in `versions/` directory; out-of-sync breaks restore
4. **Box label namespace shared with picture names**: `renamePicture()` enforces no collisions
5. **Excalidraw loaded without SSR** (`ssr: false`): adds small initial loading flash
6. **Undo does not cover AI edits**: Ctrl+Z only reverses client-side structural changes; use History panel for AI rollback
7. **Project deletion permanent**: no recycle bin
8. **No password reset**: auth modal supports sign-in and registration only
9. **VILAO production status**: endpoint and error handling are implemented but not yet verified against real VILAO backend with valid key/URL

## Code Organization

**By concern:**
- `src/lib/ai/providers/` — provider abstraction and implementations
- `src/lib/auth-guard.ts` — auth checks and usage quota
- `src/lib/storage.ts` — disk I/O for projects, pictures, versions
- `src/lib/image-utils.server.ts` — sharp-based image processing (box annotation, mask generation, upscale)
- `src/store/index.ts` — Zustand state machine and undo system
- `src/app/api/` — API route handlers
- `src/components/` — React UI components (canvas, chat, sidebar, modals)
- `src/types/index.ts` — TypeScript interfaces

**Max file size:** 200 LOC per file (split large components/utilities into focused modules).

## Security Considerations

1. **Model allowlisting** (Finding 1): client-supplied `model` must be in server's `MODELS` list before dispatch (prevents API key abuse)
2. **HTML escaping** (Finding 2): chat messages escaped before `@mention` highlighting to prevent stored XSS in persisted project.json
3. **Member-gating**: AI routes (`/api/ai/edit`, `/api/upscale`, `/api/ai/models`) require member/admin role
4. **Never-throws contract**: provider functions never throw; route has backstop try/catch
5. **Timeout & abort**: VILAO fetch has 120s AbortController timeout
6. **No cross-site mention validation**: mentions are resolved client-side; server validates that mentioned boxes belong to the loaded project

## Testing

- **Unit tests** (Vitest): `src/test/utils.test.ts` covers utility functions
- **E2E tests** (Playwright): `e2e/smoke.spec.ts` validates core workflows
- **CI/CD**: GitHub Actions runs linting, tests, and build checks on push to main
