# DESIGN.md Authoring Guide

> **Audience:** Designers and developers who want to author, import, or export design systems as portable markdown files.
> **Spec:** [docs/architecture/DESIGN-MD-SPEC.md](../architecture/DESIGN-MD-SPEC.md) — this guide is the friendly companion.
> **Last updated:** 2026-04-22 (DMD-7)

## What is DESIGN.md?

`DESIGN.md` is a portable, human-readable markdown file that fully describes a design system — colors, typography, spacing, components, do/don'ts — in a format any LLM-powered design tool can read.

Figmento treats it as a first-class authoring path alongside PDF briefs and URL extraction. A single DESIGN.md file can be:

- **Imported** into Figmento to create `tokens.yaml` + a preview frame + Figma Variables (one command)
- **Exported** from Figmento to share your system with Cursor, Claude Desktop, Cline, or the awesome-design-md community
- **Validated** against the JSON schema as a lint pass before import
- **Round-tripped** freely — import → edit → re-import, byte-identical semantic fidelity

It's the same format the open-source [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) project uses, with the same schema shape as the [getdesign](https://www.npmjs.com/package/getdesign) npm package.

## The 10-Second Workflow

### Import (most common)

Drop a `DESIGN.md` file into the Figmento plugin chat:

```
<drag ./DESIGN.md into Figmento chat>
```

Figmento's agent automatically calls:

```
import_design_system_from_md({
  path: "./DESIGN.md",
  previewInFigma: true,     // renders the showcase frame
  createVariables: true,    // wires Figma Variables
  overwrite: false          // protects existing systems
})
```

Within a few seconds you get: a stored design system, a visual preview frame on the canvas, and a Variables collection in the Figma file.

### Export

```
export_design_system_to_md({ name: "aurelia" })
```

Returns the canonical DESIGN.md string. Write it to `knowledge/design-systems/aurelia/DESIGN.md` or share it anywhere.

### Validate (optional, pre-import lint)

```
validate_design_md({ path: "./DESIGN.md" })
```

Returns verdict `PASS | CONCERNS | FAIL` with severity-tagged issues (missing fields, invalid hex, WCAG contrast warnings, off-grid spacing).

## File Structure at a Glance

```
---                           ← frontmatter (YAML)
name: "aurelia"
version: "1.0.0"
created: "2026-04-15T03:05:04.295Z"
preset_used: "luxury"
schema_version: "1.0"
---

## Visual Theme & Atmosphere   ← 9 canonical sections, H2 headings
## Color Palette & Roles
## Typography Rules
## Component Stylings
## Layout Principles
## Depth & Elevation
## Do's and Don'ts
## Responsive Behavior
## Agent Prompt Guide
```

Each section holds **prose + fenced code blocks** with a specific language hint (e.g., ` ```color `, ` ```font-family `). Prose is for humans; fenced blocks are the machine-readable source of truth.

## Frontmatter Fields

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | ✅ | string | System identifier — used as the directory name under `knowledge/design-systems/{name}/`. Slug-friendly lowercase recommended. |
| `version` | — | string | Semver-ish. Defaults to `"1.0.0"` on export. |
| `created` | ✅ | ISO 8601 string | **Must be quoted.** Unquoted ISO dates are auto-converted to Date objects by js-yaml and fail validation. |
| `source_url` | — | string | Free-form attribution — URL, repo reference, or "hand-authored". Any string. |
| `preset_used` | — | string or `null` | `luxury`, `editorial`, `brutalist`, etc., when created from a preset. |
| `schema_version` | — | string | Currently `"1.0"`. |
| `mood` | — | string or list | Optional inline mood descriptor. Can also be placed as `**Mood**: ...` inside the Visual Theme section. |

## The 9 Sections

### 1. Visual Theme & Atmosphere

One to three paragraphs of prose describing the *feeling* of the brand. Optional `**Mood**: <comma list>` inline to tag it machine-readably.

Example:
```
## Visual Theme & Atmosphere

Aurelia is a Portuguese quinta dressed in Michelin stars. Deep forest greens
and near-black surfaces evoke a candle-lit cellar; aged-brass accents catch
the light like olive oil poured into a clay bowl.

**Mood**: luxury, editorial, mediterranean, warm, artisanal
```

### 2. Color Palette & Roles

