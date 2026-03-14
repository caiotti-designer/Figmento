# Epic FIS: Figmento Improvement Sprint

**Status:** Draft
**Priority:** High
**Target:** Reduce MCP tools from 75 → ~38, add auto-evaluation, modularize plugin sandbox
**Source:** Architecture Audit 2026-03-14 (@architect Aria)

---

## Objective

Close the top 3 gaps identified in the architecture audit before Figmento goes to real users:

1. **Too many tools (75)** → Claude picks wrong tools, wastes calls
2. **No automatic quality feedback** → Claude skips evaluation 60%+ of the time
3. **Plugin monolith (3,389 lines)** → Any change risks regressions

---

## Sprint Tracks

### Sprint A — Core Quality (P1, 14 points)

Higher ROI. Directly improves Claude's design output quality. Prioritize for @po validation and @dev pickup.

| Story | Title | Points | Depends On |
|-------|-------|--------|------------|
| **TC-1** | Tool consolidation — 4 safe merges (set_style, transform_node, apply_style, get_design_guidance) | 5 | — |
| **TC-2** | Consolidate 8 list_* tools → list_resources(type) | 3 | — |
| **TC-4** | Update CLAUDE.md tool references + verify aliases | 2 | TC-1, TC-2 |
| **AE-1** | Auto-evaluate after batch_execute and create_design | 3 | — |
| **AE-2** | Remove mandatory quality gate from CLAUDE.md | 1 | AE-1 |

**Execution order:** TC-1 and TC-2 and AE-1 can run in parallel. TC-4 blocks on TC-1+TC-2. AE-2 blocks on AE-1.

```
         ┌── TC-1 ──┐
Start ───┤           ├── TC-4 ── Done
         ├── TC-2 ──┘
         └── AE-1 ──── AE-2 ─── Done
```

### Sprint B — Housekeeping (P2, 12 points)

Structural improvement. De-risks future development. Can run in parallel with Sprint A if second dev available.

| Story | Title | Points | Depends On |
|-------|-------|--------|------------|
| **TC-3** | Deprecate clone_node, scan_template, get_refinement_rules + remove TC-1/TC-2 aliases | 2 | TC-1, TC-2 |
| **CS-1** | Extract utils from code.ts (error-classifier, progress, node-utils, temp-id-resolver) | 2 | — |
| **CS-2** | Extract storage + settings handlers from code.ts | 3 | CS-1 |
| **CS-3** | Extract command router + canvas handlers from code.ts | 5 | CS-1 |
| **CS-4** | Extract design creation + figma native + templates from code.ts | 2 | CS-3 |

**Execution order:** CS-1 is prerequisite for CS-2, CS-3, CS-4. TC-3 blocks on Sprint A completion.

```
         ┌── CS-2 ──────────── Done
CS-1 ────┤
         └── CS-3 ──── CS-4 ── Done

TC-1 + TC-2 ──── TC-3 ──────── Done
```

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| MCP tools registered | 75 | ~38 |
| Designs auto-evaluated | 0% | ~95% (skipped only for small batches) |
| code.ts line count | 3,389 | <700 |
| Avg tool calls per design | ~25 (with manual evaluation) | ~20 (evaluation automatic) |

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Tool consolidation breaks existing Claude Code sessions | 1-sprint backward-compatible aliases (TC-1/TC-2), removed in TC-3 |
| Auto-evaluation adds latency to every batch | Skip for batches < 5 commands; parallel refinement + screenshot (~1.1s) |
| Plugin split introduces regression | Pure extraction (no behavior change) + build verification at each step |
| CLAUDE.md updates not picked up by active sessions | Sessions load CLAUDE.md at start — changes apply to new sessions only |

---

## Story Files

- [TC-1: Safe tool merges](TC-1-safe-tool-merges.story.md)
- [TC-2: Consolidate list tools](TC-2-consolidate-list-tools.story.md)
- [TC-3: Deprecate redundant tools](TC-3-deprecate-redundant-tools.story.md)
- [TC-4: Update CLAUDE.md references](TC-4-update-claude-md-references.story.md)
- [AE-1: Auto-evaluate after batch](AE-1-auto-evaluate-after-batch.story.md)
- [AE-2: Remove mandatory quality gate](AE-2-remove-mandatory-quality-gate-from-claude-md.story.md)
- [CS-1: Extract utils](CS-1-extract-utils-from-code-ts.story.md)
- [CS-2: Extract storage + settings](CS-2-extract-storage-settings-handlers.story.md)
- [CS-3: Extract command router](CS-3-extract-command-router-canvas-handlers.story.md)
- [CS-4: Extract remaining modules](CS-4-extract-design-creation-figma-native-templates.story.md)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Epic created from @architect sprint assessment |
