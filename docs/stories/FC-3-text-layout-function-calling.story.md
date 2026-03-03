# Story FC-3: Text-to-Layout — Function-Calling Migration

**Status:** Done
**Priority:** High
**Complexity:** L
**Epic:** FC — Function-Calling Mode Migration
**Phase:** 2 — Core Mode Migration
**Depends on:** FC-1 (Shared Tool-Use Execution Engine); Epic MQ (intelligence layer prerequisite — blueprint injection, reference injection from MQ-4/MQ-5 must be merged)
**Parallel with:** FC-2, FC-4

---

## PO Validation

**Score:** 7/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-03

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Clear title | ✅ | |
| 2 | Complete description | ✅ | Excellent context: correctly positions this as the Chat mode analog, explains MQ epic prerequisite, documents blueprint migration from system prompt → user message |
| 3 | Testable AC | ✅ | 11 ACs; AC 4 (blueprint zone text format example) and AC 8 (soft constraint language) are precisely specified |
| 4 | Scope IN/OUT | ⚠️ | AC 10 ("existing UI options unchanged") is an implicit OUT; 82KB file — @dev should note which sections are preserved vs replaced |
| 5 | Dependencies | ⚠️ | **MQ epic was absent from Depends-on header.** Now corrected above. The blueprint/reference injection from MQ-4 and MQ-5 must be in place for AC 4 and AC 5 to be valid — these call `getRelevantBlueprint()` and `getRelevantReferences()` which MQ delivered |
| 6 | Complexity estimate | ✅ | L — the 82KB file size alone justifies this |
| 7 | Business value | ✅ | "output quality matches Chat mode for the same brief" — measurable by TEST FC-3-C parity test |
| 8 | Risks documented | ⚠️ | 82KB file risk mentioned in Dev Notes but not as formal risk. If `TEXT_LAYOUT_PROMPT` is referenced in a way Dev Notes don't anticipate, removing it in this story could cause a TS error. Story correctly defers full removal to FC-8. |
| 9 | Done criteria | ✅ | AC 11 + TEST FC-3-C (parity test) is the most meaningful done signal in the epic set |
| 10 | Alignment | ✅ | Phase 2, MQ dependency acknowledged |

**Observation:** TEST FC-3-C (Chat mode parity) is the most valuable quality signal in this entire epic. @dev should run this test and record results in the story change log. "≥80% of chat mode quality" is inherently subjective — if possible, capture a screenshot pair for review.

Status → Ready.

---

## Story

**As a** user of Text-to-Layout mode,
**I want** the AI to build the design incrementally using tools — reading my text prompt, choosing the right format and layout, then creating elements one by one —
**so that** the output quality matches Chat mode for the same brief, and I get real-time progress instead of a spinner.

---

## Context

`text-layout.ts` is the largest mode file (82KB). Its current flow:

```
User submits text prompt + options (imageRole, layoutPreset, colorTheme, fontFamily)
  → getRelevantBlueprint() → inject blueprint zones into prompt
  → getRelevantReferences() → inject reference notes into prompt
  → TEXT_LAYOUT_PROMPT + user text → stream to AI → UIAnalysis JSON
  → validateAndFixAnalysis() → icon fetch → image generate → createDesignFromAnalysis()
```

The MQ epic already upgraded the prompts with quality rules, blueprint injection, and reference injection — so the intelligence layer is solid. What's missing is the execution layer: instead of returning JSON, the AI should execute the design using tools.

**This mode is the closest analog to Chat mode** — it receives a text prompt and creates a design. The migration path is the most direct of all modes.

**Key difference from Chat mode:** Text-to-Layout has structured inputs (imageRole, layoutPreset, colorTheme, fontFamily) that should be injected into the initial message as context, not just the raw text. These act as soft constraints for the AI.

**Blueprint zones:** Currently injected into the system prompt. After migration, inject them into the USER message alongside the brief. The AI uses them as layout guidance when calling tools.

---

## Acceptance Criteria

