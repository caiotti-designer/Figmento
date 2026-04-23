# Story AE-1: Auto-Evaluate After batch_execute and create_design

**Status:** Done (retroactive — @po audit 2026-04-13)
**Priority:** High (P1)
**Complexity:** M (3 points) — MCP server postamble hook, no plugin changes, performance-sensitive
**Epic:** AE — Auto-Evaluation
**Depends on:** None
**PRD:** Architecture Audit 2026-03-14 (Item 2)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento-mcp-server) + batch_execute returns screenshot + refinement score automatically + autoEvaluate=false skips evaluation
```

---

## Story

**As a** Claude Code session creating designs via Figmento,
**I want** `batch_execute` and `create_design` to automatically return a screenshot and refinement score,
**so that** I can self-evaluate design quality without needing to remember to call separate tools.

---

## Description

### Problem

The CLAUDE.md "Mandatory Quality Gate" instructs Claude to call `run_refinement_check` + `evaluate_design` after every design. In practice, Claude skips this 60%+ of the time because nothing enforces it. Designs ship without visual feedback or quality scoring.

### Solution

Add a postamble to `batch_execute` and `create_design` in the MCP server layer. After the batch completes, automatically:

1. Identify the root frame from `createdNodeIds[0]`
2. Call `sendDesignCommand('run_refinement_check', { nodeId })` → get score + issues
3. Call `sendDesignCommand('get_screenshot', { nodeId, scale: 1 })` → get base64 PNG

Return both in the response alongside the existing batch results.

### Skip Conditions

Evaluation is **skipped** (to avoid overhead on small operations) when:
- `autoEvaluate` param is explicitly `false`
- `summary.total < 5` (small batch, not a full design)
- No FRAME type node in `createdNodeIds` (style-only batch)
- The root node lookup fails (nodeId no longer on canvas)

### Performance Budget

| Step | Railway Latency | Local Latency |
|------|----------------|---------------|
| `run_refinement_check` | ~300ms | ~100ms |
| `get_screenshot` (1x scale) | ~800ms | ~400ms |
| **Total overhead** | **~1.1s** | **~500ms** |

For a batch that already takes 3-5s, this is ~25% overhead. Acceptable for automatic quality feedback.

### Response Format

```typescript
{
  results: [...],                    // existing
  summary: { total, succeeded, failed }, // existing
  createdNodeIds: [...],             // existing
  evaluation: {                      // NEW — present when autoEvaluate ran
    score: 78,
    issues: [{ severity: 'error', check: 'gradient-direction', message: '...' }],
    issueCount: { error: 1, warning: 3, info: 2 },
  },
  screenshot: {                      // NEW — present when autoEvaluate ran
    base64: 'iVBORw0KGgo...',
    width: 1080,
    height: 1080,
    mimeType: 'image/png',
  }
}
```

### MCP Content Return

Return the screenshot as an MCP image content block so Claude can see it directly:

```typescript
return {
  content: [
    { type: 'text', text: JSON.stringify({ results, summary, createdNodeIds, evaluation }) },
    { type: 'image', data: screenshot.base64, mimeType: 'image/png' },
  ]
};
```

If autoEvaluate was skipped, return only the text block (current behavior).

---

## Acceptance Criteria

- [ ] AC1: `batch_execute` with 5+ commands and a created FRAME returns `evaluation` object with `score` and `issues` array
- [ ] AC2: `batch_execute` with 5+ commands and a created FRAME returns `screenshot` as MCP image content block
- [ ] AC3: `batch_execute` with `autoEvaluate: false` returns only batch results (no evaluation, no screenshot)
- [ ] AC4: `batch_execute` with `summary.total < 5` skips evaluation automatically
- [ ] AC5: `batch_execute` with no FRAME in `createdNodeIds` skips evaluation automatically
- [ ] AC6: `create_design` returns evaluation + screenshot (same postamble)
- [ ] AC7: Evaluation failure (e.g., node deleted mid-check) does NOT fail the batch — returns batch results with `evaluation: null`
- [ ] AC8: `npm run build` clean
- [ ] AC9: Total overhead of evaluation ≤ 2s on Railway relay

---

## Tasks

### Phase 1: Add autoEvaluate Param

In `figmento-mcp-server/src/tools/batch.ts`:
- Add `autoEvaluate: z.boolean().optional().default(true).describe('Auto-run refinement check + screenshot after batch. Skipped for batches < 5 commands.')` to `batch_execute` schema
- Add same param to `create_design` schema

### Phase 2: Implement Postamble

After `batch_execute` receives response from plugin:

```typescript
let evaluation = null;
let screenshot = null;

