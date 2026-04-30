# Design Taste — Figmento Skill

Senior-designer baseline that overrides default LLM biases when generating
Figma layouts. Pair this with `figmento-screenshot-to-layout` or
`figmento-text-to-layout`. Where those skills tell you HOW to build the
frames, this one tells you WHAT GOOD LOOKS LIKE.

This is the Figma-native counterpart of the `design-taste-frontend`,
`redesign-existing-projects`, and `minimalist-ui` global skills.

---

## When to Load This

ALWAYS load alongside layout generation when:
- The user did not supply a brand kit or design system cache
- The brief is open-ended ("make it look premium," "modern landing page")
- The mood is editorial, premium, minimalist, or unspecified
- The output will be a portfolio piece or marketing asset

SKIP when:
- The user provided exact specs (colors, fonts, layout) - follow specs
- A design system cache is loaded - the DS overrides taste defaults
- The brief explicitly conflicts with these rules (Caio said "I want
  three equal cards in a row") - user intent always wins

---

## The Three Dials (Auto-Set or User-Override)

Figmento sets these baselines unless the user explicitly overrides:

### DESIGN_VARIANCE: 7 (default)

Layout experimentation level. 1 = symmetrical/centered. 10 = asymmetric/chaotic.

- **1-3 (Predictable):** Centered hero, equal padding, 12-column symmetric
  grids. Use for utility apps, internal tools, dashboards.
- **4-7 (Offset):** Left-aligned headers over centered content, varied
  aspect ratios (4:3 next to 16:9), `margin-top: -2rem` overlaps. Default
  for marketing.
- **8-10 (Asymmetric):** Masonry, fractional CSS Grid (`2fr 1fr 1fr`),
  massive empty zones (20vw padding-left), bento layouts. Use for premium
  brand work, editorial pieces.

**Mobile override:** At any variance level, mobile must collapse to a
strict single-column layout. Asymmetry is desktop-only.

### MOTION_INTENSITY: 5 (default)

Animation depth target. Figma is static so this guides component states
and "this is animated" markers in the design.

- **1-3 (Static):** Hover states only, no implied motion.
- **4-7 (Fluid):** Hover + active + focus states designed. Implied
  transitions noted (icons rotate, accordions open, drawers slide).
- **8-10 (Choreographed):** Scroll-triggered reveals, parallax depth,
  staggered list mounts. Mark these explicitly in the design with
  annotation frames.

### VISUAL_DENSITY: 4 (default)

Information per viewport. 1 = airy gallery. 10 = pilot cockpit.

- **1-3 (Gallery):** Massive whitespace (`py-24` to `py-32` between
  sections). 50% whitespace minimum. Premium brand work.
- **4-7 (Daily app):** Standard spacing for marketing or product UIs.
- **8-10 (Cockpit):** Tight padding, no card boxes, 1px lines for
  separation, monospace numbers. Data dashboards only.

---

## Typography Defaults

When no brand kit is loaded, use these as Figmento's house defaults.
They override any LLM-default reach for Inter.

### Display Headlines (>40px)

- **Default font stack:** Cabinet Grotesk → Geist → Outfit → Satoshi
- **Tracking:** -0.02em to -0.04em (`tracking-tighter`)
- **Line-height:** 1.0 to 1.1 (`leading-none` or `leading-tight`)
- **Weight:** 600 to 700 minimum for impact

### Body Text

- **Default font stack:** Geist → Satoshi → Inter (fallback only)
- **Size:** 16px minimum, 18px preferred for marketing
- **Line-height:** 1.5 to 1.6 for readability
- **Max width:** 65 characters (`max-w-[65ch]`)
- **Color:** Never `#000` on light. Use `#27272a` (zinc-800) or
  `#18181b` (zinc-900). Never `#fff` on dark - use `#fafafa` or
  `#e4e4e7`.

### Editorial / Brand Pairings

When the brief is editorial, premium, or brand-focused:
- **Heading (serif):** Lyon → Newsreader → Instrument Serif → Playfair Display
- **Body (sans):** Geist or Satoshi
- **Tracking on serif heading:** -0.03em to -0.04em
- **NEVER use serif on dashboard or technical UI**

### Dashboard / Data UI

- **Heading + body:** Geist + Geist Mono, or Satoshi + JetBrains Mono
- **Numbers:** Always monospace (use `font-variant-numeric: tabular-nums`
  if the typeface supports it, otherwise switch to mono for data cells)
- **Serifs:** BANNED

### Weight Hierarchy

Use 4 weight levels minimum:
- **400 Regular** - body text
- **500 Medium** - secondary headings, labels
- **600 SemiBold** - subheads, navigation
- **700 Bold or 800 ExtraBold** - display headlines

Reaching for ONLY 400 + 700 is an AI tell. Always include the
intermediate weights.

---

## Color Defaults

When no brand kit is loaded:

### Background Bases (pick one, stick to it)

- **Light mode:** `#fafafa` (zinc-50) or `#f7f6f3` (warm bone) or
  `#fbfbfa` (off-white). Never pure `#ffffff` for full-page backgrounds.
- **Dark mode:** `#09090b` (zinc-950) or `#0a0a0a` (charcoal) or
  `#0a0e1a` (tinted dark navy). Never pure `#000`.

### Surface Tints (for cards, modals)

- Light: `#ffffff` cards on `#fafafa` background
- Dark: `#18181b` (zinc-900) cards on `#09090b` background
- Border: `#e4e4e7` (zinc-200) on light, `#27272a` (zinc-800) on dark

### Accent Color Rules

- **MAX 1 ACCENT** per design. Pick one. Apply restraint everywhere else.
- **Saturation cap:** 80%. Desaturate accents to feel considered.
- **Default accent palette** (when no brand color provided):
  - **Emerald:** `#10b981` (saturated) → `#34d399` (washed)
  - **Electric Blue:** `#3b82f6` (NOT purple-blue)
  - **Deep Rose:** `#f43f5e`
  - **Olive:** `#84cc16` (Caiotti DS v1 alignment)
  - **Cyan:** `#06b6d4` (Caiotti DS v1 alignment)
- **NEVER:** AI Purple-Blue gradients. Neon. Pure red CTAs. Generic Material
  Blue.

### Pastel Accents (for tags, status, inline highlights)

When using minimalist/editorial mood:
- Pale Red `#fdebec` text `#9f2f2d`
- Pale Blue `#e1f3fe` text `#1f6c9f`
- Pale Green `#edf3ec` text `#346538`
- Pale Yellow `#fbf3db` text `#956400`

---

## Layout Directives

### Hero Sections

- **DESIGN_VARIANCE 1-3:** Centered allowed.
- **DESIGN_VARIANCE 4-10:** Centered hero is BANNED. Use one of:
  - **Split 50/50:** Headline + CTA on left, image/asset on right
  - **Asymmetric whitespace:** Headline left-aligned with massive
    `padding-left: 20vw` (or equivalent in Figma frames)
  - **Stacked offset:** Headline left, body indented right
  - **Diagonal anchor:** Headline top-left, CTA bottom-right

- **Hero height:** Treat as `min-h-[100dvh]` equivalent (full viewport
  with safe-zone padding for mobile address bars). Never lock to a
  fixed pixel height that fights mobile.

### Feature Rows

- **3 equal cards in a row:** BANNED.
- **Replacements:**
  - 2-column zig-zag (text-image, image-text alternating)
  - Asymmetric grid: one card 1.5x wider or taller
  - Bento layout: mixed sizes, intentional weight variance
  - Horizontal scroll list (mobile-first feel)
  - Masonry stack: variable card heights

### Pricing Tables

- **3 equal pricing tiers:** Allowed BUT the recommended plan must:
  - Scale 1.05-1.1x larger
  - Have a different background tint (subtle)
  - Carry a "Recommended" badge
  - Use a filled CTA where others are outlined

### Sections / Padding Rhythm

- Section gaps follow Fibonacci-adjacent: 24 → 40 → 64 → 96 → 128px
- Hero vertical padding: 96px desktop, 64px mobile
- Standard sections: 64-96px desktop, 48px mobile
- Card internal padding: 24-40px (generous, not tight)
- **Asymmetric vertical padding:** bottom 1.1-1.2x larger than top
  (optical correction)

---

## Materiality

### Shadows (always tinted)

- Pure `rgba(0,0,0,X)` shadows are banned.
- Tint to background:
  - Warm bg (cream, beige) → shadow `rgba(139, 69, 19, 0.08)`
  - Cool bg (gray, blue) → shadow `rgba(30, 58, 95, 0.10)`
  - Neutral bg → shadow `rgba(0, 0, 0, 0.06)` (very subtle)
- **Diffusion shadow** for premium feel: wide spread, low opacity:
  `0 20px 40px -15px rgba(0, 0, 0, 0.05)`

### Borders

- Default border: `1px solid rgba(0, 0, 0, 0.06)` on light, or
  `1px solid #e4e4e7` (zinc-200)
- Border-radius: vary intentionally. Tight (4-8px) for inner elements,
  softer (12-20px) for major containers. Caiotti DS v1: 4 / 8 / 14 / 20.
- AVOID: `rounded-full` on large containers. Pills are for tags only.

### Glassmorphism (when used)

- 1px inner border at `rgba(255,255,255,0.10)`
- Inner shadow: `inset 0 1px 0 rgba(255,255,255,0.10)`
- Backdrop blur: 12-20px
- Background fill: surface color at 60-70% opacity

---

## Content Realism

When generating placeholder content:

### Names

- BANNED: John Doe, Jane Smith, Sarah Chan, Jack Su
- Use diverse, realistic names with cultural specificity:
  Marina Okafor, Henrik Vasquez, Yuki Andersson, Lena Marchetti, etc.

### Companies / Brands

- BANNED: Acme, Nexus, SmartFlow, Lorem, GenericCo
- Invent contextual brand names matching the vertical:
  - Fintech: "Nordwell", "Beacon", "Mint Tower"
  - SaaS: "Rivet", "Slate", "Drift"
  - Editorial: "Folio", "Margin", "The Weeklies"

### Numbers

- BANNED: 99.99%, 50%, $100.00, 1,234,567
- Use organic, messy data:
  - `47.2%` not `50%`
  - `$2,847` not `$2,500`
  - `+1 (312) 847-1928` not `123-456-7890`
  - `12,847 customers` not `10K customers`

### Avatars

- BANNED: default Lucide user-icon, "egg" avatar
- Use:
  - Realistic photo placeholders (`picsum.photos/seed/{name}/200/200`)
  - Considered SVG character avatars with intentional color logic
  - Initialed monograms with brand-aligned color hues

### Copy

- BANNED words: Elevate, Unleash, Seamless, Next-gen, Game-changer,
  Revolutionize, Transform, Streamline, Cutting-edge, Delve, Embark
- Use concrete verbs and specific outcomes:
  - "Cuts deploy time from 11 minutes to 40 seconds" not "Streamlines
    your deployment workflow"
  - "Tracks 47 metrics across 3 channels" not "Comprehensive analytics"

---

## State Coverage (4 Required States)

Every interactive component must show all 4 states in the Figma file:

1. **Default** - resting state
2. **Hover** - color shift, slight elevation, or border activation
3. **Active/Pressed** - scale 0.98 or translateY 1px (annotated)
4. **Focus** - visible ring (`ring-2 ring-offset-2`) for keyboard a11y

For data-driven components, add:

5. **Loading** - skeleton matching layout shape
6. **Empty** - composed "getting started" view, never just "No data"
7. **Error** - inline error frame, never a floating alert

If any state is missing from the design, flag it explicitly. Saying
"hover state is the same as default" is acceptable - omitting hover
entirely is not.

---

## Before You Generate (Pre-Flight Checklist)

Quick pass through these before opening `use_figma`:

- [ ] DESIGN_VARIANCE level set (default 7)?
- [ ] Typography stack chosen (display + body + optional mono)?
- [ ] Single accent color picked (saturation under 80%)?
- [ ] Hero structure decided (which non-centered layout)?
- [ ] Feature row structure decided (zig-zag, bento, scroll)?
- [ ] Section padding rhythm planned (Fibonacci-adjacent)?
- [ ] Memorable element identified (oversized number, bleed image, etc.)?
- [ ] Realistic content prepared (names, numbers, copy)?
- [ ] States to design listed (default + hover + active + focus + special)?

If any answer is "haven't decided," decide before writing the first frame.
Decisions made mid-generation produce inconsistent designs.

---

## Companion References

This skill works alongside:
- `figmento-anti-patterns.md` - the negative space (what NOT to do)
- `figmento-typography-system.md` - typography depth
- `figmento-color-and-spacing.md` - color theory and spacing scales
- `figmento-screenshot-to-layout.md` - screenshot → Figma workflow
- `figmento-text-to-layout.md` - text brief → Figma workflow

Global skills at `~/.claude/skills/` (auto-load when appropriate):
- `design-taste-frontend` - same rules in code-shipping form
- `redesign-existing-projects` - audit-then-fix flow
- `minimalist-ui` - editorial / Notion-Linear / Caiotti DS v1

*Figmento Design Intelligence — figmento.dev*
