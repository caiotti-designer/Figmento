# Story MF-1: Multi-File Attachment Queue

**Status:** Done (retroactive — @po audit 2026-04-13)
**Priority:** Critical (P0)
**Complexity:** M (5 points) — 2 files modify (ui.html, chat.ts)
**Epic:** MF — Multi-File Import Pipeline
**Depends on:** None (UI epic complete)
**PRD:** PM gap analysis 2026-03-17 — G3 "Single file only"

---

## Business Value

Currently `pendingAttachment` is a single string variable — users can only attach one image per message. Designers need to send project briefs (PDF), reference images (3-4 PNGs), and logos (SVG) in a single message. This story replaces the single-attachment pattern with a multi-file queue.

## Out of Scope

- Drag & drop (MF-2)
- PDF/TXT file type support (MF-3) — this story keeps the existing image-only accept filter
- Auto-analysis orchestration (MF-4)

## Risks

- **Memory pressure** — Multiple 20MB files as base64 data URIs could consume 100MB+ in the iframe. Consider a hard limit of 10 files / 50MB total.
- **Message payload size** — The relay and API calls may reject very large payloads with multiple images. May need to send files via `store_temp_file` first and pass paths instead of inline base64.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, multiple files can be queued and sent, single-file workflow still works"
quality_gate_tools: ["esbuild", "manual Figma plugin test"]
```

---

## Story

**As a** designer using Figmento chat,
**I want** to attach multiple files to a single message,
**so that** I can provide all project context (brief + references + assets) at once.

---

## Description

### Problem

`pendingAttachment` (chat.ts:69) is a `string | null` — one data URI. The upload button and paste handler both overwrite it. Users must send multiple messages to share multiple files.

### Solution

1. Replace `pendingAttachment: string | null` with `pendingAttachments: AttachmentFile[]`
2. Each `AttachmentFile` has: `{ name: string, type: string, dataUri: string, size: number }`
3. Upload/paste adds to the array instead of overwriting
4. Preview area shows all queued files with type badges and individual remove buttons
5. On send, all attachments are included in the message
6. Hard limit: 10 files, 50MB total

### Attachment Preview UI

```
┌─────────────────────────────────────────────┐
│ 📄 brief.pdf  4.2MB  [×]                   │
│ 🖼 reference1.png  1.8MB  [×]              │
│ 🖼 reference2.png  2.1MB  [×]              │
│ 🎨 logo.svg  48KB  [×]                     │
│                          [Clear all]  4 files│
└─────────────────────────────────────────────┘
```

---

## Acceptance Criteria

- [ ] **AC1:** `pendingAttachment` replaced with `pendingAttachments: AttachmentFile[]` array
- [ ] **AC2:** Paste handler adds to the array (does not overwrite previous attachments)
- [ ] **AC3:** Upload button adds to the array (multiple sequential uploads queue)
- [ ] **AC4:** Preview area shows all queued files with filename, size badge, and remove (×) button
- [ ] **AC5:** Clicking × on a file removes only that file from the queue
- [ ] **AC6:** "Clear all" link visible when 2+ files are queued
- [ ] **AC7:** File count and total size displayed (e.g., "4 files · 8.1 MB")
- [ ] **AC8:** Hard limit enforced: max 10 files, max 50MB total. Error toast if exceeded.
- [ ] **AC9:** On send, all queued attachments are included in the message payload
- [ ] **AC10:** After send, the attachment queue is cleared
- [ ] **AC11:** Single-file paste/upload still works (backward compatible)
- [ ] **AC12:** `npm run build` succeeds in `figmento/`

---

## Tasks

### Phase 1: Data Model (AC1)

- [ ] Define `AttachmentFile` interface: `{ id: string, name: string, type: string, dataUri: string, size: number }`
- [ ] Replace `let pendingAttachment: string | null = null` with `let pendingAttachments: AttachmentFile[] = []`
- [ ] Add helper functions: `addAttachment(file)`, `removeAttachment(id)`, `clearAttachments()`, `getTotalSize()`

### Phase 2: Upload/Paste Integration (AC2, AC3, AC8)

- [ ] Update paste handler to push to `pendingAttachments` array instead of overwriting
- [ ] Update file upload handler to push to array
- [ ] Add limit checks: if `pendingAttachments.length >= 10` or `getTotalSize() + newFile.size > 50MB` → show error toast
- [ ] Generate unique ID for each attachment (e.g., `Date.now() + '-' + Math.random()`)

### Phase 3: Preview UI (AC4, AC5, AC6, AC7)

- [ ] Replace `renderAttachmentPreview(dataUri)` with `renderAttachmentQueue()`
- [ ] Create queue container: vertical list above the input area
- [ ] Each row: type icon (📄/🖼/🎨), filename (truncated), size badge, × button
- [ ] × button calls `removeAttachment(id)` + re-renders queue
- [ ] "Clear all" link when 2+ files
- [ ] Footer: file count + total size
- [ ] CSS: `.attachment-queue`, `.attachment-item`, `.attachment-remove`, `.attachment-clear`, `.attachment-meta`

### Phase 4: Send Integration (AC9, AC10, AC11)

- [ ] Update `sendMessage()` to capture `pendingAttachments` array
- [ ] For single attachment: send as `attachmentBase64` (backward compatible with relay)
- [ ] For multiple attachments: send as `attachments: AttachmentFile[]` in message payload
- [ ] After send: call `clearAttachments()` + clear preview UI
- [ ] Update user bubble to show "📎 N files attached" badge

### Phase 5: Build & Verify (AC12)

- [ ] Run `npm run build` in `figmento/`
- [ ] Test: paste image → shows in queue → paste another → both show
- [ ] Test: upload via button → queues → send → both included
- [ ] Test: remove one file → only that file removed
- [ ] Test: exceed 10 files → error toast
- [ ] Test: exceed 50MB → error toast

---

## Dev Notes

- `pendingAttachment` is at chat.ts:69, used in paste handler (~L499-521), upload handler (~L524-555), and `sendMessage()` (~L694-705)
- `renderAttachmentPreview()` at chat.ts:222-269 creates a single-image preview — needs full rewrite to multi-file queue
- The relay `ChatTurnRequest` interface has `attachmentBase64?: string` — for backward compat, send first image there, additional images as separate array
- For the Claude Code path, multiple images will be sent as multiple `image` content blocks in the SDK message

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui/chat.ts` | MODIFY | Replace single attachment with queue, new preview UI, send integration |
| `figmento/src/ui.html` | MODIFY | CSS for `.attachment-queue`, `.attachment-item`, etc. |

---

## Definition of Done

- [ ] Multiple files can be queued via paste and upload
- [ ] Preview shows all files with remove buttons
- [ ] Limits enforced (10 files, 50MB)
- [ ] Send includes all attachments
- [ ] Single-file workflow still works
- [ ] Plugin builds

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm (Morgan) | Initial draft |
| 2026-03-17 | @po (Pax) | Validation GO (10/10). Status Draft → Ready |
| 2026-04-13 | @po (Pax) | **Retroactive Done.** Audit confirms `pendingAttachments` array + `AttachmentFile[]` type + MF-1 comment in `figmento/src/ui/chat.ts:100-114`. Legacy `pendingAttachment` kept as shim. Status: Ready → Done. |
