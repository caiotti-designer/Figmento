# Story MQ-4: Blueprint Injection into Mode Prompts

**Status:** Ready for Review
**Priority:** Medium
**Complexity:** M
**Epic:** MQ — Mode Quality Parity
**Phase:** 2 (depends on Phase 1 completion; can run in parallel with MQ-5)

---

## PO Validation

**Score:** 8/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-02

| Check | Result | Note |
|-------|--------|------|
| 1. Clear title | ✅ | |
| 2. Complete description | ✅ | Pre-check warning for sparse layouts is excellent proactive clarity |
| 3. Testable AC | ✅ | 7 ACs; graceful degradation (null return) explicitly required |
| 4. Scope IN/OUT | ⚠️ | OUT should note: carousel/presentation prompts not receiving injection |
| 5. Dependencies | ✅ | Phase 2 (after Phase 1); MQ-5 coordination noted in Dev Notes |
| 6. Complexity | ✅ | M (2 new files + 2 file modifications) |
| 7. Business value | ✅ | Closes layout blueprint gap vs MCP path |
| 8. Risks | ⚠️ | Manual vs build-step ambiguity; story mandates manual approach — good |
| 9. Done criteria | ✅ | Build + 4-checkbox validation test |
| 10. Alignment | ✅ | Blueprint architecture from MCP server carried correctly |

**Observation:** Story correctly identifies that `knowledge/layouts/` has no blueprint YAMLs yet. Manual embedded approach (Task 1a) is the mandated path. @dev must include at minimum 4 blueprints covering the 4 categories (social, web, print, presentation) to provide baseline coverage for all format types.

---

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [build, manual-smoke]
```

---

## Story

**As a** user of Figmento's modes,
**I want** the AI to know about layout blueprints (proportional zones, typography rhythm, memorable elements) when generating designs,
**so that** designs follow proven compositions instead of whatever the AI remembers from training data.

---

## Context

The MCP path calls `get_layout_blueprint` which returns zone data (e.g., "hero zone: 0-55%, content zone: 55-85%, CTA zone: 85-100%") guiding design creation. The modes have no access to this data.

This story loads relevant blueprint data and injects layout zone information into mode prompts at runtime. Because the plugin runs in Figma's sandbox and cannot read files at runtime, blueprint data must be embedded at build time as a TypeScript constant.

> **⚠️ Important pre-check:** `figmento-mcp-server/knowledge/layouts/` currently only contains `_schema.yaml` — no actual blueprint YAMLs exist yet. Before @dev starts Task 1, check whether real blueprints have been created. If the directory is still empty (only `_schema.yaml`), **use the manual embedded approach** described in Dev Notes below rather than the build-step extraction approach.

---

## Acceptance Criteria

1. A `getRelevantBlueprint(category, mood?)` helper exists in `figmento/src/ui/blueprint-loader.ts` that accepts a format category (social, web, print, presentation) and optional mood and returns the best-matching blueprint data or `null`.
2. Blueprint data is embedded as a TypeScript constant in `figmento/src/ui/blueprint-data.ts`. Each blueprint entry includes: `name`, `category`, `subcategory`, `moods`, `zones` (array of zone objects with `name`, `y_start_pct`, `y_end_pct`), and `memorable_element`.
3. `getTextLayoutPrompt()` injects the best-matching blueprint's zone data when one is found: "Layout zones: [zone 0-55%: hero, 55-85%: content, 85-100%: CTA]. Place elements proportionally within these zones."
4. `getAnalysisPrompt()` does NOT inject blueprints — it analyzes an existing screenshot; layout composition comes from the image, not a blueprint.
5. `buildSystemPrompt()` includes a short "Layout Blueprints" section explaining that when zone data is provided in the prompt, the AI should distribute elements proportionally within those zones.
6. Blueprint matching uses category (inferred from format string — "Instagram Post" → social, "Web Hero" → web, "A4" → print, "Presentation" → presentation) and mood (from user color/style selection if available).
7. Build clean: `cd figmento && npm run build`

---

## Tasks / Subtasks

- [x] **Task 1: Check knowledge/layouts/ directory**
  - Real blueprint YAMLs found (24+ across all categories) — used extraction approach (Task 1b)
  - Data was extracted from actual YAML files and embedded in blueprint-data.ts

  **Task 1b — Extraction approach (used — real YAMLs existed):**
  - Read all blueprint YAMLs from `figmento-mcp-server/knowledge/layouts/` across all 5 categories
  - Embedded 10 blueprints (social: 4, web: 2, ads: 1, print: 2, presentation: 2)

- [x] **Task 2: Create blueprint-loader.ts** (AC: 1, 6)
  - `inferCategory(formatName)`, `getRelevantBlueprint(category, mood?)`, `formatBlueprintZones(bp, canvasHeight?)`
  - CATEGORY_MAP maps 20+ format display names to blueprint categories

- [x] **Task 3: Inject into getTextLayoutPrompt()** (AC: 3)
  - Injected after layout preset section, before reference images
  - Outputs: blueprint name, zone string with pixel values, memorable element hint

- [x] **Task 4: Update buildSystemPrompt()** (AC: 5)
  - Added "LAYOUT BLUEPRINTS (Text-to-Layout Mode)" section with zone interpretation guidance

- [x] **Task 5: Verify screenshot mode is NOT affected** (AC: 4)
  - `getAnalysisPrompt()` in prompt.ts not touched by MQ-4

- [x] **Task 6: Build and verify** (AC: 7)
  - `cd figmento && npm run build` — passes clean (dist/code.js 442.6kb)

---

## Dev Notes

**Manual approach is preferred.** The plugin can't read files at runtime (Figma sandbox). A build-step that auto-extracts YAMLs is elegant but adds complexity. Since blueprints don't change often, a manually maintained `blueprint-data.ts` is simpler and more reliable. If real blueprint YAMLs are created later, they can inform the manual file.

**MQ-5 shares the same pattern** — consider coordinating blueprint-data.ts and reference-data.ts in a single module if they're created in the same sprint.

**Format → category mapping (seed this in blueprint-loader.ts):**
```typescript
const CATEGORY_MAP: Record<string, Blueprint['category']> = {
  'Instagram': 'social',
  'TikTok': 'social',
  'Facebook': 'social',
  'Web Hero': 'web',
  'Landing Page': 'web',
  'A4': 'print',
  'Poster': 'print',
  'Presentation': 'presentation',
  'Slide': 'presentation',
};
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `figmento/src/ui/blueprint-data.ts` | Embedded blueprint data (manual or generated) |
| `figmento/src/ui/blueprint-loader.ts` | Category/mood matching logic |

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/text-layout.ts` | Inject blueprint zones into getTextLayoutPrompt() |
| `figmento/src/ui/system-prompt.ts` | Add "Layout Blueprints" awareness section |
| `figmento/build.js` | Only if using build-step extraction approach (Task 1b) |

---

## Validation

**TEST MQ-4 (Text-to-Layout):** "Create an Instagram post for a coffee shop." — inspect the design structure.
- [x] Visual zone occupies roughly top 55-65% of the frame
- [x] Content text appears in the middle zone
- [x] CTA/branding at the bottom zone
- [x] Blueprint zone data visible in the prompt (enable console logging temporarily to confirm injection)

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - TypeScript types on Blueprint interface (strict, no any)
  - Null-safety on getRelevantBlueprint return value (caller must handle null)
  - Graceful degradation: prompt must work correctly when no blueprint matches
```
