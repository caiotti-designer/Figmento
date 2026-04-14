# Story CS-3: Extract Command Router + Canvas Handlers from code.ts

**Status:** Done (retroactive — @po audit 2026-04-13)
**Priority:** Medium (P2)
**Complexity:** M (5 points) — 29 command handlers + router switch, largest extraction
**Epic:** CS — Code Split (Plugin Modularization)
**Depends on:** CS-1
**PRD:** Architecture Audit 2026-03-14 (Item 3)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + all 29 commands work via MCP → relay → plugin
```

---

## Story

**As a** Figmento plugin developer,
**I want** the `executeCommand` switch and its 29 canvas handlers extracted from code.ts,
**so that** command handling is isolated, testable, and doesn't bloat the main entry point.

---

## Description

Extract the entire WebSocket command execution layer (~1,500 lines) from `code.ts` into a modular structure.

### New File Structure

```
figmento/src/
├── command-router.ts              (~100 lines — switch dispatch)
├── handlers/
│   ├── canvas-create.ts           (~350 lines — 6 create handlers)
│   ├── canvas-style.ts            (~350 lines — 7 style handlers)
│   ├── canvas-scene.ts            (~300 lines — 11 scene handlers)
│   ├── canvas-query.ts            (~200 lines — 5 query/export handlers)
│   └── canvas-batch.ts            (~250 lines — 4 batch/complex handlers)
```

### command-router.ts

Exports `executeCommand(cmd: WSCommand): Promise<WSResponse>`:

```typescript
import { handleCreateFrame, handleCreateText, ... } from './handlers/canvas-create';
import { handleSetFill, handleSetStroke, ... } from './handlers/canvas-style';
import { handleMoveNode, handleDeleteNode, ... } from './handlers/canvas-scene';
import { handleGetSelection, handleExportNode, ... } from './handlers/canvas-query';
import { handleBatchExecute, handleCloneWithOverrides, ... } from './handlers/canvas-batch';

export async function executeCommand(cmd: WSCommand): Promise<WSResponse> {
  const base = { type: 'response' as const, id: cmd.id, channel: cmd.channel };
  try {
    switch (cmd.action) {
      case 'create_frame':   return { ...base, success: true, data: await handleCreateFrame(cmd.params) };
      case 'create_text':    return { ...base, success: true, data: await handleCreateText(cmd.params) };
      // ... all 29 cases
      default: return { ...base, success: false, error: `Unknown action: ${cmd.action}`, errorCode: 'INVALID_PARAMS' };
    }
  } catch (err) {
    return { ...base, success: false, error: (err as Error).message, errorCode: classifyError(err as Error) };
  }
}
```

### Handler Files

Each file exports named async handler functions:

```typescript
// handlers/canvas-create.ts
export async function handleCreateFrame(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  // ... existing logic from code.ts
}
```

### Handler Distribution

| File | Handlers |
|------|----------|
| `canvas-create.ts` | `handleCreateFrame`, `handleCreateText`, `handleCreateRectangle`, `handleCreateEllipse`, `handleCreateImage`, `handleCreateIcon` |
| `canvas-style.ts` | `handleSetFill`, `handleSetStroke`, `handleSetEffects`, `handleSetCornerRadius`, `handleSetOpacity`, `handleSetAutoLayout`, `handleSetText` |
| `canvas-scene.ts` | `handleGetSelection`, `handleGetNodeInfo`, `handleGetPageNodes`, `handleDeleteNode`, `handleMoveNode`, `handleResizeNode`, `handleRenameNode`, `handleAppendChild`, `handleReorderChild`, `handleCloneNode`, `handleGroupNodes` |
| `canvas-query.ts` | `handleExportNode`, `handleGetScreenshot`, `handleScanFrameStructure`, `handleReadFigmaContext` |
| `canvas-batch.ts` | `handleBatchExecute`, `handleCloneWithOverrides`, `handleCreateDesignCmd`, `handleScanTemplateCmd`, `handleApplyTemplateTextCmd`, `handleApplyTemplateImageCmd` |

### Integration with code.ts

```typescript
// code.ts (updated)
import { executeCommand } from './command-router';

// In figma.ui.onmessage:
case 'execute-command': {
  const result = await executeCommand(msg.command);
  figma.ui.postMessage({ type: 'command-result', response: result });
  // Auto-snapshot logic stays here (references executeCommand result)
}
```

---

## Acceptance Criteria

- [ ] AC1: `command-router.ts` created with `executeCommand()` dispatch switch
- [ ] AC2: `handlers/canvas-create.ts` — 6 create handlers extracted and exported
- [ ] AC3: `handlers/canvas-style.ts` — 7 style handlers extracted and exported
- [ ] AC4: `handlers/canvas-scene.ts` — 11 scene handlers extracted and exported
- [ ] AC5: `handlers/canvas-query.ts` — 5 query/export/context handlers extracted and exported
- [ ] AC6: `handlers/canvas-batch.ts` — 6 batch/template/design handlers extracted and exported
- [ ] AC7: `code.ts` imports `executeCommand` from `command-router.ts` — no inline command handlers remain
- [ ] AC8: `autoSnapshotAfterCommand()` still triggered correctly after command execution (stays in code.ts)
- [ ] AC9: `npm run build` clean
- [ ] AC10: All 29 commands work end-to-end via MCP → relay → plugin → Figma
- [ ] AC11: `code.ts` reduced by ~1,500 lines

---

## Tasks

### Phase 1: Create Handler Files (Can Parallelize)

For each handler file:
1. Create the file in `figmento/src/handlers/`
2. Copy handler functions from `code.ts`
3. Add necessary imports (`hexToRgb`, `getGradientTransform`, Figma types, etc.)
4. Export each function as named export
5. Verify the function compiles standalone

### Phase 2: Create Command Router

1. Create `figmento/src/command-router.ts`
2. Import all handler functions from `handlers/canvas-*.ts`
3. Import `classifyError` from `utils/error-classifier.ts` (CS-1)
4. Build the switch statement
5. Export `executeCommand()`

### Phase 3: Update code.ts

1. Remove all 29 handler function definitions
2. Remove the `executeCommand` function
3. Import `executeCommand` from `./command-router`
4. Verify `autoSnapshotAfterCommand` still works (it reads `cmd.action` and `cmdResult` — both still available)

### Phase 4: Test

1. `npm run build`
2. Load plugin in Figma
3. Connect via MCP
4. Test each command category:
   - Create: frame, text, rectangle
   - Style: set_fill, set_auto_layout
   - Scene: move_node, delete_node, clone_node
   - Query: get_screenshot, get_page_nodes
   - Batch: batch_execute with 5+ commands

---

## Dev Notes

- **Figma Native handlers** (`handleReadFigmaContext`, `handleBindVariable`, `handleApplyPaintStyle`, `handleApplyTextStyle`, `handleApplyEffectStyle`, `handleCreateFigmaVariables`) go in `canvas-query.ts` for now. If this file gets too large, they can be split to `handlers/figma-native.ts` in CS-4.
- **`handleBatchExecute` calls `executeSingleAction`** which is a recursive action executor. It must import from `command-router.ts` or be co-located. Recommend keeping `executeSingleAction` in `canvas-batch.ts` with a direct import of individual handlers (not the full router) to avoid circular imports.
- **`handleCreateText` has font loading** via `figma.loadFontAsync()` — this is a Figma API call, available globally in the sandbox.
- **`handleSetFill` uses `getGradientTransform`** from `gradient-utils.ts` — already an external import.
- **`handleCreateIcon` uses SVG path parsing** from `svg-utils.ts` — already an external import.
- **Refinement check handlers** (`runRefinementCheck`) go in `canvas-query.ts` or stay as the existing `refinement.ts` module.
- **esbuild handles all imports** — it bundles everything into a single IIFE for the Figma sandbox. No runtime module resolution issues.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/command-router.ts` | CREATE | `executeCommand()` switch dispatch |
| `figmento/src/handlers/canvas-create.ts` | CREATE | 6 create handlers |
| `figmento/src/handlers/canvas-style.ts` | CREATE | 7 style handlers |
| `figmento/src/handlers/canvas-scene.ts` | CREATE | 11 scene handlers |
| `figmento/src/handlers/canvas-query.ts` | CREATE | 5+ query/export/native handlers |
| `figmento/src/handlers/canvas-batch.ts` | CREATE | 6 batch/template/design handlers |
| `figmento/src/code.ts` | MODIFY | Remove ~1,500 lines, add 1 import |

---

## Definition of Done

- [ ] `npm run build` clean
- [ ] All 29 commands work end-to-end
- [ ] code.ts reduced by ~1,500 lines
- [ ] No circular imports

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment |
| 2026-04-13 | @po (Pax) | **Retroactive Done.** Audit confirms `figmento/src/handlers/command-router.ts` + `canvas-create.ts` + `canvas-style.ts` + `canvas-scene.ts` + `canvas-query.ts` + `canvas-batch.ts` all exist. Work shipped by @dev outside story workflow. Status: Draft → Done. |
