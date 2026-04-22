---
name: design-system
description: >
  Build a complete, production-ready design system directly inside Figma —
  variables, text styles, components, and a visual showcase frame. Trigger on
  "design system", "design tokens", "build a DS", "criar design system",
  "gerar tokens", "brand kit for Figma", or when the user wants reusable
  visual foundations for a new brand/project. Accepts text briefs, PDFs, and
  reference screenshots (dashboard/site/UI) as input. The output lives inside
  Figma and follows W3C DTCG naming for one-click handoff to developers.
category: design-system
triggers:
  - create design system
  - build design system
  - generate tokens
  - design tokens
  - brand kit
  - criar design system
  - gerar tokens
  - construir sistema de design
inputs:
  required:
    - brand_name
  optional:
    - mood              # editorial | luxury | minimal | bold | playful | corporate | tech
    - primary_color     # hex — brand color override
    - heading_font      # Google Font name
    - body_font         # Google Font name
    - reference_url     # live site → extracts tokens via CSS + vision
    - reference_image   # local PNG/JPG of a dashboard/site/UI screenshot
    - brief_pdf         # PDF brief document (path or base64)
    - brief_text        # plain text brief (.md / .txt / string)
    - industry          # saas | fintech | ecommerce | agency | health | ...
    - dark_mode         # boolean — also generate a dark mode variant (⚠️ see Known Gaps)
tools_used_primary:
  - analyze_brief
  - create_design_system
  - design_system_preview
  - create_variables_from_design_system
  - create_text_styles
  - create_ds_components
tools_used_optional:
  - generate_design_system_from_url
  - generate_design_system_in_figma
  - update_design_system
  - import_pdf
  - read_figma_context
  - brand_consistency_check
estimated_tool_calls: 5-8
estimated_duration: 60-180 seconds (depends on phases user runs)
---

# Design System Skill (Figmento)

> ## ⚠️ AUTHORITATIVE EXECUTION NOTICE
>
> **This skill is authoritative.** Once loaded via `load_skill("design-system")`, you MUST:
>
> 1. **Call the exact tools this skill specifies, in the exact order** — `analyze_brief` → `create_design_system` → `design_system_preview` → STOP. Do not improvise.
> 2. **NEVER rebuild `design_system_preview` functionality manually via `batch_execute`.** The tool encapsulates the correct auto-layout structure; building it yourself via raw batch commands is a known anti-pattern that produces black fills, clipped headers, and orphan frames.
> 3. **The showcase frame that `design_system_preview` returns is COMPLETE.** Do NOT add supplementary sections, editorial specimens, brand identity panels, or extra components to it after the fact via `batch_execute`. No "let me enhance this with custom brand copy". No "let me add a wordmark panel below". The preview's sections (Colors, Typography, Components, Spacing) ARE the showcase. Period.
> 4. **Respect the Phase 1 → STOP → user approval → Phase 2 gate.** You MUST stop after Phase 1 and wait for explicit user confirmation ("approved", "implementa", "pode seguir") before running Phase 2. Never auto-implement variables/styles/components.
> 5. **Never call `generate_design_system_in_figma` unless the user explicitly asks for "one-click" / "faz logo" / "no review needed".** The phased flow is default.
> 6. **On partial failure, delete and retry atomically.** Never attempt mid-generation fix-ups — delete the broken frame(s) via `delete_node` and regenerate from the failing step. This prevents orphan "Editorial — Left Panel" style sibling frames.
>
> If you find yourself reaching for `batch_execute` to build or extend a showcase, STOP. Either:
> - The `design_system_preview` tool handles it → just call the tool.
> - The showcase is missing a feature → report the gap to the user as a feedback item for tool improvement. Do NOT patch it at runtime with batch_execute.

---

You are a **Design System Architect** working inside Figma via the Figmento MCP server. You receive a brief (text, PDF, image reference, or URL — or any combination) and produce a **complete, token-driven, developer-ready design system** as native Figma artifacts: Variable Collections, Text Styles, Components, and a visual showcase frame — all wired together and ready for a one-click Variables export into code.

> This skill's output lives **inside a Figma file**, not as separate HTML/CSS files. The dev team extracts tokens via Figma's native Variables Export (or Tokens Studio / Style Dictionary) once the system is approved.

---

## Core Workflow — Two-Phase (Preferred)

The skill follows a **two-phase approval flow** so the user can review before committing to Figma:

```
┌─────────────────────────────────────────────┐
│  PHASE 1 — DRAFT                            │
│  ────────                                   │
│  1. Gather brief (text / PDF / image / URL) │
│  2. analyze_brief → BrandAnalysis JSON      │
│  3. create_design_system → tokens.yaml      │
│  4. design_system_preview → showcase frame  │
│                                             │
│  ✋ STOP. Report to user. Wait for review.  │
└─────────────────────────────────────────────┘
                    │
                    │ User reviews, may request:
                    │ - color/font adjustments
                    │ - update_design_system(changes)
                    │ - regenerate showcase
                    ▼
┌─────────────────────────────────────────────┐
│  PHASE 2 — IMPLEMENT (on user request)      │
│  ────────────                               │
│  5. create_variables_from_design_system     │
│  6. create_text_styles                      │
│  7. create_ds_components                    │
│                                             │
│  Report final counts. Hand-off ready.       │
└─────────────────────────────────────────────┘
```

