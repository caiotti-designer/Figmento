# Story UI-1: Design Token System + CSS Variables Rewrite

**Status:** Done
**Priority:** Critical (P0)
**Complexity:** M (5 points) — 1 file major rewrite (ui.html CSS section)
**Epic:** UI — Plugin UX/UI Revamp
**Depends on:** None
**PRD:** UX audit 2026-03-17 — Aesthetron/Vercel/Apple reference, shadcn patterns

---

## Business Value

The current design system uses neon green (#D4FF00) on near-black with Space Grotesk — a gamer/hacker aesthetic that doesn't match a professional design tool. Replacing it with a neutral, light-mode-first token system (Inter font, monochrome palette, shadcn patterns) establishes the visual foundation for the entire UI revamp. Every subsequent story depends on these tokens.

## Out of Scope

- Layout restructure (UI-2)
- Dark mode toggle UI (UI-3) — but dark mode tokens ARE defined here
- New HTML structure changes — this story only rewrites CSS variables and base styles
- JavaScript changes

## Risks

- **Visual regression across all components** — every element references CSS vars. Renaming vars will break styling until all references are updated in the same pass.
- **Font loading** — Inter must be loaded via Google Fonts. Need to add/verify in `manifest.json` allowedDomains.
- **Figma plugin iframe quirks** — `data:` URL environment may behave differently with CSS custom properties and `prefers-color-scheme`.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds (npm run build in figmento/), all UI elements render correctly in light mode, dark mode vars defined but not yet togglable"
quality_gate_tools: ["esbuild", "manual Figma plugin test"]
```

---

## Story

**As a** designer using the Figmento plugin,
**I want** the UI to use a clean, neutral design system with Inter font and monochrome palette,
**so that** the tool looks professional and lets my designs be the focus, not the tool's UI.

---

## Description

### Problem

The current `:root` block (ui.html:16-92) defines ~40 CSS variables with:
- Neon green primary (`#D4FF00`)
- Near-black backgrounds (`#0A0A0A` → `#2A2A2A`)
- Space Grotesk font
- Inconsistent naming (mix of `--color-*` and direct names)

Every component references these vars. The visual identity screams "dev tool" not "design tool."

### Solution

1. **Replace the entire `:root` block** with the Figmento Neutral token system defined in the epic
2. **Define both light and dark mode** via `[data-theme="light"]` (default) and `[data-theme="dark"]` selectors
3. **Swap font** from Space Grotesk to Inter (system-ui fallback)
4. **Update all CSS references** — rename `--color-primary` → `--accent`, `--color-bg-deep` → `--bg-primary`, etc.
5. **Update Google Fonts link** in `<head>` to load Inter instead of Space Grotesk
6. **Add `data-theme="light"` to `<html>`** as default

### Token Migration Map

| Old Variable | New Variable | Light Value | Dark Value |
|-------------|-------------|-------------|------------|
| `--color-primary` | `--accent` | `#171717` | `#FAFAFA` |
| `--color-primary-dim` | `--accent-dim` | `rgba(23,23,23,0.08)` | `rgba(250,250,250,0.08)` |
| `--color-primary-glow` | *(removed)* | — | — |
| `--color-bg-deep` | `--bg-primary` | `#FFFFFF` | `#0A0A0A` |
| `--color-bg-base` | `--bg-secondary` | `#F9FAFB` | `#141414` |
| `--color-bg-elevated` | `--bg-tertiary` | `#F3F4F6` | `#1F1F1F` |
| `--color-bg-surface` | `--bg-hover` | `#E5E7EB` | `#2A2A2A` |
| `--color-bg-hover` | `--bg-active` | `#D1D5DB` | `#333333` |
| `--color-border` | `--border` | `#E5E7EB` | `#262626` |
| `--color-border-strong` | `--border-strong` | `#D1D5DB` | `#404040` |
| `--color-text-primary` | `--text-primary` | `#111827` | `#FAFAFA` |
| `--color-text-secondary` | `--text-secondary` | `#6B7280` | `#A1A1AA` |
| `--color-text-tertiary` | `--text-tertiary` | `#9CA3AF` | `#71717A` |
| `--color-success` | `--success` | `#22C55E` | `#22C55E` |
| `--color-error` | `--error` | `#EF4444` | `#EF4444` |
| `--color-warning` | `--warning` | `#F59E0B` | `#F59E0B` |
| `--font-family` | `--font-sans` | `Inter, system-ui, -apple-system, sans-serif` | same |
| *(new)* | `--font-mono` | `'SF Mono', 'Fira Code', monospace` | same |

---

## Acceptance Criteria

- [ ] **AC1:** `:root` / `[data-theme="light"]` defines all light mode tokens from the epic design system
- [ ] **AC2:** `[data-theme="dark"]` defines all dark mode tokens (functional but not togglable yet — UI-3)
- [ ] **AC3:** `<html>` element has `data-theme="light"` by default
- [ ] **AC4:** Google Fonts link loads Inter (wght 400;500;600;700) instead of Space Grotesk
- [ ] **AC5:** `body` uses `var(--font-sans)` for font-family
- [ ] **AC6:** All existing CSS rules updated to use new variable names (no broken `var(--color-*)` references)
- [ ] **AC7:** User chat bubble uses `--accent` background with white text (light mode) instead of neon green
- [ ] **AC8:** Send button uses `--accent` background instead of neon green
- [ ] **AC9:** Tool action indicators use `--accent` border-left instead of neon green
- [ ] **AC10:** Neon green (#D4FF00) appears NOWHERE in the CSS
- [ ] **AC11:** `npm run build` succeeds in `figmento/`
- [ ] **AC12:** Plugin renders correctly in Figma with the new light-mode palette

---

## Tasks

### Phase 1: Token Definition (AC1, AC2, AC3)

- [ ] Replace `:root` block (ui.html:16-92) with new token system
- [ ] Define `[data-theme="light"]` with all light mode tokens
- [ ] Define `[data-theme="dark"]` with all dark mode tokens
- [ ] Add shared tokens (radius, spacing, typography scale) to `:root`
- [ ] Set `data-theme="light"` on `<html>` element

### Phase 2: Font Swap (AC4, AC5)

- [ ] Replace Space Grotesk Google Fonts link with Inter (400, 500, 600, 700)
- [ ] Update `--font-family` → `--font-sans` value to Inter stack
- [ ] Add `--font-mono` variable for code/monospace elements
- [ ] Verify `manifest.json` allows `fonts.googleapis.com` and `fonts.gstatic.com` (already present)

### Phase 3: Global Variable Migration (AC6, AC10)

- [ ] Find-and-replace all `var(--color-primary)` → `var(--accent)` in CSS
- [ ] Find-and-replace all `var(--color-primary-dim)` → `var(--accent-dim)`
- [ ] Find-and-replace all `var(--color-bg-deep)` → `var(--bg-primary)`
- [ ] Find-and-replace all `var(--color-bg-base)` → `var(--bg-secondary)`
- [ ] Find-and-replace all `var(--color-bg-elevated)` → `var(--bg-tertiary)`
- [ ] Find-and-replace all `var(--color-bg-surface)` → `var(--bg-hover)`
- [ ] Find-and-replace all `var(--color-bg-hover)` → `var(--bg-active)`
- [ ] Find-and-replace all `var(--color-border)` → `var(--border)`
- [ ] Find-and-replace all `var(--color-border-strong)` → `var(--border-strong)`
- [ ] Find-and-replace all `var(--color-text-primary)` → `var(--text-primary)`
- [ ] Find-and-replace all `var(--color-text-secondary)` → `var(--text-secondary)`
- [ ] Find-and-replace all `var(--color-text-tertiary)` → `var(--text-tertiary)`
- [ ] Find-and-replace all `var(--color-success)` → `var(--success)`
- [ ] Find-and-replace all `var(--color-error)` → `var(--error)`
- [ ] Find-and-replace all `var(--color-warning)` → `var(--warning)`
- [ ] Find-and-replace all `var(--font-family)` → `var(--font-sans)`
- [ ] Remove all remaining `#D4FF00` hex references and `--color-primary-glow` / `--color-primary-light` vars
- [ ] Update hardcoded colors (e.g., `#60a5fa` for tool names → use a `--text-link` token)

### Phase 4: Component-Specific Updates (AC7, AC8, AC9)

- [ ] `.chat-bubble.user` — background: `var(--accent)`, color: white
- [ ] `.chat-send-btn` — background: `var(--accent)`, color: white
- [ ] `.tool-action` — border-left-color: `var(--accent)`
- [ ] `.tool-icon` — color: `var(--accent)`
- [ ] `.btn-primary` — background: `var(--accent)`, remove glow/gradient effects (keep clean)
- [ ] `.mode-card` — hover border: `var(--accent)` instead of neon
- [ ] `.step.active .step-number` — background: `var(--accent)`
- [ ] `.bridge-btn` — background: `var(--accent)`
- [ ] `.chat-settings-save-btn` — background: `var(--accent)`
- [ ] Remove `--color-primary-glow` box-shadow from buttons (too flashy for neutral palette)
- [ ] Simplify `.btn-primary::before` gradient overlay (remove or make subtle)

### Phase 5: Build & Verify (AC11, AC12)

- [ ] Run `npm run build` in `figmento/`
- [ ] Load plugin in Figma, verify all screens render in light mode
- [ ] Verify chat, modes, bridge, settings all look correct
- [ ] Check that no neon green remnants appear anywhere

---

## Dev Notes

- The entire CSS is inline in `ui.html` (lines 11-5201). No separate CSS files.
- `chat.ts` references some CSS class names dynamically (e.g., `chat-bubble user/assistant`). Variable names are only in CSS — no JS changes needed for this story.
- The `.chat-bubble.user` currently uses `--color-primary` (neon green) background — must become `--accent` (#171717 in light mode) with `#FFFFFF` text.
- Some hardcoded colors exist outside the var system: `#60a5fa` (tool name), `#a78bfa` (sys log), `rgba(0,0,0,0.3)` (code bg). Migrate these to tokens too.
- The `--color-primary-light: #8BFF00` variable is used in gradients — remove entirely for neutral palette.
- Success/error/warning colors stay green/red/yellow — those are universal and work in both light and dark.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui.html` | MODIFY | CSS `:root` rewrite, all variable references updated, font link swapped |
| `figmento/manifest.json` | VERIFY | Ensure `fonts.googleapis.com` and `fonts.gstatic.com` are in allowedDomains |

---

## Definition of Done

- [ ] All CSS vars use new naming convention
- [ ] Light mode renders cleanly (no neon green anywhere)
- [ ] Dark mode vars defined (toggleable in UI-3)
- [ ] Inter font loads correctly
- [ ] Plugin builds and renders in Figma

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @sm (River) | Initial draft from UX audit |
| 2026-03-17 | @ux-design-expert (Uma) | Token migration map approved |
| 2026-03-17 | @po (Pax) | Validation GO (10/10). Status Draft → Ready |
