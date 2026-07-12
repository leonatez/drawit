# Phase 03 — Frontend Model Selection

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-01](phase-01-provider-abstraction-and-vilao-backend.md) (`/api/ai/models` endpoint +
  `model` body field) and [phase-02](phase-02-error-surfacing.md) (`ChatMessage.isError` wiring)
- Source of truth: `src/store/index.ts`, `src/app/page.tsx`, `src/components/chat/ChatPanel.tsx`
- Reference pattern for bootstrap fetch + store setter: `page.tsx` lines 102-107 (`/api/admin/settings` →
  `setAdminSettings`)

## Overview
- **Priority:** P2
- **Status:** completed (`npm run build` clean; user confirmed the model dropdown + a real VILAO edit
  tested OK)
- Add session-only model selection: fetch the configured model list on app bootstrap, store it in Zustand
  (NOT persisted), render a compact `<select>` in the chat panel, and include the chosen `model` in the
  edit request body.

## Key Insights
- **Session-only:** `availableModels` and `selectedModel` are plain Zustand UI state — NOT part of
  `Project` / `toProject()` / `loadProject()`. They reset to the fetched default on reload/project switch.
  Do NOT add them to `project.json` serialization.
- **Default = first configured model.** Initialize `selectedModel` to `''`; the bootstrap fetch sets it to
  the endpoint's `default`. Guard the dropdown to render only when `availableModels.length > 0`.
- **Mirror the admin-settings bootstrap exactly** (`fetch('/api/ai/models').then(...).then(setters)`) —
  same file, same `useEffect`, right after the admin-settings fetch.
