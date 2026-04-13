# Story AE-2: Remove Mandatory Quality Gate from CLAUDE.md

**Status:** Done
**Priority:** High (P1)
**Complexity:** XS (1 point) — Text removal + minor rewrite in CLAUDE.md
**Epic:** AE — Auto-Evaluation
**Depends on:** AE-1
**PRD:** Architecture Audit 2026-03-14 (Item 2)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: CLAUDE.md no longer instructs Claude to manually call run_refinement_check or evaluate_design after every design
```

---

## Story

**As a** Claude Code session,
**I want** the system prompt to not waste tokens instructing me to manually call quality checks,
**so that** my context window is used for design reasoning instead of quality-gate checklists that are now automatic.

---

## Description

With AE-1 landed, `batch_execute` and `create_design` automatically return a refinement score + screenshot. The "Mandatory Quality Gate" section in CLAUDE.md (~25 lines) is now redundant and wastes system prompt tokens on every session.

### What to Remove

The section titled **"Mandatory Quality Gate (Two Steps — Always Run)"** in CLAUDE.md, which contains:
- STEP 1 instructions to call `run_refinement_check(rootFrameId)`
- STEP 2 instructions to call `evaluate_design(rootFrameId)`
- Score threshold enforcement ("Do NOT report design as complete until score ≥ 70")
- The trailing score report format instruction

### What to Replace With

A short note (3-4 lines):

```markdown
### Automatic Quality Feedback

`batch_execute` and `create_design` automatically return a refinement score and screenshot when creating 5+ elements. Check the `evaluation.score` in the response — if score < 70, fix the reported `evaluation.issues` before reporting done. Pass `autoEvaluate: false` to skip for intermediate batches.
```

### Also Simplify

The **Self-Evaluation Checklist** (16 points) can be reduced to reference the automatic evaluation. The refinement engine covers 7 specific checks — map them to the exact checklist points:

> "The following checks are now automated by the refinement engine: **1** (Alignment — spacing-scale), **2** (Contrast — wcag-contrast), **5** (Consistency — spacing-scale + typography-hierarchy), **6** (Safe zones — safe-zone), **14** (Images resolved — empty-placeholder), **15** (Gradient direction — gradient-direction), **16** (Print structure — auto-layout-coverage). Focus manual review on the remaining 9 points: 3 (Hierarchy), 4 (Whitespace), 7 (Balance), 8 (Intent), 9 (Typography polish), 10 (Shadow quality), 11 (Memorable element), 12 (Refinement applied), 13 (Reference consulted)."

---

## Acceptance Criteria

- [x] AC1: "Mandatory Quality Gate" section removed from CLAUDE.md
- [x] AC2: Replaced with 3-4 line "Automatic Quality Feedback" note
- [x] AC3: Self-Evaluation Checklist updated to reference automatic checks
- [x] AC4: No other sections broken by the removal (check surrounding markdown structure)
- [x] AC5: Net reduction of ≥ 20 lines from CLAUDE.md

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `.claude/CLAUDE.md` | MODIFY | Remove ~25 lines, add ~5 lines |

---

## Definition of Done

- [ ] CLAUDE.md renders correctly in Claude Code
- [ ] No references to manual `run_refinement_check` or `evaluate_design` calls remain as mandatory steps

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment |
| 2026-03-14 | @pm (Morgan) | Applied @po validation fix: corrected self-evaluation point mapping to match actual refinement engine checks (7 points, not 8). Status Draft → Ready |
| 2026-04-12 | @qa (Quinn) | **QA Gate: PASS.** 5/5 ACs verified. Committed in `bfb36ed` (TC-4 + AE-2 — update CLAUDE.md tool references + remove mandatory quality gate). Status: InProgress → Done. |
