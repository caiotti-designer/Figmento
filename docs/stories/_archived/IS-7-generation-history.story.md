# Story IS-7: Generation History Panel

**Status:** Done
**Priority:** Medium (P1)
**Complexity:** M (5 points) — History state, thumbnail strip, modal preview
**Epic:** IS — Image Studio
**Depends on:** IS-3 (generation must work)
**PRD:** [PRD-008](../prd/PRD-008-image-studio.md) — Phase C

---

## Business Value

Image generation is iterative — designers generate, evaluate, tweak, regenerate. Without history, each generation replaces the previous one. History lets users compare results, re-use successful prompts, and pick the best output from multiple attempts.

## Out of Scope

- Cross-session history persistence (session-only for v1)
- History search/filter
- History export

## Risks

- Large base64 images in history may consume significant memory (mitigated: limit to 20 entries, store compressed thumbnails for strip, full image only on demand)
- Modal overlay may conflict with Figma plugin iframe z-index stacking (mitigated: use plugin's existing modal pattern if one exists, or absolute positioning within iframe)
- Re-use prompt with @tags may reference deleted references (mitigated: validate @tag tokens on re-use, strip invalid ones with toast notification)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "History captures generations, thumbnails render, re-use prompt works, max 20 entries"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer iterating on image generation,
**I want** to see a history of all generated images in this session,
**so that** I can compare results and re-use successful prompts.

---

## Acceptance Criteria

- [ ] AC1: History section at bottom of Image Studio tab with label "History"
- [ ] AC2: Each generation adds a thumbnail (64×64) to a horizontal scrollable strip
- [ ] AC3: Newest entries on left
- [ ] AC4: Clicking thumbnail opens full-size preview in modal overlay
- [ ] AC5: Each entry stores: image base64, prompt, references used, aspect ratio, resolution, timestamp
- [ ] AC6: "Re-use prompt" button in modal populates the prompt box with stored prompt (including @tags)
- [ ] AC7: Session-scoped (cleared on plugin close)
- [ ] AC8: Maximum 20 entries — oldest dropped when exceeded
- [ ] AC9: Empty state: "Generated images will appear here" in muted text
- [ ] AC10: Modal has close button (✕) + click outside to dismiss

---

## Description

### Problem

Each generation in Image Studio replaces the previous preview. If the user generates 5 variations and wants to go back to the 2nd one, they can't — it's gone. There's no way to compare results or recover a prompt that produced a good output.

### Solution

A scrollable thumbnail strip at the bottom of Image Studio that captures every generation. Clicking a thumbnail opens a full-size modal with options to re-use the prompt or send to canvas.

---

## Tasks

### Phase 1: History Data Store
- [ ] Define `HistoryEntry` interface: `{ id, imageBase64, thumbnailBase64, prompt, tokenizedPrompt, referencesUsed, aspectRatio, resolution, timestamp }`
- [ ] In-memory array in `image-studio.ts` (max 20 entries, FIFO eviction)
- [ ] Hook into generation completion callback from IS-3 to auto-capture entries
- [ ] Generate 64×64 thumbnail from full image using canvas element

### Phase 2: Thumbnail Strip UI
- [ ] History section container with "History" label at bottom of Image Studio tab
- [ ] Horizontal scrollable flex row for thumbnails
- [ ] Thumbnail card: 64×64 image + subtle border, hover effect
- [ ] Empty state: muted text "Generated images will appear here"
- [ ] Scroll behavior: newest on left, overflow-x auto

### Phase 3: Full-Size Preview Modal
- [ ] Modal overlay component (dark scrim + centered content)
- [ ] Full-size image rendered with `object-fit: contain`, max viewport 90%
- [ ] Close button (✕) top-right + click outside to dismiss + Escape key
- [ ] Action buttons below image: "Re-use Prompt", "Send to Canvas" (IS-8)

### Phase 4: Re-use Prompt
- [ ] "Re-use Prompt" button extracts stored `tokenizedPrompt` (with `{{ref:id}}` tokens)
- [ ] Validate @tag tokens against current reference store — strip invalid ones
- [ ] Populate prompt box (textarea + overlay sync)
- [ ] Close modal after population
- [ ] Toast: "Prompt loaded" (or "Prompt loaded — X invalid references removed" if tokens stripped)

---

## Dev Notes

- **Memory budget:** 20 entries × ~500KB average base64 = ~10MB peak. Acceptable for a plugin session. Store compressed JPEG thumbnails (64×64 ≈ 2KB each) separately from full images.
- **Thumbnail generation:** Reuse the same `<canvas>` compression pipeline from IS-2 reference slots — center-crop to square, 64×64, JPEG quality 0.8.
- **Modal pattern:** Check if `ui.html` already has a modal/overlay pattern (settings sheet uses slide-over). If not, create a simple absolute-positioned overlay scoped to the Image Studio panel.
- **Re-use with @tags:** Store both the display prompt (with @names) and the tokenized prompt (with `{{ref:id}}`). When re-using, resolve tokens against current IS-2 store. If a reference was deleted, strip the token and notify via toast.
- **IS-8 integration:** The "Send to Canvas" button in the modal calls the same handler as IS-8's standalone button. IS-8 should export a `sendToCanvas(imageBase64, promptText)` function that both the current preview and history modal can call.

---

## Definition of Done

- [ ] Plugin builds successfully
- [ ] Each generation adds a thumbnail to the history strip
- [ ] Clicking thumbnail opens full-size modal
- [ ] Re-use prompt populates prompt box with correct @tags
- [ ] Invalid @tags stripped with notification on re-use
- [ ] Max 20 entries enforced (oldest dropped)
- [ ] Empty state shown when no generations exist
- [ ] Modal closes on ✕, Escape, and click outside
- [ ] No memory leaks on repeated generate cycles
- [ ] No console errors

---

## File List

### MODIFIED
- `figmento/src/ui.html` — History section HTML + modal template
- `figmento/src/ui/image-studio.ts` — History state, thumbnail rendering, modal logic

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | @sm | Story created from Epic IS Phase C |