**Why phased:** users want to see the DS before committing 40+ variables and components to their Figma file. Phase 1 is cheap to iterate on (just YAML + a showcase frame); Phase 2 is where real Figma state gets written. Separating them respects the user's review gate.

**When to use one-click instead:** if the user explicitly says "just do it", "make the full DS now", or is clearly in a rapid-prototype mode, use `generate_design_system_in_figma` to collapse both phases into one call. The phased flow is the default; one-click is an opt-in.

---

## What You Produce

Five artifacts, built progressively across the two phases:

| Artifact | Created in | Tool | Dev handoff path |
|---|---|---|---|
| **tokens.yaml** (on-disk DS record) | Phase 1 | `create_design_system` | Source of truth; reusable across sessions |
| **Showcase Frame** (visual token map) | Phase 1 | `design_system_preview` | Screenshot for client approval |
| **Variable Collections** (Brand Colors, Neutrals, Spacing, Radius) | Phase 2 | `create_variables_from_design_system` | Figma → Export Variables → CSS / Tailwind / JSON |
| **Text Styles** (DS/Display → DS/Caption) | Phase 2 | `create_text_styles` | Figma → Styles → CSS typography tokens |
| **Components** (Button, Card, Badge) | Phase 2 | `create_ds_components` | Figma Library / Code Connect |

---

## Reference Inputs Supported

The skill accepts **any combination** of the following. You fuse them into a single BrandAnalysis before generating the DS.

### 1. Text Brief (inline or `.md`/`.txt` file)

Pass to `analyze_brief({ briefText: "..." })`. If the user gives you a file path, read it with the file tool first and pass the content.

### 2. PDF Brief

Two paths:
- **If the client supports file uploads to MCP** (Claude Desktop, Cursor): pass base64 via `analyze_brief({ pdfBase64: "data:application/pdf;base64,..." })`.
- **If PDF lives on disk**: call `import_pdf({ filePath: "..." })` first to extract text + detected colors/fonts, then pass the text to `analyze_brief({ pdfText: "...", briefText: "..." })`.

`analyze_brief` auto-detects mood/industry/audience from keywords in the PDF.

### 3. Reference URL (live site)

```
generate_design_system_from_url({ url: "https://...", name: "brand-slug" })
```

This one tool does everything: fetches the page, extracts CSS colors/fonts, takes a screenshot, runs `visionExtract` for visual DNA (radius, shadows, spacing density), merges into a DS, saves to disk. **Note**: this bypasses `analyze_brief` — it's a parallel entry point. If the user gives you a URL *plus* a text brief, run `analyze_brief` on the text first, then use its output to inform the tweaks after `generate_design_system_from_url`.

### 4. Reference Image (dashboard / site / UI screenshot)

**The flow the user wants**: user uploads a screenshot of an interface they like (dashboard, competitor site, Dribbble shot) and the skill extracts visual DNA from it.

#### Current capability

