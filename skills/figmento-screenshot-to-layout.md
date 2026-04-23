# Screenshot-to-Layout — Figma Skill

Recreate any UI screenshot as an editable Figma design using the Plugin API.

## Prerequisites

- Claude Code with `use_figma` MCP tool connected
- A screenshot image (paste, upload, or URL)

## How to Use

Paste a screenshot and say: **"Recreate this design in Figma"** — or reference this skill by name.

---

## Workflow

### Step 1 — Analyze the Screenshot

Study the image carefully and identify:

1. **Layout structure** — frames, sections, containers, nesting
2. **Color scheme** — backgrounds, text colors, accents (extract hex values)
3. **Typography** — font sizes, weights, hierarchy levels (count distinct sizes)
4. **UI elements** — buttons, cards, navigation, images, icons, dividers
5. **Spacing rhythm** — padding, margins, gaps between elements

### Step 2 — Determine Format and Dimensions

Match the screenshot aspect ratio to the closest standard format. Use the Size Presets table below. If the ratio is ambiguous, estimate pixel dimensions from the content type (mobile = 430px wide, desktop = 1440px, social = 1080px).

### Step 3 — Plan the Design

Before writing any code, complete this analysis:

```
DESIGN BRIEF ANALYSIS
─────────────────────
Aesthetic direction  : [editorial / brutalist / organic / luxury / geometric / playful]
Font pairing         : [heading] + [body] — why this fits the screenshot
Color story          : dominant color + supporting colors (hex values)
Layout pattern       : [centered-stack / split-half / full-bleed / card-grid / thirds-grid]
Element count        : estimated number of Figma nodes needed
```

### Step 4 — Create the Root Frame

One frame per design. Set exact dimensions and background fill. Name it descriptively.

### Step 5 — Build Top-Down

Create elements in visual reading order: headline first, then subheadline, body, CTA, details. Use auto-layout on every container frame for proper alignment.

### Step 6 — Apply Styling

Match colors precisely. Use gradients and overlays where the screenshot shows them. Set proper font weights (vary by hierarchy level). Apply corner radii, shadows, and opacity as needed.

### Step 7 — Self-Evaluate

Run through the evaluation checklist at the end of this document. Fix the most generic element first.

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

**Warning:** fontWeight 600 silently falls back to Inter on Cormorant Garamond and Proza Libre. Use 400 or 700 for those fonts.

### Layout Rules (8px Grid)

**Spacing scale (only these values):** 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128

**Margins by format:**
Social: 48px | Print: 72px | Presentation: 64px | Web: 64px | Poster: 96px

**Safe zones:**
Instagram: 150px top/bottom, 60px sides | TikTok: 100px top, 200px bottom, 60px left, 100px right | YouTube: avoid bottom-right (timestamp) | Facebook: 60px top, 80px bottom, 60px sides

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
- **Web Hero:** + CTA button (auto-layout), + overlay gradient, + nav/branding area
- **Print:** margins >= 72px, body >= 24px, headline >= 56px, contact/CTA in lower third
- **Presentation:** 1 headline per slide (<= 8 words), padding >= 64px, max 3 content elements

---

## Design Knowledge

### Size Presets

**Social:**

| ID | Name | W x H | Aspect |
|----|------|-------|--------|
| ig-post | Instagram Post | 1080x1350 | 4:5 |
| ig-square | Instagram Square | 1080x1080 | 1:1 |
| ig-story | Instagram Story/Reel | 1080x1920 | 9:16 |
| fb-post | Facebook Post | 1200x630 | 1.91:1 |
| fb-story | Facebook Story | 1080x1920 | 9:16 |
| fb-cover | Facebook Cover | 820x312 | 2.63:1 |
| x-post | X/Twitter Post | 1600x900 | 16:9 |
| x-header | X/Twitter Header | 1500x500 | 3:1 |
| li-post | LinkedIn Post | 1200x627 | 1.91:1 |
| li-banner | LinkedIn Banner | 1584x396 | 4:1 |
| pin-standard | Pinterest Pin | 1000x1500 | 2:3 |
| tiktok-video | TikTok Video | 1080x1920 | 9:16 |
| yt-thumbnail | YouTube Thumbnail | 1280x720 | 16:9 |
| yt-banner | YouTube Banner | 2560x1440 | 16:9 |

**Print (300dpi):**

| ID | Name | W x H | Physical |
|----|------|-------|----------|
| print-a4 | A4 | 2480x3508 | 210x297mm |
| print-a3 | A3 | 3508x4961 | 297x420mm |
| print-letter | US Letter | 2550x3300 | 8.5x11in |
| print-business-card | Business Card | 1050x600 | 3.5x2in |
| print-poster-18x24 | Poster 18x24 | 5400x7200 | 18x24in |

**Presentation & Web:**

| ID | Name | W x H |
|----|------|-------|
| pres-16-9 | Widescreen 16:9 | 1920x1080 |
| pres-4-3 | Standard 4:3 | 1024x768 |
| web-hero-16-9 | Web Hero | 1920x1080 |
| web-banner | Web Banner | 1440x600 |
| web-landing | Landing Page | 1440x900 |
| mobile-hero | Mobile Hero | 430x932 |
| tablet-portrait | Tablet Portrait | 834x1194 |

