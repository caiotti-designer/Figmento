# Story CF-6: PDF Import & Context Extraction

**Status:** Done
**Priority:** Medium (P2)
**Complexity:** M (5 points) — new dependency (pdf-parse), new tool, AI extraction
**Epic:** Chat File Pipeline — Chat-First Workflow
**Depends on:** CF-2 (temp file storage provides the PDF file path)
**PRD:** PM analysis 2026-03-15 — Import PDFs for context understanding

---

## Business Value

Users often have brand guidelines, pitch decks, or marketing briefs as PDFs. By extracting text, structure, and embedded images, the agent can understand the brand context (colors mentioned, fonts specified, tone, key content) without manual input. This enables "here's my brand guide, now design something" workflows.

## Out of Scope

- Pixel-perfect PDF rendering (no HTML/image conversion)
- Editing PDFs
- PDF files > 20MB
- Extracting vector artwork from PDFs

## Risks

- `pdf-parse` may not extract text from image-only PDFs (scanned documents)
- Color extraction from text is heuristic (regex for hex codes, color names)
- New npm dependency required

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Build passes, text extraction works on sample PDFs"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer using Figmento,
**I want** to import a PDF document and have the agent extract brand context from it,
**so that** my designs align with my existing brand guidelines without manual data entry.

---

## Description

### Problem

No PDF parsing exists in Figmento. Users with brand guidelines PDFs must manually describe their colors, fonts, and tone.

### Solution

New MCP tool `import_pdf` that:
1. Reads a PDF file from temp storage
2. Extracts text content via `pdf-parse` library
3. Uses regex/heuristics to detect: hex color codes, font names, key headings
4. Returns structured context for the agent to use in design decisions

---

## Acceptance Criteria

- [ ] **AC1:** `import_pdf` accepts `{ filePath: string }` — reads PDF from temp storage or absolute path
- [ ] **AC2:** Extracts full text content from all pages
- [ ] **AC3:** Detects hex color codes (e.g., `#FF5733`, `#abc`) via regex and returns as `detectedColors[]`
- [ ] **AC4:** Detects font family mentions (common patterns: "Font: X", "Typeface: X", "uses X font") as `detectedFonts[]`
- [ ] **AC5:** Returns `{ pageCount, textContent (truncated to 10000 chars), detectedColors[], detectedFonts[], summary (first 500 chars) }`
- [ ] **AC6:** Files > 20MB are rejected
- [ ] **AC7:** If pdf-parse fails (corrupt PDF), returns a clear error
- [ ] **AC8:** `npm run build` succeeds (pdf-parse bundled via esbuild)

---

## Tasks

### Phase 1: Add Dependency

- [ ] `npm install pdf-parse` in figmento-mcp-server
- [ ] Verify esbuild bundles it correctly (may need external config)

### Phase 2: Extract Tool (AC1-AC5)

- [ ] Create `import_pdf` tool in `file-storage.ts` or new `pdf-tools.ts`
- [ ] Read file from disk, pass Buffer to `pdf-parse`
- [ ] Extract text from `data.text`
- [ ] Regex scan for hex colors: `/#([0-9A-Fa-f]{3,8})\b/g`
- [ ] Regex scan for font mentions: `/(?:font|typeface|typography)[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/gi`
- [ ] Truncate text to 10000 chars, summary to 500 chars

### Phase 3: Error Handling (AC6, AC7, AC8)

- [ ] Validate file size ≤ 20MB before parsing
- [ ] Wrap pdf-parse in try/catch with clear error messages
- [ ] Run `npm run build`

---

## Dev Notes

- `pdf-parse` is a lightweight, zero-dependency PDF text extractor: `const pdf = require('pdf-parse'); const data = await pdf(buffer);`
- Returns `{ numpages, text, info, metadata }`
- For image-only PDFs, `data.text` will be empty — return a warning in the response
- Color detection regex should also catch CSS rgb/hsl patterns as a stretch goal
- Font detection is heuristic — won't catch all cases but covers most brand guide formats
- The extracted context is informational — the agent uses it to inform `save_brand_kit` calls or design prompts

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/package.json` | MODIFY | Add pdf-parse dependency |
| `figmento-mcp-server/src/tools/file-storage.ts` | MODIFY | Add import_pdf tool |

---

## Definition of Done

- [ ] PDF text extraction works
- [ ] Color and font detection returns results
- [ ] Error handling for corrupt/large PDFs
- [ ] Build passes

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | @sm (River) | Initial draft |
| 2026-03-15 | @po (Pax) | Validation GO. Status Draft → Ready |
| 2026-03-15 | @dev (Dex) | Implementation complete. All ACs met. Build passes. |
