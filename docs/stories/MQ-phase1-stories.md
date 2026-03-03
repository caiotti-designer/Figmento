# Story MQ-1: System Prompt Intelligence Upgrade

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"

## Story
**As a** user of Figmento's Chat mode,
**I want** the in-plugin AI to know the same design rules as the MCP path (gradient intelligence, print layout, typography hierarchy, spacing scale, anti-patterns),
**so that** designs created through Chat mode have the same professional quality as those created through Claude Code.

## Context

`system-prompt.ts` builds a ~340-line prompt for the Chat mode. It has basic rules (10-step workflow, size presets, palettes, font pairings, self-eval checklist) but is missing ALL of the DQ epic's intelligence: content-aware gradients, print auto-layout mandate, spacing scale enforcement, typography ratio rules, anti-patterns, and the expanded 16-point self-evaluation checklist.

The system prompt is built by `buildSystemPrompt()` and embedded as a string. It needs to be expanded — not rewritten. The existing structure (sections with ═══ dividers) should be maintained.

## Acceptance Criteria

1. `buildSystemPrompt()` includes a "Content-Aware Gradient Overlays" section matching CLAUDE.md Rule 4b — the 4-position decision table (bottom/top/left/right) with gradient direction, stop positions, and "think before you gradient" step.
2. Includes a "Print Layout Rules" section mandating auto-layout for A4+ formats with the print spacing scale (page-margin: 72, section-gap: 48-64, content-gap: 24-32, element-gap: 12-16, tight-gap: 4-8).
3. Includes the print typography preset (Display: 96-120, H1: 64-80, H2: 40-48, H3: 28-32, Body: 24-28, Caption: 18-22) with enforced size ratios.
4. Includes "Design Anti-Patterns" section with the top 10 anti-patterns from CLAUDE.md (white background default, Inter for everything, centered everything, equal padding, etc.) PLUS gradient solid-end and absolute-positioning-on-print anti-patterns from DQ-12/DQ-13.
5. Self-Evaluation Checklist expanded from 8 to 16 points, matching CLAUDE.md (adds: memorable element, blueprint followed, variable binding, refinement check, gradient direction, print structure, reference consulted, images resolved).
6. Includes "Background Depth" rule (Rule 4 from CLAUDE.md) — never flat solid fills on hero sections.
7. Includes "Spatial Generosity" rule (Rule 5) — increase padding by 1.5× what feels enough.
8. Total system prompt stays under 600 lines (avoid hitting token limits on Gemini/Anthropic).
9. Build clean: `cd figmento && npm run build`

## Tasks / Subtasks

- [ ] **Task 1: Read current system-prompt.ts** — understand the existing structure and section pattern
- [ ] **Task 2: Read CLAUDE.md sections to port** — specifically: Rule 4b (gradient), Print Layout Rules, Print Typography, Anti-Patterns, Self-Evaluation Checklist, Rules 4/5
- [ ] **Task 3: Add Gradient Intelligence section** (AC: 1)
  - Insert after the existing "Layout" or "Contrast" section
  - Adapt the CLAUDE.md table format to work as a string in TypeScript
  - The 4-row table: text at bottom/top/left/right → gradient direction + stops
  - Include the "match gradient color to section background" rule
- [ ] **Task 4: Add Print Layout Rules section** (AC: 2, 3)
  - Spacing scale table
  - Page structure nesting pattern (Page → Header → Content → Footer)
  - Mandatory auto-layout rule
  - Print typography preset with size ratios
- [ ] **Task 5: Add Anti-Patterns section** (AC: 4)
  - Port top 10 from CLAUDE.md
  - Add gradient and print anti-patterns from DQ-12/DQ-13
  - Keep it concise — each anti-pattern is 1 line
- [ ] **Task 6: Expand Self-Evaluation Checklist** (AC: 5)
  - Expand from 8 items to 16 items
  - Add: memorable element, blueprint consulted, variable binding check, refinement check, gradient direction, print structure, reference consulted, images resolved
- [ ] **Task 7: Add Background Depth + Spatial Generosity rules** (AC: 6, 7)
- [ ] **Task 8: Verify prompt length** (AC: 8)
  - Count lines — must stay under 600
  - If over, compress verbose sections (use tables instead of prose where possible)
- [ ] **Task 9: Build and verify** (AC: 9)
  - `cd figmento && npm run build` must succeed

## Dev Notes

**Structure of system-prompt.ts:**
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
...
## Contrast & Accessibility
...
## Self-Evaluation Checklist
...
## Image Generation
...
`;
}
```

Each section is separated by ═══ dividers. Add new sections in the right place — gradient rules after Layout Rules, print rules after Typography Rules, anti-patterns before Self-Evaluation.

**Token budget consideration:** Gemini has smaller context windows than Anthropic. The system prompt + tools schemas + user message must fit. Current ~340 lines is safe. 600 lines should still fit within 8K tokens of system prompt.

**This is the highest-impact story in the epic.** A better system prompt immediately improves ALL Chat mode output.

**Files to modify:**
- `figmento/src/ui/system-prompt.ts` (was `figmento/src/system-prompt.ts` — check actual path)

