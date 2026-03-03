# Story FC-5: Presentation Mode — Function-Calling Migration

**Status:** Done
**Priority:** Medium
**Complexity:** M
**Epic:** FC — Function-Calling Mode Migration
**Phase:** 3 — Remaining Modes
**Depends on:** FC-1, FC-4
**Parallel with:** FC-6, FC-7

---

## PO Validation

**Score:** 7/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-03

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Clear title | ✅ | |
| 2 | Complete description | ✅ | Three problems enumerated; cross-slide consistency concept well-explained |
| 3 | Testable AC | ✅ | 10 ACs; AC 3 (designSystem extraction from `onToolCall` log) is precisely actionable; AC 7 (post-process positioning fallback) closes a real edge case |
| 4 | Scope | ⚠️ | No OUT block. Unstated: slide count UI, format selector, content input are unchanged. @dev could reasonably wonder if any UI needs updating. |
| 5 | Dependencies | ✅ | FC-1 (engine) + FC-4 (progress utilities) listed correctly |
| 6 | Complexity | ✅ | M — per-slide loop orchestrator + designSystem extraction is meaningful new logic |
| 7 | Business value | ✅ | "5+ slide decks no longer time out" — concrete, measurable |
| 8 | Risks | ⚠️ | **designSystem extraction fragility not formally documented.** If the AI's first `create_frame` uses a CSS variable string or an implicit color (e.g. `"transparent"`), the heuristic returns empty string → slides 2+ get no color constraint. This degrades to the old behavior for that session. Should be noted. |
| 9 | Done criteria | ✅ | AC 10 (build) + TEST FC-5-A (3 slides) + TEST FC-5-B (5 slides + timeout check) |
| 10 | Alignment | ✅ | Phase 3, completes the multi-frame mode group |

**Observation:** The designSystem extraction heuristic should fail gracefully — if any field is empty/undefined, slides 2+ simply omit the consistency constraint (no crash). @dev should add a guard: `if (!designSystem.backgroundColor) omit the constraint section entirely`. Add this to Task 3.

Status → Ready.

---

## Story

**As a** user of Presentation mode,
**I want** each slide to be built tool-by-tool by the AI, with real progress feedback per slide,
**so that** 5+ slide decks no longer time out, and each slide has the same layout quality as Chat mode designs.

---

## Context

`presentation.ts` current flow:

```
User sets: slide count, format (16:9/4:3), topic/content
For each slide i:
  → Build slide-specific prompt with content + slide type (title/content/closing)
  → AI returns UIAnalysis JSON for slide i
  → createDesignFromAnalysis() → creates slide frame
  → updateProgress(message, i, total)
```

**Problems:**
1. Each slide requires a complete JSON blob → timeouts on content-heavy slides
2. No cross-slide consistency enforcement — the AI can't see slide 1 while making slide 3
3. 5-slide deck = 5 sequential JSON round-trips → combined timeout risk multiplied

**New flow — per-slide tool-use loop:**

```
User sets: slide count, format, topic/content
For each slide i:
  → buildSlideInitialMessages(topic, slideType, slideIndex, totalSlides)
  → runToolUseLoop({ messages, tools: FIGMENTO_TOOLS, onToolCall: sandboxExecute,
       onProgress: (msg, tool) => updateProgress(`Slide ${i}/${total} — ${msg}`, ...) })
  → (loop ends when AI has no more tool calls for this slide)
→ All slides complete
```

**Cross-slide consistency:** The initial message for each slide includes a brief of the established design system: "This is a [format] presentation. Slide 1 established: dark background #0A0A0F, font: Space Grotesk, accent: #FFD700. Maintain this visual system." This is built from the first slide's tool calls.

---

## Acceptance Criteria

1. `presentation.ts` calls `runToolUseLoop()` once per slide (not once per whole deck). Each loop creates one slide frame and ends.
2. Initial message for slide 1 includes: the presentation topic, the slide type (title/intro), the format size, and an instruction to establish the visual system (colors, fonts) that subsequent slides will follow.
3. After slide 1 is created, a `designSystem` summary object is extracted: `{ backgroundColor, accentColor, fontFamily, frameId }` derived from the tool calls made during slide 1's loop (inspect the `onToolCall` results).
4. Initial messages for slides 2+ include the `designSystem` summary as a consistency constraint.
5. Each slide's `onProgress` callback prepends "Slide N of M — " to the tool-call message (using the utility from FC-4).
6. Slide frames are created with the correct format dimensions (1920×1080 for 16:9, 1440×1080 for 4:3) via `create_frame` in the tool-use loop (AI calls it, not the mode).
7. Slides are positioned side-by-side on the canvas (40px gap between frames) — if the AI doesn't position them, the mode post-processes by calling `move_node` on each slide frame after the loop.
8. No `createDesignFromAnalysis()` calls in the Presentation mode execution path.
9. Works with all 3 providers.
10. Build clean: `cd figmento && npm run build`.

---

## Tasks / Subtasks

- [x] **Task 1: Read presentation.ts** — Map: slide loop structure, content schema, `updateProgress()`, existing prompt building for each slide type, how `createDesignFromAnalysis()` is called per slide.
- [x] **Task 2: Write `buildSlideInitialMessages(topic, slideContent, slideType, slideIndex, totalSlides, designSystem?)`** — Returns initial messages for a single slide's loop. Slide types: `'title'`, `'content'`, `'image'`, `'closing'`. DesignSystem is `null` for slide 1.
- [x] **Task 3: Implement `designSystem` extraction** — After slide 1's loop, walk the `onToolCall` call log to find: first `create_frame` backgroundColor, first `create_text` fontFamily, any accent color from `set_fill`. Build `{ backgroundColor, accentColor, fontFamily }`.
- [x] **Task 4: Write the per-slide slide loop orchestrator** — A function that:
  1. Iterates slide count
  2. Calls `runToolUseLoop` for each slide
  3. Extracts `designSystem` after slide 1
  4. Updates progress with slide-level + tool-level info (FC-4 utility)
  5. Post-processes slide positions if needed
