# Story UI-3: Polish Pass — Animations, Dark Mode Toggle, Keyboard Shortcuts

**Status:** Done
**Priority:** High (P1)
**Complexity:** S (3 points) — 1 file modify (ui.html CSS + JS), 1 file minor modify (chat.ts)
**Epic:** UI — Plugin UX/UI Revamp
**Depends on:** UI-2 (layout must be in place)
**PRD:** UX audit 2026-03-17 — Aesthetron/Vercel/Apple polish standards

---

## Business Value

The layout (UI-2) and tokens (UI-1) establish structure and identity. This story adds the finishing touches that separate a professional tool from a prototype: smooth transitions, dark mode toggle, keyboard shortcuts, and micro-interactions. These details are what make users feel the tool is polished and trustworthy.

## Out of Scope

- New features (multi-file upload, drag-drop)
- Content changes (prompt templates, mode descriptions)
- Backend/relay changes

## Risks

- **Dark mode edge cases** — Some components may look wrong in dark mode if they use hardcoded colors missed in UI-1
- **Animation performance** — Figma plugin iframe may have limited GPU acceleration. Keep animations CSS-only, avoid JS-driven.
- **Keyboard conflicts** — Figma has its own keyboard shortcuts. Plugin shortcuts must not conflict (use `Ctrl+/` prefix or only capture when input is focused).

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, dark mode toggle works and persists, animations smooth (no jank), keyboard shortcuts functional"
quality_gate_tools: ["esbuild", "manual Figma plugin test"]
```

---

## Story

**As a** designer using Figmento,
**I want** smooth animations, a dark mode toggle, and keyboard shortcuts,
**so that** the plugin feels polished and adapts to my workspace preferences.

---

## Description

### Solution

#### 1. Dark Mode Toggle

- Add a theme toggle button in the top bar (sun/moon icon) and in settings sheet
- Clicking toggles `data-theme` attribute on `<html>` between `"light"` and `"dark"`
- Persist preference via `figma.clientStorage` (sandwich message to sandbox)
- On plugin load, read saved preference and apply before first paint

#### 2. Transitions & Animations

- **Sheet open/close:** slide from right (0.25s ease)
- **Message appear:** fade-in + slide-up (0.15s ease)
- **Welcome → chat transition:** fade out welcome, messages appear
- **Dropdown open:** scale from 0.95 + fade (0.15s ease)
- **Send button:** subtle scale pulse on click (0.1s)
- **Status dot:** pulse animation for "connecting" state (reuse existing)
- **Template cards:** staggered entrance (0.05s delay per card)

#### 3. Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Enter` | Send message | Chat input focused (already exists) |
| `Shift+Enter` | New line | Chat input focused (already exists) |
| `Ctrl+N` / `Cmd+N` | New chat | Global |
| `Ctrl+,` / `Cmd+,` | Open/close settings | Global |
| `Escape` | Close settings sheet / Cancel mode flow | When sheet or flow is open |
| `Ctrl+K` / `Cmd+K` | Focus chat input | Global |

#### 4. Micro-interactions

- **Icon buttons:** `opacity: 0.7` → `1.0` on hover with `0.15s` transition
- **Send button disabled state:** `opacity: 0.3`, no pointer events
- **Template card hover:** `--bg-tertiary` background, subtle border emphasis
- **Textarea auto-grow:** smooth height transition as user types (max 120px)
- **Toast notifications:** slide-in from bottom with spring-like easing

---

## Acceptance Criteria

- [ ] **AC1:** Theme toggle (sun/moon icon) visible in top bar
- [ ] **AC2:** Clicking toggle switches between light and dark mode
- [ ] **AC3:** Theme preference persists across plugin sessions (via `figma.clientStorage`)
- [ ] **AC4:** Dark mode renders correctly for all components (chat, settings, input, dropdowns)
- [ ] **AC5:** Settings sheet opens with slide-from-right animation (0.25s)
- [ ] **AC6:** Chat messages appear with fade-in + slide-up animation
- [ ] **AC7:** Prompt template cards have staggered entrance animation
- [ ] **AC8:** `Ctrl+N` / `Cmd+N` starts a new chat
- [ ] **AC9:** `Ctrl+,` / `Cmd+,` toggles settings sheet
- [ ] **AC10:** `Escape` closes settings sheet or active mode flow
- [ ] **AC11:** `Ctrl+K` / `Cmd+K` focuses the chat input
- [ ] **AC12:** Textarea auto-grows smoothly as user types (max 120px height)
- [ ] **AC13:** All animations use CSS transitions (no JS requestAnimationFrame)
- [ ] **AC14:** `npm run build` succeeds in `figmento/`

