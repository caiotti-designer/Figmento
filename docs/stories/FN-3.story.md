# FN-3: Extract Carousel/Multi-Slide Skill

| Field | Value |
|-------|-------|
| **Story ID** | FN-3 |
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

Extract the Carousel and Presentation multi-slide workflows from the Figmento plugin into a self-contained Figma Skill markdown file that works with Claude Code + the official `use_figma` MCP tool. This is the third skill extraction in the FN epic and follows the pattern established by FN-1.

The Figmento plugin currently bundles two multi-slide modes:

### Carousel Mode (text-layout.ts, FC-6)
1. User enters a topic/content and selects carousel format (square 1080x1080 or portrait 1080x1350)
2. User sets slide count (auto or fixed 3-10) and optional font/color preferences
3. Content is parsed into a per-slide narrative outline (`parseCarouselOutline`) splitting topic text into cover, content, and CTA segments
4. Each slide is generated sequentially via `runToolUseLoop` with per-slide instructions (`buildCarouselSlideInstruction`)
5. Slide 1 establishes the design system; slides 2+ receive consistency constraints extracted from slide 1's tool call log (`extractDesignSystem` from `slide-utils.ts`)
6. After all slides are generated, frames are positioned side-by-side with a 40px gap

### Presentation Mode (presentation.ts, FC-5)
1. User enters content, selects format (16:9 1920x1080, 4:3 1024x768, 2K 2560x1440, or paper/custom), chooses font, color theme, and slide count
2. Slide types are determined by position: title (slide 1), closing (last), and alternating content/image for middle slides
3. Each slide is generated via `runToolUseLoop` with type-specific instructions (`buildSlideInstruction`)
4. Design system extracted from slide 1 is injected into slides 2+ for visual consistency
5. After generation, slides are positioned side-by-side with a 40px gap

The extracted skill must encode the multi-slide orchestration logic — slide sequencing, content distribution, design system extraction and consistency enforcement, slide type templates, canvas positioning — as inline knowledge in a markdown file. The skill consumer will be a Claude Code agent using `use_figma` instead of Figmento's relay/plugin pipeline.

### Why This Matters

Carousel and presentation design is the most complex Figmento workflow — it requires coordinating N separate frames with shared visual identity. Extracting this into a skill means any Claude Code user can generate multi-slide carousels and presentations without the Figmento plugin, dramatically expanding the audience for the highest-value design capability.

### Key Difference from FN-1

FN-1 extracts a single-frame workflow where one prompt produces one design. FN-3 extracts a **multi-frame orchestration** where a single brief produces N coordinated frames. The skill must teach the agent how to:
- Decompose a brief into N slide-sized chunks
- Generate each slide while maintaining cross-slide consistency
- Extract and propagate a design system from slide 1 to subsequent slides
- Place multiple frames on the canvas with correct spacing

---

## Acceptance Criteria

- [x] AC1: Skill file exists at `skills/figmento-carousel-multi-slide.md`
- [x] AC2: Skill is fully self-contained — no references to external YAML files, no `import` statements, no dependency on Figmento MCP server or plugin
- [x] AC3: Skill header includes a usage section explaining how to invoke it (e.g., "Say: Create a 5-slide Instagram carousel about [topic] using the carousel skill")
- [x] AC4: Skill includes multi-frame orchestration logic:
  - [x] AC4a: Step-by-step workflow for generating N slides from a single brief
  - [x] AC4b: Content distribution algorithm — how to split a topic into cover, content slides, and CTA slide
  - [x] AC4c: Design system extraction — how to capture background color, accent color, and font family from slide 1's output and inject into slides 2+
  - [x] AC4d: Consistency enforcement rules — same palette, fonts, margins, safe zones, layout rhythm across all slides
- [x] AC5: Skill includes slide type templates with per-type instructions:
  - [x] AC5a: **Cover/Title slide** — bold headline, visual hook, establish brand identity, swipe indicator (carousel) or logo placement (presentation)
  - [x] AC5b: **Content slide** — one idea per slide, 3-5 bullets or key statement, maintains visual system from slide 1
  - [x] AC5c: **Image slide** — visually dominant element (60% image + 40% text, or full-bleed with overlay)
  - [x] AC5d: **Quote slide** — large italic quote, decorative quotation mark, attribution (presentation only)
  - [x] AC5e: **Data/Stats slide** — stat cards with large numbers, labels below, chart placeholder (presentation only)
  - [x] AC5f: **Comparison slide** — two-column side-by-side layout with divider (presentation only)
  - [x] AC5g: **CTA/Closing slide** — echo cover's visual treatment, bold closing statement, call to action
