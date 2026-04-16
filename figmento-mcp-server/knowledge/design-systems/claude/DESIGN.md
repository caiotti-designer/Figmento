---
name: claude
version: 1.0.0
created: "2026-04-04T00:00:00.000Z"
source_url: "https://getdesign.md/claude/design-md"
preset_used: null
schema_version: "1.0"
---

## Visual Theme & Atmosphere

Claude's interface is a literary salon reimagined as a product page — warm, unhurried, and quietly intellectual. The entire experience is built on a parchment-toned canvas (`#f5f4ed`) that deliberately evokes the feeling of high-quality paper rather than a digital surface. Where most AI product pages lean into cold, futuristic aesthetics, Claude's design radiates human warmth, as if the AI itself has good taste in interior design.

The signature move is the custom Anthropic Serif typeface — a medium-weight serif with generous proportions that gives every headline the gravitas of a book title. Combined with organic, hand-drawn-feeling illustrations in terracotta (`#c96442`), black, and muted green, the visual language says "thoughtful companion" rather than "powerful tool." The serif headlines breathe at tight-but-comfortable line-heights (1.10–1.30), creating a cadence that feels more like reading an essay than scanning a product page.

What makes Claude's design truly distinctive is its warm neutral palette. Every gray has a yellow-brown undertone (`#5e5d59`, `#87867f`, `#4d4c48`) — there are no cool blue-grays anywhere. Borders are cream-tinted (`#f0eee6`, `#e8e6dc`), shadows use warm transparent blacks, and even the darkest surfaces (`#141413`, `#30302e`) carry a barely perceptible olive warmth. This chromatic consistency creates a space that feels lived-in and trustworthy.

**Mood**: warm, editorial, organic

## Color Palette & Roles

The palette is exclusively warm-toned — every gray has a yellow-brown undertone, every surface is parchment or ivory, every shadow is transparent warm black. Terracotta (`#c96442`) is the singular brand accent, used only for primary CTAs and the highest-signal brand moments. Focus Blue (`#3898ec`) is the only cool color in the system — reserved strictly for accessibility focus rings. There is no traditional gradient system; depth and richness come from the interplay of surface tones and light/dark section alternation.

```color
primary: "#c96442"
primary_light: "#d97757"
primary_dark: "#c96442"
secondary: "#b53333"
accent: "#d97757"
surface: "#faf9f5"
background: "#f5f4ed"
border: "#f0eee6"
on_primary: "#faf9f5"
on_surface: "#141413"
on_surface_muted: "#5e5d59"
success: "#16A34A"
warning: "#EAB308"
error: "#b53333"
info: "#3898ec"

# Extended warm-toned neutrals
charcoal_warm: "#4d4c48"
stone_gray: "#87867f"
dark_warm: "#3d3d3a"
warm_silver: "#b0aea5"
warm_sand: "#e8e6dc"
dark_surface: "#30302e"
deep_dark: "#141413"

# Borders and rings (warm)
border_warm: "#e8e6dc"
border_dark: "#30302e"
ring_warm: "#d1cfc5"
ring_deep: "#c2c0b6"

# Focus (the one cool color)
focus_blue: "#3898ec"
```

```gradient
enabled: false
```

## Typography Rules

Three custom Anthropic typefaces — Serif for headlines, Sans for UI, Mono for code. The serif is used at a single weight (500) across all headline sizes, creating a consistent "voice" as if the same author wrote every heading. Body copy uses generous 1.60 line-height — a literary reading rhythm, closer to a book than a dashboard. Micro letter-spacing is applied only at tiny sizes (12px and below) to maintain readability.

```font-family
heading:
  family: "Anthropic Serif"
  figma_fallback: "Source Serif 4"
  fallback: "Georgia"
  weights: [500]
body:
  family: "Anthropic Sans"
  figma_fallback: "DM Sans"
  fallback: "Arial"
  weights: [400, 500]
mono:
  family: "Anthropic Mono"
  figma_fallback: "DM Mono"
  fallback: "Arial"
  weights: [400]
opentype_features: []
```

