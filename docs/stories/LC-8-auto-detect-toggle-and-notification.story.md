# Story LC-8: Auto-Detect Toggle & "Noticed N Edits" Notification

**Status:** Done
**Priority:** High
**Complexity:** M (Medium) — Settings UI toggle + pre-turn hook in chat.ts + subtle notification component; 3 files modified
**Epic:** LC — Learning & Corrections (Phase 4b)
**PRD:** PRD-004 (Learn from User Corrections)
**Depends on:** LC-7 (get-learning-config + save-learning-config handlers must exist), LC-5 (compare-snapshot + snapshot-compared pipeline established)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + manual test: enable toggle → create design → edit → send new chat message → verify "Noticed N edits" notification appears
```

---

## Story

**As a** power user,
**I want** an opt-in "Auto-detect corrections" toggle in Settings,
**so that** the plugin silently compares my edits at the start of each AI turn and notifies me when it detected changes — without requiring me to manually click "Learn from my edits" every time.

---

## Description

This story delivers the full opt-in auto-detection flow for Phase 4b. Three areas of change:

### 1. Settings Toggle (ui.html + chat-settings.ts)

A new "Auto-detect corrections" toggle in the Settings tab, in a new "Learning" section. Default: **OFF** (C5 constraint — must never silently learn). When the user saves Settings, the toggle state is persisted via `save-learning-config` to `figmento-learning-config` clientStorage.

```
┌─────────────────────────────────────────────────────┐
│ LEARNING                                            │
│                                                     │
│ Auto-detect corrections                      [OFF]  │
│ Automatically notice your edits before each         │
│ AI turn. You'll see a summary — nothing is          │
│ saved until you confirm.                            │
└─────────────────────────────────────────────────────┘
```

### 2. Pre-Turn Hook (chat.ts)

Before calling `runRelayTurn()` or `runDirectLoop()`, if `autoDetect` is `true` in the loaded config, send `compare-snapshot` to the sandbox with `source: 'auto'`. This is fire-and-forget relative to the turn — the notification appears separately once the response arrives.

The `compare-snapshot` message already exists from LC-4. The `source: 'auto'` field is a new optional property that the sandbox echoes back in `snapshot-compared` so the UI can distinguish auto-detect results from explicit button clicks.

### 3. "Noticed N Edits" Notification (chat.ts)

When a `snapshot-compared` message arrives with `source: 'auto'` and `corrections.length > 0`, insert a subtle collapsible notification into the chat messages area **before** the user's current message bubble:

```
┌──────────────────────────────────────────────────┐
│ 👀 Noticed 3 edits since last design  [▾ Details] │
└──────────────────────────────────────────────────┘
```

On expand:
```
┌──────────────────────────────────────────────────┐
│ 👀 Noticed 3 edits since last design  [▴ Hide]    │
│                                                   │
│  🔤 Hero Title — fontSize: 64px → 96px           │
│  ⬜ CTA Button — cornerRadius: 8px → 16px        │
│  🎨 Overlay — fill: #1E1E1E → #0A0A0F            │
│                                                   │
│  [Save as corrections]  [Dismiss]                 │
└──────────────────────────────────────────────────┘
```

- **"Save as corrections"**: sends `save-corrections` with the detected entries (marks `confirmed: true`). Then sends `aggregate-preferences` to update the preference store. Success shows inline "Saved N corrections ✓" replacing the action buttons.
- **"Dismiss"**: removes the notification. The corrections are NOT saved.

If `corrections.length === 0` on auto-detect: no notification shown (silent pass). This differs from the explicit trigger (LC-5) which shows "No changes detected."

---

## Acceptance Criteria

- [ ] **AC1:** "Auto-detect corrections" toggle visible in Settings tab under a "Learning" section heading
- [ ] **AC2:** Toggle default state is OFF (not checked) when `figmento-learning-config` is unset
- [ ] **AC3:** Toggle state is persisted when Settings are saved — sends `save-learning-config` to sandbox
- [ ] **AC4:** On plugin load, `get-learning-config` is sent to sandbox; response populates the toggle UI state
- [ ] **AC5:** When auto-detect is ON, a `compare-snapshot` message with `{ source: 'auto' }` is sent before each `runRelayTurn()` or `runDirectLoop()` call
- [ ] **AC6:** The pre-turn `compare-snapshot` does NOT block or delay the AI turn — it fires before the turn starts and the result arrives asynchronously
- [ ] **AC7:** `snapshot-compared` response with `source: 'auto'` and `corrections.length > 0` shows the "Noticed N edits" notification in the chat area
- [ ] **AC8:** `snapshot-compared` with `source: 'auto'` and `corrections.length === 0` shows nothing (silent pass)
- [ ] **AC9:** `snapshot-compared` with `source: 'explicit'` (from the "Learn from my edits" button) continues to use the LC-5 diff panel flow — not the notification flow
- [ ] **AC10:** "Noticed N edits" notification is collapsible — clicking "Details" expands to show the correction list; clicking "Hide" collapses
- [ ] **AC11:** Notification correction list shows: category icon, node name, property, before→after values (same format as diff panel from LC-5)
- [ ] **AC12:** "Save as corrections" button in notification sends `save-corrections` (marks confirmed=true), then immediately sends `aggregate-preferences`
- [ ] **AC13:** After save: notification collapses to "Saved N corrections ✓", then auto-removes from DOM after 3 seconds
- [ ] **AC14:** "Dismiss" removes the notification without saving
- [ ] **AC15:** If auto-detect is OFF, no `compare-snapshot` is sent before turns — zero performance overhead
- [ ] **AC16:** Plugin build passes (`cd figmento && npm run build`)

---

## Tasks

### Phase 1 — Settings Toggle (ui.html)

- [x] **Task 1:** Add "Learning" section to the Settings tab in `ui.html`. Place after the "Relay" section. Add the toggle HTML:
  ```html
  <div class="settings-section">
    <div class="settings-section-title">Learning</div>
    <div class="settings-field">
      <label class="settings-toggle-label" for="settings-auto-detect">
        <span>Auto-detect corrections</span>
        <input type="checkbox" id="settings-auto-detect" />
      </label>
      <div class="settings-field-hint">
        Automatically notice your edits before each AI turn. Nothing is saved until you confirm.
      </div>
    </div>
  </div>
  ```

- [x] **Task 2:** Add CSS for `.settings-toggle-label` (flex row, space-between) matching the existing relay toggle row style.

### Phase 2 — Settings Module (chat-settings.ts)

- [x] **Task 3:** In `initChatSettings()`: send `get-learning-config` to sandbox on init. Register a `window.addEventListener('message')` handler for `learning-config-loaded` that sets the `#settings-auto-detect` checkbox state.

