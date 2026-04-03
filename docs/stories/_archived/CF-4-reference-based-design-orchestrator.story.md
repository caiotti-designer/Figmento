# Story CF-4: Reference-Based Design Orchestrator

**Status:** Done
**Priority:** High (P1)
**Complexity:** L (8 points) — orchestration logic chaining multiple existing tools
**Epic:** Chat File Pipeline — Chat-First Workflow
**Depends on:** CF-2 (temp files), CF-8 (reference image support in Gemini)
**PRD:** PM analysis 2026-03-15 — Paste screenshot → generate branded design matching reference

---

## Business Value

Core use case: user pastes a hero section screenshot + uploads their logo → Figmento generates a clean hero matching their branding, following the reference composition. This chains existing tools (analyze_reference → get_layout_blueprint → generate_design_image) into a single orchestrated flow with reference awareness.

## Out of Scope

- Multi-reference blending (use only one primary reference)
- Automatic brand kit creation from reference
- Live design editing/iteration (single generation pass)

## Risks

- analyze_reference requires ANTHROPIC_API_KEY (Claude Vision) — may fail if not set
- Blueprint matching may not find a match for every reference composition
- End-to-end latency: analysis (~3s) + generation (~3-5s) + placement (~2s) = ~10s total

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, end-to-end flow produces a design from a reference image"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** to paste a reference screenshot and have Figmento generate a new design following that composition,
**so that** I can quickly create designs inspired by references I like.

---

## Description

### Problem

The tools exist individually: `analyze_reference()` extracts composition DNA, `get_layout_blueprint()` matches a layout pattern, `generate_design_image()` creates an image. But there's no single tool that chains them into a "design from reference" workflow.

### Solution

New MCP tool `design_from_reference` that orchestrates:
1. `analyze_reference(imagePath)` → extracts tags, palette, layout, composition_notes
2. `get_layout_blueprint(category, mood)` → matches a blueprint (optional, fallback to analysis)
3. `generate_design_image(brief, mood, format, referenceImages)` → generates background using reference style (CF-8)
4. Returns frameId + analysis for the agent to continue with text/elements

---

## Acceptance Criteria

- [ ] **AC1:** `design_from_reference` accepts `{ referenceImagePath: string, brief: string, format?: string, brandKit?: string }`
- [ ] **AC2:** Step 1: calls `analyze_reference` on the image, extracts composition DNA (tags, palette, layout, notable, composition_notes)
- [ ] **AC3:** Step 2: calls `get_layout_blueprint` with the extracted layout pattern and mood tags
- [ ] **AC4:** Step 3: calls `generate_design_image` with mood from analysis, format from params, and the reference image passed as `referenceImages` for Gemini
- [ ] **AC5:** If a `brandKit` name is provided, loads it via `get_brand_kit` and uses brand colors/fonts in the prompt
- [ ] **AC6:** Returns a combined result: `{ frameId, analysis, blueprint, imageStatus, textZone, suggestedElements }`
- [ ] **AC7:** If `analyze_reference` fails (no API key), falls back to using the brief directly without analysis
- [ ] **AC8:** `npm run build` succeeds

---

## Tasks

### Phase 1: Orchestrator Tool (AC1-AC4, AC7)

- [ ] Create tool in a new file or within `references.ts`
- [ ] Step 1: call internal `analyzeAndSave()` function from references.ts (or the tool handler)
- [ ] Step 2: match layout blueprint from analysis metadata
- [ ] Step 3: generate design image with reference context
- [ ] Handle failures gracefully — each step has a fallback

### Phase 2: Brand Integration (AC5)

- [ ] If brandKit param provided, load via `get_brand_kit` logic
- [ ] Inject brand colors/fonts into the Gemini prompt
- [ ] Enrich brief with brand context

### Phase 3: Response Assembly (AC6, AC8)

- [ ] Assemble combined response with all metadata
- [ ] Include `suggestedElements` based on analysis (e.g. "headline at bottom-40%, CTA button, brand logo top-left")
- [ ] Run `npm run build`

---

## Dev Notes

- `analyze_reference` uses Claude Vision (Anthropic API) — requires `ANTHROPIC_API_KEY` env var
- The analysis returns: `{ tags, palette, layout, notable, composition_notes: { zones, typography_scale, color_distribution, whitespace_strategy } }`
- `get_layout_blueprint` is in layouts.ts — imported via `registerLayoutTools`. May need to extract the matching logic as a shared function.
- The `suggestedElements` field guides the agent on what to create next (text, CTA, logo) — this is informational, not executable.
- This tool is an orchestrator — it calls other tools' internal functions, not the MCP tool endpoints.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/orchestration.ts` | ADD | New orchestrator tool module |
| `figmento-mcp-server/src/server.ts` | MODIFY | Register orchestration tools |
| `figmento-mcp-server/src/tools/references.ts` | MODIFY | Export analyzeAndSave or analysis logic for reuse |
| `figmento-mcp-server/src/tools/layouts.ts` | MODIFY | Export blueprint matching logic for reuse |

---

## Definition of Done

- [ ] design_from_reference chains analysis → blueprint → generation
- [ ] Brand kit integration works
- [ ] Graceful fallbacks on each step
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation GO. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. All ACs met. Build passes. |
