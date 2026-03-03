# Epic DQ — Design Quality: From AI Output to Professional Figma Design

> Evolve Figmento's design output from "good AI-generated layouts" to "feels like a professional Figma designer built it." Close the quality gap with tools like Aesthetron by adding golden layout blueprints, Figma-native variable binding, reference-driven design, and automated refinement.

| Field | Value |
|-------|-------|
| **Epic ID** | DQ |
| **Priority** | HIGH |
| **Owner** | @pm |
| **Architect** | @architect (Aria) |
| **Status** | Draft |
| **Created** | 2026-02-27 |
| **Depends On** | Architecture v1.3 (S-01–S-27 complete) |

---

## Problem Statement

Figmento has 63 MCP tools, a full knowledge base, and a working design pipeline. But the output quality gap vs. plugins like Aesthetron comes from three missing capabilities:

1. **No compositional blueprints** — Rules say "use 8px grid" but don't encode *proven visual compositions* with exact proportions. The AI invents layout from abstract rules each time, producing inconsistent quality.
2. **No Figma-native integration** — Every color is hardcoded hex, not bound to Figma Variables/Styles. Output doesn't feel "Figma-native" and can't connect to existing design systems in the file.
3. **No visual reference matching** — Can't say "design like this" with a reference image. No library of proven designs to draw compositional DNA from.
4. **No beauty check** — Self-evaluation checks correctness (contrast, alignment) but not beauty (optical balance, rhythm, visual tension, the "memorable element").

## Solution Overview

Four phases, each independently valuable, each building on the last:

| Phase | Name | Stories | Deliverable |
|-------|------|---------|-------------|
| **Phase 1** | Golden Layouts + Refinement | DQ-1 through DQ-4 | 20+ layout blueprints as YAML, refinement rules, new MCP tools, CLAUDE.md updates |
| **Phase 2** | Figma-Native Integration | DQ-5 through DQ-8 | Plugin reads/writes Figma Variables & Styles, agent binds tokens to native Figma features |
| **Phase 3** | Reference-Driven Design | DQ-9 through DQ-12 | Curated reference library, vision-based analysis, reference-matching generation workflow |
| **Phase 4** | Advanced Polish | DQ-13 through DQ-15 | Component variant generation, style extraction/memory, automated refinement agent |

---

## Phase 1 — Golden Layout Blueprints + Design Refinement

> **Goal:** Ship a library of proven compositional blueprints so the AI fills beautiful pre-solved proportions instead of inventing layout from scratch every time. Add a refinement checklist that catches beauty issues, not just correctness.

### Stories

| ID | Title | Executor | Gate |
|----|-------|----------|------|
| DQ-1 | Blueprint Schema + Initial Web Layouts | @dev | @architect |
| DQ-2 | Social, Ad, and Print Blueprints | @dev | @architect |
| DQ-3 | MCP Tools: `get_layout_blueprint`, `list_layout_blueprints` | @dev | @qa |
| DQ-4 | Refinement Rules YAML + CLAUDE.md Integration | @dev | @architect |

### Phase 1 Success Test

**After all Phase 1 stories are complete, execute this end-to-end validation:**

