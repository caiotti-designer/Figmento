# Story IC-2: Combine as Variants Tool

**Status:** Done
**Priority:** High (P1) — enables component sets and variant-based interactions
**Complexity:** M (5 points) — single API call with validation logic
**Epic:** IC — Interactive Components
**Depends on:** IC-1 (needs `convert_to_component` for auto-conversion path)
**PRD:** [PRD-007](../prd/PRD-007-interactive-components.md) — Phase 1

---

## Business Value

Component sets with variants are Figma's core mechanism for interactive components. A button with `state=default` and `state=hover` variants enables the `CHANGE_TO` interaction that powers hover effects. Without this tool, the entire interaction pipeline (Phase 2) has no target to wire to.

## Prior Art (What Already Works)

| Capability | Status | Location |
|-----------|--------|----------|
| Figsor `create_component_set` reference | Available | `figsor-master/figsor-master/figma-plugin/code.js` L1353-1376 |
| `clone_with_overrides` (creates variant frames) | Working | `canvas-scene.ts` L171-254 — outputs `FrameNode` clones |
| `convert_to_component` (IC-1) | Pending | Converts frames to `ComponentNode` |
| Plugin API `combineAsVariants()` | GA | `figma.combineAsVariants(components, parent)` |
| Property=Value naming convention | Standard | Figma auto-detects `Property=Value` from component names |

## Out of Scope

- Creating the variant content itself (handled by IC-1 + existing tools)
- Setting interactions between variants (IC-5/IC-7)
- Auto-generating variant states from a single component (IC-9)

## Risks

- `combineAsVariants` requires all nodes to be siblings (same parent) — must validate
- Reparenting restrictions: can't combine nodes that are inside instances
- Performance with 10+ variants unknown — architect recommends starting conservative (cap at 8)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, MCP server builds, 2+ components combine into a ComponentSet in Figma with auto-detected variant properties"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer creating interactive component libraries,
**I want** Figmento to combine multiple component variants into a Figma Component Set,
**so that** variant properties auto-detect and I can use the component set for prototyping and instances.

---

## Description

### Problem

Figmento can create individual component frames named `state=default` and `state=hover`, but can't combine them into a proper `ComponentSetNode`. The designer must manually select both frames, right-click, and choose "Combine as Variants." This is the exact step shown in the plugin UI screenshot — Figmento instructs the user to do it manually.

### Solution

New `combine_as_variants` MCP tool + plugin handler:

1. Accepts an array of node IDs (minimum 2)
2. Validates all are `ComponentNode` — if any are `FrameNode`, auto-converts via `createComponentFromNode()` (leveraging IC-1)
3. Validates all are siblings (same parent)
4. Calls `figma.combineAsVariants(components, parent)`
5. Returns the `ComponentSetNode` with auto-detected variant properties

### Implementation Plan

**Add to: `figmento/src/handlers/canvas-components.ts`**

```typescript
export async function handleCombineAsVariants(params: Record<string, unknown>) {
  const nodeIds = params.componentIds as string[];
  const name = params.name as string | undefined;

  if (!nodeIds || nodeIds.length < 2) {
    throw new Error('combine_as_variants requires at least 2 component IDs');
  }

  const components: ComponentNode[] = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (!node) throw new Error(`Node ${id} not found`);

    if (node.type === 'FRAME' || node.type === 'GROUP') {
      // Auto-convert to component
      const comp = figma.createComponentFromNode(node as SceneNode);
      components.push(comp);
    } else if (node.type === 'COMPONENT') {
      components.push(node as ComponentNode);
    } else {
      throw new Error(`Node ${id} is type ${node.type} — expected COMPONENT or FRAME`);
    }
  }

  // Validate same parent
  const parent = components[0].parent;
  for (const comp of components) {
    if (comp.parent !== parent) {
      throw new Error('All components must share the same parent');
    }
  }

  const componentSet = figma.combineAsVariants(components, parent as BaseNode & ChildrenMixin);
  if (name) componentSet.name = name;

  // Extract variant properties
  const variantProps: Record<string, string[]> = {};
  for (const child of componentSet.children) {
    if (child.type === 'COMPONENT') {
      const variant = child as ComponentNode;
      for (const [key, value] of Object.entries(variant.variantProperties || {})) {
        if (!variantProps[key]) variantProps[key] = [];
        if (!variantProps[key].includes(value)) variantProps[key].push(value);
      }
    }
  }

  return {
    nodeId: componentSet.id,
    name: componentSet.name,
    type: componentSet.type,
    variantProperties: variantProps,
    childCount: componentSet.children.length
  };
}
```

**Modified: `command-router.ts`** — Add case branch:
```typescript
case 'combine_as_variants': return handleCombineAsVariants(params);
```

**New MCP tool in `figmento-mcp-server/src/tools/components.ts`:**
- `combine_as_variants` — params: componentIds (string array), name (optional)

---

## Acceptance Criteria

- [ ] AC1: `combine_as_variants` MCP tool registered with `componentIds` (string array, min 2) and optional `name`
- [ ] AC2: Plugin handler validates all IDs are `COMPONENT` or auto-convertible (`FRAME`/`GROUP`)
- [ ] AC3: `FrameNode` inputs auto-converted to `ComponentNode` via `createComponentFromNode()`
- [ ] AC4: Handler calls `figma.combineAsVariants(components, parent)` successfully
- [ ] AC5: Variant properties auto-detected from `Property=Value` naming in component names
- [ ] AC6: Returns `{ nodeId, name, type: "COMPONENT_SET", variantProperties, childCount }`
- [ ] AC7: Rejects nodes inside instances with clear error message
- [ ] AC8: Rejects if components don't share the same parent
- [ ] AC9: Works with 2-8 components (architect-recommended cap)
- [ ] AC10: Both packages build cleanly

---

## File List

| File | Action | Purpose |
|------|--------|---------|
| `figmento/src/handlers/canvas-components.ts` | Modify | Add `handleCombineAsVariants` |
| `figmento/src/handlers/command-router.ts` | Modify | Add `combine_as_variants` case |
| `figmento-mcp-server/src/tools/components.ts` | Modify | Add `combine_as_variants` tool definition |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | @pm (Morgan) via Claude | Story drafted from PRD-007 Phase 1. |
| 2026-03-26 | @po (Pax) | Validated 10/10. Status → Ready. |
