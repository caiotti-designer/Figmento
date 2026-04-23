# Figmento DESIGN.md Specification v1.0

> Human-authoring and ecosystem-interchange format for Figmento design systems. Parsed into the runtime `tokens.yaml` format by the `import_design_system_from_md` MCP tool and emitted back by `export_design_system_to_md`. Extends [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) with frontmatter, fenced-block language hints, and a Format Variants section — while remaining strictly backward-compatible with plain upstream DESIGN.md files.

| Field | Value |
|---|---|
| **Schema version** | 1.0 |
| **Status** | Draft (DMD-1, 2026-04-15) |
| **Authoring format** | Markdown (CommonMark + GFM) |
| **Runtime format** | `tokens.yaml` (see [figmento-mcp-server/knowledge/design-systems/](../../figmento-mcp-server/knowledge/design-systems/)) |
| **Parser** | [`marked@^12`](https://marked.js.org/) — locked by [epic-DMD](../stories/epic-DMD-design-markdown.md) |
| **Frontmatter parser** | [`js-yaml`](https://github.com/nodeca/js-yaml) — already a dependency |
| **JSON Schema** | [`figmento-mcp-server/schemas/design-md.schema.json`](../../figmento-mcp-server/schemas/design-md.schema.json) |
| **Governing epic** | [epic-DMD — DESIGN.md Pipeline](../stories/epic-DMD-design-markdown.md) |

---

## 1. Purpose and Audience

A `DESIGN.md` file captures a complete design system in one human-authored markdown document: brand mood, full color palette (semantic + extended), typography families with weights and OpenType features, type/spacing/radius scales, shadow and elevation layers, gradients, and do/don't constraints. The format exists because `tokens.yaml` — Figmento's runtime format — is verbose, quote-heavy, and unfriendly to hand-editing. `DESIGN.md` is the human-authoring layer that `tokens.yaml` never wanted to be.

Three audiences consume this spec:

1. **Humans authoring design systems by hand** — read sections 2–4 to learn the structure, section 10 for a worked example.
2. **LLM agents (Claude, Cursor, Cline) consuming DESIGN.md as context** — the 9 canonical sections and fenced-block conventions are LLM-friendly by design.
3. **Figmento's parser, validator, and exporter** — read sections 5–8 for the coverage table, tolerance contract, and trade-off rationale.

A `DESIGN.md` is **not** a CSS file, a Tailwind config, or a Figma file export. It is a **declarative description** of a design system's visual language. The Figmento MCP server is responsible for translating that description into Figma variables, text styles, and components at apply time.

---

## 2. File Structure at a Glance

A conforming `DESIGN.md` has three top-level parts, in this order:

```
┌─────────────────────────────────┐
│  1. YAML Frontmatter            │  (optional, recommended)
│     ---                         │
│     name: notion                │
│     version: 1.0.0              │
│     created: 2026-04-04         │
│     source_url: ...             │
│     ---                         │
├─────────────────────────────────┤
│  2. Nine Canonical Sections     │  (from awesome-design-md)
│     ## Visual Theme & ...       │
│     ## Color Palette & Roles    │
│     ## Typography Rules         │
│     ## Component Stylings       │
│     ## Layout Principles        │
│     ## Depth & Elevation        │
│     ## Do's and Don'ts          │
│     ## Responsive Behavior      │
│     ## Agent Prompt Guide       │
├─────────────────────────────────┤
│  3. Figmento Extensions         │  (optional, Figmento-specific)
│     ## Format Variants          │
└─────────────────────────────────┘
```

Inside those sections, structured data lives in **fenced code blocks with language hints** — e.g., ` ```color` for palette entries, ` ```shadow` for structured shadow tokens. The fenced blocks are what makes `DESIGN.md` *machine-parseable without NLP*. The prose around them is for humans and LLMs.

---

## 3. Frontmatter

**Location:** Top of file, delimited by `---` fences, YAML body.
**Parser:** `js-yaml` (the same YAML parser used by `tokens.yaml`).
**Required by the schema:** `name`, `created`.
**All other fields:** optional.
**Tolerance:** files with no frontmatter at all validate as `CONCERNS` (not `FAIL`) — the importer infers `name` from the filename and sets `created` to the import timestamp.

### Fields

| Field | Type | Required | Purpose | Example |
|---|---|:-:|---|---|
| `name` | string, kebab-case | ✅ | System identifier. Becomes the directory name under `knowledge/design-systems/{name}/`. | `notion` |
| `version` | string, semver | ❌ | Design system version. Defaults to `1.0.0` when absent. Reserved for future schema-migration logic. | `1.2.0` |
| `created` | ISO-8601 datetime | ✅ | When the system was authored. Preserved from `tokens.yaml.created` on round-trip. | `2026-04-04T00:00:00.000Z` |
| `source_url` | URL | ❌ | Upstream origin when the system was ingested from somewhere (e.g., a reference site, an awesome-design-md file). Maps to `tokens.yaml.source`. | `https://github.com/VoltAgent/awesome-design-md` |
| `figma_file_key` | string | ❌ | Figma file key this system is bound to. Reserved for future plugin-side workflows (e.g., auto-opening the system's preview frame). | `AbCdEf1234567890` |
| `preset_used` | string \| null | ❌ | Name of the Figmento preset used during generation (e.g., `"luxury"`, `"editorial"`). Maps to `tokens.yaml.preset_used`. | `luxury` |

### Rationale

The frontmatter block answers questions that would otherwise contaminate the canonical sections: "what's this file called?", "when was it made?", "where did it come from?". Keeping metadata out of the content sections means a DESIGN.md imported from an upstream source (which has no frontmatter) still parses the same way as a Figmento-native one. The importer applies defaults for missing fields, so tolerance is genuine, not aspirational.

---

## 4. The Nine Canonical Sections

These section headings come directly from [awesome-design-md](https://github.com/VoltAgent/awesome-design-md)'s 50+ community DESIGN.md files. Preserving them verbatim is **non-negotiable** — it's how Figmento honors the "drop any community DESIGN.md and it works" promise. A plain upstream file (with no frontmatter, no fenced blocks, no Figmento extensions) must still validate at the `CONCERNS` level.

Each section below documents:
- **H2 heading (exact text)** — must match verbatim
- **Content type** — prose, fenced blocks, or both
- **`tokens.yaml` mapping** — which runtime field(s) this section produces
- **Figmento extensions** — optional additional structure unique to Figmento

### 4.1 `## Visual Theme & Atmosphere`

**Content:** Prose + `mood` bullet list.

**Maps to:** `tokens.yaml.mood`, `tokens.yaml.voice`.

**Format:**
```markdown
## Visual Theme & Atmosphere

Warm neutrals (never cold grays) with a singular Notion Blue accent. Custom
modified Inter with aggressive negative tracking at display sizes.

**Mood**: warm, approachable, productive
```

The prose body maps to `tokens.yaml.voice`. The `**Mood**:` line (comma-separated) or a bullet list under a "Mood" sub-heading maps to `tokens.yaml.mood`. Both forms are accepted.

### 4.2 `## Color Palette & Roles`

**Content:** Prose intro + ` ```color` fenced block.

**Maps to:** `tokens.yaml.colors`.

**Format:**
```markdown
## Color Palette & Roles

The palette is built on warm neutrals with Notion Blue as the singular accent.

​```color
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

# Extended (system-specific)
warm_white: "#f6f5f4"
warm_dark: "#31302e"
badge_blue_bg: "#f2f9ff"
​```
```

The ` ```color` block is an **open map** (see §5.2). The 15 canonical keys (`primary`, `primary_light`, `primary_dark`, `secondary`, `accent`, `surface`, `background`, `border`, `on_primary`, `on_surface`, `on_surface_muted`, `success`, `warning`, `error`, `info`) are **recommended** — the importer applies sensible defaults for any that are missing. Any additional freely-named keys are preserved verbatim in `tokens.yaml.colors`.

### 4.3 `## Typography Rules`

**Content:** Prose + 3 fenced blocks (` ```font-family`, ` ```type-scale`, ` ```letter-spacing`).

**Maps to:** `tokens.yaml.typography`.

**Format:**
```markdown
## Typography Rules

Single-family Inter variant with aggressive negative letter-spacing at display
sizes. Four-weight system — 400 body, 500 UI, 600 emphasis, 700 headings.

​```font-family
heading:
  family: "NotionInter"
  figma_fallback: "Inter"
  fallback: "Inter, -apple-system, system-ui"
  weights: [600, 700]
body:
  family: "NotionInter"
  figma_fallback: "Inter"
  fallback: "Inter, -apple-system, system-ui"
  weights: [400, 500, 600, 700]
opentype_features: [lnum, locl]
​```

​```type-scale
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
​```

​```letter-spacing
display: "-2.125px"
h1: "-1.875px"
h2: "-1.5px"
heading: "-0.625px"
body_lg: "-0.25px"
body: "normal"
badge: "0.125px"
​```
```

The three blocks together map to `tokens.yaml.typography`. `​```font-family` is **structured** (fixed sub-keys per role). `​```type-scale` and `​```letter-spacing` are **open maps** — canonical keys (display, h1–h3, heading, body_lg/sm, caption, label) are recommended, additional keys (micro, tiny, nano, overline, body_semibold, mono_label, badge, …) are preserved verbatim.

### 4.4 `## Component Stylings`

**Content:** Prose.

**Maps to:** No direct `tokens.yaml` field. **Informational only in v1.0.**

This section describes how components *look* in the system — button geometry, card elevation strategy, badge shapes — in prose. Component *recipes* (the actual structural definitions) live in `figmento-mcp-server/src/tools/design-system/ds-components.ts` and are not authored from DESIGN.md in v1.0.

**v2 upgrade path:** a future schema version may introduce a ` ```component` fenced block DSL; until then, this section carries prose only and is preserved on round-trip as a string blob under an informational field.

### 4.5 `## Layout Principles`

**Content:** Prose + 2 fenced blocks (` ```spacing`, ` ```radius`).

**Maps to:** `tokens.yaml.spacing`, `tokens.yaml.radius`.

**Format:**
```markdown
## Layout Principles

Strict 8px grid. Generous padding on cards (24px minimum). Border radius is
soft-but-not-pill — 4/8/12/16.

​```spacing
unit: 8
xs: 4
sm: 8
md: 16
lg: 24
xl: 32
2xl: 48
3xl: 64
​```

​```radius
none: 0
sm: 4
md: 8
lg: 12
xl: 16
full: 9999
​```
```

Both blocks are **fixed-key** — the schema rejects unknown keys inside them. Values are numbers (pixels).

### 4.6 `## Depth & Elevation`

**Content:** Prose + 2 fenced blocks (` ```shadow`, ` ```elevation`).

**Maps to:** `tokens.yaml.shadows`, `tokens.yaml.elevation`.

**Format:**
```markdown
## Depth & Elevation

Multi-layer shadow stacks at sub-0.05 opacity create whisper-soft elevation.
Ultra-thin borders at rgba(0,0,0,0.1) replace hard shadows on flat surfaces.

​```shadow
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
​```

​```elevation
flat:
  shadow: none
whisper:
  shadow: "1px solid rgba(0,0,0,0.1)"
soft_card:
  shadow: "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px"
deep_card:
  shadow: "rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px"
focus:
  shadow: "2px solid #097fe8"
​```
```

The ` ```shadow` block is **structured and fixed-key**: always `sm`/`md`/`lg`, always 6 fields per level. This is the one place where Figmento enforces a rigid shadow shape, because the MCP runtime reads `shadows.sm.color` directly when binding Figma effect styles.

The ` ```elevation` block is the **deliberate pass-through** (see §7). Semantic names (`whisper`, `soft_card`, `ring`, `ambient`, …) vary per system and values are **raw CSS strings**. The parser validates only that each value is a string — no CSS parsing, no contrast check, no grid check.

### 4.7 `## Do's and Don'ts`

**Content:** Two lists — `do` and `don't`.

**Maps to:** `tokens.yaml.constraints.do`, `tokens.yaml.constraints.dont`.

**Format (flat):**
```markdown
## Do's and Don'ts

### Do
- Use warm neutrals throughout — #f6f5f4, #615d59, #a39e98 — never cool grays
- Build multi-layer shadow stacks with sub-0.05 opacity for soft elevation
- Reserve Notion Blue (#0075de) as the singular accent color for CTAs and links

### Don't
- Never use cold blue-grays — all neutrals must be warm-toned
- Never use heavy shadows — max individual layer opacity is 0.05
- Never use Notion Blue decoratively — it is strictly interactive/CTA
```

**Format (Figmento-tagged, optional extension):**
```markdown
## Do's and Don'ts

### Do
- **typography:** Use weight 600 for emphasis, 700 for headings
- **color:** Reserve Notion Blue (#0075de) exclusively for CTAs and links
- **layout:** Build on the 8px grid, never break alignment

### Don't
- **color:** Never use cold blue-grays
- **typography:** Never use weight 800+
```

The **category prefix** (`typography:` / `color:` / `layout:` / `motion:`) is a **Figmento extension** — optional, additive, preserved verbatim on round-trip. Importer tolerates both tagged and untagged bullets. Exporter preserves whatever form was imported.

### 4.8 `## Responsive Behavior`

**Content:** Prose.

**Maps to:** No direct `tokens.yaml` field in v1.0. Informational.

**v1.0 policy:** this section is preserved as opaque prose on round-trip but does not drive any runtime behavior. Figmento's multi-format awareness lives in the [Format Variants extension](#5-format-variants-figmento-extension), not here.

**v2 upgrade path:** may formalize responsive breakpoints into a ` ```breakpoints` fenced block.

### 4.9 `## Agent Prompt Guide`

**Content:** Prose — guidance for LLM agents consuming this DESIGN.md.

**Maps to:** No direct `tokens.yaml` field. Informational only.

This section tells LLMs *how to use* the design system when generating UI. Examples:
- "Always pair Inter body with Cormorant Garamond headlines."
- "Reserve accent color for CTAs only."
- "Headlines must be at minimum 40px on mobile."

Figmento preserves this section on round-trip but does not execute on it directly — it's consumed by *other* AI tools (Cursor, Claude Desktop, Cline) that read the DESIGN.md as context. Figmento's own design generation uses the structured fenced-block data, not this prose.

---

## 5. Format Variants (Figmento Extension)

**Content:** Optional — only present when the system has per-format overrides.

**Maps to:** `tokens.yaml.format_variants` (new field introduced by DMD-1).

**Format:**
```markdown
## Format Variants

- **instagram_post**:
  min_font_size: 32
  margin: 80
  headline_scale: 1.2
- **a4_brochure**:
  min_font_size: 10
  margin: 48
- **landing_hero**:
  headline_scale: 1.5
  min_vertical_padding: 96
```

**Purpose:** a single design system often needs to behave differently across target formats — Instagram posts want larger minimum fonts and heavier margins; A4 brochures tolerate smaller bodies; landing heroes want outsized display headlines. None of the 50+ existing awesome-design-md files think multi-format. This is Figmento's extension, not upstream's.

**Behavior:** the MCP runtime applies format variant overrides on top of the base tokens when a design is created for a specific format (e.g., `create_design(format="instagram_post")`). Overrides are additive and scoped — they never override the base tokens for other formats.

**Tolerance:** files without this section are valid. The exporter emits the section only when `tokens.yaml.format_variants` is non-empty.

---

## 6. Fenced-Block Language Reference

The fenced-block convention is the core machine-parseability mechanism. Each block has:
- A **language hint** that appears after the opening triple-backtick (e.g., ` ```color`)
- A **YAML body** inside the fences
- A **structural pattern** from one of three categories: **fixed-key**, **open-map**, or **structured-conditional**

`marked`'s lexer surfaces each fenced block as `{type: 'code', lang: '<language>', text: '<body>'}` — no custom parser or regex needed.

### 6.1 Pattern Categories

**Fixed-key** blocks have a closed set of allowed keys. Unknown keys produce a `MEDIUM` validation warning. Used for: `spacing`, `radius`, `shadow`.

**Open-map** blocks accept any string keys. Canonical keys are **recommended** but not required, and additional keys are preserved verbatim. Used for: `color`, `type-scale`, `letter-spacing`.

**Structured-conditional** blocks have a known internal structure with optional branches (e.g., gradients only have `direction`/`colors` when `enabled: true`). Used for: `font-family`, `gradient`.

### 6.2 The 9 Languages

| # | Language | Pattern | Canonical keys | Values | Maps to |
|:-:|---|---|---|---|---|
| 1 | ` ```color` | **open-map** | 15 (primary, primary_light, primary_dark, secondary, accent, surface, background, border, on_primary, on_surface, on_surface_muted, success, warning, error, info) | CSS color string (`#hex`, `rgba()`, `rgb()`, `hsla()`) | `tokens.yaml.colors` |
| 2 | ` ```font-family` | **structured-conditional** | `heading`, `body`, `mono?`, `opentype_features?`, `tabular_features?` | each role: `{family, figma_fallback?, fallback?, weights: number[]}` | `tokens.yaml.typography.{heading,body,mono,opentype_features,tabular_features}` |
| 3 | ` ```type-scale` | **open-map** | display, h1, h2, h3, heading, body_lg, body, body_sm, caption, label | number (pixels) | `tokens.yaml.typography.scale` |
| 4 | ` ```letter-spacing` | **open-map** | same keys as type-scale | string (`"-1.58px"` or `"normal"`) | `tokens.yaml.typography.letter_spacing` |
| 5 | ` ```spacing` | **fixed-key** | unit, xs, sm, md, lg, xl, 2xl, 3xl | number (pixels) | `tokens.yaml.spacing` |
| 6 | ` ```radius` | **fixed-key** | none, sm, md, lg, xl, full | number (pixels) | `tokens.yaml.radius` |
| 7 | ` ```shadow` | **fixed-key** | sm, md, lg (each a structured object) | `{x, y, blur, spread, color, opacity}` per level | `tokens.yaml.shadows` |
| 8 | ` ```elevation` | **open-map (opaque)** | free (system-specific: `flat`, `whisper`, `soft_card`, `ring`, …) | `{shadow: string, background?: string, border?: string}` — **raw CSS strings, pass-through** | `tokens.yaml.elevation` |
| 9 | ` ```gradient` | **structured-conditional** | `enabled`, `direction?`, `colors?`, `note?` | `{enabled: boolean, direction?: string, colors?: string[], note?: string}` | `tokens.yaml.gradients` |

### 6.3 Why YAML Inside Fences, Not JSON or Custom DSL

Four reasons, in order of weight:

1. **`js-yaml` is already a dependency.** Zero new parser surface.
2. **YAML is human-readable** — designers author DESIGN.md by hand and YAML's indented key:value form is friendlier than JSON's braces and quotes.
3. **Round-trip fidelity** — `tokens.yaml` is YAML. Emitting YAML inside fences means the exporter can pipe structured sub-trees straight through without JSON↔YAML impedance.
4. **LLMs emit YAML reliably in fenced blocks** when given a language hint. Empirically observed across Claude, GPT-4, Gemini — far more reliable than JSON-in-fence for nested structures.

---

## 7. Deliberate Trade-offs

### 7.1 Elevation as Opaque CSS Pass-through

**Problem:** the 6 systems that ship with `elevation` in `tokens.yaml` store values as **raw CSS shadow strings**, often multi-layer composites. Examples from the audit:

```yaml
# notion/tokens.yaml
soft_card:
  shadow: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px'

# linear/tokens.yaml
dialog:
  shadow: 'rgba(0,0,0,0) 0px 8px 2px, rgba(0,0,0,0.01) 0px 5px 2px, rgba(0,0,0,0.04) 0px 3px 2px, rgba(0,0,0,0.07) 0px 1px 1px, rgba(0,0,0,0.08) 0px 0px 1px'

# vercel/tokens.yaml
full_card:
  shadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px'
```

**Three options were considered:**

| Option | Description | Trade-off | Verdict |
|---|---|---|---|
| A | `​```elevation` stores raw CSS strings verbatim | Round-trip safe, LLM-friendly, parser-trivial. **No** contrast validation, **no** color-token-reference validation, **no** spacing-grid validation | ✅ **Chosen** |
| B | Parse CSS strings into structured `[{x, y, blur, spread, color, opacity, inset?}]` layer arrays | Enables validation. Fragile on exotic CSS (`inset`, ring shadows, `#fafafa` as a ring layer, comma-in-function edge cases). Would block DMD-5 round-trip validation on day one | ❌ Rejected |
| C | Restrict elevation to a hex+opacity subset, reject exotic CSS at validate time | Most rigorous. Would **fail** on 3 of 6 existing systems (linear, notion, vercel) — breaking DMD-5 before it starts | ❌ Rejected |

**Chosen:** Option A. The `​```elevation` block is an **opaque CSS pass-through**. The schema validates only that each entry has a `shadow` field of type `string`, plus optional `background` and `border` strings. No structural parsing happens inside elevation values.

**What this costs Figmento:**
- No automatic contrast validation on elevation colors.
- No automatic detection of "this shadow references a color that no longer exists in `tokens.yaml.colors`".
- No automatic spacing-grid alignment check on shadow offsets.

**What this buys Figmento:**
- Byte-identical round-trip for all 6 existing systems from day one.
- Zero schema-v2 risk from structural-parser failures on unknown CSS forms.
- DMD-5 validation gate becomes achievable without further spec iteration.

**Upgrade path to schema v2:** a future version may introduce a second, structured elevation representation alongside the pass-through form — e.g., `​```elevation-structured` with layer arrays. The existing `​```elevation` block remains the canonical format for interop. The two representations are not allowed to coexist on the same key — round-trip picks one and sticks with it.

### 7.2 Component Styling as Prose Only

The `## Component Stylings` section is prose-only in v1.0. Component recipes (the structural definitions for `create_component(kind="button")`, etc.) live in TypeScript at [`ds-components.ts`](../../figmento-mcp-server/src/tools/design-system/ds-components.ts) and are out of scope for DMD-1. A v2 schema may introduce a ` ```component` fenced-block DSL when there's a concrete authoring need — not before.

### 7.3 Untagged Constraints Are Valid

The Figmento extension for category-tagged Do's and Don'ts (e.g., `**typography:** …`) is **optional**. All 6 existing systems ship with flat, untagged constraint lists. The importer preserves whatever form it encounters; the exporter emits whatever was imported. No normalization.

---

## 8. Coverage Table — `tokens.yaml` Field → DESIGN.md Location

This table maps every field present in any of the 7 seeded `tokens.yaml` files (aurelia, claude, figma, linear, notion, stripe, vercel) to its destination in DESIGN.md. Compiled from the DMD-1 Task 1 audit, 2026-04-15.

| `tokens.yaml` field | DESIGN.md location | Notes |
|---|---|---|
| `name` | Frontmatter `name` | Required |
| `created` | Frontmatter `created` | Required |
| `source` | Frontmatter `source_url` | Optional; absent in aurelia |
| `preset_used` | Frontmatter `preset_used` | Optional; `null` valid |
| `mood` | `## Visual Theme & Atmosphere` (bullet list or `**Mood**:` line) | Required section |
| `voice` | `## Visual Theme & Atmosphere` (prose body) | Required section |
| `colors.*` (canonical 15) | `## Color Palette & Roles` → ` ```color` block | Open-map; canonical keys recommended |
| `colors.*` (extended — 0 to 18 per system) | `## Color Palette & Roles` → ` ```color` block | Preserved verbatim; any freely-named key |
| `typography.heading.{family, figma_fallback, fallback, weights}` | `## Typography Rules` → ` ```font-family` block | Structured |
| `typography.body.{family, figma_fallback, fallback, weights}` | `## Typography Rules` → ` ```font-family` block | Structured |
| `typography.mono.{family, figma_fallback, fallback, weights}` | `## Typography Rules` → ` ```font-family` block | Optional (missing in aurelia, notion) |
| `typography.opentype_features` | `## Typography Rules` → ` ```font-family` block (sibling) | Optional string array |
| `typography.tabular_features` | `## Typography Rules` → ` ```font-family` block (sibling) | Optional string array (stripe, vercel only) |
| `typography.scale.*` (open) | `## Typography Rules` → ` ```type-scale` block | Open-map; canonical 10 keys recommended |
| `typography.letter_spacing.*` (open) | `## Typography Rules` → ` ```letter-spacing` block | Optional; absent in aurelia |
| `spacing.{unit, xs, sm, md, lg, xl, 2xl, 3xl}` | `## Layout Principles` → ` ```spacing` block | Fixed-key |
| `radius.{none, sm, md, lg, xl, full}` | `## Layout Principles` → ` ```radius` block | Fixed-key |
| `shadows.sm.{x, y, blur, spread, color, opacity}` | `## Depth & Elevation` → ` ```shadow` block | Structured fixed-key |
| `shadows.md.*` | `## Depth & Elevation` → ` ```shadow` block | Structured fixed-key |
| `shadows.lg.*` | `## Depth & Elevation` → ` ```shadow` block | Structured fixed-key |
| `elevation.*.{shadow, background?, border?}` | `## Depth & Elevation` → ` ```elevation` block | **Opaque CSS pass-through** (see §7.1) |
| `gradients.enabled` | `## Color Palette & Roles` → ` ```gradient` block | Always present |
| `gradients.direction` | ` ```gradient` block | Optional (only when enabled) |
| `gradients.colors[]` | ` ```gradient` block | Optional (only when enabled) |
| `gradients.note` | ` ```gradient` block | Optional (only figma has this) |
| `constraints.do[]` | `## Do's and Don'ts` → `### Do` list | Optional; absent in aurelia |
| `constraints.dont[]` | `## Do's and Don'ts` → `### Don't` list | Optional; absent in aurelia |
| `format_variants.*` | `## Format Variants` (Figmento extension) | New field introduced by DMD-1; not yet present in any seeded system |

**Coverage score: 100%.** Every field observed in any of the 7 `tokens.yaml` files has a documented DESIGN.md destination.

---

## 9. Non-Representable Fields

**None.** The DMD-1 audit confirmed that every runtime field across all 7 seeded systems can be represented in DESIGN.md using the structures defined in §4–§6.

**Sections in the spec that have no legacy runtime data:**

- `## Component Stylings` — prose only in v1.0, no `tokens.yaml` field; future `​```component` DSL is deferred to v2.
- `## Responsive Behavior` — prose only in v1.0, no `tokens.yaml` field; `## Format Variants` (Figmento extension) serves the current multi-format need instead.
- `## Agent Prompt Guide` — prose only, consumed by external AI tools; Figmento preserves verbatim but does not execute.

On export, these three sections are emitted with an `_not specified_` placeholder when no content is available, ensuring byte-identical round-trip even for systems that never authored those sections.

---

## 10. Upstream Tolerance Contract

A plain [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) file — with **no frontmatter**, **no fenced blocks**, **no Figmento extensions**, just the 9 H2 sections with prose content — **must validate and import successfully**. This is non-negotiable.

**Validation verdict mapping:**

| File shape | Verdict | Reason |
|---|---|---|
| Full Figmento-extended DESIGN.md (frontmatter + fenced blocks + all 9 sections) | `PASS` | Ideal case |
| Plain upstream DESIGN.md (9 sections, prose only, no fences, no frontmatter) | `CONCERNS` | All runtime fields get **defaults** — importer infers `name` from filename, extracts colors from prose by regex, runs vision-based palette extraction if prose is too sparse |
| Missing one or more of the 9 sections | `CONCERNS` | Absent sections get `_not specified_` placeholders |
| Missing BOTH `## Color Palette & Roles` AND `## Typography Rules` | `FAIL` | At least one of these must exist to produce a usable system; otherwise the importer has nothing to hand to the runtime |
| Malformed fenced block (unparseable YAML body inside a fence) | `FAIL` (that block only) | The block is rejected; other valid blocks in the same file still import |
| Invalid hex in `​```color` block | `HIGH` warning, verdict `CONCERNS` | The invalid entry is dropped; other entries import |
| Unknown fenced-block language hint | `MEDIUM` warning, block ignored | Future-proofing for v2 additions |

**Default substitution table** (when fields are missing from a plain upstream file):

| Missing field | Default |
|---|---|
| Frontmatter `name` | Inferred from filename (e.g., `notion/DESIGN.md` → `notion`) |
| Frontmatter `created` | Import timestamp |
| Frontmatter `source_url` | GitHub URL from which the file was imported (if the caller provides one), else `null` |
| Frontmatter `preset_used` | `null` |
| `​```spacing` block | `{unit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, 2xl: 48, 3xl: 64}` (Figmento default 8px grid) |
| `​```radius` block | `{none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999}` |
| `​```shadow` block | Synthesized from prose description; falls back to `none` shadows if indeterminate |
| `​```elevation` block | Empty object `{}` |
| `​```gradient` block | `{enabled: false}` |
| `constraints.do` / `constraints.dont` | Extracted from `### Do` / `### Don't` bullet lists if present, else empty arrays |

This is what makes Figmento a first-class citizen of the awesome-design-md ecosystem rather than a walled garden.

---

## 11. Versioning

The frontmatter `version` field is reserved for **schema** versioning (v1, v2, …), not content versioning. When Figmento introduces a schema v2, the parser branches on `version`:

```typescript
// DMD-2 (future schema v2 branch)
const frontmatter = parseFrontmatter(md);
const parserVersion = frontmatter.schema_version ?? '1.0';  // default to v1
if (parserVersion.startsWith('1.')) parseV1(md);
else if (parserVersion.startsWith('2.')) parseV2(md);
else throw new Error(`Unknown schema version: ${parserVersion}`);
```

**v1 → v2 migration candidates** (noted here, not scheduled):

- Structured ` ```component` fenced-block DSL for Component Stylings
- Structured ` ```breakpoints` block for Responsive Behavior
- Alternative structured elevation representation alongside opaque pass-through
- Stronger validation for `​```elevation` values (optional, not default)

v1 stays stable — migration is additive, not breaking.

---

## 12. Worked Example

Minimal valid DESIGN.md at the `PASS` tier. Full examples live under [`figmento-mcp-server/knowledge/design-systems/{notion,aurelia,claude}/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/) after DMD-1 Tasks 4–6 ship.

```markdown
---
name: minimal-example
version: 1.0.0
created: 2026-04-15T00:00:00.000Z
preset_used: null
---

## Visual Theme & Atmosphere

Clean, modern, unopinionated. A neutral starting point.

**Mood**: minimal, clean, neutral

## Color Palette & Roles

Single brand color on a light surface. No extended palette.

​```color
primary: "#2563eb"
primary_light: "#60a5fa"
primary_dark: "#1e40af"
secondary: "#64748b"
accent: "#2563eb"
surface: "#ffffff"
background: "#f8fafc"
border: "#e2e8f0"
on_primary: "#ffffff"
on_surface: "#0f172a"
on_surface_muted: "#64748b"
success: "#16a34a"
warning: "#eab308"
error: "#dc2626"
info: "#2563eb"
​```

## Typography Rules

Inter for everything. Three-weight system.

​```font-family
heading:
  family: "Inter"
  fallback: "system-ui, sans-serif"
  weights: [600, 700]
body:
  family: "Inter"
  fallback: "system-ui, sans-serif"
  weights: [400, 500]
​```

​```type-scale
display: 48
h1: 36
h2: 28
h3: 22
heading: 18
body_lg: 18
body: 16
body_sm: 14
caption: 12
​```

## Component Stylings

Rounded rectangles, soft shadows, no pill buttons.

## Layout Principles

8px grid throughout.

​```spacing
unit: 8
xs: 4
sm: 8
md: 16
lg: 24
xl: 32
2xl: 48
3xl: 64
​```

​```radius
none: 0
sm: 4
md: 8
lg: 12
xl: 16
full: 9999
​```

## Depth & Elevation

Single-layer soft shadows.

​```shadow
sm:
  x: 0
  y: 1
  blur: 2
  spread: 0
  color: "rgba(0,0,0,0.05)"
  opacity: 1
md:
  x: 0
  y: 4
  blur: 8
  spread: -2
  color: "rgba(0,0,0,0.08)"
  opacity: 1
lg:
  x: 0
  y: 8
  blur: 24
  spread: -4
  color: "rgba(0,0,0,0.12)"
  opacity: 1
​```

## Do's and Don'ts

### Do
- Use the 8px grid for all spacing
- Reserve #2563eb for interactive elements

### Don't
- Never use pure black for text
- Never mix fonts beyond Inter

## Responsive Behavior

Mobile-first. Breakpoints at 640 / 768 / 1024 / 1280.

## Agent Prompt Guide

When generating UI with this system, prefer 16px body and 8px-grid spacing. Use the primary color sparingly — only for CTAs and active states.
```

This validates at `PASS` and imports into `tokens.yaml` losslessly.

---

## 12.5 Validating a DESIGN.md File

Until DMD-3 ships the `validate_design_md` MCP tool, the canonical validation path is the Node utility produced during DMD-1 Task 4:

```bash
# From figmento-mcp-server/
node scripts/validate-design-md-sample.js <system-name>
```

The script performs three things:

1. **Mini-parse** (preview of DMD-2's real parser): extracts frontmatter via `js-yaml`, walks H2 headings to identify the 9 canonical sections, extracts fenced blocks by `lang` hint, parses each block body as YAML, and assembles an intermediate representation (IR).
2. **Schema validation**: compiles [`design-md.schema.json`](../../figmento-mcp-server/schemas/design-md.schema.json) with `ajv@8 + ajv-formats@3` in strict mode, runs the IR through it.
3. **Coverage check**: if a sibling `tokens.yaml` exists in the same directory, verifies that every runtime field is present in the parsed IR.

**Expected output for a passing file:**

```
─── DMD-1 sample validator: <name> ───

─── Parsed IR summary ───
Frontmatter keys: name, version, created, source_url, preset_used, schema_version
Sections found: visual_theme_atmosphere, color_palette_roles, typography_rules, ...

─── Schema validation ───
Result: PASS — parses to a valid IR

─── Coverage check (tokens.yaml → IR) ───
OK name: "<name>"
OK colors.primary: "#..."
...

Coverage: N/N tokens.yaml fields present in IR
PASS — <name> DESIGN.md round-trips cleanly
```

**What DMD-2 should mirror:** the parser logic in the script's `parseDesignMd()` function is the reference implementation. DMD-2 will likely refactor it to use `marked@^12`'s lexer (producing a richer token stream than the current regex-based extraction), but the section-walking, fenced-block-by-lang-hint, and JSON-normalization (Date → ISO string) behaviors should be preserved. The 3 DMD-1 sample files (notion, aurelia, claude) serve as DMD-2's regression suite.

---

## 13. Open Questions & Deferred Decisions

Flagged here for future iterations — **none block DMD-1 completion**:

1. **Format Variants runtime behavior.** DMD-1 defines the section and its mapping to `tokens.yaml.format_variants`. How the MCP runtime *applies* those overrides at design time is left to a separate epic.
2. **Component Stylings DSL.** Deferred to schema v2. When authored in v1, it's prose-only and does not drive runtime component generation.
3. **Breakpoint authoring.** The `## Responsive Behavior` section accepts prose today. Structured breakpoint authoring is deferred to v2.
4. **Export canonicalization.** DMD-4 will need to pick a canonical key order for each fenced block to guarantee byte-identical round-trip (DMD-5). That ordering convention is documented in DMD-4's story, not here — it's a tool-level concern, not a spec-level one.

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-04-15 | 1.0 draft | Initial spec drafted from DMD-1 Task 2. Covers frontmatter + 9 canonical sections + Format Variants extension + 9 fenced-block languages + coverage table + tolerance contract + elevation trade-off rationale. Aligns with epic-DMD amendments from the same day (4→9 fenced-block expansion). | @architect (Aria) |
