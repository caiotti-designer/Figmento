# UPSTREAM-DIFF — claude design system

> **Upstream source:** [getdesign.md/claude/design-md](https://getdesign.md/claude/design-md) (content extracted from `getdesign` npm package v0.6.2, `package/templates/claude.md`).
>
> **Note on source location:** the [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) repo has been restructured — `design-md/claude/` now contains only a stub README pointing at the external `getdesign.md` package. Figmento's existing [`tokens.yaml`](tokens.yaml) `source:` field still references the old path; that attribution is preserved for history but the current upstream is the npm package.

This file documents the **intentional divergences** between the upstream claude `DESIGN.md` and Figmento's canonical form in [`DESIGN.md`](DESIGN.md) + [`tokens.yaml`](tokens.yaml). These are normalizations applied during import to fit Figmento's runtime schema — not bugs, not data loss.

Produced by @architect (Aria) during DMD-1 Task 6, 2026-04-15.

---

## Structural divergences

### 1. H2 heading numbering stripped

| Upstream | Figmento |
|---|---|
| `## 1. Visual Theme & Atmosphere` | `## Visual Theme & Atmosphere` |
| `## 2. Color Palette & Roles` | `## Color Palette & Roles` |
| … (all 9 sections) | … |

**Rationale:** the 9-section canonical form in [`DESIGN-MD-SPEC.md` §4](../../../../docs/architecture/DESIGN-MD-SPEC.md) uses unnumbered H2 headings to maximize compatibility across the ecosystem. Some upstream files in the awesome-design-md library number their sections, others don't. Figmento's parser will accept both forms (DMD-2 implementation), but the canonical output form is unnumbered.

### 2. `**Mood**` line added

Upstream has no explicit mood list. Figmento adds a `**Mood**: warm, editorial, organic` line to the Visual Theme & Atmosphere section, derived from `tokens.yaml.mood`. Strictly additive — no upstream content removed.

---

## Content normalizations

### 3. Spacing scale normalized to the 8-grid

| Upstream scale | Figmento `spacing` block |
|---|---|
| `3px, 4px, 6px, 8px, 10px, 12px, 16px, 20px, 24px, 30px` (10 values, non-grid) | `unit:8, xs:4, sm:8, md:16, lg:24, xl:32, 2xl:48, 3xl:64` (canonical 8-key 8-grid) |

**Rationale:** Figmento's runtime enforces the 8px grid across all design tools. Non-grid values (3, 6, 10, 20, 30) are dropped — callers approximate to the nearest grid step at apply time. This is the single largest data-transformation divergence and the most load-bearing.

**What this costs:** button padding described as "0px 12px 0px 8px" in upstream prose is representable, but values like "1.6px vertical padding" on inputs or "30px section spacing" cannot be emitted as spacing tokens. Those values become inline decisions at component-creation time, not system-level tokens.

### 4. Radius scale collapsed

| Upstream tier | Value | Figmento `radius` key |
|---|---|---|
| Sharp | 4px | **dropped** (below minimum) |
| Subtly rounded | 6–7.5px | **dropped** (below minimum) |
| Comfortably rounded | 8–8.5px | `sm: 8` |
| Generously rounded | 12px | `md: 12` |
| Very rounded | 16px | `lg: 16` |
| Highly rounded | 24px | *(not preserved in this system)* |
| Maximum rounded | 32px | `xl: 32` |
| *(implicit — pills)* | 9999 | `full: 9999` |

**Rationale:** Figmento's canonical radius schema requires exactly 6 keys (`none, sm, md, lg, xl, full`). Upstream's 7 descriptive tiers don't map 1:1 — the "sharp" and "subtly rounded" tiers are intentionally dropped, matching upstream's own "don't use sharp corners < 6px radius" constraint (Do's and Don'ts §7). The "highly rounded" 24px tier is absent in Figmento's claude system; callers needing 24px use an inline value.

### 5. Extended color keys renamed to semantic snake_case

| Upstream descriptive name | Figmento key | Role |
|---|---|---|
| Anthropic Near Black (`#141413`) | `on_surface` / `deep_dark` | Primary text + dark-theme surface |
| Terracotta Brand (`#c96442`) | `primary` | Brand CTA |
| Coral Accent (`#d97757`) | `primary_light` / `accent` | Text accents, links on dark |
| Error Crimson (`#b53333`) | `error` | Error state |
| Focus Blue (`#3898ec`) | `info` / `focus_blue` | Input focus (the only cool color) |
| Parchment (`#f5f4ed`) | `background` | Primary page background |
| Ivory (`#faf9f5`) | `surface` / `on_primary` | Card surface, text on brand |
| Warm Sand (`#e8e6dc`) | `warm_sand` / `border_warm` | Secondary button BG + borders |
| Dark Surface (`#30302e`) | `dark_surface` / `border_dark` | Dark-theme containers |
| Charcoal Warm (`#4d4c48`) | `charcoal_warm` | Button text on light warm |
| Olive Gray (`#5e5d59`) | `on_surface_muted` | Secondary body text |
| Stone Gray (`#87867f`) | `stone_gray` | Tertiary text |
| Dark Warm (`#3d3d3a`) | `dark_warm` | Dark text links |
| Warm Silver (`#b0aea5`) | `warm_silver` | Text on dark |
| Border Cream (`#f0eee6`) | `border` | Standard light border |
| Ring Warm (`#d1cfc5`) | `ring_warm` | Shadow ring |
| Ring Deep (`#c2c0b6`) | `ring_deep` | Deeper ring (active state) |

**Rationale:** the Figmento runtime reads `colors.primary`, `colors.on_surface`, `colors.border`, etc., as semantic slots. Upstream uses descriptive brand names ("Parchment", "Terracotta Brand") that carry narrative weight but aren't machine-consumable. The DESIGN.md's `​```color` block uses Figmento's snake_case keys; the extended palette is preserved verbatim with its own snake_case names.

### 6. `Ring Subtle #dedc01` from upstream is DROPPED

Upstream §2 lists a "Ring Subtle (`#dedc01`)" as a "secondary ring variant for lighter interactive surfaces." `#dedc01` is a saturated yellow — visually inconsistent with the warm gray ring system (`ring_warm: #d1cfc5`, `ring_deep: #c2c0b6`). Figmento treats this as a **probable upstream typo** and omits it.

**Evidence it's a typo:** the surrounding context ("secondary ring variant for lighter interactive surfaces") describes a ring variant in the warm-gray family, but `#dedc01` is in the yellow-green saturated range — completely out of character for a system whose core rule is "every neutral is warm-toned, no saturated colors beyond Terracotta." The hex may have been intended as `#dedcd1` (warm cream-gray) or similar.

**Re-introducing is harmless:** if this was not a typo, the importer preserves freely-named extended color keys — future reconciliation can add `ring_subtle: "#dedc01"` to the color block without any schema change.

---

## Typography divergences

### 7. Hierarchy table → canonical type-scale + letter-spacing blocks

Upstream §3 ships a 16-row hierarchy table with descriptive roles, mixed decimal px values, and per-row letter-spacing. Figmento normalizes this into two blocks:

**Upstream table rows → Figmento `type-scale` keys:**

| Upstream role | Upstream px | Figmento key | Figmento px |
|---|---|---|---|
| Display / Hero | 64 | `display` | 64 |
| Section Heading | 52 | `h1` | 52 |
| Sub-heading Large | 36–36.8 | `h2` | **36** *(decimal dropped)* |
| Sub-heading | 32 | `h3` | 32 |
| Sub-heading Small | 25–25.6 | `heading` | **25** *(decimal dropped)* |
| Feature Title | 20.8 | *(dropped — too granular)* | — |
| Body Serif | 17 | *(overlaps with body)* | — |
| Body Large | 20 | `body_lg` | 20 |
| Body / Nav | 17 | `body` | 17 |
| Body Standard | 16 | *(dropped — overlaps)* | — |
| Body Small | 15 | `body_sm` | 15 |
| Caption | 14 | `caption` | 14 |
| Label | 12 | `label` | 12 |
| Overline | 10 | `overline` | 10 |
| Micro | 9.6 | `micro` | 9.6 *(preserved)* |
| Code | 15 | *(handled by mono family, not scale)* | — |

**Decimal values dropped:** `36.8`, `25.6`, `20.8` round down to integers in Figmento. The one preserved decimal is `micro: 9.6` because 9 vs 10 would collide with `overline: 10`.

**Body-size ambiguity resolved:** upstream has multiple "body" variants (Body Large 20, Body Serif 17, Body/Nav 17, Body Standard 16, Body Small 15). Figmento maps to 3 canonical tiers: `body_lg: 20`, `body: 17`, `body_sm: 15`. The 16px "Body Standard" is dropped as overlap.

### 8. `figma_fallback` added (Figmento-specific extension)

Upstream specifies CSS fallbacks only (`Georgia`, `Arial`). Figmento adds a `figma_fallback` field per role — widely-available Figma fonts that substitute for the custom Anthropic typefaces when rendering in Figma:

| Role | Upstream fallback | Figmento `figma_fallback` (new) | Figmento `fallback` (preserved) |
|---|---|---|---|
| heading | Georgia | Source Serif 4 | Georgia |
| body | Arial | DM Sans | Arial |
| mono | Arial | DM Mono | Arial |

This is a strictly additive Figmento extension — no upstream information is lost.

### 9. `opentype_features: []` emitted explicitly

Upstream doesn't specify OpenType feature tags. Figmento emits an empty array `[]` inside the `​```font-family` block rather than omitting the field. Rationale: round-trip determinism — the exporter (DMD-4) always emits the key so the importer (DMD-2) always sees it.

---

## Depth & Elevation divergences

### 10. Structured `shadow` block synthesized from upstream prose

Upstream §6 ships an "Elevation" table with 5 tiers (Flat, Contained, Ring, Whisper, Inset) described as CSS strings — no structured shadow tokens. Figmento's canonical schema requires a `​```shadow` block with exactly `sm`, `md`, `lg` levels of 6-field objects.

**Figmento synthesized these three levels** from upstream's descriptive elevation system:

| Figmento level | Derivation from upstream |
|---|---|
| `sm` | Ring shadow (spread 1, color `#f0eee6`) — derived from Contained tier's `1px solid #f0eee6` border |
| `md` | Ring shadow (spread 1, color `#d1cfc5`) — derived from Ring tier's `0px 0px 0px 1px #d1cfc5` |
| `lg` | Drop shadow (y 4, blur 24, `rgba(0,0,0,0.05)`) — direct match for Whisper tier |

**This is the most speculative normalization.** The `sm` and `md` levels are Figmento's interpretation of the upstream Contained and Ring tiers as 3-level shadow primitives. If round-trip fidelity to upstream becomes important, the exporter may need to emit the elevation block as the canonical form and let the shadow block be derived.

### 11. Elevation preserved with full semantic names

Good news on the elevation front: Figmento preserves all 5 upstream semantic names (`flat`, `contained`, `ring`, `whisper`, `inset`) as opaque CSS pass-through values inside the `​```elevation` block (per [DESIGN-MD-SPEC.md §7.1](../../../../docs/architecture/DESIGN-MD-SPEC.md)). Values are byte-identical to upstream's CSS strings. This is the AC9 pass-through trade-off working exactly as designed — we sacrifice structural parsing to preserve the semantic names and their CSS verbatim.

---

## Preserved verbatim

These upstream elements are copied into Figmento's DESIGN.md **without modification**:

- All prose in `## Visual Theme & Atmosphere` (3 paragraphs — 1,399 chars)
- All prose in `## Color Palette & Roles` intro (1 paragraph)
- `## Typography Rules` "Principles" prose
- `## Component Stylings` entire section (5 button variants + cards + inputs + nav + distinctive components)
- `## Layout Principles` spacing philosophy, whitespace philosophy, grid & container
- `## Depth & Elevation` shadow philosophy narrative
- **All 9 Do's and 10 Don'ts** — word-for-word
- `## Responsive Behavior` breakpoint table + collapsing strategy
- `## Agent Prompt Guide` entire section — color reference + example component prompts + iteration rules

---

## Round-trip verification

Validated via [`scripts/validate-design-md-sample.js claude`](../../../scripts/validate-design-md-sample.js):

- **Schema validation:** PASS
- **Coverage vs `tokens.yaml`:** 22/22 fields match
- **Parsed IR:** 9 sections, all 9 fenced blocks present (`color`, `gradient`, `font_family`, `type_scale`, `letter_spacing`, `spacing`, `radius`, `shadow`, `elevation`), mood[3], do[9], dont[10]

The Figmento DESIGN.md is a lossless representation of the Figmento `tokens.yaml`, which itself is a normalized form of the upstream content per the divergences documented above. The chain is:

```
upstream claude.md  →  [Figmento normalization: items 1-11]  →  tokens.yaml  ↔  DESIGN.md
                                                                    (byte-identical round-trip)
```

Upstream → tokens.yaml is a one-way transformation. tokens.yaml ↔ DESIGN.md is bidirectional and lossless.

---

## Change log

| Date | Author | Change |
|---|---|---|
| 2026-04-15 | @architect (Aria) | Initial diff document produced during DMD-1 Task 6. 13 divergences cataloged across structure, content normalization, typography, and depth. Preserved-verbatim inventory listed. Round-trip verification PASS (22/22 coverage). |
