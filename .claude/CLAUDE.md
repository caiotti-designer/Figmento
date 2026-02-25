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

Follow this workflow for every design request:

1. **Understand the request** — Parse what the user wants: format (Instagram post? Poster? Presentation? Brochure/folder?), mood/style, content, brand constraints. **For any print/brochure/folder/catalog task, always read `print-design.yaml` first and follow its layout patterns and typography minimums.**
2. **Pick the size** — Look up the exact pixel dimensions in `size-presets.yaml`. Never guess dimensions.
3. **Pick the palette** — Match the mood/style to a palette in `color-system.yaml`. If a brand kit exists, use its colors instead.
4. **Pick the fonts** — Match the mood to a font pairing in `typography.yaml`. Use the recommended heading/body weights.
5. **Choose a type scale** — Select the appropriate scale ratio from `typography.yaml`:
   - `minor_third` (1.2) — documents, long reads, subtle hierarchy
   - `major_third` (1.25) — general purpose, balanced, most designs
   - `perfect_fourth` (1.333) — marketing, posters, strong hierarchy
   - `golden_ratio` (1.618) — hero sections, display-heavy, dramatic
6. **Plan the layout** — Pick a layout pattern from `layout.yaml` (centered-stack, split-half, full-bleed-with-overlay, etc.). Use the spacing scale — never use arbitrary pixel values.
7. **Create the frame** — Set up the root frame with exact dimensions and background color.
8. **Build content hierarchy** — Add elements top-down: most important first (headline), then supporting (subheadline, body), then action (CTA). Apply font sizes from the type scale.
9. **Apply styling** — Colors, effects (shadows, gradients), corner radii, opacity.
10. **Refine** — Check alignment, spacing consistency, contrast, whitespace balance.

### Typography Selection Guide

**By mood → font pairing:**
| Mood | Pairing ID | Fonts |
|------|-----------|-------|
| Modern, tech, SaaS | `modern` | Inter + Inter |
| Classic, editorial | `classic` | Playfair Display + Source Serif Pro |
| Bold, marketing | `bold` | Montserrat + Hind |
| Luxury, fashion | `luxury` | Cormorant Garamond + Proza Libre |
| Playful, friendly | `playful` | Poppins + Nunito |
| Corporate, finance | `corporate` | Roboto + Roboto Slab |
| Journalistic, blog | `editorial` | Libre Baskerville + Open Sans |
| Minimal, portfolio | `minimalist` | DM Sans + DM Sans |
| Creative, agency | `creative` | Space Grotesk + General Sans |
| Elegant, literary | `elegant` | Lora + Merriweather |

**Line height rules (always apply):**
- Display/hero text (>48px): line-height 1.1–1.2
- Headings (H1–H3): line-height 1.3–1.4
- Body text (14–18px): line-height 1.5–1.6
- Captions/small (<14px): line-height 1.6–1.8

**Letter spacing rules:**
- Display text: -0.02em (tighten)
- Headings: -0.01em
- Body: 0 (natural)
- Uppercase labels: +0.05 to +0.15em (open up)

**Weight hierarchy:** 400 body → 500 emphasis → 600 subheadings → 700 headings → 800+ display

**CRITICAL — Font Consistency Rule:**
- When a prompt specifies a font (e.g., "use Outfit"), use ONLY that font for the ENTIRE design. Never mix it with Inter or any other font unless the prompt explicitly requests multiple fonts.
- The typography pairing table above is for when NO font is specified. If the user names a font, that font overrides the table completely.
- Before every `create_text` call, verify you are passing the correct `fontFamily` — do NOT rely on defaults.
- If a design uses font pairings (heading + body), both fonts must be explicitly stated by the user. If only one font is mentioned, use it for everything.

### Layout Composition Rules

**Always use the 8px grid.** All spacing values must come from the spacing scale:
`4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128`

**Margins by format type:**
- Social media: 40–60px (default 48px)
- Print: 72–96px (default 72px)
- Presentation slides: 60–80px (default 64px)
- Web heroes: 40–80px (default 64px)
- Posters: 96–128px (default 96px)

**Social media safe zones (keep text inside these):**
- Instagram: 150px from top/bottom, 60px from sides
- TikTok: 100px top, 200px bottom, 60px left, 100px right
- YouTube thumbnails: avoid bottom-right (timestamp overlay)

**Minimum font sizes by format (mandatory — never go below these):**

| Format | Display/Hero | Headline | Subheadline | Body | Caption/Label |
|--------|-------------|----------|-------------|------|---------------|
| Instagram/Social (1080px wide) | 72–120px | 48–72px | 32–40px | 28–32px | 22–26px |
| Print (300dpi) | 80–140px | 56–80px | 36–48px | 24–32px | 18–24px |
| Presentation (1920px wide) | 64–96px | 40–64px | 28–36px | 20–28px | 16–20px |
| Web Hero (1440px wide) | 56–96px | 36–56px | 24–32px | 16–20px | 12–16px |

