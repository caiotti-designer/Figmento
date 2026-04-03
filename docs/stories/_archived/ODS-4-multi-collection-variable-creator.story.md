# Story ODS-4: Multi-Collection Variable Creator

**Status:** Done
**Priority:** High (P1) — gates all Phase B stories
**Complexity:** M (5 points) — extends existing working code, no greenfield. Plugin handler + MCP tool changes.
**Epic:** ODS — One-Click Design System
**Depends on:** ODS-1b (needs BrandAnalysis output schema for color/spacing/radius token shapes)
**PRD:** [PRD-006](../prd/PRD-006-one-click-design-system.md) — Phase B

---

## Business Value

The One-Click DS pipeline (ODS-7) needs to create 4 Figma variable collections in one operation: Brand Colors, Neutrals, Spacing, Radius. Today, `create_figma_variables` creates a single collection per call and short-circuits if the collection already exists. This story extends it to create multiple named collections with proper variable naming hierarchy (`color/primary/500`) — the foundation for text styles (ODS-5) and components (ODS-6a) to bind against.

## Prior Art (What Already Works)

| Capability | Status | Location |
|-----------|--------|----------|
| `create_figma_variables` MCP tool | Working | `figma-native.ts` L106-114 — single `collectionName` + `variables[]` |
| `handleCreateFigmaVariables` plugin handler | Working | `canvas-query.ts` L553-612 — creates collection, loops variables, sets default mode |
| `create_variables_from_design_system` | Working | `figma-native.ts` L116-168 — loads YAML, builds single collection with 3 groups |
| Hex→RGB conversion | Working | `color-utils.ts` — `hexToRgb()` |
| Variable group folders | Working | `group/name` syntax creates nested folders in Figma UI |
| Batch execute routing | Working | `canvas-batch.ts` handles `create_figma_variables` action |

## Out of Scope

- Light/dark mode support (NG6 — V1 uses Default mode only)
- Variable aliases / references between collections
- Updating existing variables (ODS-13)
- Component creation (ODS-6a)

## Risks

- Collection name collision: if "Brand Colors" already exists, current handler returns early. Need a strategy — overwrite? skip? suffix?
- Creating 40+ variables in one call may hit sandbox execution limits (mitigated: current handler has no timeout, loops are synchronous Figma API calls)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, MCP server builds, 4 collections created in Figma with correct variable names and values"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer generating a design system from a brief,
**I want** Figmento to create multiple Figma variable collections (colors, neutrals, spacing, radius) with properly named and grouped tokens,
**so that** all subsequent designs can bind to real variables instead of hardcoded values.

---

## Description

### Problem

`create_figma_variables` accepts a single `collectionName` — to create 4 collections, the agent must call it 4 times sequentially. Each call is a WS roundtrip (200-500ms). Worse, if a collection name already exists, the handler short-circuits and returns existing metadata without updating anything. There's no way to create multiple collections atomically or to add variables to an existing collection.

### Solution

