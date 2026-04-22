# DQ-HF-1 — Design Agent Showcase Extension Discipline (Contrast + Frame Nesting)

## Status: Draft

> **Epic:** [epic-DQ — Design Quality](epic-DQ-design-quality.md) (hotfix-tier story, precedes Phase 1 planned work)
> **Type:** Hotfix — documented agent-prompting rules, not a new feature
> **Depends on:** None. Complements DQ-4 (Refinement Rules YAML + CLAUDE.md Integration, planned)
> **Triggered by:** Observed bugs in a real `generate_design_system_in_figma` run (Coral de Dois, 2026-04-16)

## Executor Assignment

| Field | Value |
|---|---|
| **executor** | @dev (CLAUDE.md edits + canvas-tool guardrails) |
| **quality_gate** | @qa (visual regression against a dark-theme brand fixture) |
| **complexity** | S (2–3 pts) — docs-heavy story, small code surface |

## Story

**As a** Figmento user running `generate_design_system_in_figma` on a dark-theme brand brief,
**I want** the agent's post-showcase customizations (section headers, footer panels, supplementary decorative frames) to follow the same contrast and nesting discipline as the baseline `create_ds_showcase` tool,
**so that** a one-click design system doesn't ship with black-on-black text or stray sibling frames that break the "single clean showcase frame" user expectation.

## Background

On 2026-04-16, the Coral de Dois brand brief was run through `generate_design_system_in_figma` in the Figmento plugin chat. The baseline showcase rendered correctly (after the `fix(ds-showcase): contrast-aware text` fix in `f509bf5`), but the LLM agent added two kinds of customizations on top — via subsequent `batch_execute` and `create_frame` calls — that introduced visual bugs:

1. **Dark section header panels with inverted contrast.** The agent added dark-filled `SECTION HEADER` rectangles above each major showcase section (Paleta, Tipografia, Componentes, Iconos de Marca, Escala, Frase de Marca) with text rendered in a near-identical dark color on top. Result: headings visually indistinguishable from the panel fill.
2. **Sibling-positioned supplementary frames.** The agent created a 1248×320 "Brand Quote" footer frame containing the brand tagline, but placed it as a **sibling of the main showcase root frame**, not nested inside it via `appendChild`. Result: the Brand Quote reads as a detached artifact next to the showcase, not part of it.

Neither bug is in the `create_ds_showcase` code path — the baseline renders a single clean frame with no section header panels and no quote footer. Both bugs are the LLM agent extending the output with custom batch_execute calls and not applying the discipline that the baseline code already follows.

### Why this is a story, not just a prompt tweak

The agent's freedom to extend showcases with brand-appropriate decorative elements is valuable — the Brand Quote footer was a good creative choice that enriches the showcase for a luxury music brand. The problem isn't that the agent extended; it's that it extended without respecting two invariants the baseline code enforces:

- **Contrast discipline**: when you add a panel with a new fill, any text on that panel must be picked via a contrast-aware helper (`bestTextColor(fill)` or the new luminance-delta check from `ds-showcase.ts`).
- **Nesting discipline**: when you add a supplementary section after `create_ds_showcase`, it belongs inside the root showcase frame (via `parentId` or `appendChild`), not as a sibling at the canvas root.

Both disciplines are documented nowhere in the agent's active ruleset. They need explicit rules in [CLAUDE.md](../../.claude/CLAUDE.md) under the "Figmento Design Agent Rules" section, plus a regression fixture so future iterations catch the same bug.

## Acceptance Criteria

1. **AC1 — CLAUDE.md contrast rule.** A new rule added to [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) under "Figmento Design Agent Rules" titled "Post-showcase contrast discipline" with explicit wording: *"When adding a fill-backed section header, banner, or decorative panel AFTER `generate_design_system_in_figma` or `create_ds_showcase` has run, text placed on that panel must use contrast-aware color selection. Default: query `get_contrast_check` on the `fill` vs. intended `textColor` and iterate until the ratio ≥ 4.5:1. Never copy the brand's `on_surface` color onto a new non-surface fill."*

2. **AC2 — CLAUDE.md nesting rule.** A new rule added to the same section titled "Post-showcase nesting discipline" with explicit wording: *"Any supplementary frame, section, or decorative artifact added after `create_ds_showcase` MUST be nested inside the showcase root frame. Always pass the showcase's `rootFrameId` (returned by `create_ds_showcase`) as `parentId` in the follow-up `create_frame` / `batch_execute` calls, OR call `append_child` to move the supplementary frame into the showcase root. Never create a sibling at the canvas root."*

3. **AC3 — Canvas-tool guardrail (soft).** Add a warning in the `create_frame` tool handler when:
   - The caller did NOT pass a `parentId`
   - AND a recent `create_ds_showcase` call produced a root frame within the last ~60 seconds
   - AND the new frame has the same `width` as the showcase root
   The warning is surfaced in the tool's response (`warning` field) with text like `"Creating a sibling frame at canvas root. Did you mean to nest inside the recent showcase frame (<rootFrameId>)? Pass parentId: '<rootFrameId>' to nest."` Does NOT block execution — the user may genuinely want a sibling.

4. **AC4 — Regression fixture.** Add a fixture file `figmento-mcp-server/tests/fixtures/dark-theme-brief.json` containing a condensed Coral-de-Dois-like brand analysis (dark forest green primary, near-black background, cream/gold accents). The fixture exercises both bug paths when re-run through the agent prompt flow.

5. **AC5 — Manual regression note.** A `docs/qa/manual-regressions.md` entry (create if missing) documents the Coral de Dois reproduction: prompt, screenshot of the bug, screenshot of the fix, date, and the commit that introduced the guardrail. Serves as institutional memory so future refactors of the showcase flow know to re-verify against this case.

