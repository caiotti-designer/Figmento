# Carousel & Multi-Slide Design — Figma Skill

Generate multi-slide carousels and presentations as coordinated Figma frames using the Plugin API. Each slide shares a consistent design system — same palette, fonts, spacing — while following a narrative arc from cover to CTA.

## Prerequisites

- Claude Code with `use_figma` MCP tool connected
- A topic or content brief and a target format (carousel or presentation)

## How to Use

Say: **"Create a 5-slide Instagram carousel about [topic]"** or **"Create a 16:9 presentation about [topic] with 8 slides"** — or reference this skill by name.

---

## Multi-Slide Workflow

### Step 1 — Parse the Brief

Identify from the user's request:

1. **Mode** — carousel (social media) or presentation (slides/deck)
2. **Format** — see Format Reference below for exact dimensions
3. **Slide count** — explicit number or auto (default: 4 for carousel, 6 for presentation)
4. **Content** — the topic, outline, or bullet points to distribute across slides
5. **Style preferences** — font, color theme, mood (optional)

### Step 2 — Plan Content Distribution

Split the user's content across slides using the narrative structure for the chosen mode (see Content Distribution below). Complete this plan before creating any frames.

### Step 3 — Load Fonts

Load ALL fonts you will use across the entire deck upfront. This avoids repeated async calls per slide.

```javascript
await figma.loadFontAsync({ family: "Playfair Display", style: "Bold" });
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
```

### Step 4 — Create Slide 1 (Establish the Design System)

Create the first slide (cover/title). This slide **defines** the design system for the entire deck:

- **Background color** — the fill color of the root frame
- **Accent color** — the first non-neutral, non-black/white color you apply
- **Font family** — the heading and body fonts you choose
- **Spacing rhythm** — margins, padding, item spacing

Record these values. You will reuse them on every subsequent slide.

### Step 5 — Create Slides 2 through N (Enforce Consistency)

For each remaining slide:

1. Create a new frame with the **same dimensions** as slide 1
2. Apply the **same background color**
3. Use the **same font family and weight hierarchy**
4. Apply the **same accent color** for highlights, indicators, and CTAs
5. Maintain the **same margins and safe zones**
6. Position the slide on the canvas: `slide.x = slideIndex * (width + gap)`

### Step 6 — Position All Slides Side-by-Side

After all slides are created, verify positioning. Each slide should be at:

```javascript
slide.x = slideIndex * (slideWidth + 40);  // 40px gap for tight grouping
slide.y = 0;
```

### Step 7 — Consistency Checkpoint

After every 3 slides (and after the final slide), verify:

- All slides have the same background color
- All slides use the same font family
- All slides have matching margins and safe zones
- Pagination/indicators are in the same position on every slide
- Visual continuity element (brand bar, accent line, or motif) appears on every slide

Fix any drift before proceeding.

---

## Content Distribution

### Carousel Narrative Structure

| Slide | Type | Purpose |
|-------|------|---------|
| 1 | **Cover** | Hook — attention-grabbing headline that makes users want to swipe |
| 2 to N-1 | **Content** | One idea per slide — focused messaging with supporting visuals |
| N | **CTA** | Call to action — follow, save, share, link in bio |

**Content parsing algorithm:**

1. **Bracket list format** — If the user provides `"Topic: [item1, item2, item3]"`:
   - Cover slide: text before the bracket (the topic)
   - Content slides: one bracket item per slide (up to `slideCount - 2` items)
   - CTA slide: always the last slide
2. **Plain text fallback** — If no bracket list:
   - Cover slide: first 120 characters of the content
   - Content slides: labeled as "Point 1 of N", "Point 2 of N", etc. (agent should elaborate based on the topic)
   - CTA slide: closing call to action

**Slide count rules:**
- Minimum: 3 slides (cover + 1 content + CTA)
- Maximum: 10 slides (Instagram limit)
- Default when "auto": 4 slides
- If the user provides more items than `slideCount - 2`, truncate to fit

### Presentation Narrative Structure

