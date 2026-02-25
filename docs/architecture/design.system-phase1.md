# Figmento Design System Library — Phase 1: Foundation

> Token system, core components, format adapters, template scanning, library presets.
> Estimated effort: 2-3 days

---

## What Phase 1 Delivers

By the end of Phase 1, Claude can:

1. Generate a complete design system from minimal input (color + font, mood keywords, or library preset)
2. Instantiate branded components (button, badge, card, divider, avatar) with one tool call
3. Know the rules for 19 output formats (8 social, 5 print, 6 presentation)
4. Scan any existing Figma frame to understand its full structure (enabling clone + customize workflows)
5. All designs pull from a single token source — brand consistency is automatic

---

## Architecture

```
User: "Create a design system for PayFlow, fintech vibe"
  │
  ▼
create_design_system(name: "payflow", mood: ["fintech", "trust", "modern"])
  │
  ├── Auto-generates complete token set (colors, fonts, spacing, radius, shadows)
  ├── Writes to knowledge/design-systems/payflow/tokens.yaml
  └── Returns summary
  
User: "Make an Instagram post announcing a new feature"
  │
  ▼
get_format_rules("instagram_post")
  │ Returns: dimensions, safe zones, typography scale, layout rules
  │
  ▼
create_component("payflow", "button_primary", { label: "Try It Free" })
  │
  ├── Loads payflow tokens
  ├── Loads button_primary recipe
  ├── Resolves $tokens.colors.primary → "#2563EB"
  ├── Resolves $tokens.spacing.sm → 8
  ├── Builds batch_execute command array
  └── Sends single WS command → Figma canvas
```

---

## Stories (13 stories, ordered by dependency)

### DS-01 — Token Schema + Auto-Generation Engine

**What:** Define the YAML token schema and build the engine that generates a complete token set from minimal input.

**Implementation in `figmento-mcp-server/src/tools/design-system.ts` (new file):**

Token auto-generation logic:

- **From primary color:** Generate full palette using color theory:
  - `primary_light`: lighten 30%
  - `primary_dark`: darken 20%
  - `secondary`: complementary hue (180° rotation)
  - `accent`: analogous hue (30° rotation)
  - `surface`, `background`: light neutrals derived from primary hue
  - `border`: desaturated, lightened primary
  - `on_primary`: white or black based on contrast check (use existing `get_contrast_check` logic)
  - `on_surface`: near-black with slight primary hue
  - `on_surface_muted`: medium gray with primary hue
  - `success`, `warning`, `error`, `info`: standard semantic colors

- **From mood keywords:** Map keywords to token presets:
  - "luxury" → serif display font, dark surface, gold accent, generous spacing
  - "minimal" → sans-serif, white surface, subtle shadows, tight spacing
  - "bold" → heavy weights, large radius, strong shadows
  - "corporate" → blue primary, neutral grays, medium everything
  - "playful" → rounded radius, vibrant colors, bouncy spacing
  - "tech/fintech" → blue-indigo primary, mono accent font, clean sans-serif

- **From heading + body font:** Accept font names directly, validate against known Google Fonts list

- **Spacing, radius, shadows:** Always generated from a consistent scale (8px base unit, 3 shadow levels, 5 radius levels)

**Schema written to:** `knowledge/design-systems/{name}/tokens.yaml`

**Effort:** M (3-4 hours)

**Depends on:** Nothing

---

### DS-02 — Library Presets

**What:** Add a `preset` parameter to design system creation that loads curated token defaults based on popular design library aesthetics.

**5 presets to implement:**

