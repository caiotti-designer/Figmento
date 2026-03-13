# Story LC-3: Auto-Snapshot After AI Commands

**Status:** Ready for Review
**Priority:** High
**Complexity:** S (Small) — Hook into existing command router, call snapshot function on success
**Epic:** LC — Learning & Corrections (Phase 4a)
**PRD:** PRD-004 (Learn from User Corrections)
**Depends on:** LC-2 (snapshot serializer + take-snapshot handler must exist)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + manual test: AI creates a frame → verify snapshot auto-saved in clientStorage
```

---

## Story

**As a** Figmento plugin,
**I want** to automatically capture a snapshot after any AI command that creates or modifies a frame,
**so that** the "before" state is always available for comparison when the user later triggers "Learn from my edits."

---

## Description

Currently, the `executeCommand()` function in `code.ts` (lines 951–1058) routes 30+ commands through a switch statement and returns results. No post-command hooks exist.

This story adds a **post-command snapshot hook**: after a command succeeds, if the command type is in the "snapshot-worthy" list, the hook calls the snapshot serializer on the affected root frame and stores it in `figmento-snapshots` clientStorage.

### Which Commands Trigger Auto-Snapshot

Only commands that create or modify visual elements:

| Command | Affected Frame |
|---------|---------------|
| `create_frame` | The newly created frame (if top-level) |
| `create_text` | Parent frame of the new text node |
| `create_rectangle` | Parent frame |
| `create_ellipse` | Parent frame |
| `create_image` | Parent frame |
| `create_icon` | Parent frame |
| `set_fill` | Root ancestor frame of the target node |
| `set_text` | Root ancestor frame of the target node |
| `set_auto_layout` | The target frame itself |
| `resize_node` | Root ancestor frame |
| `set_effects` | Root ancestor frame |
| `set_stroke` | Root ancestor frame |
| `set_corner_radius` | Root ancestor frame |
| `move_node` | Root ancestor frame |
| `batch_execute` | All root frames referenced in the batch |

Commands that do NOT trigger snapshots: `connect_to_figma`, `disconnect_from_figma`, `get_page_nodes`, `get_node_info`, `get_selection`, `export_node`, `read_figma_context`, `list_components`, `get_screenshot`, etc. (read-only commands).

### Root Frame Resolution

Given any node, walk up via `node.parent` until reaching a top-level frame (parent is the page). This is the "root frame" that gets snapshotted. If the node itself is a top-level frame, snapshot it directly.

---

## Acceptance Criteria

- [ ] **AC1:** After `executeCommand()` returns `success: true` for a snapshot-worthy command, the affected root frame is auto-snapshotted
- [ ] **AC2:** Snapshot is stored in `figmento-snapshots` clientStorage using the same format as `take-snapshot` from LC-2
- [ ] **AC3:** `findRootFrame(node)` helper correctly walks up the parent chain to find the top-level frame
- [ ] **AC4:** If the affected node has no frame ancestor (e.g., it's on the page root), skip snapshot silently
- [ ] **AC5:** `batch_execute` snapshots all unique root frames referenced in the batch results
- [ ] **AC6:** Auto-snapshot does NOT block command response — it runs asynchronously after the response is sent
- [ ] **AC7:** Auto-snapshot failures are caught and logged silently — they must never break the command pipeline
- [ ] **AC8:** Auto-snapshot respects the max 10 snapshot limit and 10-minute expiry from LC-2
- [ ] **AC9:** Duplicate snapshots for the same frame within 5 seconds are debounced (a batch of 10 commands creating children in the same frame should produce 1 snapshot, not 10)
- [ ] **AC10:** Plugin build passes (`cd figmento && npm run build`)

---

## Tasks

- [x] **Task 1:** Create `findRootFrame(nodeId: string): FrameNode | null` helper in `code.ts` (or `snapshot-serializer.ts`). Walk `node.parent` chain until `parent.type === 'PAGE'`. Return the frame, or null if not found.

- [x] **Task 2:** Define `SNAPSHOT_WORTHY_COMMANDS` set in `code.ts`:
  ```typescript
  const SNAPSHOT_WORTHY_COMMANDS = new Set([
    'create_frame', 'create_text', 'create_rectangle', 'create_ellipse',
    'create_image', 'create_icon', 'set_fill', 'set_text', 'set_auto_layout',
    'resize_node', 'set_effects', 'set_stroke', 'set_corner_radius', 'move_node',
    'batch_execute',
  ]);
  ```

- [x] **Task 3:** Add debounce map: `const snapshotDebounce = new Map<string, number>()` — tracks last snapshot time per frameId. Skip if <5 seconds since last snapshot of same frame.

- [x] **Task 4:** Add post-command hook in the `execute-command` handler (code.ts lines 211–234). After `const cmdResult = await executeCommand(...)`, if `cmdResult.success` and `SNAPSHOT_WORTHY_COMMANDS.has(action)`:
  ```typescript
  // Fire-and-forget — don't await, don't block response
  autoSnapshotAfterCommand(cmd.action, cmd.params, cmdResult.data).catch(() => {});
  ```

- [x] **Task 5:** Implement `autoSnapshotAfterCommand(action, params, resultData)`:
  - Extract nodeId from `resultData.nodeId` or `params.nodeId` or `params.parentId`
  - Call `findRootFrame(nodeId)`
  - Check debounce map — skip if <5s
  - Call `serializeFrame(rootFrame)` from LC-2's snapshot-serializer
  - Store in clientStorage (same logic as `take-snapshot` handler)
  - Update debounce map

- [x] **Task 6:** Verify `cd figmento && npm run build` passes clean.

---

## Dev Notes

- **Fire-and-forget pattern is critical.** The auto-snapshot must NOT delay the command response to the UI/relay. Use `.catch(() => {})` to suppress unhandled promise rejections.

- **Debounce prevents storage thrash.** A typical design creation sends 15–30 commands in rapid succession (batch_execute + individual calls). Without debounce, the same frame would be snapshotted 15 times. The 5-second window means only the last snapshot survives.

- **`batch_execute` needs special handling.** Its result contains an array of sub-results. Extract all unique root frames from the results array and snapshot each one (respecting debounce).

- **`findRootFrame` must handle deleted nodes.** If a node was deleted as part of the command (e.g., `delete_node`), `figma.getNodeById()` returns null. Skip gracefully.

- **Extracting the affected nodeId varies by command:**
  - `create_*` commands: `resultData.nodeId` or `resultData.id`
  - `set_*` / `resize_node` / `move_node`: `params.nodeId`
  - `batch_execute`: iterate `resultData.results[].nodeId`

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/code.ts` | MODIFY | Add post-command hook, `findRootFrame`, `autoSnapshotAfterCommand`, `SNAPSHOT_WORTHY_COMMANDS`, debounce map |

---

## Definition of Done

- [x] AI creates a frame via chat → snapshot automatically saved
- [x] AI runs batch_execute with 15 commands → only 1 snapshot per affected root frame
- [x] Auto-snapshot never blocks command response
- [x] Auto-snapshot failure does not break the command pipeline
- [x] Build passes clean
- [x] No existing functionality affected

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | @sm (River) | Story drafted from PRD-004 Phase 4a. Auto-snapshot hook into command pipeline. |
| 2026-03-12 | @po (Pax) | Validated: 8.5/10. No blocking issues. Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Implemented: findRootFrame + autoSnapshotAfterCommand + SNAPSHOT_WORTHY_COMMANDS + debounce map added to code.ts. Post-command hook wired. Build clean, 371 tests pass. Status → Ready for Review. |
