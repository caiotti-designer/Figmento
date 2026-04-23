# FN Phase 1 — Live Testing Plan

**Date:** 2026-03-24
**Prepared by:** @dev (Dex)
**Purpose:** AC11 end-to-end validation for all Phase 1 skills (FN-1 through FN-4)
**Quality bar:** Publishable on Figma Community as Figmento's flagship skills
**Scoring system:** 16-point self-evaluation checklist (target: 12+/16 per design, i.e. >=75%)

---

## Prerequisites

- [ ] Claude Code connected to Figma MCP server (`mcp__claude_ai_Figma__use_figma` tool responding)
- [ ] Figma file open (blank page or dedicated test file — no existing content that could be damaged)
- [ ] All 4 skill files accessible and loadable as context:
  - `skills/figmento-screenshot-to-layout.md` (FN-1)
  - `skills/figmento-text-to-layout.md` (FN-2)
  - `skills/figmento-carousel-multi-slide.md` (FN-3)
  - `skills/figmento-ad-analyzer.md` (FN-4 — to be created)
- [ ] Screenshot test images prepared (for FN-1 and FN-4):
  - FN-1: A real-world SaaS pricing page screenshot (desktop, ~1440px wide)
  - FN-4: A low-quality existing ad image (Instagram format, with visible design problems)
- [ ] Image generation tool available (mcp-image or equivalent) for FN-4 variant image generation
- [ ] Verify Figma MCP connection: run `mcp__claude_ai_Figma__whoami` to confirm auth

---

## Scoring Rubric (All Tests)

The 16-point self-evaluation checklist from the skill files. Each item is pass/fail. Target: 12+ passing (>=75%).

| # | Check | What to verify |
|---|-------|---------------|
| 1 | **Alignment** | All elements on the 8px grid. No arbitrary spacing values. |
| 2 | **Contrast** | Text meets WCAG AA (4.5:1 normal, 3:1 large text). |
| 3 | **Hierarchy** | Clear reading order with 3+ distinct text sizes. |
| 4 | **Whitespace** | Generous margins. Padding feels almost too spacious. |
| 5 | **Consistency** | Same spacing values for similar elements. |
| 6 | **Safe zones** | No critical content in platform overlay areas. |
| 7 | **Balance** | Visual weight distributed intentionally (not always centered). |
| 8 | **Intent** | Design matches the source material's mood and purpose. |
| 9 | **Typography** | Font weights vary between hierarchy levels. Line heights set correctly. |
| 10 | **Shadows** | If used, vary angle/blur/tint. Not identical on every element. |
| 11 | **Memorable element** | One thing that stands out and makes the design unforgettable. |
| 12 | **Refinement** | No orphaned elements, no default names, no flat hero backgrounds. |
| 13 | **Gradient direction** | Solid end faces the text zone. Color matches background. |
| 14 | **Images resolved** | No empty colored rectangles as placeholder images. |
| 15 | **Font loading** | Every font loaded with `figma.loadFontAsync` before use. |
| 16 | **Auto-layout** | All containers use auto-layout. No absolute positioning on print. |

### Quality Dimensions (weighted scoring for overall grade)

| Dimension | Weight | Key question |
|-----------|--------|-------------|
| Visual Design | 30% | Typography, color, composition quality? |
| Creativity | 20% | Has a memorable element? Not default-looking? |
| Hierarchy | 20% | Clear reading order? CTA identifiable? |
| Technical | 15% | WCAG contrast? Safe zones? Correct dimensions? |
| AI Distinctiveness | 15% | Would a viewer think a human designed this? |

**Grading:** 7+/10 = production-ready, 8.5+/10 = portfolio-quality.

---

## Test Matrix

### Test 1: FN-1 Screenshot-to-Layout

**Skill file:** `skills/figmento-screenshot-to-layout.md`
**What this tests:** Can Claude Code analyze a UI screenshot and faithfully recreate it as an editable Figma design using only `use_figma` Plugin API calls?

#### Test Input

**Screenshot:** A real-world SaaS pricing page — three pricing tiers in a card grid layout with a dark hero background, gradient accents, toggle switch (monthly/annual), feature comparison lists, and prominent CTA buttons. This exercises:
- Card grid layout (auto-layout with multiple children)
- Dark background with gradient depth
- Multiple text hierarchy levels (plan name, price, feature list, CTA)
- Button creation (auto-layout frame + text)
- Color extraction from screenshot
- Varied spacing (tighter within cards, generous between sections)

