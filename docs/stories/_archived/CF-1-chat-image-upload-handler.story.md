# Story CF-1: Chat Image Upload Handler

**Status:** Done
**Priority:** Critical (P0)
**Complexity:** M (5 points) — 1 file major modify (chat.ts), 1 file minor modify (bridge.ts)
**Epic:** Chat File Pipeline — Chat-First Workflow
**Depends on:** None
**PRD:** PM analysis 2026-03-15 — Chat as primary workflow, file import support

---

## Business Value

The plugin chat panel already supports Ctrl+V paste for images (4MB limit, data URI). To become the primary design workflow, it needs: a file upload button for non-paste scenarios, 20MB file size limit, support for SVG, and the ability to send file metadata to the MCP server so tools can reference uploaded files.

## Out of Scope

- Server-side temp storage (CF-2)
- PDF upload support (CF-6)
- Drag-and-drop (future enhancement)

## Risks

- 20MB base64 data URIs in chat messages may cause performance issues — consider chunked transfer or file path reference instead of inline base64
- SVG files may contain scripts — sanitize on upload

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds (npm run build in figmento-plugin), paste and upload both work"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento chat,
**I want** to paste or upload images directly in the chat input,
**so that** I can provide reference images, logos, and screenshots for design generation.

---

## Description

### Problem

The chat paste handler (chat.ts:485-507) works for images but has a 4MB limit and no file picker button. Users can only paste — they can't browse and select files. The `pendingAttachment` state (line 69) stores a data URI string. For large files (logos, high-res screenshots), 4MB is too small.

### Solution

1. Increase paste size limit from 4MB to 20MB
2. Add a file upload button (📎) next to the chat input
3. Accept PNG, JPG, WEBP, SVG file types
4. For files > 5MB: send file to MCP server via a new `upload_file` bridge command instead of inline base64
5. Update `sendMessage()` to include file reference (path or base64) in the message payload

---

## Acceptance Criteria

- [ ] **AC1:** Paste handler accepts images up to 20MB (was 4MB)
- [ ] **AC2:** A file upload button (📎 icon) is visible next to the chat input area
- [ ] **AC3:** Clicking the upload button opens a file picker filtered to PNG, JPG, JPEG, WEBP, SVG
- [ ] **AC4:** Selected files appear in the existing `renderAttachmentPreview()` UI with thumbnail and remove button
- [ ] **AC5:** Files exceeding 20MB show an error toast: "File too large (max 20MB)"
- [ ] **AC6:** The attachment data (base64 data URI or file reference) is included in the message sent to the relay/API
- [ ] **AC7:** SVG files render a generic icon preview (not inline SVG) to prevent XSS
- [ ] **AC8:** `npm run build` succeeds in figmento-plugin

---

## Tasks

### Phase 1: Upload Button (AC2, AC3, AC5)

- [ ] Add a `<button>` with 📎 icon in the chat input bar (near send button)
- [ ] Wire click handler to create a hidden `<input type="file" accept=".png,.jpg,.jpeg,.webp,.svg">`
- [ ] On file selection, validate size (≤ 20MB), show error toast if exceeded
- [ ] Read file via `FileReader.readAsDataURL()` → set `pendingAttachment`
- [ ] Call existing `renderAttachmentPreview()` to show thumbnail

### Phase 2: Expand Paste Limit (AC1, AC7)

- [ ] Change the 4MB check on line ~495 to 20MB (`4 * 1024 * 1024` → `20 * 1024 * 1024`)
- [ ] For SVG files pasted/uploaded, render a placeholder icon instead of inline `<img src="data:image/svg+xml...">`

### Phase 3: Message Integration (AC6)

- [ ] In `sendMessage()`, ensure `capturedAttachment` (data URI) is passed through to relay and direct API paths
- [ ] Verify the existing `attachmentBase64` field in relay body (line 757-769) works for larger files
- [ ] For direct Anthropic/Gemini paths, verify image content block format handles the attachment

### Phase 4: Build Verify (AC8)

- [ ] Run `npm run build` in figmento-plugin

---

## Dev Notes

- `pendingAttachment` (chat.ts:69) is a data URI string — the existing pattern works, just needs size limit increase
- `renderAttachmentPreview()` (chat.ts:222-255) already renders thumbnail + buttons — reuse as-is
- Paste handler is at chat.ts:485-507, reads `clipboardData.items` for `image/*` MIME types
- The relay path sends `attachmentBase64` (line 757-769), the direct Anthropic path builds multimodal content blocks (line 916-926)
- For very large files, the relay may reject the payload — test with 15-20MB files on Railway

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-plugin/src/ui/chat.ts` | MODIFY | Add upload button, increase paste limit, SVG handling |

---

## Definition of Done

- [ ] Upload button visible and functional
- [ ] Paste accepts up to 20MB
- [ ] File picker filters to image types
- [ ] Attachment included in chat messages
- [ ] Plugin builds

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation GO. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. Upload button + 20MB limit + SVG preview. Plugin builds. |
