# PRD-007: Interactive Components — Programmatic Prototyping via MCP

**Status:** Draft — Ready for @pm Review
**Author:** Product Owner (Human) + Strategic Advisor (Claude)
**Date:** 2026-03-26
**Architecture review needed from:** @architect (Aria)
**Epic:** IC — Interactive Components
**Priority:** High (Platform differentiator — no MCP tool does this today)
**Target milestone:** M10 — Component Intelligence

---

## 0. Executive Context for @pm (Morgan)

### The Opportunity

Figmento can create visually rich designs — but they're static. Every frame, button, and card is a dead-end in Figma's prototype mode. Designers still have to manually:

1. Convert frames into components
2. Create variant states (default, hover, pressed, disabled)
3. Wire interactions between states (click → swap, hover → change-to)
4. Set transitions and easing curves

This is repetitive, mechanical work that follows well-known patterns. It's exactly the kind of work an AI agent should automate.

### What Makes This Possible Now

**Figma's Plugin API fully supports programmatic prototyping:**

- `figma.createComponent()` — create components from scratch
- `figma.createComponentFromNode()` — convert existing frames to components
- `figma.combineAsVariants(components, parent)` — create component sets with variant properties
- `node.setReactionsAsync(reactions)` — set triggers, actions, and transitions programmatically

**The Figsor merge** (`figsor-master/`) brought reference implementations for `create_component`, `create_component_set`, and `create_component_instance` — not yet integrated but proving the pattern works.

**No competing MCP tool offers this.** Figma's own `use_figma` tool can execute arbitrary Plugin API code, but no published skill or MCP server provides a structured interface for interaction design. This would make Figmento the first.

### Strategic Fit

This PRD builds directly on existing infrastructure:

| Foundation | Status | This PRD Uses |
|-----------|--------|---------------|
| Epic ODS — Design system variable/style creation | In Progress | Components reference DS tokens |
| Epic FN — Figma native integration (Phase 2 DS awareness) | Complete | Component discovery for smart matching |
| `create_ds_components` tool | Working | Already creates tokenized component frames — just needs the "make it a real component" step |
| `clone_with_overrides` | Working | Creates variant frames — add `combineAsVariants` to finish the job |
| `batch_execute` | Working | Batches component + reaction setup in one call |

---

## 1. Problem Statement

Figmento generates designs that look professional but aren't usable in Figma's prototyping workflow. Every generated button, card, and nav link is a plain frame — not a component. This creates two pain points:

**For designers:** After Figmento generates a design, they spend 30-60 minutes manually converting frames to components, creating hover/pressed states, and wiring interactions. The "AI-generated" advantage is negated by the manual post-processing.

**For the design-to-dev handoff:** Developers expect interactive prototypes for specifications. A static frame doesn't communicate hover states, transitions, or navigation flows. Designers must prototype manually before sharing with devs.

### Evidence

- The screenshot in this conversation shows Figmento creating variant frames (`state=default`, `state=hover`) but requiring manual "Right-click → Create Component → Combine as Variants" steps
- `create_ds_components` generates button/badge/card frames with proper tokens — but they remain plain frames, not Figma components
- Zero tools in the command router handle `createComponent`, `combineAsVariants`, or `setReactionsAsync`

---

## 2. Vision

> "Figmento creates designs that are immediately usable — not just visually, but interactively. Generate a landing page and every button has hover states, every nav link has click interactions, every card flips to a detail view. The prototype is ready to share with the dev team the moment Figmento finishes."

### Three Capability Layers

```
Layer 1: Component Creation      → Frames become real Figma components
Layer 2: Variant Management      → Components get states (hover, pressed, disabled)
Layer 3: Interaction Wiring      → Triggers + actions + transitions between states
```

Each layer is independently valuable and can ship incrementally.

---

## 3. Goals & Non-Goals

### Goals

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | Programmatically create Figma components from frames | `create_component` MCP tool works end-to-end |
| G2 | Create component sets with variant properties | `combine_as_variants` creates proper Figma component sets with auto-detected properties |
| G3 | Set prototype interactions on any node | `set_reactions` MCP tool can wire triggers, actions, and transitions |
| G4 | Auto-generate common interaction patterns | "Make this button interactive" creates hover + pressed states with smooth transitions |
| G5 | Integrate with existing design workflows | `create_ds_components` output includes real components, not just frames |

### Non-Goals

