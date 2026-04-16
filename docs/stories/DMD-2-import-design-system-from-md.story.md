# DMD-2 — `import_design_system_from_md` MCP Tool (+ auto-preview hook)

## Status: Ready

> **Epic:** [epic-DMD — DESIGN.md Pipeline](epic-DMD-design-markdown.md)
> **Phase:** A — Pipeline + Validation Gate
> **Depends on:** DMD-1 (Done — schema + spec + reference samples all shipped)
> **Shares validation logic with:** DMD-3 (both consume a common `ds-md-validator.ts` module — whichever ships first creates it, the other imports it)
> **Blocks:** DMD-5 (re-seed validation gate needs DMD-2 + DMD-4)

## Executor Assignment

| Field | Value |
|---|---|
| **executor** | @dev (Dex) |
| **quality_gate** | @qa (with @architect consultation on parser decisions) |
| **complexity** | L (5–8 pts) — new MCP tool, new parser module, new shared validator, 3 sample-file integration tests |

## Story

**As a** Figmento user who has a DESIGN.md file (either hand-authored, exported from Cursor/Claude Desktop, or downloaded from the awesome-design-md ecosystem),
**I want** to import it into Figmento with a single MCP tool call and optionally see it materialize as a preview frame in Figma,
**so that** any DESIGN.md file in the wild becomes a first-class Figmento design system without manual yaml editing — closing the loop on DMD-1's authoring format promise.

## Background

DMD-1 shipped the **authoring format**: a markdown spec, a JSON Schema, 3 reference samples, and a mini-parser reference implementation in [`scripts/validate-design-md-sample.js`](../../figmento-mcp-server/scripts/validate-design-md-sample.js). DMD-2 turns that authoring format into a **runnable pipeline**: an MCP tool that a Figmento user (or any LLM agent consuming the MCP server) can call to ingest a DESIGN.md file and produce a saved `tokens.yaml` + an optional live Figma preview.

The parser decision is locked to `marked@^12` ([epic change log, 2026-04-15](epic-DMD-design-markdown.md)). The mini-parser in DMD-1's validator script uses a regex-based approach for speed of iteration; DMD-2 replaces it with marked's proper lexer while preserving the same IR shape (so the schema written for DMD-1 remains authoritative). The reference implementation in `scripts/validate-design-md-sample.js` is the behavioral baseline — marked's lexer should produce richer tokens, but the IR that validates against `design-md.schema.json` must match the current output byte-for-byte.

### Why the mini-parser isn't enough

`scripts/validate-design-md-sample.js` was built as a DMD-1 Task 4 utility. It works for the 3 reference samples because they were authored against a locked spec. Production DESIGN.md files — especially those from the awesome-design-md ecosystem — will have variations the mini-parser doesn't handle: numbered H2 headings (`## 1. Visual Theme & Atmosphere`), nested fenced blocks inside prose (for illustration), inline-code-style color references mixed with structured blocks, bullet-list do/dont with category tags, and so on. marked's lexer handles these natively without regex maintenance.

### Why DMD-2 ships with validation baked in

Per [DMD-1 spec §10](../architecture/DESIGN-MD-SPEC.md), a plain upstream DESIGN.md must validate as `CONCERNS` (not `FAIL`) even when missing frontmatter and fenced blocks. That tolerance contract is part of the import pipeline, not a separate tool call — if DMD-2 imported a file and then the user had to call DMD-3 separately to find out what was wrong, the feedback loop would be miserable. DMD-2 runs the validation pipeline internally before writing `tokens.yaml`, refuses to save on `FAIL` (CRITICAL errors), and returns a structured report. DMD-3 will expose the same validation logic as a standalone MCP tool for users who want validation without import.

### Auto-preview hook (absorbed from old DMD-6 scope)

