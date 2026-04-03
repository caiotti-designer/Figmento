# Story ODS-7: One-Click DS Pipeline

**Status:** Done
**Priority:** High (P1) — the headline feature of Epic ODS, orchestrates all Phase B artifacts
**Complexity:** M (5 points) — orchestration and data transformation, no new Figma API surface. All downstream handlers already exist.
**Epic:** ODS — One-Click Design System
**Depends on:** ODS-4 (variable collections), ODS-5 (text styles), ODS-6a (components)
**PRD:** [PRD-006](../prd/PRD-006-one-click-design-system.md) — Phase B

---

## Business Value

This is the payoff story. ODS-4/5/6a create individual DS artifacts; ODS-7 chains them into a single command. A designer uploads a brief, gets a BrandAnalysis, and clicks one button — 120 seconds later, their Figma file has a complete design system: 4 variable collections (~65 variables), 8 text styles, 3 components, all wired together. Time to set up a project DS drops from 30-60 minutes (manual) to under 2 minutes (one-click).

## Prior Art (What Already Works)

| Capability | Status | Location |
|-----------|--------|----------|
| `create_variable_collections` (ODS-4) | Prerequisite | `figma-native.ts` + `canvas-query.ts` |
| `create_text_styles` (ODS-5) | Prerequisite | `figma-native.ts` + `canvas-query.ts` |
| `create_ds_components` (ODS-6a) | Prerequisite | `figma-native.ts` + `canvas-query.ts` |
| BrandAnalysis type contract | Defined | `brand-analysis.ts` — shared Phase A->B interface |
| DS toggle (`clientStorage`) | Working | Plugin settings — `dsEnabled` key |
| FN-6 DS Discovery rescan | Working | `read_figma_context` triggers cache rebuild |
| Batch execution (200-cmd, 22/chunk) | Working | `batch.ts` + `canvas-batch.ts` |
| `sendDesignCommand` routing | Working | MCP -> WS -> plugin command router |

## Out of Scope

- Brief analysis (ODS-1b — already done, feeds into this)
- DS preview before commit (ODS-12 — Phase D)
- DS update/modification flow (ODS-13 — Phase D)
- Project persistence (ODS-8 — Phase C, saves the generated artifact IDs)
- Error rollback (partial DS is acceptable — see AC9)

## Risks

- **Execution time exceeds 120s:** ~50 commands across 3 sequential steps. Each step is a WS roundtrip. Batch chunking (22/chunk) means ~3 roundtrips for variables alone. Mitigated: architect spike measured 50 commands in ~30s with 20s buffer.
- **Step ordering dependency:** Text styles (ODS-5) don't strictly need variables (ODS-4), but components (ODS-6a) need both. Pipeline must be sequential: variables -> text styles -> components.
- **BrandAnalysis transformation errors:** ODS-7 transforms BrandAnalysis into 3 different input shapes. If any transformation produces invalid data, the downstream handler fails. Strong typing + validation required.
- **DS toggle side effect:** Auto-enabling DS toggle changes the AI prompt context for all subsequent commands. This is intentional but could surprise users if they don't expect it.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Single MCP tool call creates full DS in Figma: 4 collections, 8 text styles, 3 components. Execution < 120s. DS toggle on. Summary returned."
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer who has just analyzed a brief,
**I want** to click one button and have Figmento generate a complete Figma design system — variables, text styles, and components — from my brand analysis,
**so that** I can start designing on-brand immediately without any manual DS setup.

---

## Description

### Problem

After ODS-1b produces a BrandAnalysis and ODS-4/5/6a provide the creation handlers, the designer still needs to call 3 separate tools in the correct order, passing artifact IDs between them. This is an implementation detail that should be invisible — the designer should press one button and get a complete DS.

### Solution

1. **New MCP tool:** `generate_design_system_in_figma` — accepts BrandAnalysis JSON, orchestrates the 3-step pipeline internally.
2. **Data transformation layer:** Converts BrandAnalysis into the input shapes expected by each downstream tool:
   - `BrandAnalysis.colors` + `.spacing` + `.radius` -> ODS-4 `collections` array
   - `BrandAnalysis.typography` -> ODS-5 `styles` array
   - ODS-4 variable IDs + ODS-5 style IDs + fonts -> ODS-6a component config
3. **Sequential execution:** Variables first (ODS-4), then text styles (ODS-5), then components (ODS-6a). Each step waits for the previous to complete and captures returned IDs.
4. **Progress feedback:** Sends status messages to plugin UI during each step.
5. **Post-generation:** Auto-enables DS toggle + triggers FN-6 rescan.

### Pipeline Flow