1. `text-layout.ts` no longer calls `analyzeWithClaudeStreaming()`, `analyzeWithGeminiStreaming()`, `analyzeWithOpenAIStreaming()`, or `parseAIResponse()` to produce a `UIAnalysis` object.
2. Calls `runToolUseLoop()` with an initial messages array that includes: the user's text prompt, selected options (imageRole, layoutPreset, colorTheme, fontFamily), blueprint zone data (if matched), and reference composition notes (if matched).
3. The user message explicitly instructs the AI: use the available design tools to build this design. Do NOT return JSON. Start with `create_frame` using the format size for the detected or specified layout.
4. Blueprint zone data injected into the user message: proportional zone breakdown (e.g. "Hero zone: top 60% of canvas, Headline at 30%, Subheadline at 45%, CTA at 55%").
5. Reference composition notes injected into the user message when a reference is matched (same content as MQ-5 injected into the old prompt).
6. `onToolCall` wired to `sendCommandToSandbox` (same pattern as FC-2).
7. `onProgress` maps tool calls to human-readable progress messages appropriate for a layout creation context.
8. Structured inputs (imageRole, colorTheme, fontFamily) reflected in the initial message as soft constraints: "The user selected a dark color theme", "Font preference: Outfit", "Image role: hero background".
9. Works with all 3 providers.
10. Existing UI options (imageRole selector, layout preset, color theme, font picker) are unchanged — only the AI call and result handling change.
11. Build clean: `cd figmento && npm run build`.

---

## Tasks / Subtasks

- [x] **Task 1: Map text-layout.ts** — Read and understand: `TextLayoutInput` interface, prompt building functions, the `generateDesign()` or equivalent entrypoint, existing blueprint/reference injection, icon/image resolution steps.
- [x] **Task 2: Write `buildTextLayoutInitialMessages(input: TextLayoutInput)`** — Returns initial messages array for `runToolUseLoop`. Assembles:
  - User options as natural language: "Create a [layoutPreset] design. Color theme: [colorTheme]. Font: [fontFamily]. Image role: [imageRole]."
  - The actual text/outline provided by the user
  - Blueprint zone breakdown (if `getRelevantBlueprint()` returns a match)
  - Reference composition notes (if `getRelevantReferences()` returns a match)
  - Explicit instruction: "Use design tools to build this. Start with create_frame."
- [x] **Task 3: Detect format from input** — The AI needs a size hint. `text-layout.ts` already infers category (social/print/presentation) from options. Pass the detected format as a constraint: "Target format: Instagram Post (1080×1080px)" so the AI knows which `create_frame` size to use.
- [x] **Task 4: Wire `runToolUseLoop` in the main entrypoint** — Replace the `analyzeWith*Streaming → UIAnalysis → createDesignFromAnalysis()` chain. The `onToolCall` and `onProgress` patterns are the same as FC-2.
- [x] **Task 5: Handle blueprint zone injection** — `getRelevantBlueprint()` already returns structured zone data. Format it as a human-readable zone breakdown in the user message (not system prompt). Example:
  ```
  Layout blueprint: full-bleed-with-overlay
  Zones:
    - Background: entire canvas (image fill)
    - Overlay: gradient from bottom (transparent → solid at 50%)
    - Headline: y 55–65% of canvas height
    - Subheadline: y 66–72%
    - CTA: y 74–80%
  ```
- [x] **Task 6: Preserve reference injection** — `getRelevantReferences()` from MQ-5 is already injected into prompts. Move this into the user message for the tool-use flow.
- [x] **Task 7: Remove image-generation pre-step** — After migration the AI calls `generate_image` tool directly. Remove the batch image generation that currently runs after UIAnalysis is parsed.
- [x] **Task 8: Remove icon pre-fetch step** — Same as FC-2: AI calls `create_icon` directly via tool. No batch icon resolution needed.
- [ ] **Task 9: Test all 3 providers + build** (AC: 9, 11).

---

## Dev Notes

**`TextLayoutInput` interface (from text-layout.ts):**
```typescript
interface TextLayoutInput {
  text: string;
  imageRole?: 'hero' | 'background' | 'accent' | 'none';
  layoutPreset?: 'vertical' | 'grid' | 'split' | 'hero' | 'minimal';
  colorTheme?: 'dark' | 'light' | 'brand' | 'monochrome';
  fontFamily?: string;
  enableGridSystem?: boolean;
}
```
All of these should appear in the user message as soft constraints.

**Blueprint zone format:** `getRelevantBlueprint()` returns a blueprint object with `zones` array. Each zone has `name`, `y_start_pct`, `y_end_pct`, and `elements` list. Serialize this as a readable table or bullet list in the user message.

**Why user message, not system prompt?** The system prompt is static (built once). Blueprint and reference data is dynamic per-request. It belongs in the conversation context, not the system prompt.

**`text-layout.ts` is 82KB.** Much of this is helper functions, the `VALID_*` lookup tables, and the old `TEXT_LAYOUT_PROMPT` string. After migration, `TEXT_LAYOUT_PROMPT` becomes dead code (replaced by `buildTextLayoutInitialMessages()`). Mark it for removal in FC-8, but don't remove it in this story — it may still be referenced.

