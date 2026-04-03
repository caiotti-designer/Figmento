# Story ODS-5: Text Style Creator

**Status:** Done
**Priority:** High (P1) — required by ODS-6a (components bind text styles) and ODS-7 (pipeline)
**Complexity:** M (5 points) — new handler using well-documented Figma API, follows existing patterns.
**Epic:** ODS — One-Click Design System
**Depends on:** ODS-4 (variable collections exist for potential future binding)
**PRD:** [PRD-006](../prd/PRD-006-one-click-design-system.md) — Phase B

---

## Business Value

The One-Click DS pipeline (ODS-7) needs 8 Figma text styles (Display through Caption) so that every text node in subsequent designs can reference a real text style instead of ad-hoc font/size values. Today Figmento has no `figma.createTextStyle()` handler — text is always set with inline properties. This story adds that capability, making DS-generated typography first-class Figma artifacts that update globally when changed.

## Prior Art (What Already Works)

| Capability | Status | Location |
|-----------|--------|----------|
| Font loading (3-tier fallback) | Working | `canvas-batch.ts`, `canvas-style.ts` — `figma.loadFontAsync()` with requested weight -> Regular -> keep existing |
| `BrandAnalysis.typography.styles` | Defined | `brand-analysis.ts` — 8 `TextStyleSpec` entries with size, weight, lineHeight (px), letterSpacing |
| Text creation with font properties | Working | `canvas-batch.ts` `handleCreateText` — sets fontFamily, fontSize, fontWeight, lineHeight, letterSpacing |
| `handleCreateFigmaVariables` pattern | Working | `canvas-query.ts` L553-612 — reference for new handler structure |
| Variable collections from ODS-4 | Prerequisite | `handleCreateVariableCollections` — color/spacing/radius vars exist before styles are created |

## Out of Scope

- Binding text styles to variables (future — Figma API support for variable-bound styles is limited)
- Updating existing text styles (ODS-13)
- Text style variants (e.g., italic, underline)
- Custom type scales beyond the 8 predefined styles

## Risks

- **Font not available in workspace:** 3-tier fallback mitigates (requested weight -> Regular -> keep existing). If the entire font family is missing, Figma uses a system default. The handler should log a warning but not fail.
- **fontWeight 600 causes Inter fallback:** Known gotcha. Handler MUST clamp weights to 400 or 700 only. Enforced in code, not left to caller.
- **lineHeight as multiplier instead of pixels:** Known gotcha. `BrandAnalysis.typography.styles` already stores lineHeight in pixels (e.g., 73.6 for Display at 64px * 1.15). Handler must pass this value directly, never multiply again.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, MCP server builds, 8 text styles visible in Figma Styles panel with correct names, fonts, sizes, and line heights"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer generating a design system from a brief,
**I want** Figmento to create 8 Figma text styles (Display through Caption) with the correct heading/body fonts, sizes, weights, and line heights,
**so that** all subsequent text nodes can reference real text styles that update globally when the DS evolves.

---

## Description

### Problem

Figmento can create text nodes with inline font properties, but there is no way to create Figma Text Styles — the reusable typography definitions that appear in Figma's style panel. Without text styles, every text node is a one-off: changing the heading font requires manually updating every heading in every frame.

### Solution

1. **New plugin handler:** `handleCreateTextStyles` — receives an array of style definitions, calls `figma.createTextStyle()` for each, loads fonts via `figma.loadFontAsync()`, sets all properties.
2. **New MCP tool:** `create_text_styles` — accepts typography config from BrandAnalysis, sends command to plugin.
3. **Font safety:** fontWeight clamped to 400/700 before any API call. lineHeight passed as-is (already in pixels from BrandAnalysis).
4. **Naming convention:** All styles prefixed `DS/` — e.g., `DS/Display`, `DS/H1`, `DS/Body`.

### Input Shape (from BrandAnalysis)

The ODS-7 pipeline will transform `BrandAnalysis.typography` into this structure:

```typescript
{
  styles: [
    {
      name: "DS/Display",
      fontFamily: "Manrope",
      fontSize: 64,
      fontWeight: 700,      // clamped to 400 or 700
      lineHeight: 73.6,     // pixels (64 × 1.15)
      letterSpacing: -1.28  // pixels
    },
    {
      name: "DS/H1",
      fontFamily: "Manrope",
      fontSize: 48,
      fontWeight: 700,
      lineHeight: 55.2,
      letterSpacing: -0.96
    },
    // ... H2, H3 (heading font)
    // ... Body Large, Body, Body Small, Caption (body font)
  ]
}
```

### Style Definitions (8 styles)

| Style | Font | Size | Weight | lineHeight (multiplier) | letterSpacing |
|-------|------|------|--------|------------------------|---------------|
| Display | heading | 64px | 700 | ×1.15 | -0.02em |
| H1 | heading | 48px | 700 | ×1.15 | -0.02em |
| H2 | heading | 32px | 700 | ×1.2 | -0.01em |
| H3 | heading | 24px | 700 | ×1.25 | 0 |
| Body Large | body | 20px | 400 | ×1.6 | 0 |
| Body | body | 16px | 400 | ×1.6 | 0 |
| Body Small | body | 14px | 400 | ×1.5 | 0 |
| Caption | body | 12px | 400 | ×1.5 | 0.01em |

> Note: lineHeight is stored as pixels in BrandAnalysis (e.g., Display lineHeight = 64 * 1.15 = 73.6px). The handler receives pixels directly.

---

## Acceptance Criteria

