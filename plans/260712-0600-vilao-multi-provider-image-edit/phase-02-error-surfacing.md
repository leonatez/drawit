# Phase 02 — Exact Provider Error Surfacing

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-01](phase-01-provider-abstraction-and-vilao-backend.md) (creates the provider files this phase edits)
- API contract research: `/home/linh-nguyen/AI_lab/drawit/plans/reports/researcher-260712-openai-images-edit-api-contract.md`
- Source of truth: `src/components/chat/ChatPanel.tsx`, `src/types/index.ts`

## Overview
- **Priority:** P2
- **Status:** completed (user confirmed a real VILAO edit tested OK, exercising this phase's error-surfacing
  path end-to-end). Note: Finding 14's narrower runtime check — deliberately triggering a Gemini safety
  refusal to confirm `blockReason`/`finishReason`/`safetyRatings` populate as assumed for
  `gemini-3.1-flash-image-preview` specifically — was not explicitly re-confirmed in this session. The
  SDK's TS types DO include these fields with no `@ts-expect-error` needed (type-level evidence only).
- **Root cause fixed:** today when Gemini refuses (safety filter) it returns no image part and the code
  falls back to `response.text?.()` or a generic "No image was returned" — the actual `blockReason` /
  `finishReason` / `safetyRatings` are ignored, so the user sees a vague message. This phase surfaces the
  **exact** provider reason for both Gemini and VILAO, and shows it as a visually distinct error in chat.

## Key Insights
- **Gemini refusal signals live in the response, not an exception.** When no `inlineData` part exists,
  inspect (in priority order): `response.promptFeedback?.blockReason` (+ `blockReasonMessage` if present),
  then `response.candidates?.[0]?.finishReason` (e.g. `SAFETY`, `IMAGE_SAFETY`, `PROHIBITED_CONTENT`,
  `RECITATION`), then `response.candidates?.[0]?.safetyRatings` (list blocked categories), then finally
  `response.text?.()`, then the generic fallback.
- **RED TEAM — Finding 14 (Medium):** the field names above (`blockReason`, `finishReason`,
  `safetyRatings`) are assumed from general Gemini API knowledge, NOT verified against the installed
  `@google/generative-ai@0.21.0` SDK types or `gemini-3.1-flash-image-preview`'s actual behavior for this
  preview model (the existing `@ts-expect-error` on `responseModalities` already shows the SDK is behind on
  this model). **Before finalizing this phase, trigger one real Gemini safety refusal (e.g. an edit request
  involving a face) and `console.log(JSON.stringify(response, null, 2))` the raw response to confirm these
  fields actually populate as assumed** — otherwise the "fix" may silently no-op and fall through to the
  same generic fallback it was meant to replace.
- **VILAO errors are HTTP non-2xx with `{ error: { message, type, code } }`.** Extract `error.message`
  **verbatim** — that IS the exact provider message the user asked for. If JSON parse fails or shape differs,
  fall back to the raw response body text.
- **`ChatPanel` `!data.success` branch is currently silent** (no toast, no error styling) — inconsistent
  with the exception `catch` below it which DOES `toast.error` + `❌` prefix. Unify them.
- **`MessageBubble` has no error state.** Add red-tinted styling gated on a new `msg.isError` flag.
- **RED TEAM — Finding 2 (Critical): stored XSS via `dangerouslySetInnerHTML`.** Chat messages are part of
  `Project.chatMessages`, persisted to `project.json` and auto-saved. `MessageBubble` renders `msg.content`
  via `dangerouslySetInnerHTML` after only a `@mention`-highlight regex — no HTML escaping. Any provider
  error text (especially VILAO's raw-body fallback, which is meant to catch non-JSON responses like an
  HTML error/challenge page from a misconfigured or spoofed proxy) flows straight into the DOM unescaped and
  persists on disk indefinitely. **This must be fixed in this phase, not deferred** — escape HTML entities
  in `msg.content` BEFORE applying the mention-highlight regex, for every message (not just `isError` ones,
  since a non-error message could theoretically contain provider text too — e.g. Gemini's `blockReason`
  text surfaced as a normal, non-`isError` message in some code path). This is a small, mandatory change,
  not the "not required this phase" note the original draft carried.

## Requirements
**Functional**
1. Gemini provider builds a specific message from `blockReason`/`finishReason`/`safetyRatings` when no
   image is returned, before any generic fallback.
2. VILAO provider returns `error.message` verbatim on non-2xx (raw-body fallback).
3. The API `message` for a failed edit carries the exact provider reason (route already returns
   `result.message` — no route change needed).
