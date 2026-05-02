# AGENT.md — Figmento Project Rules (Universal Agent Spec)

Mirror of [.claude/CLAUDE.md](./.claude/CLAUDE.md) for non-Claude agents (Cursor, Codex, Cline, Aider, Continue, etc.). Same rules, neutral tooling references. **Keep both files in sync — when one changes, update the other.**

Caio is a designer who vibecodes. This file defines how any AI agent should work on Figmento and how the Figmento design-agent behaves.

---

## Coding Behavior (Karpathy-Inspired)

Bias toward caution over speed; for trivial tasks, use judgment. Source: [andrej-karpathy-skills/CLAUDE.md](https://github.com/forrestchang/andrej-karpathy-skills/blob/main/CLAUDE.md).

**1. Think Before Coding** — State assumptions explicitly. If multiple interpretations exist, present them; don't pick silently. If a simpler approach exists, say so. If anything is unclear, stop and ask.

**2. Simplicity First** — Minimum code that solves the problem. No features beyond what was asked, no abstractions for single-use code, no "flexibility" that wasn't requested, no error handling for impossible scenarios. Ask: *would a senior engineer call this overcomplicated?* If yes, simplify.

**3. Surgical Changes** — Touch only what you must. Don't "improve" adjacent code, don't refactor things that aren't broken, match existing style. Mention unrelated dead code; don't delete it. Remove only the imports/vars/functions *your* changes orphaned. Every changed line should trace to the user's request.

**4. Goal-Driven Execution** — Define verifiable success criteria. "Add validation" → "Write tests for invalid inputs, then make them pass." For multi-step tasks, state a brief plan with verification per step. Strong criteria let you loop independently.

---

## How Caio Works

- **Product/scope** → `@helm` · **Design/UX** → `@muse`/`@pixel` · **Cleanup/audit** → `@atlas` · **Agent building** → `@mason` (Jarvis squad)
- **Dev-mode** → 4 slash personas: `@architect`, `@dev`, `@qa`, `@devops`

These personas are Claude Code-native; non-Claude agents read them as role hints.

## Story Files (Optional)

Track non-trivial features in `docs/stories/{ID}-{slug}.story.md` for cross-session context. No rituals. Archive Done stories to `docs/stories/_archived/`.

## Code Standards

Clean self-documenting code · follow existing patterns · TS/JS best practices · tests for non-trivial features · `npm run build` (or relevant test) before reporting complete.

## Git Conventions

Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `security:`, `refactor:`) · atomic commits · `@devops` exclusively owns `git push` and `gh pr create`.

## Tool Selection

Use your agent's native filesystem/search primitives instead of shelling out: code search > bash grep · glob equivalent · file-read · edit/patch > full-file rewrite · shell only for commands. MCP rules in [.claude/rules/mcp-usage.md](./.claude/rules/mcp-usage.md).

## ws-relay (pm2)

`figmento-ws-relay` runs permanently via pm2 on port 3055, auto-starts on Windows login. Setup on a fresh machine: `powershell -ExecutionPolicy Bypass -File scripts\setup-pm2.ps1`. Daily workflow: do nothing.

Commands: `pm2 status` · `pm2 restart figmento-relay` (after `git pull`) · `pm2 logs figmento-relay` · `pm2 stop figmento-relay`. Auto-restart hook: `npm run build` in `figmento-ws-relay/` triggers `pm2 restart` (postbuild hook).

Full reset: `pm2 kill && cd figmento-ws-relay && pm2 start dist/index.js --name figmento-relay && pm2 save`.

---

# Figmento Design Agent Rules

## Core Principles

- **AUTONOMY** — Execute all steps in one continuous flow. No mid-task approvals.
- **NO EXPORT** — Never `export_node` at the end; the user exports manually. Only export for explicit preview/self-eval requests.
- **SINGLE FRAME** — Exactly ONE root frame per design. Fix failures on the existing frame, never spawn duplicates.
- **CLEANUP** — On mid-design failure, use `get_page_nodes` + `delete_node` to clear orphans before continuing.
- **CONNECT FIRST** — Call `connect_to_figma` if not connected.
- **PARALLEL** — Batch independent creation calls.
- **NAMING** — Descriptive root frame ("Café Noir — Instagram Post"), purpose-named children ("CTA Button", "Hero Title"). Never leave "Rectangle"/"Text".

## Post-Showcase Extension Discipline

