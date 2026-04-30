# Design Anti-Patterns & Refinement — Figma Skill

What separates AI-generated designs from professional ones. Load this skill to avoid generic output and apply polish that scores +2 points on any design.

---

## The 10 Anti-Patterns (What Makes Designs Look AI-Generated)

### Structural Anti-Patterns

1. **White/light grey hero background**
   Fix: Use intentional color from mood palette or near-black (#0A0A0F, #0F0E11) with accent glow.

2. **Inter Regular for everything**
   Fix: Mix at least 2 fonts (heading + body) and 3 weight levels (400, 600, 700).

3. **Center-aligned everything**
   Fix: Left-align body text. Center only display headlines and CTAs. Right-align secondary info.

4. **Equal padding on every frame**
   Fix: Vary padding by hierarchy. Hero: 96px. Sections: 64px. Cards: 24-32px. Nested: 16px.

5. **Three identical feature cards**
   Fix: Make one card 1.2x larger, give it a different background shade, or add a "popular" badge.

6. **Generic blue CTA button**
   Fix: Use the palette's accent color. Make CTA the highest-contrast element on the page.

7. **Pricing cards with no visual hierarchy**
   Fix: Scale the recommended plan 1.1x, add shadow, use filled background vs outlined for others.

8. **Shadow on everything OR on nothing**
   Fix: Shadow only on elevated elements (cards, modals, CTAs). 1-2 shadow levels max per design.

9. **No weight contrast in typography**
   Fix: Minimum 2 weight steps between heading and body (e.g., 700 heading, 400 body).

10. **Gradient overlay facing wrong direction**
    Fix: Solid end ALWAYS behind text. Transparent end ALWAYS facing the image.

### Visual Markers That Reveal AI Output

| AI Tell | Professional Fix |
|---------|-----------------|
| Hyper-smooth, plastic surfaces | Add 3-8% noise texture overlay |
| Perfect 50/50 symmetry everywhere | Offset major elements 60/40 or 70/30 |
| Uniform spacing across all elements | Tighter grouping for related items, generous gaps for separation |
| Every element equally "nice" | Create ONE focal point that breaks the pattern |
| Safe, inoffensive color palette | Introduce one unexpected bold color |
| No visual tension or surprise | Add an oversized element, a bleed, or an unexpected crop |

---

## The 7 Refinement Rules (The Polish Multiplier)

Apply these AFTER the design is structurally complete. Each one adds measurable quality.

### 1. Typography Tightening

- Display text (>40px): set letter-spacing to **-0.02em**
- All-caps labels: set letter-spacing to **+0.05em** minimum
- Headlines spanning 2+ lines: use inverted pyramid (longer line on top)
- Prices and statistics: use tabular (monospace) figures if available
- Max line length: 65-75 characters for body text

### 2. Shadow Warmth

- **Warm palette** (orange, brown, red) → shadow color: rgba(139, 69, 19, 0.15)
- **Cool palette** (blue, purple, teal) → shadow color: rgba(30, 58, 95, 0.15)
- **Neutral palette** → shadow color: rgba(0, 0, 0, 0.08)
- **NEVER pure black shadows** — they look flat and artificial

### 3. Card Elevation

- Card fill should be **3-5% lighter** than the background it sits on
- If card and background are the same color → add a subtle border OR increase lightness
- Use shadow to reinforce elevation: `0 2px 8px rgba(color, 0.08)` for subtle, `0 8px 24px rgba(color, 0.12)` for prominent

### 4. CTA Isolation

- Primary CTA must have **2x the surrounding element spacing**
- If section gap is 24px → gap before CTA must be >= 48px
- CTA should be the only element with its specific color (don't reuse CTA color elsewhere)
- Button padding: 12-16px vertical, 24-32px horizontal (never tight)

### 5. The Memorable Element (MANDATORY)

Every design needs ONE disproportionate, unforgettable element:
- An oversized number (120px+ display text)
- An image that bleeds off the edge
- A high-contrast color block that breaks the grid
- A circular badge or stamp element
- A diagonal or rotated element in an otherwise orthogonal layout

**Test:** Remove the element. If the remaining design looks generic, it was working.

### 6. Whitespace Ratio

- Content should occupy **<60%** of the frame (40% minimum breathing room)
- Use Fibonacci-adjacent spacing progression: 24px → 40px → 64px (ratio ~1.6)
- When spacing "feels right," go one step larger on the scale
- Luxury/editorial designs: push to 50% whitespace

### 7. Accent Text on Dark Backgrounds

- When placing accent-colored text on dark backgrounds, **lighten the color 15-20%** from its fill version
- Example: Button fill #C45A3C → text version #E8956A
- This prevents text from looking muddy or low-contrast against dark surfaces

---

## The Design Taste Layer (Anti-Slop Hardening)

These are the named patterns that immediately mark a generation as
AI output. Use them as a lookup table during planning — if any apply,
override before generating frames.

### Banned Defaults (Typography)

LLMs default to safe, generic typefaces. These are banned for any
non-utility output:

- **Inter, Roboto, Open Sans, system-default sans** — banned for
  display/marketing work
- **Serif fonts on dashboards or SaaS UIs** — banned outright
- **Comic Sans, Papyrus, Trajan** — obviously banned

**Use instead:**
- **Display / marketing:** Geist, Outfit, Cabinet Grotesk, Satoshi
- **Editorial / brand:** Lyon, Newsreader, Instrument Serif (heading)
  + Geist or Satoshi (body)
- **Dashboard / data:** Geist + Geist Mono, or Satoshi + JetBrains Mono
- **Body fallback when no brand voice:** Inter is acceptable for body
  ONLY if heading is a stronger display face

### Banned Defaults (Color)

- **AI Purple/Blue gradient** (Lila Stain) — purple-to-blue hero
  gradients are the #1 AI fingerprint. Banned.
- **Saturation > 80%** for any large surface — desaturate accents to
  blend with neutrals
- **More than 1 accent color** in the same composition — pick one
- **Mixing warm and cool grays** in the same project — stick to one
  gray family
- **Pure `#000000` background** — use Zinc-950 (`#09090b`), Charcoal
  (`#0a0a0a`), or tinted dark navy
- **Pure `#FFFFFF` body text on dark** — use `#e4e4e7` or `#fafafa`
  for warmth

### Banned Defaults (Layout)

- **Three identical feature cards in a row** — banned. Use 2-column
  zig-zag, asymmetric grid (one card 1.2x larger), masonry, or
  horizontal scroll instead.
- **Centered everything in hero** — banned when DESIGN_VARIANCE > 4.
  Force split-screen 50/50, left-aligned text + right-aligned asset,
  or asymmetric whitespace with `padding-left: 20vw`.
- **Equal vertical padding top/bottom on every section** — banned.
  Optical alignment usually wants slightly larger bottom padding.
- **Card containers wrapping every metric on dashboards** — when
  density is high, use `border-t` / `divide-y` / negative space for
  grouping. Cards only when elevation communicates hierarchy.

### Content Realism Rules (The Jane Doe Effect)

Generic placeholder content reveals AI generation immediately. Hard
rules:

- **Names:** No "John Doe", "Jane Smith", "Sarah Chan", "Jack Su".
  Use diverse, realistic names with cultural specificity.
- **Companies:** No "Acme", "Nexus", "SmartFlow", "Lorem". Invent
  premium, contextual brand names that fit the project's industry.
- **Numbers:** No round percentages (`99.99%`, `50%`), no fake
  phone numbers (`123-456-7890`), no `$100.00`. Use organic data:
  `47.2%`, `+1 (312) 847-1928`, `$2,847`.
- **Avatars:** Never use the default Lucide user-icon "egg." Use
  realistic photo placeholders (`picsum.photos/seed/{name}/200/200`),
  considered SVG character avatars, or initialed monograms with
  intentional color logic.
- **Logos in social proof rows:** Don't invent generic logos. If
  logos aren't supplied, use grayscale placeholder boxes with
  realistic company-name text inside.

### Banned Copy Patterns (AI Cliché Words)

When generating copy for layouts, avoid:

- "Elevate", "Unleash", "Seamless", "Next-gen", "Game-changer"
- "Delve into", "Embark on", "Navigate the", "Empower"
- "Revolutionize", "Transform", "Supercharge", "Streamline"
- "Cutting-edge", "State-of-the-art", "World-class"

Replace with concrete verbs and specific outcomes. "Cuts deploy time
from 11 minutes to 40 seconds" beats "seamlessly streamlines your
deployment workflow" every time.

### Materiality Rules

- **Shadows must be tinted** to the background hue (covered above).
  Pure black shadows on tinted surfaces are banned.
- **Glassmorphism without inner border** is banned. True frosted
  glass needs a 1px inner border at 10% white + a subtle inset
  shadow to simulate edge refraction.
- **Flat sections with no depth** — sections that are just text on a
  flat background feel unfinished. Add subtle background imagery at
  3-4% opacity, mesh gradients, or radial light spots.

### The 4 Missing States

Every generated UI must include all four states, not just the happy
path:

1. **Loading state** — skeleton matching layout, never a generic
   circular spinner alone
2. **Empty state** — composed "getting started" frame, never just
   "No data" text
3. **Error state** — inline error frame inside the form/component,
   never a floating modal alone
4. **Tactile feedback** — pressed/active state with `scale 0.98` or
   `translateY 1px` on interactive elements

If any state is missing, the design is incomplete. Flag it during
planning, not after.

---

## Quick Self-Evaluation (Before Declaring Done)

Ask: **"Senior designer or bot?"** If the answer is "bot" — fix the most generic element.

| Check | Pass? |
|-------|-------|
| Clear reading order (primary → secondary → tertiary)? | |
| WCAG AA contrast on all text? | |
| All spacing from the 8px grid? | |
| At least ONE memorable/unexpected element? | |
| No pure-black shadows? | |
| Gradient solid end faces the text? | |
| Typography has 3+ weight/size levels? | |
| Safe zones respected for the target platform? | |
| All image areas filled (no grey rectangles)? | |
| Design would look good in a portfolio? | |
| **No banned typefaces (Inter on display, serif on dashboard)?** | |
| **No AI Purple/Blue gradient (Lila Stain)?** | |
| **No 3 identical feature cards in a row?** | |
| **No "John Doe" / "Acme" placeholder content?** | |
| **No AI cliché copy (Elevate, Seamless, Unleash)?** | |
| **All 4 states present (loading, empty, error, pressed)?** | |
| **Single accent color, saturation < 80%?** | |

---

*Figmento Design Intelligence — figmento.dev*
