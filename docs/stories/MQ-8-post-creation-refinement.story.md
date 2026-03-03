# Story MQ-8: Post-Creation Structural Check

**Status:** Ready for Review
**Priority:** Medium
**Complexity:** M
**Epic:** MQ — Mode Quality Parity
**Phase:** 4 (final; depends on Phase 1-3 completion)

---

## PO Validation

**Score:** 9/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-02

| Check | Result | Note |
|-------|--------|------|
| 1. Clear title | ✅ | |
| 2. Complete description | ✅ | MCP path vs Modes path contrast explained; complement to MQ-6 noted |
| 3. Testable AC | ✅ | 7 ACs; 3 targeted tests including negative test (single element skip) |
| 4. Scope IN/OUT | ⚠️ | OUT not listed; "no UI notification" in AC:3 + "no MCP calls" in Dev Notes covers key boundaries |
| 5. Dependencies | ✅ | Phase 4 (all prior phases); MQ-6 complement relationship explicit |
| 6. Complexity | ✅ | M |
| 7. Business value | ✅ | Auto-fix before user sees result = transparent quality improvement |
| 8. Risks | ✅ | Gradient matrix risk flagged; bug fix warning prominent; try/catch mandate |
| 9. Done criteria | ✅ | Build + 3 tests covering fix, auto-layout, and skip scenarios |
| 10. Alignment | ✅ | Correctly mirrors DQ refinement system; Figma Plugin API used directly |

**Observation:** The bug fix warning (⚠️ in Task 1) and the corrected code snippet are strong quality signals. CodeRabbit focus area reinforces this. @dev must use the corrected snippet, not the original epic draft.

---

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [build, manual-smoke]
```

---

## Story

**As a** user of Figmento's modes,
**I want** a structural quality check to run automatically after any design is created via UIAnalysis → createDesignFromAnalysis(),
**so that** gradient direction, auto-layout coverage, and spacing issues are caught and fixed before I see the result.

---

## Context

The MCP path has `run_refinement_check` as a separate tool call that Claude Code triggers after design creation. The Modes path creates designs in one shot via `createDesignFromAnalysis()`. This story adds a post-creation hook that runs the same structural checks and auto-fixes what it can.

This is the plugin-side complement to MQ-6 (which adds `run_refinement_check` as a Chat mode tool), but integrated into the creation pipeline rather than being a manually called tool.

---

## Acceptance Criteria

1. After `createDesignFromAnalysis()` completes, a `postCreationRefinement(rootNode)` function runs automatically.
2. The function checks:
   - Gradient direction: for frames with GRADIENT_LINEAR fills, verify the solid end (opacity 1.0) is on the same side as text children
   - Auto-layout coverage: frames with 2+ children that have `layoutMode === 'NONE'`
   - Spacing values on the 8px grid: `itemSpacing` and padding values not in `[4,8,12,16,20,24,32,40,48,64,80,96,128]`
3. Auto-fixes applied silently (no UI notification):
   - Auto-layout missing on 2+ child frame → set `layoutMode: 'VERTICAL'`, `itemSpacing: 16`, `primaryAxisAlignItems: 'MIN'`, `counterAxisAlignItems: 'MIN'`
   - `itemSpacing` not on scale → round to nearest valid value in the scale
   - Gradient direction: attempt flip only if the logic can determine the correct direction with confidence; skip if ambiguous (log "gradient direction ambiguous, skipped")
4. The function runs only for designs with 3+ total elements (leaf nodes) — skip for single-element or minimal creates to avoid unnecessary overhead.
5. All fixes are logged via `console.log` for debugging (not shown to user): e.g., "MQ Refinement: auto-layout set on 'Card Frame', spacing 13→16 on 'Content'"
6. The function completes in under 500ms for designs with up to 100 nodes.
7. Build clean: `cd figmento && npm run build`

---

## Tasks / Subtasks

- [x] **Task 1: Create postCreationRefinement function** (AC: 1, 2, 3, 5, 6)
  - Created `figmento/src/refinement.ts` (separate file for separation of concerns)
  - `nearestValidSpacing()`, `countNodes()`, `postCreationRefinement()` all exported
  - Bug fix applied: `frame.itemSpacing = fixed` set BEFORE `fixes.push()` ✓

- [x] **Task 2: Implement gradient direction check** (AC: 2, 3)
  - `gradient-utils.ts` only has `getGradientTransform` (creates matrices, can't detect direction)
  - Gradient fix skipped in v1 per story guidance — logs "gradient direction ambiguous, skipped on [name]" when gradient + text children are both present

- [x] **Task 3: Count total elements, apply 3+ threshold** (AC: 4)
  - `countNodes()` recursive counter exported from `refinement.ts`
  - Threshold check: `if (countNodes(mainFrame) >= 3)` before calling refinement

- [x] **Task 4: Wire into createDesignFromAnalysis()** (AC: 1, 4)
  - Added import in `code.ts`: `import { postCreationRefinement, countNodes } from './refinement'`
  - Wired after `sendProgress('Complete!')`, wrapped in try/catch — failure is silent

- [x] **Task 5: Build and test** (AC: 7)
  - `cd figmento && npm run build` — passes clean (dist/code.js 476.2kb)

---

## Dev Notes

**This function runs in Figma's sandbox** — it has direct access to all node properties via the Figma Plugin API. No WebSocket, no MCP server. Modifications via `frame.layoutMode = 'VERTICAL'` take effect immediately and are reflected in Figma.

**Gradient flip is risky.** Figma's `gradientTransform` is a 2×3 affine matrix. Flipping it incorrectly can produce unexpected results. The conservative approach (skip if ambiguous) is strongly preferred for v1. Reference `figmento/src/gradient-utils.ts` — if existing utilities don't support direction detection, mark the gradient check as a v2 follow-up and focus on auto-layout + spacing for v1.

**Performance:** Walking ~50 nodes and fixing properties takes < 100ms. Well within the 500ms budget.

**Always wrap in try/catch in the call site:**
```typescript
try {
  if (countNodes(rootFrame) >= 3) {
    await postCreationRefinement(rootFrame);
  }
} catch (err) {
  console.warn('MQ Refinement: failed silently', err);
  // Design is already created — do not re-throw
}
```

---

## Files to Create (Option A — preferred)

| File | Purpose |
|------|---------|
| `figmento/src/refinement.ts` | postCreationRefinement() function and helpers |

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/code.ts` | Import postCreationRefinement; wire into createDesignFromAnalysis() with threshold + try/catch |

*(If creating a new file is not practical, add postCreationRefinement directly to `code.ts` at the bottom, before the plugin message handler.)*

---

## Validation

**TEST MQ-8a (bad spacing):** Create a design via Text-to-Layout that produces a frame with `itemSpacing: 13`.
- [x] Console shows "MQ Refinement: spacing 13→12 on ..."
- [x] Frame's spacing in Figma panel shows 12

**TEST MQ-8b (missing auto-layout):** Create a design that has a frame with 3 children but `layoutMode: NONE`.
- [x] Console shows "MQ Refinement: auto-layout set on ..."
- [x] Frame has auto-layout in Figma (VERTICAL shown in panel)

**TEST MQ-8c (single element):** Create a simple single-frame design.
- [x] No "MQ Refinement:" line in console (threshold not met)
- [x] Design delivered normally

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - Bug check: frame.itemSpacing MUST be set to fixed value before fixes.push() — original epic snippet had this backwards
  - Try/catch at call site in createDesignFromAnalysis (failure must be silent)
  - No mutation of read-only Figma nodes (check node.type before writing properties)
  - Async correctness if any figma API calls are async inside walk()
```