```yaml
# knowledge/presets/shadcn.yaml
name: "shadcn"
description: "Clean, neutral, border-focused. Inspired by shadcn/ui"
defaults:
  primary: "#0F172A"
  secondary: "#6366F1"
  accent: "#F59E0B"
  surface: "#FFFFFF"
  background: "#F8FAFC"
  border: "#E2E8F0"
  heading_font: "Inter"
  body_font: "Inter"
  radius: { sm: 4, md: 6, lg: 8 }
  shadows: subtle    # Minimal elevation, border-driven depth
  spacing_unit: 8
  style: "borders over shadows, subtle hover states, neutral palette"

# knowledge/presets/material.yaml
name: "material"
description: "Elevated, colorful, shadow-driven. Inspired by Material Design"
defaults:
  primary: "#1976D2"
  secondary: "#9C27B0"
  accent: "#FF9800"
  heading_font: "Roboto"
  body_font: "Roboto"
  radius: { sm: 4, md: 8, lg: 12 }
  shadows: pronounced  # Elevation-based depth
  spacing_unit: 8

# knowledge/presets/minimal.yaml
name: "minimal"
description: "Stark, high-contrast, lots of whitespace"
defaults:
  primary: "#000000"
  secondary: "#666666"
  accent: "#000000"
  surface: "#FFFFFF"
  heading_font: "Inter"
  body_font: "Inter"
  radius: { sm: 0, md: 0, lg: 0 }
  shadows: none
  spacing_unit: 8
  style: "no shadows, no radius, typography-driven hierarchy"

# knowledge/presets/luxury.yaml
name: "luxury"
description: "Dark, serif, gold accents, generous spacing"
defaults:
  primary: "#1A1A2E"
  secondary: "#D4AF37"
  accent: "#C9A84C"
  surface: "#0D0D0D"
  background: "#000000"
  heading_font: "Playfair Display"
  body_font: "Lato"
  radius: { sm: 0, md: 4, lg: 8 }
  shadows: subtle
  spacing_unit: 8
  style: "dark backgrounds, gold accents, serif headlines, premium feel"

# knowledge/presets/vibrant.yaml
name: "vibrant"
description: "Bold colors, large radius, energetic feel"
defaults:
  primary: "#7C3AED"
  secondary: "#EC4899"
  accent: "#10B981"
  heading_font: "Poppins"
  body_font: "Inter"
  radius: { sm: 8, md: 12, lg: 24 }
  shadows: pronounced
  spacing_unit: 8
  style: "gradient-friendly, large radius, bold typography, high energy"
```

**Usage:** `create_design_system({ name: "payflow", preset: "shadcn", primary_color: "#2563EB" })` — loads shadcn defaults, overrides primary with provided color, auto-generates rest.

**Effort:** S (1-2 hours)

**Depends on:** DS-01

---

### DS-03 — `create_design_system` MCP Tool

**What:** The MCP tool that exposes the token generation engine.

**Parameters:**
```typescript
create_design_system({
  name: z.string(),                              // Required: "payflow"
  preset: z.enum(["shadcn", "material", "minimal", "luxury", "vibrant"]).optional(),
  primary_color: z.string().optional(),           // "#2563EB"
  secondary_color: z.string().optional(),
  accent_color: z.string().optional(),
  heading_font: z.string().optional(),            // "Inter"
  body_font: z.string().optional(),
  mood: z.array(z.string()).optional(),            // ["fintech", "modern", "trust"]
  voice: z.string().optional(),                    // "Professional but approachable"
  from_brand_kit: z.string().optional(),           // Migrate existing brand kit
})
```

**Logic:**
1. If `preset` provided → load preset defaults
2. Override with any explicitly provided values (color, font, mood)
3. If `mood` provided but no preset → select closest preset or generate from mood mappings
4. Run auto-generation engine (DS-01) to fill remaining values
5. Write complete `tokens.yaml` to `knowledge/design-systems/{name}/`
6. Return summary: `{ name, colors: 12, fonts: { heading, body }, spacingUnit: 8, presetUsed }`

**Effort:** S (1-2 hours — mostly wiring, engine is DS-01)

**Depends on:** DS-01, DS-02

---

### DS-04 — Design System CRUD Tools

**What:** `get_design_system`, `list_design_systems`, `update_design_system`, `delete_design_system`

**Tools:**

```typescript
get_design_system({ name: z.string() })
// Reads knowledge/design-systems/{name}/tokens.yaml
// Returns complete token object

list_design_systems()
// Scans knowledge/design-systems/ directory
// Returns [{ name, created, presetUsed, primaryColor }]

update_design_system({
  name: z.string(),
  changes: z.record(z.string(), z.unknown())
  // Dot-path keys: { "tokens.colors.primary": "#FF0000", "tokens.typography.heading.family": "Merriweather" }
})
// Reads tokens.yaml, applies changes at dot-paths, writes back
// Returns { updated: ["tokens.colors.primary"], affectedCount: 1 }

delete_design_system({ name: z.string() })
// Removes knowledge/design-systems/{name}/ directory
// Returns { deleted: true }
```

