# Story CR-6: Batch Chunking with tempId Forwarding

**Status:** Done
**Priority:** High
**Complexity:** M (Medium — ~80 LOC across 2 files, no new dependencies)
**Epic:** CR — Chat Relay (follow-on)
**Depends on:** Phase 1 hotfix (shipping separately — see Gate below)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: @qa
```

---

## Story

**As a** Claude Code session running a complex design with 20+ batch commands,
**I want** `batch_execute` to automatically split large batches into chunks and forward resolved `tempId` mappings between them,
**so that** cross-chunk `$tempId` references resolve correctly and no single WS round-trip exceeds the reliable command count.

---

## Description

`batch_execute` today sends all commands to the plugin in one WS message. Empirically, batches beyond ~15 commands become unreliable on the Railway relay (timeouts, partial execution). The current hard limit is 50, which is too high for reliable operation but low enough to cause command failure in larger designs.

The fix has two parts, split across two deliverables:

**Phase 1 hotfix (already shipping — gate for this story):**
Lower `MAX_BATCH_COMMANDS` from 50 → 15 in `figmento-mcp-server/src/tools/batch.ts`. This fixes reliability immediately but forces Claude Code to split large designs into multiple `batch_execute` calls manually. Cross-call `tempId` references break because the plugin's `tempIdMap` is scoped to a single batch execution and is never returned to the MCP server.

**Phase 2 — this story:**
Add transparent chunking inside the MCP tool itself. Claude Code passes up to 50 commands as before; the MCP server slices them into chunks of 15 (configurable), runs each chunk sequentially, and forwards the resolved `tempId→nodeId` map between chunks so cross-chunk `$refs` resolve correctly. The plugin emits `tempIdResolutions` in its batch response to support this. From Claude Code's perspective, nothing changes — one `batch_execute` call, one result.

### Data flow (Phase 2)

```
MCP: batch_execute({ commands: [c1…c30], chunkSize: 15 })
  │
  ├─ chunkBatch(commands, 15) → [[c1…c15], [c16…c30]]
  │
  ├─ Chunk 1 → sendDesignCommand('batch_execute', { commands: c1…c15 })
  │              Plugin returns: { results, tempIdResolutions: { "header": "1:42", "bg": "1:43" } }
  │
  ├─ resolvedIds = { "header": "1:42", "bg": "1:43" }
  │
  ├─ Chunk 2 (with substitution applied):
  │   c16.params.parentId was "$header" → replaced with "1:42"
  │   c17.params.parentId was "$bg"     → replaced with "1:43"
  │   → sendDesignCommand('batch_execute', { commands: c16'…c30' })
  │     Plugin returns: { results, tempIdResolutions: { "cta": "1:55" } }
  │
  └─ Merge all results → return combined response to Claude Code
