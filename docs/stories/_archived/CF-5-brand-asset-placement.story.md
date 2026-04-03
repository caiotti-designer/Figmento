# Story CF-5: Brand Asset Placement Tool

**Status:** Done
**Priority:** High (P1)
**Complexity:** S (2 points) — 1 new tool leveraging existing create_image
**Epic:** Chat File Pipeline — Chat-First Workflow
**Depends on:** CF-2 (temp files), CF-3 (saved brand assets)
**PRD:** PM analysis 2026-03-15 — Place logos and brand images in designs

---

## Business Value

After a user saves brand assets (CF-3), they need a way to place them in Figma designs. Currently `place_generated_image` only reads from `IMAGE_OUTPUT_DIR`. A new tool reads from both temp files and brand asset directories, making it easy to drop a logo or brand image into any design.

## Out of Scope

- SVG-to-vector conversion (places as raster image)
- Auto-sizing to fit parent frame
- Logo detection / auto-placement

## Risks

- Large logos as raster images may look pixelated — document that SVG source is preferred
- Path security — must validate file is within allowed directories

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, can place assets from both temp and brand-assets directories"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** to place my saved brand assets (logos, images) into Figma designs,
**so that** my designs use my actual brand materials instead of placeholders.

---

## Description

### Problem

`place_generated_image` only allows files within `IMAGE_OUTPUT_DIR`. Brand assets live in `brand-assets/{name}/` and temp files in `temp/imports/{sessionId}/`. No tool can place files from these locations.

### Solution

New MCP tool `place_brand_asset` that reads an image from either temp storage or saved brand assets and places it in a Figma frame.

---

## Acceptance Criteria

- [ ] **AC1:** `place_brand_asset` accepts `{ source: "temp" | "saved", sessionId?: string, assetName?: string, filename: string, parentId: string, x?: number, y?: number, width?: number, height?: number }`
- [ ] **AC2:** When `source: "temp"`, reads from `temp/imports/{sessionId}/{filename}`
- [ ] **AC3:** When `source: "saved"`, reads from `brand-assets/{assetName}/{filename}`
- [ ] **AC4:** File is read, converted to base64 data URI, and placed via `sendDesignCommand('create_image', ...)`
- [ ] **AC5:** Supports PNG, JPG, JPEG, WEBP, SVG file types
- [ ] **AC6:** Returns `{ nodeId, width, height }` of the placed image
- [ ] **AC7:** Invalid paths (traversal, missing files) return clear errors
- [ ] **AC8:** `npm run build` succeeds

---

## Tasks

### Phase 1: Place Tool (AC1-AC6)

- [ ] Add `place_brand_asset` tool in `file-storage.ts` or `canvas.ts`
- [ ] Resolve file path based on source type
- [ ] Read file, detect MIME from extension, encode to base64 data URI
- [ ] Call `sendDesignCommand('create_image', { imageData, name, width, height, x, y, parentId, scaleMode: 'FILL' })`
- [ ] Return nodeId + dimensions

### Phase 2: Security & Errors (AC7, AC8)

- [ ] Validate resolved path is within `temp/` or `brand-assets/` directories
- [ ] Handle missing files, invalid source types
- [ ] Run `npm run build`

---

## Dev Notes

- Reuse the file reading + base64 encoding pattern from `place_generated_image` in canvas.ts (lines 207-226)
- For SVG: MIME is `image/svg+xml`, base64 encode the raw SVG content — Figma accepts SVG as image data
- Default width/height: read from image metadata if not provided (or default 200×200)
- The tool needs `sendDesignCommand` — register alongside canvas tools or pass via closure

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/file-storage.ts` | MODIFY | Add place_brand_asset tool |
| `figmento-mcp-server/src/server.ts` | MODIFY | Ensure file-storage tools receive sendDesignCommand |

---

## Definition of Done

- [ ] Can place temp files and saved brand assets in Figma
- [ ] Supports all image types
- [ ] Path security validated
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation GO. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. All ACs met. Build passes. |
