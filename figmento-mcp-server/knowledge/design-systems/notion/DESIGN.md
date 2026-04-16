---
name: notion
version: 1.0.0
created: "2026-04-04T00:00:00.000Z"
source_url: "https://github.com/VoltAgent/awesome-design-md"
preset_used: null
schema_version: "1.0"
---

## Visual Theme & Atmosphere

Warm neutrals (never cold grays) with a singular Notion Blue accent. Custom modified Inter with aggressive negative tracking at display sizes. Multi-layer shadow stacks at sub-0.05 opacity create whisper-soft elevation. Ultra-thin borders at `rgba(0,0,0,0.1)` replace hard strokes on flat surfaces.

**Mood**: warm, approachable, productive

## Color Palette & Roles

The palette is built on warm neutrals — every gray is warm-toned, every surface is soft. Notion Blue (`#0075de`) is reserved as the singular interactive accent; it never appears decoratively. Semantic colors (success, warning, error) exist but are used sparingly. Extended brand colors (teal, green, orange, pink, purple, brown, deep_navy) are available for avatars, illustrations, and category tags — never for UI chrome.

```color
primary: "#0075de"
primary_light: "#62aef0"
primary_dark: "#005bab"
secondary: "#2a9d99"
accent: "#0075de"
surface: "#ffffff"
background: "#ffffff"
border: "rgba(0,0,0,0.1)"
on_primary: "#ffffff"
on_surface: "rgba(0,0,0,0.95)"
on_surface_muted: "#615d59"
success: "#1aae39"
warning: "#dd5b00"
error: "#DC2626"
info: "#0075de"

# Extended warm neutrals
warm_white: "#f6f5f4"
warm_dark: "#31302e"
warm_gray_500: "#615d59"
warm_gray_300: "#a39e98"

# Extended brand colors (avatars, tags, illustrations — never UI chrome)
teal: "#2a9d99"
green: "#1aae39"
orange: "#dd5b00"
pink: "#ff64c8"
purple: "#391c57"
brown: "#523410"
deep_navy: "#213183"

# Interactive + focus
link_blue: "#0075de"
link_light: "#62aef0"
focus_blue: "#097fe8"

# Badges
badge_blue_bg: "#f2f9ff"
badge_blue_text: "#097fe8"
```

```gradient
enabled: false
```

## Typography Rules

NotionInter is a custom-modified Inter variant that enables OpenType features `lnum` (lining numerals) and `locl` (locale-specific glyphs) on larger text, and applies aggressive negative letter-spacing at display sizes (`-2.125px` at 64px). The four-weight system is strict: 400 for body, 500 for UI, 600 for emphasis, 700 for headings. Weights beyond 700 are never used. Positive letter-spacing is reserved for 12px badges only — the one place where tracking opens up rather than tightens.

```font-family
heading:
  family: "NotionInter"
  figma_fallback: "Inter"
  fallback: "Inter, -apple-system, system-ui, Segoe UI, Helvetica, Arial"
  weights: [600, 700]
body:
  family: "NotionInter"
  figma_fallback: "Inter"
  fallback: "Inter, -apple-system, system-ui, Segoe UI, Helvetica, Arial"
  weights: [400, 500, 600, 700]
opentype_features: [lnum, locl]
```

```type-scale
display: 64
h1: 54
h2: 48
h3: 40
heading: 26
body_lg: 22
body: 16
body_sm: 15
caption: 14
label: 12
```

```letter-spacing
display: "-2.125px"
h1: "-1.875px"
h2: "-1.5px"
heading: "-0.625px"
body_lg: "-0.25px"
body: "normal"
badge: "0.125px"
```

## Component Stylings

Cards use multi-layer soft shadows rather than borders — the `soft_card` and `deep_card` elevation tokens are the canonical container treatments. Buttons are subtly rounded (never pill) and use a `scale(0.9)` transform on active state. Badges render at the smallest text size (12px label) with positive letter-spacing (`0.125px`) — the only place in the system where positive tracking is permitted. Focus outlines use a solid 2px `focus_blue` ring, never dashed.

## Layout Principles

