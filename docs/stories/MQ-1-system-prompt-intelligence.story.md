# Story MQ-1: System Prompt Intelligence Upgrade

**Status:** Ready for Review
**Priority:** High
**Complexity:** M
**Epic:** MQ — Mode Quality Parity
**Phase:** 1 (can run in parallel with MQ-2 and MQ-3)

---

## PO Validation

**Score:** 7/10 — **GO**
**Validated by:** @po (Pax) — 2026-03-02

| Check | Result | Note |
|-------|--------|------|
| 1. Clear title | ✅ | |
| 2. Complete description | ✅ | Context section is thorough; highest-impact story flagged |
| 3. Testable AC | ✅ | 9 measurable ACs + 5-item manual test |
| 4. Scope IN/OUT | ⚠️ | IN covered by tasks; OUT only in parent epic — acceptable |
| 5. Dependencies | ⚠️ | No story deps (Phase 1); CLAUDE.md source artifact implied not listed |
| 6. Complexity | ✅ | M |
| 7. Business value | ✅ | "same professional quality as Claude Code" |
| 8. Risks | ⚠️ | Token budget in Dev Notes; add explicit regression risk note |
| 9. Done criteria | ✅ | Build clean + 5-check manual test |
| 10. Alignment | ✅ | References CLAUDE.md, Phase 1, MCP path |

**Observation:** MQ-7 also modifies `system-prompt.ts` checklist. @dev must coordinate with MQ-7 to avoid merge conflict on that file. See MQ-7 Dev Notes.

