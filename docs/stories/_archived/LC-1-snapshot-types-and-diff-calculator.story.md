# Story LC-1: Snapshot Types & Diff Calculator

**Status:** Done
**Priority:** High
**Complexity:** M (Medium) — Pure types + pure function with threshold table; no UI, no sandbox integration
**Epic:** LC — Learning & Corrections (Phase 4a)
**PRD:** PRD-004 (Learn from User Corrections)
**Depends on:** None

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + unit tests for diff calculator
```

---

## Story

**As a** Figmento developer building the correction-learning pipeline,
**I want** shared type definitions and a pure diff calculator function,
**so that** all subsequent stories (LC-2 through LC-5) have a stable foundation to build on.

---

## Description

This is the leaf-node story for Phase 4a. It creates:

1. **Type definitions** — `NodeSnapshot`, `CorrectionEntry`, `SerializedFill`, `SerializedEffect`, `LearningConfig` in `packages/figmento-core/src/types.ts` (the shared types file that both plugin and sandbox import via `figmento/src/types.ts` shim).

2. **Diff calculator** — A pure function `calculateDiff(before: NodeSnapshot[], after: NodeSnapshot[]): CorrectionEntry[]` that compares two snapshot arrays and returns only changes that exceed the minimum delta thresholds defined in PRD-004 §C4. This function has zero side effects, zero Figma API deps, and is fully unit-testable.

3. **Context inference** — A helper `inferContext(node: NodeSnapshot): string` that maps node names/types to hierarchy contexts (display, h1, h2, body, caption, root-frame, card, section) for preference categorization.

### Why This First

The diff calculator is the most logic-dense piece in Phase 4a. Building it first with full test coverage de-risks the entire phase. LC-2 (snapshots) and LC-4 (compare) both depend on these types. LC-5 (UI) depends on `CorrectionEntry` shape for rendering.

---

## Acceptance Criteria

- [ ] **AC1:** `NodeSnapshot` interface matches PRD-004 §C2 exactly — all fields present with correct types
- [ ] **AC2:** `CorrectionEntry` interface matches PRD-004 §7 exactly — includes `id`, `frameId`, `nodeId`, `nodeName`, `nodeType`, `property`, `category`, `context`, `beforeValue`, `afterValue`, `direction`, `magnitude`, `timestamp`, `confirmed`
- [ ] **AC3:** `SerializedFill` and `SerializedEffect` interfaces defined for snapshot fill/effect serialization
- [ ] **AC4:** `LearningConfig` interface defined with `enabled`, `autoDetect`, `confidenceThreshold` fields
- [ ] **AC5:** `calculateDiff()` returns empty array when before and after snapshots are identical
- [ ] **AC6:** `calculateDiff()` ignores changes below minimum delta thresholds (all 10 thresholds from PRD-004 §C4 enforced)
- [ ] **AC7:** `calculateDiff()` detects and returns `CorrectionEntry` for changes above thresholds — fontSize, fills color, cornerRadius, width/height, opacity, fontWeight, itemSpacing, padding, letterSpacing, lineHeight
- [ ] **AC8:** `calculateDiff()` correctly handles node additions (present in after, absent in before) and deletions (present in before, absent in after) — these are logged but not treated as corrections
- [ ] **AC9:** `calculateDiff()` sets `direction` correctly — `'increase'` for numeric growth, `'decrease'` for numeric shrink, `'change'` for non-numeric (color, fontFamily)
- [ ] **AC10:** `inferContext()` maps node names to hierarchy contexts: names containing "hero"/"display" → `"display"`, "heading"/"title"/"h1" → `"h1"`, "sub" → `"h2"`, "body"/"paragraph"/"description" → `"body"`, "caption"/"label"/"note" → `"caption"`, node type FRAME with layoutMode → `"section"`, root frame → `"root-frame"`
- [ ] **AC11:** `calculateDiff()` sets `category` correctly — fontSize/fontFamily/fontWeight/lineHeight/letterSpacing → `"typography"`, fills/opacity → `"color"`, itemSpacing/padding* → `"spacing"`, cornerRadius/strokeWeight → `"shape"`
- [ ] **AC12:** All types are exported from `packages/figmento-core/src/types.ts` and accessible via `figmento/src/types.ts` re-export shim
- [ ] **AC13:** Plugin build passes (`cd figmento && npm run build`)

---

## Tasks

### Phase 1 — Types

- [x] **Task 1:** Add `SerializedFill`, `SerializedEffect`, `NodeSnapshot`, `CorrectionEntry`, `LearningConfig` interfaces to `packages/figmento-core/src/types.ts`. Follow the exact field definitions from PRD-004 §7. Place after existing type definitions (after line ~272).

### Phase 2 — Diff Calculator

- [x] **Task 2:** Create `figmento/src/diff-calculator.ts` with:
  - `DELTA_THRESHOLDS` constant object (all 10 thresholds from PRD-004 §C4)
  - `inferContext(node: NodeSnapshot): string` helper
  - `categorizeProperty(property: string): 'typography' | 'color' | 'spacing' | 'shape'` helper
  - `calculateDiff(before: NodeSnapshot[], after: NodeSnapshot[]): CorrectionEntry[]` main function

- [x] **Task 3:** Implement `calculateDiff` logic:
  1. Build a map of `before` nodes by `id`
  2. For each node in `after`: find matching `before` node by `id`
  3. Compare each tracked property. If delta exceeds threshold → create `CorrectionEntry`
  4. For color comparison: parse hex to RGB, sum per-channel absolute diffs, check ≥30
  5. Set `direction`: numeric increase/decrease, non-numeric `'change'`
  6. Set `magnitude`: absolute numeric delta, or channel-sum for colors
  7. Generate UUID for `id`, set `timestamp: Date.now()`, `confirmed: false`

### Phase 3 — Build Verification

- [x] **Task 4:** Verify `cd figmento && npm run build` passes clean. The new file is additive — no existing code changes.

---

## Dev Notes

- **No `figmento/src/utils/` directory exists.** Place `diff-calculator.ts` directly in `figmento/src/`. This matches the existing pattern where `color-utils.ts`, `gradient-utils.ts`, `refinement.ts` live in `src/` root.

- **Types go in `packages/figmento-core/src/types.ts`**, not `figmento/src/types.ts`. The latter is a re-export shim (`export * from '../../packages/figmento-core/src/types'`). Adding types to the core package makes them available to both plugins.

- **UUID generation in sandbox:** Figma sandbox has no `crypto.randomUUID()`. Use a simple counter-based ID: `correction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`. Good enough for local storage.

- **Color parsing for diff:** The `SerializedFill` stores color as hex string (e.g., `"#3B82F6"`). Parse to RGB for channel comparison. The existing `color-utils.ts` has `hexToRgb()` — import it if the build allows cross-file imports in the plugin bundle (esbuild bundles everything, so it should work).

- **Do NOT import from Figma API.** `diff-calculator.ts` must be a pure function module with zero `figma.*` references. It operates on serialized snapshot data only. This keeps it testable outside the Figma sandbox.

---

## Minimum Delta Thresholds (Reference)

| Property | Min Delta | Type |
|----------|-----------|------|
| `width`, `height` | 8px | numeric |
| `x`, `y` | 8px | numeric |
| `fontSize` | 2px | numeric |
| `fills` (color) | ΔR+ΔG+ΔB ≥ 30 | channel-sum |
| `cornerRadius` | 2px | numeric |
| `opacity` | 0.05 | numeric |
| `fontWeight` | 100 | numeric |
| `itemSpacing`, `padding*` | 4px | numeric |
| `letterSpacing` | 0.01 | numeric |
| `lineHeight` | 2px | numeric |

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `packages/figmento-core/src/types.ts` | MODIFY | Add 5 new interfaces after existing types |
| `figmento/src/diff-calculator.ts` | CREATE | Pure diff function + threshold constants + context inference |
| `figmento/src/__tests__/diff-calculator.test.ts` | CREATE | 70 unit tests covering all thresholds, directions, categories, context inference |
| `figmento/src/ui/__tests__/tools-schema.test.ts` | MODIFY | Updated tool count from 37→38 (pre-existing branch change: 3rd plugin-only tool) |

---

## Definition of Done

- [x] All types compile clean and are accessible via `import { NodeSnapshot, CorrectionEntry } from '../types'`
- [x] `calculateDiff()` returns correct results for: identical snapshots (empty), single property change, multi-property change, color change, node addition, node deletion
- [x] All 10 delta thresholds enforced — sub-threshold changes produce no entries
- [x] `cd figmento && npm run build` passes clean
- [x] No existing functionality affected

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | @sm (River) | Story drafted from PRD-004 Phase 4a. Leaf node — types + pure diff calculator. |
| 2026-03-12 | @po (Pax) | Validated: 8/10. Fixed AC1 checkbox [x]→[ ]. Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Implemented: 5 types added to core, diff-calculator.ts created, 70 tests pass, build clean. Status → Ready for Review. |
| 2026-04-12 | @qa (Quinn) | **QA Gate: PASS.** 13/13 ACs verified. `calculateDiff`, `DELTA_THRESHOLDS`, `inferContext`, `categorizeProperty` confirmed in diff-calculator.ts:16-201. 70 unit tests + 371 integration tests passing. Status: Ready for Review → Done. |