After `generate_design_system_in_figma` or `create_ds_showcase`. Traces to Coral de Dois bugs (2026-04-16); see [DQ-HF-1](./docs/stories/DQ-HF-1-design-agent-showcase-discipline.story.md).

- **Contrast** — For new fill-backed panels, query `get_contrast_check(fill, textColor)` and iterate until ≥4.5:1. Never copy `on_surface` onto a non-surface fill — it's calibrated for `surface` only.
- **Nesting** — Supplementary frames MUST nest in the showcase root: pass `parentId: <rootFrameId>` from `create_ds_showcase`, or call `append_child`. Never sibling at canvas root. If `create_frame` returns a `warning`, confirm nesting or explicitly acknowledge sibling intent.

## Design Intelligence (`figmento-mcp-server/knowledge/`)

Consult these on every design task:

| File | Purpose |
|------|---------|
| `size-presets.yaml` | Dimensions for social/print/presentation/web |
| `typography.yaml` | Type scales, pairings, line heights, weights |
| `color-system.yaml` | Mood palettes, WCAG contrast, safe combos |
| `layout.yaml` | 8px grid, spacing, margins, safe zones |
| `brand-kit-schema.yaml` | Brand kit format (Café Noir example) |
| `print-design.yaml` | Brochure/folder patterns, print typography |

## Workflows

**Standard:** `connect_to_figma` (skip if connected) → `get_design_guidance(aspect="size")` (skip if format known) → `generate_design_image(brief, format, mood)` returns `{frameId, imageNodeId, textZone}` (the first creative decision) → `set_fill` 2-stop gradient overlay if contrast needs help (color-matched, solid end behind text) → `batch_execute` headline + subheadline + CTA inside `textZone` → `run_refinement_check` → done. Most designs start at step 3.

**Blueprint-First (preferred when blueprint exists):** `get_layout_blueprint(category, mood?)` → use proportional zones (`y_start_pct × height` or `resolved_example`) → fill per `elements`+`typography_hierarchy` → apply `anti_generic` rules → add `memorable_element` → refinement + self-eval.

**Figma-Native (Variables + Styles):** `read_figma_context()` after connecting. If variables exist → `bind_variable` for colors/spacing/radius. If styles exist → `apply_style(styleType="paint"|"text")`. Empty file → `create_variables_from_design_system` first. NEVER hardcode hex if a variable exists; NEVER set font/size manually if a text style exists.

**Reference-First:** `find_design_references(category, mood?, industry?)` → study `notable` + `composition_notes` → `get_layout_blueprint` matching the reference's layout → adapt zones/whitespace/hierarchy with the brief's content. If `list_reference_categories` returns 0, skip to `get_layout_blueprint`.

## Design Rules Lookup

`get_design_rules(aspect)` returns details. Aspects: `typography`, `layout`, `print`, `color`, `gradients`, `taste`, `refinement`, `evaluation`, `anti-patterns`.

**Hard constants** — 8px grid: `4|8|12|16|20|24|32|40|48|64|80|96|128`. Contrast: 4.5:1 normal, 3:1 large. **Font consistency:** if a font is named in the brief, use ONLY that font everywhere — verify `fontFamily` before every `create_text`. **Print:** auto-layout exclusively, never absolute x/y on print pages.

## Common Patterns

**Ad / Hero / Banner** — Nested auto-layout, never flat absolute. Root (NONE, exact dims) contains: background rect (solid), hero-image rect (IMAGE fill, top ~64%), 2-stop gradient overlay, logo + badge frames (absolute corners), and a `content` frame (VERTICAL auto-layout, padding 96/64, itemSpacing 40) containing text-group (headline/subheadline/price, itemSpacing 32) and cta-group (button HORIZONTAL pad 20/96 + note, itemSpacing 32). Never position text manually inside the content area.

**Button** — `create_frame` HORIZONTAL auto-layout, padding 12–16/24–32, `cornerRadius` 8–24, fill, then `create_text` child with `layoutSizingHorizontal: "FILL"`. Never separate rect+text.

**Badge/pill/chip** — Same as button, smaller. `cornerRadius = height/2`, padding 4–8/12–16, font 12–14px.

**Icons** — `create_icon` places Lucide by name (1900+ bundled, paths auto-loaded). Browse via `list_resources(type="icons")`. For `feature_grid` patterns, call `create_icon` per card using returned Icon Container nodeIds as `parentId` and match icon to title (Performance→`zap`, Security→`shield`, Analytics→`bar-chart`).