```
PHASE 1 VALIDATION — 4 Designs, 4 Categories
═══════════════════════════════════════════════

Connect to Figma via Figmento MCP. Then create these 4 designs 
using the new blueprint system. Each MUST use get_layout_blueprint 
to select a blueprint, then fill it with content.

TEST 1 — Web Hero Section
  Prompt: "Create a SaaS landing page hero for an AI writing tool 
  called 'Inkwell'. Dark theme, modern, confident. Headline: 
  'Write like a human. Ship like a machine.' Subheadline about 
  AI-powered drafts. CTA: 'Start Writing Free'."
  
  Blueprint expected: web/hero-asymmetric or web/hero-centered
  Pass criteria:
    ✓ Agent called get_layout_blueprint("web", "hero") before designing
    ✓ Proportional zones match the blueprint (±10% tolerance)
    ✓ Has ONE memorable element (oversized text, bleeding image, etc.)
    ✓ Refinement checklist applied (letter-spacing on display, warm shadows, etc.)
    ✓ Passes existing self-evaluation (contrast, hierarchy, spacing)

TEST 2 — Instagram Post
  Prompt: "Create an Instagram post (1080×1350) for a specialty 
  coffee brand called 'Ritual Roasters'. Moody dark aesthetic. 
  Announce a new single-origin Ethiopian bean. Use a lifestyle 
  image placeholder."
  
  Blueprint expected: social/instagram-editorial-overlay or similar
  Pass criteria:
    ✓ Agent called get_layout_blueprint("social", "instagram_post", "moody")
    ✓ Hero image zone ≥50% of frame
    ✓ Text within Instagram safe zones (150px top/bottom, 60px sides)
    ✓ Gradient overlay uses 2-stop rule (from Ad Analyzer v3 lessons)
    ✓ Minimum font sizes respected (headline ≥48px, body ≥28px)

TEST 3 — Product Ad
  Prompt: "Create a product ad (1080×1350) for a wireless 
  headphone called 'AuraX Pro' priced at $299 (was $399). 
  Luxury feel, black and gold. Strong CTA: 'Shop Now'. 
  Include a 25% off badge."
  
  Blueprint expected: ads/product-hero-gradient or ads/sale-badge-overlay
  Pass criteria:
    ✓ Agent called get_layout_blueprint("ads", "product")
    ✓ Price has clear hierarchy (sale price dominant, original struck through)
    ✓ CTA button is the most visually dominant actionable element
    ✓ Badge is positioned without overlapping critical content
    ✓ Gold accent passes contrast check against dark background

TEST 4 — Business Card
  Prompt: "Create a modern business card (1050×600) for 
  'Sarah Chen, CEO, PayFlow Inc.' Email: sarah@payflow.io, 
  Phone: +1 415 555 0123. Use the payflow design system 
  if available, otherwise tech-modern palette."
  
  Blueprint expected: print/business-card-modern
  Pass criteria:
    ✓ Agent called get_layout_blueprint("print", "business_card")
    ✓ Information hierarchy: Name > Title > Company > Contact
    ✓ Minimum print font sizes respected (body ≥18px at 300dpi)
    ✓ Bleed/trim considerations noted
    ✓ Clean, professional — no decorative excess

OVERALL PASS CRITERIA:
  ✓ All 4 designs created successfully using blueprint-first workflow
  ✓ Each design used get_layout_blueprint BEFORE any create_frame calls
  ✓ No design used the old "invent layout from rules" pattern
  ✓ At least 3 of 4 designs have a clearly identifiable "memorable element"
  ✓ Refinement rules visibly applied (tight letter-spacing on headlines, 
    warm/cool shadows matching palette, proper whitespace ratios)
  ✓ All 4 pass evaluate_design without issues
```

---

## Phase 2 — Figma-Native Integration (Variables + Styles)

> **Goal:** Make Figmento output feel like it was built by a designer who uses Figma properly — colors bound to Variables, text linked to Styles, not hardcoded hex values.

### Stories

| ID | Title | Executor | Gate |
|----|-------|----------|------|
| DQ-5 | Plugin handler: `read_figma_context` (Variables, Styles, Fonts) | @dev | @architect |
| DQ-6 | Plugin handlers: `bind_variable`, `apply_style` | @dev | @qa |
| DQ-7 | MCP tools: `read_figma_context`, `bind_variable`, `apply_paint_style`, `apply_text_style`, `apply_effect_style` | @dev | @qa |
| DQ-8 | MCP tool: `create_figma_variables` + CLAUDE.md workflow update | @dev | @architect |

### Phase 2 Success Test