A single ` ```color ` fenced block with role-based keys. 15 canonical roles are pre-defined; extras are allowed and preserved on round-trip.

**Canonical keys (keep these):** `primary`, `primary_light`, `primary_dark`, `secondary`, `accent`, `surface`, `background`, `border`, `on_primary`, `on_surface`, `on_surface_muted`, `success`, `warning`, `error`, `info`.

**Extended keys (brand-specific, optional):** anything like `warm_white`, `focus_blue`, `ship_red`, `emerald`, etc.

```color
primary: "#1F3A2E"
accent: "#B8860B"
surface: "#0D0D0D"
background: "#000000"
border: "#333333"
on_primary: "#FFFFFF"
# extras:
warm_white: "#F5F5F0"
focus_gold: "#D4AF37"
```

Values accept hex (`#1F3A2E`), short hex (`#fff`), or `rgba(r,g,b,a)`.

### 3. Typography Rules

Two fenced blocks: ` ```font-family ` (roles) and ` ```type-scale ` (sizes).

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
body: 16
body_sm: 13
caption: 10
```

Values are **unquoted numbers** (pixels). The type-scale block is the one place in DESIGN.md where numbers are not quoted.

Optional blocks: ` ```letter-spacing `, plus any OpenType feature list in prose.

### 4. Component Stylings

Prose describing button/card/badge treatments. Machine-readable radii go in the Layout section's ` ```radius ` block — components themselves are described narratively here.

### 5. Layout Principles

Prose + two fenced blocks: ` ```spacing ` and ` ```radius `.

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
lg: 10
xl: 16
full: 9999
```

Keep both on the 8px (or 4px) grid. The validator will flag off-grid values as a `CONCERN`.

### 6. Depth & Elevation

Two fenced blocks: ` ```shadow ` (structured layers) and ` ```elevation ` (opaque CSS pass-through).

```shadow
sm:
  layers:
    - { y: 1, blur: 2, color: "rgba(0,0,0,0.05)" }
md:
  layers:
    - { y: 4, blur: 6, color: "rgba(0,0,0,0.07)" }
    - { y: 2, blur: 4, color: "rgba(0,0,0,0.06)" }
```

```elevation
card: { shadow: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)" }
popover: { shadow: "0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)" }
```

The elevation block is opaque — the string is preserved verbatim on round-trip and NOT validated further. This is a deliberate trade-off documented in [spec §7.1](../architecture/DESIGN-MD-SPEC.md).

### 7. Do's and Don'ts

Bullet list under `### Do` and `### Don't` subheadings.

```markdown
## Do's and Don'ts

### Do
- Use Cormorant Garamond for anything that deserves to be read slowly
- Keep body columns under 680px for editorial rhythm
- Layer soft brass accents sparingly

### Don't
- Mix Cormorant and Inter in the same paragraph
- Use italics on Cormorant at display sizes
- Introduce a white background anywhere in the system
```

### 8. Responsive Behavior

Prose describing breakpoint philosophy and mobile-first decisions. No machine-readable block required (breakpoints live in CSS frameworks, not the DS spec).

### 9. Agent Prompt Guide

A paragraph written *for the LLM agent* consuming this DESIGN.md. Describe the brand voice so the agent picks appropriate image prompts, copy tone, and decorative choices when extending the system.

Example:
```
## Agent Prompt Guide

When generating images for Aurelia, prefer candle-lit interior shots with
warm brass reflections, hands at work on food prep, or close-ups of wine
being poured. Never generate bright studio lighting or pastel palettes.
Copy should read like an editorial — short, declarative, sensory.
```

## Fenced-Block Language Reference