| # | Non-Goal | Reason |
|---|----------|--------|
| NG1 | Full prototyping flow editor | We create interactions, not a visual prototyping canvas. Use Figma's prototype mode for flow management. |
| NG2 | Custom animation keyframes | Figma's `Transition` types cover standard animations. Complex motion design is beyond scope. |
| NG3 | Conditional logic builder UI | The API supports `CONDITIONAL` actions with variable expressions, but building a visual logic editor in the plugin is overkill. Power users can pass conditions via MCP directly. |
| NG4 | Replace Figma's prototype tab | Complement it, don't compete. Figmento auto-generates the common 80%; designers fine-tune the remaining 20% in Figma's native tools. |
| NG5 | Interactive component preview inside the plugin UI | Preview happens in Figma's prototype player. The plugin's job is creation, not playback. |

---

## 4. Technical Foundation

### Figma Plugin API Surface

**Component Creation:**
```typescript
figma.createComponent(): ComponentNode
figma.createComponentFromNode(node: SceneNode): ComponentNode
figma.combineAsVariants(nodes: ComponentNode[], parent: BaseNode & ChildrenMixin): ComponentSetNode
```

**Prototype Interactions:**
```typescript
// Reaction = { trigger, actions[] }
await node.setReactionsAsync(reactions: Reaction[])

// Trigger types
type Trigger =
  | { type: 'ON_CLICK' | 'ON_HOVER' | 'ON_PRESS' | 'ON_DRAG' }
  | { type: 'AFTER_TIMEOUT'; timeout: number }
  | { type: 'MOUSE_ENTER' | 'MOUSE_LEAVE'; delay: number }
  | { type: 'ON_KEY_DOWN'; keyCodes: number[] }

// Action types (simplified)
type Action =
  | { type: 'BACK' | 'CLOSE' }
  | { type: 'URL'; url: string }
  | { type: 'NODE'; destinationId: string; navigation: Navigation; transition: Transition | null }
  | { type: 'SET_VARIABLE'; variableId: string; variableValue: VariableData }
  | { type: 'CONDITIONAL'; conditionalBlocks: ConditionalBlock[] }

// Navigation modes
type Navigation = 'NAVIGATE' | 'SWAP' | 'OVERLAY' | 'SCROLL_TO' | 'CHANGE_TO'

// Transitions
type Transition = SimpleTransition | DirectionalTransition
// SimpleTransition: DISSOLVE, SMART_ANIMATE, SCROLL_ANIMATE
// DirectionalTransition: MOVE_IN, MOVE_OUT, PUSH, SLIDE_IN, SLIDE_OUT

// Easing
type Easing = { type: 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_AND_OUT' | 'LINEAR' | 'GENTLE' | 'QUICK' | 'BOUNCY' | 'SLOW' | ... }
```

### Existing Infrastructure to Leverage

| Existing Tool | Enhancement |
|--------------|-------------|
| `create_ds_components` | Add `asComponent: true` flag to create real `ComponentNode` instead of `FrameNode` |
| `clone_with_overrides` | Add `combineAsVariants: true` to auto-combine clones into a component set |
| `batch_execute` | Add `create_component`, `convert_to_component`, `combine_as_variants`, `set_reactions` as batch actions |
| `command-router.ts` | Add 4 new case branches |
| `canvas-query.ts` or new `canvas-components.ts` | Handler implementations |

### Reference Implementation (Figsor)

The Figsor codebase in `figsor-master/` includes working implementations:
- `create_component` — creates a ComponentNode with name, size, auto-layout
- `create_component_set` — wraps `combineAsVariants`
- `create_component_instance` — instantiates from component
- `detach_instance` — detaches instance back to frame

These are in Figsor's monolith server format but prove the API patterns work.

---

## 5. Phased Delivery Plan

### Phase 1: Component Creation (Low risk — Figsor reference exists)

**Goal:** Convert frames to real Figma components and create component sets with variants.

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| IC-1 | Create Component Tool | New `create_component` MCP tool + plugin handler. Creates a blank `ComponentNode` with name, size, auto-layout, fills. Also `convert_to_component` to convert an existing frame. Port from Figsor reference. | @dev |
| IC-2 | Combine as Variants Tool | New `combine_as_variants` MCP tool. Takes an array of component node IDs + parent ID, calls `figma.combineAsVariants()`. Auto-detects variant properties from `Property=Value` naming. | @dev |
| IC-3 | Component Instance Tool | New `create_instance` MCP tool. Given a component ID, creates an instance at a position. Supports overriding variant properties. Also `detach_instance` for breaking away from component. | @dev |
| IC-4 | Batch Support | Add `create_component`, `convert_to_component`, `combine_as_variants`, `create_instance` as valid `batch_execute` actions. | @dev |

