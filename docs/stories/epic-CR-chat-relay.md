# Epic CR — Chat Relay

> Route AI calls from the plugin's Chat tab through the Railway-hosted server instead of making direct provider API calls from the browser. Eliminates TPM rate limits, moves API keys server-side, and keeps the user experience unchanged.

## PO Validation — Epic Level

**Verdict:** :white_check_mark: GO — All 4 stories validated and transitioned to Ready (3 CRITICAL findings addressed by @pm 2026-03-05)
**Validated by:** @po (Pax) — 2026-03-05

### Story Scorecard

| Story | Score | Verdict | Critical Finding |
|-------|-------|---------|-----------------|
| CR-1 | 7/10 | GO (conditional) | Relay is a dumb forwarder — has no mechanism to send commands or intercept responses on a channel. Requires new "relay-as-participant" architecture. See observation 1. |
| CR-2 | 8/10 | GO | Railway HTTP timeout (60s default) needs explicit `railway.toml` configuration or requests will fail for complex designs. |
| CR-3 | 7/10 | GO (conditional) | Bridge WS must be connected for tool calls to reach the sandbox. Epic says "UX unchanged" but Bridge is manual opt-in. See observation 2. File List incomplete — Settings UI changes need ui.html + chat-settings.ts. |
| CR-4 | 8/10 | GO | Clean design. Depends on CR-1/CR-3 architectural fixes being resolved first. |

### Epic-Level Observations (Cross-Cutting)

**1. CRITICAL — Relay is a dumb forwarder, not a channel participant.**

The WS relay (`relay.ts`) does ONE thing: forward messages between clients in a channel, **excluding the sender**:

```typescript
// relay.ts line 244
for (const client of channelClients) {
  if (client !== sender && client.readyState === WebSocket.OPEN) {
    client.send(rawMessage);
  }
}
```

