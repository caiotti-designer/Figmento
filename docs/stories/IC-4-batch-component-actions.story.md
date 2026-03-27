# Story IC-4: Batch Support for Component Actions

**Status:** Done
**Priority:** Medium (P2) — enables single-roundtrip component workflows
**Complexity:** S (3 points) — extending existing batch infrastructure
**Epic:** IC — Interactive Components
**Depends on:** IC-1, IC-2, IC-3 (all component handlers must exist)
**PRD:** [PRD-007](../prd/PRD-007-interactive-components.md) — Phase 1

---

## Business Value

The most common component workflow is: create 2-3 variant components → combine as variants → create an instance. Without batch support, this requires 4-5 sequential WS roundtrips (200-500ms each). With batch support and `tempId` chaining, the entire flow executes in one roundtrip — critical for Phase 2/3 where AI generates interactive components automatically.

## Prior Art (What Already Works)

| Capability | Status | Location |
|-----------|--------|----------|
| `batch_execute` (50 commands/batch) | Working | `batch.ts` + `canvas-batch.ts` |
| `tempId` reference system (`$tempId`) | Working | `canvas-batch.ts` — resolves `$ref` to nodeId from prior batch command |
| Existing batch actions (create_frame, create_text, set_fill, etc.) | Working | `canvas-batch.ts` switch statement |

## Out of Scope

- Batch support for `set_reactions` (IC-5 — Phase 2)
- Batch support for `apply_interaction` (IC-7 — Phase 2)

## Risks

- `combine_as_variants` in batch context requires sequential execution — `$v1` and `$v2` must resolve before `combine_as_variants` reads them. The existing batch engine already processes commands sequentially (not parallel), so this should work, but verify the `tempId` resolution order is deterministic.
- Array params with `$tempId` references (e.g., `componentIds: ["$v1", "$v2"]`) need the resolver to walk arrays, not just top-level string params. Verify existing batch resolver handles this.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, single batch creates components + combines variants + creates instance via tempId chain"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** design agent creating interactive components,
**I want** to batch all component operations in a single call,
**so that** creating a complete component set with variants and instances takes one WS roundtrip instead of five.

---

## Description

### Solution

Add 5 new case branches to `canvas-batch.ts`'s batch action handler, routing to the handlers created in IC-1/2/3. The `tempId` reference system already resolves `$ref` strings — component handlers just need to be callable from the batch context.

### Key Integration: tempId Chain

```json
[
  { "action": "create_component", "params": { "name": "state=default", "width": 200, "height": 48 }, "tempId": "v1" },
  { "action": "create_component", "params": { "name": "state=hover", "width": 200, "height": 48 }, "tempId": "v2" },
  { "action": "combine_as_variants", "params": { "componentIds": ["$v1", "$v2"], "name": "Button" }, "tempId": "btnSet" },
  { "action": "create_instance", "params": { "componentId": "$btnSet", "x": 500, "y": 100 } }
]
```

---

## Acceptance Criteria

- [ ] AC1: `create_component` available as batch action with `tempId` support — returned `nodeId` resolvable via `$tempId`
- [ ] AC2: `convert_to_component` available as batch action with `tempId` support
- [ ] AC3: `combine_as_variants` available as batch action — `componentIds` array resolves `$tempId` references
- [ ] AC4: `create_instance` available as batch action — `componentId` resolves `$tempId` reference
- [ ] AC5: `detach_instance` available as batch action
- [ ] AC6: End-to-end test: single `batch_execute` creates 2 components, combines as variants, creates instance — all via `tempId` chain (4 commands, 1 roundtrip)
- [ ] AC7: Failed individual commands don't abort the batch (existing batch behavior preserved)
- [ ] AC8: Plugin builds cleanly

---

## File List

| File | Action | Purpose |
|------|--------|---------|
| `figmento/src/handlers/canvas-batch.ts` | Modify | Add 5 batch action cases routing to component handlers |
| `figmento-mcp-server/src/tools/components.ts` | Modify | Document batch support in tool descriptions |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | @pm (Morgan) via Claude | Story drafted from PRD-007 Phase 1. |
| 2026-03-26 | @po (Pax) | Validated 9/10 (added missing Risks section). Status → Ready. |