const shouldEvaluate = params.autoEvaluate !== false
  && data.summary.total >= 5
  && data.createdNodeIds?.length > 0;

if (shouldEvaluate) {
  const rootId = data.createdNodeIds[0];
  try {
    // Verify it's a FRAME
    const nodeInfo = await sendDesignCommand('get_node_info', { nodeId: rootId });
    if (nodeInfo.type === 'FRAME') {
      const [refResult, ssResult] = await Promise.all([
        sendDesignCommand('run_refinement_check', { nodeId: rootId }).catch(() => null),
        sendDesignCommand('get_screenshot', { nodeId: rootId, scale: 1 }).catch(() => null),
      ]);
      evaluation = refResult;
      screenshot = ssResult;
    }
  } catch {
    // Evaluation failure is non-fatal
  }
}
```

Note: `run_refinement_check` and `get_screenshot` can run in **parallel** — they don't depend on each other.

### Phase 3: Format Response

Build MCP content array:
- Always include text block with batch results + evaluation (if present)
- Conditionally include image block if screenshot succeeded

### Phase 4: Apply Same Postamble to create_design

`create_design` handler already returns `{ nodeId }`. Use `data.nodeId` directly as the root frame for evaluation — NOT `data.createdNodeIds[0]` (which is batch-specific and doesn't exist on `create_design` responses).

---

## Dev Notes

- **Screenshot scale = 1** (not 2). Full resolution doubles payload for marginal benefit. Claude's vision works fine at 1x.
- **`run_refinement_check` is handled server-side** in the plugin's `runRefinementCheck()` function — it walks the node tree and returns issues. No YAML knowledge needed.
- **`get_screenshot` returns `{ base64, width, height, name }`** — extract `base64` for the MCP image block.
- **Promise.all for parallelism** — refinement check and screenshot have no dependency on each other. Run both concurrently to cut overhead from ~1.1s to ~800ms.
- **Failure isolation is critical** — if the node was deleted between batch completion and evaluation, or if export fails, the batch result must still be returned successfully. Wrap the entire postamble in try/catch.
- **Do not call `evaluate_design`** — that tool does export + structural analysis and is heavier. We only need `run_refinement_check` (score/issues) + `get_screenshot` (visual).
- **AC9 measurement method:** Measure wall-clock delta between `batch_execute` with `autoEvaluate: false` vs `autoEvaluate: true` on the same batch (same commands, same relay). Run 3 times, take median. Target: ≤ 2s overhead on Railway production relay.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/batch.ts` | MODIFY | Add autoEvaluate param + postamble to batch_execute and create_design |

---

## Definition of Done

- [ ] `npm run build` clean
- [ ] batch_execute returns evaluation + screenshot for 5+ command batches
- [ ] batch_execute skips evaluation for small batches and non-FRAME batches
- [ ] create_design returns evaluation + screenshot
- [ ] Evaluation failure does not break batch response
- [ ] Overhead ≤ 2s measured on Railway

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment |
| 2026-03-14 | @pm (Morgan) | Applied @po clarifications: explicit create_design nodeId path in Phase 4, AC9 measurement method in Dev Notes. Status Draft → Ready |
| 2026-04-13 | @po (Pax) | **Retroactive Done.** Audit confirms `autoEvaluate` param in `figmento-mcp-server/src/tools/batch.ts` for both `create_design` (line 287) and `batch_execute` (line 324) with skip logic for batches <5 commands. Status: Ready → Done. |