```
PHASE 2 VALIDATION — Figma-Native Output
═════════════════════════════════════════

Prerequisites: Open a Figma file that has:
  - A Variable collection "Brand Colors" with variables: 
    primary, secondary, accent, background, text
  - A Text Style "Heading/H1" (any font, any size)
  - A Paint Style "Fill/Primary" (any color)

TEST 5 — Context Reading
  Prompt: "Read the current Figma file's design context."
  
  Pass criteria:
    ✓ read_figma_context returns all Variable collections and their variables
    ✓ Returns all Paint Styles, Text Styles, Effect Styles
    ✓ Returns available fonts
    ✓ No errors or timeouts

TEST 6 — Variable-Bound Design
  Prompt: "Create an Instagram post for a product launch. 
  Use the Figma variables already in this file for all colors."
  
  Pass criteria:
    ✓ Agent called read_figma_context FIRST
    ✓ Agent used bind_variable instead of set_fill for colors
    ✓ In Figma: selecting a text node shows the variable name 
      in the fill picker (not a raw hex value)
    ✓ Changing the "primary" variable value updates the design automatically

TEST 7 — Variable Creation from Design System
  Prompt: "Create a Figma variable collection from the 'payflow' 
  design system."
  
  Pass criteria:
    ✓ create_figma_variables creates a collection "payflow"
    ✓ All color tokens exist as COLOR variables
    ✓ Spacing tokens exist as FLOAT variables
    ✓ Variables are properly organized with "/" naming (e.g., "color/primary")

OVERALL PASS CRITERIA:
  ✓ Zero hardcoded hex values in designs when variables are available
  ✓ Designs update when variables are changed (proof of binding)
  ✓ Agent prefers variables over raw values in its workflow
```

---

## Phase 3 — Reference-Driven Design

> **Goal:** Build a curated library of high-quality design references with pre-analyzed compositional DNA. The agent matches briefs to references and adapts proven compositions.

### Stories

| ID | Title | Executor | Gate |
|----|-------|----------|------|
| DQ-9 | Reference library structure + schema + 20 initial web references | @dev | @architect |
| DQ-10 | Reference analysis tool: `analyze_reference_image` (Claude vision) | @dev | @qa |
| DQ-11 | MCP tools: `find_references`, `design_from_reference` | @dev | @qa |
| DQ-12 | Social, ad, and print references (30+ images) + CLAUDE.md workflow | @dev | @architect |

### Phase 3 Success Test

```
PHASE 3 VALIDATION — Reference-Driven Generation
═════════════════════════════════════════════════

TEST 8 — Reference Matching
  Prompt: "Find me design references for a dark, modern SaaS 
  landing page hero section."
  
  Pass criteria:
    ✓ find_references returns 3-5 relevant matches
    ✓ Each match includes: image path, mood tags, composition summary
    ✓ Results are relevant (dark theme, web category, hero subcategory)

TEST 9 — Reference-Driven Design
  Prompt: "Create a landing page hero for 'NeuralDash' — an AI 
  analytics dashboard. Use the reference style from ref-007 
  (or best match). Dark theme, blue accents."
  
  Pass criteria:
    ✓ Agent loaded the reference YAML composition data
    ✓ Output proportions match the reference (±15% tolerance)
    ✓ Signature elements from reference adapted (not copied verbatim)
    ✓ Design feels inspired by reference, not identical to it
    ✓ User's brand colors applied, not the reference's colors

TEST 10 — User Reference Analysis
  Prompt: [Upload a screenshot of any well-designed website]
  "Analyze this design and create something similar for my 
  brand 'Zenith Studio'."
  
  Pass criteria:
    ✓ analyze_reference_image extracts compositional DNA
    ✓ Returns structured YAML: layout pattern, color distribution, 
      typography hierarchy, signature elements
    ✓ Generated design captures the "feel" of the reference
    ✓ Not a pixel-copy — adapted to user's brand

OVERALL PASS CRITERIA:
  ✓ Reference library has 50+ entries across web, social, ads, print
  ✓ find_references returns relevant matches for varied queries
  ✓ Reference-driven designs are measurably more visually polished 
    than rule-only designs (compare side by side)
```