- [x] **Task 5: Slide positioning** — After all slides complete, if the AI didn't position them with explicit x coordinates: call `move_node` to arrange frames in a row (gap 40px). Use `get_page_nodes` to find the created frames by name pattern.
- [ ] **Task 6: Test 3-slide and 5-slide decks** — Verify no timeouts, progress updates correctly, all slides created.
- [x] **Task 7: Build + test** (AC: 10).

---

## Dev Notes

**Slide types and their instruction emphasis:**
- `title`: Establish the visual identity. Dominant headline, minimal content, strong background.
- `content`: 3-5 bullet points or a key statement. Maintain visual system. Content area takes 60% of slide.
- `image`: Primarily visual. A full-bleed or large image with a caption/title overlay.
- `closing`: Thank you / CTA. Echo the title slide's visual treatment. Bold closing statement.

**DesignSystem extraction — simple heuristic:**
```typescript
interface SlideDesignSystem {
  backgroundColor: string; // from first create_frame fillColor
  accentColor: string;     // from first set_fill with a non-neutral color
  fontFamily: string;      // from first create_text fontFamily
}
```
Don't over-engineer this — it just needs to give the AI enough context to be consistent.

**Slide positioning:** The AI may or may not set `x` on the frames it creates. To guarantee positioning, the mode should:
1. Record each slide's frameId from the `onToolCall` result for `create_frame`
2. After all loops complete, call `sendCommandToSandbox('move_node', { nodeId, x: i * (slideWidth + 40), y: 0 })` for each frame

**Max iterations per slide:** 30 iterations is enough for a single slide. Set `maxIterations: 30` per loop call (vs 50 for full-session Chat mode).

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/presentation.ts` | Replace per-slide UIAnalysis flow with `runToolUseLoop` per slide. Add designSystem extraction. Add slide positioning post-process. |

---

## Validation

**TEST FC-5-A: 3-slide deck**
```
Topic: "Sustainable Fashion in 2026" — 3 slides, 16:9 format.
```
- [ ] All 3 slides created
- [ ] No timeout
- [ ] Slides positioned side-by-side
- [ ] Visual consistency across slides (same approximate color scheme)

**TEST FC-5-B: 5-slide deck**
```
Topic: "Q1 Business Review" — 5 slides, 16:9 format.
```
- [ ] All 5 slides created without timeout
- [ ] Progress updates show "Slide N of 5"

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - designSystem extraction handles missing fields gracefully (not all slides use all colors)
  - Slide positioning: no negative x coordinates, frames within page bounds
  - maxIterations: 30 per slide (not default 50)
  - No createDesignFromAnalysis remaining
```

---

## Dev Agent Record

**Agent Model Used:** claude-sonnet-4-6
**Implementation Date:** 2026-03-03

### File List

| File | Change |
|------|--------|
| `figmento/src/ui/presentation.ts` | MODIFIED — added pending-command bridge (sendPresentationCommand + resolvePresentationCommand); added SlideDesignSystem interface; added extractDesignSystem() with null guards for transparent/undefined/non-hex values and safe fallbacks; added getSlideType(), buildSlideInstruction(), buildSlideInitialMessages() (3-provider); replaced old analyzePresentationDesign pipeline in handleGeneratePresentation() with per-slide runToolUseLoop orchestrator; added slide positioning post-process via move_node |
| `figmento/src/ui/index.ts` | MODIFIED — imported resolvePresentationCommand; added 'presentation-' prefix routing in onCommandResult |

### Completion Notes

- `sendPresentationCommand()` / `resolvePresentationCommand()` mirror the screenshot.ts / text-layout.ts pattern with `presentation-` prefix cmdIds and 30s timeout.
- `extractDesignSystem()` walks the slide 1 tool call log. Guards against: empty string, `"transparent"`, non-hex-prefixed values for backgroundColor; near-grey colors (R≈G≈B within 30) skipped for accentColor. Fallback: `{ backgroundColor: '#FFFFFF', accentColor: '#000000', fontFamily: 'Inter' }` (per @po critical requirement).
- Slide types: `title` (slide 0), `closing` (last slide), `image` (every 3rd middle slide), `content` (all others).
- Cross-slide consistency injected into slides 2+ only when a field differs from the fallback — avoids injecting redundant "maintain Inter" or "maintain #FFFFFF".
- Progress: per-slide slice mapping — tool call percent (0-95%) scaled to the slide's share of 0-90% overall bar. Labels: "Slide N/M — [tool message]".
- `maxIterations: 30` per slide (vs 50 default for Chat).
- Slide frame IDs collected from `create_frame` tool call results; `move_node` called post-loop to guarantee side-by-side positioning at `i * (slideWidth + 40)` x=0.
- Positioning failures are non-critical (try/catch with continue) — slides are still created even if move_node fails.
- Old `analyzePresentationDesign`, `simulatePresentationProgress` calls, `fetchAllIcons`, `validateAndFixAnalysis` all removed from the main generation path.
- Build: ✅ clean — 15ms, zero errors (AC 10).
- Task 6 (live slide tests): deferred — requires plugin reload in Figma.

### Change Log

- 2026-03-03: FC-5 implemented by @dev (Dex). presentation.ts migrated to per-slide runToolUseLoop. index.ts updated with presentation- routing. Build clean.
- 2026-03-03: Live smoke test passed in Figma — per-slide tool-use loop confirmed working. Status → Done (@sm River).
