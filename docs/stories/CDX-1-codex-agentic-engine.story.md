# CDX-1 — Codex CLI agentic engine alongside Claude Code

## Status: Done — shipped 2026-04-28

> Commits: `51ac77a refactor(mcp): split z.union schemas + add gpt-image-2 placeholder` · `0e2886b feat(figmento): codex engine + HTML import V1 + cleanup discipline`

## Story
**As a** Figmento user with a ChatGPT Plus/Pro subscription (and the Codex CLI installed),
**I want** to drive Figmento with the Codex agent in addition to Claude Code,
**so that** I can A/B compare design quality between the two engines on the same prompt, and have a working backup if my Claude OAuth token breaks.

## Background

Before CDX-1, Figmento's "agentic" path (long-running session, MCP server child, full design tool surface, design discipline prompt) was **Claude Code only** via `@anthropic-ai/claude-agent-sdk`. There was a legacy in-process Codex provider in `chat-engine.ts` (HTTP `/chat/turn` to ChatGPT's backend `/codex/responses`), but it used a **different, smaller tool surface** (`chat-tools.ts` ~70 tools instead of the 109 figmento MCP tools) and a **different system prompt** (`buildSystemPrompt` only, missing the 300-line `FIGMENTO_DESIGN_PROMPT` design discipline).

Switching engines mid-session was impossible. Tool/instruction parity wasn't a goal of the legacy path.

CDX-1 brings Codex up to full parity: same MCP toolset, same design rules, same lifecycle semantics, same wire format. The user picks Codex from the model dropdown and it Just Works.

## Acceptance Criteria

| # | AC | Status |
|---|---|---|
| 1 | New Codex models (`gpt-5.5-codex`, `gpt-5.5`) appear in the plugin model dropdown under "Codex (ChatGPT Subscription)". | ✅ |
| 2 | Selecting a Codex model and sending a turn routes through the WS `claude-code-turn` path with `engine: 'codex'`, NOT through the legacy HTTP `/chat/turn`. | ✅ |
| 3 | The Codex session manager spawns the figmento MCP server as a child process and exposes the same ~55 curated tools that Claude Code sees (FIGMENTO_DISABLED_TOOLS list shared). | ✅ |
| 4 | The Codex agent reads the full `FIGMENTO_DESIGN_PROMPT` design rules at session start (delivered via auto-loaded `AGENTS.md` in the workspace dir). Same content Claude Code receives via `systemPrompt`. | ✅ |
| 5 | Reasoning effort is at the SDK maximum (`modelReasoningEffort: 'high'`) by default, configurable via `FIGMENTO_CODEX_REASONING_EFFORT` env. | ✅ |
| 6 | Switching engines mid-conversation (Claude Code → Codex or vice versa) destroys the prior engine's session for that channel and boots fresh — history travels in the request payload, so the user sees no discontinuity. | ✅ |
| 7 | Globally registered MCP servers in `~/.codex/config.toml` (figma, pencil, MCP_DOCKER) are disabled per-session via overrides so the agent only sees figmento tools. | ✅ |
| 8 | OAuth token rotation: the credentials watcher polls both `~/.claude/.credentials.json` AND `~/.codex/auth.json`. Relay exits on rotation, PM2 respawns with fresh creds. | ✅ |
| 9 | No console window flicker on Windows when the Codex CLI subprocess (or its MCP server child) spawns. | ✅ |
| 10 | The Codex turn lifecycle has the same TOOL_BUDGETS, stale detection, idle teardown, and per-turn timeout as Claude Code (constants shared via `agent-session-manager.ts`). | ✅ |
| 11 | Legacy in-process Codex provider survives behind a feature flag (`chatSettings.legacyCodexProvider`, default false) — not deleted yet, ready to remove in a follow-up. | ✅ |
| 12 | Codex CLI's Rust→OpenAI tool converter accepts every figmento tool schema. (Earlier `z.union` patterns in `cornerRadius` / `radius` were rejected; refactored to split scalar+array fields in CDX-1's sibling commit.) | ✅ |

## Architecture

