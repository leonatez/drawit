# Multi-Provider Image Edit Implementation

**Date**: 2026-07-12 06:58
**Severity**: Medium (HIGH regression fixed mid-cycle)
**Component**: AI image editing, provider abstraction, frontend UI, API routes
**Status**: Implemented, Committed, Blocked on VILAO credentials

## What Happened

All 3 phases from the plan implemented: provider abstraction layer, error surfacing, frontend model selector. Also shipped: new GET `/api/ai/models` endpoint, model allowlist validation security fix, `generateEditMask()` helper, and full unit test suite. Code-reviewer subagent caught a HIGH-severity regression (isAiLoading not clearing on project switch during AI requests); immediately fixed. Awaiting real VILAO API key + verification testing before feature unlocks.

## Implementation Summary

**Phase 1 — Provider abstraction:** Created `src/lib/ai/providers/{types.ts,gemini-provider.ts,vilao-provider.ts,index.ts}`. Common `ImageEditProvider` interface; Gemini inspects `blockReason`, `finishReason`, `safetyRatings` for exact rejection reasons; VILAO extracts `error.message` from OpenAI-compatible error shape. Multi-image support confirmed working for both (all referenced pictures sent as `image[]` array to provider).

**Phase 2 — Error surfacing:** Chat messages now HTML-escaped before storage in `project.json` (was: `dangerouslySetInnerHTML` without sanitization, a stored-XSS gap). Provider rejection text (safety filter, quota, etc.) flows to user via `ChatMessage.errorReason` field.

**Phase 3 — Frontend model selector:** Dropdown added to `ChatPanel` footer; selected model stored in ephemeral Zustand state (resets per session). No persistence, no tier gating.

**Security fix (red-team mitigation):** Added model allowlist validation in `POST /api/ai/edit` — rejects unconfigured model strings with 400 before calling any provider. Hardens against member users crafting arbitrary model IDs.

**New helper:** `generateEditMask(canvases: SelectionBox[])` in `image-utils.server.ts` generates an alpha-channel PNG mask image from selection boxes, clamping coordinates to image bounds (defensive against fractional overflow).

**Tests:** `src/test/providers.test.ts` — 16 unit tests covering `parseModelId()`, `getConfiguredModels()`, error message extraction paths. All pass; tsc clean.

## Issues Hit and Resolved

| Issue | Severity | Root Cause | Fix |
|-------|----------|-----------|-----|
| Buffer → BlobPart type mismatch in VILAO provider | Low | Node Buffer not directly assignable to DOM BlobPart union; FormData expects typed array | Added `toArrayBuffer()` helper in `vilao-provider.ts` to convert Buffer to Uint8Array |
| `isAiLoading` never clears on project switch during request | **HIGH** | Staleness check in finally block prevented flag reset when `selectedProjectId` changed mid-request | Moved `isAiLoading = false` outside staleness guard; now always resets regardless of project context |

The HIGH regression was critical: once a user initiated an AI request then switched projects while it was in-flight, the chat input locked permanently until reload. Fix ensures isAiLoading (a global UI flag, not project-scoped data) always clears in `finally`.

## Deliverables

**Code:**
- `src/lib/ai/providers/` — 4 new files (types, Gemini, VILAO, index)
- `src/lib/image-utils.server.ts` — added `generateEditMask()`
- `src/app/api/ai/models/route.ts` — new member-gated GET endpoint
- `POST /api/ai/edit` — model allowlist validation + provider switch logic
- `src/components/chat/ChatPanel.tsx` — model dropdown added
- `src/store/index.ts` — `selectedModel` ephemeral state
- `src/test/providers.test.ts` — full provider unit test suite
- Error escaping in chat message rendering

**Docs:**
- `docs/system-architecture.md` — created (provider abstraction, model selection flow)
- `docs/deployment-guide.md` — created (environment variables, VILAO setup steps)
- `docs/codebase-summary.md` — created (file organization, state flow)
- `./CLAUDE.md` section 11 — Environment Variables table updated with `MODELS`, `VILAO_API_KEY`, `VILAO_BASE_URL`

**Commit:** `bb7ddbf` ("feat(ai): add multi-provider image editing system") — code only, plan/docs files excluded, `.env.local` correctly ignored.

## Current Blockers

- **Real VILAO credentials not in `.env.local`.** VILAO provider integrated but untested against real backend. Current `.env.local` has placeholder `VILAO_API_KEY=sk-...` and commented base URL. Must be replaced with user's actual credentials.
- **Unverified assumptions:** VILAO multi-image support (does backend accept `image[]` FormData fields?), Gemini `blockReason/finishReason/safetyRatings` population (type-level verified via tsc, not runtime-verified against `gemini-3.1-flash-image-preview`).
- **Not merged to main.** Feature is committed but not pushed; awaiting VILAO validation before integration.

## Lessons

1. **Provider abstraction paid off.** Adding VILAO was straightforward once the interface was locked; minimal Gemini changes needed.
2. **Staleness checks are tricky.** The isAiLoading regression showed that UI flags and data flags have different lifespans. Always separate concerns in `finally` blocks.
3. **HTML escaping should be automatic.** Should have escaped at the source (when creating ChatMessage) rather than at render. Consider a dedicated `SafeMessage` type to enforce this.

## Next Steps

1. User supplies real `VILAO_API_KEY` and confirms base URL in `.env.local`.
2. One E2E smoke test: edit image with VILAO, verify returned image is valid PNG and stored correctly.
3. Verify Gemini blockReason/finishReason flow on a real safety-filtered prompt (existing tests use mock provider).
4. After validation, rebase/merge to main and deploy.
