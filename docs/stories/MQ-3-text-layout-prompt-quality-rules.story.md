# Story MQ-3: Text-to-Layout Prompt Quality Rules

**Status:** Ready for Review
**Priority:** High
**Complexity:** S
**Epic:** MQ — Mode Quality Parity
**Phase:** 1 (can run in parallel with MQ-1 and MQ-2)

---

## PO Validation

**Score:** 7/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-02

| Check | Result | Note |
|-------|--------|------|
| 1. Clear title | ✅ | |
| 2. Complete description | ✅ | presentation.ts file discovery noted; architecture explained |
| 3. Testable AC | ✅ | 5 ACs + 2 manual tests (Text-to-Layout + Carousel) |
| 4. Scope IN/OUT | ⚠️ | No OUT scope in story; presentation.ts update is within scope — clear |
| 5. Dependencies | ⚠️ | No story deps; Phase 1 parallel noted |
| 6. Complexity | ✅ | S (two-file change, but both are string array additions) |
| 7. Business value | ✅ | Carousel and presentation consistency explicitly called out |
| 8. Risks | ⚠️ | Context limit risk in Dev Notes; no explicit regression note |
| 9. Done criteria | ✅ | Build + 2 manual tests |
| 10. Alignment | ✅ | text-layout.ts and presentation.ts confirmed in file system |

**Observation (Critical):** This story touches two files — `text-layout.ts` AND `presentation.ts`. @dev must NOT close the story until both files are updated and both tests pass. The two-file requirement is captured in the "Files to Modify" table and CodeRabbit focus area.

---

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [build, manual-smoke]
```

---

## Story

**As a** user of Figmento's Text-to-Layout mode,
**I want** the AI to apply the same design quality rules when generating social media designs from text,
**so that** text-to-layout designs have proper auto-layout, correct gradients, enforced typography hierarchy, and spacing from the 8px grid.

---

## Context

`TEXT_LAYOUT_PROMPT` in `text-layout.ts` has 14 rules for generating social media designs. It mentions auto-layout (rule 8) and text sizing but lacks gradient intelligence, spacing scale enforcement, and anti-pattern awareness. The prompt builders (`getTextLayoutPrompt`, `getCarouselPrompt`) compose the final prompt from this base.

The presentation prompt (`getPresentationPrompt`) lives in a separate file — `presentation.ts` — and also needs the spacing and auto-layout rules added.

---

## Acceptance Criteria

1. `TEXT_LAYOUT_PROMPT` includes quality rules for: auto-layout (mandatory, not "as default"), spacing scale (multiples of 4), gradient direction (content-aware — solid end faces text), typography hierarchy (headline ≥ 2× body size).
2. `TEXT_LAYOUT_PROMPT` includes an anti-patterns warning: "AVOID: centered text on everything (vary alignment), equal padding on all frames (vary for rhythm), flat gray backgrounds (add depth), gradients that fade away from text."
3. `getCarouselPrompt()` in `text-layout.ts` includes: "Consistent spacing across slides — use the same itemSpacing and padding values on every slide."
4. `getPresentationPrompt()` in `presentation.ts` includes: "Use auto-layout for every slide frame. Spacing values from scale: 8, 16, 24, 32, 48. Consistent padding across slides."
5. Build clean: `cd figmento && npm run build`

---

## Tasks / Subtasks

- [x] **Task 1: Read current TEXT_LAYOUT_PROMPT in text-layout.ts** — understand the 14 existing rules and the string array structure
- [x] **Task 2: Add quality rules 15-18 to TEXT_LAYOUT_PROMPT** (AC: 1, 2)
  - Add after existing rule 14:
  ```typescript
  '15. SPACING SCALE: itemSpacing and padding values must be multiples of 4. Use: 8, 16, 24, 32, 48. Never arbitrary values like 13, 27, 53.',
  '16. GRADIENT DIRECTION: Gradient overlay solid end (opacity 1.0) faces the text zone. Text at bottom = solid at bottom. Text at top = solid at top. Match gradient color to section background.',
  '17. TYPOGRAPHY RATIO: Headline font size ≥ 2x body size. Use at least 3 distinct sizes for visual hierarchy.',
  '18. AVOID: centered text on EVERY element (vary alignment by hierarchy level), equal padding on all frames (vary for rhythm), flat solid colored backgrounds on hero sections (add gradient or overlay depth), gray rectangle placeholders (describe the image instead).',
  ```
- [x] **Task 3: Update getCarouselPrompt() in text-layout.ts** (AC: 3)
  - After existing carousel-specific instructions, add:
  `'CAROUSEL CONSISTENCY: Use identical itemSpacing and padding values across all slides. Define spacing values once and apply uniformly.'`
- [x] **Task 4: Read getPresentationPrompt() in presentation.ts** — understand its structure and where to add the rule
- [x] **Task 5: Update getPresentationPrompt() in presentation.ts** (AC: 4)
  - Add to the presentation-specific instructions:
  `'LAYOUT: Use auto-layout (VERTICAL) for every slide frame. All spacing from scale: 8, 16, 24, 32, 48. Apply consistent paddingTop/Right/Bottom/Left across slides.'`
- [x] **Task 6: Build and verify** (AC: 5)
  - `cd figmento && npm run build` — must succeed

---

## Dev Notes

**`TEXT_LAYOUT_PROMPT` is a joined string array** in `text-layout.ts`. Same pattern as `ANALYSIS_PROMPT`. New rules appended at the end of the array (before the closing `]`).

**`getCarouselPrompt()` is in `text-layout.ts`** — confirmed at line 865. It composes from `TEXT_LAYOUT_PROMPT` + additional carousel-specific instructions. Add consistency rule inside the carousel-specific block.

**`getPresentationPrompt()` is in `presentation.ts`** — confirmed at line 1011. It is NOT in `text-layout.ts`. This file was overlooked in the original epic draft; it must be updated separately.

**Keep additions short.** Each prompt goes to Anthropic or Gemini with user content, format dimensions, font/color settings, and possibly reference images. Target ≤ 20 new lines total across all additions in this story.

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/text-layout.ts` | Add rules 15-18 to TEXT_LAYOUT_PROMPT; update getCarouselPrompt() |
| `figmento/src/ui/presentation.ts` | Update getPresentationPrompt() with auto-layout + spacing rule |

---

## Validation

**TEST MQ-3 (Text-to-Layout):** Content = "Every cup tells a story. Ritual Roasters — Specialty coffee since 2019." Dark theme, Instagram Post format.
- [ ] Auto-layout used on all container frames
- [ ] itemSpacing values are multiples of 4 or 8 (inspect in Figma panel)
- [ ] Typography hierarchy present — headline visibly larger than body (≥ 2×)
- [ ] No flat solid background on the hero area

**TEST MQ-3b (Carousel):** Create a 3-slide carousel.
- [ ] Spacing consistent across all 3 slides

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - Correct file targets (text-layout.ts AND presentation.ts — both must be updated)
  - Array element placement before closing bracket
  - No TypeScript compile errors from string array additions
```