```
┌────────────────────── figmento-ws-relay ──────────────────────┐
│                                                               │
│  agent-session-manager.ts (interface + shared constants)      │
│    │                                                          │
│    ├─ ClaudeCodeSessionManager (engine: claude-code)          │
│    │     @anthropic-ai/claude-agent-sdk                       │
│    │     systemPrompt = FIGMENTO_DESIGN_PROMPT                │
│    │     thinking: { budgetTokens: 12288 }                    │
│    │                                                          │
│    └─ CodexSessionManager (engine: codex)                     │
│          @openai/codex-sdk (dynamic ESM import)               │
│          AGENTS.md = FIGMENTO_DESIGN_PROMPT                   │
│          modelReasoningEffort: 'high'                         │
│                                                               │
│  Shared:                                                      │
│    figmento-design-prompt.ts  (300-line design rules)         │
│    FIGMENTO_DISABLED_TOOLS    (109 → 55 surface)              │
│    TOOL_BUDGETS, STALE/IDLE/THINKING timeouts                 │
│                                                               │
│  Boot patches:                                                │
│    windows-spawn-hide.ts → child_process.spawn windowsHide:T  │
│    credentials-watcher.ts → polls Claude + Codex auth files   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
                          │
                          ▼ stdio MCP
                figmento-mcp-server
                (one binary, both engines)
                  ↳ tools/image-gen.ts:
                    if model startsWith 'gpt-image-' → OpenAI Platform API
                    else if model startsWith 'grok-' → Venice
                    else → Gemini (nano-banana, default)
```

## Key files

**New:**
- `figmento-ws-relay/src/chat/agent-session-manager.ts` — interface, lifecycle constants, shared FIGMENTO_DISABLED_TOOLS
- `figmento-ws-relay/src/chat/codex-session-manager.ts` — Codex implementation
- `figmento-ws-relay/src/chat/figmento-design-prompt.ts` — shared design rules + `materializeDesignPromptWorkspace()` (writes AGENTS.md/CLAUDE.md)
- `figmento-ws-relay/src/windows-spawn-hide.ts` — `child_process.spawn` monkey-patch for windowsHide

**Refactored:**
- `figmento-ws-relay/src/chat/claude-code-session-manager.ts` — implements `AgentSessionManager`, uses shared prompt
- `figmento-ws-relay/src/chat/claude-code-handler.ts` — engine dispatcher (claude-code | codex)
- `figmento-ws-relay/src/credentials-watcher.ts` — dual-auth polling
- `figmento/src/ui/chat.ts` — engine field on payload, dropdown wiring, mid-conv switch
- `figmento/src/ui.html` — added GPT-5.5 Codex / GPT-5.5 options
- `figmento-mcp-server/src/tools/canvas.ts` + `style.ts` — z.union → split-field schemas (commit `51ac77a`)
- `figmento-mcp-server/src/tools/image-gen.ts` — gpt-image-2 route (commit `51ac77a`)

## Trade-offs / known limitations

- **Codex sandbox:** uses `danger-full-access`. The `workspace-write` sandbox blocks the MCP server child's WS connection to `localhost:3055` even with `networkAccessEnabled: true` on Windows. Acceptable because the MCP server is fully ours, the relay is localhost-only, and `dangerously-bypass-approvals-and-sandbox` was the only Codex flag that didn't surface "cancelled by tool layer" failures.
- **Mid-conv switch is destructive:** the prior engine's session is destroyed (Codex Thread or Claude Agent query). History is preserved via the request payload and re-injected into the new session. There's a ~1-2s boot cost on the first turn after switch.
- **Image gen is nano-banana for both engines** by default. gpt-image-2 path is wired (image-gen.ts) but inactive until `OPENAI_API_KEY` is set in the relay `.env` (the Codex ChatGPT OAuth token does NOT unlock the Platform `/v1/images/generations` endpoint — separate billing required).
- **Design "taste" still differs.** The two engines now have full tool/instruction parity. Any remaining quality gap between Claude Sonnet 4.6 and GPT-5.5 outputs reflects model-level differences (training, post-tuning on design tasks), not configuration. Claude remains the recommended default for Figmento's primary use case.

## Follow-ups

- **CDX-2 (deferred):** drop the legacy in-process Codex provider entirely once we've confirmed nothing depends on it for ~2 weeks of usage.
- **CDX-3 (deferred):** simplify Codex sandbox back to `workspace-write` if a future Codex CLI release fixes the localhost-blocking bug.
- **HTML-2 (sibling story):** Pixel-perfect HTML import via Puppeteer computed-style extraction. Builds on the V1 directive-based approach shipped here.