- [x] AC6: Skill includes format-specific dimensions and rules:
  - [x] AC6a: Instagram carousel — 1080x1080 (square) or 1080x1350 (portrait 4:5), max 10 slides, safe zones 150px top/bottom + 60px sides
  - [x] AC6b: LinkedIn carousel — 1080x1080 or 1080x1350, similar structure
  - [x] AC6c: Presentation 16:9 — 1920x1080, margins 80/80/100/100, master elements (logo bottom-right, page number bottom-center, except title slide)
  - [x] AC6d: Presentation 4:3 — 1024x768, margins 60/60/80/80
  - [x] AC6e: Typography scales per format (carousel: display 72-120px, body 28-32px; presentation 16:9: display 64-96px, body 20-28px; presentation 4:3: display 48-72px, body 16-22px)
- [x] AC7: Skill includes canvas placement rules — slides positioned side-by-side with consistent gap (40px for tight grouping, 200px for visual separation)
- [x] AC8: Skill includes `use_figma` code examples for at least 5 multi-slide operations:
  - [x] AC8a: Creating a slide frame with exact dimensions and background
  - [x] AC8b: Positioning slides side-by-side (`frame.x = slideIndex * (width + gap)`)
  - [x] AC8c: Creating text with font loading for consistent typography across slides
  - [x] AC8d: Creating a slide indicator/pagination element (e.g., "03/10" or dots)
  - [x] AC8e: Creating a CTA button on the closing slide
- [x] AC9: Skill includes carousel-specific visual consistency rules:
  - [x] AC9a: Same background color/style across all slides
  - [x] AC9b: Same font family and weight hierarchy across all slides
  - [x] AC9c: Same margins and safe zones on every slide
  - [x] AC9d: Pagination indicator in consistent position across all slides
  - [x] AC9e: Visual continuity element on every slide (brand bar, accent line, or recurring motif)
- [x] AC10: Skill includes the slide sequencing narrative structure:
  - [x] AC10a: Carousel: Slide 1 = hook/attention-grabber, Slides 2 to N-1 = one content point each, Slide N = CTA
  - [x] AC10b: Presentation: Slide 1 = title, alternating content/image for middle, last = closing
  - [x] AC10c: Content parsing algorithm — bracket list format `[item1, item2, item3]` and plain text fallback
- [ ] AC11: Skill works end-to-end — Given a topic and slide count, When Claude Code processes the request, Then it produces N Figma frames using `use_figma` calls with consistent styling and correct canvas placement
- [x] AC12: Skill follows Figma Community skill format conventions (title, description, usage, workflow steps)

---

## Scope

### IN Scope

- Extracting the Carousel mode (text-layout.ts FC-6 path) into the skill
- Extracting the Presentation mode (presentation.ts FC-5) into the skill
- Inlining slide type templates (cover, content, image, quote, data, comparison, CTA)
- Inlining carousel/presentation format dimensions and typography scales
- Inlining the design system extraction and consistency enforcement logic
- Inlining the content distribution algorithm (topic parsing into per-slide outlines)
- Adapting tool call syntax from Figmento plugin tools to `use_figma` Plugin API calls
- Writing `use_figma` code examples for multi-slide operations
- Canvas placement logic (side-by-side positioning)

### OUT of Scope

- Screenshot-to-Layout skill extraction (FN-1)
- Chat mode / Text-to-Layout single-frame skill (FN-2)
- Ad Analyzer skill extraction (FN-4)
- Full design knowledge inlining (color palettes, font pairings, layout patterns) — these belong in FN-1's shared knowledge section; FN-3 references only carousel/presentation-specific subsets
- Modifying any Figmento source code (read-only extraction)
- The "Add Slide" feature (scan existing slide style + append) — this is a plugin-specific UI interaction that does not translate to a skill workflow
- Image generation integration — the skill focuses on layout and structure
- The tool-use loop engine (Claude Code has its own agentic loop)
- Brief detection logic (the keyword parser is plugin-specific UI code)

---

## Technical Notes

### Key Findings from Source Analysis

#### 1. Carousel Flow (text-layout.ts, FC-6 Section)

The carousel is a sub-mode of the Text-to-Layout flow, activated when the user selects the "carousel" format card. Key mechanics:

