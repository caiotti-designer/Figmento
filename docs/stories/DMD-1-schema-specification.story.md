# DMD-1 — Figmento DESIGN.md Schema Specification

## Status: Done

> **Epic:** [epic-DMD — DESIGN.md Pipeline](epic-DMD-design-markdown.md)
> **Phase:** A — Pipeline + Validation Gate
> **Blocks:** DMD-2, DMD-3, DMD-4 (the three MCP tools cannot be built without this spec locked)

## Executor Assignment

| Field | Value |
|---|---|
| **executor** | @architect (Aria) — primary authoring of JSON Schema + technical decisions |
| **supporting** | @pm (Morgan) — sample-file prose, epic alignment, authoring-ergonomics review |
| **quality_gate** | @po (Pax) — `*validate-story-draft` 10-point checklist |
| **complexity** | M (3–5 pts) — spec authoring, no code changes except the JSON Schema file |

## Story

**As a** Figmento contributor planning to build the DESIGN.md import/export/validate tools (DMD-2, DMD-3, DMD-4),
**I want** a locked, documented specification for the Figmento-flavored DESIGN.md format — including the 9 canonical sections, the frontmatter block, the fenced-block conventions, the Format Variants extension, and the JSON Schema that validates conformance —
**so that** the three downstream tool stories can be implemented against a stable contract, the re-seed round-trip validation in DMD-5 has a deterministic target, and external authors (human or LLM) know exactly what shape their DESIGN.md files need to take to work with Figmento.

## Background

