# Story SU-2.2: Generator Script + Prebuild Hook

**Status:** Done (retroactive — @po audit 2026-04-14)
**Priority:** High
**Complexity:** M (Medium — ~120 LOC generator script + ~40 LOC refactor of tools-schema.ts, 1 new dependency)
**Epic:** Schema Unification
**Depends on:** SU-2.1 (named schema exports must exist before this story starts)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: both builds passing clean (figmento + figmento-mcp-server)
```

---

## Story

**As a** developer maintaining the Figmento plugin and MCP server,
**I want** `figmento/src/ui/tools-schema.generated.ts` to be auto-generated from the canonical Zod schemas in the MCP server during `npm run build`,
**so that** schema drift between the plugin and MCP server is structurally impossible — the plugin's tool definitions are always in sync with the MCP server's Zod schemas.

---

## Description

After SU-2.1, every tool's Zod schema is a named export in `figmento-mcp-server/src/tools/*.ts`. This story wires up the generation pipeline:

```
npm run build (figmento/)
  └─ prebuild hook
       └─ tsx ../scripts/generate-tool-schemas.ts
            ├─ imports named Zod exports from figmento-mcp-server/src/tools/*
            ├─ filters to PLUGIN_TOOLS whitelist (35 MCP tools)
            ├─ converts each via zodToJsonSchema()
            └─ writes figmento/src/ui/tools-schema.generated.ts

  └─ build step (esbuild)
       └─ tools-schema.ts imports GENERATED_TOOLS from tools-schema.generated.ts
```

### Step 1 — New devDependency: `zod-to-json-schema`

Add to **`figmento-mcp-server/package.json`** devDependencies (must co-exist with the same `zod` instance to avoid `instanceof` mismatches):

```json
"zod-to-json-schema": "^3.24.0"
```

Also add to **`figmento/package.json`** devDependencies (needed at install time for `tsx` resolution):

```json
"zod-to-json-schema": "^3.24.0"
```

> **Zod instance note:** `zod-to-json-schema` uses `instanceof ZodType` to walk the schema. If the Zod schemas are imported from `figmento-mcp-server/src/tools/` and they reference `figmento-mcp-server/node_modules/zod`, while `zod-to-json-schema` uses `figmento/node_modules/zod`, the conversion will silently produce `{}` for all schemas. To prevent this, the generator script must import `zodToJsonSchema` from the path that resolves to the **same `zod` instance** as the schemas. The safest approach: require both packages to install `zod-to-json-schema` and use a `require.resolve`-based import in the script. See Dev Notes.

### Step 2 — Generator script: `scripts/generate-tool-schemas.ts`

Location: **repo root `scripts/generate-tool-schemas.ts`** (next to `render-html.js`).

```typescript
// scripts/generate-tool-schemas.ts
// Auto-generates figmento/src/ui/tools-schema.generated.ts from MCP server Zod schemas.
// Run: npx tsx ../scripts/generate-tool-schemas.ts (from figmento/)
// Or: npm run build (figmento/) — triggered automatically via prebuild hook.

import { zodToJsonSchema } from 'zod-to-json-schema';
import * as path from 'path';
import * as fs from 'fs';

// ── Import named schema exports from each MCP tool file ─────────────────────
// (These exports were created in SU-2.1)
import * as canvasSchemas from '../figmento-mcp-server/src/tools/canvas';
import * as styleSchemas from '../figmento-mcp-server/src/tools/style';
import * as batchSchemas from '../figmento-mcp-server/src/tools/batch';
import * as sceneSchemas from '../figmento-mcp-server/src/tools/scene';
import * as exportSchemas from '../figmento-mcp-server/src/tools/export';
import * as refinementSchemas from '../figmento-mcp-server/src/tools/refinement';
import * as intelligenceSchemas from '../figmento-mcp-server/src/tools/intelligence';
import * as nativeSchemas from '../figmento-mcp-server/src/tools/figma-native';
import * as iconsSchemas from '../figmento-mcp-server/src/tools/icons';
import * as layoutsSchemas from '../figmento-mcp-server/src/tools/layouts';
// ... add remaining modules after reading SU-2.1 output

// ── PLUGIN_TOOLS whitelist: 35 MCP tools surfaced in the plugin ─────────────
// (update_memory and generate_image are plugin-only — added manually in tools-schema.ts)
const PLUGIN_TOOLS = new Set([
  'create_frame', 'create_text', 'create_rectangle', 'create_ellipse', 'create_image',
  'set_fill', 'set_stroke', 'set_effects', 'set_corner_radius', 'set_opacity', 'set_auto_layout',
  'get_selection', 'get_screenshot', 'export_node', 'get_node_info', 'get_page_nodes',
  'delete_node', 'move_node', 'resize_node', 'rename_node', 'append_child',
  'group_nodes', 'clone_node', 'create_design',
  'read_figma_context', 'bind_variable', 'apply_paint_style', 'apply_text_style',
  'apply_effect_style', 'run_refinement_check', 'create_figma_variables',
  'get_layout_blueprint', 'get_color_palette', 'get_font_pairing', 'get_size_preset',
]);

// ── Build a flat name → Zod schema map from all imported modules ─────────────
// Schema exports match the pattern: toolNameSchema (camelCase + 'Schema')
// e.g. createFrameSchema → 'create_frame'
function schemaExportToToolName(exportName: string): string {
  // Strip trailing 'Schema', then convert camelCase to snake_case
  const base = exportName.replace(/Schema$/, '');
  return base.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

const allModules = [
  canvasSchemas, styleSchemas, batchSchemas, sceneSchemas, exportSchemas,
  refinementSchemas, intelligenceSchemas, nativeSchemas, iconsSchemas, layoutsSchemas,
  // ... add remaining modules
];

const schemaMap: Record<string, unknown> = {};
for (const mod of allModules) {
  for (const [exportName, value] of Object.entries(mod)) {
    if (exportName.endsWith('Schema') && typeof value === 'object' && value !== null) {
      const toolName = schemaExportToToolName(exportName);
      schemaMap[toolName] = value;
    }
  }
}

// ── Generate tool definitions for whitelisted tools ──────────────────────────
// Also need tool descriptions — import them from a companion descriptions map
// (see Dev Notes for approach)
import { TOOL_DESCRIPTIONS } from '../figmento-mcp-server/src/tools/descriptions';

const generated = [];
for (const toolName of PLUGIN_TOOLS) {
  const schema = schemaMap[toolName];
  if (!schema) {
    console.warn(`[generate-tool-schemas] WARNING: no schema found for whitelisted tool '${toolName}'`);
    continue;
  }
  const jsonSchema = zodToJsonSchema(schema as Parameters<typeof zodToJsonSchema>[0], { errorMessages: false });
  generated.push({
    name: toolName,
    description: TOOL_DESCRIPTIONS[toolName] || '',
    input_schema: jsonSchema,
  });
}

// ── Write output file ────────────────────────────────────────────────────────
const outputPath = path.join(__dirname, '../figmento/src/ui/tools-schema.generated.ts');
const banner = `// AUTO-GENERATED — do not edit manually.
// Source: scripts/generate-tool-schemas.ts
// Regenerate: cd figmento && npm run build  (or: npx tsx ../scripts/generate-tool-schemas.ts)
// Last generated: ${new Date().toISOString()}
import type { ToolDefinition } from './tools-schema';

`;
const body = `export const GENERATED_TOOLS: ToolDefinition[] = ${JSON.stringify(generated, null, 2)};\n`;
fs.writeFileSync(outputPath, banner + body, 'utf-8');
console.log(`[generate-tool-schemas] Wrote ${generated.length} tools to tools-schema.generated.ts`);
```

> **Important — `TOOL_DESCRIPTIONS` map:** The generator needs the description strings for each tool (the 2nd arg to `server.tool()`). These are currently embedded inline. Create a new file `figmento-mcp-server/src/tools/descriptions.ts` that exports `TOOL_DESCRIPTIONS: Record<string, string>` mapping each tool name to its description string. Extract descriptions from each tool file. The `register*Tools` functions import and use this map too, so descriptions stay in one place.
>
> Alternatively (simpler — @dev decides): embed the description extraction in the generator by reading the AST, or hardcode descriptions in the generator script itself. If hardcoding is chosen, document the decision.

### Step 3 — Prebuild hook in `figmento/package.json`

```json
"scripts": {
  "prebuild": "npx tsx ../scripts/generate-tool-schemas.ts",
  "build": "node build.js",
  ...
}
```

Note: path is `../scripts/` (one level up from `figmento/` to repo root, then into `scripts/`). The user's original request said `../../scripts/` — that path is incorrect given the actual directory structure. Correct path is `../scripts/`.

### Step 4 — Refactor `figmento/src/ui/tools-schema.ts`

After the generator runs, `tools-schema.generated.ts` exists. Refactor `tools-schema.ts` to use it:

```typescript
// tools-schema.ts — after refactor
// Generated tools come from the prebuild step. Plugin-only tools appended manually.

import { GENERATED_TOOLS } from './tools-schema.generated';

// ... keep ToolDefinition interface ...
// ... keep CHAT_EXCLUDED, LOOKUP_TOOLS, BUILD_PHASE_TRIGGERS, PLAN_PHASE_TOOLS, BUILD_PHASE_TOOLS sets UNCHANGED ...
// ... keep chatToolResolver() UNCHANGED ...
// ... keep fillSchema, cornerRadiusSchema helpers (still needed for plugin-only tools) ...

/** Tools that exist only in the plugin (no MCP server equivalent). */
const PLUGIN_ONLY_TOOLS: ToolDefinition[] = [
  {
    name: 'generate_image',
    description: 'Generate an image using AI (Gemini Imagen) and place it on the canvas...',
    input_schema: { /* keep exactly as current */ },
  },
  {
    name: 'update_memory',
    description: 'Save a design lesson, user preference, or rule to persistent memory...',
    input_schema: { /* keep exactly as current */ },
  },
];

