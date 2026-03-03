# Story FC-2: Screenshot-to-Layout — Function-Calling Migration

**Status:** Done
**Priority:** High
**Complexity:** L
**Epic:** FC — Function-Calling Mode Migration
**Phase:** 2 — Core Mode Migration
**Depends on:** FC-1 (Shared Tool-Use Execution Engine)
**Parallel with:** FC-3, FC-4

---

## PO Validation

**Score:** 7/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-03

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Clear title | ✅ | Mode name + migration type — unambiguous |
| 2 | Complete description | ✅ | Before/after flow clearly contrasted, 4 problems enumerated with root cause |
| 3 | Testable AC | ✅ | 10 ACs; AC 9 specifies exact Anthropic JSON structure (highest specificity in the epic set) |
| 4 | Scope IN/OUT | ⚠️ | AC 8 ("crop logic unchanged") is an implicit OUT but it's buried in ACs; no OUT block |
| 5 | Dependencies | ✅ | FC-1 + parallel coordination with FC-3/FC-4 stated |
| 6 | Complexity estimate | ✅ | L — appropriate given 3-provider vision format branching |
| 7 | Business value | ✅ | Stated clearly: "complex screenshots no longer cause timeouts" |
| 8 | Risks documented | ⚠️ | Dev Notes flag the `sendCommandToSandbox` / pending-command listener pattern as needing adoption from chat.ts — this is the highest implementation risk (non-trivial wiring) but not called out as a risk explicitly |
| 9 | Done criteria | ✅ | Build clean (AC 10) + TEST FC-2-A/B/C covering basic, complex, and provider parity |
| 10 | Alignment | ✅ | Highest-impact Phase 2 story, correctly sequenced after FC-1 |

**Observations:**
- `sendCommandToSandbox` pending-command listener pattern: @dev must study chat.ts carefully before implementing `onToolCall`. This is not a simple function call — it requires adopting chat.ts's async command routing. Recommend Task 1 explicitly includes mapping this pattern.
- FC-4 runs in parallel but defines the `onProgress` utilities this story uses. @dev should stub `onProgress` with inline messages and refactor to FC-4 utilities when that story merges, OR implement FC-4 first and treat it as a soft pre-requisite.

Status → Ready.

---

## Story

**As a** user of Screenshot-to-Layout mode,
**I want** the AI to build the design tool-by-tool after analyzing my screenshot — just like Chat mode does —
**so that** complex screenshots no longer cause timeouts, and the output matches the quality of designs built through Chat mode.

---

## Context

The current `screenshot.ts` flow:

```
User pastes image
  → getCroppedImage() → base64
  → analyzeImageStreaming() → streams UIAnalysis JSON
  → createDesignFromAnalysis() (sandbox) → creates all elements at once
```

**Problems with this flow:**
1. `analyzeImageStreaming()` asks the AI to return a complete JSON blob describing every element — on complex screenshots this exceeds output token limits → timeout → blank canvas.
2. The AI has no feedback during creation. If a frame is the wrong size, or text overlaps, it cannot fix it.
3. No access to `run_refinement_check`, variable binding, or any tool — because tools are never offered to the model.
4. Progress bar reaches 95% and stalls while JSON is being parsed.

**New flow:**

```
User pastes image
  → getCroppedImage() → base64
  → buildScreenshotMessages(imageBase64) → initial messages with vision content
  → runToolUseLoop({messages, tools: FIGMENTO_TOOLS, onToolCall: sandboxExecute, onProgress: setProgress})
     AI receives screenshot → calls create_frame → create_text → set_fill → ... → run_refinement_check
  → Loop ends when AI has no more tool calls
```

The AI prompt (via system-prompt.ts + a screenshot-specific user message) tells the AI:
1. Study the screenshot carefully — identify the layout structure, colors, typography, key elements.
2. Recreate the design using the available tools. Start with the root frame, then add elements top-down.
3. Aim to capture the visual hierarchy and composition, not pixel-perfect copy.
4. End with `run_refinement_check` if 5+ elements created.

---

## Acceptance Criteria