---

# Story MQ-2: Analysis Prompt Quality Rules

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"

## Story
**As a** user of Figmento's Screenshot-to-Layout mode,
**I want** the AI that analyzes my screenshot to apply design quality rules (auto-layout preference, correct gradient direction, proper spacing) when generating the UIAnalysis JSON,
**so that** the reconstructed design uses auto-layout, correct gradients, and proper spacing instead of absolute positioning with arbitrary values.

## Context

`ANALYSIS_PROMPT` in `prompt.ts` tells the AI how to analyze a screenshot and produce UIAnalysis JSON. It already mentions auto-layout as "DEFAULT" (rule 10) but doesn't enforce it strongly enough. It has no gradient direction rules, no spacing scale, no minimum font size enforcement.

This prompt produces the JSON that becomes the actual Figma design. Better rules here = better designs immediately.

## Acceptance Criteria

1. ANALYSIS_PROMPT includes a "Quality Enforcement" section with:
   - Auto-layout is MANDATORY for any frame with 2+ children (not just "default")
   - Spacing values must come from the 8px scale (4,8,12,16,24,32,48,64)
   - Gradient overlays: solid end must face the text zone (brief explanation of the 4-direction rule)
   - Minimum font sizes by format (reference the format dimensions to infer)
2. The auto-layout rule is upgraded from "use as DEFAULT" to "MANDATORY for all container frames — only use absolute positioning for decorative overlapping elements (badges, background shapes, watermarks)."
3. A spacing rule states: "itemSpacing and padding values must be multiples of 4. Prefer: 8, 16, 24, 32, 48. Never use arbitrary values like 13, 27, 53."
4. A gradient rule states: "When creating gradient overlay fills, the solid end (opacity 1.0) must be positioned at the edge where text content sits. If text is at the bottom, gradient direction = bottom-top with stop at position 0 = opacity 0 (top, transparent), stop at position 0.4-0.5 = opacity 1 (bottom, solid)."
5. Build clean.

## Tasks / Subtasks

- [ ] **Task 1: Read current ANALYSIS_PROMPT in prompt.ts** — understand the 11 existing rules
- [ ] **Task 2: Upgrade rule 10** (AC: 2)
  - Change from: `'10. Use auto-layout as the DEFAULT - only use absolute positioning for overlapping elements'`
  - To: `'10. Auto-layout is MANDATORY for any frame with 2+ children. Only use absolute positioning for decorative overlapping elements (badges, watermarks, background shapes). Every container frame MUST have layoutMode set.'`
- [ ] **Task 3: Add quality enforcement rules** (AC: 1, 3, 4)
  - Add after existing rule 11:
  ```
  '12. SPACING SCALE: All itemSpacing and padding values must be multiples of 4. Preferred: 8, 16, 24, 32, 48. Never use arbitrary values like 13, 27, 53.',
  '13. GRADIENT OVERLAYS: When adding gradient fills over images, the solid end (opacity 1.0) must face the text. Text at bottom → bottom-top direction. Text at top → top-bottom direction. Text at left → left-right. Solid = where text is, transparent = where image shows.',
  '14. FONT SIZE HIERARCHY: Headline must be at least 2x body text size. Never use the same font size for two different hierarchy levels.',
  '15. MINIMUM FONT SIZES: For designs > 1000px wide: body ≥ 16px, heading ≥ 32px, caption ≥ 12px. For designs > 2000px wide (print): body ≥ 24px, heading ≥ 48px.',
  ```
- [ ] **Task 4: Build and test** (AC: 5)

## Dev Notes

**ANALYSIS_PROMPT is a joined string array.** Each rule is one element. Add new rules at the end, before the "Return ONLY valid JSON" line.

**This affects Screenshot-to-Layout and any mode that uses ANALYSIS_PROMPT.** The prompt goes to the AI with the screenshot, and the AI returns UIAnalysis JSON. Better rules → better JSON → better Figma output.

**Don't over-expand.** This prompt goes with a large base64 image. Keep additions to 5-10 lines max to avoid pushing past context limits.

**Files to modify:**
- `figmento/src/ui/prompt.ts` — ANALYSIS_PROMPT array

---

# Story MQ-3: Text-to-Layout Prompt Quality Rules

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"

## Story
**As a** user of Figmento's Text-to-Layout mode,
**I want** the AI to apply the same design quality rules when generating social media designs from text,
**so that** text-to-layout designs have proper auto-layout, correct gradients, enforced typography hierarchy, and spacing from the 8px grid.

## Context

`TEXT_LAYOUT_PROMPT` in `text-layout.ts` has 14 rules for generating social media designs. It mentions auto-layout (rule 8) and text sizing but lacks gradient intelligence, spacing scale enforcement, and anti-pattern awareness. The prompt builders (`getTextLayoutPrompt`, `getCarouselPrompt`, `getPresentationPrompt`) compose the final prompt from this base.

## Acceptance Criteria

