# Text-to-Layout — Figma Skill

Turn a text brief into a complete, polished Figma design using the Plugin API.

## Prerequisites

- Claude Code with `use_figma` MCP tool connected
- A text description of the desired design (format, mood, content)

## How to Use

Describe the design you want and say: **"Create this design in Figma"** — or reference this skill by name. Example: "Create a moody dark Instagram post for a coffee brand with the headline 'Taste the Night'."

---

## Workflow

### Step 1 — Parse the Brief

Read the user's text and extract three signals:

1. **Format** — What platform/medium? Match against the Format Detection table below.
2. **Mood** — What aesthetic feel? Match against the Mood Detection table below.
3. **Design type** — Single design or multi-section? Check Multi-Section Detection patterns.

If the brief is ambiguous, default to: format `ig-post` (1080x1350), mood `minimal-clean`, type `single`.

### Step 2 — Look Up Dimensions

Using the detected format ID, find the exact pixel dimensions from the Size Presets table.

### Step 3 — Select Palette

Using the detected mood ID, look up the full 6-color palette from the Mood-to-Palette table.

### Step 4 — Select Font Pairing

Using the detected mood ID, look up the heading/body font pairing from the Mood-to-Font table.

### Step 5 — Select Layout Blueprint

Map the format to a blueprint category (social, web, ads, print, presentation) using the Category Mapping table. Then select the best-matching blueprint from the Blueprint Zones table based on category and mood overlap.

### Step 6 — Complete the Design Brief Analysis

Before writing any code, fill out this analysis and show it to the user:

```
DESIGN BRIEF ANALYSIS
---------------------
Aesthetic direction  : [editorial / brutalist / organic / luxury / geometric / playful]
Font pairing         : [heading] + [body] — why this fits the brief
Color story          : [dark / light / colorful / monochrome] — dominant: [hex]
Layout blueprint     : [blueprint name or "custom"]
Memorable element    : [the ONE thing that makes this unforgettable]
Generic trap avoided : [what the bot version would look like — and what you're doing instead]
```

### Step 7 — Create the Root Frame

One frame per design. Set exact dimensions and background fill. Name it descriptively (e.g., "Cafe Noir — Instagram Post").

### Step 8 — Build Top-Down Using Blueprint Zones

Multiply zone percentages by canvas height to get pixel positions. Create elements in visual reading order: background/image first, then overlay, then headline, subheadline, body, CTA, details. Use auto-layout on every container frame.

### Step 9 — Apply Styling and Refinement

Match palette colors precisely. Apply gradients/overlays where needed. Set proper font weights varying by hierarchy level. Apply corner radii, shadows, and opacity.

### Step 10 — Self-Evaluate

Run through the Self-Evaluation Checklist at the end of this document. Fix the most generic element first.

---

## Brief Parsing Reference

### Format Detection

Match the user's text against these keywords to detect the target format:

| ID | Trigger Keywords | W x H |
|----|-----------------|-------|
| ig-post | instagram post, ig post, insta post | 1080x1350 |
| ig-square | instagram square | 1080x1080 |
| ig-story | instagram story/stories/reel, ig story | 1080x1920 |
| ig-carousel | instagram carousel, ig carousel | 1080x1080 |
| fb-post | facebook post, fb post | 1200x630 |
| fb-story | facebook story | 1080x1920 |
| fb-cover | facebook cover, fb cover | 820x312 |
| fb-ad | facebook ad, fb ad | 1200x630 |
| x-post | twitter post, x post, tweet | 1600x900 |
| x-header | twitter header/banner, x header | 1500x500 |
| linkedin-post | linkedin post | 1200x627 |
| linkedin-banner | linkedin banner | 1584x396 |
| pinterest-pin | pinterest pin, pinterest | 1000x1500 |
| tiktok | tiktok | 1080x1920 |
| yt-thumbnail | youtube thumbnail, yt thumbnail | 1280x720 |
| yt-banner | youtube banner, yt banner | 2560x1440 |
| a4 | a4, a4 page/document/print/flyer | 2480x3508 |
| a3 | a3 | 3508x4961 |
| us-letter | us letter, letter size | 2550x3300 |
| business-card | business card | 1050x600 |
| flyer | flyer | 2480x3508 |
| poster | poster | 5400x7200 |
| brochure | brochure, folder, pamphlet | 2480x3508 |
| slide-16-9 | presentation, slide(s), deck, pitch deck | 1920x1080 |
| web-hero | web hero, hero section, hero banner | 1920x1080 |
| landing-page | landing page | 1440x900 |
| web-banner | web banner | 1440x600 |
| mobile-hero | mobile hero | 430x932 |

Generic fallbacks (last resort): "instagram" -> ig-post, "facebook" -> fb-post.

### Mood Detection

Score each mood by how many of its keywords appear in the brief. Pick the highest-scoring mood.

| ID | Keywords |
|----|----------|
| moody-dark | moody, dark, dramatic, cinematic, noir, coffee, whiskey |
| fresh-light | fresh, light, airy, spring, clean, health, wellness |
| corporate-professional | corporate, professional, business, trustworthy, finance, enterprise |
| luxury-premium | luxury, premium, gold, elegant, exclusive, fashion, jewelry |
| playful-fun | playful, fun, colorful, vibrant, kids, games, party |
| nature-organic | nature, organic, earth, botanical, sustainable, eco, garden |
| tech-modern | tech, digital, futuristic, startup, ai, cyber, saas |
| warm-cozy | warm, cozy, autumn, rustic, bakery, cafe, homey |
| minimal-clean | minimal, simple, monochrome, black-and-white, scandinavian |
| retro-vintage | retro, vintage, nostalgic, 70s, 80s, groovy, film |
| ocean-calm | ocean, calm, serene, spa, meditation, water, blue |
| sunset-energy | sunset, passionate, bold, dynamic, sport, music, energy |

### Multi-Section Detection

These patterns trigger multi-section/landing-page mode:

landing page, multi-section, carousel, hero + features + pricing, hero + features + cta, multiple sections, full page, website, web page.

### Mood-to-Palette Mapping

| Mood ID | Primary | Secondary | Accent | Background | Text | Muted |
|---------|---------|-----------|--------|------------|------|-------|
| moody-dark | #2C1810 | #4A3228 | #D4A574 | #1A0E0A | #F5E6D3 | #8B6F5E |
| fresh-light | #4CAF50 | #81C784 | #29B6F6 | #FAFFFE | #1B2E1B | #A5D6A7 |
| corporate-professional | #1E3A5F | #2C5282 | #3182CE | #FFFFFF | #1A202C | #A0AEC0 |
| luxury-premium | #1A1A1A | #2D2D2D | #C9A84C | #0D0D0D | #F5F0E8 | #7A6F5D |
| playful-fun | #FF6B6B | #4ECDC4 | #FFE66D | #FFFFFF | #2C3E50 | #95A5A6 |
| nature-organic | #2D6A4F | #40916C | #B7791F | #F0FFF4 | #1B4332 | #95D5B2 |
| tech-modern | #0D1117 | #161B22 | #58A6FF | #0D1117 | #E6EDF3 | #484F58 |
| warm-cozy | #C2590A | #A0522D | #E8A87C | #FFF8F0 | #3E2723 | #D7CCC8 |
| minimal-clean | #000000 | #333333 | #0066CC | #FFFFFF | #111111 | #999999 |
| retro-vintage | #D4A373 | #CCD5AE | #E76F51 | #FEFAE0 | #3D405B | #A8A878 |
| ocean-calm | #0077B6 | #00B4D8 | #90E0EF | #CAF0F8 | #03045E | #ADE8F4 |
| sunset-energy | #E63946 | #F4A261 | #E9C46A | #FFF8F0 | #2D3436 | #DFE6E9 |

### Mood-to-Font Mapping

| Mood ID | Heading Font | Body Font | H.Wt | B.Wt |
|---------|-------------|-----------|-------|-------|
| moody-dark | Playfair Display | Source Serif Pro | 700 | 400 |
| fresh-light | Poppins | Nunito | 700 | 400 |
| corporate-professional | Roboto | Roboto Slab | 700 | 400 |
| luxury-premium | Cormorant Garamond | Proza Libre | 700 | 400 |
| playful-fun | Poppins | Nunito | 700 | 400 |
| nature-organic | Lora | Merriweather | 700 | 400 |
| tech-modern | Inter | Inter | 700 | 400 |
| warm-cozy | Playfair Display | Fira Sans | 700 | 400 |
| minimal-clean | DM Sans | DM Sans | 700 | 400 |
| retro-vintage | Arvo | Cabin | 700 | 400 |
| ocean-calm | Raleway | Libre Baskerville | 800 | 400 |
| sunset-energy | Oswald | PT Sans | 700 | 400 |