- **CarouselConfig**: `{ enabled: boolean, slideCount: 'auto' | number, slideFormat: 'square' | 'portrait' }`
- **Dimensions**: Square = 1080x1080, Portrait = 1080x1350 (4:5)
- **Slide types**: 3 types — `cover` (slide 0), `content` (middle), `cta` (last)
- **Content parsing** (`parseCarouselOutline`): Handles two formats:
  - Bracket list: `"Topic: [item1, item2, item3]"` — first item becomes cover, middle items become content slides, last position is always CTA
  - Plain text: Falls back to generic labels (`content.slice(0, 120)` for cover, `Point N of M` for content, `Call to action` for CTA)
- **Per-slide instructions** enforce mobile-first constraints: primary text >= 48px, secondary >= 32px, max 2-3 text elements per slide
- **Slide indicator**: Each content slide should show a position indicator (e.g., `3/10`) and a subtle swipe arrow

#### 2. Presentation Flow (presentation.ts, FC-5)

The presentation is a dedicated mode with a full-featured UI. Key mechanics:

- **Format options**: 16:9 (1920x1080), 4:3 (1024x768), 2K (2560x1440), paper formats (A4, Letter), and custom dimensions
- **Orientation**: Portrait/landscape toggle for paper formats
- **Slide count**: User-selectable (auto-detected or fixed 3-20)
- **Slide types**: 4 types — `title` (slide 0), `closing` (last), alternating `content`/`image` for middle (every 3rd middle slide is image type)
- **Color themes**: Predefined theme objects or custom hex input
- **Design style presets**: User-selectable aesthetic direction
- **Content type**: Configurable content type setting
- **Slide numbers**: Optional display toggle

#### 3. Design System Extraction (slide-utils.ts)

The `extractDesignSystem()` function is the critical cross-slide consistency mechanism:

- Scans slide 1's tool call log for:
  - **backgroundColor**: First `create_frame` call's `fillColor` (rejects "transparent", empty, non-# values)
  - **fontFamily**: First `create_text` call's `fontFamily` (rejects "undefined", empty)
  - **accentColor**: First `set_fill` call's color that is not black/white/grey (rejects near-grey where R/G/B differ by < 30)
- Falls back to safe defaults: `{ backgroundColor: '#FFFFFF', accentColor: '#000000', fontFamily: 'Inter' }`
- `formatConsistencyConstraint()` formats the extracted system as a human-readable string injected into slides 2+ prompts

**For the skill**, this extraction logic must be described as instructions for the agent: "After creating slide 1, note the background color, font family, and accent color you used. Apply these same values to all subsequent slides."

#### 4. Canvas Positioning

Both carousel and presentation use the same post-processing pattern:
- After all slides are generated, iterate through collected `slideFrameIds`
- Position each frame at `x = i * (slideWidth + gap), y = 0` using `move_node`
- Carousel uses 40px gap, presentation uses 40px gap
- Non-critical operation — continues even if positioning fails

**For the skill**, this maps to `use_figma` setting `frame.x` directly after creation.

#### 5. Knowledge Files

Carousel/presentation-specific knowledge files found:

- **`formats/social/instagram_carousel.yaml`**: Dimensions (1080x1080, 1:1), safe zones (150px top/bottom, 60px sides), typography scale (display 72-120px, body 28-32px), consistency rules (6 rules), slide structure (hook → content → CTA), brand placement rules, composition flow
- **`formats/presentation/slide_16_9.yaml`**: Dimensions (1920x1080), global rules (margins 80/80/100/100, max 6 bullets, one idea per slide), master elements (logo/page number placement), 6 slide types with detailed layouts (title, content, image, quote, comparison, data)
- **`formats/presentation/slide_4_3.yaml`**: Dimensions (1024x768), margins 60/60/80/80, similar slide types scaled down
- **`layouts/social/instagram-carousel-slide.yaml`**: Blueprint with 3 zones (header-bar 0-10%, content 10-85%, footer-bar 85-100%), anti-generic rules, rhythm/whitespace settings
- **`layouts/presentation/title-slide-bold.yaml`**: Blueprint for title slides with 4 zones (branding, headline-center, tagline, visual-accent), anti-generic rules for presentations

#### 6. System Prompt Carousel/Presentation Sections

The `buildSystemPrompt()` output (system-prompt.ts) includes format completion checklists relevant to this skill:

- **Carousel checklist**: Same dimensions per slide, consistent fonts/colors/padding, slide 1=hook, last=CTA, visual continuity element on every slide
- **Presentation checklist**: 1 headline per slide (max 8 words), padding >= 64px, max 3 content elements, consistent template

These checklists should be included verbatim in the skill.