- [x] **Task 4:** In `saveChatSettings()`: read `#settings-auto-detect` checked state and include in the `save-learning-config` message:
  ```typescript
  const autoDetect = (document.getElementById('settings-auto-detect') as HTMLInputElement)?.checked ?? false;
  postToSandbox({ type: 'save-learning-config', config: { enabled: true, autoDetect, confidenceThreshold: 3 } });
  ```

- [x] **Task 5:** Export `loadLearningConfig(config: LearningConfig): void` from `chat-settings.ts` that **only updates the Settings tab checkbox state** (`#settings-auto-detect`). This function is called when `learning-config-loaded` arrives in the Settings context. The `autoDetectEnabled` flag in `chat.ts` is updated independently via `chat.ts`'s own `learning-config-loaded` listener (Tasks 6/7) — do NOT create a cross-module call from `chat-settings.ts` into `chat.ts`.

### Phase 3 — In-Memory Config State (chat.ts)

- [x] **Task 6:** Add module-level state in `chat.ts`:
  ```typescript
  let autoDetectEnabled = false;  // Updated when learning-config-loaded arrives
  ```

- [x] **Task 7:** Add message listener for `learning-config-loaded` in `initChat()`'s `window.addEventListener('message')` block:
  ```typescript
  case 'learning-config-loaded':
    autoDetectEnabled = msg.config?.autoDetect === true;
    break;
  ```

### Phase 4 — Pre-Turn Hook (chat.ts)

- [x] **Task 8:** Modify `sendMessage()` to fire the auto-detect snapshot comparison before dispatching the AI turn. Add immediately before the `try { if (useClaudeCode)...` block:
  ```typescript
  // Auto-detect: compare snapshots before turn if enabled
  if (autoDetectEnabled) {
    postToSandbox({ type: 'compare-snapshot', source: 'auto' });
  }
  ```

- [x] **Task 9:** Update the `sandbox code.ts` `compare-snapshot` handler (added in LC-4) to echo `source` back in its response:
  ```typescript
  figma.ui.postMessage({
    type: 'snapshot-compared',
    corrections: ...,
    frameCount: ...,
    source: (msg as any).source || 'explicit',  // echo source
  });
  ```

### Phase 5 — "Noticed N Edits" Notification (chat.ts)

- [x] **Task 10:** Add `handleAutoDetectCompared(msg)` function in `chat.ts`:
  - If `msg.corrections.length === 0`: return early (silent)
  - Build and insert a `.auto-detect-notice` element into `#chat-messages`
  - Include: summary text, "Details" toggle button, hidden correction list, "Save as corrections" and "Dismiss" action buttons
  - "Save as corrections": send `save-corrections` + `aggregate-preferences`, then show "Saved N corrections ✓", remove notice after 3s
  - "Dismiss": remove notice from DOM

- [x] **Task 11:** Update the `snapshot-compared` case in `initChat()`'s message listener to route by source:
  ```typescript
  case 'snapshot-compared':
    if (msg.source === 'auto') {
      handleAutoDetectCompared(msg);
    } else {
      handleSnapshotCompared(msg);  // existing LC-5 explicit flow
    }
    break;
  ```

### Phase 6 — Styles (ui.html)