**Warning:** fontWeight 600 silently falls back to Inter on Cormorant Garamond and Proza Libre. Use 400 or 700 only for those fonts.

### Category-to-Blueprint Mapping

Map the detected format to a blueprint category:

| Format prefix/ID | Blueprint Category |
|------------------|-------------------|
| ig-*, fb-*, x-*, linkedin-*, pinterest*, tiktok, yt-* | social (or ads) |
| landing-page, web-hero, web-banner | web (landing) |
| slide-*, presentation | presentation |
| poster, flyer, brochure, a4, a3, us-letter, business-card | print |
| fb-ad, *-ad, banner | ads |

### Blueprint Zones

Select the blueprint that matches your category and mood, then multiply zone percentages by canvas height for pixel positions.

**Social:**

| Blueprint | Moods | Zones | Memorable Element |
|-----------|-------|-------|-------------------|
| Centered Minimal | minimal, typographic, elegant, bold | top-space 0-25%, content-centered 25-75%, bottom-space 75-100% | Oversized headline with extreme weight contrast |
| Editorial Overlay | moody, cinematic, editorial, dark | hero-image 0-64%, gradient-overlay 24-100%, content-zone 65-96% | Cinematic gradient that reveals content from darkness |
| Carousel Slide | educational, structured, professional | header-bar 0-10%, content 10-85%, footer-bar 85-100% | Consistent slide number indicator |
| LinkedIn Professional | corporate, professional, data-driven | headline-bar 0-18%, data-visual 18-68%, insight-text 70-88%, branding 90-100% | Bold statistic at display scale |

**Web:**

| Blueprint | Moods | Zones | Memorable Element |
|-----------|-------|-------|-------------------|
| Hero Centered Stack | versatile, clean, confident, modern | nav 0-8%, hero-content 20-70%, social-proof 78-88% | Oversized headline spanning near-full width |
| Hero Split Image | clean, editorial, professional, elegant | nav 0-8%, split-main 8-100% | Bold color block on text side contrasting photographic half |

**Ads:**

| Blueprint | Moods | Zones | Memorable Element |
|-----------|-------|-------|-------------------|
| Product Hero Gradient | premium, moody, conversion, cinematic | hero-image 0-64%, gradient-overlay 24-100%, content-zone 64-96% | Cinematic 2-stop gradient from product photo to content |

**Print:**

| Blueprint | Moods | Zones | Memorable Element |
|-----------|-------|-------|-------------------|
| Poster Typographic | bold, dramatic, typographic, artistic | top-margin 0-8%, primary-headline 25-65%, supporting-text 67-80%, details-footer 82-95% | Headline at 40%+ area with dramatic scale |
| Brochure Single Panel | professional, informative, corporate | image-area 0-38%, headline-zone 40-52%, body-content 54-84%, footer 87-97% | Strong image-to-text transition |

**Presentation:**

| Blueprint | Moods | Zones | Memorable Element |
|-----------|-------|-------|-------------------|
| Title Slide Bold | bold, confident, professional, impactful | branding 3-12%, headline-center 25-62%, tagline 64-75%, visual-accent 80-97% | Headline at heroic scale (40%+ of slide) |
| Content Split | structured, clear, professional, informative | header 0-12%, content-area 14-88%, footer 90-98% | Clear visual separation between text and visual halves |

---

## Design Rules

### Core Rules

- Create exactly ONE root frame per design. No duplicates.
- Name every element descriptively ("Hero Headline", "CTA Button", "Dark Overlay").
- Use auto-layout (VERTICAL or HORIZONTAL) on all container frames.
- Set `layoutSizingHorizontal: "FILL"` on text inside auto-layout frames.
- Never place text directly on an image — always add an overlay first.
- Clean up failed elements before retrying.

### Typography Hierarchy (Mandatory)

- Headline MUST be at least 2x body font size.
- At least 2 weight steps between headline and body (e.g., 700 headline + 400 body).
- Adjacent text elements MUST differ by at least 1 weight step AND 8px in size.
- Every design needs at least 3 distinct text sizes.
- Reinforce hierarchy with color: headline at full color, subheadline muted, caption light.

**Line Height** (multiply by fontSize to get pixel value):
Display (>48px): 1.1-1.2 | Headings: 1.3-1.4 | Body: 1.5-1.6 | Small: 1.6-1.8

**Letter Spacing (em):**
Display: -0.02 | Headings: -0.01 | Body: 0 | Uppercase: +0.05 to +0.15

**Weight Usage:**
300 Light (display only) | 400 Regular (body) | 500 Medium (nav, buttons) | 600 SemiBold (subheadings) | 700 Bold (headings, CTA) | 800 ExtraBold (hero)

### Minimum Font Sizes

| Format | Display | Headline | Subhead | Body | Caption |
|--------|---------|----------|---------|------|---------|
| Social (1080px) | 72-120 | 48-72 | 32-40 | 28-32 | 22-26 |
| Print (300dpi) | 80-140 | 56-80 | 36-48 | 24-32 | 18-24 |
| Presentation (1920px) | 64-96 | 40-64 | 28-36 | 20-28 | 16-20 |
| Web Hero (1440px) | 56-96 | 36-56 | 24-32 | 16-20 | 12-16 |

### Layout Rules (8px Grid)

**Spacing scale (only these values):** 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128

**Margins by format:**
Social: 48px | Print: 72px | Presentation: 64px | Web: 64px | Poster: 96px

**Safe zones:**
Instagram: 150px top/bottom, 60px sides | TikTok: 100px top, 200px bottom, 60px left, 100px right | YouTube: avoid bottom-right (timestamp) | Facebook: 60px top, 80px bottom, 60px sides

**Layout Patterns:**
- **centered-stack:** Content centered in vertical stack. Best for social posts, quotes, title slides.
- **split-half:** Two halves (image + text). Best for LinkedIn, Facebook ads, web heroes.
- **full-bleed-with-overlay:** Background image + gradient scrim + text. Best for hero sections, stories, event posters.
- **card-grid:** Uniform card grid. Best for product catalogs, portfolios, team pages.
- **thirds-grid:** 3-column/row grid. Best for feature lists, comparisons.

**Spatial generosity:** Increase padding by 1.5x what feels "enough." Generous whitespace = premium feel.

### Overlay & Gradient Rules

When placing text over images, ALWAYS create an overlay rectangle first.

**Content-aware gradient direction — the solid end faces the text:**

| Text Position | Direction    | Stop 0 (transparent) | Stop 1 (solid)  |
|---------------|-------------|---------------------|-----------------|
| Bottom        | top-bottom  | Top: opacity 0      | Bottom: opacity 1|
| Top           | bottom-top  | Bottom: opacity 0   | Top: opacity 1   |
| Left          | right-left  | Right: opacity 0    | Left: opacity 1  |
| Right         | left-right  | Left: opacity 0     | Right: opacity 1 |

Rules: Exactly 2 stops. Solid zone at 40-50%. Gradient color MUST match the section background. Minimum overlay opacity: 0.4.

**Layer order (bottom to top):** Background image -> Overlay rectangle -> Text content frame.

### Design Taste Rules

1. **Commit to an aesthetic** before creating anything. Never start neutral.
2. **Typography first.** Never default to Inter/Inter. Pick fonts with character.
3. **Color commitment.** Bold color story. FORBIDDEN: light grey + timid blue.
4. **Background depth.** No flat fills on hero sections. Use gradients or subtle glow.
5. **Spatial generosity.** When spacing feels right, go one step larger.
6. **Never converge.** Every brief should produce a visually distinct design.
7. **Self-evaluate.** "Senior designer or bot?" Fix the most generic element.
8. **One memorable thing.** Every design needs one unforgettable element: oversized headline, unexpected color, grid-breaking element.

### Anti-AI Markers (fix immediately if present)