| Slide | Type | Purpose |
|-------|------|---------|
| 1 | **Title** | Opening — centered headline, subtitle, logo, establish visual identity |
| 2 to N-1 | **Content/Image** | Alternating: content slides with bullets, every 3rd middle slide is image-focused |
| N | **Closing** | Echo title slide treatment — bold closing statement or CTA |

**Slide type determination:**

```
if slideIndex === 0 → "title"
if slideIndex === totalSlides - 1 → "closing"
if slideIndex % 3 === 0 → "image"  (every 3rd middle slide)
else → "content"
```

**Slide count rules:**
- Minimum: 3 slides (title + 1 content + closing)
- Maximum: 20 slides
- Default when "auto": 6 slides

---

## Slide Type Templates

### Cover / Title Slide

**Carousel cover:**
- Bold headline (display size: 72-120px for carousel, 64-96px for presentation)
- Minimal text — 1-2 elements maximum
- Strong background: gradient, bold color, or image with overlay
- Establish brand identity: color scheme, font, visual style
- Swipe indicator: subtle arrow or "Swipe >" text at bottom-right (carousel only)
- Logo: top-left corner (carousel) or bottom-center (presentation)

**Presentation title:**
- Centered headline at heroic scale (64px+ for 16:9)
- Subtitle below headline (32px, muted color)
- Background must NOT be plain white — use dark theme, gradient, or tinted solid
- Visual accent in the bottom zone (gradient bar, geometric shape, accent line)
- No page number on title slide

### Content Slide

**Carousel content:**
- One idea per slide — single key statement or 3-5 short bullets
- Primary text >= 48px, secondary >= 32px (mobile-first)
- Maximum 2-3 text elements per slide
- Slide indicator in consistent position (e.g., "3/10" top-right)
- Subtle swipe arrow on non-final content slides

**Presentation content:**
- Headline at top (40-48px, bold)
- Body area below: 3-6 bullet points or key paragraphs
- Left-aligned text with generous line spacing (1.5x)
- Each bullet: one line or two at most
- Master elements: logo bottom-right, page number bottom-center

### Image Slide (Presentation)

Two layout options:

1. **Split layout** — 60% image on left, 40% text on right (or reversed)
   - Clear separation between halves (40px+ gap or thin accent divider)
   - Text side has heading + short description
2. **Full-bleed** — full background image with overlay + text
   - Overlay opacity >= 0.4 for readability
   - Text positioned over the solid end of the gradient

### Quote Slide (Presentation)

- Large decorative quotation mark (200px, primary color at 30% opacity)
- Quote text: 40px italic, centered, 1-3 sentences maximum
- Attribution: name in bold (24px) + role in muted color (20px) below
- Centered layout

### Data / Stats Slide (Presentation)

- Headline at top
- Stat cards in a row (up to 4): large bold number (56px, primary color) + small label below (18px, muted)
- Card width ~380px with 40px spacing between cards
- Optional chart area below stat cards (placeholder rectangle with label)
- Source citation at bottom in caption size

### Comparison Slide (Presentation)

- Headline spanning full width at top
- Two equal columns with a vertical divider (2px line or 40px+ whitespace gap)
- Each column: heading (32px bold) + body content (22px)
- Color-code columns if showing good/bad or before/after
- Keep content balanced — similar amount on both sides

### CTA / Closing Slide

**Carousel CTA:**
- Echo the cover slide's visual treatment (same background, same font style)
- Bold closing statement or action prompt
- CTA text: "Follow for more", "Save this post", "Link in bio", etc.
- Handle/username centered
- Logo: bottom-right corner

**Presentation closing:**
- Headline echoes the title slide's visual treatment
- 2-3 key takeaway bullets (concise, 1 line each)
- CTA with maximum visual weight: accent-colored button or action prompt
- Contact information below CTA in caption size
- Background should match or complement the title slide

---

## Format Reference

### Carousel Formats

| Format | Width | Height | Aspect | Max Slides |
|--------|-------|--------|--------|------------|
| Instagram Square | 1080 | 1080 | 1:1 | 10 |
| Instagram Portrait | 1080 | 1350 | 4:5 | 10 |
| LinkedIn Carousel | 1080 | 1080 | 1:1 | 10 |
| LinkedIn Portrait | 1080 | 1350 | 4:5 | 10 |

