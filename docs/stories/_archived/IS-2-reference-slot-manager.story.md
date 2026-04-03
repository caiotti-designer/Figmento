# Story IS-2: Reference Slot Manager (Upload, Categorize, Rename, Remove)

**Status:** Done
**Priority:** High (P0)
**Complexity:** M (5 points) — UI component + state management, image compression, drag & drop
**Epic:** IS — Image Studio
**Depends on:** IS-1 (Image Studio tab must exist)
**PRD:** [PRD-008](../prd/PRD-008-image-studio.md) — Phase A

---

## Business Value

Reference slots are the core differentiator of Image Studio vs chat-based image generation. They let users upload Style, Character, and Content references once and reuse them across multiple generations. This eliminates the re-upload friction that makes chat-based image generation tedious for iterative workflows.

## Out of Scope

- @tag system in prompt box (IS-4)
- Actually sending references to the Gemini API (IS-3)
- Cross-session persistence (future)
- Reference image editing/cropping

## Risks

- Image compression may degrade quality of small detailed logos (mitigated: use quality 0.85 JPEG, preserve PNG for transparency)
- Drag & drop may conflict with existing file upload handler in chat (mitigated: drop zones scoped to Image Studio panel only)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Upload/remove/rename works for all 3 categories, counter updates correctly, images compressed"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Image Studio,
**I want** to upload reference images and organize them as Style, Character, or Content,
**so that** I can reuse them across multiple image generations without re-uploading.

---

## Description

### Problem

When generating images with multiple references via chat, users must re-upload or re-describe reference images in every message. There's no way to organize references by role (style vs character vs content).

### Solution

A reference slot manager in the Image Studio tab with:
1. Three category sections: Style (✦ icon), Character (👤 icon), Content (📷 icon)
2. Upload via click (file picker) or drag & drop onto category
3. Each reference: thumbnail, editable name, type badge, remove button
4. Counter showing X/14 with category breakdown enforcement (max 4 Character, max 10 Style+Content)
5. Session-scoped storage (survives tab switches, cleared on plugin close)

### Data Model

```typescript
interface ImageReference {
  id: string;           // unique ID (uuid or counter)
  name: string;         // display name, default @img1, user-editable
  type: 'style' | 'character' | 'content';
  data: string;         // base64 encoded image
  mimeType: string;     // image/png, image/jpeg, image/webp
  thumbnailData: string; // compressed thumbnail base64 (48×48)
  originalSize: number; // bytes before compression
  addedAt: number;      // timestamp
}
```

---

## Acceptance Criteria

- [ ] AC1: Three pre-defined slot categories visible: Style (✦), Character (👤), Content (📷) — each with distinct icon
- [ ] AC2: "Add" button (+) opens file picker (PNG, JPG, WebP) — image added as Content by default
- [ ] AC3: Drag & drop images onto any category section to upload and auto-assign to that category
- [ ] AC4: Each reference shows: thumbnail (48×48), editable name field, type badge, remove (✕) button
- [ ] AC5: Default naming: `@img1`, `@img2`, `@img3`... (incremental, never reuses deleted names within session)
- [ ] AC6: User can rename by clicking the name — inline edit with Enter to confirm, Escape to cancel
- [ ] AC7: Counter at top-right of References section shows "X/14"
- [ ] AC8: Category limits enforced: max 4 Character references, max 10 Style+Content combined — "Add" disabled with tooltip when limit reached
- [ ] AC9: References survive tab switches (Chat → Image Studio → Chat → Image Studio = references intact)
- [ ] AC10: Images compressed to max 2MB before storage — JPEG quality 0.85, PNG preserved if has transparency
- [ ] AC11: Remove button deletes reference, updates counter, frees the slot
- [ ] AC12: Empty category shows dashed-border drop zone with "Drop image here" hint
- [ ] AC13: Non-image files (PDF, SVG, TXT, etc.) rejected on upload/drop with toast: "Only PNG, JPG, and WebP images are supported"

---

## Tasks

### Phase 1: Reference Data Store
- [ ] Create `ImageReference` interface and session store (in-memory Map)
- [ ] Counter logic: track per-category counts, enforce limits
- [ ] Name generator: `@img{N}` with monotonic counter

### Phase 2: UI Components
- [ ] Category section layout (horizontal scrollable row per category)
- [ ] Reference card component (thumbnail + name + badge + remove)
- [ ] "Add" button with file picker integration
- [ ] Empty state (dashed border drop zone)
- [ ] Counter display

### Phase 3: Upload + Compression
- [ ] File picker handler (accept image types)
- [ ] Image compression pipeline (canvas resize → toDataURL)
- [ ] Thumbnail generation (48×48 center-crop)
- [ ] Base64 conversion

### Phase 4: Drag & Drop
- [ ] Drop zone per category with visual highlight on dragover
- [ ] File type validation (reject non-images)
- [ ] Auto-assign type based on drop target

### Phase 5: Inline Edit + Remove
- [ ] Click name → contentEditable or input field
- [ ] Enter confirms, Escape cancels, click outside confirms
- [ ] Validate: alphanumeric + underscore only, no duplicates
- [ ] Remove button → confirm if referenced by @tags (future-proofing)

---

## Dev Notes

- **Image compression:** Use `<canvas>` to resize — draw image at original aspect into max 2048×2048, then `toDataURL('image/jpeg', 0.85)`. Check if result < 2MB, if not reduce quality to 0.7.
- **Thumbnail generation:** Separate 48×48 canvas for thumbnails — center-crop to square.
- **State management:** Simple in-memory store (Map or array), exposed as module-level variable in a new `image-studio-state.ts` file.
- **No need for event bus** — direct function calls between UI components within Image Studio.
- **Category sections should be horizontally scrollable** — user may have 4+ references in a single category.

---

## File List

### MODIFIED
- `figmento/src/ui.html` — Reference section HTML structure in Image Studio panel

### CREATED
- `figmento/src/ui/image-studio.ts` — Reference slot state management + UI logic

---

## Definition of Done

- [ ] Plugin builds successfully
- [ ] Upload via file picker works for all 3 image types (PNG, JPG, WebP)
- [ ] Drag & drop assigns to correct category
- [ ] Rename inline works with Enter/Escape
- [ ] Counter shows correct X/14 with category enforcement
- [ ] Tab switch preserves all references
- [ ] No console errors

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | @sm | Story created from Epic IS Phase A |