1. `screenshot.ts` no longer calls `analyzeImageStreaming()` or `parseAIResponse()` to produce a `UIAnalysis` JSON object during the standard creation flow.
2. `screenshot.ts` calls `runToolUseLoop()` from `tool-use-loop.ts` with the screenshot as a vision content block in the initial messages.
3. The initial user message to the AI includes explicit instruction: analyze the screenshot and recreate it using the available design tools. Do NOT return JSON — call tools directly.
4. `onToolCall` callback in the loop calls `sendCommandToSandbox(name, args)` and awaits the result (same mechanism used by chat.ts).
5. `onProgress` maps to `setProgress()` in screenshot.ts — progress messages say "Creating frame...", "Adding text...", "Applying colors..." based on which tool is being called.
6. No `createDesignFromAnalysis()` call remains in the screenshot.ts execution path after migration.
7. Works with all 3 providers: Anthropic (vision), Gemini (vision), OpenAI (vision). Each provider's vision content block format is handled correctly in the initial message builder.
8. Crop and compression logic in `screenshot.ts` unchanged — only the AI call + result handling changes.
9. On Anthropic: screenshot sent as `{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } }` in the user content block.
10. Build clean: `cd figmento && npm run build`.

---

## Tasks / Subtasks

- [x] **Task 1: Read screenshot.ts** — Understand the full flow: `startProcessing()`, `analyzeImageStreaming()`, `simulateProgress()`, `setProgress()`, `sendCommandToSandbox()`. Map which parts stay, which parts are replaced.
- [x] **Task 2: Write `buildScreenshotInitialMessages(imageBase64, provider)`** — Returns the initial messages array for `runToolUseLoop`. For Anthropic: `[{ role: 'user', content: [imageBlock, textBlock] }]`. For Gemini/OpenAI: equivalent vision format. The text block is the screenshot analysis instruction prompt.
- [x] **Task 3: Write screenshot analysis instruction prompt** — The user message text that tells the AI what to do with the screenshot. Key instructions: analyze layout + colors + typography → recreate using tools → top-down creation order → end with run_refinement_check. Must NOT say "return JSON".
- [x] **Task 4: Wire up `runToolUseLoop` in `startProcessing()`** — Replace the `analyzeImageStreaming() → UIAnalysis → createDesignFromAnalysis()` call chain with `runToolUseLoop({ messages, ..., onToolCall, onProgress })`.
- [x] **Task 5: Implement `onToolCall` for screenshot** — Calls `sendScreenshotCommand(name, args)`, returns result. Strips large binary fields from result before returning to loop (keep context window small). Pattern mirrors `buildToolCallHandler()` in chat.ts.
- [x] **Task 6: Implement `onProgress` mapping** — Uses `computeToolCallProgress` + `toolNameToProgressMessage('screenshot')` from FC-4 utilities. Fidelity-focused vocab ("Recreating...", "Identifying...", "Matching...").
- [x] **Task 7: Handle icon fetching** — Removed `fetchAllIcons()` batch-fetch step. AI calls `create_icon` directly via `onToolCall` → sandbox handles it.
- [ ] **Task 8: Test all 3 providers** — Verify Anthropic vision format, Gemini vision format, OpenAI vision format each produce tool calls (not empty responses or JSON text).
- [x] **Task 9: Build + test** (AC: 10).

---

## Dev Notes

**Vision content block formats by provider:**

```typescript
// Anthropic
{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } }

// Gemini
{ inlineData: { mimeType: "image/jpeg", data: base64 } }

// OpenAI
{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
```

These formats differ per provider — `buildScreenshotInitialMessages()` must branch on provider.

**System prompt for screenshot mode:** Use `buildSystemPrompt()` from `system-prompt.ts` — same as Chat mode. No screenshot-specific system prompt needed; the analysis instruction goes in the USER message.

**`sendCommandToSandbox` in screenshot.ts:** Currently used for `create-design`. After migration it's used for individual tool calls. This function already exists (look at how chat.ts does it via `pendingChatCommands`). Screenshot.ts must wire up the same pending-command response listener pattern.

**What to do with `simulateProgress()`:** Remove or disable during the tool-use loop — `onProgress` provides real progress signals now. The fake asymptotic progress simulation is no longer needed.

**Image generation:** Current flow fetches Gemini-generated images for `<IMAGE>` placeholders in UIAnalysis. After migration, the AI calls `generate_image` tool directly if it needs a contextual image. No pre-generation step needed — the loop handles it via `onToolCall`.