The relay is the SERVER — it is not a `WebSocket` client in any channel. It has no way to:
- **Send a command** to the plugin (it's not a channel participant, `forwardToChannel` requires a sender to exclude)
- **Receive a response** from the plugin (when the plugin sends a response back via bridge WS, the relay's `handleMessage` just forwards it to other clients — the relay never "receives" it)

For CR-1's chat engine to work, the relay needs a new architectural capability: **"relay-as-participant"** on a channel. Concretely:

1. A method like `sendToChannel(channel, message)` that writes to ALL clients in the channel (no sender exclusion)
2. A response interception mechanism: when the plugin sends back a `{ type: 'response', id: 'relay-cmd-42' }`, the relay must catch it BEFORE forwarding. Use a command ID prefix (`relay-`) so the relay knows which responses are "for itself."
3. A pending-commands map inside the relay (like `FigmentoWSClient.pendingCommands`) that resolves promises when matching responses arrive

**Required action for CR-1:** Add a new section to AC3 or create a new AC: "Relay implements `sendCommandToChannel(channel, action, params): Promise<ResponseData>` that sends a command message directly to all channel clients, tracks the pending response by command ID, and resolves when the matching response arrives via WS." Add `relay.ts` to the File List with MODIFY action and note: "Add relay-as-participant: direct channel send + response interception."

This is the single biggest architectural risk in the epic. If this is wrong, nothing else works.

**2. CRITICAL — Bridge tab must be connected for tool calls to reach the plugin.**

The tool call path from relay to plugin sandbox goes through the **Bridge tab's WS connection** (`bridge.ts`):

```
Relay (chat engine) → WS message → Plugin bridge.ts → postToSandbox() → code.ts → Figma API
                                                                            ↓
Relay ← WS message ← Plugin bridge.ts ← handleBridgeCommandResult() ← command-result
```

The Bridge is a **manual opt-in feature**: user clicks "Connect" in the Bridge tab, which opens a WS connection and generates a channel ID. If the Bridge is disconnected, there is NO WS connection for the relay to send commands to.

The epic says "User experience unchanged — still just types in Chat tab" but this requires the Bridge to be silently connected in the background. Currently the user has to:
1. Go to Bridge tab
2. Click Connect
3. Copy the channel ID
4. Use it with Claude Code

For relay chat mode, the plugin needs to **auto-connect the Bridge** when `chatRelayEnabled === true`. The channel ID must be established automatically (no manual copy-paste needed).

**Required action for CR-3:** Add new ACs:
- "When `chatRelayEnabled` is true and the plugin loads, it auto-connects to the Bridge WS relay using the configured `chatRelayUrl` with an auto-generated channel ID"
- "The auto-generated channel ID is displayed in the Chat tab status area (e.g., 'Connected to relay: figmento-xyz123')"
- "The channel ID is sent with every chat turn request"
- Add `bridge.ts` to CR-3 File List (MODIFY — add `autoConnectBridge()` function, expose channel ID getter)

Without this, the user must manually connect the Bridge tab before every Chat session — a worse UX than today.

**3. CRITICAL — Command result routing depends on command ID prefix.**

The plugin's command result router in `index.ts` (line 304-316) uses command ID prefixes to dispatch:

```typescript
if (cmdId.startsWith('chat-'))          → resolveChatCommand()
else if (cmdId.startsWith('screenshot-')) → resolveScreenshotCommand()
else if (cmdId.startsWith('text-layout-')) → resolveTextLayoutCommand()
else if (cmdId.startsWith('presentation-')) → resolvePresentationCommand()
else                                     → handleBridgeCommandResult()  // Bridge fallthrough
```

Commands sent by the relay's chat engine will NOT start with `chat-` (that prefix is used by `chat.ts`'s `sendCommandToSandbox`). They'll have relay-generated IDs (e.g., `relay-cmd-42`). These fall through to `handleBridgeCommandResult()`, which sends the response back through the bridge WS. This is **correct behavior** — the response flows back to the relay.

However, this means:
- If the chat relay and the MCP server (Claude Code) are both connected to the same channel simultaneously, MCP commands and relay commands would conflict.
- The relay must use a distinguishable command ID prefix (e.g., `relay-`) to avoid collision with MCP server's `cmd-` prefix.

**Required action for CR-1 Dev Notes:** Add: "Use command ID prefix `relay-` (e.g., `relay-42-1709654321000`) to distinguish from MCP server's `cmd-` prefix and chat tab's `chat-` prefix. The plugin's command result router sends non-prefixed commands to `handleBridgeCommandResult()` which routes back through bridge WS — this is the correct return path for relay commands."

**4. HIGH — Compiled knowledge must be available in the relay package.**

CR-1 AC5 requires `buildSystemPrompt(brief, memory)` which imports from `../knowledge/compiled-knowledge.ts`. This file is generated by `figmento/scripts/compile-knowledge.ts` and outputs to `figmento/src/knowledge/`. The relay package (`figmento-ws-relay/`) has NO access to this compiled data.

Options (for @dev to decide during CR-1):
a. Run the knowledge compiler for the relay too (`scripts/compile-knowledge.ts` outputs to both `figmento/src/knowledge/` and `figmento-ws-relay/src/knowledge/`)
b. Copy the compiled output during relay build (`cp ../figmento/src/knowledge/compiled-knowledge.ts src/knowledge/`)
c. Extract to a shared `figmento-shared` package (mentioned as "long-term" in Dev Notes but needed NOW)

The epic's Dev Notes acknowledge this ("initially duplicate from the plugin source") but it's not in any AC or Task. The risk: if the relay builds without compiled knowledge, ALL intelligence features silently degrade — no brief detection, no palette/font injection, no refinement checks. The AI produces generic output indistinguishable from "old chat mode."

**Required action for CR-1:** Add AC: "Relay build step includes knowledge compilation or copies compiled output from the plugin workspace. Verify by checking: `buildSystemPrompt()` returns a prompt containing blueprint zone data (not just the static base prompt)."

**5. MEDIUM — Tool count discrepancy and misleading problem statement.**

The Problem Statement lists "No server-side intelligence" as a problem and says "Server-side execution would give Chat mode access to the full MCP toolset" (70+ tools). But CR-1 AC6 says "Tool definitions match the plugin's 37 tools."

The chat relay duplicates the **plugin's** 37 tools, NOT the MCP server's 70+ tools. The relay does not gain `batch_execute`, `create_from_pattern`, `evaluate_design`, `run_refinement_check`, `ad_analyzer`, or any of the 33+ MCP-only tools. The "No server-side intelligence" problem is NOT solved — the relay just moves the same 37-tool loop server-side.

This is not a blocker, but the Problem Statement's third row is misleading. Either:
a. Remove the "No server-side intelligence" row (the actual benefits are rate limits + key management)
b. Add a future story (CR-5) that expands the relay's tool set to include MCP-only tools

**Recommendation:** Reframe the third problem row to accurately reflect what this epic delivers: "API keys in browser = security risk + per-user management burden." The server-side intelligence gap is a separate concern for a future epic.

**6. MEDIUM — CR-3 File List incomplete.**

CR-3 changes:
- `chatRelayEnabled` and `chatRelayUrl` settings — these require changes in `chat-settings.ts` (where settings are loaded/saved) and `ui.html` (Settings panel DOM)
- Settings labels ("Optional — for direct mode fallback") — this is HTML
- Auto-connect bridge (per observation 2) — `bridge.ts`

The File List only shows `chat.ts` (twice, for the same file). Missing:

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui/chat-settings.ts` | MODIFY | Add chatRelayEnabled, chatRelayUrl to settings persistence |
| `figmento/src/ui/bridge.ts` | MODIFY | Add autoConnectBridge(), expose channel ID getter |
| `figmento/src/ui.html` | MODIFY | Settings panel: relay toggle, URL input, updated API key labels |

**7. LOW — Anthropic `anthropic-dangerous-direct-browser-access` header.**

The plugin sends this header (tool-use-loop.ts line 321) because it calls the Anthropic API from a browser context. The server-side engine runs in Node.js and does NOT need this header — in fact, using it server-side may trigger different rate limit tiers or audit flags.

**Required action for CR-1 Dev Notes:** Add: "Remove `anthropic-dangerous-direct-browser-access` header from server-side Anthropic API calls. This header is browser-only and not needed in Node.js."

### Recommended Sprint Sequencing

```
Sprint CR-1 (mandatory first, includes architectural changes):
  1. Relay-as-participant architecture (observation 1)
  2. CR-1: Server-Side Chat Engine (depends on relay participation)

Sprint CR-2 (parallel where possible):
  1. CR-2: Chat HTTP Endpoint (depends on CR-1)
  2. CR-3: Plugin Chat Relay Client + auto-bridge (depends on CR-2)
     Note: includes bridge auto-connect per observation 2

Sprint CR-3 (Phase 2):
  1. CR-4: Streaming via WebSocket Chunking (depends on CR-3)
```

---

## Problem Statement

The Figma plugin's Chat tab currently makes **direct HTTP calls** to AI provider APIs (Anthropic, Gemini, OpenAI) from the plugin iframe. This has three compounding problems:

| Problem | Impact | Severity |
|---------|--------|----------|
| **TPM rate limits** | After 8-12 tool calls, providers throttle the plugin. Complex designs (landing pages, carousels) fail mid-creation. The tool-use loop adds `sleep()` delays as a band-aid. | HIGH |
| **API keys in client** | Users must paste API keys into the plugin Settings tab. Keys are stored in `figma.clientStorage` — per-device, unencrypted, easily lost when clearing browser data. | MEDIUM |
| **API key management burden** | Each user must obtain, paste, and manage their own API keys per device. Keys stored in `figma.clientStorage` are unencrypted, lost on browser data clear, and cannot be rotated centrally. No usage tracking or cost control. | MEDIUM |

**Root cause:** The plugin makes AI API calls directly from the browser (Figma iframe sandbox). There is no server-side intermediary, so every token flows through the user's personal API key with consumer-tier rate limits.

**The server is already there.** The Figmento MCP server runs on Railway (`figmento-production.up.railway.app`) 24/7. It has the WS relay, the design intelligence, and the tool execution engine. The Chat tab just doesn't use it for AI calls yet.

## Strategy — Option A: `chat_turn` Handler on Relay

Add an HTTP endpoint to the existing WS relay service on Railway. The relay already:
- Runs 24/7 on Railway
- Has the HTTP server infrastructure (Node.js `http.createServer`)
- Handles WS connections from both the plugin and MCP server
- Is in the `manifest.json` allowed domains list

The new endpoint receives a chat turn (user message + conversation history), calls the AI provider server-side, executes the tool-use loop (routing tool calls through the existing WS relay channel to the plugin), and returns the complete response.

```
BEFORE (direct API calls):
┌──────────────┐          ┌──────────────┐
│ Plugin Chat   │──fetch──▶│ AI Provider  │
│ (iframe)      │◀─────────│ API          │
│               │          └──────────────┘
│  tool calls ──┼──WS relay──▶ Plugin Sandbox ──▶ Figma API
└──────────────┘

AFTER (relay-routed):
┌──────────────┐          ┌─────────────────────────┐          ┌──────────────┐
│ Plugin Chat   │──POST───▶│ Railway Relay            │──fetch──▶│ AI Provider  │
│ (iframe)      │◀─────────│ + Chat Engine            │◀─────────│ API          │
│               │          │                         │          └──────────────┘
│               │          │  tool calls ──WS──▶ Plugin Sandbox ──▶ Figma API
└──────────────┘          └─────────────────────────┘
```

**Why the relay, not a new service:**
- Zero new infrastructure — relay is already deployed, monitored, and in the manifest
- The relay already has WS connections to the plugin — tool calls route through the same process
- Adding an HTTP endpoint to the existing `handleHttpRequest` is trivial
- API keys live as Railway env vars (already supported)

**Phase 1:** Non-streaming. Plugin sends POST, shows spinner, receives complete response.
**Phase 2:** Streaming via WS. Plugin receives text chunks + tool events in real-time, renders progressively.

## Scope

### IN Scope

- New `chat-engine.ts` module in `figmento-ws-relay` — server-side tool-use loop (port of plugin's `tool-use-loop.ts`)
- POST `/api/chat/turn` endpoint on the relay HTTP server
- System prompt + tool definitions bundled in the relay (imported from shared source or duplicated with version sync)
- API keys read from Railway environment variables (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`)
- Plugin `chat.ts` refactored to POST to relay instead of direct provider API calls
- Tool execution: relay sends commands through its own WS server to the plugin sandbox (same channel)
- Phase 2: WS-based streaming protocol for progressive rendering
- Fallback: direct API mode preserved when relay is unreachable

