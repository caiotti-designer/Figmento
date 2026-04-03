# Story CF-3: Save Brand Assets Action

**Status:** Done
**Priority:** High (P1)
**Complexity:** M (3 points) — extend file-storage.ts, add manifest management
**Epic:** Chat File Pipeline — Chat-First Workflow
**Depends on:** CF-2 (temp file storage provides source files)
**PRD:** PM analysis 2026-03-15 — Optional save with name + description

---

## Business Value

Users import logos, screenshots, and brand materials into chat sessions. These are temporary by default (24h expiry). When a user wants to reuse assets across sessions, they trigger "Save brand assets" which copies files from temp to a persistent `brand-assets/{name}/` folder with a manifest. This creates a reusable asset library without forcing persistence on every upload.

## Out of Scope

- Automatic brand color/font extraction from assets (CF-6 handles PDF extraction)
- Asset versioning
- Cloud sync

## Risks

- Disk space accumulation from saved assets — document that users manage their own cleanup
- Name collisions — overwrite with confirmation or reject?

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, save and load round-trip works"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** to save my uploaded brand assets (logos, images) with a name and description,
**so that** I can reuse them across chat sessions without re-uploading.

---

## Description

### Problem

Temp files expire after 24h. Brand assets like logos, product photos, and style references need to persist. The existing `save_brand_kit` only stores colors and fonts as YAML — no file assets.

### Solution

New MCP tools:
- `save_brand_assets(name, description, files[])` — copies files from temp to `brand-assets/{name}/` with a `manifest.yaml`
- `load_brand_assets(name)` — returns manifest + file paths
- `list_brand_assets()` — lists all saved brand asset collections

---

## Acceptance Criteria

- [ ] **AC1:** `save_brand_assets` accepts `{ name: string, description: string, filePaths: string[] }` — copies files from temp to `brand-assets/{name}/`
- [ ] **AC2:** A `manifest.yaml` is created in `brand-assets/{name}/` containing: name, description, files (list with original filename + saved filename), createdAt (ISO date)
- [ ] **AC3:** Asset name is sanitized (lowercase, alphanumeric + hyphens only)
- [ ] **AC4:** If a brand asset collection with the same name exists, it is overwritten (files replaced, manifest updated)
- [ ] **AC5:** `load_brand_assets(name)` returns the manifest data + absolute file paths for each asset
- [ ] **AC6:** `list_brand_assets()` returns all saved collection names with descriptions
- [ ] **AC7:** `brand-assets/` directory is at the project root level
- [ ] **AC8:** `npm run build` succeeds

---

## Tasks

### Phase 1: Save Tool (AC1-AC4, AC7)

- [ ] Add `save_brand_assets` tool in `file-storage.ts` (or new `brand-assets.ts`)
- [ ] Sanitize name: lowercase, strip non-alphanumeric except hyphens
- [ ] Create `brand-assets/{name}/` directory
- [ ] Copy each file from source path to `brand-assets/{name}/`
- [ ] Generate `manifest.yaml` with metadata

### Phase 2: Load & List Tools (AC5, AC6)

- [ ] Add `load_brand_assets` tool — reads `manifest.yaml`, resolves absolute paths
- [ ] Add `list_brand_assets` tool — scans `brand-assets/` for subdirectories with `manifest.yaml`

### Phase 3: Build (AC8)

- [ ] Register in `server.ts`
- [ ] Run `npm run build`

---

## Dev Notes

- `brand-assets/` should be at project root (alongside `temp/`)
- The manifest.yaml format:
  ```yaml
  name: "my-company"
  description: "Company logo and brand photos"
  created_at: "2026-03-15T12:00:00Z"
  files:
    - original: "logo.svg"
      saved: "logo.svg"
      type: "image/svg+xml"
      size_bytes: 12345
    - original: "hero-ref.png"
      saved: "hero-ref.png"
      type: "image/png"
      size_bytes: 2345678
  ```
- The `save_brand_kit` (intelligence.ts) stores colors/fonts — `save_brand_assets` stores files. They're complementary. A future story could unify them.
- File copy: use `fs.copyFileSync(src, dest)` — simple and reliable

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/file-storage.ts` | MODIFY | Add save/load/list brand asset tools |
| `figmento-mcp-server/src/server.ts` | MODIFY | Register new tools if in separate module |

---

## Definition of Done

- [ ] save_brand_assets copies files + creates manifest
- [ ] load_brand_assets returns manifest + paths
- [ ] list_brand_assets lists all collections
- [ ] Name sanitization works
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation GO. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. All ACs met. Build passes. |
