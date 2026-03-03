# Story FC-6: Carousel Mode — Function-Calling Migration

**Status:** Done
**Priority:** Medium
**Complexity:** M
**Epic:** FC — Function-Calling Mode Migration
**Phase:** 3 — Remaining Modes
**Depends on:** FC-1, FC-4; FC-5 recommended (share designSystem utilities, avoid duplication)
**Parallel with:** FC-7

---

## PO Validation

**Score:** 7/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-03

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Clear title | ✅ | |
| 2 | Complete description | ✅ | Four carousel-specific differentiators clearly listed. "Structurally identical to FC-5" is a useful migration shortcut. |
| 3 | Testable AC | ✅ | 9 ACs; AC 3 (narrative context injection) and AC 2 (cover slide instruction) are specific |
| 4 | Scope | ⚠️ | No OUT block; same gap as FC-5 |
| 5 | Dependencies | ⚠️ | **FC-5 was absent from Depends-on.** Now added as "recommended." The story explicitly says "reuse FC-5 designSystem interface" — if FC-5 ships before FC-6, the @dev can extract shared utilities. If parallel, duplication risk. |
| 6 | Complexity | ✅ | M |
| 7 | Business value | ✅ | "carousel feels like a designed series, not disconnected individual frames" — clear quality signal |
| 8 | Risks | ❌ | **Duplication risk not documented:** if @dev implements designSystem extraction in carousel.ts independently from presentation.ts, the codebase has two implementations of the same pattern. The story should mandate: extract `SlideDesignSystem` interface + extraction function to a shared util (`slide-utils.ts`) that both FC-5 and FC-6 import. |
| 9 | Done criteria | ✅ | AC 9 (build) + TEST FC-6-A (4-slide consistency) + TEST FC-6-B (outline carousel) |
| 10 | Alignment | ✅ | Phase 3, natural companion to FC-5 |

**Required fix before starting (@dev):** Check if FC-5 is merged. If yes: extract `SlideDesignSystem` interface and `extractDesignSystem(toolCallLog)` into `figmento/src/ui/slide-utils.ts` and import it in both `presentation.ts` and `carousel.ts`. Do not duplicate this logic. If FC-5 is not yet merged: implement it in carousel.ts with a `// TODO: extract to slide-utils.ts when FC-5 merges` comment.

Status → Ready.

---

## Story

**As a** user of Carousel mode,
**I want** each carousel slide to be built tool-by-tool with a consistent visual thread across all slides,
**so that** the carousel feels like a designed series, not disconnected individual frames.

---

## Context

Carousel mode creates multi-slide social media carousels (Instagram, LinkedIn, etc.). Current flow is similar to Presentation mode — per-slide UIAnalysis JSON → `createDesignFromAnalysis()`. The migration follows the same per-slide loop pattern as FC-5 with two key differences:

1. **Carousel slides are tighter compositions** — smaller text, more image-forward, mobile-first
2. **Slide 1 (cover) sets the hook** — subsequent slides develop the narrative. The visual thread (color, font, frame element, progress indicator) must carry across.
3. **Typical format:** 1080×1080 (square) or 1080×1350 (portrait 4:5) — social-native
4. **Carousel-specific element:** Many carousels have a navigation arrow or slide indicator (e.g. "1/5") — the AI should add this via tools

**The migration is structurally identical to FC-5** (per-slide tool-use loop + designSystem extraction) but with carousel-specific prompt context and slide type vocabulary.

---

## Acceptance Criteria

1. `carousel.ts` calls `runToolUseLoop()` once per slide. Each loop creates one carousel slide frame.
2. Slide 1 (cover) initial message instructs: establish brand identity, create an eye-catching cover, use the carousel format (square/portrait), include a visual hook that makes users swipe.
3. Slides 2+ initial message includes `designSystem` extracted from slide 1 (same pattern as FC-5), PLUS narrative context: "This is slide N of M. The narrative arc: [user's topic outline]."
4. Each slide's `onProgress` shows "Slide N of M — " prefix (FC-4 utility).
5. Slide frames created at the correct carousel format dimensions (1080×1080 or 1080×1350 based on user selection).
6. Frames positioned side-by-side with 40px gap (same post-process as FC-5).
7. No `createDesignFromAnalysis()` calls in Carousel mode execution path.
8. Works with all 3 providers.
9. Build clean: `cd figmento && npm run build`.

---

## Tasks / Subtasks

- [x] **Task 1: Read carousel.ts** — Carousel lives in text-layout.ts (no separate file). Mapped: carousel config state, getCarouselPrompt(), analyzeTextDesign() branch for carousel, old `_isCarousel` result handling with fetchAllIcons/generateTextLayoutImages/create-carousel postMessage.
- [x] **Task 2: Write `buildCarouselSlideInitialMessages(topic, slideOutline, slideIndex, totalSlides, format, designSystem?)`** — Carousel-specific. Slide types: `'cover'` (hook + brand), `'content'` (narrative development), `'cta'` (final swipe-worthy action). Include social-native guidance: "Mobile-first. Text must be large enough to read on phone. Maximum 2-3 text elements per slide."
- [x] **Task 3: Implement per-slide loop orchestrator** — Same structure as FC-5: iterate slides, extract `designSystem` after slide 1, position frames after all complete.
- [x] **Task 4: Carousel-specific narrative injection** — User provides a topic and optionally an outline (e.g. "5 tips for better sleep: [tip 1, tip 2...]"). Each slide gets one piece of the narrative. Parse the outline and assign content to slides in `buildCarouselSlideInitialMessages`.
- [x] **Task 5: Slide positioning + format** — Same post-process as FC-5. Format dimensions: check carousel.ts for the user-selectable format options and their pixel values.
- [x] **Task 6: Test and build** (AC: 9).