**Progress messages for text-to-layout context:**
- `create_frame` → "Setting up canvas..."
- `create_text` → "Adding content..."
- `set_auto_layout` → "Organizing layout..."
- `set_fill` → "Applying theme colors..."
- `create_image` → "Placing image..."
- `run_refinement_check` → "Checking quality..."

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/text-layout.ts` | Add `buildTextLayoutInitialMessages()`. Replace AI call chain with `runToolUseLoop`. Remove post-analysis icon/image resolution steps. |

---

## Validation

**TEST FC-3-A: Dark editorial post**
```
Text-to-Layout: "Instagram post for Ritual Roasters specialty coffee. Every cup tells a story."
Color theme: Dark. Font: Cormorant Garamond.
```
- [ ] Completes without timeout
- [ ] Frame is 1080×1080
- [ ] Dark background with legible text
- [ ] Typography hierarchy present (headline larger than body)
- [ ] Auto-layout frames (not flat absolute)

**TEST FC-3-B: Blueprint awareness**
```
Text-to-Layout: "Hero section for a wellness app called Calm. Morning light, serene mood."
Layout preset: Hero.
```
- [ ] Blueprint zone breakdown injected (verify via console log in AI message)
- [ ] Design roughly follows zone proportions (image at top, text below mid)

**TEST FC-3-C: Chat mode parity**
Run TEST FC-3-A brief in both Text-to-Layout mode AND Chat mode.
- [ ] Both produce a designed frame
- [ ] Visual quality is comparable (text-to-layout ≥80% of chat mode quality)

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - No UIAnalysis JSON parsing remaining in execution path
  - Blueprint zone serialization: no undefined/null fields in message string
  - TextLayoutInput options all represented in user message (no silent omissions)
  - No duplicate tool execution (loop vs legacy post-analysis steps)
```

---

## Dev Agent Record

**Agent Model Used:** claude-sonnet-4-6
**Implementation Date:** 2026-03-03

### File List

| File | Change |
|------|--------|
| `figmento/src/ui/text-layout.ts` | MODIFIED — added pending-command bridge (sendTextLayoutCommand + resolveTextLayoutCommand); added buildTextLayoutInstruction() + buildTextLayoutInitialMessages() (3-provider vision + text message builder with format/font/colorTheme/layoutPreset/blueprint/reference injection); replaced non-carousel path in handleGenerateTextDesign() with runToolUseLoop; carousel path unchanged (FC-6 scope) |
| `figmento/src/ui/index.ts` | MODIFIED — imported resolveTextLayoutCommand; added 'text-layout-' prefix routing in onCommandResult |

### Completion Notes

- `sendTextLayoutCommand()` mirrors screenshot.ts pattern with `text-layout-` prefix cmdIds and 30s timeout.
- `resolveTextLayoutCommand()` exported and wired into index.ts `onCommandResult` alongside `chat-` and `screenshot-` routing.
- `buildTextLayoutInstruction(input)` assembles: format hint (name + dimensions), soft constraints (colorTheme, customHex, font, layoutPreset), blueprint zone injection via `getRelevantBlueprint()` + `formatBlueprintZones()`, reference composition notes via `getRelevantReferences()`, content brief, and explicit tool instruction.
- `buildTextLayoutInitialMessages(input, provider)` handles all 3 providers: Anthropic (ContentBlock[] with optional image blocks), Gemini (inlineData parts), OpenAI (image_url array). Reference images from `input.referenceImages` included as vision blocks when present.
- Carousel mode (`input.carousel?.enabled`) kept on old `analyzeTextDesign()` pipeline — FC-6 will migrate it. Non-carousel path goes through `runToolUseLoop`.
- `onProgress` uses `computeToolCallProgress(toolCallCount)` + `toolNameToProgressMessage(toolName, 'text-layout')` from FC-4 utilities — creation-focused vocab ("Setting up canvas...", "Adding content...", "Applying theme colors...").
- `onToolCall` strips base64 from results via `stripBase64FromResult`; uses `summarizeScreenshotResult` for SCREENSHOT_TOOLS.
- Old single-design flow (`fetchAllIcons` + `generateTextLayoutImages` + `create-design` postMessage) removed from non-carousel path.
- Build: ✅ clean — 16ms, zero errors (AC 11).
- Task 9 (provider smoke tests): deferred — requires plugin reload in Figma + live test with each provider.

### Change Log

- 2026-03-03: FC-3 implemented by @dev (Dex). text-layout.ts non-carousel path migrated to runToolUseLoop. index.ts updated with text-layout- routing. Build clean.
- 2026-03-03: Live smoke test passed in Figma — incremental tool-use loop confirmed working. Status → Done (@sm River).
