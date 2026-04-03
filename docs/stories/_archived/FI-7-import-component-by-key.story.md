# Story FI-7: import_component_by_key — Team Library Component Import

**Status:** Done
**Priority:** High (P1)
**Complexity:** M
**Epic:** FI — Figsor Tool Parity
**Depends on:** None
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a designer using Claude on a Figma Pro/Org account, I want to import components from my team's published libraries by component key, so that I can use our existing design system components instead of recreating them from scratch.

## Description

Figma Pro users publish shared libraries with components (buttons, inputs, cards, etc.). Currently Figmento can only create primitive shapes or use its built-in component recipes. With `import_component_by_key`, Claude can import and instantiate real team library components.

### Implementation Approach

**MCP Tool:** `import_component_by_key`
**Parameters:**
- `key` (string) — component key (from Figma URL or `list_components` output)
- `parentId` (string, optional) — parent frame to place the instance
- `x`, `y` (number, optional) — position
- `name` (string, optional) — override instance name

**Returns:** `{ id, name, type, width, height, componentId }` of the created ComponentInstance.

**Plugin Handler:** Uses `figma.importComponentByKeyAsync(key)` → returns ComponentNode → call `.createInstance()` → position and parent.

## Acceptance Criteria

- [ ] **AC1:** `import_component_by_key` tool registered in MCP server
- [ ] **AC2:** Valid component key imports the component and creates an instance
- [ ] **AC3:** Instance placed at specified x/y position
- [ ] **AC4:** Instance parented to specified parentId
- [ ] **AC5:** Invalid key returns descriptive error ("Component not found or not published")
- [ ] **AC6:** Free account returns graceful error explaining Pro requirement
- [ ] **AC7:** Works inside `batch_execute`

## Tasks

### Phase 1: Plugin Handler
- [ ] Call `figma.importComponentByKeyAsync(key)`
- [ ] Handle rejection (not found, not published, no access)
- [ ] Create instance via `.createInstance()`
- [ ] Set position and parent
- [ ] Return instance info

### Phase 2: MCP Tool
- [ ] Register tool with Zod schema
- [ ] Route through sendDesignCommand

## Dev Notes

- `figma.importComponentByKeyAsync()` is async and can fail if the component isn't published or the user lacks access
- Component keys look like: `a1b2c3d4e5f6...` (40-char hex strings)
- Users can find keys via: Figma URL → right-click component → "Copy link" → extract key from URL
- Consider adding a `search_team_library` tool later to discover components by name
- Study Figsor's implementation: `figsor-master/src/plugin/code.js` search "import_component_by_key"

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/command-handlers.ts | MODIFY | Add import_component_by_key handler |
| figmento-mcp-server/src/tools/design-system.ts | MODIFY | Register tool |
| figmento-plugin/src/execute-command.ts | MODIFY | Add case to switch |

## Definition of Done

- [ ] Imports component from team library and places instance on canvas
- [ ] Errors handled gracefully for missing/unpublished components
- [ ] `npm run build` passes for all packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (8/10). Status Draft → Ready. Good AC6 coverage (free account edge case). |
| 2026-03-19 | @dev (Dex) | Implementation complete. Supports ComponentSets with variant selection. All builds pass. Status Ready → Done. |
