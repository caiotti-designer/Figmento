# Story MF-2: Drag & Drop Zone on Chat Area

**Status:** Ready
**Priority:** High (P1)
**Complexity:** S (3 points) — 2 files modify (ui.html, chat.ts)
**Epic:** MF — Multi-File Import Pipeline
**Depends on:** MF-1 (multi-file queue must exist)
**PRD:** PM gap analysis 2026-03-17 — G1 "No drag & drop"

---

## Business Value

Drag & drop is the most natural way to provide files to a design tool. Users have files on their desktop, in Finder/Explorer, or in another app — they expect to drag them directly into the chat. Currently they must click the 📎 button and use a file picker dialog, which is slower and feels dated.

## Out of Scope

- New file type support (MF-3 handles PDF/TXT)
- Auto-analysis (MF-4)
- Drag & drop from Figma canvas (different event model)

## Risks

- **Figma iframe restrictions** — `data:` URL iframes may restrict `dragover`/`drop` events. Need to test early.
- **Conflict with text selection drag** — Must only activate the drop zone for file drags, not text drags.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, files can be dragged from desktop into chat, visual drop zone feedback works"
quality_gate_tools: ["esbuild", "manual Figma plugin test"]
```

---

## Story

**As a** designer using Figmento,
**I want** to drag files from my desktop directly into the chat area,
**so that** I can share project files quickly without using file picker dialogs.

---

## Description

### Solution

1. Add `dragover`, `dragleave`, `drop` event listeners on the chat surface (`main.chat-surface`)
2. On `dragover` with files: show a full-surface drop overlay with visual feedback ("Drop files here")
3. On `drop`: extract files from `DataTransfer`, validate, and add to `pendingAttachments` queue (from MF-1)
4. On `dragleave` or `drop`: hide the overlay

### Drop Zone Overlay

```
┌─────────────────────────────────────────────┐
│                                             │
│              ┌───────────┐                  │
│              │  ↓  icon  │                  │
│              └───────────┘                  │
│          Drop files here                    │
│     Images, PDFs, SVGs, text files          │
│                                             │
└─────────────────────────────────────────────┘
```

Overlay: semi-transparent accent background with dashed border, centered icon + text. Appears on top of the chat surface during file drag.

---

## Acceptance Criteria

- [ ] **AC1:** Dragging files over the chat surface shows a drop overlay
- [ ] **AC2:** Overlay has a dashed border, upload icon, "Drop files here" text, and supported types hint
- [ ] **AC3:** Dropping files adds them to the attachment queue (MF-1)
- [ ] **AC4:** Multiple files in a single drop are all added to the queue
- [ ] **AC5:** MF-1 limits still enforced (10 files / 50MB) — excess files show error toast
- [ ] **AC6:** Dragging text (not files) does NOT trigger the overlay
- [ ] **AC7:** Overlay disappears on `dragleave` or after `drop`
- [ ] **AC8:** `npm run build` succeeds in `figmento/`

---

## Tasks

### Phase 1: Event Listeners (AC1, AC6, AC7)

- [ ] Add `dragover` listener on `.chat-surface` — check `e.dataTransfer.types.includes('Files')` before showing overlay
- [ ] Add `dragleave` listener — hide overlay (use counter to handle child element events)
- [ ] Add `drop` listener — prevent default, process files, hide overlay
- [ ] Use a `dragCounter` integer to handle nested element dragenter/dragleave correctly

### Phase 2: Drop Overlay UI (AC2)

- [ ] Create `.drop-overlay` element (hidden by default): full-surface, semi-transparent, centered content
- [ ] CSS: `position: absolute; inset: 0; background: var(--accent-dim); border: 2px dashed var(--accent); border-radius: var(--radius-lg);`
- [ ] Icon (arrow-down SVG) + "Drop files here" + supported types hint
- [ ] Show class: `.drop-overlay.active { display: flex; }`

### Phase 3: File Processing (AC3, AC4, AC5)

- [ ] On drop: iterate `e.dataTransfer.files`, create `AttachmentFile` for each
- [ ] Call `addAttachment()` from MF-1 for each file (respects limits)
- [ ] Trigger `renderAttachmentQueue()` to update preview

### Phase 4: Build & Verify (AC8)

- [ ] Run `npm run build` in `figmento/`
- [ ] Test: drag PNG from desktop → overlay shows → drop → file queued
- [ ] Test: drag 5 files → all 5 added
- [ ] Test: drag text selection → no overlay

---

## Dev Notes

- The chat surface is `<main class="chat-surface">` — add event listeners there
- `dragenter`/`dragleave` fire on child elements too — use a counter: increment on `dragenter`, decrement on `dragleave`, show overlay when counter > 0
- `e.dataTransfer.types` contains `'Files'` for file drags but not for text drags — this is the discriminator
- Files from `e.dataTransfer.files` are `File` objects — use `FileReader.readAsDataURL()` same as the upload handler

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui/chat.ts` | MODIFY | Add drag/drop event listeners, file processing |
| `figmento/src/ui.html` | MODIFY | CSS for `.drop-overlay` + HTML element |

---

## Definition of Done

- [ ] Files can be dragged into chat area
- [ ] Visual overlay provides feedback during drag
- [ ] Dropped files queue correctly
- [ ] Text drags don't trigger overlay
- [ ] Plugin builds

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm (Morgan) | Initial draft |
| 2026-03-17 | @po (Pax) | Validation GO (10/10). Status Draft → Ready |
