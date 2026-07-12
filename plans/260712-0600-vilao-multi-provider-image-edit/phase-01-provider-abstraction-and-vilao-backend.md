# Phase 01 — Provider Abstraction + VILAO Backend

## Context Links
- Plan overview: [plan.md](plan.md)
- API contract research: `/home/linh-nguyen/AI_lab/drawit/plans/reports/researcher-260712-openai-images-edit-api-contract.md`
- Source of ground truth: `src/lib/ai/gemini.ts`, `src/app/api/ai/edit/route.ts`,
  `src/lib/image-utils.server.ts`, `src/app/api/admin/settings/route.ts`, `src/types/index.ts`

## Overview
- **Priority:** P2 (blocks Phase 02 & 03)
- **Status:** completed (user supplied the real `VILAO_API_KEY`, confirmed `VILAO_BASE_URL`, added
  `vilao/*` to the live `MODELS` value, and confirmed a real VILAO edit tested OK — Finding 6 gate closed)
- Introduce a provider abstraction under `src/lib/ai/providers/`, add the VILAO provider (OpenAI-compatible
  `/v1/images/edits` with a real transparency mask), make the edit route dispatch by `model`, and expose the
  configured model list via a public GET endpoint. Env config (`MODELS`, `VILAO_API_KEY`) added here.

## Key Insights
- **Model ID split on FIRST `/` only.** `"vilao/gtm/gpt-image-2"` → provider `"vilao"`, model `"gtm/gpt-image-2"`.
  VILAO's own model names contain slashes; splitting once is intentional. Use `id.indexOf('/')`, not `.split('/')`.
- **`MODELS` is server-only.** Never `NEXT_PUBLIC_`. Client gets the list only via `/api/ai/models`.
- **Graceful degrade:** if `process.env.MODELS` is unset/empty, `getConfiguredModels()` returns
  `['gemini/gemini-3.1-flash-image-preview']`. Never throw.
- **VILAO mask semantics:** PNG, alpha channel, same pixel dims as source. **Transparent (alpha=0) = edit
  region; opaque = preserve.** This is the inverse of "draw a box" — punch a hole where the box is.
- **Mask is guidance, not a hard clip (RED TEAM — Finding 10).** The cited research notes the model may
  apply edits semantically beyond the masked region. Do NOT market this as pixel-precise editing in any UI
  copy. Success Criteria below adds a manual containment check; treat bleed as an accepted limitation, not
  a bug to chase.
- **gpt-image models always return `b64_json`** — no `response_format` param needed. Success shape:
  `{ data: [{ b64_json }] }`.
- **Node 18+ has global `fetch`/`FormData`/`Blob`** — no npm package for multipart upload.
- **`size: "auto"`** hardcoded (do not expose).
- **Keep `upscaleImage` in `src/lib/ai/gemini.ts` untouched** — `/api/upscale` still imports it from there.
  Only the `editImage` path moves into the provider module.
- **RED TEAM — Finding 1 (Critical):** the client-supplied `model` string MUST be checked against
  `getConfiguredModels()` in the route before dispatch. Without this, any member can direct the server to
  call an arbitrary model string using the server's own API keys — bypassing the admin-curated allowlist
  entirely. This is not optional hardening; it is a required part of Phase 01.
- **RED TEAM — Finding 9 (High), VALIDATED decision: full multi-image support, not rejection.** The VILAO
  path must NOT silently drop cross-picture reference mentions (the app's canonical use case — see
  CLAUDE.md §9 "add the monster from @picture-2 to @01"). Per the validation interview, send every mentioned
  picture as an additional `image[]` FormData entry (OpenAI's images/edits endpoint accepts multiple
  reference images via repeated `image[]` fields), not just the target picture. **This specific
  multi-image-array capability was NOT part of the original API-contract research** (that research
  confirmed b64_json/error-shape/mask/size for the single-image case only) — treat "does VILAO actually
  honor multiple `image[]` entries the way OpenAI's newer multi-reference editing does" as an **additional
  unresolved question requiring the same manual-verification-before-production gate as Finding 6/8.** If a
  live test shows VILAO ignores extra images or errors on them, fall back to sending only the target image
  and surface a message noting the other picture was ignored — do not let this block Phase 1's build.
- **RED TEAM — Finding 6 (Critical):** none of the Success Criteria below can be observed until a real
  `VILAO_API_KEY` and confirmed `VILAO_BASE_URL` exist. Do not mark this phase `completed` — mark it
  `implemented-pending-verification` until one real VILAO round trip has succeeded (see Success Criteria).

## Requirements
**Functional**
1. `MODELS` env parsed into an ordered list; entry 0 is the default model.
2. `POST /api/ai/edit` accepts optional `model` string; defaults to `getConfiguredModels()[0]`; **validates
   `modelId` is a member of `getConfiguredModels()` and 400s otherwise** (RED TEAM Finding 1 — mandatory,
   not optional); dispatches to the correct provider.
3. Gemini provider preserves current behavior (annotated visible box + text prompt).
4. VILAO provider sends the target picture PNG + every other mentioned picture's PNG (as additional
   `image[]` entries) + generated alpha mask (for the target only) + prompt + model + `size=auto` as
   multipart, parses `data[0].b64_json` on success. Cross-picture reference mentions are transmitted, not
   dropped (RED TEAM Finding 9, validated decision: full multi-image support over simple rejection).
5. `GET /api/ai/models` returns `{ models: string[], default: string }`. **Requires `requireMember()`**,
   same guard as `/api/ai/edit` (RED TEAM Finding 12) — this list still reveals internal model codenames
   and shouldn't be open to unauthenticated recon.
6. `vilaoEditImage` wraps its entire body (fetch, JSON parse, mask generation) in try/catch and never
   throws — mirrors the existing Gemini contract exactly (RED TEAM Finding 3).
7. The VILAO `fetch` call uses an `AbortController` with an explicit timeout (120s) and returns a distinct
   timeout message on abort (RED TEAM Finding 4).
8. `parseModelId` returns `null` when the id contains no `/`; the route 400s on a `null` parse result
   instead of silently mis-slicing (RED TEAM Finding 7).

**Non-functional**
- Every new file < 200 lines (project convention). Split if needed.
- No breaking change to existing Gemini edit behavior or to `/api/upscale`.
- **Phase status:** mark `implemented-pending-verification`, not `completed`, until a real VILAO round trip
  succeeds with the actual key + confirmed base URL (RED TEAM Finding 6).

## Architecture
```
POST /api/ai/edit
  └─ editImageWithProvider(modelId, input)        [providers/index.ts]
       ├─ parseModelId(modelId) → { provider, modelName }
       ├─ provider === 'gemini' → geminiEditImage(input, modelName)   [gemini-provider.ts]
       └─ provider === 'vilao'  → vilaoEditImage(input, modelName)    [vilao-provider.ts]
                                    └─ generateEditMask(...)           [image-utils.server.ts]

GET /api/ai/models → { models, default }          [api/ai/models/route.ts]
                       └─ getConfiguredModels()    [providers/types.ts]
```

**Data flow (VILAO edit):**
input `{ prompt, mentions, pictureBase64Map, targetPictureId }`
→ pick target base64 → collect distinct `pictureId`s from `mentions` other than the target → look up their
  base64 in `pictureBase64Map` (skip any missing) → find box mentions for target picture → `generateEditMask`
  produces alpha-PNG buffer for the target only (clamped coords, throws a caught error if source metadata
  width/height is unreadable — see snippet below, Finding 13)
→ build `FormData` (`image[]` Blob = target PNG first, then one `image[]` Blob per other referenced
  picture, mask Blob = mask PNG for the target, `prompt`, `model=modelName`, `size=auto`) — **full
  multi-image send, per validated Finding 9 decision; unverified against VILAO's real backend, same
  manual-check gate as the base URL/key (Finding 6/8)**
→ `fetch(VILAO_URL, { method:'POST', signal: AbortSignal.timeout(120_000), headers:{ Authorization:'Bearer
  '+VILAO_API_KEY }, body: formData })` — **entire call wrapped in try/catch (Finding 3); an abort/timeout
  or network throw is caught and returns `{ editedBase64: null, message: 'VILAO request timed out or
  failed to connect.' }`, never propagates.**
→ 2xx: `json.data[0].b64_json` → `{ editedBase64, message:'Edit applied.' }`
→ non-2xx: handled in Phase 02 (`error.message` extraction). For Phase 01, return
  `{ editedBase64: null, message: 'VILAO error: '+<raw text> }` as a stub the Phase 02 work refines.

**`ProviderEditInput` / `ProviderEditResult`** (superset of current Gemini types):
```ts
export interface ProviderEditInput {
  prompt: string;
  mentions: ResolvedMention[];
  pictureBase64Map: Record<string, string>;
  targetPictureId: string;
}
export interface ProviderEditResult {
  editedBase64: string | null;
  message: string;
}
```
(No mask buffer field on the input — the VILAO provider generates the mask itself from `mentions` +
`pictureBase64Map`, keeping the interface identical to today's `EditImageInput`/`EditImageResult` so the
route call site barely changes.)

## Related Code Files
**Create**
- `src/lib/ai/providers/types.ts` — `ProviderEditInput`, `ProviderEditResult`, `parseModelId(id)` (returns
  `{ provider, modelName } | null` — `null` when `id.indexOf('/') === -1`, RED TEAM Finding 7),
  `getConfiguredModels()`.
- `src/lib/ai/providers/gemini-provider.ts` — `geminiEditImage(input, modelName)`; move the body of the
  current `editImage` from `src/lib/ai/gemini.ts` here (Phase 02 adds error inspection). Accept `modelName`
  (from the model id) and pass to `genAI.getGenerativeModel({ model: modelName })` instead of the hardcoded
  constant, so different Gemini model ids can be configured.
- `src/lib/ai/providers/vilao-provider.ts` — `vilaoEditImage(input, modelName)`; multipart fetch with the
  target image plus every other referenced picture as additional `image[]` entries (Finding 9, validated:
  full multi-image support) + mask for the target; entire body in try/catch, never throws (Finding 3); 120s
  `AbortController` timeout with a distinct timeout message (Finding 4).
- `src/lib/ai/providers/index.ts` — `editImageWithProvider(modelId, input)` dispatcher; unsupported provider
  returns `{ editedBase64: null, message: 'Unsupported model provider: '+provider }`.
- `src/app/api/ai/models/route.ts` — `GET`, **gated by `requireMember()`** (Finding 12) →
  `{ models: getConfiguredModels(), default: getConfiguredModels()[0] }`.

**Modify**
- `.env.local` — add `MODELS=gemini/gemini-3.1-flash-image-preview,vilao/gtm/gpt-image-2,vilao/imx/gpt-image-2`
  and a placeholder `VILAO_API_KEY=` (real value user-supplied). Add `VILAO_BASE_URL` optional override
  defaulting in code to `https://api.vilao.ai/v1/images/edits`. **Do not add the `vilao/*` entries to the
  live `MODELS` value used in any deployed environment until the base URL is confirmed and one real edit
  round-trips successfully (Finding 6/8) — keep them commented out or omit until then; `gemini/...` alone is
  a safe default.**
- `src/lib/image-utils.server.ts` — add `generateEditMask(imageBase64, boxes): Promise<Buffer>` where
  `boxes: {relX,relY,relW,relH}[]`. Opaque base canvas, punch transparent holes per box via `blend:'dest-out'`.
  **Clamp every derived pixel coordinate to `[0, w]`/`[0, h]` and skip zero/negative-area boxes; throw a
  caught, descriptive error (not a silent 512×512 fallback) if `sharp(buf).metadata()` returns no
  width/height (Finding 13).**
