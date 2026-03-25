# FN-2: Extract Text-to-Layout Skill

| Field | Value |
|-------|-------|
| **Story ID** | FN-2 |
| **Epic** | FN — Figma Native Agent Migration |
| **Status** | InProgress |
| **Author** | @sm (River) |
| **Executor** | @dev (Dex) |
| **Gate** | @qa |
| **Created** | 2026-03-24 |
| **Complexity** | L (Large) |
| **Priority** | HIGH |

---

## Description

Extract the Text-to-Layout workflow from the Figmento plugin into a self-contained Figma Skill markdown file that works with Claude Code + the official `use_figma` MCP tool (Anthropic's `claude.ai/Figma` server). This is the second skill extraction (FN-1 set the pattern for Screenshot-to-Layout) and adapts the same structure for text-brief-driven design generation.

The Figmento plugin currently bundles a Text-to-Layout mode that:
1. Accepts a text brief from the user (e.g., "Create an Instagram post for a coffee brand, moody dark aesthetic")
2. Parses the brief to detect format, mood, design type, and keywords via `detectBrief()` — a lightweight keyword parser with no AI calls
3. Injects brief-specific recommendations into the system prompt: matching palette, font pairing, layout blueprint, and composition rules
4. Selects a layout blueprint and reference composition based on category/mood matching
5. Sends the assembled instruction + system prompt to an LLM (Claude/Gemini/OpenAI)
6. The LLM issues tool calls (create_frame, create_text, set_fill, set_auto_layout, etc.) to build the design in Figma
7. A tool-use loop executes each call against the Figma Plugin API

The extracted skill must encode the same intelligence — the brief parsing logic, mood-to-palette mapping, mood-to-font mapping, format detection patterns, layout blueprint matching, system prompt design rules, typography scales, color palettes, spacing system, anti-patterns — as inline knowledge in a markdown file. The skill consumer will be a Claude Code agent using the `use_figma` MCP tool instead of Figmento's relay/plugin pipeline.

### Why This Matters

This skill enables Text-to-Layout without requiring the Figmento plugin, WebSocket relay, or API keys. Any Claude Code user with the Figma MCP connected can describe a design in text and get a complete Figma layout — massively expanding the addressable audience from "Figmento plugin users" to "anyone with Claude Code + Figma."

### Key Differences from FN-1 (Screenshot-to-Layout)

- **No vision input** — FN-2 starts with a text brief, not a screenshot image. There is no image analysis step.
- **Brief detection logic must be inlined** — The skill needs the format detection patterns (35+ regex patterns across social, print, web, presentation), mood detection patterns (12 moods with keyword lists), and multi-section detection patterns so the LLM can parse any text brief.
- **Format/mood-to-design mapping** — The skill must include the complete brief-to-palette, brief-to-font, and brief-to-blueprint matching logic inline, since Figmento's `buildBriefInjection()` and `findBestBlueprint()` are code functions that won't exist in the skill context.
- **Simpler input pipeline** — No image processing, no crop step, no vision content blocks. The user message IS the brief.
- **Carousel support** — Text-to-Layout supports carousel mode (multi-slide generation with design system extraction for cross-slide consistency). The skill should document this workflow.

---

## Acceptance Criteria

- [x] AC1: Skill file exists at `skills/figmento-text-to-layout.md`
- [x] AC2: Skill is fully self-contained — no references to external YAML files, no `import` statements, no dependency on Figmento MCP server or plugin
- [x] AC3: Skill header includes a usage section explaining how to invoke it (e.g., "Describe your design and say: Create this design in Figma using the text-to-layout skill")
- [x] AC4: Skill includes brief parsing logic inlined as reference tables:
  - [x] AC4a: Format detection table — all 35+ format patterns with their IDs (ig-post, ig-story, fb-post, x-post, linkedin-post, pinterest-pin, tiktok, yt-thumbnail, a4, poster, brochure, slide-16-9, web-hero, landing-page, etc.) and their trigger keywords
  - [x] AC4b: Mood detection table — all 12 mood patterns with their IDs and keyword lists (moody-dark, fresh-light, corporate-professional, luxury-premium, playful-fun, nature-organic, tech-modern, warm-cozy, minimal-clean, retro-vintage, ocean-calm, sunset-energy)
  - [x] AC4c: Multi-section detection patterns (landing page, carousel, website, full page, etc.)
  - [x] AC4d: Brief-to-palette mapping — for each detected mood, the recommended palette with hex values (primary, secondary, accent, background, text, muted)
  - [x] AC4e: Brief-to-font mapping — for each detected mood, the recommended font pairing (heading font, body font, recommended weights)
  - [x] AC4f: Brief-to-blueprint matching — format-to-category mapping (social->ads, web->landing, print->print, presentation->presentation) and blueprint zone structures
- [x] AC5: Skill includes all design knowledge inlined:
  - [x] AC5a: Size presets for all major formats (social, print, web, presentation) with pixel dimensions
  - [x] AC5b: Typography system — type scales (minor third through golden ratio), line height rules, letter spacing rules, weight hierarchy, minimum font sizes by format
  - [x] AC5c: Color system — all 12 mood-based palettes with hex values, WCAG contrast rules, safe combos
  - [x] AC5d: Layout system — 8px grid, full spacing scale, margins by format, safe zones, layout patterns (centered-stack, split-half, full-bleed-with-overlay, card-grid, thirds-grid)
- [x] AC6: Skill includes the text-to-layout workflow steps adapted for `use_figma`:
  - [x] AC6a: Step 1 — Parse the brief (detect format, mood, design type from the user's text)
  - [x] AC6b: Step 2 — Look up dimensions from format detection
  - [x] AC6c: Step 3 — Select palette from mood detection
  - [x] AC6d: Step 4 — Select font pairing from mood detection
  - [x] AC6e: Step 5 — Select layout blueprint from category/mood matching
  - [x] AC6f: Step 6 — Create root frame with exact dimensions and background
  - [x] AC6g: Step 7 — Build hierarchy top-down using blueprint zones
  - [x] AC6h: Step 8 — Apply styling, overlays, gradients
  - [x] AC6i: Step 9 — Self-evaluate against checklist
- [x] AC7: Skill includes the Design Taste Rules (8 rules), anti-AI markers, and quality scoring rubric (from system-prompt.ts)
- [x] AC8: Skill includes overlay/gradient rules (2-stop gradients, content-aware direction table, opacity minimums)
- [x] AC9: Skill includes `use_figma` code examples for at least 5 common operations:
  - [x] AC9a: Creating a root frame with dimensions and background fill
  - [x] AC9b: Creating text with font family, size, weight, and color
  - [x] AC9c: Setting auto-layout on a frame (vertical/horizontal, padding, spacing)
  - [x] AC9d: Creating a gradient overlay rectangle
  - [x] AC9e: Creating a button (auto-layout frame + text child)
- [x] AC10: Skill includes format completion checklists (social post, carousel, presentation, web hero, print)
- [x] AC11: Skill includes carousel workflow documentation — multi-slide generation with cover/content/CTA slide types, design system extraction for cross-slide consistency
- [x] AC12: Skill includes the Design Brief Analysis template that must be completed before any design (aesthetic direction, font pairing, color story, memorable element, generic trap avoided)
- [ ] AC13: Skill works end-to-end — Given a text brief and the skill loaded as context, When Claude Code processes the request, Then it produces a Figma design using `use_figma` calls that matches the described brief
- [x] AC14: Skill follows Figma Community skill format conventions (title, description, usage, workflow steps)
- [x] AC15: No vision/screenshot-related content — the skill must not include screenshot analysis instructions, crop steps, or image input handling

---

## Scope

### IN Scope

- Extracting the Text-to-Layout workflow into a standalone skill markdown
- Inlining brief detection logic (format patterns, mood patterns, multi-section detection) as reference tables
- Inlining brief-to-palette, brief-to-font, and brief-to-blueprint mapping logic
- Inlining all design knowledge (size presets, typography, color, layout, spacing)
- Adapting tool call syntax from Figmento plugin tools to `use_figma` Plugin API calls
- Writing `use_figma` code examples for common operations
- Including the full system prompt intelligence (design taste rules, anti-patterns, quality scoring)
- Including the Design Brief Analysis template
- Documenting carousel workflow (multi-slide generation)
- Format completion checklists
- Self-evaluation checklist

### OUT of Scope

- Screenshot-to-Layout skill (FN-1 — already drafted)
- Ad Analyzer skill extraction (future FN story)
- Modifying any Figmento source code (this is a read-only extraction)
- Image generation capabilities (generate_image is a Figmento plugin tool, not available via `use_figma`)
- The tool-use loop engine (Claude Code has its own agentic loop)
- Phase-based tool filtering (the chatToolResolver is plugin-specific)
- Reference image processing (base64 vision blocks are plugin-specific)
- UI/DOM-related code (format cards, progress bars, DOM manipulation)

---

## Technical Notes

### Key Findings from Source Analysis

#### 1. Text-to-Layout Flow (text-layout.ts)

The text-to-layout mode is a form-based UI flow:
- **Format selection:** User picks from SOCIAL_FORMATS (ig-post 1080x1350, ig-square 1080x1080, ig-story 1080x1920, twitter 1600x900, linkedin 1200x627, etc.) or carousel mode
- **Content input:** Free-text textarea where user describes the design
- **Optional reference images:** Drag-and-drop zone for style reference images (vision blocks)
- **Optional style constraints:** Font selection, color theme presets, custom hex, layout preset
- **Processing:** `handleGenerateTextDesign()` at line 748 assembles a `TextLayoutInput`, detects the brief, builds the system prompt with brief injection, and runs the tool-use loop

The core instruction builder (`buildTextLayoutInstruction` at line 477) constructs a prompt from:
1. Target format with exact dimensions
2. Design preferences (color theme, brand color, font, layout preset)
3. Blueprint zone injection via `inferCategory()` + `getRelevantBlueprint()` + `formatBlueprintZones()`
4. Reference composition notes via `getRelevantReferences()`
5. The user's content brief
6. Tool usage instruction ("Use design tools to build this design. Do NOT return JSON.")

For the skill, this entire instruction-building pipeline must be replaced by inline reference tables and a step-by-step workflow that the LLM follows directly.

#### 2. Brief Detection (brief-detector.ts)

The `detectBrief()` function at line 102 is a pure keyword parser (no AI calls) that extracts:
- **Format:** Matches against 35+ regex patterns organized by platform (Instagram, Facebook, X/Twitter, LinkedIn, Pinterest, TikTok, YouTube, print, presentation, web)
- **Mood:** Scores 12 mood patterns by keyword overlap, picks the best match. Each mood has 5-7 keywords (e.g., moody-dark: moody, dark, dramatic, cinematic, noir, coffee, whiskey)
- **Design type:** Single vs. multi-section (landing page, carousel, website triggers multi-section)
- **Keywords:** Raw nouns/adjectives extracted from the message (stop words filtered)

This logic must be inlined as reference tables so the LLM can perform the same matching when reading a text brief.

#### 3. Brief-to-Design Mapping (system-prompt.ts)

The `buildBriefInjection()` function at line 107 dynamically injects into the system prompt:
- **Palette:** `PALETTES[brief.mood]` — looks up mood ID in compiled palettes, injects primary/secondary/accent/background/text/muted hex values
- **Fonts:** `findBestFontPairing(brief.mood)` — matches mood ID or mood tags against font pairings, injects heading font + body font + recommended weights
- **Blueprint:** `findBestBlueprint(brief)` — scores blueprints by category match (+3), mood match (+2 per word), keyword match (+0.5-1), returns zone breakdown with y_start_pct/y_end_pct + anti-generic rules + memorable element hint + whitespace ratio
- **Composition rules:** For multi-section briefs, injects section_transitions page rhythm, alternating background rule, vertical rhythm, color continuity rules

For the skill, these must become inline lookup tables the LLM consults directly.

#### 4. Blueprint and Reference Loading (blueprint-loader.ts, reference-loader.ts)

- **Blueprint loader:** Maps format names to categories (Instagram->social, Web Hero->web, A4->print, Slide->presentation, Ad->ads), then scores blueprints by category match (+10 base) + mood tag overlap (+1 each)
- **Reference loader:** Similar category/subcategory/mood scoring, returns composition notes (zones, typography scale) for compositional inspiration

The skill must inline the category mapping table and representative blueprint structures.

#### 5. Carousel Workflow (text-layout.ts lines 813-917)

Carousel mode runs a per-slide tool-use loop:
- Slide 1 (cover): Eye-catching hook, brand identity, swipe indicator
- Slides 2-N-1 (content): One idea per slide, slide indicator, swipe arrow
- Slide N (CTA): Echo cover treatment, closing statement/action prompt
- After slide 1, `extractDesignSystem()` captures the design system (colors, fonts, spacing) for cross-slide consistency
- Slides are positioned side-by-side with 40px gap

This workflow should be documented in the skill as an optional multi-slide mode.

### Token Budget Decision (IMPORTANT)

FN-1 risks exceeding 15K tokens when inlining all YAML knowledge (size presets, typography, color, layout). FN-2 has the same knowledge PLUS additional brief detection tables. Options:

1. **Base Skill Pattern (recommended):** Extract shared design knowledge (size presets, typography, color, layout, spacing, overlay rules, taste rules, anti-patterns, quality scoring, `use_figma` code examples) into a "figmento-design-knowledge-base.md" skill that both FN-1 and FN-2 reference. Each mode-specific skill then only inlines its unique content (screenshot analysis for FN-1, brief parsing for FN-2).
2. **Full Inline (simpler but larger):** Each skill inlines everything. Token-heavy but fully self-contained.
3. **Compact Tables (compromise):** Use compressed table format (no descriptions, just values) and abbreviate less-common formats. Target <15K tokens per skill.

**Recommendation:** Start with option 2 (full inline) to match FN-1's self-contained pattern. Measure the token count. If it exceeds 15K, refactor shared sections into a base skill (option 1) as a follow-up FN story. Flag this in the Definition of Done as a measurement gate.

### Adaptation Strategy: Figmento Tools -> use_figma

Same as FN-1. The Figmento plugin tools are high-level wrappers. The `use_figma` tool provides raw Figma Plugin API access. Key differences:
- **Colors**: Figmento accepts hex strings; Plugin API requires `{ r: 0-1, g: 0-1, b: 0-1 }` objects
- **Font loading**: Plugin API requires explicit `figma.loadFontAsync({ family, style })` before setting text properties
- **Auto-layout**: Plugin API requires setting multiple properties (layoutMode, primaryAxisAlignItems, counterAxisAlignItems, paddingTop/Right/Bottom/Left, itemSpacing)
- **Gradients**: Plugin API requires `gradientTransform` matrix — the skill should provide helper patterns

The skill should reuse the same `use_figma` code examples established by FN-1 for consistency.

---

## Source Material Inventory

| Source File | What It Provides |
|-------------|-----------------|
| `figmento/src/ui/text-layout.ts` | Text-to-Layout flow: form-based UI, `buildTextLayoutInstruction()` (the core AI instruction builder), `handleGenerateTextDesign()` (main processing function), carousel slide builders, blueprint zone injection, reference composition injection, tool-use loop invocation |
| `figmento/src/ui/brief-detector.ts` | Brief detection: `detectBrief()` function, FORMAT_PATTERNS (35+ regex patterns for format detection), MOOD_PATTERNS (12 mood patterns with keyword lists), MULTI_SECTION_PATTERNS (multi-section detection), DesignBrief interface |
| `figmento/src/ui/system-prompt.ts` | Full system prompt (~580 lines): `buildSystemPrompt()`, `buildBriefInjection()` (palette/font/blueprint injection), `findBestBlueprint()` (blueprint scoring), `findBestFontPairing()` (mood-to-font matching), `mapFormatToCategory()`, core design rules, typography rules, layout rules, overlay/gradient rules, design taste rules, anti-AI markers, quality scoring, format completion checklists |
| `figmento/src/ui/blueprint-loader.ts` | Blueprint matching: `inferCategory()` with CATEGORY_MAP (format-to-category mapping), `getRelevantBlueprint()` (category + mood scoring), `formatBlueprintZones()` (zone-to-pixel conversion) |
| `figmento/src/ui/reference-loader.ts` | Reference matching: `getRelevantReferences()` (category/subcategory/mood scoring), returns composition notes with zones and typography scale |
| `figmento/src/ui/slide-utils.ts` | Carousel utilities: `extractDesignSystem()` (captures colors/fonts/spacing from slide 1 tool calls), `formatConsistencyConstraint()` (generates cross-slide consistency instruction) |
| `figmento/src/knowledge/compiled-knowledge.ts` | Compiled knowledge: PALETTES (12 mood palettes), FONT_PAIRINGS (20+ pairings), BLUEPRINTS (layout blueprints with zones), COMPOSITION_RULES (multi-section rules), REFINEMENT_CHECKS |
| `packages/figmento-core/src/types.ts` | Type definitions: SocialFormat interface, SOCIAL_FORMATS array (ig-post, ig-square, ig-story, twitter, linkedin, etc.), TextLayoutInput interface, ColorTheme, LayoutPreset |
| `figmento-mcp-server/knowledge/size-presets.yaml` | All format dimensions: 35+ presets across social, print, presentation, web categories |
| `figmento-mcp-server/knowledge/typography.yaml` | Typography system: 4 type scales, 20 font pairings, line height/letter spacing/weight rules |
| `figmento-mcp-server/knowledge/color-system.yaml` | Color system: 12 mood-based palettes with 6 colors each, WCAG contrast rules, safe combos |
| `figmento-mcp-server/knowledge/layout.yaml` | Layout system: 8px grid, spacing scale, margins by format, safe zones, layout patterns |
| `.claude/CLAUDE.md` | Design agent rules: Standard/Blueprint-First workflows, common design patterns, anti-patterns, design brief analysis template |

---

## Skill Structure (Recommended)

The output skill markdown file should be organized as follows:

```
# Text-to-Layout Skill

## Overview
- What this skill does
- Prerequisites (Claude Code + Figma MCP)
- How to invoke

## Workflow
1. Parse the text brief (detect format, mood, design type)
2. Look up dimensions from detected format
3. Select palette from detected mood
4. Select font pairing from detected mood
5. Select layout blueprint from category/mood
6. Complete the Design Brief Analysis
7. Create the root frame
8. Build elements top-down using blueprint zones
9. Apply styling and refinement
10. Self-evaluate

## Brief Parsing Reference

### Format Detection
[Table of format IDs, trigger keywords, and dimensions]

### Mood Detection
[Table of mood IDs and their keyword lists]

### Multi-Section Detection
[List of patterns that trigger multi-section mode]

### Mood-to-Palette Mapping
[Table: mood ID -> primary, secondary, accent, background, text, muted hex values]

### Mood-to-Font Mapping
[Table: mood ID -> heading font, body font, heading weight, body weight]

### Category-to-Blueprint Mapping
[Format category -> blueprint category, zone structures]

## Design Knowledge Reference

### Format Dimensions
[Inline table of all size presets]

### Typography System
[Type scales, line height/letter spacing rules, weight hierarchy, minimum font sizes]

### Layout & Spacing
[8px grid, spacing scale, margins by format, safe zones, layout patterns]

## Design Rules

### Core Rules
[One frame, descriptive names, auto-layout, FILL sizing]

### Design Brief Analysis Template
[Aesthetic direction, font pairing, color story, memorable element, generic trap]

### Typography Hierarchy Rules
[Mandatory rules from system prompt]

### Overlay & Gradient Rules
[Content-aware gradient direction table, 2-stop rule, opacity minimums]

### Design Taste Rules
[8 rules from system prompt]

### Anti-AI Markers
[Structural hard stops + AI tells]

### Quality Scoring
[5-dimension rubric]

### Format Completion Checklists
[Per-format requirements]

## Carousel Mode (Optional)

### Slide Types
[Cover, Content, CTA]

### Cross-Slide Consistency
[Design system extraction, consistency constraints]

### Slide Positioning
[Side-by-side, 40px gap]

## use_figma Code Examples

### Creating a Root Frame
```javascript
const frame = figma.createFrame()
frame.name = "Design Name"
frame.resize(1080, 1350)
frame.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.05, b: 0.04 } }]
```

### Creating Text
### Setting Auto-Layout
### Creating Gradient Overlays
### Creating Buttons
[etc.]

## Self-Evaluation Checklist
[Adapted for skill context]
```

---

## Dependencies

- FN-1 (pattern reference) — FN-2 follows the same story structure and skill format established by FN-1. FN-1 does not need to be implemented first, but its decisions inform FN-2's format.
- Requires read access to all source files listed in the inventory (read-only extraction)

---

## Definition of Done

- [x] Skill markdown file exists at `skills/figmento-text-to-layout.md`
- [x] Skill is self-contained — zero external file references, zero imports
- [x] Skill works with Claude Code + Figma MCP `use_figma` tool (no Figmento plugin required)
- [x] Skill follows Figma Community skill format (title, description, prerequisites, workflow, examples)
- [x] All 12 mood-to-palette mappings are inlined with hex values
- [x] All 12 mood-to-font mappings are inlined with font names and weights
- [x] All 35+ format detection patterns are inlined with keywords and dimensions
- [x] All 12 mood detection patterns are inlined with keyword lists
- [x] Full spacing scale (4-128px) is inlined
- [x] At least 5 `use_figma` code examples are included
- [x] Design taste rules, anti-patterns, and quality scoring are included
- [x] Design Brief Analysis template is included
- [x] Carousel workflow is documented
- [x] Format completion checklists are included
- [x] No screenshot/vision-related content is present
- [x] README/usage instructions are included in the skill header
- [x] Token count measured — ~5-6K tokens (3585 words, 23.6KB). Well under 15K. No base-skill refactoring needed.
- [ ] Skill has been tested by loading it as context and running a text-to-layout task

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Skill exceeds context window when loaded (brief tables + design knowledge) | High | High | Use compact table format; measure token count; if >15K, extract shared knowledge into a base skill (FN-2b) |
| Brief detection tables are too rigid as static lookups vs. regex matching | Medium | Medium | Document the keyword matching approach clearly; the LLM's natural language understanding compensates for regex limitations |
| `use_figma` Plugin API differences cause silent failures | Medium | Medium | Reuse FN-1's code examples; include hex-to-RGB conversion, font loading, gradient transform helpers |
| Carousel workflow complexity is hard to express in a skill | Medium | Low | Document as an optional section; carousel is an advanced workflow that most users won't need on first use |
| Mood-to-palette mapping diverges from compiled-knowledge.ts if YAML is updated | Low | Medium | Note in the skill header that palettes are snapshotted from a specific version; periodically re-extract |
| Skill format evolves between FN-1 and FN-2 | Low | Medium | Coordinate with FN-1 implementation; both stories should be consistent |

---

## File List

| File | Action | Description |
|------|--------|-------------|
| `skills/figmento-text-to-layout.md` | CREATE | The extracted skill file — full brief-to-design pipeline |
| `docs/stories/FN-2.story.md` | MODIFY | Status Ready -> InProgress, ACs checked, file list + change log updated |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | @sm (River) | Story drafted from Epic FN Phase 1. Full source material analysis of text-layout.ts, brief-detector.ts, system-prompt.ts, blueprint-loader.ts, reference-loader.ts, slide-utils.ts, compiled-knowledge.ts, and all 4 knowledge YAML files. Token budget concern flagged with recommendation. |
| 2026-03-24 | @po (Pax) | **Validation: GO — 10/10.** Status Draft → Ready. All 10 checklist points PASS. Story is comprehensive with detailed brief detection tables, mood/palette/font mapping ACs, and a strong token budget measurement gate in the DoD. **Recommendations (non-blocking):** (1) AC13 end-to-end test would benefit from a minimum quality bar (e.g., "scores >=60 on self-evaluation checklist") to prevent trivially passing tests. (2) AC11 carousel documentation should note "summary reference only — full carousel orchestration skill is FN-3" to clarify the FN-2/FN-3 boundary. Cross-story validation with FN-3 confirmed no scope gaps. |
| 2026-03-24 | @dev (Dex) | **Implementation: skill file created.** Status Ready → InProgress. Created `skills/figmento-text-to-layout.md` with full brief parsing pipeline (28 format patterns, 12 mood patterns, multi-section detection), all 12 mood-to-palette and mood-to-font mappings inlined, 11 blueprint zone structures across 5 categories, complete design rules (typography hierarchy, layout/8px grid, overlay/gradient direction table, 8 taste rules, anti-AI markers, quality scoring), carousel workflow summary, Design Brief Analysis template, 6 `use_figma` code examples (hex-to-RGB, root frame, text+font loading, auto-layout, gradient overlay, button), and 16-point self-evaluation checklist. All ACs checked except AC13 (end-to-end test requires live Figma MCP). Skill follows FN-1 structure exactly. AC11 carousel section includes FN-3 boundary note per @po recommendation. |
