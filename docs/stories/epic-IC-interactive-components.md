# Epic IC — Interactive Components

> Create real Figma components with variants and wire prototype interactions — all from MCP. Every button gets a hover state, every nav link navigates, every card lifts on hover. The prototype is ready the moment Figmento finishes.

| Field | Value |
|-------|-------|
| **Epic ID** | IC |
| **Priority** | HIGH (Platform differentiator — no MCP tool does this today) |
| **Owner** | @pm (Morgan) |
| **Architect** | @architect (Aria) |
| **PRD** | [PRD-007](../prd/PRD-007-interactive-components.md) |
| **Status** | Ready |
| **Created** | 2026-03-26 |
| **Milestone** | M10 — Component Intelligence |
| **Depends On** | Epic FN Phase 2 (DS awareness) — complete |
| **Parallel With** | Epic ODS (design system generation) — IC-9 integrates with ODS components |

---

## Strategic Context

Figmento creates visually rich designs — but they're static. Every frame, button, and card is a dead-end in Figma's prototype mode. Designers spend 30-60 minutes post-generation manually converting frames to components, creating hover/pressed states, and wiring interactions.

### What Makes This Possible Now

1. **Figma Plugin API** fully supports programmatic prototyping (`createComponent`, `combineAsVariants`, `setReactionsAsync`) — all GA, stable APIs
2. **Figsor merge** (`figsor-master/`) brought working `create_component` and `create_component_set` implementations — proven patterns ready to port
3. **Architecture review confirms:** no manifest changes needed (Q1), cross-page flows supported (Q2), WS relay is the right path (Q4)

### Existing Infrastructure

| Capability | Status | Location |
|-----------|--------|----------|
| `create_ds_components` (tokenized frames) | Working | `figma-native.ts` — creates button/badge/card frames, but as `FrameNode` not `ComponentNode` |
| `clone_with_overrides` (N copies with text/color overrides) | Working | `canvas-scene.ts` L171-254 — creates `FrameNode` clones |
| `batch_execute` (50 commands/batch) | Working | `batch.ts` + `canvas-batch.ts` |
| `command-router.ts` (68 commands) | Working | Plugin sandbox command routing |
| Figsor component handlers (reference) | Available | `figsor-master/figsor-master/figma-plugin/code.js` L1322-1376 |
| Design system token binding | Working | Epic FN Phase 2 (`bind_variable`, `apply_style`) |

### Key Gaps This Epic Fills

1. No tool to create real `ComponentNode` from frames
2. No tool to combine components as variants (`ComponentSetNode`)
3. No tool to create component instances
4. No tool to set prototype interactions (`setReactionsAsync`)
5. No interaction presets knowledge base
6. No smart detection of "what should be interactive"

---

## Solution Overview

| Phase | Name | Stories | Deliverable |
|-------|------|---------|-------------|
| **Phase 1** | Component Creation | IC-1 through IC-4 | `create_component`, `convert_to_component`, `combine_as_variants`, `create_instance` MCP tools + batch support |
| **Phase 2** | Interaction Wiring | IC-5 through IC-8 | `set_reactions`, `apply_interaction`, `get_reactions` MCP tools + 10 interaction presets in `knowledge/interactions.yaml` |
| **Phase 3** | Smart Interactions | IC-9 through IC-12 | Auto-interactive DS components, `make_interactive` AI tool, prototype flow generator |

---

## Phase 1 — Component Creation (Low Risk)

> **Goal:** Convert frames to real Figma components, create component sets with variants, and instantiate components — all via MCP.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| IC-1 | Create Component + Convert to Component Tools | @dev | @qa | — | [x] Done |
| IC-2 | Combine as Variants Tool | @dev | @qa | IC-1 | [x] Done |
| IC-3 | Create Component Instance + Detach Tool | @dev | @qa | IC-1 | [x] Done |
| IC-4 | Batch Support for Component Actions | @dev | @qa | IC-1, IC-2, IC-3 | [x] Done |

### IC-1: Create Component + Convert to Component Tools

**Scope:** Two new MCP tools + plugin handlers. `create_component` creates a blank `ComponentNode` with properties. `convert_to_component` wraps `figma.createComponentFromNode()` to convert an existing frame/group.

