# Story FI-10: export_as_svg — SVG Markup Export

**Status:** Done
**Priority:** Medium (P2)
**Complexity:** M
**Epic:** FI — Figsor Tool Parity
**Depends on:** None
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a designer using Claude, I want to export Figma nodes as SVG markup (not just raster images), so that I can use the vector data in code, websites, or further processing.

## Description

Figmento currently exports as PNG/JPG/SVG via `export_node`, but only as base64-encoded files. Figsor's `export_as_svg` returns raw SVG markup as a string, which is more useful for:
- Embedding in HTML/React code
- Editing SVG properties programmatically
- Batch exporting children of a frame as individual SVGs (e.g., icon set)

### Implementation Approach

**MCP Tool:** `export_as_svg`
**Parameters:**
- `nodeId` (string) — node to export
- `include_children` (boolean, optional, default false) — if true, export each direct child as separate SVG
- `include_id` (boolean, optional, default false) — preserve Figma node IDs in SVG

**Returns:**
- Single mode: `{ svg: "<svg>...</svg>" }`
- Children mode: `{ children: [{ name, id, svg }, ...] }`

**Plugin Handler:** Uses `node.exportAsync({ format: 'SVG' })` which returns `Uint8Array` → decode to string.

## Acceptance Criteria

- [ ] **AC1:** `export_as_svg` tool registered in MCP server
- [ ] **AC2:** Single node export returns valid SVG markup string
- [ ] **AC3:** `include_children: true` exports each child as separate SVG
- [ ] **AC4:** SVG markup is valid and renderable
- [ ] **AC5:** Works on frames, vectors, groups, components
- [ ] **AC6:** Works inside `batch_execute`

## Tasks

### Phase 1: Plugin Handler
- [ ] Call `node.exportAsync({ format: 'SVG' })` → Uint8Array
- [ ] Decode Uint8Array to UTF-8 string
- [ ] For children mode: iterate `node.children`, export each
- [ ] Optionally strip/preserve Figma IDs in SVG attributes

### Phase 2: MCP Tool
- [ ] Register tool with Zod schema
- [ ] Route through sendDesignCommand
- [ ] Handle large SVG strings (may need response size awareness)

## Dev Notes

- `exportAsync` with SVG format returns the SVG as bytes — use `TextDecoder` to convert
- SVG output from Figma includes viewBox, preserveAspectRatio, and inline styles
- For children mode, consider limiting to direct children only (not recursive) to control output size
- Large/complex nodes can produce very large SVG strings — consider truncation warning if > 100KB

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/command-handlers.ts | MODIFY | Add export_as_svg handler |
| figmento-mcp-server/src/tools/export.ts | MODIFY | Register export_as_svg tool |
| figmento-plugin/src/execute-command.ts | MODIFY | Add case to switch |

## Definition of Done

- [ ] SVG export produces valid, renderable SVG markup
- [ ] Children mode works for icon sets / component lists
- [ ] `npm run build` passes for all packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (8/10). Status Draft → Ready. Obs: consider adding AC for response size handling (>100KB SVGs). |
| 2026-03-19 | @dev (Dex) | Implementation complete. Single + children modes. SVG bytes → string conversion. All builds pass. Status Ready → Done. |
