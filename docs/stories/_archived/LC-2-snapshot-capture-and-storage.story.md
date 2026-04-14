# Story LC-2: Snapshot Capture & Storage in Plugin Sandbox

**Status:** Done
**Priority:** High
**Complexity:** M (Medium) — 3 new message handlers in code.ts + clientStorage persistence + expiry logic
**Epic:** LC — Learning & Corrections (Phase 4a)
**PRD:** PRD-004 (Learn from User Corrections)
**Depends on:** LC-1 (types must exist)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + manual test: take snapshot → verify clientStorage → wait 10min → verify expired
```

---

## Story

**As a** Figmento plugin,
**I want** to capture depth-1 snapshots of AI-generated frames and store them in clientStorage,
**so that** the diff calculator can later compare "before" and "after" states to detect user corrections.

---

## Description

This story adds the snapshot infrastructure to the plugin sandbox (`code.ts`). Three new message handlers:

1. **`take-snapshot`** — Receives a `frameId`, reads the frame + direct children (depth 1), serializes to `NodeSnapshot[]`, stores in `figmento-snapshots` clientStorage with a timestamp. Max 10 active snapshots (FIFO eviction).

2. **`get-snapshot-status`** — Returns which frames have active (non-expired) snapshots. The UI needs this to enable/disable the "Learn from my edits" button.

3. **Snapshot expiry** — Two mechanisms:
   - **Time-based:** On every `take-snapshot` or `get-snapshot-status` call, prune entries older than 10 minutes.
   - **Page change:** Register `figma.on('currentpagechange', ...)` to clear ALL snapshots when the user navigates to a different page.

### Snapshot Serialization

The sandbox reads Figma node properties and converts them to the `NodeSnapshot` interface (defined in LC-1). Key conversions:
- `node.fills` → `SerializedFill[]` (extract type, hex color from RGB, opacity)
- `node.effects` → `SerializedEffect[]` (extract type, hex color, offset, radius)
- Text properties: read `fontSize`, `fontName.family`, `fontName.style` → weight mapping, `lineHeight`, `letterSpacing`, `characters`
- Layout properties: `layoutMode`, `itemSpacing`, `paddingTop/Right/Bottom/Left`
- `cornerRadius`: handle `figma.mixed` → use `topLeftRadius` as fallback

---

## Acceptance Criteria

- [ ] **AC1:** `take-snapshot` handler captures root frame + all direct children (depth 1 only — no recursion into nested frames)
- [ ] **AC2:** Each captured node serialized to `NodeSnapshot` with all fields populated (text fields only for TEXT nodes, layout fields only for frames with auto-layout)
- [ ] **AC3:** Snapshot stored in `figmento-snapshots` clientStorage as `Record<frameId, { snapshot: NodeSnapshot[], timestamp: number }>`
- [ ] **AC4:** Max 10 active snapshots. When a new snapshot would exceed 10, the oldest entry is evicted (FIFO)
- [ ] **AC5:** `get-snapshot-status` returns `{ frames: Array<{ frameId: string, frameName: string, nodeCount: number, age: number }> }` — only non-expired snapshots
- [ ] **AC6:** Snapshots older than 10 minutes are pruned on every `take-snapshot` and `get-snapshot-status` call
- [ ] **AC7:** `figma.on('currentpagechange')` listener registered at plugin init — clears ALL entries from `figmento-snapshots`
- [ ] **AC8:** `take-snapshot` responds via `figma.ui.postMessage({ type: 'snapshot-taken', frameId, nodeCount, success })` — UI can react
- [ ] **AC9:** `take-snapshot` handles missing/deleted frame gracefully — returns `{ success: false, error: 'Frame not found' }`
- [ ] **AC10:** `figma.mixed` on `cornerRadius` handled — use `topLeftRadius` as fallback value
- [ ] **AC11:** Color serialization: `SolidPaint` → hex string via RGB conversion. Non-solid fills (gradient, image) → `{ type: 'GRADIENT_LINEAR' }` or `{ type: 'IMAGE' }` with no color (skip in diff)
- [ ] **AC12:** Plugin build passes (`cd figmento && npm run build`)

---

## Tasks

### Phase 1 — Snapshot Serializer

- [x] **Task 1:** Create `figmento/src/snapshot-serializer.ts` with:
  - `serializeNode(node: SceneNode): NodeSnapshot` — reads all tracked properties from a Figma node
  - `serializeFrame(frame: FrameNode): NodeSnapshot[]` — captures the frame itself + all direct children
  - `rgbToHex(r, g, b)` — convert Figma's 0-1 RGB to hex (reuse from `color-utils.ts` if possible, or inline)
  - Handle `figma.mixed` for cornerRadius, fontSize (use first range value or topLeftRadius)
  - Handle mixed fonts on text nodes (use first segment's font)

### Phase 2 — Sandbox Message Handlers

- [x] **Task 2:** Add `take-snapshot` handler to `code.ts` message switch (follow `save-memory` pattern at lines 322–338):
  ```
  case 'take-snapshot':
    (async () => {
      const frameId = msg.frameId;
      const frame = figma.getNodeById(frameId);
      // validate it's a FrameNode
      // serialize
      // load existing snapshots from clientStorage
      // prune expired (>10min)
      // evict if >10 entries
      // store new snapshot
      // respond via postMessage
    })();
    break;
  ```

- [x] **Task 3:** Add `get-snapshot-status` handler to `code.ts`:
  ```
  case 'get-snapshot-status':
    (async () => {
      // load from clientStorage
      // prune expired
      // return list of active snapshots with metadata
    })();
    break;
  ```

### Phase 3 — Page Change Listener

- [x] **Task 4:** Register `figma.on('currentpagechange', ...)` near the top of `code.ts` (near existing event listeners). On page change: clear `figmento-snapshots` from clientStorage, notify UI via `postMessage({ type: 'snapshots-cleared' })`.

### Phase 4 — Build Verification

- [x] **Task 5:** Verify `cd figmento && npm run build` passes clean.

---

## Dev Notes

- **Follow the `save-memory` handler pattern exactly.** Wrap async work in IIFE, use try/catch, respond via `figma.ui.postMessage`. See `code.ts` lines 322–338 for the template.

- **Figma RGB is 0–1 float, not 0–255.** Convert: `Math.round(r * 255)`. The existing `color-utils.ts` may have helpers for this.

- **`figma.mixed` check is mandatory.** Many properties return `figma.mixed` when values differ across selection or text ranges. Always check: `if (prop === figma.mixed) { /* fallback */ }`.

- **Text node font handling:** `textNode.fontName` can be `figma.mixed` if the text has mixed formatting. Use `textNode.getRangeFontName(0, 1)` to get the first character's font as a safe fallback.

- **`fontSize` on text nodes** can also be `figma.mixed`. Use `textNode.getRangeFontSize(0, 1)` as fallback.

- **No `figma.on('currentpagechange')` exists yet** in the codebase. This will be the first listener of this type.

- **Storage key:** `figmento-snapshots`. Different from existing `figmento-memory` and `design-feedback`.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/snapshot-serializer.ts` | CREATE | Node→NodeSnapshot serialization, depth-1 frame capture |
| `figmento/src/code.ts` | MODIFY | Add `take-snapshot`, `get-snapshot-status` handlers + `currentpagechange` listener; SNAPSHOT_TTL_MS, MAX_SNAPSHOTS, SNAPSHOTS_STORAGE_KEY constants |

---

## Definition of Done

- [x] Snapshot of a frame with 10 children captures exactly 11 NodeSnapshot entries (frame + 10 children)
- [x] Snapshot stored in clientStorage and retrievable
- [x] Expired snapshots (>10min) are pruned on access
- [x] Page change clears all snapshots
- [x] Max 10 active snapshots enforced
- [x] Build passes clean
- [x] No existing functionality affected

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | @sm (River) | Story drafted from PRD-004 Phase 4a. Snapshot infrastructure for plugin sandbox. |
| 2026-03-12 | @po (Pax) | Validated: 8/10. No blocking issues. Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Implemented: snapshot-serializer.ts created, take-snapshot + get-snapshot-status handlers + currentpagechange listener added to code.ts. Build clean, 371 tests pass. Status → Ready for Review. |
| 2026-04-12 | @qa (Quinn) | **QA Gate: PASS.** 12/12 ACs verified. `serializeFrame`, `take-snapshot` handler, `SNAPSHOT_TTL_MS=10min`, `MAX_SNAPSHOTS=10` all confirmed in code. Depth-1 capture + FIFO eviction + page-change clear correctly implemented. Status: Ready for Review → Done. |
