# Phase 2 Sprint 3 — Changelog

**Branch:** `redesign/caiotti-ds-v1`
**Sprint:** Fix first-run UX
**Date:** 2026-04-29
**Status:** ✅ Complete — typecheck clean, build successful

---

## Summary

Welcome state tightened (less vertical real estate burned, redundant brand title removed). Prompt card description contrast improved. DS toggle row hides entirely until a design system is scanned (instead of showing a confusing disabled-checkbox-with-link). Empty states audited and verified across sessions drawer, prefs panel, and image studio history.

```
Sprint 3:    +18 / -19  (net -1)
Cumulative:  +248 / -1066 (net -818 since branch open)
Build:       ✅ dist/ui.html 2415.1 KB
Typecheck:   ✅ clean
```

---

## What changed

### 1. Welcome state density + brand de-duplication

**Before:** F logo (40×40) + "Figmento" title + "Your AI design assistant. Describe what you want to create." subtitle + space-xl padding all around. Three Figmento brand mentions on screen at once (OS title bar + header wordmark + welcome title).

**After:** Smaller F logo (32×32) + tightened subtitle ("Describe what you want to create."). No in-panel "Figmento" title — header wordmark + OS title bar already cover that. Padding reduced (`var(--space-md) var(--space-lg) var(--space-sm)` instead of `var(--space-xl) var(--space-lg)` all around). Gap reduced from `--space-lg` → `--space-sm`.

Files touched:
- `chat.ts` — `addChatWelcome()` removed `<div class="welcome-title">Figmento</div>`, simplified subtitle copy
- `ui.html` — `.welcome-state` and `.welcome-logo` CSS tightened, removed `.welcome-title` class style block (CSS still safe to leave; it's just unused)

### 2. Prompt card description contrast

**Before:** `.template-card-desc` used `color: var(--text-secondary)` (`#6B7280`) on `var(--bg-secondary)` (`#F9FAFB`). ~4.69:1 contrast — passes WCAG AA but reads as faded gray-on-gray.

**After:** `color: var(--text-primary)` with `opacity: 0.78`. Effective ~7:1 contrast, descriptions actually readable.

Files touched: `ui.html` (single CSS rule).

### 3. DS toggle row hides when no DS scanned

**Before:** `ds-toggle-row` always visible. When no DS cache existed, rendered with `.disabled` class showing a greyed-out checkbox + "Scan your design system first" link. Took up a whole line above the chat input even on first run when most users haven't scanned.

**After:** `updateDsToggleUI()` sets `display: none` on the row entirely when `hasCache === false`. Settings → Design System still has the scan button, so the discoverability path is preserved (and that's the right place for it). Row reappears the moment a scan completes.

Files touched: `index.ts` — `updateDsToggleUI()` reorganized, added early return when no cache, simplified the remaining branches.

### 4. Empty states audited

Verified all three empty states exist with appropriate copy:

| Surface | Empty state | Implementation |
|---|---|---|
| Sessions drawer | "No conversations yet. Send a message to start one." | CSS `:empty::after` pseudo-element on `.sessions-list` (existing — copy improved from "No saved conversations") |
| Preferences panel | "No preferences learned yet. Create designs and confirm corrections to build your preference profile." | `<div class="pref-empty">` toggled by `renderPreferences()` (existing, kept) |
| Image studio history | "Generated images will appear here" | `<span class="is-history-empty">` toggled by `renderHistoryStrip()` (existing, kept) |

Files touched: `ui.html` (sessions empty copy improved, line-height added).

### 5. First-run no-API-key onboarding cue — DEFERRED

The audit recommended a CTA banner pointing to settings when the user opens the plugin with no API keys configured. After investigating the actual default flow:

- Default provider is **Claude Code (Local)** — no API key needed
- Caio uses Claude Code exclusively
- The cue would only fire for users who explicitly switch to Anthropic/OpenAI/Gemini/Venice without first pasting a key

Decision: defer this. The chat send path already shows a clear error ("Set your X API key in Settings first") when a non-Claude-Code provider has no key. That's enough signal for now.

Reopen this if/when Figmento ships publicly and onboards users who don't already have Claude Code installed.

---

## Verification

- `npm run typecheck` → ✅ clean
- `npm run build` → ✅ success, `dist/ui.html` 2415.1 KB (~1 KB smaller than Sprint 2)
- Manual UI verification: pending Caio loads the build into Figma

---

## What's next

**Sprint 4 — Adopt nanostores + Biome 2** (still gated on Caio re-confirming after seeing Sprints 1-3 results in Figma)

After Sprint 4: **Plugma pilot** (4h side-branch experiment) → **Phase 3** (Caiotti DS v1 redesign with light+dark)

---

## Files touched (Sprint 3)

```
M  figmento/src/ui.html       (welcome-state CSS, template-card-desc contrast, sessions empty copy)
M  figmento/src/ui/chat.ts    (addChatWelcome simplified)
M  figmento/src/ui/index.ts   (updateDsToggleUI hide-when-no-cache)
```
