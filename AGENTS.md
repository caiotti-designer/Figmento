# AGENTS.md — Figmento

This file defines project instructions for CLI tools (Codex, Claude Code).

## Core Rules

1. Caio is a designer who vibecodes — keep answers practical, not theoretical
2. Work from stories in `docs/stories/` when non-trivial (optional for small fixes)
3. Don't invent requirements — stick to what the story or user asks for
4. Archive Done stories to `docs/stories/_archived/`

## Quality Gates

- Run `npm run lint` (in subprojects that support it)
- Run `npm run typecheck` (in subprojects that support it)
- Run `npm test` (in subprojects that support it)
- Verify build: `npm run build` in the subproject you touched

## Project Map

- **figmento-mcp-server/** — MCP server (stdio transport) — design tools for Claude Code to control Figma
- **figmento/** — Figma plugin — WebSocket-driven MCP design executor with AI vision
- **figmento-ws-relay/** — Channel-based WebSocket relay server (port 3055)
- **packages/figmento-core/** — Shared types and utilities (re-exported by figmento/src/ shims)
- **scripts/** — Utility scripts (HTML-to-PNG renderer)
- **docs/** — Documentation, stories, architecture

## Common Commands

```bash
# Build all subprojects
cd figmento-mcp-server && npm run build
cd figmento && npm run build
cd figmento-ws-relay && npm run build

# Development
cd figmento && npm run watch
cd figmento-ws-relay && npm run dev

# Render HTML to PNG (for print designs)
node scripts/render-html.js <input.html> <output.png>
```

## Agent Personas

Lightweight dev-thinking modes (slash commands — just persona prompts, no workflow engine):

- `@architect` — "how should this be built?" thinking
- `@dev` — implementation discipline
- `@qa` — edge cases, what could break
- `@devops` — git push, PR, deploy gates (exclusive owner of `git push`/`gh pr`)

For product/design/cleanup/agent-building, use the Jarvis squad (`@helm`, `@muse`, `@pixel`, `@atlas`, `@mason`, etc.) — see user-level agent defs.
