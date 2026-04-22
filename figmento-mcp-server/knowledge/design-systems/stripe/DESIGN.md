---
name: "stripe"
version: "1.0.0"
created: "2026-04-04T00:00:00.000Z"
source_url: "VoltAgent/awesome-design-md — design-md/stripe/DESIGN.md"
preset_used: null
schema_version: "1.0"
---

## Visual Theme & Atmosphere

Simultaneously technical and luxurious, precise and warm. A financial institution redesigned by a world-class type foundry. Headlines whisper authority through lightness, not weight.

**Mood**: premium, technical, luxurious

## Color Palette & Roles

```color
primary: "#533afd"
primary_light: "#b9b9f9"
primary_dark: "#2e2b8c"
secondary: "#ea2261"
accent: "#f96bee"
surface: "#ffffff"
background: "#ffffff"
border: "#e5edf5"
on_primary: "#ffffff"
on_surface: "#061b31"
on_surface_muted: "#64748d"
success: "#15be53"
warning: "#9b6829"
error: "#ea2261"
info: "#2874ad"
border_dashed: "#362baa"
border_purple: "#b9b9f9"
border_soft_purple: "#d6d9fc"
brand_dark: "#1c1e54"
dark_navy: "#0d253d"
label: "#273951"
magenta_light: "#ffd7ef"
success_bg: rgba(21,190,83,0.2)
success_text: "#108c3d"
```

```gradient
enabled: true
direction: linear
colors:
  - "#533afd"
  - "#f96bee"
```

## Typography Rules

```font-family
heading:
  family: sohne-var
  figma_fallback: DM Sans
  fallback: SF Pro Display
  weights:
    - 300
body:
  family: sohne-var
  figma_fallback: DM Sans
  fallback: SF Pro Display
  weights:
    - 300
    - 400
mono:
  family: SourceCodePro
  figma_fallback: Source Code Pro
  fallback: SFMono-Regular
  weights:
    - 500
    - 700
opentype_features:
  - ss01
tabular_features:
  - tnum
```

```type-scale
display: 56
h1: 48
h2: 32
h3: 26
heading: 22
body_lg: 18
body: 16
body_sm: 14
caption: 13
micro: 10
nano: 8
```

```letter-spacing
display: "-1.4px"
h1: "-0.96px"
h2: "-0.64px"
h3: "-0.26px"
heading: "-0.22px"
body: normal
```

## Component Stylings

_Not specified in tokens.yaml — add prose here if authoring the design system by hand._

## Layout Principles

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
md: 6
lg: 8
xl: 8
full: 9999
```

## Depth & Elevation

```shadow
sm:
  x: 0
  "y": 3
  blur: 6
  spread: 0
  color: rgba(23,23,23,0.06)
  opacity: 1
md:
  x: 0
  "y": 15
  blur: 35
  spread: 0
  color: rgba(23,23,23,0.08)
  opacity: 1
lg:
  x: 0
  "y": 30
  blur: 45
  spread: -30
  color: rgba(50,50,93,0.25)
  opacity: 1
```

```elevation
flat:
  shadow: none
ambient:
  shadow: rgba(23,23,23,0.06) 0px 3px 6px
standard:
  shadow: rgba(23,23,23,0.08) 0px 15px 35px
elevated:
  shadow: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px
deep:
  shadow: rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px
ring:
  shadow: "2px solid #533afd"
```

## Do's and Don'ts

### Do

- Use sohne-var with "ss01" on every text element
- Use weight 300 for all headlines and body text
- Apply blue-tinted shadows (rgba(50,50,93,0.25))
- Use
- Keep border-radius 4px-8px
- Use "tnum" for tabular/financial numbers
- Layer shadows — blue-tinted far + neutral close
- Use

### Don't

- Never use weight 600-700 for sohne-var headlines
- Never use large border-radius (12px+, pill shapes)
- Never use neutral gray shadows — always blue-tint
- Never skip "ss01" on any sohne-var text
- Never use pure black (#000000) for headings
- Never use warm accents (orange, yellow) for interactive elements
- Never apply positive letter-spacing at display sizes
- Never use magenta/ruby accents for buttons or links

## Responsive Behavior

_Not specified in tokens.yaml — add prose here if authoring the design system by hand._

## Agent Prompt Guide

_Not specified in tokens.yaml — add prose here if authoring the design system by hand._
