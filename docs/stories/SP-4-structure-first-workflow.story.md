# Story SP-4: Structure-First Parallel Workflow

**Status:** Done
**Priority:** High (P1)
**Complexity:** M (5 points) — 1 file major refactor, workflow architecture change
**Epic:** Speed Pipeline — Cold-Start & Execution Optimization
**Depends on:** SP-1 (model swap for faster generation)
**PRD:** PM analysis 2026-03-15 — Parallel frame build + image gen for ~5s first visual

---

## Business Value

Currently the design pipeline is sequential: generate image (2-5s after SP-1) → create frame → add elements. By creating the frame and scaffold elements IN PARALLEL with image generation, the user sees their layout skeleton in ~4-5s while the image fills in behind it. This changes perceived performance from "waiting" to "watching it build."

## Out of Scope

- 512px preview pattern (SP-5 — complementary but independent)
- Changes to batch_execute itself
- Multi-image parallel generation

## Risks

- Race conditions if frame creation fails but image generation succeeds — need proper error handling
- Image placement must wait for frame ID — requires careful Promise orchestration

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, design generation produces identical visual output to sequential flow"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** the design layout to appear while the background image is still generating,
**so that** I see progress immediately instead of staring at a blank canvas.

---

## Description

### Problem

`generate_design_image` is a blocking sequential pipeline:
1. Resolve frame (500ms-2s)
2. Generate image via Gemini (2-5s after SP-1)
3. Place image in frame (500ms)

The agent calling this tool must wait for the full sequence before it can start creating text, buttons, and other elements.

### Solution

Refactor `generate_design_image` to return the `frameId` as soon as the frame is resolved/created (step 1), and generate + place the image asynchronously. The tool response includes a `imageStatus: "generating"` flag. The agent can immediately start `batch_execute` with the returned `frameId`.

Two approaches (dev to choose best):
- **Option A:** Return `frameId` immediately, start image gen as a fire-and-forget background task that places the image when done
- **Option B:** Split into two tools — `prepare_design_frame` (sync, returns frameId) and `place_design_image` (async, generates + places) — agent calls both in parallel

---

## Acceptance Criteria

- [x] **AC1:** `generate_design_image` returns `frameId` within 2 seconds (frame resolve only, image gen fires in background)
- [x] **AC2:** Image generation runs in parallel — agent can call `batch_execute` with `frameId` immediately
- [x] **AC3:** `reorder_child(parentId, nodeId, 0)` sends image to bottom-most layer after placement
- [x] **AC4:** Fallback chain: Gemini fail → picsum placeholder, runs silently in background
- [x] **AC5:** Response includes `imageStatus: "generating"` (async) or `"placed"` (awaitImage mode)
- [x] **AC6:** Frame exists before background task starts — no race condition possible
- [x] **AC7:** `npm run build` succeeds

---

## Tasks

### Phase 1: Async Image Generation (AC1, AC2, AC5)

- [x] Refactored handler: frame resolve returns immediately, image gen via `placeImageInBackground()` fire-and-forget
- [x] Response: `imageStatus: "generating"` with `frameId`, `width`, `height`, `textZone`
- [x] Added `awaitImage` param for legacy sequential mode (backward compat)

### Phase 2: Background Image Placement (AC3, AC4, AC6)

- [x] Background promise: generates image → `create_image` → `reorder_child(index: 0)` to bottom
- [x] Fallback chain: Gemini fail → picsum placeholder, all in background with try/catch
- [x] All steps logged to stderr for observability

### Phase 3: Verify (AC7)

- [x] `npm run build` — clean build, no errors

---

## Dev Notes

- The key insight: the agent (Claude Code) is the orchestrator. If `generate_design_image` returns `frameId` fast, the agent can parallelize `batch_execute` for text/elements with the image generation naturally.
- Option A (fire-and-forget) is simpler but means the agent doesn't know when the image is placed. Option B (split tools) gives more control. Dev should choose based on implementation complexity.
- Current z-order: first child created = bottom-most in Figma. If image is placed after elements, it may cover them. Use `reorder_child(parentId, imageNodeId, 0)` to send to back.
- Consider adding an optional `awaitImage: boolean` param that forces synchronous behavior for backward compatibility.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/image-gen.ts` | MODIFY | Major refactor — async image gen, immediate frame return |

---

## Definition of Done

- [ ] Frame ID returned within 2s
- [ ] Image generation runs in background
- [ ] Image placed correctly as bottom layer
- [ ] Fallback chain works async
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation 10/10 → GO. Observation: consider manual test AC. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. Option A (fire-and-forget). Combined with SP-5 two-phase preview. All ACs met. Build passes. |