**Structural hard stops:**
- White/grey default background on hero sections
- Inter Regular everywhere — vary weights and families
- Center-aligned on every element — vary alignment by hierarchy
- Equal padding on every frame — vary for visual rhythm
- Gradient solid end facing away from text
- Fixed height on text containers — use HUG sizing
- fontWeight 600 on Cormorant Garamond/Proza Libre — use 400 or 700

**AI tells to avoid:**
- Hyper-smooth with no texture
- Identical shadows on every element
- Perfect symmetry everywhere — offset at least one element (60/40)
- Uniform spacing — tighter for related items, generous for separation
- All colors at same saturation — mix muted + vivid

### Quality Scoring

| Dimension (weight) | Key question |
|---------------------|-------------|
| Visual Design (30%) | Typography, color, composition quality? |
| Creativity (20%) | Has a memorable element? Not default-looking? |
| Hierarchy (20%) | Clear reading order? CTA identifiable? |
| Technical (15%) | WCAG contrast? Safe zones? |
| AI Distinctiveness (15%) | Would a viewer think a human designed this? |

Target: 7+ for production, 8.5+ for portfolio.

### Format Completion Checklist

Every design MUST have: correct dimensions, background, headline, supporting text, branding element, 3+ font sizes.

- **Social:** + overlay if image background
- **Carousel:** same dimensions per slide, consistent fonts/colors/padding, slide 1=hook, last=CTA
- **Web Hero:** + CTA button (auto-layout), + overlay gradient, + nav/branding area
- **Print:** margins >= 72px, body >= 24px, headline >= 56px, contact/CTA in lower third
- **Presentation:** 1 headline per slide (<= 8 words), padding >= 64px, max 3 content elements

### Multi-Section Composition Rules

When the brief triggers multi-section mode (landing page, website, etc.):

- **Background rhythm:** primary -> surface -> background -> primary -> surface -> primary
- Never use the same background color on 3+ consecutive sections.
- Section gap: 0px (sections stack flush for visual continuity).
- Pattern fill mapping: hero_block=primary, feature_grid=surface, testimonial=surface, cta_banner=primary, content_section=background.
- Color continuity: accent color consistent across all sections; use muted variants for secondary elements.

---

## Carousel Mode (Optional)

For carousel briefs (Instagram carousel, multi-slide content):

### Slide Types

| Slide | Type | Purpose |
|-------|------|---------|
| 1 | Cover | Eye-catching hook, brand identity, swipe indicator |
| 2 to N-1 | Content | One idea per slide, slide indicator, swipe arrow |
| N | CTA | Echo cover treatment, closing statement/action prompt |

### Cross-Slide Consistency

After creating slide 1, extract its design system (background color, accent color, font family) and enforce the same values on all subsequent slides. This ensures visual continuity across the carousel.

### Slide Positioning

Place slides side-by-side on the canvas with a 40px gap: slide N is positioned at `x = N * (slideWidth + 40)`.

### Carousel Dimensions

- Square: 1080x1080 per slide
- Portrait (4:5): 1080x1350 per slide

**Note:** Carousel orchestration is a summary reference here. For full multi-slide carousel capabilities, see the dedicated "Carousel & Multi-Slide Design" skill.

---

## use_figma Code Examples

### Hex-to-RGB Helper

```javascript
// Convert hex color to Figma RGB (0-1 range)
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return { r, g, b };
}

// Usage:
node.fills = [{ type: 'SOLID', color: hexToRgb("#1E3A5F") }];
```

### Creating a Root Frame

```javascript
const frame = figma.createFrame();
frame.name = "Cafe Noir — Instagram Post";
frame.resize(1080, 1350);
frame.fills = [{ type: 'SOLID', color: { r: 0.10, g: 0.05, b: 0.04 } }];
frame.x = 0;
frame.y = 0;
```

### Creating Text with Font Loading

```javascript
// MUST load font before setting text properties
await figma.loadFontAsync({ family: "Playfair Display", style: "Bold" });

const text = figma.createText();
text.name = "Hero Headline";
text.fontName = { family: "Playfair Display", style: "Bold" };
text.fontSize = 72;
text.lineHeight = { value: 72 * 1.15, unit: "PIXELS" };
text.letterSpacing = { value: -2, unit: "PIXELS" };
text.characters = "Your Headline Here";
text.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
text.textAutoResize = "HEIGHT";
frame.appendChild(text);
```