- **RED TEAM: `/api/ai/models` now requires `requireMember()` (Phase 01 Finding 12) — it is NOT public
  like `/api/admin/settings`.** A guest's bootstrap fetch will get a 401. Guard on `r.ok` before parsing
  JSON (mirror the `/api/project` fetch pattern in `page.tsx`, not the unguarded `/api/admin/settings`
  pattern) so a guest simply sees an empty `availableModels` (dropdown doesn't render) instead of a thrown
  error from destructuring an error-shaped response body.
- **Disable the dropdown while `isAiLoading`** to avoid mid-request model swaps.
- **RED TEAM — Finding 15 (Medium): in-flight request can outlive the active project.** Nothing prevents
  the user from switching projects (via `ProjectsModal`) while a slow VILAO edit is in flight. Capture the
  `projectId` the request was sent for and no-op the success/failure handlers if the store's current
  `projectId` has changed by the time the response arrives — otherwise a late response fires
  `createVersion`/`addChatMessage`/`drawit:picture-updated` against the wrong (now-active) project.
- **RED TEAM — Finding 5 (Critical, plan-level): VILAO's heterogeneous latency widens the existing
  `project.json` save race.** This phase's staleness guard (above) only prevents *cross-project*
  corruption. It does NOT fully solve the same-project, same-tab overwrite race described in `plan.md`
  (fast Gemini edit completing after a slow VILAO edit started earlier, or vice versa) — that race already
  existed pre-plan (see CLAUDE.md "Known Constraints") and a full per-project write lock is out of scope
  for this feature (YAGNI). The existing `disabled={isAiLoading}` on `MentionInput` already prevents a
  *second* send from the *same tab* while one is in flight, which covers the most common case. Document the
  residual multi-tab risk in this phase's Risk Assessment rather than building a locking mechanism.

## Requirements
**Functional**
1. Store: `availableModels: string[]` (init `[]`), `selectedModel: string` (init `''`), actions
   `setAvailableModels(list)`, `setSelectedModel(id)`.
2. On bootstrap, `GET /api/ai/models` → guard on `r.ok` → `setAvailableModels(models)` +
   `setSelectedModel(default)`. On non-ok (e.g. guest, 401), leave `availableModels` as `[]`.
3. Chat panel renders a `<select>` of `availableModels`, value bound to `selectedModel`, `onChange` →
   `setSelectedModel`, `disabled={isAiLoading}`.
4. `handleSend` includes `model: selectedModel` in the POST body (omit/undefined is fine — route defaults).
5. `handleSend` captures `projectId` at request-send time; the success/failure branches re-check the
   store's *current* `projectId` matches before applying any state updates (Finding 15).

**Non-functional**
- Dropdown compact and consistent with the dark chat UI (`#1e293b` / `#334155` palette).

## Architecture
```
page.tsx bootstrap useEffect (after admin-settings fetch):
  fetch('/api/ai/models')
    .then(r => r.ok ? r.json() : null)              // Finding 12: now member-gated, guard on r.ok
    .then((data) => {
      if (!data) return;                             // guest / unauthenticated — leave dropdown empty
      const s = useEditorStore.getState();
      s.setAvailableModels(data.models ?? []);
      if (data.default) s.setSelectedModel(data.default);
    });

store: availableModels/selectedModel + setters (session-only, not in loadProject/toProject)

ChatPanel:
  const { availableModels, selectedModel, setSelectedModel } = useEditorStore();
  <select> near MentionInput, disabled while isAiLoading
  handleSend:
    const requestProjectId = projectId;              // Finding 15: snapshot at send-time
    ...
    body: { projectId: requestProjectId, prompt: text, mentions, model: selectedModel || undefined }
    ...
    // in the response handlers:
    if (useEditorStore.getState().projectId !== requestProjectId) return; // stale response, no-op
```
Display label suggestion: show the full model id (e.g. `vilao/gtm/gpt-image-2`) or a prettified last
segment — full id is unambiguous and simplest (KISS). No persistence, no per-project memory.

## Related Code Files
**Modify**
- `src/store/index.ts` — add `availableModels`, `selectedModel` to the state interface + initial state,
  and `setAvailableModels`, `setSelectedModel` to the actions interface + implementation. Do NOT reference
  them in `loadProject` or `toProject`.
- `src/app/page.tsx` — add the `/api/ai/models` fetch in the existing bootstrap `useEffect` (right after the
  `/api/admin/settings` fetch, ~line 107). **Guard on `r.ok` (Finding 12 changed this endpoint from public
  to member-gated) — mirror the `/api/project` fetch's `if (!r.ok) throw` pattern, not the unguarded
  `/api/admin/settings` pattern.**
- `src/components/chat/ChatPanel.tsx` — pull the new store fields; render the `<select>` in the input footer
  (`.border-t .p-2` block, above/beside `MentionInput`, member-only); add `model` to the POST body; snapshot
  `projectId` at send-time and no-op stale responses (Finding 15).

## Implementation Steps
1. Store: add state fields + initial values (`availableModels: []`, `selectedModel: ''`) and the two setters
   (`setAvailableModels: (list) => set({ availableModels: list })`, `setSelectedModel: (id) => set({ selectedModel: id })`).
2. `page.tsx`: append the `/api/ai/models` fetch to the bootstrap effect, **guarded on `r.ok`** (guests get
   401 now that the endpoint is member-gated — must degrade to an empty list, not throw); call both setters.
3. `ChatPanel.tsx`: destructure `availableModels, selectedModel, setSelectedModel` from the store; render a
   compact `<select>` (only when `isMember && availableModels.length > 0`), `disabled={isAiLoading}`.
4. Add `model: selectedModel || undefined` to the `JSON.stringify` body in `handleSend`.
5. In `handleSend`, capture `const requestProjectId = projectId;` before the `fetch`; in both the success
   and `!data.success`/catch branches, `if (useEditorStore.getState().projectId !== requestProjectId)
   return;` before calling `createVersion`/`addChatMessage`/dispatching `drawit:picture-updated` (Finding 15).
6. `npm run build` clean; manual check: dropdown lists configured models, default preselected, switching +
   sending routes to the chosen provider; a guest sees no dropdown (empty `availableModels`, no thrown error
   in the console).

## Todo List
- [x] store: `availableModels` + `selectedModel` state + init `[]`/`''`
- [x] store: `setAvailableModels` + `setSelectedModel` actions (not persisted; not referenced in
      `loadProject`/`toProject`)
- [x] `page.tsx`: bootstrap `GET /api/ai/models`, **guarded on `r.ok`** → setters (Finding 12)
- [x] `ChatPanel.tsx`: compact `<select>` (member-only, `disabled` while loading)
- [x] `ChatPanel.tsx`: add `model: selectedModel || undefined` to POST body
- [x] `ChatPanel.tsx`: snapshot `projectId` at send-time, no-op stale responses (Finding 15)
- [x] `npm run build` clean (verified: `/api/ai/models` correctly compiles as dynamic `ƒ`, confirming the
      `force-dynamic` export works). Manual dropdown/provider-routing/guest-degrades-gracefully checks still
      require a running dev server + real VILAO key — deferred to end-to-end QA.

## Success Criteria
- Dropdown shows all configured models with the default preselected on first load.
- Selecting VILAO and sending an edit routes the request to the VILAO provider (server logs / result).
- Reloading the page or switching projects resets the selection to the default (session-only confirmed).
- Dropdown is disabled during an in-flight AI request.
- A guest (unauthenticated) sees no console error from the now member-gated `/api/ai/models` fetch — the
  dropdown simply doesn't render (Finding 12).
- Switching projects while an edit is in flight does not cause the eventual response to mutate the
  newly-active project's version/chat history (Finding 15).

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `/api/ai/models` fetch fails or 401s (guest) | Low–Med (guests always 401 now) | No dropdown | Guard on `r.ok`, render on `availableModels.length > 0`; edit route still defaults server-side |
| `selectedModel` empty on first send (fetch race) | Low | Uses server default | `model: selectedModel || undefined` lets route default kick in |
| Accidentally persisting selection to project.json | Med | Spec violation | Explicitly exclude from `loadProject`/`toProject`; reviewer checks |
| Response arrives after user switched projects | Med (grows with VILAO's added latency) | Version/chat entry applied to wrong project | Snapshot `projectId` at send-time, no-op mismatched responses (Finding 15) |
| Same-project, same-tab overwrite race between a fast and a slow (VILAO) edit | Low (existing `isAiLoading` disable already blocks a second send from the same tab) | Last-write-wins on `project.json` | Documented residual risk, not fixed here — pre-existing constraint (CLAUDE.md), full per-project locking is out of scope (YAGNI); see plan.md Finding 5 |

## Security Considerations
- Endpoint returns only non-secret model IDs. No key exposure. Member gate on AI actions unchanged
  (dropdown is cosmetic; server still enforces `requireMember()`). **`/api/ai/models` itself is now also
  member-gated (Finding 12) — this phase's bootstrap fetch must handle the resulting 401 for guests
  gracefully rather than treating it as an unexpected error.**

## Next Steps
- Feature complete after this phase. Manual end-to-end validation with the real `VILAO_API_KEY` (see plan.md
  unresolved questions).