- [ ] **AC1:** New plugin handler `handleCreateTextStyles` using `figma.createTextStyle()` API
- [ ] **AC2:** New MCP tool `create_text_styles` registered — sends command to plugin via `sendDesignCommand('create_text_styles', params)`
- [ ] **AC3:** Creates 8 text styles: Display (64px), H1 (48px), H2 (32px), H3 (24px), Body Large (20px), Body (16px), Body Small (14px), Caption (12px)
- [ ] **AC4:** Font loading uses existing 3-tier fallback: `figma.loadFontAsync({ family, style: weightToStyle(weight) })` — requested weight -> Regular -> keep existing
- [ ] **AC5:** Each style sets: `fontFamily`, `fontSize`, `fontWeight`, `lineHeight` (pixels, NOT multiplier), `letterSpacing`
- [ ] **AC6:** Heading styles (Display, H1, H2, H3) use `headingFont` from BrandAnalysis; body styles (Body Large, Body, Body Small, Caption) use `bodyFont`
- [ ] **AC7:** Style names follow convention: `DS/Display`, `DS/H1`, `DS/H2`, `DS/H3`, `DS/Body Large`, `DS/Body`, `DS/Body Small`, `DS/Caption`
- [ ] **AC8:** Returns array of text style IDs: `{ styles: Array<{ id, name, fontFamily, fontSize }> }`
- [ ] **AC9:** fontWeight clamped to 400 or 700 — never passes 600 to Figma API (per known Inter fallback gotcha)
- [ ] **AC10:** `npm run build` succeeds in both figmento-mcp-server and figmento-plugin (figmento)

---

## Tasks

### Phase 1: Plugin Handler (AC1, AC3, AC4, AC5, AC6, AC7, AC9)

- [ ] Create `handleCreateTextStyles` in `canvas-query.ts` (or new `text-styles.ts` handler file)
- [ ] Implement fontWeight clamping: `weight === 600 ? 700 : (weight >= 500 ? 700 : 400)` — or simpler: `weight >= 500 ? 700 : 400`
- [ ] Implement `weightToStyle` helper: 400 -> "Regular", 700 -> "Bold" (for `figma.loadFontAsync` style string)
- [ ] For each style definition:
  - Call `figma.loadFontAsync({ family: fontFamily, style: weightToStyle(clampedWeight) })`
  - On load failure: try `figma.loadFontAsync({ family: fontFamily, style: "Regular" })` (tier 2)
  - On second failure: log warning, skip style (tier 3 — don't block other styles)
  - Call `figma.createTextStyle()` — returns TextStyle object
  - Set `.name`, `.fontName`, `.fontSize`, `.lineHeight` (as `{ value: px, unit: 'PIXELS' }`), `.letterSpacing` (as `{ value: px, unit: 'PIXELS' }`)
- [ ] Collect created style IDs and return structured response
- [ ] Register command `create_text_styles` in `command-router.ts`

### Phase 2: MCP Tool (AC2, AC8)

- [ ] Add `create_text_styles` tool in `figma-native.ts` with Zod schema
- [ ] Schema accepts `{ styles: Array<{ name, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing }> }` — or simplified `{ headingFont, bodyFont, styles }` shape
- [ ] Route to `sendDesignCommand('create_text_styles', params)`
- [ ] Return structured per-style response with IDs

### Phase 3: Build + Verify (AC10)

- [ ] `npm run build` in figmento-mcp-server
- [ ] `npm run build` in figmento (plugin)
- [ ] Manual test: verify 8 styles appear in Figma's text style panel under DS/ prefix

---

## Dev Notes

- **Figma TextStyle API:** `figma.createTextStyle()` returns a `TextStyle` node. Set `.name` (string), `.fontName` (`{ family, style }`), `.fontSize` (number), `.lineHeight` (`{ value, unit }` or `{ unit: 'AUTO' }`), `.letterSpacing` (`{ value, unit }`).
- **Font must be loaded before setting fontName:** `figma.loadFontAsync({ family: "Manrope", style: "Bold" })`. If this rejects, the font isn't available in the workspace.
- **lineHeight format:** Figma expects `{ value: 73.6, unit: 'PIXELS' }` — not a bare number. This is different from `create_text` where lineHeight is a bare number. Double-check the TextStyle API signature.
- **letterSpacing format:** Also `{ value: number, unit: 'PIXELS' }`. BrandAnalysis stores em values (e.g., -0.02em for Display). ODS-7 should convert: `letterSpacing_px = em_value × fontSize` before sending to this handler.
- **Upsert consideration:** If `DS/Display` already exists, should we update it or skip? V1: skip with warning (matching ODS-4 pattern). ODS-13 handles updates.
- **3-tier fallback reference:** See `canvas-batch.ts` font loading for the existing pattern. The fallback chain is: requested `{ family, style }` -> `{ family, "Regular" }` -> skip (don't block other styles).

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/handlers/canvas-query.ts` | MODIFY | Add `handleCreateTextStyles` handler |
| `figmento/src/handlers/command-router.ts` | MODIFY | Register `create_text_styles` command |
| `figmento-mcp-server/src/tools/figma-native.ts` | MODIFY | Add `create_text_styles` MCP tool |

---

## Definition of Done

- [ ] 8 text styles created in Figma's style panel (DS/Display through DS/Caption)
- [ ] Heading styles use heading font, body styles use body font
- [ ] lineHeight is correct in pixels (not multiplier) — verify in Figma inspector
- [ ] fontWeight 600 never sent to API (clamped to 400/700)
- [ ] Font loading failure on one style does not block other styles
- [ ] Returns style IDs for downstream use by ODS-6a and ODS-7
- [ ] Both builds pass

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | @sm (River) | Initial draft. 8 text styles from BrandAnalysis typography config. 3-tier font fallback, fontWeight clamping, lineHeight in pixels. |
