---
name: "vercel"
version: "1.0.0"
created: "2026-04-04T00:00:00.000Z"
source_url: "VoltAgent/awesome-design-md — design-md/vercel/DESIGN.md"
preset_used: null
schema_version: "1.0"
---

## Visual Theme & Atmosphere

Extreme typographic precision through aggressive negative letter-spacing. Shadow-as-border technique replaces traditional borders. Achromatic palette with workflow-specific accent colors. Developer-first, deployment-oriented.

**Mood**: technical, precise, achromatic

## Color Palette & Roles

```color
primary: "#171717"
primary_light: "#666666"
primary_dark: "#000000"
secondary: "#0070f3"
accent: "#0072f5"
surface: "#ffffff"
background: "#ffffff"
border: rgba(0,0,0,0.08)
on_primary: "#ffffff"
on_surface: "#171717"
on_surface_muted: "#666666"
success: "#16A34A"
warning: "#EAB308"
error: "#ff5b4f"
info: "#0070f3"
badge_blue_bg: "#ebf5ff"
badge_blue_text: "#0068d6"
console_blue: "#0070f3"
console_pink: "#eb367f"
console_purple: "#7928ca"
develop_blue: "#0a72ef"
focus_blue: hsla(212, 100%, 48%, 1)
gray_100: "#ebebeb"
gray_400: "#808080"
gray_50: "#fafafa"
gray_500: "#666666"
gray_600: "#4d4d4d"
gray_900: "#171717"
link_blue: "#0072f5"
overlay: hsla(0, 0%, 98%, 1)
preview_pink: "#de1d8d"
ring_blue: rgba(147, 197, 253, 0.5)
ship_red: "#ff5b4f"
```

```gradient
enabled: false
```

## Typography Rules

```font-family
heading:
  family: Geist
  figma_fallback: Inter
  fallback: Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol
  weights:
    - 500
    - 600
body:
  family: Geist
  figma_fallback: Inter
  fallback: Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol
  weights:
    - 400
    - 500
    - 600
mono:
  family: Geist Mono
  figma_fallback: JetBrains Mono
  fallback: ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco
  weights:
    - 400
    - 500
opentype_features:
  - liga
tabular_features:
  - tnum
```

```type-scale
display: 48
h1: 40
h2: 32
h3: 24
heading: 24
body_lg: 20
body: 18
body_sm: 16
caption: 14
label: 12
micro: 7
```

```letter-spacing
display: "-2.88px"
h1: "-2.4px"
h2: "-1.28px"
h3: "-0.96px"
body: normal
body_semibold: "-0.32px"
```

## Component Stylings

_Not specified in tokens.yaml — add prose here if authoring the design system by hand._

## Layout Principles

```spacing
unit: 8
xs: 4
sm: 8
md: 16
lg: 32
xl: 40
2xl: 48
3xl: 64
```

```radius
none: 0
sm: 4
md: 6
lg: 8
xl: 12
full: 9999
```

## Depth & Elevation

```shadow
sm:
  x: 0
  "y": 0
  blur: 0
  spread: 1
  color: rgba(0,0,0,0.08)
  opacity: 1
md:
  x: 0
  "y": 2
  blur: 2
  spread: 0
  color: rgba(0,0,0,0.04)
  opacity: 1
lg:
  x: 0
  "y": 8
  blur: 8
  spread: -8
  color: rgba(0,0,0,0.04)
  opacity: 1
```

```elevation
flat:
  shadow: none
ring:
  shadow: rgba(0,0,0,0.08) 0px 0px 0px 1px
light_ring:
  shadow: rgb(235,235,235) 0px 0px 0px 1px
subtle_card:
  shadow: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px
full_card:
  shadow: >-
    rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px
    0px 1px
focus:
  shadow: 2px solid hsla(212, 100%, 48%, 1)
```

## Do's and Don'ts

### Do

- Apply aggressive negative letter-spacing at display sizes (-2.4px to -2.88px)
- Use shadow-as-border technique (0px 0px 0px 1px) instead of CSS border
- Enable "liga" OpenType feature on all Geist text
- Use three-weight system only — 400 (body), 500 (UI), 600 (headings)
- Use workflow accent colors only in their semantic context (Ship/Preview/Develop)
- Stack multi-layer card shadows with inner
- Keep the palette achromatic —
- Use Geist Mono uppercase with positive letter-spacing for console labels

### Don't

- Never apply positive letter-spacing on Geist Sans body text
- Never use weight 700 on body text (only micro badges)
- Never use traditional CSS border on cards — always shadow-as-border
- Never introduce warm colors into the chrome/UI
- Never use workflow accent colors (Ship Red, Preview Pink, Develop Blue) decoratively
- Never use heavy shadows (>0.1 opacity)
- Never increase body text letter-spacing above normal
- Never use pill radius on primary action buttons
- Never skip the inner

## Responsive Behavior

_Not specified in tokens.yaml — add prose here if authoring the design system by hand._

## Agent Prompt Guide

_Not specified in tokens.yaml — add prose here if authoring the design system by hand._
