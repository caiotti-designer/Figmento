# Phase 2 Sprint 2 — Changelog

**Branch:** `redesign/caiotti-ds-v1`
**Sprint:** Consolidate entry points
**Date:** 2026-04-29
**Status:** ✅ Complete — typecheck clean, build successful

---

## Summary

Header icon load reduced from 5 → 3 by default. Theme toggle relocated from header to Settings (segmented Light/Dark control). `designDrawerBtn` icon changed from gear → sliders so it no longer visually duplicates Settings. `chat-learn` button hides when no snapshot is available (surfaces only when meaningful).

```
Sprint 2:    +47 / -73   (net -26)
Cumulative:  +230 / -1047 (net -817 since branch open)
Build:       ✅ dist/ui.html 2417.8 KB
Typecheck:   ✅ clean
```

---

## What changed

### 1. Theme toggle: header → Settings

**Before:** sun/moon icon button in top-right header (5th icon, rarely used).
**After:** segmented Light/Dark control inside a new "Appearance" group at the top of the Settings sheet.

Files touched:
- `ui.html` — removed `themeToggleBtn` from header; added "Appearance" group with `.theme-toggle-group` segmented control; added CSS for `.theme-toggle-btn` (active state via `aria-pressed="true"`)
- `chat.ts` — rewired theme handler. Selects all `.theme-toggle-btn` elements, applies theme on click, syncs `aria-pressed` state across buttons.

Reason: header real estate is scarce. Theme is set once per user preference, doesn't need a top-level slot. Caiotti DS v1 light is default — most users will never touch this.

### 2. designDrawerBtn icon: gear → sliders

**Before:** identical gear icon to `settingsBtn` — users couldn't tell them apart.
**After:** sliders/equalizer icon (3 vertical sliders with handles). Distinct silhouette.

Updated tooltip from "Design settings" → "Design controls (model, quality, fonts, brand colors)" so the function is unambiguous on hover.

Files touched: `ui.html` (single `<svg>` swap inside the button + tooltip).

Reason: the button opens a separate "Design Drawer" with per-generation controls (Image Model, Quality 1k/2k/4k, Style, Default Font, Brand Colors, 8px Grid). Different feature than Settings — the visual collision was the bug, not the existence of two entry points.

### 3. chat-learn button: hide-by-default until enabled

**Before:** `disabled` attribute set on page load. Visible but greyed-out, no explanation. Confusing.
**After:** `style="display:none"` on page load. `setLearnButtonEnabled(true)` reveals it once a snapshot is captured (i.e., after the first AI generation). Tooltip expanded to explain the feature.

Files touched:
- `ui.html` — `disabled` attr → `style="display:none"`; expanded `title` to describe the feature.
- `chat.ts` — `setLearnButtonEnabled()` now toggles `style.display` in addition to `disabled` + `.active` class.

Reason: empty/disabled icon buttons are the worst kind of UI noise — they say "something is here but you can't have it." Hiding until functional removes confusion. Surfaces naturally on first AI generation when the feature actually works.

### 4. Dead bridge-content migration cleanup

**Before:** `chat.ts` migrated `#tab-bridge .bridge-content` into the settings sheet at init (`if (bridgeContent) { ... }` block). After Sprint 1 deleted `tab-bridge`, this block was dead — querySelector always returned null.
**After:** removed the dead block. Settings sheet still receives the full `tab-settings .chat-settings-content` (where the Advanced MCP Bridge `<details>` section already lives).

Files touched: `chat.ts` (-15 lines).

---

## What was preserved (deliberately)

- **Both settings entry points** (`settingsBtn` in header, `designDrawerBtn` in input toolbar) — different features, now visually distinct.
- **Both model selectors** (`modelSelectorBtn` in toolbar, `<select id="settings-model">` in settings) — they're already synchronized; the toolbar shows current selection while settings is the management surface. No change needed.
- **Default theme remains light** (`<html data-theme="light">` in ui.html) — matches Caiotti DS v1 default.

---

## Header icons after Sprint 2

| Icon | ID | When visible |
|---|---|---|
| `+` | `chat-new` | Always |
| Chat bubble | `chat-sessions-btn` | Always |
| Pencil | `chat-learn` | Only after first AI generation creates a snapshot |
| Gear | `settingsBtn` | Always |

Down from 5 → 4 max icons, with `chat-learn` hidden by default → typically 3 visible icons.

---

## Verification

- `npm run typecheck` → ✅ clean
- `npm run build` → ✅ success, `dist/ui.html` 2417.8 KB (~no change vs Sprint 1, expected — net deletions roughly balanced by added theme control)
- Manual UI verification: pending Caio loads the build into Figma

---

## What's next

**Sprint 3 — Fix first-run UX:**
- Welcome state collapses after first message
- "Use My Design System" row hidden until DS is scanned (currently shows disabled checkbox)
- Empty states defined for sessions drawer, preferences, image studio history
- Onboarding cue when no API key (point to settings explicitly with a CTA)

**Sprint 4 — Adopt nanostores + Biome 2** (still gated on Caio's go-ahead after seeing Sprint 1+2 results in Figma)

---

## Files touched (Sprint 2)

```
M  figmento/src/ui.html       (theme toggle UI + CSS, designDrawerBtn icon, chat-learn visibility)
M  figmento/src/ui/chat.ts    (theme handler, chat-learn visibility, dead bridge-content migration removed)
```