| Language | Pattern | Section |
|---|---|---|
| ` ```color ` | flat map, role → value | Color Palette |
| ` ```font-family ` | nested map, role → { family, fallback, weights } | Typography |
| ` ```type-scale ` | flat map, name → number (unquoted) | Typography |
| ` ```letter-spacing ` | flat map, name → string | Typography (optional) |
| ` ```spacing ` | flat map, name → number | Layout |
| ` ```radius ` | flat map, name → number | Layout |
| ` ```shadow ` | structured, name → { layers: [...] } | Depth |
| ` ```elevation ` | opaque pass-through, name → { shadow: string } | Depth |
| ` ```gradient ` | structured, enabled + colors + stops | Depth (optional) |

Full reference: [spec §6](../architecture/DESIGN-MD-SPEC.md).

## Format Variants

Some systems ship responsive-aware typography or platform-specific radius scales. DESIGN.md supports `format_variants` as an optional top-level block under frontmatter — see [spec §5](../architecture/DESIGN-MD-SPEC.md) for the full schema.

## Round-Trip Editing Workflow

The canonical edit cycle:

1. **Export** current Figmento system: `export_design_system_to_md({ name: "aurelia" })`
2. **Edit** the returned markdown — change a color, adjust the type scale, tighten a shadow
3. **Validate** the edited file: `validate_design_md({ path: "./aurelia-v2.md" })` — catch issues before re-import
4. **Re-import** with `overwrite: true` to replace the stored system
5. **Preview** the change in Figma (the importer runs `create_ds_showcase` automatically if `previewInFigma: true`)

This is a legitimate authoring loop — it's how Figmento maintains its own 7 seeded systems.

## Three Worked Examples

### Example 1 — Luxury Brand (aurelia)

Full file at [figmento-mcp-server/knowledge/design-systems/aurelia/DESIGN.md](../../figmento-mcp-server/knowledge/design-systems/aurelia/DESIGN.md).

**Character:** editorial Portuguese quinta aesthetic. Near-black surfaces, aged-brass accent, Cormorant Garamond + Inter pairing, strict 8px grid, generous whitespace, opinionated do/don't list.

**Use this as a template when:** creating restaurant / hotel / hospitality / food-and-beverage brands with editorial polish.

**Notable:** thinnest system in the seeded set — no `elevation` block, no `gradients` block. Validates clean because those sections are optional.

### Example 2 — SaaS Product (linear)

Full file at [figmento-mcp-server/knowledge/design-systems/linear/DESIGN.md](../../figmento-mcp-server/knowledge/design-systems/linear/DESIGN.md).

**Character:** dark-mode-native product UI. Subtle white-opacity gradations for hierarchy, single brand purple, surgical spacing, extended color palette (14 canonical + 7 extras).

**Use this as a template when:** creating dark-first product / developer-tool / technical-SaaS brands.

**Notable:** heavy use of `rgba()` values for border subtlety. Demonstrates the extended-keys pattern (`border_secondary`, `level3_surface`, etc.) while remaining schema-valid.

### Example 3 — Knowledge Product (notion)

Full file at [figmento-mcp-server/knowledge/design-systems/notion/DESIGN.md](../../figmento-mcp-server/knowledge/design-systems/notion/DESIGN.md).

**Character:** warm-neutral light theme. Generous type scale, soft shadow ladder, elevation pass-through for popovers/modals/dropdowns.

**Use this as a template when:** creating productivity / document / knowledge-management brands with light-first aesthetics.

**Notable:** full 22/22 coverage — every optional section populated. Use this as the reference for "how should a complete DESIGN.md look?"

## Gotchas

- **Quote your ISO dates.** `created: 2026-04-15T03:05:04.295Z` (unquoted) becomes a Date object and fails validation. Always write `created: "2026-04-15T03:05:04.295Z"`.
- **Type-scale numbers are unquoted.** Every other block uses quoted strings; type-scale is the exception because the values are pure numbers.
- **`on_surface` is text color for the surface, not the surface itself.** The role-naming follows the Material/Tailwind convention: `on_X` means "foreground color used ON top of X-colored backgrounds."
- **Elevation is not validated.** The string inside `shadow:` is pass-through. If you typo a CSS value there, the validator won't catch it — Figma will silently ignore the broken filter.
- **Don't create a DESIGN.md for a system that already exists in Figmento** unless you pass `overwrite: true` to the importer. The default protects against accidental clobbering.

## Related Documentation

- [DESIGN-MD-SPEC.md](../architecture/DESIGN-MD-SPEC.md) — full technical specification, JSON schema, coverage tables
- [epic-DMD](../stories/epic-DMD-design-markdown.md) — the epic that built this pipeline
- [STATUS.md](../stories/STATUS.md) — current state of DMD stories
- [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) — upstream community reference
- [getdesign npm](https://www.npmjs.com/package/getdesign) — ecosystem package using the same format
