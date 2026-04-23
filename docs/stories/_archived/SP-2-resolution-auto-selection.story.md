# Story SP-2: Resolution & Aspect Ratio Auto-Selection

**Status:** Done
**Priority:** High (P1)
**Complexity:** S (1 point) — 1 file modify, knowledge file driven
**Epic:** Speed Pipeline — Cold-Start & Execution Optimization
**Depends on:** SP-1 (model swap adds imageConfig support)
**PRD:** PM analysis 2026-03-15 — Eliminate wasted resolution on small formats

---

## Business Value

Currently every image generates at the model's default resolution regardless of target format. A 1080×1080 Instagram square doesn't need 4K — `1K` is visually identical and generates 3-5× faster. Auto-selecting resolution per format prevents wasted latency.

## Out of Scope

- Model swap itself (SP-1)
- Adding new format presets to FORMAT_MAP
- User-facing resolution override parameter (future story)

## Risks

- Low risk — purely additive logic in the handler

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, resolution selection matches knowledge file values"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** image resolution to automatically match my target format,
**so that** I get the fastest generation time without sacrificing visible quality.

---

## Description

### Problem

After SP-1 adds `imageConfig` support, the resolution and aspect ratio values still need to come from somewhere intelligent. Without auto-selection, every call would use the same defaults.

### Solution

Load `image-generation.yaml` at call time and look up `resolution_by_format[formatKey]` and `aspect_ratio_by_format[formatKey]`. Fall back to `1K` / `1:1` for unknown formats.

---

## Acceptance Criteria

- [ ] **AC1:** `generate_design_image` reads `resolution_by_format` from `knowledge/image-generation.yaml` to set `imageSize`
- [ ] **AC2:** `generate_design_image` reads `aspect_ratio_by_format` from `knowledge/image-generation.yaml` to set `aspectRatio`
- [ ] **AC3:** Unknown format keys fall back to `imageSize: "1K"` and `aspectRatio: "1:1"`
- [ ] **AC4:** Knowledge file is loaded via lazy cache (not re-read on every call)
- [ ] **AC5:** `npm run build` succeeds

---

## Tasks

### Phase 1: Knowledge Integration (AC1-AC4)

- [ ] Add a `loadImageGenKnowledge()` helper that calls `loadKnowledge('image-generation.yaml')` and returns the typed maps
- [ ] In the `generate_design_image` handler, after resolving the format key, look up `resolution_by_format[formatKey]`
- [ ] Look up `aspect_ratio_by_format[formatKey]`
- [ ] Apply fallback defaults for missing keys
- [ ] Pass resolved values to `callGemini()`

### Phase 2: Verify (AC5)

- [ ] Run `npm run build` — clean build

---

## Dev Notes

- This story may merge with SP-1 implementation if the developer does both in one pass — that's fine. The separation exists for traceability.
- The knowledge file maps are plain YAML objects — access with `data['resolution_by_format']` etc.
- Lazy caching already exists via `knowledgeCache` in `intelligence.ts`

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/image-gen.ts` | MODIFY | Add knowledge lookup for resolution + aspect ratio |
| `figmento-mcp-server/knowledge/image-generation.yaml` | READ | Source of truth for format mappings |

---

## Definition of Done

- [ ] Resolution auto-selected per format
- [ ] Aspect ratio auto-selected per format
- [ ] Fallback defaults work for unknown formats
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation 9/10 → GO. Note: SP-1 overlap acknowledged. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Absorbed into SP-1 implementation — format mapping (AC1-AC4) done in image-gen.ts. All ACs met. |
