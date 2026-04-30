# Phase 2 Sprint 1 — Changelog

**Branch:** `redesign/caiotti-ds-v1`
**Sprint:** Kill the Noise (dead code purge)
**Date:** 2026-04-29
**Status:** ✅ Complete — typecheck clean, build successful

---

## Summary

Net **-853 lines** of dead code removed across 8 files. No functional behavior change for end users. Foundations laid for Sprint 2 (entry-point consolidation) and Sprint 3 (first-run UX).

```
Lines:    +160 / -1013  (net -853)
Files:    8 modified, 1 deleted
Build:    ✅ dist/ui.html 2418.2 KB
Typecheck: ✅ clean
```

---

## What was removed

### 1. Three orphaned tab surfaces (`ui.html`)
- `tab-chat` — legacy hidden div, never populated
- `tab-status` — full status dashboard UI (MCP card, DS card, Preferences card) that was never reachable (`display:none`, no entry point)
- `tab-bridge` — duplicate of Advanced Bridge section in settings, dual-write driven by bridge.ts

### 2. `ad-analyzer.ts` module (-509 lines)
- Fully orphaned — no imports anywhere in codebase
- Was part of the "CU-6 legacy mode flows" that were already removed from UI
- Also removed `adAnalyzerState` from `state.ts` (-15 lines)

### 3. Anthropic OAuth dead UI + code paths
- HTML: `#anthropic-oauth-section` block in `ui.html`
- Handlers: `handleAnthropicConnect`, `handleAnthropicActivate`, `handleAnthropicDisconnect`, `updateAnthropicOAuthUI` in `chat-settings.ts`
- Imports: `ANTHROPIC_OAUTH_CONFIG`, `isAnthropicOAuthConfigured`, `validateAnthropicToken` removed from `chat-settings.ts`
- Config: `ANTHROPIC_OAUTH_CONFIG`, `isAnthropicOAuthConfigured`, `validateAnthropicToken` deleted from `oauth-flow.ts`
- Storage: `save-anthropic-token`, `clear-anthropic-token` cases + load logic removed from `handlers/settings.ts`
- Type: `anthropicToken?: OAuthToken` field removed from `ChatSettings`
- Fallback path: `anthropicToken?.access_token` checks removed from `chat.ts` (chat send validation + `runAnthropicLoop`)
- Reason: feature was scaffolded but never finished (`clientId: 'TODO_FIGMENTO_ANTHROPIC_CLIENT_ID'` made `isAnthropicOAuthConfigured()` always return false). Codex OAuth (Claude Code Local) covers the same use case.

### 4. Status Tab JS handlers (`index.ts`)
- Deleted `updateStatusTabMcp()`, `updateStatusTabPreferences()`, `initStatusTab()` functions (~80 lines)
- Removed `initStatusTab()` from boot sequence
- Stripped `statusTabState` from imports + cleaned out from `state.ts`
- Stripped status-tab DOM lookups from `handleDesignSystemScanned()` and `triggerDesignSystemScan()`
- Removed unused `setOnBridgeStateChange`, `getBridgeCommandCount`, `getBridgeErrorCount` imports from bridge.ts
- Preserved: DS cache restoration logic moved into `initDesignSystemPanel()` (was inside dead `initStatusTab`)

### 5. CU-6 feature flag breadcrumbs (6 files touched)
- 5 comments in `ui.html` (CSS section + inline)
- 4 comments in `index.ts` and `chat.ts`
- All referenced removed legacy mode flows that no longer exist

### 6. `relay-status-bar` removed from main UI
- HTML element removed from chat surface
- References cleaned in `chat-settings.ts` (visibility toggle in `updateRelaySettingsUI` and `saveChatSettings`)
- References cleaned in `index.ts` (auto-connect bridge block)
- Reason: dev/debug indicator leaking into production UI. Bridge connection state is already shown in Settings → Advanced via `bridge-adv-*` IDs.
- Preserved: `notifyRelayStatus()` in bridge.ts and `updateRelayStatus()` in chat.ts left as defensive no-ops (early-return on missing elements). Will clean in a future pass.
- Preserved: `.relay-status-bar` and `.relay-dot` CSS classes in `ui.html` still present (will be removed in Phase 3 with full CSS pass).

### 7. Hardcoded hex colors → tokens
- `#22c55e` and `#22c55e33` (Codex OAuth connected hint) → `var(--success)` and `var(--success-dim)`
- `var(--color-accent, #4ade80)` (Advanced settings callout) → `var(--success)` (positive status accent)
- Note: 70+ other hardcoded hex values remain throughout `ui.html` (e.g., relay-dot status colors, pref-confidence-badge colors, image studio chip colors). These are Phase 3 token migration territory — Sprint 1 only handled the audit-flagged ones.

---

## What was preserved (deliberately)

- `notifyRelayStatus()` (bridge.ts) and `updateRelayStatus()` (chat.ts) — defensive functions that return early on missing elements. Effectively dead but harmless. Cleanup deferred.
- `oauthToken?: string` parameter in `tool-use-loop.ts` — still in ToolUseLoopOptions interface, no longer used by callers, harmless. Cleanup deferred.
- `anthropicApiKey` chat path — still functional for users who paste an Anthropic API key directly. Only the OAuth alternative path was removed.
- `--success-dim` token usage spread across the file — still 0.12 alpha (we use this for the OAuth success hint border, slightly lighter than the original 0.20 alpha).

---

## Verification

- `npm run typecheck` → ✅ clean
- `npm run build` → ✅ success, `dist/ui.html` 2418.2 KB, `dist/code.js` 1.1 MB
- Manual UI verification: pending Caio loads the build into Figma

---

## What's next

**Sprint 2 — Consolidate entry points:**
- Pick ONE settings entry point (kill `designDrawerBtn`, keep `settingsBtn`)
- Pick ONE model selector source of truth
- Move theme toggle into Settings
- Add proper labels or rebalance the 4 remaining header icons

**Sprint 3 — Fix first-run UX:**
- Welcome state collapses after first message
- "Use My Design System" row hidden until DS scanned
- Empty states defined for sessions, prefs, image studio history

**Sprint 4 — Adopt nanostores + Biome 2** (gated on Caio re-confirming after seeing the cleanup results)

---

## Files touched

```
M  figmento/src/handlers/settings.ts          -21 lines
M  figmento/src/ui.html                       -153 lines
D  figmento/src/ui/ad-analyzer.ts             -509 lines
M  figmento/src/ui/chat-settings.ts           -106 lines
M  figmento/src/ui/chat.ts                    -13 lines
M  figmento/src/ui/index.ts                   -168 lines
M  figmento/src/ui/oauth-flow.ts              -34 lines
M  figmento/src/ui/state.ts                   -21 lines
```
