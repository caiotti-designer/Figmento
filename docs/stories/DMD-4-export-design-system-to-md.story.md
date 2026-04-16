# DMD-4 — `export_design_system_to_md` MCP Tool

## Status: Ready

> **Epic:** [epic-DMD — DESIGN.md Pipeline](epic-DMD-design-markdown.md)
> **Phase:** A — Pipeline + Validation Gate
> **Depends on:** DMD-1 (Done — schema + 3 reference samples shipped)
> **Shares code with:** DMD-2 reciprocally — DMD-4 exports the inverse of DMD-2's `irToTokens()` + `parseDesignMd()`, and round-trip tests between the two tools are this story's primary correctness gate
> **Blocks:** DMD-5 (re-seed validation gate — requires both DMD-2 and DMD-4 to be shipped)

## Executor Assignment

| Field | Value |
|---|---|
| **executor** | @dev (Dex) |
| **quality_gate** | @qa |
| **complexity** | M (3–5 pts) — new module (tokens → IR → DESIGN.md string), canonical key ordering logic, round-trip fidelity tests against all 7 seeded systems |

## Story

**As a** Figmento user who has a design system stored as `tokens.yaml`,
**I want** to export it as a well-formatted DESIGN.md file that I can share with Cursor, Claude Desktop, Cline, or any LLM agent outside Figmento,
**so that** my Figmento-authored design system becomes portable interchange — not trapped in a Figmento-specific yaml file — and so that the authoring cycle (edit DESIGN.md → import → preview → edit DESIGN.md again) becomes a real workflow rather than a theoretical one.

## Background

DMD-2 (import) is only half the contract. Without DMD-4 (export), a Figmento design system is a one-way street: you can bring a DESIGN.md in, but you can't get it back out. That breaks three things:

1. **Ecosystem interchange.** The whole point of DESIGN.md is that it's portable markdown consumable by any LLM tool. Figmento users need to export their systems as DESIGN.md to share with their team's Cursor setup, their Claude Desktop workflows, or the broader awesome-design-md community.

2. **The authoring edit-cycle.** A user who wants to iterate on their design system needs to: export current state → edit the markdown → re-import → preview the change. Without an exporter, the edit cycle stalls after the first import.

3. **DMD-5's validation gate.** The Phase A validation story requires round-trip verification for all 7 seeded systems (`tokens.yaml → DESIGN.md → tokens.yaml` byte-identical). DMD-5 cannot start until DMD-4 exists.

### Round-trip fidelity is the central technical challenge

DMD-4's bar isn't "produce readable markdown." It's **byte-identical round-trip**: starting from a committed `tokens.yaml`, calling `export_design_system_to_md` produces a DESIGN.md that, when fed back through DMD-2's import, yields the original `tokens.yaml` byte-for-byte (after canonical key ordering is applied to both).

This requires the exporter to:

