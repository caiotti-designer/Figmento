# FN-4: Extract Ad Analyzer Skill

| Field | Value |
|-------|-------|
| **Story ID** | FN-4 |
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

Extract the Ad Analyzer + Redesign workflow from the Figmento plugin and MISSION.md into a self-contained Figma Skill markdown file that works with Claude Code + the official `use_figma` MCP tool. This is the fourth and final skill extraction in the FN epic, following the pattern established by FN-1.

The Figmento Ad Analyzer currently operates as a multi-phase pipeline:

1. **Input capture** (plugin UI): User uploads an existing ad image and fills a structured brief (product name, category, platform, notes)
2. **Analysis** (MISSION.md Phase 2): Vision analysis of the original ad — extracts verbatim text, identifies composition failures (hierarchy, contrast, CTA, layout), assesses what works
3. **Image generation** (MISSION.md Phase 3): Generates 3 new product images using the original as reference (same product, new environments/lighting/composition)
4. **Figma construction** (MISSION.md Phase 4): Builds 3 ad variant frames in Figma using a proven nested auto-layout structure with gradient overlays, typography hierarchy, and CTA buttons
5. **Evaluation & report** (MISSION.md Phase 5): Evaluates each variant against quality criteria and produces a design report with A/B test recommendations

The three variant types are central to the workflow:
- **Variant A:** Creative direction — new headline/copy, new AI image, bold visual direction
- **Variant B:** Creative direction — new headline/copy, new AI image, DIFFERENT mood/palette/fonts from A
- **Variant C:** Layout-only redesign — original ad copy verbatim + new generated image, proving that layout improvements alone can outperform the original

The extracted skill must encode:
- The 5-phase workflow (connect, analyze, generate images, build in Figma, evaluate)
- The 10 critical rules battle-tested across multiple real-world runs (font weight 600 bug, fillColor non-persistence, tempId placement, batch discipline, overlay gradient 2-stop rule, content frame HUG sizing, accent color contrast, etc.)
- Ad-specific layout blueprints (product-hero-gradient, sale-badge-overlay, lifestyle-fullbleed, comparison-split, product-hero-pricing)
- Platform-specific ad format dimensions and safe zones (Instagram, Facebook, LinkedIn, Google Display)
- The nested auto-layout ad structure pattern (root frame > background > hero image > overlay > logo > badge > content frame with text-group + cta-group)
- Variant generation strategy (A/B creative + C layout-only)
- Design report format for A/B test recommendations

### Why This Matters

The Ad Analyzer is the highest-value Figmento workflow for commercial users — it turns a bad ad into 3 professionally redesigned variants with A/B test guidance. Extracting it into a skill means any Claude Code user with `use_figma` can run the full analyze-and-redesign pipeline without the Figmento plugin, MCP server, WebSocket relay, or API keys. The skill also serves as a self-contained ad design reference for any ad creation task, not just ad analysis.

### Key Differences from FN-1

FN-1 extracts a single-frame screenshot recreation workflow. FN-4 extracts a **multi-phase analytical pipeline** that:
- Starts with vision analysis of an existing design (evaluation, not recreation)
- Produces a structured critique before any design work begins
- Generates 3 coordinated but visually distinct variant frames
- Includes a reporting/recommendation phase after construction
- Has 10 battle-tested critical rules learned from real-world failure modes

---

## Acceptance Criteria

- [x] AC1: Skill file exists at `skills/figmento-ad-analyzer.md`
- [x] AC2: Skill is fully self-contained — no references to external YAML files, no `import` statements, no dependency on Figmento MCP server, plugin, MISSION.md, or WebSocket relay
- [x] AC3: Skill header includes a usage section explaining how to invoke it (e.g., "Share an ad image and say: Analyze this ad and create 3 improved variants in Figma")
- [x] AC4: Skill includes the complete 5-phase workflow adapted for `use_figma`:
  - [x] AC4a: Phase 1 — Pre-flight (verify canvas access, plan dimensions)
  - [x] AC4b: Phase 2 — Ad analysis instruction (extract verbatim text, identify composition failures, assess strengths, define variant plan with A/B/C strategy)
  - [x] AC4c: Phase 3 — Image generation guidance (reference image prompting pattern, per-variant image requirements, Variant C must use new image not original)
  - [x] AC4d: Phase 4 — Figma construction with nested auto-layout structure
  - [x] AC4e: Phase 5 — Evaluation checklist and design report format
