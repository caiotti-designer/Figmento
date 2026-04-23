# Ad Analyzer & Redesign — Figma Skill

Analyze an existing ad, identify what fails, and build 3 improved variant frames directly in Figma using the Plugin API.

## Prerequisites

- Claude Code with `use_figma` MCP tool connected
- An ad image (paste, upload, or URL)
- An image generation tool (DALL-E, Midjourney, or similar) for product photos

## How to Use

Share an ad image and say: **"Analyze this ad and create 3 improved variants in Figma"** — or reference this skill by name. Optionally include a brief: product name, category, target platform, and notes.

---

## Workflow

### Phase 1 — Pre-Flight

1. Verify `use_figma` canvas access. Create a test frame, confirm, delete it.
2. Determine target format from the brief or detect from image aspect ratio. Use the Ad Format Reference table below.

### Phase 2 — Analyze the Original Ad

Study the image and extract:

1. **Verbatim text** — Every string: headline, subheadline, CTA, price, specs, brand name. Copy exactly for Variant C.
2. **Composition critique** — Fill this table:

| Aspect | Assessment | Impact |
|--------|-----------|--------|
| Visual hierarchy | [clear / competing / absent] | [high/med/low] |
| Contrast | [WCAG pass / fail areas] | |
| CTA | [prominent / weak / missing] | |
| Image quality | [professional / amateur / stock] | |
| Layout | [structured / cluttered / empty] | |
| Emotional hook | [present / absent] | |

3. **What works** — Note salvageable elements (brand placement, complete info, etc.)
4. **(Optional)** Web search: `"[category] social media ad CTR benchmark best practices 2025"` for industry context.

### Phase 3 — Generate Improved Images

Generate 3 NEW product images using the original as reference. The product must not change — only environment, lighting, and composition.

Prompt pattern: `"The EXACT same [product] from the reference image — same shape, color, texture — placed in [new environment]. Do not alter the product. Only change: room, lighting, composition."`

- **Image A:** Environment matching Variant A mood (e.g., dark moody room, dramatic lighting)
- **Image B:** Environment matching Variant B mood (e.g., bright airy space, natural light)
- **Image C:** New clean environment — NEVER reuse the original image (it has baked-in text overlays)

### Phase 4 — Build Ad Variants in Figma

Create variants as side-by-side frames (200px gap between each) using the nested auto-layout structure below. **Variant C is the required anchor; A and B are creative exploration.**

**Variant priority:**

#### Variant C — Layout-Only (REQUIRED — build this first)

This is the primary deliverable. Original ad copy **VERBATIM** (every word, every bullet, every price, every CTA label exactly as in the source), plus a new generated image that replaces the original (which has baked-in text).

**Why C is the anchor:** It's the ROI argument. The client cannot dismiss it with "but that's not our copy" — every word is theirs. If C outperforms the original in A/B testing, the only variable that changed was hierarchy, proving the original ad's problem was never the message. This is the strongest commercial proof the skill can deliver.

**What changes in C:** visual hierarchy, typography scale, color contrast, CTA prominence, spacing rhythm, image (new generated environment). **What does not change:** copy, brand voice, price points, CTA wording.

#### Variant A — Creative Direction 1 (RECOMMENDED)

Optional creative exploration. New headline/copy, new AI image, bold visual direction (e.g., luxury dark editorial, urgency/sale-first, premium minimal). Build after C is established so the client has the layout-only baseline to compare against.

#### Variant B — Creative Direction 2 (OPTIONAL)

Optional second creative direction for maximum creative range. Must differ from A in mood, palette, font pairing, AND image environment. Use when the client wants to see multiple stretch directions, not required for every engagement.

---

**Variant differentiation rules:**
- A and B must differ from each other in: mood, palette, font pairing, image environment
- C uses verbatim copy — zero text changes from the original ad
- All 3 variants use the same nested auto-layout structure below

### Phase 5 — Evaluate & Report

Produce a design report covering:

```
## Original Ad Analysis
[What failed / what worked table from Phase 2]

## Variant C ROI Story (PRIMARY DELIVERABLE REPORT)

What changed vs original: hierarchy, text zone, real CTA, color, contrast,
spacing. Same copy, same brand, same product photo concept.

If C outperforms original by even 20%, layout investment pays for the entire
catalog. This is the strongest commercial proof the skill delivers.

## Variant Summaries
Per variant: aesthetic direction, fonts, headline, hero image, contrast ratio, target audience, key decision, memorable element

## A/B Test Recommendation

- **Primary test:** Original vs C (isolates layout effect — proves the thesis
  that hierarchy alone drives outcomes)
- **Secondary test (if A delivered):** C vs A (isolates creative direction
  effect after C establishes the baseline)
- **Tertiary test (if both A and B delivered):** A vs B (compares creative
  directions against each other)
- **Budget:** 50% Primary / 30% Secondary / 20% Tertiary
- **Rationale:** C always runs first because it's the required anchor.
  A and B test against C after C has established the baseline improvement.
```

---

## Critical Rules

These are battle-tested from real-world ad redesign sessions. Do not skip.

| # | Rule | Detail |
|---|------|--------|
| 1 | **fontWeight: only 400 or 700** | 600 silently falls back to Inter. Never use 500/600/other. |
| 2 | **fills must be set separately** | `fillColor` on create and `color` in segments are silently ignored. Always set fills after node creation. |
| 3 | **Overlay gradient: 2 stops only** | Stop 0: bg color, opacity 0. Stop 1: bg color, opacity 1 at position 0.4-0.5. Color MUST match section background. Never 3+ stops. |
| 4 | **Content frames must HUG** | `layoutSizingVertical: "HUG"` on content, text-group, cta-group. Fixed height clips text. |
| 5 | **Gradient direction: solid faces text** | Text at bottom = top-bottom direction. Text at top = bottom-top. Solid end always behind text zone. |
| 6 | **Accent color contrast** | Accent colors (gold, terracotta) that work on fills may fail as text. If luminance < 40%, lighten for text use (e.g., #C45A3C button -> #E8956A text). |
| 7 | **Variant C = new image** | Never reuse original ad image — it has baked-in text. Generate a new lifestyle image. Only the COPY stays verbatim. |
| 8 | **Hero image z-order** | After placing a hero image, reorder it behind the overlay. Images append to end by default. |
| 9 | **Load fonts before use** | Every `fontName` assignment requires a prior `figma.loadFontAsync` call. |
| 10 | **Max 2 font families per ad** | Pick one heading + one body font. Weight 400 for body, 700 for headings/CTA. |

---

## Ad Layout Blueprints

### Product Hero Gradient (default)

Hero image top 64%, 2-stop gradient overlay, content zone bottom 36%. The proven Ad Analyzer pattern.

- **Zones:** hero-image 0-64% | gradient-overlay 24-100% | logo top-left | badge top-right (circular) | content 64-96%
- **Content structure:** VERTICAL auto-layout, padding 96/96/64/64, itemSpacing 40. Children: text-group (headline + subheadline) + cta-group (price + button + note)
- **Typography:** headline=display 96px, subheadline=h3 32px, price-sale=h1 48px, CTA=body 24px bold uppercase
- **Memorable:** Cinematic 2-stop gradient seamlessly transitioning product photo to content

### Sale Badge Overlay

Full-bleed lifestyle image with floating circular discount badge top-right and bottom CTA.

- **Zones:** full-bleed image 0-100% | badge top-right 3-18% (circular, 15-20% frame width, accent fill) | gradient-overlay 55-100% (subtler: opacity max 0.8) | content-bottom 72-96%
- **Typography:** headline=h1, price-sale=h2, CTA=body
- **Memorable:** Bold circular badge with high-contrast percentage floating over lifestyle image

### Lifestyle Full-Bleed

Cinematic photo with minimal whisper text. Image does 90% of the work.

- **Zones:** full-bleed image 0-100% | subtle-overlay 70-100% (opacity max 0.6) | whisper-text 78-96%
- **Typography:** tagline=h3 max (no larger), brand-name=caption at 60-70% opacity, CTA=caption
- **Memorable:** Image IS the design — text barely exists, creating aspirational tension

### Comparison Split

Side-by-side for before/after or A vs B.

- **Zones:** header 0-12% | split-area 12-78% (50/50 columns with center divider) | verdict 80-96%
- **Divider:** Thin line, VS badge, or arrow icon at split point
- **Winning side** gets subtle advantage: accent border, brighter bg, or checkmarks
- **Memorable:** VS element at split point transforms comparison into dramatic reveal

### Product Hero Pricing

Product image top 55%, dominant sale price below, badge element.

- **Zones:** product-image 0-55% | badge top-right (circular) | gradient-transition 40-60% | content 58-94%
- **Typography:** tagline=h2, features=body (accent color, dot-separated), original-price=caption (muted), sale-price=DISPLAY (2-3x larger than original), CTA=label
- **CTA isolation:** Double itemSpacing above CTA vs other content gaps
- **Memorable:** Oversized sale price dominates content zone — it should feel almost too large

---

## Ad Format Reference

| Platform | Size | Safe Zones | Key Rules |
|----------|------|-----------|-----------|
| Instagram 4:5 | 1080x1350 | 120px top/bottom, 60px sides | Minimal text. Visual sells. Copy in caption. |
| Instagram 1:1 | 1080x1080 | 120px top/bottom, 60px sides | Center-weighted for mobile. Full-bleed preferred. |
| Instagram Story | 1080x1920 | 150px top, 200px bottom | Vertical flow. Swipe-up CTA zone at bottom. |
| Facebook Feed | 1200x628 | 40px all sides | Max 20% text coverage. Image-dominant. Feed is noisy. |
| LinkedIn Sponsored | 1200x627 | 40-48px all sides | Professional B2B tone. Stats > stock photos. Stat text: 48-72px. |
| Google Leaderboard | 728x90 | 4-8px | Single line: logo (left) > headline (center) > CTA (right). Max 150KB. |
| Google Rectangle | 300x250 | 8px all | Compact: image top, text bottom. 1-2 lines max. Max 150KB. |
| Google Skyscraper | 160x600 | 8px all | Narrow vertical: 2-3 words/line. Logo top, CTA bottom. Max 150KB. |

**Typography scales by platform:**

| Level | Social (1080px) | Facebook (1200px) | LinkedIn | Google Display |
|-------|----------------|-------------------|----------|---------------|
| Headline | 48-96px | 36-56px | 32-48px | 16-28px |
| Body | 24-32px | 18-24px | 16-22px | 12-16px |
| Caption | 20-26px | 14-18px | 14-16px | 11-14px |

---

## Ad Design Rules

**Typography:** Headline >=48px (mobile-readable at scroll speed). Max 2 font families. Weight 400 (body) / 700 (headings, CTA) only. Line height: display 1.1-1.2, headings 1.3-1.4, body 1.5-1.6. Letter spacing: display -0.02em, uppercase +0.05 to +0.15em.

**Color:** Max 3-4 colors per ad. WCAG contrast minimum 4.5:1 body, 3:1 large text. Accent text needs separate contrast verification. Gradient color must match section background.

**Composition:** Hero image >=50% of ad area. 8px grid spacing (4|8|12|16|20|24|32|40|48|64|80|96|128). CTA must be highest-contrast element. Layer order: background > image > overlay > content.

**Platform-specific:** Instagram = minimal text, let visual sell. Facebook = 20% text coverage max. LinkedIn = professional, data-driven, stat-highlight layouts. Google Display = maximum contrast, every pixel counts.

---

## use_figma Code Examples

### Helpers

```javascript
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return { r, g, b };
}

function gradientTransform(direction) {
  switch (direction) {
    case "top-bottom":    return [[0,1,0],[1,0,0]];
    case "bottom-top":    return [[0,-1,1],[-1,0,1]];
    case "left-right":    return [[1,0,0],[0,1,0]];
    case "right-left":    return [[-1,0,1],[0,-1,1]];
    default:              return [[0,1,0],[1,0,0]];
  }
}
```

### Nested Auto-Layout Ad Structure

```javascript
// Root frame (NONE layout, exact dimensions)
const root = figma.createFrame();
root.name = "Ad Variant A — Luxury Dark";
root.resize(1080, 1350);
root.fills = [{ type: 'SOLID', color: hexToRgb("#0A0A0F") }];
root.clipsContent = true;

// Background rectangle
const bg = figma.createRectangle();
bg.name = "Background";
bg.resize(1080, 1350);
bg.fills = [{ type: 'SOLID', color: hexToRgb("#0A0A0F") }];
root.appendChild(bg);

// Hero image placeholder (replace with generated image)
const heroImg = figma.createRectangle();
heroImg.name = "Hero Image";
heroImg.resize(1080, 864);  // 64% of 1350
heroImg.y = 0;
root.appendChild(heroImg);
// After placing actual image: reorder to index 1 (behind overlay)
```

### Gradient Overlay (Content-Aware)

```javascript
// Overlay: solid end at bottom where text lives
const overlay = figma.createRectangle();
overlay.name = "Gradient Overlay";
overlay.resize(1080, 1020);  // covers transition zone
overlay.y = 330;  // starts above content zone
const bgColor = hexToRgb("#0A0A0F");
overlay.fills = [{
  type: 'GRADIENT_LINEAR',
  gradientTransform: gradientTransform("top-bottom"),
  gradientStops: [
    { position: 0, color: { ...bgColor, a: 0 } },
    { position: 0.4, color: { ...bgColor, a: 1 } }
  ]
}];
root.appendChild(overlay);
```

### Content Frame with Auto-Layout

```javascript
// Content frame — MUST use HUG sizing
const content = figma.createFrame();
content.name = "Content";
content.layoutMode = "VERTICAL";
content.counterAxisAlignItems = "MIN";
content.paddingTop = 96; content.paddingBottom = 96;
content.paddingLeft = 64; content.paddingRight = 64;
content.itemSpacing = 40;
content.layoutSizingHorizontal = "FILL";
content.layoutSizingVertical = "HUG";  // CRITICAL: never fixed height
content.fills = [];
root.appendChild(content);
// Position: content.y = root.height - content.height
```

### Circular Discount Badge

```javascript
const badgeSize = 160;  // ~15% of 1080
const badge = figma.createFrame();
badge.name = "Discount Badge";
badge.resize(badgeSize, badgeSize);
badge.cornerRadius = badgeSize / 2;  // perfect circle
badge.fills = [{ type: 'SOLID', color: hexToRgb("#C9A84C") }];
badge.layoutMode = "VERTICAL";
badge.primaryAxisAlignItems = "CENTER";
badge.counterAxisAlignItems = "CENTER";
badge.x = 1080 - badgeSize - 48;  // top-right with margin
badge.y = 48;

await figma.loadFontAsync({ family: "Inter", style: "Bold" });
const pct = figma.createText();
pct.fontName = { family: "Inter", style: "Bold" };
pct.fontSize = 44;
pct.characters = "25%";
pct.fills = [{ type: 'SOLID', color: hexToRgb("#0A0A0F") }];
badge.appendChild(pct);
root.appendChild(badge);
```

### Pill CTA Button

```javascript
await figma.loadFontAsync({ family: "Inter", style: "Bold" });

const cta = figma.createFrame();
cta.name = "CTA Button";
cta.layoutMode = "HORIZONTAL";
cta.primaryAxisAlignItems = "CENTER";
cta.counterAxisAlignItems = "CENTER";
cta.paddingTop = 20; cta.paddingBottom = 20;
cta.paddingLeft = 96; cta.paddingRight = 96;
cta.cornerRadius = 999;  // pill shape
cta.fills = [{ type: 'SOLID', color: hexToRgb("#F5E6D3") }];
cta.layoutSizingHorizontal = "HUG";
cta.layoutSizingVertical = "HUG";

const ctaLabel = figma.createText();
ctaLabel.name = "CTA Label";
ctaLabel.fontName = { family: "Inter", style: "Bold" };
ctaLabel.fontSize = 24;
ctaLabel.characters = "SHOP NOW";
ctaLabel.fills = [{ type: 'SOLID', color: hexToRgb("#0A0A0F") }];
ctaLabel.letterSpacing = { value: 2, unit: "PIXELS" };
cta.appendChild(ctaLabel);

// Add to content frame's cta-group
ctaGroup.appendChild(cta);
```

### Placing a Hero Image

```javascript
// After generating an image, place it as a fill on the hero rectangle
const image = figma.createImage(imageBytes);
heroImg.fills = [{
  type: 'IMAGE',
  scaleMode: 'FILL',
  imageHash: image.hash
}];

// Fix z-order: move hero image behind overlay (index 1, after background)
root.insertChild(1, heroImg);
```

---

## Common Gotchas & Patterns

### Text Wrapping Rule

Ads place text at absolute coordinates inside a `layoutMode: "NONE"` root frame. In this case, **always set `width` explicitly** on the text node. The Figma Plugin API defaults to `textAutoResize: "WIDTH_AND_HEIGHT"`, which auto-sizes the text width to fit content — long headlines render as a single ultra-narrow column overflowing vertically.

```javascript
// ✅ RIGHT — for absolute-positioned text, set width + textAutoResize = "HEIGHT"
headline.textAutoResize = "HEIGHT";
headline.resize(960, headline.height);
headline.characters = "Sofá Veneza Cama";
```

Content frames wrapped in auto-layout (per the nested structure above) don't need this — the parent constrains width automatically.

### Gradient Shape Requirement

When applying the content-aware overlay gradient (Critical Rule #3), the gradient parameters must be **nested inside a paint object in the `fills` array**:

```javascript
// ✅ RIGHT — gradient as a Paint in the fills array
overlay.fills = [{
  type: "GRADIENT_LINEAR",
  gradientTransform: gradientTransform("top-bottom"),
  gradientStops: [
    { position: 0,   color: { ...bgColor, a: 0 } },
    { position: 0.4, color: { ...bgColor, a: 1 } }
  ]
}];

// ❌ WRONG — top-level gradient params silently no-op, overlay renders transparent
overlay.gradientStops = [...];  // nothing happens
```

### Nested Auto-Layout Overflow

Pricing blocks, comparison layouts, and CTA + badge rows often hit this gotcha. A parent row with a fixed `width` + children using `layoutSizingHorizontal: "HUG"` can silently overflow the parent if the sum of children widths + gaps exceeds the declared width. The row's declared width becomes visual-only — no clipping.

Before nesting pricing row + discount badge, CTA + installment note, or any horizontal composition:

1. Measure: does `Σ(children widths) + (N-1) × itemSpacing` fit inside the parent width?
2. If yes → proceed with nested auto-layout.
3. If no → shrink a child, shrink spacing, or drop the row and use absolute positioning on both children.

Particularly common with Sale Badge Overlay and Product Hero Pricing blueprints — the discount badge is intrinsically sized (HUG) and will push past the price column if the math doesn't fit.

---

## Self-Evaluation Checklist

After each variant, verify:

1. **Contrast** — All text meets WCAG AA (4.5:1 normal, 3:1 large). Check accent text too.
2. **Hierarchy** — 3+ distinct text sizes. Headline >= 2x body size.
3. **Gradient** — 2 stops only. Color matches background. Solid end faces text.
4. **Auto-layout** — All containers use HUG sizing. No fixed-height text frames.
5. **CTA** — Highest-contrast element. Pill shape. Generous padding.
6. **Safe zones** — No critical content in platform overlay areas.
7. **Font weights** — Only 400 and 700 used. No 600.
8. **Hero image** — Fills >= 50% of ad area. Z-ordered behind overlay.
9. **Memorable element** — One unforgettable design decision per variant.
10. **Variant differentiation** — A and B differ in mood, palette, fonts, image environment. C uses verbatim copy.

Target: 8+ of 10 per variant.