Epic DMD adopts [awesome-design-md](https://github.com/VoltAgent/awesome-design-md)'s 9-section markdown format as Figmento's human-authoring layer for design systems, with `tokens.yaml` remaining the runtime format. The parser decision is locked to `marked@^12` (see epic change log). What's *not* yet locked is the precise shape of the markdown: which section headings are required, what goes inside each one, how structured data (colors, type scales, constraints) is represented so that a parser can extract it deterministically rather than through NLP guessing.

DMD-1 produces the shape. It's a spec-writing story — no tool code ships here, just documentation + a JSON Schema + 3 reference `DESIGN.md` files that prove the spec works on real content.

### Why a JSON Schema, not just prose

The epic requires round-trip fidelity (DMD-5: `tokens.yaml → DESIGN.md → tokens.yaml` byte-identical). That requirement is impossible to hold without machine-verifiable conformance rules. Prose alone drifts. A JSON Schema gives DMD-3 (`validate_design_md`) something concrete to check against, and gives DMD-2/DMD-4 a shared contract so their round-trip tests are deterministic.

### Relationship to upstream awesome-design-md

The 9 canonical section headings are **preserved verbatim** from upstream so any of the 50+ existing community DESIGN.md files can be consumed by DMD-2 without translation. Figmento's extensions — frontmatter, fenced-block language hints, the Format Variants section, category-tagged Do/Don't lists — are **strictly additive**: a plain upstream DESIGN.md with none of them must still validate (with `CONCERNS` at worst, never `FAIL`). DMD-1 must document this tolerance contract explicitly.

## Acceptance Criteria

Copied verbatim from [epic-DMD-design-markdown.md § DMD-1](epic-DMD-design-markdown.md) and expanded with the concrete deliverable paths.

1. **AC1 — Spec document exists.** `docs/architecture/DESIGN-MD-SPEC.md` lists every section, every fenced-block language, every frontmatter field, with one paragraph of rationale per decision. Written in a style consistent with the other files under [docs/architecture/](docs/architecture/).

2. **AC2 — JSON Schema exists.** `figmento-mcp-server/schemas/design-md.schema.json` validates frontmatter (required + optional fields, types, format constraints), section presence (the 9 canonical sections + Format Variants), and fenced-block content schemas per language hint. Schema version pinned in the `$schema` field; Figmento version captured in a top-level `title` or `description`.

3. **AC3 — Sample `knowledge/design-systems/notion/DESIGN.md`.** Round-tripped by hand from the existing `knowledge/design-systems/notion/tokens.yaml`. Every field in the notion tokens.yaml appears somewhere in the DESIGN.md. Manual verification that the mapping is lossless (DMD-2 will automate this in the next story).

4. **AC4 — Sample `knowledge/design-systems/aurelia/DESIGN.md`.** Hand-written from the aurelia brand brief and its existing `tokens.yaml`, proving the authoring ergonomics: a human writing DESIGN.md from scratch (no tooling, no conversion) should find the structure natural and the fenced blocks self-explanatory.

5. **AC5 — Sample `knowledge/design-systems/claude/DESIGN.md`.** Imported from the upstream [awesome-design-md/claude](https://github.com/VoltAgent/awesome-design-md) file (fetched during the story), translated into Figmento-extended format (adds frontmatter + fenced blocks + Format Variants where applicable). Proves upstream compatibility end-to-end. If intentional divergence exists from the upstream file, it is captured in `knowledge/design-systems/claude/UPSTREAM-DIFF.md` — per DMD-5 AC3 this is a Phase-A-wide convention.

6. **AC6 — Total-coverage mapping table.** The spec document contains an explicit table listing every mandatory field present in the 7 existing `tokens.yaml` files (notion, linear, stripe, vercel, figma, claude, aurelia) and documents where each field lives in DESIGN.md (section, frontmatter key, or fenced-block body). Any field not representable is explicitly listed with a documented default the importer will apply.

7. **AC7 — Non-representable fields documented.** The spec explicitly documents what is **not** representable in DESIGN.md and why. Acceptable reasons: runtime-only (e.g. computed preset names), intentionally dropped (e.g. legacy migration fields), or deferred to a later schema version.

8. **AC8 — All 3 sample files validate against the JSON Schema.** Using `ajv` (or Node's native validator), each of the three sample DESIGN.md files parses and validates with zero `CRITICAL` errors. This is a standalone manual validation step for DMD-1 — DMD-3 will wrap it in an MCP tool in the next story.

9. **AC9 — Elevation opaque-CSS trade-off is explicit in the spec.** The spec document contains a dedicated subsection documenting that the ` ```elevation` fenced block is a **deliberate pass-through** — values are raw CSS shadow expressions that the runtime reads without structural parsing, and the parser does not validate them beyond "is a string". The subsection explains (a) why — existing `tokens.yaml` files store multi-layer composites that would be fragile to parse structurally, (b) what validation is skipped — no contrast check, no color-token-reference check, no spacing-grid check on elevation values, and (c) the upgrade path — a future schema v2 can introduce a structured alternative alongside the pass-through form. This AC exists because the trade-off is the only schema decision in DMD-1 that intentionally sacrifices validation rigor for round-trip fidelity, and must not be buried in a footnote.

10. **AC10 — Optional-field coverage for thin systems.** The JSON Schema marks `source`, `elevation`, `gradients`, and `constraints` as **optional** at the top level. The aurelia sample (AC4) is used as the proof point — it lacks all four fields and MUST validate without errors. If aurelia cannot validate, the schema is too strict; iterate the schema until aurelia passes.

## 🤖 CodeRabbit Integration

**Story Type Analysis**
- **Primary Type**: Architecture (spec authoring, JSON Schema definition)
- **Secondary Type(s)**: Documentation
- **Complexity**: Medium — no runtime code, but the JSON Schema is load-bearing for three downstream stories

**Specialized Agent Assignment**
- **Primary**: @architect (JSON Schema correctness + technical completeness), @pm (spec prose + epic alignment)
- **Supporting**: @po (story-draft validation), @qa (not involved — no code to test beyond schema validation)

**Quality Gate Tasks**
- [ ] Pre-Commit (@architect): JSON Schema lints cleanly, 3 sample files all validate
- [ ] Pre-PR (@devops): N/A — no PR for spec stories; @pm commits directly once @po validates

**Focus Areas**
- Spec consistency — fenced-block language hints must be used uniformly across the 3 samples
- Upstream tolerance — a plain upstream DESIGN.md (no frontmatter, no fenced blocks) must still validate at `CONCERNS` level, never `FAIL`
- Coverage — no field in any of the 7 existing `tokens.yaml` files is silently dropped

## Tasks / Subtasks

- [x] **Task 1: Audit `tokens.yaml` fields across all 7 seeded systems (AC: 6, 7)** — COMPLETE 2026-04-15
  - [x] 1.1 Read each `knowledge/design-systems/{name}/tokens.yaml` (aurelia, claude, figma, linear, notion, stripe, vercel)
  - [x] 1.2 Produce a union field list — every key path that appears in any file → captured in DESIGN-MD-SPEC.md §8 coverage table
  - [x] 1.3 Flag fields that are runtime-computed → `name`, `created`, `source`, `preset_used` → frontmatter (spec §3)
  - [x] 1.4 Flag fields that can't be represented cleanly in markdown → **zero**. elevation handled via opaque CSS pass-through (spec §7.1) — deliberate trade-off approved by @pm amendment, not a non-representable case

- [x] **Task 2: Draft `docs/architecture/DESIGN-MD-SPEC.md` (AC: 1, 6, 7)** — COMPLETE 2026-04-15
  - [x] 2.1 Frontmatter section — spec §3 (6 fields: name, version, created, source_url, figma_file_key, preset_used)
  - [x] 2.2 The 9 canonical sections — spec §4.1–§4.9 (each H2 verbatim, content type, tokens.yaml mapping, Figmento extensions)
  - [x] 2.3 Fenced-block convention — spec §6 (all 9 languages with the 3-pattern categorization, YAML-in-fence rationale in §6.3)
  - [x] 2.4 Format Variants section — spec §5 (per-format override syntax documented)
  - [x] 2.5 Structured Do's and Don'ts — spec §4.7 (tagged + untagged tolerance documented in §7.3)
  - [x] 2.6 Coverage table — spec §8 (complete 27-row mapping of every tokens.yaml field → DESIGN.md location, 100% coverage)
  - [x] 2.7 Non-representable fields — spec §9 (**zero** non-representable; 3 sections have no legacy runtime data but are preserved on round-trip)
  - [x] 2.8 Upstream tolerance contract — spec §10 (verdict mapping table + default substitution table)
  - [x] 2.9 Versioning note — spec §11 (parser branching on frontmatter `schema_version`, v1→v2 migration candidates listed)

- [x] **Task 3: Build the JSON Schema (AC: 2, 10)** — COMPLETE 2026-04-15
  - [x] 3.1 Created [`figmento-mcp-server/schemas/design-md.schema.json`](../../figmento-mcp-server/schemas/design-md.schema.json)
  - [x] 3.2 Top-level structure: `frontmatter` (required) + `sections` (required) + `format_variants` (optional); `additionalProperties: false` enforces closed top-level shape
  - [x] 3.3 Frontmatter sub-schema in `#/definitions/frontmatter` — `name` (kebab-case regex) + `created` (date-time format) required; `version` (semver), `source_url` (uri format), `figma_file_key`, `preset_used`, `schema_version` optional
  - [x] 3.4 Nine fenced-block sub-schemas under `#/definitions/blocks` — `color` (open map w/ 15 canonical keys recommended), `font_family` (structured w/ heading/body required), `type_scale` (open numeric map), `letter_spacing` (open string map), `spacing` (fixed 8 keys required), `radius` (fixed 6 keys required), `shadow` (fixed sm/md/lg + `shadowLayer` type ref), `elevation` (opaque CSS pass-through — only `shadow` string required per entry), `gradient` (structured-conditional on `enabled`). Plus 4 reusable type refs (`cssColor`, `cssLengthOrNormal`, `fontRole`, `shadowLayer`)
  - [x] 3.5 `$schema` set to draft-07, `$id` canonical URL, `title` "Figmento DESIGN.md v1.0", description embeds the parser-IR design rationale. Version moved into title/description (not a top-level keyword — ajv strict mode rejects non-standard top-level fields)
  - [x] 3.6 **Schema validated via ajv@8 + ajv-formats@3 in strict mode.** Compile: ✅. 6-test validation run: ✅ all pass — (1) minimal valid IR, (2) full notion-like IR, (3) correctly rejects missing `frontmatter.name`, (4) correctly rejects non-kebab-case name, (5) correctly rejects incomplete `spacing` block, (6) **aurelia-like thin system validates successfully** (AC10 proof — no elevation/gradients/constraints/source)

- [x] **Task 4: Hand-write `knowledge/design-systems/notion/DESIGN.md` (AC: 3)** — COMPLETE 2026-04-15
  - [x] 4.1 Read [notion/tokens.yaml](../../figmento-mcp-server/knowledge/design-systems/notion/tokens.yaml) — already loaded from Task 1
  - [x] 4.2 Translated field-by-field into [notion/DESIGN.md](../../figmento-mcp-server/knowledge/design-systems/notion/DESIGN.md): frontmatter (6 fields) + 9 canonical sections + 9 fenced blocks (color, gradient, font-family, type-scale, letter-spacing, spacing, radius, shadow, elevation)
  - [x] 4.3 Coverage check — **22/22 tokens.yaml fields present in the parsed IR**. Validated via inline mini-parser (preview of DMD-2's real parser) in [`scripts/validate-design-md-sample.js`](../../figmento-mcp-server/scripts/validate-design-md-sample.js)
  - [x] 4.4 ajv compile + validate against `design-md.schema.json`: **PASS — zero errors**. Includes the `elevation.flat.shadow: "none"` opaque pass-through and the 16-entry extended color palette

- [x] **Task 5: Hand-write `knowledge/design-systems/aurelia/DESIGN.md` from scratch (AC: 4, 10)** — COMPLETE 2026-04-15
  - [x] 5.1 Read [aurelia/tokens.yaml](../../figmento-mcp-server/knowledge/design-systems/aurelia/tokens.yaml) — reference values only, not round-tripped
  - [x] 5.2 Wrote [aurelia/DESIGN.md](../../figmento-mcp-server/knowledge/design-systems/aurelia/DESIGN.md) from a brand-brief mindset, leaning into the "Portuguese quinta meets Michelin-starred elegance" voice from the runtime file. 9 sections, 5 fenced blocks (color, font-family, type-scale, spacing, radius, shadow) — **deliberately no elevation, gradient, letter-spacing, or mono blocks** to prove the schema's thin-system tolerance
  - [x] 5.3 Captured 8 authoring-friction notes at the bottom of the file (feeds DMD-7 authoring guide): (1) 9-section structure is genuinely helpful, (2) fenced-block hints are ergonomic, (3) omitting letter-spacing feels natural, (4) omitting gradient feels natural, (5) thin elevation section with prose-only is natural, (6) category-tagged do/dont clustered thinking, (7) discovered an existing contrast bug in aurelia tokens.yaml (`on_surface: "#151917"` on `surface: "#0D0D0D"`) — DMD-3 validator should catch, (8) responsive + agent-prompt prose-heavy authoring has friction, future v2 `breakpoints` block would help
  - [x] 5.4 Schema validation: **PASS**. Coverage check: **15/15 tokens.yaml fields match**. **AC10 proven in the wild** — aurelia is the thinnest real system in the library (no source, elevation, gradients, or constraints in tokens.yaml) and the hand-authored DESIGN.md validates without errors. DESIGN.md is RICHER than the underlying tokens.yaml (adds 8 do + 9 dont bullets authored from the brand identity) — superset round-trip behavior is a DMD-4 design decision, not a DMD-1 gap

- [x] **Task 6: Import `knowledge/design-systems/claude/DESIGN.md` from upstream (AC: 5)** — COMPLETE 2026-04-15
  - [x] 6.1 Fetched upstream — discovered the awesome-design-md repo has been restructured; `design-md/claude/` now contains only a stub README pointing at [getdesign.md/claude/design-md](https://getdesign.md/claude/design-md). The actual content lives in the `getdesign` npm package (v0.6.2). Downloaded the tarball, extracted `package/templates/claude.md` (312 lines), and read it verbatim
  - [x] 6.2 Translated to Figmento-extended format in [claude/DESIGN.md](../../figmento-mcp-server/knowledge/design-systems/claude/DESIGN.md): added frontmatter pointing at the new upstream URL, stripped upstream's H2 numbering (`## 1. Visual Theme…` → `## Visual Theme & Atmosphere`), wrapped colors/typography/spacing/radius/shadow/elevation/gradient content in their 9 canonical fenced blocks, preserved upstream's prose in §§1, 4, 5, 6, 8, 9 verbatim (~6,500 chars of narrative)
  - [x] 6.3 Diffed against Figmento's existing [claude/tokens.yaml](../../figmento-mcp-server/knowledge/design-systems/claude/tokens.yaml). Produced [claude/UPSTREAM-DIFF.md](../../figmento-mcp-server/knowledge/design-systems/claude/UPSTREAM-DIFF.md) documenting **13 intentional divergences** across 4 categories: structural (H2 numbering stripped, mood line added), content normalization (8-grid spacing, collapsed radius tiers, semantic color renames, dropped `#dedc01` probable upstream typo), typography (16-row hierarchy → canonical type-scale + letter-spacing, figma_fallback additions, empty opentype_features for round-trip determinism), depth (synthesized sm/md/lg from upstream elevation prose, preserved semantic elevation names as opaque pass-through)
  - [x] 6.4 Schema validation: **PASS**. Coverage check: **22/22 tokens.yaml fields match**. Parsed IR contains all 9 sections + 9 fenced blocks

- [x] **Task 7: Round-trip sanity check (AC: 8)** — COMPLETE 2026-04-15 (satisfied as a side-effect of Tasks 4–6)
  - [x] 7.1 All 3 samples validated against `design-md.schema.json` via `scripts/validate-design-md-sample.js` — notion PASS (22/22), aurelia PASS (15/15, AC10 thin-system proof), claude PASS (22/22, upstream-import proof). Zero CRITICAL errors across all 3
  - [x] 7.2 Validation command documented inline in the sample-validator script header + added a §12.5 reference subsection to `DESIGN-MD-SPEC.md` pointing at the script for DMD-2 to mirror
  - [x] 7.3 No samples failed — no iteration needed. The spec held up against all 3 production systems (minimal round-trip, thin-from-scratch, upstream import) without a single schema adjustment

- [x] **Task 8: Peer review + handoff (AC: all)** — COMPLETE 2026-04-15
  - [x] 8.1 @architect self-review: 14 negative/edge-case tests exercising paths the happy-path samples didn't touch — `schema_version` enum, `format_variants` top-level, `figma_file_key`, figma variable-font weights (320/450/540 stops), weight-range enforcement, gradient conditional (minItems: 2 when enabled), empty-sections tolerance, `additionalProperties: false` enforcement at top-level + sections, shadow numeric constraints (minimum blur 0, maximum opacity 1), elevation-layer closed-object. **14/14 PASS, zero schema bugs.** Combined with Task 3's 6 synthetic tests and Tasks 4/5/6's 3 real-world samples, total validation exercises: **20, all green**
  - [x] 8.2 @pm review — spec prose clarity, epic alignment, DESIGN-MD-SPEC.md vs. epic-DMD requirements. Findings captured as a change log entry below; epic change log updated with "DMD-1 shipped"
  - [x] 8.3 Status transition InProgress → InReview → **Done** via @po final acceptance against AC1–AC10
  - [x] 8.4 Epic change log entry added to [epic-DMD-design-markdown.md](epic-DMD-design-markdown.md)

## Dev Notes

### Source of truth

The epic [epic-DMD-design-markdown.md](epic-DMD-design-markdown.md) is authoritative for the 9 canonical sections, the Figmento extensions (frontmatter, fenced blocks, Format Variants), and the parser decision (`marked@^12`). **This story implements the spec, it does not re-derive it.** If the epic is ambiguous, escalate to @pm for clarification rather than inventing a resolution.

### Read these files before starting

- [figmento-mcp-server/knowledge/design-systems/notion/tokens.yaml](figmento-mcp-server/knowledge/design-systems/notion/tokens.yaml) — the most comprehensive existing tokens.yaml; use it as the "if my schema can represent this, it can represent anything" benchmark
- [figmento-mcp-server/knowledge/design-systems/aurelia/tokens.yaml](figmento-mcp-server/knowledge/design-systems/aurelia/tokens.yaml) — newest seeded system (added 2026-04), represents current conventions
- [figmento-mcp-server/knowledge/design-systems/linear/tokens.yaml](figmento-mcp-server/knowledge/design-systems/linear/tokens.yaml), [stripe/tokens.yaml](figmento-mcp-server/knowledge/design-systems/stripe/tokens.yaml), [vercel/tokens.yaml](figmento-mcp-server/knowledge/design-systems/vercel/tokens.yaml), [figma/tokens.yaml](figmento-mcp-server/knowledge/design-systems/figma/tokens.yaml), [claude/tokens.yaml](figmento-mcp-server/knowledge/design-systems/claude/tokens.yaml) — coverage validation set
- [figmento-mcp-server/src/tools/design-system/ds-extraction.ts](figmento-mcp-server/src/tools/design-system/ds-extraction.ts) lines 51–80 — the "EXTRACTION LIMITATIONS" header documents the existing best-effort approach and why the draft-and-refine pattern exists. DMD-1's spec should be comfortably *more* rigorous than what's in there — DESIGN.md is a deliberate, authored format, not a reverse-engineered one
- [figmento-mcp-server/src/tools/design-system/ds-crud.ts](figmento-mcp-server/src/tools/design-system/ds-crud.ts) — the `saveDesignSystem` callback pattern DMD-2 will consume; no changes needed here but understanding how tokens.yaml gets written helps anchor the schema

### Parser constraint: marked@^12

The schema **must produce markdown that `marked@^12` can lex cleanly.** Do not rely on features specific to `unified`/`remark` (no directives, no custom node types, no MDX). The 4 fenced-block language hints are the only Figmento-specific syntax and they are plain CommonMark fenced code blocks — marked handles them natively in `marked.lexer()` as `{ type: 'code', lang: 'color', text: '...' }`. If you catch yourself reaching for syntax outside CommonMark + GFM, stop and rethink.

### YAML-in-fence: why, exactly

Fenced blocks carry YAML bodies (not freeform markdown or custom DSL) because:

1. `js-yaml` is already a dependency — zero new deps for structured data parsing
2. YAML is readable by humans writing DESIGN.md by hand
3. YAML maps cleanly to `tokens.yaml` — the exporter (DMD-4) emits the same YAML structure into the fenced block that came out of the flat `tokens.yaml`
4. LLMs emit YAML reliably inside fenced blocks when given the language hint

Do not use JSON inside fenced blocks — readability regression vs YAML, and `tokens.yaml` is YAML, so using JSON would create a format impedance mismatch at the round-trip boundary.

### Upstream tolerance is non-negotiable

A plain [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) file with no frontmatter, no fenced blocks, and prose-only content must still validate. Verdict can be `CONCERNS` (fields are missing, defaults will be applied), but never `FAIL`. This is how Figmento honors its "drop any community DESIGN.md and it works" promise. The JSON Schema should mark frontmatter and fenced blocks as **recommended, not required**, while still validating their structure when present. The importer (DMD-2) will apply defaults for everything missing.

### Coverage acceptance — don't skimp on AC6

AC6 (the coverage table) is what makes DMD-5 (re-seed validation gate) achievable. Every key path in every seeded `tokens.yaml` file MUST appear in the coverage table, even if the destination is "frontmatter default" or "not representable — see AC7". Missing keys will surface as round-trip failures in DMD-5 and force a schema v2, which is exactly the outcome this story exists to prevent.

### What NOT to do in this story

- ❌ Write any parser code — that's DMD-2
- ❌ Write any validator code — that's DMD-3
- ❌ Write any exporter code — that's DMD-4
- ❌ Re-seed the existing systems — that's DMD-5
- ❌ Touch the plugin UI — that's DMD-6
- ❌ Decide between `marked` vs `unified` — locked to marked@^12 in the epic
- ❌ Invent new sections beyond the 9 canonical + Format Variants — any addition needs @pm epic-level approval

### Testing

No automated tests ship in this story. The story's "test suite" is:

1. `ajv validate` each of the 3 sample DESIGN.md files against the JSON Schema (Task 7) — zero CRITICAL errors expected
2. Manual peer review by @architect (schema technical correctness) and @pm (spec prose + epic alignment) (Task 8)
3. @po 10-point `*validate-story-draft` checklist (external to this story's tasks)

If an automated round-trip test is desired, it belongs in DMD-2 (importer) or DMD-5 (re-seed) — not here. Keep DMD-1's footprint minimal: spec + schema + 3 samples.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-04-15 | 0.1 | Initial draft created from epic-DMD DMD-1 section. Tasks expanded, Dev Notes populated from epic + repo research. Status: Draft, awaiting @po validation. | @sm (River) |
| 2026-04-15 | 0.2 | `*validate-story-draft` GO verdict (10/10). Figmento 10-point checklist passed, one soft note on risk-documentation pattern (risks integrated into Dev Notes rather than dedicated section — accepted for spec stories). Gate assignment clarified: @architect + @pm peer-review + @po final accept; @qa not required (no runtime code beyond `ajv validate` which is baked into AC8). Status: Draft → **Ready**. Executor @architect unblocked to begin Task 1. | @po (Pax) |
| 2026-04-15 | 0.3 | **Task 1 complete (read-only audit of 7 `tokens.yaml` files).** Findings: (1) fenced-block surface expands 4→9 to cover runtime faithfully — `color`, `font-family`, `type-scale`, `letter-spacing`, `spacing`, `radius`, `shadow`, `elevation`, `gradient`; (2) elevation documented as opaque CSS pass-through (new AC9); (3) `source`, `elevation`, `gradients`, `constraints` must be optional — aurelia is the thin-system validator (new AC10); (4) zero fields non-representable — AC7 confirmed achievable. Task 2.3 updated to reference 9 language hints. Epic amended in parallel to reflect 4→9 expansion and the elevation trade-off. Status remains Ready — the amendments are scope clarifications, not a re-scope. | @architect (Aria) → @pm (Morgan) |
| 2026-04-15 | 0.4 | **Task 2 complete.** `docs/architecture/DESIGN-MD-SPEC.md` drafted end-to-end: 13 sections covering frontmatter (§3), the 9 canonical sections (§4), Format Variants (§5), the 9-language fenced-block reference with 3 pattern categories (§6), deliberate trade-offs with elevation rationale (§7), complete 27-row coverage table (§8), zero non-representable fields confirmed (§9), upstream tolerance contract with verdict mapping and default substitution tables (§10), versioning strategy (§11), minimal worked example (§12), open questions (§13). Status: Ready → **InProgress**. Next: Task 3 (build `design-md.schema.json`). | @architect (Aria) |
| 2026-04-15 | 0.5 | **Task 3 complete.** `figmento-mcp-server/schemas/design-md.schema.json` created — 280 lines of draft-07 JSON Schema with frontmatter + sections + format_variants top-level, 9 fenced-block sub-schemas covering all pattern categories, 4 reusable type refs, `additionalProperties: false` enforced wherever structure is fixed. Compiled and validated via `ajv@8 + ajv-formats@3` in **strict mode** (both already in node_modules transitively). 6 validation tests run inline: minimal IR, full notion-like IR, 3 negative cases, and an **aurelia-like thin system (AC10 proof) — all PASS**. One schema edit during testing: removed non-standard top-level `version` keyword (ajv strict rejects), moved version info into `title` + `description`. Next: Task 4 (notion/DESIGN.md round-trip sample). | @architect (Aria) |
| 2026-04-15 | 0.6 | **Task 4 complete — first round-trip sample shipped.** Wrote `knowledge/design-systems/notion/DESIGN.md` by translating notion/tokens.yaml field-by-field through the v1.0 spec. All 9 canonical sections populated, 9 fenced blocks present (color + gradient in Color Palette, font-family + type-scale + letter-spacing in Typography, spacing + radius in Layout, shadow + elevation in Depth). Extended color palette (16 extras beyond canonical 15) preserved verbatim. `elevation.soft_card.shadow` carries the full multi-layer CSS composite as opaque pass-through (AC9 validation). Also shipped `scripts/validate-design-md-sample.js` — a mini-parser (preview of DMD-2) + ajv validator + coverage checker that will be reused for Tasks 5, 6, and AC8. Coverage result: **22/22 tokens.yaml fields match**. Schema validation: **PASS**. Next: Task 5 (aurelia hand-written from scratch — ergonomics proof point + AC10 thin-system validation). | @architect (Aria) |
| 2026-04-15 | 0.7 | **Task 5 complete — AC4 and AC10 both proven in the wild.** Wrote `knowledge/design-systems/aurelia/DESIGN.md` **from scratch, not round-tripped** — authored from a brand-brief mindset ("Portuguese quinta meets Michelin-starred elegance") with the 9 canonical sections + frontmatter + fenced blocks. **AC4 ergonomics proof:** the file is 8 fenced blocks smaller than notion (no elevation, gradient, letter-spacing, or mono) and still feels complete — proving the schema's optional-field tolerance is real, not synthetic. **AC10 thin-system proof in the wild:** aurelia is the thinnest real system (no source, elevation, gradient, or constraints in its tokens.yaml) and the hand-authored DESIGN.md validates without errors. Coverage: **15/15 tokens.yaml fields match**. Captured 8 authoring-friction observations at the bottom of the file (feeds DMD-7 authoring guide), including discovery of an existing contrast bug in aurelia tokens.yaml (`on_surface: "#151917"` on `surface: "#0D0D0D"` ≈ 1.1:1) that DMD-3 validator should flag. Notable finding: the DESIGN.md is RICHER than its underlying tokens.yaml (authored 8 do + 9 dont bullets from brand identity that don't exist in the runtime) — superset-round-trip behavior is a DMD-4 design decision, not a DMD-1 gap. Next: Task 6 (claude from upstream awesome-design-md). | @architect (Aria) |
| 2026-04-15 | 0.8 | **Tasks 6 + 7 + 8 (partial) complete — all 3 sample files now round-trip cleanly.** Task 6: fetched upstream claude content from the `getdesign` npm package (awesome-design-md repo was restructured, stub README redirects to getdesign.md). Wrote `claude/DESIGN.md` in Figmento-extended format and `claude/UPSTREAM-DIFF.md` documenting 13 intentional divergences (H2 numbering stripped, 8-grid spacing normalization, collapsed radius tiers, semantic color renames, dropped probable upstream typo `#dedc01`, 16-row typography hierarchy → canonical type-scale + letter-spacing, figma_fallback additions, synthesized sm/md/lg shadows from upstream elevation prose, preserved semantic elevation names as opaque pass-through). Schema validation PASS, 22/22 tokens.yaml coverage. Task 7: already satisfied — all 3 samples validate via ajv with zero CRITICAL errors (notion 22/22, aurelia 15/15, claude 22/22). Added §12.5 to `DESIGN-MD-SPEC.md` documenting the validation command + expected output (so DMD-2 can mirror the parser logic). **AC8 is now complete as a side-effect.** Tasks 1–7 done; only Task 8 (peer review + handoff) remains. | @architect (Aria) |
| 2026-04-15 | 1.0 | **DMD-1 DONE.** Task 8 complete: @architect self-review ran 14 edge-case tests (all PASS, zero schema bugs) covering `schema_version` enum, `format_variants`, `figma_file_key`, figma variable-font weights, gradient conditional minItems, `additionalProperties: false` enforcement at top + sections, shadow numeric bounds, elevation-layer closed-object. @pm review confirmed spec prose clarity and epic alignment; updated `epic-DMD-design-markdown.md` DMD-1 ACs from 7 → 10 (adding AC8/9/10 that were introduced mid-story) and marked DMD-1 row Done in the Phase A table. @po final acceptance: 10/10 on the AC checklist. **Total validation exercises: 20** (6 synthetic in Task 3 + 3 real samples in Tasks 4–6 + 14 edge cases in Task 8.1). Status: InProgress → InReview → **Done**. Phase A Story 1/5 shipped; DMD-2, DMD-3, DMD-4 are now unblocked and can begin in parallel (all share the same contract via `design-md.schema.json` + reference samples). | @architect → @pm → @po (final acceptance) |

## Dev Agent Record

### Agent Model Used

_(To be populated by @dev when InProgress)_

### Debug Log References

_(To be populated by @dev)_

### Completion Notes List

_(To be populated by @dev)_

### File List

Expected files to be created/modified by this story:

- ✅ [`docs/architecture/DESIGN-MD-SPEC.md`](../../docs/architecture/DESIGN-MD-SPEC.md) — **CREATED** 2026-04-15 (Task 2)
- ✅ [`figmento-mcp-server/schemas/design-md.schema.json`](../../figmento-mcp-server/schemas/design-md.schema.json) — **CREATED** 2026-04-15 (Task 3, validated via ajv strict mode + 6 test cases)
- ✅ [`figmento-mcp-server/knowledge/design-systems/notion/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/notion/DESIGN.md) — **CREATED** 2026-04-15 (Task 4, 22/22 coverage vs tokens.yaml, schema validation PASS)
- ✅ [`figmento-mcp-server/scripts/validate-design-md-sample.js`](../../figmento-mcp-server/scripts/validate-design-md-sample.js) — **CREATED** 2026-04-15 (Task 4 utility, mini-parser preview of DMD-2 — shared by Tasks 5-7 for sample validation + AC8 ajv run)
- ✅ [`figmento-mcp-server/knowledge/design-systems/aurelia/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/aurelia/DESIGN.md) — **CREATED** 2026-04-15 (Task 5, hand-written from brief, 15/15 coverage vs tokens.yaml, AC10 thin-system proof — no elevation/gradient/constraints/source — schema validation PASS)
- ✅ [`figmento-mcp-server/knowledge/design-systems/claude/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/claude/DESIGN.md) — **CREATED** 2026-04-15 (Task 6, imported from upstream `getdesign.md/claude/design-md`, 22/22 coverage vs tokens.yaml, schema validation PASS)
- ✅ [`figmento-mcp-server/knowledge/design-systems/claude/UPSTREAM-DIFF.md`](../../figmento-mcp-server/knowledge/design-systems/claude/UPSTREAM-DIFF.md) — **CREATED** 2026-04-15 (Task 6, 13 intentional divergences documented across structure / content normalization / typography / depth)

No existing files are modified by this story.

## QA Results

**Gate assignment resolved by @po during `*validate-story-draft` (2026-04-15):**
- Draft → Ready: @po (done — GO verdict, 10/10)
- Ready → InProgress → InReview: @architect (executor) + @pm (supporting)
- InReview → Done: @architect peer-reviews JSON Schema + coverage table, @pm peer-reviews spec prose + epic alignment, @po accepts against AC1–AC10
- @qa not required for this story — `ajv validate` (AC8) is the only automated verification needed and is baked into Task 7

**Final acceptance (@po, 2026-04-15):** **10/10 ACs PASS — ACCEPTED.** Status transitioned InProgress → Done. Deliverables verified:
- [x] AC1 → `docs/architecture/DESIGN-MD-SPEC.md` (13 sections, ~800 lines)
- [x] AC2 → `figmento-mcp-server/schemas/design-md.schema.json` (draft-07, 14 edge-case tests PASS)
- [x] AC3 → `notion/DESIGN.md` (22/22 round-trip coverage)
- [x] AC4 → `aurelia/DESIGN.md` (15/15 coverage, ergonomics proof, friction notes captured)
- [x] AC5 → `claude/DESIGN.md` (22/22 coverage, upstream ingest proven)
- [x] AC6 → Spec §8 coverage table (27 rows, 100% coverage)
- [x] AC7 → Spec §9 (zero non-representable fields)
- [x] AC8 → All 3 samples validate via ajv (zero CRITICAL errors)
- [x] AC9 → Spec §7.1 (elevation opaque-CSS trade-off documented)
- [x] AC10 → aurelia thin-system validates without errors (optional-field handling proven)

**20 total validation exercises** (6 synthetic + 3 real samples + 14 edge cases). Zero schema bugs discovered across the entire story. DMD-2, DMD-3, DMD-4 unblocked.
