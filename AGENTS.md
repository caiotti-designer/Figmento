# AGENTS.md - Synkra AIOS (Codex CLI)

This file defines project instructions for the Codex CLI.

<!-- AIOS-MANAGED-START: core -->
## Core Rules

1. Follow the Constitution in `.aios-core/constitution.md`
2. Prioritize `CLI First -> Observability Second -> UI Third`
3. Work from stories in `docs/stories/`
4. Do not invent requirements outside existing artifacts
<!-- AIOS-MANAGED-END: core -->

<!-- AIOS-MANAGED-START: quality -->
## Quality Gates

- Run `npm run lint` (in subprojects that support it)
- Run `npm run typecheck` (in subprojects that support it)
- Run `npm test` (in subprojects that support it)
- Update checklist and file list in the story before completing
<!-- AIOS-MANAGED-END: quality -->

<!-- AIOS-MANAGED-START: codebase -->
## Project Map

- **figmento-mcp-server/**: MCP server (stdio transport) — design tools for Claude Code to control Figma
- **figmento-plugin/**: Figma plugin v2 — WebSocket-driven MCP design executor
- **figmento-ws-relay/**: Channel-based WebSocket relay server (port 3055)
- **figmento/**: Figma plugin v1 — standalone screenshot-to-design using AI vision
- **scripts/**: Utility scripts (HTML-to-PNG renderer)
- **docs/**: Documentation, stories, architecture
- **.aios-core/**: AIOS framework (agents, tasks, workflows)
<!-- AIOS-MANAGED-END: codebase -->

<!-- AIOS-MANAGED-START: commands -->
## Common Commands

```bash
# Build all subprojects
cd figmento-mcp-server && npm run build
cd figmento-plugin && npm run build
cd figmento-ws-relay && npm run build
cd figmento && npm run build

# Development
cd figmento-plugin && npm run watch
cd figmento && npm run watch

# Render HTML to PNG (for print designs)
node scripts/render-html.js <input.html> <output.png>
```
<!-- AIOS-MANAGED-END: commands -->

<!-- AIOS-MANAGED-START: shortcuts -->
## Agent Shortcuts

Preference for activation in Codex CLI:
1. Use `/skills` and select `aios-<agent-id>` from `.codex/skills` (e.g., `aios-architect`)
2. Or use the shortcuts below (`@architect`, `/architect`, etc.)

Interpret the shortcuts below by loading the corresponding file in `.aios-core/development/agents/` (fallback: `.codex/agents/`), render the greeting via `generate-greeting.js` and assume the persona until `*exit`:

- `@architect`, `/architect` -> `.aios-core/development/agents/architect.md`
- `@dev`, `/dev` -> `.aios-core/development/agents/dev.md`
- `@qa`, `/qa` -> `.aios-core/development/agents/qa.md`
- `@pm`, `/pm` -> `.aios-core/development/agents/pm.md`
- `@po`, `/po` -> `.aios-core/development/agents/po.md`
- `@sm`, `/sm` -> `.aios-core/development/agents/sm.md`
- `@analyst`, `/analyst` -> `.aios-core/development/agents/analyst.md`
- `@devops`, `/devops` -> `.aios-core/development/agents/devops.md`
- `@data-engineer`, `/data-engineer` -> `.aios-core/development/agents/data-engineer.md`
- `@ux-design-expert`, `/ux-design-expert` -> `.aios-core/development/agents/ux-design-expert.md`
- `@squad-creator`, `/squad-creator` -> `.aios-core/development/agents/squad-creator.md`
- `@aios-master`, `/aios-master` -> `.aios-core/development/agents/aios-master.md`
<!-- AIOS-MANAGED-END: shortcuts -->
