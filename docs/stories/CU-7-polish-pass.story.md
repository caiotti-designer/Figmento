# CU-7: Polish Pass & Keyboard Shortcuts

**Epic:** CU — Chat-First Tool Unification
**Status:** InProgress
**Sprint:** 3
**Effort:** S (Small)
**Owner:** @dev
**Dependencies:** CU-6 (legacy removal complete)

---

## Description

Final polish sprint for the unified chat interface. Add keyboard shortcuts for power users, refine animations, implement selection-aware prompt suggestions, and ensure the entire flow feels cohesive after the legacy removal.

## Acceptance Criteria

- [x] **AC1:** Keyboard shortcuts implemented (must not conflict with Figma host shortcuts — test in plugin iframe context):
  - `Cmd/Ctrl+K` — focus chat input (already exists, verify)
  - `Cmd/Ctrl+,` — toggle settings drawer
  - `Cmd/Ctrl+Shift+S` — open Screenshot quick action (verify no Figma conflict — Figma uses Cmd+Shift+S for "Save As" but plugin iframe may not intercept it)
  - `Cmd/Ctrl+Shift+A` — open Ad Analyzer quick action
  - `Escape` — close active quick action card / settings drawer / dropdown
  - **Fallback:** If Cmd+Shift+S/A conflict with Figma, use `Cmd/Ctrl+Alt+S` / `Cmd/Ctrl+Alt+A` instead
- [x] **AC2:** Quick action cards have polished enter/exit animations (slide-up 150ms, fade-out 100ms)
- [x] **AC3:** Settings drawer has slide-in/slide-out with backdrop fade
- [x] **AC4:** Selection-aware suggestions: when user selects a frame in Figma, a subtle hint appears below the input suggesting relevant actions (e.g., "Selected 'Hero Section' — try: 'redesign this frame' or 'fill template placeholders'")
- [x] **AC5:** Empty state (no messages, no selection) shows prompt template cards with smooth entrance animation
- [x] **AC6:** Chat input placeholder text rotates through helpful suggestions every 5s: "Describe a design...", "Drop a screenshot...", "Ask about your selection..."
- [x] **AC7:** All interactive elements have proper focus states and keyboard navigation (tab order)
- [x] **AC8:** Plugin build size is smaller than pre-CU baseline (verify with `npm run build` output)

## Risks

| Risk | Mitigation |
|------|-----------|
| Keyboard shortcuts conflict with Figma host app | AC1 includes fallback shortcuts (Cmd+Alt+S/A). Test in actual Figma plugin iframe — iframe may not capture all host shortcuts |
| Rotating placeholder text (AC6) is distracting during active typing | Only rotate when input is empty AND unfocused. Stop rotation on focus |
| Selection-aware suggestions (AC4) fire too frequently on rapid selection changes | Debounce selection change handler (300ms) before showing suggestion hint |

## Scope

**IN:**
- Keyboard shortcuts
- Animation refinement
- Selection-aware suggestions
- Input placeholder rotation
- Accessibility (focus states, tab order)
- Build size verification

**OUT:**
- New features
- API changes
- Backend modifications

## File List

| File | Action | Description |
|------|--------|-------------|
| `figmento/src/ui/chat.ts` | Modify | Shortcuts, suggestions, placeholder rotation |
| `figmento/src/ui.html` | Modify | Animation CSS refinement, focus states |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm | Story created |
| 2026-03-17 | @po | Validation: Added Risks section, shortcut conflict fallbacks in AC1, debounce note |
