# Typography System — Figma Skill

Universal typography rules for professional design output. Load this skill when creating any design in Figma.

---

## Line Height Scale

| Text Role | Size Range | Line Height |
|-----------|-----------|-------------|
| Display | >48px | 1.1 - 1.2 |
| Heading (H1-H3) | 24-48px | 1.3 - 1.4 |
| Body | 14-18px | 1.5 - 1.6 |
| Caption | <14px | 1.6 - 1.8 |

## Letter Spacing Rules

| Text Role | Letter Spacing | Reason |
|-----------|---------------|--------|
| Display (>40px) | -0.02em | Large text looks floaty without tightening |
| Headings | -0.01em | Subtle tightening improves density |
| Uppercase labels | +0.05 to +0.15em | Mandatory — uppercase without tracking looks cramped |
| Body | 0 (natural) | Body text should never be adjusted |

## Weight Hierarchy

Use minimum 2 weight steps between each typographic level:

| Level | Weight | Usage |
|-------|--------|-------|
| 400 (Regular) | Body text, descriptions |
| 500 (Medium) | Emphasis within body, labels |
| 600 (Semibold) | Subheadings, card titles |
| 700 (Bold) | Headings (H1-H3) |
| 800-900 (Extra/Black) | Display/hero text only |

**CRITICAL:** fontWeight 600 silently falls back to Inter on many Google Fonts. Use 400 or 700 to be safe unless you've verified the font supports 600.

## Size Ratios (Minimum for Visual Hierarchy)

- Headline must be >= 2x body size
- Display must be >= 3-5x body size
- At least 2 weight steps between each level
- If headline and body look "same level" — increase the gap

## Format-Specific Minimum Sizes

| Format | Body | Headline | Display |
|--------|------|----------|---------|
| Web hero (1440px) | 16-20px | 36-56px | 56-96px |
| Instagram (1080px) | 28-32px | 48-72px | 72-120px |
| TikTok/Story (1080x1920) | 28-36px | 48-72px | 72-120px |
| Print A4 (2480x3508) | 24px min | 40-48px | 96-120px |
| Presentation (1920x1080) | 18-24px | 32-48px | 48-72px |
| Business card (1050x600) | 18-22px | 28-36px | 36-48px |

## Mood-Based Font Pairings

When no font is specified, select based on brief mood:

| Mood Keywords | Heading Font | Body Font |
|---------------|-------------|-----------|
| modern, tech, SaaS, startup | Inter | Inter |
| classic, editorial, publishing | Playfair Display | Source Serif Pro |
| bold, marketing, impact | Montserrat | Hind |
| luxury, fashion, premium | Cormorant Garamond | Proza Libre |
| playful, friendly, fun | Poppins | Nunito |
| corporate, finance, enterprise | Roboto | Roboto Slab |
| minimal, portfolio, clean | DM Sans | DM Sans |
| creative, agency, studio | Space Grotesk | General Sans |
| elegant, literary, wedding | Lora | Merriweather |
| scholarly, education, govt | Merriweather | Source Sans Pro |
| warm, cozy, artisan | Arvo | Cabin |
| whimsical, dreamy, indie | Josefin Sans | Merriweather |

**Override rule:** When the user names a specific font, use ONLY that font for the entire design. Never mix a user-specified font with a paired font.

## Type Scale Ratios

| Scale | Ratio | Best For |
|-------|-------|----------|
| Minor Third | 1.200 | Dense UI, dashboards |
| Major Third | 1.250 | General purpose, web |
| Perfect Fourth | 1.333 | Editorial, marketing |
| Golden Ratio | 1.618 | Display, posters, luxury |

Apply: `size = base * ratio^level` where level 0 = body, 1 = H3, 2 = H2, 3 = H1, 4 = display.

---

*Figmento Design Intelligence — figmento.dev*
