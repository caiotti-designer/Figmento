# Story IC-3: Create Component Instance + Detach Tools

**Status:** Done
**Priority:** Medium (P2) — enables component reuse across designs
**Complexity:** S (3 points) — straightforward API wrapping
**Epic:** IC — Interactive Components
**Depends on:** IC-1 (needs components to instantiate)
**PRD:** [PRD-007](../prd/PRD-007-interactive-components.md) — Phase 1

---

## Business Value

Creating component instances is how designers reuse components across pages and frames. When Figmento generates a landing page with 5 buttons, they should all be instances of one Button component — not 5 independent frames. This enables single-source editing: change the main component, all instances update.

## Prior Art (What Already Works)

| Capability | Status | Location |
|-----------|--------|----------|
| `import_component_by_key` | Working | `canvas-scene.ts` L346+ — imports library components and creates instances |
| Figsor `create_component_instance` | Available | `figsor-master/figsor-master/figma-plugin/code.js` L1378-1410 |
| Figsor `detach_instance` | Available | `figsor-master/figsor-master/figma-plugin/code.js` L1412-1430 |
| Plugin API `component.createInstance()` | GA | Returns `InstanceNode` |
| Plugin API `instance.detachInstance()` | GA | Converts instance back to `FrameNode` |

## Out of Scope

- Instance override management (changing text/fills on instances via MCP)
- Nested instance creation (instances inside instances)
- Component swap on existing instances

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, MCP server builds, instances created from components and component sets, detach works"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer building layouts with reusable components,
**I want** Figmento to create instances of my components and component sets,
**so that** all repeated elements stay linked and update when the main component changes.

---

## Risks

- Variant property matching for `ComponentSetNode`: if `variantProperties` values don't exactly match any variant (e.g., `{state: "Hover"}` vs `{state: "hover"}`), the match fails silently — handler must do case-sensitive comparison and list available variants in the error
- `detachInstance()` on a nested instance (instance inside an instance) may behave unexpectedly — test with simple cases first

---

## Description

### Problem

Figmento has `import_component_by_key` for library components, but no way to instantiate local components created within the same file. After IC-1/IC-2 create components and component sets, there's no tool to place instances of them in layouts. Designers must manually drag from the Assets panel.

### Solution

Two new tools added to the existing `canvas-components.ts` handler:

1. **`create_instance`** — Given a component/component set ID, creates an instance. For component sets, accepts `variantProperties` to select which variant to instantiate.

2. **`detach_instance`** — Given an instance ID, detaches it back to a `FrameNode`. Useful for one-off customizations.

---

## Acceptance Criteria

- [ ] AC1: `create_instance` MCP tool registered with params: `componentId`, `x`, `y`, `parentId` (optional), `variantProperties` (optional object)
- [ ] AC2: If target is `ComponentNode`, calls `component.createInstance()`
- [ ] AC3: If target is `ComponentSetNode`, finds variant matching `variantProperties` and instantiates it
- [ ] AC4: Instance positioned at `x/y` and appended to `parentId` (defaults to current page)
- [ ] AC5: Returns `{ nodeId, name, type: "INSTANCE", mainComponentId }`
- [ ] AC6: `detach_instance` MCP tool registered with param: `nodeId`
- [ ] AC7: Calls `instance.detachInstance()`, returns `{ nodeId, name, type: "FRAME" }`
- [ ] AC8: Error: `create_instance` with non-existent componentId returns clear message
- [ ] AC9: Error: `create_instance` with `variantProperties` that don't match any variant lists available variants
- [ ] AC10: Error: `detach_instance` on a non-instance node returns clear message
- [ ] AC11: Both packages build cleanly

---

## File List

| File | Action | Purpose |
|------|--------|---------|
| `figmento/src/handlers/canvas-components.ts` | Modify | Add `handleCreateInstance`, `handleDetachInstance` |
| `figmento/src/handlers/command-router.ts` | Modify | Add `create_instance`, `detach_instance` cases |
| `figmento-mcp-server/src/tools/components.ts` | Modify | Add `create_instance`, `detach_instance` tool definitions |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | @pm (Morgan) via Claude | Story drafted from PRD-007 Phase 1. |
| 2026-03-26 | @po (Pax) | Validated 9/10 (added missing Risks + Problem sections). Status → Ready. |