### OUT of Scope

- MCP server changes (stays stdio-only for Claude Code)
- WS relay channel protocol changes (existing join/command/response messages unchanged)
- Plugin sandbox (`code.ts`) changes (still receives and executes the same design commands)
- New AI providers or model additions
- Plugin modes other than Chat (screenshot, text-layout, presentation keep direct API calls)
- Authentication/user management (relay is open, same as today)

## Dependencies

- Epic FC completed (tool-use loop extracted into `tool-use-loop.ts`)
- Epic KI completed (system prompt + knowledge bundled in plugin, portable to relay)
- WS relay deployed on Railway (`figmento-production.up.railway.app`)
- Plugin WS connection to relay functional

## Technical Constraints

| Constraint | Detail | Source |
|---|---|---|
| Figma iframe sandbox | Plugin can make HTTP requests to allowed domains only. Railway domain already allowed. | manifest.json |
| WS relay single-process | Relay runs as one Node.js process. Chat engine shares the event loop. Heavy AI calls must not block WS message routing. | Railway deployment |
| Tool call round-trip | Tool calls go: relay → WS → plugin sandbox → Figma API → response → WS → relay. Each round-trip is 100-500ms depending on command. | WS relay latency |
| Long-running requests | A chat turn with 15+ tool calls can take 30-90 seconds. HTTP response must not timeout. | Railway default: 60s, configurable |
| System prompt size | ~16K tokens with knowledge injection. Must be rebuilt server-side using the same `buildSystemPrompt()` logic. | system-prompt.ts |
| Railway env vars | API keys stored as env vars. Already supported via Railway dashboard. | Railway platform |

## Phase Structure

### Phase 1 — Non-Streaming Relay (MVP)

| Story | Name | Size | Blocks |
|---|---|---|---|
| CR-1 | Server-Side Chat Engine | L | CR-2, CR-3 |
| CR-2 | Chat HTTP Endpoint on Relay | M | CR-3 |
| CR-3 | Plugin Chat Relay Client | M | CR-4 |

### Phase 2 — Streaming

| Story | Name | Size | Requires |
|---|---|---|---|
| CR-4 | Streaming via WebSocket Chunking | L | CR-3 |

---

## Stories

---

### CR-1: Server-Side Chat Engine

**Status:** Ready
**Size:** L (Large)
**Blocks:** CR-2, CR-3, CR-4
**Agent:** @dev

#### Description

Port the plugin's `tool-use-loop.ts` to run server-side in Node.js. The engine accepts a chat turn (user message, conversation history, provider, model) and executes the full AI → tool-call → AI loop, returning the complete assistant response and updated conversation history.