**Visual hierarchy checklist:**
- Headlines ≥ 2x body size
- At least 2 weight steps between hierarchy levels
- Primary text at full color, secondary at muted, tertiary at light muted
- Section gaps ≥ 2x item gaps

### Color Selection Guide

**By mood → palette ID in `color-system.yaml`:**
| Mood Keywords | Palette |
|---------------|---------|
| moody, dark, coffee, cinematic | `moody-dark` |
| fresh, light, health, wellness | `fresh-light` |
| corporate, business, finance | `corporate-professional` |
| luxury, gold, premium, fashion | `luxury-premium` |
| playful, fun, colorful, kids | `playful-fun` |
| nature, organic, eco, botanical | `nature-organic` |
| tech, digital, AI, startup | `tech-modern` |
| warm, cozy, autumn, bakery | `warm-cozy` |
| minimal, clean, monochrome | `minimal-clean` |
| retro, vintage, nostalgic | `retro-vintage` |
| ocean, calm, serene, spa | `ocean-calm` |
| sunset, energy, sport, music | `sunset-energy` |

**Contrast rules (mandatory):**
- Normal text (<18px): minimum 4.5:1 ratio against background
- Large text (≥18px): minimum 3:1 ratio against background
- When in doubt, use the safe combos from `color-system.yaml`

### Common Design Patterns

**Button pattern:**
To create a button, use `create_frame` with auto-layout (`layoutMode: "HORIZONTAL"`), padding (12–16px vertical, 24–32px horizontal), `cornerRadius` (8–24), background fill, then `create_text` as a child with `layoutSizingHorizontal: "FILL"`. Do NOT create separate rect + text — always use an auto-layout frame as the container.

**Badge / pill / chip pattern:**
Same as button but smaller: `cornerRadius` fully rounded (`height / 2`), padding (4–8px vertical, 12–16px horizontal), smaller font size (12–14px).

**Icon usage:**
The `create_icon` tool places Lucide icons by name. Use it for UI icons like `check`, `arrow-right`, `map-pin`, `phone`, `mail`, `star`, `heart`, `shopping-cart`, `menu`, `search`, etc. Pass `svgPaths` for precise rendering or omit for basic fallback shapes.

**Batch execution rule (IMPORTANT — highest-impact optimization):**
For designs with 3+ elements, prefer `batch_execute` over sequential tool calls. Group related creation commands into batches — create a parent frame and all its children in one batch using `tempId` references. Example: `{ action: "create_frame", params: { name: "Card", width: 400, height: 300 }, tempId: "card" }` followed by `{ action: "create_text", params: { content: "Title", parentId: "$card" } }`. Max 50 commands per batch. Failed commands don't abort the batch — all commands run and results report individually.

**Canvas spacing rule:**
When creating multiple top-level designs, offset each new design **200px to the right** of the previous one's right edge. Use `get_page_nodes` to find existing frame positions before placing new ones.

**Repeated elements pattern:**
Use `clone_with_overrides` for repeated patterns like menu rows, card grids, feature lists, or speaker cards. It clones a node N times in one call with positional offsets and named child text/color/font overrides — replacing the old clone → find → set_text × N pattern with a single call. For one-off clones, `clone_node` still works.

**AI-generated image placement:**
When placing AI-generated images, ALWAYS use `place_generated_image` with the file path from mcp-image output. NEVER read image files into base64 manually or pass base64 through bash — the strings are too large for the parameter system. The `place_generated_image` tool reads files server-side and handles all encoding internally. Use the `scaleMode` parameter to control fit: `FILL` (default, crops to fill), `FIT` (contains within bounds), `CROP`, or `TILE`.

### Self-Evaluation Checklist

After creating any design, mentally verify these 8 points:

1. **Alignment** — Are all elements aligned to a consistent grid? No stray 3px offsets?
2. **Contrast** — Is all text readable against its background? Does it pass WCAG AA?
3. **Hierarchy** — Is it immediately clear what to read first, second, third?
4. **Whitespace** — Is there enough breathing room? Or does it feel cramped?
5. **Consistency** — Are spacing values, colors, and fonts consistent throughout?
6. **Safe zones** — Is critical text within the platform's safe zone?
7. **Balance** — Does the composition feel balanced, not top-heavy or lopsided?
8. **Intent** — Does the design serve the user's stated goal and mood?

If using `export_node` for self-evaluation, check the screenshot against these 8 points and iterate (max 2–3 passes).

### Automated Self-Evaluation Workflow