### Token Budget Analysis

@pm flagged the 15K token target. Analysis for FN-3:

**Can be OMITTED (shared with FN-1, not carousel-specific):**
- Full 12 mood-based color palettes (the skill should say "pick a palette and use it consistently" rather than listing all 12)
- Full 20+ font pairings table (just reference the consistency rule)
- Full layout pattern descriptions (carousel/presentation have their own specific layouts)
- Generic design taste rules and anti-AI markers (assume the agent already knows these from a shared base)

**MUST be INCLUDED (carousel/presentation-specific):**
- Slide sequencing logic (cover → content → CTA) with content parsing algorithm (~500 tokens)
- Design system extraction and consistency enforcement rules (~400 tokens)
- Format dimensions and typography scales for all carousel/presentation formats (~600 tokens)
- Slide type templates (7 types) with per-type layout rules (~1500 tokens)
- Canvas placement algorithm (~200 tokens)
- `use_figma` code examples for multi-slide operations (~800 tokens)
- Consistency rules and visual continuity checklist (~400 tokens)
- Safe zones and margin rules per format (~300 tokens)
- Master elements (logo, page numbers) placement rules (~200 tokens)
- Workflow overview and usage instructions (~300 tokens)

**Estimated total: ~5,200 tokens of carousel/presentation-specific content.** Well within the 15K budget, leaving room for essential shared design rules (typography hierarchy, overlay rules, contrast requirements) that should be included for self-containment. Recommend targeting 8-10K tokens total.

### Adaptation Strategy: Figmento Tools -> use_figma

Same approach as FN-1, but with multi-frame considerations:
- **Frame creation per slide**: Each slide is a separate `figma.createFrame()` call with explicit dimensions
- **Frame positioning**: Set `frame.x = slideIndex * (width + gap)` immediately after creation (no post-processing needed)
- **Font loading**: Call `figma.loadFontAsync()` once at the start for all fonts used across all slides
- **Consistency enforcement**: The agent must track colors/fonts used on slide 1 and reuse them — no extractDesignSystem equivalent needed since the agent has full context

---

## Source Material Inventory

| Source File | What It Provides |
|-------------|-----------------|
| `figmento/src/ui/text-layout.ts` | Carousel sub-mode (FC-6): `CarouselConfig` state, `parseCarouselOutline` content distribution algorithm, `buildCarouselSlideInstruction` per-slide prompts with type-specific instructions (cover/content/CTA), `buildCarouselSlideInitialMessages` provider abstraction, carousel generation loop with design system extraction and side-by-side positioning |
| `figmento/src/ui/presentation.ts` | Presentation mode (FC-5): full UI flow, `getSlideType` type determination (title/content/image/closing), `buildSlideInstruction` per-slide prompts, `buildSlideInitialMessages` provider abstraction, per-slide generation loop with design system extraction, side-by-side positioning, Add Slide feature, format/orientation/font/color selection |
| `figmento/src/ui/slide-utils.ts` | Shared multi-slide utilities: `SlideDesignSystem` interface (backgroundColor, accentColor, fontFamily), `extractDesignSystem` function that scans slide 1's tool call log for consistent values with fallback guards, `formatConsistencyConstraint` that generates human-readable constraint strings for slides 2+ |
| `figmento/src/ui/system-prompt.ts` | Format completion checklists for carousel and presentation, layout rules, typography rules, overlay rules — portions relevant to multi-slide consistency |
| `figmento/src/ui/brief-detector.ts` | Format detection patterns (ig-carousel, slide-16-9, etc.), mood patterns, multi-section detection — informs how carousel/presentation briefs are classified |
| `figmento-mcp-server/knowledge/formats/social/instagram_carousel.yaml` | Instagram carousel format: dimensions (1080x1080), safe zones, typography scale, consistency rules (6 rules), slide structure (hook → content → CTA), brand placement, composition flow rules |
| `figmento-mcp-server/knowledge/formats/presentation/slide_16_9.yaml` | 16:9 presentation format: dimensions (1920x1080), global rules (margins, grid, max bullets), master elements (logo/page number placement), 6 slide type layouts with detailed positioning and rules |
| `figmento-mcp-server/knowledge/formats/presentation/slide_4_3.yaml` | 4:3 presentation format: dimensions (1024x768), margins, scaled-down typography, slide type layouts |
| `figmento-mcp-server/knowledge/layouts/social/instagram-carousel-slide.yaml` | Carousel slide blueprint: 3 zones (header-bar 0-10%, content 10-85%, footer-bar 85-100%), anti-generic rules, rhythm/whitespace settings, memorable element (slide number indicator) |
| `figmento-mcp-server/knowledge/layouts/presentation/title-slide-bold.yaml` | Presentation title slide blueprint: 4 zones (branding, headline-center, tagline, visual-accent), anti-generic rules (display-scale headline, no white backgrounds, visual accent at bottom) |
| `figmento-mcp-server/knowledge/size-presets.yaml` | Carousel entry (ig-carousel: 1080x1080), presentation entries (pres-16-9: 1920x1080, pres-4-3: 1024x768, pres-2k: 2560x1440) |