Tool calls are executed by sending commands through the relay's WS server to the plugin sandbox — the same mechanism the MCP server uses today via `sendDesignCommand()`. The key difference: instead of the MCP server being a separate WS client, the chat engine runs inside the relay process and writes directly to the plugin's WS connection.

The system prompt and tool definitions are ported from the plugin's `system-prompt.ts` and `tools-schema.ts`. Since Epic KI already bundles compiled knowledge, the same data structures can be imported or duplicated with a shared package.

#### Acceptance Criteria

- [ ] **AC1:** New module `figmento-ws-relay/src/chat-engine.ts` exports `handleChatTurn()`:
  ```typescript
  interface ChatTurnRequest {
    message: string;
    history: ChatMessage[];       // provider-agnostic format
    provider: 'claude' | 'gemini' | 'openai';
    model: string;
    channel: string;              // WS relay channel for tool execution
  }

  interface ChatTurnResponse {
    assistantText: string;
    history: ChatMessage[];       // updated with this turn
    toolCalls: ToolCallLog[];     // name, args, result summary for each call
    error?: string;
  }
  ```
- [ ] **AC2:** Engine calls AI provider APIs using Node.js `fetch` (Anthropic, Gemini, OpenAI) with the same request formats as the plugin's `tool-use-loop.ts`
- [ ] **AC3:** Relay implements `sendCommandToChannel(channel, action, params): Promise<ResponseData>` — a "relay-as-participant" method that:
  - Sends a `{ type: 'command', id, channel, action, params }` message directly to ALL WS clients in the channel (no sender exclusion, unlike `forwardToChannel`)
  - Uses command ID prefix `relay-` (e.g., `relay-42-1709654321000`) to distinguish from MCP server's `cmd-` prefix and chat tab's `chat-` prefix
  - Tracks pending responses in a `Map<string, PendingCommand>` (same pattern as `FigmentoWSClient.pendingCommands`)
  - Intercepts incoming `{ type: 'response' }` messages in `handleMessage()` — if `id` starts with `relay-`, resolves the pending promise instead of forwarding. Non-`relay-` responses forward normally to other channel clients.
  - 30s timeout per command with rejection on timeout
- [ ] **AC4:** Special tools handled server-side:
  - `generate_image` — calls Gemini image generation API, sends base64 to plugin via `create_image` command
  - `update_memory` — sends `save-memory` message to plugin via WS
  - Local intelligence tools (`lookup_blueprint`, `lookup_palette`, `lookup_fonts`, `lookup_size`) — resolved from bundled knowledge, no WS round-trip
