# Epic MQ — Mode Quality Parity

> Bring Figmento's 6 plugin Modes to the same design quality as the MCP/Claude Code path.

## Problem Statement

Figmento has two design paths that produce vastly different quality:

| | MCP Path (Claude Code) | Modes Path (In-Plugin) |
|---|---|---|
| **Prompt source** | `.claude/CLAUDE.md` (~800 lines, 16 self-eval checks, gradient intelligence, print rules) | `system-prompt.ts` (~340 lines) + `prompt.ts` (~200 lines) — basic rules only |
| **Design creation** | Tool-by-tool: create_frame → set_auto_layout → create_text → bind_variable (precise control) | Single-shot UIAnalysis JSON → createDesignFromAnalysis() (all-or-nothing) |
| **Layout intelligence** | 24 blueprints with proportional zones, mood matching, memorable elements | None — the AI chooses layout from memory |
| **Reference library** | find_design_references searches curated library by mood/industry | None — no reference awareness |
| **Variable binding** | Reads existing variables, binds to nodes, creates from design systems | None — hardcodes all hex values |
| **Gradient intelligence** | Content-aware direction: solid end follows text position | Fixed recipe in prompt (often wrong) |
| **Print rules** | Mandatory auto-layout, spacing scale, typography hierarchy | Generic rules, no print-specific mandate |
| **Refinement** | run_refinement_check scores 5 quality dimensions automatically | None — no post-creation quality check |
| **Image generation** | mcp-image → place_generated_image (real AI images) | Gemini Imagen in-plugin (exists but separate pipeline) |

**Result:** The MCP path produces designs that score 100 on refinement checks. The Modes path produces designs that "aren't pro" (user's words).

## Strategy

NOT a rewrite. The Modes use a fundamentally different architecture (single JSON response vs tool-by-tool creation). Rewriting them to use MCP tools would break the in-plugin experience. Instead:

**Inject intelligence into the existing architecture:**

1. **Port rules** — Move the critical CLAUDE.md design intelligence into `system-prompt.ts` and `prompt.ts`. Same rules, adapted for the JSON output format.
2. **Inject blueprints** — Load blueprint YAML data and inject layout zone information into mode prompts. The AI generates JSON that matches blueprint proportions.
3. **Add tools** — Wire the DQ tools (variable binding, references, refinement) into `tools-schema.ts` so the Chat mode can call them.
4. **Post-creation refinement** — After `createDesignFromAnalysis()`, run a structural check and auto-fix common issues (gradient direction, spacing, text sizes).

## Scope

### IN Scope
- `system-prompt.ts` — major expansion with DQ rules
- `prompt.ts` (ANALYSIS_PROMPT, TEXT_LAYOUT_PROMPT) — quality rules injection
- `text-layout.ts` prompt builders — blueprint awareness + quality rules
- `tools-schema.ts` — add DQ-5 through DQ-14 tools for chat mode
- `code.ts` — post-creation refinement step in `createDesignFromAnalysis()`
- All 6 modes benefit: Screenshot-to-Layout, Text-to-Layout, Template Fill, Text-to-Presentation, Hero Generator, Ad Analyzer

### OUT of Scope
- Rewriting modes to use MCP tool-by-tool creation
- Changing the UIAnalysis JSON format (only enriching what goes INTO the prompt)
- New UI elements or mode flows
- MCP server changes (all work is plugin-side)

## Phase Structure

### Phase 1 — Rules Injection (Highest Impact, Lowest Effort)
| Story | Name | Size | What |
|---|---|---|---|
| MQ-1 | System Prompt Intelligence Upgrade | M | Port gradient rules, print layout mandate, typography hierarchy, spacing scale, anti-patterns, and self-eval checklist from CLAUDE.md → system-prompt.ts |
| MQ-2 | Analysis Prompt Quality Rules | S | Inject design quality rules into ANALYSIS_PROMPT (prompt.ts) — auto-layout mandate, gradient direction, minimum font sizes, spacing from scale |
| MQ-3 | Text-to-Layout Prompt Quality Rules | S | Inject quality rules into TEXT_LAYOUT_PROMPT — same rules adapted for text-to-design flow |

### Phase 2 — Blueprint + Reference Awareness
| Story | Name | Size | What |
|---|---|---|---|
| MQ-4 | Blueprint Injection into Mode Prompts | M | Load relevant blueprint YAML at mode execution time, inject zone layout data into prompt so AI generates JSON matching blueprint proportions |
| MQ-5 | Reference Injection into Mode Prompts | M | Load matching references from library, inject notable/composition_notes into prompt so AI adapts proven compositions |

### Phase 3 — Tool Parity for Chat Mode
| Story | Name | Size | What |
|---|---|---|---|
| MQ-6 | DQ Tools in tools-schema.ts | S | Add all DQ tools to FIGMENTO_TOOLS array: read_figma_context, bind_variable, apply_paint_style, apply_text_style, apply_effect_style, create_figma_variables, find_design_references, list_reference_categories, run_refinement_check |
| MQ-7 | Chat Mode Variable Workflow | M | Update system-prompt.ts chat workflow: instruct AI to call read_figma_context first, use bind_variable for colors when variables exist, create_variables_from_design_system for new projects |

### Phase 4 — Post-Creation Refinement
| Story | Name | Size | What |
|---|---|---|---|
| MQ-8 | Post-Creation Structural Check | M | After createDesignFromAnalysis() completes, run a lightweight structural analysis on the created node tree — check gradient directions, auto-layout coverage, spacing values, typography sizes — and auto-fix what's possible |

## Definition of Done (Epic Level)

- [ ] All 8 stories implemented and verified
- [ ] Text-to-Layout produces designs with proper auto-layout, correct gradients, and typography from scale
- [ ] Screenshot-to-Layout preserves reference composition AND applies quality rules
- [ ] Chat mode can use variable binding, reference search, and refinement check tools
- [ ] Post-creation check catches and fixes gradient/spacing/typography issues
- [ ] Side-by-side test: same brief in MCP path vs Modes path produces comparable quality
- [ ] No regressions in existing mode functionality
- [ ] `cd figmento && npm run build` clean

## Validation Test (Epic Level)

After all 8 stories:

**TEST MQ-A: Text-to-Layout Quality**
```
In the Text-to-Layout mode, create an Instagram post for a coffee shop called "Ritual Roasters".
Dark theme, editorial style. Headline: "Every cup tells a story."
```
- [ ] Uses auto-layout (not absolute positioning for text)
- [ ] Gradient overlay has solid end behind text
- [ ] Font sizes follow hierarchy rules (headline ≥ 2× body)
- [ ] Spacing values on 8px grid

**TEST MQ-B: Chat Mode with Variables**
```
In Chat mode: Read the Figma context, find references for an Instagram post, 
then create a post for "GRIND fitness" using existing variables for colors.
```
- [ ] Chat called read_figma_context
- [ ] Chat called find_design_references
- [ ] Chat used bind_variable for colors
- [ ] Design uses native Figma tokens

**TEST MQ-C: Side-by-Side Comparison**
Same brief, one through MCP/Claude Code, one through Text-to-Layout mode. Quality should be in the same ballpark (modes may not be 100% parity but should be ≥80% comparable).

---

*Epic MQ — Mode Quality Parity v1.0*
