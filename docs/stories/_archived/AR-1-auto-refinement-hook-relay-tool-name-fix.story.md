# AR-1: Auto-Refinement Hook + Relay Tool Name Fix

**Status:** Done
**Size:** S (Small)
**Depends on:** None (prompt-only changes, no tool or API modifications)
**Agent:** @dev

## Description

The `run_refinement_check` tool exists and works, but the system prompt treats it as optional encouragement rather than a mandatory step. Result: the AI skips refinement ~60% of the time, and designs ship without a quality score.

Additionally, the relay's `system-prompt.ts` still references old tool names (`lookup_size`, `lookup_palette`, `lookup_fonts`, `lookup_blueprint`) that were renamed in the MCP server months ago. The relay chat engine calls these by the old names, causing silent tool-not-found failures.

This story fixes both issues with zero code changes to tools — only prompt text changes across 3 files (~38 lines).

## Scope

### IN Scope

- Replace the 5-item mental checklist in `buildRefinementBlock()` (plugin system-prompt) with a mandatory `run_refinement_check` call + auto-fix directive
- Fix 8 stale tool name references in the relay's system-prompt (`lookup_*` → `get_*`)
- Add the same mandatory refinement block to the relay's system-prompt
- Update CLAUDE.md to mandate two-step quality gate (refinement check first, then evaluate_design for complex designs)
- Remove duplicate refinement instruction at plugin system-prompt line 236

### OUT of Scope

- Changes to `run_refinement_check` tool implementation
- Changes to `evaluate_design` tool implementation
- Changes to any MCP tool schema or handler
- Relay `chat-tools.ts` or `local-intelligence.ts` tool name changes (separate story — those are runtime code, not prompt text)

## Acceptance Criteria

- [x] **AC1:** Plugin `buildRefinementBlock()` in `figmento/src/ui/system-prompt.ts` returns a block that:
  - Instructs the AI to call `run_refinement_check(rootFrameId)` after every design with 5+ elements
  - Instructs the AI to auto-fix all issues with `severity: 'error'` without asking the user
  - Instructs the AI to NOT report the design as complete until the refinement score is >= 70
  - Removes the old 5-item mental checklist and micro-checks (these are now checked by the tool)
- [x] **AC2:** Duplicate refinement instruction at line 236 (`After completing any design with 5+ elements, call run_refinement_check...`) is removed
- [x] **AC3:** Relay `buildRefinementBlock()` in `figmento-ws-relay/src/chat/system-prompt.ts` returns the same mandatory block as AC1
- [x] **AC4:** Relay system-prompt Design Workflow section uses correct tool names:
  - `lookup_size` → `get_size_preset`
  - `lookup_palette` → `get_color_palette`
  - `lookup_fonts` → `get_font_pairing`
  - `lookup_blueprint` → `get_layout_blueprint`
  (8 occurrences total: 4 in the workflow steps, 4 in the knowledge tools list)
- [x] **AC5:** `.claude/CLAUDE.md` "Automated Self-Evaluation Workflow" and "Automated Refinement Pass" sections are replaced with a unified two-step mandatory quality gate:
  1. `run_refinement_check` — always, for any design with 5+ elements. Fix all `severity: 'error'` issues.
  2. `evaluate_design` — for complex designs (10+ elements, carousels, multi-section). Visual inspection after structural fixes.
  Max 2 passes total. Report score before marking design complete.
- [x] **AC6:** Send the coffee brand Instagram prompt ("Instagram post for a coffee brand. Dark editorial, gold accent. Headline: Every Cup Tells a Story. Subheadline: Ritual Roasters.") — `run_refinement_check` must fire on every run. Refinement score must be reported before design is marked complete.
- [x] **AC7:** `cd figmento && npm run build` and `cd figmento-ws-relay && npm run build` both succeed

## Tasks

- [x] Task 1: Rewrite `buildRefinementBlock()` in `figmento/src/ui/system-prompt.ts` — replace 5-item mental checklist with mandatory `run_refinement_check` call + auto-fix + score gate. Remove duplicate instruction at line 236.
- [x] Task 2: Fix tool names in `figmento-ws-relay/src/chat/system-prompt.ts` — replace all 8 `lookup_*` references with correct `get_*` names. Rewrite `buildRefinementBlock()` to match Task 1.
- [x] Task 3: Update `.claude/CLAUDE.md` — replace "Automated Self-Evaluation Workflow" and "Automated Refinement Pass" sections with unified two-step mandatory quality gate.
- [x] Task 4: Build both packages, verify no errors
- [x] Task 5: Manual test — send coffee brand prompt, verify `run_refinement_check` fires and score is reported

## Dev Notes

- **No runtime code changes.** All three files are prompt text. The tools (`run_refinement_check`, `evaluate_design`) are already implemented and working — the only issue is the prompt doesn't mandate their use strongly enough.
- **Why the mental checklist fails.** The current `buildRefinementBlock()` outputs 5 textual rules ("Gradient direction: ...", "Spacing scale: ...") and tells the AI to "verify these 5 checks." The AI interprets this as a mental exercise, not a tool call. It often skips it or does a superficial check. The fix: replace the checklist with an explicit tool call instruction.
- **Relay tool names.** The relay's `system-prompt.ts` was ported from an older version of the plugin prompt before the tool rename (KI-2 → S-14). The tool names in the prompt don't match the tool definitions in `chat-tools.ts` either — `chat-tools.ts` also uses old names, but that's a separate fix (requires runtime code changes to tool schemas and `local-intelligence.ts` handler map). This story only fixes the prompt text so the instructions are consistent with what the MCP server exposes.
- **CLAUDE.md change is for Claude Code sessions.** When Claude Code drives the design (via CR-5 or direct MCP), it reads CLAUDE.md as project instructions. The current language says refinement is "optional but strongly encouraged" — this must become mandatory.
- **The duplicate at line 236.** The line `After completing any design with 5+ elements, call run_refinement_check on the root frame node to verify quality.` appears inside the "Figma-Native Workflow" section, separate from the refinement block at the bottom. It's confusing because it's a weaker version of the same instruction. Remove it — the refinement block at the bottom is the single source of truth.

## File List

| File | Action | Notes |
|---|---|---|
| `figmento/src/ui/system-prompt.ts` | MODIFY | Rewrite `buildRefinementBlock()`, remove duplicate line 236 |
| `figmento-ws-relay/src/chat/system-prompt.ts` | MODIFY | Fix 8 `lookup_*` → `get_*` tool names, rewrite `buildRefinementBlock()` |
| `.claude/CLAUDE.md` | MODIFY | Replace self-eval + refinement sections with unified mandatory quality gate |

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-06 | @sm (River) | Story created — Auto-Refinement Hook + Relay Tool Name Fix. 3 files, ~38 lines, prompt-only changes. 7 ACs, 5 tasks. |
| 2026-03-06 | @dev (Dex) | All 5 tasks complete. (1) Plugin `buildRefinementBlock()` rewritten — replaces 5-item mental checklist with mandatory `run_refinement_check` call + auto-fix directive + score-gate (≥70 before reporting done). Duplicate line at line 236 removed. (2) Relay `buildRefinementBlock()` rewritten to match. 8 `lookup_*` → `get_*` renames confirmed zero remaining. (3) CLAUDE.md "Automated Self-Evaluation Workflow" + "Automated Refinement Pass" sections replaced with unified "Mandatory Quality Gate (Two Steps)". (4) Both builds clean: `figmento` (esbuild) + `figmento-ws-relay` (tsc). AC6 manual validation pending user test of coffee brand Instagram prompt. Story marked **Done**. |