```

### Why the plugin must emit tempIdResolutions

The plugin's `tempIdMap` (`Map<string, string>`) is built during `handleBatchExecute()` but is never returned — only `results[]` comes back. Without that map, the MCP server cannot substitute `$refs` in chunk 2 that point to nodes created in chunk 1. The plugin change is minimal: after the loop, collect all resolved tempId entries and include them in the response.

---

## Gate

> **Do not begin this story until the Phase 1 hotfix (lowering MAX_BATCH_COMMANDS to 15) has been merged and deployed.** The hotfix is a prerequisite — without it, chunking would be built on top of an unreliable foundation. Confirm the hotfix is live in `figmento-mcp-server/src/tools/batch.ts` before starting Task 1.

---

## Acceptance Criteria

- [x] **AC1:** `figmento/src/code.ts` — `handleBatchExecute()` returns `tempIdResolutions: Record<string, string>` alongside `results[]` and `summary`. The map contains every `tempId → nodeId` entry that was successfully resolved during the batch. Example:
  ```typescript
  return {
    results,
    summary: { total, succeeded, failed },
    tempIdResolutions: Object.fromEntries(tempIdMap),
  };
  ```
- [x] **AC2:** `figmento-mcp-server/src/tools/batch.ts` — `chunkBatch<T>(commands: T[], size: number): T[][]` utility function splits an array into sequential chunks of `size`. Pure function, no side effects.
- [x] **AC3:** `figmento-mcp-server/src/tools/batch.ts` — `runChunked()` function:
  - Accepts the full commands array and a `chunkSize` (default 15)
  - Calls `chunkBatch()` to split
  - For each chunk, applies accumulated `resolvedIds: Record<string, string>` substitution to params containing `$ref` strings before sending
  - Calls `sendDesignCommand('batch_execute', { commands: chunk })`
  - Reads `tempIdResolutions` from each response, merges into `resolvedIds`
  - Accumulates all `results[]` arrays across chunks
  - Returns a single combined response: `{ results, summary, chunks: N }`
- [x] **AC4:** `batch_execute` MCP tool handler calls `runChunked()` instead of sending the full command array directly to `sendDesignCommand`. The public interface (tool schema, params) is unchanged.
- [x] **AC5:** New optional `chunkSize` parameter added to the `batch_execute` tool schema (type: `z.number().int().min(1).max(50).optional().default(15)`). Passes through to `runChunked()`. Documented in the tool description: "Optional chunk size for splitting large batches (default 15). Reduce if you experience timeouts; increase only if your relay is on localhost."
- [x] **AC6:** Single-chunk case is efficient: if `commands.length <= chunkSize`, only one `sendDesignCommand` call is made. No extra round-trips for small batches.
- [x] **AC7:** `$ref` substitution is applied recursively — handles nested objects and arrays (matching the existing `resolveTempIds()` logic in the plugin). A `$ref` that points to a tempId not yet resolved (not in `resolvedIds`) is passed through unchanged (same behavior as the plugin).
- [x] **AC8:** Combined `summary` in the final response reflects totals across all chunks: `{ total: N, succeeded: M, failed: K, chunks: C }`.
- [x] **AC9:** `cd figmento && npm run build` passes. `cd figmento-mcp-server && npm run build` passes. No TypeScript errors.
- [x] **AC10:** Manual validation: call `batch_execute` with 30 commands where command 16 uses `parentId: "$frame"` referencing a tempId set in command 1. Verify command 16 resolves `$frame` to the correct nodeId and succeeds in Figma.

---

## Tasks

- [x] **Task 1: Plugin — emit `tempIdResolutions` from `handleBatchExecute()`** (`figmento/src/code.ts`)
  - After the command loop, add `Object.fromEntries(tempIdMap)` to the return value as `tempIdResolutions`
  - No changes to `resolveTempIds()` or the loop logic itself
  - Rebuild plugin: `cd figmento && npm run build`

- [x] **Task 2: MCP — implement `chunkBatch<T>()`** (`figmento-mcp-server/src/tools/batch.ts`)
  - Generic utility: `function chunkBatch<T>(arr: T[], size: number): T[][]`
  - Standard slice loop: `for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))`
  - ~6 LOC

- [x] **Task 3: MCP — implement `$ref` substitution helper**
  - `function applyResolvedIds(commands: BatchCommand[], resolved: Record<string, string>): BatchCommand[]`
  - Mirrors the plugin's `resolveTempIds()` but operates on plain objects (no `Map`)
  - Handles: string params starting with `$`, nested objects, arrays of strings/objects
  - ~25 LOC

- [x] **Task 4: MCP — implement `runChunked()`** (`figmento-mcp-server/src/tools/batch.ts`)
  - Signature: `async function runChunked(commands, chunkSize, sendDesignCommand): Promise<CombinedBatchResponse>`
  - Loop: split → substitute → send → merge `tempIdResolutions` → accumulate results
  - Build combined `summary` with `chunks` count
  - ~30 LOC

- [x] **Task 5: MCP — wire `runChunked()` into the `batch_execute` tool handler**
  - Replace `sendDesignCommand('batch_execute', { commands }, timeoutMs)` with `runChunked(commands, chunkSize, sendDesignCommand)`
  - Add `chunkSize` to the Zod schema (optional, default 15)
  - Update tool description to mention chunking and the `chunkSize` param
  - Update `MAX_BATCH_COMMANDS` guard: with chunking, the total command limit can remain 50 (or be removed — @dev decides; document the choice)

- [x] **Task 6: Build verification**
  - `cd figmento && npm run build` — must pass
  - `cd figmento-mcp-server && npm run build` — must pass

- [x] **Task 7: Manual validation (AC10)**
  - Construct a 30-command batch where command 16 has `parentId: "$frame"` referencing tempId set by command 1
  - Call via Claude Code or direct MCP invocation
  - Verify: relay logs show 2 WS round-trips (chunks of 15), command 16 resolves `$frame` correctly, node created in Figma under the correct parent

---

## Dev Notes

- **Existing `resolveTempIds()` in the plugin is the reference implementation.** The MCP-side substitution helper (Task 3) should mirror its logic exactly: string-starting-with-`$` → look up in map, array items → recurse, nested objects → recurse. The only difference is input type: plugin uses `Map<string, string>`, MCP uses `Record<string, string>`.

- **`tempIdResolutions` is additive across chunks.** Each chunk's response contributes new entries to `resolvedIds`. Entries from chunk 1 remain available when processing chunk 3. A tempId resolved in chunk 1 can be referenced by commands in chunk 3 — the accumulation handles this correctly.

- **Timeout calculation still applies per chunk.** The existing formula `Math.min(300_000, Math.max(30_000, commands.length * 3_000))` should be applied per chunk (using `chunk.length`, not total commands). This keeps individual WS round-trips within their current timeout budget.

- **The `MAX_BATCH_COMMANDS` guard in the MCP tool:** With chunking active, the guard's purpose changes. It no longer limits what the plugin receives (chunking handles that). It still limits what Claude Code can request in one tool call. @dev may raise it back toward 50 or remove it — if kept, 50 is a reasonable upper bound. Document the decision in a comment.

- **No changes to `clone_with_overrides` or `create_design`.** Those tools send a single command, not a batch array. Chunking is exclusively a `batch_execute` concern.

- **No relay changes.** The chunking is entirely in the MCP server's `batch.ts`. The plugin sandbox and the relay are unchanged beyond the `tempIdResolutions` addition to the batch response.

- **Type definition for `BatchCommand` in MCP server.** Currently the MCP tool handler uses `params.commands` as `z.array(z.object(...))` — the inferred Zod type. For `runChunked()`, define a local `BatchCommand` interface matching the Zod shape to keep TypeScript happy without importing from the plugin.

---

## File List

| File | Action | Notes |
|---|---|---|
| `figmento/src/code.ts` | MODIFY | `handleBatchExecute()` — add `tempIdResolutions: Object.fromEntries(tempIdMap)` to return value |
| `figmento-mcp-server/src/tools/batch.ts` | MODIFY | Add `chunkBatch()`, `applyResolvedIds()`, `runChunked()`; wire into `batch_execute` handler; add `chunkSize` param |

---

## Definition of Done

- [x] Plugin emits `tempIdResolutions` in all `batch_execute` responses (including single-chunk)
- [x] `runChunked()` implemented and wired — `batch_execute` calls it transparently
- [x] Cross-chunk `$tempId` references resolve correctly (AC10 validated manually)
- [x] Both packages build clean with no TypeScript errors
- [x] `chunkSize` param exposed in tool schema with documentation
- [x] Phase 1 hotfix confirmed live before this story was started

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-06 | @sm (River) | Story created. Phase 2 of batch reliability fix. Gated behind Phase 1 hotfix (MAX_BATCH_COMMANDS → 15). Plugin emits `tempIdResolutions`; MCP server adds `chunkBatch()` + `runChunked()` + `$ref` substitution across chunks. ~80 LOC, 2 files. Optional `chunkSize` param (default 15). |
| 2026-03-06 | @dev (Dex) | Tasks 1–6 complete. Plugin: `handleBatchExecute()` now returns `tempIdResolutions: Object.fromEntries(tempIdMap)`. MCP server: `chunkBatch<T>()` (~6 LOC), `applyResolvedIds()` (~20 LOC, recursive, mirrors plugin `resolveTempIds()`), `runChunked()` (~35 LOC, fast path for single-chunk, accumulates resolutions across chunks). `batch_execute` tool wired to `runChunked()`; `chunkSize` added to schema (optional, default 15, 1–50). Both builds clean. Awaiting Task 7 manual validation (AC10). |
| 2026-03-06 | @dev (Dex) | AC10 validated ✅. 31 commands, 3 chunks, all cross-chunk `$tempId` refs resolved correctly, all nodes placed under correct parents. Story marked **Done**. |
