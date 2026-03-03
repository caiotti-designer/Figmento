# Story MQ-2: Analysis Prompt Quality Rules

**Status:** Ready for Review
**Priority:** High
**Complexity:** S
**Epic:** MQ — Mode Quality Parity
**Phase:** 1 (can run in parallel with MQ-1 and MQ-3)

---

## PO Validation

**Score:** 7/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-02

| Check | Result | Note |
|-------|--------|------|
| 1. Clear title | ✅ | |
| 2. Complete description | ✅ | Context explains ANALYSIS_PROMPT role; scope note on affected modes |
| 3. Testable AC | ✅ | 6 specific ACs + manual test with 4 observable outcomes |
| 4. Scope IN/OUT | ⚠️ | No explicit OUT scope in story; in epic — acceptable for S story |
| 5. Dependencies | ⚠️ | No story deps; Phase 1 parallel noted |
| 6. Complexity | ✅ | S |
| 7. Business value | ✅ | Immediate quality improvement on Screenshot-to-Layout |
| 8. Risks | ⚠️ | Context limit risk in Dev Notes; rule 11 boundary must be verified |
| 9. Done criteria | ✅ | Build + 4-check validation |
| 10. Alignment | ✅ | prompt.ts target confirmed; Screenshot-to-Layout + wider scope noted |

**Observation:** Dev notes say "understand the 11 existing rules and the 'Return ONLY valid JSON' trailing instruction" — @dev must verify rule count before inserting rules 12-15, as rule numbering must stay sequential.

---

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [build, manual-smoke]
```

---

## Story

**As a** user of Figmento's Screenshot-to-Layout mode,
**I want** the AI that analyzes my screenshot to apply design quality rules (auto-layout preference, correct gradient direction, proper spacing) when generating the UIAnalysis JSON,
**so that** the reconstructed design uses auto-layout, correct gradients, and proper spacing instead of absolute positioning with arbitrary values.

---

## Context

`ANALYSIS_PROMPT` in `prompt.ts` tells the AI how to analyze a screenshot and produce UIAnalysis JSON. It already mentions auto-layout as "DEFAULT" (rule 10) but doesn't enforce it strongly enough. It has no gradient direction rules, no spacing scale, and no minimum font size enforcement.

This prompt produces the JSON that becomes the actual Figma design. Better rules here = better designs immediately.

> **Note on scope:** `ANALYSIS_PROMPT` is also used by any mode that passes a screenshot for analysis (not just Screenshot-to-Layout). Improvements benefit all such flows.

---

## Acceptance Criteria

1. `ANALYSIS_PROMPT` includes a "Quality Enforcement" block containing:
   - Auto-layout is MANDATORY for any frame with 2+ children
   - Spacing values must come from the 8px scale (4, 8, 12, 16, 24, 32, 48, 64)
   - Gradient overlays: solid end must face the text zone (brief explanation of 4-direction rule)
   - Minimum font sizes by canvas size
2. The auto-layout rule is upgraded from "use as DEFAULT" to "MANDATORY for all container frames — only use absolute positioning for decorative overlapping elements (badges, background shapes, watermarks)."
3. A spacing rule states: "itemSpacing and padding values must be multiples of 4. Prefer: 8, 16, 24, 32, 48. Never use arbitrary values like 13, 27, 53."
4. A gradient rule states: "When creating gradient overlay fills, the solid end (opacity 1.0) must be positioned at the edge where text content sits. If text is at the bottom, gradient direction = bottom-top with stop at position 0 = opacity 0 (top, transparent), stop at 0.4-0.5 = opacity 1 (bottom, solid)."
5. A font hierarchy rule states: "Headline must be at least 2× body text size. For canvas > 1000px wide: body ≥ 16px, heading ≥ 32px. For canvas > 2000px wide (print): body ≥ 24px, heading ≥ 48px."
6. Build clean: `cd figmento && npm run build`

---

## Tasks / Subtasks

- [x] **Task 1: Read current ANALYSIS_PROMPT in prompt.ts** — understand the 11 existing rules and the "Return ONLY valid JSON" trailing instruction
- [x] **Task 2: Upgrade rule 10** (AC: 2)
  - Change from: `'10. Use auto-layout as the DEFAULT - only use absolute positioning for overlapping elements'`
  - To: `'10. Auto-layout is MANDATORY for any frame with 2+ children. Only use absolute positioning for decorative overlapping elements (badges, watermarks, background shapes). Every container frame MUST have layoutMode set.'`
- [x] **Task 3: Add quality enforcement rules 12-15** (AC: 1, 3, 4, 5)
  - Add after existing rule 11, before the "Return ONLY valid JSON" line:
  ```
  '12. SPACING SCALE: All itemSpacing and padding values must be multiples of 4. Preferred: 8, 16, 24, 32, 48. Never use arbitrary values like 13, 27, 53.',
  '13. GRADIENT OVERLAYS: When adding gradient fills over images, the solid end (opacity 1.0) must face the text. Text at bottom → bottom-top direction. Text at top → top-bottom direction. Text at left → left-right. Solid = where text is, transparent = where image shows.',
  '14. FONT SIZE HIERARCHY: Headline must be at least 2x body text size. Never use the same font size for two different hierarchy levels.',
  '15. MINIMUM FONT SIZES: For canvas > 1000px wide: body ≥ 16px, heading ≥ 32px, caption ≥ 12px. For canvas > 2000px wide (print): body ≥ 24px, heading ≥ 48px.',
  ```
- [x] **Task 4: Build and verify** (AC: 6)
  - `cd figmento && npm run build` — must succeed

---

## Dev Notes

**`ANALYSIS_PROMPT` is a joined string array.** Each rule is one string element. New rules are appended after the last existing rule, immediately before the "Return ONLY valid JSON" element.

**Don't over-expand.** This prompt goes to the AI alongside a large base64-encoded screenshot image. Keep total additions to 5-10 lines max to avoid pushing past context limits.

**This affects Screenshot-to-Layout and any other mode that passes a screenshot for analysis.**

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/prompt.ts` | Upgrade rule 10 in ANALYSIS_PROMPT, add rules 12-15 |

---

## Validation

**TEST MQ-2 (Screenshot-to-Layout):** Upload a screenshot of a professional website hero → convert.
- [ ] Reconstructed layout uses auto-layout (not absolute x/y for all children)
- [ ] Spacing values are clean multiples of 4 or 8
- [ ] If a gradient overlay is present, solid end is behind the text area
- [ ] Typography has visible hierarchy (at least 2 distinct size levels)

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - Array element placement (new rules before "Return ONLY valid JSON" element, not after)
  - No accidental comma/bracket issues in the string array
```