- [x] **Task 12:** Add CSS for `.auto-detect-notice`, `.auto-detect-notice-header`, `.auto-detect-notice-body`, `.auto-detect-notice-actions`:
  - Subtle appearance: `var(--color-bg-surface)` background, `var(--color-border)` border, `var(--radius-sm)` corners
  - Different from the diff panel — this is informational, not a blocking action
  - `var(--color-text-secondary)` for the header text (lower visual weight than regular chat bubbles)

### Phase 7 — Build Verification

- [x] **Task 13:** Verify `cd figmento && npm run build` passes clean.

---

## Dev Notes

- **Notification insertion point:** `sendMessage()` adds the user bubble to `#chat-messages` synchronously. The `compare-snapshot { source: 'auto' }` fires before the AI turn but the `snapshot-compared` response arrives asynchronously — after the user bubble is already in the DOM. When `handleAutoDetectCompared` fires, insert the notice **before** the last child of `#chat-messages` (the user bubble), so it appears above the user's message in visual order:
  ```typescript
  const messagesEl = $('chat-messages');
  const lastChild = messagesEl.lastElementChild;
  if (lastChild) {
    messagesEl.insertBefore(notice, lastChild);
  } else {
    messagesEl.appendChild(notice);
  }
  ```

- **Auto-detect is fire-and-forget from the turn's perspective.** The `compare-snapshot` is sent, but `sendMessage()` does NOT await its response before starting the AI turn. Both happen concurrently. The notification arrives whenever the sandbox responds (typically <100ms), well before the AI response.

- **"Save as corrections" must also trigger aggregation.** After `save-corrections` succeeds, the notice should immediately also send `aggregate-preferences`. This way, preferences are updated in real-time after each auto-detect save. No await needed — fire both in sequence.

- **`source: 'explicit'` is the default** if `source` is not provided in the `compare-snapshot` message. This preserves backward compatibility with the LC-5 explicit trigger which sends `{ type: 'compare-snapshot' }` without a `source` field.

- **Only `autoDetectEnabled` state is needed in `chat.ts`.** The full `LearningConfig` object doesn't need to be stored — only the `autoDetect` boolean is used in `sendMessage()`. `confidenceThreshold` is used only by the aggregator in `code.ts`.

- **Settings save flow:** The user must click "Save" in Settings to persist the auto-detect toggle. The toggle does NOT auto-save on change (consistent with how relay toggle, API keys, and other settings work in the existing `saveChatSettings()` pattern).

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui.html` | MODIFY | Add Learning section with auto-detect toggle HTML + CSS for toggle label + `.auto-detect-notice` styles |
| `figmento/src/ui/chat-settings.ts` | MODIFY | Load/save learning config, export `loadLearningConfig()` |
| `figmento/src/ui/chat.ts` | MODIFY | `autoDetectEnabled` state, `learning-config-loaded` listener, pre-turn hook, `handleAutoDetectCompared()`, route `snapshot-compared` by source |
| `figmento/src/code.ts` | MODIFY | Echo `source` field back in `snapshot-compared` response from `compare-snapshot` handler (1-line change) |

---

## Definition of Done

- [x] Toggle visible in Settings, default OFF
- [x] Toggle state persists across plugin sessions
- [x] Auto-detect ON: `compare-snapshot { source: 'auto' }` fires before each AI turn
- [x] Auto-detect OFF: zero overhead — no snapshot message sent
- [x] 0 corrections: silent (no notification)
- [x] ≥1 corrections: "Noticed N edits" notification with expandable list
- [x] "Save as corrections" works and triggers aggregation
- [x] "Dismiss" removes notification without saving
- [x] Explicit "Learn from my edits" button flow (LC-5) unaffected
- [x] Build passes clean
- [x] No regression in chat, relay, bridge, or existing settings

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | @sm (River) | Story drafted from PRD-004 Phase 4b. UI layer — auto-detect toggle, pre-turn hook, "Noticed N edits" notification. Depends on LC-6 types + LC-7 sandbox handlers. |
| 2026-03-13 | @po (Pax) | Validated: 8/10. Fixed: (1) removed contradictory Dev Note paragraph re. insertion point — only insertBefore guidance retained; (2) Task 5 clarified — loadLearningConfig() updates checkbox only, no cross-module call into chat.ts. Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Implemented: Learning section + settings-auto-detect toggle added to ui.html. CSS for .auto-detect-notice + children added. chat-settings.ts: loadLearningConfig() exported, get-learning-config sent on init, save-learning-config sent on save. chat.ts: autoDetectEnabled state, learning-config-loaded listener, pre-turn hook in sendMessage(), handleAutoDetectCompared(), snapshot-compared routed by source. code.ts: source field echoed in all compare-snapshot responses. Build clean, 396 tests pass. Status → Ready for Review. |
| 2026-04-12 | @qa (Quinn) | **QA Gate: PASS.** 15/15 ACs verified. Auto-detect toggle OFF by default (C5 constraint satisfied). Pre-turn hook fire-and-forget. Source field routing (auto vs explicit) correctly implemented. Status: Ready for Review → Done. |