```type-scale
display: 64
h1: 52
h2: 36
h3: 32
heading: 25
body_lg: 20
body: 17
body_sm: 15
caption: 14
label: 12
overline: 10
micro: 9.6
```

```letter-spacing
body: "normal"
label: "0.12px"
overline: "0.5px"
micro: "0.096px"
mono: "-0.32px"
```

## Component Stylings

Buttons follow a strict ring-shadow system — `0px 0px 0px 1px` halos in warm grays replace traditional drop shadows. Five button styles exist: **Warm Sand** (the workhorse secondary, asymmetric padding `0px 12px 0px 8px`, 8px radius), **White Surface** (12px radius, near-black text), **Dark Charcoal** (dark-on-light emphasis), **Brand Terracotta** (primary CTA, the only button with chromatic color), and **Dark Primary** (used on dark-theme surfaces with a 1px solid `#30302e` border).

Cards use Ivory (`#faf9f5`) or Pure White on light surfaces, Dark Surface (`#30302e`) on dark. Border is a thin `1px solid #f0eee6` warm cream on light, `1px solid #30302e` on dark. Radius scales from comfortable (8px) for standard cards to generous (16px) for featured, up to very rounded (32px) for hero containers and embedded media. Elevated content uses a whisper shadow: `rgba(0,0,0,0.05) 0px 4px 24px`.

Inputs have very compact vertical padding (1.6px) with generously rounded corners (12px). Focus state uses a ring with `Focus Blue (#3898ec)` — the only cool color moment in the entire system. Navigation is sticky with a warm background; links shift color on hover but never underline.

**Distinctive components:** model comparison cards (Opus/Sonnet/Haiku in a 3-column grid), organic hand-drawn illustrations in terracotta/black/muted green (replacing typical tech iconography), and dark/light section alternation creating chapter-like page rhythm.

## Layout Principles

Strict 8px grid, generous whitespace, editorial pacing. Max container width ~1200px, centered. Feature sections are single-column or 2–3 column card grids. Hero uses centered editorial layout; full-width dark sections break the container for emphasis. Section vertical spacing is generous (80–120px between major sections) to create natural reading pauses.

```spacing
unit: 8
xs: 4
sm: 8
md: 16
lg: 24
xl: 32
2xl: 48
3xl: 64
```

```radius
none: 0
sm: 8
md: 12
lg: 16
xl: 32
full: 9999
```

## Depth & Elevation

Claude communicates depth through **warm-toned ring shadows** rather than traditional drop shadows. The signature `0px 0px 0px 1px` pattern creates a border-like halo that's softer than an actual border — it's a shadow pretending to be a border, or a border that's technically a shadow. When drop shadows do appear, they're extremely soft (0.05 opacity, 24px blur) — barely visible lifts that suggest floating rather than casting.

The most dramatic depth effect comes from alternating between Parchment (`#f5f4ed`) and Near Black (`#141413`) sections — entire sections shift elevation by changing the ambient light level.

```shadow
sm:
  x: 0
  y: 0
  blur: 0
  spread: 1
  color: "#f0eee6"
  opacity: 1
md:
  x: 0
  y: 0
  blur: 0
  spread: 1
  color: "#d1cfc5"
  opacity: 1
lg:
  x: 0
  y: 4
  blur: 24
  spread: 0
  color: "rgba(0,0,0,0.05)"
  opacity: 1
```

```elevation
flat:
  shadow: "none"
contained:
  shadow: "none"
  border: "1px solid #f0eee6"
ring:
  shadow: "0px 0px 0px 1px #d1cfc5"
whisper:
  shadow: "rgba(0,0,0,0.05) 0px 4px 24px"
inset:
  shadow: "inset 0px 0px 0px 1px rgba(0,0,0,0.15)"
```

## Do's and Don'ts

