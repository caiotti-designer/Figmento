# FN-P3-1: Enhanced Batch DSL — Repeat, Conditional, Property Access

| Field | Value |
|-------|-------|
| **Story ID** | FN-P3-1 |
| **Epic** | FN — Figma Native Agent Migration |
| **Status** | Done |
| **Author** | @sm (River) |
| **Executor** | @dev (Dex) |
| **Gate** | @qa |
| **Created** | 2026-03-25 |
| **Complexity** | M (Medium) |
| **Priority** | HIGH |

---

## Description

Extend the existing `batch_execute` handler in the Figma plugin sandbox with three new DSL constructs that enable the chat AI to express complex multi-element designs in a single round-trip instead of N sequential tool calls. This is the recommended Path A from the FN-P3 feasibility spike (`docs/architecture/fn-p3-execute-code-feasibility.md`), chosen because Figma's plugin sandbox blocks `eval`/`new Function`, making raw JavaScript execution impossible.

### Current State

The `batch_execute` handler (`figmento/src/handlers/canvas-batch.ts`) already supports:
- **Sequential command execution**: iterates an array of `{ action, params, tempId? }` objects
- **`tempId` variable capture**: when a command has `tempId` and the result contains `nodeId`, the mapping `tempId → nodeId` is stored
- **`$tempId` references**: the `resolveTempIds` utility (`figmento/src/utils/temp-id-resolver.ts`) replaces `$refName` strings in params with actual node IDs from the map — supports nested objects and arrays
- **Per-command error isolation**: failures are recorded per-command but do not abort the batch

### What This Story Adds

Three new constructs, processed by the batch handler alongside regular commands:

**1. Repeat construct** — Generates N copies of a command template with index interpolation:
```json
{
  "action": "repeat",
  "count": 5,
  "template": {
    "action": "create_frame",
    "params": { "name": "Card ${i}", "x": "${i * 320}", "width": 300, "height": 400 },
    "tempId": "card_${i}"
  }
}
```
- `${i}` in string values is replaced with the current 0-based index
- `${i * N}`, `${i + N}`, `${i * N + M}` arithmetic expressions are evaluated (simple integer math only — multiply, add, subtract)
- `tempId` in the template also supports `${i}` interpolation, producing `card_0`, `card_1`, etc.
- Each expanded command is executed sequentially through `executeSingleAction`, inheriting the shared `tempIdMap`

**2. Conditional construct** — Executes one of two command arrays based on whether a tempId resolved:
```json
{
  "action": "if",
  "condition": "exists($cardFrame)",
  "then": [
    { "action": "create_text", "params": { "parentId": "$cardFrame", "content": "Title" } }
  ],
  "else": [
    { "action": "create_frame", "params": { "name": "Fallback" }, "tempId": "cardFrame" }
  ]
}
```
- `exists($name)` checks whether `name` exists in the `tempIdMap` (i.e., a previous command produced a nodeId for that tempId)
- The chosen branch (`then` or `else`) is an array of regular commands (or nested DSL constructs) executed sequentially
- If `else` is omitted and condition is false, the construct is a no-op

**3. Property access on tempId results** — Access fields beyond `nodeId` from previous command results:
```json
{ "action": "create_text", "params": { "x": "$card.width", "content": "$card.name" } }
```
- Current behavior: `$card` resolves to the `nodeId` string only
- New behavior: `$card.propertyName` resolves to the named property from the command's full result object (e.g., `width`, `height`, `name`, `childCount`)
- The `tempIdMap` changes from `Map<string, string>` to `Map<string, Record<string, unknown>>` — storing the entire result object. `$card` (no dot) still resolves to `result.nodeId` for backward compatibility
- `resolveTempIds` is updated to detect the `$name.prop` pattern and resolve accordingly

### Why This Matters

A 30-command design that currently requires 30 individual MCP tool calls (each a WebSocket round-trip of ~300ms) takes ~10 seconds. With Enhanced Batch DSL, the same design is expressed as a single `batch_execute` call with repeat constructs, executing in <1 second (1 WS round-trip, sequential in-sandbox execution). This is the single highest-impact performance optimization available without Figma platform changes.

---

## Acceptance Criteria

