# Epic MF: Multi-File Import Pipeline

**Status:** Done — All 5 stories shipped (retroactive — @po audit 2026-04-13)
**Priority:** Critical (P0)
**Owner:** @pm (Morgan)
**Target:** Figmento Plugin v2.1
**Depends on:** Epic UI (Done) — new single-surface chat layout

---

## Vision

Enable designers to drag & drop multiple files (PDFs, images, SVGs, text) into Figmento's chat, have the agent automatically analyze everything, and start working — all in one flow.

## Problem

The plugin currently supports single-image upload only (paste or file picker). Designers need to provide project context (PDF briefs, reference images, logos, text specs) but have no way to batch-upload files or provide non-image files like PDFs. The backend tools (`store_temp_file`, `import_pdf`, brand assets) already exist — the UI and orchestration layer are the bottleneck.

## Stories

| Story | Title | Effort | Dependencies |
|-------|-------|--------|-------------|
| MF-1 | Multi-file attachment queue | M | None |
| MF-2 | Drag & drop zone on chat area | S | MF-1 |
| MF-3 | Expand file type support (PDF, TXT, SVG-as-doc) | S | MF-1 |
| MF-4 | Auto-analysis orchestrator | L | MF-1, MF-3 |
| MF-5 | Selection context in chat | M | None (parallel to MF-1) |

## Backend Already Built (CF Epic — Done)

| Tool | Status | Purpose |
|------|--------|---------|
| `store_temp_file` | Done | Base64 → disk, returns file path |
| `import_pdf` | Done | Extract text, colors, fonts from PDF |
| `list_temp_files` | Done | List files in session directory |
| `save_brand_assets` | Done | Persist assets to brand collection |
| `place_brand_asset` | Done | Place asset on Figma canvas |

## Success Criteria

1. User can drag 5+ files into the chat area
2. Files queue with type badges (PDF, PNG, SVG, TXT) and remove buttons
3. PDF, TXT, and SVG-as-document are accepted alongside images
4. On send, agent auto-classifies and analyzes all files
5. Agent responds with a structured summary of what it found
6. All existing single-image workflows still work
7. Figma frame selection appears in chat context — agent knows which nodes to edit

## Risks

- **Large base64 payloads** — 5 files × 20MB = 100MB in memory. May need to stream files to `store_temp_file` server-side instead of inline base64.
- **Relay payload limits** — Railway may reject very large WebSocket frames. Consider chunked uploads.
- **PDF rendering** — `import_pdf` uses `pdf-parse` which extracts text but not visual layout. Image-only PDFs return empty text.

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm (Morgan) | Epic created from file handling gap analysis |
| 2026-04-13 | @po (Pax) | **Epic Done (retroactive).** Audit confirms all 5 MF stories shipped via in-code markers: MF-1 (multi-file queue) at `chat.ts:100-114`; MF-2 (drag & drop) at `chat.ts:1582`; MF-3 (PDF/TXT filters) at `ui.html:4824` + `chat.ts:1196`; MF-4 (`buildClientFileContext`) at `chat.ts:2208`; MF-5 (selection context) at `chat.ts:1568-2232`. Status: Draft → Done. |
