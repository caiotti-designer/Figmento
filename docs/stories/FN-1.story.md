# FN-1: Extract Screenshot-to-Layout Skill

| Field | Value |
|-------|-------|
| **Story ID** | FN-1 |
| **Epic** | FN — Figma Native Agent Migration |
| **Status** | InReview |
| **Author** | @sm (River) |
| **Executor** | @dev (Dex) |
| **Gate** | @qa |
| **Created** | 2026-03-24 |
| **Complexity** | L (Large) |
| **Priority** | HIGH |

---

## Description

Extract the Screenshot-to-Layout workflow from the Figmento plugin into a self-contained Figma Skill markdown file that works with Claude Code + the official `use_figma` MCP tool (Anthropic's `claude.ai/Figma` server). This is the first skill extraction and sets the pattern for FN-2 through FN-4.

The Figmento plugin currently bundles a Screenshot-to-Layout mode that:
1. Accepts a screenshot image (paste, upload, or drop)
2. Sends it as a vision content block to an LLM (Claude/Gemini/OpenAI)
3. Uses a system prompt with design intelligence (typography, color, layout, spacing rules)
4. The LLM issues tool calls (create_frame, create_text, set_fill, etc.) to recreate the design in Figma
5. A tool-use loop executes each call against the Figma Plugin API

The extracted skill must encode the same intelligence — the system prompt, design rules, typography scales, color palettes, layout patterns, spacing system, anti-patterns — as inline knowledge in a markdown file. The skill consumer will be a Claude Code agent using the `use_figma` MCP tool (which provides direct Plugin API access) instead of Figmento's relay/plugin pipeline.

### Why This Matters

This skill enables Screenshot-to-Layout without requiring the Figmento plugin, WebSocket relay, or API keys. Any Claude Code user with the Figma MCP connected can use this skill directly, massively expanding the addressable audience from "Figmento plugin users" to "anyone with Claude Code + Figma."

---

## Acceptance Criteria

- [x] AC1: Skill file exists at `skills/figmento-screenshot-to-layout.md`
- [x] AC2: Skill is fully self-contained — no references to external YAML files, no `import` statements, no dependency on Figmento MCP server or plugin
- [x] AC3: Skill header includes a usage section explaining how to invoke it (e.g., "Paste a screenshot and say: Recreate this design in Figma using the screenshot-to-layout skill")
- [x] AC4: Skill includes all design knowledge inlined:
  - [x] AC4a: Size presets for all major formats (social, print, web, presentation) with pixel dimensions
  - [x] AC4b: Typography system — type scales (minor third through golden ratio), font pairings (all 20+ pairings with mood tags), line height rules, letter spacing rules, weight hierarchy
  - [x] AC4c: Color system — all 12 mood-based palettes with hex values, WCAG contrast rules, safe combos
  - [x] AC4d: Layout system — 8px grid, full spacing scale, margins by format, safe zones, layout patterns (centered-stack, split-half, full-bleed-with-overlay, card-grid, thirds-grid)
  - [x] AC4e: Minimum font sizes by format (social, print, presentation, web)
- [x] AC5: Skill includes the screenshot analysis instruction (from `SCREENSHOT_INSTRUCTION` in screenshot.ts) adapted for `use_figma` tool syntax
- [x] AC6: Skill includes the design workflow steps (from `buildSystemPrompt` in system-prompt.ts) adapted for the `use_figma` tool
- [x] AC7: Skill includes the Design Taste Rules (8 rules), anti-AI markers, and quality scoring rubric
- [x] AC8: Skill includes overlay/gradient rules (2-stop gradients, content-aware direction, opacity minimums)
- [x] AC9: Skill includes `use_figma` code examples for at least 5 common operations:
  - [x] AC9a: Creating a root frame with dimensions and background fill
  - [x] AC9b: Creating text with font family, size, weight, and color
  - [x] AC9c: Setting auto-layout on a frame (vertical/horizontal, padding, spacing)
  - [x] AC9d: Creating a gradient overlay rectangle — MUST include a `gradientTransform` matrix helper pattern (Plugin API uses raw 2D matrix, not Figmento's `gradientDirection` string)
  - [x] AC9e: Creating a button (auto-layout frame + text child)
- [x] AC10: Skill includes a self-evaluation checklist (the 16-point checklist adapted for the skill context)
- [x] AC11: Skill works end-to-end — Given a screenshot image and the skill loaded as context, When Claude Code processes the request, Then it produces a Figma design using `use_figma` calls that scores ≥60 on the self-evaluation checklist (AC10)
- [x] AC12: Skill follows Figma Community skill format conventions (title, description, usage, workflow steps)
- [x] AC13: Skill total token count is ≤15K tokens (measured via `tiktoken` or character estimate: ~4 chars/token). If the skill exceeds 12K tokens before the Design Knowledge Reference section, flag for base skill extraction pattern. Measure at checkpoints: after workflow section, after design rules, after knowledge tables, after code examples.

---

## Scope

### IN Scope

- Extracting the Screenshot-to-Layout workflow into a standalone skill markdown
- Inlining all design knowledge (size presets, typography, color, layout, spacing)
- Adapting tool call syntax from Figmento plugin tools to `use_figma` Plugin API calls
- Writing `use_figma` code examples for common operations
- Including the full system prompt intelligence (design taste rules, anti-patterns, quality scoring)
- Including the screenshot analysis instruction block
- Self-evaluation checklist

### OUT of Scope

- Chat mode skill extraction (FN-2)
- Text-to-Layout skill extraction (FN-3)
- Ad Analyzer skill extraction (FN-4)
- Modifying any Figmento source code (this is a read-only extraction)
- Image generation capabilities (the skill uses vision input, not image gen output)
- Brief detection logic (the keyword parser is plugin-specific UI code, not needed in a skill)
- The tool-use loop engine (Claude Code has its own agentic loop)
- Phase-based tool filtering (the chatToolResolver is plugin-specific)

---

## Technical Notes

### Key Findings from Source Analysis

#### 1. Screenshot Analysis Flow (screenshot.ts)

The screenshot mode is a 3-step UI flow:
- **Step 1 (Upload):** User pastes/drops/uploads a screenshot image
- **Step 2 (Crop):** Optional crop with aspect ratio presets (free, 16:9, 9:16, 1:1, 4:3, 3:4)
- **Step 3 (Processing):** Image sent as vision content to the LLM with the `SCREENSHOT_INSTRUCTION` prompt + full system prompt

The core AI instruction (`SCREENSHOT_INSTRUCTION` at line 96 of screenshot.ts) tells the LLM to:
1. Analyze layout structure (frames, sections, containers)
2. Note the color scheme
3. Identify typography (sizes, weights, hierarchy)
4. Identify UI elements (buttons, cards, nav, images, icons)
5. Recreate using tools: root frame first, top-down, auto-layout, match colors, faithful text, Lucide icons
6. Run refinement check at end

This instruction must be adapted for `use_figma` syntax in the skill.

#### 2. System Prompt (system-prompt.ts)

The `buildSystemPrompt()` function generates a ~580-line system prompt that includes:
- Core rules (one frame, no export, descriptive names, auto-layout, FILL sizing)
- Figma-native workflow (variable binding)
- Design workflow (10-step process with tool calls)
- Design knowledge tools (lookup_size, lookup_palette, lookup_fonts, etc.)
- Minimum font sizes by format (4 format categories)
- Typography rules (line height, letter spacing, weight hierarchy, mandatory hierarchy rules)
- Layout rules (8px grid, spacing scale, margins, safe zones, patterns, background depth)
- Contrast & accessibility (WCAG AA, safe combos)
- Text-over-images overlay rules (gradient direction table, 2-stop rule, opacity minimums)
- Format completion checklists (social, carousel, presentation, web hero, print)
- Design taste rules (8 rules including aesthetic direction, typography-first, color commitment, spatial generosity)
- Anti-AI markers (structural hard stops + AI tells)
- Quality scoring (5 dimensions, weighted)
- Brief injection (palette, fonts, blueprint matching)
- Refinement checks reference

**For the skill, all lookup_* tool references must be replaced with inline knowledge tables.** The skill user has `use_figma`, not Figmento's intelligence tools.

#### 3. Tool Definitions (tools-schema.ts + tools-schema.generated.ts)

The plugin exposes ~35+ generated MCP tools plus 3 plugin-only tools. For the skill, these map to `use_figma` Plugin API calls. Key mappings:
- `create_frame` -> `use_figma` with `figma.createFrame()` + property sets
- `create_text` -> `use_figma` with `figma.createText()` + `loadFontAsync` + property sets
- `set_fill` -> `use_figma` with `node.fills = [{ type: 'SOLID', color: {r,g,b} }]`
- `set_auto_layout` -> `use_figma` with `node.layoutMode`, `node.padding*`, `node.itemSpacing`
- `create_icon` -> `use_figma` with SVG path creation (Lucide icons)

The skill must include `use_figma` code snippets showing the Figma Plugin API syntax for each common operation.

#### 4. Design Knowledge Files

All knowledge is in YAML files under `figmento-mcp-server/knowledge/`:
- **size-presets.yaml**: 35+ format presets across social (IG, FB, X, LinkedIn, Pinterest, TikTok, YT, Snap), print (A4, A3, Letter, Legal, business card, flyer, posters), presentation (16:9, 4:3, 2K), web (hero, banner, landing, tablet, mobile)
- **typography.yaml**: 4 type scales, 20 font pairings with mood tags, line height rules, letter spacing rules, weight usage guide, available Google Fonts list
- **color-system.yaml**: 12 mood-based palettes, WCAG reference, safe text/bg combos, color psychology mappings, emotion-to-palette lookup
- **layout.yaml**: 8px grid, 12-value spacing scale, margins by format, safe zones (IG, FB, TikTok, YT), visual hierarchy rules, 6 layout patterns

All of this must be inlined into the skill markdown, formatted as readable tables or code blocks.

#### 5. Compiled Knowledge (compiled-knowledge.ts)

The plugin compiles YAML into TypeScript objects at build time. The system prompt uses these to inject brief-specific recommendations (palette, fonts, blueprint). In the skill, this dynamic injection is replaced by inline reference tables the LLM can consult directly.

### Adaptation Strategy: Figmento Tools -> use_figma

The Figmento plugin tools are high-level wrappers (e.g., `create_frame({ name, width, height, fillColor })`). The `use_figma` tool provides raw Figma Plugin API access. The skill must bridge this gap with code examples showing the Plugin API equivalent.

Key differences:
- **Colors**: Figmento accepts hex strings; Plugin API requires `{ r: 0-1, g: 0-1, b: 0-1 }` objects
- **Font loading**: Figmento handles font loading internally; Plugin API requires explicit `figma.loadFontAsync({ family, style })` before setting text properties
- **Auto-layout**: Figmento's `set_auto_layout` is a single call; Plugin API requires setting multiple properties (layoutMode, primaryAxisAlignItems, counterAxisAlignItems, paddingTop/Right/Bottom/Left, itemSpacing)
- **Gradients**: Figmento accepts `gradientDirection` string; Plugin API requires `gradientTransform` matrix — the skill should provide helper patterns

---

## Source Material Inventory

| Source File | What It Provides |
|-------------|-----------------|
| `figmento/src/ui/screenshot.ts` | Screenshot-to-Layout flow: 3-step UI process, `SCREENSHOT_INSTRUCTION` prompt (the core AI instruction for analyzing and recreating screenshots), vision message builder for multi-provider support, processing loop with tool-call progress tracking |
| `figmento/src/ui/system-prompt.ts` | Full system prompt (~580 lines): core design rules, 10-step design workflow, typography rules, layout rules, overlay/gradient rules, design taste rules (8 rules), anti-AI markers, quality scoring rubric, format completion checklists, brief-specific injection logic |
| `figmento/src/ui/tools-schema.ts` | Tool definitions (35+ tools): input schemas for every Figma operation, phase-based tool filtering logic, plugin-only tools (canvas context, memory, image gen) |
| `figmento/src/ui/tools-schema.generated.ts` | Auto-generated tool schemas from MCP server Zod definitions — the canonical parameter shapes for each tool |
| `figmento/src/ui/tool-use-loop.ts` | Provider-agnostic tool-use execution engine: iteration loop, base64 stripping, result truncation, screenshot summarization — informs how the agentic loop works |
| `figmento/src/ui/brief-detector.ts` | Brief detection: format patterns (35+ formats), mood patterns (12 moods), multi-section detection — useful for understanding mood-to-palette mapping |
| `figmento-mcp-server/knowledge/size-presets.yaml` | All format dimensions: 35+ presets across social, print, presentation, web categories with pixel sizes and aspect ratios |
| `figmento-mcp-server/knowledge/typography.yaml` | Typography system: 4 type scales with computed sizes, 20 font pairings with mood tags and weight recommendations, line height/letter spacing/weight rules, available Google Fonts |
| `figmento-mcp-server/knowledge/color-system.yaml` | Color system: 12 mood-based palettes with 6 colors each, WCAG contrast rules, safe combos, color psychology, emotion-to-palette mapping |
| `figmento-mcp-server/knowledge/layout.yaml` | Layout system: 8px grid, 12-value spacing scale, margins by format, safe zones for 4 platforms, visual hierarchy rules, 6 layout patterns with structure descriptions |
| `.claude/CLAUDE.md` | Design agent rules: Standard/Blueprint-First/Figma-Native workflows, common design patterns (ad/banner, button, badge), batch execution rules, anti-patterns, self-evaluation checklist, design brief analysis template |
| `figmento/src/knowledge/compiled-knowledge.ts` | Compiled knowledge: TypeScript versions of all YAML data, used by system prompt for brief injection — confirms the canonical palette/font/blueprint data structures |

---

## Skill Structure (Recommended)

The output skill markdown file should be organized as follows:

```
# Screenshot-to-Layout Skill

## Overview
- What this skill does
- Prerequisites (Claude Code + Figma MCP)
- How to invoke

## Workflow
1. Analyze the screenshot (vision analysis steps)
2. Determine format and dimensions
3. Plan the layout structure
4. Create the root frame
5. Build elements top-down
6. Apply styling and refinement
7. Self-evaluate

## Design Knowledge Reference

### Format Dimensions
[Inline table of all size presets]

### Typography System
[Type scales, font pairings table, line height/letter spacing rules, weight hierarchy, minimum font sizes by format]

### Color Palettes
[12 mood palettes with hex values, WCAG contrast rules, safe combos]

### Layout & Spacing
[8px grid, spacing scale, margins by format, safe zones, layout patterns]

## Design Rules

### Core Rules
[From system prompt: one frame, descriptive names, auto-layout, FILL sizing]

### Typography Hierarchy Rules
[Mandatory rules from system prompt]

### Overlay & Gradient Rules
[Content-aware gradient direction table, 2-stop rule, opacity minimums]

### Design Taste Rules
[8 rules from system prompt]

### Anti-AI Markers
[Structural hard stops + AI tells]

### Quality Scoring
[5-dimension rubric]

### Format Completion Checklists
[Per-format requirements]

## use_figma Code Examples

### Creating a Root Frame
```javascript
// use_figma example
const frame = figma.createFrame()
frame.name = "Design Name"
frame.resize(1080, 1350)
frame.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.05, b: 0.04 } }]
```

### Creating Text
```javascript
await figma.loadFontAsync({ family: "Inter", style: "Bold" })
const text = figma.createText()
text.fontName = { family: "Inter", style: "Bold" }
text.fontSize = 72
text.characters = "Headline Text"
text.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]
frame.appendChild(text)
```

### Setting Auto-Layout
### Creating Gradient Overlays
### Creating Buttons
[etc.]

## Self-Evaluation Checklist
[16-point checklist adapted for skill context]
```

