# DMD-3 — `validate_design_md` MCP Tool

## Status: Ready

> **Epic:** [epic-DMD — DESIGN.md Pipeline](epic-DMD-design-markdown.md)
> **Phase:** A — Pipeline + Validation Gate
> **Depends on:** DMD-1 (Done — schema shipped)
> **Shares code with:** DMD-2 — both consume `ds-md-validator.ts` (whichever ships first creates it). DMD-3 adds only a thin MCP wrapper around the same `validateDesignMdIR` function
> **Blocks:** None directly. Useful to users wanting validation without import side-effects

## Executor Assignment

| Field | Value |
|---|---|
| **executor** | @dev (Dex) |
| **quality_gate** | @qa |
| **complexity** | S (2–3 pts) — if DMD-2 ships first, this story is ~50% thinner |

## Story

**As a** Figmento user authoring a DESIGN.md file by hand,
**I want** a standalone MCP tool that validates my file without importing it — showing me contrast failures, invalid hex values, grid-snap warnings, and schema issues before I commit the file or call the importer,
**so that** I can iterate on authoring in a fast edit-validate-fix loop without polluting `knowledge/design-systems/` with intermediate drafts.

## Background

DMD-2 (`import_design_system_from_md`) runs validation internally as a pre-write gate — if a file FAILs, the import refuses to save. That's the right behavior for import-then-save, but it's the wrong behavior for **authoring**: a user hand-writing a DESIGN.md wants to know whether their current draft is valid *without* committing it to the runtime. DMD-3 exposes the same validation logic as a **zero-side-effect MCP tool** that reads a file (or inline content), runs the full validation pipeline, and returns a structured report — no file writes, no canvas side-effects, no state changes.

The existing `refine_design_system` tool in [`ds-extraction.ts`](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts) follows a similar philosophy: draft-and-refine instead of one-shot perfection. DMD-3 fits that pattern — it's the "check my work" tool for the DESIGN.md authoring flow.

### Relationship to DMD-2

DMD-2 and DMD-3 share the same validation contract: `validateDesignMdIR(ir): ValidationReport` exported from [`figmento-mcp-server/src/tools/design-system/ds-md-validator.ts`](../../figmento-mcp-server/src/tools/design-system/ds-md-validator.ts) (to be created by whichever story ships first). DMD-3 is literally a thin MCP wrapper:

```
DMD-3 handler:
  1. Parse file via ds-md-parser.parseDesignMd(content)
  2. Run validateDesignMdIR(ir)
  3. Return the ValidationReport as the MCP response
```