**Error handling:** If `runToolUseLoop` throws (API error, network timeout), show the existing error UI in screenshot.ts. No behavior change for error states.

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/screenshot.ts` | Replace `analyzeImageStreaming` call chain with `runToolUseLoop`. Add `buildScreenshotInitialMessages()`. Update `onProgress` mapping. |
| `figmento/src/ui/tool-use-loop.ts` | No changes — only consuming it. |

---

## Validation

**TEST FC-2-A: Basic screenshot**
Take a screenshot of any simple webpage (e.g. a landing page hero section). Drop into Screenshot-to-Layout mode.
- [ ] Completes without timeout
- [ ] Progress bar shows tool-call messages (not "Analyzing...")
- [ ] A designed frame appears in Figma
- [ ] Frame has auto-layout (not flat absolute positioning)

**TEST FC-2-B: Complex screenshot**
Take a screenshot of a UI with 10+ elements (navbar, hero, cards, footer).
- [ ] Completes without timeout (<90s)
- [ ] AI makes ≥8 tool calls
- [ ] Design reflects the layout structure (hero area, multiple sections)

**TEST FC-2-C: Provider parity**
Run TEST FC-2-A with Claude, Gemini, OpenAI (switch provider in Settings).
- [ ] All 3 complete
- [ ] All 3 produce a designed frame

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - Vision content block format correctness per provider (base64 encoding, MIME type)
  - No UIAnalysis JSON parsing remaining in the execution path
  - No orphaned analyzeImageStreaming() calls
  - sendCommandToSandbox response handling: awaits correctly, no race conditions
```

---

## Dev Agent Record

**Agent Model Used:** claude-sonnet-4-6
**Implementation Date:** 2026-03-03

### File List

| File | Change |
|------|--------|
| `figmento/src/ui/screenshot.ts` | MODIFIED — replaced analyzeImageStreaming pipeline with runToolUseLoop; added sendScreenshotCommand + resolveScreenshotCommand (pending-command pattern); added buildScreenshotInitialMessages() (3-provider vision blocks); added SCREENSHOT_INSTRUCTION prompt; wired onProgress to FC-4 utilities; removed simulateProgress(), fetchAllIcons(), generateImagesForPlaceholders() |
| `figmento/src/ui/index.ts` | MODIFIED — imported resolveScreenshotCommand; added 'screenshot-' prefix routing in onCommandResult |

### Completion Notes

- `sendScreenshotCommand()` mirrors chat.ts `sendCommandToSandbox` with `screenshot-` prefix cmdIds and 30s timeout. Routes through the same `execute-command` postMessage channel.
- `resolveScreenshotCommand()` exported, wired into index.ts `onCommandResult` alongside the existing `chat-` routing.
- `buildScreenshotInitialMessages(imageBase64, provider)` handles all 3 providers: Anthropic base64 image block, Gemini inlineData, OpenAI image_url. MIME type extracted from data URL prefix.
- `SCREENSHOT_INSTRUCTION` tells the AI to analyze and recreate without returning JSON.
- `onProgress` uses `computeToolCallProgress(toolCallCount)` + `toolNameToProgressMessage(toolName, 'screenshot')` from FC-4 utilities — fidelity vocabulary ("Recreating...", "Identifying...", "Matching...").
- `onToolCall` strips base64 from results via `stripBase64FromResult` (same as chat.ts) to keep context window small.
- `simulateProgress()` removed. `stopSimulation()` retained (used by `cancelProcessing()`).
- `analyzeImageStreaming`, `fetchAllIcons`, `generateImagesForPlaceholders`, `getCachedResponse`, `setCachedResponse`, `generateCacheKey`, `designSettings` — all removed from screenshot.ts.
- Completion flow: after `runToolUseLoop` returns → `setProgress(100, 'Complete!')` → `showSuccess()`. No longer depends on sandbox `progress` messages.
- Build: ✅ clean — 15ms, zero errors (AC 10).
- Task 8 (provider smoke tests): deferred — requires plugin reload in Figma + live image test with each provider.

### Change Log

- 2026-03-03: FC-2 implemented by @dev (Dex). screenshot.ts migrated to runToolUseLoop. index.ts updated with screenshot- routing. Build clean.
- 2026-03-03: Live smoke test passed in Figma — incremental tool-use loop confirmed working. Status → Done (@sm River).
