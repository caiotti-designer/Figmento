# Story MF-3: Expand File Type Support (PDF, TXT, SVG-as-Doc)

**Status:** Ready
**Priority:** High (P1)
**Complexity:** S (3 points) — 2 files modify (ui.html, chat.ts)
**Epic:** MF — Multi-File Import Pipeline
**Depends on:** MF-1 (multi-file queue)
**PRD:** PM gap analysis 2026-03-17 — G2 "No PDF/text in file picker"

---

## Business Value

The file picker only accepts images (`image/png, image/jpeg, image/webp, image/svg+xml`). Designers commonly need to share PDF briefs, text specs, and SVG logos as documents (not images). The backend `import_pdf` tool already exists — it just can't receive files because the UI blocks them.

## Out of Scope

- Parsing/analysis of files (MF-4 handles orchestration)
- New backend tools — `store_temp_file` and `import_pdf` already exist
- Office formats (.docx, .pptx) — future enhancement

## Risks

- **PDF size** — PDFs can be 50MB+. The 50MB total queue limit from MF-1 should catch this.
- **TXT encoding** — Non-UTF-8 text files may render incorrectly. Assume UTF-8.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, PDFs and TXT files can be uploaded and queued, type badges show correctly"
quality_gate_tools: ["esbuild", "manual Figma plugin test"]
```

---

## Story

**As a** designer using Figmento,
**I want** to upload PDFs, text files, and SVGs as documents alongside images,
**so that** I can share project briefs and text specs with the AI agent.

---

## Description

### Solution

1. Expand the file input `accept` attribute to include PDF and TXT
2. Update paste handler to accept `application/pdf` MIME type
3. Add file type detection with appropriate preview icons
4. SVG files get dual handling: image preview for small SVGs, document icon for large ones

### Supported File Types

| Type | MIME | Extension | Preview | Max Size |
|------|------|-----------|---------|----------|
| PNG | `image/png` | `.png` | Thumbnail | 20MB |
| JPEG | `image/jpeg` | `.jpg, .jpeg` | Thumbnail | 20MB |
| WebP | `image/webp` | `.webp` | Thumbnail | 20MB |
| SVG | `image/svg+xml` | `.svg` | Icon (XSS safe) | 5MB |
| PDF | `application/pdf` | `.pdf` | 📄 icon + page count | 20MB |
| Text | `text/plain` | `.txt` | 📝 icon + line count | 5MB |

### Type Badge Icons

- Images (PNG/JPG/WebP): `🖼` + thumbnail
- SVG: `🎨 SVG` text badge (no inline render — XSS)
- PDF: `📄 PDF` + file size
- Text: `📝 TXT` + file size

---

## Acceptance Criteria

- [ ] **AC1:** File picker `accept` includes `.pdf,.txt` alongside image types
- [ ] **AC2:** PDF files can be selected and added to the attachment queue
- [ ] **AC3:** TXT files can be selected and added to the attachment queue
- [ ] **AC4:** PDF files show 📄 icon + "PDF" badge + file size in the queue preview
- [ ] **AC5:** TXT files show 📝 icon + "TXT" badge + file size in the queue preview
- [ ] **AC6:** Image files still show thumbnail previews (backward compatible)
- [ ] **AC7:** SVG files show 🎨 icon badge (no inline render — XSS prevention)
- [ ] **AC8:** Drag & drop (MF-2) also accepts the new file types
- [ ] **AC9:** `npm run build` succeeds in `figmento/`

---

## Tasks

### Phase 1: File Input Update (AC1)

- [ ] Update `<input type="file" id="chat-file-upload" accept="...">` to include `.pdf,.txt`
- [ ] Update the `validTypes` array in the upload handler to include `application/pdf`, `text/plain`

### Phase 2: Type Detection (AC4, AC5, AC7)

- [ ] Add `getFileTypeInfo(file: File)` helper: returns `{ icon: string, badge: string, isImage: boolean }`
- [ ] Image types → `{ icon: '🖼', badge: 'IMG', isImage: true }`
- [ ] SVG → `{ icon: '🎨', badge: 'SVG', isImage: false }` (XSS safe)
- [ ] PDF → `{ icon: '📄', badge: 'PDF', isImage: false }`
- [ ] TXT → `{ icon: '📝', badge: 'TXT', isImage: false }`

### Phase 3: Preview Integration (AC4, AC5, AC6)

- [ ] Update `renderAttachmentQueue()` (from MF-1) to use `getFileTypeInfo()`
- [ ] For image types: show thumbnail (data URI in `<img>`)
- [ ] For non-image types: show icon + badge + size text
- [ ] Add CSS for `.attachment-badge` (pill shape, muted bg)

### Phase 4: Build & Verify (AC9)

- [ ] Run `npm run build` in `figmento/`
- [ ] Test: upload PDF → shows in queue with 📄 badge
- [ ] Test: upload TXT → shows in queue with 📝 badge
- [ ] Test: upload PNG → still shows thumbnail
- [ ] Test: drag PDF into chat (if MF-2 done) → queues correctly

---

## Dev Notes

- The file input is at ui.html: `<input type="file" id="chat-file-upload" accept=".png,.jpg,.jpeg,.webp,.svg">`
- The `validTypes` array in chat.ts (~L534): `['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']`
- PDF files as base64 data URIs can be very large — the MF-1 50MB limit applies
- For the API path, PDFs will be sent as base64 data URIs initially. MF-4 will route them to `store_temp_file` → `import_pdf` for proper parsing.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui/chat.ts` | MODIFY | Expand valid types, add type detection helper, update preview rendering |
| `figmento/src/ui.html` | MODIFY | Update file input accept, CSS for attachment badges |

---

## Definition of Done

- [ ] PDF and TXT files accepted by file picker and drag-drop
- [ ] Type-appropriate previews in queue
- [ ] Existing image workflow unchanged
- [ ] Plugin builds

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm (Morgan) | Initial draft |
| 2026-03-17 | @po (Pax) | Validation GO (10/10). Status Draft → Ready |
