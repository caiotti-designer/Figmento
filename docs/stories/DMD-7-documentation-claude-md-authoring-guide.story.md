# DMD-7 — Documentation: CLAUDE.md + Authoring Guide

## Status: Done

> **Epic:** [epic-DMD — DESIGN.md Pipeline](epic-DMD-design-markdown.md)
> **Phase:** B — User-Facing
> **Depends on:** DMD-1..6 (all Done)
> **Closes:** epic-DMD

## Executor Assignment

| Field | Value |
|---|---|
| **executor** | @dev (Dex) |
| **quality_gate** | @po |
| **complexity** | S (1–2 pts) — docs-only, no code |

## Story

**As a** developer / agent coming to Figmento for the first time,
**I want** to find the DESIGN.md authoring path documented in the project's primary operating context (CLAUDE.md) and a dedicated step-by-step guide,
**so that** I can author, import, export, and validate DESIGN.md files without needing to read the spec or the epic.

## Background

DMD-1..6 shipped the full DESIGN.md pipeline — schema, validator, importer, exporter, seed gate, plugin drag-drop. But the entry points were scattered:

- The spec lived at `docs/architecture/DESIGN-MD-SPEC.md` (technical, dense)
- The MCP tool names were only discoverable by reading source or the epic
- CLAUDE.md's "Starting Any Design" section only mentioned PDF-brief and preset paths — no DESIGN.md upload
- No friendly prose guide for the designer who wants to hand-author a file

DMD-7 fixes that: one CLAUDE.md edit places DESIGN.md upload as a first-class path; one new guide at `docs/guides/design-md-authoring.md` walks a human reader through frontmatter → sections → fenced blocks → round-trip workflow → worked examples.

## Acceptance Criteria

1. **AC1 — CLAUDE.md updated.** The "Starting Any Design" checklist in [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) lists DESIGN.md upload as the **first** of three authoring paths (DESIGN.md / PDF brief / URL extraction), with a link to the MCP tool name and the authoring guide.

2. **AC2 — DESIGN.md authoring section in CLAUDE.md.** A new subsection "DESIGN.md Authoring Path" documents the three MCP tools (`validate_design_md`, `import_design_system_from_md`, `export_design_system_to_md`) with purpose, and links to the spec + guide.

3. **AC3 — Authoring guide exists.** [`docs/guides/design-md-authoring.md`](../guides/design-md-authoring.md) covers: what DESIGN.md is, 10-second workflow, file structure, frontmatter fields, all 9 sections with examples, fenced-block language reference, format variants, round-trip edit cycle.

4. **AC4 — Three worked examples.** The guide includes 3 pointer examples — luxury brand (aurelia), SaaS product (linear), knowledge product (notion) — each explaining what to copy and when to use it.

5. **AC5 — Gotchas section.** Known authoring pitfalls documented: quoted ISO dates, unquoted type-scale numbers, `on_surface` semantics, elevation non-validation, overwrite safety.

6. **AC6 — STATUS.md + epic updated.** DMD-7 marked Done, epic-DMD Phase B complete, epic closed.

## Tasks

- [x] Edit `.claude/CLAUDE.md` "Starting Any Design" → insert DESIGN.md as option 3a.
- [x] Add new "DESIGN.md Authoring Path" subsection immediately below with the 3-tool table.
- [x] Create `docs/guides/` directory and `docs/guides/design-md-authoring.md`.
- [x] Write the guide covering all 6 ACs — frontmatter, 9 sections, fenced-block reference, examples, gotchas.
- [x] Update `docs/stories/STATUS.md` — DMD-7 Done, Phase B complete, epic-DMD closed.

## Dev Notes

- The guide deliberately mirrors the spec's structure but writes from a "how do I do X?" angle rather than "what does X formally mean?". The spec remains the source of truth for edge cases.
- CLAUDE.md got a small table of the 3 MCP tools so the agent can find the right tool without loading the full guide.
- Pointed the guide at the 3 seeded systems (aurelia / linear / notion) rather than duplicating their content inline. Each covers a distinct archetype (luxury, SaaS, knowledge).

## File List

- `.claude/CLAUDE.md` (modified — Starting Any Design rewrite + new DESIGN.md Authoring Path subsection)
- `docs/guides/design-md-authoring.md` (new, ~260 lines)
- `docs/stories/DMD-7-documentation-claude-md-authoring-guide.story.md` (new, this file)
- `docs/stories/STATUS.md` (modified — DMD-7 Done, epic-DMD closed)

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-04-22 | 1.0 | Created, implemented, shipped in one session. CLAUDE.md updated with DESIGN.md as first-class authoring path + 3-tool reference table. New authoring guide at `docs/guides/design-md-authoring.md` covers all 9 sections, frontmatter, fenced-block reference, 3 worked examples, gotchas. Epic-DMD closed. | @dev |