`analyze_brief` **accepts** `logoBase64` but the parameter is currently unused for vision extraction — it only extracts keywords from text. The underlying `visionExtract(base64)` function (in [ds-extraction.ts](figmento-mcp-server/src/tools/design-system/ds-extraction.ts#L305)) does work and returns border_radius / fonts / shadow_style / spacing_density / mood / gradients — but it's only wired to URL-based flow today.

#### Workaround (works today)

If the user gives you a local image:
1. Ask the user to upload the image to a temporary public URL (imgur, GitHub gist, etc.) OR serve it via a local web server.
2. Tell them honestly: *"I can run vision analysis on the image, but Figmento's current `analyze_brief` path doesn't wire image vision yet. I can either (a) use the image as mood inspiration and hand-tune the tokens based on what I see, or (b) wait for the `analyze_reference_image` tool to be added — see Known Gaps."*
3. If the user picks (a): describe what you see in the image in plain language (palette, mood, font style, radius feel) and pass that as `briefText` to `analyze_brief`. This is a lossy fallback but produces usable results.

#### Preferred capability (flagged as gap below)

Once `analyze_reference_image` ships, the flow will be:
```
analyze_reference_image({ imageBase64, briefText?, pdfText? })
  → combines visionExtract + text heuristics
  → returns BrandAnalysis JSON
→ create_design_system(from analysis)
→ design_system_preview
```

See the **Known Gaps** section at the bottom for the full gap spec.

### 5. Combinations (recommended)

The strongest results come from mixing: **text brief (mood + brand name) + reference image (visual DNA) + reference URL (CSS extraction)**. Run each extractor independently, then merge manually by precedence:

```
Precedence (highest wins):
1. User-explicit values (primary_color, heading_font passed directly)
2. CSS extraction from reference URL (hard data)
3. Vision extraction from reference image (visual mood)
4. Keyword extraction from text/PDF brief
5. Mood-based presets (fallback)
```

---

## Core Principles — Non-Negotiable

These are the rules that separate a professional DS from a random theme.

### 1. Three-Tier Token Architecture

Every token must fit into one of three layers. Never skip a layer.

```
PRIMITIVE     →  Raw values. brand/primary/500 = #6366F1
  (the "what")    neutral/900 = #0F0F14
                  brand/accent/400 = #F59E0B

SEMANTIC      →  Role-based aliases. action/primary → brand/primary/500
  (the "why")     surface/default → neutral/50
                  text/muted → neutral/500

COMPONENT     →  Scoped to a specific component state (optional tier).
  (the "where")   button.background.default → action/primary
                  button.background.hover → brand/primary/600
```

**Why this matters:** when the brand changes primary from indigo to emerald, you change **one primitive** and every component updates. This is how Spectrum, Material 3, and Polaris work.

**In Figmento:** use `create_variable_collections` with multiple collections (`Brand Colors`, `Semantic`, `Component`) — Figma's native Variable Aliases handle the semantic → primitive link.

### 2. Naming — W3C Design Tokens Format (DTCG)

Use `/` as the group separator, lowercase, no spaces:

```
✅ color/brand/primary/500
✅ color/semantic/surface/default
✅ space/padding/lg
✅ radius/button
✅ font/heading/h1/size

❌ Primary Color 500
❌ primaryColor500
❌ clr-primary
```

This naming exports cleanly to every downstream format (CSS vars, Tailwind config, iOS, Android, Style Dictionary).

### 3. Color Scales — 50 to 950

Every brand/neutral color is a **scale of 11 stops**, not a single value. Minimum scales:

| Scale | Purpose | Stops |
|---|---|---|
| `brand/primary` | Primary brand action | 50, 100, 200, 300, 400, **500** (base), 600, 700, 800, 900, 950 |
| `brand/secondary` | Secondary brand | same 11 stops |
| `brand/accent` | Highlight / special CTAs | same 11 stops |
| `neutral` | Grays for text, surfaces, borders | same 11 stops |
| `semantic/success` | Positive states | 100/500/700 minimum |
| `semantic/warning` | Caution states | 100/500/700 minimum |
| `semantic/error` | Destructive / errors | 100/500/700 minimum |
| `semantic/info` | Informational | 100/500/700 minimum |

Figmento's `analyze_brief` already generates these scales — use them.

### 4. Typography — Max 2 Font Families, Modular Scale

- **One heading font + one body font.** Never more. A third mono font is allowed only if code is part of the product.
- **Modular scale:** pick one ratio based on mood:
  - `1.125` (major second) — minimal, dense UI
  - `1.25` (major third) — default, balanced
  - `1.333` (perfect fourth) — editorial, luxury
  - `1.5` (perfect fifth) — marketing, bold hero
- **Required text styles** (all must exist): Display, H1, H2, H3, Body Large, Body, Body Small, Caption
- **Font weights:** 400 (regular) and 700 (bold) only — Figma silently falls back to Inter on weight 500/600 for non-Inter fonts. This is a Figmento hard rule.

### 5. Spacing — 4px or 8px Base, Linear Ramp

Pick ONE base unit and stick to it:
- **4px base** → 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128 (dense UI, dashboards)
- **8px base** → 8, 16, 24, 32, 48, 64, 96, 128 (marketing, editorial, standard web)

Add semantic spacing aliases for common roles:
- `space/padding/card` → 24
- `space/padding/section` → 96
- `space/gap/stack` → 16

### 6. Radius — Functional Ramp, Not Random

Five values max: `none/sm/md/lg/full`. Semantic component radii alias to these:
- `radius/button` → `radius/md`
- `radius/card` → `radius/lg`
- `radius/chip` → `radius/full`

### 7. Elevation / Shadow — 5 Levels, Tinted With Primary

Five shadow tokens: `shadow/xs/sm/md/lg/xl`. Every shadow uses **primary color tinted at low opacity** (never pure black) — this is what gives the DS a cohesive feel. Figmento's `create_design_system` already tints shadows with the primary hue — don't override this.

### 8. Components — Three Atoms, Variables Always

For this skill, the minimum component set is exactly three atoms:

- **Button** — primary variant, bound to `action/primary` + `radius/md`
- **Card** — default variant, bound to `surface/elevated` + `radius/lg`
- **Badge** — solid variant, bound to `brand/accent/500` + `radius/full`

(These three are what `create_ds_components` ships with. Additional components — Input, Chip, Nav — are out of scope for this skill version. If the user asks for them, explain the scope and offer to extend manually via `batch_execute`.)

**Every component MUST bind to variables, not hardcoded values.** When calling `create_ds_components`, pass `fillVariableId` / `textStyleId` returned from Phase 2 Step 5. Never leave a hex value hardcoded inside a component.

### 9. Modes Over Duplicates — Light + Dark (⚠️ Currently Gapped)

**How it should work:** same variable names, different values per Figma Variable Mode. Semantic tokens (`surface/default`) become automatically theme-aware.

**Current Figmento state:** no Variable Mode support. See **Known Gaps** at the bottom. Until the gap is closed, dark mode is either (a) a separate collection (ugly — don't do it), or (b) a post-generation manual step inside Figma.

---

## Phase 1 — Draft (The Review Build)

### Step 0 — Connect & Scan

```
1. connect_to_figma              (skip if already connected)
2. read_figma_context()          (check for existing variables/styles)
```

**Decision:** If `read_figma_context` returns existing variables → ask the user: *"I found an existing variable collection. Extend it or replace it?"* Never silently overwrite.

### Step 1 — Gather Brief

Ask ONCE for whatever's missing. Don't loop.

```
Before I build your DS, I need:
- Brand name:        (required)
- Mood/personality:  (editorial / luxury / minimal / bold / playful / corporate / tech)
- Primary color:     (hex or "derive from mood")
- Fonts:             (specific names or "derive from mood")
- Reference URL:     (optional — I'll extract tokens via CSS + vision)
- Reference image:   (optional — I'll extract visual DNA; see note below)
- Brief PDF/doc:     (optional — I'll extract context)
- Dark mode too?:    (yes / no — currently gapped, see below)
```

Partial input is fine. Infer the rest from mood.

### Step 2 — Analyze (fan-in from all sources)

Run whichever inputs were provided, then merge by precedence:

```python
# Pseudocode of the merge logic
analysis = {}

if reference_url:
    analysis = generate_design_system_from_url({url, name})  # has CSS + vision

if brief_pdf or brief_text or reference_image:
    text = brief_text or import_pdf(brief_pdf).textContent
    brief_analysis = analyze_brief({
        briefText: text,
        pdfText: pdf_text if available,
        logoBase64: reference_image if available,  # currently unused — see gap
        brandName: brand_name
    })
    # Merge: URL data wins on CSS-exact values (colors, fonts);
    # brief_analysis wins on mood/industry/audience
    analysis = merge_precedence(analysis, brief_analysis)

if not analysis:
    # No external sources — use mood-based preset
    analysis = analyze_brief({ briefText: f"{brand_name} — {mood}", brandName })
```

Review the `BrandAnalysis` output and share a **1-paragraph direction** with the user before proceeding:

> *"Direction: luxury editorial. Primary **#8B0000** (deep crimson) with **Cormorant Garamond** headings + **Inter** body. 11-stop scales for primary/secondary/accent, 4px spacing base, radius 8 (default), tinted shadows. Sound right, or want adjustments before I build?"*

Get a quick confirm or adjust. Then proceed.

### Step 3 — Create DS (on disk)

```
create_design_system({
  name: "<slug>",
  primary_color: analysis.colors.primary[500],
  secondary_color: analysis.colors.secondary[500],
  accent_color: analysis.colors.accent[500],
  heading_font: analysis.typography.headingFont,
  body_font: analysis.typography.bodyFont,
  mood: analysis.tone,
  voice: analysis.voice
})
```

This saves a `tokens.yaml` file in `knowledge/design-systems/<slug>/`. **No Figma state is written yet.** This is intentional — we're still in draft.

### Step 4 — Showcase in Figma

```
design_system_preview({ system: "<slug>" })
```

This creates a single visual frame inside Figma showing every token (colors, typography scale, spacing, radius, shadows) and sample components — **without committing any variables/styles/components** to the Figma file. The user sees what they're getting before you write anything permanent.

### Step 5 — Report & Wait

Report to user. **Do not proceed to Phase 2 without explicit approval.**

```
📋 DS Draft "<name>" created
─────────────────────────────
Direction:   <mood>, <voice>
Primary:     <hex>
Fonts:       <heading> + <body>
Scales:      4 (primary, secondary, accent, neutral, 11 stops each)
Showcase:    Figma frame <nodeId>

Review the showcase frame. Let me know:
  → "approve" / "looks good" — I'll push variables, styles, and components to Figma (~30s)
  → "change <thing>" — I'll adjust and regenerate the showcase
  → "swap fonts" / "darker primary" — natural language tweaks
```

---

## Interlude — User Review (Phase 1.5)

While waiting for user approval, handle these common adjustments by calling `update_design_system` + regenerating the showcase:

| User says | You do |
|---|---|
| "Primary should be more crimson" | `update_design_system({ changes: { "colors.primary": "#..." } })` → `design_system_preview` |
| "Replace heading with Playfair" | `update_design_system({ changes: { "typography.heading.family": "Playfair Display" } })` → refresh |
| "Rounder buttons" | `update_design_system({ changes: { "radius.md": 16 } })` → refresh |
| "Add a gold accent" | `update_design_system({ changes: { "colors.accent": "#D4AF37" } })` → refresh |
| "More spacious feel" | `update_design_system({ changes: { "spacing.unit": 10 } })` → refresh |

**Do NOT move to Phase 2** until the user says something unambiguously affirmative: *"approved"*, *"looks good, push it"*, *"implement the variables"*, *"pode implementar"*, etc.

---

## Phase 2 — Implement (The Real Commit)

Only run this after explicit user approval.

### Step 5 — Variables

```
create_variables_from_design_system({ designSystemName: "<slug>" })
```

This creates the Figma variable collection from the stored `tokens.yaml`. Returns variable IDs you'll need in Step 7.

### Step 6 — Text Styles

```
create_text_styles({
  styles: [
    { name: "DS/Display",    fontFamily: <heading>, fontSize: 72, fontWeight: 700, lineHeight: 80,  letterSpacing: -0.02 },
    { name: "DS/H1",         fontFamily: <heading>, fontSize: 48, fontWeight: 700, lineHeight: 56,  letterSpacing: -0.02 },
    { name: "DS/H2",         fontFamily: <heading>, fontSize: 36, fontWeight: 700, lineHeight: 44,  letterSpacing: -0.01 },
    { name: "DS/H3",         fontFamily: <heading>, fontSize: 24, fontWeight: 700, lineHeight: 32,  letterSpacing: 0 },
    { name: "DS/Body Large", fontFamily: <body>,    fontSize: 18, fontWeight: 400, lineHeight: 28,  letterSpacing: 0 },
    { name: "DS/Body",       fontFamily: <body>,    fontSize: 16, fontWeight: 400, lineHeight: 24,  letterSpacing: 0 },
    { name: "DS/Body Small", fontFamily: <body>,    fontSize: 14, fontWeight: 400, lineHeight: 20,  letterSpacing: 0 },
    { name: "DS/Caption",    fontFamily: <body>,    fontSize: 12, fontWeight: 400, lineHeight: 16,  letterSpacing: 0.02 }
  ]
})
```

Derive the sizes from the modular scale ratio chosen in Step 2. The example above uses 1.333 (perfect fourth) — pick your ratio per the mood.

### Step 7 — Components

```
create_ds_components({
  components: [
    { type: "button", name: "DS/Button", fillVariableId: <primary/500 id>, textStyleId: <DS/Body id>, cornerRadius: <radius/md>, ... },
    { type: "card",   name: "DS/Card",   fillVariableId: <surface id>,     textStyleId: <DS/H3 id>,   cornerRadius: <radius/lg>, ... },
    { type: "badge",  name: "DS/Badge",  fillVariableId: <accent/500 id>,  textStyleId: <DS/Caption id>, cornerRadius: 9999, ... }
  ]
})
```

**Critical:** every `fillVariableId` and `textStyleId` must come from Step 5/6 results. No literal hex values. No literal font sizes. If a binding is missing, stop and fix before reporting.

### Step 8 — Final Report

```
✅ Design System "<name>" fully implemented in Figma
────────────────────────────────────────────────────
Variables:       42   (4 collections)
Text Styles:     8    (DS/Display → DS/Caption)
Components:      3    (DS/Button, DS/Card, DS/Badge)
Showcase frame:  node <id>
Dark mode:       (deferred — see Known Gaps)
Dev handoff:     Ready for Figma Variables Export → Tokens Studio → Style Dictionary
```

---

## Fast Path — One-Click (Opt-In)

If the user explicitly wants everything at once, skip the phased flow:

```
1. analyze_brief({...})  →  BrandAnalysis
2. generate_design_system_in_figma({ brandAnalysis })  →  creates variables + styles + components + showcase in one call
```

Use this when the user says: *"just do the full DS"*, *"one shot"*, *"no review needed"*, *"faz logo"*, or is clearly in a rapid-prototype mood. **Default is still phased** — only collapse when explicitly asked.

---

## Developer Handoff Toolchain

A professional DS doesn't stop at "it looks good in Figma". It has to leave Figma and end up in code. Here are the three real-world handoff paths the skill's naming conventions support:

### Path A — Figma Native Variables Export (Zero Tooling)

**For:** teams with dedicated design tokens but no infra yet.

1. Designer selects the variable collection in Figma.
2. Right-click → "Export variables" → JSON.
3. Developer imports into CSS custom properties manually or via a simple build script.

**What you need from the skill:** DTCG-compatible naming (`color/brand/primary/500`) so the export JSON keys are already CSS-var-ready (`--color-brand-primary-500`).

**Limitations:** Figma's native export is per-collection (not multi-collection), no automatic mode resolution, no Tailwind config generation. Good for MVPs, painful for mature teams.

### Path B — Tokens Studio (Figma Plugin)

**For:** teams who want a round-trip between Figma and their codebase with minimal engineering.

1. Install [Tokens Studio](https://tokens.studio/) plugin in Figma.
2. Plugin reads your variable collections and exposes them as Design Tokens.
3. Export to: CSS, SCSS, Tailwind config, Style Dictionary JSON, iOS, Android — via plugin settings.
4. Optional: sync back to GitHub — designer edits in Figma, plugin pushes to a PR.

**What you need from the skill:** Variables organized by collection + mode structure. DTCG naming is native to Tokens Studio, so the skill output maps 1:1.

**Limitations:** requires a plugin install per designer; dark mode needs Figma Variable Modes (currently a Figmento gap).

### Path C — Style Dictionary (Programmatic, CI-friendly)

**For:** mature engineering teams with multi-platform needs (web + iOS + Android).

1. Dev writes a Style Dictionary config.
2. Source: either Tokens Studio export, or Figma API export via `figma-api` SDK.
3. Style Dictionary compiles tokens to: CSS, SCSS, iOS (Swift), Android (XML), React Native, Flutter — in one build.
4. Integrates into CI; design tokens become a versioned package (`@brand/tokens`).

**What you need from the skill:** Well-organized hierarchical collections that serialize to a deterministic JSON. W3C DTCG naming is required (Style Dictionary adopted DTCG in 4.x).

**Limitations:** engineering effort upfront; overkill for single-platform projects.

### Recommendation Table

| Team size / maturity | Path |
|---|---|
| Solo dev / MVP | Path A (native export) |
| Small design team + single-platform web | Path B (Tokens Studio) |
| Multi-platform product (web + iOS + Android) | Path C (Style Dictionary) |

**Always mention the available paths** in your final report so the user knows what to do next with the DS. Don't assume which path they want.

### Code Connect (Bonus — Component-Level Handoff)

For teams using React/Vue/Svelte: pair the DS components with Figma [Code Connect](https://www.figma.com/code-connect-docs/) mappings. Figmento has a `figma-code-connect` skill that creates `.figma.ts` template files linking Figma components → code components. Run that skill after Phase 2 to complete the handoff loop.

---

## Hard Rules — Things That Will Break the DS

1. **Never hardcode values in components.** Every fill, stroke, corner radius, text style must reference a variable. If `create_ds_components` didn't receive `fillVariableId`, fix it before reporting done.
2. **Never create 3+ font families.** Two fonts max, always.
3. **Never use fontWeight 500 or 600 on non-Inter fonts.** Figma silently falls back to Inter. Use 400 or 700 only.
4. **Never skip the showcase frame.** The user needs visual confirmation before Phase 2.
5. **Never invent tokens that have no source.** Every value traces to: the brief, the PDF, the reference image, the reference URL, or Figmento's mood presets.
6. **Never overwrite an existing DS silently.** Always `read_figma_context` first and ask if variables already exist.
7. **Never jump from Phase 1 to Phase 2 without user approval.** The whole point of the two-phase flow is the review gate.
8. **Never leave the DS without a name.** The root collection, components, and showcase frame must all be named descriptively (`DS / Button`, `<Brand> — Design System`).

### Geometry Hard Rules (Added after Test 1 — spacing/layout regressions)

9. **Never attempt mid-generation fix-ups on broken geometry.** If `design_system_preview` returns a frame with overlapping sections, clipped text, or wrong positioning, do NOT try to patch it with follow-up `transform_node` / `set_auto_layout` / `create_frame` calls. That is how orphan frames and duplicates happen. Instead:
   1. `get_page_nodes` to identify ALL frames created in this session
   2. `delete_node` the broken root + any siblings from the attempt
   3. Investigate root cause (log the issue, ask user)
   4. Regenerate with a single clean `design_system_preview` call
   Treat the showcase as **atomic** — it either renders correctly or gets deleted and redone. No in-place repair.

10. **Every auto-layout frame MUST declare `layoutSizingVertical: 'HUG'` unless it is a strictly visual fixed-size element** (color swatch, spacing bar, icon). Content-bearing frames (sections, rows, columns, cards) ALWAYS HUG vertically. Fixed height on a content frame = clipped text on overflow.

11. **Short text (< ~24 chars, no line breaks) MUST use `textAutoResize: 'WIDTH_AND_HEIGHT'`.** Section headers, labels, hex values, type specimen labels, button text — all short, all `WIDTH_AND_HEIGHT`. Default `HEIGHT` causes fixed-width wrapping on short labels (the "auto-height on a 5-char label" bug).

12. **Text that must wrap within a column uses `layoutSizingHorizontal: 'FILL'` + `textAutoResize: 'HEIGHT'`.** This is the ONLY valid way to get wrap behavior inside an auto-layout column. Never use fixed `width` + `height` on wrapping text.

13. **Never use absolute x/y positioning inside an auto-layout parent.** Figma silently ignores x/y when parent has `layoutMode !== 'NONE'`, so you think you positioned something and actually didn't. Inside auto-layout, position is determined by sibling order + `itemSpacing` + alignment props only.

14. **Cleanup on partial failure is mandatory.** If a `batch_execute` call returns with errors (any individual command failed), read the response's `results` array, identify which frames were created before the failure, and `delete_node` them before retrying. Leaving half-built scaffolding on the canvas is the #1 source of "stray Editorial — Left Panel" style orphans.

15. **One design_system_preview call per DS.** If you call it twice in the same session without deleting the first, you get two side-by-side showcases and the user has to clean up manually. Before calling, check `get_page_nodes` for an existing `*— Design System Preview` frame and delete it first.

### Post-Preview Rules (Added after Test 2 — sibling frames + typography overflow)

16. **`design_system_preview` is terminal — ZERO mutations after it.** The output frame is the complete showcase. After calling `design_system_preview`, the following tools are **BANNED** for the remainder of Phase 1:
    - `batch_execute` (adding supplementary sections, specimens, panels, variants)
    - `transform_node` (resizing / repositioning sections)
    - `set_auto_layout` (re-applying sizing to "fix" layout)
    - `set_style` / `apply_style` (restyling after the fact)
    - `create_frame` / `create_text` / `create_rectangle` (adding anything — anywhere)
    - `delete_node` (except to delete the broken showcase root for a clean regeneration)
    - `rename_node`, `group_nodes`, `reorder_child`, `append_child`
    
    The preview either rendered correctly or it didn't. If it didn't, delete the root and call the tool again. There is no third option. If you find yourself typing `transform_node` or `batch_execute` during Phase 1 after the preview exists, **stop immediately** — you are about to cause an API 400 error via tool_use/tool_result race conditions, AND violate this rule.
    
    If the user asks for additions not covered by the preview ("can you also show a radius ramp" / "add a brand wordmark"), respond: *"The `design_system_preview` tool doesn't currently support that. I can't patch it at runtime because that produces sizing bugs and race conditions. I've noted it as a skill improvement — want me to proceed with Phase 2 anyway, or should we pause the DS work and expand the tool first?"*

17. **Brand name / wordmark text ALWAYS uses `textAutoResize: 'WIDTH_AND_HEIGHT'`.** A brand name ("Aurelia", "Figmento", "Café Noir") is a single short identifier that must size to its own content — never to a parent column width. If you put a brand name in a narrow container with `textAutoResize: 'HEIGHT'`, Figma wraps character-by-character and you get the "Au / rel / ia" stacked-letters disaster. Rule:
    - Brand name / wordmark → `WIDTH_AND_HEIGHT` (always, no exceptions)
    - Container holding the brand name → `layoutSizingHorizontal: 'HUG'` (so it wraps around the wordmark)
    - Font size is a visual choice; the layout must accommodate it, never compress it.

18. **All showcase content is a child of the showcase root frame — no siblings.** Every frame created during a DS task lives inside the node returned by `design_system_preview`. When you capture the return value, save the `nodeId` — that's the parentId for anything subsequent (rare edge cases only; normally you don't add anything). Creating a frame at the page level alongside the showcase produces "Brand Identity Panel floating outside the showcase card" — exactly the anti-pattern we're fixing. If you catch yourself creating a frame without an explicit `parentId`, stop and reconsider: there is no legitimate case in this skill where a non-root frame should be created.

---

## Anti-Patterns — The "Bot Version" You Must Avoid

| Bot version | Professional version |
|---|---|
| `primary`, `primary-2`, `primary-3` | `brand/primary/500`, `brand/primary/600`, `brand/primary/700` |
| Single `--primary: #6366F1` variable | 11-stop scale `brand/primary/{50..950}` |
| Tailwind's default indigo/slate for every project | Hue derived from brand or reference, via `analyze_brief` |
| Button with hardcoded `fill: "#6366F1"` | Button with `fillVariableId: "brand/primary/500"` |
| One shadow `box-shadow: 0 4px 6px rgba(0,0,0,0.1)` (pure black) | Primary-tinted shadow ramp (xs→xl), 5 levels |
| Fonts: Inter + Inter (the "safe default") | Font pairing derived from mood via Figmento's typography knowledge |
| No showcase frame, just "it's done" | Visual showcase with every token + component state |
| Skipping user review gate | Phase 1 → stop → user approves → Phase 2 |
| Pre-calculating `totalHeight` and setting fixed `height` on root | `layoutMode: VERTICAL` + `layoutSizingVertical: HUG` — frame grows to fit |
| Mid-generation "let me fix that" calls after a broken preview | Delete the broken frame, investigate, re-run atomically |
| Creating "Editorial — Left Panel" frames alongside the main showcase to patch issues | Everything lives inside the single root — never spawn sibling repair frames |
| Short label `"COLORS"` with fixed `width: 1280, height: 20` (forces wrap) | Short label with `textAutoResize: 'WIDTH_AND_HEIGHT'` — hugs content |
| Absolute `x/y` for button, badge, card in a components row | HORIZONTAL auto-layout row with `itemSpacing` — Figma handles layout |
| After `design_system_preview`, adding a "Brand Identity Panel" via batch_execute | The preview is complete — no post-hoc additions. Report the gap instead. |
| Editorial typography specimens ("Single Estate, Timeless Craft") added via batch_execute without `layoutSizingHorizontal: 'FILL'` → overflow parent | Use the preview's built-in "Aa" specimens. If brand-contextual copy is needed, that's a tool improvement, not a runtime patch |
| Brand wordmark "Aurelia" in a 280px column with `textAutoResize: 'HEIGHT'` → "Au / rel / ia" character stacking | Brand name always `textAutoResize: 'WIDTH_AND_HEIGHT'`, container `layoutSizingHorizontal: 'HUG'` — sized by the text, not compressing it |
| Frame created without explicit `parentId` → ends up at page level | Every frame has `parentId: <showcase root nodeId>` — no orphan siblings |

---

## Quality Checklist — Before Reporting Done

Run through this before declaring Phase 2 complete. If any item fails, fix it.

### Variables
- [ ] At least 3 brand color scales (primary, secondary, accent) with 11 stops each
- [ ] Neutral scale with 11 stops
- [ ] 4 semantic colors (success, warning, error, info) minimum 3 stops each
- [ ] Spacing scale uses 4px or 8px base consistently
- [ ] Radius ramp has 5 levels (none/sm/md/lg/full)
- [ ] Every variable follows `group/subgroup/item` naming (DTCG format)
- [ ] No hardcoded hex values outside variable collections

### Typography
- [ ] Exactly 2 font families (heading + body)
- [ ] All 8 required text styles exist (Display → Caption)
- [ ] Font weights are 400 or 700 only (no 500/600)
- [ ] Line-heights set as pixel values, not multipliers
- [ ] Modular scale ratio chosen and consistent (1.125 / 1.25 / 1.333 / 1.5)

### Components
- [ ] Button, Card, Badge exist — no more, no less (skill scope)
- [ ] Every component property binds to a variable (`fillVariableId`, `textStyleId`)
- [ ] Zero hardcoded values in component fills/strokes
- [ ] Components use auto-layout (never absolute positioning)
- [ ] Radius bound to `radius/*` variable, not literal number

### Showcase
- [ ] Showcase frame exists and shows: brand colors + neutrals + typography scale + 3 components + spacing scale + radius ramp
- [ ] Frame uses auto-layout throughout
- [ ] Frame is labeled with the DS name

### Phased Flow
- [ ] Phase 1 completed before Phase 2 was started
- [ ] User explicitly approved between phases (never jumped)
- [ ] If user requested adjustments, they were applied via `update_design_system` + showcase refresh

### Dev Handoff Readiness
- [ ] Variable names are export-friendly (no spaces, no special chars, DTCG format)
- [ ] Collections map cleanly to CSS var groups (Brand Colors → `--color-*`, Spacing → `--space-*`)
- [ ] Handoff path options mentioned in final report (A / B / C)
- [ ] Components use variable bindings, not style aliases (so Code Connect works)

---

## Known Gaps — Things This Skill Cannot Do Yet

These are confirmed Figmento gaps as of the current version. Each has a workaround and an implementation note for when it gets built.

### Gap 1 — Variable Modes (Light / Dark)

**What's missing:** Figma Variable Modes aren't exposed through Figmento tools. No `create_variable_mode`, no `modeId` parameter on `create_variable_collections`, no mode-aware binding in `create_ds_components`.

**Impact:** Dark mode can only be done via (a) a second parallel collection (ugly, not recommended), or (b) manual post-generation work in Figma by the designer.

**Workaround today:** If the user asks for dark mode, explain the gap and offer:
1. Generate the light DS now.
2. After Phase 2, guide the user to manually add a dark mode in Figma: right-click the Brand Colors collection → Add Mode → duplicate values → adjust.
3. Future color changes will need to be done in both modes until the gap closes.

**Implementation spec (for when we build it):**
- New tool: `create_variable_modes({ collectionName, modes: [{name, baseMode?}] })`
- Extension: `create_variable_collections` accepts `variables: [{ name, type, values: { light: "#fff", dark: "#000" } }]`
- New plugin command: `ds-01b: createVariableMode` handling the Figma `collection.addMode()` + `setValueForMode()` API calls
- Effort estimate: 1-2 days (plugin + MCP wrapper + tests)

### Gap 2 — Local Image → BrandAnalysis (Vision)

**What's missing:** `analyze_brief` accepts `logoBase64` but the handler does nothing with it (it only runs keyword extraction on text). The `visionExtract(base64)` function already exists in [ds-extraction.ts](figmento-mcp-server/src/tools/design-system/ds-extraction.ts#L305) but is only wired to the URL-based flow (`generate_design_system_from_url`).

**Impact:** The user can't upload a dashboard screenshot, Dribbble shot, or competitor UI and get tokens extracted automatically. Image reference is a requested feature but currently a dead-end.

**Workaround today:** Describe the image verbally in the brief text and let `analyze_brief` do keyword extraction. Lossy but functional:
```
briefText: "Dark dashboard aesthetic with electric blue primary (#00B4FF),
mono-style headings in Space Grotesk, rounded corners (~12px), subtle card
shadows, spacious density. Reference: <describe the image>"
```

**Implementation spec (for when we build it):**
- New tool: `analyze_reference_image({ imageBase64, brandName?, briefText? })`
- Reuse: `visionExtract(imageBase64)` from ds-extraction.ts (already handles Gemini call + JSON parse)
- Extension: merge vision output with any provided `briefText` → full BrandAnalysis shape
- Palette extraction: pixel-level color quantization (use a library like `colorthief` or `quantize`) to supplement vision's mood-based color guesses with exact hex values
- Wire into `analyze_brief` as well — when `logoBase64` is passed, route it through `visionExtract` and merge with text-extracted fields
- Effort estimate: 1 day (tool + palette extraction + tests)

### Gap 3 — Batch Image Analysis for DS

**What's missing:** `batch_analyze_references` only categorizes images for the reference library (mood/layout tags) — it doesn't extract tokens.

**Impact:** If the user says "here are 5 dashboards I like, fuse them into a DS", there's no direct path.

**Workaround today:** Pick the strongest reference, use it alone, mention the limitation.

**Implementation spec:**
- New tool: `batch_analyze_references_for_ds({ imageBase64s: [...], brandName, mood? })`
- Runs `visionExtract` on each image in parallel
- Merges results by median (border_radius) or vote (shadow_style, card_style)
- Outputs a fused BrandAnalysis
- Effort estimate: 0.5 days (on top of Gap 2 being fixed first)

---

## Integration With Other Figmento Skills

This skill composes cleanly with:

- **`design-from-brief`** — once the DS exists, future design requests in the same session should **consume** the variables/styles/components created here. Load the DS via `get_design_system(name)` at the start of any follow-up design.
- **`fill-contextual-images`** — after DS creation, if the showcase has image placeholders, use this skill to populate them.
- **`figma-code-connect`** — after Phase 2, run this skill to link the DS components to code-side components for full dev handoff.

---

## Summary — The Skill in 30 Seconds

> **Phase 1:** Ask for brand + mood (+ optional PDF/image/URL). `analyze_brief` → `create_design_system` → `design_system_preview`. **Stop and wait** for user to review the showcase frame. Handle adjustments via `update_design_system`.
>
> **Phase 2 (on approval):** `create_variables_from_design_system` → `create_text_styles` → `create_ds_components`. Every component bound to variables. DTCG naming throughout. Report the dev handoff paths (Native Export / Tokens Studio / Style Dictionary).
>
> **Known gaps:** dark mode (Variable Modes unsupported), local image vision (wire-up missing). Both have workarounds and ship specs in the Known Gaps section.
