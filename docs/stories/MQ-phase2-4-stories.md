# Story MQ-4: Blueprint Injection into Mode Prompts

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"

## Story
**As a** user of Figmento's modes,
**I want** the AI to know about layout blueprints (proportional zones, typography rhythm, memorable elements) when generating designs,
**so that** designs follow proven compositions instead of whatever the AI remembers from training data.

## Context

The MCP path calls `get_layout_blueprint` which returns zone data (e.g., "hero zone: 0-55%, content zone: 55-85%, CTA zone: 85-100%") that guides design creation. The modes have no access to this data. This story loads relevant blueprints and injects their zone information into the mode prompts at runtime.

## Acceptance Criteria

1. A helper function `getRelevantBlueprint(category, subcategory?, mood?)` exists in a new file `figmento/src/ui/blueprint-loader.ts` that reads blueprint data.
2. Blueprint data is embedded at build time (the plugin can't read YAML files at runtime — it runs in Figma's sandbox). The build step extracts blueprint data from `figmento-mcp-server/knowledge/layouts/` and embeds it as a JSON constant.
3. The `getTextLayoutPrompt()` function injects the best-matching blueprint's zone data when available: "Layout zones: hero 0-55%, content 55-85%, CTA 85-100%. Place elements within these proportional zones."
4. The `getAnalysisPrompt()` function does NOT inject blueprints (it's analyzing an existing screenshot, not creating from scratch).
5. `buildSystemPrompt()` includes a "Layout Blueprints" section explaining that the AI should follow proportional zones when they're provided.
6. Blueprint matching uses category (from format — social → social blueprints, web → web blueprints) and mood (from user color/style selection).
7. Build clean.

## Tasks / Subtasks

- [ ] **Task 1: Create build-time blueprint extraction**
  - Add a build step (or pre-build script) that reads all blueprint YAMLs from `figmento-mcp-server/knowledge/layouts/` and writes a TypeScript constant:
  ```typescript
  // figmento/src/ui/blueprint-data.ts (auto-generated)
  export const BLUEPRINTS = [
    { name: "hero-centered", category: "web", subcategory: "hero", mood: ["modern", "clean"], zones: [...], memorable_element: "..." },
    ...
  ];
  ```
- [ ] **Task 2: Create blueprint-loader.ts** (AC: 1, 6)
  - `getRelevantBlueprint(category, mood?)` — scores by category match + mood overlap, returns best match or null
- [ ] **Task 3: Inject into text-to-layout prompt** (AC: 3)
  - In `getTextLayoutPrompt()`, after format section, add blueprint zone data if available
- [ ] **Task 4: Update system-prompt.ts** (AC: 5)
  - Add brief "Layout Blueprints" section explaining proportional zones
- [ ] **Task 5: Verify screenshot mode is NOT affected** (AC: 4)
- [ ] **Task 6: Build and test** (AC: 7)

## Dev Notes

**The plugin cannot read files at runtime.** It runs in Figma's sandboxed iframe. All data must be embedded at build time. The build step (build.js using esbuild) needs to be extended to generate the blueprint-data.ts file before bundling.

**Alternative approach:** Instead of a build step, manually maintain a `blueprint-data.ts` file with the blueprint data pre-extracted. Simpler but requires manual sync when blueprints change. Given that blueprints don't change often, this may be acceptable.

**Files to create:**
- `figmento/src/ui/blueprint-data.ts` — embedded blueprint data
- `figmento/src/ui/blueprint-loader.ts` — matching logic

**Files to modify:**
- `figmento/src/ui/text-layout.ts` — inject blueprint into prompt
- `figmento/src/ui/system-prompt.ts` — add blueprint awareness section
- `figmento/build.js` — possibly add pre-build step

---

# Story MQ-5: Reference Injection into Mode Prompts

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"

## Story
**As a** user of Figmento's modes,
**I want** the AI to know about curated reference designs (compositional patterns, notable elements, color distribution) when creating my designs,
**so that** generated output is inspired by proven professional work instead of generic AI patterns.

## Context

Same problem as MQ-4 but for references. The MCP path calls `find_design_references` and studies the match. The modes have no reference awareness. This story embeds reference metadata (not the images — just the YAML companion data) and injects relevant references into prompts.

## Acceptance Criteria

1. Reference metadata is embedded at build time as a TypeScript constant (same pattern as blueprints).
2. A helper `getRelevantReferences(category, subcategory?, mood?, limit?)` returns matching references sorted by score.
3. `getTextLayoutPrompt()` injects the top reference's `notable` and `composition_notes` when available: "Reference inspiration: [notable]. Composition: [zones]. Adapt these proportional principles."
4. `buildSystemPrompt()` includes a note about reference awareness.
5. The injection is additive — if no references match, the prompt works without them.
6. Build clean.

## Tasks / Subtasks

- [ ] **Task 1: Create build-time reference extraction**
  - Read all reference YAMLs from `figmento-mcp-server/knowledge/references/` and embed as JSON constant
  - Only metadata — NOT the image files (those are too large for embedding)
- [ ] **Task 2: Create reference matching logic** (AC: 2)
  - Same scoring algorithm as `references.ts` in the MCP server, but client-side
- [ ] **Task 3: Inject into text-to-layout prompt** (AC: 3)
- [ ] **Task 4: Update system-prompt.ts** (AC: 4)
- [ ] **Task 5: Build and test** (AC: 6)

## Dev Notes

**Same build-time embedding pattern as MQ-4.** References change more often than blueprints (user adds new screenshots), so the build-time approach means new references require a rebuild. Document this: "After adding new references, rebuild the plugin to include them."

**Consider combining MQ-4 and MQ-5** into a single build step that extracts both blueprints and references.

**Files to create:**
- `figmento/src/ui/reference-data.ts` — embedded reference metadata
- `figmento/src/ui/reference-loader.ts` — matching logic

**Files to modify:**
- `figmento/src/ui/text-layout.ts` — inject reference into prompt
- `figmento/src/ui/system-prompt.ts` — add reference awareness

---

# Story MQ-6: DQ Tools in tools-schema.ts

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"

## Story
**As a** user of Figmento's Chat mode,
**I want** the AI to be able to call all the DQ tools (variable binding, references, refinement checks),
**so that** Chat mode has the same capabilities as the MCP path.

## Context

`tools-schema.ts` defines the tools available to the Chat mode AI (Anthropic function calling). DQ-5/6 already added `read_figma_context`, `bind_variable`, `apply_paint_style`, `apply_text_style`, `apply_effect_style`, and `create_figma_variables`. But the DQ-9 through DQ-14 tools are missing: `find_design_references`, `list_reference_categories`, `analyze_reference`, `run_refinement_check`.

Also, the plugin's `code.ts` may not have handlers for all these — some are server-side only (references). For server-side tools, the Chat mode can't call them directly. We need to determine which tools to add and which to skip.

## Acceptance Criteria

1. `tools-schema.ts` includes `run_refinement_check` — accepts nodeId, returns quality report.
2. `code.ts` has a handler for `run_refinement_check` that performs the same 5 checks as the MCP server version (gradient direction, auto-layout coverage, spacing, typography, empty placeholders).
3. Reference tools (`find_design_references`, `list_reference_categories`) are NOT added to tools-schema.ts (they're server-side only and the plugin can't access the YAML files at runtime — MQ-5's build-time injection handles this).
4. All existing tools in FIGMENTO_TOOLS array still work.
5. Build clean.

## Tasks / Subtasks

- [ ] **Task 1: Add run_refinement_check to tools-schema.ts** (AC: 1)
- [ ] **Task 2: Implement refinement check handler in code.ts** (AC: 2)
  - Port the 5 check functions from `figmento-mcp-server/src/tools/refinement.ts` into the plugin's code.ts
  - These run in Figma's sandbox so they have direct access to the node tree (no WS needed)
  - Use `figma.getNodeByIdAsync()` + recursive walk instead of `sendDesignCommand('get_node_info')`
- [ ] **Task 3: Register in executeCommand + executeSingleAction** (AC: 2)
- [ ] **Task 4: Verify existing tools** (AC: 4)
- [ ] **Task 5: Build and test** (AC: 5)

## Dev Notes

**The refinement check is the most valuable tool to add.** The Chat mode AI can call it after creating a design and auto-fix issues — same as the MCP path.

**The plugin version has an advantage:** It runs in Figma's sandbox, so it can access the node tree directly via Figma Plugin API instead of going through WS → get_node_info. This makes it faster and more reliable.

**Reference tools are server-side only** — they read YAML files from the MCP server's knowledge directory. The plugin can't access those files. MQ-5 handles this by embedding reference metadata at build time.

**Files to modify:**
- `figmento/src/ui/tools-schema.ts` — add tool definition
- `figmento/src/code.ts` — add handler + switch cases

---

# Story MQ-7: Chat Mode Variable Workflow

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"

## Story
**As a** user of Figmento's Chat mode,
**I want** the AI to automatically read my file's variables and use them instead of hardcoding hex values,
**so that** Chat mode designs are Figma-native (variable-bound) just like MCP path designs.

## Context

DQ-5/6 added the plugin handlers for variable binding. DQ-8 added tools-schema entries. But `system-prompt.ts` doesn't instruct the AI to USE them. The Chat mode AI has the tools but doesn't know when to call them.

## Acceptance Criteria

1. `buildSystemPrompt()` includes a "Figma-Native Workflow" section instructing the AI to:
   - Call `read_figma_context` at the start of every design session
   - If variables exist: use `bind_variable` for colors instead of `set_fill` with hex
   - If styles exist: use `apply_paint_style` / `apply_text_style` instead of manual styling
2. The workflow section is positioned early in the prompt (after Core Rules, before Design Workflow) so the AI sees it before starting any design.
3. The Design Workflow step 1 is updated to include: "1b. Call read_figma_context to check for existing variables and styles."
4. Build clean.

## Tasks / Subtasks

- [ ] **Task 1: Add Figma-Native Workflow section** (AC: 1, 2)
- [ ] **Task 2: Update Design Workflow** (AC: 3)
- [ ] **Task 3: Build and test** (AC: 4)

## Dev Notes

**Short story.** Just prompt text additions to system-prompt.ts.

**The tools already exist in tools-schema.ts** (added in DQ-5/6). This story just tells the AI to use them.

**Files to modify:**
- `figmento/src/ui/system-prompt.ts`

---

# Story MQ-8: Post-Creation Structural Check

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"

## Story
**As a** user of Figmento's modes,
**I want** a structural quality check to run automatically after any design is created via UIAnalysis → createDesignFromAnalysis(),
**so that** gradient direction, auto-layout coverage, spacing, and typography issues are caught and fixed before I see the result.

## Context

The MCP path has `run_refinement_check` as a separate tool call. The Modes path creates designs in one shot via `createDesignFromAnalysis()`. This story adds a post-creation hook that runs the same quality checks and auto-fixes what it can.

This is the plugin-side equivalent of DQ-14, but integrated into the creation pipeline rather than being a separate tool call.

## Acceptance Criteria

1. After `createDesignFromAnalysis()` completes, a `postCreationRefinement(rootNode)` function runs automatically.
2. It checks: gradient direction vs text child positions, auto-layout coverage, spacing values on 8px grid.
3. Auto-fixes applied silently:
   - Gradient direction wrong → flip the gradient transform
   - itemSpacing not on 8px grid → round to nearest valid value
   - Frame with 2+ children missing auto-layout → set VERTICAL auto-layout
4. The function runs only on designs with 3+ elements (skip for single elements or simple creates).
5. A summary is logged via `console.log` for debugging (not shown to user): "Refinement: fixed 2 gradient directions, set auto-layout on 3 frames, adjusted 1 spacing value."
6. The function adds no more than 500ms to creation time.
7. Build clean.

## Tasks / Subtasks

- [ ] **Task 1: Create postCreationRefinement function** (AC: 1, 2, 3, 6)
  
  In `figmento/src/code.ts` (or a new `figmento/src/refinement.ts`):

  ```typescript
  async function postCreationRefinement(rootNode: SceneNode): Promise<void> {
    const fixes: string[] = [];

    // Walk the tree
    function walk(node: SceneNode) {
      // Check 1: Gradient direction vs text positions
      if ('fills' in node) {
        const fills = (node as GeometryMixin).fills as Paint[];
        for (const fill of fills) {
          if (fill.type === 'GRADIENT_LINEAR') {
            // Find text children, check if gradient solid end is near text
            // If not, flip the gradient transform
          }
        }
      }

      // Check 2: Auto-layout coverage
      if (node.type === 'FRAME' && 'children' in node) {
        const frame = node as FrameNode;
        if (frame.children.length >= 2 && frame.layoutMode === 'NONE') {
          frame.layoutMode = 'VERTICAL';
          frame.itemSpacing = 16;
          frame.primaryAxisAlignItems = 'MIN';
          frame.counterAxisAlignItems = 'MIN';
          fixes.push(`Set auto-layout on "${frame.name}"`);
        }
      }

      // Check 3: Spacing on 8px grid
      if (node.type === 'FRAME') {
        const frame = node as FrameNode;
        if (frame.layoutMode !== 'NONE') {
          const valid = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128];
          const nearest = (val: number) => valid.reduce((a, b) =>
            Math.abs(b - val) < Math.abs(a - val) ? b : a
          );
          if (!valid.includes(frame.itemSpacing)) {
            const fixed = nearest(frame.itemSpacing);
            frame.itemSpacing = fixed;
            fixes.push(`Spacing ${frame.itemSpacing}→${fixed} on "${frame.name}"`);
          }
        }
      }

      // Recurse
      if ('children' in node) {
        for (const child of (node as ChildrenMixin).children) {
          walk(child as SceneNode);
        }
      }
    }

    walk(rootNode);

    if (fixes.length > 0) {
      console.log(`Refinement: ${fixes.join(', ')}`);
    }
  }
  ```

- [ ] **Task 2: Wire into createDesignFromAnalysis()** (AC: 1, 4)
  - After the design is fully created, call `postCreationRefinement(rootFrame)`
  - Only if the design has 3+ total elements
- [ ] **Task 3: Build and test** (AC: 7)
  - Test with a design that has bad spacing → verify auto-corrected
  - Test with a simple single-element → verify refinement is skipped

## Dev Notes

**This function runs in Figma's sandbox** — it has direct access to all node properties. No WS, no MCP server needed. It modifies nodes directly via the Figma Plugin API.

**Be careful with gradient flipping.** Figma's gradient transform is a 2x3 matrix. Flipping it is non-trivial — look at `gradient-utils.ts` for the matrix calculations. If gradient fixing is too complex, skip it in v1 and just fix spacing + auto-layout.

**Performance:** Walking a tree of ~50 nodes and fixing properties takes <100ms. Well under the 500ms budget.

**Files to modify:**
- `figmento/src/code.ts` — add function + wire into createDesignFromAnalysis

---

# MQ Phase 2-4 Handoff

## Execution Order

```
Phase 2:
MQ-4 (blueprint injection) ─┐
                              ├─► both need build-time data extraction
MQ-5 (reference injection)  ─┘

Phase 3:
MQ-6 (tools-schema + refinement handler) → MQ-7 (chat variable workflow)

Phase 4:
MQ-8 (post-creation refinement hook)
```

## Build Command (All Stories)

```bash
cd figmento && npm run build
# Then reload plugin in Figma
```

## No MCP Server Changes

All 8 MQ stories modify only `figmento/` files. The MCP server is untouched.