---

## Phase 4 — Advanced Polish

> **Goal:** Component variant generation, style extraction/memory, and automated refinement agent.

### Stories

| ID | Title | Executor | Gate |
|----|-------|----------|------|
| DQ-13 | Plugin handlers: `capture_style`, `apply_captured_style` (Style Memory) | @dev | @architect |
| DQ-14 | Component variant generation (Cartesian: size × state × style) | @dev | @qa |
| DQ-15 | Automated refinement agent (post-design polish pass) | @dev | @architect |

### Phase 4 Success Test

```
PHASE 4 VALIDATION — Professional Polish
═════════════════════════════════════════

TEST 11 — Style Memory
  Step 1: Select a beautifully styled button in the canvas.
  Prompt: "Capture this element's style."
  Step 2: Create a new rectangle.
  Prompt: "Apply the captured style to this element."
  
  Pass criteria:
    ✓ capture_style extracts: fills, effects, corner radius, font properties
    ✓ apply_captured_style reproduces the visual identity on the target
    ✓ Works across element types (style from card → applied to section)

TEST 12 — Component Variants
  Prompt: "Generate a button component set with: sizes 
  (sm, md, lg), states (default, hover, pressed, disabled), 
  styles (primary, secondary, ghost)."
  
  Pass criteria:
    ✓ Creates a Figma Component Set
    ✓ 3 × 4 × 3 = 36 variants generated
    ✓ Each variant has correct visual states
    ✓ Hover: darken 10%, Pressed: darken 15%, Disabled: 40% opacity

TEST 13 — Automated Refinement
  Step 1: Create any design using standard workflow.
  Step 2: The refinement agent runs automatically.
  
  Pass criteria:
    ✓ Letter-spacing tightened on display text (>40px)
    ✓ Shadows match palette temperature (warm palette → warm shadow)
    ✓ Visual weight balance verified
    ✓ At least one micro-adjustment made that wasn't in the 
      correctness-only checklist
```

---

## Architecture Impact

### New Files

```
figmento-mcp-server/knowledge/
├── layouts/                    # Phase 1 — Golden Layout Blueprints
│   ├── _schema.yaml
│   ├── web/        (5-8 files)
│   ├── social/     (5-7 files)
│   ├── ads/        (4-5 files)
│   ├── print/      (3-4 files)
│   └── presentation/ (3-4 files)
├── refinement-rules.yaml       # Phase 1 — Beauty checklist
├── references/                 # Phase 3 — Visual reference library
│   ├── _index.yaml
│   ├── web/        (20+ images + YAML companions)
│   ├── social/     (15+ images + YAML companions)
│   ├── ads/        (10+ images + YAML companions)
│   └── print/      (5+ images + YAML companions)

figmento-mcp-server/src/tools/
├── layouts.ts                  # Phase 1 — Blueprint tools
├── figma-native.ts             # Phase 2 — Variable/Style binding tools
└── references.ts               # Phase 3 — Reference matching tools

figmento/src/code.ts     # Phase 2 — New handlers:
                                #   read_figma_context
                                #   bind_variable
                                #   apply_style
                                #   create_figma_variables
                                # Phase 4 — New handlers:
                                #   capture_style
                                #   apply_captured_style
```

### Modified Files

```
figmento-mcp-server/src/server.ts           # Register new tool modules
.claude/CLAUDE.md                            # Updated workflows for all phases
figmento-mcp-server/knowledge/patterns/
  composition-rules.yaml                     # Phase 1 — Link blueprints to patterns
```

### No Breaking Changes

All new tools are additive. Existing 63 tools unchanged. Existing YAML knowledge files unchanged. The agent can still use the old workflow — blueprints and references are *preferred*, not required.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-02-27 | 1.0 | Initial epic definition — 4 phases, 15 stories | @pm |
