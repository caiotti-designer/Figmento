# Story ODS-6a: Simple Component Creator

**Status:** Done
**Priority:** High (P1) — delivers tangible DS components, required by ODS-7 pipeline
**Complexity:** L (8 points) — hardest Phase B story. New handler combining `figma.createComponent()` + auto-layout + variable binding. Three distinct component shapes.
**Epic:** ODS — One-Click Design System
**Depends on:** ODS-4 (variable collections for color/spacing/radius binding), ODS-5 (text styles for component text nodes)
**PRD:** [PRD-006](../prd/PRD-006-one-click-design-system.md) — Phase B

---

## Business Value

A design system without components is incomplete. Variables and text styles provide tokens, but designers need reusable building blocks — Button, Card, Badge — that are pre-wired to those tokens. Today Figmento can create frames and text, but cannot create Figma Components (`figma.createComponent()`). This story adds 3 base components, each using auto-layout and bound variables, giving designers a ready-to-use component library from a single brief analysis.

## Prior Art (What Already Works)

| Capability | Status | Location |
|-----------|--------|----------|
| `figma.createComponent()` | Figma API — not yet used in plugin | — |
| Auto-layout frame creation | Working | `canvas-batch.ts` `handleCreateFrame` with `layoutMode` |
| Variable binding (`figma.variables.setBoundVariableForPaint`) | Working | `canvas-query.ts` `handleBindVariable` |
| Text style application | Working | `canvas-style.ts` `handleApplyTextStyle` |
| Variable collections (ODS-4) | Prerequisite | `handleCreateVariableCollections` returns variable IDs |
| Text styles (ODS-5) | Prerequisite | `handleCreateTextStyles` returns style IDs |
| Component creation MCP tool (visual) | Working | `create_component` in `figma-native.ts` — but creates visual frames, not Figma components |

## Out of Scope

- Component variants (ODS-6b — Phase D)
- Component properties (boolean, text, instance swap)
- Component documentation/description
- Nested component instances (e.g., Button inside Card)
- Publishing components to team library

## Risks

- **Variable binding complexity:** Binding a fill to a variable requires looking up the variable by name/ID from the collection created in ODS-4. If variable IDs aren't passed correctly from ODS-7, bindings fail silently and components get hardcoded colors.
- **Text style application order:** Font must be loaded before applying a text style. If ODS-5 text styles don't exist yet (pipeline ordering error), text nodes fall back to default styling.
- **Auto-layout + variable radius:** `cornerRadius` can be bound to a variable, but requires `figma.variables.setBoundVariableForPaint` equivalent for floats — `setBoundVariable('topLeftRadius', variable)`. Need to verify API support for each bindable property.
- **"Design System" page creation:** Creating or finding a dedicated page adds complexity. If the current page is used instead, components mix with design work.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, MCP server builds, 3 components visible in Figma Assets panel under DS/, each with auto-layout and variable bindings"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer generating a design system from a brief,
**I want** Figmento to create 3 base Figma components (Button, Card, Badge) that use auto-layout and are bound to my DS variables and text styles,
**so that** I have reusable, on-brand building blocks ready to drag into any design frame.

---

## Description

### Problem

After ODS-4 creates variables and ODS-5 creates text styles, there are no components to use them. The designer must manually create Button, Card, and Badge components and wire them to the variables — exactly the tedious work the One-Click DS pipeline is meant to eliminate.

### Solution