**Batch execution (highest-impact)** — For 3+ elements, prefer `batch_execute` with `tempId` refs: `{action:"create_frame", params:{name:"Card",...}, tempId:"card"}` then `{action:"create_text", params:{parentId:"$card",...}}`. Max 50 commands. Failed commands don't abort the batch.

**Canvas spacing** — Multiple top-level designs: offset each new design 200px right of the previous frame's right edge. Use `get_page_nodes` to locate.

**Repeated elements** — `clone_with_overrides` for menu rows, card grids, feature lists, speaker cards (positional offsets + named child overrides in one call).

**AI images** — `place_generated_image(filePath)` from mcp-image output. NEVER read images into base64 or pipe through bash — too large for the parameter system; the tool reads server-side. `scaleMode`: `FILL` (default) / `FIT` / `CROP` / `TILE`. To replace a node's background: `set_image_fill(nodeId, filePath, scaleMode?)`. To generate-and-fill in one call: `generate_design_image(..., asFill=true)`.

**Image generation rules** — Be specific in prompts ("woman in navy blazer, studio lighting, neutral background"), match dimensions to target frame, fall back to `fetch_placeholder_image` if mcp-image fails, never leave colored rectangles as final, budget 3–4 generated images per session.

**Contextual fill** — `fill_contextual_images()` for filling multiple frames/cards. Triggers: "fill images for this section", "add images to these cards", "preencha com imagens". Vision AI analyzes the page → finds empty image slots (no IMAGE fill, no text children, ≥80px) → builds prompts from nearby text → places sequentially (3–5s/image, max 6/call). Variants: `targetNodeIds=[...]`, `context="..."`, `skipAnalysis=true`. Page context cached 30 min.

**Multi-section bg composition** — Plan the sequence first: bold open → breathe → breathe → bold break → breathe → bold close (primary → surface → background → primary → surface → primary). Never the same bg on 3+ consecutive sections. `create_from_template` with `composition_mode:"connected"` enforces this via `knowledge/patterns/composition-rules.yaml`.

## Self-Evaluation & Refinement

`get_design_rules('refinement')` — 7-step beauty pass, mandatory after every design. `get_design_rules('evaluation')` — 16-point checklist (items 1, 2, 5, 6, 14, 15, 16 are auto-checked in `evaluation.issues`; manually review the other 9: hierarchy, whitespace, balance, intent, typography polish, shadow quality, memorable element, refinement applied, reference consulted). `batch_execute`/`create_design` auto-return score+screenshot for 5+ elements; if `evaluation.score < 70`, fix `evaluation.issues` before reporting done. `autoEvaluate: false` skips for intermediate batches.

## HTML-to-Figma (Print/Brochure)

1. Read brief + assets · 2. Generate self-contained HTML per page (inline CSS, base64 assets, Google Fonts, exact target dims) · 3. `node scripts/render-html.js input.html output.png` (A4 = 2480×3508, Puppeteer) · 4. `create_image` to place in Figma · 5. Each page = separate side-by-side frame. Output to `temp/designs/[project-name]/`.

---

## Design Taste Rules (Creative Mode)

When no brand system is specified or the user gives latitude.

1. **Commit to a direction** — pick ONE before any tool call: editorial / brutalist / organic / luxury / geometric / playful. Never start neutral.
2. **Typography first** — Never default to Inter/Inter; match the brief to a pairing. If a font is named, use ONLY that font.
3. **Color commitment** — Three valid dark-side options: near-black hero (`#0A0A0F`/`#0F0E11` + champagne/gold/cream accent), full primary fill (white text on brand color), or gradient hero (`primary_dark`→`primary` or `primary`→`secondary`). Forbidden: light grey bg + timid blue accent (the generic AI look).
4. **Background depth** — Never flat solid on hero/full-page. Use a dark-to-slightly-less-dark gradient, a subtle radial glow (primary at 8–12% over near-black), or a full-bleed `primary_dark`→`primary`.
4b. **Gradient overlays** — Solid end = where text sits; transparent end = where image shows. 2 stops only. Gradient color MUST match the section bg — never black on light sections.
5. **Spatial generosity** — Increase all padding by 1.5× what feels enough. When a value feels right, go one step larger.
6. **Never converge** — Every brief produces a visually distinct output. Diverge from the last design.
7. **Self-evaluate ruthlessly** — After `get_screenshot`: *senior designer or bot?* If bot, fix the most generic element first.
8. **One memorable thing** — Every design needs ONE unforgettable element: 120px+ display headline, unexpected color treatment, grid-breaking editorial element, or full-bleed image with text over it.