### Do
- Use Parchment (#f5f4ed) as primary page background
- Use Anthropic Serif weight 500 for ALL headlines — single weight only
- Reserve Terracotta (#c96442) exclusively for primary CTAs
- Keep all neutrals warm-toned — olive, sand, charcoal, stone
- Use ring-based shadows (0px 0px 0px 1px) instead of drop shadows
- Maintain strict serif/sans hierarchy — serif for authority, sans for utility
- Use generous 1.60 line-height for all body text
- Alternate light (#f5f4ed) and dark (#141413) sections for visual rhythm
- Use generous border-radius (12-32px)

### Don't
- Never use cool blue-grays anywhere in the palette
- Never use bold (700+) on Anthropic Serif
- Never use saturated colors beyond Terracotta — the system is intentionally muted
- Never use sharp corners (<6px radius)
- Never use heavy drop shadows — this is a ring-based system
- Never use pure white (#ffffff) as page background — always parchment
- Never use geometric/tech illustrations — only organic, editorial
- Never reduce line-height below 1.40 for body text
- Never use monospace for non-code content
- Never use sans-serif for headlines

## Responsive Behavior

Five-breakpoint system: Small Mobile (<479px, minimum stacked layout), Mobile (479–640px, single column with hamburger nav), Large Mobile (640–767px), Tablet (768–991px, 2-column grids), Desktop (992px+, full multi-column with max hero typography at 64px). Hero headlines scale progressively: 64px → 36px → ~25px. Navigation collapses to hamburger on mobile. Multi-column feature sections stack vertically. Model cards shift from 3-column to vertical stack. Touch targets maintain 44×44px minimum. Illustrations scale proportionally without art-direction changes between breakpoints.

## Agent Prompt Guide

### Quick color reference
- Brand CTA: "Terracotta Brand (#c96442)"
- Page Background: "Parchment (#f5f4ed)"
- Card Surface: "Ivory (#faf9f5)"
- Primary Text: "Anthropic Near Black (#141413)"
- Secondary Text: "Olive Gray (#5e5d59)"
- Tertiary Text: "Stone Gray (#87867f)"
- Borders (light): "Border Cream (#f0eee6)"
- Dark Surface: "Dark Surface (#30302e)"

### Example component prompts

- "Create a hero section on Parchment (#f5f4ed) with a headline at 64px Anthropic Serif weight 500, line-height 1.10. Use Anthropic Near Black (#141413) text. Add a subtitle in Olive Gray (#5e5d59) at 20px Anthropic Sans with 1.60 line-height. Place a Terracotta Brand (#c96442) CTA button with Ivory text, 12px radius."
- "Design a feature card on Ivory (#faf9f5) with a 1px solid Border Cream (#f0eee6) border and comfortably rounded corners (8px). Title in Anthropic Serif at 25px weight 500, description in Olive Gray (#5e5d59) at 16px Anthropic Sans. Add a whisper shadow (rgba(0,0,0,0.05) 0px 4px 24px)."
- "Build a dark section on Anthropic Near Black (#141413) with Ivory (#faf9f5) headline text in Anthropic Serif at 52px weight 500. Use Warm Silver (#b0aea5) for body text. Borders in Dark Surface (#30302e)."
- "Create a button in Warm Sand (#e8e6dc) with Charcoal Warm (#4d4c48) text, 8px radius, and a ring shadow (0px 0px 0px 1px #d1cfc5). Padding: 0px 12px 0px 8px."

### Iteration rules for agents

1. Focus on ONE component at a time
2. Reference specific color names — "use Olive Gray (#5e5d59)" not "make it gray"
3. Always specify warm-toned variants — no cool grays
4. Describe serif vs sans usage explicitly — "Anthropic Serif for the heading, Anthropic Sans for the label"
5. For shadows, use "ring shadow (0px 0px 0px 1px)" or "whisper shadow" — never generic "drop shadow"
6. Specify the warm background — "on Parchment (#f5f4ed)" or "on Near Black (#141413)"
7. Keep illustrations organic and conceptual — describe "hand-drawn-feeling" style
