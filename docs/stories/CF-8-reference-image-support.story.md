# Story CF-8: Nano Banana 2 Reference Image Support

**Status:** Done
**Priority:** Critical (P0)
**Complexity:** M (3 points) — modify callGemini + generate_design_image in image-gen.ts
**Epic:** Chat File Pipeline — Chat-First Workflow
**Depends on:** CF-2 (temp files provide reference image paths)
**PRD:** PM analysis 2026-03-15 — "Generate image like THIS but for MY brand"

---

## Business Value

Nano Banana 2 supports up to 14 reference images in a single API call. By passing the user's uploaded reference image as `inlineData` alongside the text prompt, the generated image inherits the reference's style, composition, and mood. This is the technical enabler for CF-4 (reference-based design) and CF-7 (ad variations).

## Out of Scope

- Multiple reference images in a single call (start with 1, extend later)
- Character consistency across variations (requires dedicated character reference slots)
- Reference image analysis/metadata (CF-4 handles that)

## Risks

- Large reference images (20MB) as base64 in the API call may hit Gemini payload limits
- Reference image quality affects output quality — document best practices

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, generate_design_image with referenceImagePath produces style-influenced output"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** to provide a reference image when generating design backgrounds,
**so that** the generated image follows the style and mood of my reference.

---

## Description

### Problem

`generate_design_image` and `callGemini` only accept a text prompt. Nano Banana 2 supports reference images via `inlineData` in the `contents` array, but this isn't wired up.

### Solution

1. Add `referenceImagePath` parameter to `generate_design_image`
2. In `callGemini`, when reference images are provided, include them as `inlineData` content parts before the text prompt
3. Read the reference image from disk, encode to base64, and include in the API call

---

## Acceptance Criteria

- [ ] **AC1:** `generate_design_image` accepts an optional `referenceImagePath: string` parameter
- [ ] **AC2:** When `referenceImagePath` is provided, the image file is read from disk and encoded to base64
- [ ] **AC3:** The base64 image is included in the Gemini API call as `inlineData` in the `contents` array, before the text prompt
- [ ] **AC4:** The text prompt is prefixed with "Generate an image inspired by this reference style: " when a reference is provided
- [ ] **AC5:** Supported reference image formats: PNG, JPG, JPEG, WEBP (detect MIME from extension)
- [ ] **AC6:** If the reference file doesn't exist or can't be read, the tool falls back to text-only generation (no error, just logs warning)
- [ ] **AC7:** `callGemini` accepts an optional `referenceImages: Array<{ data: string, mimeType: string }>` parameter
- [ ] **AC8:** `npm run build` succeeds

---

## Tasks

### Phase 1: Extend callGemini (AC7)

- [ ] Add `referenceImages?: Array<{ data: string, mimeType: string }>` to callGemini options
- [ ] When provided, build contents array: `[...imageInlineDataParts, { text: prompt }]`
- [ ] Without references, keep existing `[{ parts: [{ text: prompt }] }]` format

### Phase 2: Wire in generate_design_image (AC1-AC6)

- [ ] Add `referenceImagePath` to the tool schema
- [ ] In the handler, if path provided: read file, detect MIME, encode base64
- [ ] Pass to callGemini via the new `referenceImages` option
- [ ] Prefix prompt with reference instruction
- [ ] On file read failure: log warning, proceed without reference

### Phase 3: Build (AC8)

- [ ] Run `npm run build`

---

## Dev Notes

- Gemini API reference image format (from image-generation.yaml):
  ```javascript
  contents: [
    { inlineData: { mimeType: "image/jpeg", data: base64String } },
    { text: "Generate an image inspired by this reference style: ..." }
  ]
  ```
- Note: the `contents` field for `generateContent` can be either `string` or `Content[]`. When using reference images, use the array-of-parts format.
- Current `callGemini` uses: `contents: [{ parts: [{ text: prompt }] }]` — needs to change to include image parts when references are provided
- MIME detection: reuse the `mimeMap` pattern from canvas.ts place_generated_image
- Nano Banana 2 (Flash) supports up to 14 reference images (10 objects + 4 characters)
- For this story, support 1 reference image. Multi-reference is a future enhancement.
- File path validation: accept files from `temp/`, `brand-assets/`, and `IMAGE_OUTPUT_DIR`

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/image-gen.ts` | MODIFY | Add referenceImagePath param, extend callGemini for inlineData |

---

## Definition of Done

- [ ] Reference image passed to Gemini API as inlineData
- [ ] generate_design_image accepts referenceImagePath
- [ ] Graceful fallback if file missing
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation GO. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. All ACs met. Build passes. |
