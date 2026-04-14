# Story LC-6: Preference Types & Aggregation Engine

**Status:** Done
**Priority:** High
**Complexity:** M (Medium) — Pure types + pure function with grouping/direction/confidence logic; no UI, no sandbox integration
**Epic:** LC — Learning & Corrections (Phase 4b)
**PRD:** PRD-004 (Learn from User Corrections)
**Depends on:** LC-1 (CorrectionEntry type must exist)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + unit tests for aggregation engine
```

---

## Story

**As a** Figmento developer building the preference learning pipeline,
**I want** shared type definitions and a pure aggregation function,
**so that** all Phase 4b stories (LC-7, LC-8) have a stable, tested foundation.

---

## Description

This is the leaf-node story for Phase 4b. It mirrors the role of LC-1 for Phase 4a. It creates:

1. **Type definitions** — `LearnedPreference` and `ConfidenceLevel` in `packages/figmento-core/src/types.ts`. `LearningConfig` was already added in LC-1 with `enabled`, `autoDetect`, `confidenceThreshold` fields — no changes needed there.

2. **Correction aggregator** — A pure function `aggregateCorrections(corrections: CorrectionEntry[]): LearnedPreference[]` in `figmento/src/correction-aggregator.ts` that:
   - Groups `CorrectionEntry[]` by `property + context` pair
   - Within each group, checks **direction consistency**: requires N≥3 corrections all in the same direction (`increase`, `decrease`, or `change` to the same value). Mixed directions reset the counter.
   - Calculates confidence: correctionCount 3→4 = `'low'`, 5→7 = `'medium'`, 8+ = `'high'`
   - Computes `learnedValue` (if all corrections target the same `afterValue`) or `learnedRange` (min/max of afterValues)
   - Generates a human-readable `description` string (e.g., `"Prefers headline font size ≥96px"`)
   - Deduplication: same `property + context` key updates an existing `LearnedPreference` (by matching `id` from input if provided, or generating a new UUID). `correctionCount` and `correctionIds` accumulate. `lastSeenAt` updates.
   - Returns only preferences where the consistent-direction count ≥ `confidenceThreshold` (default: 3)

3. **Description generator helper** — `describePreference(property, context, direction, value): string` — maps known property+context+direction combos to natural language.

### Why This First

The aggregation logic is the most complex piece of Phase 4b. Building it as pure functions with full test coverage de-risks LC-7 (sandbox integration) and LC-8 (UI hook). No Figma API dependency means it is fully unit-testable.

---

## Acceptance Criteria

- [ ] **AC1:** `LearnedPreference` interface matches PRD-004 §7 exactly — all fields present with correct types: `id`, `property`, `category`, `context`, `direction`, `learnedValue?`, `learnedRange?`, `description`, `confidence`, `correctionCount`, `correctionIds`, `enabled`, `createdAt`, `lastSeenAt`
- [ ] **AC2:** `ConfidenceLevel` type defined as `'low' | 'medium' | 'high'` and exported
- [ ] **AC3:** `aggregateCorrections([])` returns empty array (empty input → no preferences)
- [ ] **AC4:** N<3 corrections in same direction for same property+context → no preference returned
- [ ] **AC5:** Exactly N=3 corrections in same direction → preference returned with `confidence: 'low'`
- [ ] **AC6:** N=5 corrections in same direction → `confidence: 'medium'`
- [ ] **AC7:** N=8 corrections in same direction → `confidence: 'high'`
- [ ] **AC8:** Mixed directions (2 increases + 1 decrease in same property+context) → no preference (direction consistency not met)
- [ ] **AC9:** `learnedValue` set when all afterValues in the group are equal (e.g., 3× fontSize changed to 96 → `learnedValue: 96`). `learnedRange` set when afterValues differ (e.g., 96, 80, 112 → `{ min: 80, max: 112 }`)
- [ ] **AC10:** Two independent property+context groups each meeting N≥3 threshold → two separate `LearnedPreference` entries returned
- [ ] **AC11:** Deduplication: calling `aggregateCorrections` with 5 corrections where 3 already produced a preference from a previous call (IDs present in input `existingPreferences`) correctly updates `correctionCount`, `lastSeenAt`, and `confidence` on the existing preference rather than creating a new entry
- [ ] **AC12:** `description` field is human-readable and non-empty for all returned preferences (e.g., `"Prefers h1 font size increases"`, `"Tends toward larger card corner radius"`)
- [ ] **AC13:** `enabled` defaults to `true` on newly created preferences
- [ ] **AC14:** `category` on returned preference matches `categorizeProperty(property)` from LC-1's diff-calculator (reuse the same mapping: typography / color / spacing / shape)
- [ ] **AC15:** Plugin build passes (`cd figmento && npm run build`)

---

## Tasks

### Phase 1 — Types

- [x] **Task 1:** Add `LearnedPreference` and `ConfidenceLevel` to `packages/figmento-core/src/types.ts`. Place after the existing `LearningConfig` interface (which was added in LC-1). Follow PRD-004 §7 field definitions exactly.

  ```typescript
  export type ConfidenceLevel = 'low' | 'medium' | 'high';

  export interface LearnedPreference {
    id: string;
    property: string;
    category: 'typography' | 'color' | 'spacing' | 'shape';
    context: string;
    direction: 'increase' | 'decrease' | 'change';
    learnedValue?: unknown;
    learnedRange?: { min: unknown; max: unknown };
    description: string;
    confidence: ConfidenceLevel;
    correctionCount: number;
    correctionIds: string[];
    enabled: boolean;
    createdAt: number;
    lastSeenAt: number;
  }
  ```

### Phase 2 — Aggregation Engine

- [x] **Task 2:** Create `figmento/src/correction-aggregator.ts` with:
  - `CONFIDENCE_THRESHOLDS`: `{ low: 3, medium: 5, high: 8 }` constant
  - `getConfidenceLevel(count: number): ConfidenceLevel` helper
  - `describePreference(property: string, context: string, direction: string, value: unknown): string` helper
  - `aggregateCorrections(corrections: CorrectionEntry[], existingPreferences?: LearnedPreference[]): LearnedPreference[]` main export

- [x] **Task 3:** Implement `aggregateCorrections` logic:
  1. Filter to `confirmed: true` corrections only (unconfirmed corrections are not learning signals)
  2. Group by key `${property}::${context}`
  3. For each group: sort by `timestamp`, count consecutive same-direction runs
  4. If the longest consistent-direction run ≥ 3: create or update a `LearnedPreference`
  5. Compute `learnedValue` if all afterValues in the run are equal; otherwise compute `learnedRange`
  6. If `existingPreferences` provided: match by `property + context`, merge (accumulate `correctionCount`, `correctionIds`, update `lastSeenAt`, recalculate `confidence`)
  7. UUID generation: `pref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

