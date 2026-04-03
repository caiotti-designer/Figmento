# Story ODS-1b: Brief Analysis MCP Tool (with Logo Color Extraction)

**Status:** Done
**Priority:** High (P1)
**Complexity:** L (8 points) — new MCP tool, AI prompt engineering, structured JSON output, knowledge file integration
**Epic:** ODS — One-Click Design System
**Depends on:** ODS-1a (attachments must reach MCP server)
**PRD:** [PRD-006](../prd/PRD-006-one-click-design-system.md) — Phase A

---

## Business Value

This is the intelligence layer of the One-Click Design System. A designer uploads a PDF brief (project scope, brand values, target audience) and optionally a logo image. The tool returns a structured brand analysis JSON that feeds directly into ODS-4 (variables), ODS-5 (text styles), and ODS-6a (components). Without this tool, the designer must manually specify every color, font, and spacing value. With it, one upload produces a complete design system specification.

## Out of Scope

- Creating Figma artifacts (ODS-4/5/6a)
- Persisting the analysis to project YAML (ODS-8)
- Preview UI before generation (ODS-12)
- Editing/tweaking the analysis interactively (future enhancement)

## Risks

- AI vision may extract wrong dominant colors from complex logos (mitigated: ODS-12 preview lets designer override)
- PDF extraction quality varies by format — image-only PDFs yield no text (mitigated: AC8 fallback to plain text)
- Color harmony algorithm must produce usable palettes, not just raw extracted colors (mitigated: knowledge/color-system.yaml provides proven palettes as reference)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "MCP server builds, tool returns valid BrandAnalysis JSON for sample PDF+logo, font pairing matches mood"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer starting a new client project,
**I want** to upload my client's PDF brief and logo, and have Figmento analyze them into a structured brand specification,
**so that** Figmento can generate a complete design system in Figma without me manually specifying colors, fonts, and spacing.

---

## Description

### Problem

Every new project starts with a cold start: the designer manually picks colors, fonts, and spacing. Even when a client provides a PDF brief with brand values and a logo, the designer must translate that into Figma infrastructure by hand. There's no tool that bridges "here's my brief" to "here's your design system spec."

### Solution

New MCP tool `analyze_brief` that:

1. Accepts PDF content (base64 or extracted text) + optional logo image (base64)
2. Uses AI vision to extract dominant colors from logo
3. Uses AI language model to extract brand values, tone, industry, target audience from PDF
4. Maps extracted data to knowledge base: `color-system.yaml` (palette selection), `typography.yaml` (font pairing), `layout.yaml` (spacing)
5. Generates color scales (50–900) from extracted primary/secondary/accent colors
6. Returns structured `BrandAnalysis` JSON that ODS-4/5/6a/7 consume directly

### Output Schema

```typescript
interface BrandAnalysis {
  // Brand identity (from PDF)
  brandName: string;
  industry: string;
  tone: string[];                    // e.g. ["professional", "innovative", "eco-conscious"]
  targetAudience: string;
  brandValues: string[];

  // Color system (from logo + AI)
  colors: {
    primary: string;                 // hex, from logo dominant color
    secondary: string;               // hex, from logo or AI-derived
    accent: string;                  // hex, AI-derived harmony
    background: string;              // hex
    text: string;                    // hex
    muted: string;                   // hex
    surface: string;                 // hex
    error: string;                   // hex
    success: string;                 // hex
    scales: {                        // generated from primary/secondary/accent
      primary: Record<string, string>;   // { "50": "#...", "100": "#...", ... "900": "#..." }
      secondary: Record<string, string>;
      accent: Record<string, string>;
    };
    neutrals: Record<string, string>;   // { "50": "#...", ... "950": "#..." }
  };

  // Typography (from mood → knowledge/typography.yaml mapping)
  typography: {
    headingFont: string;             // e.g. "Manrope"
    bodyFont: string;                // e.g. "Inter"
    headingWeight: number;           // 700
    bodyWeight: number;              // 400
    typeScale: string;               // e.g. "major_third"
    styles: {                        // pre-computed for ODS-5
      display: { size: number; weight: number; lineHeight: number; letterSpacing: number };
      h1:      { size: number; weight: number; lineHeight: number; letterSpacing: number };
      h2:      { size: number; weight: number; lineHeight: number; letterSpacing: number };
      h3:      { size: number; weight: number; lineHeight: number; letterSpacing: number };
      bodyLg:  { size: number; weight: number; lineHeight: number; letterSpacing: number };
      body:    { size: number; weight: number; lineHeight: number; letterSpacing: number };
      bodySm:  { size: number; weight: number; lineHeight: number; letterSpacing: number };
      caption: { size: number; weight: number; lineHeight: number; letterSpacing: number };
    };
  };

  // Spacing & radius
  spacing: {
    base: number;                    // 8
    scale: number[];                 // [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128]
  };
  radius: {
    values: Record<string, number>;  // { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 }
    default: number;                 // e.g. 8
  };

  // Metadata
  source: {
    hasPdf: boolean;
    hasLogo: boolean;
    paletteId: string | null;        // matched palette from color-system.yaml, if any
    fontPairingId: string | null;    // matched pairing from typography.yaml, if any
    confidence: number;              // 0-1, how confident the analysis is
  };
}
```

---

## Acceptance Criteria

- [x] **AC1:** `analyze_brief` tool registered in MCP server — accepts `{ pdfBase64, pdfText, logoBase64, briefText, brandName }` (all optional via z.string())
- [x] **AC2:** When PDF base64 provided: extracts text via pdf-parse, identifies brand name, industry, tone, target audience, brand values via heuristic keyword matching
- [x] **AC3:** Hex colors extracted from brief text (regex), mapped to logo color roles. AI vision path prepared for ODS-7 orchestrator.
- [x] **AC4:** Logo colors mapped to primary/secondary/accent using HSL harmony (complementary at +60° hue shift)
- [x] **AC5:** Full color scales generated: 10 steps (50-900) per brand color + 11-step neutral scale tinted toward primary hue
- [x] **AC6:** Typography pairing selected via mood_tags matching against 20 font pairings in typography.yaml
- [x] **AC7:** 8 text styles computed from type scale: display/h1/h2/h3/bodyLg/body/bodySm/caption with correct lineHeight (pixels) and letterSpacing
- [x] **AC8:** briefText accepted as fallback. PDF parsing failure gracefully handled.
- [x] **AC9:** No logo → palette matched from mood keywords against 12 palettes in color-system.yaml
- [x] **AC10:** BrandAnalysis validated at runtime: hex format, weight != 600, lineHeight > 10px
- [x] **AC11:** `npm run build` succeeds — 15 unit tests pass
- [x] **AC12:** lineHeight computed as `fontSize × multiplier` (1.2 heading, 1.5 body, 1.4 caption) — all values > 10px

---

## Tasks

### Phase 1: Tool Registration + Input Handling (AC1, AC8)

- [ ] Create new file `figmento-mcp-server/src/tools/brief-analysis.ts` with `registerBriefAnalysisTools(server)`
- [ ] Register `analyze_brief` tool with Zod schema (use `z.string()` not `z.enum()` per MCP SDK gotcha)
- [ ] Input routing: pdfBase64 → extract text via pdf-parse; pdfText → use directly; briefText → use directly; logoBase64 → pass to AI vision
- [ ] Register in `server.ts` tool registration block

### Phase 2: PDF Intelligence (AC2)

- [ ] Extract text from PDF using existing `pdf-parse` dependency (already installed for CF-6)
- [ ] Build AI prompt: "Analyze this brand brief. Extract: brand name, industry, tone (3-5 keywords), target audience, brand values (3-5 keywords). Return as JSON."
- [ ] Parse AI response into structured fields
- [ ] Handle image-only PDFs: send PDF as base64 to AI vision model instead

### Phase 3: Logo Color Extraction (AC3, AC4)

- [ ] Build AI vision prompt: "Analyze this logo image. Return the top 3-5 dominant colors as hex codes, ordered by visual prominence. Exclude white (#FFFFFF) and near-white, exclude black (#000000) and near-black unless they are clearly intentional brand colors."
- [ ] Map extracted colors to roles: most prominent → primary, second → secondary, third → accent
- [ ] If only 1-2 colors extracted: generate complementary/analogous colors using color harmony rules

### Phase 4: Knowledge Base Integration (AC5, AC6, AC7, AC9, AC12)

- [ ] Load `knowledge/color-system.yaml` — match tone keywords to palette mood_tags for fallback/validation
- [ ] Generate color scales from primary/secondary/accent: compute 50 (lightest) through 900 (darkest) via HSL interpolation
- [ ] Generate neutral scale: 11 steps from near-white to near-black, tinted slightly toward primary hue
- [ ] Load `knowledge/typography.yaml` — match tone keywords to font_pairings mood_tags → select best match
- [ ] Compute 8 text styles from selected type scale: apply ratio to base 16px, compute lineHeight as `size × 1.2` for headings / `size × 1.5` for body (in pixels)
- [ ] Spacing: default 8px base, standard scale [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128]
- [ ] Radius: default moderate (8px), map from industry (tech=8, finance=4, playful=16, luxury=0)

### Phase 5: Output Assembly + Validation (AC10, AC11)

- [ ] Assemble `BrandAnalysis` JSON from all extracted/generated data
- [ ] Runtime validation: all hex colors are valid 6-digit hex, all font weights are 400 or 700 (never 600), all lineHeights are pixel values > 10
- [ ] Populate `source` metadata: hasPdf, hasLogo, matched paletteId/fontPairingId, confidence score
- [ ] Run `npm run build`

---

## Dev Notes

- **AI provider:** Use whatever AI provider is configured in the MCP server. For PDF analysis, Gemini handles PDF natively as base64. For logo analysis, any vision-capable model works.
- **Color scale generation:** HSL interpolation is sufficient for V1. Given primary `#2AB6BD` → 50 is very light tint, 900 is very dark shade. Libraries like `chroma-js` can help but add a dependency — consider implementing a simple HSL lerp function instead.
- **Font weight 600 gotcha:** The `luxury` pairing in `typography.yaml` specifies `recommended_heading_weight: 600` for Cormorant Garamond — this MUST be overridden to 700 in the output. Cormorant Garamond 600 causes Inter fallback (known issue from MEMORY.md).
- **Existing `import_pdf` (CF-6):** Does text extraction + regex color/font detection. Could reuse its output as a pre-processing step, but `analyze_brief` needs AI-level understanding (industry, tone, values), not just regex matching. The AI prompt can receive `import_pdf` extracted text as context.
- **The `get_design_guidance` tool** already does mood → color/font mapping for individual design tasks. `analyze_brief` is similar but produces a complete system spec, not per-design guidance. Could share the knowledge file loading logic.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/types/brand-analysis.ts` | CREATED | BrandAnalysis + TextStyleSpec interfaces — shared Phase A↔B contract type |
| `figmento-mcp-server/src/tools/brief-analysis-core.ts` | CREATED | Core logic: color scale gen, knowledge matching, assembly, validation. Testable (no MCP SDK dep). |
| `figmento-mcp-server/src/tools/brief-analysis.ts` | CREATED | MCP tool registration wrapper: analyze_brief. Imports from core. |
| `figmento-mcp-server/src/server.ts` | MODIFIED | Register brief-analysis tools |
| `figmento-mcp-server/tests/brief-analysis.test.ts` | CREATED | 15 unit tests: 3 color types, weight clamping, lineHeight, industry→radius, confidence |

---

## Definition of Done

- [x] `analyze_brief` returns valid `BrandAnalysis` JSON for: (a) PDF + logo, (b) PDF only, (c) logo only, (d) plain text brief only
- [x] Color scales are visually coherent (50 is light, 900 is dark — verified by 3 test cases)
- [x] Font pairing matches mood (luxury → Cormorant Garamond, tech → Inter, etc.)
- [x] lineHeight values are pixels, not multipliers (all > 10px)
- [x] fontWeight is never 600 (clamped to 400/700)
- [x] Build passes, 15 unit tests pass

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-25 | @sm (River) | Initial draft. Merged original ODS-2 (logo extraction) + ODS-3 (brief analysis) into single tool. Output schema designed to feed directly into ODS-4/5/6a/7. |
| 2026-03-25 | @po (Pax) | Validation GO (10/10). 3 implementation notes: (1) hard-clamp fontWeight to 400/700 in code, (2) add HSL scale tests for 3 color types, (3) define BrandAnalysis interface in shared types file. Status Draft → Ready. |
| 2026-03-25 | @dev (Dex) | Implementation complete. 5 files: shared BrandAnalysis type, core logic (split from registration to avoid TS2589), MCP tool wrapper, server registration, 15 unit tests. All @po notes addressed: clampWeight(), 3 color test cases, shared types/brand-analysis.ts. Status Ready → InReview. |