**Suggested source:** Screenshot Stripe's pricing page, Linear's pricing page, or Vercel's pricing page. Crop to the hero + pricing cards section (~1440x900).

**If no screenshot available, use this fallback prompt:**
> "Recreate a SaaS pricing page hero section in Figma. Dark near-black background (#0D1117), three pricing cards side by side (Free / Pro $29/mo / Enterprise Custom), each card has: plan name, price, feature list with checkmarks (5-7 items), and a CTA button. The Pro card should be highlighted with a blue accent border and 'Most Popular' badge. Use the tech-modern palette. Web hero format 1440x900."

#### Prompt to Claude Code

```
Load the skill file skills/figmento-screenshot-to-layout.md as context.

[Attach screenshot image]

Recreate this pricing page design in Figma. Match the layout, colors, typography hierarchy, and spacing as closely as possible.
```

#### Success Criteria

- [ ] Design brief analysis is shown before any tool calls (aesthetic direction, font pairing, color story, layout pattern, element count)
- [ ] Root frame created at correct web-hero dimensions (1440x900 or closest match to screenshot aspect ratio)
- [ ] Background is NOT flat white/grey — uses dark theme or gradient matching screenshot
- [ ] 3 pricing cards created with auto-layout containers
- [ ] Each card has: plan name (headline size), price (display size), feature list (body size), CTA button (auto-layout frame)
- [ ] At least 3 distinct font sizes used
- [ ] Font weights vary between hierarchy levels (700 for headings, 400 for body)
- [ ] Spacing follows 8px grid
- [ ] CTA buttons use auto-layout (not flat rect + text)
- [ ] All elements have descriptive names (not "Rectangle" or "Text")
- [ ] No `use_figma` Plugin API errors during execution
- [ ] Self-evaluation checklist score: **>=12/16**

#### Known Risks
- Font loading failures if Google Fonts not available in the Figma file
- Complex card grids may require multiple nested auto-layout frames
- Screenshot color extraction is approximate — exact hex matches not expected

---

### Test 2: FN-2 Text-to-Layout

**Skill file:** `skills/figmento-text-to-layout.md`
**What this tests:** Can Claude Code parse a natural-language design brief, select appropriate palette/fonts/layout, and produce a complete Figma design from scratch?

#### Test Input

