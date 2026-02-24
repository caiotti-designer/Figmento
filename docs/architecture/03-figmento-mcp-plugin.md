# Figmento MCP Plugin — `figmento-plugin/`

> Thin Figma plugin that receives commands from Claude Code via WebSocket relay. Executes Figma API calls and returns results.

## Identity

- **Manifest name:** "Figmento MCP"
- **Manifest ID:** `figmento-mcp-plugin`
- **UI size:** 380×600
- **Network domains:** `api.anthropic.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `generativelanguage.googleapis.com`
- **Dev domains:** `http://localhost:3055`, `ws://localhost:3055`

## Architecture

```
figmento-plugin/
├── src/
│   ├── code.ts              # Figma sandbox — command executor (721 lines)
│   ├── ui-app.ts            # UI iframe — WS bridge + Chat tabs (846 lines)
│   ├── types.ts             # Lean types — design schema + WS protocol (142 lines)
│   ├── element-creators.ts  # Shared: UIElement → SceneNode factory
│   ├── color-utils.ts       # Shared: hex/rgb, font style, contrast
│   ├── svg-utils.ts         # Shared: SVG path normalization
│   ├── tools-schema.ts      # Anthropic tool_use JSON schemas (421 lines)
│   └── system-prompt.ts     # LLM system prompt with design intelligence (341 lines)
├── manifest.json
├── package.json
├── build.js
└── tsconfig.json
```

## Dual Role: WS Bridge + In-Plugin Chat

The MCP plugin serves two purposes:
1. **Bridge mode:** Receives commands from MCP server via WS relay → executes in Figma sandbox → returns results
2. **Chat mode:** Direct AI chat (Anthropic/Gemini) with tool-use for design creation

### UI Tabs (ui-app.ts)

| Tab | Purpose |
|-----|---------|
| **Chat** | Anthropic API (tool_use loop, max 50 iterations) + Gemini API (function calling) |
| **Bridge** | WebSocket connection to relay, channel management, command/response routing |
| **Settings** | API keys stored in `figma.clientStorage` |

## Sandbox (code.ts) — Command Router

Entry point: `figma.ui.onmessage` handles `execute-command` messages.

```typescript
async function executeCommand(cmd: WSCommand): Promise<WSResponse>
```

### 21 Supported Actions

| Category | Actions |
|----------|---------|
| **Canvas Creation** | `create_frame`, `create_text`, `create_rectangle`, `create_ellipse`, `create_image` |
| **Style** | `set_fill`, `set_stroke`, `set_effects`, `set_corner_radius`, `set_opacity`, `set_auto_layout` |
| **Scene Management** | `get_selection`, `export_node`, `get_node_info`, `get_page_nodes`, `delete_node`, `move_node`, `resize_node`, `rename_node`, `append_child` |
| **Batch** | `create_design` |

Each action handler follows the pattern:
```typescript
case 'create_frame': return await handleCreateFrame(cmd.params);
// → uses Figma API, returns { success: true, data: { nodeId, name, ... } }
// → on error: returns { success: false, error: "message" }
```

### Key Handler Details

**`handleCreateText`** — Loads fonts with 5s timeout + Inter/Roboto fallback. Supports mixed-weight segments via `setRangeFontName/setRangeFontSize/setRangeFills`.

**`handleCreateImage`** — Strips base64 prefix, `figma.base64Decode()` → `figma.createImage()` → frame with IMAGE fill.

**`handleCreateDesign`** — Batch tool that takes full `UIAnalysis` JSON and creates entire design tree using `createElement()` from shared core.

**`handleExportNode`** — Exports as PNG/SVG/JPG via `node.exportAsync()`, returns base64 string.

**`handleSetAutoLayout`** — Configures frame as flexbox-like container (HORIZONTAL/VERTICAL/NONE).

## WS Bridge Flow (ui-app.ts)

```
1. User clicks "Connect" → WebSocket connects to ws://localhost:3055
2. Sends: { type: "join", channel: "figmento" }
3. Receives commands: { type: "command", id, channel, action, params }
4. Routes to sandbox: figma.ui.postMessage({ type: "execute-command", command })
5. Sandbox executes, returns: { type: "command-result", response }
6. UI sends response back through WS: { type: "response", id, channel, success, data }
```

### Chat Command Routing

Commands with IDs starting with `chat-` are routed to `pendingChatCommands` (for in-plugin AI chat) instead of the WS bridge. This allows both chat and bridge to use the same sandbox executor.

## Tools Schema (tools-schema.ts)

Defines 22 tools in Anthropic `tool_use` format (JSON Schema). Used by the in-plugin chat mode.

Mirrors MCP server tools but excludes `connect_to_figma`/`disconnect_from_figma` (not needed inside plugin). Adds `generate_image` (Gemini Imagen via in-plugin Gemini API).

### Shared Schema Objects

- `fillSchema` — { type: 'SOLID'|'GRADIENT_LINEAR', color, opacity, gradientStops }
- `cornerRadiusSchema` — oneOf: number | [n, n, n, n]

## System Prompt (system-prompt.ts)

`buildSystemPrompt()` returns a comprehensive prompt (~340 lines) embedded with:
- Design workflow (10-step process)
- Size presets (social, print, presentation, web)
- 12 color palettes by mood
- 10 font pairings by mood
- 4 type scales (Minor Third through Golden Ratio)
- Minimum font sizes by format
- Typography rules (line height, letter spacing, weight hierarchy)
- Layout rules (8px grid, spacing scale, margins, safe zones)
- WCAG contrast requirements
- Cafe Noir brand kit example
- Self-evaluation checklist (8 points)
- Image generation guidance

This prompt makes the in-plugin chat a self-contained design agent.

## Types (types.ts — 142 lines)

Lean version of the shared core types plus WS protocol:

```typescript
// WS Protocol (unique to MCP plugin)
interface WSCommand { type: 'command'; id: string; channel: string; action: string; params: Record<string, unknown> }
interface WSResponse { type: 'response'; id: string; channel: string; success: boolean; data?: Record<string, unknown>; error?: string }

// Plugin messaging
type PluginMessage = ExecuteCommandMessage | CommandResultMessage | StatusMessage
interface ExecuteCommandMessage { type: 'execute-command'; command: WSCommand }
interface CommandResultMessage { type: 'command-result'; response: WSResponse }
```

## Gemini Integration (in ui-app.ts)

- Converts Anthropic tool schemas to Gemini format via `convertToolsToGemini()`
- Handles `oneOf` flattening (Gemini doesn't support oneOf)
- Uppercases type names (Gemini requires `STRING` not `string`)
- Imagen 3.0 API for `generate_image` tool

## Storage

Same pattern as original plugin:
- `figmento-api-keys` — API keys by provider
- `figmento-ws-settings` — WS relay URL + channel
