---
name: "figma"
version: "1.0.0"
created: "2026-04-04T00:00:00.000Z"
source_url: "VoltAgent/awesome-design-md — design-md/figma/DESIGN.md"
preset_used: null
schema_version: "1.0"
---

## Visual Theme & Atmosphere

Strictly black-and-white interface chrome with a custom variable font using unusual weight stops. Pill and circular button geometry. Gradient color explosions reserved exclusively for product content, never UI chrome.

**Mood**: bold, geometric, playful

## Color Palette & Roles

```color
primary: "#000000"
primary_light: rgba(0,0,0,0.08)
primary_dark: "#000000"
secondary: "#ffffff"
accent: "#000000"
surface: "#ffffff"
background: "#ffffff"
border: "#000000"
on_primary: "#ffffff"
on_surface: "#000000"
on_surface_muted: rgba(0,0,0,0.08)
success: "#16A34A"
warning: "#EAB308"
error: "#DC2626"
info: "#000000"
glass_black: rgba(0,0,0,0.08)
glass_white: rgba(255,255,255,0.16)
```

```gradient
enabled: true
direction: linear
colors:
  - "#00c853"
  - "#ffea00"
  - "#7c4dff"
  - "#ff4081"
note: Hero gradient uses electric green, bright yellow, deep purple, hot pink — product content only, never UI chrome
```

## Typography Rules

```font-family
heading:
  family: figmaSans
  figma_fallback: Plus Jakarta Sans
  fallback: figmaSans Fallback, SF Pro Display, system-ui, helvetica
  weights:
    - 400
    - 540
    - 700
body:
  family: figmaSans
  figma_fallback: Plus Jakarta Sans
  fallback: figmaSans Fallback, SF Pro Display, system-ui, helvetica
  weights:
    - 320
    - 330
    - 340
    - 450
    - 480
mono:
  family: figmaMono
  figma_fallback: JetBrains Mono
  fallback: figmaMono Fallback, SF Mono, menlo
  weights:
    - 400
opentype_features:
  - kern
```

```type-scale
display: 86
h1: 64
h2: 26
h3: 24
heading: 20
body_lg: 20
body: 16
body_sm: 14
caption: 12
```

```letter-spacing
display: "-1.72px"
h1: "-0.96px"
h2: "-0.26px"
body_lg: "-0.14px"
body: "-0.14px"
mono_label: 0.54px
mono_small: 0.6px
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
xl: 50
full: 9999
```

## Depth & Elevation

```shadow
sm:
  x: 0
  "y": 0
  blur: 0
  spread: 0
  color: "#000000"
  opacity: 0
md:
  x: 0
  "y": 0
  blur: 0
  spread: 0
  color: "#000000"
  opacity: 0
lg:
  x: 0
  "y": 0
  blur: 0
  spread: 0
  color: "#000000"
  opacity: 0
```

```elevation
flat:
  shadow: none
focus:
  shadow: "dashed 2px #000000"
```

## Do's and Don'ts

### Do

- Use figmaSans with precise variable weight stops (320, 330, 340, 450, 480, 540, 700)
- Keep all interface chrome strictly black-and-white
- Use pill (50px radius) and circular (50%) button geometry
- Apply dashed 2px focus outlines — never solid
- Enable "kern" OpenType feature on all figmaSans text
- Use figmaMono UPPERCASE for technical labels with positive letter-spacing
- Apply negative letter-spacing on all body and heading text
- Reserve gradient colors exclusively for product/hero content

### Don't

- Never use interface colors in UI chrome — black and white only
- Never use standard font weights (400/500/600/700) — use the variable stops (320/330/340/450/480/540)
- Never use sharp corners on buttons — always pill or circular
- Never use solid focus outlines — always dashed
- Never use body weight above 450 for running text
- Never apply positive letter-spacing on body or heading text
- Never use gradient colors for UI elements — only product content
- Never use traditional drop shadows — Figma's system is flat

## Responsive Behavior

_Not specified in tokens.yaml — add prose here if authoring the design system by hand._

## Agent Prompt Guide

_Not specified in tokens.yaml — add prose here if authoring the design system by hand._