- [ ] **AC5:** System prompt built using the same `buildSystemPrompt(brief, memory)` logic from the plugin. `detectBrief()` runs server-side on the user message.
- [ ] **AC6:** Tool definitions match the plugin's 37 tools (from `tools-schema.ts`). Tool schema is either imported from a shared source or kept in sync via build step.
- [ ] **AC7:** Conversation history is provider-agnostic in the request/response (converted to provider-specific format internally)
- [ ] **AC8:** Engine respects `maxIterations: 50` (same as plugin). Returns partial results if iteration limit is reached.
- [ ] **AC9:** API keys read from environment variables: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`
- [ ] **AC10:** Tool result truncation (`truncateForHistory`) and base64 stripping applied identically to the plugin's logic
- [ ] **AC11:** Relay build step includes compiled knowledge — either by running `compile-knowledge.ts` for the relay workspace or by copying from `figmento/src/knowledge/compiled-knowledge.ts`. Verified: `buildSystemPrompt()` returns a prompt containing blueprint zone data and palette injection (not just the static base prompt).
- [ ] **AC12:** Anthropic API calls do NOT include the `anthropic-dangerous-direct-browser-access` header (browser-only, not needed in Node.js server context)

#### Tasks

- [ ] Task 1: Create `chat-engine.ts` with `handleChatTurn()` — provider dispatch + tool-use loop
- [ ] Task 2: Port Anthropic API call logic (messages API, tool_use content blocks)
- [ ] Task 3: Port Gemini API call logic (generateContent, functionCall/functionResponse)
- [ ] Task 4: Port OpenAI API call logic (chat completions, function calling)
- [ ] Task 5: Implement relay-as-participant — `sendCommandToChannel()` with `relay-` prefix, pending-response map, response interception in `handleMessage()`
- [ ] Task 6: Implement WS-based tool execution — use `sendCommandToChannel()` to dispatch tool calls to plugin sandbox via WS channel
- [ ] Task 7: Port special tool handlers (generate_image, update_memory, local intelligence)
- [ ] Task 8: Port/import system prompt builder and tool definitions + compile knowledge for relay build
- [ ] Task 9: Add provider-agnostic history format and conversion layer
- [ ] Task 10: Integration test — mock WS client, verify full loop completes

#### Dev Notes

- **PO obs 1 — Relay-as-participant architecture.** The relay currently only forwards between clients. The new `sendCommandToChannel()` method writes command messages directly to all WS clients in a channel (no sender exclusion) and intercepts `relay-` prefixed responses before `forwardToChannel()` processes them. This is the single biggest architectural change — implement and test it before porting provider API logic.
- **PO obs 3 — Command ID prefix `relay-`.** Use format `relay-{counter}-{timestamp}` (e.g., `relay-42-1709654321000`). The plugin's command result router in `index.ts` sends non-prefixed IDs to `handleBridgeCommandResult()` which routes back through the bridge WS — this is the correct return path for relay commands. If both MCP server (`cmd-` prefix) and relay (`relay-` prefix) are on the same channel, commands won't collide.
- **PO obs 4 — Compiled knowledge.** The relay needs `compiled-knowledge.ts` for `buildSystemPrompt()`. Options: (a) copy from `figmento/src/knowledge/` during relay build, (b) run `compile-knowledge.ts` with output path set to relay workspace, (c) share via symlink. @dev decides. Whichever path: add to relay's `build` script in `package.json` so it's automatic. Track sync via `KNOWLEDGE_VERSION` hash — relay and plugin must match.
- **PO obs 7 — Anthropic browser header.** Remove `anthropic-dangerous-direct-browser-access: true` from server-side Anthropic API calls. This header is for browser contexts only. The server runs in Node.js and should use standard API authentication (just `x-api-key` + `anthropic-version`).
- The biggest porting effort is the three provider API call implementations. These are ~150 lines each in `tool-use-loop.ts` (lines 300-700). The logic is straightforward HTTP fetch + response parsing.
- For system prompt and tool definitions: initially duplicate from the plugin source. Track with a `CHAT_ENGINE_VERSION` constant. Long-term, extract to a shared `figmento-shared` package (out of scope for this epic).
- `generate_image` uses the Gemini image generation API. On the server, the base64 response can be sent directly to the plugin via `create_image` WS command (same as the plugin does today, but server → WS → plugin instead of plugin → sandbox).
- Be careful with async: the tool-use loop is async (awaits WS responses). The relay's event loop must not be blocked — use standard async/await patterns, no sync operations.
- The relay currently has zero npm dependencies beyond `ws`. This story adds none — `fetch` is native in Node 18+. System prompt / tool defs are ported as plain TypeScript.

#### File List

| File | Action | Notes |
|---|---|---|
| `figmento-ws-relay/src/chat-engine.ts` | CREATE | Server-side tool-use loop + provider API calls |
| `figmento-ws-relay/src/chat-types.ts` | CREATE | ChatTurnRequest, ChatTurnResponse, ChatMessage, ToolCallLog types |
| `figmento-ws-relay/src/chat-tools.ts` | CREATE | Tool definitions (ported from plugin tools-schema.ts) |
| `figmento-ws-relay/src/chat-prompt.ts` | CREATE | System prompt builder (ported from plugin system-prompt.ts + brief-detector.ts) |
| `figmento-ws-relay/src/knowledge/` | CREATE (generated) | Compiled knowledge copied/generated from plugin workspace (gitignored) |
| `figmento-ws-relay/src/relay.ts` | MODIFY | Add `sendCommandToChannel()` relay-as-participant method + response interception in `handleMessage()` |
| `figmento-ws-relay/package.json` | MODIFY | Add knowledge compile/copy step to build script |

---

### CR-2: Chat HTTP Endpoint on Relay

**Status:** Ready
**Size:** M (Medium)
**Depends on:** CR-1
**Blocks:** CR-3
**Agent:** @dev

#### Description

Add a `POST /api/chat/turn` HTTP endpoint to the relay's existing HTTP server. The endpoint accepts a chat turn request, delegates to `handleChatTurn()` from CR-1, and returns the response as JSON. This is the non-streaming Phase 1 implementation — the plugin sends a request and waits for the complete response.

#### Acceptance Criteria

- [ ] **AC1:** `POST /api/chat/turn` endpoint added to `handleHttpRequest()` in `relay.ts`
- [ ] **AC2:** Request body is JSON:
  ```json
  {
    "message": "Create a luxury Instagram ad...",
    "history": [...],
    "provider": "claude",
    "model": "claude-sonnet-4-20250514",
    "channel": "abc-123"
  }
  ```
- [ ] **AC3:** Response body is JSON:
  ```json
  {
    "assistantText": "I'll create a luxury...",
    "history": [...],
    "toolCalls": [
      { "name": "create_frame", "summary": "Ad Frame (1:234)" },
      { "name": "create_text", "summary": "Headline (1:235)" }
    ],
    "error": null
  }
  ```
- [ ] **AC4:** CORS headers set for Figma plugin origin (`*` or specific Figma domains)
- [ ] **AC5:** Request validation: `message` required, `channel` must match an active WS channel with a connected plugin, `provider` must be one of `claude | gemini | openai`
- [ ] **AC6:** If `channel` has no connected plugin client, return `400` with error: `"No Figma plugin connected on channel {channel}. Open the plugin and verify the channel ID."`
- [ ] **AC7:** If the AI provider API key env var is missing for the requested provider, return `400` with error: `"API key not configured for {provider}. Set {ENV_VAR} on Railway."`
- [ ] **AC8:** Request timeout: 120 seconds (complex designs may need 50+ tool calls). Return `504` if exceeded.
- [ ] **AC9:** Concurrent request limit: 1 per channel (prevent duplicate processing). Return `429` if a turn is already in progress on the same channel.
- [ ] **AC10:** `GET /health` updated to include `chatEngine: { activeRequests: N }` in response
- [ ] **AC11:** Request body size limit: 1 MB (conversation history can be large)

#### Tasks

- [ ] Task 1: Add POST `/api/chat/turn` route to `handleHttpRequest()`
- [ ] Task 2: Implement JSON body parsing (chunked read from `req`)
- [ ] Task 3: Add CORS headers (preflight OPTIONS + response headers)
- [ ] Task 4: Add request validation (channel exists, provider valid, API key present)
- [ ] Task 5: Add per-channel concurrency lock
- [ ] Task 6: Wire endpoint to `handleChatTurn()` from chat-engine.ts
- [ ] Task 7: Update health check response
- [ ] Task 8: Manual test: curl POST to local relay, verify response

#### Dev Notes

- The relay uses raw `http.createServer` — no Express/Fastify. JSON body parsing needs manual implementation (read `req` chunks, `JSON.parse`). This is ~15 lines, no need to add a framework dependency.
- CORS: Figma plugin iframes load from `https://www.figma.com` or `null` origin. Use `Access-Control-Allow-Origin: *` for simplicity (the relay has no secrets in responses — API keys are never sent to the client).
- The 120s timeout is important. Railway's default is 60s for HTTP requests. The Procfile or `railway.toml` may need a `timeout` config. Document this in the Railway deployment section.
- Body size limit of 1 MB: a 50-turn conversation with tool results (truncated) is typically ~200-400 KB. 1 MB gives comfortable headroom.
- The concurrency lock (1 request per channel) prevents a race condition: if the user double-clicks send, two parallel tool loops would conflict on the same Figma canvas. Simple `Map<string, boolean>` is sufficient.

