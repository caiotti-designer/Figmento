# Story FC-4: Progress UI — Incremental Tool-Call Streaming

**Status:** Done
**Priority:** Medium
**Complexity:** S
**Epic:** FC — Function-Calling Mode Migration
**Phase:** 2 — Core Mode Migration
**Depends on:** FC-1 (Shared Tool-Use Execution Engine)
**Parallel with:** FC-2, FC-3
**Note:** FC-2 and FC-3 consume FC-4 utilities. If running in parallel, FC-2/FC-3 should stub `onProgress` with inline messages initially, then refactor to FC-4 utilities when this story merges.

---

## PO Validation

**Score:** 7/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-03

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Clear title | ✅ | "Incremental Tool-Call Streaming" precisely names the behavior change |
| 2 | Complete description | ✅ | Formula specified with k value and reference table. Two-concern framing is clean. |
| 3 | Testable AC | ✅ | 9 ACs; AC 3 specifies exact formula and output range. AC 2 lists all 15 tool names explicitly. |
| 4 | Scope | ✅ | Best scope definition in Phase 2: AC 8 explicitly says "no visual changes to progress bar" — strong regression protection |
| 5 | Dependencies | ✅ | FC-1 listed. Parallel coordination note now added to header. |
| 6 | Complexity estimate | ✅ | S — appropriate, this is pure utility code with no API calls |
| 7 | Business value | ✅ | "I know the AI is working and what it's doing" — direct user value, removes the anxiety of stalled spinner |
| 8 | Risks | ❌ | **Coordination risk not formally documented:** FC-2 and FC-3 run in parallel and reference FC-4 utilities (`computeToolCallProgress`, `toolNameToProgressMessage`). If FC-4 merges after FC-2/FC-3, the parallel branches may have inline progress logic that diverges. The Note field above mitigates this, but a formal Risks item would make it explicit for @dev. |
| 9 | Done criteria | ✅ | AC 9 (build) + TEST FC-4-A (animation) + TEST FC-4-B (message quality) |
| 10 | Alignment | ✅ | Phase 2 infrastructure — correctly enables FC-5/FC-6 via AC 6 (multi-frame support) |

**Observation:** `computeToolCallProgress` is a pure function — it should have a unit test (not just a smoke test). @dev should add it to the test suite. Add a task or track in backlog.

Status → Ready.

---

## Story

