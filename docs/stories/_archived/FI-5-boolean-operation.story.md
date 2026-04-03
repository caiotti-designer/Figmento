# Story FI-5: boolean_operation — Vector Boolean Operations

**Status:** Done
**Priority:** Medium (P2)
**Complexity:** M
**Epic:** FI — Figsor Tool Parity
**Depends on:** FI-4
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a designer using Claude, I want to perform boolean operations (union, subtract, intersect, exclude) on vector shapes, so that I can create complex compound shapes like icons, logos, and cut-out effects.

## Description

Boolean operations combine two or more shapes into compound vectors. Figma's Plugin API provides `figma.union()`, `figma.subtract()`, `figma.intersect()`, `figma.exclude()` natively. This is a thin wrapper.

### Implementation Approach

**MCP Tool:** `boolean_operation`
**Parameters:**
- `operation` (string) — "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE"
- `nodeIds` (string[]) — array of node IDs to combine (order matters for subtract)
- `name` (string, optional) — name for the resulting BooleanOperationNode

**Returns:** `{ id, name, type, width, height }` of the resulting BooleanOperation node.

**Plugin Handler:** Calls `figma.union(nodes)`, `figma.subtract(nodes)`, etc.

## Acceptance Criteria

- [ ] **AC1:** `boolean_operation` tool registered in MCP server
- [ ] **AC2:** UNION combines overlapping shapes into one
- [ ] **AC3:** SUBTRACT removes second shape from first
- [ ] **AC4:** INTERSECT keeps only overlapping area
- [ ] **AC5:** EXCLUDE keeps everything except overlap
- [ ] **AC6:** Works with 2+ nodes
- [ ] **AC7:** Result named per `name` parameter
- [ ] **AC8:** Invalid nodeIds return descriptive error
- [ ] **AC9:** Works inside `batch_execute`

## Tasks

### Phase 1: Plugin Handler
- [ ] Resolve node IDs to SceneNode[]
- [ ] Validate all nodes exist and are on same page
- [ ] Call appropriate `figma.union/subtract/intersect/exclude`
- [ ] Rename result node if `name` provided
- [ ] Return result node info

### Phase 2: MCP Tool
- [ ] Register tool with Zod schema
- [ ] Route through sendDesignCommand

## Dev Notes

- `figma.union()` etc. take `ReadonlyArray<BaseNode>` and return a `BooleanOperationNode`
- For SUBTRACT, the first node in the array is the base, subsequent nodes are subtracted
- All input nodes must be on the current page
- The resulting node replaces the input nodes in the layer tree
- Study Figsor's implementation: `figsor-master/src/plugin/code.js` search "boolean_operation"

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/command-handlers.ts | MODIFY | Add boolean_operation handler |
| figmento-mcp-server/src/tools/creation.ts | MODIFY | Register boolean_operation tool |
| figmento-plugin/src/execute-command.ts | MODIFY | Add case to switch |

## Definition of Done

- [ ] All 4 operations produce correct visual results
- [ ] Works with rectangles, ellipses, and vectors
- [ ] `npm run build` passes for all packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (8/10). Status Draft → Ready. |
| 2026-03-19 | @dev (Dex) | Implementation complete. Wraps figma.union/subtract/intersect/exclude. All builds pass. Status Ready → Done. |
