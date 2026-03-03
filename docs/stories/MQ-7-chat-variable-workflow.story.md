# Story MQ-7: Chat Mode Variable Workflow

**Status:** Ready for Review
**Priority:** Medium
**Complexity:** M
**Epic:** MQ — Mode Quality Parity
**Phase:** 3 (depends on MQ-6; both are Phase 3)

---

## PO Validation

**Score:** 9/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-02

| Check | Result | Note |
|-------|--------|------|
| 1. Clear title | ✅ | |
| 2. Complete description | ✅ | Tools exist but workflow instruction missing — gap identified precisely |
| 3. Testable AC | ✅ | 5 ACs + 2 tests (file with variables, empty file) — covers both paths |
| 4. Scope IN/OUT | ⚠️ | Scope narrow (prompt-only) but no OUT section; implied by "prompt text only" Dev Note |
| 5. Dependencies | ✅ | MQ-6 dependency explicit; MQ-1 coordination noted |
| 6. Complexity | ✅ | M (prompt text additions only, but careful merge needed) |
| 7. Business value | ✅ | Variable-bound designs = Figma-native tokens |
| 8. Risks | ✅ | MQ-1 checklist merge conflict identified and mitigation provided |
| 9. Done criteria | ✅ | Build + 2-scenario test |
| 10. Alignment | ✅ | DQ epic variable workflow correctly carried |

**Observation (Sequencing):** MQ-7 depends on MQ-6. The sprint order must be MQ-6 → MQ-7. If MQ-1 and MQ-7 both touch `system-prompt.ts`, the branch merging sequence matters — @dev should implement MQ-1 first, then MQ-7 on top (or coordinate branches carefully).

---

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [build, manual-smoke]
```

---

## Story

**As a** user of Figmento's Chat mode,
**I want** the AI to automatically read my Figma file's variables and use them instead of hardcoding hex values,
**so that** Chat mode designs are Figma-native (variable-bound) just like MCP path designs.

---

## Context

The plugin already has full variable binding capability:
- `read_figma_context` — reads variables, paint styles, text styles from the Figma file
- `bind_variable` — binds a variable to a node property
- `apply_paint_style`, `apply_text_style`, `apply_effect_style` — apply named styles
- These tools are all confirmed present in `tools-schema.ts` (added by the DQ epic)

The gap: `system-prompt.ts` doesn't instruct the Chat mode AI to USE them. The AI has the tools but doesn't know the workflow. This story adds the "Figma-Native Workflow" section to the system prompt.

**Dependency:** MQ-6 adds `run_refinement_check` to tools-schema.ts. MQ-7 also references this tool in the self-evaluation step of the Figma-Native Workflow — implement MQ-6 first, or make the reference conditional.

---

## Acceptance Criteria

1. `buildSystemPrompt()` includes a "Figma-Native Workflow" section that instructs the AI:
   - At the start of every design session: call `read_figma_context`
   - If variables exist in the response: use `bind_variable` for ALL colors instead of `set_fill` with hardcoded hex values
   - If paint styles exist: use `apply_paint_style` instead of `set_fill`
   - If text styles exist: use `apply_text_style` instead of manual font size/weight settings
   - If no variables/styles exist AND this is a new project: suggest creating a design system first (call `create_figma_variables`)
2. The Figma-Native Workflow section is positioned early in the prompt — after "Core Rules" and before the main "Design Workflow" section — so the AI sees it before starting any design task.
3. The Design Workflow section's first step is updated to include a sub-step: "1b. Call read_figma_context to check for existing variables, paint styles, and text styles."
4. The self-evaluation checklist includes: "Variable binding: Were variables used for colors when they exist? Did you avoid hardcoding hex values that duplicate existing tokens?"
5. Build clean: `cd figmento && npm run build`

---

## Tasks / Subtasks

- [x] **Task 1: Read current buildSystemPrompt() structure** — Core Rules at line 9, Design Workflow at line 22
- [x] **Task 2: Add Figma-Native Workflow section** (AC: 1, 2)
  - Inserted between Core Rules and Design Workflow
  - Covers all 4 conditional branches (variables, paint styles, text styles, fallback)
  - Includes run_refinement_check guidance for post-design quality loop
  - Under 20 lines
- [x] **Task 3: Update Design Workflow step 1** (AC: 3)
  - Added sub-step "1b. Call read_figma_context to discover existing variables and styles."
- [x] **Task 4: Update Self-Evaluation Checklist** (AC: 4)
  - MQ-1 already added checklist item 15: "Variable binding — were variables used for colors when they exist in the file?" — AC:4 satisfied
- [x] **Task 5: Build and verify** (AC: 5)
  - `cd figmento && npm run build` — passes clean (dist/code.js 466.2kb)

---

## Dev Notes

**Short story — prompt text only.** No new tools, no new handlers, no new files. All changes are additions to `system-prompt.ts`.

**Coordination with MQ-1:** MQ-1 expands the self-evaluation checklist from 8 to 16 points. MQ-7's Task 4 adds another checklist item. If MQ-1 is implemented first, verify MQ-7's checklist item doesn't create a conflict or duplicate. If MQ-7 is implemented first, add the variable binding item to the checklist — MQ-1 will include it in the 16-point expansion.

**The tools are already wired** — `read_figma_context`, `bind_variable`, etc. are in `tools-schema.ts`. This story only tells the AI how to use them via the system prompt.

**Example Figma-Native Workflow section text:**
```
## Figma-Native Workflow (Variable Binding)

ALWAYS start every design session by calling read_figma_context.

If the response includes variables:
  → Use bind_variable for ALL fill colors. Never hardcode hex values that duplicate tokens.
  → Use bind_variable for spacing values when corresponding spacing variables exist.

If the response includes paint styles:
  → Use apply_paint_style instead of set_fill for fills that match a style.

If the response includes text styles:
  → Use apply_text_style instead of manually setting fontSize/fontWeight.

If the file has no variables and no styles:
  → For new projects: offer to call create_figma_variables to set up a design system.
  → For existing files: use set_fill/set_text normally (acceptable fallback).
```

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/system-prompt.ts` | Add Figma-Native Workflow section; update Design Workflow step 1; update checklist |

---

## Validation

**TEST MQ-7 (Chat Mode — file with variables):**
1. Create a Figma file with at least 3 color variables (e.g., brand/primary, brand/background, text/primary)
2. Open Figmento Chat tab
3. Ask: "Create an Instagram post for a coffee brand called DARK MATTER. Dark theme."
- [x] First tool call is `read_figma_context`
- [x] AI uses `bind_variable` for fill colors (not `set_fill` with hex values)
- [x] Design nodes in Figma show variable bindings (not static colors) in the right panel

**TEST MQ-7b (Chat Mode — empty file):**
Ask the same prompt in a new, empty Figma file.
- [x] AI calls `read_figma_context`, finds no variables
- [x] AI proceeds with `set_fill` using hex values (acceptable fallback)
- [x] No errors, design is created normally

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - Prompt string correctness (no broken template literals)
  - Section positioning (Figma-Native Workflow must appear before Design Workflow)
  - No accidental removal of existing prompt content
```
