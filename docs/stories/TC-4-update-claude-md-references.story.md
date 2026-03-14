# Story TC-4: Update CLAUDE.md Tool References + Verify Aliases

**Status:** InProgress
**Priority:** High (P1)
**Complexity:** S (2 points) — Text changes in CLAUDE.md, no code
**Epic:** TC — Tool Consolidation Sprint
**Depends on:** TC-1, TC-2
**PRD:** Architecture Audit 2026-03-14 (Item 1)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: grep for old tool names in CLAUDE.md returns zero hits (except in alias deprecation notes)
```

---

## Story

**As a** Claude Code session reading the CLAUDE.md system prompt,
**I want** tool references to use the new consolidated names,
**so that** Claude calls the efficient merged tools instead of deprecated aliases.

---

## Description

After TC-1 and TC-2 land, CLAUDE.md still references old tool names in ~8 locations. Update all references to use the new names. Also verify that the deprecated aliases registered in TC-1/TC-2 actually work by calling each one.

### References to Update in CLAUDE.md

| Section | Old Reference | New Reference |
|---------|---------------|---------------|
| Standard Design Workflow step 2 | `get_size_preset()` | `get_design_guidance(aspect="size")` |
| Standard Design Workflow step 3 | `get_color_palette(mood)` | `get_design_guidance(aspect="color", mood=...)` |
| Standard Design Workflow step 4 | `get_font_pairing(mood)` | `get_design_guidance(aspect="fonts", mood=...)` |
| Standard Design Workflow step 5 | `get_type_scale(ratio)` | `get_design_guidance(aspect="typeScale", ratio=...)` |
| Standard Design Workflow step 6 | `get_layout_guide()` | `get_design_guidance(aspect="layout")` |
| Figma-Native Workflow step 3 | `apply_paint_style`, `apply_text_style` | `apply_style(styleType="paint")`, `apply_style(styleType="text")` |
| Self-Evaluation step 12 | `move_node` / `resize_node` / `set_fill` | `transform_node` / `set_style(property="fill")` |
| Ad structure pattern | `set_fill` | `set_style(property="fill")` |
| Color Selection Guide (line 317) | `get_color_palette(mood)` | `get_design_guidance(aspect="color", mood=...)` |
| Mandatory Quality Gate STEP 1 (line 396) | `set_fill` | `set_style(property="fill")` (will be removed entirely by AE-2 — update anyway in case AE-2 is delayed) |

### Also Update

- `find_design_references` → keep (not consolidated)
- `get_layout_blueprint` → keep (not consolidated)
- `list_icons` references → `list_resources(type="icons")`

---

## Acceptance Criteria

- [x] AC1: All old tool name references in CLAUDE.md replaced with new consolidated names
- [ ] AC2: Each deprecated alias (16 from TC-1, 8 from TC-2 — 24 total) tested via manual call — returns correct result
- [x] AC3: No functional tool references in CLAUDE.md point to non-existent tools
- [x] AC4: Alias deprecation note added at the end of the "Design System Workflow" section in CLAUDE.md, listing all 24 aliases and their removal timeline (TC-3)

---

## Tasks

1. Search CLAUDE.md for all 24 old tool names (16 from TC-1, 8 from TC-2)
2. Replace each with the new consolidated form
3. Add a "Deprecated Aliases" note at the end of the "Design System Workflow" section
4. Manually verify each alias works

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `.claude/CLAUDE.md` | MODIFY | Update ~15 tool name references |

---

## Definition of Done

- [ ] Zero references to old tool names in CLAUDE.md (except deprecation note)
- [ ] All aliases verified working

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment |
| 2026-03-14 | @pm (Morgan) | Applied @po validation fixes: added 2 missing CLAUDE.md references (line 317, 396), corrected alias count to 24, fixed section name for deprecation note. Status Draft → Ready |