### Font Pairings

| ID | Heading | Body | Mood | H.Wt | B.Wt |
|----|---------|------|------|-------|-------|
| modern | Inter | Inter | clean, tech, SaaS | 700 | 400 |
| classic | Playfair Display | Source Serif Pro | elegant, editorial | 700 | 400 |
| bold | Montserrat | Hind | strong, marketing | 800 | 400 |
| luxury | Cormorant Garamond | Proza Libre | fashion, premium | 700 | 400 |
| playful | Poppins | Nunito | friendly, fun | 700 | 400 |
| corporate | Roboto | Roboto Slab | enterprise, fintech | 700 | 400 |
| editorial | Libre Baskerville | Open Sans | journalistic, blog | 700 | 400 |
| minimalist | DM Sans | DM Sans | portfolio, minimal | 700 | 400 |
| creative | Space Grotesk | Work Sans | studio, experimental | 700 | 400 |
| elegant | Lora | Merriweather | literary, timeless | 700 | 400 |
| scholarly | Merriweather | Source Sans Pro | institutional | 700 | 400 |
| warm-editorial | Playfair Display | Fira Sans | magazine, refined | 700 | 400 |
| impactful | Oswald | PT Sans | news, bold, sports | 700 | 400 |
| slab-warmth | Arvo | Cabin | vintage, artisan | 700 | 400 |
| thin-geometric | Raleway | Libre Baskerville | architectural | 800 | 400 |
| whimsical | Josefin Sans | Merriweather | dreamy, indie | 600 | 300 |
| versatile | Lato | Lato | universal, balanced | 700 | 400 |
| slab-journalistic | Bitter | Source Sans Pro | news, content | 700 | 400 |
| adobe-matched | Source Serif Pro | Source Sans Pro | corporate, docs | 700 | 400 |
| condensed-readable | Roboto Condensed | Vollkorn | data, dashboards | 400 | 400 |

**Type Scales** (base 16px): minor_third 1.2 (documents) | major_third 1.25 (general, DEFAULT) | perfect_fourth 1.333 (marketing, posters) | golden_ratio 1.618 (hero, impact)

### Color Palettes

| ID | Name | Primary | Secondary | Accent | Background | Text | Muted |
|----|------|---------|-----------|--------|------------|------|-------|
| moody-dark | Moody/Dark | #2C1810 | #4A3228 | #D4A574 | #1A0E0A | #F5E6D3 | #8B6F5E |
| fresh-light | Fresh/Light | #4CAF50 | #81C784 | #29B6F6 | #FAFFFE | #1B2E1B | #A5D6A7 |
| corporate | Corporate | #1E3A5F | #2C5282 | #3182CE | #FFFFFF | #1A202C | #A0AEC0 |
| luxury | Luxury | #1A1A1A | #2D2D2D | #C9A84C | #0D0D0D | #F5F0E8 | #7A6F5D |
| playful | Playful | #FF6B6B | #4ECDC4 | #FFE66D | #FFFFFF | #2C3E50 | #95A5A6 |
| nature | Nature/Organic | #2D6A4F | #40916C | #B7791F | #F0FFF4 | #1B4332 | #95D5B2 |
| tech | Tech/Modern | #0D1117 | #161B22 | #58A6FF | #0D1117 | #E6EDF3 | #484F58 |
| warm | Warm/Cozy | #C2590A | #A0522D | #E8A87C | #FFF8F0 | #3E2723 | #D7CCC8 |
| minimal | Minimal/Clean | #000000 | #333333 | #0066CC | #FFFFFF | #111111 | #999999 |
| retro | Retro/Vintage | #D4A373 | #CCD5AE | #E76F51 | #FEFAE0 | #3D405B | #A8A878 |
| ocean | Ocean/Calm | #0077B6 | #00B4D8 | #90E0EF | #CAF0F8 | #03045E | #ADE8F4 |
| sunset | Sunset/Energy | #E63946 | #F4A261 | #E9C46A | #FFF8F0 | #2D3436 | #DFE6E9 |

**WCAG Contrast:** Normal text (<18px): 4.5:1 minimum. Large text (>=18px): 3:1 minimum.

**Safe combos:** #000 on #FFF (21:1) | #FFF on #121212 (17.9:1) | #F5E6D3 on #1A0E0A (13.8:1) | #E6EDF3 on #0D1117 (15.1:1)

### Minimum Font Sizes

| Format | Display | Headline | Subhead | Body | Caption |
|--------|---------|----------|---------|------|---------|
| Social (1080px) | 72-120 | 48-72 | 32-40 | 28-32 | 22-26 |
| Print (300dpi) | 80-140 | 56-80 | 36-48 | 24-32 | 18-24 |
| Presentation (1920px) | 64-96 | 40-64 | 28-36 | 20-28 | 16-20 |
| Web Hero (1440px) | 56-96 | 36-56 | 24-32 | 16-20 | 12-16 |