1. **New plugin handler:** `handleCreateDSComponents` — creates 3 Figma components using `figma.createComponent()`, configures auto-layout, binds variables, applies text styles.
2. **New MCP tool:** `create_ds_components` — accepts component config + variable/style IDs from ODS-4/5, sends to plugin.
3. **Dedicated page:** Components placed on a "Design System" page (created if it doesn't exist).
4. **No variants V1:** Each component is a single variant. ODS-6b adds variant sets.

### Component Specifications

#### DS/Button
```
Component (HORIZONTAL auto-layout)
├── paddingTop/Bottom: spacing/md variable (16px)
├── paddingLeft/Right: spacing/xl variable (48px) — wider for CTA feel
├── itemSpacing: spacing/sm variable (8px) — for future icon + label
├── cornerRadius: radius/md variable (8px)
├── fill: bound to color/primary/500 variable
├── primaryAxisAlignItems: CENTER
├── counterAxisAlignItems: CENTER
└── Text "Button" (body font, 16px, weight 700, white fill)
    └── textStyleId: DS/Body text style
```

#### DS/Card
```
Component (VERTICAL auto-layout)
├── paddingTop/Bottom/Left/Right: spacing/lg variable (32px)
├── itemSpacing: spacing/md variable (16px)
├── cornerRadius: radius/lg variable (12px)
├── fill: bound to surface color variable
├── layoutSizingHorizontal: FIXED (320px)
├── layoutSizingVertical: HUG
├── Header Text "Card Title" (heading font, 24px, weight 700)
│   └── textStyleId: DS/H3 text style
└── Body Text "Card description text goes here." (body font, 16px, weight 400)
    └── textStyleId: DS/Body text style
```

#### DS/Badge
```
Component (HORIZONTAL auto-layout)
├── paddingTop/Bottom: spacing/xs (4px)
├── paddingLeft/Right: spacing/sm (12px)
├── cornerRadius: radius/full variable (9999px)
├── fill: bound to color/accent/500 variable
├── primaryAxisAlignItems: CENTER
├── counterAxisAlignItems: CENTER
└── Text "Badge" (body font, 12px, weight 700, white fill)
    └── textStyleId: DS/Caption text style
```

### Input Shape (from ODS-7 pipeline)

```typescript
{
  // Variable IDs from ODS-4
  variableIds: {
    'color/primary/500': 'VariableID:xxx',
    'color/accent/500': 'VariableID:xxx',
    'surface': 'VariableID:xxx',
    'spacing/sm': 'VariableID:xxx',
    'spacing/md': 'VariableID:xxx',
    'spacing/lg': 'VariableID:xxx',
    'spacing/xl': 'VariableID:xxx',
    'radius/md': 'VariableID:xxx',
    'radius/lg': 'VariableID:xxx',
    'radius/full': 'VariableID:xxx',
  },
  // Text style IDs from ODS-5
  textStyleIds: {
    'DS/H3': 'S:xxx',
    'DS/Body': 'S:xxx',
    'DS/Caption': 'S:xxx',
  },
  // Typography info for fallback if text styles fail
  headingFont: "Manrope",
  bodyFont: "Inter",
}
```

---

## Acceptance Criteria

- [ ] **AC1:** New plugin handler `handleCreateDSComponents` using `figma.createComponent()` API
- [ ] **AC2:** New MCP tool `create_ds_components` registered — sends command to plugin via `sendDesignCommand('create_ds_components', params)`
- [ ] **AC3:** **Button** component created: HORIZONTAL auto-layout, padding from spacing variables, background fill bound to primary color variable, text with body font and white fill, corner radius bound to radius variable
- [ ] **AC4:** **Card** component created: VERTICAL auto-layout, padding from spacing variables, background fill bound to surface color variable, corner radius bound to radius variable, header text (H3 style) + body text (Body style) slots
- [ ] **AC5:** **Badge** component created: HORIZONTAL auto-layout, small padding from spacing variables, background fill bound to accent color variable, caption-sized text with white fill, full corner radius (9999)
- [ ] **AC6:** All color fills use `figma.variables.setBoundVariableForPaint` — not hardcoded hex values. Variables from ODS-4 collections.
- [ ] **AC7:** All text nodes reference text styles from ODS-5 via `textStyleId` where applicable
- [ ] **AC8:** Components named with DS prefix: `DS/Button`, `DS/Card`, `DS/Badge`
- [ ] **AC9:** Components placed on a dedicated "Design System" page (created if it doesn't exist, reused if it does)
- [ ] **AC10:** Returns component IDs: `{ components: Array<{ id, name, type }> }`
- [ ] **AC11:** `npm run build` succeeds in both figmento-mcp-server and figmento-plugin (figmento)

---

## Tasks

### Phase 1: "Design System" Page Management (AC9)

- [ ] Create helper `getOrCreateDSPage()`: queries `figma.root.children` for page named "Design System"
  - If found: return page reference
  - If not found: `figma.createPage()` with name "Design System", return reference
- [ ] Set active page to DS page before component creation, restore after

### Phase 2: Plugin Handler — Component Creation (AC1, AC3, AC4, AC5, AC8)

- [ ] Create `handleCreateDSComponents` in `canvas-query.ts` (or new `ds-components.ts` handler file)
- [ ] Implement `createButtonComponent(variableIds, textStyleIds, fonts)`:
  - `figma.createComponent()` — returns ComponentNode
  - Set `.name = "DS/Button"`
  - Configure auto-layout: `layoutMode = "HORIZONTAL"`, centering, padding, itemSpacing
  - Set fills to solid color (fallback), then bind to variable
  - Create child text node: `figma.createText()`, set font, content, fill white
  - Apply text style if available
  - Set corner radius, bind to variable
- [ ] Implement `createCardComponent(variableIds, textStyleIds, fonts)`:
  - Same pattern, VERTICAL layout, two text children (H3 header + Body text)
  - Fixed width 320px, HUG height
- [ ] Implement `createBadgeComponent(variableIds, textStyleIds, fonts)`:
  - Same pattern, HORIZONTAL layout, small padding, full radius
- [ ] Move all components to DS page after creation

### Phase 3: Variable Binding (AC6)

- [ ] For each component, after creation:
  - Look up variable by ID from `variableIds` map
  - Bind fill: `figma.variables.setBoundVariableForPaint(node, 'fills', variableId)` — verify exact API
  - Bind corner radius: `node.setBoundVariable('topLeftRadius', variable)` + other corners
  - Bind padding: `node.setBoundVariable('paddingTop', variable)` etc. — verify if padding is bindable
- [ ] Fallback: if variable binding fails (API limitation), set hardcoded values and log warning
- [ ] Note: if padding/radius variable binding isn't supported by API, use hardcoded numeric values from the variable definitions and document as known limitation

### Phase 4: Text Style Application (AC7)

- [ ] For each text node in components:
  - Load font via `figma.loadFontAsync()`
  - If text style ID provided: `textNode.textStyleId = styleId`
  - If text style not available: set font properties inline (fontFamily, fontSize, fontWeight, lineHeight)

### Phase 5: MCP Tool + Routing (AC2, AC10)

- [ ] Add `create_ds_components` tool in `figma-native.ts` with Zod schema
- [ ] Schema accepts `{ variableIds, textStyleIds, headingFont, bodyFont }`
- [ ] Register command `create_ds_components` in `command-router.ts`
- [ ] Route to `sendDesignCommand('create_ds_components', params)`
- [ ] Return structured component ID response

### Phase 6: Build + Verify (AC11)

- [ ] `npm run build` in figmento-mcp-server
- [ ] `npm run build` in figmento (plugin)
- [ ] Manual test: verify 3 components in Figma Assets panel under DS/

---

## Dev Notes

- **`figma.createComponent()`:** Returns a `ComponentNode` (extends `FrameNode`). Supports all frame properties: auto-layout, fills, cornerRadius, children. Components appear in the Assets panel automatically.
- **Variable binding for fills:** The exact API is `setBoundVariable` on paint properties. Check Figma Plugin API docs for the current method signature. It may be `node.setBoundVariable('fills', 0, variable)` (binding the first fill) or a different pattern. This is the riskiest API surface — prototype early.
- **Variable binding for padding/radius:** `node.setBoundVariable('paddingTop', variable)` — Figma supports binding numeric variables to layout properties. This was validated in Epic FN.
- **Text inside components:** Use `figma.createText()` (not `create_text` command) since we're inside the sandbox handler. Must call `figma.loadFontAsync()` before setting any text properties.
- **Component placement:** After creation, `component.x` and `component.y` position on the page. Space components horizontally: Button at x=0, Card at x=300, Badge at x=700 (with 80px gaps).
- **White text fill:** For Button and Badge text, set fills to `[{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]`.
- **fontWeight reminder:** Always clamp to 400/700 before `loadFontAsync`. See ODS-5 for the clamping pattern.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/handlers/canvas-query.ts` | MODIFY | Add `handleCreateDSComponents` (or split to new file) |
| `figmento/src/handlers/command-router.ts` | MODIFY | Register `create_ds_components` command |
| `figmento-mcp-server/src/tools/figma-native.ts` | MODIFY | Add `create_ds_components` MCP tool |

---

## Definition of Done

- [ ] 3 components created: DS/Button, DS/Card, DS/Badge
- [ ] All components use auto-layout (Button/Badge HORIZONTAL, Card VERTICAL)
- [ ] Color fills bound to ODS-4 variables (or hardcoded with documented limitation if API doesn't support)
- [ ] Text nodes reference ODS-5 text styles
- [ ] Components appear in Figma Assets panel under DS/ prefix
- [ ] Components on dedicated "Design System" page
- [ ] Returns component IDs for downstream use by ODS-7
- [ ] Both builds pass

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | @sm (River) | Initial draft. 3 base components (Button, Card, Badge) with auto-layout + variable binding. L (8pt) — hardest Phase B story due to component API + binding complexity. |
