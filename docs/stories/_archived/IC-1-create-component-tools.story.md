# Story IC-1: Create Component + Convert to Component Tools

**Status:** Done
**Priority:** High (P1) — gates all Phase 1 stories
**Complexity:** M (5 points) — Figsor reference exists, WS relay pattern is proven
**Epic:** IC — Interactive Components
**Depends on:** —
**PRD:** [PRD-007](../prd/PRD-007-interactive-components.md) — Phase 1

---

## Business Value

Figmento generates design system components (`create_ds_components`) and complex layouts — but everything stays as plain `FrameNode`. Designers must manually right-click → "Create Component" on each element. This story adds the missing link: programmatic `ComponentNode` creation via MCP, enabling the full variant and interaction pipeline (IC-2 through IC-12).

## Prior Art (What Already Works)

| Capability | Status | Location |
|-----------|--------|----------|
| `create_frame` + auto-layout + fills | Working | `canvas-create.ts` — creates `FrameNode` with all properties |
| `create_ds_components` (button, badge, card) | Working | `figma-native.ts` — tokenized frames, but as `FrameNode` |
| Figsor `create_component` reference | Available | `figsor-master/figsor-master/figma-plugin/code.js` L1322-1351 |
| Command router pattern | Working | `command-router.ts` — 68 existing commands, add 2 more |
| Plugin API `createComponent()` | GA | `figma.createComponent()` — returns `ComponentNode` |
| Plugin API `createComponentFromNode()` | GA | `figma.createComponentFromNode(node)` — preserves children |

## Out of Scope

- Combining components as variants (IC-2)
- Creating component instances (IC-3)
- Batch support for component actions (IC-4)
- Setting prototype interactions (IC-5)
- Converting `FrameNode` children into component children (recursive conversion)

## Risks

- `createComponentFromNode` throws if node is inside an instance or is already a component — handler must validate
- `createComponentFromNode` on a node with complex children (auto-layout + bound variables) — need to verify all properties preserve correctly

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, MCP server builds, both tools create/convert components in Figma"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento to generate design systems,
**I want** Figmento to create real Figma components (not just frames),
**so that** I can use them in the Assets panel, create instances, and build variant-based interactive prototypes.

---

## Description

### Problem

Every element Figmento creates is a `FrameNode`. Figma's component ecosystem (Assets panel, instances, variants, Code Connect) only works with `ComponentNode`. There's no bridge between Figmento's output and Figma's component infrastructure.

### Solution

Two new tools, one plugin handler file:

1. **`create_component`** — Creates a blank `ComponentNode` with properties (name, size, position, fill, corner radius, auto-layout, description). Equivalent to `create_frame` but returns a `ComponentNode`.

2. **`convert_to_component`** — Wraps `figma.createComponentFromNode(node)`. Takes an existing frame/group nodeId and converts it in-place to a component, preserving all children, fills, auto-layout, and constraints.

Both route through the WS relay using the established command pattern.

### Implementation Plan

**New file: `figmento/src/handlers/canvas-components.ts`**

```typescript
export async function handleCreateComponent(params: Record<string, unknown>) {
  const comp = figma.createComponent();
  comp.name = (params.name as string) || 'Component';
  comp.resize(
    (params.width as number) || 100,
    (params.height as number) || 100
  );
  comp.x = (params.x as number) || 0;
  comp.y = (params.y as number) || 0;
  if (params.description) comp.description = params.description as string;
  if (params.cornerRadius !== undefined) comp.cornerRadius = params.cornerRadius as number;
  // Apply fill, auto-layout, padding, itemSpacing (reuse existing helpers)
  // Append to parent if parentId provided
  return { nodeId: comp.id, name: comp.name, type: comp.type, componentKey: comp.key };
}

export async function handleConvertToComponent(params: Record<string, unknown>) {
  const nodeId = params.nodeId as string;
  const node = figma.getNodeById(nodeId);
  if (!node || !('type' in node)) throw new Error(`Node ${nodeId} not found`);
  if (node.type === 'COMPONENT') throw new Error(`Node ${nodeId} is already a component`);
  if (node.type === 'INSTANCE') throw new Error(`Cannot convert instance to component — detach first`);
  // Check if inside an instance
  let parent = node.parent;
  while (parent) {
    if ('type' in parent && parent.type === 'INSTANCE') {
      throw new Error(`Node is inside an instance — cannot convert`);
    }
    parent = parent.parent;
  }
  const comp = figma.createComponentFromNode(node as SceneNode);
  return { nodeId: comp.id, name: comp.name, type: comp.type, componentKey: comp.key };
}
```

**Modified: `command-router.ts`** — Add 2 case branches:
```typescript
case 'create_component': return handleCreateComponent(params);
case 'convert_to_component': return handleConvertToComponent(params);
```

**New MCP tools in `figmento-mcp-server/src/tools/components.ts`:**
- `create_component` — params: name, width, height, x, y, fillColor, cornerRadius, description, parentId, layoutMode, padding, itemSpacing
- `convert_to_component` — params: nodeId

---

## Acceptance Criteria

- [ ] AC1: `create_component` MCP tool registered with full param set (name, width, height, x, y, fillColor, cornerRadius, description, parentId, layoutMode, padding, itemSpacing)
- [ ] AC2: Plugin handler calls `figma.createComponent()` and applies all provided properties
- [ ] AC3: `convert_to_component` MCP tool registered with `nodeId` param
- [ ] AC4: Plugin handler calls `figma.createComponentFromNode(node)` — all children, fills, auto-layout preserved
- [ ] AC5: Both tools return `{ nodeId, name, type: "COMPONENT", componentKey }`
- [ ] AC6: `convert_to_component` rejects nodes inside instances with clear error
- [ ] AC7: `convert_to_component` rejects nodes that are already `COMPONENT` type
- [ ] AC8: Command router cases added for both `create_component` and `convert_to_component`
- [ ] AC9: `figmento-mcp-server` builds (`npm run build`)
- [ ] AC10: `figmento` plugin builds (`npm run build`)

---

## File List

| File | Action | Purpose |
|------|--------|---------|
| `figmento/src/handlers/canvas-components.ts` | Create | Component creation + conversion handlers |
| `figmento/src/handlers/command-router.ts` | Modify | Add `create_component`, `convert_to_component` cases |
| `figmento-mcp-server/src/tools/components.ts` | Create | MCP tool definitions for component operations |
| `figmento-mcp-server/src/server.ts` | Modify | Register `components.ts` tool module |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | @pm (Morgan) via Claude | Story drafted from PRD-007 Phase 1. |
| 2026-03-26 | @po (Pax) | Validated 10/10. Status → Ready. |