---

## Skill Structure (Recommended)

The output skill markdown file should be organized as follows:

```
# Carousel & Multi-Slide Design Skill

## Overview
- What this skill does (multi-frame carousel and presentation generation)
- Prerequisites (Claude Code + Figma MCP)
- How to invoke (carousel vs presentation examples)

## Multi-Slide Workflow
1. Parse the brief — identify format (carousel vs presentation), slide count, content
2. Determine format dimensions and slide types
3. Plan content distribution across slides (cover → content → CTA)
4. Create slide 1 — establish the design system (palette, font, spacing)
5. Create slides 2 through N — inject consistency constraints from slide 1
6. Position all slides side-by-side on the canvas
7. Verify visual consistency across all slides

## Content Distribution

### Carousel Narrative Structure
- Slide 1: Hook / attention-grabber
- Slides 2 to N-1: One content point per slide
- Slide N: Call to action
- Content parsing: bracket list format and plain text fallback

### Presentation Narrative Structure
- Slide 1: Title slide
- Middle slides: Alternating content/image (every 3rd = image)
- Last slide: Closing / CTA

## Slide Type Templates

### Cover / Title Slide
[Layout, typography, rules]

### Content Slide
[Layout, typography, rules]

### Image Slide
[Layout options: split or full-bleed]

### Quote Slide (Presentation)
[Large quote, attribution]

### Data / Stats Slide (Presentation)
[Stat cards layout]

### Comparison Slide (Presentation)
[Two-column layout]

### CTA / Closing Slide
[Echo cover treatment, action prompt]

## Format Reference

### Carousel Formats
[IG carousel: 1080x1080 or 1080x1350, safe zones, typography scale]
[LinkedIn carousel: dimensions]

### Presentation Formats
[16:9: 1920x1080, margins, master elements, typography scale]
[4:3: 1024x768, margins, typography scale]

## Visual Consistency Rules
- Design system propagation (same bg, accent, font across all slides)
- Consistency checklist (6 rules from instagram_carousel.yaml)
- Master elements placement (logo, page numbers)
- Pagination indicator position

## Canvas Placement
- Side-by-side positioning formula
- Gap sizes (40px tight, 200px separated)

## use_figma Code Examples

### Creating a Slide Frame
```javascript
const slide = figma.createFrame()
slide.name = "Slide 1 — Cover"
slide.resize(1080, 1080)
slide.x = 0
slide.fills = [{ type: 'SOLID', color: { r: 0.04, g: 0.04, b: 0.06 } }]
```

### Positioning Slides Side-by-Side
```javascript
slide.x = slideIndex * (1080 + 40) // 40px gap
slide.y = 0
```

### Creating Consistent Text Across Slides
### Creating a Slide Indicator
### Creating a CTA Button
[etc.]

## Completion Checklist
[Carousel and presentation format checklists from system prompt]
```

---

## Dependencies

- FN-1 establishes the skill format pattern — FN-3 follows the same structure
- FN-3 does NOT depend on FN-1 being implemented (both are parallel extractions from different source files)
- Requires read access to all source files listed in the inventory (read-only extraction)

---

## Definition of Done