export const FIGMENTO_TOOLS: ToolDefinition[] = [
  ...GENERATED_TOOLS,
  ...PLUGIN_ONLY_TOOLS,
];
```

The large handwritten tool definitions (create_frame, create_text, etc.) that previously occupied lines 137–749 are REMOVED. Only `generate_image` and `update_memory` remain as manual definitions.

### Step 5 — `.gitignore` entry

Add to root `.gitignore` (or `figmento/.gitignore` if it exists):
```
figmento/src/ui/tools-schema.generated.ts
```

---

## What is NOT in scope

- No changes to any tool handler or plugin behavior
- No changes to `CHAT_EXCLUDED`, `LOOKUP_TOOLS`, `PLAN_PHASE_TOOLS`, `BUILD_PHASE_TOOLS` set membership — phase filtering is unchanged
- SU-2.3 (snapshot test) is a separate story
- No changes to the MCP server's own build or runtime behavior
- The `generate_image` and `update_memory` plugin-only tools remain hand-authored in `tools-schema.ts`

---

## Acceptance Criteria

- [ ] **AC1:** `scripts/generate-tool-schemas.ts` exists at repo root. Running `npx tsx scripts/generate-tool-schemas.ts` from the repo root (or `npx tsx ../scripts/generate-tool-schemas.ts` from `figmento/`) produces a non-empty `figmento/src/ui/tools-schema.generated.ts` with exactly 35 tool entries.
- [ ] **AC2:** `figmento/src/ui/tools-schema.generated.ts` is listed in `.gitignore` (root or figmento-level). It is not committed to the repo.
- [ ] **AC3:** `figmento/package.json` has `"prebuild": "npx tsx ../scripts/generate-tool-schemas.ts"` in its scripts.
- [ ] **AC4:** `cd figmento && npm run build` runs the prebuild step first (generating the schema file), then runs esbuild — and the full build passes clean.
- [ ] **AC5:** `figmento/src/ui/tools-schema.ts` no longer contains the hand-written definitions for the 35 generated tools. `FIGMENTO_TOOLS` is assembled from `[...GENERATED_TOOLS, ...PLUGIN_ONLY_TOOLS]`. Only `generate_image` and `update_memory` remain as hand-authored definitions.
- [ ] **AC6:** The phase filtering sets (`CHAT_EXCLUDED`, `LOOKUP_TOOLS`, `BUILD_PHASE_TRIGGERS`, `PLAN_PHASE_TOOLS`, `BUILD_PHASE_TOOLS`) and `chatToolResolver()` are unchanged in `tools-schema.ts`.
- [ ] **AC7:** The generated `tools-schema.generated.ts` contains correct JSON Schema for each tool — `create_frame` must have a `properties` object with `width`, `height`, `layoutMode`, `primaryAxisSizingMode`, `counterAxisSizingMode`, etc. matching the current hand-authored schema. Verify at least `create_frame`, `set_fill`, and `set_auto_layout` by inspection.
- [ ] **AC8:** `cd figmento-mcp-server && npm run build` still passes clean (SU-2.1 + SU-2.2 changes are additive only).
- [ ] **AC9:** No TypeScript errors in `tools-schema.ts` after the refactor.
- [ ] **AC10:** No changes to `figmento/src/code.ts`, any relay files, or the MCP server's tool handlers.

---

## Tasks

- [ ] **Task 1: Install `zod-to-json-schema`**
  - Add to `figmento-mcp-server/package.json` devDependencies: `"zod-to-json-schema": "^3.24.0"`
  - Add to `figmento/package.json` devDependencies: `"zod-to-json-schema": "^3.24.0"`
  - Run `npm install` in both packages

- [ ] **Task 2: Resolve the tool description strategy**
  - Decision: either (A) create `figmento-mcp-server/src/tools/descriptions.ts` with tool name → description string map, or (B) hardcode descriptions directly in the generator script.
  - If option A: extract description strings from each `server.tool('name', 'DESCRIPTION HERE', ...)` call in all 17 files and populate `descriptions.ts`. Update `register*Tools` functions to import descriptions from there.
  - If option B: copy description strings directly into the generator script's data. No changes to MCP server files.
  - Document the choice in the story Change Log.

- [ ] **Task 3: Write `scripts/generate-tool-schemas.ts`**
  - Import all schema modules (from SU-2.1 named exports)
  - Build `schemaExportToToolName` mapping
  - Filter to `PLUGIN_TOOLS` whitelist (35 tools — `update_memory` and `generate_image` NOT in the whitelist)
  - Convert each schema with `zodToJsonSchema(schema, { errorMessages: false })`
  - Write output to `figmento/src/ui/tools-schema.generated.ts`
  - Add auto-generated header comment with timestamp and regeneration instructions

- [ ] **Task 4: Verify zod instance alignment**
  - Run the generator script standalone: `cd figmento && npx tsx ../scripts/generate-tool-schemas.ts`
  - Inspect `tools-schema.generated.ts` — if any tool's `input_schema` is `{}` (empty object), the Zod instance mismatch is active
  - If mismatch: adjust the import path for `zodToJsonSchema` so it resolves from `figmento-mcp-server/node_modules/` (see Dev Notes)

- [ ] **Task 5: Add prebuild hook to `figmento/package.json`**
  - Add `"prebuild": "npx tsx ../scripts/generate-tool-schemas.ts"` to scripts
  - Verify `npm run build` in `figmento/` triggers prebuild first

- [ ] **Task 6: Refactor `tools-schema.ts`**
  - Add import for `GENERATED_TOOLS` from `./tools-schema.generated`
  - Extract `generate_image` and `update_memory` into `PLUGIN_ONLY_TOOLS` array
  - Replace `FIGMENTO_TOOLS` array body with `[...GENERATED_TOOLS, ...PLUGIN_ONLY_TOOLS]`
  - Delete the 35 hand-authored tool definition objects (lines 137–749 approximately)
  - Keep all phase filtering logic, helper schemas (`fillSchema`, `cornerRadiusSchema`), and `chatToolResolver()` unchanged

- [ ] **Task 7: Add to `.gitignore`**
  - Add `figmento/src/ui/tools-schema.generated.ts` (or `src/ui/tools-schema.generated.ts` if using `figmento/.gitignore`)

- [ ] **Task 8: Build verification**
  - `cd figmento && npm run build` — must run prebuild, generate schema file, complete esbuild clean
  - `cd figmento-mcp-server && npm run build` — must still pass clean

---

## Dev Notes

- **Zod instance alignment (critical).** `zod-to-json-schema` checks `value instanceof z.ZodType`. If the imported schema objects came from `figmento-mcp-server/node_modules/zod` but `zodToJsonSchema` was resolved from `figmento/node_modules/zod`, the `instanceof` check fails and returns `{}` for every schema. To fix: in the generator script, import `zodToJsonSchema` using an explicit path that resolves to the same `zod` instance:

  ```typescript
  // Force resolution from figmento-mcp-server's zod-to-json-schema
  import { zodToJsonSchema } from '../../figmento-mcp-server/node_modules/zod-to-json-schema/src/index.js';
  ```

  Or add a root-level `node_modules` symlink. Or use `require()` with a resolved path. Verify by checking whether `tools-schema.generated.ts` produces non-empty schemas after running. **This is the highest-risk step in this story.**

- **`__dirname` in tsx scripts.** When running a `.ts` file via `tsx`, `__dirname` resolves to the directory of the `.ts` file (not dist). The output path `path.join(__dirname, '../figmento/src/ui/tools-schema.generated.ts')` uses the script's location (`scripts/`) as base. From `scripts/`, `../figmento/src/ui/` resolves correctly to the plugin's source directory.

- **`tools-schema.generated.ts` TypeScript typing.** The file will contain a `const` with a `ToolDefinition[]` type import. Since `ToolDefinition` is in `tools-schema.ts` (same package), the import is `import type { ToolDefinition } from './tools-schema'`. Circular import risk: `tools-schema.ts` imports from `tools-schema.generated.ts`, which imports a type from `tools-schema.ts`. TypeScript handles `import type` circular references correctly as long as it's type-only. Confirm the build passes — if not, extract `ToolDefinition` to a separate `types.ts`.

- **Generated schema fidelity check.** After generating, diff the generated `create_frame` schema against the hand-authored one. Key properties to verify: `width` (required), `height` (required), `primaryAxisSizingMode` (optional enum `['FIXED','AUTO','HUG']`, with warning description), `counterAxisSizingMode` (same), `layoutMode` (optional enum). Any missing or mismatched field is a regression.

- **`tsx` path for prebuild.** The root `package.json` (repo root) does NOT have `tsx`. Only `figmento/package.json` has it in devDependencies. Running `npm run build` from `figmento/` uses `figmento/node_modules/.bin/tsx` via npx — this is correct. Do not add `tsx` to the root package.

- **`descriptions.ts` strategy preference.** Option B (hardcode in generator) is simpler and avoids touching the MCP server's register functions. Unless descriptions need to be reused for other purposes, prefer B. If the generator script grows too large, Option A is the right refactor — but that's SU-3 scope.

---

## File List

| File | Action | Notes |
|---|---|---|
| `scripts/generate-tool-schemas.ts` | CREATE | Generator script (~120 LOC) |
| `figmento/src/ui/tools-schema.ts` | MODIFY | Remove 35 hand-authored tool defs; import from generated file; keep phase logic |
| `figmento/src/ui/tools-schema.generated.ts` | GENERATED | Do not edit manually; gitignored |
| `figmento/package.json` | MODIFY | Add `prebuild` script; add `zod-to-json-schema` devDep |
| `figmento-mcp-server/package.json` | MODIFY | Add `zod-to-json-schema` devDep |
| `.gitignore` | MODIFY | Add `figmento/src/ui/tools-schema.generated.ts` |
| `figmento-mcp-server/src/tools/descriptions.ts` | CREATE (optional) | Only if option A chosen for descriptions |

---

## Definition of Done

- [ ] `scripts/generate-tool-schemas.ts` produces a valid, non-empty `tools-schema.generated.ts` in one run
- [ ] Generated file contains all 35 whitelisted MCP tools with correct JSON Schema
- [ ] `tools-schema.ts` imports from generated file; only `generate_image` + `update_memory` remain hand-authored
- [ ] `figmento/package.json` has `prebuild` hook — `npm run build` runs generation automatically
- [ ] `tools-schema.generated.ts` is gitignored
- [ ] Both builds pass clean
- [ ] No changes to plugin behavior — same 37 tools exposed in `FIGMENTO_TOOLS`

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-07 | @sm (River) | Story created. Generator script at repo root `scripts/`, zod-to-json-schema in both packages, prebuild hook in figmento/package.json. Key risk: Zod instance alignment for zod-to-json-schema instanceof check. 35 MCP tools generated; 2 plugin-only kept manual. |
| 2026-04-14 | @po (Pax) | **Retroactive Done.** Audit confirms full implementation was shipped silently: `scripts/generate-tool-schemas.ts` exists (213 lines), `figmento/src/ui/tools-schema.generated.ts` exists and is gitignored, `prebuild` hook in `figmento/package.json` runs the generator, `tools-schema.ts` imports `GENERATED_TOOLS` and assembles `FIGMENTO_TOOLS` as `[...GENERATED_TOOLS, ...PLUGIN_ONLY_TOOLS]`, `zod-to-json-schema` is a devDep in both packages. Build clean, tests pass (388/388). Generator writes 40 tools per run (2 whitelist entries missing — `clone_node` removed in `7cb7e92`, `get_design_rules` is plugin-only). Zod instance alignment works correctly in practice. Status: Ready → Done. |
