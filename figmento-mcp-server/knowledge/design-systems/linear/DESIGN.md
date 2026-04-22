---
name: "linear"
version: "1.0.0"
created: "2026-04-04T00:00:00.000Z"
source_url: "VoltAgent/awesome-design-md — design-md/linear.app/DESIGN.md"
preset_used: null
schema_version: "1.0"
---

## Visual Theme & Atmosphere

Dark-mode-native aesthetic where information density is managed through subtle gradations of white opacity rather than color variation. Content emerges from near-black darkness with surgical precision.

**Mood**: minimal, sharp, dark-native

## Color Palette & Roles

```color
primary: "#5e6ad2"
primary_light: "#828fff"
primary_dark: "#5e6ad2"
secondary: "#7170ff"
accent: "#828fff"
surface: "#0f1011"
background: "#08090a"
border: "#23252a"
on_primary: "#ffffff"
on_surface: "#f7f8f8"
on_surface_muted: "#8a8f98"
success: "#27a644"
warning: "#EAB308"
error: "#DC2626"
info: "#5e6ad2"
border_secondary: "#34343a"
border_standard: rgba(255,255,255,0.08)
border_subtle: rgba(255,255,255,0.05)
border_tertiary: "#3e3e44"
emerald: "#10b981"
level3_surface: "#191a1b"
light_background: "#f7f8f8"
light_border: "#d0d6e0"
light_surface: "#f3f4f5"
line_tint: "#141516"
marketing_black: "#010102"
overlay: rgba(0,0,0,0.85)
quaternary_text: "#62666d"
secondary_surface: "#28282c"
secondary_text: "#d0d6e0"
security_lavender: "#7a7fad"
tertiary_text: "#8a8f98"
```

```gradient
enabled: false
```

## Typography Rules

```font-family
heading:
  family: Inter Variable
  figma_fallback: Inter
  fallback: SF Pro Display, -apple-system, system-ui, Segoe UI, Roboto
  weights:
    - 510
    - 590
body:
  family: Inter Variable
  figma_fallback: Inter
  fallback: SF Pro Display, -apple-system, system-ui, Segoe UI, Roboto
  weights:
    - 300
    - 400
    - 510
    - 590
mono:
  family: Berkeley Mono
  figma_fallback: JetBrains Mono
  fallback: ui-monospace, SF Mono, Menlo
  weights:
    - 400
opentype_features:
  - cv01
  - ss03
```

```type-scale
display: 72
h1: 48
h2: 32
h3: 24
heading: 20
body_lg: 18
body: 16
body_sm: 15
caption: 13
label: 12
micro: 11
tiny: 10
```

```letter-spacing
display: "-1.584px"
h1: "-1.056px"
h2: "-0.704px"
h3: "-0.288px"
heading: "-0.24px"
body_lg: "-0.165px"
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
sm: 2
md: 6
lg: 8
xl: 12
full: 9999
```

## Depth & Elevation

```shadow
sm:
  x: 0
  "y": 1.2
  blur: 0
  spread: 0
  color: rgba(0,0,0,0.03)
  opacity: 1
md:
  x: 0
  "y": 2
  blur: 4
  spread: 0
  color: rgba(0,0,0,0.4)
  opacity: 1
lg:
  x: 0
  "y": 0
  blur: 12
  spread: 0
  color: rgba(0,0,0,0.2)
  opacity: 1
```

```elevation
flat:
  shadow: none
  background: "#010102"
subtle:
  shadow: rgba(0,0,0,0.03) 0px 1.2px 0px
surface:
  shadow: none
  background: rgba(255,255,255,0.05)
  border: rgba(255,255,255,0.08)
inset:
  shadow: rgba(0,0,0,0.2) 0px 0px 12px 0px inset
ring:
  shadow: rgba(0,0,0,0.2) 0px 0px 0px 1px
elevated:
  shadow: rgba(0,0,0,0.4) 0px 2px 4px
dialog:
  shadow: >-
    rgba(0,0,0,0) 0px 8px 2px, rgba(0,0,0,0.01) 0px 5px 2px, rgba(0,0,0,0.04) 0px 3px 2px, rgba(0,0,0,0.07) 0px 1px 1px,
    rgba(0,0,0,0.08) 0px 0px 1px
```

## Do's and Don'ts

### Do

- Use Inter Variable with "cv01" and "ss03" OpenType features on all text
- Use weight 510 as the default emphasis weight (between regular and medium)
- Apply aggressive negative letter-spacing at display sizes (-1.584px at 72px)
- Build on near-black backgrounds (#08090a /
- Use semi-transparent white borders (rgba(255,255,255,0.05-0.08))
- Use near-transparent button backgrounds (rgba(255,255,255,0.02-0.05))
- Reserve brand indigo (#5e6ad2) exclusively for interactive CTAs
- Use
- Communicate elevation through background luminance stepping, not shadows

### Don't

- Never use pure white (#ffffff) for primary text
- Never use solid colored button backgrounds (except brand indigo CTAs)
- Never use brand indigo decoratively — only for interactive elements
- Never apply positive letter-spacing at any size
- Never use visible/opaque solid borders on dark surfaces
- Never skip OpenType features cv01 and ss03 — they define Linear's typeface
- Never use weight 700 — the system maxes at 590
- Never introduce warm colors into UI chrome
- Never use drop shadows for elevation on dark backgrounds

## Responsive Behavior

_Not specified in tokens.yaml — add prose here if authoring the design system by hand._

## Agent Prompt Guide

_Not specified in tokens.yaml — add prose here if authoring the design system by hand._
