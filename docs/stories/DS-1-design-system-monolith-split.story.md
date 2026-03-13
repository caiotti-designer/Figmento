# Story DS-1: Split design-system.ts Monolith into Modular Architecture

**Status:** Done
**Priority:** High
**Complexity:** L (Large) — 2,820-line file split into 5 tool modules + 4 utils + barrel index; touches import chains across codebase
**Epic:** DS — Design System Infrastructure
**Depends on:** None

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean + full test suite green (301 tests) + zero behavior changes
```

---

## Story

**As a** Figmento maintainer,
**I want** the design-system.ts monolith split into focused, single-responsibility modules,
**so that** the codebase is easier to navigate, test, and extend without merge conflicts or cognitive overload.

---

## Description

`figmento-mcp-server/src/tools/design-system.ts` has grown to 2,820 lines containing 14 MCP tools, 13 color utilities, a token generation engine, component recipe system, URL extraction pipeline, and 12 Zod schemas — all in one file.

This is a **pure structural refactor**. No behavior changes, no new features, no API surface changes. The 14 MCP tools keep the same names, same schemas, same return shapes. The `registerDesignSystemTools(server, sendDesignCommand)` function signature stays identical — callers don't change.

### Architecture (per @architect assessment)

Split into a `design-system/` directory with 5 tool modules + shared `utils/` layer:

```
figmento-mcp-server/src/tools/
├── design-system/
│   ├── index.ts              ← Barrel + registerDesignSystemTools()
│   ├── ds-types.ts           ← All type/interface definitions
│   ├── ds-schemas.ts         ← All 12 Zod schemas
│   ├── ds-crud.ts            ← create/get/list/update/delete_design_system
│   ├── ds-components.ts      ← create_component, list_components
│   ├── ds-formats.ts         ← get_format_rules, list_formats
│   ├── ds-extraction.ts      ← generate_design_system_from_url, refine_design_system
│   └── ds-analysis.ts        ← scan_frame_structure, design_system_preview, brand_consistency_check
├── utils/
│   ├── color.ts              ← 13 color conversion/manipulation functions
│   ├── tokens.ts             ← resolveTokens, getByDotPath, setByDotPath, deepMerge
│   ├── knowledge-paths.ts    ← getKnowledgeDir, getDesignSystemsDir, getFormatsDir, getPresetsDir
│   └── recipe-to-commands.ts ← recipeToCommands()
```

### Critical Constraint

`ds-extraction.ts` must **NOT** import `ds-crud.ts` directly — this creates a circular dependency (extraction generates tokens → needs to save → CRUD saves). Instead, `index.ts` passes a `saveFn: (name, tokens) => Promise<void>` callback when wiring up the extraction module.

---

## Current State vs. Target State

| Aspect | Current | Target |
|--------|---------|--------|
| File count | 1 monolith (2,820 lines) | 11 focused files (avg ~250 lines each) |
| Shared utils | Zero — all self-contained | 4 reusable utils consumed by tools + external modules |
| Circular dep risk | N/A (one file) | Eliminated by `saveFn` callback pattern |
| Import surface for `patterns.ts` / `ds-templates.ts` | Import from `design-system.ts` | Import from `design-system/index.ts` (same public API) |
| Testability | Must load entire monolith to test one utility | Test `utils/color.ts` in isolation |

---

## Acceptance Criteria

### Phase 1 — Leaf Nodes (types, schemas, utils)

- [x] **AC1:** `ds-types.ts` exports all type/interface definitions (`DesignTokens`, `PresetDefaults`, `ComponentPropDef`, `ComponentRecipe`, `BatchCommand`, `ExtractedDesignTokens`, `VisionExtraction`, `HybridMergeResult`, `FormatSizeVariant`, `FormatListEntry`, `SendDesignCommand`) and compiles clean
- [x] **AC2:** `ds-schemas.ts` exports all 12 Zod schemas and imports only from `ds-types.ts`
- [x] **AC3:** `utils/color.ts` exports all 13 color functions (`hexToRgb`, `rgbToHex`, `rgbToHsl`, `hslToRgb`, `hexToHsl`, `hslToHex`, `lighten`, `darken`, `rotateHue`, `desaturate`, `relativeLuminance`, `contrastRatio`, `bestTextColor`) with zero external deps
- [x] **AC4:** `utils/tokens.ts` exports `resolveTokens`, `getByDotPath`, `setByDotPath`, `deepMerge` — imports only from `ds-types.ts` and `knowledge-paths.ts`
- [x] **AC5:** `utils/knowledge-paths.ts` exports `getKnowledgeDir`, `getDesignSystemsDir`, `getFormatsDir`, `getPresetsDir` with the two-candidate fallback pattern
- [x] **AC6:** `utils/recipe-to-commands.ts` exports `recipeToCommands` — imports from `tokens.ts` and `ds-types.ts`

### Phase 2 — Tool Modules

- [x] **AC7:** `ds-formats.ts` registers `get_format_rules` + `list_formats` (2 tools)
- [x] **AC8:** `ds-analysis.ts` registers `scan_frame_structure` + `design_system_preview` + `brand_consistency_check` (3 tools)
- [x] **AC9:** `ds-components.ts` registers `create_component` + `list_components` (2 tools), owns `componentCache` and `loadComponents`/`getComponentRecipe` helpers
- [x] **AC10:** `ds-crud.ts` registers `create_design_system` + `get_design_system` + `list_design_systems` + `update_design_system` + `delete_design_system` (5 tools), owns `generateTokens`, `selectPresetFromMood`, `loadPreset`, `generateShadows`, `listAvailableSystems`
- [x] **AC11:** `ds-extraction.ts` registers `generate_design_system_from_url` + `refine_design_system` (2 tools), owns `fetchUrl`, `extractDesignTokens`, `fetchScreenshot`, `visionExtract`, `mergeExtractions` — receives `saveFn` callback, does NOT import `ds-crud.ts`
- [x] **AC12:** `index.ts` barrel re-exports full public API and wires `saveFn` from `ds-crud` into `ds-extraction`

### Phase 3 — Integration

- [x] **AC13:** All imports in `patterns.ts`, `ds-templates.ts`, and any other consumer updated to `design-system/index.ts` (or `design-system/` with barrel resolution)
- [x] **AC14:** All existing test files updated to new import paths — 301 tests pass
- [x] **AC15:** `npm run build` completes clean with zero errors, zero warnings related to this refactor

---

## Tasks

### Phase 1 — Leaf Nodes & Utils (do first, zero coupling risk)

- [x] **Task P1-1:** Create `design-system/ds-types.ts` — extract all type/interface definitions from lines ~186–1234 of the monolith. No logic, only types.

- [x] **Task P1-2:** Create `design-system/ds-schemas.ts` — extract all 12 Zod schemas from lines ~1236–1318. Import types from `ds-types.ts`. Keep the `z.string()` workaround for TS2589.

- [x] **Task P1-3:** Create `utils/color.ts` — extract the 13 color utility functions from lines ~31–132. Pure functions, zero imports beyond standard lib. Add barrel export.

- [x] **Task P1-4:** Create `utils/knowledge-paths.ts` — extract `getKnowledgeDir`, `getDesignSystemsDir`, `getFormatsDir`, `getPresetsDir` from lines ~11–25. Include the two-candidate `getKnowledgeSubdir` fallback pattern for ts-jest compatibility.

- [x] **Task P1-5:** Create `utils/tokens.ts` — extract `resolveTokens`, `getByDotPath`, `setByDotPath`, `deepMerge` from lines ~456–617. Import `DesignTokens` from `ds-types.ts`.

- [x] **Task P1-6:** Create `utils/recipe-to-commands.ts` — extract `recipeToCommands` from lines ~627–746. Import `BatchCommand` from `ds-types.ts`.

- [x] **Task P1-7:** Verify Phase 1 — `npm run build` must pass. Run `npm test` to confirm no regressions. The original `design-system.ts` still exists and is unchanged at this point.

### Phase 2 — Tool Module Extraction (order matters)

> **Gate:** Only begin Phase 2 after Phase 1 build + test pass confirmed.

- [x] **Task P2-1:** Create `design-system/ds-formats.ts` — extract `get_format_rules` + `list_formats` tool registrations + `listAvailableFormats` helper. Import schemas from `ds-schemas.ts`, paths from `utils/knowledge-paths.ts`. Export a `registerFormatTools(server, sendDesignCommand)` function.

- [x] **Task P2-2:** Create `design-system/ds-analysis.ts` — extract `scan_frame_structure` + `design_system_preview` + `brand_consistency_check` tool registrations. Import schemas, types, paths. Export `registerAnalysisTools(server, sendDesignCommand)`.

- [x] **Task P2-3:** Create `design-system/ds-components.ts` — extract `create_component` + `list_components` + the `componentCache` singleton + `loadComponents` + `getComponentRecipe` helpers. Import `resolveTokens` from `utils/tokens.ts`, `recipeToCommands` from `utils/recipe-to-commands.ts`. Export `registerComponentTools(server, sendDesignCommand)`.

- [x] **Task P2-4:** Create `design-system/ds-crud.ts` — extract 5 CRUD tools + `generateTokens` + `selectPresetFromMood` + `loadPreset` + `generateShadows` + `listAvailableSystems`. Import color utils from `utils/color.ts`. Export `registerCrudTools(server, sendDesignCommand)` and also export `saveDesignSystem(name, tokens)` as a standalone function for the `saveFn` callback.

- [x] **Task P2-5:** Create `design-system/ds-extraction.ts` — extract `generate_design_system_from_url` + `refine_design_system` + `fetchUrl` + `extractDesignTokens` + `fetchScreenshot` + `visionExtract` + `mergeExtractions`. **CRITICAL:** This module receives `saveFn: (name: string, tokens: DesignTokens) => Promise<void>` as a parameter to its registration function — it does NOT import `ds-crud.ts`. Export `registerExtractionTools(server, sendDesignCommand, saveFn)`.

- [x] **Task P2-6:** Create `design-system/index.ts` — barrel file that:
  1. Imports all 5 `register*Tools` functions
  2. Imports `saveDesignSystem` from `ds-crud.ts`
  3. Exports a single `registerDesignSystemTools(server, sendDesignCommand)` that calls all 5 register functions, passing `saveDesignSystem` as `saveFn` to `registerExtractionTools`
  4. Re-exports all public types, schemas, and utils that `patterns.ts` / `ds-templates.ts` currently import

### Phase 3 — Integration & Cleanup

> **Gate:** Only begin Phase 3 after all 5 tool modules are extracted and each registers without error.

- [x] **Task P3-1:** Update all import paths — find every file that imports from `tools/design-system` (check `patterns.ts`, `ds-templates.ts`, `canvas.ts`, `batch.ts`, `server.ts`, and any test files). Update to import from `tools/design-system/index` or `tools/design-system/`.

- [x] **Task P3-2:** Delete the original monolith `design-system.ts` — only after all imports point to the new barrel.

- [x] **Task P3-3:** Final validation — `npm run build` clean + `npm test` (all 301 tests green) + verify no unused exports in new modules.

---

## Dev Notes

- **Preserve the `z.string()` workaround.** Zod schemas use `z.string()` instead of `z.enum()` for MCP SDK compatibility (TS2589). Don't "fix" this during refactor — it's intentional.

- **`componentCache` stays module-scoped.** The in-memory recipe cache in `ds-components.ts` is a module singleton. Don't move it to a shared location — it's an implementation detail of component loading.

- **The `saveFn` callback pattern.** `ds-extraction.ts` needs to save generated design systems but must not import `ds-crud.ts` (circular dep). The barrel `index.ts` wires this: `registerExtractionTools(server, send, saveDesignSystem)`. This is the same pattern used in dependency injection frameworks.

- **Two-candidate fallback for `__dirname` paths.** The `getKnowledgeSubdir` pattern in `utils/knowledge-paths.ts` must check both `path.join(__dirname, '..', 'knowledge')` and `path.join(__dirname, '..', '..', 'knowledge')` to work under both ts-jest and esbuild dist contexts. See memory entry for details.

- **Color functions are pure.** `utils/color.ts` has zero imports except standard math operations. It can be tested in complete isolation. Good candidate for adding dedicated unit tests later (out of scope for this story).

- **Don't refactor internal logic.** This is a move-only operation. Copy functions exactly as they are, warts and all. If you see a bug or improvement opportunity, log it as tech debt — don't fix it here.

- **Build after each phase.** Run `npm run build` after P1 completion, after each P2 task, and after P3. This catches import errors incrementally instead of debugging a mountain of errors at the end.

---

## File List

| File | Action | Notes |
|---|---|---|
| `figmento-mcp-server/src/tools/design-system/ds-types.ts` | CREATE | All type/interface definitions |
| `figmento-mcp-server/src/tools/design-system/ds-schemas.ts` | CREATE | 12 Zod schemas |
| `figmento-mcp-server/src/tools/design-system/ds-crud.ts` | CREATE | 5 CRUD tools + token generation engine |
| `figmento-mcp-server/src/tools/design-system/ds-components.ts` | CREATE | 2 component tools + recipe system |
| `figmento-mcp-server/src/tools/design-system/ds-formats.ts` | CREATE | 2 format tools |
| `figmento-mcp-server/src/tools/design-system/ds-extraction.ts` | CREATE | 2 extraction tools + URL pipeline |
| `figmento-mcp-server/src/tools/design-system/ds-analysis.ts` | CREATE | 3 analysis tools |
| `figmento-mcp-server/src/tools/design-system/index.ts` | CREATE | Barrel — registerDesignSystemTools + re-exports |
| `figmento-mcp-server/src/tools/utils/color.ts` | CREATE | 13 color utility functions |
| `figmento-mcp-server/src/tools/utils/tokens.ts` | CREATE | resolveTokens, deepMerge, dot-path helpers |
| `figmento-mcp-server/src/tools/utils/knowledge-paths.ts` | CREATE | Knowledge directory resolution with fallback |
| `figmento-mcp-server/src/tools/utils/recipe-to-commands.ts` | CREATE | Recipe → Figma batch command conversion |
| `figmento-mcp-server/src/tools/design-system.ts` | DELETE | Original monolith (after P3-1 import migration) |
| `figmento-mcp-server/src/tools/patterns.ts` | MODIFY | Update imports to `design-system/` barrel |
| `figmento-mcp-server/src/tools/ds-templates.ts` | MODIFY | Update imports to `design-system/` barrel |
| `figmento-mcp-server/src/server.ts` | MODIFY | Update import path for registerDesignSystemTools |

---

## Definition of Done

- [x] All 15 tasks marked complete
- [x] `npm run build` passes clean (zero errors, zero warnings from refactor)
- [x] `npm test` — all 301 tests green, zero regressions
- [x] No behavior changes — 14 MCP tools keep same names, schemas, return shapes
- [x] `ds-extraction.ts` has zero imports from `ds-crud.ts` (verified by grep)
- [x] Original `design-system.ts` monolith deleted
- [x] File List above is complete and accurate

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-12 | @pm (Morgan) | Story created per @architect assessment. Pure structural refactor, 15 subtasks, 3 phases. |
| 2026-03-12 | @dev (Dex) | Story completed. 2,820-line monolith split into 8 module files + 4 utils. Build clean (3.7mb). No behavior changes. ds-extraction.ts uses saveFn callback — zero circular deps. |
