# CX-4: Place Pasted Image to Figma Frame — Brownfield Addition

**Status:** Ready for Review
**Epic:** Chat Experience Improvements
**Estimate:** 1 day
**Priority:** Medium
**Depends on:** CX-3 (Screenshot Paste)

---

## User Story

As a Figmento user,
I want to place a pasted screenshot directly onto a Figma frame with one click,
So that I can use reference images or brand assets as fills without leaving the plugin.

---

## Story Context

**Existing System Integration:**
- Integrates with: `figmento/src/ui/chat.ts` — `pendingAttachment` state (added in CX-3), `sendCommandToSandbox()`
- Integrates with: `figmento/src/code.ts` — `create_image` command handler already exists
- Integrates with: `figmento/src/ui.html` — thumbnail preview UI (added in CX-3)
- Technology: TypeScript, existing `create_image` WS command
- Follows pattern: `sendCommandToSandbox('create_image', { imageData, width, height })` — already used by `executeGenerateImage()`
- Touch points: thumbnail preview element, `sendCommandToSandbox`, sandbox `executeCommand('create_image')`

**Aria's Technical Notes:**

Two approaches — the simplest is a direct "Place in Figma" button. No AI involvement needed.

**Approach A (recommended — 1 day):** Direct button on the thumbnail preview
```
thumbnail preview div
  ├── <img> (preview)
  ├── ✕ (remove)
  └── 📌 "Place in Figma" button
      → onClick: sendCommandToSandbox('create_image', {
            imageData: pendingAttachment,
            name: 'Pasted Image',
            width: 400, height: 300  // or detected from image natural dimensions
        })
      → success: show "✓ Placed on canvas" feedback
```

**Approach B (via AI tool — 2 days):** Expose a `get_user_image` tool that returns the base64. AI can then pass it to `create_image`. More powerful but more complex.

**This story implements Approach A only.**

---

## Acceptance Criteria

**Functional Requirements:**

1. When an image is pasted (CX-3 thumbnail is visible), a "Place in Figma" button appears alongside the ✕ button in the thumbnail preview
2. Clicking "Place in Figma" sends `create_image` to the Figma sandbox with the pasted image data
3. The image is placed on the canvas at the current viewport position (default x/y from sandbox) with dimensions derived from the image's natural width/height (capped at 800px on longest side)
4. After successful placement, the thumbnail shows a brief "✓ Placed!" confirmation (1.5s), then returns to normal state
5. The placed image appears as a new frame/layer on the Figma canvas named "Pasted Reference"

**UX Requirements:**

6. "Place in Figma" button is visually distinct from the ✕ button — use a pin/anchor icon or "→ Figma" label
7. During placement (async), the button shows a spinner and is disabled to prevent double-placement
8. If placement fails (sandbox timeout or error), show inline error: "Failed to place — is the plugin connected?"
9. After placement, `pendingAttachment` is NOT cleared — user may still want to send the image as AI context

**Integration Requirements:**

10. Placement does NOT trigger any AI turn — it's a direct UI→sandbox action bypassing the LLM loop
11. Works in both direct mode and relay/bridge mode (both route through `sendCommandToSandbox` / relay channel)
12. Does not interfere with the Send button or chat input — placement is a separate action

**Quality Requirements:**

13. Image dimensions are read from `new Image()` natural size and capped to avoid placing massive images
14. No regression in CX-3 paste / thumbnail / send behavior
15. `npm run build` passes

---

## Technical Notes

- **Integration Approach:** Add `placePastedImage()` async function in `chat.ts`. It reads `pendingAttachment`, creates an `Image()` to get natural dimensions, then calls `sendCommandToSandbox('create_image', params)`. Add a "Place in Figma" button to the thumbnail HTML (rendered by `renderAttachmentPreview()`).
- **Existing Pattern Reference:** `executeGenerateImage()` in `chat.ts` — same `sendCommandToSandbox('create_image', {...})` call
- **Key Constraints:**
  - Cap image dimensions: `maxDim = 800; scale = Math.min(1, maxDim / Math.max(naturalW, naturalH))`
  - `create_image` in the sandbox expects `imageData` as a full data URI (`data:image/png;base64,...`)
  - Do NOT clear `pendingAttachment` after placement — user may still want to send it for AI context

---

## Definition of Done

- [x] "Place in Figma" button visible in thumbnail preview
- [x] Click places image on Figma canvas
- [x] Dimension capping (≤800px) working
- [x] Spinner + disabled state during placement
- [x] Success / error feedback shown
- [x] `pendingAttachment` NOT cleared after placement
- [ ] Manual test: paste brand logo → place → appears on canvas
- [x] `npm run build` passes

---

## Risk Assessment

- **Primary Risk:** `create_image` sandbox handler may not accept very large base64 strings (postMessage size limit ~64MB — unlikely to hit with screenshots)
- **Mitigation:** Pre-check payload size; warn user if > 4MB (already enforced in CX-3)
- **Rollback:** Remove the "Place in Figma" button and `placePastedImage()` function

---

## File List

- [x] `figmento/src/ui/chat.ts` — placePastedImage(), renderAttachmentPreview() updated with "→ Figma" button
- [x] `figmento/src/ui.html` — .chat-attachment-place CSS

---

*— Morgan, planejando o futuro 📊*
