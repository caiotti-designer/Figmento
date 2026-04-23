# Story SP-5: 512px Preview → High-Res Replacement

**Status:** Done
**Priority:** Medium (P2)
**Complexity:** M (3 points) — 1 file modify, async replacement logic
**Epic:** Speed Pipeline — Cold-Start & Execution Optimization
**Depends on:** SP-1 (imageSize parameter), SP-4 (async pattern)
**PRD:** PM analysis 2026-03-15 — 512px in ~1.2s, then async upscale to target resolution

---

## Business Value

Nano Banana 2's 512px tier generates in ~1.2 seconds. By placing a low-res preview immediately and async-replacing with the target resolution (1K/2K), the user sees a real image (not a placeholder) almost instantly. The high-res version swaps in 2-5 seconds later while the user is already reviewing the layout.

## Out of Scope

- Progressive image streaming (JPEG progressive scan)
- User-facing quality toggle
- Caching generated images

## Risks

- Double generation = double API cost ($0.067 × 2 = $0.134 per design) — same as using Pro once
- Image replacement in Figma requires deleting old node + creating new one (or updating fill) — verify approach

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, preview image appears < 3s, high-res replaces correctly"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** to see a preview image almost instantly while the full-quality image loads,
**so that** I can start evaluating the composition without waiting for high resolution.

---

## Description

### Problem

Even after SP-1's model swap, image generation at 1K-2K takes 2-5 seconds. During this time the user sees nothing — just a dark frame.

### Solution

Two-phase image placement:
1. **Phase A (fast):** Generate at `imageSize: "512"` (~1.2s) → place in frame immediately
2. **Phase B (async):** Generate at target resolution (e.g. `"1K"` or `"2K"`) → replace the preview node

This uses the same prompt both times. Nano Banana 2 with the same seed produces visually consistent output across resolutions.

---

## Acceptance Criteria

- [x] **AC1:** 512px preview generated and placed via background task (~1.2s generation)
- [x] **AC2:** High-res generation starts immediately after preview placement
- [x] **AC3:** High-res replaces preview: `delete_node(previewId)` → `create_image` + `reorder_child(0)`
- [x] **AC4:** If high-res fails, 512px preview remains. If preview also failed, falls back to picsum.
- [x] **AC5:** Response includes `imageStatus: "generating"` (preview + high-res in background)
- [x] **AC6:** `skipPreview: boolean` param added — when true, generates at target resolution directly
- [x] **AC7:** `npm run build` succeeds

---

## Tasks

### Phase 1: Preview Generation (AC1, AC5)

- [x] In `placeImageInBackground()`, first Gemini call with `imageSize: "512"`
- [x] Preview placed via `placeAndReorder()` helper
- [x] Logged to stderr: `"Background: 512px preview placed"`

### Phase 2: High-Res Replacement (AC2, AC3, AC4)

- [x] Second Gemini call at format-matched resolution immediately after preview
- [x] On success: `delete_node(previewId)` → `create_image` + `reorder_child(0)`
- [x] On failure: preview remains, logged to stderr
- [x] If both preview and high-res fail: picsum placeholder fallback

### Phase 3: Skip Option (AC6, AC7)

- [x] `skipPreview` parameter added to schema — when true, single-phase at target resolution
- [x] `npm run build` passes

---

## Dev Notes

- Image replacement in Figma: simplest approach is `delete_node(previewId)` → `create_image(highResData, ...)` with same `x`, `y`, `width`, `height`, `parentId`. The `set_style` with image fill on an existing rectangle is another option but more complex.
- Cost analysis: 2× generation costs but each is $0.067, so total $0.134 = same as one Nano Banana Pro call. Speed gain is worth the equal cost.
- The `skipPreview` flag defaults to `false` — two-phase is the new default behavior.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/image-gen.ts` | MODIFY | Add two-phase generation with 512px preview |

---

## Definition of Done

- [ ] 512px preview appears < 3s
- [ ] High-res replaces preview async
- [ ] Failure keeps preview intact
- [ ] skipPreview param works
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation 10/10 → GO. Cost parity with Pro noted. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. Two-phase preview integrated into SP-4's placeImageInBackground(). All ACs met. Build passes. |