**Phase 1 success test:** From MCP, create two component frames named `state=default` and `state=hover`, combine them as variants into a component set, then create an instance of that component set on the canvas.

### Phase 2: Interaction Wiring (Medium risk — new territory)

**Goal:** Programmatically set prototype interactions on any node.

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| IC-5 | Set Reactions Tool | New `set_reactions` MCP tool + plugin handler wrapping `node.setReactionsAsync()`. Accepts a simplified reaction schema: `{ trigger: "ON_CLICK", action: "NAVIGATE", destination: nodeId, transition: "SMART_ANIMATE", duration: 300 }`. The handler expands this into Figma's verbose `Reaction` type. | @dev |
| IC-6 | Interaction Presets | New knowledge file `knowledge/interactions.yaml` with common patterns: button-hover, button-press, nav-link, card-flip, modal-open, modal-close, tab-switch, carousel-slide, back-navigation. Each preset defines trigger + action + transition + easing. | @dev |
| IC-7 | Apply Interaction Preset Tool | New `apply_interaction` MCP tool. Takes `nodeId` + `preset` name (e.g., "button-hover") + optional `destinationId`. Resolves the preset from `interactions.yaml` and calls `set_reactions`. | @dev |
| IC-8 | Read Reactions Tool | New `get_reactions` MCP tool. Returns the current reactions on a node in the simplified schema format. Useful for debugging and AI self-evaluation. | @dev |

**Phase 2 success test:** Apply the `button-hover` preset to a component variant. In Figma's prototype player, hovering over the button visually swaps to the hover state with a smooth transition.

### Phase 3: Smart Interaction Patterns (Medium-High risk — AI-driven)

**Goal:** AI automatically wires common interactions based on design context.

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| IC-9 | Auto-Interactive Components | Enhance `create_ds_components` to output real `ComponentNode` instances. When creating a "button" component, automatically generate default + hover + pressed variants and wire `CHANGE_TO` interactions between them. | @dev |
| IC-10 | Make Interactive Command | New `make_interactive` MCP tool. Given a frame or component, AI analyzes its structure and children to determine what interactions to apply. E.g., detects a button shape → creates hover/pressed variants; detects a card → creates hover-lift effect; detects a nav bar → wires navigation links. | @dev |
| IC-11 | Interaction Knowledge Base | Expand `knowledge/interactions.yaml` with industry patterns: e-commerce (add-to-cart, product zoom, filter toggle), SaaS (dropdown menus, sidebar collapse, toast notifications), mobile (swipe gestures, pull-to-refresh, bottom sheet). | @dev |
| IC-12 | Prototype Flow Generator | New `create_prototype_flow` MCP tool. Given a set of page frames, auto-wire navigation between them with appropriate transitions. E.g., "Home" → "Product Detail" on card click with PUSH_RIGHT, "Product Detail" → "Home" on back arrow with PUSH_LEFT. | @dev |

**Phase 3 success test:** Call `make_interactive` on a Figmento-generated landing page. All buttons get hover states, the nav links wire to sections, and the CTA button navigates to a target frame — all without manual specification.

---

## 6. Interaction Preset Schema

The `knowledge/interactions.yaml` file defines reusable interaction patterns:

