# Figmento WS Relay — `figmento-ws-relay/`

> Minimal channel-based WebSocket relay. Forwards messages between MCP server and Figma plugin.

## Architecture

```
figmento-ws-relay/
├── src/
│   ├── index.ts    # Entry — starts relay on port 3055, graceful shutdown
│   ├── relay.ts    # FigmentoRelay class (165 lines)
│   └── types.ts    # RelayMessage union type (32 lines)
├── package.json
├── tsconfig.json
└── build.js
```

## FigmentoRelay (relay.ts — 165 lines)

### State

```typescript
private clients: Map<WebSocket, ClientInfo>       // All connected clients
private channels: Map<string, Set<WebSocket>>     // Channel → members

interface ClientInfo { ws: WebSocket; channels: Set<string> }
```

### Message Protocol

| Message Type | Direction | Action |
|-------------|-----------|--------|
| `join` | Client → Relay | Add client to channel, respond with `{ type: 'joined', channel, clients: count }` |
| `leave` | Client → Relay | Remove from channel, respond with `{ type: 'left', channel }` |
| `command` | Client → Relay → Others | Forward to all other members in channel |
| `response` | Client → Relay → Others | Forward to all other members in channel |

### Forwarding Logic

```typescript
private forwardToChannel(sender: WebSocket, channel: string, rawMessage: string): void
```

- Iterates all channel members except sender
- Only sends to clients with `readyState === WebSocket.OPEN`
- Logs: `[Figmento Relay] CMD cmd-1-123 [figmento] create_frame -> 1 peer(s)`
- If channel doesn't exist: returns error to sender

### Disconnect Cleanup

When a client disconnects:
1. Remove from all channels it joined
2. Delete empty channels
3. Remove from clients map
4. Log remaining client count

## Types (types.ts)

```typescript
export type RelayMessage = JoinMessage | LeaveMessage | CommandMessage | ResponseMessage;

interface JoinMessage    { type: 'join';     channel: string }
interface LeaveMessage   { type: 'leave';    channel: string }
interface CommandMessage  { type: 'command';  id: string; channel: string; action: string; params: Record<string, unknown> }
interface ResponseMessage { type: 'response'; id: string; channel: string; success: boolean; data?: Record<string, unknown>; error?: string }
```

## Entry (index.ts)

```typescript
const PORT = parseInt(process.env.FIGMENTO_RELAY_PORT || '3055', 10);
const relay = new FigmentoRelay();
relay.start(PORT);
// SIGINT/SIGTERM → relay.stop() + process.exit(0)
```

## Build & Run

```bash
npm run build    # esbuild → dist/index.js
npm run dev      # esbuild watch mode

# Default: ws://localhost:3055
# Override: FIGMENTO_RELAY_PORT=4000 npm run dev
```

## Design Notes

- **Dumb relay** — no message validation, no authentication, no persistence
- **Channel isolation** — messages only forwarded within same channel
- **Multi-channel support** — a client can join multiple channels
- **No reconnection assistance** — if a client disconnects, it's gone; other clients are not notified
- **Logging only** — no metrics, no health endpoint

## Typical Channel Setup

In practice, one channel `"figmento"` is used:
- MCP server joins as one client
- Plugin UI iframe joins as the other client
- Commands flow MCP→plugin, responses flow plugin→MCP