6. **AC6 — No baseline regression.** Running `create_ds_showcase` directly (via MCP, not via `generate_design_system_in_figma`) continues to produce a single clean frame with no dark panels and no sibling footer. The baseline is unchanged; only the agent's extension behavior gets new rules.

## Tasks / Subtasks

- [ ] **Task 1: Document the two rules in CLAUDE.md (AC: 1, 2)**
  - [ ] 1.1 Locate the "Figmento Design Agent Rules" section in [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md)
  - [ ] 1.2 Add a new subsection "Post-showcase extension discipline" with AC1 + AC2 wording
  - [ ] 1.3 Add a short rationale paragraph explaining the 2026-04-16 Coral de Dois observation and link to this story

- [ ] **Task 2: Add the canvas-tool guardrail (AC: 3)**
  - [ ] 2.1 Locate the `create_frame` handler (likely in [figmento-mcp-server/src/tools/scene.ts](../../figmento-mcp-server/src/tools/scene.ts))
  - [ ] 2.2 Add lightweight in-memory tracking: when `create_ds_showcase` completes, record `{ rootFrameId, width, timestamp }` in a module-scoped variable
  - [ ] 2.3 In `create_frame`, when `parentId` is absent AND (now − lastShowcase.timestamp) < 60_000 AND params.width === lastShowcase.width, append a `warning` field to the tool response
  - [ ] 2.4 Does NOT throw or block — warning only

- [ ] **Task 3: Create the regression fixture (AC: 4)**
  - [ ] 3.1 Create `figmento-mcp-server/tests/fixtures/dark-theme-brief.json` — ~60 lines of JSON matching the BrandAnalysis shape, using Coral de Dois palette (primary `#1F3A2E`, background `#000000`, etc.)
  - [ ] 3.2 Add an integration test that feeds the fixture through `brandAnalysisToTextStyles` + the contrast check to prove the new CLAUDE.md rules would catch the original bug

- [ ] **Task 4: Manual regression note (AC: 5)**
  - [ ] 4.1 Create `docs/qa/manual-regressions.md` if it doesn't exist (check `docs/qa/` directory first)
  - [ ] 4.2 Add a first entry: "2026-04-16 Coral de Dois showcase extension — dark panels + escaping Brand Quote frame"
  - [ ] 4.3 Attach the observation, the root-cause analysis, and the fix commits (f509bf5 + this story's commit)

- [ ] **Task 5: No-regression verification (AC: 6)**
  - [ ] 5.1 Run `npm test` — full test suite must still pass (438/438 as of DMD-4)
  - [ ] 5.2 Manual Figma test: call `create_ds_showcase` directly via MCP on the Coral de Dois fixture. Verify single clean frame, no dark panels, no sibling footer, section titles readable

## Dev Notes

### Why this isn't "fix the LLM agent"

Figmento's plugin chat uses an LLM (Claude) to orchestrate tool calls, and that LLM follows the rules in [CLAUDE.md](../../.claude/CLAUDE.md) as its operating context. The CLAUDE.md file IS the mechanism for fixing agent behavior — there's no separate "agent config" to edit. Every rule added to CLAUDE.md is a rule the agent will follow in future runs. This story is therefore a **documentation + light code guardrail** story, not a model-training story.

### Why a soft warning instead of a hard block

Users may legitimately want to create sibling frames at the canvas root — for example, a second design mockup next to a showcase, or a reference image imported separately. A hard block would cause friction for those valid cases. The warning is informational, surfaces the likely mistake (agent created a sibling when it probably meant to nest), and trusts the caller to pass `parentId` when they actually want nesting.

### Related existing work

- [`fix(ds-showcase): contrast-aware text`](../../figmento/src/handlers/ds-showcase.ts) — landed in `f509bf5` 2026-04-16. Fixes baseline contrast for dark-theme brands. DQ-HF-1 extends that discipline to the *agent's post-showcase extensions*.
- [`evaluate_design`](../../figmento-mcp-server/src/tools/design-system/) — existing refinement check tool. Running this after agent extensions would catch the contrast bug — AC5 of this story's manual regression note should encourage this as the agent's own self-check.
- [DQ-4](epic-DQ-design-quality.md) (planned) — "Refinement Rules YAML + CLAUDE.md Integration" — when DQ-4 is drafted, DQ-HF-1's two rules should be folded into its refinement-rules schema for canonical tracking.

### What NOT to do in this story

- ❌ Do not modify `create_ds_showcase` again — the baseline is already fixed. DQ-HF-1 is purely about the *agent's extensions* on top of the baseline.
- ❌ Do not add hard blocks to `create_frame` — the guardrail is a warning only.
- ❌ Do not try to "solve contrast" globally — the rule is narrowly scoped to post-showcase panel additions.
- ❌ Do not fold this into DQ-4's scope — DQ-4 is a planned Phase 1 story and hasn't been drafted yet. DQ-HF-1 ships now.

### Testing standards

- Jest for the fixture integration test (existing `ds-md-validate.test.ts` pattern works)
- Manual visual regression on a real dark-theme brand (Coral de Dois or similar)
- Full suite must remain green

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-04-16 | 0.1 | Initial draft. Story triggered by observed Coral de Dois bugs (dark panel contrast inversion + escaping Brand Quote frame). Scoped as a hotfix-tier story under epic-DQ — documents two agent-prompting rules + adds a soft canvas-tool guardrail + creates a regression fixture. 6 ACs, 5 tasks. Complexity S (2-3 pts). | @sm (River) |

## Dev Agent Record

_(To be populated by @dev when InProgress)_

## QA Results

_(To be populated by @qa after @dev completes)_
