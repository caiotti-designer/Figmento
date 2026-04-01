# Story IS-8: Send to Canvas Integration

**Status:** Done
**Priority:** Medium (P1)
**Complexity:** S (3 points) — Reuses existing canvas image placement pipeline
**Epic:** IS — Image Studio
**Depends on:** IS-7 (history must exist for "send from history")
**PRD:** [PRD-008](../prd/PRD-008-image-studio.md) — Phase C

---

## Business Value

The final step: once the designer has the perfect generated image, they need to place it on the Figma canvas. This bridges Image Studio output to the actual design workflow. Without it, the user would have to download the image and manually import it.

## Out of Scope

- Smart placement (detecting where in the design the image should go)
- Auto-sizing to match a selected frame
- Replacing existing images

## Risks

- MCP connection may be inactive when user clicks "Send to Canvas" (mitigated: check connection status before attempting, show "Connect to Figma first" if disconnected)
- Image resolution mismatch — generated at 1K but user expects 4K on canvas (mitigated: place at generated resolution, frame name includes resolution info)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Send to Canvas places image on Figma canvas with correct dimensions and descriptive name"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer who generated an image in Image Studio,
**I want** to click "Send to Canvas" and have it placed in my Figma file,
**so that** I can use the generated image in my design without manual import.

---

## Acceptance Criteria

- [ ] AC1: "Send to Canvas" button on current generation preview
- [ ] AC2: "Send to Canvas" button in history modal preview
- [ ] AC3: Uses existing `place_generated_image` or `create_image` MCP tool pipeline
- [ ] AC4: Image placed at current viewport center (or offset from selection if something is selected)
- [ ] AC5: Created frame named with first 40 characters of the prompt used
- [ ] AC6: Success: green toast "Image placed on canvas ✓"
- [ ] AC7: Error: red toast with retry option
- [ ] AC8: Button disabled during placement (prevent double-click)

---

## Description

### Problem

Image Studio generates images within the plugin UI, but the final goal is placing them on the Figma canvas. Without a "Send to Canvas" action, the user must download the image and manually import it — breaking the creative flow.

### Solution

A "Send to Canvas" button that takes the generated image (current preview or history entry) and places it on the Figma canvas using the existing `create_image` MCP tool pipeline. The image is placed at viewport center with a descriptive frame name.

---

## Tasks

### Phase 1: Send Handler Function
- [ ] Create `sendToCanvas(imageBase64: string, promptText: string)` function in `image-studio.ts`
- [ ] Check MCP/Figma connection status before attempting — show error if disconnected
- [ ] Call existing `create_image` tool via relay with base64 data
- [ ] Pass frame name: first 40 chars of prompt, sanitized

### Phase 2: Button Placement
- [ ] Add "Send to Canvas" button on current generation preview (below the image)
- [ ] Add "Send to Canvas" button in history modal (IS-7) — calls same handler
- [ ] Button styling: secondary action style, canvas/export icon

### Phase 3: Feedback + Error Handling
- [ ] Loading state: button shows spinner, disabled during placement
- [ ] Success: green toast "Image placed on canvas ✓"
- [ ] Error: red toast with message + retry option
- [ ] Connection error: "Connect to Figma first" toast with link to connection UI

---

## Dev Notes

- **Reuse existing pipeline:** The `create_image` command already exists in the MCP server and handles base64 → Figma image node. Route through the same WS relay command path used by the chat-based generation.
- **Viewport center placement:** The `create_image` tool accepts `x` and `y` parameters. Use Figma's viewport center coordinates. If a node is currently selected, offset 200px to the right of the selection's bounding box.
- **Frame naming:** Sanitize prompt text for Figma layer name — remove special characters, truncate to 40 chars, append "— Image Studio" suffix for easy identification in layers panel.
- **Shared handler:** Export the `sendToCanvas` function so IS-7's history modal can import and call it directly — no code duplication.

---

## Definition of Done

- [ ] Plugin builds successfully
- [ ] "Send to Canvas" from current preview places image on canvas
- [ ] "Send to Canvas" from history modal places image on canvas
- [ ] Frame named with truncated prompt text
- [ ] Success toast shown after placement
- [ ] Error toast shown if MCP disconnected or placement fails
- [ ] Button disabled during placement (no double-click)
- [ ] No console errors

---

## File List

### MODIFIED
- `figmento/src/ui/image-studio.ts` — Send to canvas handler

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | @sm | Story created from Epic IS Phase C |
