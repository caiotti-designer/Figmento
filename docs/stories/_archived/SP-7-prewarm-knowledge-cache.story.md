# Story SP-7: Pre-Warm Knowledge Cache at Startup

**Status:** Done
**Priority:** Low (P3)
**Complexity:** XS (1 point) — 2 files modify, simple async preload
**Epic:** Speed Pipeline — Cold-Start & Execution Optimization
**Depends on:** None
**PRD:** PM analysis 2026-03-15 — Save ~100ms on first design request

---

## Business Value

Knowledge files are loaded lazily — the first tool call that needs a YAML file pays 15-45ms per file. Preloading the top 5 files at server startup eliminates this cold-hit entirely. Small gain (~100ms total) but contributes to the overall "every millisecond counts" philosophy.

## Out of Scope

- Changing the lazy cache mechanism itself
- Pre-compiling YAML to JSON at build time (separate optimization)
- Preloading reference files or layout blueprints (directory-scan based, different pattern)

## Risks

- Adds ~100-200ms to server startup time — acceptable since startup happens once per session
- If a knowledge file is missing, startup should not fail — preload must be fault-tolerant

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, server starts successfully with and without knowledge files present"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** knowledge files to be pre-loaded at server startup,
**so that** my first design request has zero knowledge-loading latency.

---

## Description

### Problem

`intelligence.ts` uses a `knowledgeCache` Map with lazy loading via `loadKnowledge()`. The first call to any intelligence tool pays disk I/O + YAML parse cost. For 5 files, that's ~100ms total on cold start.

### Solution

Export a `preWarmKnowledgeCache()` function from `intelligence.ts` that eagerly loads the top 5 files. Call it from `index.ts` after server startup (non-blocking, fire-and-forget).

---

## Acceptance Criteria

- [x] **AC1:** `intelligence.ts` exports a `preWarmKnowledgeCache()` function
- [x] **AC2:** The function loads these 5 files into `knowledgeCache`: `size-presets.yaml`, `typography.yaml`, `color-system.yaml`, `layout.yaml`, `image-generation.yaml`
- [x] **AC3:** Called from `createFigmentoServer()` in `server.ts` (synchronous during init, before server returns — simpler than async from index.ts)
- [x] **AC4:** Each file load wrapped in try/catch — errors logged to stderr, never throws
- [x] **AC5:** Subsequent `loadKnowledge()` calls for these files hit the cache (0ms)
- [x] **AC6:** `npm run build` succeeds

---

## Tasks

### Phase 1: Export Preload Function (AC1, AC2, AC4)

- [x] Add `preWarmKnowledgeCache()` function in `intelligence.ts`
- [x] Wrap each `loadKnowledge()` call in try/catch — log failure, continue
- [x] Export the function

### Phase 2: Call from Startup (AC3)

- [x] Imported `preWarmKnowledgeCache` in `server.ts`
- [x] Called at end of `createFigmentoServer()` — runs during init, before server returns
- [x] Logs confirmation: `[Figmento MCP] Knowledge cache pre-warmed (5 files)`

### Phase 3: Verify (AC5, AC6)

- [x] Run `npm run build` — passes
- [x] Server starts cleanly with pre-warm log output

---

## Dev Notes

- `knowledgeCache` is a module-level `Map` in `intelligence.ts:8` — once populated, all subsequent `loadKnowledge()` calls are cache hits
- The preload is fire-and-forget — if it takes 200ms, it runs in the background while the server is already accepting connections
- Import path consideration: `index.ts` imports from `server.ts`, which imports tool registration functions. The preload function could be exported alongside `createFigmentoServer()` or called inside it after registration.
- If `intelligence.ts` exports are not accessible from `index.ts`, add a `preWarmCache()` call at the end of `registerIntelligenceTools()` — it only runs once.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/intelligence.ts` | MODIFY | Add and export preWarmKnowledgeCache() |
| `figmento-mcp-server/src/index.ts` | MODIFY | Call preWarmKnowledgeCache() at startup |

---

## Definition of Done

- [ ] preWarmKnowledgeCache() exported and called at startup
- [ ] 5 knowledge files pre-loaded
- [ ] Fault-tolerant (no crash on missing files)
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation 10/10 → GO. Fault-tolerance AC4 is critical. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. All ACs met. Build passes. Called from server.ts instead of index.ts (simpler import path). |
