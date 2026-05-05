# AGENTS.md - Figmento Project Rules

Canonical instructions for Codex and other non-Claude agents. Claude Code reads `.claude/CLAUDE.md`, which imports this file. Keep this file concise enough to follow, but complete enough that a fresh local agent can work without rediscovering the project.

Caio is a designer who vibecodes. Keep answers practical, concrete, and oriented toward getting Figmento working.

---

## Coding Behavior

1. **Think before coding** - State assumptions when they matter. If the request is ambiguous enough that a reasonable implementation would be risky, ask.
2. **Simplicity first** - Make the minimum change that solves the actual problem. Do not add speculative flexibility.
3. **Surgical changes** - Touch only what the task requires. Mention unrelated dead code or drift, but do not clean it up in the same pass unless asked.
4. **Goal-driven execution** - Define what success looks like, then verify it with the smallest meaningful checks.

## Story Files

- Work from `docs/stories/` for non-trivial product changes.
- Small fixes and audits may proceed directly when a story would be overhead.
- Archive Done stories to `docs/stories/_archived/`.
- Update `docs/stories/STATUS.md` when story state, build state, or known blockers change.

## Quality Gates

Run the gates that apply to the subproject you touched:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

If global `npm` is broken on the machine, use local binaries through `node_modules/.bin` and report the workaround. On Windows, prefer:

```powershell
cmd /c node_modules\.bin\tsc.cmd --noEmit
cmd /c node_modules\.bin\jest.cmd --runInBand
cmd /c node_modules\.bin\biome.cmd lint
cmd /c node_modules\.bin\plugma.cmd build --mode production
```

For prebuild scripts that use `tsx`:

```powershell
cmd /c node_modules\.bin\tsx.cmd ..\scripts\generate-tool-schemas.ts
cmd /c node_modules\.bin\tsx.cmd scripts\compile-knowledge.ts
```

## Git Conventions

- Use conventional commits when committing: `feat:`, `fix:`, `chore:`, `docs:`, `security:`, `refactor:`.
- Keep commits atomic.
- `@devops` owns `git push` and PR creation. Do not push unless explicitly operating as `@devops` or the user asks.
- Never revert user changes unless explicitly requested.

## Tool Selection

- Prefer fast code search (`rg`) and file reads before assumptions.
- Prefer patch-style edits over full-file rewrites.
- Shell is for commands and verification, not for ad hoc destructive operations.
- MCP usage rules live in `.claude/rules/mcp-usage.md`.

## Project Map

- `figmento-mcp-server/` - MCP server over stdio. Exposes Figmento tools to Claude Code, Codex, and other MCP clients.
- `figmento/` - Current Figma plugin. Plugma/Vite UI, Figma sandbox, WebSocket bridge, chat, AI vision, and canvas command executor.
- `figmento-ws-relay/` - Local/cloud WebSocket relay on port 3055, plus local Claude Code and Codex agent sessions.
- `packages/figmento-core/` - Shared types and utilities.
- `scripts/` - Utility scripts, schema generation, HTML-to-PNG renderer, pm2 setup.
- `docs/` - Architecture, QA notes, PRDs, audits, and stories.
- `skills/` - Extracted Figmento skills for direct Figma MCP workflows.

## Common Commands

```bash
# Build all subprojects
cd figmento-mcp-server && npm run build
cd ../figmento && npm run build
cd ../figmento-ws-relay && npm run build

# Development
cd figmento && npm run watch
cd figmento-ws-relay && npm run dev

# Render HTML to PNG
node scripts/render-html.js <input.html> <output.png>
```

## Local Runtime Notes

- `figmento-ws-relay` is expected to run permanently via pm2 on port 3055 and auto-start on Windows login.
- Fresh setup: `powershell -ExecutionPolicy Bypass -File scripts\setup-pm2.ps1`.
- Daily workflow: usually do nothing; open Figma, open the Figmento plugin, and the bridge should connect.
- Useful relay commands: `pm2 status`, `pm2 restart figmento-relay`, `pm2 logs figmento-relay`, `pm2 stop figmento-relay`.
- Full relay reset: `pm2 kill && cd figmento-ws-relay && pm2 start dist/index.js --name figmento-relay && pm2 save`.

## Agent Personas

Lightweight role hints, not a workflow engine:

- `@architect` - architecture and build-shape thinking
- `@dev` - implementation discipline
- `@qa` - edge cases, failure modes, verification
- `@devops` - git push, PR, deploy gates

For product/design/cleanup/agent-building, use the Jarvis squad role hints (`@helm`, `@muse`, `@pixel`, `@atlas`, `@mason`, etc.) if the user invokes them.

---

# Figmento Design Agent Rules

These rules apply when an agent is driving Figma through Figmento tools.

## Core Principles