Strict 8px grid throughout. Generous padding on cards (24px minimum). Border radius tops out at 16px — soft-but-not-pill — except for the explicit `full: 9999` used on avatar chips and circular action buttons.

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
sm: 4
md: 8
lg: 12
xl: 16
full: 9999
```

## Depth & Elevation

Elevation is the defining visual mechanic of this system: **multi-layer shadow stacks at sub-0.05 opacity** create soft, whisper-quiet depth. A single-layer shadow at the same visual weight would look harsh — the multi-layer approach is non-negotiable. Ultra-thin `rgba(0,0,0,0.1)` borders replace drop shadows on flat surfaces (the `whisper` elevation token).

The structured `shadow` tokens below are the runtime primitives (consumed directly by Figma effect styles). The named `elevation` tokens are semantic composites — they may contain multi-layer CSS composite strings that Figmento treats as opaque pass-through values (see [DESIGN-MD-SPEC.md §7.1](../../../../docs/architecture/DESIGN-MD-SPEC.md)).

```shadow
sm:
  x: 0
  y: 0.175
  blur: 1
  spread: 0
  color: "rgba(0,0,0,0.01)"
  opacity: 1
md:
  x: 0
  y: 4
  blur: 18
  spread: 0
  color: "rgba(0,0,0,0.04)"
  opacity: 1
lg:
  x: 0
  y: 23
  blur: 52
  spread: 0
  color: "rgba(0,0,0,0.05)"
  opacity: 1
```

```elevation
flat:
  shadow: "none"
whisper:
  shadow: "1px solid rgba(0,0,0,0.1)"
soft_card:
  shadow: "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px"
deep_card:
  shadow: "rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px"
focus:
  shadow: "2px solid #097fe8"
```

## Do's and Don'ts

### Do
- Use NotionInter (modified Inter) with "lnum" and "locl" OpenType features on larger text
- Apply aggressive negative letter-spacing at display sizes (-2.125px at 64px)
- Use warm neutrals throughout — #f6f5f4, #615d59, #a39e98 — never cool grays
- Use ultra-thin borders at rgba(0,0,0,0.1)
- Build multi-layer shadow stacks with sub-0.05 opacity for soft elevation
- Reserve Notion Blue (#0075de) as the singular accent color for CTAs and links
- Use four-weight system — 400 (body), 500 (UI), 600 (emphasis), 700 (headings)
- Apply positive letter-spacing (0.125px) only on 12px badges
- Use scale(0.9) active state on primary buttons

### Don't
- Never use cold blue-grays — all neutrals must be warm-toned
- Never use heavy shadows — max individual layer opacity is 0.05
- Never introduce accent colors that compete with Notion Blue
- Never skip the multi-layer shadow approach — single-layer shadows look flat
- Never use weight 800+ — the system caps at 700
- Never apply positive letter-spacing on text larger than 12px
- Never use solid opaque borders — always rgba(0,0,0,0.1) or similar
- Never use Notion Blue decoratively — it is strictly interactive/CTA

## Responsive Behavior

Mobile-first. Display headlines (64px) drop to 40px below 768px. Body text holds at 16px throughout — never smaller. Card padding scales down from 24px to 16px on mobile. The multi-layer `soft_card` elevation stays identical across breakpoints — the system's depth language does not get heavier on smaller screens.

## Agent Prompt Guide

When generating UI with this design system:

- Pair NotionInter heading + body — never mix typefaces. If NotionInter is not available, fall back to Inter (not Arial, not system-ui).
- Reserve `primary` (#0075de) exclusively for interactive CTAs and links. Never use it for decorative fills, section dividers, or illustration highlights.
- Build elevation through the `soft_card` or `deep_card` multi-layer shadows. Never use single-layer drop shadows — they break the system's whisper-soft depth language.
- Use the warm neutral scale (`warm_white`, `warm_gray_300`, `warm_gray_500`, `warm_dark`) for backgrounds and text. Never use `#f5f5f5`, `#888`, `#000`, or any cool gray.
- Badges render at 12px `label` size with `0.125px` positive letter-spacing — this is the only place positive tracking is allowed.
- Buttons use `scale(0.9)` on active state — preserve this micro-interaction whenever possible.
- The extended brand colors (teal, green, orange, pink, purple, brown, deep_navy) are for avatars, category tags, and illustrations — never for UI chrome, button fills, or text emphasis.
