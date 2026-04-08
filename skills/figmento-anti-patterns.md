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

---

*Figmento Design Intelligence — figmento.dev*