---

## Dependencies

- None (Phase 1 has zero dependencies on other stories)
- Requires read access to all source files listed in the inventory (read-only extraction)

---

## Definition of Done

- [ ] Skill markdown file exists at `skills/figmento-screenshot-to-layout.md`
- [ ] Skill is self-contained — zero external file references, zero imports
- [ ] Skill works with Claude Code + Figma MCP `use_figma` tool (no Figmento plugin required)
- [ ] Skill follows Figma Community skill format (title, description, prerequisites, workflow, examples)
- [ ] All 12 color palettes are inlined with hex values
- [ ] All 20+ font pairings are inlined with mood tags and weight recommendations
- [ ] All 35+ size presets are inlined with pixel dimensions
- [ ] Full spacing scale (4-128px) is inlined
- [ ] At least 5 `use_figma` code examples are included
- [ ] Design taste rules, anti-patterns, and quality scoring are included
- [ ] Screenshot analysis instruction is adapted for `use_figma` context
- [ ] README/usage instructions are included in the skill header
- [ ] Skill has been tested by loading it as context and running a screenshot-to-layout task

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Skill exceeds context window when loaded | Medium | High | Prioritize knowledge by frequency of use; use compact table format; measure token count and target <15K tokens |
| `use_figma` Plugin API differences cause silent failures | Medium | Medium | Include explicit code examples for all common operations; document hex-to-RGB conversion, font loading, gradient transforms |
| Font availability varies across Figma accounts | Low | Low | Stick to Google Fonts confirmed available in Figma; include fallback recommendations |
| Skill format evolves before FN-2 through FN-4 | Low | Medium | This story establishes the pattern — document the format decisions in the skill header for future stories to follow |

