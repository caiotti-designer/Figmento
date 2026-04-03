# CX-6: Auto-Inject Selection Context (Zero-Click Understanding)

**Status:** Done
**Epic:** Chat Experience Improvements
**Estimate:** 4 hours
**Priority:** Medium
**Depends on:** CX-5 (Deep Context Extraction)

---

## User Story

As a designer using the Figmento chat,
I want the AI agent to automatically understand what's in my selected frames the moment I send a message,
So that I never have to explain what's already visible on my canvas.

---

## Problem

Even after CX-5 improves `analyze_canvas_context`, the agent still needs to **call** it. That's an extra round-trip:

1. User sends message + selection
2. Agent sees selection metadata (names, IDs, dimensions only)
3. Agent calls `analyze_canvas_context` (1-3 seconds)
4. Agent finally understands the content
5. Agent responds or calls next tool

Step 3-4 adds latency and depends on the agent being smart enough to call the tool proactively. With some models (Gemini 3.1 in the screenshots), the agent skips it or calls it poorly.

**Solution:** Inject a rich content summary directly into the message context — the same way `buildSelectionContext` already injects frame names/dimensions. The agent starts the turn already knowing what's on the canvas.

---

## Acceptance Criteria

### AC-1: Auto-extract on selection
- [x] When `currentSelection` contains FRAME nodes, the server automatically calls `get_node_info(depth=4)` for each selected frame (max 3) BEFORE passing the message to the LLM
- [x] Extraction happens in `handleChatTurn`, not inside a tool call

### AC-2: Rich context injection
- [x] The extracted content is injected as a `[Page context]` block prepended to the user message (same pattern as `buildSelectionContext`)
- [x] Format per frame:
  ```
  Frame "Page 5" (id: abc, 2480×3508, A4 portrait)
    Texts: "MOMMENT" (72px bold Playfair Display), "Creative Agency" (32px), "Our Services" (48px), ...
    Colors: #F1F5F9 (bg), #1A1A2E, #E8A87C, #FFFFFF
    Structure: Header [FRAME] > Logo, Nav | Content [FRAME] > Title, Cards [FRAME] > Card1, Card2 | Footer
    Images: 2 image fills, 1 empty placeholder (997×765px)
  ```
- [x] Total injection is capped at 3000 characters across all frames

### AC-3: Performance guard
- [x] Extraction runs in parallel for multiple frames (`Promise.all`)
- [x] Individual frame extraction has a 3-second timeout — if exceeded, fall back to basic metadata (name, dimensions)
- [x] If ALL extractions fail, fall back to current behavior (just names/IDs)

### AC-4: Cache integration
- [x] Extracted context is stored in the existing `designSessions` cache (TTL 30min)
- [x] Subsequent messages with the same selection reuse the cached extraction instead of re-querying the plugin
- [x] Cache invalidates when selection changes

### AC-5: Backward compatibility
- [x] `analyze_canvas_context` tool still works as before (for explicit agent calls)
- [x] `buildSelectionContext` output is replaced by the richer format (not duplicated)
- [x] No changes to the plugin sandbox or WebSocket protocol

---

## Scope

**IN:**
- New `buildRichSelectionContext()` function in `chat-engine.ts`
- Modify `handleChatTurn` to call it before LLM invocation
- Reuse recursive extraction logic from CX-5
- Cache in `designSessions`

**OUT:**
- Plugin-side changes
- New tools or tool schemas
- Screenshot/vision auto-injection (separate concern)
- Changes to system prompt

---

## Technical Notes

### Extraction flow in `handleChatTurn`:

```typescript
async function buildRichSelectionContext(
  selection: ChatTurnRequest['currentSelection'],
  sendToPlugin: SendFn,
  channel: string,
): Promise<string> {
  if (!selection?.length) return '';
  const frames = selection.filter(n => n.type === 'FRAME').slice(0, 3);
  if (!frames.length) return '';

  // Check cache first
  const cached = designSessions.get(channel);
  if (cached?.richContext && cached.selectionHash === hashSelection(frames)) {
    return cached.richContext;
  }

  // Parallel extraction with timeout
  const results = await Promise.all(
    frames.map(f =>
      Promise.race([
        extractFrameContext(f.id, sendToPlugin),
        timeout(3000).then(() => fallbackContext(f)),
      ])
    )
  );

  const context = formatRichContext(results); // cap at 3000 chars
  // Cache it
  designSessions.set(channel, { ...cached, richContext: context, selectionHash: hashSelection(frames), updatedAt: Date.now() });
  return context;
}
```

### Token budget reasoning:
- 3000 chars ≈ ~750 tokens
- System prompt ≈ ~1800 tokens (post CX-2)
- Total overhead: ~2550 tokens — leaves plenty of room for conversation

---

## Risks

- **Latency on hot path:** `get_node_info(depth=4)` is called BEFORE the LLM sees the message. For 3 frames, that's 3 sequential WS round-trips (or parallel). The 3-second timeout per frame (AC-3) caps worst case at 3s total (parallel) but could add perceptible delay to first response.
- **Cache invalidation edge case:** If the user changes selection mid-conversation without sending a new message, the cached context becomes stale. Mitigated by hash comparison on each turn.
- **Token budget interaction with long conversations:** The 3000-char injection is per-turn, so it won't compound in history. But the LLM sees it repeated if the user sends multiple messages with the same selection — acceptable tradeoff.

## Criteria of Done

- [x] User sends a message with 3 frames selected → agent's first response demonstrates awareness of all frame content without calling `analyze_canvas_context`
- [x] Second message with same selection uses cached context (no new WS calls)
- [x] Changing selection invalidates cache and re-extracts
- [x] Plugin disconnection or timeout falls back gracefully to basic metadata
- [x] Relay builds cleanly (`npm run build` in figmento-ws-relay)

---

## File List

| File | Change |
|------|--------|
| `figmento-ws-relay/src/chat/chat-engine.ts` | Add `buildRichSelectionContext`, modify `handleChatTurn` |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-20 | @pm | Story created |
| 2026-03-20 | @po | Validated GO (8/10) — added Risks + DoD sections, status → Ready |
| 2026-03-20 | @dev | Implemented — buildRichSelectionContext with parallel extraction, cache, timeout fallback |
