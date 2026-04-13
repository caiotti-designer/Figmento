# Story SP-8: Chat Engine Tool Batching — Server-Side Command Aggregation

**Status:** Ready
**Priority:** High (P1)
**Complexity:** L
**Epic:** SP — Speed & Performance
**Depends on:** None
**PRD:** Performance analysis (2026-03-21)

## Story

As a designer using the Figma plugin chat (API path), I want my designs to generate as fast as they do via Claude Code, so that the chat experience doesn't feel sluggish compared to MCP.

## Problem

The chat engine (`chat-engine.ts`) routes every tool call individually through the relay:

```
Claude returns 8 tool_use blocks →
  for each tool_use:
    sendToPlugin(action, params)   ← 1 WS round-trip each
    wait for response
    push tool_result
```

Each WS round-trip costs ~100-200ms (Railway relay). A design with 20 plugin commands = **20 round-trips = 2-4s of pure network overhead**.

Meanwhile, Claude Code's MCP path uses `batch_execute` which packs 22 commands per round-trip — the same 20 commands complete in **1 round-trip = ~150ms overhead**.

**Speed gap: ~16x slower for the same work.**

The AI loop also adds a `sleep(500)` between iterations (line 1496), compounding the delay for multi-iteration designs.

## Solution

Add a server-side batching layer in `handleChatTurn` that:
1. Collects consecutive Figma plugin tool calls from a single AI response
2. Groups them into a single `batch_execute` command with `tempId` support
3. Sends one WS round-trip per batch instead of one per tool
4. Returns individual tool_results back to Claude as if they were separate calls

### What Gets Batched

Tool calls that route through `sendToPlugin` (line 1262-1264) — the "all other tools" catch-all. These are Figma plugin commands like `create_frame`, `create_text`, `set_style`, etc.

### What Does NOT Get Batched

- `generate_image` — server-side Gemini call, not a plugin command
- `analyze_canvas_context` — composite tool with its own sequencing
- `fill_contextual_images` — composite tool
- `update_memory` — no WS call
- Local intelligence tools (`LOCAL_TOOL_NAMES`) — resolved from bundled YAML
- Any tool where a subsequent tool_use depends on the result of a previous one (dependency chain)

### Dependency Detection

The tricky part: Claude may return tool_use blocks where tool B's input references tool A's output. Since we don't have `tempId` semantics in the AI response, use this heuristic:

- **Independent calls:** Different tool names with no overlapping parameter values → safe to batch
- **Sequential fallback:** If any tool_use input contains a string that looks like a nodeId from a prior tool_use result → execute that tool sequentially, then continue batching the rest
- **Conservative default:** When unsure, execute sequentially — correctness > speed

### Architecture

```
Current:
  toolUses.forEach(t => sendToPlugin(t.name, t.input))  // N round-trips

Proposed:
  const { batchable, sequential } = classifyToolUses(toolUses)
  if (batchable.length > 0):
    sendToPlugin('batch_execute', { commands: batchable })  // 1 round-trip
  sequential.forEach(t => sendToPlugin(t.name, t.input))   // only for deps
```

## Acceptance Criteria

- [ ] **AC1:** Consecutive Figma plugin tool calls in a single AI response are grouped into one `batch_execute` WS round-trip
- [ ] **AC2:** Tool calls with dependencies (output → input references) are detected and executed sequentially
- [ ] **AC3:** Each batched tool's result is mapped back to the correct `tool_use_id` in the Claude history
- [ ] **AC4:** Local/composite tools (`generate_image`, `analyze_canvas_context`, `fill_contextual_images`, `update_memory`, local intelligence) are excluded from batching
- [ ] **AC5:** Failed commands in a batch produce individual `is_error: true` tool_results — don't fail the entire batch
- [ ] **AC6:** The `sleep(500)` between iterations is reduced to `sleep(100)` or removed (was a rate-limit safeguard, not architecturally required)
- [ ] **AC7:** End-to-end design time for a 20-command chat turn is within 2x of equivalent Claude Code MCP execution (down from ~16x)

## Tasks

### Phase 1: Tool Classification

- [ ] Create `classifyToolUses(toolUses, previousResults)` function
- [ ] Identify batchable vs sequential tool calls based on name + input analysis
- [ ] Map LOCAL_TOOL_NAMES, composite tools, and `update_memory` as non-batchable
- [ ] Detect dependency chains (input referencing prior output nodeIds)

### Phase 2: Batch Assembly

- [ ] Convert classified batchable tool_use blocks into `batch_execute` command format
- [ ] Assign `tempId` to each command for result mapping
- [ ] Send single `batch_execute` through `sendToPlugin`
- [ ] Decompose batch response into individual tool_results with correct `tool_use_id`

### Phase 3: Integration

- [ ] Replace the `for (const toolUse of toolUses)` loop (line 1518) with batch-aware execution
- [ ] Preserve existing error handling (orphaned tool_use protection)
- [ ] Preserve vision image handling for screenshot tools
- [ ] Reduce or remove `sleep(500)` between iterations (line 1496)

### Phase 4: Validation

- [ ] Test: 5+ create_* calls in one AI response → batched into 1 round-trip
- [ ] Test: create_frame + create_text(parentId=$frame) → dependency detected, sequential
- [ ] Test: mix of local + plugin tools → only plugin tools batched
- [ ] Test: batch with 1 failing command → other commands succeed, correct error mapping
- [ ] Compare end-to-end timing: before vs after for a typical design turn

## Scope

### IN
- Server-side batching in `chat-engine.ts` tool loop
- Dependency detection heuristic
- Sleep reduction between iterations

### OUT
- Changes to the plugin's `canvas-batch.ts` (already handles batch_execute correctly)
- Changes to MCP server batch logic (already optimized)
- Parallel execution within batches (Figma plugin limitation)
- Client-side (plugin UI) changes

## Risks

| Risk | Mitigation |
|------|-----------|
| False dependency detection → unnecessary sequential execution | Conservative: only batch when clearly independent. Worst case = current speed (no regression) |
| Batch failure breaks Claude's tool_result expectations | Each command in batch_execute already returns individual results; map them correctly |
| Claude generates nodeId references across tool_use blocks | Dependency detector catches these; sequential fallback preserves correctness |

## Dev Notes

- The plugin's `canvas-batch.ts` already supports `batch_execute` with `tempId` resolution — no plugin changes needed
- `sendToPlugin` (line 1148) wraps `relay.sendCommandToChannel` — batch_execute is just another action name
- The `sleep(500)` at line 1496 was likely added for API rate limiting during development — Claude API handles its own rate limits, this is unnecessary latency
- Chunk size of 22 from MCP server is a good reference but may not apply here — the chat path typically gets 3-8 tool calls per AI response, rarely 22+
- `truncateForHistory` (line 1547) must still apply to each individual result in the batch — don't truncate the whole batch response as one blob

## File List

| File | Change |
|------|--------|
| `figmento-ws-relay/src/chat/chat-engine.ts` | Add batching logic to tool loop |
| `figmento-ws-relay/src/chat/chat-batch.ts` | New — `classifyToolUses()` + `assembleBatch()` + `decomposeBatchResult()` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-21 | @pm | Story created from performance analysis |
| 2026-04-13 | @po (Pax) | **Validation GO — 9/10.** Perf gap quantified (16x → target 2x), dependency detection heuristic explicit, 7 testable ACs, explicit IN/OUT scope, risks with mitigations. Minor: DoD merged into ACs. Status: Draft → Ready. |
