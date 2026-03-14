# Story TC-3: Deprecate clone_node, scan_template, get_refinement_rules

**Status:** Draft
**Priority:** Medium (P2)
**Complexity:** S (2 points) — Merge 3 tools into their more capable counterparts, remove aliases from TC-1/TC-2
**Epic:** TC — Tool Consolidation Sprint
**Depends on:** TC-1, TC-2
**PRD:** Architecture Audit 2026-03-14 (Item 1)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean + deprecated tools removed from registration + replacement tools handle all use cases
```

---

## Story

**As a** Figmento maintainer,
**I want** redundant tools removed from the MCP tool registry,
**so that** the tool count stays low and Claude doesn't have overlapping options.

---

## Description

### Deprecation Map

| Tool to Remove | Replacement | Rationale |
|----------------|-------------|-----------|
| `clone_node` | `clone_with_overrides` (N=1, no overrides = same behavior) | `clone_with_overrides` is strictly more capable |
| `scan_template` (MCP) | Fold into `apply_template_text` as internal step | `scan_template` is always called immediately before `apply_template_text` — make scan automatic |
| `get_refinement_rules` | Fold into `run_refinement_check` response | Rules are only useful alongside check results — return them together |

### Also: Remove TC-1/TC-2 Aliases

The 23 backward-compatible aliases registered in TC-1 and TC-2 have served their 1-sprint purpose. Remove them:
- 15 aliases from TC-1 (set_fill, set_stroke, set_effects, set_corner_radius, set_opacity, move_node, resize_node, apply_paint_style, apply_text_style, apply_effect_style, get_size_preset, get_font_pairing, get_type_scale, get_color_palette, get_spacing_scale, get_layout_guide)
- 8 aliases from TC-2 (list_layout_blueprints, list_reference_categories, list_patterns, list_templates, list_icons, list_formats, list_components, list_design_systems)

---

## Acceptance Criteria

- [ ] AC1: `clone_node` tool removed — `clone_with_overrides` with `count: 1` and no overrides produces same result
- [ ] AC2: `scan_template` MCP tool removed — `apply_template_text` internally scans before applying (returns scan results if no content provided)
- [ ] AC3: `get_refinement_rules` tool removed — `run_refinement_check` response includes `rules` field with the refinement rules
- [ ] AC4: All 23 TC-1/TC-2 aliases removed from tool registration
- [ ] AC5: `npm run build` clean
- [ ] AC6: CLAUDE.md updated to remove any references to the 3 deprecated tools

---

## Tasks

1. **Remove `clone_node`** from `scene.ts` — no replacement code needed, `clone_with_overrides` already exists
2. **Merge `scan_template` into `apply_template_text`** — add optional `scanOnly: boolean` param. If true or no content provided, return scan results without applying
3. **Merge `get_refinement_rules` into `run_refinement_check`** — add `rules` field to refinement response from `refinement.ts`
4. **Remove all 23 aliases** from style.ts, scene.ts, figma-native.ts, intelligence.ts, and the 8 list tool source files
5. **Update CLAUDE.md** to remove references to deprecated tools

---

## Dev Notes

- **`clone_with_overrides` with `count: 1` and empty `overrides`** should behave identically to `clone_node(nodeId, offsetX, offsetY, newName, parentId)`. Verify the param mapping works: `clone_with_overrides({ nodeId, count: 1, offsetX, offsetY, overrides: [] })`.
- **`scan_template` on the plugin side** (`handleScanTemplateCmd`) stays — it's still called as an action string. Only the MCP tool registration is removed.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/scene.ts` | MODIFY | Remove `clone_node` tool + TC-1 aliases |
| `figmento-mcp-server/src/tools/template.ts` | MODIFY | Remove `scan_template` tool, add `scanOnly` to `apply_template_text` |
| `figmento-mcp-server/src/tools/refinement.ts` | MODIFY | Remove `get_refinement_rules` tool, add `rules` to `run_refinement_check` response |
| `figmento-mcp-server/src/tools/style.ts` | MODIFY | Remove TC-1 aliases |
| `figmento-mcp-server/src/tools/figma-native.ts` | MODIFY | Remove TC-1 aliases |
| `figmento-mcp-server/src/tools/intelligence.ts` | MODIFY | Remove TC-1 aliases |
| `figmento-mcp-server/src/tools/layouts.ts` | MODIFY | Remove TC-2 alias |
| `figmento-mcp-server/src/tools/references.ts` | MODIFY | Remove TC-2 alias |
| `figmento-mcp-server/src/tools/patterns.ts` | MODIFY | Remove TC-2 alias |
| `figmento-mcp-server/src/tools/ds-templates.ts` | MODIFY | Remove TC-2 alias |
| `figmento-mcp-server/src/tools/icons.ts` | MODIFY | Remove TC-2 alias |
| `figmento-mcp-server/src/tools/design-system/ds-formats.ts` | MODIFY | Remove TC-2 alias |
| `figmento-mcp-server/src/tools/design-system/ds-components.ts` | MODIFY | Remove TC-2 alias |
| `figmento-mcp-server/src/tools/design-system/ds-crud.ts` | MODIFY | Remove TC-2 alias |
| `.claude/CLAUDE.md` | MODIFY | Remove references to deprecated tools |

---

## Definition of Done

- [ ] `npm run build` clean
- [ ] `npm test` passes
- [ ] 26 fewer tools registered (3 deprecated + 23 aliases)
- [ ] `clone_with_overrides` covers all `clone_node` use cases

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment |
