# Story IG-2: Chat Mode Selection Snapshot

**Status:** Ready for Review
**Priority:** Medium (P2)
**Complexity:** S (2 points) — 3 files, no new APIs, pure plumbing + context injection
**Epic:** IG — Image Generation Pipeline
**Depends on:** IG-1
**PRD:** @architect + @pm design session 2026-03-14

---

## Business Value

In chat mode, the user selects a frame in Figma and types their request. Currently, the agent has no idea what's selected — it either creates a redundant new frame or calls `get_selection` as an explicit tool step. This story makes selection **invisible infrastructure**: the plugin automatically snapshots the current selection on every Send and passes it to the relay, where it becomes context for the AI. The user just selects and types. The agent just works.

---

## Out of Scope

- MCP Claude Code path — already handled in IG-1 via `resolveFrame` calling `get_selection` tool directly
- Changes to `generate_design_image` tool logic (IG-1 is complete)
- Any UI changes to the chat panel (no new buttons or indicators)
- Selection tracking/watching between messages (snapshot on Send only)

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `get-selection-snapshot` sandbox round-trip adds latency to every Send | Low — Figma selection read is synchronous in sandbox, postMessage is near-instant | 500ms timeout in UI; if no response, send without selection (graceful degradation) |
| Selected node is deleted between snapshot and tool call | Very low | `generate_design_image` already handles missing frameId via fallback logic |
| `figma.currentPage.selection` returns nodes without `width`/`height` (e.g. vectors) | Low | Guard with `'width' in node` check; only serialize nodes with valid geometry |

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin + figmento-ws-relay) + relay turn body includes currentSelection when a frame is selected + chat engine includes selection context in system prompt
```

---

## Story

**As a** user in Figmento chat mode,
**I want** the agent to automatically know what frame I have selected in Figma when I send a message,
**so that** I never need to say "use the selected frame" or wait for a get_selection tool call to resolve context.

---

## Description

### Problem

In chat mode, the user selects a frame in Figma and types a request like "add a coffee shop background to this". The agent:

1. Has no idea what's selected
2. Either creates a new frame (wrong) or calls `get_selection` as an explicit tool step (slow, uses an iteration)

The `generate_design_image` tool in IG-1 already handles this via `resolveFrame` → `get_selection` internally, but that still costs one WS round-trip during the tool call itself.

### Solution

Snapshot the selection on every Send — zero tool calls, zero overhead:

```
User selects frame → types message → hits Send
    ↓
UI requests selection snapshot from sandbox (postMessage)
    ↓
Sandbox reads figma.currentPage.selection → posts back { id, type, name, width, height }[]
    ↓
runRelayTurn() includes currentSelection in POST body
    ↓
Relay chat engine injects selection context into system prompt:
  "Currently selected in Figma: [Frame name] (id: abc123, 1080×1350px)"
    ↓
AI calls generate_design_image with frameId: "abc123" — no get_selection needed
```

---

### Part 1 — Plugin UI (`figmento/src/ui/chat.ts`)

In `runRelayTurn()`, before building the body, request the selection snapshot from the sandbox:

```typescript
async function getSelectionSnapshot(): Promise<SelectionNode[]> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve([]), 500);
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === 'selection-snapshot') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve((msg.selection as SelectionNode[]) || []);
      }
    };
    window.addEventListener('message', handler);
    postToSandbox({ type: 'get-selection-snapshot' });
  });
}
```

Add `SelectionNode` type:
```typescript
interface SelectionNode {
  id: string;
  type: string;
  name: string;
  width: number;
  height: number;
}
```

In `runRelayTurn()`, after `learnedPreferences = await loadPreferencesFromSandbox()`:
```typescript
const selectionSnapshot = await getSelectionSnapshot();
```

Add to the body object:
```typescript
...(selectionSnapshot.length > 0 && { currentSelection: selectionSnapshot }),
```

---

### Part 2 — Plugin Sandbox (`figmento/src/code.ts`)

In the sandbox message handler (where `get-preferences` is handled), add a case for `get-selection-snapshot`:

```typescript
case 'get-selection-snapshot': {
  const selection = figma.currentPage.selection
    .filter(node => 'width' in node && 'height' in node)
    .map(node => ({
      id: node.id,
      type: node.type,
      name: node.name,
      width: (node as SceneNode & { width: number }).width,
      height: (node as SceneNode & { height: number }).height,
    }));
  figma.ui.postMessage({ type: 'selection-snapshot', selection });
  break;
}
```

---

### Part 3 — Relay Chat Engine (`figmento-ws-relay/src/chat/chat-engine.ts`)

**3a — Add field to `ChatTurnRequest` interface:**

```typescript
/** Optional snapshot of the user's current Figma selection at time of Send. */
currentSelection?: Array<{
  id: string;
  type: string;
  name: string;
  width: number;
  height: number;
}>;
```

**3b — Inject into system prompt context:**

In `buildSystemPrompt()` call (or inline before the API call), if `currentSelection` has a FRAME entry, prepend a context note to the user message:

```typescript
function buildSelectionContext(
  selection?: ChatTurnRequest['currentSelection']
): string {
  if (!selection || selection.length === 0) return '';
  const frames = selection.filter(n => n.type === 'FRAME');
  if (frames.length === 0) return '';
  const descriptions = frames.map(f => `"${f.name}" (id: ${f.id}, ${f.width}×${f.height}px)`);
  return `[Figma context: user has ${frames.length === 1 ? 'a frame' : 'frames'} selected — ${descriptions.join(', ')}. Pass frameId to generate_design_image or other frame-targeting tools instead of calling get_selection.]`;
}
```

Prepend this to the user message text before it enters the conversation history. Do NOT modify the displayed message — only the message sent to the AI API.

---

### Part 4 — Relay Endpoint Validation (`figmento-ws-relay/src/chat/chat-endpoint.ts`)

In `validateRequest()`, `currentSelection` is optional and unknown-typed — no validation needed. The field will pass through to `handleChatTurn` automatically since the body is parsed as `unknown` and cast to `ChatTurnRequest`.

No code change needed here — just verify it passes through.

---

## Acceptance Criteria

- [ ] AC1: When a FRAME is selected in Figma and the user sends a chat message, the relay receives `currentSelection` in the POST body containing the frame's `{ id, type, name, width, height }`
- [ ] AC2: When nothing is selected, `currentSelection` is absent from the POST body (not sent as empty array)
- [ ] AC3: The AI system prompt context includes the selection note when a FRAME is selected: `"[Figma context: user has a frame selected — "My Frame" (id: ..., 1080×1350px)...]"`
- [ ] AC4: Selection snapshot failure (timeout) does not block the message from sending — chat proceeds without selection context
- [ ] AC5: Non-FRAME selections (groups, components, text nodes) are filtered out of the selection note — only FRAME type nodes are included
- [ ] AC6: `npm run build` clean for both `figmento` plugin and `figmento-ws-relay`

---

## Tasks

### Phase 1: Plugin Sandbox Handler

- [x] In `figmento/src/handlers/storage.ts` — added `case 'get-selection-snapshot'` after `delete-preference` case

---

### Phase 2: Plugin UI — `getSelectionSnapshot` helper

- [x] Added `SelectionNode` interface in TYPES section
- [x] Added `getSelectionSnapshot()` after `loadPreferencesFromSandbox()`
- [x] `runRelayTurn()` calls `getSelectionSnapshot()` after preferences load
- [x] `currentSelection` added to body only when array is non-empty

---

### Phase 3: Relay — `ChatTurnRequest` + `buildSelectionContext`

- [x] Added `currentSelection?` field to `ChatTurnRequest` interface
- [x] Added `buildSelectionContext()` helper before `handleChatTurn`
- [x] `handleChatTurn` prepends selection context to message text when FRAME selected

---

### Phase 4: Build Verification

```bash
cd figmento && npm run build
cd figmento-ws-relay && npm run build
```

Both must complete without errors.

---

## Dev Notes

- **Where is the sandbox message handler?** Search `figmento/src/code.ts` for `get-preferences` or `pluginMessage.type` — the `get-selection-snapshot` case goes in the same switch block.
- **`loadPreferencesFromSandbox` is the exact pattern to follow** for `getSelectionSnapshot` — same postMessage/listener/timeout structure. See `chat.ts:65–79`.
- **Context note is prepended to the message text, not the system prompt** — this keeps it scoped to the specific turn and avoids polluting the persistent system prompt with stale selection data.
- **500ms timeout is intentional** — fast enough that the user doesn't notice, but long enough for the Figma iframe round-trip. `loadPreferencesFromSandbox` uses 2000ms; selection is simpler, 500ms is sufficient.
- **Only FRAME type in context note** — `generate_design_image` only accepts frames. Including groups/components in the note would confuse the AI.
- **`figmento-ws-relay` build command** is `npm run build` in the relay directory.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/handlers/storage.ts` | MODIFY | Add `get-selection-snapshot` message case (handler lives here, not code.ts) |
| `figmento/src/ui/chat.ts` | MODIFY | Add `SelectionNode` type, `getSelectionSnapshot()`, update `runRelayTurn()` body |
| `figmento-ws-relay/src/chat/chat-engine.ts` | MODIFY | Add `currentSelection` to `ChatTurnRequest`, add `buildSelectionContext()`, prepend to user message |

---

## Definition of Done

- [x] `npm run build` clean in `figmento` plugin
- [x] `npm run build` clean in `figmento-ws-relay`
- [x] Selection snapshot sent in relay POST body when frame is selected
- [x] AI receives selection context note when frame is selected
- [x] Chat unaffected when nothing is selected (graceful degradation)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @sm (River) | Story drafted from IG-1 Out of Scope section + architecture exploration |
| 2026-03-14 | @po (Pax) | Validation 9.5/10 → GO. Fixed: "4 files" → "3 files" (chat-endpoint.ts is verify-only). Status Draft → Ready |
| 2026-03-14 | @dev (Dex) | Implemented all 3 phases. Handler in storage.ts (not code.ts — actual location). Plugin + relay builds clean. Status → Ready for Review |