- [x] AC1: `batch_execute` accepts `{ action: "repeat", count, template }` commands — the template is expanded into `count` individual commands with `${i}` interpolation in all string values within `params` and in `tempId`
- [x] AC2: `${i}` interpolation supports simple arithmetic: `${i * N}`, `${i + N}`, `${i - N}`, `${i * N + M}`, `${i * N - M}` where N and M are integer literals
- [x] AC3: `batch_execute` accepts `{ action: "if", condition, then, else? }` commands — `exists($name)` condition checks tempIdMap, executes `then` or `else` branch accordingly
- [x] AC4: `then` and `else` branches support nested DSL constructs (repeat inside if, if inside repeat)
- [x] AC5: Property access `$name.property` resolves to the named property from the stored result of the command that produced `tempId: "name"` — `$name` without a dot still resolves to `nodeId` (backward compatibility)
- [x] AC6: The `tempIdMap` stores full result objects, not just nodeId strings — the type changes from `Map<string, string>` to `Map<string, Record<string, unknown>>`, with `$name` resolving to `result.nodeId` for backward compat
- [x] AC7: Repeat has a hard cap of 50 iterations per construct — exceeding this throws an error for that command without aborting the batch
- [x] AC8: Total expanded command count per batch is capped at 200 — if expansion (repeats + conditionals) would exceed 200, the batch is rejected before execution begins with a clear error message
- [x] AC9: Batch execution has a 30-second timeout — if elapsed time exceeds 30s, remaining commands are skipped and partial results are returned
- [x] AC10: Existing `batch_execute` calls with plain command arrays (no repeat/if/property-access) work identically to before — zero regression
- [x] AC11: All three constructs work together in a single batch (e.g., a repeat that generates frames, followed by a conditional that checks one of them, with property access in subsequent commands)
- [x] AC12: Error in a repeat iteration does not abort subsequent iterations — each expanded command has its own success/failure entry in the results array
- [x] AC13: The batch result `summary` includes `expandedTotal` (total commands after expansion) in addition to existing `total`, `succeeded`, `failed`

---

## Scope

### IN Scope

- Extending `handleBatchExecute` in `figmento/src/handlers/canvas-batch.ts` with repeat, conditional, and property access constructs
- Updating `resolveTempIds` in `figmento/src/utils/temp-id-resolver.ts` to support `$name.property` dot-access pattern
- Changing `tempIdMap` type from `Map<string, string>` to `Map<string, Record<string, unknown>>` and ensuring backward compat for `$name` → `nodeId`
- Adding `${i}` interpolation with simple arithmetic evaluation
- Security caps: 50 iterations per repeat, 200 total expanded commands, 30s execution timeout
- Pre-expansion validation (count total before executing)

### OUT of Scope

- System prompt changes (FN-P3-2)
- MCP server-side changes — the MCP `batch_execute` tool definition already accepts arbitrary JSON in the `commands` array; no schema changes needed
- Raw JavaScript execution (`execute_code` — rejected by feasibility spike)
- Nested repeat constructs (repeat inside repeat) — V1 does not need this; repeat inside if and if inside repeat are sufficient
- Expression evaluation beyond simple `i`-based arithmetic (no general math engine)
- WebSocket relay changes — the relay forwards command payloads transparently

---

## Technical Notes

### Implementation Plan

**1. Update `temp-id-resolver.ts`**

The `resolveTempIds` function currently checks `value.startsWith('$')` and does a direct `tempIdMap.get(refId)` lookup. It needs to:
- Detect `$name.property` pattern (split on first `.` after the `$`)
- If dot-access: look up `name` in tempIdMap, get the result object, return `result[property]`
- If no dot: look up `name` in tempIdMap, return `result.nodeId` (backward compat)
- The map type changes to `Map<string, Record<string, unknown>>`

**2. Update `handleBatchExecute` in `canvas-batch.ts`**

Currently stores only `nodeId` in tempIdMap:
```typescript
if (command.tempId && response.nodeId) {
  tempIdMap.set(command.tempId, response.nodeId as string);
}
```

Changes to store the full response:
```typescript
if (command.tempId) {
  tempIdMap.set(command.tempId, response);
}
```

Add a pre-processing step that expands the command array before the execution loop:
1. Walk the command array
2. For `repeat` commands: expand into N copies with `${i}` interpolation
3. For `if` commands: leave in place (evaluated at execution time, since the condition depends on runtime tempIdMap state)
4. Count total expanded commands; reject if >200

The execution loop then handles:
- Regular commands: execute as before
- `if` commands: evaluate condition against current tempIdMap, recursively execute the chosen branch

**3. Expression interpolation**

A minimal evaluator for `${...}` in string values:
- Pattern: `${i}`, `${i * 320}`, `${i + 1}`, `${i * 320 + 40}`
- Implementation: regex match `\$\{([^}]+)\}`, parse the expression as `i OP literal` or `i OP literal OP literal`, evaluate with the current index value
- NOT a general expression parser — only `i` variable, only `*`, `+`, `-` operators, only integer literals

**4. Timeout mechanism**

Record `Date.now()` at batch start. Before each command execution, check if elapsed > 30000ms. If so, skip remaining commands and return partial results with a `timedOut: true` flag.

### Files Modified

| File | Change |
|------|--------|
| `figmento/src/utils/temp-id-resolver.ts` | Add `$name.property` dot-access resolution; change map type |
| `figmento/src/handlers/canvas-batch.ts` | Add repeat expansion, conditional evaluation, timeout, expanded command counting, full-result storage in tempIdMap |

### Backward Compatibility

The key concern is that `tempIdMap` changes from `Map<string, string>` to `Map<string, Record<string, unknown>>`. All existing consumers of `$tempId` references expect a string (the nodeId). The `resolveTempIds` function must return `result.nodeId` when the reference has no dot-access, preserving the exact current behavior. The `tempIdResolutions` field in the batch result (returned as `Object.fromEntries(tempIdMap)`) will change from `{ name: "nodeId" }` to `{ name: { nodeId: "...", ...otherProps } }` — this is a non-breaking change for the MCP server, which forwards this data transparently.

