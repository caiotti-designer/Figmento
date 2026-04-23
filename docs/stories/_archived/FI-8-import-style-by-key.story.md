# Story FI-8: import_style_by_key — Team Library Style Import

**Status:** Done
**Priority:** Medium (P2)
**Complexity:** S
**Epic:** FI — Figsor Tool Parity
**Depends on:** None
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a designer using Claude on a Figma Pro/Org account, I want to import paint and text styles from team libraries by style key, so that I can apply our shared design tokens to elements created by Claude.

## Description

Companion to FI-7. While `import_component_by_key` imports component instances, this tool imports reusable styles (colors, text styles, effects) from published libraries so they can be applied via `apply_style`.

### Implementation Approach

**MCP Tool:** `import_style_by_key`
**Parameters:**
- `key` (string) — style key
- `type` (string) — "PAINT" | "TEXT" | "EFFECT"

**Returns:** `{ id, name, type, key, description }` of the imported style (now available locally).

**Plugin Handler:**
- PAINT: `figma.importPaintStyleByKeyAsync(key)`
- TEXT: `figma.importTextStyleByKeyAsync(key)`
- EFFECT: `figma.importEffectStyleByKeyAsync(key)`

## Acceptance Criteria

- [ ] **AC1:** `import_style_by_key` tool registered in MCP server
- [ ] **AC2:** Importing a paint style makes it available for `apply_style`
- [ ] **AC3:** Importing a text style makes it available for `apply_style`
- [ ] **AC4:** Importing an effect style makes it available for `apply_style`
- [ ] **AC5:** Invalid key returns descriptive error
- [ ] **AC6:** Works inside `batch_execute`

## Tasks

- [ ] Add plugin handler with type-based dispatch to correct import method
- [ ] Register MCP tool with Zod schema
- [ ] Add to execute-command switch

## Dev Notes

- After importing, the style exists locally in the file — can be applied with existing `apply_style` tool
- Style keys available via Figma URL or from `get_local_styles` output in files that already use them
- Same Pro-only caveat as FI-7

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/command-handlers.ts | MODIFY | Add import_style_by_key handler |
| figmento-mcp-server/src/tools/design-system.ts | MODIFY | Register tool |
| figmento-plugin/src/execute-command.ts | MODIFY | Add case to switch |

## Definition of Done

- [ ] All 3 style types import successfully
- [ ] Imported styles visible in Figma's local styles panel
- [ ] `npm run build` passes for all packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (8/10). Status Draft → Ready. |
| 2026-03-19 | @dev (Dex) | Implementation complete. Wraps figma.importStyleByKeyAsync(). All builds pass. Status Ready → Done. |