---

## Dev Notes

**Carousel slide types vs Presentation slide types:**
| Presentation | Carousel |
|---|---|
| title | cover (hook + visual identity) |
| content | content (one idea per slide) |
| image | — (images handled within slides) |
| closing | cta (swipe / follow / link in bio) |

**Mobile readability rule for carousel:** The AI should use larger text than presentation (minimum 48px for primary text on 1080×1080). Inject this as a constraint in the user message: "Format: Instagram carousel. All primary text must be ≥48px. Secondary text ≥32px. Avoid text below 28px."

**Narrative arc handling:** If the user provides an outline like "5 tips for productive mornings: [Wake up early, Cold shower, No phone first hour, Journaling, Meal prep]", assign:
- Slide 1 (cover): "5 Tips for Productive Mornings" — hook
- Slides 2-5: One tip per slide
- Final slide (if exists): CTA

If the user just provides a topic without a detailed outline, the AI infers the slide content.

**reuse FC-5 designSystem interface:** `{ backgroundColor, accentColor, fontFamily }` — identical structure.

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/carousel.ts` | Replace per-slide UIAnalysis flow with `runToolUseLoop` per slide. Add designSystem extraction. Add slide positioning post-process. |

---

## Validation

**TEST FC-6-A: 4-slide carousel**
```
Topic: "Morning Routine for Productivity" — 4 slides, Instagram square (1080×1080).
```
- [ ] All 4 slides created
- [ ] Visual consistency across slides (same colors)
- [ ] Mobile-legible text sizes

**TEST FC-6-B: Outline carousel**
```
Topic: "3 Reasons to Drink More Water" with outline: [Better skin, More energy, Weight management]
```
- [ ] Slide 1: hook about drinking water
- [ ] Slides 2-4: one reason per slide

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - Carousel format dimensions correctly applied (not presentation dimensions)
  - Mobile font size minimums enforced in user message
  - No createDesignFromAnalysis remaining
  - Narrative outline parsing: handles both outline-provided and topic-only inputs
```

---

## Dev Agent Record

**Agent Model Used:** claude-sonnet-4-6
**Implementation Date:** 2026-03-03

### File List

| File | Change |
|------|--------|
| `figmento/src/ui/slide-utils.ts` | CREATED — shared `SlideDesignSystem` interface, `ToolCallLogEntry` type, `extractDesignSystem()` (with all null guards from FC-5), `formatConsistencyConstraint()` helper. Extracted from presentation.ts so both FC-5 and FC-6 share one implementation. |
| `figmento/src/ui/presentation.ts` | MODIFIED — removed local `SlideDesignSystem` interface + `extractDesignSystem()` function; now imports both from `slide-utils.ts`; updated `buildSlideInstruction` to use `formatConsistencyConstraint()`; updated `slide1Log` type to `ToolCallLogEntry[]`. |
| `figmento/src/ui/text-layout.ts` | MODIFIED — added `slide-utils.ts` import; added `getCarouselSlideType()`, `parseCarouselOutline()`, `buildCarouselSlideInstruction()`, `buildCarouselSlideInitialMessages()` carousel helpers; replaced old `if (input.carousel?.enabled)` block (analyzeTextDesign → _isCarousel → fetchAllIcons → create-carousel) with per-slide `runToolUseLoop` orchestrator sharing `sendTextLayoutCommand` + `resolveTextLayoutCommand` from FC-3. |

### Completion Notes

- Carousel lives in `text-layout.ts` (no separate `carousel.ts`). The FC-3 pending-command bridge (`sendTextLayoutCommand` / `resolveTextLayoutCommand` / `text-layout-` routing in index.ts) is reused — no new bridge needed.
- `slide-utils.ts` created as the shared module. `presentation.ts` updated to import from it (no behavior change — same logic, same fallbacks).
- `parseCarouselOutline()` handles two input formats: `"Topic: [item1, item2, item3]"` (bracket syntax) → assigns one item per middle slide; plain topic string → uses generic per-slide labels.
- Slide types: `cover` (slide 0), `cta` (last slide), `content` (all middle slides).
- Mobile font size minimums injected in every slide message: "All primary text must be ≥48px. Secondary text ≥32px."
- Cross-slide consistency via `formatConsistencyConstraint()` from slide-utils — only injects non-default values.
- Slide count: reads `input.carousel.slideCount`; defaults to 4 when `'auto'`.
- Positioning: same `move_node` post-loop at `i * (slideWidth + 40)` — reuses `sendTextLayoutCommand`.
- `maxIterations: 30` per slide.
- Build: ✅ clean — 16ms, zero errors (AC 9).
- Tests FC-6-A and FC-6-B: deferred — require plugin reload in Figma.

### Change Log

- 2026-03-03: FC-6 implemented by @dev (Dex). slide-utils.ts created. text-layout.ts carousel path migrated to runToolUseLoop. presentation.ts refactored to import from slide-utils. Build clean.
- 2026-03-03: Live smoke test passed in Figma — carousel per-slide loop confirmed working. Status → Done (@sm River).
