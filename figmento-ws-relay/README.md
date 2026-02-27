# Figmento WebSocket Relay

Channel-based WebSocket relay that bridges the Figmento MCP server and the Figma plugin. Clients join named channels, and messages are forwarded to all other clients in the same channel.

## Architecture

```
MCP Server ──ws──► Relay ◄──ws── Figma Plugin
                 (channel)
```

Both clients join the same channel ID. Commands from the MCP server are forwarded to the plugin; responses flow back. The relay is a stateless message router — no persistence, no auth, no message transformation.

## Production

Deployed on Railway at `wss://figmento-production.up.railway.app`.

Health check: `GET https://figmento-production.up.railway.app/health`

## Local Development

```bash
npm install
npm run dev     # builds + starts on port 3055
```

The relay starts on `ws://localhost:3055` by default.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3055` | Server port (Railway sets this automatically) |
| `FIGMENTO_RELAY_PORT` | `3055` | Legacy local dev port (used if `PORT` is not set) |
| `MAX_PAYLOAD` | `10485760` | Max WebSocket message size in bytes (10 MB) |
| `ALLOWED_ORIGINS` | `*` | Comma-separated origin whitelist. Use `*` for dev, restrict in production |
| `RATE_LIMIT_MAX_CONNECTIONS` | `10` | Max concurrent connections per IP |

Port resolution: `PORT` → `FIGMENTO_RELAY_PORT` → `3055`

## Deploy to Railway

1. Install Railway CLI: `npm i -g @railway/cli`
2. Authenticate: `railway login`
3. From this directory:
   ```bash
   railway init          # create project (first time)
   railway service       # link to service
   railway variables set NIXPACKS_NODE_ENV=development
   railway up
   ```
4. Generate a public domain in Railway dashboard: **Service → Settings → Networking → Generate Domain**

Required Railway env var: `NIXPACKS_NODE_ENV=development` (ensures TypeScript is installed during build).

## Message Protocol

### Join a channel
```json
{ "type": "join", "channel": "figmento-<32-hex-chars>" }
```

### Leave a channel
```json
{ "type": "leave", "channel": "figmento-..." }
```

### Command (MCP → Plugin)
```json
{ "type": "command", "id": "cmd-1", "channel": "figmento-...", "action": "create_frame", "params": {} }
```

### Response (Plugin → MCP)
```json
{ "type": "response", "id": "cmd-1", "channel": "figmento-...", "success": true, "data": {} }
```

## Security

- **Channel IDs** are 128-bit crypto-random hex tokens (not guessable)
- **Origin validation** rejects connections from unlisted origins (configurable)
- **Rate limiting** caps connections per IP to prevent abuse
- **Ping/pong keepalive** terminates unresponsive clients after 30s
