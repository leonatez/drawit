---
title: "VILAO multi-provider AI image editing"
description: "Add VILAO (OpenAI-compatible) image-edit provider alongside Gemini, a chat model picker, and exact provider-error surfacing."
status: completed
priority: P2
effort: 6h
branch: main
tags: [ai, provider-abstraction, gemini, vilao, error-handling, frontend]
created: 2026-07-12
completed: 2026-07-12
---

# VILAO Multi-Provider AI Image Editing

Add a second AI image-edit provider (**VILAO** — OpenAI-compatible `POST /v1/images/edits`) beside the
existing Gemini provider, let users pick a model from the chat panel, and surface the **exact** provider
error message (e.g. Gemini safety refusals, VILAO content-policy errors) instead of a generic failure.

## Scope (locked)
- Build all 3 asks: provider abstraction + VILAO, model picker UI, exact error surfacing.
- `/api/upscale` stays **Gemini-only** — out of scope, do not touch.
- Model selection is **session-only** (Zustand UI state), NOT persisted to `project.json`.
- **No tier gating** — any member/premium/admin picks any configured model.
- VILAO editing uses a **real transparency mask** generated from box coords (transparent = editable).

## Config discrepancy (IMPORTANT — flag)
`.env.local` currently has NO `VILAO_API_KEY` and NO `MODELS` line despite user belief. Phase 1 first
todo: implementer adds `MODELS=...` and a placeholder `VILAO_API_KEY=` line; **user must supply the real
secret**. `getConfiguredModels()` degrades gracefully to Gemini-only if `MODELS` is unset (never throws).

## Model ID format
`"<provider>/<modelName>"`, split on the **FIRST `/` only**. So `"vilao/gtm/gpt-image-2"` →
provider `"vilao"`, modelName `"gtm/gpt-image-2"` (VILAO names contain slashes — intentional).
`MODELS` = comma-separated full IDs; first entry is the default. Server-side only (never `NEXT_PUBLIC_`).

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 01 | Provider abstraction + VILAO backend | completed | [phase-01](phase-01-provider-abstraction-and-vilao-backend.md) |
| 02 | Exact error surfacing (Gemini + VILAO + UI) | completed | [phase-02](phase-02-error-surfacing.md) |
| 03 | Frontend model selection | completed | [phase-03](phase-03-frontend-model-selection.md) |

**All code written, `npm run build` passes cleanly.**

## Live Verification (gate closed)

User supplied the real `VILAO_API_KEY`, confirmed `VILAO_BASE_URL` (kept the guessed
`https://api.vilao.ai/v1/images/edits`), added `vilao/*` entries to the live `MODELS` value, and confirmed
a real VILAO edit tested OK. This closes the last blocking gate from Findings 6/8 — the plan is now
`completed`. The multi-image `image[]` behavior (Finding 9) and Gemini safety-field runtime values
(Finding 14) were not independently re-confirmed message-by-message in this session, but the end-to-end
VILAO path is now user-verified as working.

## Code Review (post-implementation)

**Score:** 7.5/10. 16/16 unit tests pass, `tsc --noEmit` and `npm run build` clean. All 6 red-team-critical
behaviors (model allowlist check, HTML-escaping before mention-highlight, VILAO never-throws + timeout,
member-gated `/api/ai/models`, mask coordinate clamping, `Buffer`→`BlobPart` fix) verified correctly
implemented.

**Found and fixed:** the Finding-15 staleness guard in `ChatPanel.tsx` had a regression — gating
`setAiLoading(false)` in `finally` on the staleness check meant switching projects mid-request permanently
locked the chat input (in every project) until a page reload. Fixed: `isAiLoading` is now always cleared in
`finally` regardless of staleness (it's a global UI flag, not project-scoped data — only the
version/chat-mutating calls needed the staleness guard, which they still have). Also added `isError: true`
to the exception-catch chat message for styling consistency with the `!data.success` path.

