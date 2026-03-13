# Story SU-2.1: Extract Zod Schemas as Named Exports

**Status:** Ready
**Priority:** High
**Complexity:** M (Medium — mechanical refactor across 17 files, ~140 LOC net, no logic changes)
**Epic:** Schema Unification
**Depends on:** SU-1 (schema gaps closed)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: MCP server build passing clean
```

---

## Story

**As a** schema generator script (SU-2.2),
**I want** every Zod input schema in `figmento-mcp-server/src/tools/*.ts` to be available as a named export,
**so that** the generator can import them directly by name, convert them to JSON Schema, and write the authoritative `tools-schema.generated.ts` — eliminating the handwritten plugin schema entirely.

---

## Description

Currently every `server.tool(name, desc, { ...schema... }, handler)` call has its schema defined inline as an anonymous object literal. This makes the schema inaccessible from outside the module.

SU-2.2 needs to import each tool's schema object directly. This story performs the mechanical extraction:

```typescript
// BEFORE (inline, anonymous):
server.tool(
  'create_frame',
  'Create a frame on the Figma canvas...',
  {
    name: z.string().optional().describe('Frame name'),
    width: z.number().describe('Width in pixels'),
    // ...
  },
  async (params) => { ... }
);

// AFTER (named export):
export const createFrameSchema = {
  name: z.string().optional().describe('Frame name'),
  width: z.number().describe('Width in pixels'),
  // ...
};

server.tool('create_frame', 'Create a frame on the Figma canvas...', createFrameSchema, async (params) => { ... });
```

This is a pure structural refactor — **no logic changes, no schema changes, no behavior changes**. The only output observable to a user is the same list of MCP tools with identical schemas.

### Naming Convention

`camelCase(tool_name) + 'Schema'`:

| Tool name | Export name |
|---|---|
| `create_frame` | `createFrameSchema` |
| `set_fill` | `setFillSchema` |
| `batch_execute` | `batchExecuteSchema` |
| `run_refinement_check` | `runRefinementCheckSchema` |
| `get_layout_blueprint` | `getLayoutBlueprintSchema` |
| `connect_to_figma` | `connectToFigmaSchema` |

All 17 files must be updated. For tools with empty schemas (`{}`), still extract: `export const getSelectionSchema = {};`.

### TypeScript Notes

- Do **not** add explicit type annotations to the exported const — TypeScript will infer the correct type.
- If extracting a schema const introduces a new **TS2589** ("Type instantiation is excessively deep") error on the `server.tool()` call, add `// @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK v1.26 + zod 3.25` on the line before `server.tool(`. Do not add it preemptively — only where the build breaks.
- Existing `@ts-expect-error` comments (e.g., `refinement.ts` line 257) must be preserved exactly as-is.

---

## What is NOT in scope

- No changes to handler functions (`async (params) => { ... }`)
- No changes to tool descriptions (the string argument to `server.tool()`)
- No changes to schema field names, types, or `.describe()` text
- No new tools, no removed tools
- No changes to `intelligence.ts` tool schemas that already use `z.string()` workarounds — preserve them as-is
- SU-2.2 (generator script) and SU-2.3 (snapshot test) are separate stories

---

## Acceptance Criteria

- [ ] **AC1:** All 17 files in `figmento-mcp-server/src/tools/` have their Zod input schemas extracted into named `export const` declarations following the `camelCase(name) + 'Schema'` convention.
- [ ] **AC2:** Every `server.tool(name, desc, SCHEMA, handler)` call passes the named constant as its 3rd argument — no inline object literals remain as 3rd arguments.
- [ ] **AC3:** The named schema exports are at module level (not inside the `registerXTools` function body), so they can be imported externally.
- [ ] **AC4:** No schema field, type, `.describe()` string, `.optional()`, `.default()`, or enum value is changed. The refactor is structurally identical.
- [ ] **AC5:** `cd figmento-mcp-server && npm run build` passes with no TypeScript errors. If any new TS2589 errors appear, they are suppressed with the documented `@ts-expect-error` pattern — not by changing the schema.
- [ ] **AC6:** No changes to any file outside `figmento-mcp-server/src/tools/*.ts`.

---

## Tasks

- [ ] **Task 1: Extract schemas from `canvas.ts`**
  - Tools: `create_frame`, `create_text`, `create_rectangle`, `create_ellipse`, `create_image`, `place_generated_image`, `fetch_placeholder_image`, `set_text`
  - Move each inline schema object above the `registerCanvasTools` function (or at least above its `server.tool()` call), assign to named export const, replace inline object with the const name

- [ ] **Task 2: Extract schemas from `style.ts`**
  - Tools: `set_fill`, `set_stroke`, `set_effects`, `set_corner_radius`, `set_opacity`, `set_auto_layout`

- [ ] **Task 3: Extract schemas from `batch.ts`**
  - Tools: `create_design`, `batch_execute`, `clone_with_overrides`
  - Note: `batch_execute` has a complex nested schema — extract carefully, verify the build passes

- [ ] **Task 4: Extract schemas from `scene.ts`**
  - Read file first to identify all registered tools, then extract each

- [ ] **Task 5: Extract schemas from `export.ts`**
  - Read file first to identify all registered tools

- [ ] **Task 6: Extract schemas from `refinement.ts`**
  - Tool: `run_refinement_check`
  - Existing `@ts-expect-error` on line 257 must be preserved

- [ ] **Task 7: Extract schemas from `intelligence.ts`**
  - Tools: `get_size_preset`, `get_font_pairing`, `get_type_scale`, `get_color_palette`, `get_contrast_check`, `get_spacing_scale`, `get_layout_guide`, `get_brand_kit`, `save_brand_kit`

- [ ] **Task 8: Extract schemas from `figma-native.ts`**
  - Read file first to identify all registered tools

- [ ] **Task 9: Extract schemas from `icons.ts`**
  - Read file first to identify all registered tools

- [ ] **Task 10: Extract schemas from `layouts.ts`**
  - Tool: `get_layout_blueprint` (and any others present)

- [ ] **Task 11: Extract schemas from `patterns.ts`**
  - Read file first to identify all registered tools

- [ ] **Task 12: Extract schemas from `references.ts`**
  - Read file first to identify all registered tools

- [ ] **Task 13: Extract schemas from `template.ts`**
  - Read file first to identify all registered tools

- [ ] **Task 14: Extract schemas from `ds-templates.ts`**
  - Read file first to identify all registered tools

- [ ] **Task 15: Extract schemas from `ad-analyzer.ts`**
  - Tools: `start_ad_analyzer`, `complete_ad_analyzer` (verify in file)

- [ ] **Task 16: Extract schemas from `connection.ts`**
  - Tools: `connect_to_figma`, `disconnect_from_figma` (or similar)

- [ ] **Task 17: Extract schemas from `design-system.ts`**
  - Read file first to identify all registered tools

- [ ] **Task 18: Build verification**
  - `cd figmento-mcp-server && npm run build` — must pass clean
  - Fix any TS2589 errors with `@ts-expect-error` comments

---

## Dev Notes

- **Read each file before editing.** There are 17 files and some tool counts are uncertain. Do not guess — read first, then extract.
- **Place the `export const` ABOVE the `registerXTools` function.** This ensures the export is at module scope and importable without calling the register function.
- **`intelligence.ts` warning:** This file uses a `// @ts-expect-error — TS2589` comment before `run_refinement_check`'s `server.tool()` call. When extracting `runRefinementCheckSchema`, if moving the schema object OUT of the `server.tool()` call resolves the TS2589 (the error was about the inline shape), you may remove the `@ts-expect-error` only if the build passes without it. If the build still fails without it, keep it.
- **`batch_execute` schema complexity.** The schema includes `z.array(z.object({ action: z.string(), params: z.record(z.any()), tempId: z.string().optional() }))`. Extracting this as a named const is fine — TypeScript will infer `typeof batchExecuteSchema` correctly.
- **Empty schemas.** For tools with no input params (e.g., `get_selection`), the schema is `{}`. Still extract: `export const getSelectionSchema = {};`.

---

## File List

| File | Action | Notes |
|---|---|---|
| `figmento-mcp-server/src/tools/canvas.ts` | MODIFY | Extract 8 tool schemas |
| `figmento-mcp-server/src/tools/style.ts` | MODIFY | Extract 6 tool schemas |
| `figmento-mcp-server/src/tools/batch.ts` | MODIFY | Extract 3 tool schemas |
| `figmento-mcp-server/src/tools/scene.ts` | MODIFY | Extract N tool schemas (read first) |
| `figmento-mcp-server/src/tools/export.ts` | MODIFY | Extract N tool schemas |
| `figmento-mcp-server/src/tools/refinement.ts` | MODIFY | Extract 1 tool schema |
| `figmento-mcp-server/src/tools/intelligence.ts` | MODIFY | Extract 9 tool schemas |
| `figmento-mcp-server/src/tools/figma-native.ts` | MODIFY | Extract N tool schemas |
| `figmento-mcp-server/src/tools/icons.ts` | MODIFY | Extract N tool schemas |
| `figmento-mcp-server/src/tools/layouts.ts` | MODIFY | Extract N tool schemas |
| `figmento-mcp-server/src/tools/patterns.ts` | MODIFY | Extract N tool schemas |
| `figmento-mcp-server/src/tools/references.ts` | MODIFY | Extract N tool schemas |
| `figmento-mcp-server/src/tools/template.ts` | MODIFY | Extract N tool schemas |
| `figmento-mcp-server/src/tools/ds-templates.ts` | MODIFY | Extract N tool schemas |
| `figmento-mcp-server/src/tools/ad-analyzer.ts` | MODIFY | Extract N tool schemas |
| `figmento-mcp-server/src/tools/connection.ts` | MODIFY | Extract N tool schemas |
| `figmento-mcp-server/src/tools/design-system.ts` | MODIFY | Extract N tool schemas |

---

## Definition of Done

- [ ] All 17 tool files have their schemas extracted as named module-level `export const` declarations
- [ ] All `server.tool()` calls use the named schema const (no inline schema objects)
- [ ] No schema content changed — purely structural
- [ ] `cd figmento-mcp-server && npm run build` passes clean
- [ ] No changes to any file outside `figmento-mcp-server/src/tools/`

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-07 | @sm (River) | Story created. Mechanical schema extraction across 17 tool files — prerequisite for SU-2.2 generator. No logic changes. MCP server build gate. |
