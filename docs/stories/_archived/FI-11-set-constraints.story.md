# Story FI-11: set_constraints — Responsive Constraints

**Status:** Done
**Priority:** Low (P3)
**Complexity:** S
**Epic:** FI — Figsor Tool Parity
**Depends on:** None
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a designer using Claude, I want to set responsive constraints on nodes (pin to edges, stretch, scale), so that designs adapt correctly when their parent frame is resized.

## Description

Figma constraints control how child nodes behave when their parent is resized. Without constraints, elements stay at fixed positions — making designs fragile. Figsor's `set_constraints` maps to Figma's constraint system.

### Implementation Approach

**MCP Tool:** `set_constraints`
**Parameters:**
- `nodeId` (string) — target node
- `horizontal` (string) — "MIN" (left) | "CENTER" | "MAX" (right) | "STRETCH" | "SCALE"
- `vertical` (string) — "MIN" (top) | "CENTER" | "MAX" (bottom) | "STRETCH" | "SCALE"

**Plugin Handler:** Sets `node.constraints = { horizontal, vertical }`.

## Acceptance Criteria

- [ ] **AC1:** `set_constraints` tool registered in MCP server
- [ ] **AC2:** Setting horizontal "STRETCH" makes node stretch with parent width
- [ ] **AC3:** Setting vertical "MIN" pins node to top edge
- [ ] **AC4:** All 5 horizontal × 5 vertical combinations work
- [ ] **AC5:** Invalid constraint values return descriptive error
- [ ] **AC6:** Works inside `batch_execute`
- [ ] **AC7:** Only applies to nodes inside non-auto-layout frames (auto-layout uses layoutAlign instead)

## Tasks

- [ ] Add plugin handler setting `node.constraints`
- [ ] Validate that parent is not auto-layout (constraints don't apply in auto-layout — return warning)
- [ ] Register MCP tool with Zod schema
- [ ] Add to execute-command switch

## Dev Notes

- Constraints ONLY apply to direct children of frames that do NOT use auto-layout
- In auto-layout frames, use `layoutAlign` and `layoutGrow` instead — this tool should return a helpful error if the parent uses auto-layout
- `node.constraints` is a simple `{ horizontal: ConstraintType, vertical: ConstraintType }` object
- Study Figsor's implementation: `figsor-master/src/plugin/code.js` search "set_constraints"

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/command-handlers.ts | MODIFY | Add set_constraints handler |
| figmento-mcp-server/src/tools/styling.ts | MODIFY | Register set_constraints tool |
| figmento-plugin/src/execute-command.ts | MODIFY | Add case to switch |

## Definition of Done

- [ ] Constraints apply correctly and survive parent resize
- [ ] Auto-layout parent case handled with helpful message
- [ ] `npm run build` passes for all packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (8/10). Status Draft → Ready. Obs: AC7 (auto-layout guard) is critical — ensure helpful error message. |
| 2026-03-19 | @dev (Dex) | Implementation complete. Auto-layout guard returns warning with parent name and layoutMode. All 5 constraint values validated. All builds pass. Status Ready → Done. |