**Brief:** A warm, editorial Instagram post (1080x1350) for an artisan bakery announcing a seasonal menu. This exercises:
- Mood detection (warm-cozy keywords)
- Format detection (Instagram post)
- Palette selection (warm palette: #C2590A, #A0522D, #E8A87C, #FFF8F0)
- Font pairing selection (Playfair Display + Fira Sans for warm-editorial)
- Blueprint selection (Editorial Overlay for moody/editorial mood)
- Overlay gradient creation (content-aware direction)
- Full design composition from zero visual input

#### Prompt to Claude Code

```
Load the skill file skills/figmento-text-to-layout.md as context.

Create an Instagram post (1080x1350) for "Maison Levain" — an artisan sourdough bakery in Paris. The post announces their autumn menu: "Autumn Has Arrived" as the headline, "New seasonal sourdoughs featuring pumpkin, walnut & fig" as the subheadline. Warm, cozy editorial mood. Include a CTA button that says "Visit Us" and the bakery's handle @maisonlevain at the bottom. The design should feel like a premium food magazine editorial, not a generic social media template.
```

#### Success Criteria

- [ ] Design brief analysis is shown (aesthetic direction, font pairing, color story, blueprint, memorable element, generic trap avoided)
- [ ] Mood correctly detected as warm-cozy or warm-editorial
- [ ] Format correctly detected as ig-post (1080x1350)
- [ ] Palette applied from warm-cozy table (#C2590A primary, #FFF8F0 background, #3E2723 text, #E8A87C accent)
- [ ] Font pairing selected: Playfair Display (heading) + Fira Sans (body) — NOT Inter/Inter
- [ ] Root frame is exactly 1080x1350
- [ ] Background is NOT flat — uses gradient, tinted solid, or depth treatment
- [ ] Headline "Autumn Has Arrived" is display-sized (72-120px for social)
- [ ] Subheadline is visually distinct from headline (different size AND weight)
- [ ] CTA button created with auto-layout frame pattern
- [ ] Handle @maisonlevain positioned within safe zones
- [ ] Instagram safe zones respected (150px top/bottom, 60px sides — no critical content outside)
- [ ] Typography hierarchy: at least 3 distinct text sizes
- [ ] One memorable element present (oversized headline, unexpected color treatment, or editorial element)
- [ ] Design does NOT look like a generic AI template (no light grey + blue, no center-everything, no uniform padding)
- [ ] No `use_figma` Plugin API errors during execution
- [ ] Self-evaluation checklist score: **>=12/16**

#### Known Risks
- Image generation for bakery product photo depends on mcp-image availability
- If no image tool, the design should still work with a bold color/gradient background
- Playfair Display fontWeight 600 would silently fall back to Inter — skill must use 400 or 700

---

### Test 3: FN-3 Carousel / Multi-Slide

**Skill file:** `skills/figmento-carousel-multi-slide.md`
**What this tests:** Can Claude Code produce a multi-slide carousel where all slides share a consistent design system (palette, fonts, spacing) while following the cover-content-CTA narrative arc?

#### Test Input

**Brief:** A 5-slide Instagram carousel (1080x1080 square format) for a tech startup explaining "5 Signs Your Startup Needs a Design System." This exercises:
- Multi-slide orchestration (5 frames, side-by-side positioning)
- Content distribution across slides (cover + 3 content + CTA)
- Cross-slide consistency (same background, fonts, accent color, margins)
- Slide indicators (pagination in consistent position)
- Narrative structure (hook -> content -> CTA)
- Design system propagation (extract from slide 1, enforce on slides 2-5)
- Visual continuity element (brand bar, accent line, or motif)

#### Prompt to Claude Code

```
Load the skill file skills/figmento-carousel-multi-slide.md as context.

Create a 5-slide Instagram carousel (1080x1080 square) for "Synkra" — a design systems consultancy. Topic: "5 Signs Your Startup Needs a Design System."

Slide content:
- Slide 1 (Cover): "5 Signs Your Startup Needs a Design System" — bold hook headline
- Slide 2: "Your developers rebuild the same button 5 different ways" — inconsistency kills velocity
- Slide 3: "Design reviews take longer than the design itself" — alignment friction
- Slide 4: "New hires take 3 months to ship their first feature" — onboarding debt
- Slide 5 (CTA): "Ready to fix this? Book a free design system audit" — @synkra.design

Use a tech-modern or minimal-clean aesthetic. Dark background. The carousel should feel like it belongs on a top-tier design agency's Instagram feed.
```

#### Success Criteria

- [ ] 5 frames created, all exactly 1080x1080
- [ ] Slides positioned side-by-side with consistent gap (40px): x = 0, 1120, 2240, 3360, 4480
- [ ] All 5 slides share the SAME background color
- [ ] All 5 slides use the SAME font family (heading + body)
- [ ] All 5 slides use the SAME accent color
- [ ] All 5 slides have matching margins and safe zones (150px top/bottom, 60px sides)
- [ ] Slide 1 is the cover: bold hook headline, minimal text, establishes visual identity
- [ ] Slides 2-4 are content: one idea per slide, readable at mobile size (primary text >= 48px)
- [ ] Slide 5 is the CTA: echoes cover treatment, includes action prompt and handle
- [ ] Slide indicator present on all slides (e.g., "01/05" format) in consistent position
- [ ] Visual continuity element present on all slides (brand bar, accent line, or recurring motif)
- [ ] Maximum 2-3 text elements per content slide
- [ ] Background is NOT flat white — dark or gradient treatment
- [ ] Fonts are NOT Inter/Inter (unless tech-modern mood is chosen, where Inter is acceptable)
- [ ] No `use_figma` Plugin API errors during execution
- [ ] Self-evaluation checklist score: **>=12/16** (averaged across slides, or scored on representative slide)

#### Cross-Slide Consistency Check (FN-3 specific)

| Property | Slide 1 | Slide 2 | Slide 3 | Slide 4 | Slide 5 | Consistent? |
|----------|---------|---------|---------|---------|---------|-------------|
| Background color | | | | | | [ ] |
| Heading font | | | | | | [ ] |
| Body font | | | | | | [ ] |
| Accent color | | | | | | [ ] |
| Margins (L/R) | | | | | | [ ] |
| Safe zones (T/B) | | | | | | [ ] |
| Indicator position | | | | | | [ ] |
| Continuity element | | | | | | [ ] |

**All 8 rows must be checked for the test to pass.**

#### Known Risks
- 5 slides means 5+ sequential `use_figma` calls — execution time may be long
- Consistency drift is the main failure mode: later slides may diverge from slide 1's design system
- Slide indicator positioning must be identical across all slides — pixel-perfect placement

---

### Test 4: FN-4 Ad Analyzer

**Skill file:** `skills/figmento-ad-analyzer.md` (to be created by FN-4 story)
**What this tests:** Can Claude Code analyze an existing ad, identify its design failures, and produce 3 improved variants (A/B creative + C layout-only) in Figma using the 5-phase pipeline?

#### Test Input

**Ad screenshot:** A poorly designed Instagram ad (1080x1350 or 1080x1080) for a fictional fitness supplement brand. The ad should have visible design problems:
- Cluttered layout with too many competing elements
- Poor text hierarchy (all text similar size/weight)
- Low contrast text over a busy image
- No clear CTA or buried CTA
- Generic stock photo with no mood

**If no screenshot available, use this description to prompt image generation first:**
> "Generate a deliberately mediocre Instagram ad (1080x1350) for 'FitFuel Pro' protein powder. Cluttered layout, too much text, no clear hierarchy, neon green text on a busy gym photo background, multiple competing CTAs ('Buy Now', '50% Off', 'Free Shipping'), tiny logo in corner. This is the 'before' for a redesign exercise."

**Brief data for the analyzer:**
- Product name: FitFuel Pro Whey Protein
- Category: Health & Fitness Supplements
- Platform: Instagram (1080x1350, 4:5)
- Notes: "Target audience is gym-going millennials (25-35). The current ad has terrible engagement — 0.3% CTR vs industry average 1.2%. We need variants that are clean, bold, and have a single clear CTA."

#### Prompt to Claude Code

```
Load the skill file skills/figmento-ad-analyzer.md as context.

[Attach ad screenshot]

Analyze this ad for FitFuel Pro Whey Protein and create 3 improved variants in Figma.

Product: FitFuel Pro Whey Protein
Category: Health & Fitness Supplements
Platform: Instagram (1080x1350)
Notes: Target audience is gym-going millennials (25-35). Current CTR is 0.3% vs 1.2% industry average. Need clean, bold variants with single clear CTA.
```

#### Success Criteria

**Phase 2 — Analysis:**
- [ ] Structured critique produced: what failed (hierarchy, contrast, CTA, layout) and what worked
- [ ] Verbatim text extracted from the original ad
- [ ] Specific composition failures identified (not generic "could be better")
- [ ] Variant plan outlined: A (creative direction 1), B (creative direction 2), C (layout-only with original copy)

**Phase 3 — Image generation:**
- [ ] Image generation attempted for each variant (or graceful fallback if no image tool)
- [ ] Variant A and B have DIFFERENT image moods/compositions
- [ ] Variant C uses a new generated image (NOT the original ad image with baked-in text)

**Phase 4 — Figma construction:**
- [ ] 3 variant frames created in Figma, each 1080x1350
- [ ] Variants positioned side-by-side (200px gap between independent designs)
- [ ] Each variant uses nested auto-layout structure (root > background > hero image > overlay > content frame)
- [ ] Content frame uses VERTICAL auto-layout with `layoutSizingVertical: "HUG"` (NOT fixed height)
- [ ] Gradient overlay is 2-stop, color-matched to background, solid end facing text zone
- [ ] CTA button created with auto-layout frame pattern (not flat rect + text)
- [ ] Typography hierarchy: headline >= 48px, body readable, CTA bold uppercase
- [ ] Only fontWeight 400 or 700 used (no 600 which falls back to Inter)
- [ ] Variant A and B have visually DIFFERENT aesthetics (different mood, palette, font pairing)
- [ ] Variant C uses the original ad's copy verbatim but with improved layout
- [ ] All elements have descriptive layer names

**Phase 5 — Evaluation:**
- [ ] Design report produced with variant summaries
- [ ] A/B test recommendation included (which variants to test, why)
- [ ] Variant C ROI story included (layout improvements alone can outperform)

**Overall:**
- [ ] No `use_figma` Plugin API errors during execution
- [ ] Self-evaluation checklist score: **>=12/16** per variant (check representative variant)
- [ ] All 10 critical rules followed (no fontWeight 600, HUG on content frames, 2-stop gradients, etc.)

#### Ad-Specific Quality Checks (FN-4 specific)

| Check | Variant A | Variant B | Variant C |
|-------|-----------|-----------|-----------|
| Nested auto-layout structure | [ ] | [ ] | [ ] |
| Gradient 2-stop, color-matched | [ ] | [ ] | [ ] |
| Content frame HUG sizing | [ ] | [ ] | [ ] |
| CTA is highest-contrast element | [ ] | [ ] | [ ] |
| Hero image >= 50% of ad area | [ ] | [ ] | [ ] |
| Only fontWeight 400/700 | [ ] | [ ] | [ ] |
| Instagram safe zones respected | [ ] | [ ] | [ ] |
| Distinct from other variants | [ ] | [ ] | N/A |
| Original copy verbatim | N/A | N/A | [ ] |

#### Known Risks
- FN-4 skill file does not exist yet — must be created before this test can run
- Image generation for 3 variants may take significant time (3-5s per image x 3)
- Analysis quality depends on Claude's vision capabilities with the screenshot
- Variant C's "original copy verbatim" requirement is easy to forget

---

## Execution Order

Run tests in this order to build confidence incrementally:

1. **Test 2 (FN-2 Text-to-Layout)** — Simplest end-to-end test. No screenshot needed. Validates basic Figma creation pipeline.
2. **Test 1 (FN-1 Screenshot-to-Layout)** — Adds vision analysis complexity. Validates screenshot-to-design pipeline.
3. **Test 3 (FN-3 Carousel)** — Adds multi-slide orchestration. Validates consistency enforcement.
4. **Test 4 (FN-4 Ad Analyzer)** — Most complex. Multi-phase pipeline with analysis + 3 variants. Run last.

---

## Scoring Template

Use this template to record results for each test:

```markdown
### Test [N]: FN-[N] [Name]

**Date/Time:** YYYY-MM-DD HH:MM
**Duration:** [minutes from first tool call to completion]
**Skill file loaded:** [yes/no]

#### Execution Log
- Design brief analysis shown: [yes/no]
- Total `use_figma` calls: [count]
- Plugin API errors: [count — list any errors]
- Self-correction attempts: [count — did it fix errors mid-run?]

#### 16-Point Checklist
| # | Check | Pass? | Notes |
|---|-------|-------|-------|
| 1 | Alignment (8px grid) | | |
| 2 | Contrast (WCAG AA) | | |
| 3 | Hierarchy (3+ text sizes) | | |
| 4 | Whitespace (generous) | | |
| 5 | Consistency (spacing) | | |
| 6 | Safe zones | | |
| 7 | Balance | | |
| 8 | Intent (matches brief) | | |
| 9 | Typography (weights, line-height) | | |
| 10 | Shadows (if used, varied) | | |
| 11 | Memorable element | | |
| 12 | Refinement (no orphans) | | |
| 13 | Gradient direction | | |
| 14 | Images resolved | | |
| 15 | Font loading | | |
| 16 | Auto-layout | | |
| **TOTAL** | | **/16** | |

#### Quality Dimensions
| Dimension | Weight | Score (1-10) | Weighted |
|-----------|--------|-------------|----------|
| Visual Design | 30% | | |
| Creativity | 20% | | |
| Hierarchy | 20% | | |
| Technical | 15% | | |
| AI Distinctiveness | 15% | | |
| **TOTAL** | 100% | | **/10** |

#### Test-Specific Checks
[Copy the test-specific success criteria and check each one]

#### Verdict
- [ ] PASS (>=12/16 checklist AND >=7/10 quality AND all critical checks pass)
- [ ] FAIL (reason: ________________)

#### Screenshots
[Export the design from Figma and paste/link here]

#### Notes
[Any observations, failure patterns, or improvement suggestions]
```

---

## Results Summary

| Test | Skill | Checklist Score | Quality Score | Verdict | Notes |
|------|-------|----------------|---------------|---------|-------|
| 1 | FN-1 Screenshot-to-Layout | ≥12/16 | ≥7/10 | **PASS** | Strong typography/spacing decisions. Self-eval loop triggered autonomous refinement. Gap: no image gen (expected — skill is text/layout only). Skill path produced better design taste than plugin baseline. |
| 2 | FN-2 Text-to-Layout | 12/14 | 8.05/10 | **PASS** | Maison Levain autumn menu — warm-cozy mood correctly detected, Playfair Display + Fira Sans pairing, 148px editorial headline, asymmetric left-aligned layout. **Re-verified post-FN-P4-1 (2026-04-12):** rebuilt from scratch with `set_style` gradient + `create_rectangle` fillColor in first batch — 15/15 succeeded, warm wash + dark base + frame gradient all visible. Warm editorial tone now lands as intended. |
| 3 | FN-3 Carousel | 12/13 | 8.65/10 | **PASS** | Synkra "5 Signs" carousel — 5 slides, 46 commands, zero errors. Perfect cross-slide consistency (8/8 rows). Tech-modern dark aesthetic with giant numeric pagination (320px "5" cover, 160px content numbers). Repetitive structure exposed FN-3's strength: consistency enforcement is natural when all slides share the same skeleton. |
| 4 | FN-4 Ad Analyzer | 12/13 | 8.05/10 | **PASS** | ALVES Estofados "Sofá Veneza Cama" — real-world bad ad input. 3 distinct variants produced: A (Urgency/dark/giant price + WhatsApp CTA), B (Editorial/warm/Playfair "Veneza."), C (Layout-Only — same copy verbatim, fixed hierarchy, price now hero). **Re-verified post-FN-P4-1 (2026-04-12):** rebuilt Variant A from scratch with hero image + warm sale wash `create_rectangle({fillColor})` calls — 16/16 succeeded, both rectangles rendered with correct fills on first batch. Red sale wash now visibly lands the urgency intent. A/B test strategy + Variant C ROI story included in report. |

---

## Community Publishing Readiness

All criteria must pass for Figma Community publishing approval:

- [ ] All 4 skills score >=12/16 on checklist (>=75%)
- [ ] All 4 skills score >=7/10 on quality dimensions
- [ ] Skills produce visually distinct outputs from each other (Rule 6: Never Converge)
- [ ] No anti-AI markers in any output (no grey+blue defaults, no Inter everywhere, no center-everything)
- [ ] `use_figma` code examples in skills are accurate (no Plugin API errors observed during testing)
- [ ] Skill instructions are clear enough for a first-time user (no assumed knowledge of Figmento internals)
- [ ] All skills are self-contained (no references to Figmento MCP server, plugin, MISSION.md, or WebSocket relay)
- [ ] Token budget respected (each skill <=6K tokens as measured by ~4 chars/token)
- [ ] "Senior designer or bot?" test — would a design professional consider the outputs professional-grade?

---

## Environment Verification Checklist

Run these commands before starting the test session:

```bash
# 1. Verify Claude Code can reach Figma MCP
# Run: mcp__claude_ai_Figma__whoami
# Expected: Returns authenticated user info

# 2. Verify skill files exist
ls -la skills/figmento-screenshot-to-layout.md
ls -la skills/figmento-text-to-layout.md
ls -la skills/figmento-carousel-multi-slide.md
ls -la skills/figmento-ad-analyzer.md  # Must exist before Test 4

# 3. Verify image generation (optional, for FN-4)
# Run: mcp__mcp-image__generate_image with a test prompt
# Expected: Returns image file path

# 4. Verify Figma file is open and writable
# Run: mcp__claude_ai_Figma__use_figma with a simple frame creation
# Expected: Frame appears in Figma
```

---

## Appendix: Anti-AI Markers to Watch For

During every test, flag these immediately if seen:

| Marker | Severity | Fix |
|--------|----------|-----|
| White/grey default background on hero | CRITICAL | Replace with dark or gradient bg |
| Inter Regular on everything | CRITICAL | Switch to mood-appropriate font pairing |
| Center-aligned everything | HIGH | Vary alignment by hierarchy level |
| Equal padding on every frame | HIGH | Vary for visual rhythm |
| Gradient solid end facing away from text | HIGH | Flip gradient direction |
| Fixed height on text containers | HIGH | Switch to HUG sizing |
| fontWeight 600 on non-Inter fonts | HIGH | Use 400 or 700 only |
| Identical shadows on every card | MEDIUM | Vary angle/blur/tint |
| Perfect symmetry everywhere | MEDIUM | Offset at least one element 60/40 |
| All colors same saturation | MEDIUM | Mix muted + vivid |
| No memorable element | MEDIUM | Add one standout design element |
