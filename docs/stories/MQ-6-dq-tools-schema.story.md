# Story MQ-6: DQ Tools in tools-schema.ts

**Status:** Ready for Review
**Priority:** Medium
**Complexity:** S
**Epic:** MQ — Mode Quality Parity
**Phase:** 3 (depends on Phase 1; MQ-7 depends on this story)

---

## PO Validation

**Score:** 10/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-02

| Check | Result | Note |
|-------|--------|------|
| 1. Clear title | ✅ | |
| 2. Complete description | ✅ | Existing tools confirmed; excluded tools explained with rationale |
| 3. Testable AC | ✅ | 6 ACs; exact TypeScript result shape defined in AC:3 |
| 4. Scope IN/OUT | ✅ | OUT explicitly stated (reference tools excluded, with reasoning) |
| 5. Dependencies | ✅ | Phase 3 dep on Phase 1; MQ-7 blocked-by this noted |
| 6. Complexity | ✅ | S (correctly estimated — tool definition + handler port) |
| 7. Business value | ✅ | Chat mode self-evaluation loop closes quality gap with MCP |
| 8. Risks | ✅ | Gradient matrix complexity called out; best-effort approach documented |
| 9. Done criteria | ✅ | Build + 4-checkbox validation including error absence |
| 10. Alignment | ✅ | tools-schema.ts architecture understood; Figma API advantage identified |

**Observation:** Best story in the set. Exact result shape in AC:3 is a notable strength — prevents interpretation gaps between @dev and the Chat mode AI that consumes the result.

---

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [build, manual-smoke]
```

---

## Story

**As a** user of Figmento's Chat mode,
**I want** the AI to be able to call `run_refinement_check` to verify design quality after creation,
**so that** Chat mode can self-evaluate and auto-fix issues the same way the MCP path does.

---

## Context

`tools-schema.ts` defines the tool definitions available to the Chat mode AI via Anthropic function calling. The DQ epic already added the following tools: `read_figma_context`, `bind_variable`, `apply_paint_style`, `apply_text_style`, `apply_effect_style`. These are confirmed present in `tools-schema.ts`.

Still missing: `run_refinement_check` — the quality scoring tool that checks gradient direction, auto-layout coverage, spacing, and typography.

Reference tools (`find_design_references`, `list_reference_categories`) are intentionally excluded: they're server-side tools that read YAML files from the MCP server's knowledge directory at runtime, which the plugin sandbox cannot access. MQ-5's build-time injection handles reference awareness for modes.

---

## Acceptance Criteria

1. `tools-schema.ts` includes a `run_refinement_check` tool definition — accepts `nodeId: string`, returns a quality report with `issues` array.
2. `code.ts` has a handler for `run_refinement_check` that performs the following 5 checks directly via the Figma Plugin API (no WebSocket/MCP server call needed):
   - **Gradient check:** for nodes with GRADIENT_LINEAR fills, verify the solid end faces text children
   - **Auto-layout coverage:** flag frames with 2+ children that have `layoutMode === 'NONE'`
   - **Spacing check:** flag `itemSpacing` values not in the valid 8px scale [4,8,12,16,20,24,32,40,48,64,80,96,128]
   - **Typography check:** verify at least 2 distinct font sizes exist in the subtree (hierarchy present)
   - **Empty placeholder check:** flag frames with default names like "Rectangle", "Frame", or fill color `#E0E0E0` / `#CCCCCC`
3. The refinement check result object matches this shape:
   ```typescript
   {
     nodeId: string;
     totalChecked: number;
     issues: Array<{
       nodeId: string;
       nodeName: string;
       check: 'gradient' | 'auto-layout' | 'spacing' | 'typography' | 'placeholder';
       severity: 'warning' | 'error';
       description: string;
     }>;
     passed: boolean;
   }
   ```
4. The handler is registered in `executeCommand()` and `executeSingleAction()` switch cases.
5. All existing tools in `FIGMENTO_TOOLS` array continue to work unchanged.
6. Build clean: `cd figmento && npm run build`

---

## Tasks / Subtasks

- [x] **Task 1: Add run_refinement_check tool definition to tools-schema.ts** (AC: 1)
  - Added to FIGMENTO_TOOLS under new "── Design Quality ──" section
  - Accepts `nodeId: string`, description covers all 5 check types

- [x] **Task 2: Implement refinement check handler in code.ts** (AC: 2, 3)
  - `async function runRefinementCheck(nodeId: string)` — direct Figma Plugin API via `figma.getNodeByIdAsync`
  - Recursive `walkNode()` with gradient direction (handle positions), auto-layout, spacing scale, typography collection
  - Typography hierarchy check runs after full tree walk (collects all font sizes, checks max ≥ 2× min)
  - Placeholder check: matches default names regex + #e0e0e0/#cccccc/#d9d9d9 fills
  - Result shape matches AC:3 exactly

- [x] **Task 3: Register in switch cases** (AC: 4)
  - Registered in `executeCommand()` after `create_figma_variables`
  - Registered in `executeSingleAction()` after `create_figma_variables`

- [x] **Task 4: Verify existing tools unchanged** (AC: 5)
  - All existing FIGMENTO_TOOLS entries untouched; build passes

- [x] **Task 5: Build and verify** (AC: 6)
  - `cd figmento && npm run build` — passes clean (dist/code.js 466.2kb)

---

## Dev Notes

**The plugin version has a direct-access advantage.** The MCP server's refinement tool uses `get_node_info` via WebSocket to inspect nodes. The plugin runs in Figma's sandbox and can use `figma.getNodeByIdAsync()` directly — faster and more reliable.

**Port logic from `figmento-mcp-server/src/tools/refinement.ts`** for the check algorithms. Translate the WS-based node inspection into direct Figma API calls.

**Gradient direction check is the trickiest.** Figma's `GradientPaint.gradientTransform` is a 2×3 matrix. Identifying "which end is solid" requires reading the `gradientStops` array (stop at position 0 vs position 1) and comparing to the gradient transform direction. Keep the gradient check as a "best effort" — flag it if the first stop has opacity 1.0 and the gradient appears to point away from the primary text child.

**Reference tools are intentionally excluded** (`find_design_references`, `list_reference_categories`). These read YAML files from the MCP server's filesystem. The plugin cannot access those paths. MQ-5 handles reference awareness via build-time embedding.

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/tools-schema.ts` | Add run_refinement_check tool definition to FIGMENTO_TOOLS |
| `figmento/src/code.ts` | Add runRefinementCheck() function and register in switch cases |

---

## Validation

**TEST MQ-6 (Chat Mode):** In Chat tab — "Create a dark Instagram post with a gradient overlay. Then run run_refinement_check on it."
- [x] Chat calls `run_refinement_check` with the created frame's nodeId
- [x] Response includes `issues` array (may be empty if design is correct)
- [x] Response includes `passed: true/false`
- [x] No uncaught errors in Figma console

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - Async correctness (figma.getNodeByIdAsync is async — await all calls)
  - Null guard on figma.getNodeByIdAsync result (returns null if nodeId not found)
  - Result shape matches AC:3 exactly (important for Chat mode AI to parse it)
  - No regression on existing FIGMENTO_TOOLS entries
```
