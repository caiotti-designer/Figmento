---
name: aurelia
version: 1.0.0
created: "2026-04-15T03:05:04.295Z"
preset_used: luxury
schema_version: "1.0"
---

## Visual Theme & Atmosphere

Aurelia is a Portuguese quinta dressed in Michelin stars. Deep forest greens and near-black surfaces evoke a candle-lit cellar; aged-brass accents catch the light like olive oil poured into a clay bowl. The aesthetic is **refined, poetic, understated** — every piece of the visual language is chosen to let the food be the loudest voice in the room. Editorial, not corporate. Warm, not precious. Restraint as a form of confidence.

**Mood**: luxury, editorial, mediterranean, warm, artisanal

## Color Palette & Roles

The palette is committed to the dark side with discipline. Near-black surfaces dominate — there is no white page in this system. The singular warmth comes from aged-brass gold (`#B8860B`), used sparingly and only where the eye needs to land: primary CTAs, pull-quote marks, the underline beneath the reservation link. Forest green (`#1F3A2E`) is the second character — it appears in shadow tints, active states, and as a wash on hero imagery. Everything else is a gradient of near-black.

```color
primary: "#1F3A2E"
primary_light: "#549E7D"
primary_dark: "#000000"
secondary: "#B8860B"
accent: "#B8860B"
surface: "#0D0D0D"
background: "#000000"
border: "#333333"
on_primary: "#FFFFFF"
on_surface: "#151917"
on_surface_muted: "#6D7873"
success: "#16A34A"
warning: "#EAB308"
error: "#DC2626"
info: "#2563EB"
```

## Typography Rules

**Cormorant Garamond** for everything that deserves to be read slowly — headlines, pull quotes, menu item names, the name of a wine. It carries the editorial weight; it's the house voice. **Inter** handles everything else: prices, disclaimers, navigation, the body of an article about the farm. The two typefaces never mix in the same paragraph — Cormorant for the line that matters, Inter for the lines around it.

No monospace. No condensed. No italics on Cormorant at display sizes — the unitalic silhouette is part of the identity.

```font-family
heading:
  family: "Cormorant Garamond"
  fallback: "Georgia, 'Times New Roman', serif"
  weights: [600, 700, 800]
body:
  family: "Inter"
  fallback: "-apple-system, system-ui, 'Segoe UI', sans-serif"
  weights: [400, 500, 600]
```

```type-scale
display: 61
h1: 49
h2: 39
h3: 31
heading: 39
body_lg: 20
body: 16
body_sm: 13
caption: 10
```

## Component Stylings

Corners are close to sharp — `sm: 0` and `md: 4` means most inline chips and small buttons have almost no rounding, producing an architectural, almost printed quality. Larger elements get `lg: 8` or `xl: 12` to soften, but nothing is ever a pill. The one exception is `full: 9999` for avatar chips on the team page — a single concession to roundness.

Buttons sit on near-black surfaces with aged-brass fills (primary) or thin brass outlines (secondary). Hover state deepens the fill, never lightens it. Cards have the `primary`-tinted soft shadows defined below — the green tint is what separates this from a generic "dark theme".

## Layout Principles

Strict 8px grid. Generous whitespace — editorial design lives and dies by its margins. Body copy columns cap at 680px regardless of viewport width; shorter lines keep the reading tempo slow. Headers breathe: never less than 48px of vertical space above a display headline.

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
sm: 0
md: 4
lg: 8
xl: 12
full: 9999
```

## Depth & Elevation

Shadows carry the **primary green tint** instead of neutral black — this is the system's signature. A black shadow on a black surface disappears; a green-tinted shadow at low opacity creates a warm glow that reads as *atmosphere* rather than *depth*. Every shadow in the system uses `#1F3A2E` as its color with sub-12% opacity.

The system defines three structured shadow levels (`sm`, `md`, `lg`). Semantic elevation tokens (soft-card, deep-card, ring) are not defined in v1 — cards should use the `md` shadow directly, and buttons should use `sm`. When the menu and reservation flow warrant a more elaborate depth language, a future iteration can introduce named elevation composites.

```shadow
sm:
  x: 0
  y: 1
  blur: 2
  spread: 0
  color: "#1F3A2E"
  opacity: 0.05
md:
  x: 0
  y: 4
  blur: 8
  spread: -2
  color: "#1F3A2E"
  opacity: 0.08
lg:
  x: 0
  y: 8
  blur: 24
  spread: -4
  color: "#1F3A2E"
  opacity: 0.12
```

## Do's and Don'ts

### Do
- **typography:** Reserve Cormorant Garamond for editorial moments — headlines, pull quotes, wine names, the chef's name
- **typography:** Use Inter for everything else — the moment you feel tempted to use Cormorant on a disclaimer, stop
- **color:** Let aged-brass (`#B8860B`) be the single warm accent. Nowhere else. Not on success states, not on tags, not on links that aren't CTAs
- **color:** Use forest green (`#1F3A2E`) for shadows and active states only. Never as a fill on anything the user reads
- **color:** Treat white (`#FFFFFF`) as reserved for text on primary CTAs — and nowhere else
- **layout:** Keep body-copy columns under 680px. Longer lines break the editorial tempo
- **layout:** Never pack the page. Generous whitespace is the Michelin star
- **motion:** Fades over 400ms. Nothing in Aurelia moves fast