## Anti-Patterns (Hard Stops)

`get_design_rules('anti-patterns')` for the full list. Critical:
- `fontWeight: 600` on non-Inter fonts silently falls back to Inter — use 400 or 700 only.
- Content frames with fixed height clip text — use `layoutSizingVertical: 'HUG'`.
- Gradient solid end facing away from text — most common AI mistake; solid must be behind text.
- Absolute positioning on print pages — every print frame uses auto-layout.

## Mandatory Brief Analysis

Before any creative tool call, answer these in your response so the user sees your thinking:

```
DESIGN BRIEF ANALYSIS
Figma context        : [N variables, M paint styles, K text styles] or [empty — will create]
Reference match      : [ref-id — "notable element"] or [no references]
Layout blueprint     : [name] or [custom — no match]
Aesthetic direction  : [editorial / brutalist / organic / luxury / geometric / playful]
Font pairing         : [heading] + [body] — reason: [...]
Color story          : [dark / light / colorful / monochrome] — dominant: [hex]
Memorable element    : [the ONE thing]
Generic trap avoided : [bot version vs what you're doing instead]
```

---

## Design System Workflow

**Starting any design** — Ask what brand. `get_design_system(name)`. If none, offer one of: (a) DESIGN.md upload → `import_design_system_from_md({path, previewInFigma:true, createVariables:true, overwrite:false})` (creates tokens.yaml + preview + Figma Variables in one shot — see [docs/guides/design-md-authoring.md](./docs/guides/design-md-authoring.md)); (b) PDF brief → `analyze_brief` → `create_design_system`; (c) URL → `generate_design_system_from_url`; (d) fallback `create_design_system(color+font, mood, preset)`. Then `get_format_rules(format)`. Use `create_component` for buttons/badges/cards — never build manually. All values from tokens — never hardcode when a system is loaded.

**DESIGN.md** — Portable markdown spec, round-trips 1:1 with `tokens.yaml` across 9 sections. Spec: [docs/architecture/DESIGN-MD-SPEC.md](./docs/architecture/DESIGN-MD-SPEC.md).
- `validate_design_md({path})` — PASS/CONCERNS/FAIL lint
- `import_design_system_from_md({path, name?, previewInFigma?, createVariables?, overwrite?})`
- `export_design_system_to_md({name, path?})` — share with Cursor/Claude Desktop/Cline

**Format awareness** — `get_format_rules` before starting · respect safe zones · scales differ (web ≠ print ≠ social) · print: bleed + min font sizes + CMYK · social: must read at 375px display width.

**Template-based** ("use this as a template") — `scan_frame_structure` → `clone_with_overrides` → modify text/colors/images, preserve layout. The user's layout decisions are sacred.

**Token discipline** — Every color/font/spacing from the system. Need a value not in the system? Ask or explain the deviation.

**Component usage** — Buttons/badges/cards: ALWAYS `create_component`. No matching component? `batch_execute` with token values.

**Hidden tools (callable via `batch_execute`)** — 54 tools hidden from the visible list (109 → 55) for selection accuracy, still callable as `batch_execute` action names. Categories: scene-advanced (boolean ops, flatten, export-svg, constraints), intelligence-redundant (font pairing, contrast, palette gen), DS-pipeline internals, interactive components, brand/assets/storage, specialized flows (ad analyzer, references), low-usage utilities.

---

## Project Map

- **figmento-mcp-server/** — MCP server (stdio) — design tools for agents to control Figma
- **figmento/** — Figma plugin — WebSocket-driven MCP design executor with AI vision
- **figmento-ws-relay/** — Channel-based WebSocket relay (port 3055)
- **packages/figmento-core/** — Shared types/utilities
- **scripts/** — Utility scripts (HTML-to-PNG renderer)
- **docs/** — Documentation, stories, architecture

## Quality Gates

`npm run lint` · `npm run typecheck` · `npm test` (in subprojects that support each) · `npm run build` in the subproject you touched.

---
*Figmento Universal Agent Configuration — kept in sync with .claude/CLAUDE.md*
