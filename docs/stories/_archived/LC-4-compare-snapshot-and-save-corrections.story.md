# Story LC-4: Compare Snapshots & Save Corrections

**Status:** Done
**Priority:** High
**Complexity:** M (Medium) — Wires diff calculator into sandbox, adds compare + save handlers
**Epic:** LC — Learning & Corrections (Phase 4a)
**PRD:** PRD-004 (Learn from User Corrections)
**Depends on:** LC-1 (diff calculator), LC-2 (snapshot storage)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + manual test: create design → edit manually → compare-snapshot returns CorrectionEntry[]
```

---

## Story

**As a** Figmento plugin,
**I want** to compare a stored "before" snapshot with the current frame state and save confirmed corrections,
**so that** the UI can display what the user changed and persist it for future preference aggregation.

---

## Description

This story adds two sandbox message handlers:

1. **`compare-snapshot`** — Given a `frameId`:
   - Load the stored "before" snapshot from `figmento-snapshots` clientStorage
   - Capture the current state of the same frame (using `serializeFrame` from LC-2)
   - Run `calculateDiff(before, after)` from LC-1
   - Return the `CorrectionEntry[]` to the UI via postMessage
   - If no stored snapshot exists for this frame, return `{ corrections: [], error: 'No snapshot found' }`

2. **`save-corrections`** — Receives confirmed `CorrectionEntry[]` from the UI:
   - Append to `figmento-corrections` in clientStorage
   - Cap at 200 entries (FIFO eviction)
   - Delete the used snapshot from `figmento-snapshots` (it's been consumed)

This story does NOT add any UI. The handlers are called by LC-5 (the UI button story).

---

## Acceptance Criteria

- [ ] **AC1:** `compare-snapshot` loads stored snapshot, captures current state, runs `calculateDiff`, returns `CorrectionEntry[]`
- [ ] **AC2:** `compare-snapshot` returns `{ corrections: [], noSnapshot: true }` when no stored snapshot exists for the requested frame
- [ ] **AC3:** `compare-snapshot` returns `{ corrections: [], error: 'Frame not found' }` when the frame no longer exists on the page
- [ ] **AC4:** `compare-snapshot` response includes metadata: `{ corrections: CorrectionEntry[], frameId, frameName, snapshotAge: number (ms since snapshot), nodeCount }`
- [ ] **AC5:** `save-corrections` appends entries to `figmento-corrections` in clientStorage
- [ ] **AC6:** `save-corrections` enforces max 200 entries — oldest entries evicted first
- [ ] **AC7:** `save-corrections` marks all entries as `confirmed: true` before storing
- [ ] **AC8:** `save-corrections` deletes the consumed snapshot from `figmento-snapshots` (prevents re-comparison)
- [ ] **AC9:** `save-corrections` responds via `figma.ui.postMessage({ type: 'corrections-saved', count, totalStored })`
- [ ] **AC10:** `compare-snapshot` accepts optional `frameId` parameter. If omitted, compares ALL frames that have stored snapshots and returns combined results
- [ ] **AC11:** Plugin build passes (`cd figmento && npm run build`)

---

## Tasks

- [x] **Task 1:** Add `compare-snapshot` handler to `code.ts` message switch. Follow the `save-memory` async IIFE pattern:
  ```
  case 'compare-snapshot':
    (async () => {
      try {
        const frameId = msg.frameId; // optional
        const snapshots = await figma.clientStorage.getAsync('figmento-snapshots') || {};
        // prune expired snapshots first
        // if frameId specified: compare single frame
        // if not: compare all stored snapshots
        // for each: serializeFrame(currentFrame) → calculateDiff(stored, current)
        // combine all CorrectionEntry[]
        figma.ui.postMessage({ type: 'snapshot-compared', corrections, frameId, ... });
      } catch (e) {
        figma.ui.postMessage({ type: 'snapshot-compared', corrections: [], error: String(e) });
      }
    })();
    break;
  ```

- [x] **Task 2:** Add `save-corrections` handler to `code.ts`:
  ```
  case 'save-corrections':
    (async () => {
      try {
        const newEntries = msg.corrections.map(c => ({ ...c, confirmed: true }));
        const existing = await figma.clientStorage.getAsync('figmento-corrections') || [];
        const combined = [...existing, ...newEntries];
        // FIFO eviction if >200
        if (combined.length > 200) combined.splice(0, combined.length - 200);
        await figma.clientStorage.setAsync('figmento-corrections', combined);
        // Delete consumed snapshot(s)
        const snapshots = await figma.clientStorage.getAsync('figmento-snapshots') || {};
        for (const entry of newEntries) {
          delete snapshots[entry.frameId];
        }
        await figma.clientStorage.setAsync('figmento-snapshots', snapshots);
        figma.ui.postMessage({ type: 'corrections-saved', count: newEntries.length, totalStored: combined.length });
      } catch (e) {
        figma.ui.postMessage({ type: 'corrections-saved', count: 0, error: String(e) });
      }
    })();
    break;
  ```

- [x] **Task 3:** Import `calculateDiff` from `./diff-calculator` and `serializeFrame` from `./snapshot-serializer` at the top of `code.ts`.

- [x] **Task 4:** Verify `cd figmento && npm run build` passes clean.

---

## Dev Notes

- **Import path from sandbox:** Since `code.ts` is the sandbox entry point bundled by esbuild, importing from `./diff-calculator` and `./snapshot-serializer` works fine — esbuild bundles them into `dist/code.js`.

- **`calculateDiff` is a pure function** — it takes `NodeSnapshot[]` arrays, not Figma nodes. The sandbox must serialize first (via `serializeFrame`), then pass the serialized data to the diff calculator.

- **Snapshot consumption pattern:** After `save-corrections`, the snapshot for that frame is deleted. This prevents the user from comparing the same snapshot twice (which would produce duplicate corrections). If the AI creates a new design on the same frame, a new auto-snapshot (LC-3) replaces it.

- **`compare-snapshot` without `frameId`:** When the UI calls without specifying a frame, the handler compares ALL stored snapshots. This is the primary use case — the user clicks "Learn from my edits" and gets all changes across all AI-generated frames.

- **`figmento-corrections` is the raw log.** Phase 4b will add an aggregation engine that reads this log and creates `LearnedPreference` entries. Phase 4a just accumulates.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/code.ts` | MODIFY | Add `compare-snapshot` and `save-corrections` handlers, import diff-calculator + snapshot-serializer |

---

## Definition of Done

- [x] `compare-snapshot` returns accurate corrections for a frame with 3 manual edits (font size, color, corner radius)
- [x] `compare-snapshot` returns empty array for unmodified frames
- [x] `save-corrections` persists entries to clientStorage
- [x] Max 200 correction entries enforced
- [x] Consumed snapshot deleted after save
- [x] Build passes clean
- [x] No existing functionality affected

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | @sm (River) | Story drafted from PRD-004 Phase 4a. Compare + save handlers for plugin sandbox. |
| 2026-03-12 | @po (Pax) | Validated: 8.5/10. No blocking issues. Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Implemented: compare-snapshot + save-corrections handlers added to code.ts; calculateDiff imported. Build clean, 371 tests pass. Status → Ready for Review. |
| 2026-04-12 | @qa (Quinn) | **QA Gate: PASS.** 11/11 ACs verified. `compare-snapshot` at storage.ts:177, `save-corrections` at storage.ts:263. Max 200 correction entries enforced. Consumed snapshots deleted after save. Status: Ready for Review → Done. |
