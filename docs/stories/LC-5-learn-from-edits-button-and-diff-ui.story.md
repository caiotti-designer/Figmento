# Story LC-5: "Learn from My Edits" Button & Diff Summary UI

**Status:** Ready for Review
**Priority:** High
**Complexity:** M (Medium) — UI button + diff summary rendering + confirm/dismiss flow + postMessage integration
**Epic:** LC — Learning & Corrections (Phase 4a)
**PRD:** PRD-004 (Learn from User Corrections)
**Depends on:** LC-4 (compare-snapshot + save-corrections handlers must exist)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + manual end-to-end test: AI creates design → user edits → clicks button → sees diff → confirms → corrections saved
```

---

## Story

**As a** designer using Figmento,
**I want** a "Learn from my edits" button in the plugin chat area that shows me what changes were detected and lets me confirm or dismiss them,
**so that** I can explicitly teach the AI my preferences.

---

## Description

This story adds the user-facing layer of Phase 4a:

1. **Button** — "Learn from my edits" in the `chat-actions` div (next to Send and New Chat buttons). Disabled when no snapshots exist. Enabled when at least one active snapshot is stored.

2. **Diff summary** — When clicked, the button sends `compare-snapshot` to the sandbox. The response is rendered as a collapsible panel in the chat area showing each detected change with before→after values, category icons, and confirm/dismiss toggles per entry.

3. **Confirm flow** — User reviews changes. Each change has a checkbox (default: checked). User clicks "Save" to persist confirmed corrections via `save-corrections`. Dismissed changes are dropped.

4. **State management** — After saving, the button returns to disabled state (snapshots consumed). A success toast confirms: "Learned N corrections."

### UI Design

```
┌─────────────────────────────────────────┐
│ Chat messages area                      │
│ ...                                     │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 Detected 4 changes              │ │
│ │                                     │ │
│ │ ☑ Typography: Hero Title            │ │
│ │   fontSize: 64px → 96px            │ │
│ │                                     │ │
│ │ ☑ Shape: CTA Button                 │ │
│ │   cornerRadius: 8px → 16px         │ │
│ │                                     │ │
│ │ ☑ Color: Background Overlay         │ │
│ │   fill: #1E1E1E → #0A0A0F          │ │
│ │                                     │ │
│ │ ☐ Spacing: Content Frame            │ │
│ │   paddingTop: 48px → 64px          │ │
│ │                                     │ │
│ │ [Save 3 corrections]  [Dismiss all] │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ [textarea]  [Send] [+] [📝 Learn]      │
└─────────────────────────────────────────┘
```

---

## Acceptance Criteria

- [ ] **AC1:** "Learn from my edits" button visible in `chat-actions` div, next to Send and New Chat buttons
- [ ] **AC2:** Button disabled by default. Enabled only when `get-snapshot-status` returns ≥1 active snapshot
- [ ] **AC3:** Button polls snapshot status on: (a) plugin load, (b) after `snapshot-taken` message received, (c) every 30 seconds while chat tab is active
- [ ] **AC4:** On click: sends `compare-snapshot` (no frameId → compare all). Shows loading spinner while waiting
- [ ] **AC5:** If 0 corrections detected: shows inline message "No changes detected since last AI design" and re-disables button
- [ ] **AC6:** If ≥1 corrections: renders diff summary panel in chat area (inserted before chat input, after last message)
- [ ] **AC7:** Each correction entry shows: category icon (🔤 typography, 🎨 color, 📐 spacing, ⬜ shape), node name, property name, before→after values, checkbox (default: checked)
- [ ] **AC8:** Color corrections show color swatches (small colored squares) next to hex values
- [ ] **AC9:** "Save N corrections" button text updates dynamically as user toggles checkboxes
- [ ] **AC10:** "Save" sends only checked corrections via `save-corrections` to sandbox
- [ ] **AC11:** "Dismiss all" closes the diff panel without saving anything
- [ ] **AC12:** After successful save: panel closes, success toast "Learned N corrections" appears as a chat bubble from system, button returns to disabled (snapshots consumed)
- [ ] **AC13:** Button styling matches existing chat UI: `var(--color-bg-surface)` background, `var(--color-text-secondary)` text when disabled, `var(--color-accent)` highlight when enabled
- [ ] **AC14:** Plugin build passes (`cd figmento && npm run build`)

---

## Tasks

### Phase 1 — Button

- [x] **Task 1:** Add button HTML to `ui.html` inside the `chat-actions` div (after line 5125, alongside Send and New Chat):
  ```html
  <button id="chat-learn" class="chat-learn-btn" disabled title="Learn from my edits">📝</button>
  ```

- [x] **Task 2:** Add CSS for `.chat-learn-btn` in `ui.html` styles section (~line 4890). Match `.chat-new-btn` style with accent color when enabled.

- [x] **Task 3:** In `chat.ts` `initChat()` function (line 257), add:
  - Event listener for `#chat-learn` click → `handleLearnFromEdits()`
  - Snapshot status polling: `updateLearnButtonState()` called on init, after `snapshot-taken` events, and every 30s via `setInterval`