**Effort:** S (1-2 hours)

**Depends on:** DS-03

---

### DS-05 — Token Resolution Engine

**What:** The core function that converts component recipes (with `$tokens.*` references) into concrete values ready for `batch_execute`.

**Implementation in `figmento-mcp-server/src/tools/design-system.ts`:**

```typescript
function resolveTokens(
  recipe: Record<string, unknown>,
  tokens: Record<string, unknown>,
  props: Record<string, unknown>
): Record<string, unknown>
```

**Logic:**
- Recursively walk the recipe object
- Any string value starting with `$tokens.` → resolve via dot-path lookup into tokens object
- Any string value matching `{{propName}}` → replace with `props[propName]`
- Handle nested objects and arrays
- Handle shadow expansion: `$tokens.shadows.md` → `{ type: "DROP_SHADOW", blur: 8, offset: { x: 0, y: 4 }, color: "#000000", opacity: 0.12 }`
- Handle fill expansion: `$tokens.colors.primary` in a fills array → `{ type: "SOLID", color: "#2563EB" }`
- Return fully resolved object with no `$` or `{{` references remaining

**Error handling:**
- Unknown token path → warning log + skip (don't crash, leave the raw string)
- Missing required prop → error with clear message: "Component 'button_primary' requires prop 'label'"

**Effort:** M (3-4 hours — recursive resolution with edge cases)

**Depends on:** DS-01 (needs token schema to resolve against)

---

### DS-06 — Core Component Recipes (5 Components)

**What:** Define 5 universal components as YAML recipes that the token resolution engine can process.

**File:** `knowledge/components/core.yaml`

**Components:**

1. **button** — frame with auto-layout, padding, cornerRadius, fill, text child
   - Variants: primary, secondary, ghost, outline, destructive
   - Props: `label` (required), `size` (sm/md/lg, optional)
   - Size variants adjust padding and fontSize

2. **badge** — small pill frame with rounded corners, tinted fill, text child
   - Variants: default, success, warning, error, info
   - Props: `label` (required)

3. **card** — frame container with padding, cornerRadius, shadow, vertical layout
   - Props: `children` (passed through — card is a container)
   - Variants: default (white + shadow), outlined (border, no shadow), elevated (larger shadow)

4. **divider** — thin rectangle, FILL width, border color
   - Props: none (pure token-driven)
   - Variants: default (1px), thick (2px), accent (primary color)

5. **avatar** — circular ellipse with fill color
   - Props: `size` (sm: 32, md: 40, lg: 56, xl: 80)
   - Future: image fill support

Each component recipe follows this pattern:
```yaml
button_primary:
  description: "Primary action button"
  props:
    label: { type: string, required: true }
    size: { type: enum, values: [sm, md, lg], default: md }
  recipe:
    type: frame
    layoutMode: HORIZONTAL
    primaryAxisAlignItems: CENTER
    counterAxisAlignItems: CENTER
    paddingTop: "$tokens.spacing.sm"
    paddingBottom: "$tokens.spacing.sm"
    paddingLeft: "$tokens.spacing.lg"
    paddingRight: "$tokens.spacing.lg"
    cornerRadius: "$tokens.radius.md"
    fills: [{ type: SOLID, color: "$tokens.colors.primary" }]
    children:
      - type: text
        content: "{{label}}"
        fontSize: "$tokens.typography.scale.body"
        fontFamily: "$tokens.typography.body.family"
        fontWeight: 600
        color: "$tokens.colors.on_primary"
  variants:
    secondary:
      fills: [{ type: SOLID, color: "$tokens.colors.surface" }]
      stroke: { color: "$tokens.colors.border", width: 1 }
      children:
        - color: "$tokens.colors.on_surface"
    ghost:
      fills: []
      children:
        - color: "$tokens.colors.primary"
  size_overrides:
    sm:
      paddingTop: "$tokens.spacing.xs"
      paddingBottom: "$tokens.spacing.xs"
      paddingLeft: "$tokens.spacing.md"
      paddingRight: "$tokens.spacing.md"
      children:
        - fontSize: "$tokens.typography.scale.body_sm"
    lg:
      paddingTop: "$tokens.spacing.md"
      paddingBottom: "$tokens.spacing.md"
      paddingLeft: "$tokens.spacing.xl"
      paddingRight: "$tokens.spacing.xl"
      children:
        - fontSize: "$tokens.typography.scale.body_lg"
```

**Effort:** M (2-3 hours — writing 5 recipes with variants, testing resolution)

**Depends on:** DS-05 (token resolution engine)

---

### DS-07 — `create_component` MCP Tool

**What:** The tool that instantiates a component on the Figma canvas.

**Parameters:**
```typescript
create_component({
  system: z.string(),              // "payflow"
  component: z.string(),           // "button_primary" or "button"
  variant: z.string().optional(),  // "secondary", "ghost"
  size: z.string().optional(),     // "sm", "md", "lg"
  props: z.record(z.unknown()),    // { label: "Get Started" }
  parentId: z.string().optional(), // Place inside a frame
  x: z.coerce.number().optional(),
  y: z.coerce.number().optional(),
})
```

**Logic:**
1. Load design system tokens: `knowledge/design-systems/{system}/tokens.yaml`
2. Load component recipe: `knowledge/components/core.yaml` → find `{component}`
3. If `variant` provided → deep merge variant overrides onto base recipe
4. If `size` provided → deep merge size overrides
5. Run token resolution engine (DS-05) with tokens + props
6. Convert resolved recipe to `batch_execute` command array:
   - Root element → first command with `tempId: "root"`
   - Children → subsequent commands with `parentId: "$root"`
7. Add `x`, `y`, `parentId` to root command if provided
8. Send via `sendDesignCommand('batch_execute', { commands })` 
9. Return `{ nodeId, name, componentType, variant, childCount }`

**Effort:** M (2-3 hours)

**Depends on:** DS-05, DS-06

---

### DS-08 — `list_components` MCP Tool

**What:** Returns available components with their props and variants.

```typescript
list_components({ system: z.string().optional() })
// If system provided: also checks for brand-specific component overrides
// Returns: [{ name, description, variants, props: { name, type, required, default } }]
```

**Effort:** S (1 hour)

**Depends on:** DS-06

---

### DS-09 — Social Format Adapters (8 formats)

**What:** YAML files defining rules for 8 social media formats.

**Files in `knowledge/formats/social/`:**
1. `instagram_post.yaml` — 1080×1080, safe zones, 3-level text hierarchy
2. `instagram_story.yaml` — 1080×1920, top/bottom unsafe zones (150px), full-bleed preferred
3. `instagram_carousel.yaml` — 1080×1080 × N, consistency rules across slides
4. `linkedin_post.yaml` — 1200×627, professional tone, data-friendly
5. `linkedin_banner.yaml` — 1584×396, minimal text, brand-heavy
6. `twitter_post.yaml` — 1200×675, bold headline, minimal body
7. `facebook_post.yaml` — 1200×630, similar to LinkedIn but more casual
8. `facebook_cover.yaml` — 820×312, no text in center (profile pic overlay)

Each file follows the format adapter schema: dimensions, safe_zones, typography_scale, layout_rules, image_rules, composition guidelines, brand_placement rules, export settings.

**Effort:** M (2-3 hours — researching exact specs, writing 8 YAML files)

**Depends on:** Nothing (data files only)

---

### DS-10 — Print Format Adapters (5 formats)

**What:** YAML files for 5 core print formats with bleed, trim, and print-specific rules.

**Files in `knowledge/formats/print/`:**
1. `business_card.yaml` — 1050×600 (3.5×2in @300dpi), 3mm bleed, 10mm safe zone, CMYK notes, front+back layout guidance
2. `letterhead.yaml` — 2550×3300 (8.5×11in), header area, content area, footer, margin rules
3. `flyer_a4.yaml` — 2480×3508, bleed, headline top-third rule, CTA placement
4. `flyer_us_letter.yaml` — 2550×3300, same as A4 but US dimensions
5. `poster_a3.yaml` — 3508×4961, large headline rules, viewing distance considerations

Each includes: `dimensions`, `bleed`, `safe_zone`, `typography_scale` (with minimum sizes for print legibility), `layout_rules`, `print_rules` (color mode, min line weight, font size minimums), `composition` guidance.

**Effort:** M (2-3 hours)

**Depends on:** Nothing

---

### DS-11 — Presentation Format Adapters (6 slide types)

**What:** Single YAML file covering all presentation slide types within 16:9 format.

**File:** `knowledge/formats/presentation/slide_16_9.yaml`

**Slide types defined within:**
1. `title_slide` — centered headline + subtitle, logo, minimal
2. `content_slide` — headline + body paragraphs or bullet points
3. `image_slide` — image 60% + text 40%, or full-bleed with overlay
4. `quote_slide` — large italic quote + attribution
5. `comparison_slide` — two-column side-by-side
6. `data_slide` — stat cards, chart placeholder, key metrics

Each slide type has: typography scale, layout rules, element placement zones, master elements (logo watermark position, page number position).

Global presentation rules: consistent margins (100px sides, 80px top/bottom), max 6 bullets, one idea per slide, logo on every slide except title.

**Effort:** M (2 hours)

**Depends on:** Nothing

---

### DS-12 — `get_format_rules` + `list_formats` MCP Tools

**What:** Tools to query format adapter data.

```typescript
get_format_rules({
  format: z.string(),            // "instagram_post"
  slide_type: z.string().optional() // "title_slide" (for presentations)
})
// Reads the format YAML file
// Returns complete format adapter data

list_formats({ category: z.string().optional() })
// "social" → lists all social formats
// No category → lists all formats grouped by category
// Returns [{ name, category, dimensions, description }]
```

**Effort:** S (1-2 hours)

**Depends on:** DS-09, DS-10, DS-11 (needs formats to exist)

---

### DS-13 — `scan_frame_structure` MCP Tool

**What:** Deep scanner that returns the complete structure of any Figma frame — enabling clone + customize workflows where the designer controls layout and Claude handles production.

**Parameters:**
```typescript
scan_frame_structure({
  nodeId: z.string(),
  depth: z.coerce.number().optional().default(5),
  include_styles: z.boolean().optional().default(true),
})
```

**Plugin handler `handleScanFrameStructure` in `code.ts`:**

Recursively walks the node tree and returns:
```typescript
{
  nodeId: string,
  name: string,
  type: string,           // FRAME, TEXT, RECTANGLE, ELLIPSE, GROUP, etc.
  x: number,
  y: number,
  width: number,
  height: number,
  // Style properties (if include_styles)
  fills?: Fill[],
  stroke?: Stroke,
  effects?: Effect[],
  cornerRadius?: number,
  opacity?: number,
  // Layout properties
  layoutMode?: string,
  itemSpacing?: number,
  padding?: { top, right, bottom, left },
  layoutSizingHorizontal?: string,
  layoutSizingVertical?: string,
  // Text properties (if TEXT node)
  text?: {
    content: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number,
    color: string,
    textAlign: string,
    lineHeight: number | "AUTO",
  },
  // Children (recursive)
  children?: FrameStructure[],
}
```

**Use cases:**
- "Use this frame as a template for 9 more variations" → scan → clone_with_overrides
- "What's the structure of this design?" → scan → Claude understands the anatomy
- "Extract the design language from this frame" → scan → Claude identifies patterns

**Effort:** M (3-4 hours — new plugin handler with deep recursion)

**Depends on:** Nothing (new capability)

---

### DS-14 — CLAUDE.md Design System Workflow Rules

**What:** Add behavioral rules to `.claude/CLAUDE.md` so Claude automatically uses the design system.

**Content to add:**

```markdown
## Design System Workflow

### Starting Any Design
1. Ask what brand/project this is for
2. Check for existing design system: get_design_system(name)
3. If none: offer to create one from color+font, mood, or preset
4. Load format rules: get_format_rules(format) for the target format
5. Use create_component for standard elements — NEVER manually build buttons, badges, cards
6. All colors, fonts, spacing from tokens — NEVER hardcode values when a system is loaded

### Format Awareness
- ALWAYS call get_format_rules before starting any design
- Respect safe zones — no critical content outside safe area
- Use format-specific typography scales — web sizes ≠ print sizes ≠ social sizes
- Print formats: respect bleed, minimum font sizes, CMYK considerations
- Social formats: design for mobile viewing (content must read at 375px display width)

### Template-Based Workflow
When user says "use this as a template" or "make variations of this":
1. Call scan_frame_structure to understand the existing design
2. Use clone_with_overrides to create copies
3. Modify text, colors, images while preserving layout structure
4. The user's layout decisions are sacred — don't rearrange their design

### Token Discipline
- Every color: from design system tokens
- Every font: from system typography
- Every spacing value: from spacing scale
- If you need a value not in the system: ask the user or explain the deviation

### Component Usage
- Buttons: ALWAYS use create_component, never frame+text manually
- Badges: ALWAYS use create_component
- Cards: ALWAYS use create_component for the container
- If a component doesn't exist for what you need: use batch_execute with token values
```

**Effort:** S (1 hour)

**Depends on:** All other stories (documents the full system)

---

## Story Dependency Graph

```
DS-01 (Token engine)
  ├── DS-02 (Presets) ──→ DS-03 (create_design_system tool)
  │                            │
  │                            ▼
  │                       DS-04 (CRUD tools)
  │
  └── DS-05 (Token resolution engine)
       │
       ├── DS-06 (Component recipes)
       │    │
       │    ├── DS-07 (create_component tool)
       │    └── DS-08 (list_components tool)
       │
       └── (requires tokens to resolve against)

DS-09 (Social formats) ──┐
DS-10 (Print formats) ───┤──→ DS-12 (get_format_rules + list_formats tools)
DS-11 (Presentation) ────┘

DS-13 (scan_frame_structure) ── standalone

DS-14 (CLAUDE.md) ── last (documents everything)
```

## Implementation Order for @dev

**Day 1:**
1. DS-01 — Token engine (the foundation)
2. DS-02 — Library presets (small, builds on DS-01)
3. DS-03 — `create_design_system` tool (wires DS-01 + DS-02 to MCP)
4. DS-04 — CRUD tools (quick, filesystem reads/writes)

**Day 2:**
5. DS-05 — Token resolution engine (critical path)
6. DS-06 — 5 component recipes (YAML authoring)
7. DS-07 — `create_component` tool (connects resolution → batch_execute → Figma)
8. DS-08 — `list_components` tool (quick)

**Day 3:**
9. DS-09 — Social format adapters (YAML authoring)
10. DS-10 — Print format adapters (YAML authoring)
11. DS-11 — Presentation format adapters (YAML authoring)
12. DS-12 — `get_format_rules` + `list_formats` tools
13. DS-13 — `scan_frame_structure` tool (new plugin handler)
14. DS-14 — CLAUDE.md rules

---

## Validation Test

After Phase 1 is complete, run this end-to-end test:

**"Create a design system for a fintech startup called PayFlow — modern, trustworthy, shadcn-inspired. Then create: (1) an Instagram post announcing their new instant transfers feature, (2) a business card for their CEO Sarah Chen, and (3) a title slide for an investor pitch deck. Use the same design system for all three. Generate images where appropriate. Evaluate each design."**

This tests:
- Design system creation with preset + mood
- Token consistency across 3 different formats (social, print, presentation)
- Component usage (buttons, badges)
- Format adapter rules (safe zones, bleed, typography scales)
- Image generation + placement
- Self-evaluation loop

If all 3 deliverables are visually consistent and format-appropriate, Phase 1 is complete.

---

## What Phase 1 Does NOT Include

- Cross-format patterns (hero_section, feature_grid, pricing_table) → Phase 2
- Web/UI components beyond the 5 core (navbar, forms, tables, modals) → Phase 2
- Multi-page templates (social media kit, pitch deck, stationery package) → Phase 3
- Style transfer / design language extraction → Phase 4
- Website URL analysis → Phase 4
- Smart community template scanning → Phase 4

These are all documented in the full plan and ready for implementation once Phase 1 is validated with real usage.

---

*Phase 1: Foundation — 14 stories, 2-3 days, delivers token system + 5 components + 19 formats + frame scanning*