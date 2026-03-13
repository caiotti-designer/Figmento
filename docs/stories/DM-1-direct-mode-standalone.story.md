# DM-1 — Direct Mode Standalone (No Relay, No WebSocket, No Railway)

## Status: Ready

## Story
**As a** Figmento user,
**I want** the plugin to work completely standalone, without any relay server, WebSocket, or Railway connection,
**so that** I can open the plugin and start designing immediately with just an API key — no infrastructure setup required.

## Background

Currently the plugin defaults to `chatRelayEnabled: true`, which makes it attempt a WebSocket connection to Railway on every startup. When the relay is unavailable, it "falls back" to direct mode — but the UX communicates failure (red status indicators, reconnect prompts).

The plugin already has a fully working direct mode (`runDirectLoop()` in `chat.ts`) that calls `api.anthropic.com` directly from the iframe using `anthropic-dangerous-direct-browser-access: true`. All tool calls route through `sendCommandToSandbox()` via postMessage to the plugin sandbox, which executes `figma.*` commands.

This story flips the default: **direct mode is the primary experience**. Relay becomes an opt-in power feature.

## Target Architecture

```
Plugin UI (iframe)
  ↓ fetch()
api.anthropic.com  (with anthropic-dangerous-direct-browser-access header)
  ↓ tool_calls in response
Plugin UI
  ↓ postMessage
Plugin Sandbox (code.ts)
  ↓ figma.*
Figma Canvas
```

No relay. No WebSocket. No Railway. Just the plugin and the API.

## Scope

### IN
- [ ] Flip default: `chatRelayEnabled: false` out of the box
- [ ] Remove relay status indicators from main chat UI (connected/disconnected/fallback badges)
- [ ] Move relay settings to an "Advanced" section, collapsed by default
- [ ] Validate all design tools work via direct postMessage sandbox bridge (no relay dependency)
- [ ] Ensure `system-prompt.ts` is fully self-contained (no relay knowledge deps)
- [ ] Ensure `tools-schema.ts` exposes all tools for direct mode
- [ ] Clean up: remove relay-dependent code paths from the primary `sendMessage()` flow
- [ ] Settings panel: show API key field prominently as step 1 onboarding
- [ ] Add "Get API Key" button that opens `https://console.anthropic.com/settings/keys` via `figma.openExternal()`

### OUT
- Removing relay code entirely (relay stays as advanced opt-in)
- OAuth (that's DM-2)
- Claude Code subprocess mode (requires local relay — stays as advanced feature)
- Image generation via Gemini (keep working as-is, separate concern)

## Acceptance Criteria

```
Given the plugin is freshly installed (no prior settings)
When the user opens it and enters an API key
Then the plugin works immediately — no relay connection attempted, no WebSocket errors

Given the user is in direct mode
When Claude returns a tool call (e.g. create_frame, set_fill, get_selection)
Then the tool executes correctly via postMessage → sandbox bridge
And the result is returned to Claude to continue the conversation

Given the user is in direct mode
When Claude returns a design tool call AND a local tool call (e.g. get_palette)
Then local tools are resolved client-side in the UI (no relay needed)
And design tools are routed via sandbox bridge

Given the user opens Settings
Then they see the API key field prominently (step 1)
And "Relay / Advanced" is collapsed at the bottom
And there is a "Get API Key →" link that opens console.anthropic.com
```

## Technical Notes

### Files to change

| File | Change |
|------|--------|
| `figmento/src/ui/chat.ts` | Flip relay default, clean up status indicators in sendMessage() |
| `figmento/src/ui/settings.ts` | Reorder: API key first, relay section collapsed |
| `figmento/src/ui.html` | Update settings UI layout |
| `figmento/src/ui/system-prompt.ts` | Verify no relay deps (currently looks standalone ✅) |
| `figmento/src/ui/tools-schema.ts` | Verify all tools listed for direct mode |

### Local tools (no relay needed)
These already resolve client-side in `system-prompt.ts` or `chat.ts`:
- `get_palette`, `get_fonts`, `get_blueprint`, `update_memory`, `analyze_canvas_context`, `generate_image`

### Sandbox bridge tools (postMessage, no relay needed)
All `figma.*` commands: `create_frame`, `set_fill`, `create_text`, `get_selection`, `get_page_nodes`, `delete_node`, `resize_node`, `move_node`, etc.

### What still needs relay
- Claude Code mode (`model === 'claude-code'`) — subprocess, local only, not affected
- Multi-user channel sync — out of scope

## File List
_Updated as implementation progresses_

- [ ] `figmento/src/ui/chat.ts`
- [ ] `figmento/src/ui/settings.ts`
- [ ] `figmento/src/ui.html`

## Definition of Done
- [ ] Fresh plugin install: no relay connection attempted on startup
- [ ] All design tools tested and working via direct postMessage bridge
- [ ] Settings panel reorganized: API key is step 1, relay is collapsed
- [ ] No red "disconnected" indicators visible in normal direct mode use
- [ ] Existing relay mode still works when user explicitly enables it