- Emit fenced blocks in a deterministic key order (alphabetical, or a fixed canonical order per block type)
- Choose YAML quoting consistently (always quote strings in the color/letter-spacing blocks, never in the type-scale block because numbers don't need quotes)
- Preserve non-canonical color keys (`warm_white`, `focus_blue`, `ship_red`) in whatever order they appear in the source yaml — OR sort them all alphabetically; decision documented in the story
- Not invent fields that weren't in the source (if tokens.yaml has no elevation, the exported DESIGN.md has no ` ```elevation ` block)
- Preserve the date-quoting convention from DMD-1 (`created: "2026-04-04T00:00:00.000Z"` with quotes)

The 3 DMD-1 reference samples (notion, aurelia, claude) are the immediate regression targets. The 4 other seeded systems (figma, linear, stripe, vercel) are the extended test surface — they don't have committed DESIGN.md files yet, so DMD-4 will generate them as a side-effect of the round-trip test suite.

### Aurelia is a special case

aurelia's committed `DESIGN.md` is a **superset** of its `tokens.yaml` — the DESIGN.md includes 8 Do's and 9 Don'ts authored from the brand brief that don't exist in the runtime tokens. If DMD-4 re-exports tokens.yaml → DESIGN.md, those authored do/dont bullets disappear. This is the intentional trade-off flagged in DMD-1's change log 0.7 and left for DMD-4 to decide.

**DMD-4 must make an explicit decision here** — Task 6 below forces the issue. The three options:
1. **Export-from-tokens.yaml is canonical** — authored extras in DESIGN.md that aren't in tokens.yaml get dropped on re-export. Round-trip breaks for aurelia.
2. **Preserve handcrafted content when re-exporting** — parse the existing DESIGN.md (if present), diff authored content against what can be derived from tokens.yaml, merge the two. Round-trip is preserved but the implementation is more complex.
3. **Warn the user** — export from tokens.yaml, but if an existing DESIGN.md is detected at the target path, compare and warn about content that will be lost. User decides whether to proceed.

My recommendation (for @dev to confirm during implementation): **option 3** for the MCP tool behavior plus **option 1 for the round-trip test suite** — the test suite exports clean from tokens.yaml only (no merge), and aurelia's round-trip test is narrowed to "fields in tokens.yaml match fields in the re-imported tokens.yaml" rather than "the DESIGN.md file is byte-identical to the committed one."

## Acceptance Criteria

1. **AC1 — Tool registration.** `export_design_system_to_md` is registered as an MCP tool in [`ds-extraction.ts`](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts). Wired through [`index.ts`](../../figmento-mcp-server/src/tools/design-system/index.ts).

2. **AC2 — Inputs.** Accepts `{ name: string, outputPath?: string }`. When `outputPath` is omitted, writes to `knowledge/design-systems/{name}/DESIGN.md` (next to tokens.yaml). When provided, writes to the given path. Zod schema defined in [`ds-schemas.ts`](../../figmento-mcp-server/src/tools/design-system/ds-schemas.ts).

3. **AC3 — Frontmatter emission.** Emits a YAML frontmatter block with `name`, `version` (from tokens.yaml or default `1.0.0`), `created` (preserved from tokens.yaml as quoted string), `source_url` (from tokens.yaml `source` field when present), `preset_used`, `schema_version: "1.0"`. Optional fields (`source_url`, `preset_used`) are only emitted when the source tokens.yaml has them.

4. **AC4 — All 9 canonical sections emitted.** Every export produces all 9 H2 headings (`## Visual Theme & Atmosphere`, `## Color Palette & Roles`, `## Typography Rules`, `## Component Stylings`, `## Layout Principles`, `## Depth & Elevation`, `## Do's and Don'ts`, `## Responsive Behavior`, `## Agent Prompt Guide`). Sections without backing runtime data emit a placeholder (`_Not specified in tokens.yaml — add prose here if authoring the design system by hand._`).

5. **AC5 — Fenced blocks emitted only when backing data exists.** If `tokens.yaml.elevation` is missing, NO ` ```elevation ` block is emitted. Same for `gradient`, `letter-spacing`, `mono` in font-family, etc. This preserves the thin-system tolerance contract from DMD-1 AC10.

6. **AC6 — Canonical key ordering for deterministic output.** Define a canonical key order per fenced block (documented in a new `docs/architecture/DESIGN-MD-EXPORT-CANONICAL-ORDER.md` file, or inlined as a constant in the exporter module). The order for `color`: canonical 15 first in spec order, then extended keys alphabetically. For `spacing`/`radius`/`shadow`: fixed key order per their schema definition. For `type-scale`/`letter-spacing`: canonical 10 first in spec order, then extras alphabetically. For `elevation`: semantic names in source-encounter order (preserved from tokens.yaml iteration order).

7. **AC7 — Round-trip fidelity on notion.** Running DMD-4 on notion produces a DESIGN.md that, when imported via DMD-2, yields a tokens.yaml byte-identical to the committed `notion/tokens.yaml`. Whitespace and key order count. This is the first and strictest round-trip test.

8. **AC8 — Round-trip fidelity on claude.** Same as AC7 but for claude. The opaque CSS pass-through in `elevation` must survive round-trip — the multi-layer shadow composite strings emit verbatim and re-parse identically.

9. **AC9 — Round-trip semantic fidelity on aurelia.** Aurelia's round-trip test is weaker: starting from the committed `aurelia/tokens.yaml`, DMD-4 produces a DESIGN.md (not byte-identical to the committed aurelia/DESIGN.md because the committed one is a superset), and re-importing that DESIGN.md via DMD-2 yields a tokens.yaml byte-identical to the original `aurelia/tokens.yaml`. The test documents the superset divergence and explicitly asserts that the authored do/dont extras are NOT in the re-exported file (proving the export-from-tokens-canonical policy).

10. **AC10 — Round-trip on all 7 seeded systems.** In addition to the 3 DMD-1 samples, DMD-4 round-trips cleanly on figma, linear, stripe, vercel (the 4 systems that have `tokens.yaml` but no committed `DESIGN.md` yet). Each produces a valid DESIGN.md and the re-imported tokens.yaml matches the original byte-for-byte.

11. **AC11 — No overwrite without consent.** If `outputPath` (explicit or implicit) already has a file, the tool detects the collision and returns `{ exported: false, reason: 'FILE_EXISTS', suggestion: 'pass overwrite: true to replace' }`. Accepts an optional `overwrite: boolean` input that bypasses the check.

12. **AC12 — Response shape.** On success: `{ exported: true, outputPath, markdown, irSummary: { sectionCount, fencedBlockCount, frontmatterKeys } }`. On collision: `{ exported: false, reason, suggestion }`. The `markdown` field is the full emitted text — useful for callers who want to inspect without reading the file back.

## Tasks / Subtasks

- [ ] **Task 1: Build the `tokens → IR` converter (inverse of DMD-2 Task 5) (AC: 3, 4, 5)**
  - [ ] 1.1 Create `figmento-mcp-server/src/tools/design-system/ds-tokens-to-md.ts`
  - [ ] 1.2 Export `tokensToIR(tokens: DesignTokens): DesignMdIR` — pure function, no I/O
  - [ ] 1.3 Map `tokens.name`, `tokens.created`, `tokens.source`, `tokens.preset_used` → `ir.frontmatter`
  - [ ] 1.4 Always set `ir.frontmatter.version = "1.0.0"` if not stored in tokens, `ir.frontmatter.schema_version = "1.0"`
  - [ ] 1.5 Map `tokens.mood` → `sections.visual_theme_atmosphere.mood`; `tokens.voice` → `sections.visual_theme_atmosphere.prose`
  - [ ] 1.6 Map `tokens.colors` → `sections.color_palette_roles.color`; `tokens.gradients` → `sections.color_palette_roles.gradient` (only if present — AC5)
  - [ ] 1.7 Map `tokens.typography.{heading,body,mono,opentype_features,tabular_features}` → `sections.typography_rules.font_family` — OMIT mono subkey if not present in tokens; OMIT opentype_features if empty-or-absent; OMIT tabular_features if absent
  - [ ] 1.8 Map `tokens.typography.scale` → `sections.typography_rules.type_scale`; `tokens.typography.letter_spacing` → `sections.typography_rules.letter_spacing` (only if present)
  - [ ] 1.9 Map `tokens.spacing`, `tokens.radius` → `sections.layout_principles.{spacing,radius}`
  - [ ] 1.10 Map `tokens.shadows` → `sections.depth_elevation.shadow`; `tokens.elevation` → `sections.depth_elevation.elevation` (only if present)
  - [ ] 1.11 Map `tokens.constraints.do/dont` → `sections.dos_and_donts.{do,dont}` (only if present)
  - [ ] 1.12 Map `tokens.format_variants` → `ir.format_variants` (only if present)
  - [ ] 1.13 Sections without backing data: visual_theme if no mood AND no voice → emit `sections.visual_theme_atmosphere: {}`; layout_principles if no spacing AND no radius → same; etc. Empty section objects signal "placeholder needed" downstream

- [ ] **Task 2: Build the `IR → markdown` renderer (AC: 4, 5, 6)**
  - [ ] 2.1 Create `figmento-mcp-server/src/tools/design-system/ds-ir-to-markdown.ts`
  - [ ] 2.2 Export `renderMarkdown(ir: DesignMdIR): string` — pure function
  - [ ] 2.3 Render frontmatter: emit `---\n` + yaml.dump(ir.frontmatter, { quotingType: '"', forceQuotes: false }) + `---\n\n`. CRITICAL: the `created` field must be quoted — pass the value to `yaml.dump` as a string so it stays quoted, do NOT pass it as a Date object
  - [ ] 2.4 For each of the 9 canonical sections (in spec order — NOT in source order from the IR), emit:
    - H2 heading (spec canonical name — see DMD-1 §4)
    - Blank line
    - If `section.prose` present: prose paragraph(s) + blank line
    - If `section.mood` present: `**Mood**: a, b, c` line + blank line
    - For each known fenced-block key in the section (in canonical order — e.g., color before gradient in `color_palette_roles`): emit ` ``` <lang-hint>\n` + `yaml.dump(block)` + ` ``` ` + blank line
    - For `dos_and_donts` section: emit `### Do` heading + list of `- item` lines, then `### Don't` heading + list, each followed by blank line
    - If the section has no backing content: emit `_Not specified in tokens.yaml — add prose here if authoring the design system by hand._` placeholder + blank line
  - [ ] 2.5 Define the canonical emission order per fenced-block type — hardcoded constant:
    - `color`: 15 canonical keys in spec order (primary, primary_light, primary_dark, secondary, accent, surface, background, border, on_primary, on_surface, on_surface_muted, success, warning, error, info), then blank line, then extended keys alphabetically
    - `font-family`: heading, body, mono (if present), opentype_features (if present), tabular_features (if present)
    - `type-scale`: display, h1, h2, h3, heading, body_lg, body, body_sm, caption, label, then extras alphabetically (micro, tiny, nano, overline)
    - `letter-spacing`: same role order as type-scale, then extras alphabetically
    - `spacing`: unit, xs, sm, md, lg, xl, 2xl, 3xl (fixed)
    - `radius`: none, sm, md, lg, xl, full (fixed)
    - `shadow`: sm, md, lg (fixed) — each with sub-keys `x, y, blur, spread, color, opacity` in that order
    - `elevation`: source-encounter order (iterate the IR object's own key order)
    - `gradient`: enabled, direction (if enabled), colors (if enabled), note (if present)
  - [ ] 2.6 `yaml.dump` options: use double-quote string style, force-quote the `created` frontmatter value only, preserve integer types for numbers, 2-space indent

- [ ] **Task 3: Build the `export_design_system_to_md` MCP tool (AC: 1, 2, 11, 12)**
  - [ ] 3.1 Register in [`ds-extraction.ts`](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts)
  - [ ] 3.2 Define input Zod schema in [`ds-schemas.ts`](../../figmento-mcp-server/src/tools/design-system/ds-schemas.ts): `{ name: string, outputPath?: string, overwrite?: boolean }`
  - [ ] 3.3 Handler: resolve tokens.yaml path from `name` → load via `js-yaml` → call `tokensToIR` → call `renderMarkdown` → check outputPath collision → write file (or return collision error)
  - [ ] 3.4 Collision detection: use `fs.existsSync(outputPath)`. If true and `overwrite !== true`, return `{ exported: false, reason: 'FILE_EXISTS', ... }`
  - [ ] 3.5 `irSummary` in response: count sections with backing content, count fenced blocks emitted, list frontmatter keys

- [ ] **Task 4: Round-trip test suite against all 7 seeded systems (AC: 7, 8, 9, 10)**
  - [ ] 4.1 Create `figmento-mcp-server/tests/ds-md-roundtrip.test.ts`
  - [ ] 4.2 Test fixture: load each tokens.yaml, call `tokensToIR`, call `renderMarkdown`, run the result through DMD-2's parser → validator → `irToTokens`, and deep-compare the result to the original tokens.yaml
  - [ ] 4.3 notion — byte-identical round-trip required (AC7)
  - [ ] 4.4 claude — byte-identical round-trip required (AC8). Assert that elevation CSS composite strings are preserved verbatim
  - [ ] 4.5 aurelia — **semantic round-trip** (AC9). Export from tokens.yaml (not from the existing DESIGN.md), re-import, compare the re-imported tokens.yaml to the original. Document the aurelia/DESIGN.md superset divergence in an inline test comment
  - [ ] 4.6 figma, linear, stripe, vercel — byte-identical round-trip required (AC10). Note: these systems do NOT have committed DESIGN.md files, so the export step creates new files. Do NOT commit them as part of DMD-4 unless explicitly instructed — they're test artifacts until DMD-5's re-seed gate
  - [ ] 4.7 If ANY of the 7 systems fail round-trip, the failure is a blocker — iterate the canonical key order, YAML quoting, or IR mapping until all 7 pass

- [ ] **Task 5: Canonical key order documentation (AC: 6)**
  - [ ] 5.1 Option A (chosen if the key order fits on one page): inline the canonical order constants directly in `ds-ir-to-markdown.ts` with code comments explaining each order decision
  - [ ] 5.2 Option B (chosen if the docs need expansion): create `docs/architecture/DESIGN-MD-EXPORT-CANONICAL-ORDER.md` with the full key order table
  - [ ] 5.3 @dev picks A or B during implementation based on the expansion needed. Default: A (keep it in the code)

- [ ] **Task 6: Aurelia superset decision (AC: 9)**
  - [ ] 6.1 Confirm policy: **export-from-tokens is canonical**. Aurelia's committed DESIGN.md has extras (do/dont bullets authored from brief) that don't exist in tokens.yaml — those extras are dropped on re-export
  - [ ] 6.2 When the tool is invoked on aurelia and the target path already has a file, the collision warning (AC11) fires, and the user sees what would be overwritten before committing
  - [ ] 6.3 Add a note to [DESIGN-MD-SPEC.md §13](../architecture/DESIGN-MD-SPEC.md) "Open Questions" — document this decision explicitly so future contributors understand the trade-off
  - [ ] 6.4 If @dev prefers a different policy (option 2: preserve handcrafted content via merge), raise it to @architect before implementing — policy changes are a spec amendment, not an implementation detail

- [ ] **Task 7: Regression check + handoff**
  - [ ] 7.1 Run the full `figmento-mcp-server` test suite — confirm no regressions
  - [ ] 7.2 Run `npm run lint` and `npm run build` — confirm clean
  - [ ] 7.3 Update epic change log with "DMD-4 shipped — all 7 seeded systems round-trip byte-identical"
  - [ ] 7.4 Notify DMD-5's author (@dev) that Phase A's re-seed gate is now unblocked

## Dev Notes

### Source of truth

- **Spec:** [`docs/architecture/DESIGN-MD-SPEC.md`](../architecture/DESIGN-MD-SPEC.md) — especially §4 (section names), §6 (fenced-block languages), §10 (tolerance contract)
- **Schema:** [`figmento-mcp-server/schemas/design-md.schema.json`](../../figmento-mcp-server/schemas/design-md.schema.json) — exported markdown must parse back to an IR that validates against this
- **Reference samples:** [`notion/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/notion/DESIGN.md), [`aurelia/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/aurelia/DESIGN.md), [`claude/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/claude/DESIGN.md) — DMD-4 should produce output structurally similar to these (not byte-identical for aurelia, but similar)

### The round-trip contract is the story's core

Everything else is plumbing. The central test is:

```
original tokens.yaml
  → tokensToIR()
    → renderMarkdown()
      → parseDesignMd()      (from DMD-2)
        → validateDesignMdIR()  (from DMD-2/3)
          → irToTokens()          (from DMD-2)
            → compareTo(original)   → must equal
```

If this chain produces a different tokens.yaml, the story fails. The 7-system round-trip test suite is the acceptance gate.

### YAML output quoting — the sharp edge

`js-yaml`'s `dump()` function has several quirks relevant to DMD-4:

- Dates are emitted with single quotes by default: `created: '2026-04-04T00:00:00.000Z'`. Tokens.yaml uses single quotes. DESIGN.md uses double quotes per the DMD-1 convention. **The exporter must force double quotes on the `created` field** to match DMD-1's samples. Use `yaml.dump(obj, { quotingType: '"', forceQuotes: true })` on just the frontmatter object
- Inside fenced blocks, YAML is more permissive — double quotes are fine everywhere. Use `{ quotingType: '"', forceQuotes: false }` for block bodies so integers stay bare and strings get quoted
- `js-yaml` auto-detects whether to quote strings. For consistency, force-quote strings in `color`, `letter-spacing`, and `font-family.fallback` blocks. Don't force-quote numbers in `type-scale` or `spacing` or `radius`
- Numbers with decimal parts (`9.6` in micro type-scale) must emit as `9.6` not `9.6000000001` — use `dump` with default number formatting

### Why byte-identical round-trip and not just semantic

Semantic round-trip is easy: export any output, re-import, compare the parsed IRs. But that doesn't give us a reproducible artifact — two DMD-4 runs could produce cosmetically different DESIGN.md files that are both "semantically correct." The tokens.yaml file IS the source of truth, and we want the DESIGN.md file to be a deterministic function of it so that:

1. Git diffs on tokens.yaml changes produce predictable diffs on the corresponding DESIGN.md
2. DMD-5's re-seed gate has a reproducible artifact to check
3. Cross-contributor consistency: two developers running the exporter on the same tokens.yaml get the same file

This means canonical key ordering is not a nice-to-have — it's load-bearing for the test suite.

### aurelia's contrast bug is informational

Aurelia's committed `tokens.yaml` has `on_surface: "#151917"` on `surface: "#0D0D0D"` which is ~1.1:1 contrast — a bug discovered during DMD-1 Task 5. DMD-4 does NOT fix this bug (out of scope) — it faithfully exports the bug. DMD-3's validator will surface it as a HIGH issue on import. This is correct behavior — the exporter is not a quality tool, it's a converter.

### Shared test infrastructure with DMD-2

The test suite in Task 4 depends on DMD-2 being available. If DMD-4 ships before DMD-2, these round-trip tests cannot run — the story can still ship the exporter module in isolation, and the tests mark `.skip()` until DMD-2 lands. Document this in the story's handoff notes.

Alternative: DMD-4 could ship with ITS OWN test-time importer (a second copy of `parseDesignMd` + `validateDesignMdIR` + `irToTokens`) to remove the DMD-2 dependency. **Do not do this** — duplication is worse than a skipped test. The dependency is explicit and intentional.

### What NOT to do

- ❌ **Do not modify tokens.yaml files.** The exporter reads them and writes DESIGN.md. Never round-trip INTO tokens.yaml from this story
- ❌ **Do not fix aurelia's contrast bug.** Out of scope; fix in a separate story
- ❌ **Do not invent new sections** not in DMD-1's 9-canonical list. The spec is locked
- ❌ **Do not change `design-md.schema.json`**. Also locked
- ❌ **Do not add a CLI entry point.** DMD-4 is an MCP tool, not a standalone CLI. Callers use MCP
- ❌ **Do not commit the auto-generated DESIGN.md files** for figma/linear/stripe/vercel during this story. They become test artifacts; DMD-5 decides whether to commit them as part of the re-seed gate

### Testing standards

- Test framework: Jest
- The round-trip test is the primary gate. Everything else is supporting unit coverage
- Regression: existing design-system test suite must continue to pass

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-04-15 | 0.1 | Initial draft from @sm. Exporter story scoped against the 7-system round-trip gate. Central technical challenge: canonical key ordering + YAML quoting discipline for byte-identical round-trip. aurelia superset divergence documented and resolved via policy (export-from-tokens canonical, collision warning on overwrite). Story deliberately defers DMD-5's re-seed commit decision — DMD-4 produces files, DMD-5 decides what's committed. | @sm (River) |
| 2026-04-15 | 0.2 | `*validate-story-draft` GO verdict (10/10). Figmento 10-point checklist passed. Notable @po finding: DMD-4 has the **strongest risk documentation** of the three Phase A tool stories — round-trip fidelity is articulated as the central technical challenge in the Background section, not buried as an integrated Dev Note. aurelia superset policy is explicitly resolved in Task 6. Sequencing note: DMD-4's round-trip test suite depends on DMD-2 existing; **recommend implementing DMD-4 last of the three** (DMD-3 → DMD-2 → DMD-4) so the test chain can run end-to-end from day one. DMD-3 and DMD-4 can technically parallelize if @dev is careful with parser mocks, but DMD-4-last is the safer path. Status: Draft → **Ready**. | @po (Pax) |

## Dev Agent Record

_(To be populated by @dev when InProgress)_

## QA Results

_(To be populated by @qa after @dev completes)_