DMD-2 accepts an optional `previewInFigma: boolean` parameter. When `true` and Figma is connected, the tool auto-invokes [`design_system_preview`](../../figmento-mcp-server/src/tools/design-system/ds-analysis.ts#L48) after save. When `true` but Figma is NOT connected, the tool succeeds with a warning — it does NOT fail. This behavior is already documented in the story's AC7/AC8.

## Acceptance Criteria

1. **AC1 — Tool registration.** `import_design_system_from_md` is registered as an MCP tool in [`figmento-mcp-server/src/tools/design-system/ds-extraction.ts`](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts) alongside `generate_design_system_from_url` and `refine_design_system`. Wired through [`figmento-mcp-server/src/tools/design-system/index.ts`](../../figmento-mcp-server/src/tools/design-system/index.ts) using the existing `saveDesignSystem` callback pattern.

2. **AC2 — Input modes.** The tool accepts `{ path: string }` OR `{ content: string, name: string }` — path mode reads the file via `fs.readFileSync`, content mode takes inline markdown. Validated via Zod schema in [`ds-schemas.ts`](../../figmento-mcp-server/src/tools/design-system/ds-schemas.ts). When both are provided, `path` wins and `content`/`name` are ignored (documented in the Zod schema description).

3. **AC3 — Parser uses `marked@^12`.** Add `marked@^12` to `figmento-mcp-server/package.json` dependencies. Replace the regex-based fenced-block extraction in the reference script with marked's `marked.lexer()` token walker. Frontmatter is still parsed via `js-yaml` after manual `---` delimiter extraction (marked doesn't handle YAML frontmatter natively).

4. **AC4 — IR shape matches `design-md.schema.json`.** The parser produces an intermediate representation identical in shape to what [`scripts/validate-design-md-sample.js`](../../figmento-mcp-server/scripts/validate-design-md-sample.js) emits today. Specifically: `{ frontmatter, sections, format_variants? }` with section keys in snake_case (`visual_theme_atmosphere`, `color_palette_roles`, ...) and fenced blocks keyed by their language hint (`color`, `font_family`, `type_scale`, `letter_spacing`, `spacing`, `radius`, `shadow`, `elevation`, `gradient`). Date objects from js-yaml's timestamp auto-conversion are normalized to ISO strings via JSON round-trip (preserved from the reference script).

5. **AC5 — 9 canonical sections, numbered-heading tolerance.** The parser accepts both `## Visual Theme & Atmosphere` and `## 1. Visual Theme & Atmosphere` forms (stripping the optional numeric prefix). This is part of the upstream tolerance contract — awesome-design-md files use numbered headings while Figmento canonicalizes to unnumbered.

6. **AC6 — Built-in validation pass.** Before writing `tokens.yaml`, the tool runs a shared validation pipeline implemented in a new module `figmento-mcp-server/src/tools/design-system/ds-md-validator.ts`. The module exports `validateDesignMdIR(ir): ValidationReport` — takes the parsed IR and returns `{ verdict: 'PASS' | 'CONCERNS' | 'FAIL', issues: [...] }`. Validation combines (a) `ajv` structural check against `design-md.schema.json`, (b) semantic checks: hex validity, WCAG contrast on on/primary + on/surface (minimum 4.5:1), font availability against a bundled font list, 8px-grid snap recommendation, token-reference resolution (`on_surface` references a color that exists). On `FAIL` verdict (any CRITICAL severity), the tool refuses to save and returns the issues list in the response.

7. **AC7 — Auto-preview when Figma connected.** Accepts optional `previewInFigma: boolean` (default `false`). When `true` and `isConnectedToFigma()` returns true, after saving tokens.yaml the tool invokes `design_system_preview({ system: savedName })` and includes the preview result in the response under a `preview` key.

8. **AC8 — Graceful degradation when Figma not connected.** When `previewInFigma: true` but Figma is not connected, the tool succeeds (returns the saved tokens.yaml path) with `warning: "Figma not connected — skipping preview"` appended to the response. Does NOT throw.

9. **AC9 — Response shape.** On success: `{ systemName, tokensPath, verdict, issues?, preview?, warning? }`. On `FAIL` verdict: `{ verdict: 'FAIL', issues: [...], savedPath: null }`. `issues` shape follows DMD-3's contract: `{ severity, category, line?, message, suggestion? }`.

