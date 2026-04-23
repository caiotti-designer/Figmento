# Story SU-1: Schema Unification Phase 1

**Status:** Done
**Priority:** High
**Complexity:** S (Small — surgical edits across 5 files, ~40 LOC net change, no new logic)
**Epic:** Schema Unification
**Depends on:** None

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: both builds passing clean
```

---

## Story

**As a** Claude Code session using the Figmento MCP server,
**I want** the plugin's chat-mode tool schema and the MCP server's Zod schemas to agree on tool names and accepted parameters,
**so that** tool calls generated for one surface work correctly on the other without silent drops or validation errors.

---

## Description

The plugin's `tools-schema.ts` and the MCP server's `canvas.ts` / `style.ts` have drifted in three independent ways:

### Gap 1 — Tool name mismatch: `lookup_*` vs `get_*`

The plugin's `FIGMENTO_TOOLS` array defines four local-intelligence tools with `lookup_` names:

```
lookup_blueprint   → MCP equivalent: get_layout_blueprint
lookup_palette     → MCP equivalent: get_color_palette
lookup_fonts       → MCP equivalent: get_font_pairing
lookup_size        → MCP equivalent: get_size_preset
```

The MCP server uses `get_*` names (defined in `intelligence.ts`). The plugin uses `lookup_*` names (defined in `tools-schema.ts` and resolved in `local-intelligence.ts`). Any cross-surface story (relay chat engine, shared knowledge) must pick one convention. The `get_*` names match the MCP's live tool registry — rename the plugin side to match.

**All occurrences to update in the plugin:**
- `figmento/src/ui/tools-schema.ts` — 4 `name:` fields in `FIGMENTO_TOOLS`, plus `LOOKUP_TOOLS` set, `PLAN_PHASE_TOOLS` set entries, `BUILD_PHASE_TOOLS` set entries (if present)
- `figmento/src/ui/local-intelligence.ts` — 4 resolver map keys (`lookup_blueprint:`, `lookup_palette:`, `lookup_fonts:`, `lookup_size:`)
- `figmento/src/ui/system-prompt.ts` — tool name references in the system prompt text (e.g., `"Call lookup_size(format)"`)

### Gap 2 — Missing `primaryAxisSizingMode` / `counterAxisSizingMode` in MCP schemas

The plugin's `create_frame` schema includes:
```typescript
primaryAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO'] }
counterAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO'] }
```

The plugin's `set_auto_layout` schema includes:
```typescript
primaryAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO', 'HUG'] }
counterAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO', 'HUG'] }
```

The MCP server's `create_frame` (in `canvas.ts`) and `set_auto_layout` (in `style.ts`) Zod schemas do **not** include these fields. When Claude Code calls `create_frame` or `set_auto_layout` with `primaryAxisSizingMode`, the param is silently dropped by Zod validation before reaching the plugin — resulting in incorrect sizing behavior on frames.

**Fix:** Add both fields as optional Zod params to both MCP tools. Use `z.enum(['FIXED', 'AUTO', 'HUG'])` to be a superset of both plugin schemas.

### Gap 3 — Missing `scaleMode` in plugin `create_image` schema

The MCP server's `create_image` tool (in `canvas.ts`) includes:
```typescript
scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional().default('FILL')
```

The plugin's `create_image` entry in `FIGMENTO_TOOLS` (used by the chat-mode tool-use loop) does **not** include `scaleMode`. When the chat mode tool-use loop calls `create_image` with `scaleMode`, the field is not in the schema, which can cause validation noise or tool-use loop inconsistency.

**Fix:** Add `scaleMode` as an optional field to the plugin's `create_image` input schema in `tools-schema.ts`.

---

## What is NOT in scope

- No generator or code-gen tooling — this is manual sync only
- No changes to tool logic, handlers, or plugin sandbox (`code.ts`)
- No changes to `intelligence.ts` in the MCP server — the `get_*` names already exist there
- No protocol changes — the plugin and sandbox still communicate via the same message types
- No changes to the MCP server's `lookup_*` intelligence tool implementations (there are none — the `get_*` names are the canonical ones in the MCP)
- SU-2 and beyond (automated drift detection, generator) are future stories

---

## Acceptance Criteria

- [x] **AC1:** In `figmento/src/ui/tools-schema.ts` — the four intelligence tool `name` fields are renamed:
  - `'lookup_blueprint'` → `'get_layout_blueprint'`
  - `'lookup_palette'` → `'get_color_palette'`
  - `'lookup_fonts'` → `'get_font_pairing'`
  - `'lookup_size'` → `'get_size_preset'`
- [x] **AC2:** In `figmento/src/ui/tools-schema.ts` — the `LOOKUP_TOOLS` set (currently named `LOOKUP_TOOLS` or similar) is updated to use the new `get_*` names. `PLAN_PHASE_TOOLS` set entries are updated to match.
- [x] **AC3:** In `figmento/src/ui/local-intelligence.ts` — the resolver map object keys are renamed to match the new tool names:
  ```typescript
  // Before:
  lookup_blueprint: lookupBlueprint,
  lookup_palette: lookupPalette,
  lookup_fonts: lookupFonts,
  lookup_size: lookupSize,
  // After:
  get_layout_blueprint: lookupBlueprint,
  get_color_palette: lookupPalette,
  get_font_pairing: lookupFonts,
  get_size_preset: lookupSize,
  ```
  The underlying functions (`lookupBlueprint`, etc.) are unchanged — only the dispatch key renames.
- [x] **AC4:** In `figmento/src/ui/system-prompt.ts` — all inline references to old tool names in the prompt text are updated to the new names (e.g., `"Call lookup_size(format)"` → `"Call get_size_preset(format)"`).
- [x] **AC5:** In `figmento-mcp-server/src/tools/canvas.ts` — `create_frame` Zod schema gains two new optional fields:
  ```typescript
  primaryAxisSizingMode: z.enum(['FIXED', 'AUTO', 'HUG']).optional().describe('FIXED = fixed size; HUG/AUTO = hug contents'),
  counterAxisSizingMode: z.enum(['FIXED', 'AUTO', 'HUG']).optional().describe('FIXED = fixed size; HUG/AUTO = hug contents'),
  ```
- [x] **AC6:** In `figmento-mcp-server/src/tools/style.ts` — `set_auto_layout` Zod schema gains the same two optional fields with the same enum values.
- [x] **AC7:** In `figmento/src/ui/tools-schema.ts` — `create_image` input schema gains:
  ```typescript
  scaleMode: { type: 'string', enum: ['FILL', 'FIT', 'CROP', 'TILE'], description: 'Image scale mode (default: FILL)' }
  ```
  as an optional property (no `required` entry added).
- [x] **AC8:** `cd figmento && npm run build` passes with no errors.
- [x] **AC9:** `cd figmento-mcp-server && npm run build` passes with no errors.
- [x] **AC10:** No changes to `figmento/src/code.ts`, `figmento-mcp-server/src/tools/intelligence.ts`, or any relay files.

---

## Tasks

- [x] **Task1: Rename `lookup_*` → `get_*` in `tools-schema.ts`**
  - Find the 4 tool definition objects in `FIGMENTO_TOOLS` (near line 678)
  - Rename each `name:` field
  - Update `LOOKUP_TOOLS` set (or equivalent; search for `'lookup_blueprint'` inside any `new Set([...])`)
  - Update `PLAN_PHASE_TOOLS` set entries (line ~87)
  - Verify no other `lookup_` references remain in this file

- [x] **Task2: Rename resolver map keys in `local-intelligence.ts`**
  - Update the 4 object keys in the resolver map export (lines 117–120)
  - Do not rename the function names (`lookupBlueprint`, etc.) — only the dispatch keys

- [x] **Task3: Update system prompt text in `system-prompt.ts`**
  - Search for all `lookup_blueprint`, `lookup_palette`, `lookup_fonts`, `lookup_size` strings in prompt text
  - Replace each with the corresponding `get_*` name
  - Preserve the surrounding sentence structure and argument examples (e.g., `get_size_preset(format)`)

- [x] **Task4: Add sizing fields to MCP `create_frame` (`canvas.ts`)**
  - After `counterAxisAlignItems` (line ~39), add `primaryAxisSizingMode` and `counterAxisSizingMode`
  - Both optional, `z.enum(['FIXED', 'AUTO', 'HUG'])`

- [x] **Task5: Add sizing fields to MCP `set_auto_layout` (`style.ts`)**
  - After `counterAxisAlignItems` (line ~107), add same two fields
  - Both optional, `z.enum(['FIXED', 'AUTO', 'HUG'])`

- [x] **Task6: Add `scaleMode` to plugin `create_image` schema (`tools-schema.ts`)**
  - In the `create_image` input schema (line ~268), add `scaleMode` as an optional property
  - Enum: `['FILL', 'FIT', 'CROP', 'TILE']`
  - Do NOT add to `required` array

- [x] **Task7: Build verification**
  - `cd figmento && npm run build` — must pass clean
  - `cd figmento-mcp-server && npm run build` — must pass clean

---

## Dev Notes

- **Rename only the dispatch keys, not the implementation functions.** `lookupBlueprint()`, `lookupPalette()`, `lookupFonts()`, `lookupSize()` in `local-intelligence.ts` are internal — they don't need renaming. Only the object keys used as tool-name dispatch identifiers change.

- **`LOOKUP_TOOLS` set name does not need to change.** The variable is internal to `tools-schema.ts`. Renaming the values inside it is enough. Same for `PLAN_PHASE_TOOLS`.

- **`BUILD_PHASE_TOOLS` likely does not reference lookup tools** (build phase removes them). Confirm by checking — if `lookup_*` names are absent there, no change needed.

- **`HUG` vs `AUTO` in `primaryAxisSizingMode`.** The plugin's `create_frame` schema only lists `['FIXED', 'AUTO']` while `set_auto_layout` lists `['FIXED', 'AUTO', 'HUG']`. The MCP additions should use the superset `['FIXED', 'AUTO', 'HUG']` for both tools so they accept either value. The plugin sandbox (`code.ts`) already handles both — this is a schema declaration gap only.

- **Do not touch `intelligence.ts`.** The MCP's intelligence tool implementations (`get_layout_blueprint`, `get_color_palette`, `get_font_pairing`, `get_size_preset`) are already correctly named. No changes needed there.

- **Search sweep before marking done.** After completing all tasks, run a final search for any remaining `lookup_blueprint`, `lookup_palette`, `lookup_fonts`, `lookup_size` strings in the plugin source. Any hit is a miss.

---

## File List

| File | Action | Notes |
|---|---|---|
| `figmento/src/ui/tools-schema.ts` | MODIFY | Rename 4 tool `name:` fields; update `LOOKUP_TOOLS` + `PLAN_PHASE_TOOLS` sets; add `scaleMode` to `create_image` |
| `figmento/src/ui/local-intelligence.ts` | MODIFY | Rename 4 resolver map keys |
| `figmento/src/ui/system-prompt.ts` | MODIFY | Update `lookup_*` name references in prompt text |
| `figmento-mcp-server/src/tools/canvas.ts` | MODIFY | Add `primaryAxisSizingMode` + `counterAxisSizingMode` to `create_frame` Zod schema |
| `figmento-mcp-server/src/tools/style.ts` | MODIFY | Add `primaryAxisSizingMode` + `counterAxisSizingMode` to `set_auto_layout` Zod schema |

---

## Definition of Done

- [x] All `lookup_*` tool names replaced with `get_*` equivalents in plugin source
- [x] No remaining `lookup_blueprint|lookup_palette|lookup_fonts|lookup_size` in `figmento/src/ui/`
- [x] `primaryAxisSizingMode` + `counterAxisSizingMode` present in MCP `create_frame` and `set_auto_layout` schemas
- [x] `scaleMode` present in plugin `create_image` schema
- [x] `cd figmento && npm run build` passes clean
- [x] `cd figmento-mcp-server && npm run build` passes clean
- [x] No changes to any file outside the 5 listed

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-06 | @sm (River) | Story created. Three-gap manual schema sync: (1) `lookup_*` → `get_*` rename across 3 plugin files, (2) `primaryAxisSizingMode`/`counterAxisSizingMode` added to MCP `create_frame` + `set_auto_layout`, (3) `scaleMode` added to plugin `create_image`. 5 files, ~40 LOC net. Both builds must pass clean. |
| 2026-03-06 | @dev (Dex) | All 7 tasks complete. (1) `lookup_*` → `get_*` in `tools-schema.ts` (LOOKUP_TOOLS set, PLAN_PHASE_TOOLS set, 4 name fields), `local-intelligence.ts` (4 dispatch keys), `system-prompt.ts` (comment + 5 inline refs). Zero `lookup_*` remaining in `figmento/src/ui/`. (2) `primaryAxisSizingMode` + `counterAxisSizingMode` added to MCP `create_frame` (canvas.ts) and `set_auto_layout` (style.ts). (3) `scaleMode` added to plugin `create_image` schema. Both builds clean. Story marked **Done**. |