- [x] AC5: Skill includes all 10 critical rules from MISSION.md v3:
  - [x] AC5a: Font weight 600 silent fallback to Inter
  - [x] AC5b: fillColor/segment color non-persistence — always use separate fill call
  - [x] AC5c: Overlay gradient 2-stop rule (color-matched, 40% breakpoint, direction table)
  - [x] AC5d: Content frames must HUG — never fixed height
  - [x] AC5e: Accent color contrast verification (lighten saturated colors for text use)
  - [x] AC5f: Remaining rules (tempId placement, batch discipline, Variant C new image requirement)
- [x] AC6: Skill includes ad-specific layout blueprints inlined as structured descriptions:
  - [x] AC6a: Product Hero Gradient — zone percentages, gradient overlay spec, content hierarchy
  - [x] AC6b: Sale Badge Overlay — circular badge placement, softer gradient opacity
  - [x] AC6c: Lifestyle Full-Bleed — minimal text, image-dominant, whisper typography
  - [x] AC6d: Comparison Split — side-by-side zones, divider element, verdict section
  - [x] AC6e: Product Hero Pricing — pricing hierarchy (sale price 2-3x larger), feature row, isolated CTA
- [x] AC7: Skill includes ad format dimensions and safe zones for all supported platforms:
  - [x] AC7a: Instagram (1080x1350 4:5, 1080x1080 1:1, 1080x1920 story) with safe zones
  - [x] AC7b: Facebook (1200x628 feed) with 20% text coverage rule
  - [x] AC7c: LinkedIn (1200x627 sponsored) with professional tone rules
  - [x] AC7d: Google Display (728x90 leaderboard, 300x250 rectangle, 160x600 skyscraper)
- [x] AC8: Skill includes `use_figma` code examples specific to ad creation:
  - [x] AC8a: Creating the nested auto-layout ad structure (root > background > hero image > overlay > content frame with text-group + cta-group)
  - [x] AC8b: Creating a gradient overlay with `gradientTransform` matrix for content-aware direction (solid end facing text zone)
  - [x] AC8c: Placing a hero image and reordering z-index (image behind overlay)
  - [x] AC8d: Creating a circular discount badge (auto-layout frame with cornerRadius = width/2)
  - [x] AC8e: Creating a pill-shaped CTA button with generous padding
  - [x] AC8f: Hex-to-RGB helper (reused from FN-1 pattern)
- [x] AC9: Skill includes the analysis output format — structured brief with sections for: original ad critique (what failed/what worked table), variant plan (A/B creative + C layout-only), and design report template (variant summaries, A/B test recommendation, Variant C ROI story)
- [x] AC10: Skill includes ad-specific design rules:
  - [x] AC10a: Typography rules for ads (headline >=48px mobile-readable, max 2 font families, weight 400/700 only)
  - [x] AC10b: Color rules (max 3-4 colors per ad, WCAG contrast, accent text verification)
  - [x] AC10c: Composition rules (hero image >=50% of ad area, 8px grid, CTA must be highest-contrast element)
  - [x] AC10d: Platform-specific rules (Instagram minimal text, Facebook 20% text rule, LinkedIn professional tone)
- [x] AC11: Skill includes the variant generation strategy inline — how A differs from B (different mood, palette, font pairing), why C uses verbatim copy, and the A/B test recommendation framework
- [x] AC12: Skill total token count is <=6K tokens (measured via character estimate: ~4 chars/token). Measure after completion and record in the File List.
- [ ] AC13: Skill works end-to-end — Given an ad image and the skill loaded as context, When Claude Code processes the request, Then it produces 3 ad variant frames in Figma using `use_figma` calls that follow the nested auto-layout structure and pass the critical rules checks

---

## Scope

### IN Scope

- Extracting the Ad Analyzer 5-phase workflow into a standalone skill markdown
- Inlining all 10 critical rules from MISSION.md v3
- Inlining ad layout blueprints (5 blueprints from `knowledge/layouts/ads/`)
- Inlining ad format dimensions and safe zones (6 formats from `knowledge/formats/advertising/`)
- Adapting tool call syntax from Figmento MCP tools to `use_figma` Plugin API calls
- Writing `use_figma` code examples for ad-specific operations (gradient overlay, badge, CTA, hero image placement, nested auto-layout structure)
- Including the analysis output format and design report template
- Including the variant generation strategy (A/B/C pattern)
- Including ad-specific design rules (typography, color, composition, platform rules)

### OUT of Scope

