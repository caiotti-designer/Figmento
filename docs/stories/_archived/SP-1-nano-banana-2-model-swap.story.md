# Story SP-1: Nano Banana 2 Model Swap

**Status:** Done
**Priority:** Critical (P0)
**Complexity:** S (2 points) — 1 file modify, 1 knowledge file reference
**Epic:** Speed Pipeline — Cold-Start & Execution Optimization
**Depends on:** None
**PRD:** PM analysis 2026-03-15 — Image generation is 70%+ of cold-start latency

---

## Business Value

Switching from Nano Banana Pro (`gemini-3-pro-image-preview`) to Nano Banana 2 (`gemini-3.1-flash-image-preview`) cuts image generation from 15-25s to 2-5s — the single highest-impact optimization in the pipeline. Half the cost per image ($0.067 vs $0.134).

## Out of Scope

- Resolution/aspect-ratio auto-selection (SP-2)
- Structure-first workflow (SP-4)
- Preview → high-res pattern (SP-5)

## Risks

- Nano Banana 2 may produce slightly different visual quality than Pro — validate with screenshot comparison
- `imageConfig` parameter shape may differ from current SDK version — verify with `@google/genai` package

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes (npm run build), existing design generation still works end-to-end"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** image generation to complete in 2-5 seconds instead of 15-25 seconds,
**so that** my design workflow feels responsive and I can iterate quickly.

---

## Description

### Problem

`image-gen.ts` line 76 hardcodes `gemini-3-pro-image-preview` (Nano Banana Pro), the slow/expensive tier. No `imageConfig` is passed, so resolution defaults to maximum and aspect ratio defaults to 1:1 regardless of the target format.

### Solution

1. Swap model ID to `gemini-3.1-flash-image-preview` (Nano Banana 2)
2. Add `imageConfig` to the `generateContent` config with `aspectRatio` and `imageSize`
3. Read format-appropriate values from `knowledge/image-generation.yaml`

---

## Acceptance Criteria

- [x] **AC1:** `callGemini()` uses model `gemini-3.1-flash-image-preview` instead of `gemini-3-pro-image-preview`
- [x] **AC2:** `callGemini()` accepts `aspectRatio` and `imageSize` parameters and passes them as `config.imageConfig`
- [x] **AC3:** `generate_design_image` handler resolves `aspectRatio` from format using the `aspect_ratio_by_format` map in `knowledge/image-generation.yaml`
- [x] **AC4:** `generate_design_image` handler resolves `imageSize` from format using the `resolution_by_format` map in `knowledge/image-generation.yaml`
- [x] **AC5:** When no format is provided, defaults to `aspectRatio: "1:1"` and `imageSize: "1K"`
- [x] **AC6:** Fallback chain (Gemini fail → picsum placeholder) still works
- [x] **AC7:** `npm run build` succeeds with no errors

---

## Tasks

### Phase 1: Model Swap (AC1, AC2)

- [x] Update `callGemini()` signature to accept `aspectRatio?: string` and `imageSize?: string`
- [x] Change model ID from `gemini-3-pro-image-preview` to `gemini-3.1-flash-image-preview`
- [x] Add `imageConfig: { aspectRatio, imageSize }` to the `config` object when values are provided

### Phase 2: Format Mapping (AC3, AC4, AC5)

- [x] Local lazy-loaded knowledge reader in image-gen.ts (avoids cross-module import issues)
- [x] In `generate_design_image` handler, resolve `aspectRatio` from format key using `aspect_ratio_by_format`
- [x] In `generate_design_image` handler, resolve `imageSize` from format key using `resolution_by_format`
- [x] Apply defaults (`1:1`, `1K`) when format is missing or not mapped

### Phase 3: Verify (AC6, AC7)

- [x] Fallback to picsum still triggers on Gemini failure (code path unchanged)
- [x] Run `npm run build` — clean build, no errors

---

## Dev Notes

- `callGemini()` is at `figmento-mcp-server/src/tools/image-gen.ts:72-98`
- The `@google/genai` SDK `generateContent` accepts `config.imageConfig` — see `knowledge/image-generation.yaml` for the full API reference
- Knowledge file is at `figmento-mcp-server/knowledge/image-generation.yaml` — read the `migration_notes` section at the bottom
- `loadKnowledge()` from `intelligence.ts` uses lazy caching — if importing across modules is complex, a local inline map is acceptable for SP-1

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/image-gen.ts` | MODIFY | Swap model ID, add imageConfig, add format mapping |
| `figmento-mcp-server/knowledge/image-generation.yaml` | READ | Reference for aspect_ratio_by_format and resolution_by_format |

---

## Definition of Done

- [ ] Model ID is `gemini-3.1-flash-image-preview`
- [ ] `imageConfig` with aspectRatio + imageSize is sent to Gemini API
- [ ] Format-aware resolution/aspect-ratio selection works
- [ ] Build passes
- [ ] Fallback chain intact

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation 10/10 → GO. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. All ACs met. Build passes. |