```
BrandAnalysis JSON
       │
       ▼
┌──────────────────────────┐
│ Step 1: Transform Colors │  BrandAnalysis.colors -> collections array
│         + Spacing/Radius │  BrandAnalysis.spacing -> spacing collection
│                          │  BrandAnalysis.radius -> radius collection
│   → create_variable_     │
│     collections (ODS-4)  │  Returns: { variableIds: Map<name, id> }
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Step 2: Transform Typo   │  BrandAnalysis.typography -> styles array
│                          │  headingFont for Display/H1/H2/H3
│   → create_text_styles   │  bodyFont for Body/Caption
│     (ODS-5)              │  Returns: { textStyleIds: Map<name, id> }
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Step 3: Create Comps     │  variableIds + textStyleIds + fonts
│                          │  → 3 components bound to variables
│   → create_ds_components │
│     (ODS-6a)             │  Returns: { componentIds: Array<{ id, name }> }
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Step 4: Post-Generation  │  Enable DS toggle (clientStorage)
│                          │  Trigger FN-6 rescan (read_figma_context)
│                          │  Return summary
└──────────────────────────┘
```

### Data Transformation Detail

**Step 1 — Colors to Collections:**

```typescript
function brandAnalysisToCollections(ba: BrandAnalysis): CollectionsInput {
  return {
    collections: [
      {
        name: "Brand Colors",
        variables: [
          // ba.colors.scales.primary -> { name: "primary/50", type: "COLOR", value: hex }
          // ba.colors.scales.secondary -> { name: "secondary/50", ... }
          // ba.colors.scales.accent -> { name: "accent/50", ... }
          // ba.colors.background, .text, .muted, .surface, .error, .success -> semantic vars
        ]
      },
      {
        name: "Neutrals",
        variables: [
          // ba.colors.neutrals -> { name: "50", type: "COLOR", value: hex }, ...
        ]
      },
      {
        name: "Spacing",
        variables: [
          // ba.spacing.scale -> { name: "4", type: "FLOAT", value: 4 }, ...
        ]
      },
      {
        name: "Radius",
        variables: [
          // ba.radius.values -> { name: "none", type: "FLOAT", value: 0 }, ...
        ]
      }
    ]
  };
}
```

**Step 2 — Typography to Styles:**

```typescript
function brandAnalysisToTextStyles(ba: BrandAnalysis): TextStylesInput {
  const { headingFont, bodyFont, styles } = ba.typography;
  return {
    styles: [
      { name: "DS/Display", fontFamily: headingFont, ...styles.display },
      { name: "DS/H1",      fontFamily: headingFont, ...styles.h1 },
      { name: "DS/H2",      fontFamily: headingFont, ...styles.h2 },
      { name: "DS/H3",      fontFamily: headingFont, ...styles.h3 },
      { name: "DS/Body Large", fontFamily: bodyFont, ...styles.bodyLg },
      { name: "DS/Body",       fontFamily: bodyFont, ...styles.body },
      { name: "DS/Body Small", fontFamily: bodyFont, ...styles.bodySm },
      { name: "DS/Caption",    fontFamily: bodyFont, ...styles.caption },
    ]
  };
}
```

**Step 3 — Assemble Component Config:**

```typescript
function assembleComponentConfig(
  variableIds: Record<string, string>,
  textStyleIds: Record<string, string>,
  ba: BrandAnalysis
): ComponentsInput {
  return {
    variableIds,   // from Step 1 response
    textStyleIds,  // from Step 2 response
    headingFont: ba.typography.headingFont,
    bodyFont: ba.typography.bodyFont,
  };
}
```

---

## Acceptance Criteria

- [ ] **AC1:** New MCP tool `generate_design_system_in_figma` registered with Zod schema accepting BrandAnalysis JSON
- [ ] **AC2:** Accepts `BrandAnalysis` JSON as input (matching the type in `brand-analysis.ts`)
- [ ] **AC3:** Executes in sequence: create variables (ODS-4) -> create text styles (ODS-5) -> create components (ODS-6a)
- [ ] **AC4:** Data transformation layer correctly maps BrandAnalysis fields to each downstream tool's expected input shape
- [ ] **AC5:** Total execution time < 120 seconds for a typical BrandAnalysis (~65 variables, 8 styles, 3 components)
- [ ] **AC6:** DS toggle auto-enabled in `clientStorage` after successful generation (`dsEnabled = true`)
- [ ] **AC7:** FN-6 DS Discovery rescan triggered after generation (call `read_figma_context` or equivalent to rebuild DS cache)
- [ ] **AC8:** Returns summary: `{ variables: { count, collectionIds }, textStyles: { count, styleIds }, components: { count, componentIds }, totalTime: number }`
- [ ] **AC9:** If any step fails, previous steps' artifacts are preserved — no rollback. Response includes which steps succeeded and which failed with error details.
- [ ] **AC10:** Progress feedback sent to plugin UI during generation: "Creating variables..." -> "Creating text styles..." -> "Creating components..." -> "Design system complete!"
- [ ] **AC11:** `npm run build` succeeds in both figmento-mcp-server and figmento-plugin (figmento)

---

## Tasks

### Phase 1: Data Transformation Functions (AC2, AC4)