---

## Dependencies

- None — this story modifies only plugin sandbox code
- No dependency on FN-0 (Architecture Assessment) — this is an evolution of existing `batch_execute`, not a migration to `use_figma`

---

## Definition of Done

- [x] Repeat construct works: `{ action: "repeat", count: 3, template: { action: "create_frame", params: { name: "Card ${i}" } } }` creates 3 frames named "Card 0", "Card 1", "Card 2"
- [x] Conditional construct works: `{ action: "if", condition: "exists($root)", then: [...] }` executes `then` branch when `$root` is in tempIdMap
- [x] Property access works: `$root.width` resolves to the width value from the create_frame result
- [x] Backward compat: existing batch_execute calls from MCP server work without changes
- [x] Security: repeat with count > 50 fails gracefully, batch with > 200 expanded commands is rejected, execution stops after 30s
- [x] Plugin builds cleanly (`npm run build` in `figmento/`)

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Expression interpolation edge cases (negative numbers, float results) | Medium | Low | Restrict to integer arithmetic only; document allowed patterns; reject non-integer results |
| tempIdMap type change breaks MCP server processing of `tempIdResolutions` | Low | Medium | MCP server forwards transparently; add explicit test that `$name` without dot still resolves to nodeId string |
| Deeply nested conditionals cause stack overflow | Low | Low | Recursion depth cap of 5 levels; V1 scope excludes nested repeats |
| Large repeat counts cause UI thread jank | Medium | Medium | 50-iteration cap + 30s timeout; each iteration is a single Figma API call (~1-5ms) so 50 iterations = 50-250ms |

---

## File List

| File | Action | Description |
|------|--------|-------------|
| `figmento/src/utils/temp-id-resolver.ts` | MODIFIED | Added `TempIdMap` type export, `$name.property` dot-access resolution, refactored to support `Map<string, Record<string, unknown>>` |
| `figmento/src/handlers/canvas-batch.ts` | MODIFIED | Added repeat construct, conditional construct, `${i}` interpolation with arithmetic, full-result tempIdMap storage, security caps (50/200/30s/5-depth), `expandedTotal` in summary, `timedOut` flag |
| `docs/stories/FN-P3-1.story.md` | MODIFIED | AC checkboxes, status, change log, file list |

---

## QA Results

| Check | Result | Notes |
|-------|--------|-------|
| AC verification (13/13) | PASS | All ACs verified against source code in `canvas-batch.ts` and `temp-id-resolver.ts` |
| Security caps | PASS | 50 iter / 200 expanded / 30s timeout / 5-depth — all enforced in code |
| Backward compat | PASS | `$name` without dot resolves to `result.nodeId` — zero regression |
| Error isolation | PASS | Per-command try/catch, partial results returned on timeout |
| Type safety | PASS | `TempIdMap` type exported, `DSLCommand` union type covers all constructs |
| **Gate verdict** | **PASS** | 13/13 ACs, 6/6 DoD, no issues found |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-25 | @sm (River) | Story drafted from FN-P3 feasibility spike (Path A). Analyzed existing `canvas-batch.ts` handler (sequential execution, tempId capture, $ref resolution), `temp-id-resolver.ts` (string-only $ref, nested object/array support), and `command-router.ts` (40+ actions dispatched via switch). Three constructs scoped: repeat, conditional, property access. Security caps defined: 50 iter, 200 expanded, 30s timeout. |
| 2026-03-25 | @po (Pax) | **Validated: GO (10/10).** All 10 criteria pass. Verified stories match existing codebase (canvas-batch.ts Map<string, string> on line 35, nodeId-only storage on line 44, temp-id-resolver.ts string-only $ref). Security caps in ACs (not just notes). Backward compat for $name→nodeId in AC5/AC6. tempIdResolutions format change documented. Note: AC1 checkbox pre-checked — reset to [ ] before dev. Status: Draft → Ready. |
| 2026-03-25 | @dev (Dex) | **Implementation complete (AC1-AC13).** Modified `temp-id-resolver.ts`: changed map type to `Map<string, Record<string, unknown>>`, added `$name.property` dot-access resolution, exported `TempIdMap` type. Modified `canvas-batch.ts`: added repeat construct with `${i}` arithmetic interpolation, conditional construct with `exists($name)`, full-result tempIdMap storage, security caps (50 iter / 200 expanded / 30s timeout / 5-level nesting), `expandedTotal` in summary, `timedOut` flag. Backward compat preserved: `$name` alone resolves to `result.nodeId`. Plugin builds cleanly. Status: Ready → InProgress. |
| 2026-04-11 | @qa (Quinn) | **QA Gate: PASS.** 13/13 ACs verified against code. All security caps match spec. Backward compat confirmed. No issues found. Status: InProgress → Done. |
