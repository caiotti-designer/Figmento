# Story FC-7: Hero Generator + Ad Analyzer — Function-Calling Migration

**Status:** Done
**Priority:** Medium
**Complexity:** M
**Epic:** FC — Function-Calling Mode Migration
**Phase:** 3 — Remaining Modes
**Depends on:** FC-1, FC-4
**Parallel with:** FC-5, FC-6

---

## PO Validation

**Score:** 8/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-03

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Clear title | ✅ | Two-mode story — title accurately reflects both |
| 2 | Complete description | ✅ | Best sub-module split in the epic. Hero and Ad Analyzer contexts cleanly separated. The "analysis step stays as text generation" boundary is stated precisely. |
| 3 | Testable AC | ✅ | 11 ACs split by sub-module. AC 6 is an explicit OUT ("analysis step NOT changed") — strongest scope protection in the set. |
| 4 | Scope | ✅ | AC 6 functions as a formal OUT clause. The two-module structure is justified: both are single-frame or small-batch, bounded scope. |
| 5 | Dependencies | ✅ | FC-1 + FC-4 correctly listed |
| 6 | Complexity | ✅ | M — two files but both are simpler than carousel/presentation |
| 7 | Business value | ✅ | "variable binding, refinement checks, real image generation during creation" — concrete capability unlocks |
| 8 | Risks | ⚠️ | Dev Notes flag "HeroInput interface — check for exact fields." If the actual interface differs from the expected `{ headline, subheadline, ctaText, format, imageRole, colorTheme, fontFamily }`, the gradient direction mapping breaks silently (imageRole cases are hardcoded). This is a mild but real risk. |
| 9 | Done criteria | ✅ | AC 11 (build) + TEST FC-7-A (gradient direction) + TEST FC-7-B (variant generation) |
| 10 | Alignment | ✅ | Phase 3, completes mode coverage defined in the epic |

**Observation:** Task 1 for Hero Generator should explicitly confirm the `HeroInput` interface fields before writing `buildHeroInitialMessages`. If `imageRole` is named differently in the actual file (e.g. `backgroundStyle`), the gradient direction switch needs updating. Document the confirmed field names in Dev Notes after Task 1.

Status → Ready.

---

## Story

**As a** user of Hero Generator or Ad Analyzer mode,
**I want** each design to be created tool-by-tool with the same iterative approach as Chat mode,
**so that** heroes and ads are no longer constrained by the JSON output limit, and the AI can use variable binding, refinement checks, and real image generation during creation.

---

## Context

This story migrates two smaller but important modes:

### Hero Generator (`hero-generator.ts`)
Creates a full-bleed hero section for web or social. Current flow: `UIAnalysis JSON → createDesignFromAnalysis()`. Heroes are typically single-frame (one AI generation per use). The migration is simpler than carousel/presentation — a single `runToolUseLoop` call per generation.

**Hero-specific context to inject:** Format (web 1440×900, Instagram 1080×1080, etc.), color theme, headline text, CTA text, image role (full-bleed/split/overlay).

**The gradient overlay rule is critical for heroes** — the AI must apply the content-aware gradient direction (Rule 4b from CLAUDE.md). The hero user message should explicitly remind the model: "Text is positioned at [bottom/left/right]. Apply gradient overlay with solid end behind the text."

### Ad Analyzer (`ad-analyzer.ts`)
Analyzes an existing ad (screenshot or URL) and generates variant designs. Two sub-flows:
1. **Analyze:** Screenshot → AI analyzes the ad's composition (this part stays as-is — it returns text analysis, not UIAnalysis JSON, so no migration needed for the analysis step)
2. **Generate variants:** From analysis → generate N variant frames → this is the part that currently uses `UIAnalysis JSON → createDesignFromAnalysis()`

Only the **variant generation** sub-flow needs migration. The analysis text output stays as text.

---

## Acceptance Criteria

### Hero Generator
1. `hero-generator.ts` calls `runToolUseLoop()` for each hero generation (single frame per generation).
2. Initial message includes: format/size, headline text, subheadline, CTA text, color theme, image role, and an explicit gradient direction instruction based on the image role (e.g. if image role is 'full-bleed-bottom', instruction says "Apply gradient overlay: solid at bottom where text lives, transparent at top where image shows").
3. `onProgress` wired to FC-4 progress utilities.
4. No `createDesignFromAnalysis()` calls in hero-generator.ts execution path.
5. Works with all 3 providers.

### Ad Analyzer
6. `ad-analyzer.ts` analysis step (screenshot → text breakdown) is NOT changed — it returns a text analysis, not UIAnalysis JSON.
7. `ad-analyzer.ts` variant generation step calls `runToolUseLoop()` once per variant frame.
8. Variant initial message includes: the text analysis result from the analysis step (so the AI knows what the original ad looked like), plus the variant instruction (e.g. "Create a dark theme variant", "Create a luxury edition", "Create a minimal version").
9. Multiple variants are generated in sequence (one loop per variant), positioned side-by-side.
10. No `createDesignFromAnalysis()` calls in the variant generation path of ad-analyzer.ts.
11. Build clean: `cd figmento && npm run build`.

---

## Tasks / Subtasks

### Hero Generator
- [x] **Task 1: Read hero-generator.ts** — Map: input schema, prompt building, `createDesignFromAnalysis` call, progress tracking.
- [x] **Task 2: Write `buildHeroInitialMessages(input: HeroInput)`** — Includes all hero-specific context. The gradient direction instruction is derived from `input.imageRole`:
  - `full-bleed` (image covers entire frame, text at bottom) → "gradient: solid at bottom, transparent at top"
  - `split-left` (image left half, text right) → "gradient: solid at right, transparent at left"
  - `overlay-top` (text at top, image below) → "gradient: solid at top, transparent at bottom"
- [x] **Task 3: Wire `runToolUseLoop` for hero generation** — Single call, `maxIterations: 30`, progress via FC-4 utilities.
- [x] **Task 4: Test hero generation** — 3 hero variants with different imageRole values.

### Ad Analyzer
- [x] **Task 5: Read ad-analyzer.ts** — Identify the two sub-flows clearly: (a) analysis text generation (keep as-is), (b) variant frame generation (migrate). Map exactly where `createDesignFromAnalysis` is called.
- [x] **Task 6: Write `buildAdVariantInitialMessages(analysisText, variantInstruction, format)`** — The analysis text from step (a) is included verbatim so the AI understands the original ad's structure. The variant instruction guides the departure.
- [x] **Task 7: Wire `runToolUseLoop` for variant generation** — One loop per variant. Position variants side-by-side after all complete (40px gap, same as FC-5/FC-6).
- [x] **Task 8: Build + test** (AC: 11).

---

## Dev Notes

**Hero gradient direction rule (inject into user message, not system prompt):**
```
Image role: full-bleed (image covers entire canvas)
Text position: bottom third
→ Apply gradient overlay on top of image:
   Direction: bottom-to-top
   Stop 1 (pos 0, bottom): backgroundColor at opacity 1.0
   Stop 2 (pos 0.5, mid): backgroundColor at opacity 0
   The gradient should cover approx 50% of the frame height from the bottom.
   Text must be fully within the solid gradient zone.
```
This is explicit enough for the AI to translate directly into `set_fill` with the correct gradient params.

**Ad Analyzer: analysis step stays as text generation.** The current analysis flow calls the AI with the ad screenshot and gets back a structured text analysis (not UIAnalysis JSON). This text output is shown in the UI as the "analysis panel". Only the subsequent variant generation calls `createDesignFromAnalysis`. Do not touch the analysis step.

**Variant count:** Ad Analyzer typically generates 2-3 variants. All variants should share a canvas: frame 1 at x=0, frame 2 at x=width+40, frame 3 at x=(width+40)*2.

**HeroInput interface (check hero-generator.ts for exact fields):**
Expected: `{ headline, subheadline, ctaText, format, imageRole, colorTheme, fontFamily }`.

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/hero-generator.ts` | Replace UIAnalysis flow with `runToolUseLoop`. Add gradient direction injection. |
| `figmento/src/ui/ad-analyzer.ts` | Replace variant generation UIAnalysis flow with `runToolUseLoop`. Keep analysis text flow unchanged. |

---

## Validation

**TEST FC-7-A: Hero with full-bleed image**
```
Hero Generator: "GRIND Fitness" — headline "Built Different", dark theme, full-bleed image role.
```
- [ ] Frame created with hero dimensions
- [ ] Gradient overlay present, solid end at bottom (where text is)
- [ ] Text legible over image

**TEST FC-7-B: Ad variant generation**
```
Ad Analyzer: Drop in a screenshot of any ad. Click "Generate Variants".
Request 2 variants: dark and minimal.
```
- [ ] Analysis text appears (unchanged)
- [ ] 2 variant frames created side-by-side
- [ ] Each variant is visually distinct

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - Hero gradient direction is imageRole-dependent (not hardcoded)
  - Ad analysis text flow NOT modified (only variant generation)
  - Variant positioning: no frame overlap, correct gap
  - No createDesignFromAnalysis remaining in either file
```

---

## Dev Agent Record

**Agent Model Used:** claude-sonnet-4-6
**Implementation Date:** 2026-03-03

### File List

No files changed — no implementation required (see Completion Notes).

### Completion Notes

- **FC-7 is a no-op.** Both target files were investigated and neither uses the `UIAnalysis JSON → createDesignFromAnalysis()` flow described in the story.
- **hero-generator.ts** is a Gemini image-generation tool. Current flow: `generateHeroImage(input, apiKey, signal)` from `images.ts` → places AI-generated image on canvas as an image fill. The `HeroGeneratorInput` type has `{ subjects[], styleRef, elements[], position, scenePrompt, format, quality }` — the `imageRole`, `headline`, `ctaText`, `colorTheme`, `fontFamily` fields in the story do not exist in the codebase.
- **ad-analyzer.ts** is a Bridge passthrough tool. It copies a structured prompt to the clipboard; Claude Code executes the `start_ad_analyzer` MCP tool via the Bridge. No variant generation code exists in the UI layer — all design work runs in Claude Code.
- Neither file contains a `createDesignFromAnalysis()` call. The story described an architecture that was never built or was already replaced before FC-7 was reached.
- Decision: skip FC-7 (confirmed by @dev conversation with user 2026-03-03). Proceed to FC-8.

### Change Log

- 2026-03-03: FC-7 investigated by @dev (Dex). Both target modes found to have no UIAnalysis pipeline — no migration needed. Story closed as Done without code changes.