- [ ] Create transformation module (in `figma-native.ts` or new `ds-pipeline.ts` in MCP server):
  - `brandAnalysisToCollections(ba: BrandAnalysis)` -> ODS-4 input shape
  - `brandAnalysisToTextStyles(ba: BrandAnalysis)` -> ODS-5 input shape
  - `assembleComponentConfig(varIds, styleIds, ba)` -> ODS-6a input shape
- [ ] Add unit tests for each transformation function (pure functions, no WS dependency)
- [ ] Validate: color scale keys map correctly, spacing values are numbers, font names propagate

### Phase 2: Pipeline Orchestrator Tool (AC1, AC3, AC8, AC9)

- [ ] Register `generate_design_system_in_figma` MCP tool in `figma-native.ts` (or new tool module)
- [ ] Zod schema: accepts full `BrandAnalysis` shape (use `z.object()` matching the TypeScript interface)
- [ ] Implement sequential execution:
  ```
  result1 = await sendDesignCommand('create_variable_collections', collectionsInput)
  if (result1.error) -> return partial result with step1 failure
  result2 = await sendDesignCommand('create_text_styles', stylesInput)
  if (result2.error) -> return partial result with step2 failure
  result3 = await sendDesignCommand('create_ds_components', componentsInput)
  ```
- [ ] Aggregate results into summary response

### Phase 3: Progress Feedback (AC10)

- [ ] Send progress messages to plugin UI via WS relay during each step
- [ ] Pattern: `sendDesignCommand('show_progress', { message: "Creating variables..." })` — or use existing notification mechanism if available
- [ ] If no progress channel exists: log messages server-side and include step timing in response (acceptable V1)

### Phase 4: Post-Generation (AC6, AC7)

- [ ] After step 3 succeeds: `sendDesignCommand('set_client_storage', { key: 'dsEnabled', value: true })`
- [ ] Trigger FN-6 rescan: `sendDesignCommand('read_figma_context', {})` — or call the MCP tool directly if in-process
- [ ] Include post-generation status in response

### Phase 5: Build + Verify (AC5, AC11)

- [ ] `npm run build` in figmento-mcp-server
- [ ] `npm run build` in figmento (plugin)
- [ ] Manual end-to-end test: provide sample BrandAnalysis JSON -> verify complete DS in Figma
- [ ] Time the execution — must be < 120 seconds

---

## Dev Notes

- **Orchestration is MCP-side, not plugin-side.** The MCP tool calls 3 separate `sendDesignCommand` actions sequentially. Each action is a full WS roundtrip. This is simpler than a single mega-command in the plugin sandbox.
- **Variable ID forwarding:** ODS-4 returns `{ collections: [{ variables: [{ id, name }] }] }`. ODS-7 must build a flat map `{ "color/primary/500": "VariableID:xxx", ... }` from this nested response for ODS-6a.
- **Text style ID forwarding:** ODS-5 returns `{ styles: [{ id, name }] }`. ODS-7 builds a map `{ "DS/H3": "S:xxx", ... }` for ODS-6a.
- **BrandAnalysis Zod schema:** Use `z.object()` with all fields from the TypeScript interface. For `z.enum()` concerns (TS2589), use `z.string()` with `.describe()` as documented in MEMORY.md.
- **Timeout budget:** 3 sequential WS commands. Each command processes in the plugin sandbox synchronously. Variable creation (~65 vars) is the heaviest — estimated 10-20s. Text styles (~8) and components (~3) are fast. Total well under 120s.
- **Partial failure response shape:**
  ```typescript
  {
    success: false,
    completedSteps: ['variables'],
    failedStep: 'textStyles',
    error: 'Font "CustomFont" not available',
    variables: { count: 65, collectionIds: [...] },
    textStyles: null,
    components: null,
  }
  ```
- **DS toggle:** `figma.clientStorage.setAsync('dsEnabled', true)` in plugin sandbox. Need a command for this or reuse existing storage handler.
- **Sample BrandAnalysis for testing:** Use the Gartni example from the epic: AgTech, primary #2AB6BD, Manrope + Inter.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/figma-native.ts` | MODIFY | Add `generate_design_system_in_figma` tool + transformation functions |
| `figmento-mcp-server/src/types/brand-analysis.ts` | READ | Reference for BrandAnalysis shape — no changes expected |

---

## Definition of Done

- [ ] Single `generate_design_system_in_figma` call with BrandAnalysis JSON produces complete DS in Figma
- [ ] 4 variable collections with ~65 variables created (ODS-4)
- [ ] 8 text styles created with correct fonts and sizes (ODS-5)
- [ ] 3 components created with variable bindings (ODS-6a)
- [ ] Execution time < 120 seconds
- [ ] DS toggle auto-enabled
- [ ] FN-6 rescan triggered
- [ ] Summary response includes counts and IDs for all artifacts
- [ ] Partial failure preserves completed steps
- [ ] Both builds pass

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | @sm (River) | Initial draft. Orchestrator tool chaining ODS-4/5/6a with data transformations. M (5pt) — pure orchestration, no new Figma API. |
