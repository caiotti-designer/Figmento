# Story SP-6: Skip Auto-Evaluation on Intermediate Batches

**Status:** Done
**Priority:** High (P1)
**Complexity:** XS (1 point) — 1 logic change in batch.ts
**Epic:** Speed Pipeline — Cold-Start & Execution Optimization
**Depends on:** None
**PRD:** PM analysis 2026-03-15 — Save ~3s per intermediate batch call

---

## Business Value

`batch_execute` currently runs `run_refinement_check` + `get_screenshot` automatically when ≥5 commands are executed and `autoEvaluate !== false`. In a typical design flow, the agent calls `batch_execute` 2-3 times (scaffold, content, styling). Only the FINAL batch needs evaluation. Skipping auto-evaluation on intermediate batches saves ~3 seconds per skipped call.

## Out of Scope

- Changing the auto-evaluate logic for `create_design` (separate tool)
- Removing auto-evaluate capability entirely

## Risks

- None — this is a default behavior change. The agent or CLAUDE.md rules already recommend passing `autoEvaluate: false` on intermediate calls; this just makes the default smarter.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** auto-evaluation to only run when explicitly requested,
**so that** intermediate batch calls don't waste 3 seconds each on unnecessary quality checks.

---

## Description

### Problem

In `batch.ts:260-262`, the auto-evaluate condition is:
```typescript
const shouldEvaluate = params.autoEvaluate !== false
  && data.summary.total >= 5
  && data.createdNodeIds?.length > 0;
```

This means `autoEvaluate` defaults to `true` — every batch of 5+ commands that creates nodes triggers a refinement check + screenshot. The agent must explicitly pass `autoEvaluate: false` to skip it.

### Solution

Flip the default: `autoEvaluate` defaults to `false` for `batch_execute`. Only run evaluation when `autoEvaluate` is explicitly set to `true`. This aligns with the intended usage — the agent passes `autoEvaluate: true` on the final batch only.

---

## Acceptance Criteria

- [x] **AC1:** `batch_execute` only runs auto-evaluation when `autoEvaluate` is explicitly `true` (not when undefined/omitted)
- [x] **AC2:** `create_design` retains its current default behavior (`!== false` on line 221 — unchanged)
- [x] **AC3:** Schema description for `autoEvaluate` in `batchExecuteSchema` reflects the new default (`false`)
- [x] **AC4:** `npm run build` succeeds

---

## Tasks

### Phase 1: Flip Default (AC1, AC3)

- [x] Change condition from `params.autoEvaluate !== false` to `params.autoEvaluate === true`
- [x] Update `autoEvaluate` description in `batchExecuteSchema` to say "Default false"

### Phase 2: Preserve create_design Default (AC2)

- [x] Verified `create_design` has its own independent check: `params.autoEvaluate !== false` on line 221 — unchanged

### Phase 3: Verify (AC4)

- [x] Run `npm run build` — passes

---

## Dev Notes

- This is a one-line logic change: `!== false` → `=== true`
- The `create_design` tool at line 214-231 has its own auto-evaluate logic — verify it's independent and doesn't reference `batchExecuteSchema`'s default
- CLAUDE.md already instructs the agent to pass `autoEvaluate: false` on non-final batches — this change just makes the default match the recommended practice

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/batch.ts` | MODIFY | Flip autoEvaluate default from true to false for batch_execute |

---

## Definition of Done

- [ ] Auto-evaluate only runs when explicitly requested
- [ ] create_design default unchanged
- [ ] Schema description updated
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation 9/10 → GO. Note: CLAUDE.md should be updated post-ship. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. All ACs met. Build passes. |