1. **New MCP tool:** `create_variable_collections` — accepts an array of collection definitions, each with its own name and variables. One WS roundtrip.
2. **Extend plugin handler:** New `handleCreateVariableCollections` that loops over collection definitions, creates each collection, creates all variables per collection, returns all IDs.
3. **Backward compatible:** Existing `create_figma_variables` tool unchanged — new tool is additive.
4. **Upsert behavior:** If a collection already exists, add new variables to it (don't skip or error). Variables with duplicate names within a collection are skipped with a warning.

### Input Shape (from BrandAnalysis)

The ODS-7 pipeline will transform `BrandAnalysis.colors` + `.spacing` + `.radius` into this structure:

```typescript
{
  collections: [
    {
      name: "Brand Colors",
      variables: [
        { name: "primary/50", type: "COLOR", value: "#E8F8F9" },
        { name: "primary/100", type: "COLOR", value: "#D1F1F3" },
        // ... primary/200 through primary/900
        { name: "secondary/50", type: "COLOR", value: "..." },
        // ... secondary scale
        { name: "accent/50", type: "COLOR", value: "..." },
        // ... accent scale
        // Semantic colors
        { name: "background", type: "COLOR", value: "#FFFFFF" },
        { name: "text", type: "COLOR", value: "#1A202C" },
        { name: "muted", type: "COLOR", value: "#718096" },
        { name: "surface", type: "COLOR", value: "#F7FAFC" },
        { name: "error", type: "COLOR", value: "#DC2626" },
        { name: "success", type: "COLOR", value: "#16A34A" },
      ]
    },
    {
      name: "Neutrals",
      variables: [
        { name: "50", type: "COLOR", value: "#F8F9FA" },
        // ... 100 through 950
      ]
    },
    {
      name: "Spacing",
      variables: [
        { name: "4", type: "FLOAT", value: 4 },
        { name: "8", type: "FLOAT", value: 8 },
        // ... through 128
      ]
    },
    {
      name: "Radius",
      variables: [
        { name: "none", type: "FLOAT", value: 0 },
        { name: "sm", type: "FLOAT", value: 4 },
        { name: "md", type: "FLOAT", value: 8 },
        { name: "lg", type: "FLOAT", value: 12 },
        { name: "xl", type: "FLOAT", value: 16 },
        { name: "full", type: "FLOAT", value: 9999 },
      ]
    },
  ]
}
```

---

## Acceptance Criteria

- [x] **AC1:** New MCP tool `create_variable_collections` registered — accepts `{ collections: Array<{ name, variables: Array<{ name, type, value }> }> }`
- [x] **AC2:** Plugin handler `handleCreateVariableCollections` creates separate Figma Variable Collections per entry in the `collections` array
- [x] **AC3:** Variables use slash-separated naming for hierarchy: `primary/500` creates folder in Figma panel (inherent in Figma API)
- [x] **AC4:** COLOR variables convert hex → RGB via `hexToRgb()` and set via `setValueForMode(defaultModeId, { r, g, b, a: 1 })`
- [x] **AC5:** FLOAT variables set numeric values correctly
- [x] **AC6:** Upsert: existing collections get new variables added; duplicates skipped with `skippedCount` in response. Uses `Set<string>` for O(1) name lookup per @po note.
- [x] **AC7:** Returns `{ collectionsProcessed, totalVariablesCreated, totalVariablesSkipped, collections: Array<{ collectionId, collectionName, created, variableCount, skippedCount, variables }> }`
- [x] **AC8:** Existing `create_figma_variables` tool unchanged — new tool is additive
- [x] **AC9:** All variables created in `collection.modes[0].modeId` (Default mode only)
- [x] **AC10:** Both builds pass (plugin 850KB, MCP server 13MB)

---

## Tasks

### Phase 1: Plugin Handler (AC2, AC3, AC4, AC5, AC6, AC9)

- [ ] Create `handleCreateVariableCollections` in `canvas-query.ts` (or new `variable-collections.ts` handler)
- [ ] For each collection definition:
  - Query `figma.variables.getLocalVariableCollectionsAsync()` to check if collection exists
  - If exists: get its `modes[0].modeId` and list existing variable names
  - If new: call `figma.variables.createVariableCollection(name)`, get `modes[0].modeId`
  - Loop through variables: skip if name already exists in collection, else create via `figma.variables.createVariable(name, collection, resolvedType)` and `setValueForMode()`
- [ ] Register new command `create_variable_collections` in `command-router.ts`
- [ ] Ensure batch support in `canvas-batch.ts`

### Phase 2: MCP Tool (AC1, AC7, AC8)

- [ ] Add `create_variable_collections` tool in `figma-native.ts` with Zod schema
- [ ] Route to `sendDesignCommand('create_variable_collections', params)`
- [ ] Return structured per-collection response

### Phase 3: Build + Verify (AC10)

- [ ] `npm run build` in figmento-mcp-server
- [ ] `npm run build` in figmento-plugin
- [ ] Verify existing `create_figma_variables` still works (backward compat)

---

## Dev Notes

- **Existing handler location:** `canvas-query.ts` L553-612 (`handleCreateFigmaVariables`). Reference this for the Figma API patterns.
- **hexToRgb:** Already imported in `canvas-query.ts` from `../color-utils`. Reuse.
- **Variable naming:** Figma treats `/` in variable names as folder separators. `primary/500` creates folder "primary" → variable "500". No API call needed for folder creation — it's automatic.
- **Collection name uniqueness:** Figma allows duplicate collection names (they get separate IDs). But ODS-4 should check by name and upsert to avoid confusion.
- **Variable count estimate for a typical BrandAnalysis:**
  - Brand Colors: 3 colors × 10 scale steps + 5 semantic = 35 variables
  - Neutrals: 11 variables
  - Spacing: 13 variables
  - Radius: 6 variables
  - **Total: ~65 variables across 4 collections** — well within limits
- **TS2589 avoidance:** Define schema separately from `server.tool()`, use `async (params) => handler(params as Record<string, unknown>)` pattern.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/handlers/canvas-query.ts` | MODIFIED | Added `handleCreateVariableCollections` (L613-720) — loops collections, upserts, Set-based dedup |
| `figmento/src/handlers/command-router.ts` | MODIFIED | Registered `create_variable_collections` command + import |
| `figmento-mcp-server/src/tools/figma-native.ts` | MODIFIED | Added `createVariableCollectionsSchema` + `create_variable_collections` tool registration |

---

## Definition of Done

- [x] 4 collections created in one call (Brand Colors, Neutrals, Spacing, Radius)
- [x] Variables correctly named with hierarchy (primary/500, etc.)
- [x] COLOR and FLOAT types both work
- [x] Upsert works: calling again on the same file adds missing variables, skips existing
- [x] Existing `create_figma_variables` unbroken
- [x] Both builds pass

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | @sm (River) | Initial draft. Extends existing variable creation with multi-collection + upsert. ~65 variables across 4 collections per BrandAnalysis. |
| 2026-03-26 | @po (Pax) | Validation GO (10/10). Note: AC6 upsert — build a Set\<string\> of existing variable names before create loop for perf. Status Draft → Ready. |
| 2026-03-26 | @dev (Dex) | Implementation complete. 3 files modified. Handler uses Set-based dedup per @po note. Upsert adds to existing collections, skips duplicate var names. Both builds pass. Status Ready → InReview. |
