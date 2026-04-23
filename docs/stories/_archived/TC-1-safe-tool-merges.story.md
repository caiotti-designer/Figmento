# Story TC-1: Tool Consolidation — 4 Safe Merges

**Status:** Done (retroactive — @po audit 2026-04-13)
**Priority:** High (P1)
**Complexity:** M (5 points) — 4 schema merges in MCP server tool files, no plugin changes, no relay changes
**Epic:** TC — Tool Consolidation Sprint
**Depends on:** None
**PRD:** Architecture Audit 2026-03-14 (Item 1)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento-mcp-server) + all 4 merged tools callable via Claude Code + old aliases still work
```

---

## Story

**As a** Claude Code user designing in Figma via Figmento,
**I want** fewer, more cohesive MCP tools,
**so that** Claude picks the right tool more reliably and produces better designs with fewer wasted tool calls.

---

## Description

Merge 16 existing MCP tools into 4 consolidated tools. These are **pure consolidation** — the `sendDesignCommand` action strings sent to the plugin remain identical. The plugin's `executeCommand` switch is NOT touched.

### Out of Scope

The following intelligence tools are **NOT merged** into `get_design_guidance` — they have different parameter shapes or semantics:

- `get_contrast_check` — computation tool (takes foreground + background hex, returns WCAG ratio), not a knowledge lookup
- `get_brand_kit` — reads/writes per-brand YAML files, not a design guidance query
- `save_brand_kit` — write operation, not a read/lookup
- `get_design_rules` — returns verbose reference data by category, distinct from the concise guidance lookups

### Merge Map

| New Tool | Old Tools Absorbed | Discriminator Param |
|----------|-------------------|-------------------|
| `set_style` | `set_fill`, `set_stroke`, `set_effects`, `set_corner_radius`, `set_opacity` | `property: "fill" \| "stroke" \| "effects" \| "cornerRadius" \| "opacity"` |
| `transform_node` | `move_node`, `resize_node` | None — flat schema with optional `x`, `y`, `width`, `height` |
| `apply_style` | `apply_paint_style`, `apply_text_style`, `apply_effect_style` | `styleType: "paint" \| "text" \| "effect"` |
| `get_design_guidance` | `get_size_preset`, `get_font_pairing`, `get_type_scale`, `get_color_palette`, `get_spacing_scale`, `get_layout_guide` | `aspect: "size" \| "fonts" \| "typeScale" \| "color" \| "spacing" \| "layout"` |

### Architecture Decision

Each merged tool internally dispatches to the **same `sendDesignCommand` action string** as before. Example for `set_style`:

```typescript
server.tool('set_style', 'Set visual style...', setStyleSchema, async (params) => {
  switch (params.property) {
    case 'fill':    return wrap(await sendDesignCommand('set_fill', params));
    case 'stroke':  return wrap(await sendDesignCommand('set_stroke', params));
    case 'effects': return wrap(await sendDesignCommand('set_effects', params));
    // ...
  }
});
```

### Backward Compatibility (1-Sprint Aliases)

Register old tool names as thin wrappers that delegate to the new tool. These aliases will be removed in the following sprint (TC-3).

```typescript
// Alias — remove next sprint
server.tool('set_fill', 'Deprecated: use set_style(property="fill")', setFillSchema, async (params) => {
  return setStyleHandler({ ...params, property: 'fill' });
});
```

---

## Acceptance Criteria

- [ ] AC1: `set_style` tool registered with `property` discriminator, handles all 5 style operations
- [ ] AC2: `transform_node` tool registered, accepts optional `x`, `y`, `width`, `height` on single `nodeId`
- [ ] AC2b: `transform_node` with both position (x, y) and size (width, height) params executes move before resize — if resize fails, move is NOT rolled back (documented behavior, not a transaction)
- [ ] AC3: `apply_style` tool registered with `styleType` discriminator, handles paint/text/effect
- [ ] AC4: `get_design_guidance` tool registered with `aspect` discriminator, handles all 6 knowledge lookups
- [ ] AC5: All 16 old tool names still registered as aliases delegating to new handlers
- [ ] AC6: `npm run build` clean with zero errors in figmento-mcp-server
- [ ] AC7: Existing tests in `tests/intelligence.test.ts` still pass (covers get_* knowledge tools)
- [ ] AC8: Manual smoke test: connect to Figma, call each new tool with each discriminator value, verify Figma canvas responds correctly

---

## Tasks

### Phase 1: Create Merged Tool Schemas

1. In `figmento-mcp-server/src/tools/style.ts`:
   - Define `setStyleSchema` as union of existing schemas + `property` discriminator
   - Keep individual schemas for alias registration
   - Register `set_style` tool with dispatch switch

2. In `figmento-mcp-server/src/tools/scene.ts`:
   - Define `transformNodeSchema` combining `move_node` + `resize_node` params (all optional except `nodeId`)
   - Register `transform_node` tool

3. In `figmento-mcp-server/src/tools/figma-native.ts`:
   - Define `applyStyleSchema` with `styleType` discriminator + `nodeId` + `styleId`
   - Register `apply_style` tool

4. In `figmento-mcp-server/src/tools/intelligence.ts`:
   - Define `getDesignGuidanceSchema` with `aspect` discriminator + existing optional params per aspect
   - Register `get_design_guidance` tool

### Phase 2: Register Backward-Compatible Aliases

For each of the 16 old tool names, register a thin alias:
- Same Zod schema as before (no breaking change for callers)
- Handler injects the discriminator value and delegates to the new handler
- Add `[DEPRECATED — use X instead]` to tool description

### Phase 3: Verify

- `npm run build`
- `npm test`
- Manual test each merged tool + each alias

---

## Dev Notes

- **TS2589 risk:** Use `z.string().describe(...)` for discriminator params, NOT `z.enum()`. The MCP SDK + Zod deep instantiation issue (documented in MEMORY.md) will cause compile failures with enums in `server.tool()` schemas.
- **`get_design_guidance` is server-side only** — no `sendDesignCommand` needed. It reads from YAML knowledge cache. The `aspect` param just selects which knowledge loader to call.
- **`transform_node` sends TWO actions** when both position and size change: `sendDesignCommand('move_node', {nodeId, x, y})` then `sendDesignCommand('resize_node', {nodeId, width, height})`. Order matters — move first, then resize.
- **Do NOT touch the plugin** (`figmento/src/code.ts`). The `executeCommand` switch still receives the original action strings.
- **`set_auto_layout` stays separate.** It has 8+ unique params and different semantics from visual styling. Don't merge it into `set_style`.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/style.ts` | MODIFY | Add `set_style` + aliases for 5 old tools |
| `figmento-mcp-server/src/tools/scene.ts` | MODIFY | Add `transform_node` + aliases for `move_node`, `resize_node` |
| `figmento-mcp-server/src/tools/figma-native.ts` | MODIFY | Add `apply_style` + aliases for 3 old tools |
| `figmento-mcp-server/src/tools/intelligence.ts` | MODIFY | Add `get_design_guidance` + aliases for 6 old tools |

---

## Definition of Done

- [ ] `npm run build` clean
- [ ] `npm test` passes
- [ ] All 4 merged tools work end-to-end via Claude Code → Figma
- [ ] All 16 aliases work identically to before
- [ ] No plugin or relay changes required

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment |
| 2026-03-14 | @pm (Morgan) | Applied @po validation fixes: added Out of Scope for 4 unmerged intelligence tools, added AC2b dual-action failure behavior, corrected alias count 15 → 16. Status Draft → Ready |
| 2026-04-13 | @po (Pax) | **Retroactive Done.** Audit confirms `set_style`, `transform_node`, `apply_style`, `get_design_guidance` all registered in MCP server (`style.ts:153`, `scene.ts:177`, `figma-native.ts:165`, `intelligence.ts:316`). Aliases removed per CLAUDE.md "Old tool names have been fully removed". Status: Ready → Done. |