- `src/app/api/ai/edit/route.ts` — read `model` from body; `const modelId = model || getConfiguredModels()[0]`;
  **400 if `!getConfiguredModels().includes(modelId)` (Finding 1)**; replace `editImage({...})` call with
  `editImageWithProvider(modelId, {...})`; **wrap the `editImageWithProvider` call in try/catch** — even
  though Finding 3 makes provider functions never throw, this is a defense-in-depth backstop so a future
  provider bug can't crash the route past the version-snapshot-already-saved point.
- `src/types/index.ts` — add `model?: string;` to `EditRequest`.
- `src/lib/ai/gemini.ts` — keep `upscaleImage`; the `editImage` export may remain (re-export from
  gemini-provider) OR be removed once the route no longer imports it. Prefer: delete `editImage` from
  gemini.ts and move its logic to `gemini-provider.ts` (DRY — no duplicate). Verify no other importer of
  `editImage` exists (`grep -rn "editImage" src`). **Do this deletion (step 10) and the route import swap
  (step 8) back-to-back with a `tsc --noEmit` check immediately after both, not deferred to the final
  build step** — avoids a broken intermediate state if steps are executed out of order.

## Implementation Steps
1. **[USER ACTION REQUIRED]** In `.env.local`, add the `MODELS=` line above and a placeholder
   `VILAO_API_KEY=` line. The implementer adds the `MODELS` line + empty placeholder; **the user must paste
   the real VILAO secret key**. Also add optional `VILAO_BASE_URL=`.
2. Create `providers/types.ts` with the two interfaces, `parseModelId` (first-slash split), and
   `getConfiguredModels` (parse `process.env.MODELS`, trim entries, drop empties, fallback to Gemini-only).
3. Create `providers/gemini-provider.ts` — move `editImage` logic; parameterize the model name; export
   `geminiEditImage(input: ProviderEditInput, modelName: string)`.
4. Add `generateEditMask` to `image-utils.server.ts` (see snippet below).
5. Create `providers/vilao-provider.ts` — `vilaoEditImage`; build multi-image FormData (target + other
   referenced pictures as `image[]` entries, per Finding 9), fetch, parse `b64_json`.
6. Create `providers/index.ts` dispatcher.
7. Create `api/ai/models/route.ts` GET endpoint.
8. Edit `api/ai/edit/route.ts`: import `editImageWithProvider` + `getConfiguredModels`; read `model`;
   **validate `modelId` against `getConfiguredModels()`, 400 if not present (Finding 1)**; wrap the
   dispatch call in try/catch (defense-in-depth, Finding 3); dispatch. Remove the old `editImage` import.
   **Run `npx tsc --noEmit` immediately after this step** (Finding 6/process gate).
9. Add `model?: string` to `EditRequest` in `types/index.ts`.
10. Remove `editImage` from `gemini.ts` (after confirming no other importer via
    `grep -rn "editImage" src`). Keep `upscaleImage`, `imagePart`, `getGenAI`. **Run `npx tsc --noEmit`
    immediately after this step too** — do not defer the only compile check to step 11.
11. Run `npm run build` (or `npx tsc --noEmit`) — zero type/compile errors.
12. **[USER ACTION REQUIRED — blocking, Finding 6/8]** Once the real `VILAO_API_KEY` and confirmed
    `VILAO_BASE_URL` are available, uncomment/add the `vilao/*` entries to `MODELS` and fire one real edit
    against `vilao/gtm/gpt-image-2`. Only then mark this phase `completed` (until this step, mark
    `implemented-pending-verification`).