```yaml
presets:
  button-hover:
    description: "Swap to hover state on mouse enter, revert on leave"
    requires: variant_with_states  # Needs state=default and state=hover
    reactions:
      - trigger: { type: MOUSE_ENTER, delay: 0 }
        action: { type: NODE, navigation: CHANGE_TO, destination: "$hover_variant" }
        transition: { type: SMART_ANIMATE, duration: 150, easing: EASE_OUT }
      - trigger: { type: MOUSE_LEAVE, delay: 0 }
        action: { type: NODE, navigation: CHANGE_TO, destination: "$default_variant" }
        transition: { type: SMART_ANIMATE, duration: 150, easing: EASE_OUT }

  button-press:
    description: "Scale-down on press with active state"
    requires: variant_with_states  # Needs state=default and state=pressed
    reactions:
      - trigger: { type: ON_PRESS }
        action: { type: NODE, navigation: CHANGE_TO, destination: "$pressed_variant" }
        transition: { type: SMART_ANIMATE, duration: 100, easing: EASE_IN }

  nav-link:
    description: "Navigate to destination on click"
    requires: destination_frame
    reactions:
      - trigger: { type: ON_CLICK }
        action: { type: NODE, navigation: NAVIGATE, destination: "$target" }
        transition: { type: DISSOLVE, duration: 300, easing: EASE_IN_AND_OUT }

  modal-open:
    description: "Open overlay on click"
    requires: overlay_frame
    reactions:
      - trigger: { type: ON_CLICK }
        action: { type: NODE, navigation: OVERLAY, destination: "$overlay" }
        transition: { type: DISSOLVE, duration: 200, easing: EASE_OUT }

  modal-close:
    description: "Close overlay on click"
    reactions:
      - trigger: { type: ON_CLICK }
        action: { type: CLOSE }

  card-hover:
    description: "Subtle lift effect on hover"
    requires: variant_with_states
    reactions:
      - trigger: { type: MOUSE_ENTER, delay: 0 }
        action: { type: NODE, navigation: CHANGE_TO, destination: "$hover_variant" }
        transition: { type: SMART_ANIMATE, duration: 200, easing: GENTLE }
      - trigger: { type: MOUSE_LEAVE, delay: 0 }
        action: { type: NODE, navigation: CHANGE_TO, destination: "$default_variant" }
        transition: { type: SMART_ANIMATE, duration: 200, easing: GENTLE }

  tab-switch:
    description: "Swap tab content on click"
    requires: destination_frame
    reactions:
      - trigger: { type: ON_CLICK }
        action: { type: NODE, navigation: SWAP, destination: "$target" }
        transition: { type: SMART_ANIMATE, duration: 250, easing: EASE_IN_AND_OUT }

  carousel-next:
    description: "Slide to next card on click or drag"
    requires: destination_frame
    reactions:
      - trigger: { type: ON_CLICK }
        action: { type: NODE, navigation: SWAP, destination: "$next" }
        transition: { type: SLIDE_IN, direction: LEFT, duration: 300, easing: EASE_IN_AND_OUT }

  back-navigation:
    description: "Navigate back on click"
    reactions:
      - trigger: { type: ON_CLICK }
        action: { type: BACK }
        transition: { type: PUSH, direction: RIGHT, duration: 300, easing: EASE_IN_AND_OUT }
```

---