- **AUTONOMY** - Execute all steps in one continuous flow. No mid-task approvals unless a real external blocker exists.
- **NO EXPORT** - Never call `export_node` at the end; the user exports manually. Export only for explicit preview/self-evaluation requests.
- **SINGLE FRAME** - Exactly one root frame per design. Fix failures on the existing frame; do not spawn duplicate repair frames.
- **CLEANUP** - On mid-design failure, use `get_page_nodes` and `delete_node` to clear orphans before continuing.
- **CONNECT FIRST** - Call `connect_to_figma` if not already connected.
- **BATCH WORK** - Use `batch_execute` for 3+ related canvas operations.
- **NAMING** - Use descriptive root and child names. Never leave default `Rectangle` or `Text` names.

## Design Intelligence

Consult the MCP knowledge base for design tasks:

| File | Purpose |
| --- | --- |
| `figmento-mcp-server/knowledge/size-presets.yaml` | Dimensions for social, print, presentation, and web |
| `figmento-mcp-server/knowledge/typography.yaml` | Type scales, font pairings, line heights, weights |
| `figmento-mcp-server/knowledge/color-system.yaml` | Mood palettes, WCAG contrast, safe combinations |
| `figmento-mcp-server/knowledge/layout.yaml` | 8px grid, spacing, margins, safe zones |
| `figmento-mcp-server/knowledge/brand-kit-schema.yaml` | Brand kit format |
| `figmento-mcp-server/knowledge/print-design.yaml` | Brochure/folder patterns and print typography |

## Design Workflow

**Standard:** `connect_to_figma` (skip if connected) -> `get_design_guidance(aspect="size")` when format is unknown -> `generate_design_image(brief, format, mood)` when imagery is needed -> `batch_execute` for structure/text/components -> `run_refinement_check` -> `get_screenshot` for visual critique -> fix real structural issues -> concise completion.

**Blueprint-first:** `get_layout_blueprint(category, mood?)` -> use proportional zones -> fill content using the returned hierarchy -> add one memorable element -> refinement and visual check.

**Figma-native:** `read_figma_context()` after connecting. If variables or styles exist, use `bind_variable`, `apply_paint_style`, `apply_text_style`, and `apply_effect_style` instead of hardcoding values.

**Reference-first:** `find_design_references(category, mood?, industry?)` -> study notable composition notes -> adapt with `get_layout_blueprint`. If there are no references, continue with blueprint-first.

## Hard Design Constants

- 8px grid: `4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128`.
- Contrast: 4.5:1 for normal text, 3:1 for large text.
- If a font is named in the brief, use only that font family unless the user asks for a pairing.
- Use font weights 400 or 700. Avoid 600 because Figma can fall back to Inter on non-Inter fonts.
- Print pages use auto-layout; avoid absolute x/y on print deliverables.
- Content frames with dynamic text use `layoutSizingVertical: "HUG"`.

## Common Patterns

- **Button/badge/pill:** `create_frame` with horizontal auto-layout, padding, fill, radius, then `create_text` inside. Do not build as separate rectangle plus loose text.
- **Ad/hero/banner:** root frame, background/image fill, two-stop gradient overlay with solid end behind text, content frame with vertical auto-layout, CTA group. Avoid flat absolute positioning.
- **Icons:** use `create_icon` for Lucide icons. Do not use primitive circles/rectangles as icon stand-ins except avatar image placeholders.
- **Repeated elements:** prefer `clone_with_overrides` for rows, cards, feature lists, and speaker cards.
- **Images:** use `set_image_fill` to replace a node background. Use `place_generated_image(filePath)` only when a separate child image node is intended.

## Self-Evaluation

Before declaring any multi-element design done:

1. Call `run_refinement_check(rootFrameId)`.
2. Fix structural warnings: `boundary-overflow`, `canvas-orphan`, `interactive-text-no-background`, `interactive-text-low-contrast`, `auto-layout-coverage`, `empty-placeholder`.
3. Call `get_page_nodes()` and ensure there is exactly one intentional root design frame.
4. Call `get_screenshot(nodeId=rootFrameId)` and critique it for text shrapnel, wrong auto-layout direction, overflow, overlap, bare CTAs, missing imagery, and orphaned elements.
5. Execute one atomic fix batch for real issues. Do not end with future-tense promises to fix something.

## Design System Workflow

For brand/design-system requests:

1. Treat a brand brief with name, mood, colors, fonts, and industry but no explicit deliverable as a design-system request, not an Instagram post.
2. Call `list_skills()` and load the design-system skill if present.
3. Use `analyze_brief` and `generate_design_system_in_figma` for the one-click pipeline.
4. Use `import_design_system_from_md` when the user provides a `DESIGN.md`.
5. After `generate_design_system_in_figma` or `create_ds_showcase`, supplementary frames must be nested in the showcase root via `parentId`.

## Completion Style

- Keep final responses short and factual.
- Summarize what was changed or created, what was verified, and any remaining known limitation.
- If something could not be run, say exactly why.