**Deferred (user accepted, not blocking):** no unit tests yet for `vilaoEditImage`'s never-throws/timeout
contract, `generateEditMask`'s clamp/throw paths, or the route's 400-on-bad-model case; `gemini-provider.ts`'s
`annotateImageWithBox` calls sit outside its `try` block (low risk, caught by the route's backstop anyway);
mask coordinate clamping is per-dimension so `x + width` can slightly overflow image bounds near an edge
(harmless — sharp/SVG just renders the overflow off-canvas).

## Dependencies
- **01 → 02**: soft sequential. Phase 02 edits `gemini-provider.ts` and `vilao-provider.ts` created in
  Phase 01. Not parallel-safe on those two files. Run 01 fully, then 02.
- **03** depends on the `/api/ai/models` endpoint + `model` body field from Phase 01, and on the
  `ChatMessage.isError` handling shipped in Phase 02. Run last.

## File ownership (no cross-phase overlap on same file except the noted soft dep)
- **Phase 01**: `.env.local`, `src/lib/ai/providers/*` (types, gemini-provider, vilao-provider, index),
  `src/lib/image-utils.server.ts` (add mask helper), `src/app/api/ai/edit/route.ts`,
  `src/app/api/ai/models/route.ts`, `src/types/index.ts` (add `model?`).
- **Phase 02**: `src/lib/ai/providers/gemini-provider.ts`, `src/lib/ai/providers/vilao-provider.ts`
  (error paths), `src/types/index.ts` (add `isError?`), `src/components/chat/ChatPanel.tsx` (error wiring).
- **Phase 03**: `src/store/index.ts`, `src/app/page.tsx`, `src/components/chat/ChatPanel.tsx` (dropdown UI).

  > `ChatPanel.tsx` and `types/index.ts` are each edited in two phases — sequential, non-overlapping
  > regions. Not an issue since phases run in order, but noted for awareness.

## Unresolved questions
- Real `VILAO_API_KEY` value must be supplied by the user in `.env.local`; plan only adds a placeholder
  + the `MODELS` line.
- VILAO is an unofficial OpenAI reseller — mask-bleed and error-message specifics are OpenAI's
  documented behavior, not verified against VILAO's real backend. Validate manually once the key exists.
- VILAO base URL assumed `https://api.vilao.ai/v1/images/edits`; confirm exact host with user before shipping.

## Red Team Review

### Session — 2026-07-12
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 6 Critical, 5 High, 4 Medium
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (3 parallel passes; heavy
overlap across reviewers deduped into the list below)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Client-supplied `model` never validated against `MODELS` allowlist | Critical | Accept | Phase 1 |
| 2 | Raw provider error text unescaped into `dangerouslySetInnerHTML` — stored XSS in persisted chat history | Critical | Accept | Phase 2 |
| 3 | No try/catch around VILAO fetch — unhandled exceptions crash the route, orphan version snapshots | Critical | Accept | Phase 1 |
| 4 | No timeout/`AbortController` on VILAO fetch — indefinite hang | Critical | Accept | Phase 1 |
| 5 | VILAO's heterogeneous latency worsens the pre-existing `project.json`/picture-file save race | Critical | Accept (partial — staleness guard, not full locking) | Phase 3 |
| 6 | Success criteria depend on a key/URL that don't exist yet, no gate before marking "done" | Critical | Accept | Phase 1 |
| 7 | `parseModelId` undefined behavior when the model id has no `/` | High | Accept | Phase 1 |
| 8 | `VILAO_BASE_URL` is an unconfirmed guess with no shipping gate | High | Accept | Phase 1 |
| 9 | VILAO path silently drops cross-picture reference mentions | High | Accept — validated to full multi-image support (see Validation Log Q1), not simple rejection | Phase 1 |
| 10 | Mask is "steering guidance, not a hard constraint" — feature's core premise not flagged as a risk | High | Accept | Phase 1 |
| 11 | Usage quota decremented before provider call — VILAO failures burn quota for nothing | High | Accept (documented; mitigated by Finding 6/8's shipping gate) | Phase 1 |
| 12 | `GET /api/ai/models` fully public — recon target exposing internal model codenames | Medium | Accept | Phase 1 |
| 13 | `generateEditMask` no coordinate clamping, silent 512×512 fallback, no isolated verification | Medium | Accept | Phase 1 |
| 14 | Gemini `blockReason`/`finishReason`/`safetyRatings` field usage unverified against installed SDK/model | Medium | Accept | Phase 2 |
| 15 | In-flight edit not protected against concurrent project switch | Medium | Accept | Phase 3 |

**Rejected:** none outright. Two secondary findings were folded into accepted ones rather than tracked
separately: "no tier gating enables uncontrolled cost exposure" is addressed by Finding 1's allowlist check
(the locked "no tier gating" scope decision stands — cost control now rests on allowlist + quota, not
tier); "intra-phase step ordering can leave the build broken" is addressed by Finding 6's added `tsc
--noEmit` checkpoints in Phase 1, rather than as its own line item.

**Net effect on scope:** no phase count change, no new files beyond what Phase 1 already specified. All 15
fixes are additions to the existing 3 phases (allowlist check, try/catch + timeout wrapping, HTML escaping,
mask coordinate clamping, member-gating `/api/ai/models`, cross-picture guard, staleness guards) — the
plan's original architecture holds.

## Validation Log

### Session 1 — 2026-07-12
**Trigger:** Post-red-team validation interview (hard mode)
**Questions asked:** 4

#### Questions & Answers

1. **[Architecture]** Fix for Finding 9 (VILAO silently dropping cross-picture references): reject with a
   clear message, or implement full multi-image support (VILAO/OpenAI's endpoint accepts multiple `image[]`
   entries)?
   - Options: Reject with clear message (Recommended) | Full multi-image support
   - **Answer:** Full multi-image support
   - **Rationale:** Preserves the app's canonical cross-picture-reference use case for VILAO instead of
     degrading it to Gemini-only. Traded simplicity for capability — Phase 1 now sends the target picture
     plus every other referenced picture as additional `image[]` FormData entries. This specific
     multi-image-array behavior was NOT covered by the original OpenAI-contract research (which only
     confirmed the single-image case), so it carries the same "unverified until a real round trip succeeds"
     gate as the base URL/API key (Finding 6/8). A target-only fallback is noted if live testing shows VILAO
     doesn't honor extra images.

2. **[Risk]** Finding 5 (VILAO's heterogeneous latency worsens the existing `project.json` save race):
   add a lightweight in-memory per-project lock (feasible since the app is self-hosted, single Node
   process) to close the race, or document it as a residual risk?
   - Options: Document only, no lock (Recommended) | Add an in-memory per-project lock
   - **Answer:** Document only, no lock (Recommended)
   - **Rationale:** The race pre-dates this plan (documented in CLAUDE.md's "Known Constraints"); adding
     locking infrastructure is scope beyond the 3 originally-requested asks. Phase 3's staleness guard
     (Finding 15) plus the existing `isAiLoading`-disabled input already cover the most common single-tab
     case. No phase file change needed beyond what's already there.

3. **[Risk]** Finding 11 (usage quota decremented before the provider call, so VILAO failures burn quota
   for nothing): add a compensating refund on provider failure, or accept as documented risk?
   - Options: Accept as documented risk (Recommended) | Add usage refund on provider failure
   - **Answer:** Accept as documented risk (Recommended)
   - **Rationale:** Matches existing Gemini behavior (already burns quota on failure today); adding refund
     logic would touch `auth-guard.ts`, which is outside this plan's file-ownership list. Mitigated in
     practice by Finding 6/8's gate keeping `vilao/*` out of the live `MODELS` value until verified working.
     No phase file change needed beyond what's already there.

4. **[Assumption]** The VILAO fetch timeout was set to an arbitrary 45s in the plan. Confirm or change?
   - Options: Keep 45s (Recommended) | Shorter (20-30s) | Longer (60-90s)
   - **Answer:** Custom — 120s
   - **Rationale:** User's own judgment call on VILAO's expected latency (image generation can be slow).
     Applied throughout Phase 1 — the `AbortController` timeout, all inline comments, the Success Criteria,
     and the Risk Assessment row all now read 120s instead of 45s.

#### Confirmed Decisions
- Cross-picture VILAO handling: full multi-image `image[]` support (Phase 1), not rejection
- Same-project write race: documented residual risk only, no new locking mechanism
- Usage quota on VILAO failure: accepted risk, no refund logic
- VILAO fetch timeout: 120 seconds

#### Action Items
- [x] Phase 1: replace the cross-picture-rejection design with multi-image `image[]` FormData support
- [x] Phase 1: bump the `AbortController` timeout from 45s to 120s everywhere it's referenced
- [x] Phase 1: flag multi-image support as an additional unverified-until-real-round-trip item alongside
      the base URL/API key

#### Impact on Phases
- Phase 1: `vilao-provider.ts` design changed from single-image + rejection to multi-image `image[]` +
  120s timeout; Risk Assessment, Success Criteria, and Todo List updated to match.
- Phase 2 / Phase 3: no changes from this validation session.
