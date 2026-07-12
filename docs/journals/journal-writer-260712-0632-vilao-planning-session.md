# Multi-Provider Image Edit Planning Session

**Date**: 2026-07-12 06:32
**Severity**: Medium
**Component**: AI image editing, provider abstraction, frontend UI
**Status**: Planning Complete — Ready for Implementation

## What Happened

Planning session completed to scope and design adding VILAO (OpenAI-compatible `/v1/images/edits` reseller) as a second image-edit provider alongside Gemini, add a model picker to the chat panel, and surface exact provider error messages instead of generic rejections.

**Scope chosen (HOLD):** All 3 asks included; no upscale-route changes; session-only model selection (no persistence); no tier gating.

## Key Decisions

- **Provider abstraction:** Gemini and VILAO share a common edit interface; model selector renders in `ChatPanel` and stores selection in Zustand (ephemeral, resets per session).
- **VILAO API contract confirmed:** OpenAI-compatible, returns base64-json, masks are alpha-channel PNG guidance (not hard constraints), error shape is `{ error: { message } }`.
- **Multi-image support:** VILAO receives all referenced pictures as `image[]` entries (matching Gemini's existing multi-image behavior), preserving the canonical "@picture-2 into @01" use case. **Flagged unverified against real VILAO backend.**
- **Error surfacing:** Provider rejection reasons (e.g., Gemini safety filters, VILAO quota) now bubble to user via chat UI; stored in project.json chat history with HTML escape.
- **Fetch timeout for VILAO:** 120 seconds (user's judgment call, not SDK default).

## Critical Red-Team Findings (15 deduplicated)

| Finding | Severity | Mitigation |
|---------|----------|-----------|
| Client-supplied model string (any member could invoke arbitrary models with server's API keys) | **CRITICAL** | Validate model against hardcoded allowlist before Gemini/VILAO call |
| Unescaped provider error text flowing into `dangerouslySetInnerHTML` + persisting in project.json | **HIGH** | HTML-escape error messages before storing in chat history |
| Missing try/catch + timeout around new VILAO fetch (route crash, orphaned version snapshots, indefinite hang) | **HIGH** | Wrap VILAO fetch in try/catch, set 120s timeout, guarantee version cleanup on error |
| Cross-provider latency race worsening existing project.json save-race condition | **MEDIUM** | Document as residual risk; no new locking infrastructure (scope discipline) |
| Concurrent writes to same project.json from multiple tabs/users | **MEDIUM** | Existing issue; documented in CLAUDE.md; beyond scope |

## Unresolved Blockers

**`.env.local` incomplete.** User expected `VILAO_API_KEY` and `MODELS` config to be present but they are not. Plan treats as user action item:
- Real `.env.local` must include `VILAO_API_KEY` (actual key from provider).
- Confirm real VILAO base URL (plan assumes `https://api.vilao.ai/v1/images/edits` — unverified).
- VILAO goes "live" (added to production MODELS list in backend) only after user confirms real key + one successful round-trip.

## Plan Location

Full design in: `/home/linh-nguyen/AI_lab/drawit/plans/260712-0600-vilao-multi-provider-image-edit/`

Three phases:
1. **Phase 1:** Provider abstraction layer + VILAO backend integration.
2. **Phase 2:** Exact error message surfacing (HTML escape, chat storage).
3. **Phase 3:** Frontend model selector in `ChatPanel` UI.

## Next Steps

1. User supplies real `VILAO_API_KEY` and confirms base URL.
2. Implementation follows phase files; critical mitigations (model validation, error escaping, try/catch) implemented before any live testing.
3. Validation interview decisions (multi-image support, 120s timeout, concurrent-write risk acceptance) locked in design.