If DMD-2 ships first, DMD-3 is ~30 lines of tool handler code + a Zod schema + tests. If DMD-3 ships first, it creates both the parser module and the validator module (pulled forward from DMD-2's Task 2+3), and DMD-2 imports them.

## Acceptance Criteria

1. **AC1 — Tool registration.** `validate_design_md` is registered as an MCP tool in [`ds-extraction.ts`](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts) alongside the extraction + import tools. Wired through [`index.ts`](../../figmento-mcp-server/src/tools/design-system/index.ts) in the registerExtractionTools call.

2. **AC2 — Input modes.** Accepts `{ path: string }` OR `{ content: string }` (no `name` required — validation is content-only). Zod schema defined in [`ds-schemas.ts`](../../figmento-mcp-server/src/tools/design-system/ds-schemas.ts).

3. **AC3 — Zero side effects.** The tool MUST NOT write any file, call any Figma tool, modify any in-memory state, or log to the design system registry. It is a pure function from markdown text → validation report.

4. **AC4 — Uses shared parser + validator.** Imports `parseDesignMd` from [`ds-md-parser.ts`](../../figmento-mcp-server/src/tools/design-system/ds-md-parser.ts) and `validateDesignMdIR` from [`ds-md-validator.ts`](../../figmento-mcp-server/src/tools/design-system/ds-md-validator.ts). No duplicate logic — if DMD-2 shipped first, these modules exist and DMD-3 just imports them.

5. **AC5 — Response shape.** Returns `{ verdict: 'PASS' | 'CONCERNS' | 'FAIL', issues: Issue[] }` where `Issue = { severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', category: string, message: string, suggestion?: string, line?: number }`. Categories match the validator's taxonomy: `schema`, `hex`, `contrast`, `font`, `grid`, `token_reference`, `structure`.

6. **AC6 — Verdict mapping is consistent with DMD-2.** Both tools apply the same rule: any CRITICAL issue → verdict `FAIL`; any HIGH or MEDIUM (no CRITICAL) → `CONCERNS`; nothing → `PASS`. The shared `validateDesignMdIR` enforces this; DMD-3's wrapper just passes through.

7. **AC7 — Upstream tolerance contract honored.** A plain [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) file with no frontmatter and no fenced blocks — just 9 prose sections — validates as `CONCERNS` (not `FAIL`) per [DESIGN-MD-SPEC.md §10](../architecture/DESIGN-MD-SPEC.md). The **only** FAIL conditions are: missing both `## Color Palette & Roles` and `## Typography Rules`, OR any CRITICAL structural error from ajv.

8. **AC8 — Tests cover each severity class.** Jest tests under `figmento-mcp-server/tests/` with one test per severity level: CRITICAL (invalid JSON Schema structure), HIGH (contrast 2:1 on on_primary/primary), MEDIUM (spacing value 7px off-grid), LOW (unknown font family).

9. **AC9 — Tests against the 3 DMD-1 reference samples.** Validating `notion/DESIGN.md`, `aurelia/DESIGN.md`, and `claude/DESIGN.md` all return verdict `PASS` or `CONCERNS` (never `FAIL`). This is a regression check — if DMD-1's samples ever fail DMD-3's validation, the schema has drifted from the spec.

10. **AC10 — Integration with DMD-2.** If DMD-2 is already shipped when DMD-3 lands, running `validate_design_md` on a file followed by `import_design_system_from_md` on the same file must return consistent verdicts (both PASS, both CONCERNS, or both FAIL). No divergence — they are the same validation pipeline.

## Tasks / Subtasks

- [ ] **Task 1: Ensure shared modules exist (AC: 4)**
  - [ ] 1.1 If DMD-2 has shipped: verify [`ds-md-parser.ts`](../../figmento-mcp-server/src/tools/design-system/ds-md-parser.ts) and [`ds-md-validator.ts`](../../figmento-mcp-server/src/tools/design-system/ds-md-validator.ts) exist with the expected exports. Go to Task 2
  - [ ] 1.2 If DMD-2 has NOT shipped: create `ds-md-parser.ts` + `ds-md-validator.ts` per DMD-2 Tasks 2–3 (copy those subtasks here and execute them first). Add `marked@^12` to `package.json` via `npm install marked@^12 --save`. DMD-2 will then `import` from these modules unchanged
  - [ ] 1.3 Confirm `validateDesignMdIR(ir): ValidationReport` is exported and has the type signature from DMD-2 AC6

- [ ] **Task 2: Build the `validate_design_md` MCP tool (AC: 1, 2, 3, 5)**
  - [ ] 2.1 Register the tool in [`ds-extraction.ts`](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts) — thin handler that imports `parseDesignMd` and `validateDesignMdIR`
  - [ ] 2.2 Define input Zod schema in [`ds-schemas.ts`](../../figmento-mcp-server/src/tools/design-system/ds-schemas.ts): `validateDesignMdSchema` discriminated on `{ path } | { content }`
  - [ ] 2.3 Handler: read content (either path or inline), parse to IR, run validator, return `{ verdict, issues }` as the tool response — no other side effects
  - [ ] 2.4 Error handling: if the markdown fails to tokenize at all (e.g., the file is empty or contains invalid UTF-8), return a CRITICAL issue with `category: 'structure'` and verdict FAIL — do NOT throw
  - [ ] 2.5 Tool description in the registration must explicitly note "zero side effects — does not write files or call Figma tools" so LLM clients choose this over `import_design_system_from_md` when the user says "check my file"

- [ ] **Task 3: Verdict mapping + upstream tolerance (AC: 6, 7)**
  - [ ] 3.1 Verify `validateDesignMdIR` applies the verdict-severity mapping from DMD-2 AC6
  - [ ] 3.2 Add a semantic rule to the validator: **if both `color_palette_roles` and `typography_rules` sections are missing from the parsed IR, add a CRITICAL issue** with message `"DESIGN.md must contain at least one of '## Color Palette & Roles' or '## Typography Rules' to be usable"`. This is the only CRITICAL issue that can come from missing content
  - [ ] 3.3 Missing frontmatter is NOT CRITICAL — default substitution applies per spec §10. Produce a LOW-severity issue noting the fallback (e.g., `"name inferred from filename"`)
  - [ ] 3.4 Missing fenced blocks produce MEDIUM-severity issues with `suggestion: "Add a ```<lang> block with ..."` — the tool guides the author toward richer structure without blocking
  - [ ] 3.5 Unknown fenced-block language (e.g., ` ```motion `) produces a LOW-severity issue with `suggestion: "Unknown language hint; block ignored. Valid: color, font-family, type-scale, letter-spacing, spacing, radius, shadow, elevation, gradient"`

- [ ] **Task 4: Unit tests per severity class (AC: 8)**
  - [ ] 4.1 Create `figmento-mcp-server/tests/ds-md-validator.test.ts` (or extend if DMD-2 created it)
  - [ ] 4.2 Test `CRITICAL — schema error`: IR with `frontmatter.name: "Not Valid"` (breaks kebab-case pattern) → verdict FAIL
  - [ ] 4.3 Test `CRITICAL — no color and no typography sections`: empty sections object → verdict FAIL
  - [ ] 4.4 Test `HIGH — contrast failure`: IR with `on_primary: "#888"` on `primary: "#999"` (≈1.1:1) → verdict CONCERNS + HIGH issue
  - [ ] 4.5 Test `HIGH — invalid hex`: IR with `primary: "#XYZ"` → verdict CONCERNS + HIGH issue (value kept for structural validity but flagged)
  - [ ] 4.6 Test `MEDIUM — off-grid spacing`: IR with `spacing.md: 15` (not a multiple of 4) → verdict CONCERNS + MEDIUM issue
  - [ ] 4.7 Test `MEDIUM — missing fenced block`: IR without `color_palette_roles.color` → verdict CONCERNS + MEDIUM issue
  - [ ] 4.8 Test `LOW — unknown font`: IR with `typography.heading.family: "SomeObscureFont"` → verdict CONCERNS + LOW issue (or PASS if no HIGH/MEDIUM issues exist)
  - [ ] 4.9 Test `PASS — notion sample`: validating notion/DESIGN.md returns PASS or CONCERNS (never FAIL)
  - [ ] 4.10 Test `verdict precedence`: IR with 1 CRITICAL + 5 HIGH + 10 MEDIUM → verdict FAIL (CRITICAL wins)

- [ ] **Task 5: Integration tests against the 3 reference samples (AC: 9)**
  - [ ] 5.1 Create or extend `figmento-mcp-server/tests/ds-md-validate-tool.test.ts`
  - [ ] 5.2 Test case `notion`: call `validate_design_md({ path: 'knowledge/design-systems/notion/DESIGN.md' })` → verdict is NOT FAIL, no CRITICAL issues
  - [ ] 5.3 Test case `aurelia`: same approach — verdict is NOT FAIL. Note: aurelia has an existing contrast bug in tokens.yaml (`on_surface: "#151917"` on `surface: "#0D0D0D"` ≈ 1.1:1) — this DESIGN.md inherits that. The test should assert a HIGH contrast issue is surfaced, proving the validator catches the existing bug
  - [ ] 5.4 Test case `claude`: verdict is NOT FAIL, no CRITICAL issues

- [ ] **Task 6: Consistency test with DMD-2 (AC: 10)**
  - [ ] 6.1 If DMD-2 has shipped: add a Jest test that runs both `validate_design_md` AND `import_design_system_from_md` against the same sample and asserts the verdicts match
  - [ ] 6.2 If DMD-2 has NOT shipped: add a TODO comment with the test name, mark it `.skip()` in Jest, and document in the story change log that this assertion activates when DMD-2 lands

- [ ] **Task 7: Regression check + handoff**
  - [ ] 7.1 Run the full `figmento-mcp-server` test suite — confirm no regressions
  - [ ] 7.2 Run `npm run lint` and `npm run build` — confirm clean
  - [ ] 7.3 Update epic change log with "DMD-3 shipped"
  - [ ] 7.4 Mark story Status → InReview → Done (after @qa pass)

## Dev Notes

### Source of truth

- **Spec:** [`docs/architecture/DESIGN-MD-SPEC.md`](../architecture/DESIGN-MD-SPEC.md) — §10 (upstream tolerance contract) is the authoritative source for verdict mapping
- **Schema:** [`figmento-mcp-server/schemas/design-md.schema.json`](../../figmento-mcp-server/schemas/design-md.schema.json) — structural validation
- **Shared module:** `ds-md-validator.ts` — created by whichever of DMD-2 / DMD-3 ships first

### Zero-side-effect discipline

This is the defining characteristic of DMD-3. The tool MUST NOT:
- Write any file (including no temp files)
- Call any Figma tool (`connect_to_figma`, `design_system_preview`, etc.)
- Modify `knowledge/design-systems/` or any runtime registry
- Log or cache anything persistent across calls
- Trigger `saveDesignSystem` — that's DMD-2's job exclusively

The tool description in `ds-extraction.ts` must explicitly say "zero side effects" so LLM clients reliably choose this over `import_design_system_from_md` when the user's intent is "check my work" vs. "save my work".

### Why PASS/CONCERNS/FAIL instead of boolean

Per [story-lifecycle.md](../../.claude/rules/story-lifecycle.md), Figmento's QA gate uses PASS/CONCERNS/FAIL/WAIVED verdicts for story review. DMD-3 reuses that vocabulary so validation reports feel native to Figmento contributors. CONCERNS is the important middle ground: a DESIGN.md with a contrast issue or a 7px spacing value is usable, just not ideal. FAIL should be rare and only trigger on genuinely unusable files.

### Severity definitions (authoritative for both DMD-2 and DMD-3)

| Severity | Behavior | Examples |
|---|---|---|
| **CRITICAL** | Blocks save (DMD-2) / produces FAIL verdict (DMD-3) | Schema structural error (non-kebab-case name, missing required field), missing BOTH color + typography sections |
| **HIGH** | Produces CONCERNS; save still proceeds; warning returned | Contrast ratio < 4.5:1 on on_primary/primary or on_surface/surface, invalid hex value (`#XYZ`), missing required canonical color key |
| **MEDIUM** | Produces CONCERNS; save proceeds; gentle nudge | Off-grid spacing value (not a multiple of 4), missing recommended fenced block, font weight outside the system's declared weights list |
| **LOW** | PASS if nothing else wrong; informational only | Unknown font family (loadable later), unknown fenced-block language (ignored), name inferred from filename |

### Reference samples as regression tests

The three DMD-1 samples are the validator's permanent regression suite. If a future refactor causes `notion/DESIGN.md` to return FAIL, the refactor is wrong — iterate until PASS or CONCERNS. The tests in Task 5 codify this invariant.

### What NOT to do

- ❌ **Do not duplicate parser or validator logic.** Import from the shared modules only
- ❌ **Do not add file I/O beyond reading the input path.** No temp files, no logs, no caching
- ❌ **Do not call any other MCP tool from within this tool's handler.** The handler is a pure function
- ❌ **Do not change the schema.** `design-md.schema.json` is locked
- ❌ **Do not return a verdict stricter than DMD-2's import-time check.** The two tools MUST agree

### Testing standards

- Test framework: Jest (via existing `figmento-mcp-server/jest.config.js`)
- Run: `cd figmento-mcp-server && npm test`
- The bulk of this story's test surface lives in `ds-md-validator.test.ts` — the module test. `validate_design_md` itself only needs thin integration tests per AC9/AC10 because it's a pass-through wrapper

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-04-15 | 0.1 | Initial draft from @sm. Thin MCP wrapper around shared `validateDesignMdIR`. Story deliberately sized for a fast turnaround (~2–3 pts) — most of the work lives in the shared `ds-md-validator.ts` module owned jointly with DMD-2. Verdict mapping (PASS/CONCERNS/FAIL), severity definitions, and upstream tolerance contract all locked in the story body for both DMD-2 and DMD-3 to consume. | @sm (River) |
| 2026-04-15 | 0.2 | `*validate-story-draft` GO verdict (10/10). Figmento 10-point checklist passed. Notable @po finding: DMD-3 is the **authoritative source** for severity definitions and verdict mapping — the canonical tables live in this story's Dev Notes and DMD-2 consumes them by reference. Recommendation: **DMD-3 ships first** of the three Phase A tool stories because it's smallest (2-3 pts), creates the shared `ds-md-validator.ts` module, and establishes the contract before DMD-2's integration surface needs it. Status: Draft → **Ready**. @dev unblocked — this is the recommended first story of the three. | @po (Pax) |

## Dev Agent Record

_(To be populated by @dev when InProgress)_

## QA Results

_(To be populated by @qa after @dev completes)_