---

## File List

| File | Action | Description |
|------|--------|-------------|
| `skills/figmento-screenshot-to-layout.md` | CREATE | Self-contained Screenshot-to-Layout skill (18.4KB, ~4.6K tokens) |
| `docs/stories/FN-1.story.md` | MODIFY | AC checkboxes, file list, change log updated |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | @sm (River) | Story drafted from Epic FN Phase 1. Full source material analysis of screenshot.ts, system-prompt.ts, tools-schema.ts, tool-use-loop.ts, brief-detector.ts, and all 4 knowledge YAML files. |
| 2026-03-24 | @po (Pax) | **Validation: GO (Conditional) — 10/10.** Status Draft → Ready. All 10 checklist points PASS. Story is exceptionally well-drafted with comprehensive source analysis, clear ACs, well-defined scope, and strong PRD-005/Epic FN alignment. **Conditional recommendations (non-blocking):** (1) Consider adding AC13 with a measurable token count threshold (<15K tokens via tiktoken cl100k_base) and fallback strategy (tiered knowledge or base/sub-skill split) — currently only in Risk R1 mitigation, not an AC. (2) AC11 end-to-end test could reference a minimum quality bar (e.g., "scores >=60 on the self-evaluation checklist from AC10") to prevent trivially passing tests. (3) AC9d gradient overlay example should include a `gradientTransform` matrix helper pattern per Technical Notes line 163 — flag to @dev. |
| 2026-03-24 | @dev (Dex) | **Implementation complete.** Skill file created at `skills/figmento-screenshot-to-layout.md`. All ACs checked except AC11 (requires live end-to-end test with Figma MCP). Token budget: ~4.6K tokens (18.4KB / 4), well under 15K limit. Includes: 7-step workflow, full design rules (typography hierarchy, layout, overlays, taste rules, anti-AI markers, quality scoring), 36 size presets, 20 font pairings, 12 color palettes, minimum font sizes, 6 use_figma code examples (root frame, text+font loading, auto-layout, gradient with gradientTransform matrix helper, button, hex-to-RGB helper), 16-point self-evaluation checklist. All knowledge inlined — zero external dependencies. |
| 2026-03-24 | @pm (Morgan) | **AC11 PASS — Live test complete.** Claude Code + Figma MCP `use_figma` path: built Instagram post directly on canvas. Typography and design decisions strong, self-eval loop triggered and refined spacing autonomously. Gap noted: no image generation (skill is text/layout only — expected, images are plugin-path capability). Comparison with plugin path: skill path produces better design taste, plugin path produces more complete deliverables (images). Status InProgress → InReview. All 13 ACs now checked. |
