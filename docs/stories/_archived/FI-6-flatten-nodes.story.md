# Story FI-6: flatten_nodes — Flatten to Single Editable Vector

**Status:** Done
**Priority:** Low (P3)
**Complexity:** S
**Epic:** FI — Figsor Tool Parity
**Depends on:** FI-4
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a designer using Claude, I want to flatten multiple nodes into a single editable vector, so that I can merge complex grouped shapes into one clean vector path for export or further editing.

## Description

Flattening converts groups, boolean operations, or multiple shapes into a single VectorNode with merged paths. Figma provides `figma.flatten()` natively.

### Implementation Approach

**MCP Tool:** `flatten_nodes`
**Parameters:**
- `nodeIds` (string[]) — array of node IDs to flatten
- `name` (string, optional) — name for the resulting vector

**Returns:** `{ id, name, type, width, height }` of the flattened VectorNode.

## Acceptance Criteria

- [ ] **AC1:** `flatten_nodes` tool registered in MCP server
- [ ] **AC2:** Flattening a group produces single VectorNode
- [ ] **AC3:** Flattening a BooleanOperationNode produces single VectorNode
- [ ] **AC4:** Result named per `name` parameter
- [ ] **AC5:** Works inside `batch_execute`

## Tasks

- [ ] Add plugin handler calling `figma.flatten(nodes)`
- [ ] Register MCP tool with Zod schema
- [ ] Add to execute-command switch

## Dev Notes

- `figma.flatten()` takes `ReadonlyArray<BaseNode>` and returns a `VectorNode`
- Input nodes are consumed (removed from tree), replaced by the result
- Very straightforward wrapper — smallest story in the epic

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/command-handlers.ts | MODIFY | Add flatten_nodes handler |
| figmento-mcp-server/src/tools/creation.ts | MODIFY | Register flatten_nodes tool |
| figmento-plugin/src/execute-command.ts | MODIFY | Add case to switch |

## Definition of Done

- [ ] Flatten produces single vector from multiple inputs
- [ ] `npm run build` passes for all packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (8/10). Status Draft → Ready. |
| 2026-03-19 | @dev (Dex) | Implementation complete. Wraps figma.flatten(). All builds pass. Status Ready → Done. |