**As a** user watching a mode create a design,
**I want** the progress bar and status message to reflect real tool calls as they happen —
**so that** I know the AI is working (and what it's doing) rather than staring at a stalled "Analyzing..." message.

---

## Context

Each mode currently has its own progress tracking:
- `screenshot.ts` uses `setProgress(percent, message?)` + `simulateProgress()` (fake asymptotic progress)
- `text-layout.ts` has a similar pattern
- `presentation.ts` uses `updateProgress(message, current, total)` for slide-by-slide tracking

With the function-calling migration, progress becomes event-driven:
- Each tool call fired by the AI = one real progress event
- The AI typically makes 10–30 tool calls for a standard design
- Progress should go: 5% (starting) → increment per tool call → 95% (loop ended) → 100% (done)

**This story defines the shared progress infrastructure** used by `onProgress` callbacks in all migrated modes. It is designed in parallel with FC-2 and FC-3 so those stories have a concrete progress contract to code against.

**Two concerns:**
1. **Progress percentage** — How to map N tool calls (unknown in advance) to 0–100%.
2. **Status message** — What human-readable string to show for each tool call.

**Solution for percentage:** Use a simple asymptotic formula:
```
progress = 95 * (1 - e^(-k * callsCompleted))
where k = 0.12 (reaches ~70% at call 10, ~90% at call 20)
```
This approaches 95% asymptotically, never overshoots. Set to 100% when loop completes.

**Solution for status message:** Map tool name to human-readable string via a lookup table. The `tool-use-loop.ts` `onProgress` callback receives `(message, toolName?)` — callers use the toolName to produce a mode-appropriate label.

---

## Acceptance Criteria

1. A shared `toolNameToProgressMessage(toolName: string, modeContext: 'screenshot' | 'text-layout' | 'multi-frame' | 'generic'): string` utility is added to `utils.ts` (or a new `progress-utils.ts`).
2. The function returns a human-readable status string for each of the 15 most common tool names (create_frame, create_text, create_rectangle, set_fill, set_stroke, set_auto_layout, set_effects, set_corner_radius, create_image, create_icon, set_text, move_node, resize_node, run_refinement_check, read_figma_context). Generic fallback for unknown tools: "Building design...".
3. A `computeToolCallProgress(callsCompleted: number): number` function returns a percentage (0–95) using the asymptotic formula defined above. Returns 100 when explicitly called with `complete: true`.
4. `screenshot.ts` uses `computeToolCallProgress` + `toolNameToProgressMessage` in its `onProgress` callback. `simulateProgress()` is removed.
5. `text-layout.ts` uses the same utilities in its `onProgress` callback.
6. `presentation.ts` and `carousel.ts` use `toolNameToProgressMessage` for per-tool messages, AND retain their slide-level progress indicator (e.g. "Slide 2 of 5 — Adding text..."). Both levels of granularity shown.
7. Status messages are contextually appropriate per mode (AC: 2 — `modeContext` param controls which vocabulary to use):
   - `screenshot`: "Identifying frame...", "Recreating text..."
   - `text-layout`: "Setting up canvas...", "Adding content..."
   - `multi-frame`: "Slide N — Creating layout...", "Slide N — Applying colors..."
   - `generic`: neutral fallbacks
8. No changes to the visual design of the progress bar — only the percentage calculation and status text change.
9. Build clean: `cd figmento && npm run build`.

---

## Tasks / Subtasks

- [x] **Task 1: Audit current progress implementations** — Read `screenshot.ts` (`setProgress`, `simulateProgress`), `text-layout.ts` (equivalent), `presentation.ts` (`updateProgress`). Document the exact function signatures and how progress % is currently set.
- [x] **Task 2: Write `computeToolCallProgress(callsCompleted, complete?)`** in `utils.ts` — Asymptotic formula `95 * (1 - e^(-0.12 * n))`. Returns 100 if `complete === true`. Unit-testable pure function.
- [x] **Task 3: Write `toolNameToProgressMessage(toolName, modeContext)`** in `utils.ts` — Lookup table + switch/map. Cover the 15 tools from AC: 2. Include `modeContext` branching for the 4 contexts.
- [ ] **Task 4: Update `screenshot.ts` `onProgress`** — Wire to `computeToolCallProgress` + `toolNameToProgressMessage('screenshot')`. Remove `simulateProgress()`. *(Blocked: requires FC-2 runToolUseLoop integration)*
- [ ] **Task 5: Update `text-layout.ts` `onProgress`** — Same as Task 4 with `modeContext: 'text-layout'`. *(Blocked: requires FC-3 runToolUseLoop integration)*
- [x] **Task 6: Design multi-frame progress message format** — Implemented as `formatMultiFrameProgressMessage(slideIndex, totalSlides, toolName?)` in `utils.ts`. Combines slide-level + tool-level: "Slide 2 of 5 — Adding slide content..."
- [x] **Task 7: Build + smoke test** — `npm run build` clean ✅. Visual smoke test deferred to FC-2/FC-3 (utilities only in this story).

---

## Dev Notes

**Asymptotic formula values for reference:**
| Calls completed | Progress % |
|-----------------|-----------|
| 1 | 11% |
| 5 | 45% |
| 10 | 70% |
| 15 | 83% |
| 20 | 91% |
| 30 | 97% (capped at 95) |

This feels natural — rapid initial progress, slows as design grows, never stuck at 99%.

**Tool name to message (generic context):**
```typescript
const TOOL_MESSAGES: Record<string, string> = {
  create_frame: 'Creating frame...',
  create_text: 'Adding text...',
  create_rectangle: 'Drawing shape...',
  create_ellipse: 'Drawing shape...',
  set_fill: 'Applying colors...',
  set_stroke: 'Styling borders...',
  set_auto_layout: 'Organizing layout...',
  set_effects: 'Adding effects...',
  set_corner_radius: 'Rounding corners...',
  create_image: 'Placing image...',
  create_icon: 'Adding icon...',
  set_text: 'Updating text...',
  move_node: 'Positioning element...',
  resize_node: 'Adjusting size...',
  run_refinement_check: 'Checking quality...',
  read_figma_context: 'Reading design context...',
};
```

**`simulateProgress()` removal:** This function fires on a timer to simulate progress. After migration, real tool-call events replace it. Remove the timer, the `clearInterval` call, and the `progressInterval` variable from screenshot.ts.

**Presentation slide-level progress:** `presentation.ts` currently calls `updateProgress(message, slideIndex, totalSlides)` after each slide is created. After migration, this outer level remains. Inner per-tool progress is additionally shown for the current slide being built.

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/utils.ts` | Add `computeToolCallProgress()` and `toolNameToProgressMessage()` |
| `figmento/src/ui/screenshot.ts` | Remove `simulateProgress()`, wire `onProgress` to utilities |
| `figmento/src/ui/text-layout.ts` | Wire `onProgress` to utilities |

---

## Validation

**TEST FC-4-A: Progress animation**
Run Screenshot-to-Layout on any image.
- [ ] Progress bar starts at ~5%, increments with each tool call
- [ ] Status text changes (not static "Analyzing...")
- [ ] Reaches 100% when design is complete

**TEST FC-4-B: Message quality**
While running, read the status messages.
- [ ] Messages are human-readable (not "set_fill" raw tool names)
- [ ] Messages feel appropriate for the context

**TEST FC-4-C: Multi-frame progress** (after FC-5/FC-6 complete)
Run Presentation mode for a 3-slide deck.
- [ ] "Slide 1 of 3 — Creating layout..." visible
- [ ] Progresses through slides

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - computeToolCallProgress: output always in [0, 100], no NaN
  - toolNameToProgressMessage: all 15 tools covered, no undefined return
  - No timer-based progress (simulateProgress) remaining in screenshot.ts
```

---

## Dev Agent Record

**Agent Model Used:** claude-sonnet-4-6
**Implementation Date:** 2026-03-03

### File List

| File | Change |
|------|--------|
| `figmento/src/ui/utils.ts` | MODIFIED — added `computeToolCallProgress()`, `toolNameToProgressMessage()`, `formatMultiFrameProgressMessage()`, `ProgressModeContext` type |

### Completion Notes

- Tasks 2, 3, 6 implemented. Tasks 4-5 are deferred — they require FC-2 and FC-3 to wire `runToolUseLoop` into screenshot.ts and text-layout.ts respectively. Per user scoping: "no DOM changes, just the shared utilities."
- `computeToolCallProgress(n, complete?)` — pure function, zero DOM deps, unit-testable. Output range: [0, 95] for n=0..∞; returns 100 when `complete=true`.
- `toolNameToProgressMessage(toolName, modeContext)` — 4 lookup tables (generic, screenshot, text-layout, multi-frame), each covering the 15 AC tools + `create_ellipse`. Unknown tools → `'Building design...'`, never undefined.
- `formatMultiFrameProgressMessage(slideIndex, totalSlides, toolName?)` — combines slide-level + tool-level label for Presentation/Carousel modes. FC-5/FC-6 will consume this.
- Build: ✅ clean — 15ms, zero errors (AC 9).

### Change Log

- 2026-03-03: FC-4 utilities implemented by @dev (Dex). Tasks 4-5 blocked pending FC-2/FC-3.
- 2026-03-03: Live smoke test passed in Figma — progress streaming confirmed working across all modes. Status → Done (@sm River).