### Setting Auto-Layout on a Frame

```javascript
const container = figma.createFrame();
container.name = "Content Stack";
container.layoutMode = "VERTICAL";
container.primaryAxisAlignItems = "CENTER";
container.counterAxisAlignItems = "CENTER";
container.paddingTop = 48;
container.paddingBottom = 48;
container.paddingLeft = 48;
container.paddingRight = 48;
container.itemSpacing = 24;
container.layoutSizingHorizontal = "FILL";
container.layoutSizingVertical = "HUG";
container.fills = [];  // transparent
frame.appendChild(container);
```

### Creating a Gradient Overlay

```javascript
// Gradient direction helper — returns the gradientTransform matrix
function gradientTransform(direction) {
  switch (direction) {
    case "top-bottom":    return [[0,1,0],[1,0,0]];
    case "bottom-top":    return [[0,-1,1],[-1,0,1]];
    case "left-right":    return [[1,0,0],[0,1,0]];
    case "right-left":    return [[-1,0,1],[0,-1,1]];
    default:              return [[0,1,0],[1,0,0]];
  }
}

// Create overlay rectangle for text at bottom of frame
const overlay = figma.createRectangle();
overlay.name = "Gradient Overlay";
overlay.resize(1080, 1350);
overlay.fills = [{
  type: 'GRADIENT_LINEAR',
  gradientTransform: gradientTransform("top-bottom"),
  gradientStops: [
    { position: 0, color: { r: 0.1, g: 0.05, b: 0.04, a: 0 } },
    { position: 0.5, color: { r: 0.1, g: 0.05, b: 0.04, a: 0.85 } }
  ]
}];
frame.appendChild(overlay);
```

### Creating a Button (Auto-Layout Frame + Text)

```javascript
await figma.loadFontAsync({ family: "Inter", style: "Bold" });

const button = figma.createFrame();
button.name = "CTA Button";
button.layoutMode = "HORIZONTAL";
button.primaryAxisAlignItems = "CENTER";
button.counterAxisAlignItems = "CENTER";
button.paddingTop = 16;
button.paddingBottom = 16;
button.paddingLeft = 32;
button.paddingRight = 32;
button.cornerRadius = 8;
button.fills = [{ type: 'SOLID', color: { r: 0.20, g: 0.40, b: 0.80 } }];
button.layoutSizingHorizontal = "HUG";
button.layoutSizingVertical = "HUG";

const label = figma.createText();
label.name = "Button Label";
label.fontName = { family: "Inter", style: "Bold" };
label.fontSize = 18;
label.characters = "GET STARTED";
label.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
label.letterSpacing = { value: 1.5, unit: "PIXELS" };
button.appendChild(label);

container.appendChild(button);
```

---

## Self-Evaluation Checklist

After completing the design, verify each point:

1. **Alignment** — All elements on the 8px grid. No arbitrary spacing values.
2. **Contrast** — Text meets WCAG AA (4.5:1 normal, 3:1 large).
3. **Hierarchy** — Clear reading order with 3+ distinct text sizes.
4. **Whitespace** — Generous margins. Padding feels almost too spacious.
5. **Consistency** — Same spacing values for similar elements.
6. **Safe zones** — No critical content in platform overlay areas.
7. **Balance** — Visual weight distributed intentionally (not always centered).
8. **Intent** — Design matches the brief's described mood and purpose.
9. **Typography** — Font weights vary between hierarchy levels. Line heights set correctly.
10. **Shadows** — If used, vary angle/blur/tint. Not identical on every element.
11. **Memorable element** — One thing that stands out and makes the design unforgettable.
12. **Refinement** — No orphaned elements, no default names, no flat hero backgrounds.
13. **Gradient direction** — Solid end faces the text zone. Color matches background.
14. **Images resolved** — No empty colored rectangles as placeholder images.
15. **Font loading** — Every font loaded with `figma.loadFontAsync` before use.
16. **Auto-layout** — All containers use auto-layout. No absolute positioning on print.

Score: Count passing items. Target: 12+ of 16 (>=75%).