---

## Tasks

### Phase 1: Dark Mode Toggle (AC1, AC2, AC3, AC4)

- [ ] Add theme toggle icon button in top bar (sun icon for light, moon icon for dark)
- [ ] Add theme toggle in settings sheet Appearance section
- [ ] Wire click: toggle `document.documentElement.dataset.theme` between `"light"` and `"dark"`
- [ ] On toggle: send `{ type: 'save-theme', theme }` message to sandbox
- [ ] In code.ts: receive message, call `figma.clientStorage.setAsync('theme', theme)`
- [ ] On plugin load (code.ts): read `figma.clientStorage.getAsync('theme')`, send to UI
- [ ] In UI: on `load-theme` message, set `data-theme` before any rendering
- [ ] Test all components in dark mode — fix any missed hardcoded colors

### Phase 2: Animations (AC5, AC6, AC7, AC12, AC13)

- [ ] Settings sheet: `transform: translateX(100%)` → `translateX(0)` with `transition: transform 0.25s ease`
- [ ] Sheet backdrop: `opacity: 0` → `opacity: 1` with `transition: opacity 0.25s ease`
- [ ] Chat messages: `.chat-bubble` gets `animation: messageIn 0.15s ease` on insertion
- [ ] `@keyframes messageIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`
- [ ] Template cards: each card gets `animation-delay: calc(var(--i) * 0.05s)` via inline style
- [ ] Textarea: `transition: height 0.1s ease` for auto-grow
- [ ] Dropdowns: `transform: scale(0.95)` → `scale(1)` + `opacity: 0` → `1` on open

### Phase 3: Keyboard Shortcuts (AC8, AC9, AC10, AC11)

- [ ] Add global `keydown` listener in chat.ts
- [ ] `Ctrl/Cmd + N` → call `startNewChat()` (existing function)
- [ ] `Ctrl/Cmd + ,` → toggle settings sheet open/close
- [ ] `Escape` → close settings sheet if open, or close active mode flow
- [ ] `Ctrl/Cmd + K` → `document.getElementById('chat-input').focus()`
- [ ] Prevent default browser behavior for captured shortcuts

### Phase 4: Micro-interactions (AC6)

- [ ] Icon buttons: `transition: opacity 0.15s, background 0.15s`
- [ ] Send button: `transition: transform 0.1s` + `:active { transform: scale(0.95) }`
- [ ] Template card hover: `transition: background 0.15s, border-color 0.15s`
- [ ] Toast: reuse existing `toastIn` animation, ensure it works with new tokens

### Phase 5: Build & Verify (AC14)

- [ ] Run `npm run build` in `figmento/`
- [ ] Test in Figma: toggle dark mode, verify persistence
- [ ] Test: keyboard shortcuts work
- [ ] Test: animations are smooth, no jank
- [ ] Test: all components look correct in both themes

---

## Dev Notes

- **Theme persistence** requires sandbox bridge: UI sends `save-theme` message → code.ts calls `figma.clientStorage.setAsync`. On startup, code.ts sends stored theme back to UI. This is the same pattern used for API key storage.
- **Dark mode tokens are already defined in UI-1** — this story just wires the toggle and tests.
- **Figma keyboard handling:** The plugin iframe captures keyboard events when focused. `Ctrl+N` may conflict with Figma's "New file" — test if the iframe captures it first when active. If conflict, use `Ctrl+Shift+N` as fallback.
- **Auto-grow textarea:** Set `rows="1"` and use JS to adjust `style.height` on input event: `el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'`. Wrap with `transition: height 0.1s ease` in CSS.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui.html` | MODIFY | Animation CSS, theme toggle button, micro-interaction styles |
| `figmento/src/ui/chat.ts` | MODIFY | Keyboard shortcuts, theme toggle logic, message animation classes |
| `figmento/src/code.ts` | MODIFY | Theme persistence via figma.clientStorage (save/load messages) |

---

## Definition of Done

- [ ] Dark mode toggle works and persists
- [ ] Animations smooth on all transitions
- [ ] Keyboard shortcuts functional
- [ ] Both themes look correct
- [ ] Plugin builds

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @sm (River) | Initial draft |
| 2026-03-17 | @ux-design-expert (Uma) | Animation specs and keyboard shortcut map approved |
| 2026-03-17 | @po (Pax) | Validation GO (10/10). Status Draft → Ready |