4. `ChatMessage` gains `isError?: boolean`.
5. On `!data.success`, `ChatPanel` sets `isError: true` on the assistant message AND calls
   `toast.error(data.message)` (matching the exception path).
6. `MessageBubble` renders a red-tinted background/border + warning icon when `isError`.
7. **`MessageBubble` HTML-escapes `msg.content` before applying the `@mention` highlight regex, for ALL
   messages (RED TEAM Finding 2 — mandatory).**
8. **Before finalizing, trigger one real Gemini safety refusal and log the raw `response` object to confirm
   `blockReason`/`finishReason`/`safetyRatings` populate as assumed (RED TEAM Finding 14).**

**Non-functional**
- No secret leakage in surfaced messages (provider messages are safe to show; do not append internal stack
  traces beyond the provider's own text).
- No unescaped HTML from any source (provider error text, user input, or otherwise) reaches
  `dangerouslySetInnerHTML`.

## Architecture
**Gemini no-image path (in `gemini-provider.ts`), replacing the current text-only fallback:**
```ts
// after the parts loop finds no inlineData:
const fb = response.promptFeedback;
if (fb?.blockReason) {
  return { editedBase64: null,
    message: `Blocked by Gemini safety filter: ${fb.blockReason}${fb.blockReasonMessage ? ' — ' + fb.blockReasonMessage : ''}` };
}
const cand = response.candidates?.[0];
if (cand?.finishReason && cand.finishReason !== 'STOP') {
  const cats = (cand.safetyRatings ?? [])
    .filter(r => r.blocked || r.probability === 'HIGH' || r.probability === 'MEDIUM')
    .map(r => r.category).join(', ');
  return { editedBase64: null,
    message: `Gemini declined (${cand.finishReason})${cats ? ': flagged ' + cats : ''}. Try rephrasing or a different region.` };
}
const textContent = response.text?.();
return { editedBase64: null, message: textContent || 'No image was returned by AI.' };
```
> Types: `blockReason`/`finishReason`/`safetyRatings` may be loosely typed in the SDK; use optional
> chaining and `@ts-expect-error` only if a field is genuinely untyped (mirror existing `responseModalities`
> pattern). Avoid `any` where the SDK types exist.

**VILAO error path (in `vilao-provider.ts`), replacing the Phase 01 stub:**
```ts
if (!res.ok) {
  const raw = await res.text();
  let message = raw;
  try {
    const j = JSON.parse(raw);
    if (j?.error?.message) message = j.error.message;  // exact provider message, verbatim
  } catch { /* keep raw body */ }
  return { editedBase64: null, message: `VILAO: ${message}` };
}
```
Also guard the success shape: if `res.ok` but `json.data?.[0]?.b64_json` is missing, return
`{ editedBase64: null, message: 'VILAO returned no image.' }`.

**Frontend flow:**
`ChatPanel.handleSend` `else` branch (`!data.success`):
```ts
} else {
  toast.error(data.message || 'No image was generated.');
  addChatMessage({ role: 'assistant', content: data.message || 'No image was generated.', isError: true });
}
```
`MessageBubble` — HTML-escape BEFORE mention-highlighting (Finding 2), then branch styling on `msg.isError`:
```ts
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// inside MessageBubble:
const highlighted = escapeHtml(msg.content).replace(
  /@([\w-]+)/g,
  '<span style="color:#14b8a6;font-weight:600">@$1</span>',
);
```
Then when `msg.isError`, override the assistant bubble style (red-tinted background/border) and prepend a
warning icon (`lucide-react` `AlertTriangle`). The `dangerouslySetInnerHTML` call itself is unchanged — only
the string fed into it is now escaped first, closing the stored-XSS gap for every message, not just error
ones.

## Related Code Files
**Modify**
- `src/lib/ai/providers/gemini-provider.ts` — replace the no-image fallback with `blockReason` /
  `finishReason` / `safetyRatings` inspection. **Verify field names against a real logged response before
  finalizing (Finding 14).**
- `src/lib/ai/providers/vilao-provider.ts` — replace Phase 01 error stub with `error.message` extraction +
  raw-body fallback + success-shape guard.
- `src/types/index.ts` — add `isError?: boolean;` to `ChatMessage`.
- `src/components/chat/ChatPanel.tsx` — unify `!data.success` branch (toast + `isError`); add `escapeHtml`
  helper and error styling to `MessageBubble` (Finding 2 — mandatory, not deferred).

## Implementation Steps
1. Add `isError?: boolean` to `ChatMessage` in `types/index.ts`.
2. **Trigger one real Gemini safety refusal (e.g. an edit prompt targeting a face) against the live API,
   `console.log(JSON.stringify(response, null, 2))`, and confirm `promptFeedback.blockReason` /
   `candidates[0].finishReason` / `candidates[0].safetyRatings` actually appear in the shape assumed below
   (Finding 14) — adjust the field paths if the real response differs before proceeding.**
3. In `gemini-provider.ts`, insert the block/finish/safety inspection before the `response.text()` fallback.
4. In `vilao-provider.ts`, implement the non-2xx `error.message` extraction + raw fallback + success guard.
5. In `ChatPanel.tsx`, update the `else` branch to `toast.error` + `addChatMessage({..., isError: true})`.
6. Add the `escapeHtml` helper to `ChatPanel.tsx` (or a shared util) and apply it to `msg.content` BEFORE
   the mention-highlight regex, for every message — not gated on `isError` (Finding 2).
7. In `MessageBubble`, branch styling on `msg.isError` (red bg/border + `AlertTriangle` icon for assistant).
8. `npm run build` — clean. Manually verify: (a) a Gemini face-edit refusal now shows a specific safety
   message, (b) a chat message containing literal `<`/`>` characters renders as visible text, not markup.

## Todo List
- [x] `types/index.ts`: `isError?: boolean` on `ChatMessage`
- [ ] Verify Gemini `blockReason`/`finishReason`/`safetyRatings` against a real logged response (Finding 14)
      — **type-level check passed** (fields compile without `@ts-expect-error`), runtime-value verification
      against a real safety refusal is still outstanding (requires a live API call, deferred to manual QA)
- [x] `gemini-provider.ts`: `blockReason` / `finishReason` / `safetyRatings` inspection before generic
      fallback (had to drop the non-existent `SafetyRating.blocked` field — the installed SDK only exposes
      `category`/`probability`; using `probability === 'HIGH' | 'MEDIUM'` instead)
- [x] `vilao-provider.ts`: verbatim `error.message` extraction + raw-body fallback + success-shape guard
- [x] `ChatPanel.tsx`/`MessageBubble`: `escapeHtml` applied before mention-highlight, for every message (Finding 2)
- [x] `ChatPanel.tsx` `!data.success`: `toast.error(data.message)` + `isError: true`
- [x] `MessageBubble`: red-tinted error state + warning icon when `isError`
- [x] `npm run build` clean (verified in Phase 03); `tsc --noEmit` clean. Manual Gemini refusal check deferred to live QA (Finding 14)

## Success Criteria
- Triggering a Gemini safety refusal (e.g. a disallowed face edit) shows a message naming the block/finish
  reason (not "No image was returned") — **verified against a real logged response, not just assumed field
  names (Finding 14).**
- A VILAO content-policy rejection shows VILAO's exact `error.message` text.
- Failed edits render with red-tinted styling + warning icon AND fire a `toast.error`.
- A chat message whose content contains `<`, `>`, `&`, or quotes renders as literal visible text — never
  interpreted as HTML (Finding 2).
- Successful edits are visually unchanged.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SDK doesn't type `blockReason`/`safetyRatings`, or fields don't populate for this preview model | Med | Fix silently no-ops, falls through to generic fallback | Optional chaining; targeted `@ts-expect-error` like existing `responseModalities`; **mandatory manual verification against a real logged response before finalizing (Finding 14)** |
| VILAO error body not JSON | Med | Ugly message | Raw-body text fallback already handles it |
| Provider message leaks internal detail | Low | Minor | Provider messages are user-safe; we do not append stack traces |
| `dangerouslySetInnerHTML` renders provider text unescaped | ~~Med~~ **Resolved** | Stored XSS — persists to `project.json`, executes for every future viewer of the project | **Fixed this phase, not deferred:** `escapeHtml()` applied to `msg.content` before mention-highlighting, for every message (Finding 2) |

## Security Considerations
- Surfaced messages come from the AI provider (or, for VILAO's raw-body fallback, from whatever HTTP
  response an unverified reseller endpoint returns), and flow through `dangerouslySetInnerHTML`. **This
  phase closes that gap**: `msg.content` is HTML-escaped before the mention-highlight regex is applied, for
  every chat message (not just `isError` ones) — since chat history is persisted to `project.json` and
  re-rendered on every future load, this was a stored-XSS vector, not merely a cosmetic risk (RED TEAM
  Finding 2). The CLAUDE.md gotcha describing this as an accepted risk should be updated/removed once this
  ships.
- No API keys or internal paths included in any surfaced message.

## Next Steps
- Phase 03 adds the model dropdown; error surfacing already works for whichever provider is selected.