---

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [build, manual-smoke]
```

---

## Story

**As a** user of Figmento's Chat mode,
**I want** the in-plugin AI to know the same design rules as the MCP path (gradient intelligence, print layout, typography hierarchy, spacing scale, anti-patterns),
**so that** designs created through Chat mode have the same professional quality as those created through Claude Code.

---

## Context

`system-prompt.ts` builds a ~340-line prompt for the Chat mode. It has basic rules (10-step workflow, size presets, palettes, font pairings, self-eval checklist) but is missing ALL of the DQ epic's intelligence: content-aware gradients, print auto-layout mandate, spacing scale enforcement, typography ratio rules, anti-patterns, and the expanded 16-point self-evaluation checklist.

The system prompt is built by `buildSystemPrompt()` and embedded as a string. It needs to be expanded — not rewritten. The existing structure (sections with `═══` dividers) should be maintained.

**This is the highest-impact story in the epic.** A better system prompt immediately improves ALL Chat mode output.

---

## Acceptance Criteria

1. `buildSystemPrompt()` includes a "Content-Aware Gradient Overlays" section matching CLAUDE.md Rule 4b — the 4-position decision table (bottom/top/left/right) with gradient direction, stop positions, and the "match gradient color to section background" rule.
2. Includes a "Print Layout Rules" section mandating auto-layout for A4+ formats with the print spacing scale: page-margin 72, section-gap 48-64, content-gap 24-32, element-gap 12-16, tight-gap 4-8.
3. Includes the print typography preset (Display 96-120, H1 64-80, H2 40-48, H3 28-32, Body 24-28, Caption 18-22) with enforced size ratios (H1 ≥ 2.5× Body, Body never below 24px on A4).
4. Includes a "Design Anti-Patterns" section with the top 10 anti-patterns from CLAUDE.md (white background default, Inter for everything, centered everything, equal padding, etc.) PLUS the gradient solid-end anti-pattern and absolute-positioning-on-print anti-pattern.
5. Self-Evaluation Checklist expanded from 8 to 16 points: adds memorable element, blueprint consulted, variable binding check, refinement check, gradient direction, print structure, reference consulted, images resolved.
6. Includes "Background Depth" rule (CLAUDE.md Rule 4) — never flat solid fills on hero sections, always depth via gradient or radial glow.
7. Includes "Spatial Generosity" rule (CLAUDE.md Rule 5) — increase all padding by 1.5× what feels enough.
8. Total system prompt stays under 600 lines (token budget: Gemini has a smaller context window).
9. Build clean: `cd figmento && npm run build`

---

## Tasks / Subtasks

- [x] **Task 1: Read current system-prompt.ts** — understand existing structure, section order, and ═══ divider pattern
- [x] **Task 2: Review CLAUDE.md source sections** — Rule 4 (Background Depth), Rule 4b (Gradient Overlays), Rule 5 (Spatial Generosity), Print Layout Rules, Print Typography, Design Anti-Patterns, Self-Evaluation Checklist (16 points)
- [x] **Task 3: Add Gradient Intelligence section** (AC: 1)
  - Insert after existing "Layout Rules" section
  - The 4-row decision table: text at bottom/top/left/right → gradient direction + stops
  - Include the "solid end = where text is, transparent = where image shows" mnemonic
  - Include "gradient color MUST match section background" rule (avoid visible edge on dark/light seam)
- [x] **Task 4: Add Print Layout Rules section** (AC: 2, 3)
  - Print spacing scale table (5 tokens: page-margin to tight-gap)
  - Mandatory auto-layout page structure (Page → Header → Content → Footer nesting pattern)
  - Print typography preset with size ratios (H1 ≥ 2.5× Body)
  - "Body NEVER below 24px on A4" emphasized
- [x] **Task 5: Add Design Anti-Patterns section** (AC: 4)
  - Port top 10 from CLAUDE.md
  - Add: gradient solid end faces away from text (DQ pattern)
  - Add: absolute positioning on print pages (print mandate)
  - Each anti-pattern is 1 line — keep it dense
- [x] **Task 6: Expand Self-Evaluation Checklist** (AC: 5)
  - Expand from existing count to 16 numbered points
  - New points: memorable element, blueprint consulted, variable binding used, refinement check run, gradient direction correct, print structure auto-layout, reference consulted, images resolved (no placeholder rectangles)
- [x] **Task 7: Add Background Depth + Spatial Generosity rules** (AC: 6, 7)
  - Background Depth: never flat solid fills on hero/full-page — always gradient or radial glow
  - Spatial Generosity: all padding × 1.5 — margins should feel almost too generous
- [x] **Task 8: Verify prompt length** (AC: 8)
  - Count lines — must stay under 600
  - If over: compress verbose prose sections into tables (tables are more token-efficient)
- [x] **Task 9: Build and verify** (AC: 9)
  - `cd figmento && npm run build` — must succeed with no TypeScript errors

---

## Dev Notes

**Structure of system-prompt.ts (section order to maintain):**
```typescript
export function buildSystemPrompt(): string {
  return `You are Figmento, an expert design agent...

## Core Rules
...
## Design Workflow
...
## Size Presets
...
## Color Palettes
...
## Font Pairings
...
## Typography Rules
...
## Layout Rules
...       ← Add Gradient Intelligence section after here
## Print Layout Rules   ← NEW (add after Layout)
## Contrast & Accessibility
...
## Design Anti-Patterns   ← NEW (add before Self-Evaluation)
## Self-Evaluation Checklist   ← Expand to 16 points
...
## Image Generation
...
`;
}
```

**Token budget consideration:** Gemini has smaller context windows than Anthropic. The system prompt + tools schemas + user message must fit. Current ~340 lines is safe; 600 lines should still fit within ~8K tokens. Use tables over prose to be token-efficient.

---

## Files to Modify

| File | Change |
|------|--------|
| `figmento/src/ui/system-prompt.ts` | Add 4 new sections, expand checklist to 16 points |

---

## Validation

**TEST MQ-1 (Chat Mode):** In Chat tab — "Create an Instagram post for a luxury perfume brand. Dark theme, gold accent. Headline: 'Timeless.'"
- [ ] Design uses auto-layout (not flat absolute positioning for text)
- [ ] If gradient present, solid end is behind text zone
- [ ] Font hierarchy: headline ≥ 2× body size
- [ ] No flat solid background on hero area (has depth)
- [ ] Chat mode prompt visible in Figma console shows expanded section headers

---

## CodeRabbit Integration

```yaml
mode: light
severity_filter: [CRITICAL, HIGH]
focus_areas:
  - String correctness (no broken template literals in the prompt string)
  - No accidental escape characters (backticks inside template literals need escaping)
  - Line count stays under 600
```
