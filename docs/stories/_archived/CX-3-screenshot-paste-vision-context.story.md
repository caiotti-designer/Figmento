# CX-3: Screenshot Paste & Vision Context in Chat — Brownfield Addition

**Status:** Ready for Review
**Epic:** Chat Experience Improvements
**Estimate:** 2 days
**Priority:** Medium
**Depends on:** None
**Blocks:** CX-4

---

## User Story

As a Figmento user,
I want to paste a screenshot or image directly into the chat input area,
So that I can give the AI visual context (a reference design, brand screenshot, or competitor example) alongside my text prompt.

---

## Story Context

**Existing System Integration:**
- Integrates with: `figmento/src/ui/chat.ts` — `sendMessage()`, provider loops, `buildToolCallHandler()`
- Integrates with: `figmento/src/ui.html` — chat input area HTML + CSS
- Integrates with: `figmento-ws-relay/src/chat/chat-engine.ts` — Gemini and Claude loops (relay mode)
- Technology: TypeScript, Clipboard API, FileReader API, Gemini `inlineData`, Claude `image` content block
- Follows pattern: `visionImage` injection already implemented in relay's `executeAnalyzeCanvasContext()` — same pattern for user-provided images
- Touch points: `#chat-input` textarea, `#chat-messages` container, Gemini/Claude history arrays

**Aria's Technical Notes:**

The vision injection infrastructure already exists (added for `analyze_canvas_context`). This story extends it to accept user-pasted images as the source of `visionImage`.

**Data flow:**
```
user Ctrl+V (or drag-drop) → paste event on input area
  → ClipboardEvent.clipboardData.items → filter image/* types
  → FileReader.readAsDataURL(blob) → base64 string
  → pendingAttachment state variable (string | null)
  → thumbnail preview rendered above textarea
  → user types message + clicks Send
  → sendMessage(): include pendingAttachment alongside text message
  → Gemini loop: push { role: 'user', parts: [inlineData, text] }
  → Claude loop: push { role: 'user', content: [image_block, text_block] }
  → OpenAI loop: push { role: 'user', content: [image_url_base64, text] }
  → pendingAttachment cleared after send
```

**State addition:** `let pendingAttachment: string | null = null` in `chat.ts` module scope.

---

## Acceptance Criteria

**Functional Requirements:**

1. User can paste an image (PNG, JPEG, WEBP) via Ctrl+V while the chat textarea or input area is focused
2. After pasting, a thumbnail preview (max 80×80px) appears above the textarea with an ✕ button to remove it
3. When the user clicks Send with a pending attachment, the image is included as visual context in the AI message
4. The AI receives the image as a first-class visual input — Gemini via `inlineData`, Claude via `image` content block, OpenAI via base64 image URL
5. The system prompt includes a short instruction: "When the user attaches an image, analyze it visually to understand the reference design, brand style, or content before responding."

**UX Requirements:**

6. If the pasted item is not an image (e.g., text), the paste event behaves normally (text goes into textarea)
7. The thumbnail shows a clear visual preview — not just a file name
8. The ✕ button clears the attachment without affecting the typed text
9. After sending, the message bubble shows a small image icon indicator ("📎 image attached") rather than the raw base64 string

**Integration Requirements:**

10. Relay mode (bridge connected): attachment included via the relay turn request — `ChatTurnRequest` gains an optional `attachmentBase64?: string` field
11. Direct mode (no bridge): attachment injected directly into the provider history before the API call
12. `pendingAttachment` is cleared after every send, whether the send succeeds or fails
13. New chat (`+` button) also clears `pendingAttachment` and removes the thumbnail

**Quality Requirements:**

14. Images larger than 4MB are rejected with a friendly error: "Image too large — please paste a screenshot under 4MB"
15. No regression in text-only chat flow
16. Works in Gemini Flash, Gemini Pro, Claude Sonnet, Claude Haiku, GPT-4o

---

## Technical Notes

- **Integration Approach (direct mode):** In `chat.ts`, add paste event listener on the chat input container. Store base64 in `pendingAttachment`. In the Gemini provider loop: construct `parts: [{ inlineData: {...} }, { text: message }]` instead of `parts: [{ text: message }]` when attachment present. Mirror for Claude (`content` array) and OpenAI (`content` array with image_url).
- **Integration Approach (relay mode):** Add `attachmentBase64?: string` to `ChatTurnRequest` in `chat-engine.ts`. In `handleChatTurn()`, when present, prepend the image part to the first user message in history before the API call.
- **Existing Pattern Reference:** `visionImage` injection in `executeAnalyzeCanvasContext()` (relay) and `pendingVisionImages` loop in the Gemini section of `chat-engine.ts` — exact same mechanism, different source
- **Key Constraints:**
  - Do NOT include the base64 in conversation history after the first turn — strip it using the existing `stripBase64FromResult()` pattern to avoid context overflow
  - OpenAI vision requires `gpt-4o` or `gpt-4-turbo` — for other models, gracefully fallback to text-only with a note: "Image context not available for this model"

---

## Definition of Done

- [x] Paste event captured and thumbnail rendered
- [x] ✕ button clears attachment
- [x] Send includes image in all 3 provider loops (direct mode)
- [x] Relay mode `ChatTurnRequest` updated with optional attachment
- [x] Base64 stripped from history after first turn (attachment not re-injected — single-turn only)
- [x] 4MB size limit enforced
- [x] New chat clears attachment
- [ ] Manual test: paste a brand screenshot, ask "recreate this style" — AI responds with visual understanding
- [x] `npm run build` (plugin) and `tsc` (relay) pass

---

## Risk Assessment

- **Primary Risk:** Base64 image data inflating conversation history → context overflow on long conversations
- **Mitigation:** Strip base64 after first turn using `stripBase64FromResult()` — already exists for this purpose
- **Rollback:** Remove paste event listener, remove `pendingAttachment` variable, remove image parts from provider loops

---

## File List

- [x] `figmento/src/ui/chat.ts` — paste handler, pendingAttachment state, provider loop updates, attachment preview
- [x] `figmento/src/ui.html` — thumbnail preview CSS + attachment indicator style
- [x] `figmento/src/ui/system-prompt.ts` — add image attachment instruction
- [x] `figmento-ws-relay/src/chat/chat-engine.ts` — ChatTurnRequest.attachmentBase64, Gemini/Claude/OpenAI loop injection
- [x] `figmento-ws-relay/src/chat/chat-endpoint.ts` — increased MAX_BODY_SIZE to 8MB for image payloads

---

*— Morgan, planejando o futuro 📊*