**Safe zones (carousel):** 150px top/bottom, 60px sides — keep all text inside these boundaries.

**Typography scale (carousel, 1080px wide):**

| Level | Size Range | Recommended |
|-------|-----------|-------------|
| Display/Hero | 72-120px | 96px |
| Headline | 48-72px | 56px |
| Subheadline | 32-40px | 36px |
| Body | 28-32px | 30px |
| Caption/Label | 22-26px | 24px |

**Carousel margins:** 48px default. Use 8px grid spacing: 4|8|12|16|20|24|32|40|48|64|80|96|128

### Presentation Formats

| Format | Width | Height | Aspect |
|--------|-------|--------|--------|
| Widescreen 16:9 | 1920 | 1080 | 16:9 |
| Standard 4:3 | 1024 | 768 | 4:3 |
| 2K Widescreen | 2560 | 1440 | 16:9 |

**16:9 margins:** top 80, bottom 80, left 100, right 100

**4:3 margins:** top 60, bottom 60, left 80, right 80

**Typography scale (16:9, 1920px wide):**

| Level | Size Range | Recommended |
|-------|-----------|-------------|
| Display/Hero | 64-96px | 80px |
| Headline | 40-64px | 48px |
| Subheadline | 28-36px | 32px |
| Body | 20-28px | 24px |
| Caption | 16-20px | 18px |

**Typography scale (4:3, 1024px wide):**

| Level | Size Range | Recommended |
|-------|-----------|-------------|
| Display/Hero | 48-72px | 60px |
| Headline | 32-48px | 40px |
| Subheadline | 22-30px | 26px |
| Body | 16-22px | 20px |
| Caption | 12-16px | 14px |

**Master elements (presentation, every slide except title):**
- Logo: bottom-right corner (32px max height for 16:9, 24px for 4:3)
- Page number: bottom-center (14px for 16:9, 12px for 4:3), muted color

---

## Visual Consistency Rules

These rules are non-negotiable for multi-slide output. Every slide must pass all 6 checks.

1. **Same background** — Every slide uses the same background color or gradient style as slide 1
2. **Same fonts** — Same font family and weight hierarchy across all slides (heading weight, body weight)
3. **Same margins and safe zones** — Identical padding on every slide
4. **Same pagination position** — Slide indicator (dots, "3/10", or page number) in the exact same position on every slide
5. **Visual continuity element** — At least one recurring visual element on every slide: brand bar at top/bottom, accent line, decorative motif, or consistent header/footer zone
6. **Same accent color** — The accent color from slide 1 is used consistently for highlights, CTAs, and indicators

### Design System Propagation

After creating slide 1, capture these three values:

- `backgroundColor` — the fill color of the root frame (reject "transparent" or non-hex values, fallback: #FFFFFF)
- `accentColor` — the first non-neutral color used (reject black, white, and near-grey where R/G/B differ by < 30, fallback: #000000)
- `fontFamily` — the first font family used for text (reject empty, fallback: Inter)

Inject these values into every subsequent slide's creation. If any value is the fallback default, it still provides consistency across slides.

### Brand Placement

**Carousel:**
- Logo: top-left on slide 1, bottom-right on last slide
- Handle/username: last slide, centered
- Pagination: bottom-center on every slide (small dots or "1/N" label)

**Presentation:**
- Logo: bottom-right on every slide except title (where it goes bottom-center)
- Page number: bottom-center on every slide except title

---

## Canvas Placement

All slides are positioned side-by-side on the Figma canvas in reading order.

**Formula:**

```javascript
slide.x = slideIndex * (slideWidth + gap);
slide.y = 0;
```

**Gap sizes:**
- 40px — tight grouping (default, matches the original carousel/presentation behavior)
- 200px — visual separation between independent designs on the same page

Set `slide.x` immediately after creating each frame. This avoids needing a post-processing repositioning pass.

---

## use_figma Code Examples

### 1. Creating a Slide Frame with Background

```javascript
const slide = figma.createFrame();
slide.name = "Slide 1 — Cover";
slide.resize(1080, 1080);
slide.x = 0;  // First slide at origin
slide.y = 0;
slide.fills = [{ type: 'SOLID', color: { r: 0.04, g: 0.04, b: 0.06 } }];
```

### 2. Positioning Slides Side-by-Side

```javascript
// For slide index i, with 1080px wide slides and 40px gap:
slide.x = i * (1080 + 40);
slide.y = 0;

// Example: 5 slides at x = 0, 1120, 2240, 3360, 4480
```

### 3. Creating Consistent Text Across Slides

```javascript
// Load fonts ONCE at the start (before any slide creation)
await figma.loadFontAsync({ family: "Montserrat", style: "Bold" });
await figma.loadFontAsync({ family: "Hind", style: "Regular" });

// On every slide, use the same fonts:
const headline = figma.createText();
headline.name = "Slide Title";
headline.fontName = { family: "Montserrat", style: "Bold" };
headline.fontSize = 56;
headline.lineHeight = { value: 56 * 1.15, unit: "PIXELS" };
headline.letterSpacing = { value: -1, unit: "PIXELS" };
headline.characters = "Your Key Point Here";
headline.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
headline.textAutoResize = "HEIGHT";
slide.appendChild(headline);
```

### 4. Creating a Slide Indicator (Pagination)

```javascript
// Carousel: "03/10" indicator in top-right corner
await figma.loadFontAsync({ family: "Inter", style: "Bold" });

const indicator = figma.createText();
indicator.name = "Slide Indicator";
indicator.fontName = { family: "Inter", style: "Bold" };
indicator.fontSize = 24;
indicator.characters = `${String(slideIndex + 1).padStart(2, '0')}/${String(totalSlides).padStart(2, '0')}`;
indicator.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
indicator.opacity = 0.7;
indicator.textAutoResize = "WIDTH_AND_HEIGHT";
slide.appendChild(indicator);
// Position top-right within safe zone
indicator.x = 1080 - 60 - indicator.width;
indicator.y = 150;

// Presentation: page number bottom-center
const pageNum = figma.createText();
pageNum.name = "Page Number";
pageNum.fontName = { family: "Inter", style: "Regular" };
pageNum.fontSize = 14;
pageNum.characters = String(slideIndex + 1);
pageNum.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
pageNum.textAlignHorizontal = "CENTER";
pageNum.textAutoResize = "WIDTH_AND_HEIGHT";
slide.appendChild(pageNum);
pageNum.x = (1920 - pageNum.width) / 2;
pageNum.y = 1050;
```

### 5. Creating a CTA Button on the Closing Slide

```javascript
await figma.loadFontAsync({ family: "Inter", style: "Bold" });

// Button container with auto-layout
const ctaButton = figma.createFrame();
ctaButton.name = "CTA Button";
ctaButton.layoutMode = "HORIZONTAL";
ctaButton.primaryAxisAlignItems = "CENTER";
ctaButton.counterAxisAlignItems = "CENTER";
ctaButton.paddingTop = 16;
ctaButton.paddingBottom = 16;
ctaButton.paddingLeft = 40;
ctaButton.paddingRight = 40;
ctaButton.cornerRadius = 12;
ctaButton.fills = [{ type: 'SOLID', color: hexToRgb("#C9A84C") }]; // accent color
ctaButton.layoutSizingHorizontal = "HUG";
ctaButton.layoutSizingVertical = "HUG";

const ctaLabel = figma.createText();
ctaLabel.name = "CTA Label";
ctaLabel.fontName = { family: "Inter", style: "Bold" };
ctaLabel.fontSize = 24;
ctaLabel.characters = "FOLLOW FOR MORE";
ctaLabel.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
ctaLabel.letterSpacing = { value: 2, unit: "PIXELS" };
ctaButton.appendChild(ctaLabel);

slide.appendChild(ctaButton);
```

### Hex-to-RGB Helper

```javascript
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return { r, g, b };
}
```

### Gradient Direction Helper

```javascript
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

---

## Design Rules (Essential Subset)

### Typography Hierarchy

- Headline MUST be at least 2x body font size
- At least 2 weight steps between headline and body (e.g., 700 + 400)
- Every slide needs at least 2 distinct text sizes

**Line Height** (multiply by fontSize): Display >48px: 1.1-1.2 | Headings: 1.3-1.4 | Body: 1.5-1.6

**Letter Spacing:** Display: -0.02em | Headings: -0.01em | Body: 0 | Uppercase: +0.05 to +0.15em

**Warning:** fontWeight 600 silently falls back to Inter on some fonts. Use 400 or 700 for safety.

### Layout Rules (8px Grid)

**Spacing scale (only these values):** 4|8|12|16|20|24|32|40|48|64|80|96|128

### Overlay Rules

When placing text over images, ALWAYS create an overlay first.

**Gradient direction — solid end faces the text:**

| Text Position | Direction | Stop 0 | Stop 1 |
|---------------|-----------|--------|--------|
| Bottom | top-bottom | opacity 0 | opacity 0.85 |
| Top | bottom-top | opacity 0 | opacity 0.85 |

Rules: 2 stops only. Gradient color MUST match the section background. Minimum overlay opacity: 0.4.

### Design Taste

1. Commit to an aesthetic direction before creating anything.
2. Never default to Inter/Inter — pick fonts with character.
3. Bold color story. FORBIDDEN: light grey + timid blue.
4. No flat solid fills on cover/title slides — use gradients or depth.
5. Spatial generosity — increase padding by 1.5x what feels "enough."

### WCAG Contrast

Normal text: 4.5:1 minimum. Large text (>=18px): 3:1 minimum.

---

## Completion Checklist

### Carousel Checklist

- [ ] Same dimensions on every slide
- [ ] Consistent fonts, colors, and padding across all slides
- [ ] Slide 1 is the hook — bold headline, minimal text
- [ ] Last slide is the CTA
- [ ] Visual continuity element on every slide (brand bar, accent line, indicator)
- [ ] Slide indicator in consistent position on all slides
- [ ] All text inside safe zones (150px top/bottom, 60px sides)
- [ ] Primary text >= 48px, secondary >= 32px (mobile-first)
- [ ] Maximum 2-3 text elements per slide

### Presentation Checklist

- [ ] 1 headline per slide (max 8 words)
- [ ] Padding >= 64px
- [ ] Max 3-6 content elements per slide
- [ ] Consistent template across all slides
- [ ] Master elements (logo, page number) on every slide except title
- [ ] Title and closing slides share visual treatment
- [ ] No plain white backgrounds on title/closing slides

---

## Font Pairings (Quick Reference)

| Style | Heading | Body | Mood |
|-------|---------|------|------|
| Modern | Inter | Inter | clean, tech |
| Classic | Playfair Display | Source Serif Pro | elegant |
| Bold | Montserrat | Hind | strong, marketing |
| Luxury | Cormorant Garamond | Proza Libre | premium |
| Playful | Poppins | Nunito | friendly |
| Corporate | Roboto | Roboto Slab | enterprise |
| Minimalist | DM Sans | DM Sans | portfolio |
| Creative | Space Grotesk | Work Sans | experimental |

Use heading weight 700 (Bold) and body weight 400 (Regular) unless specified otherwise.

---

## Color Palettes (Quick Reference)

| ID | Primary | Accent | Background | Text |
|----|---------|--------|------------|------|
| moody-dark | #2C1810 | #D4A574 | #1A0E0A | #F5E6D3 |
| corporate | #1E3A5F | #3182CE | #FFFFFF | #1A202C |
| luxury | #1A1A1A | #C9A84C | #0D0D0D | #F5F0E8 |
| tech | #0D1117 | #58A6FF | #0D1117 | #E6EDF3 |
| minimal | #000000 | #0066CC | #FFFFFF | #111111 |
| nature | #2D6A4F | #B7791F | #F0FFF4 | #1B4332 |
| warm | #C2590A | #E8A87C | #FFF8F0 | #3E2723 |
| playful | #FF6B6B | #FFE66D | #FFFFFF | #2C3E50 |

Pick one palette and use it consistently across ALL slides.