After creating or significantly modifying a design (new frames, multi-element compositions, carousels, etc.), **automatically run one evaluation pass** without the user asking. This is optional but strongly encouraged for quality assurance.

**Workflow:**

1. **Call `evaluate_design`** on the root frame node ID. This returns:
   - A PNG file path (view it to inspect the design visually)
   - A structural summary: all elements with their types, positions, sizes, fonts, colors
   - Stats: total elements, text node count, unique font sizes, typography level count

2. **Review the exported image** (read the file at `filePath`) and the structural data. Check against this **format-aware checklist**:

   | Check | What to verify | Data source |
   |-------|---------------|-------------|
   | Typography hierarchy | At least 3 distinct font size levels (display, heading, body). `stats.typographyLevels >= 3` | `stats.uniqueFontSizes` |
   | Safe zone compliance | Text elements are inside platform safe zones. Use `get_layout_guide` with the current format to get exact margins/safe zones, then verify all text `x`/`y` positions respect them. | `elements[].x/y` + `get_layout_guide` |
   | Contrast ratios | For each text element, check its fill color against the parent/background fill using `get_contrast_check`. Must pass WCAG AA. | `elements[].fills` |
   | Spacing consistency | Gaps between elements should use values from the 8px grid spacing scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128). Flag irregular gaps. | `elements[].x/y` positions |
   | Visual balance | No large empty areas on one side while the other is crowded. Text and images distributed evenly. | Visual inspection of PNG |
   | Image placement | Images are properly sized, not stretched, and placed within frame bounds. | `elements[].width/height` for IMAGE type |
   | CTA visibility | If there's a button/CTA, it should be prominent — large enough, high contrast, in the lower third or center. | Visual + structural |

3. **Apply fixes** using existing tools (`move_node`, `resize_node`, `set_fill`, `create_text`, etc.) for any issues found.

4. **Maximum 2 evaluation passes.** After the second pass, stop iterating and report any remaining issues to the user. Never loop indefinitely.

**When to trigger:**
- After creating a new design frame with 5+ elements
- After completing a multi-slide carousel (evaluate at least the first slide)
- After major layout restructuring
- NOT for single-element tweaks (moving one node, changing one color)

**Example flow for a 3-slide carousel:**
```
1. Create all 3 slides
2. Call evaluate_design on slide 1's root frame
3. Read the PNG file, inspect structural data
4. Find issue: body text at 18px is too small for Instagram (minimum 28px)
5. Fix: resize body text to 30px via resize_node or update text properties
6. Call evaluate_design again (pass 2) to confirm fix
7. Report: "Evaluated slide 1 — fixed body text size from 18px to 30px. Passes all checks."
```

## HTML-to-Figma Pipeline

When asked to create print designs (brochures, folders, flyers, posters) or any complex visual design, follow this pipeline:

**STEP 1** — Read the brief (.md file) and assets (`assets/` folder)

**STEP 2** — Generate a single self-contained HTML file per page:
- Inline all CSS (no external stylesheets)
- Embed assets as base64 data URIs in `<img>` tags
- Use exact pixel dimensions matching the target (e.g., 2480x3508 for A4 300dpi)
- Use Google Fonts via `@import`
- Design as if building a premium landing page — use modern CSS: grid, flexbox, gradients, backdrop-filter, box-shadow, etc.
- The HTML MUST look production-quality — this is your strength, use it fully

**STEP 3** — Render each HTML to PNG using:
```bash
node scripts/render-html.js input.html output.png
```

**STEP 4** — Read the PNG as base64 and place in Figma via `create_image` MCP tool

**STEP 5** — Each page becomes a separate frame in Figma, side by side

### Design Quality Guidelines for HTML

- Use CSS Grid and Flexbox for layouts
- Use gradients, subtle shadows, and layered backgrounds for depth
- Typography: Google Fonts, proper hierarchy with font-size, weight, letter-spacing
- Colors: sophisticated palettes with primary, secondary, accent, neutrals
- Whitespace: generous padding and margins (print needs breathing room)
- For A4: think magazine/brochure quality, not website quality
- Embed placeholder rectangles with labels for images you don't have
- For images you DO have (in `assets/`): embed as base64 data URIs

### File Organization

```
temp/designs/[project-name]/
├── page-1.html
├── page-1.png
├── page-2.html
├── page-2.png
└── ...
```

Keep HTML files for iteration — user can ask to tweak and re-render.

### Render Script

Located at `scripts/render-html.js`. Usage:
```bash
node scripts/render-html.js <input.html> <output.png>
```
- Viewport: 2480x3508 (A4 at 300dpi)
- Waits for fonts to load (`document.fonts.ready`)
- Uses headless Chromium via Puppeteer

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

---
*Synkra AIOS Claude Code Configuration v2.1*
