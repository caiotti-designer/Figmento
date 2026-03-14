# Story TC-2: Consolidate 8 list_* Tools → list_resources(type)

**Status:** Ready
**Priority:** High (P1)
**Complexity:** S (3 points) — Straightforward merge of 8 tools with identical return patterns
**Epic:** TC — Tool Consolidation Sprint
**Depends on:** None
**PRD:** Architecture Audit 2026-03-14 (Item 1)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento-mcp-server) + all 8 list types return correct data
```

---

## Story

**As a** Claude Code session interacting with Figmento,
**I want** a single `list_resources` tool instead of 8 separate `list_*` tools,
**so that** the tool selection space is smaller and Claude can discover available resources with one tool.

---

## Description

### Tools to Consolidate

| Old Tool | Type Value | Source File |
|----------|-----------|-------------|
| `list_layout_blueprints` | `"blueprints"` | `layouts.ts` |
| `list_reference_categories` | `"references"` | `references.ts` |
| `list_patterns` | `"patterns"` | `patterns.ts` |
| `list_templates` | `"templates"` | `ds-templates.ts` |
| `list_icons` | `"icons"` | `icons.ts` |
| `list_formats` | `"formats"` | `design-system/ds-formats.ts` |
| `list_components` | `"components"` | `design-system/ds-components.ts` |
| `list_design_systems` | `"designSystems"` | `design-system/ds-crud.ts` |

### New Tool Signature

```typescript
server.tool('list_resources', 'List available design resources by type', {
  type: z.string().describe('Resource type: blueprints | references | patterns | templates | icons | formats | components | designSystems'),
  filter: z.string().optional().describe('Optional filter/search keyword (for icons: category or search term, for formats: category like social/print/web)'),
}, async (params) => { ... });
```

### Architecture

Create a new file `figmento-mcp-server/src/tools/resources.ts` that imports the list handler functions from each source module. Each source module must export its list handler as a named function (not just register it).

---

## Acceptance Criteria

- [ ] AC1: `list_resources` tool registered with `type` discriminator
- [ ] AC2: Each of the 8 type values returns the same data as the original tool
- [ ] AC3: `filter` param works for icons (category/search) and formats (category filter)
- [ ] AC4: All 8 old tool names registered as deprecated aliases
- [ ] AC5: `npm run build` clean
- [ ] AC6: Manual test: `list_resources(type="icons", filter="arrows")` returns arrow icons

---

## Tasks

1. **Extract list handlers** from each source module as named exported functions
2. **Create `resources.ts`** with `list_resources` tool + dispatch by type
3. **Register aliases** for all 8 old names in their original files
4. **Build and test**

---

## Dev Notes

- `list_icons` has a unique `filter` param (category enum + search keyword). Map this to the generic `filter` param.
- `list_formats` accepts a `category` param (social, print, web, etc.). Map to `filter`.
- The other 6 list tools take no params — `filter` is simply ignored for them.
- All list tools are **server-side only** (no `sendDesignCommand`), except `list_components` which reads from YAML.
- `list_components` accepts a `system` param (reserved, currently unused in the tool body). Map `filter` → `system` for forward compatibility so `list_resources(type="components", filter="payflow")` works when component filtering by system is implemented.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/resources.ts` | CREATE | New consolidated list tool |
| `figmento-mcp-server/src/tools/layouts.ts` | MODIFY | Export list handler function |
| `figmento-mcp-server/src/tools/references.ts` | MODIFY | Export list handler function |
| `figmento-mcp-server/src/tools/patterns.ts` | MODIFY | Export list handler function |
| `figmento-mcp-server/src/tools/ds-templates.ts` | MODIFY | Export list handler function |
| `figmento-mcp-server/src/tools/icons.ts` | MODIFY | Export list handler function |
| `figmento-mcp-server/src/tools/design-system/ds-formats.ts` | MODIFY | Export list handler function |
| `figmento-mcp-server/src/tools/design-system/ds-components.ts` | MODIFY | Export list handler function |
| `figmento-mcp-server/src/tools/design-system/ds-crud.ts` | MODIFY | Export list handler function |
| `figmento-mcp-server/src/server.ts` | MODIFY | Import and call `registerResourceTools()` |

---

## Definition of Done

- [ ] `npm run build` clean
- [ ] All 8 resource types return correct data via `list_resources`
- [ ] Old aliases work

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment |
| 2026-03-14 | @pm (Morgan) | Applied @po validation fixes: fixed server.ts path, documented system→filter mapping for list_components. Status Draft → Ready |
