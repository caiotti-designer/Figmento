# Synkra AIOS Development Rules for Claude Code

You are working with Synkra AIOS, an AI-Orchestrated System for Full Stack Development.

<!-- AIOS-MANAGED-START: core-framework -->
## Core Framework Understanding

Synkra AIOS is a meta-framework that orchestrates AI agents to handle complex development workflows. Always recognize and work within this architecture.
<!-- AIOS-MANAGED-END: core-framework -->

<!-- AIOS-MANAGED-START: agent-system -->
## Agent System

### Agent Activation
- Agents are activated with @agent-name syntax: @dev, @qa, @architect, @pm, @po, @sm, @analyst
- The master agent is activated with @aios-master
- Agent commands use the * prefix: *help, *create-story, *task, *exit

### Agent Context
When an agent is active:
- Follow that agent's specific persona and expertise
- Use the agent's designated workflow patterns
- Maintain the agent's perspective throughout the interaction
<!-- AIOS-MANAGED-END: agent-system -->

## Development Methodology

### Story-Driven Development
1. **Work from stories** - All development starts with a story in `docs/stories/`
2. **Update progress** - Mark checkboxes as tasks complete: [ ] → [x]
3. **Track changes** - Maintain the File List section in the story
4. **Follow criteria** - Implement exactly what the acceptance criteria specify

### Code Standards
- Write clean, self-documenting code
- Follow existing patterns in the codebase
- Include comprehensive error handling
- Add unit tests for all new functionality
- Use TypeScript/JavaScript best practices

### Testing Requirements
- Run all tests before marking tasks complete
- Ensure linting passes: `npm run lint`
- Verify type checking: `npm run typecheck`
- Add tests for new features
- Test edge cases and error scenarios

<!-- AIOS-MANAGED-START: framework-structure -->
## AIOS Framework Structure

```
aios-core/
├── agents/         # Agent persona definitions (YAML/Markdown)
├── tasks/          # Executable task workflows
├── workflows/      # Multi-step workflow definitions
├── templates/      # Document and code templates
├── checklists/     # Validation and review checklists
└── rules/          # Framework rules and patterns

docs/
├── stories/        # Development stories (numbered)
├── prd/            # Product requirement documents
├── architecture/   # System architecture documentation
└── guides/         # User and developer guides
```
<!-- AIOS-MANAGED-END: framework-structure -->

## Workflow Execution

### Task Execution Pattern
1. Read the complete task/workflow definition
2. Understand all elicitation points
3. Execute steps sequentially
4. Handle errors gracefully
5. Provide clear feedback

### Interactive Workflows
- Workflows with `elicit: true` require user input
- Present options clearly
- Validate user responses
- Provide helpful defaults

## Best Practices

### When implementing features:
- Check existing patterns first
- Reuse components and utilities
- Follow naming conventions
- Keep functions focused and testable
- Document complex logic

### When working with agents:
- Respect agent boundaries
- Use appropriate agent for each task
- Follow agent communication patterns
- Maintain agent context

### When handling errors:
```javascript
try {
  // Operation
} catch (error) {
  console.error(`Error in ${operation}:`, error);
  // Provide helpful error message
  throw new Error(`Failed to ${operation}: ${error.message}`);
}
```

## Git & GitHub Integration

### Commit Conventions
- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, etc.
- Reference story ID: `feat: implement IDE detection [Story 2.1]`
- Keep commits atomic and focused

### GitHub CLI Usage
- Ensure authenticated: `gh auth status`
- Use for PR creation: `gh pr create`
- Check org access: `gh api user/memberships`

<!-- AIOS-MANAGED-START: aios-patterns -->
## AIOS-Specific Patterns

### Working with Templates
```javascript
const template = await loadTemplate('template-name');
const rendered = await renderTemplate(template, context);
```

### Agent Command Handling
```javascript
if (command.startsWith('*')) {
  const agentCommand = command.substring(1);
  await executeAgentCommand(agentCommand, args);
}
```

### Story Updates
```javascript
// Update story progress
const story = await loadStory(storyId);
story.updateTask(taskId, { status: 'completed' });
await story.save();
```
<!-- AIOS-MANAGED-END: aios-patterns -->