**Acceptance Criteria:**
- [ ] AC1: `create_component` MCP tool registered with params: `name`, `width`, `height`, `x`, `y`, `fillColor`, `cornerRadius`, `description`, `parentId`, `layoutMode`, `padding`, `itemSpacing`
- [ ] AC2: Plugin handler calls `figma.createComponent()` and applies all properties
- [ ] AC3: `convert_to_component` MCP tool registered with params: `nodeId`
- [ ] AC4: Plugin handler calls `figma.createComponentFromNode(node)` — preserves all children, fills, auto-layout
- [ ] AC5: Both tools return `{ nodeId, name, type: "COMPONENT", componentKey }` where `componentKey` is the component's unique key for future instantiation
- [ ] AC6: Error handling: `convert_to_component` returns clear error if node is inside an instance or is already a component
- [ ] AC7: Command router cases added for both actions
- [ ] AC8: Port validated against Figsor reference implementation (`code.js` L1322-1351)

### IC-2: Combine as Variants Tool

**Scope:** New `combine_as_variants` MCP tool wrapping `figma.combineAsVariants()`. Takes an array of `ComponentNode` IDs and combines them into a `ComponentSetNode`.

**Acceptance Criteria:**
- [ ] AC1: `combine_as_variants` MCP tool registered with params: `componentIds` (string array, min 2), `name` (optional)
- [ ] AC2: Plugin handler validates all IDs are `COMPONENT` type — returns clear error listing non-component IDs
- [ ] AC3: Handler calls `figma.combineAsVariants(components, parent)` using first component's parent
- [ ] AC4: Variant properties auto-detected from component names using `Property=Value` convention (e.g., `state=default`, `state=hover`)
- [ ] AC5: Returns `{ nodeId, name, type: "COMPONENT_SET", variantProperties: { property: [values] } }`
- [ ] AC6: If input is `FrameNode[]` instead of `ComponentNode[]`, auto-converts each via `createComponentFromNode()` before combining (leverages IC-1's `convert_to_component`)
- [ ] AC7: Error: rejects nodes inside instances (Figma reparenting restriction)

### IC-3: Create Component Instance + Detach Tool

**Scope:** `create_instance` creates an instance of a component or component set. `detach_instance` breaks an instance back to a frame.

**Acceptance Criteria:**
- [ ] AC1: `create_instance` MCP tool registered with params: `componentId`, `x`, `y`, `parentId`, `variantProperties` (optional object for component set selection)
- [ ] AC2: Plugin handler: if target is `ComponentNode`, calls `component.createInstance()`; if `ComponentSetNode`, finds variant matching `variantProperties` and instantiates it
- [ ] AC3: Instance positioned at `x/y` and appended to `parentId` (or current page)
- [ ] AC4: Returns `{ nodeId, name, type: "INSTANCE", mainComponentId }`
- [ ] AC5: `detach_instance` MCP tool registered with params: `nodeId`
- [ ] AC6: Plugin handler calls `instance.detachInstance()` — returns `{ nodeId, name, type: "FRAME" }`
- [ ] AC7: Error: `create_instance` returns clear message if component not found or variant properties don't match

### IC-4: Batch Support for Component Actions

**Scope:** Add component actions as valid `batch_execute` action types.

**Acceptance Criteria:**
- [ ] AC1: `create_component` available as batch action with `tempId` support
- [ ] AC2: `convert_to_component` available as batch action
- [ ] AC3: `combine_as_variants` available as batch action — accepts `$tempId` references for `componentIds`
- [ ] AC4: `create_instance` available as batch action — accepts `$tempId` reference for `componentId`
- [ ] AC5: `detach_instance` available as batch action
- [ ] AC6: End-to-end test: single batch creates 2 components, combines as variants, creates an instance — all via `tempId` chain

### Phase 1 Success Test

```
TEST 1 — Create and Combine Variants
  MCP calls:
    1. create_component(name="state=default", width=200, height=48, fillColor="#FFFFFF")
    2. create_component(name="state=hover", width=200, height=48, fillColor="#F0F1EE")
    3. combine_as_variants(componentIds=[id1, id2], name="Button")

  Pass criteria:
    ✓ Figma shows a ComponentSetNode named "Button" with 2 variants
    ✓ Variant property "state" auto-detected with values ["default", "hover"]
    ✓ Both variants visible in the Assets panel

TEST 2 — Instantiate Component
  MCP calls:
    1. create_instance(componentId=buttonSetId, variantProperties={state: "default"}, x=500, y=100)

  Pass criteria:
    ✓ Instance placed at (500, 100) showing the "state=default" variant
    ✓ Instance reflects changes when main component is edited

TEST 3 — Batch Flow
  MCP calls:
    1. batch_execute([
         { action: "create_component", params: { name: "state=default", ... }, tempId: "v1" },
         { action: "create_component", params: { name: "state=hover", ... }, tempId: "v2" },
         { action: "combine_as_variants", params: { componentIds: ["$v1", "$v2"], name: "Card" }, tempId: "set" },
         { action: "create_instance", params: { componentId: "$set", variantProperties: { state: "default" } } }
       ])

  Pass criteria:
    ✓ All 4 commands succeed in a single batch
    ✓ Component set "Card" exists with 2 variants
    ✓ One instance placed on canvas
```

---

## Phase 2 — Interaction Wiring (Medium Risk)

> **Goal:** Programmatically set prototype interactions on any node. Provide preset patterns for common interactions.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| IC-5 | Set Reactions Tool | @dev | @qa | IC-1 | [x] Done |
| IC-6 | Interaction Presets Knowledge File | @dev | @architect | — | [x] Done |
| IC-7 | Apply Interaction Preset Tool | @dev | @qa | IC-5, IC-6 | [x] Done |
| IC-8 | Read Reactions Tool | @dev | @qa | IC-5 | [x] Done |

### IC-5: Set Reactions Tool

**Scope:** New `set_reactions` MCP tool + plugin handler wrapping `node.setReactionsAsync()`. Accepts a simplified schema and expands it into Figma's verbose `Reaction[]` type.

**Acceptance Criteria:**
- [ ] AC1: `set_reactions` MCP tool registered with params: `nodeId`, `reactions` (array of simplified reaction objects)
- [ ] AC2: Simplified reaction schema: `{ trigger: string, action: string, destination?: string, navigation?: string, transition?: string, duration?: number, easing?: string, delay?: number, url?: string }`
- [ ] AC3: Plugin handler builds Figma `Reaction[]` from simplified input — maps string trigger/action/transition types to Figma's discriminated union types
- [ ] AC4: Handler calls `await node.setReactionsAsync(reactions)` with built `Reaction[]`
- [ ] AC5: Supports all trigger types: `ON_CLICK`, `ON_HOVER`, `ON_PRESS`, `ON_DRAG`, `AFTER_TIMEOUT`, `MOUSE_ENTER`, `MOUSE_LEAVE`, `MOUSE_UP`, `MOUSE_DOWN`
- [ ] AC6: Supports all action types: `NODE` (navigate/swap/overlay/change_to/scroll_to), `BACK`, `CLOSE`, `URL`, `SET_VARIABLE`
- [ ] AC7: Supports all transition types: `DISSOLVE`, `SMART_ANIMATE`, `MOVE_IN`, `MOVE_OUT`, `PUSH`, `SLIDE_IN`, `SLIDE_OUT`, `SCROLL_ANIMATE`
- [ ] AC8: Supports all easing types: `EASE_IN`, `EASE_OUT`, `EASE_IN_AND_OUT`, `LINEAR`, `GENTLE`, `QUICK`, `BOUNCY`, `SLOW`
- [ ] AC9: Returns `{ nodeId, reactionsCount }` on success
- [ ] AC10: Passing empty `reactions: []` clears all interactions from the node

### IC-6: Interaction Presets Knowledge File

**Scope:** Create `knowledge/interactions.yaml` with 10+ reusable interaction patterns.

**Acceptance Criteria:**
- [ ] AC1: File at `figmento-mcp-server/knowledge/interactions.yaml`
- [ ] AC2: Minimum 10 presets: `button-hover`, `button-press`, `nav-link`, `modal-open`, `modal-close`, `card-hover`, `tab-switch`, `carousel-next`, `carousel-prev`, `back-navigation`
- [ ] AC3: Each preset defines: `description`, `requires` (prerequisites), `reactions[]` with trigger + action + transition + easing
- [ ] AC4: Presets use `$placeholder` variables for destination IDs (e.g., `$hover_variant`, `$target`, `$overlay`)
- [ ] AC5: Schema validated — presets parse correctly into the simplified reaction format from IC-5
- [ ] AC6: Presets accessible via `list_resources(type="interactions")` (register as a resource type)

### IC-7: Apply Interaction Preset Tool

**Scope:** New `apply_interaction` MCP tool. Resolves a preset from `interactions.yaml`, substitutes placeholder variables, and calls `set_reactions`.

**Acceptance Criteria:**
- [ ] AC1: `apply_interaction` MCP tool registered with params: `nodeId`, `preset` (string), `bindings` (object mapping `$placeholder` → `nodeId`)
- [ ] AC2: Loads preset from `knowledge/interactions.yaml` by name
- [ ] AC3: Substitutes all `$placeholder` values in the preset with actual `nodeId` values from `bindings`
- [ ] AC4: Calls `set_reactions` internally with the resolved reactions
- [ ] AC5: Returns `{ nodeId, preset, reactionsApplied: number }`
- [ ] AC6: Error: unknown preset name returns list of available presets
- [ ] AC7: Error: missing required binding (e.g., `$hover_variant` not in `bindings`) returns which bindings are needed

### IC-8: Read Reactions Tool

**Scope:** New `get_reactions` MCP tool. Returns current reactions on a node in the simplified schema format.

**Acceptance Criteria:**
- [ ] AC1: `get_reactions` MCP tool registered with params: `nodeId`
- [ ] AC2: Plugin handler reads `node.reactions` property
- [ ] AC3: Converts Figma's verbose `Reaction[]` back to the simplified schema from IC-5
- [ ] AC4: Returns `{ nodeId, reactions: SimplifiedReaction[] }`
- [ ] AC5: Returns empty array if node has no reactions
- [ ] AC6: Useful for AI self-evaluation: "check what interactions exist before adding more"

### Phase 2 Success Test

```
TEST 1 — Manual Reaction Wiring
  MCP calls:
    1. set_reactions(nodeId=buttonId, reactions=[
         { trigger: "MOUSE_ENTER", action: "NODE", destination: hoverVariantId, navigation: "CHANGE_TO", transition: "SMART_ANIMATE", duration: 150, easing: "EASE_OUT" },
         { trigger: "MOUSE_LEAVE", action: "NODE", destination: defaultVariantId, navigation: "CHANGE_TO", transition: "SMART_ANIMATE", duration: 150, easing: "EASE_OUT" }
       ])

  Pass criteria:
    ✓ In Figma prototype player, hovering the button swaps to hover state
    ✓ Moving mouse away reverts to default state
    ✓ Transition is smooth 150ms EASE_OUT

TEST 2 — Preset Application
  MCP calls:
    1. apply_interaction(nodeId=buttonId, preset="button-hover", bindings={ "$hover_variant": hoverVariantId, "$default_variant": defaultVariantId })

  Pass criteria:
    ✓ Same result as TEST 1 but with a single tool call
    ✓ get_reactions(buttonId) returns 2 reactions matching the preset

TEST 3 — Clear Interactions
  MCP calls:
    1. set_reactions(nodeId=buttonId, reactions=[])

  Pass criteria:
    ✓ get_reactions(buttonId) returns empty array
    ✓ Node has no prototype connections in Figma
```

---

## Phase 3 — Smart Interactions (Medium-High Risk)

> **Goal:** AI automatically detects interactive elements and wires appropriate interactions based on design context.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| IC-9 | Auto-Interactive DS Components | @dev | @qa | IC-1, IC-2, IC-5, IC-7 + Epic ODS | [x] Done |
| IC-10 | Make Interactive Command | @dev | @qa | IC-5, IC-7 | [x] Done |
| IC-11 | Extended Interaction Knowledge Base | @dev | @architect | IC-6 | [x] Done |
| IC-12 | Prototype Flow Generator | @dev | @qa | IC-5 | [x] Done |

### IC-9: Auto-Interactive DS Components

**Scope:** Enhance `create_ds_components` to output real `ComponentNode` instances with auto-generated variant states and wired interactions.

**Acceptance Criteria:**
- [ ] AC1: `create_ds_components` gains `interactive: true` flag (default: false for backward compatibility)
- [ ] AC2: When `interactive: true`, button components auto-generate: `state=default`, `state=hover` (subtle fill change), `state=pressed` (darker fill)
- [ ] AC3: Variant states created as real components via IC-1, combined via IC-2
- [ ] AC4: `button-hover` and `button-press` presets auto-applied via IC-7
- [ ] AC5: Card components get `card-hover` preset (shadow/lift effect variant)
- [ ] AC6: Max 3 variants per auto-generation (default + hover + pressed) — conservative cap per architect recommendation
- [ ] AC7: All variant fill colors derived from DS tokens (not hardcoded)

### IC-10: Make Interactive Command

**Scope:** New `make_interactive` MCP tool. Given any frame/component, AI scans its structure and auto-applies appropriate interactions.

**Acceptance Criteria:**
- [ ] AC1: `make_interactive` MCP tool registered with params: `nodeId`, `context` (optional string hint)
- [ ] AC2: Scans node and children to detect: buttons (auto-layout + text + fill + corner radius), cards (rectangle + content children), nav links (text with link-like names), modals (overlay-sized frames)
- [ ] AC3: For each detected interactive element: creates variant states if missing, applies matching preset
- [ ] AC4: Returns `{ processed: number, interactions: [{ nodeId, elementType, presetApplied }] }`
- [ ] AC5: Idempotent — running twice doesn't duplicate interactions (checks existing reactions first via IC-8)
- [ ] AC6: `context` hint influences detection: "e-commerce" biases toward cart/product interactions, "dashboard" toward filter/sort/expand

### IC-11: Extended Interaction Knowledge Base

**Scope:** Expand `knowledge/interactions.yaml` with industry-specific interaction patterns.

**Acceptance Criteria:**
- [ ] AC1: E-commerce presets: `add-to-cart`, `product-zoom`, `filter-toggle`, `quantity-stepper`
- [ ] AC2: SaaS presets: `dropdown-menu`, `sidebar-collapse`, `toast-notification`, `accordion-expand`
- [ ] AC3: Mobile presets: `swipe-navigate`, `bottom-sheet`, `pull-to-refresh`
- [ ] AC4: Each preset follows the same schema as IC-6 presets
- [ ] AC5: Presets categorized by `industry` tag for IC-10 context matching

### IC-12: Prototype Flow Generator

**Scope:** New `create_prototype_flow` MCP tool. Given a set of page/frame IDs, auto-wires navigation between them with contextually appropriate transitions.

**Acceptance Criteria:**
- [ ] AC1: `create_prototype_flow` MCP tool registered with params: `frameIds` (ordered array), `flowName` (optional)
- [ ] AC2: Sets first frame as the flow's starting point
- [ ] AC3: For each frame, scans for interactive elements (buttons, nav links, CTAs) that could link to other frames
- [ ] AC4: Auto-wires forward navigation with `PUSH` or `SLIDE_IN` transition, back navigation with `PUSH` (reverse direction) or `BACK` action
- [ ] AC5: Cross-page flows supported (confirmed by architect Q2)
- [ ] AC6: Returns `{ flowName, connections: [{ from: nodeId, to: frameId, trigger, transition }] }`
- [ ] AC7: Non-destructive — preserves existing reactions, only adds new connections

### Phase 3 Success Test

```
TEST 1 — Auto-Interactive Button
  MCP calls:
    1. create_ds_components(type="button", label="Get Started", interactive=true)

  Pass criteria:
    ✓ Component set "Button" created with 3 variants (default, hover, pressed)
    ✓ Hover interaction wired with SMART_ANIMATE 150ms
    ✓ Press interaction wired with SMART_ANIMATE 100ms
    ✓ All variant colors from DS tokens

TEST 2 — Make Interactive on Landing Page
  MCP calls:
    1. make_interactive(nodeId=landingPageFrameId, context="SaaS")

  Pass criteria:
    ✓ All buttons detected and given hover/pressed variants
    ✓ Nav links wired to scroll-to targets (if section IDs match)
    ✓ Cards given hover-lift effect
    ✓ Report shows N elements processed

TEST 3 — Prototype Flow
  MCP calls:
    1. create_prototype_flow(frameIds=[homeId, productId, checkoutId], flowName="Purchase Flow")

  Pass criteria:
    ✓ Home → Product: CTA button click triggers PUSH right transition
    ✓ Product → Checkout: "Buy Now" click triggers PUSH right
    ✓ Product → Home: back arrow triggers BACK action
    ✓ Flow visible in Figma's prototype tab
```

---

## Architecture Impact

### New Files

```
figmento/src/handlers/
  canvas-components.ts          # IC-1/2/3: createComponent, combineAsVariants, createInstance, detachInstance

figmento-mcp-server/src/tools/
  components.ts                 # IC-1/2/3/4: MCP tool definitions for component operations
  interactions.ts               # IC-5/7/8: MCP tool definitions for reactions + presets

figmento-mcp-server/knowledge/
  interactions.yaml             # IC-6/11: Interaction presets knowledge base
```

### Modified Files

```
figmento/src/handlers/command-router.ts    # Add 8 new command cases
figmento/src/handlers/canvas-batch.ts      # Add component/reaction batch actions
figmento-mcp-server/src/server.ts          # Register new tool modules
figmento-mcp-server/src/tools/figma-native.ts  # IC-9: enhance create_ds_components with interactive flag
```

### No Breaking Changes

All new tools are additive. Existing `create_ds_components` defaults to `interactive: false` for full backward compatibility. No existing command behavior changes.

---

## Risks

| # | Risk | Severity | Likelihood | Mitigation | Owner |
|---|------|----------|------------|------------|-------|
| R1 | ~~`setReactionsAsync` requires `dynamic-page`~~ | — | — | **DE-RISKED:** Architect confirmed current manifest supports all APIs | — |
| R2 | `combineAsVariants` reparenting restrictions | Medium | Medium | Validate node parent chain; return clear error if inside instance | @dev |
| R3 | Smart detection (Phase 3) mislabels elements | Medium | Medium | Start with high-confidence patterns; wrong interactions easily undone via `set_reactions([])` | @dev |
| R4 | `readonly` fields on Reaction types | Low | High | Build helper functions; developer convenience, not a blocker | @dev |
| R5 | Performance of large component sets (10+ variants) | Low | Medium | Cap at 3 variants in auto-generation (Phase 3); benchmark in IC-2 | @dev |

---

## Decisions Log

| Date | Decision | Rationale | Decided By |
|------|----------|-----------|------------|
| 2026-03-26 | Use WS relay for component tools (not `use_figma`) | Established pattern, trivial to extend, decouples from FN migration | @architect |
| 2026-03-26 | Convert-then-combine flow for `clone_with_overrides` → variants | `combineAsVariants` requires `ComponentNode[]`; `createComponentFromNode` is the bridge | @architect |
| 2026-03-26 | Cap auto-generated variants at 3 (default + hover + pressed) | Unknown perf ceiling for large component sets; conservative start | @architect |
| 2026-03-26 | Simplified reaction schema (not raw Figma types) | Raw `Reaction` type is deeply nested with discriminated unions; simplified schema is MCP-friendly and AI-friendly | @pm |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | @pm (Morgan) via Claude | Epic created from PRD-007. 3 phases, 12 stories. Architecture review complete — all questions answered, R1 de-risked. Phase 1 ready for @sm story drafting. |
| 2026-03-26 | @po (Pax) | Phase 1 stories validated (IC-1: 10/10, IC-2: 10/10, IC-3: 9/10 fixed, IC-4: 9/10 fixed). All 4 stories promoted Draft → Ready. |
| 2026-03-26 | @dev (Dex) | Phase 1 complete. All 4 stories implemented. New files: `canvas-components.ts` (plugin), `components.ts` (MCP). 5 commands added to router + batch. Both packages build clean. |
| 2026-03-26 | @dev (Dex) | Phase 2 complete. IC-5/8: `set_reactions` + `get_reactions` tools. IC-6: 13 interaction presets in `knowledge/interactions.yaml`. IC-7: `apply_interaction` + `list_interaction_presets` tools. Live tested: hover component created via chat UI with prototype interactions. Fixed: MCP server crash from `create_component` name collision (renamed to `create_component_node`), Pencil MCP interference (removed from global config), channel mismatch race condition, SDK session model default. |
| 2026-03-26 | @dev (Dex) | Phase 3 complete. IC-9: `create_ds_components` gains `interactive: true` flag — auto-creates variant states (default/hover/pressed for button/badge, default/hover for card), combines as ComponentSet, wires hover/press reactions. IC-10: `make_interactive` tool scans frame tree for buttons/cards/nav-links via heuristics, creates variants and wires presets idempotently. IC-11: 11 industry-specific presets added (4 e-commerce: add-to-cart, product-zoom, filter-toggle, quantity-stepper; 4 SaaS: dropdown-menu, sidebar-collapse, toast-notification, accordion-expand; 3 mobile: swipe-navigate, bottom-sheet, pull-to-refresh). All presets tagged with `industry` field. IC-12: `create_prototype_flow` tool wires navigation between ordered frames — sets flow starting point, auto-detects clickable elements, wires PUSH forward and BACK reverse. Both packages build clean. |

---

*Phase 1 is immediately actionable — Figsor reference code exists, WS relay pattern is proven, no manifest changes needed. Phase 2 is the demo-ready differentiator. Phase 3 transforms Figmento from "design generator" to "interactive prototype generator."*