## 7. Risk Assessment

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | ~~`setReactionsAsync` requires `documentAccess: "dynamic-page"`~~ | ~~Medium~~ | ~~High~~ | **DE-RISKED:** Architect review confirmed manifest does NOT need `dynamic-page`. Current default access mode supports all required APIs. |
| R2 | `combineAsVariants` has reparenting restrictions (can't combine nodes inside instances) | Medium | Medium | Validate node parent chain before calling. Return clear error if node is inside an instance. |
| R3 | Smart interaction detection (Phase 3) mislabels elements | Medium | Medium | Phase 3 is additive — wrong interactions are easy to undo via `set_reactions([])`. Start with high-confidence patterns only. |
| R4 | Performance of `setReactionsAsync` in batch scenarios (50+ nodes) | Low | Medium | Benchmark in IC-5. If slow, chunk reactions into groups of 10. |
| R5 | Variant naming convention conflicts with user's existing components | Low | Low | Document the `Property=Value` naming convention. Detect and warn if naming doesn't follow the pattern. |
| R6 | `readonly` fields on Action/Trigger types complicate construction | Low | High | Build helper functions that construct `Reaction` objects from simplified input. This is a developer convenience issue, not a blocker. |

---

## 8. Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| Figma Plugin API (`setReactionsAsync`, `createComponent`, `combineAsVariants`) | External Platform | Stable — GA API since 2024 |
| Figsor reference implementation (`figsor-master/`) | Internal Code | Merged — available for reference |
| Epic ODS — Design system component creation | Internal Epic | In Progress — IC-9 enhances this |
| Epic FN — Figma native integration | Internal Epic | Phase 2 complete — DS awareness available |
| `batch_execute` infrastructure | Internal Tool | Working — add new action types |
| `command-router.ts` routing infrastructure | Internal Code | Working — add new case branches |

---

## 9. Competitive Positioning

| Capability | Figma Make | Generic MCP Agent | Figsor | Figmento (Post IC) |
|-----------|-----------|-------------------|--------|---------------------|
| Create components programmatically | N/A (manual) | Via raw `use_figma` code | Yes (basic) | **Yes (with DS tokens)** |
| Create component variants | N/A | Via raw code | Yes (basic) | **Yes (auto-detect properties)** |
| Set prototype interactions | N/A | Via raw code | No | **Yes (structured API + presets)** |
| Interaction presets library | No | No | No | **Yes (10+ patterns)** |
| Auto-wire hover/pressed states | No | No | No | **Yes (smart detection)** |
| Prototype flow generation | No | No | No | **Yes (page-to-page navigation)** |
| Design system-aware components | Built-in | Via Figma MCP | No | **Yes (token-bound)** |

**Key differentiator:** No tool today offers a structured MCP interface for prototype interactions. Raw `use_figma` code can do anything, but it requires the user to write Plugin API code. Figmento abstracts this into simple, declarative commands: `apply_interaction(nodeId, "button-hover")`.

---

## 10. Timeline Estimate

| Phase | Stories | Estimated Effort | Dependencies |
|-------|---------|-----------------|--------------|
| Phase 1: Component Creation | 4 (IC-1 to IC-4) | 1 sprint | Figsor reference available |
| Phase 2: Interaction Wiring | 4 (IC-5 to IC-8) | 1.5 sprints | Phase 1 complete |
| Phase 3: Smart Interactions | 4 (IC-9 to IC-12) | 2 sprints | Phase 2 complete + Epic ODS integration |
| **Total** | **12 stories** | **~4.5 sprints** | |

**Recommended execution order:** Phase 1 → Phase 2 → Phase 3. Each phase is independently shippable and valuable.

---

## 11. Action Items for @pm (Morgan)

1. **Review this PRD** and validate priority against ODS epic backlog
2. **Create Epic IC** using `*create-epic` with the 3 phases above
3. ~~**Assign @architect**~~ **DONE** — Architecture review complete (Q1-Q5 answered, R1 de-risked)
4. **Coordinate with Epic ODS** — IC-9 depends on `create_ds_components` maturity; plan sequencing accordingly
5. **Benchmark opportunity** — Phase 1 can ship in 1 sprint and immediately unlocks "real components from MCP" which no competitor offers today
6. **Consider Phase 2 as the demo-ready milestone** — "apply interaction preset" is the most visually impressive capability for marketing/demos

---

## 12. Architecture Review — @architect (Aria) Answers

> Reviewed 2026-03-26 via codebase audit.

| # | Question | Answer | Impact |
|---|----------|--------|--------|
| Q1 | Does the manifest include `documentAccess: "dynamic-page"`? | **NO.** Manifest uses default document access (full sync load). `reactions` property is read-write without `setReactionsAsync`. However, `setReactionsAsync` still works and is the recommended API. No manifest change needed for Phase 1-2. | **R1 de-risked.** No migration risk — current manifest supports all required APIs. |
| Q2 | Can `setReactionsAsync` target nodes on different pages? | **YES.** `destinationId` is a plain string node ID with no page-level restriction in the type system. Figma resolves cross-page targets at runtime. | **IC-12 confirmed feasible** — cross-page prototype flows are supported. |
| Q3 | Performance of `combineAsVariants` with 10+ variants? | **Unknown — needs benchmark in IC-2.** The API itself has no documented limit, but Figma editor may slow with large component sets. Recommend capping at 8 variants per set initially. | **IC-9 should start conservative** (default + hover + pressed = 3 variants max per auto-generation). |
| Q4 | WS relay or `use_figma` for component creation? | **WS relay.** It's the established pattern, all infrastructure exists, and adding 4 new case branches to `command-router.ts` is trivial. `use_figma` migration (Epic FN Phase 3) is a separate concern — don't couple it with new feature work. | **Architectural decision: extend current WS pattern.** |
| Q5 | Can `clone_with_overrides` feed into `combineAsVariants`? | **NO — conversion required.** `clone_with_overrides` outputs `FrameNode` clones. `combineAsVariants` requires `ComponentNode[]`. Need a `createComponentFromNode()` step per clone. Recommended flow: clone → `createComponentFromNode` per clone → `combineAsVariants`. | **IC-2 needs a `convert_to_component` step** — already planned as part of IC-1. |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | Product Owner + Claude (@pm) | PRD created. 3-phase delivery plan with 12 stories. Feasibility confirmed via Figma Plugin API audit and Figsor reference code analysis. |
| 2026-03-26 | @architect (Aria) via codebase audit | Architecture review complete. Q1-Q5 answered. R1 de-risked (no manifest change needed). Decisions: WS relay pattern (Q4), convert-then-combine flow (Q5), conservative variant caps (Q3). |

---

*This PRD was created after confirming full API feasibility. Phase 1 can begin immediately — Figsor provides a working reference implementation for component creation. Phase 2 (interactions) would make Figmento the first MCP-based tool with structured prototyping capabilities.*