### Don't
- **typography:** Never use italics on Cormorant at display sizes
- **typography:** Never use weights below 400 on Inter or above 800 on Cormorant
- **typography:** Never mix Cormorant and Inter in the same sentence
- **color:** Never introduce pure saturated colors. The palette is near-black + forest + brass. That's the whole vocabulary
- **color:** Never use a cool gray. Every neutral is warm-tinted — the shadow tint flows into everything
- **color:** Never use brass for decoration. It is interactive, or it is absent
- **layout:** Never center-align body copy. Left-align is the editorial default
- **layout:** Never use pill radius on primary action buttons. Pills are casual; Aurelia is not
- **motion:** Never use bounce or elastic easing — linear or cubic-bezier only

## Responsive Behavior

Mobile-first. Display headlines (61px) drop to 36px below 768px — the system takes a breath rather than fighting for every pixel. Body copy holds at 16px throughout. Cards stack vertically; horizontal scroll is permitted only for the menu carousel and wine list. The aged-brass accent color is the last thing to be tuned down at small sizes — if the CTA is visible at all, it's visible in brass.

## Agent Prompt Guide

When generating UI with Aurelia:

- **Dark canvas, always.** `background` is `#000000` and `surface` is `#0D0D0D`. Never generate a light-theme variant — Aurelia does not have one.
- **Cormorant for editorial, Inter for everything else.** If you're generating a button label, a price, a disclaimer, a navigation item — it's Inter. If you're generating a headline, a wine name, a chef's name, a pull quote — it's Cormorant.
- **Brass is interactive.** The only places `#B8860B` should appear are primary buttons, active link underlines, and focus rings. If you're generating a decorative element and you reach for brass, stop and use forest green instead.
- **Green-tinted shadows.** When you add shadow to a card or button, the shadow color is `#1F3A2E` at sub-12% opacity, not `rgba(0,0,0,X)`. This is load-bearing to the aesthetic.
- **No pills.** Primary CTAs are `radius.md` (4px) or `radius.lg` (8px). Pills break the architectural quality of the system.
- **Generous whitespace.** When you're sizing a section, double what feels right. Aurelia is about restraint — the gesture of *not* filling the space is the design.
- **400ms fades, linear or cubic-bezier easing.** No bounce. No elastic. No spring physics.

---

## Authoring Friction Notes (DMD-1 Task 5.3 — feeds DMD-7 guide)

Writing this file from scratch surfaced the following:

1. **The 9-section structure is genuinely helpful.** Having named section headings as prompts ("now write Visual Theme & Atmosphere", "now write Do's and Don'ts") made authoring feel closer to filling in a well-designed form than staring at a blank page. The section names carry semantic weight.

2. **Fenced-block language hints are ergonomic.** Typing ` ```color` felt like opening a well-labeled drawer — I knew exactly what belonged inside. The mental model is: prose describes *why*, fenced blocks describe *what*. The pattern generalized across `color`, `font-family`, `type-scale`, `spacing`, `radius`, `shadow` without any lookup.

3. **`letter-spacing` block didn't feel needed for this brand.** Aurelia's `tokens.yaml` doesn't define letter-spacing values because the Cormorant + Inter pairing doesn't need aggressive tracking. Omitting the block felt natural. The spec should confirm this is fine (it does — §6 marks it as optional via the open-map pattern).

4. **No `gradient` block authored.** aurelia doesn't use gradients and the schema allows the block to be absent entirely. I could have written `​```gradient\nenabled: false\n​``` ` explicitly for completeness, but omitting it felt cleaner. Authors will tend to omit rather than explicitly disable — the importer should treat absence as `{enabled: false}`.

5. **No `elevation` block — intentional.** aurelia's tokens.yaml doesn't have elevation either. The `Depth & Elevation` section exists with prose only, describing the shadow approach. This is what the spec's "thin system" tolerance is for. Feels natural.

6. **The category tags on Do's and Don'ts (`typography:`, `color:`, etc.) genuinely helped structure my thinking.** Without them, the list would have been a jumble. With them, I wrote clustered rules — all typography rules together, all color rules together. Recommend DMD-7 guide encourages this pattern.

7. **Friction: `on_surface: "#151917"` on `surface: "#0D0D0D"` is a contrast bug in the existing `tokens.yaml`.** This would have failed a contrast check at ~1.1:1. Not in scope for DMD-1 to fix — `DMD-3` (validator) should catch this. Noting it here because the authoring pass surfaced it.

8. **Friction: Responsive Behavior and Agent Prompt Guide are still prose-heavy.** In v1 they don't have structured blocks, so writing them means composing paragraphs. Fine for now — the prompt guide in particular benefits from a narrative voice. A future v2 `​```breakpoints` block would reduce authoring cost on the responsive section for systems that need it.
