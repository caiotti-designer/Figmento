# Story CS-4: Extract Design Creation + Figma Native + Templates from code.ts

**Status:** Draft
**Priority:** Medium (P2)
**Complexity:** S (2 points) — Final cleanup extraction, small modules
**Epic:** CS — Code Split (Plugin Modularization)
**Depends on:** CS-3
**PRD:** Architecture Audit 2026-03-14 (Item 3)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + code.ts under 700 lines
```

---

## Story

**As a** Figmento plugin developer,
**I want** the remaining domain-specific logic extracted from code.ts,
**so that** code.ts is purely an entry point and message router under 700 lines.

---

## Description

After CS-1 (utils), CS-2 (storage/settings), and CS-3 (command router), code.ts should be ~1,200 lines. This story extracts the remaining 3 domains:

### Module 1: `handlers/design-creation.ts` (~150 lines)

| Function | Purpose |
|----------|---------|
| `createDesignFromAnalysis()` | High-level design creation pipeline from UIAnalysis |
| `createElementWithProgress()` | Recursive element creator with progress callback |
| `countElements()` | Already in utils/progress.ts (CS-1) — verify |
| `sendProgress()` | Already in utils/progress.ts (CS-1) — verify |

**State elimination:** `totalElements` and `createdElements` module-level counters become closure variables inside `createDesignFromAnalysis()`:

```typescript
export async function createDesignFromAnalysis(analysis: UIAnalysis, frameName?: string) {
  let totalElements = countElements(analysis.elements);
  let createdElements = 0;

  async function createWithProgress(element: UIElement, parent?: BaseNode) {
    await createElement(element, parent);
    createdElements++;
    sendProgress(`Creating design... ${createdElements}/${totalElements}`);
  }
  // ...
}
```

### Module 2: `handlers/figma-native.ts` (~250 lines)

If not already placed in `canvas-query.ts` by CS-3, extract:

| Handler | Purpose |
|---------|---------|
| `handleReadFigmaContext()` | Read variables, styles, fonts from current file |
| `handleBindVariable()` | Bind Figma variable to node property |
| `handleApplyPaintStyle()` | Apply paint style to node |
| `handleApplyTextStyle()` | Apply text style to node |
| `handleApplyEffectStyle()` | Apply effect style to node |
| `handleCreateFigmaVariables()` | Create variable collection + variables |

### Module 3: `handlers/templates.ts` (~200 lines)

| Function | Purpose |
|----------|---------|
| `handleGetSelectedImage()` | Export selected node as data URL |
| `createReferenceImage()` | Place image in new frame |
| `scanTemplateFrames()` | Scan for #placeholder nodes |
| `findPlaceholders()` | Recursive placeholder finder |
| `applyTemplateText()` | Replace placeholder text |
| `applyTemplateImage()` | Replace placeholder image |

---

## Acceptance Criteria

- [ ] AC1: `handlers/design-creation.ts` created, exports `createDesignFromAnalysis()`
- [ ] AC2: `totalElements` and `createdElements` no longer module-level variables — enclosed in function scope
- [ ] AC3: `handlers/figma-native.ts` created (if not already in canvas-query.ts from CS-3)
- [ ] AC4: `handlers/templates.ts` created with template + image utility functions
- [ ] AC5: `code.ts` is under 700 lines — contains only:
  - Plugin initialization (`figma.showUI`)
  - `figma.ui.onmessage` handler (delegating to imported handlers)
  - `autoSnapshotAfterCommand()` (or moved to storage handler)
  - Page change listener
- [ ] AC6: `npm run build` clean
- [ ] AC7: Design creation, Figma native features, and template operations work identically

---

## Tasks

1. Create `handlers/design-creation.ts` — move `createDesignFromAnalysis()` and `createElementWithProgress()`, convert module-level counters to closures
2. Create `handlers/figma-native.ts` (if not done in CS-3) — move 6 handlers
3. Create `handlers/templates.ts` — move 6 template/image functions
4. Update `code.ts` — replace with imports and delegation
5. Consider moving `autoSnapshotAfterCommand()` to `handlers/storage.ts` (it's snapshot-related)
6. Build and test

---

## Dev Notes

- **`createDesignFromAnalysis` calls `createElement()`** from `element-creators.ts` — already an external import.
- **`createDesignFromAnalysis` calls `postCreationRefinement()`** from `refinement.ts` — already an external import.
- **After this story, `code.ts` should look like:**

```typescript
import { handleStorageMessage } from './handlers/storage';
import { handleSettingsMessage } from './handlers/settings';
import { executeCommand } from './command-router';
import { createDesignFromAnalysis } from './handlers/design-creation';
import { handleGetSelectedImage, createReferenceImage, ... } from './handlers/templates';

figma.showUI(__html__, { width: 450, height: 820 });

figma.ui.onmessage = async (msg) => {
  if (await handleStorageMessage(msg)) return;
  if (await handleSettingsMessage(msg)) return;

  switch (msg.type) {
    case 'create-design': { ... createDesignFromAnalysis(msg.analysis); break; }
    case 'execute-command': { ... executeCommand(msg.command); break; }
    // ~15 remaining thin cases
  }
};

figma.on('currentpagechange', () => { ... });
```

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/handlers/design-creation.ts` | CREATE | Design pipeline (~150 lines) |
| `figmento/src/handlers/figma-native.ts` | CREATE (if needed) | 6 Figma native handlers (~250 lines) |
| `figmento/src/handlers/templates.ts` | CREATE | Template + image functions (~200 lines) |
| `figmento/src/code.ts` | MODIFY | Remove ~500 lines, reduce to <700 lines |

---

## Definition of Done

- [ ] `npm run build` clean
- [ ] `code.ts` under 700 lines
- [ ] All features work identically
- [ ] Zero module-level mutable state in code.ts

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment |
