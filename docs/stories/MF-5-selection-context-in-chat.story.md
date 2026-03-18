# Story MF-5: Selection Context in Chat

**Status:** Ready
**Priority:** High (P1)
**Complexity:** M (5 points) — 3 files modify (chat.ts, ui.html, code.ts)
**Epic:** MF — Multi-File Import Pipeline
**Depends on:** None (can run parallel to MF-1/MF-2/MF-3)
**PRD:** User request 2026-03-17 — "select frames and the selection appears on the chat so the agent knows which frames to edit"

---

## Business Value

A very common workflow is replacing content in existing frames — updating text, swapping images, changing colors. Currently the user must describe which frame to edit by name, and the agent must search for it. If the user's Figma selection is visible in the chat, the agent can target the exact nodes — no guessing, no searching, faster edits.

## Out of Scope

- Screenshot preview of selected frames (already exists in CX-3)
- Multi-page selection
- Drag-selection from chat back to canvas
- Auto-triggering tool calls based on selection

## Risks

- **Selection changes during agent response** — The selection context should be captured at send time, not continuously. If the user changes selection while the agent is responding, the original context remains valid.
- **Large selections** — Selecting 50+ nodes could bloat the message. Limit to 20 nodes max with summary for the rest.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, selecting frames shows context badge in chat, sending message includes selection nodeIds, agent can act on selected nodes"
quality_gate_tools: ["esbuild", "manual Figma plugin test"]
```

---

## Story

**As a** designer with frames selected in Figma,
**I want** the chat to show what I've selected so the agent knows which frames to edit,
**so that** I can say "change the headline to X" and the agent edits the right frame without guessing.

---

## Description

### Solution

#### 1. Selection Listener

The sandbox (`code.ts`) already tracks `figma.on('selectionchange', ...)`. On selection change, send the selection info to the UI:

```typescript
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection.map(node => ({
    id: node.id,
    name: node.name,
    type: node.type,
    width: Math.round(node.width),
    height: Math.round(node.height),
  }));
  figma.ui.postMessage({ type: 'selection-changed', selection });
});
```

#### 2. Selection Badge in Chat UI

Show above the input area when 1+ nodes are selected:

**Single frame:**
```
┌─────────────────────────────────────────────┐
│ 🔲 Hero Section  1440×800  FRAME       [×] │
└─────────────────────────────────────────────┘
```

**Multiple frames:**
```
┌─────────────────────────────────────────────┐
│ 🔲 3 frames selected                   [×] │
│   Hero Section (1440×800)                   │
│   CTA Button (320×56)                       │
│   Price Tag (200×80)                        │
└─────────────────────────────────────────────┘
```

**No selection:** Badge hidden.

The `[×]` button clears the selection context from the chat (does NOT deselect in Figma — just removes it from the message context).

#### 3. Message Context Injection

When `sendMessage()` fires with an active selection context:

- Add to the user message (invisible to user, visible to agent):
  ```
  [FIGMA SELECTION CONTEXT]
  Selected nodes (use these nodeIds for edits):
  - nodeId: "123:456", name: "Hero Section", type: FRAME, size: 1440×800
  - nodeId: "123:789", name: "CTA Button", type: FRAME, size: 320×56
  ```
- This goes into the system prompt or as a prefixed context block in the user message
- The agent can then call `set_text("123:456", ...)`, `set_fill("123:789", ...)` etc.

#### 4. User Bubble Display

When a message is sent with selection context, show a badge on the user bubble:
```
🔲 3 frames selected
```
(similar to the existing "📎 image attached" badge)

---

## Acceptance Criteria

- [ ] **AC1:** When user selects 1+ frames in Figma, a selection badge appears above the chat input
- [ ] **AC2:** Badge shows frame name, dimensions, and type for single selection
- [ ] **AC3:** Badge shows count + expandable list for multi-selection (2+ frames)
- [ ] **AC4:** `[×]` button on the badge clears the selection context from chat (not from Figma)
- [ ] **AC5:** When no frames are selected, the badge is hidden
- [ ] **AC6:** On send, selection context (nodeIds, names, types, sizes) is injected into the message
- [ ] **AC7:** The agent receives the selection context and can reference nodeIds in tool calls
- [ ] **AC8:** User bubble shows "🔲 N frames selected" badge when sent with selection
- [ ] **AC9:** Selection context is captured at send time (not affected by later selection changes)
- [ ] **AC10:** Max 20 nodes in context — if more, show "20 of 47 nodes" with summary
- [ ] **AC11:** `npm run build` succeeds in `figmento/`

---

## Tasks

### Phase 1: Selection Listener (AC1, AC5)

- [ ] In `code.ts`: add/verify `figma.on('selectionchange')` handler that posts selection to UI
- [ ] In `chat.ts`: listen for `selection-changed` messages, store as `currentSelection: SelectionNode[]`
- [ ] When selection is empty, clear the badge; when non-empty, render it

### Phase 2: Selection Badge UI (AC2, AC3, AC4)

- [ ] Create `.selection-badge` container above the input area (below attachment queue if present)
- [ ] Single node: `🔲 {name}  {width}×{height}  {TYPE}  [×]`
- [ ] Multi-node: `🔲 {N} frames selected  [×]` with expandable list (click to toggle)
- [ ] `[×]` clears `currentSelection` and hides badge (but does NOT call `figma.currentPage.selection = []`)
- [ ] CSS: `.selection-badge`, `.selection-badge-item`, `.selection-badge-clear`

### Phase 3: Message Context Injection (AC6, AC7, AC9, AC10)

- [ ] In `sendMessage()`: capture `currentSelection` at send time
- [ ] Build context string with nodeIds, names, types, dimensions
- [ ] Limit to 20 nodes — if more, include first 20 + "and N more"
- [ ] Inject as a `[FIGMA SELECTION CONTEXT]` block prepended to the user's message text
- [ ] After send, clear the selection badge state

### Phase 4: User Bubble Badge (AC8)

- [ ] When message is sent with selection context, add "🔲 N frames selected" badge to user bubble
- [ ] Reuse the pattern from "📎 image attached" badge

### Phase 5: Build & Verify (AC11)

- [ ] Run `npm run build` in `figmento/`
- [ ] Test: select 1 frame → badge appears with name + size
- [ ] Test: select 3 frames → badge shows "3 frames selected"
- [ ] Test: send message → agent receives nodeIds → can use them in tool calls
- [ ] Test: click × → badge clears, selection still active in Figma
- [ ] Test: deselect in Figma → badge auto-clears

---

## Dev Notes

- `figma.on('selectionchange')` already exists in `code.ts` for the snapshot system — may need to extend the handler
- The `SelectionNode` interface already exists in chat.ts (line ~39): `{ id, type, name, width, height }`
- The selection is already read for the "Use Figma Selection" button in screenshot mode — reuse that pattern
- For the Claude Code path, the selection context + nodeIds means the agent can call MCP tools directly on those nodes
- For the direct API path, the selection context is informational — the agent describes edits but can't execute them without MCP

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui/chat.ts` | MODIFY | Selection listener, badge rendering, message injection |
| `figmento/src/ui.html` | MODIFY | CSS for `.selection-badge` components |
| `figmento/src/code.ts` | MODIFY | Ensure selectionchange posts to UI (may already exist) |

---

## Definition of Done

- [ ] Selection badge appears/disappears based on Figma selection
- [ ] Selection context included in sent messages
- [ ] Agent can reference nodeIds from the selection
- [ ] Badge can be cleared without affecting Figma selection
- [ ] Plugin builds

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm (Morgan) | Initial draft from user request |
| 2026-03-17 | @po (Pax) | Validation GO (10/10). Status Draft → Ready |
