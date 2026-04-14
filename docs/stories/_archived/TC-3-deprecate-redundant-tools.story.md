# Story TC-3: Remove Deprecated `scan_template` MCP Tool

**Status:** Done
**Priority:** Low (P3)
**Complexity:** XS (1 point) — Single tool deregistration + description fixup
**Epic:** FIS — Figmento Improvement Sprint (Sprint B housekeeping)
**Depends on:** None
**PRD:** Architecture Audit 2026-03-14 (Item 1)

> **History:** TC-3 originally bundled removal of `clone_node`, `scan_template`, `get_refinement_rules`, and 23 TC-1/TC-2 aliases. All work except the `scan_template` removal was shipped silently by @dev between 2026-03-14 and 2026-04-13:
> - `clone_node` removed in commit `7cb7e92` (chore: MCP cleanup)
> - TC-1/TC-2 aliases removed per CLAUDE.md "Old tool names have been fully removed"
> - `get_refinement_rules` not found in any tool file — likely never registered or already removed
>
> @po audit on 2026-04-13 re-scoped this story to only the remaining work.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento-mcp-server) + scan_template no longer in tool registration + scan_frame_structure still works as the replacement
```

---

## Story

**As a** Figmento maintainer,
**I want** the `scan_template` MCP tool removed from the registry,
**so that** it stops appearing in Claude's tool list and the deprecation (marked since the tool was introduced) is finalized.

---

## Description

`figmento-mcp-server/src/tools/template.ts` currently registers `scan_template` with the description:

```
'[DEPRECATED — use scan_frame_structure] Scan a frame for "#"-prefixed template placeholders.'
```

Since `scan_frame_structure` is the functional replacement, the deprecated `scan_template` registration should be removed entirely. Two small follow-ups:

1. Update the parameter descriptions on `apply_template_text` and `apply_template_image` — they currently say "from scan_template results" and should say "from scan_frame_structure results".
2. The plugin-side action handler (`scan_template` case in `canvas-query.ts`) can stay for now — it's referenced internally by older designs in the wild. Only the MCP tool registration is removed.

---

## Acceptance Criteria

- [ ] **AC1:** The `scan_template` MCP tool registration is removed from `figmento-mcp-server/src/tools/template.ts` (delete the `server.tool('scan_template', ...)` block and its schema).
- [ ] **AC2:** `scanTemplateSchema` export is removed if no other tool imports it.
- [ ] **AC3:** `applyTemplateTextSchema.nodeId` description is updated: `'(from scan_template results)'` → `'(from scan_frame_structure results)'`.
- [ ] **AC4:** `applyTemplateImageSchema.nodeId` description is updated: same fix.
- [ ] **AC5:** `npm run build` is clean in `figmento-mcp-server/`.
- [ ] **AC6:** After rebuild, the MCP tool list no longer contains `scan_template`, and `scan_frame_structure` still functions.

---

## Scope

### IN
- `figmento-mcp-server/src/tools/template.ts` — remove `scan_template` tool block and schema
- Parameter description fixups on `apply_template_text` and `apply_template_image`

### OUT
- Plugin-side action handler (`scan_template` case in `canvas-query.ts`) — leave in place
- Documentation updates — CLAUDE.md doesn't reference `scan_template` directly
- Migration helpers — `scan_frame_structure` has been available for months

---

## Dev Notes

- `scan_frame_structure` is already in `canvas-query.ts` and is the recommended replacement (it scans structurally, not just by `#` prefix — a superset).
- The `scan_template` plugin-side handler can be kept indefinitely; removing only the MCP tool means Claude Code sessions never see it in the tool list.
- This is the final item from the original Sprint B tool-consolidation work.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/template.ts` | MODIFY | Remove `scan_template` tool block + schema; fix 2 parameter descriptions |

---

## Definition of Done

- [ ] `npm run build` clean
- [ ] `scan_template` not in MCP tool list after rebuild
- [ ] `apply_template_text` and `apply_template_image` work unchanged

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment — bundled 3 tool removals + 23 aliases |
| 2026-04-13 | @po (Pax) | **Validation NO-GO → re-scoped.** Audit found 75% of original scope already shipped: `clone_node` removed in `7cb7e92`, TC-1/TC-2 aliases removed per CLAUDE.md, `get_refinement_rules` not found in code. Only `scan_template` removal remains. Story rewritten with XS scope (1 pt) targeting single-tool deregistration + 2 description fixups. Status: Draft → Ready (6 ACs). |
| 2026-04-13 | @dev (Dex) | **Implemented.** Removed `scan_template` tool registration block + `scanTemplateSchema` from `figmento-mcp-server/src/tools/template.ts`. Updated `applyTemplateTextSchema.nodeId` and `applyTemplateImageSchema.nodeId` descriptions to reference `scan_frame_structure` instead. Plugin-side handler in `canvas-query.ts` left in place per Dev Notes. Status: Ready → Done. |
