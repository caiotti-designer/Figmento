# Story CS-1: Extract Utils from code.ts

**Status:** Done (retroactive — @po audit 2026-04-13)
**Priority:** Medium (P2)
**Complexity:** S (2 points) — Pure function extraction, zero behavioral change
**Epic:** CS — Code Split (Plugin Modularization)
**Depends on:** None
**PRD:** Architecture Audit 2026-03-14 (Item 3)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + all functions still callable from code.ts
```

---

## Story

**As a** Figmento plugin developer,
**I want** utility functions extracted from the 3,389-line code.ts into focused modules,
**so that** I can find, test, and maintain them independently.

---

## Description

Extract 4 utility modules from `figmento/src/code.ts`. These are pure functions with zero dependencies on Figma plugin state — they can be moved with a simple cut-and-paste + import.

### Extraction Map

| New File | Functions | Lines (approx) | Dependencies |
|----------|-----------|----------------|--------------|
| `utils/error-classifier.ts` | `classifyError()` | ~30 | None (pure string matching) |
| `utils/progress.ts` | `sendProgress()`, `delay()`, `countElements()` | ~30 | `figma.ui.postMessage` (Figma API) |
| `utils/node-utils.ts` | `serializeNode()`, `findChildByName()`, `findRootFrame()` | ~80 | Figma node types |
| `utils/temp-id-resolver.ts` | `resolveTempIds()`, `isCreationAction()` | ~40 | None (pure) |

### Pattern

Each file exports named functions. `code.ts` replaces inline definitions with imports:

```typescript
// Before (in code.ts)
function classifyError(error: Error): CommandErrorCode { ... }

// After
// utils/error-classifier.ts
export function classifyError(error: Error): CommandErrorCode { ... }

// code.ts
import { classifyError } from './utils/error-classifier';
```

---

## Acceptance Criteria

- [ ] AC1: `utils/error-classifier.ts` created, exports `classifyError()`
- [ ] AC2: `utils/progress.ts` created, exports `sendProgress()`, `delay()`, `countElements()`
- [ ] AC3: `utils/node-utils.ts` created, exports `serializeNode()`, `findChildByName()`, `findRootFrame()`
- [ ] AC4: `utils/temp-id-resolver.ts` created, exports `resolveTempIds()`, `isCreationAction()`
- [ ] AC5: `code.ts` imports all 4 modules — zero duplicate function definitions remain
- [ ] AC6: `npm run build` clean (esbuild bundles everything into dist/code.js)
- [ ] AC7: Plugin loads and executes commands identically to before

---

## Dev Notes

- **`sendProgress()` calls `figma.ui.postMessage()`** — this is a Figma sandbox API. The extracted module must still call it. Since esbuild bundles everything into one IIFE, `figma` is available as a global. No special import needed.
- **`serializeNode()` uses Figma node types** (`SceneNode`, `FrameNode`, etc.) — these are ambient types from `@figma/plugin-typings`. They'll resolve correctly if tsconfig includes the typings.
- **`findRootFrame()` walks up the node tree** via `node.parent` — pure Figma API, no state.
- **Create `figmento/src/utils/` directory** before adding files.
- **Do NOT move any state-mutating code** in this story. Only pure/stateless functions.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/utils/error-classifier.ts` | CREATE | `classifyError()` |
| `figmento/src/utils/progress.ts` | CREATE | `sendProgress()`, `delay()`, `countElements()` |
| `figmento/src/utils/node-utils.ts` | CREATE | `serializeNode()`, `findChildByName()`, `findRootFrame()` |
| `figmento/src/utils/temp-id-resolver.ts` | CREATE | `resolveTempIds()`, `isCreationAction()` |
| `figmento/src/code.ts` | MODIFY | Replace 4 function blocks with imports (~180 lines removed) |

---

## Definition of Done

- [ ] `npm run build` clean
- [ ] Plugin loads in Figma and responds to all commands
- [ ] code.ts reduced by ~180 lines

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment |
| 2026-04-13 | @po (Pax) | **Retroactive Done.** Audit confirms all 4 files exist in `figmento/src/utils/` (`error-classifier.ts`, `progress.ts`, `node-utils.ts`, `temp-id-resolver.ts`). Work shipped by @dev outside story workflow. Status: Draft → Done. |