**`generateEditMask` technique (clamped, no silent-fallback — Finding 13):**
```ts
export async function generateEditMask(
  imageBase64: string,
  boxes: { relX: number; relY: number; relW: number; relH: number }[],
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const buf = Buffer.from(imageBase64, 'base64');
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('generateEditMask: could not read source image dimensions');
  }
  const w = meta.width, h = meta.height;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
  const rects = boxes
    .map(b => ({
      x: clamp(b.relX * w, w), y: clamp(b.relY * h, h),
      width: clamp(b.relW * w, w), height: clamp(b.relH * h, h),
    }))
    .filter(r => r.width > 0 && r.height > 0)   // drop degenerate/negative boxes rather than compositing them
    .map(r => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="white"/>`)
    .join('');
  const holes = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
  return sharp({ create: { width: w, height: h, channels: 4, background: { r:0,g:0,b:0,alpha:1 } } })
    .composite([{ input: Buffer.from(holes), blend: 'dest-out' }])
    .png().toBuffer();  // opaque everywhere, transparent inside each clamped box
}
```
Note: if `boxes` is empty (picture-only mention, no box) or all boxes were degenerate, send NO mask to
VILAO (full-image edit). Caller wraps this in try/catch — a thrown error here becomes a caught, readable
`ProviderEditResult` failure, not an unhandled route crash (ties into Finding 3).

**Before wiring into the live route, do a cheap offline sanity check** (Finding 13's verification gap): call
`generateEditMask` against a test image + a known box, write the returned buffer to a scratch file, and
visually confirm the hole lands where expected — one manual check, not a full test suite (YAGNI).

**VILAO FormData sketch (timeout + try/catch + cross-picture guard — Findings 3, 4, 9):**
```ts
export async function vilaoEditImage(
  input: ProviderEditInput, modelName: string,
): Promise<ProviderEditResult> {
  try {
    const targetBase64 = input.pictureBase64Map[input.targetPictureId];
    const boxMentions = input.mentions.filter(m => m.type === 'box' && m.box).map(m => m.box!);
    const maskBuf = boxMentions.length > 0
      ? await generateEditMask(targetBase64, boxMentions)
      : null;

    // Finding 9 (validated: full multi-image support, not rejection) — collect every OTHER
    // referenced picture's base64, in addition to the target. Unverified against VILAO's real
    // backend (same gate as Finding 6/8) — if VILAO rejects/ignores extra `image[]` entries in
    // production testing, fall back to sending only the target image.
    const otherPictureIds = [...new Set(
      input.mentions.map(m => m.pictureId).filter(id => id !== input.targetPictureId),
    )];
    const otherBase64s = otherPictureIds
      .map(id => input.pictureBase64Map[id])
      .filter((b): b is string => Boolean(b));

    const url = process.env.VILAO_BASE_URL || 'https://api.vilao.ai/v1/images/edits';
    const fd = new FormData();
    fd.append('image[]', new Blob([Buffer.from(targetBase64, 'base64')], { type: 'image/png' }), 'target.png');
    otherBase64s.forEach((b64, i) => {
      fd.append('image[]', new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }), `reference-${i}.png`);
    });
    if (maskBuf) fd.append('mask', new Blob([maskBuf], { type: 'image/png' }), 'mask.png');
    fd.append('model', modelName);
    fd.append('prompt', input.prompt);
    fd.append('size', 'auto');

    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),          // Finding 4: hard timeout, no indefinite hang
      headers: { Authorization: `Bearer ${process.env.VILAO_API_KEY}` },
      body: fd,                                       // do NOT set Content-Type — fetch sets the boundary
    });

    // Phase 01 stub — Phase 02 replaces this block with exact error.message extraction
    if (!res.ok) {
      const raw = await res.text();
      return { editedBase64: null, message: `VILAO error: ${raw}` };
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) return { editedBase64: null, message: 'VILAO returned no image.' };
    return { editedBase64: b64, message: 'Edit applied.' };
  } catch (err: unknown) {
    // Finding 3: never throw — mirror the Gemini provider's contract exactly.
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    const msg = err instanceof Error ? err.message : String(err);
    return {
      editedBase64: null,
      message: isTimeout ? 'VILAO request timed out after 120s.' : `VILAO request failed: ${msg}`,
    };
  }
}
```

## Todo List
- [x] `.env.local`: add `MODELS` line (Gemini-only for now, `vilao/*` entries added once verified — Finding
      6/8) + placeholder `VILAO_API_KEY=` (+ optional `VILAO_BASE_URL=`) — **user still needs to paste the real key**
- [x] `providers/types.ts`: interfaces + `parseModelId` returning `null` on missing slash (Finding 7) +
      `getConfiguredModels` (graceful fallback)
- [x] `providers/gemini-provider.ts`: moved editImage logic, model name parameterized
- [x] `image-utils.server.ts`: `generateEditMask` with coordinate clamping + no silent 512×512 fallback
      (Finding 13); manual offline sanity check still pending (deferred to Phase 01's live-verification step)
- [x] `providers/vilao-provider.ts`: multi-image `image[]` FormData (target + other referenced pictures,
      Finding 9 validated decision), full try/catch (Finding 3), 120s `AbortController` timeout (Finding 4),
      `b64_json` parse (error path refined in Phase 02)
- [x] `providers/index.ts`: `editImageWithProvider` dispatcher
- [x] `api/ai/models/route.ts`: **member-gated** GET (Finding 12), `force-dynamic` (matches this repo's
      SUPABASE_SERVICE_ROLE_KEY route convention)
- [x] `api/ai/edit/route.ts`: read `model`, **validate against allowlist, 400 if not configured (Finding
      1)**, dispatch via `editImageWithProvider` inside a try/catch backstop
- [x] `types/index.ts`: `model?` on `EditRequest`
- [x] remove `editImage` from `gemini.ts`; confirmed no orphan importers (`grep -rn "editImage" src`); kept `upscaleImage`
- [x] `tsc --noEmit` checkpoint — clean, zero errors (fixed one Buffer→BlobPart type mismatch in
      `vilao-provider.ts` along the way, unrelated to the plan's findings — Node `Buffer` isn't directly
      assignable to DOM `BlobPart`, resolved with a `toArrayBuffer()` helper)
- [x] `npm run build` clean (verified in Phase 03; `/api/ai/models` correctly compiles as dynamic route)
- [x] **[USER ACTION REQUIRED]** confirm real `VILAO_API_KEY` + `VILAO_BASE_URL`, add `vilao/*` to `MODELS`,
      fire one real VILAO edit before marking this phase `completed` (Finding 6/8) — **done, user confirmed
      it tested OK**

## Success Criteria
- `GET /api/ai/models` (member-gated) returns the configured models with the Gemini one as default.
- An edit with `model` omitted behaves identically to today (Gemini, visible-box annotation).
- An edit with an unconfigured/malformed `model` string (not in `MODELS`, or missing `/`) is rejected with
  a 400, not silently dispatched (Findings 1, 7).
- An edit with `model: "vilao/gtm/gpt-image-2"` and a cross-picture mention (e.g. "@picture-2" referenced
  alongside a box on the target) sends BOTH images as `image[]` entries — not verifiable that VILAO
  actually honors the second image until a real round trip succeeds (Finding 9's multi-image support is as
  unverified as the base URL/key — same gate applies).
- An edit with `model: "vilao/gtm/gpt-image-2"` and a box mention sends a masked multipart request and
  saves the returned image — **not verifiable until the real key + confirmed base URL exist; this phase
  stays `implemented-pending-verification` until that one real round trip succeeds (Finding 6).**
- A VILAO request that hangs or the host doesn't resolve fails with a clear timeout message within 120s,
  not an indefinite hang (Finding 4).
- Manually dumping `generateEditMask`'s output for a known box confirms the transparent hole lands in the
  expected location (Finding 13) — note (per Key Insights) that VILAO itself may still bleed slightly
  beyond the mask; this check is about our mask generation, not VILAO's containment.
- `/api/upscale` still works (Gemini) — untouched.
- `npm run build` passes with no type errors.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `VILAO_API_KEY` missing at runtime | High (not in env yet) | VILAO edits fail | Placeholder + user todo; `vilao/*` kept out of live `MODELS` until verified (Finding 6/8) |
| Wrong VILAO base URL | Med | All VILAO edits fail, or (worst case) key + user images sent to a wrong/squatted domain | `VILAO_BASE_URL` override; **blocking** — do not add `vilao/*` to live `MODELS` until host is confirmed (Finding 8) |
| Mask dims mismatch source (metadata unreadable) | Low | Previously: silent wrong-size mask. Now: caught error, readable failure | `generateEditMask` throws on missing width/height instead of falling back to 512×512 (Finding 13) |
| Removing `editImage` breaks an importer | Low | Build break | `grep -rn "editImage" src` before deleting; `tsc --noEmit` checkpoint right after (Finding 6/process), not deferred |
| Model name with slash mishandled | Med | Wrong provider routing | Split on first `/` only; `parseModelId` returns `null` on no-slash input, route 400s (Finding 7) |
| Client sends an unconfigured `model` string | High (client-controlled input) | Arbitrary model/provider invoked with server's API keys | Route validates `modelId ∈ getConfiguredModels()`, 400s otherwise (Finding 1) |
| VILAO fetch hangs indefinitely | Med (unconfirmed host/latency) | `isAiLoading` stuck forever, server connection held open | 120s `AbortController` timeout, distinct timeout message (Finding 4) |
| Unhandled exception in VILAO path | Med (network/parse errors are the norm for a new integration) | Route crashes past the version-snapshot-saved point, orphaning snapshot files | Entire `vilaoEditImage` body in try/catch, never throws (Finding 3); route also wraps the dispatch call as a backstop |
| VILAO ignores/rejects extra `image[]` entries (multi-image support unverified) | Med (validated decision, but untested against VILAO's real backend) | Cross-picture edits may still not work as expected even though the code sends all images | Same manual-verification-before-production gate as Finding 6/8; fallback plan (send target-only) noted in Key Insights if live testing shows it doesn't work (Finding 9) |
| Mask is "guidance not hard constraint" per research | Med | Feature may not deliver the precision implied by "real transparency mask" | Documented as a known limitation in Key Insights; not sold as pixel-precise in any UI copy |
| Usage quota burned on guaranteed-to-fail VILAO attempts before key/URL confirmed | High until verified | Members lose daily/monthly edits to a non-functional provider | Accepted risk, same as today's Gemini failure behavior; mitigated by keeping `vilao/*` out of live `MODELS` until Finding 6/8's gate passes — so this window should be short/pre-production only |

## Security Considerations
- `MODELS` and `VILAO_API_KEY` are server-only; never prefixed `NEXT_PUBLIC_`, never returned by
  `/api/ai/models` (only model IDs, which are non-secret).
- `/api/ai/edit` retains `requireMember()` + `checkAndIncrementUsage()` guards — unchanged. The route also
  now validates the client-supplied `model` against the server's own allowlist before dispatch (Finding 1)
  — without this, tier gating and usage limits are the only remaining cost control, and neither accounts
  for which model/provider is actually invoked.
- `/api/ai/models` now requires `requireMember()` (Finding 12) — it is no longer public. This is a change
  from the original plan's "mirrors `/api/admin/settings`" framing: unlike admin settings, this endpoint
  reveals internal third-party model codenames (`gtm/gpt-image-2`, `imx/gpt-image-2`) that are worth
  keeping behind the same auth gate as the AI features they describe.

## Next Steps
- Phase 02 refines the VILAO error path (`error.message` extraction) and adds Gemini safety inspection in
  `gemini-provider.ts`.
- Phase 03 consumes `/api/ai/models` and sends `model` from the chat panel.
