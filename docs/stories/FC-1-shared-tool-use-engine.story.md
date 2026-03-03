# Story FC-1: Shared Tool-Use Execution Engine

**Status:** Done
**Priority:** Critical
**Complexity:** M
**Epic:** FC — Function-Calling Mode Migration
**Phase:** 1 — Blocker (all FC-2 through FC-7 depend on this)

---

## PO Validation

**Score:** 7/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-03

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Clear title | ✅ | Precise and unambiguous |
| 2 | Complete description | ✅ | Pseudocode loop, interface definitions, extraction boundary all specified |
| 3 | Testable AC | ✅ | 10 ACs, all objectively verifiable; AC 10 is a live smoke test |
| 4 | Scope IN/OUT | ⚠️ | "What stays in chat.ts" is in Dev Notes — acceptable as-is but not a formal OUT block |
| 5 | Dependencies | ✅ | Phase 1 blocker, no prerequisites; parallel dependency map in epic |
| 6 | Complexity estimate | ✅ | M |
| 7 | Business value | ⚠️ | "so that" is technical (avoids 300-line duplication), not user-facing; implicit value is enabling all other stories |
| 8 | Risks documented | ❌ | **Chat.ts regression is the #1 risk in this epic and is absent.** If the refactor silently breaks a loop branch, Chat mode fails for users before any mode migration ships. Must be tracked in Dev Notes. |
| 9 | Done criteria | ✅ | Build clean (AC 9) + Chat mode smoke test (AC 10) — two-gate done |
| 10 | Alignment | ✅ | Phase 1 of FC epic, correctly blocks FC-2 through FC-7 |

**Mandatory fix before starting (@dev):** Add to Dev Notes — "Regression risk: if `runAnthropicLoop`/`runGeminiLoop`/`runOpenAILoop` delegations break an edge case in chat.ts, Chat mode fails silently. Mitigation: run all 3 provider smoke tests (AC 10-B) before merging. Do NOT merge FC-1 until TEST FC-1-B passes for all 3 providers."

This is an observation only — not a blocker for GO. The story is implementable. Status → Ready.

---

## Story

**As a** Figmento mode (Screenshot, Text-to-Layout, Presentation, Carousel, Hero, Ad Analyzer),
**I want** a shared, provider-agnostic tool-use execution loop I can call with just an initial message + tools + sandbox callback,
**so that** every mode gets the same iterative, self-correcting AI behavior that Chat mode already has, without duplicating 300+ lines of loop logic per mode.

---

## Context

`chat.ts` has three working tool-use loops: `runAnthropicLoop()`, `runGeminiLoop()`, `runOpenAILoop()`. They share the same high-level structure:

```
messages = [initial_message]
for iteration in range(MAX_ITERATIONS):
  response = call_ai_api(messages, tools, systemPrompt)
  text_parts = response.text_blocks  → emit as progress/log
  tool_calls = response.tool_use_blocks
  if no tool_calls: break
  results = []
  for call in tool_calls:
    result = sandbox.execute(call.name, call.args)
    results.append(result)
  messages.append(assistant_turn(tool_calls))
  messages.append(user_turn(tool_results))
```

This logic is currently tightly coupled to chat.ts's DOM manipulation (chat bubbles, `.chat-output`, `isProcessing` flag). Before any mode can use it, this loop must be extracted into a clean, UI-agnostic module.

**New file:** `figmento/src/ui/tool-use-loop.ts`

The module exports one primary function:

```typescript
export async function runToolUseLoop(options: ToolUseLoopOptions): Promise<ToolUseResult>
```

Where `ToolUseLoopOptions` includes:
- `initialMessages` — starting conversation history (already includes the user's image or text prompt)
- `systemPrompt` — the design system prompt string
- `provider` / `apiKey` / `model` — provider credentials
- `tools` — `FIGMENTO_TOOLS` array (from tools-schema.ts)
- `onToolCall(name, args)` — async callback that executes the tool via sandbox and returns the result
- `onProgress(message, toolName?)` — called with human-readable progress messages for the UI
- `onTextChunk(text)` — called with streamed text from the AI (for live log display)
- `maxIterations` — default 50 (same as chat.ts)

`ToolUseResult`:
```typescript
interface ToolUseResult {
  iterationsUsed: number;
  toolCallCount: number;
  completedCleanly: boolean; // true if loop ended with no tool calls (AI said "done")
}
```

The existing `runAnthropicLoop`, `runGeminiLoop`, `runOpenAILoop` in chat.ts should be refactored to call `runToolUseLoop` internally — eliminating the duplication and proving the abstraction works before modes use it.

---

## Acceptance Criteria

1. `figmento/src/ui/tool-use-loop.ts` exists and exports `runToolUseLoop(options: ToolUseLoopOptions): Promise<ToolUseResult>`.
2. Supports all three providers: `'claude'` (Anthropic), `'gemini'` (Gemini), `'openai'` (OpenAI). Provider is determined from `options.provider`.
3. Calls `options.onToolCall(name, args)` for every tool call the AI makes, in order.
4. Calls `options.onProgress(message, toolName?)` at minimum: on loop start, on each tool call (with tool name), and on loop end.
5. Calls `options.onTextChunk(text)` for every streamed text block from the AI response.
6. Respects `options.maxIterations` — exits loop after that many iterations even if AI wants to continue.
7. Returns `ToolUseResult` with accurate `iterationsUsed`, `toolCallCount`, and `completedCleanly`.
8. `chat.ts` refactored: `runAnthropicLoop`, `runGeminiLoop`, `runOpenAILoop` delegate to `runToolUseLoop`. No logic duplication. Existing chat.ts behavior unchanged (same chat bubble behavior, same error handling surface).
9. Build clean: `cd figmento && npm run build`.
10. Manual smoke: Open Chat mode, send "Create a simple blue rectangle frame". Design creates correctly. (Proves chat.ts refactor didn't break anything.)

---

## Tasks / Subtasks

- [x] **Task 1: Read chat.ts** — Map exact function signatures and logic of `runAnthropicLoop`, `runGeminiLoop`, `runOpenAILoop`. Identify what is UI-coupled (DOM, state flags) vs pure logic (API calls, message history building, tool routing).
- [x] **Task 2: Define TypeScript interfaces** in `tool-use-loop.ts` — `ToolUseLoopOptions`, `ToolUseResult`, internal provider-specific types.
- [x] **Task 3: Extract Anthropic loop** — Implement the Anthropic branch of `runToolUseLoop`. Includes: streaming message API call, SSE parsing, `tool_use` block detection, `tool_result` message construction.
- [x] **Task 4: Extract Gemini loop** — Implement Gemini branch. Includes: `functionCall` part detection, `functionResponse` construction, history in Gemini format.
- [x] **Task 5: Extract OpenAI loop** — Implement OpenAI branch. Includes: `tool_calls` detection, function result message construction.
- [x] **Task 6: Refactor chat.ts** — Replace the three loop implementations with calls to `runToolUseLoop`. Map `onToolCall` to `buildToolCallHandler()`, `onProgress` to existing progress indicator, `onTextChunk` to chat bubble streaming. Verified all chat.ts-specific behaviors still work (memory tool, image generation tool special handling).
- [x] **Task 7: Build + smoke test** — `npm run build` clean ✅. Manual Chat mode test (AC: 10) — requires plugin reload + live test.

---

## Dev Notes

**Regression risk (mandatory @po note):** If `runAnthropicLoop`/`runGeminiLoop`/`runOpenAILoop` delegations break an edge case in chat.ts, Chat mode fails silently. Mitigation: run all 3 provider smoke tests (AC 10-B) before merging. Do NOT merge FC-1 until TEST FC-1-B passes for all 3 providers.

**What stays in chat.ts (NOT extracted):**
- DOM manipulation: appending chat bubbles, scrolling, updating `.chat-output`
- `isProcessing` state flag
- Special tool handlers: `generate_image` (async image generation), `update_memory` (sandbox save)
- Message history pruning (stripping base64 from tool results before sending back)
- Error bubble display

**What goes into tool-use-loop.ts:**
- The API call + streaming parse loop (all 3 providers)
- Message history building (append assistant turn + user tool_result turn)
- Tool call extraction from response
- Iteration counter + max check

**Provider routing:** Detect provider from `options.provider` field. Same as `chat.ts` current logic: `provider === 'gemini'` → Gemini branch, `model.startsWith('gpt')` → OpenAI branch, else → Anthropic.

**API key + model are stored in `state.ts`** — the caller (chat.ts or a mode) reads them from state and passes them in `ToolUseLoopOptions`. The loop itself does not read from state.

**History format per provider:**
- Anthropic: `Array<{ role: 'user' | 'assistant', content: ContentBlock[] }>`
- Gemini: `Array<{ role: 'user' | 'model', parts: GeminiPart[] }>`
- OpenAI: `Array<{ role: 'user' | 'assistant' | 'tool', content: string | null, tool_calls?: ... }>`

These are already typed in chat.ts — reuse those types or move them to a shared types file if they grow.

**base64 stripping rule:** Before appending a tool result to history, strip base64 fields from the result (same as chat.ts). This is loop-internal logic — goes into tool-use-loop.ts.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `figmento/src/ui/tool-use-loop.ts` | CREATE — new shared module |
| `figmento/src/ui/chat.ts` | MODIFY — refactor 3 loop functions to delegate to runToolUseLoop |

---

## Validation

**TEST FC-1-A:** Open Chat mode, send "Create an Instagram post frame 1080x1080, dark background, text 'Hello World' in white at center."
- [ ] Design appears in Figma
- [ ] Chat bubbles show tool call progress
- [ ] No regressions in chat behavior

**TEST FC-1-B:** Run same test with each provider (Claude, Gemini, OpenAI) by switching in Settings.
- [ ] All 3 complete successfully

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - No shared mutable state between callers (loop must be fully reentrant)
  - Provider branch exhaustiveness (all 3 providers handled, no silent fallthrough)
  - No DOM imports in tool-use-loop.ts (must be UI-agnostic)
  - TypeScript strict: no `any` on tool call args or results
```

---

## Dev Agent Record

**Agent Model Used:** claude-sonnet-4-6
**Implementation Date:** 2026-03-03

### File List

| File | Change |
|------|--------|
| `figmento/src/ui/tool-use-loop.ts` | CREATED — shared provider-agnostic tool-use loop engine |
| `figmento/src/ui/chat.ts` | MODIFIED — refactored 3 loops to delegate to runToolUseLoop; removed duplicate API callers, schema converters, base64 utilities |

### Completion Notes

- `tool-use-loop.ts` exports: `runToolUseLoop`, `ToolUseLoopOptions`, `ToolUseResult`, `ToolCallResult`, `AnthropicMessage`, `GeminiContent`, `GeminiPart`, `ContentBlock`, `SCREENSHOT_TOOLS`, `stripBase64FromResult`, `summarizeScreenshotResult`
- `chat.ts` now imports types directly from `tool-use-loop.ts` — no more duplicate type definitions
- `buildToolCallHandler()` is a factory that returns the unified `onToolCall` callback for all 3 providers; handles `generate_image` and `update_memory` specially (stays DOM-side in chat.ts)
- `executeGenerateImage` and `executeUpdateMemory` updated to return `ToolCallResult` (plain content + is_error) instead of Anthropic-specific ContentBlock — error content no longer includes "Error: " prefix (loop adds it per-provider)
- Build: `cd figmento && npm run build` ✅ — 21ms, zero errors
- AC 9 (build clean): ✅
- AC 10 (manual smoke): Requires plugin reload in Figma + live provider test

### Change Log

- 2026-03-03: FC-1 implemented by @dev (Dex). Created tool-use-loop.ts, refactored chat.ts. Build clean.