#### File List

| File | Action | Notes |
|---|---|---|
| `figmento-ws-relay/src/relay.ts` | MODIFY | Add POST `/api/chat/turn` handler, CORS, body parsing, validation |
| `figmento-ws-relay/src/chat-engine.ts` | MODIFY | Export types needed by endpoint |

---

### CR-3: Plugin Chat Relay Client

**Status:** Ready
**Size:** M (Medium)
**Depends on:** CR-2
**Agent:** @dev

#### Description

Refactor the plugin's `chat.ts` to send messages to the Railway relay endpoint instead of making direct AI provider API calls. The user experience is unchanged — type a message, see a spinner, get a response with tool actions listed. API keys are no longer required in plugin Settings (they live on Railway).

A fallback to direct API mode is preserved: if the relay is unreachable or returns an error, and the user has API keys configured locally, the plugin falls back to the current direct-call behavior. This ensures zero downtime during migration.

#### Acceptance Criteria

- [ ] **AC1:** `sendMessage()` in `chat.ts` sends a `POST` to `{relayUrl}/api/chat/turn` instead of calling `runAnthropicLoop()` / `runGeminiLoop()` / `runOpenAILoop()` directly
- [ ] **AC2:** Relay URL defaults to `https://figmento-production.up.railway.app` and is configurable in Settings
- [ ] **AC3:** The `channel` sent in the request body is the current WS relay channel ID (already known from the plugin's WS connection)
- [ ] **AC4:** While waiting for the relay response, the existing loading spinner is shown (same `setProcessing(true)` UX)
- [ ] **AC5:** On successful response:
  - Assistant text is rendered in a chat bubble (same `appendChatBubble('assistant', ...)`)
  - Each `toolCalls[]` entry is rendered as a tool action row (same `appendToolAction(name, summary)`)
  - Conversation history state is updated from the response's `history` field
- [ ] **AC6:** On relay error (network failure, 4xx, 5xx, timeout):
  - If user has a local API key configured for the current provider → fall back to direct API call (existing `runAnthropicLoop()` etc.)
  - If no local API key → show error message in chat: `"Relay unavailable. Configure an API key in Settings for direct mode."`
- [ ] **AC7:** API key fields in Settings tab remain but are labeled as "Optional — for direct mode fallback"
- [ ] **AC8:** New setting `chatRelayEnabled` (boolean, default `true`). When disabled, plugin always uses direct API calls (existing behavior).
- [ ] **AC9:** Provider/model selection in Settings still works — sent to the relay in the request body
- [ ] **AC10:** `cd figmento && npm run build` succeeds. No regressions in other modes (screenshot, text-layout, presentation).
- [ ] **AC11:** Conversation history format conversion: plugin's provider-specific history arrays (Anthropic, Gemini, OpenAI) are converted to the relay's provider-agnostic format before sending, and converted back on response.
- [ ] **AC12:** When `chatRelayEnabled` is true and the plugin loads, it auto-connects the Bridge WS to the configured `chatRelayUrl` with an auto-generated channel ID. No manual Bridge tab interaction required.
- [ ] **AC13:** The auto-generated channel ID is displayed in the Chat tab status area (e.g., "Relay: figmento-xyz123") so the user knows the connection is active.
- [ ] **AC14:** If the auto-connect fails (relay unreachable), the Chat tab shows a subtle "Relay offline — using direct mode" indicator and falls back per AC6.

#### Tasks

- [ ] Task 1: Add `chatRelayEnabled` and `chatRelayUrl` settings to `ChatSettings` interface and Settings UI
- [ ] Task 2: Create `sendChatTurnToRelay()` function — HTTP POST to relay endpoint
- [ ] Task 3: Refactor `sendMessage()` — relay path (default) vs. direct path (fallback)
- [ ] Task 4: Implement response rendering — assistant text bubble + tool action rows from `toolCalls[]`
- [ ] Task 5: Implement history sync — update local provider-specific history from relay response
- [ ] Task 6: Implement fallback logic — detect relay failure, check local API key, fall back or show error
- [ ] Task 7: Update Settings tab labels ("Optional — for direct mode fallback")
- [ ] Task 8: Implement auto-connect bridge — `autoConnectBridge()` in bridge.ts, triggered on plugin init when chatRelayEnabled is true
- [ ] Task 9: Add relay status indicator to Chat tab (channel ID + connected/offline state)
- [ ] Task 10: Manual test: send a design prompt through relay, verify Figma output is identical to direct mode

#### Dev Notes

- **PO obs 2 — Auto-connect bridge.** The Bridge tab's WS connection is the path for tool commands from the relay to the plugin sandbox. Currently it's manual opt-in (user clicks Connect). For relay chat mode, `bridge.ts` needs an `autoConnectBridge(url: string)` function called from `initChat()` (or plugin init) when `chatRelayEnabled === true`. This generates a channel ID automatically and connects silently. The `getBridgeChannelId()` getter (already exported) provides the channel ID for chat turn requests. If auto-connect fails, fall back to direct API mode.
- **PO obs 6 — File List.** Settings changes require `chat-settings.ts` (persistence), `bridge.ts` (auto-connect), and `src/ui.html` (Settings panel DOM for relay toggle/URL input/updated labels).
- History conversion is the trickiest part. The relay uses a provider-agnostic format (`ChatMessage[]` with role + content + tool_calls). The plugin stores provider-specific formats. Conversion functions are needed in both directions. Keep them simple — most fields map 1:1.
- The loading UX is simpler in relay mode vs. direct mode: no streaming, no progressive tool action rows during execution. The user sees a spinner, then the complete response appears at once. This is Phase 1's main UX tradeoff — Phase 2 (CR-4) restores progressive rendering.
- `sendChatTurnToRelay()` should use a generous timeout (120s to match the relay's limit). Use `AbortController` for timeout in the browser `fetch`.
- The `runAnthropicLoop()`, `runGeminiLoop()`, `runOpenAILoop()` functions stay in the codebase — they're the fallback path. Don't delete them.
- For history: on the first relay request, send empty history. On subsequent requests, send the history returned by the previous response. This means the plugin doesn't need to maintain provider-specific history when using relay mode — just store the agnostic `ChatMessage[]` array.

#### File List

| File | Action | Notes |
|---|---|---|
| `figmento/src/ui/chat.ts` | MODIFY | Add relay path in sendMessage(), sendChatTurnToRelay(), history conversion, fallback logic, relay status indicator |
| `figmento/src/ui/chat-settings.ts` | MODIFY | Add chatRelayEnabled, chatRelayUrl to ChatSettings interface + persistence |
| `figmento/src/ui/bridge.ts` | MODIFY | Add autoConnectBridge(url), expose getBridgeChannelId() for chat relay use |
| `figmento/src/ui/index.ts` | MODIFY | Wire auto-connect on plugin init when chatRelayEnabled is true |
| `figmento/src/ui.html` | MODIFY | Settings panel: relay toggle, relay URL input, updated API key labels ("Optional — for direct mode fallback") |

---

### CR-4: Streaming via WebSocket Chunking

**Status:** Ready
**Size:** L (Large)
**Depends on:** CR-3
**Phase:** 2
**Agent:** @dev

#### Description

Upgrade the chat relay from request/response HTTP to real-time streaming via the existing WebSocket connection. The relay sends text chunks, tool call start/end events, and completion signals as they happen. The plugin renders progressively — matching (and improving on) the current direct-API UX.

This eliminates the Phase 1 "staring at a spinner for 30-90 seconds" problem. Users see text appear word-by-word and tool actions animate in real-time, exactly as they do with the current direct API calls.

#### Acceptance Criteria

- [ ] **AC1:** New WS message types defined:
  ```typescript
  // Plugin → Relay
  { type: 'chat-turn-start', channel: string, message: string, history: ChatMessage[], provider: string, model: string }

  // Relay → Plugin
  { type: 'chat-text-chunk', channel: string, text: string }
  { type: 'chat-tool-start', channel: string, toolName: string, args: Record<string, unknown> }
  { type: 'chat-tool-end', channel: string, toolName: string, summary: string, isError: boolean }
  { type: 'chat-turn-end', channel: string, history: ChatMessage[], error?: string }
  ```
- [ ] **AC2:** Relay streams AI text responses as `chat-text-chunk` messages in real-time (as tokens arrive from the provider API)
- [ ] **AC3:** Relay sends `chat-tool-start` when a tool call begins and `chat-tool-end` when it completes
- [ ] **AC4:** Plugin renders text chunks progressively in a chat bubble (append to existing bubble, not create new ones)
- [ ] **AC5:** Plugin renders tool action rows in real-time as `chat-tool-start` / `chat-tool-end` arrive
- [ ] **AC6:** `chat-turn-end` signals completion — plugin updates loading state and stores the final history
- [ ] **AC7:** If the WS connection drops mid-stream, plugin shows the partial response received so far + an error message
- [ ] **AC8:** Streaming uses the existing WS relay connection (no new WebSocket). Chat messages are multiplexed alongside existing design command messages on the same channel.
- [ ] **AC9:** Provider APIs called with streaming enabled where supported:
  - Anthropic: `stream: true` (SSE)
  - Gemini: `streamGenerateContent` endpoint
  - OpenAI: `stream: true` (SSE)
- [ ] **AC10:** Phase 1 HTTP endpoint (`POST /api/chat/turn`) remains available as fallback for non-WS clients
- [ ] **AC11:** `cd figmento && npm run build` succeeds for both relay and plugin

#### Tasks

- [ ] Task 1: Define WS message types in `chat-types.ts`
- [ ] Task 2: Implement streaming provider API calls (Anthropic SSE, Gemini stream, OpenAI SSE)
- [ ] Task 3: Wire streaming responses to WS message emission in chat-engine.ts
- [ ] Task 4: Add `chat-turn-start` handler in relay.ts WS message router
- [ ] Task 5: Plugin: add WS message handlers for `chat-text-chunk`, `chat-tool-start`, `chat-tool-end`, `chat-turn-end`
- [ ] Task 6: Plugin: implement progressive text rendering (append to existing bubble)
- [ ] Task 7: Plugin: implement real-time tool action row rendering
- [ ] Task 8: Handle WS disconnection mid-stream (partial response + error)
- [ ] Task 9: Integration test: send design prompt, verify streaming renders match direct-mode output

#### Dev Notes

- Streaming multiplexing: the WS relay already routes messages by channel. Chat streaming messages use the same channel but with `type: 'chat-*'` prefix. The plugin's message router needs new cases for these types.
- Anthropic and OpenAI both use Server-Sent Events (SSE) for streaming. On the server, parse the SSE stream, extract text deltas and tool_use blocks, and forward as WS messages. Libraries: `eventsource-parser` or manual SSE line parsing (~30 lines).
- Gemini uses a different streaming format (line-delimited JSON). Handle separately.
- Progressive text rendering: the plugin currently creates a new chat bubble per response. For streaming, create the bubble on the first `chat-text-chunk` and append subsequent chunks to its `innerHTML`. Use a reference to the current streaming bubble.
- Tool call interleaving: AI providers can return text + tool_use in the same response. The stream may interleave text chunks with tool calls. The plugin should handle: text → tool start → tool end → more text → tool start → tool end → turn end.
- The existing WS connection is authenticated by channel. No additional auth needed for chat streaming messages.

#### File List

| File | Action | Notes |
|---|---|---|
| `figmento-ws-relay/src/chat-types.ts` | MODIFY | Add streaming message types |
| `figmento-ws-relay/src/chat-engine.ts` | MODIFY | Add streaming provider calls, emit WS messages during loop |
| `figmento-ws-relay/src/relay.ts` | MODIFY | Add `chat-turn-start` WS message handler |
| `figmento/src/ui/chat.ts` | MODIFY | Add WS message handlers, progressive rendering, streaming bubble management |

---

## Definition of Done (Epic Level)

- [ ] All 4 stories implemented, tested, and Done
- [ ] Plugin Chat tab sends AI requests through Railway relay by default
- [ ] API keys configured as Railway environment variables (not in plugin)
- [ ] Tool calls execute via WS relay → plugin sandbox → Figma API (same as MCP path)
- [ ] Fallback to direct API mode works when relay is unreachable + local keys exist
- [ ] Phase 1: non-streaming works end-to-end (POST → spinner → response)
- [ ] Phase 2: streaming works end-to-end (WS → progressive text + tool actions)
- [ ] No regressions in other plugin modes (screenshot, text-layout, presentation)
- [ ] `cd figmento && npm run build` and `cd figmento-ws-relay && npm run build` both clean
- [ ] Design output quality identical between relay mode and direct mode (same system prompt, same tools)
- [ ] Railway deployment stable with 3 provider API keys configured

## Validation Tests (Epic Level)

**TEST CR-A: Non-Streaming Round-Trip**
```
1. Plugin connected to relay channel
2. Send: "Create a blue rectangle, 200x200"
3. Verify: spinner shows, response arrives, rectangle appears in Figma
```
- [ ] Response contains assistant text + tool call log
- [ ] Rectangle created in Figma via relay → WS → plugin sandbox

**TEST CR-B: Complex Design Through Relay**
```
Send: "Instagram post for a coffee brand. Dark editorial, gold accent.
 Headline: Every Cup Tells a Story. Subheadline: Ritual Roasters."
```
- [ ] 10+ tool calls executed successfully
- [ ] Design quality matches direct-mode output for same prompt
- [ ] No TPM rate limit errors (server-side key, no consumer throttling)

**TEST CR-C: Fallback to Direct Mode**
```
1. Set relay URL to an invalid address
2. Configure local Anthropic API key in Settings
3. Send a message
```
- [ ] Plugin detects relay failure
- [ ] Falls back to direct API call
- [ ] Response renders normally

**TEST CR-D: No API Key Required**
```
1. Clear all API keys from plugin Settings
2. Ensure relay is reachable with server-side keys
3. Send a message
```
- [ ] Message routes through relay successfully
- [ ] No "Set your API key" error

**TEST CR-E: Streaming (Phase 2)**
```
Send a design prompt with streaming enabled
```
- [ ] Text appears progressively in chat bubble
- [ ] Tool actions animate in real-time (start → end)
- [ ] Final response matches non-streaming output

---

## Size Estimate

| Story | Size | LOC (est.) | Duration |
|---|---|---|---|
| CR-1 | L | ~500 | 2-3 days |
| CR-2 | M | ~150 | 1 day |
| CR-3 | M | ~200 | 1-2 days |
| CR-4 | L | ~400 | 2-3 days |
| **Total** | | **~1,250 LOC** | **6-9 days** |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tool call WS round-trip adds latency vs. direct sandbox call | High | Low | Each WS hop adds ~50ms. For 15 tool calls = ~750ms total. Negligible vs. AI inference time. |
| Railway HTTP timeout (60s default) too short for complex designs | Medium | High | Configure `railway.toml` with 120s timeout. Add timeout documentation. |
| System prompt / tool definitions drift between plugin and relay | Medium | Medium | Version hash sync check. Long-term: extract shared package. |
| Relay process crash during long chat turn | Low | High | Railway auto-restarts. Plugin detects WS disconnect, falls back to direct mode. |
| Concurrent users on same relay instance | Low | Medium | Railway can scale horizontally. Phase 1 handles 1 request per channel (AC9 in CR-2). |
| Streaming SSE parsing complexity across 3 providers | Medium | Medium | Anthropic and OpenAI share SSE format. Gemini is different but well-documented. Budget extra time in CR-4. |

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-05 | @pm (Morgan) | Epic created based on architect's Option A spec. 4 stories: server engine, HTTP endpoint, plugin client, streaming. |
| 2026-03-05 | @po (Pax) | Epic validated — GO (conditional). 7 observations: 3 CRITICAL (relay-as-participant architecture, bridge auto-connect, command ID routing), 1 HIGH (compiled knowledge in relay), 2 MEDIUM (tool count discrepancy, CR-3 File List), 1 LOW (Anthropic browser header). All 4 stories scored 7-8/10. Required actions documented per observation. |
| 2026-03-05 | @pm (Morgan) | Addressed all 7 PO findings: (1) CR-1 AC3 rewritten — relay-as-participant with `sendCommandToChannel()`, `relay-` prefix, response interception. (2) CR-3 AC12-AC14 added — auto-connect bridge on plugin init when chatRelayEnabled. (3) `relay-` prefix documented in CR-1 Dev Notes. (4) CR-1 AC11 added — knowledge compilation for relay build. (5) Problem Statement reframed — replaced "server-side intelligence" with "API key management burden." (6) CR-3 File List expanded — added chat-settings.ts, bridge.ts, index.ts, ui.html. (7) CR-1 AC12 added — no browser header on server-side Anthropic calls. All 4 stories transitioned Draft → Ready. |