### Phase 2 — Diff Summary Panel

- [x] **Task 4:** Create `figmento/src/ui/diff-panel.ts` with:
  - `renderDiffPanel(corrections: CorrectionEntry[]): HTMLElement` — builds the diff summary DOM
  - `formatValue(property: string, value: unknown): string` — human-readable value formatting (px for sizes, hex for colors, etc.)
  - `getCategoryIcon(category: string): string` — returns emoji for category
  - `renderColorSwatch(hex: string): HTMLElement` — small 12×12 colored square

- [x] **Task 5:** Implement `handleLearnFromEdits()` in `chat.ts`:
  1. Show loading state on button
  2. Send `compare-snapshot` via `postToSandbox({ type: 'compare-snapshot' })`
  3. Listen for `snapshot-compared` response
  4. If 0 corrections → show "No changes detected" message
  5. If ≥1 → call `renderDiffPanel(corrections)` and insert into chat area

### Phase 3 — Confirm/Save Flow

- [x] **Task 6:** Add save/dismiss handlers in `diff-panel.ts`:
  - "Save" button: collect checked entries, send `save-corrections` via postToSandbox
  - "Dismiss all" button: remove panel from DOM, no save
  - Listen for `corrections-saved` response → show success bubble, close panel, refresh button state

### Phase 4 — Message Listeners

- [x] **Task 7:** Add message listeners in `chat.ts` for sandbox responses:
  - `snapshot-taken` → call `updateLearnButtonState()`
  - `snapshot-compared` → route to `handleLearnFromEdits` callback
  - `corrections-saved` → show success toast, close panel
  - `snapshots-cleared` → disable learn button
  - `snapshot-status` → update button enabled/disabled

### Phase 5 — Build & Integration Test

- [x] **Task 8:** Verify `cd figmento && npm run build` passes clean.

---

## Dev Notes

- **Button placement:** The `chat-actions` div (ui.html line 5123–5126) contains Send and New Chat. Add the Learn button as a third sibling. Use a compact icon-only button (📝) to avoid crowding.

- **Polling frequency:** 30-second interval for snapshot status is a compromise. More frequent = more clientStorage reads. Less frequent = stale button state. The `snapshot-taken` event provides instant updates for the common case (AI just created something).

- **Diff panel insertion point:** Insert the panel as a child of `#chat-messages` div, at the bottom (before `#chat-loading`). This makes it scroll with the chat history.

- **`postToSandbox` function** is available in chat.ts as a simple wrapper around `parent.postMessage({ pluginMessage: msg }, '*')`. It's already used for `execute-command`, `save-memory`, etc.

- **Message listener registration:** The UI already has a central message handler in `ui.ts` or `chat.ts` that routes `figma.ui.onmessage` responses. Add new cases there for `snapshot-compared`, `corrections-saved`, `snapshot-status`, `snapshots-cleared`.

- **CSS custom properties:** Use existing design tokens from ui.html: `--color-bg-surface`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-accent`, `--radius-sm`, `--space-sm`, `--space-md`.

- **Checkbox state:** Use native HTML checkboxes styled with CSS. Track checked state in a local array. Update "Save N corrections" count on change events.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui.html` | MODIFY | Add learn button HTML + CSS styles |
| `figmento/src/ui/chat.ts` | MODIFY | Add click handler, snapshot polling, message listeners |
| `figmento/src/ui/diff-panel.ts` | CREATE | Diff summary panel rendering + confirm/dismiss flow |

---

## Definition of Done

- [x] End-to-end flow works: AI creates design → user edits → clicks "Learn from my edits" → sees diff panel with correct changes → confirms → corrections saved → success toast
- [x] Button disabled when no snapshots exist
- [x] Button enabled after AI creates a design
- [x] "No changes detected" shown when frame is unmodified
- [x] User can uncheck individual corrections before saving
- [x] "Dismiss all" closes panel without saving
- [x] Build passes clean
- [x] No existing functionality affected (chat, modes, bridge, settings all work)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | @sm (River) | Story drafted from PRD-004 Phase 4a. UI layer — button, diff panel, confirm flow. |
| 2026-03-12 | @po (Pax) | Validated: 8/10. No blocking issues. Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Implemented: button HTML+CSS in ui.html, diff-panel.ts created, handleLearnFromEdits + updateLearnButtonState + setLearnButtonEnabled + handleSnapshotCompared + handleCorrectionsSaved added to chat.ts, message listeners wired in initChat(). Build clean, 371 tests pass. Status → Ready for Review. |
