# Story FI-1: style_text_range — Mixed Text Styling Within a Single Node

**Status:** Done
**Priority:** High (P1)
**Complexity:** M
**Epic:** FI — Figsor Tool Parity
**Depends on:** None
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a designer using Claude, I want to apply different fonts, sizes, colors, and weights to specific character ranges within a single text node, so that I can create professional typography with inline bold, colored keywords, and mixed-weight text without needing separate text nodes.

## Description

Currently Figmento can only style an entire text node uniformly. Figsor's `style_text_range` applies styling to character ranges (start/end indices), enabling:
- Bold a single word in a paragraph
- Color a keyword differently
- Mix font sizes for superscript/subscript effects
- Apply different fonts to parts of text (e.g., code inline with prose)

### Implementation Approach

**MCP Tool:** `style_text_range`
**Parameters:**
- `nodeId` (string) — target text node
- `start` (number) — start character index (0-based)
- `end` (number) — end character index (exclusive)
- `fontFamily` (string, optional)
- `fontSize` (number, optional)
- `fontWeight` (number, optional) — 100-900
- `color` (string, optional) — hex color
- `letterSpacing` (number, optional) — in pixels
- `lineHeight` (number, optional) — in pixels
- `textDecoration` (string, optional) — NONE, UNDERLINE, STRIKETHROUGH
- `textCase` (string, optional) — ORIGINAL, UPPER, LOWER, TITLE

**Plugin Handler:** Uses `node.setRangeFontName()`, `node.setRangeFontSize()`, `node.setRangeFills()`, etc. — all native Figma Plugin API methods.

**Batch Support:** Must work as a `batch_execute` action via `{ action: "style_text_range", params: {...} }`.

## Acceptance Criteria

- [x] **AC1:** `style_text_range` tool registered in MCP server with Zod schema
- [x] **AC2:** Plugin handler applies font, size, weight, color, letterSpacing, lineHeight, textDecoration, textCase to specified character range
- [x] **AC3:** Applying style to range [0, 5] on "Hello World" styles only "Hello"
- [x] **AC4:** Multiple `style_text_range` calls on same node accumulate (don't reset previous ranges)
- [x] **AC5:** Invalid range (start > end, out of bounds) returns descriptive error
- [x] **AC6:** Works inside `batch_execute` as an action
- [x] **AC7:** Font loading handled — if fontFamily specified, loads the font before applying

## Tasks

### Phase 1: Plugin Handler
- [ ] Add `style_text_range` command handler in plugin's `executeCommand()` switch
- [ ] Implement `setRangeFontName`, `setRangeFontSize`, `setRangeFills`, `setRangeLetterSpacing`, `setRangeLineHeight`, `setRangeTextDecoration`, `setRangeTextCase`
- [ ] Handle font loading with `figma.loadFontAsync()` before setting range font
- [ ] Validate range bounds against `node.characters.length`

### Phase 2: MCP Tool
- [ ] Create tool registration in `figmento-mcp-server/src/tools/`
- [ ] Zod schema with all optional style properties
- [ ] Route through `sendDesignCommand("style_text_range", params)`

### Phase 3: Batch Integration
- [ ] Add `style_text_range` to `batch_execute` action dispatch in plugin
- [ ] Test with tempId reference (create_text → style_text_range in same batch)

## Dev Notes

- Figma's `setRangeFontName` requires the font to be loaded first — always call `figma.loadFontAsync({ family, style })` before setting
- `setRangeFills` takes a Paint[] array, not a hex string — convert hex to `[{ type: 'SOLID', color: { r, g, b } }]`
- Range is 0-based, end-exclusive (same as JS `substring`)
- Study Figsor's implementation in `figsor-master/src/plugin/code.js` (search for `style_text_range`)
- Figma fontWeight mapping: 400 = "Regular", 700 = "Bold", 300 = "Light", etc. — must convert number to style string

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/command-handlers.ts | MODIFY | Add style_text_range handler |
| figmento-mcp-server/src/tools/text.ts | MODIFY | Register style_text_range tool |
| figmento-plugin/src/execute-command.ts | MODIFY | Add case to switch |

## Definition of Done

- [ ] Tool works end-to-end (MCP call → relay → plugin → Figma canvas)
- [ ] Batch_execute supports the action
- [ ] Error cases return descriptive messages
- [ ] `npm run build` passes for all three packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (8/10). Status Draft → Ready. Obs: treat font loading + fontWeight mapping gotchas as implicit AC. |
| 2026-03-19 | @dev (Dex) | Implementation complete. All AC met. Builds pass. Status Ready → InReview. |
| 2026-03-19 | @qa (Quinn) | QA PASS. All 7 AC verified. LOW: partial application on range error — no rollback, consistent with batch semantics. Status InReview → Done. |