- [x] Skill markdown file exists at `skills/figmento-carousel-multi-slide.md`
- [x] Skill is self-contained — zero external file references, zero imports
- [x] Skill works with Claude Code + Figma MCP `use_figma` tool (no Figmento plugin required)
- [x] Skill follows Figma Community skill format (title, description, prerequisites, workflow, examples)
- [x] Multi-slide orchestration workflow is documented (sequential slide generation with consistency propagation)
- [x] All 7 slide type templates are included with layout rules and typography specifications
- [x] Content distribution algorithm is documented (bracket list parsing + plain text fallback)
- [x] Design system extraction logic is described (capture from slide 1, inject into slides 2+)
- [x] Carousel format dimensions and rules are inlined (IG carousel, LinkedIn carousel)
- [x] Presentation format dimensions and rules are inlined (16:9, 4:3 with slide type layouts)
- [x] Canvas placement formula is documented with code example
- [x] At least 5 `use_figma` code examples for multi-slide operations are included
- [x] Visual consistency rules and checklist are included
- [ ] Skill has been tested by loading it as context and generating a multi-slide carousel + presentation
- [x] Skill total token count measured and documented (target ≤15K tokens, estimate ~4 chars/token) — measured: ~5,063 tokens (20,250 chars)

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent loses consistency across slides in long carousel (8+ slides) | Medium | High | Include explicit "consistency checkpoint" instructions — after every 3 slides, verify palette/font/spacing match slide 1. Include a self-check step. |
| Token budget for slide-type-specific rules may exceed target if all 7 types are fully detailed | Medium | Medium | Use compact table format for slide type rules; share common rules (margins, typography scale) once and reference by format, not per slide type |
| `use_figma` canvas positioning may behave differently than Figmento's `move_node` | Low | Medium | Include explicit `frame.x = index * (width + gap)` pattern which is the raw Plugin API equivalent; test with both sequential and batch creation |
| Presentation's 6 slide types with detailed pixel-level layouts may be too prescriptive for a skill | Medium | Low | Provide proportional zones (percentages) rather than fixed pixel positions; let the agent adapt to actual content |
| Content distribution algorithm produces poor splits for short or very long briefs | Low | Medium | Include guidance for edge cases: fewer than 3 slides, more than 10 slides, single-sentence briefs |

---

## File List

| File | Action | Description |
|------|--------|-------------|
| `skills/figmento-carousel-multi-slide.md` | CREATE | The extracted carousel/multi-slide skill file (~5K tokens, 20.2KB) |
| `docs/stories/FN-3.story.md` | MODIFY | Added DoD token measurement entry, updated ACs, status, file list, change log |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | @sm (River) | Story drafted from Epic FN Phase 1. Full source material analysis of text-layout.ts (carousel FC-6 path), presentation.ts (FC-5), slide-utils.ts (design system extraction), system-prompt.ts (format checklists), brief-detector.ts (carousel/presentation format detection), and 5 carousel/presentation knowledge YAML files (instagram_carousel, slide_16_9, slide_4_3, instagram-carousel-slide blueprint, title-slide-bold blueprint). |
| 2026-03-24 | @po (Pax) | **Validation: GO (Conditional) — 9.5/10.** Status Draft → Ready. 9 PASS, 1 PARTIAL (DoD missing token count measurement gate). **Conditional fix (documented, non-blocking):** Add DoD item for token count measurement ("Token count measured — target <10K per Token Budget Analysis; if exceeding, compress or extract to base skill") to maintain parity with FN-1 and FN-2. **Recommendations (non-blocking):** (1) OUT scope item "Full design knowledge inlining... these belong in FN-1's shared knowledge section" contradicts AC2 self-containment — developer should follow Token Budget Analysis guidance (include essential shared rules) rather than OUT scope wording. (2) AC11 end-to-end test should specify testing both carousel AND presentation modes. (3) Consider adding 2K presentation format (2560x1440) to AC6 or explicitly excluding it. Cross-story validation with FN-2 confirmed no scope gaps between the two stories. |
| 2026-03-24 | @dev (Dex) | **Implementation: AC1-AC10, AC12 complete.** Added DoD token measurement entry per @po conditional fix. Created `skills/figmento-carousel-multi-slide.md` (20,250 chars / ~5,063 tokens at 4 chars/token — well within 15K target). Skill includes: 7-step multi-slide workflow, content distribution algorithms (bracket list + plain text fallback) for both carousel and presentation, design system propagation from slide 1, 6-rule visual consistency checklist, all 7 slide type templates with carousel and presentation variants, format dimensions/typography/safe zones for IG carousel + LinkedIn carousel + 16:9 + 4:3 + 2K, canvas placement formula, 5 `use_figma` code examples (frame creation, positioning, text, pagination, CTA button), hex-to-RGB and gradient helpers, essential design rules subset (typography hierarchy, overlay rules, taste rules, WCAG), font pairings and color palettes quick reference. Followed @po recommendation (1): included essential shared design knowledge inline for self-containment per AC2, following Token Budget Analysis guidance. Followed recommendation (3): included 2K presentation format (2560x1440) in format reference table. AC11 (end-to-end test) left unchecked — requires live testing with Claude Code + Figma MCP. Status Ready → InProgress. |