## Environment Setup

### Required Tools
- Node.js 18+
- GitHub CLI
- Git
- Your preferred package manager (npm/yarn/pnpm)

### Configuration Files
- `.aios/config.yaml` - Framework configuration
- `.env` - Environment variables
- `aios.config.js` - Project-specific settings

<!-- AIOS-MANAGED-START: common-commands -->
## Common Commands

### AIOS Master Commands
- `*help` - Show available commands
- `*create-story` - Create new story
- `*task {name}` - Execute specific task
- `*workflow {name}` - Run workflow

### Development Commands
- `npm run dev` - Start development
- `npm test` - Run tests
- `npm run lint` - Check code style
- `npm run build` - Build project
<!-- AIOS-MANAGED-END: common-commands -->

## Debugging

### Enable Debug Mode
```bash
export AIOS_DEBUG=true
```

### View Agent Logs
```bash
tail -f .aios/logs/agent.log
```

### Trace Workflow Execution
```bash
npm run trace -- workflow-name
```

## Claude Code Specific Configuration

### Performance Optimization
- Prefer batched tool calls when possible for better performance
- Use parallel execution for independent operations
- Cache frequently accessed data in memory during sessions

### Tool Usage Guidelines
- Always use the Grep tool for searching, never `grep` or `rg` in bash
- Use the Task tool for complex multi-step operations
- Batch file reads/writes when processing multiple files
- Prefer editing existing files over creating new ones

### Session Management
- Track story progress throughout the session
- Update checkboxes immediately after completing tasks
- Maintain context of the current story being worked on
- Save important state before long-running operations

### Error Recovery
- Always provide recovery suggestions for failures
- Include error context in messages to user
- Suggest rollback procedures when appropriate
- Document any manual fixes required

### Testing Strategy
- Run tests incrementally during development
- Always verify lint and typecheck before marking complete
- Test edge cases for each new feature
- Document test scenarios in story files

### Documentation
- Update relevant docs when changing functionality
- Include code examples in documentation
- Keep README synchronized with actual behavior
- Document breaking changes prominently

## Figmento Design Agent Rules

### Core Principles for ALL Figma design work using Figmento MCP:

- **AUTONOMY:** When creating designs, execute ALL steps without asking for approval. Do not pause between commands. Create the complete design in one continuous flow — from frame creation through all elements to completion.
- **NO EXPORT:** Never call `export_node` at the end of a design. The user will export manually from Figma. Only use `export_node` if the user explicitly asks to see a preview or for self-evaluation purposes.
- **SINGLE FRAME:** Always create exactly ONE root frame per design. Never create duplicate or test frames. If something fails, fix it on the existing frame rather than creating a new one.
- **CLEANUP:** If a command fails mid-design, clean up any partial or orphaned elements immediately. Never leave stray nodes (empty text, broken frames) on the canvas. Use `get_page_nodes` + `delete_node` to remove debris before proceeding.
- **CONNECT FIRST:** Always verify the Figmento connection is active before creating any elements. Call `connect_to_figma` at the start if not already connected.
- **PARALLEL CALLS:** Batch independent element creation calls in parallel whenever possible (e.g., multiple rectangles or text elements that don't depend on each other's nodeIds).
- **NAMING:** Name the root frame descriptively (e.g., "Café Noir — Instagram Post") so it's easy to find in Figma's layers panel. Give every element a descriptive layer name. Never leave default names like "Rectangle" or "Text". Use names that describe purpose (e.g., "CTA Button", "Hero Title", "Dark Overlay").

## Design Intelligence

The Figmento MCP server includes a knowledge base at `figmento-mcp-server/knowledge/` that provides design expertise. Consult these files for EVERY design task.

### Knowledge Files

| File | Purpose | When to Use |
|------|---------|-------------|
| `size-presets.yaml` | Dimensions for all social, print, presentation, and web formats | Choosing frame size for any design |
| `typography.yaml` | Type scales, font pairings, line heights, letter spacing, weights | Selecting fonts, sizing text, building hierarchy |
| `color-system.yaml` | Mood-based palettes, WCAG contrast, safe color combos | Choosing colors for any mood/brand |
| `layout.yaml` | 8px grid, spacing scale, margins, safe zones, layout patterns | Spacing, padding, margins, element positioning |
| `brand-kit-schema.yaml` | Brand kit format with Café Noir example | Loading/saving brand identities |
| `print-design.yaml` | Brochure/folder layout patterns, print typography, spacing | Any print/brochure/folder/catalog design task |

