# Story SP-3: Batch Chunk Size Optimization

**Status:** Done
**Priority:** High (P1)
**Complexity:** XS (1 point) — 1 constant change + optional schema update
**Epic:** Speed Pipeline — Cold-Start & Execution Optimization
**Depends on:** None
**PRD:** PM analysis 2026-03-15 — Reduce WS round-trips, ~2s savings

---

## Business Value

A typical 50-command design creates 4 WS round-trips at chunk size 15 (ceil(50/15) = 4). Increasing to 22 reduces this to 3 chunks (ceil(50/22) = 3), saving one full round-trip (~500ms-1.5s). For smaller designs (15-22 commands), this eliminates chunking entirely — single round-trip.

## Out of Scope

- Dynamic chunk size based on relay latency (future optimization)
- Changing MAX_BATCH_COMMANDS (stays at 50)

## Risks

- Larger chunks may timeout on Railway relay under high load — mitigated by keeping below 25 (tested safe threshold from memory notes)

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
**I want** batch design execution to use fewer WebSocket round-trips,
**so that** my designs complete 1-2 seconds faster.

---

## Description

### Problem

`DEFAULT_CHUNK_SIZE = 15` in `batch.ts:10` is conservative. Memory notes confirm batches of 15 are reliable but batches of 30+ tend to timeout. The sweet spot is 20-25.

### Solution

Change `DEFAULT_CHUNK_SIZE` from `15` to `22`. Update the schema description to reflect the new default.

---

## Acceptance Criteria

- [x] **AC1:** `DEFAULT_CHUNK_SIZE` is `22` in `batch.ts`
- [x] **AC2:** Schema description for `chunkSize` parameter reflects the new default value (uses template literal)
- [x] **AC3:** `npm run build` succeeds

---

## Tasks

### Phase 1: Change Constant (AC1-AC3)

- [x] Change `DEFAULT_CHUNK_SIZE = 15` to `DEFAULT_CHUNK_SIZE = 22` on line 10 of `batch.ts`
- [x] `chunkSize` description in `batchExecuteSchema` already uses `${DEFAULT_CHUNK_SIZE}` template literal — auto-updated
- [x] Tool description string already uses `${DEFAULT_CHUNK_SIZE}` — auto-updated
- [x] Run `npm run build` — passes

---

## Dev Notes

- The `chunkSize` parameter already uses the constant via template literal in the schema description — if the description uses the constant, it auto-updates
- Memory note: "Max ~15 commands per batch is reliable; larger batches (30+) tend to timeout on the Railway relay" — 22 stays safely under the 30 threshold
- Users can still override with `chunkSize` parameter per call

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/batch.ts` | MODIFY | Change DEFAULT_CHUNK_SIZE from 15 to 22 |

---

## Definition of Done

- [ ] Default chunk size is 22
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation 10/10 → GO. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. All ACs met. Build passes. |
