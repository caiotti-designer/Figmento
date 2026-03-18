# Story CF-7: Ad Variation Pipeline

**Status:** Done
**Priority:** Medium (P2)
**Complexity:** L (8 points) — orchestration + multi-generation + layout logic
**Epic:** Chat File Pipeline — Chat-First Workflow
**Depends on:** CF-2 (temp files), CF-4 (reference analysis), CF-8 (reference image support)
**PRD:** PM analysis 2026-03-15 — Import ad → generate 4 variations with product consistency

---

## Business Value

Core use case: user imports a social media ad and asks for 4 variations. Figmento analyzes the original, generates seed-consistent product images via Nano Banana 2, creates fresh copy and layout variations, and outputs 4 complete designs in Figma. This is the "creative director on demand" workflow.

## Out of Scope

- Video ad variations
- A/B test integration
- Copy generation via separate LLM (uses Gemini's native text capability)
- Auto-publishing to social platforms

## Risks

- 4 image generations × ~3-5s each = 12-20s total — may need parallel generation
- Product consistency via seed is approximate, not pixel-perfect
- Layout variation logic needs to produce meaningfully different designs, not just color swaps

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, generates N variation frames from a reference ad image"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** to import a social media ad and generate multiple variations of it,
**so that** I can quickly create A/B test options or campaign variants.

---

## Description

### Problem

Creating ad variations manually is time-consuming. Each variation needs consistent product imagery but different copy, layout emphasis, or color treatment. No tool chains analysis → multi-generation → multi-layout into one flow.

### Solution

New MCP tool `generate_ad_variations` that:
1. Analyzes the reference ad (composition, colors, copy area, product area)
2. Generates N variations, each with:
   - Same product/subject via seed-consistent Nano Banana 2 generation
   - Different composition or emphasis (varied text zones, color treatments)
   - Fresh copy suggestion in the response
3. Creates N separate frames in Figma, offset 200px apart

---

## Acceptance Criteria

- [ ] **AC1:** `generate_ad_variations` accepts `{ referenceImagePath: string, count: number (1-6), format?: string, prompt?: string, brandKit?: string }`
- [ ] **AC2:** Analyzes the reference ad via `analyze_reference` to extract composition DNA
- [ ] **AC3:** Generates `count` background images via Nano Banana 2 using the same seed for product consistency
- [ ] **AC4:** Each variation is placed in a separate Figma frame, offset 200px horizontally from the previous
- [ ] **AC5:** Each frame has the background image + an overlay gradient + suggested text zones
- [ ] **AC6:** Response includes per-variation metadata: `{ frameId, imageNodeId, suggestedCopy, mood, textZone }`
- [ ] **AC7:** If brandKit is provided, variations use brand colors for overlays and text zones
- [ ] **AC8:** `count` defaults to 4, max 6
- [ ] **AC9:** `npm run build` succeeds

---

## Tasks

### Phase 1: Analysis (AC2)

- [ ] Call `analyze_reference` on the reference image
- [ ] Extract: palette, layout, notable elements, composition zones

### Phase 2: Multi-Generation (AC1, AC3, AC8)

- [ ] For each variation (1 to count):
  - Generate background image with Nano Banana 2, same seed, varied prompt modifiers
  - Prompt modifiers: different camera angle, lighting, crop, or composition emphasis
- [ ] Use `generate_design_image` with `skipPreview: true` and `awaitImage: true` for each

### Phase 3: Frame Creation (AC4, AC5)

- [ ] Find existing frames via `get_page_nodes` to determine placement offset
- [ ] Create each variation frame at `lastFrameX + lastFrameWidth + 200`
- [ ] Add gradient overlay matching the analysis palette
- [ ] Set up text zones based on analysis composition_notes

### Phase 4: Response Assembly (AC6, AC7, AC9)

- [ ] Assemble per-variation metadata
- [ ] If brandKit provided, use brand colors for overlays
- [ ] Include suggestedCopy per variation (different CTA, headline angle)
- [ ] Run `npm run build`

---

## Dev Notes

- Image generation is the bottleneck — consider generating in parallel (Promise.all with 2-3 concurrent calls)
- Seed consistency: pass the same integer seed to all Gemini calls. Vary the prompt text slightly for different compositions.
- Canvas spacing: use `get_page_nodes` to find the rightmost frame, then offset 200px
- The prompt modifier approach: "same product, different angle", "same product, close-up", "same product, lifestyle setting", "same product, flat lay"
- This tool is complex — consider breaking into internal helper functions, not one monolithic handler

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/orchestration.ts` | MODIFY | Add generate_ad_variations tool |
| `figmento-mcp-server/src/server.ts` | MODIFY | Ensure orchestration tools registered |

---

## Definition of Done

- [ ] N frames generated from reference analysis
- [ ] Seed-consistent product images across variations
- [ ] Frames offset 200px apart
- [ ] Brand kit integration works
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation GO. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. All ACs met. Build passes. |
