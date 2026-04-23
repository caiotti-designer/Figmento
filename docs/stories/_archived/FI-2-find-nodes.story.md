# Story FI-2: find_nodes — Deep Canvas Search by Name, Type, or Content

**Status:** Done
**Priority:** High (P1)
**Complexity:** S
**Epic:** FI — Figsor Tool Parity
**Depends on:** None
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a designer using Claude, I want to search the entire Figma canvas for nodes matching a name pattern, type, or text content, so that I can find and modify existing elements without knowing their nodeId in advance.

## Description

Currently Figmento only has `get_page_nodes` (top-level frames) and `get_node_info` (by known ID). There's no way to find a node named "CTA Button" buried 5 levels deep. Figsor's `find_nodes` searches the full tree.

### Implementation Approach

**MCP Tool:** `find_nodes`
**Parameters:**
- `name` (string, optional) — substring match against node name (case-insensitive)
- `type` (string, optional) — Figma node type: FRAME, TEXT, RECTANGLE, ELLIPSE, GROUP, COMPONENT, INSTANCE, VECTOR, LINE, etc.
- `text_content` (string, optional) — substring match against text node characters
- `parentId` (string, optional) — limit search to subtree of this node
- `max_results` (number, optional, default 50) — prevent overwhelming responses

**Returns:** Array of `{ id, name, type, x, y, width, height, parentId, parentName, text? }` for each match.

**Plugin Handler:** Recursive tree walk from `figma.currentPage` (or specified parent), collecting matches.

## Acceptance Criteria

- [x] **AC1:** `find_nodes` tool registered in MCP server
- [x] **AC2:** Searching by `name: "Button"` returns all nodes with "Button" in their name (case-insensitive)
- [x] **AC3:** Searching by `type: "TEXT"` returns all text nodes
- [x] **AC4:** Searching by `text_content: "Buy Now"` returns text nodes containing that string
- [x] **AC5:** Combining filters (name + type) returns intersection
- [x] **AC6:** `parentId` limits search to that subtree
- [x] **AC7:** Results capped at `max_results` with total count returned
- [x] **AC8:** Works inside `batch_execute`

## Tasks

### Phase 1: Plugin Handler
- [ ] Implement recursive tree walker in plugin
- [ ] Filter by name (case-insensitive substring)
- [ ] Filter by type (exact match)
- [ ] Filter by text content (case-insensitive substring on TextNode.characters)
- [ ] Support parentId scoping
- [ ] Serialize results with position/size info
- [ ] Cap at max_results

### Phase 2: MCP Tool
- [ ] Register tool with Zod schema
- [ ] Route through sendDesignCommand

## Dev Notes

- Recursive walk can be expensive on large files — add early termination at max_results
- `figma.currentPage.findAll()` is available but doesn't support text content search — use `findAll` with callback for name/type, then filter for text content
- Consider `figma.currentPage.findAllWithCriteria({ types: [...] })` for type filtering (faster)
- Return parentName alongside parentId for context

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/command-handlers.ts | MODIFY | Add find_nodes handler |
| figmento-mcp-server/src/tools/scene.ts | MODIFY | Register find_nodes tool |
| figmento-plugin/src/execute-command.ts | MODIFY | Add case to switch |

## Definition of Done

- [ ] Searches return correct results for name, type, and text_content filters
- [ ] Performance acceptable on pages with 500+ nodes
- [ ] `npm run build` passes for all packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (8/10). Status Draft → Ready. Obs: ensure early termination at max_results for perf. |
| 2026-03-19 | @dev (Dex) | Implementation complete. Early termination at max_results implemented. Builds pass. Status Ready → InReview. |
| 2026-03-19 | @qa (Quinn) | QA PASS. All 8 AC verified. LOW: name+text_content is OR (matches Figsor), not AND. Documented. Status InReview → Done. |