- Screenshot-to-Layout skill (FN-1, complete)
- Chat/Text-to-Layout skill (FN-2)
- Carousel/Presentation skill (FN-3)
- Modifying any Figmento source code (this is a read-only extraction)
- Image generation tool integration (the skill describes what images to generate, but the actual generation depends on the user's available image tools — mcp-image, DALL-E, etc.)
- The plugin UI (ad-analyzer.ts drag-drop, brief form, Bridge polling — these are plugin-specific)
- The `start_ad_analyzer` / `complete_ad_analyzer` MCP tools (these are Bridge relay integration, not needed for the skill)
- Web search integration (Phase 2 mentions a web search for CTR benchmarks — the skill should suggest this as optional, not require a specific search tool)
- The clipboard handoff pattern (plugin-specific UX)

---

## Technical Notes

### Key Findings from Source Analysis

#### 1. MISSION.md v3 — The Battle-Tested Workflow (ad-analyzer/MISSION.md)

MISSION.md is the core intelligence document, refined through multiple real-world ad redesign sessions. It contains:
- 10 critical rules (each learned from a specific failure mode during real runs)
- A 5-phase workflow with exact tool call sequences
- The nested auto-layout structure pattern with precise nesting hierarchy
- Overlay gradient specification (2-stop, color-matched, bottom-top direction, 40% breakpoint)
- Design rules table (font weight, contrast, typography, CTA, spacing, hero image, color, mobile, overlay, auto-layout, accent text)
- MCP tools reference table with per-tool gotchas

The skill must faithfully reproduce this intelligence adapted for `use_figma` syntax. The 10 critical rules are non-negotiable — they prevent the most common failure modes.

#### 2. Plugin UI Flow (figmento/src/ui/ad-analyzer.ts)

The plugin UI handles:
- Image upload/resize (max 2048px, PNG/JPG only)
- Brief form (product name, category, platform select, notes)
- Bridge connectivity check
- Clipboard prompt generation with structured brief format
- Activity log (polls Bridge command count for real-time progress)
- Completion handler (receives report markdown + carousel nodeIds)

For the skill, none of this UI code is needed. The skill user will provide the image and brief directly to Claude Code.

#### 3. MCP Tools (figmento-mcp-server/src/tools/ad-analyzer.ts)

Two MCP tools exist:
- `start_ad_analyzer`: Receives brief + base64 image, saves image to disk, returns brief + critical rules + phase instructions
- `complete_ad_analyzer`: Sends completion report to plugin via Bridge command

Both tools are Bridge relay integration — they pass data between the plugin UI and Claude Code. In the skill context, there is no Bridge relay; the user communicates directly with Claude Code. These tools are NOT needed in the skill.

#### 4. Ad Layout Blueprints (knowledge/layouts/ads/)

Five specialized ad layout blueprints exist:
- **product-hero-gradient**: Hero image top 64%, 2-stop gradient overlay, content zone bottom 36%. Proven pattern from Ad Analyzer v3.
- **sale-badge-overlay**: Full-bleed lifestyle image with circular discount badge top-right and bottom CTA.
- **lifestyle-fullbleed**: Cinematic full-bleed photo with minimal whisper text. Image does 90% of the work.
- **comparison-split**: Side-by-side layout for before/after or A vs B comparisons.
- **product-hero-pricing**: Full-canvas product ad with dominant sale price and badge element.

Each blueprint defines zone percentages, element roles, typography hierarchy, rhythm, anti-generic rules, and a memorable element hint. These must be inlined as structured references.

#### 5. Ad Format Specifications (knowledge/formats/advertising/)

Six ad format files provide platform-specific rules:
- Instagram Ad (1080x1080, safe zones, minimal text rule)
- Facebook Ad (1200x628, 20% text coverage limit)
- LinkedIn Ad (1200x627, professional B2B tone)
- Google Leaderboard (728x90, single-line horizontal layout)
- Google Rectangle (300x250, compact vertical stack)
- Google Skyscraper (160x600, narrow vertical strip)

Each defines dimensions, safe zones, typography scales, layout rules, composition guidelines, and brand placement.

#### 6. Design Report Format (ad-analyzer/design-report.md)

A real-world design report from Ad Analyzer v2 exists and demonstrates the expected output format:
- Original ad analysis (what failed / what worked table)
- Industry context (CTR benchmarks)
- Variant summaries (aesthetic, fonts, headline, hero image, contrast, target audience, key decision, memorable element)
- A/B test recommendation (which pairs to test, budget allocation)
- Variant C ROI story
- Technical notes (bugs, design tokens, evaluation exports)
- Next steps for the client

This format should be included as a template in the skill.

#### 7. Orchestration Tool — generate_ad_variations (figmento-mcp-server/src/tools/orchestration.ts)

The `generate_ad_variations` tool provides an automated pipeline for creating N ad variations from a reference image. It analyzes the reference, creates offset frames, and returns per-variation metadata. This is complementary to the manual MISSION.md workflow — the skill should document the manual 3-variant approach (more control, higher quality) while noting that bulk variation generation is possible.

### Adaptation Strategy: Figmento Tools -> use_figma

The same adaptation principles from FN-1 apply, with ad-specific additions:

- **Gradient overlays**: Figmento's `set_fill` with `gradientDirection: "bottom-top"` becomes Plugin API `gradientTransform` matrix. The skill must include the direction-to-matrix helper from FN-1 plus the 2-stop color-matched specification.
- **Image placement**: Figmento's `place_generated_image` becomes `use_figma` with `figma.createImage()` + fill assignment. The skill should describe the image-as-fill pattern.
- **Carousel creation**: Figmento's `create_carousel` becomes manual frame creation with 200px offset. The skill must include positioning logic.
- **Badge creation**: Circular badge with `cornerRadius = width/2` — same in both APIs but the skill should include a complete code example.

---

## Source Material Inventory

| Source File | What It Provides |
|-------------|-----------------|
| `ad-analyzer/MISSION.md` | Complete 5-phase workflow (v3, battle-tested): 10 critical rules, phase-by-phase instructions, nested auto-layout structure, overlay gradient specification, design rules table, MCP tools reference with gotchas |
| `figmento/src/ui/ad-analyzer.ts` | Plugin UI flow: image upload/resize (max 2048px), brief form structure (product name, category, platform, notes), clipboard prompt format, Bridge activity polling, completion handler — confirms the brief data model |
| `figmento/src/ui/state.ts` | Ad analyzer state shape: imageBase64, imageMimeType, imageWidth/Height, productName, productCategory, platform (default: instagram-4x5), notes, isWatching, report, carouselNodeId, variantNodeIds — defines the brief interface |
| `figmento-mcp-server/src/tools/ad-analyzer.ts` | MCP tool definitions: `start_ad_analyzer` (receives brief + image, returns critical rules + phase instructions), `complete_ad_analyzer` (sends report + nodeIds to plugin) — confirms the handoff contract |
| `figmento-mcp-server/src/tools/orchestration.ts` | `generate_ad_variations` tool: automated N-variation pipeline with reference image analysis, seed-consistent generation, per-variation metadata — complementary bulk approach |
| `figmento-mcp-server/knowledge/layouts/ads/product-hero-gradient.yaml` | Ad layout blueprint: hero image top 64%, 2-stop gradient overlay, content zone bottom 36%, zone percentages, typography hierarchy (display/h1/h3/body/caption), anti-generic rules, rhythm |
| `figmento-mcp-server/knowledge/layouts/ads/sale-badge-overlay.yaml` | Ad layout blueprint: full-bleed lifestyle image, circular discount badge (top-right, 15-20% frame width), bottom gradient + CTA, subtler opacity (0.8 not 1.0) |
| `figmento-mcp-server/knowledge/layouts/ads/lifestyle-fullbleed.yaml` | Ad layout blueprint: cinematic full-bleed photo, minimal whisper text (max h3), subtle gradient (opacity max 0.6), brand name understated at caption scale |
| `figmento-mcp-server/knowledge/layouts/ads/comparison-split.yaml` | Ad layout blueprint: side-by-side or top-bottom split, header + split-area + verdict zones, center divider element, winning side visual advantage |
| `figmento-mcp-server/knowledge/layouts/ads/product-hero-pricing.yaml` | Ad layout blueprint: product image top 55%, discount badge (top-right circular), gradient transition, content zone with dominant sale price (2-3x larger), feature row in accent color, isolated CTA |
| `figmento-mcp-server/knowledge/formats/advertising/instagram_ad.yaml` | Instagram ad format: 1080x1080, safe zones (120px top/bottom, 60px sides), typography scale, minimal text rule, full-bleed preferred |
| `figmento-mcp-server/knowledge/formats/advertising/facebook_ad.yaml` | Facebook ad format: 1200x628, safe zones (40px all), 20% text coverage max, typography scale, feed noise contrast requirement |
| `figmento-mcp-server/knowledge/formats/advertising/linkedin_ad.yaml` | LinkedIn ad format: 1200x627, safe zones (40-48px), professional B2B tone, stat-highlight layout, data-driven imagery preference |
| `figmento-mcp-server/knowledge/formats/advertising/google_leaderboard.yaml` | Google Display leaderboard: 728x90, single-line horizontal, logo-headline-CTA flow, max 150KB |
| `figmento-mcp-server/knowledge/formats/advertising/google_rectangle.yaml` | Google Display rectangle: 300x250, compact vertical stack, image-top-text-bottom, max 150KB |
| `figmento-mcp-server/knowledge/formats/advertising/google_skyscraper.yaml` | Google Display skyscraper: 160x600, narrow vertical, 2-3 words per line max, max 150KB |
| `ad-analyzer/design-report.md` | Real-world design report example: original ad analysis (failures/strengths table), industry CTR benchmarks, variant summaries with full metadata, A/B test recommendation, Variant C ROI story, technical notes, next steps |
| `ad-analyzer/README.md` | Ad Analyzer setup guide: folder structure, expected outputs, MCP config — confirms the workflow contract |
| `figmento/src/ui/system-prompt.ts` | System prompt overlay/gradient rules (lines 380-408): content-aware gradient direction table, 2-stop rule, minimum opacity 0.4, layer order (bg image > overlay > text), format completion checklists |
| `.claude/CLAUDE.md` | Design agent rules: ad/banner/hero section pattern (nested auto-layout structure), gradient overlay rules (Rule 4b), Design Taste Rules (8 rules), anti-AI markers, self-evaluation checklist |
| `skills/figmento-screenshot-to-layout.md` | FN-1 output skill: establishes the skill format pattern, `use_figma` code example style, knowledge inlining approach, gradient transform helper, hex-to-RGB helper — reuse patterns where applicable |

---

## Skill Structure (Recommended)

The output skill markdown file should be organized as follows:

```
# Ad Analyzer — Figma Skill

## Overview
- What this skill does (analyze bad ads, create 3 improved variants)
- Prerequisites (Claude Code + Figma MCP + image generation tool)
- How to invoke

## Workflow

### Phase 1 — Pre-Flight
### Phase 2 — Analyze the Original Ad
### Phase 3 — Generate Improved Images
### Phase 4 — Build the Ads in Figma
### Phase 5 — Evaluate & Report

## Critical Rules (10 rules)
[All 10 rules from MISSION.md, adapted for use_figma]

## Ad Layout Blueprints
### Product Hero Gradient
### Sale Badge Overlay
### Lifestyle Full-Bleed
### Comparison Split
### Product Hero Pricing

## Ad Format Reference
[Platform dimensions, safe zones, typography scales, platform-specific rules]

## Ad Design Rules
[Typography, color, composition, platform rules]

## Variant Strategy
[A/B creative + C layout-only, design report template]

## use_figma Code Examples
### Nested Auto-Layout Ad Structure
### Gradient Overlay with Direction Matrix
### Hero Image Placement + Z-Reorder
### Circular Discount Badge
### Pill CTA Button
### Hex-to-RGB Helper

## Analysis Output Format
[Brief template, critique table, variant plan, design report template]
```

---

## Dependencies

- FN-1 (complete) — establishes the skill format pattern and reusable code examples (gradient transform helper, hex-to-RGB helper, auto-layout pattern)
- No runtime dependencies — the skill is fully self-contained

---

## Definition of Done

- [x] Skill markdown file exists at `skills/figmento-ad-analyzer.md`
- [x] Skill is self-contained — zero external file references, zero imports, no dependency on Figmento plugin/MCP/relay
- [x] Skill works with Claude Code + Figma MCP `use_figma` tool (no Figmento plugin required)
- [x] Skill follows Figma Community skill format (title, description, prerequisites, workflow, examples)
- [x] All 10 MISSION.md critical rules are inlined
- [x] All 5 ad layout blueprints are inlined with zone percentages and typography hierarchy
- [x] All 6 ad format specifications are inlined with dimensions, safe zones, and platform rules
- [x] At least 6 `use_figma` code examples are included (nested structure, gradient overlay, image placement, badge, CTA button, hex-to-RGB)
- [x] Analysis output format is included (critique table, variant plan, design report template)
- [x] Variant A/B/C strategy is documented with differentiation guidance
- [x] Token count is measured and recorded (target: <=6K tokens via ~4 chars/token estimate)
- [ ] Skill has been tested by loading it as context and running an ad analysis task

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Skill exceeds 6K token budget due to 5 blueprints + 6 formats + 10 rules + code examples | Medium | High | Compress blueprint descriptions to zone percentages + key rules only; use compact table format for ad formats; merge overlapping rules; measure at checkpoints |
| Image generation step depends on user's available tools (mcp-image, DALL-E, etc.) | Medium | Medium | Describe image requirements generically ("generate a product photo of X in Y environment"); mention mcp-image as one option but don't require it |
| The 10 critical rules are Figmento MCP-specific (tempId, batch_execute, place_generated_image) | Medium | Medium | Adapt rules to `use_figma` equivalents; some rules become simpler (no tempId needed, no batch_execute, direct Plugin API calls); keep the design rules (gradient, HUG, font weight) which apply universally |
| Font weight 600 bug is Figma-specific, not Figmento-specific — still applies in use_figma | High | High | Keep the font weight rule prominently in the skill since it affects all Figma Plugin API users equally |
| Variant C requires generating a new image (not reusing original with baked-in text) — easy to forget | Medium | Medium | Highlight this rule prominently in both Phase 3 and the Critical Rules section |

---

## File List

| File | Action | Description |
|------|--------|-------------|
| `skills/figmento-ad-analyzer.md` | CREATE | Self-contained Ad Analyzer skill (15.4KB, ~3.9K tokens — well within 6K budget) |
| `docs/stories/FN-4.story.md` | MODIFY | AC checkboxes, file list, change log updated |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | @sm (River) | Story drafted from Epic FN Phase 1. Full source material analysis of: MISSION.md v3 (10 critical rules, 5-phase workflow), ad-analyzer.ts (plugin UI flow, brief data model), ad-analyzer.ts MCP tools (start/complete handoff), 5 ad layout blueprints (product-hero-gradient, sale-badge-overlay, lifestyle-fullbleed, comparison-split, product-hero-pricing), 6 ad format specs (Instagram, Facebook, LinkedIn, Google Display x3), design-report.md (real-world output example), orchestration.ts (generate_ad_variations), system-prompt.ts (overlay/gradient rules), CLAUDE.md (ad/banner patterns), and FN-1 skill (format pattern). |
| 2026-03-24 | @po (Pax) | **Validation: GO — 10/10.** Status Draft -> Ready. All 10 checklist points PASS. Story is the most thorough in the FN series with 16 source files inventoried, 13 top-level ACs with 25+ sub-criteria, and precise scope boundaries. Special checks passed: MISSION.md 10 rules + 5-phase workflow fully covered (AC4+AC5), token budget AC present at <=6K (AC12), consistent format with FN-1/2/3, ad-specific code examples appropriate (AC8a-f), analysis output format well-defined (AC9). **Non-blocking recommendations for @dev:** (1) Measure token count early — 6K is tight for this volume; compress blueprints to zone%+key constraint+memorable element. (2) Reuse FN-1 hex-to-RGB and gradient transform helpers verbatim. (3) Adapt MCP-specific rules (tempId, batch) to universal Plugin API gotchas. (4) Consider single compact table for all 6 ad format dimensions. (5) Google Display formats are highly constrained — compact table rows vs full sections. |
| 2026-03-24 | @dev (Dex) | **Implementation: AC1-AC12 complete.** Skill file created at `skills/figmento-ad-analyzer.md` (15.4KB, ~3.9K tokens). Read all 16 source files: MISSION.md v3 (10 critical rules, 5-phase workflow), ad-analyzer.ts plugin UI, ad-analyzer.ts MCP tools, orchestration.ts, 5 ad layout blueprint YAMLs, 6 ad format spec YAMLs, design-report.md real output, system-prompt.ts overlay rules, CLAUDE.md patterns, FN-1/FN-2 skill format patterns. Key design decisions: (1) Followed @po recommendation — compressed blueprints to zone%+key constraint+memorable element. (2) Used single compact table for all 8 ad format dimensions+safe zones+rules. (3) Adapted MCP-specific rules (tempId→font loading, batch→direct calls) to universal Plugin API gotchas. (4) Reused FN-1 hexToRgb and gradientTransform helpers verbatim. (5) Adapted MISSION.md 10 rules to 10 use_figma-relevant rules (replaced tempId/batch/IMAGE_OUTPUT_DIR/evaluate_design with font loading, z-order, max 2 families, gradient direction). (6) Design report template includes A/B test framework with budget allocation and Variant C ROI story. AC13 (end-to-end test) left unchecked — requires manual Figma session. Status: Ready → InProgress. |
