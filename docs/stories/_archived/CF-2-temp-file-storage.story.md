# Story CF-2: Temp File Storage System

**Status:** Done
**Priority:** Critical (P0)
**Complexity:** M (5 points) — 1 new file (MCP tool), directory management
**Epic:** Chat File Pipeline — Chat-First Workflow
**Depends on:** CF-1 (chat sends files to MCP)
**PRD:** PM analysis 2026-03-15 — Temp storage with 24h auto-cleanup

---

## Business Value

Uploaded files need a server-side home so MCP tools can reference them by path. Without temp storage, every tool that needs the user's image would have to receive the full base64 inline — wasteful and fragile. A temp storage system with session-scoped directories and auto-cleanup keeps the disk clean.

## Out of Scope

- Persistent brand asset storage (CF-3)
- PDF-specific parsing (CF-6)
- Cloud storage / CDN

## Risks

- Temp files accumulating if cleanup fails — mitigate with startup sweep
- File path security — validate no path traversal in session IDs

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, files stored and retrievable, cleanup works"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** my uploaded files to be stored temporarily on the server,
**so that** MCP tools can access them by file path without re-uploading.

---

## Description

### Problem

When a user pastes/uploads an image in chat, it's sent as a base64 data URI. MCP tools like `analyze_reference()` and `place_generated_image()` expect file paths. There's no mechanism to receive a file, save it to disk, and return a reusable path.

### Solution

New MCP tool `store_temp_file` that:
1. Receives base64 data + filename + session ID
2. Saves to `temp/imports/{session-id}/{filename}`
3. Returns the absolute file path
4. Startup cleanup sweeps files older than 24h

---

## Acceptance Criteria

- [ ] **AC1:** MCP tool `store_temp_file` accepts `{ data: string (base64 data URI), filename: string, sessionId: string }` and returns `{ filePath: string }`
- [ ] **AC2:** Files are stored in `{project-root}/temp/imports/{sessionId}/{filename}`
- [ ] **AC3:** Session ID is sanitized — only alphanumeric + hyphens allowed
- [ ] **AC4:** Filenames are sanitized — no path traversal characters (`..`, `/`, `\`)
- [ ] **AC5:** Files exceeding 20MB are rejected with a clear error
- [ ] **AC6:** A `list_temp_files` tool returns all files for a given session ID
- [ ] **AC7:** A `cleanup_temp_files` function runs at server startup, deleting files older than 24 hours
- [ ] **AC8:** The temp directory is created automatically if it doesn't exist
- [ ] **AC9:** `npm run build` succeeds

---

## Tasks

### Phase 1: Store Tool (AC1-AC5, AC8)

- [ ] Create `figmento-mcp-server/src/tools/file-storage.ts`
- [ ] Register `store_temp_file` tool with schema: data (string), filename (string), sessionId (string)
- [ ] Sanitize sessionId: strip everything except `[a-zA-Z0-9-]`
- [ ] Sanitize filename: strip path separators, `..`, control chars
- [ ] Decode base64 data URI → extract MIME, strip prefix, write Buffer to disk
- [ ] Return absolute file path

### Phase 2: List Tool (AC6)

- [ ] Register `list_temp_files` tool with schema: sessionId (string)
- [ ] Read directory `temp/imports/{sessionId}/`, return array of `{ filename, filePath, sizeBytes, createdAt }`

### Phase 3: Cleanup (AC7)

- [ ] Export `cleanupOldTempFiles()` function — walks `temp/imports/`, deletes directories with all files older than 24h
- [ ] Call from `server.ts` at startup (similar to `preWarmKnowledgeCache`)

### Phase 4: Registration & Build (AC9)

- [ ] Import and register in `server.ts`
- [ ] Run `npm run build`

---

## Dev Notes

- Base64 data URI format: `data:image/png;base64,iVBORw0KG...` — strip everything before the comma, then `Buffer.from(data, 'base64')`
- `IMAGE_OUTPUT_DIR` pattern from canvas.ts is a good reference for file security checks
- The `temp/` directory should be at the project root (same level as `figmento-mcp-server/`)
- Consider adding `temp/` to `.gitignore` if not already there
- Session IDs can come from the plugin's channel ID or a UUID generated per chat session

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/file-storage.ts` | ADD | New tool module for temp file management |
| `figmento-mcp-server/src/server.ts` | MODIFY | Register file storage tools, call cleanup at startup |

---

## Definition of Done

- [ ] store_temp_file saves files to disk, returns path
- [ ] list_temp_files returns session files
- [ ] Cleanup removes files > 24h old at startup
- [ ] Security: no path traversal, 20MB limit
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation GO. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. store_temp_file + list_temp_files + cleanup. Build passes. |