### Layout Patterns

- **centered-stack:** Content centered in vertical stack. Best for social posts, quotes, title slides.
- **split-half:** Two halves (image + text). Best for LinkedIn, Facebook ads, web heroes.
- **full-bleed-with-overlay:** Background image + gradient scrim + text. Best for hero sections, stories, event posters.
- **card-grid:** Uniform card grid. Best for product catalogs, portfolios, team pages.
- **thirds-grid:** 3-column/row grid. Best for feature lists, comparisons.

---

## use_figma Code Examples

### Creating a Root Frame

```javascript
const frame = figma.createFrame();
frame.name = "Landing Page — Hero Section";
frame.resize(1080, 1350);
frame.fills = [{ type: 'SOLID', color: { r: 0.10, g: 0.05, b: 0.04 } }];
// Position on canvas
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
container.primaryAxisAlignItems = "CENTER";   // main axis
container.counterAxisAlignItems = "CENTER";   // cross axis
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

The Plugin API uses a `gradientTransform` 2x3 matrix for direction. Use this helper:

```javascript
// Gradient direction helper — returns the gradientTransform matrix
function gradientTransform(direction) {
  // Each returns a 2x3 matrix: [[a,b,tx],[c,d,ty]]
  switch (direction) {
    case "top-bottom":    return [[0,1,0],[1,0,0]];   // text at bottom
    case "bottom-top":    return [[0,-1,1],[-1,0,1]];  // text at top
    case "left-right":    return [[1,0,0],[0,1,0]];    // text at right
    case "right-left":    return [[-1,0,1],[0,-1,1]];  // text at left
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
    { position: 0, color: { r: 0.1, g: 0.05, b: 0.04, a: 0 } },   // transparent at top
    { position: 0.5, color: { r: 0.1, g: 0.05, b: 0.04, a: 0.85 } } // solid at bottom
  ]
}];
frame.appendChild(overlay);
```

### Creating a Button (Auto-Layout Frame + Text)

```javascript
// Load font first
await figma.loadFontAsync({ family: "Inter", style: "Bold" });

// Button container with auto-layout
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

// Button label
const label = figma.createText();
label.name = "Button Label";
label.fontName = { family: "Inter", style: "Bold" };
label.fontSize = 18;
label.characters = "GET STARTED";
label.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
label.letterSpacing = { value: 1.5, unit: "PIXELS" };
button.appendChild(label);

// Add button to parent container
container.appendChild(button);
```

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

---

## Common Gotchas & Patterns

### Text Wrapping Rule

When recreating screenshot text at absolute coordinates inside a `layoutMode: "NONE"` parent, **always set `width` explicitly** on the text node. The Figma Plugin API defaults to `textAutoResize: "WIDTH_AND_HEIGHT"`, which auto-sizes the text width to fit content. On long strings this causes text to render as a single ultra-narrow column overflowing vertically instead of wrapping.

```javascript
// ✅ RIGHT — set width + textAutoResize = "HEIGHT" for wrap
headline.textAutoResize = "HEIGHT";
headline.resize(960, headline.height);
headline.characters = "Modern design for modern teams";
```

Alternative: put the text inside an auto-layout container, which constrains width automatically.

### Gradient Shape Requirement

When recreating a gradient fill from the screenshot, the gradient parameters must be **nested inside a paint object in the `fills` array**:

```javascript
// ✅ RIGHT — gradient as a Paint in the fills array
node.fills = [{
  type: "GRADIENT_LINEAR",
  gradientTransform: [[0,1,0],[1,0,0]],  // top-bottom
  gradientStops: [
    { position: 0, color: { r: 0.12, g: 0.23, b: 0.37, a: 1 } },
    { position: 1, color: { r: 0.04, g: 0.06, b: 0.12, a: 1 } }
  ]
}];
```

Top-level gradient params silently no-op.

### Nested Auto-Layout Overflow

A parent auto-layout row with a fixed `width` + children using `layoutSizingHorizontal: "HUG"` can silently overflow the parent if the sum of children widths + gaps exceeds the declared width. Particularly common with pricing card grids from SaaS screenshots. Before nesting:

1. Measure: does `Σ(children widths) + (N-1) × itemSpacing` fit inside the parent width?
2. If yes → proceed with nested auto-layout.
3. If no → shrink a child, shrink spacing, or drop the row and use absolute positioning.

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
8. **Intent** — Design matches the screenshot's mood and purpose.
9. **Typography** — Font weights vary between hierarchy levels. Line heights set correctly.
10. **Shadows** — If used, vary angle/blur/tint. Not identical on every element.
11. **Memorable element** — One thing that stands out and makes the design unforgettable.
12. **Refinement** — No orphaned elements, no default names, no flat hero backgrounds.
13. **Gradient direction** — Solid end faces the text zone. Color matches background.
14. **Images resolved** — No empty colored rectangles as placeholder images.
15. **Font loading** — Every font loaded with `figma.loadFontAsync` before use.
16. **Auto-layout** — All containers use auto-layout. No absolute positioning on print.

Score: Count passing items. Target: 12+ of 16 (>=75%).