### Phase 3 — Unit Tests

- [x] **Task 4:** Create `figmento/src/__tests__/correction-aggregator.test.ts` with tests covering:
  - Empty input → empty output
  - Unconfirmed corrections ignored
  - N<3 same direction → no output
  - N=3 same direction → low confidence
  - N=5 → medium, N=8 → high
  - Mixed directions (3 total: 2 increase + 1 decrease) → no output
  - Longest-run scenario: 5 total corrections, 3 consecutive increases + 2 decreases → preference created from the run of 3 (low confidence)
  - learnedValue (all same afterValue)
  - learnedRange (different afterValues, all increases)
  - Two independent property+context groups
  - Deduplication with existingPreferences
  - description non-empty for all returned preferences

### Phase 4 — Build Verification

- [x] **Task 5:** Verify `cd figmento && npm run build` passes clean.

---

## Dev Notes

- **Import `categorizeProperty` from `diff-calculator.ts`** — do not redefine the category mapping. `correction-aggregator.ts` should `import { categorizeProperty } from './diff-calculator'`. Both modules are pure functions so there is no circular dependency.

- **Only `confirmed: true` corrections count.** The user explicitly confirmed these changes in LC-5's diff panel. Unconfirmed (auto-detected but not acted on) corrections from Phase 4b should also be excluded. The signal must be intentional.

- **Direction consistency algorithm:** For a group of corrections, find the longest run of the same `direction` value (using the corrections sorted by timestamp). If multiple runs tie, use the latest one (most recent behavior is stronger signal). Only the consistent-run count matters for the N≥3 threshold — not the total group size.

- **`learnedValue` vs `learnedRange`:**
  - If all `afterValue` entries in the consistent run are numerically equal → `learnedValue = afterValue[0]`
  - If `afterValues` vary but all in the same direction (all increases) → `learnedRange = { min: Math.min(...), max: Math.max(...) }`
  - For color (`direction: 'change'`): `learnedValue` = the most recent `afterValue`; no range

- **`describePreference` format examples:**
  - `('fontSize', 'h1', 'increase', 96)` → `"Prefers h1 font size ≥96px"`
  - `('cornerRadius', 'card', 'increase', null)` → `"Tends toward larger card corner radius"`
  - `('fills', 'root-frame', 'change', '#0A0A0F')` → `"Prefers dark background (#0A0A0F range)"`
  - `('itemSpacing', 'section', 'increase', 64)` → `"Prefers section item spacing ≥64px"`

- **No Figma API imports.** `correction-aggregator.ts` must be zero-dependency on Figma globals. Pure TypeScript only.

- **File placement pattern:** Following LC-1's pattern, place `correction-aggregator.ts` directly in `figmento/src/` (same level as `diff-calculator.ts`, `snapshot-serializer.ts`).

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `packages/figmento-core/src/types.ts` | MODIFY | Add `ConfidenceLevel` type + `LearnedPreference` interface after `LearningConfig` |
| `figmento/src/correction-aggregator.ts` | CREATE | `aggregateCorrections()` pure function, `describePreference()` helper, confidence constants |
| `figmento/src/__tests__/correction-aggregator.test.ts` | CREATE | Unit tests covering all AC scenarios |

---

## Definition of Done

- [x] `LearnedPreference` and `ConfidenceLevel` compile clean and importable via `import { LearnedPreference } from '../types'`
- [x] `aggregateCorrections()` returns correct results for: empty, N<3, N=3 (low), N=5 (medium), N=8 (high), mixed directions, learnedValue, learnedRange, deduplication
- [x] `cd figmento && npm run build` passes clean
- [x] No existing functionality affected

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | @sm (River) | Story drafted from PRD-004 Phase 4b. Leaf node — preference types + pure aggregation engine. Mirrors LC-1 pattern. |
| 2026-03-13 | @po (Pax) | Validated: 9/10. Fixed: added longest-run edge case to Task 4 test list. Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Implemented: ConfidenceLevel + LearnedPreference types added to packages/figmento-core/src/types.ts. correction-aggregator.ts created with CONFIDENCE_THRESHOLDS, getConfidenceLevel, describePreference, aggregateCorrections. 25 unit tests written (correction-aggregator.test.ts), all pass. Build clean, 396 tests pass. Status → Ready for Review. |
| 2026-04-12 | @qa (Quinn) | **QA Gate: PASS.** 15/15 ACs verified. `aggregateCorrections`, `CONFIDENCE_THRESHOLDS`, `getConfidenceLevel`, `describePreference` confirmed in correction-aggregator.ts. Types at packages/figmento-core/src/types.ts:855-872. 25 unit tests cover all confidence tiers + deduplication + direction consistency. Status: Ready for Review → Done. |