10. **AC10 — Integration tests against the 3 DMD-1 reference samples.** Jest tests under `figmento-mcp-server/tests/` (or wherever the project's jest config points — check `jest.config.js`) that call `import_design_system_from_md` with each of the 3 samples (notion, aurelia, claude) and assert: (a) verdict is `PASS` or `CONCERNS`, never `FAIL`; (b) the emitted `tokens.yaml` round-trips byte-identical to the committed one for notion and claude; (c) aurelia's emitted tokens.yaml is valid and contains the 15 canonical color keys without the missing fields (elevation, gradients, constraints, source) appearing as empty objects — they should be absent.

11. **AC11 — Unit tests for edge cases.** Jest tests covering: (a) valid frontmatter, (b) missing frontmatter (defaults applied), (c) missing section (`CONCERNS` verdict), (d) missing both color and typography sections (`FAIL`), (e) malformed color block (single block rejected, others import), (f) invalid hex `#XYZ` (HIGH warning), (g) unknown font family (MEDIUM warning), (h) duplicate name collision (importer prompts for overwrite or renames).

12. **AC12 — No regressions.** The existing design-system test suite passes unchanged. `generate_design_system_from_url`, `refine_design_system`, `design_system_preview`, and `get_design_system` continue to work with the 7 existing seeded systems.

## Tasks / Subtasks

- [ ] **Task 1: Add `marked@^12` dependency (AC: 3)**
  - [ ] 1.1 `cd figmento-mcp-server && npm install marked@^12 --save`
  - [ ] 1.2 Verify the install added a single top-level dep + no transitive peer warnings
  - [ ] 1.3 Commit the `package.json` + `package-lock.json` changes as part of this story's commit

- [ ] **Task 2: Build the shared `ds-md-validator.ts` module (AC: 6)**
  - [ ] 2.1 Create `figmento-mcp-server/src/tools/design-system/ds-md-validator.ts`
  - [ ] 2.2 Export `validateDesignMdIR(ir: DesignMdIR): ValidationReport` — the pure function contract both DMD-2 and DMD-3 consume
  - [ ] 2.3 Implement structural validation via ajv compile (load schema from `schemas/design-md.schema.json`)
  - [ ] 2.4 Implement semantic checks: hex validity regex, WCAG contrast (reuse existing `hexToRgb` + `relativeLuminance` utilities from [`utils/color.ts`](../../figmento-mcp-server/src/tools/utils/color.ts)), 8px-grid snap check on spacing values (warn if value % 4 !== 0), token-reference resolution (verify `on_surface` etc. reference existing color keys)
  - [ ] 2.5 Font availability check — load the bundled font list from [`list_available_fonts`](../../figmento-mcp-server/src/tools/design-system/) and compare against `typography.heading.family` + `typography.body.family` + `typography.mono.family`. Unknown fonts produce MEDIUM warnings, not failures
  - [ ] 2.6 Define the `ValidationReport` TypeScript type: `{ verdict: 'PASS' | 'CONCERNS' | 'FAIL', issues: Issue[] }` with `Issue = { severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', category, message, suggestion?, line? }`
  - [ ] 2.7 Verdict mapping: any CRITICAL → FAIL; any HIGH or MEDIUM (no CRITICAL) → CONCERNS; nothing → PASS

- [ ] **Task 3: Build the DESIGN.md parser (AC: 3, 4, 5)**
  - [ ] 3.1 Create `figmento-mcp-server/src/tools/design-system/ds-md-parser.ts`
  - [ ] 3.2 Export `parseDesignMd(markdown: string): DesignMdIR` — the pure function contract
  - [ ] 3.3 Extract frontmatter block (`^---\n...\n---\n` regex), parse with `js-yaml`
  - [ ] 3.4 Walk the rest of the markdown via `marked.lexer()`, iterating tokens to find H2 headings
  - [ ] 3.5 Section-heading normalization: strip `\s*\d+\.\s*` prefix if present (numbered-heading tolerance), map text → snake_case key via a constant lookup table
  - [ ] 3.6 For each section, collect subsequent tokens until the next H2, extract `{ type: 'code', lang: 'color' | 'font-family' | ..., text }` tokens, parse each body with `js-yaml`
  - [ ] 3.7 Special-case `mood` extraction (bullet list under "Mood" sub-heading or `**Mood**:` inline form)
  - [ ] 3.8 Special-case `### Do` / `### Don't` sub-heading extraction for `dos_and_donts`
  - [ ] 3.9 JSON round-trip normalization at the end (`JSON.parse(JSON.stringify(ir))`) to convert Date objects to ISO strings and drop undefined values — matches the reference script behavior
  - [ ] 3.10 Import the TypeScript type `DesignMdIR` (which mirrors `design-md.schema.json`) from a new shared types file

- [ ] **Task 4: Build the `import_design_system_from_md` MCP tool (AC: 1, 2, 7, 8, 9)**
  - [ ] 4.1 Register the tool in [`ds-extraction.ts`](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts) alongside existing extraction tools. Wire via [`index.ts`](../../figmento-mcp-server/src/tools/design-system/index.ts) using `saveDesignSystem` callback
  - [ ] 4.2 Define the input Zod schema in [`ds-schemas.ts`](../../figmento-mcp-server/src/tools/design-system/ds-schemas.ts) — discriminated union on `{ path } | { content, name }`, optional `previewInFigma: boolean`
  - [ ] 4.3 Tool handler: resolve input → read content → call `parseDesignMd` → call `validateDesignMdIR` → if FAIL, return issues without saving; if PASS or CONCERNS, convert IR to tokens.yaml schema and save via `saveDesignSystem` callback
  - [ ] 4.4 Name resolution: frontmatter `name` wins; fall back to filename basename (path mode) or the `name` input param (content mode)
  - [ ] 4.5 Duplicate-name handling: check for existing `knowledge/design-systems/{name}/tokens.yaml`; if present, return a `DUPLICATE_NAME` issue with suggestion to pass `name: "<new>"` or use `overwrite: true` (add an optional `overwrite: boolean` input)
  - [ ] 4.6 Preview hook: if `previewInFigma: true`, check `isConnectedToFigma()` (existing utility) → if connected, call `design_system_preview({ system: savedName })` and attach result; if not, attach warning and succeed
  - [ ] 4.7 Response assembly: return the full shape from AC9 with all optional fields populated as applicable

- [ ] **Task 5: IR → tokens.yaml converter (AC: 4)**
  - [ ] 5.1 Create `figmento-mcp-server/src/tools/design-system/ds-md-to-tokens.ts`
  - [ ] 5.2 Export `irToTokens(ir: DesignMdIR): DesignTokens` — pure function
  - [ ] 5.3 Map frontmatter → top-level tokens.yaml fields (`name`, `created`, `source_url → source`, `preset_used`)
  - [ ] 5.4 Map `sections.visual_theme_atmosphere.mood` → `tokens.yaml.mood`; `sections.visual_theme_atmosphere.prose` → `tokens.yaml.voice`
  - [ ] 5.5 Map `sections.color_palette_roles.color` → `tokens.yaml.colors`; `sections.color_palette_roles.gradient` → `tokens.yaml.gradients`
  - [ ] 5.6 Map `sections.typography_rules.font_family` → `tokens.yaml.typography.{heading,body,mono,opentype_features,tabular_features}`; `.type_scale` → `tokens.yaml.typography.scale`; `.letter_spacing` → `tokens.yaml.typography.letter_spacing`
  - [ ] 5.7 Map `sections.layout_principles.{spacing,radius}` → top-level `tokens.yaml.spacing` and `tokens.yaml.radius`
  - [ ] 5.8 Map `sections.depth_elevation.{shadow,elevation}` → top-level `tokens.yaml.shadows` and `tokens.yaml.elevation`
  - [ ] 5.9 Map `sections.dos_and_donts.{do,dont}` → `tokens.yaml.constraints.{do,dont}` (preserve tagged form if present — `"**typography:** Use …"` entries stay tagged)
  - [ ] 5.10 Map `format_variants` → top-level `tokens.yaml.format_variants` (new field for DMD-1 — the runtime doesn't consume it yet, but storing it preserves the authoring intent)
  - [ ] 5.11 **Defaults for missing fields** (per spec §10 tolerance contract): emit `gradients: { enabled: false }` when absent, emit `elevation: {}` when absent, emit `constraints: { do: [], dont: [] }` when absent, omit `source` when absent

- [ ] **Task 6: Integration tests against the 3 DMD-1 reference samples (AC: 10)**
  - [ ] 6.1 Add `figmento-mcp-server/tests/ds-md-import.test.ts` (match existing test conventions — check `jest.config.js` for location)
  - [ ] 6.2 Test case `notion round-trip`: call `import_design_system_from_md({ path: 'knowledge/design-systems/notion/DESIGN.md' })`, assert PASS verdict, assert emitted tokens.yaml is byte-identical to committed `notion/tokens.yaml` (canonical key ordering applied)
  - [ ] 6.3 Test case `aurelia thin-system`: same approach, assert PASS or CONCERNS (aurelia has no letter_spacing so CONCERNS on grid-snap check is acceptable), assert emitted tokens.yaml matches committed `aurelia/tokens.yaml` **or** a documented superset (aurelia's DESIGN.md has do/dont authored from brief that aren't in tokens.yaml — the test should note this intentional divergence)
  - [ ] 6.4 Test case `claude upstream-imported`: byte-identical round-trip vs committed `claude/tokens.yaml`
  - [ ] 6.5 Run `npm test` in figmento-mcp-server, confirm 3/3 integration tests pass alongside existing suite

- [ ] **Task 7: Unit tests for edge cases (AC: 11)**
  - [ ] 7.1 Jest test suite in `figmento-mcp-server/tests/ds-md-parser.test.ts`: parser edge cases (numbered headings, missing frontmatter, malformed fenced blocks, case mix)
  - [ ] 7.2 Jest test suite in `figmento-mcp-server/tests/ds-md-validator.test.ts`: validator edge cases per severity class (CRITICAL hex invalid, HIGH contrast too low, MEDIUM grid snap, LOW unknown font)
  - [ ] 7.3 Jest test suite in `figmento-mcp-server/tests/ds-md-import.test.ts` (expanding Task 6): duplicate-name handling, FAIL-on-write refusal, name inference from filename

- [ ] **Task 8: Regression check + handoff (AC: 12)**
  - [ ] 8.1 Run the full `figmento-mcp-server` test suite — confirm no regressions in `generate_design_system_from_url`, `refine_design_system`, `design_system_preview`, `get_design_system`, `list_resources`
  - [ ] 8.2 Run `npm run lint` and `npm run build` — confirm clean
  - [ ] 8.3 Update the DMD epic change log with "DMD-2 shipped"
  - [ ] 8.4 Update DMD-1's File List (`scripts/validate-design-md-sample.js`) with a note: "Superseded by DMD-2's `ds-md-parser.ts`; kept as a validation utility for DMD-5 re-seed gate"
  - [ ] 8.5 Mark story Status → InReview → Done (after @qa pass)

## Dev Notes

### Source of truth

- **Spec:** [`docs/architecture/DESIGN-MD-SPEC.md`](../architecture/DESIGN-MD-SPEC.md) — authoritative for format, section names, fenced-block languages
- **Schema:** [`figmento-mcp-server/schemas/design-md.schema.json`](../../figmento-mcp-server/schemas/design-md.schema.json) — authoritative for IR shape
- **Reference implementation:** [`figmento-mcp-server/scripts/validate-design-md-sample.js`](../../figmento-mcp-server/scripts/validate-design-md-sample.js) — the `parseDesignMd()` function is the behavioral baseline; DMD-2's parser must produce the same IR but using `marked@^12` instead of regex

### Parser constraint: marked@^12

Locked by the epic. Do NOT reach for `unified`/`remark` — the extraction-only use case doesn't benefit from unified's plugin architecture, and the existing `ds-extraction.ts` pipeline is synchronous which matches marked's sync lexer API. See [epic-DMD change log](epic-DMD-design-markdown.md) entry 2026-04-15 for full rationale.

### Reference samples for regression testing

Three samples shipped by DMD-1 are the regression baseline:

1. **notion** — [`knowledge/design-systems/notion/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/notion/DESIGN.md) — 22/22 coverage, all 9 sections + 9 fenced blocks, extended color palette (31 total keys), multi-layer elevation CSS composites
2. **aurelia** — [`knowledge/design-systems/aurelia/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/aurelia/DESIGN.md) — 15/15 coverage, thin system (no elevation/gradients/constraints in tokens.yaml), DESIGN.md is a **superset** of tokens.yaml (authored do/dont from brief). **Round-trip assertion here is looser:** the `tokens.yaml` must be recoverable from the DESIGN.md, but the DESIGN.md has extra content that wouldn't round-trip back if we exported from the minimal tokens.yaml. Document this in the test
3. **claude** — [`knowledge/design-systems/claude/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/claude/DESIGN.md) — 22/22 coverage, upstream-imported, includes opaque CSS pass-through in elevation

### Shared validation module

`ds-md-validator.ts` is consumed by BOTH DMD-2 and DMD-3. Whichever story ships first creates the module with its full surface; the other imports `validateDesignMdIR` without modification. **Do not duplicate validation logic** — if DMD-3 ships after DMD-2, DMD-3's entire job is to wrap `validateDesignMdIR` in a standalone MCP tool with its own Zod schema and response shape.

### Sync with the reference script behavior

The mini-parser in `scripts/validate-design-md-sample.js` uses:
- Frontmatter extraction: `/^---\n([\s\S]*?)\n---\n/` regex + `js-yaml`
- Section walking: `^## (.+)$` multiline regex, section body is `body.slice(start, next_h2)`
- Fenced blocks: `/```([\w-]+)\n([\s\S]*?)\n```/g` regex inside each section body
- YAML bodies: `js-yaml.load`
- Mood extraction: `/\*\*Mood\*\*:\s*(.+)/`
- Do/dont extraction: `/### Do\n([\s\S]*?)(?=### Don|$)/` + `/### Don't\n([\s\S]*?)$/`
- Final normalization: `JSON.parse(JSON.stringify(ir))`

The marked-based parser will use `marked.lexer(body)` to get a flat token array, then walk the tokens matching `{ type: 'heading', depth: 2 }` as section boundaries and `{ type: 'code', lang: '<hint>' }` as fenced blocks. Same IR shape, richer tokenization, no regex maintenance. **The date-quoting convention from DMD-1** (`created: "2026-04-04T00:00:00.000Z"` with quotes) must still be enforced on import — js-yaml auto-converts unquoted ISO dates to Date objects which fail schema validation.

### Hex color validation

Use the existing `hexToRgb` utility from [`figmento-mcp-server/src/tools/utils/color.ts`](../../figmento-mcp-server/src/tools/utils/color.ts#L1). It already handles 6- and 8-digit hex. For `rgba()`, `rgb()`, `hsla()`, `hsl()` string forms, add a simple regex-based validator — if the string matches any of those patterns or a valid hex, mark OK; else produce a HIGH severity issue. Invalid color values are HIGH not CRITICAL because the runtime can substitute a default (e.g., `#808080`) and still produce a usable system.

### Contrast check

WCAG AA requires 4.5:1 for normal text, 3:1 for large text. Figmento enforces 4.5:1 on the two most visible pairs: `on_primary` over `primary` and `on_surface` over `surface`. Below 4.5:1 is HIGH severity, not CRITICAL — the runtime still imports but the validation report warns the user. Use `relativeLuminance` from `utils/color.ts`.

### Font availability

Check `typography.heading.family`, `typography.body.family`, `typography.mono.family` against a bundled font list. Figmento already has an MCP tool `list_available_fonts` that returns the Figma font catalog when connected — but during import, Figma may not be connected. Keep a fallback list of common web fonts (Inter, Roboto, DM Sans, Geist, SF Pro, Source Serif 4, Cormorant Garamond, Anthropic Serif, etc.) hard-coded in the validator. Unknown fonts → MEDIUM severity, never blocking.

### What NOT to do in this story

- ❌ **Do not touch `design-md.schema.json`** — it's locked by DMD-1. Any schema change is a v2 upgrade and belongs in a follow-up epic
- ❌ **Do not write a standalone validator MCP tool** — that's DMD-3. Expose validation only as an internal pre-write check within `import_design_system_from_md`
- ❌ **Do not write an exporter** — that's DMD-4. DMD-2 is import-only
- ❌ **Do not touch the 3 reference samples** — they're frozen artifacts. If you find a bug in one of them, raise it to @pm, don't edit it mid-story
- ❌ **Do not re-decide the parser** — `marked@^12` is locked
- ❌ **Do not delete `scripts/validate-design-md-sample.js`** — it's useful for DMD-5's re-seed gate and serves as an independent reference implementation

### Testing standards

- Test framework: Jest (already configured via [`figmento-mcp-server/jest.config.js`](../../figmento-mcp-server/jest.config.js))
- Test location: check `jest.config.js` for `testMatch` — likely `tests/*.test.ts` or `src/**/*.test.ts`. Match existing convention
- Run: `cd figmento-mcp-server && npm test`
- Coverage expectations: new modules (`ds-md-parser.ts`, `ds-md-validator.ts`, `ds-md-to-tokens.ts`) should have 80%+ unit coverage; the tool handler in `ds-extraction.ts` should have integration coverage via the 3 sample files
- Regression: the existing design-system test suite (if any) must continue to pass — run `npm test` before marking Done

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-04-15 | 0.1 | Initial draft from @sm. Story scoped against DMD-1's locked contract (spec + schema + 3 reference samples + reference parser). 12 ACs + 8 tasks + 45 subtasks. Key decisions: marked@^12 parser locked, shared `ds-md-validator.ts` module with DMD-3, tolerance-contract validation built in, auto-preview hook absorbed. | @sm (River) |
| 2026-04-15 | 0.2 | `*validate-story-draft` GO verdict (10/10). Figmento 10-point checklist passed, soft note on risk-documentation pattern (risks integrated into Dev Notes rather than dedicated section — accepted consistent with DMD-1). Cross-story finding: shared `ds-md-validator.ts` ownership is unambiguous with DMD-3 — recommend DMD-3 ships first to establish the module contract. Status: Draft → **Ready**. @dev unblocked (subject to DMD-3 sequencing). | @po (Pax) |

## Dev Agent Record

_(To be populated by @dev when InProgress)_

## QA Results

_(To be populated by @qa after @dev completes)_
