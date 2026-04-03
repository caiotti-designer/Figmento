# Story FI-3: list_available_fonts — Font Introspection

**Status:** Done
**Priority:** High (P1)
**Complexity:** S
**Epic:** FI — Figsor Tool Parity
**Depends on:** None
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a designer using Claude, I want to discover which fonts are available in the current Figma file (from local fonts and text styles), so that Claude can make informed font choices and avoid fontWeight/fontFamily fallback errors.

## Description

Currently Claude guesses fonts and discovers errors only when `create_text` fails or silently falls back to Inter. Figsor's `list_available_fonts` returns both available system fonts and fonts already used in the file's text styles.

### Implementation Approach

**MCP Tool:** `list_available_fonts`
**Parameters:**
- `query` (string, optional) — filter fonts by name substring
- `include_styles` (boolean, optional, default true) — include fonts extracted from local text styles

**Returns:**
```json
{
  "available_fonts": [{ "family": "Inter", "styles": ["Regular", "Bold", "Medium", ...] }, ...],
  "project_fonts": [{ "family": "Cormorant Garamond", "styles": ["Regular", "Bold"], "source": "text_style", "style_name": "Heading/H1" }],
  "total": 142
}
```

**Plugin Handler:** Uses `figma.listAvailableFontsAsync()` for available fonts, plus iterates `figma.getLocalTextStyles()` to extract project-specific fonts.

## Acceptance Criteria

- [x] **AC1:** `list_available_fonts` tool registered in MCP server
- [x] **AC2:** Returns available fonts from `figma.listAvailableFontsAsync()`
- [x] **AC3:** Returns project fonts extracted from local text styles
- [x] **AC4:** `query` parameter filters by family name (case-insensitive)
- [x] **AC5:** Each font entry includes available style variants (Regular, Bold, etc.)
- [x] **AC6:** Response size manageable — group by family, don't return duplicates

## Tasks

### Phase 1: Plugin Handler
- [ ] Call `figma.listAvailableFontsAsync()` — returns `Font[]` with `{ family, style }`
- [ ] Group by family, collect styles array per family
- [ ] Extract fonts from `figma.getLocalTextStyles()` via `style.fontName`
- [ ] Apply query filter if provided
- [ ] Deduplicate and sort alphabetically

### Phase 2: MCP Tool
- [ ] Register tool with Zod schema
- [ ] Route through sendDesignCommand

## Dev Notes

- `figma.listAvailableFontsAsync()` can return 1000+ fonts — always group by family
- If `query` is provided, filter server-side before sending response to keep payload small
- Project fonts (from text styles) are most valuable — put them first in response
- This tool naturally complements `read_figma_context` which already reads text styles — consider merging or cross-referencing

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/command-handlers.ts | MODIFY | Add list_available_fonts handler |
| figmento-mcp-server/src/tools/scene.ts | MODIFY | Register list_available_fonts tool |
| figmento-plugin/src/execute-command.ts | MODIFY | Add case to switch |

## Definition of Done

- [ ] Returns grouped font families with style variants
- [ ] Project fonts from text styles appear in response
- [ ] Query filtering works
- [ ] `npm run build` passes for all packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (8/10). Status Draft → Ready. |
| 2026-03-19 | @dev (Dex) | Implementation complete. All AC met. Builds pass. Status Ready → InReview. |
| 2026-03-19 | @qa (Quinn) | QA PASS. All 6 AC verified. Clean implementation, no issues. Status InReview → Done. |