### Standard Design Workflow

1. **Connect** — `connect_to_figma` (skip if already connected).
2. **Frame** — skip if a frame is already selected in Figma. Otherwise `get_design_guidance(aspect="size")` to confirm dimensions — only if format is unknown.
3. **Generate background** — `generate_design_image(brief, format, mood)` → returns `frameId`, `imageNodeId`, `textZone`. This is the **first creative decision** — the composition is built around the image. Skippable only if the user explicitly says no image.
4. **Overlay** — `set_fill` gradient overlay on the frame if text contrast needs reinforcement (2 stops, color-matched to frame bg, solid end behind text zone).
5. **Content** — `batch_execute` → headline + subheadline + CTA in one call. Position text within the `textZone` returned by step 3.
6. **Refine** — `run_refinement_check` → fix any flagged issues → done.

> Steps 1–2 collapse to nothing when already connected and format is known. In practice most designs start at step 3.

### Blueprint-First Workflow (Preferred)

Prefer over Standard when a blueprint exists:
1. Parse request (same as Standard step 1)
2. `get_layout_blueprint(category, mood?)` — if found, use its proportional zones; if not, fall back to Standard
3. Pick size, palette, fonts (Standard steps 2–4)
4. Resolve zones to pixels (`y_start_pct × height`, or use the tool's `resolved_example`)
5. Create root frame
6. Fill blueprint zones per its `elements` + `typography_hierarchy`
7. Apply styling — follow `anti_generic` rules from the blueprint
8. Add the `memorable_element` from the blueprint hint
9. Refinement pass (`get_design_rules('refinement')`)
10. Self-evaluate (`get_design_rules('evaluation')`)

### Figma-Native Workflow (Variables + Styles)

1. `read_figma_context()` immediately after connecting
2. Variables found → `bind_variable` for all colors/spacing/radius. Styles found → `apply_style(styleType="paint")`/`apply_style(styleType="text")`. Empty file → `create_variables_from_design_system` first.
3. NEVER hardcode a color hex if a variable exists. NEVER set font/size manually if a text style exists.

### Reference-First Design (When Library Has References)

1. `find_design_references(category, mood?, industry?)` — study `notable` + `composition_notes`
2. `get_layout_blueprint` matching the reference's layout field
3. Adapt proportional principles (zones, whitespace, hierarchy) with the brief's own content

If `list_reference_categories` shows 0 references, go straight to `get_layout_blueprint`.

### Typography Selection Guide

Call `get_design_rules('typography')` for font pairings by mood, line-height rules, letter-spacing rules, weight hierarchy, and minimum font sizes by format.

**CRITICAL — Font Consistency Rule:** If the prompt names a font → use ONLY that font for the entire design. Never mix. Before every `create_text` call, verify you are passing the correct `fontFamily`. The pairing table is only for when no font is specified.

### Layout Composition Rules

**Always use the 8px grid.** Spacing values: `4|8|12|16|20|24|32|40|48|64|80|96|128`

Call `get_design_rules('layout')` for margins by format, social media safe zones, minimum font sizes by format, and visual hierarchy rules.

### Print Layout Rules (Mandatory for A4+ Formats)

ALL print designs MUST use auto-layout exclusively. **Never use absolute x/y positioning on print pages** — it creates unpredictable gaps.

Call `get_design_rules('print')` for the full spacing scale, mandatory page structure, auto-layout rules, and print typography hierarchy with enforced size ratios.

### Color Selection Guide

Call `get_design_rules('color')` for the full mood → palette mapping and contrast rules. Use `get_design_guidance(aspect="color", mood=...)` to retrieve actual color values. Contrast minimum: 4.5:1 for normal text, 3:1 for large text.

### Common Design Patterns

**Ad / Banner / Hero Section pattern (full-bleed image + text):**
Use nested auto-layout frames, NOT flat absolute positioning. Structure:
```
Root Frame (NONE layout, exact dimensions)
├── background (RECTANGLE, solid fill matching theme)
├── hero-image (RECTANGLE, IMAGE fill, top ~64% of frame)
├── overlay (RECTANGLE, 2-stop gradient — see Rule 4b)
├── logo (FRAME, VERTICAL auto-layout, absolute top-left)
├── badge (FRAME, VERTICAL auto-layout, circular cornerRadius, absolute top-right)
└── content (FRAME, VERTICAL auto-layout, padding 96/64, itemSpacing 40)
    ├── text-group (FRAME, VERTICAL, itemSpacing 32)
    │   ├── headline (96px bold serif)
    │   ├── subheadline (32px regular sans)
    │   └── price (32px base / 48px sale bold)
    └── cta-group (FRAME, VERTICAL, itemSpacing 32)
        ├── cta-button (FRAME, HORIZONTAL auto-layout, padding 20/96)
        └── note (24px, muted)
```
Key: the `content` frame uses auto-layout to handle all vertical spacing. Never manually position text nodes with absolute x/y inside the text area — let auto-layout handle it. This pattern scales to web heroes (auto-layout = flexbox).

**Button pattern:**
To create a button, use `create_frame` with auto-layout (`layoutMode: "HORIZONTAL"`), padding (12–16px vertical, 24–32px horizontal), `cornerRadius` (8–24), background fill, then `create_text` as a child with `layoutSizingHorizontal: "FILL"`. Do NOT create separate rect + text — always use an auto-layout frame as the container.

**Badge / pill / chip pattern:**
Same as button but smaller: `cornerRadius` fully rounded (`height / 2`), padding (4–8px vertical, 12–16px horizontal), smaller font size (12–14px).

**Icon usage:**
The `create_icon` tool places Lucide icons by name from the bundled 1900+ icon library. SVG path data is automatically loaded — no need to provide `svgPaths`. Use `list_resources(type="icons")` to search or browse by category (arrows, media, communication, data, ui, nature, commerce, social, dev, shapes). Common icons: `check`, `arrow-right`, `map-pin`, `phone`, `mail`, `star`, `heart`, `shopping-cart`, `menu`, `search`, `zap`, `shield`, `target`, `code`, `globe`.

**Feature grid icons:**
When creating a `feature_grid` pattern, after the pattern is created, call `create_icon` for each feature card using the returned Icon Container nodeIds as `parentId`. Use contextually appropriate Lucide icon names based on the feature titles (e.g., "Performance" → `zap`, "Security" → `shield`, "Analytics" → `bar-chart`).

**Batch execution rule (IMPORTANT — highest-impact optimization):**
For designs with 3+ elements, prefer `batch_execute` over sequential tool calls. Group related creation commands into batches — create a parent frame and all its children in one batch using `tempId` references. Example: `{ action: "create_frame", params: { name: "Card", width: 400, height: 300 }, tempId: "card" }` followed by `{ action: "create_text", params: { content: "Title", parentId: "$card" } }`. Max 50 commands per batch. Failed commands don't abort the batch — all commands run and results report individually.

**Canvas spacing rule:**
When creating multiple top-level designs, offset each new design **200px to the right** of the previous one's right edge. Use `get_page_nodes` to find existing frame positions before placing new ones.

**Repeated elements pattern:**
Use `clone_with_overrides` for repeated patterns like menu rows, card grids, feature lists, or speaker cards. It clones a node N times in one call with positional offsets and named child text/color/font overrides — replacing the old clone → find → set_text × N pattern with a single call. For one-off clones, `clone_node` still works.

**AI-generated image placement:**
When placing AI-generated images, ALWAYS use `place_generated_image` with the file path from mcp-image output. NEVER read image files into base64 manually or pass base64 through bash — the strings are too large for the parameter system. The `place_generated_image` tool reads files server-side and handles all encoding internally. Use the `scaleMode` parameter to control fit: `FILL` (default, crops to fill), `FIT` (contains within bounds), `CROP`, or `TILE`.

**Setting IMAGE fill on an existing node (replacing background):**
Use `set_image_fill(nodeId, filePath, scaleMode?)` to apply an image directly as a node's fill — without creating a child element. This is the correct way to swap a frame's background image from a local file. The tool reads the file server-side and applies it as an IMAGE fill. Accepts PNG, JPG, or WebP.

**Generating image directly as frame fill (no child node):**
Use `generate_design_image(..., asFill=true)` to generate a Nano Banana 2 image and apply it directly as the target frame's IMAGE fill — no child rectangle created. This is ideal for replacing backgrounds on existing frames. Without `asFill`, the image is placed as a child node (legacy behavior).

### Image Generation Rules (Mandatory)

Every design should include real images, not colored rectangles:

1. **Primary:** Use `mcp-image` to generate contextual images matching the brief
   - Be specific: "Professional headshot of woman in navy blazer, studio lighting, neutral background" — NOT "placeholder image"
   - Match requested dimensions to the target frame size
   - After generation, place with `place_generated_image` using the returned file path
2. **Fallback:** If mcp-image is unavailable or fails, use `fetch_placeholder_image` with relevant keywords
3. **Never:** Leave a colored or gray rectangle as a final image — always resolve to a generated or placeholder image
4. **Budget:** Limit to 3-4 generated images per design session to keep execution time reasonable

### Contextual Image Fill (Batch Image Placement)

Use `fill_contextual_images` when the user wants to fill multiple frames/cards with contextually relevant images:

**When to use:** "fill images for this section", "generate images for these cards", "add images to these cards", "preencha com imagens", "gere imagens para essa seção".

**How it works:**
1. Analyzes the entire page with Vision AI to understand industry, brand, tone, purpose
2. Discovers empty image slots in the selected section (frames/rectangles without IMAGE fills, no text children, min 80px)
3. Builds contextual prompts per slot using nearby text (card titles, descriptions)
4. Generates and places images sequentially (3-5s per image, max 6 per call)

**Usage patterns:**
- Section selected → `fill_contextual_images()` — auto-discovers all empty slots
- Specific frames → `fill_contextual_images(targetNodeIds=["id1","id2"])` — fills exactly those
- With context → `fill_contextual_images(context="industrial cleaning equipment company")` — supplements auto-detection
- Skip analysis → `fill_contextual_images(skipAnalysis=true, context="...")` — uses manual context only

**Page context is cached** for 30 minutes — second call on a different section reuses the analysis.

**Multi-section background composition rule:**
When creating multiple patterns for the same page, always think about the background color sequence first. The page should read: **bold open → breathe → breathe → bold break → breathe → bold close** (primary → surface → background → primary → surface → primary). Never have the same background color on 3+ consecutive sections. Use `create_from_template` with `composition_mode: "connected"` for landing pages — it enforces this rhythm automatically via `knowledge/patterns/composition-rules.yaml`. In connected mode, sections stack vertically (gap=0) and each section's background is overridden to match the composition plan. Treat the sequence of backgrounds as a deliberate design decision, not an afterthought.

### Self-Evaluation Checklist

Call `get_design_rules('evaluation')` for the full 16-point checklist. The following checks are now automated by the refinement engine (returned in `evaluation.issues`): **1** (Alignment — spacing-scale), **2** (Contrast — wcag-contrast), **5** (Consistency — spacing-scale + typography-hierarchy), **6** (Safe zones — safe-zone), **14** (Images resolved — empty-placeholder), **15** (Gradient direction — gradient-direction), **16** (Print structure — auto-layout-coverage). Focus manual review on the remaining 9 points: 3 (Hierarchy), 4 (Whitespace), 7 (Balance), 8 (Intent), 9 (Typography polish), 10 (Shadow quality), 11 (Memorable element), 12 (Refinement applied), 13 (Reference consulted).

### Design Refinement Pass (Mandatory)

Run after creating any design — these are beauty checks, not correctness checks. Call `get_design_rules('refinement')` for the 7-step pass (typography tightening, shadow warmth, card elevation, CTA isolation, memorable element, whitespace ratio, accent text contrast).

### Automatic Quality Feedback

`batch_execute` and `create_design` automatically return a refinement score and screenshot when creating 5+ elements. Check the `evaluation.score` in the response — if score < 70, fix the reported `evaluation.issues` before reporting done. Pass `autoEvaluate: false` to skip for intermediate batches.

## HTML-to-Figma Pipeline

For print/brochure designs, use this pipeline:
1. Read brief + assets
2. Generate self-contained HTML per page (inline CSS, base64 assets, Google Fonts, exact target dimensions — magazine quality)
3. Render: `node scripts/render-html.js input.html output.png` (A4 = 2480×3508, Puppeteer)
4. Place PNG in Figma via `create_image`
5. Each page = separate frame, side by side. Output to `temp/designs/[project-name]/`.

## Design Taste Rules (Creative Mode)

Apply these principles whenever no brand system is specified, or when the user gives creative latitude ("use your own judgment", "high-end", "editorial", etc.).

### Rule 1 — Commit to an Aesthetic Direction First
Before calling any tool, pick ONE direction: **editorial**, **brutalist**, **organic**, **luxury**, **geometric**, or **playful**. Never start neutral — neutral is the enemy. Call `get_design_rules('taste')` for full direction descriptions.

### Rule 2 — Typography Is the First Decision
Never default to Inter/Inter. Match the brief to a font pairing before creating any frame. Call `get_design_rules('typography')` for the mood → font pairing table. If a font is named in the brief — use ONLY that font.

### Rule 3 — Color Commitment
Pick a dominant color story and paint with it boldly. The three valid dark-side options:
1. **Near-black hero** — `#0A0A0F` or `#0F0E11` background, champagne/gold or cream accent
2. **Full primary fill** — entire background IS the brand color, white text on top
3. **Gradient hero** — diagonal primary_dark → primary, or primary → secondary

**Forbidden:** light grey background + timid blue accent. This is the generic AI look.

### Rule 4 — Background Depth
Never use flat solid fills on hero sections or full-page frames. Always apply at least one:
- Dark-to-slightly-less-dark gradient (creates depth without distraction)
- Subtle radial glow at center (primary color at 8-12% opacity over near-black)
- Full-bleed gradient from primary_dark to primary

### Rule 4b — Content-Aware Gradient Overlays

Solid end = where the text is. Transparent end = where the image shows. 2 stops only. Gradient color MUST match the section background color — never black on light sections.

Call `get_design_rules('gradients')` for the full direction map (bottom-top, top-bottom, left-right, right-left) with stop positions.

### Rule 5 — Spatial Generosity
Increase all padding by 1.5× what feels "enough". When a spacing value feels right, go one step larger. Margins should feel almost too generous.

### Rule 6 — Never Converge
Every brief produces a visually distinct output. Actively diverge from the last design — different font direction, different color story, different alignment.

### Rule 7 — Self-Evaluate Ruthlessly
After every `get_screenshot` ask: *"senior designer or bot?"* If bot — fix the most generic element before reporting back (centered-everything, uniform-padding cards, default-blue CTA, no visual tension).

### Rule 8 — The One Memorable Thing
Every design must have ONE unforgettable element: a 120px+ display headline, an unexpected color treatment, an editorial element that breaks the grid, or a full-bleed image with text over it. If nothing stands out, the design has failed.

---

## Design Anti-Patterns (Never Do These)

Call `get_design_rules('anti-patterns')` for the full list. Critical hard-stops:
- **fontWeight 600 on non-Inter fonts** — silently falls back to Inter. Use 400 or 700 only.
- **Content frames with fixed height** — clips text. Use `layoutSizingVertical: 'HUG'`.
- **Gradient solid end facing away from text** — most common AI gradient mistake. Solid must be behind text.
- **Absolute positioning on print pages** — creates random gaps. EVERY print frame must use auto-layout.

---

## Design Brief Analysis (Mandatory Internal Step)

Before calling any design tool for a creative request, answer these five questions and include the answers in your response so the user can see your creative thinking:

```
DESIGN BRIEF ANALYSIS
─────────────────────
Figma context        : [X variables, Y paint styles, Z text styles] or [empty — will create variables]
Reference match      : [ref-id — "notable element"] or [no references for this category]
Layout blueprint     : [blueprint name from get_layout_blueprint() or "custom — no match"]
Aesthetic direction  : [editorial / brutalist / organic / luxury / geometric / playful]
Font pairing         : [heading font] + [body font] — reason: [why this fits the brief]
Color story          : [dark / light / colorful / monochrome] — dominant color: [hex or name]
Memorable element    : [the ONE thing that will make this design unforgettable]
Generic trap avoided : [what would the bot version look like — and what you're doing instead]
```

Only after completing this analysis, proceed with tool calls.

---

## Design System Workflow

### Starting Any Design
1. Ask what brand/project this is for
2. Check for existing design system: get_design_system(name)
3. If none: offer to create one from color+font, mood, or preset
4. Load format rules: get_format_rules(format) for the target format
5. Use create_component for standard elements — NEVER manually build buttons, badges, cards
6. All colors, fonts, spacing from tokens — NEVER hardcode values when a system is loaded

### Format Awareness
- ALWAYS call get_format_rules before starting any design
- Respect safe zones — no critical content outside safe area
- Use format-specific typography scales — web sizes ≠ print sizes ≠ social sizes
- Print formats: respect bleed, minimum font sizes, CMYK considerations
- Social formats: design for mobile viewing (content must read at 375px display width)

### Template-Based Workflow
When user says "use this as a template" or "make variations of this":
1. Call scan_frame_structure to understand the existing design
2. Use clone_with_overrides to create copies
3. Modify text, colors, images while preserving layout structure
4. The user's layout decisions are sacred — don't rearrange their design

### Token Discipline
- Every color: from design system tokens
- Every font: from system typography
- Every spacing value: from spacing scale
- If you need a value not in the system: ask the user or explain the deviation

### Component Usage
- Buttons: ALWAYS use create_component, never frame+text manually
- Badges: ALWAYS use create_component
- Cards: ALWAYS use create_component for the container
- If a component doesn't exist for what you need: use batch_execute with token values

### Consolidated Tools (TC-1 + TC-2 — Complete)

Old tool names have been fully removed. Use only the consolidated names:

| Consolidated Tool | Replaces | Parameter |
|---|---|---|
| `set_style` | set_fill, set_stroke, set_effects, set_corner_radius, set_opacity | `property` |
| `transform_node` | move_node, resize_node | x, y, width, height |
| `apply_style` | apply_paint_style, apply_text_style, apply_effect_style | `styleType` |
| `get_design_guidance` | get_size_preset, get_font_pairing, get_type_scale, get_color_palette, get_spacing_scale, get_layout_guide | `aspect` |
| `list_resources` | list_layout_blueprints, list_reference_categories, list_patterns, list_templates, list_icons, list_formats, list_components, list_design_systems | `type` |

### Hidden Tools (54 tools — available via batch_execute)

The following tools are hidden from the visible tool list in design sessions to improve tool selection accuracy (109 → 55 visible). They remain callable via `batch_execute` DSL using their action names. Categories:

- **Scene advanced:** boolean_operation, flatten_nodes, export_as_svg, set_constraints, import_component_by_key, import_style_by_key, list_available_fonts
- **Intelligence redundant:** suggest_font_pairing, get_contrast_check, generate_accessible_palette, evaluate_layout
- **DS pipeline internals:** create_figma_variables, create_variable_collections, create_ds_components, create_text_styles, create_variables_from_design_system
- **Interactive components:** convert_to_component, combine_as_variants, create_instance, detach_instance, set_reactions, get_reactions, apply_interaction, list_interaction_presets, make_interactive, create_prototype_flow
- **Brand/assets/storage:** get_brand_kit, save_brand_kit, save_brand_assets, load_brand_assets, list_brand_assets, store_temp_file, list_temp_files, place_brand_asset, import_pdf
- **Specialized flows:** start_ad_analyzer, complete_ad_analyzer, design_from_reference, generate_ad_variations, find_design_references, analyze_reference, batch_analyze_references
- **Low usage:** update_design_system, delete_design_system, refine_design_system, design_system_preview, brand_consistency_check, get_layout_blueprint, get_learned_preferences, scan_template, disconnect_from_figma, create_carousel, create_presentation, fetch_placeholder_image, evaluate_design

---
*Synkra AIOS Claude Code Configuration v2.2*
