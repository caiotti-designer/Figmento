# Figmento MCP Server — `figmento-mcp-server/`

> Node.js MCP server that bridges Claude Code ↔ Figma plugin via WebSocket relay.

## Identity

- **Package name:** `figmento-mcp-server`
- **Binary:** `figmento-mcp` (via package.json `bin`)
- **Transport:** stdio (MCP standard)
- **Dependencies:** `@modelcontextprotocol/sdk` ^1.12.1, `ws` ^8.18.0, `zod` ^3.24.0

## Architecture

```
figmento-mcp-server/
├── src/
│   ├── index.ts        # Entry — creates server, starts stdio transport
│   ├── server.ts       # MCP tool registration (525 lines)
│   ├── ws-client.ts    # WebSocket client for relay (147 lines)
│   └── types.ts        # WSCommand/WSResponse (40 lines)
├── package.json
├── tsconfig.json
└── build.js            # esbuild → dist/index.js
```

## Server (server.ts)

### Factory

```typescript
export function createFigmentoServer(): Server
```

Creates MCP `Server` instance with 24 tools registered.

### Helpers

```typescript
function requireConnection(): FigmentoWSClient  // Throws if not connected
async function sendDesignCommand(action: string, params: Record<string, unknown>): Promise<object>
// → calls wsClient.sendCommand(action, params) → returns response.data or throws on error
```

### 24 MCP Tools

All tools use Zod schemas for input validation.

| Category | Tools | Count |
|----------|-------|-------|
| **Connection** | `connect_to_figma`, `disconnect_from_figma` | 2 |
| **Canvas Creation** | `create_frame`, `create_text`, `create_rectangle`, `create_ellipse`, `create_image` | 5 |
| **Style** | `set_fill`, `set_stroke`, `set_effects`, `set_corner_radius`, `set_opacity`, `set_auto_layout` | 6 |
| **Scene Management** | `get_selection`, `export_node`, `get_node_info`, `get_page_nodes`, `delete_node`, `move_node`, `resize_node`, `rename_node`, `append_child` | 9 |
| **Batch** | `create_design` | 1 |
| **Image** | `place_generated_image` | 1 |

### Tool Registration Pattern

```typescript
server.tool('create_frame', 'Create a frame on Figma canvas', {
  name: z.string().optional(),
  width: z.number(),
  height: z.number(),
  // ... Zod schema
}, async ({ name, width, height, ... }) => {
  requireConnection();
  const result = await sendDesignCommand('create_frame', { name, width, height, ... });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
```

### Connection Management

```typescript
server.tool('connect_to_figma', ..., async ({ wsUrl, channel }) => {
  wsClient = new FigmentoWSClient();
  await wsClient.connect(wsUrl || 'ws://localhost:3055', channel || 'figmento');
  // returns success message
});
```

- `wsUrl` defaults to `ws://localhost:3055`
- `channel` defaults to `"figmento"`
- Must be called before any other tool

### Monolith Status

All 24 tools are registered in a single `server.ts` file (525 lines). Planned refactor into `tools/` modules (Story S-07 in architecture.md).

## WS Client (ws-client.ts)

```typescript
export class FigmentoWSClient {
  connect(url: string, channel: string): Promise<void>     // 10s timeout
  sendCommand(action: string, params: object, timeoutMs?: number): Promise<WSResponse>  // 30s default
  disconnect(): void
}
```

### Command ID Format

```typescript
const id = `cmd-${this.commandCounter++}-${Date.now()}`;
```

### Pending Command Tracking

```typescript
private pendingCommands: Map<string, {
  resolve: (value: WSResponse) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}>;
```

On incoming WS message with `type: 'response'`, looks up pending command by `id`, clears timer, resolves promise.

### Current Limitations

- **No reconnection logic** — connection lost = all pending commands rejected, must call `connect_to_figma` again
- **No command queue** — commands during disconnection fail immediately
- **No heartbeat** — silent disconnects not detected until next command times out
- Planned: exponential backoff reconnection (Story S-04), command queue with 50-item cap

## Types (types.ts — 40 lines)

```typescript
export interface WSCommand {
  type: 'command';
  id: string;
  channel: string;
  action: string;
  params: Record<string, unknown>;
}

export interface WSResponse {
  type: 'response';
  id: string;
  channel: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}
```

Duplicated from plugin types — same shape used across relay and plugin.

## Build & Run

```bash
npm run build    # esbuild → dist/index.js
npm run dev      # esbuild watch mode

# Claude Code config (claude_desktop_config.json):
{
  "mcpServers": {
    "figmento": {
      "command": "node",
      "args": ["path/to/figmento-mcp-server/dist/index.js"]
    }
  }
}
```

## Error Handling

Current: try/catch in each tool handler, returns error text in MCP response.
Planned: structured `CommandError` type with codes (NODE_NOT_FOUND, FONT_LOAD_FAILED, etc.) and `recoverable` boolean (architecture.md §7.2).
