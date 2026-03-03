# Story MQ-5: Reference Injection into Mode Prompts

**Status:** Ready for Review
**Priority:** Medium
**Complexity:** M
**Epic:** MQ — Mode Quality Parity
**Phase:** 2 (depends on Phase 1 completion; can run in parallel with MQ-4)

---

## PO Validation

**Score:** 9/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-02

| Check | Result | Note |
|-------|--------|------|
| 1. Clear title | ✅ | |
| 2. Complete description | ✅ | Pre-check lists every category with real vs empty data — excellent |
| 3. Testable AC | ✅ | 6 ACs; graceful degradation required; two complementary test scenarios |
| 4. Scope IN/OUT | ✅ | Metadata-only (not images) stated in Context and AC:1 |
| 5. Dependencies | ✅ | Phase 2; MQ-4 soft dep documented with workaround strategy |
| 6. Complexity | ✅ | M |
| 7. Business value | ✅ | Reference-inspired output explicitly targeted |
| 8. Risks | ✅ | Rebuild-on-new-reference limitation documented; empty category fallback validated |
| 9. Done criteria | ✅ | Build + 2 tests (inject path + no-inject path) |
| 10. Alignment | ✅ | Mirrors MCP `find_design_references` capability correctly |

**Observation:** Rebuild-on-reference limitation is a known usability tradeoff — document it in the plugin UI or README when this ships. No blocker for development.

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
**I want** the AI to know about curated reference designs (compositional patterns, notable elements, color distribution) when creating my designs,
**so that** generated output is inspired by proven professional work instead of generic AI patterns.

---

## Context

The MCP path calls `find_design_references` and studies the matched reference's `notable` element and `composition_notes`. The modes have no reference awareness.

This story embeds reference metadata at build time and injects relevant reference guidance into mode prompts. Only metadata (YAML content) is embedded — not the image files, which are too large.

> **⚠️ Important pre-check:** Reference coverage is currently sparse:
> - **Has real YAMLs:** `web/hero` (6 YAMLs), `print/brochure` (3 YAMLs)
> - **Empty (only .gitkeep):** `web/features`, `web/pricing`, `web/cta`, `web/footer`, `social/feed-post`, `social/story`, `social/carousel`, `ads/product`, `ads/sale-promo`, `ads/brand-awareness`, `print/business-card`, `print/poster`, `presentation/title-slide`, `presentation/content-slide`, `presentation/data-slide`
>
> This means reference injection will only have real data for web hero and print brochure formats. For all social, carousel, ads, and presentation formats, `getRelevantReferences()` will return an empty array and the prompt will proceed without injection. This is acceptable for v1 — injection is fully additive.

---

## Acceptance Criteria

1. Reference metadata is embedded at build time as a TypeScript constant in `figmento/src/ui/reference-data.ts`. Each entry includes: `id`, `category`, `subcategory`, `moods`, `notable` (the standout design element description), `composition_notes` (zone breakdown / layout pattern), `color_temperature`.
2. A `getRelevantReferences(category, subcategory?, mood?, limit?)` helper in `figmento/src/ui/reference-loader.ts` returns matching references sorted by relevance score (limit defaults to 1).
3. `getTextLayoutPrompt()` injects the top reference's `notable` and `composition_notes` when available: "Reference inspiration: [notable]. Composition approach: [composition_notes]. Adapt these proportional principles with the current brief's content and colors."
4. `buildSystemPrompt()` includes a short note: "When the prompt includes reference inspiration, study it carefully — adapt the compositional proportions and the standout element, not the literal colors or content."
5. Injection is fully additive — when no references match the format (most social/ads formats currently), the prompt works correctly without injection.
6. Build clean: `cd figmento && npm run build`

---

## Tasks / Subtasks

- [x] **Task 1: Read all existing reference YAMLs** — extracted fields from `web/hero/*.yaml` (6 files) and `print/brochure/*.yaml` (3 files)
  - Read `_schema.yaml` to understand full YAML structure first

- [x] **Task 2: Create reference-data.ts** (AC: 1)
  - 9 reference entries embedded: 6 web/hero + 3 print/brochure
  - Interface uses structured `composition_notes` object (zones, typography_scale, color_distribution, whitespace_strategy)
  - Top-of-file comment documents: social, ads, presentation not yet populated

- [x] **Task 3: Create reference-loader.ts** (AC: 2)
  - `getRelevantReferences(category, subcategory?, mood?, limit = 1)` with mood scoring (+2 per tag overlap)
  - Always returns array, never null

- [x] **Task 4: Inject into getTextLayoutPrompt()** (AC: 3)
  - Injected after blueprint injection block, before reference images section
  - Outputs: notable element, zone breakdown, whitespace strategy (when available)

- [x] **Task 5: Update buildSystemPrompt()** (AC: 4)
  - Added "REFERENCE INSPIRATION (Text-to-Layout Mode)" section after blueprint section

- [x] **Task 6: Build and verify** (AC: 6)
  - `cd figmento && npm run build` — passes clean (dist/code.js 442.6kb)
  - Web Hero format will inject; Instagram Post format will skip (no social refs yet)

---

## Dev Notes

**Same build-time embedding pattern as MQ-4.** Coordinate with MQ-4 — if both are implemented in the same sprint, consider a shared pre-build script or a single `knowledge-data.ts` that exports both `BLUEPRINTS` and `REFERENCES`.

**Reference YAMLs change more often than blueprints** — every time a user adds a new screenshot reference, the plugin needs to be rebuilt to include it. Document this limitation prominently at the top of `reference-data.ts`: "After adding new reference YAMLs to the knowledge directory, run `cd figmento && npm run build` to embed them."

**MQ-4 must be done (or at least blueprint-loader.ts must exist) before this story's injection is integrated.** If MQ-4 is delayed, MQ-5's injection can be added independently to `getTextLayoutPrompt()` — the two injections are independent blocks.

---

## Files to Create

| File | Purpose |
|------|---------|
| `figmento/src/ui/reference-data.ts` | Embedded reference metadata (manually extracted from YAMLs) |
| `figmento/src/ui/reference-loader.ts` | Category/mood matching logic |

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/text-layout.ts` | Inject top reference into getTextLayoutPrompt() |
| `figmento/src/ui/system-prompt.ts` | Add reference awareness note |

---

## Validation

**TEST MQ-5a (Web Hero format — should inject):** In Text-to-Layout, select a web-hero-compatible format → inspect prompt in console.
- [x] Reference notable element appears in the injected prompt segment
- [x] Composition notes appear in the injected prompt segment

**TEST MQ-5b (Instagram Post — should NOT inject):** In Text-to-Layout, select Instagram Post format.
- [x] No reference injection (no reference data for this category yet)
- [x] Design generates normally without errors

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - Null-safety: getRelevantReferences always returns an array, never null
  - No reference to image files (webp/png) — only YAML metadata is embedded
  - TypeScript types on ReferenceEntry (no implicit any)
```