1. TEXT_LAYOUT_PROMPT includes quality rules for auto-layout (mandatory, not just default), spacing scale (multiples of 4), gradient direction (content-aware), and typography hierarchy (headline ≥ 2× body).
2. TEXT_LAYOUT_PROMPT includes an anti-patterns warning: "AVOID: centered text on everything, equal padding on all frames, flat gray backgrounds, gradients that fade away from text."
3. The carousel prompt (`getCarouselPrompt`) includes: "Consistent spacing across slides — use the same itemSpacing and padding values."
4. The presentation prompt (`getPresentationPrompt`) includes: "Use auto-layout for every slide. Spacing from scale: 8, 16, 24, 32, 48."
5. Build clean.

## Tasks / Subtasks

- [ ] **Task 1: Read current TEXT_LAYOUT_PROMPT** — understand the 14 existing rules
- [ ] **Task 2: Add quality rules to TEXT_LAYOUT_PROMPT** (AC: 1, 2)
  - Add after existing rule 14:
  ```
  '15. SPACING SCALE: itemSpacing and padding values must be multiples of 4. Use: 8, 16, 24, 32, 48. Never arbitrary values.',
  '16. GRADIENT DIRECTION: Gradient overlay solid end (opacity 1.0) faces the text zone. Text at bottom = solid at bottom. Text at top = solid at top.',
  '17. TYPOGRAPHY RATIO: Headline font size ≥ 2x body size. Use at least 3 distinct sizes for visual hierarchy.',
  '18. AVOID: centered text on EVERY element (vary alignment), equal padding on all frames (vary for rhythm), flat colored backgrounds (add depth with gradients or overlays), gray placeholder rectangles (describe images instead).',
  ```
- [ ] **Task 3: Update carousel prompt builder** (AC: 3)
  - Add consistency rule to `getCarouselPrompt`
- [ ] **Task 4: Update presentation prompt builder** (AC: 4)
  - Add auto-layout + spacing rule to `getPresentationPrompt`
- [ ] **Task 5: Build and test** (AC: 5)

## Dev Notes

**TEXT_LAYOUT_PROMPT is a joined string array** in `text-layout.ts`. Same pattern as ANALYSIS_PROMPT.

**Carousel and presentation prompts** are built by `getCarouselPrompt()` and `getPresentationPrompt()` functions. They compose from TEXT_LAYOUT_PROMPT + additional instructions. Add carousel/presentation-specific rules inside those functions.

**Keep additions short.** Each prompt goes to Anthropic or Gemini with user content, format dimensions, font/color settings, and possibly reference images. Don't exceed ~20 new lines across all additions.

**Files to modify:**
- `figmento/src/ui/text-layout.ts` — TEXT_LAYOUT_PROMPT + prompt builder functions

---

# MQ Phase 1 — Agent Handoff

## Execution Order

```
MQ-1 (system-prompt.ts — Chat mode intelligence upgrade)
  ↓ can run in parallel with MQ-2 and MQ-3
MQ-2 (prompt.ts — Screenshot-to-Layout quality rules)
  ↓ can run in parallel with MQ-1 and MQ-3
MQ-3 (text-layout.ts — Text-to-Layout quality rules)
  ↓
Phase 1 Validation: Test Chat, Screenshot-to-Layout, and Text-to-Layout
```

**MQ-1, MQ-2, MQ-3 are all independent** — they modify different files. Can run in parallel.

## Key Notes

- **ALL changes are in figmento/ plugin** — no MCP server changes
- **All changes are prompt text** — no logic changes, no new handlers
- **Build:** `cd figmento && npm run build` (then reload plugin in Figma)
- **Test:** Manual test in Figma — each mode should produce noticeably better designs

## Files to Read Before Starting

| File | Why |
|------|-----|
| `figmento/src/ui/system-prompt.ts` | Main target for MQ-1 |
| `figmento/src/ui/prompt.ts` | Target for MQ-2 (ANALYSIS_PROMPT) |
| `figmento/src/ui/text-layout.ts` | Target for MQ-3 (TEXT_LAYOUT_PROMPT + builders) |
| `.claude/CLAUDE.md` | Source of rules to port (gradient, print, anti-patterns, checklist) |

## Phase 1 Validation

**TEST MQ-1: Chat Mode**
In Chat tab: "Create an Instagram post for a luxury perfume brand. Dark theme, gold accent. Headline: 'Timeless.'"
- [ ] Design uses auto-layout
- [ ] If gradient present, solid end is behind text
- [ ] Font hierarchy: headline ≥ 2× body
- [ ] No flat solid background (has depth/gradient)

**TEST MQ-2: Text-to-Layout**
In Text-to-Layout: Content = "Every cup tells a story. Ritual Roasters — Specialty coffee since 2019." Dark theme, Instagram Post format.
- [ ] Auto-layout used on all containers
- [ ] Spacing on 8px grid
- [ ] Typography hierarchy present

**TEST MQ-3: Screenshot-to-Layout**
Upload a screenshot of a professional website hero → convert
- [ ] Reconstructed layout uses auto-layout
- [ ] Gradient direction matches original
- [ ] Spacing values are clean (multiples of 4/8)
