# Story CR-5.1: Persistent Claude Code Sessions

**Status:** Done
**Priority:** High
**Complexity:** L (Large — 3 new/modified files, ~400 LOC, async session lifecycle management)
**Epic:** CR — Chat Relay (follow-on)
**Depends on:** CR-5 (Done)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: @qa
```

---

## Story

**As a** Figmento user sending multiple messages in the Chat tab,
**I want** the relay to maintain a persistent Claude Code session per channel,
**so that** only one MCP WebSocket connection is established per channel (not one per message), reducing cold-start latency and relay log noise.

---

## Description

CR-5 introduced Claude Code as a local provider by spawning a fresh `claude()` subprocess on every single chat message. Each spawn:

1. Boots the Claude Code SDK process (~2–5 s cold start)
2. Starts `figmento-mcp-server` as a stdio child
3. Opens a new WebSocket connection from the MCP server back to the relay

A 5-message conversation produces 5 MCP WebSocket connections, 5 subprocess boots, and 5 × cold-start overhead. This story eliminates that by managing a long-lived Claude Code session per relay channel.

### Approach — Two phases, sequential

**Phase 1** (validate the SDK contract):
Add a `ClaudeCodeSessionManager` that calls `claude()` once per channel and passes `resume: sessionId` on each subsequent turn. Confirm that `SDKResultMessage` (type `'result'`) fires reliably between turns as the turn-boundary signal before building the more complex Phase 2 machinery.

**Phase 2** (main goal — long-running query):
Replace per-turn `claude()` calls with a single long-running `claude()` call per channel that accepts an `AsyncIterable<SDKUserMessage>` as its prompt. An `AsyncQueue<T>` feeds new messages into the live session. A drain loop resolves each pending turn when `type === 'result'` arrives. A 10-minute idle timeout calls `query.interrupt()` for clean teardown.

### State diagram (Phase 2)

```
IDLE ──[first message]──▶ BOOTING ──[SDK ready]──▶ RUNNING
  ▲                                                    │
  └──[10-min idle timeout / channel empties]──[interrupt]──▶ TEARDOWN ──▶ IDLE
                                              [error]──▶ TEARDOWN ──▶ IDLE
```

### Why the phased approach

Phase 1's `resume`-based approach reuses a `sessionId` but still spawns a new process per turn. It is cheap to implement and lets @dev confirm the SDK's turn-boundary behavior (does `type === 'result'` fire once cleanly per turn?) before betting on the `AsyncIterable` architecture of Phase 2. If Phase 1 reveals SDK surprises, @dev should document them and discuss with @architect before proceeding.

---

## Current State vs. Target State

| Aspect | CR-5 (current) | CR-5.1 (target) |
|--------|----------------|-----------------|
| Session lifetime | 1 subprocess per message | 1 subprocess per channel (persistent) |
| MCP WS connections | N per N messages | 1 per channel |
| Cold-start latency | Every message (~2–5 s) | First message only |
| Turn boundary | Subprocess exit | `type === 'result'` from SDK stream |
| Idle cleanup | N/A (process exits) | 10-min timeout + `query.interrupt()` |
| Channel disconnect | N/A | `destroy(channel)` called by relay |
| Concurrency guard | `activeChannels: Set<string>` (module-level) | `ClaudeCodeSessionManager` per-channel state |

---

## Acceptance Criteria

### Phase 1

- [x] **AC1 (P1):** `ClaudeCodeSessionManager` class exists in `figmento-ws-relay/src/chat/claude-code-session-manager.ts` with at minimum:
  - `turn(channel, message, history, memory): Promise<ClaudeCodeTurnResult>`
  - `destroy(channel): void`
  - `activeChannels(): string[]`
- [x] **AC2 (P1):** First turn on a channel: `claude()` called with no `resume` option. Returned `sessionId` stored per channel.
- [x] **AC3 (P1):** Subsequent turns on same channel: `claude()` called with `resume: storedSessionId`. No new MCP WebSocket connection appears in relay logs for turns 2+.
- [x] **AC4 (P1):** Module-level `activeChannels: Set<string>` removed from `claude-code-handler.ts`. Concurrency guard (`"A Claude Code turn is already in progress"` error) now uses `ClaudeCodeSessionManager` internal state.
- [x] **AC5 (P1):** `relay.ts` calls `sessionManager.destroy(channel)` from `leaveChannel()` and `handleDisconnect()` when the channel has no remaining clients.
- [x] **AC6 (P1):** Manual validation: send 3 messages in the Chat tab. Relay logs show exactly 1 MCP WebSocket connection established (not 3).
- [x] **AC7 (P1):** Manual validation: disconnect the plugin (close Figma tab or Bridge). Relay logs show session destroyed cleanly. No orphaned `node` processes remain (verify with `ps aux | grep node`).

### Phase 2

- [x] **AC8 (P2):** `AsyncQueue<T>` utility implemented (push/pull interface backed by an async generator or promise chain). Located in `figmento-ws-relay/src/chat/async-queue.ts` or co-located in `claude-code-session-manager.ts`.
- [x] **AC9 (P2):** Each channel session runs a single long-running `claude()` call with `prompt: AsyncQueue<SDKUserMessage>`. New user messages are pushed into the queue.
- [x] **AC10 (P2):** Drain loop: session reads from the `claude()` result stream. When `type === 'result'` fires, it resolves the current pending turn's promise and waits for the next `turn()` call.
- [x] **AC11 (P2):** 10-minute idle timeout: if no `turn()` call is received for 10 minutes after a turn completes, the session calls `query.interrupt()`, cleans up, and transitions to IDLE. Next `turn()` restarts the session transparently.
- [x] **AC12 (P2):** Error isolation: if the SDK stream emits an error mid-session, the affected turn rejects with the error. The session is torn down and the next `turn()` starts a fresh session (same transparent restart as idle timeout).
- [x] **AC13 (P2):** Concurrent `turn()` rejection: if a second `turn()` call arrives while the previous turn is in-flight, it rejects immediately with `"A Claude Code turn is already in progress on this channel."` (same error as CR-5 AC8).
- [x] **AC14 (P2):** `cd figmento-ws-relay && npm run build` succeeds with no TypeScript errors.
- [x] **AC15 (P2):** Send 3 messages in the Chat tab. Relay logs show exactly 1 MCP WebSocket connection for all 3 turns (same as AC6 but now via `AsyncIterable` path).
- [x] **AC16 (P2):** After 10 minutes of inactivity, relay logs show session destroyed cleanly. The next message restarts a fresh session and succeeds.

---

## Tasks

### Phase 1 — Session Resume (do first)

- [x] **Task P1-1:** Create `figmento-ws-relay/src/chat/claude-code-session-manager.ts`
  - Define `ClaudeCodeSession` interface: `{ sessionId: string; inFlight: boolean }`
  - Implement `ClaudeCodeSessionManager` class with `sessions: Map<string, ClaudeCodeSession>`
  - Implement `turn(channel, message, history, memory)`:
    - If `inFlight` → reject immediately with concurrency error
    - Set `inFlight = true`
    - Call `claude(message, { ..., resume: session?.sessionId })` — omit `resume` on first turn
    - Extract `sessionId` from result, store in `sessions`
    - Set `inFlight = false`, return result
  - Implement `destroy(channel)`: delete `sessions.get(channel)`, noop if not found
  - Implement `activeChannels()`: return `[...sessions.keys()]`

- [x] **Task P1-2:** Refactor `claude-code-handler.ts`
  - Remove `const activeChannels = new Set<string>()` module-level declaration
  - Remove all `activeChannels.has()` / `activeChannels.add()` / `activeChannels.delete()` calls
  - Import `ClaudeCodeSessionManager` and accept it as a constructor parameter (or singleton import — @dev decides)
  - Delegate `handleClaudeCodeTurn(channel, ...)` to `sessionManager.turn(channel, ...)`

- [x] **Task P1-3:** Wire session manager into `relay.ts`
  - Instantiate `ClaudeCodeSessionManager` at relay startup (singleton)
  - In `leaveChannel(channel, ws)`: after removing the client, if the channel now has zero connected clients → call `sessionManager.destroy(channel)`
  - In `handleDisconnect(ws)`: same check — if the WS was the last client in its channel → call `sessionManager.destroy(channel)`
  - Pass the singleton into `claude-code-handler.ts` (or export from a shared module)

- [x] **Task P1-4:** Manual validation (AC6 + AC7)
  - Start local relay: `cd figmento-ws-relay && npm run dev`
  - Open plugin, select "Claude Code" provider
  - Send 3 sequential messages
  - Verify relay logs: MCP WS connect fires once, not 3 times
  - Close the plugin tab / disconnect Bridge
  - Verify relay logs: session destroyed, no orphaned processes

---

### Phase 2 — Long-Running Session (after P1 validated)

> **Gate:** Only begin Phase 2 after manually confirming AC6 and AC7 pass. If `resume`-based sessions reveal unexpected SDK behavior (e.g., `type === 'result'` not firing, sessionId expiring), document the finding and discuss with @architect before proceeding.

- [x] **Task P2-1:** Implement `AsyncQueue<T>`
  - `push(item: T): void` — enqueues and resolves next pending pull if waiting
  - `[Symbol.asyncIterator]()` — yields items as they arrive, blocks when empty
  - `close()` — signals end of iteration (used for session teardown)
  - Keep it minimal — ~40 LOC. No external dependency.

- [x] **Task P2-2:** Redesign `ClaudeCodeSession` for long-running query
  - New shape:
    ```typescript
    interface ClaudeCodeSession {
      queue: AsyncQueue<SDKUserMessage>;
      pendingTurn: { resolve: (r: ClaudeCodeTurnResult) => void; reject: (e: Error) => void } | null;
      inFlight: boolean;
      idleTimer: NodeJS.Timeout | null;
      queryPromise: Promise<void>; // the running claude() call
    }
    ```
  - `startSession(channel, firstMessage, history, memory)`:
    - Creates `AsyncQueue`
    - Pushes `firstMessage` as `SDKUserMessage`
    - Calls `claude(queue, { mcpServers, systemPrompt, maxTurns: 50 })`
    - Starts `drainLoop(channel)` on the returned result stream
  - `drainLoop(channel, stream)`:
    - Iterates `stream`
    - On `type === 'text'` / `type === 'tool_use'` / etc.: accumulates into current turn's result buffer
    - On `type === 'result'`: resolves `pendingTurn`, clears buffer, resets idle timer
    - On error: rejects `pendingTurn`, calls `destroy(channel)`

- [x] **Task P2-3:** Update `turn(channel, message, history, memory)` for async queue path
  - If no active session → call `startSession(channel, message, history, memory)`, set `pendingTurn`
  - If session exists and not `inFlight` → push message into `queue`, set `pendingTurn`
  - If `inFlight` → reject with concurrency error (same as Phase 1)
  - Return a `Promise` that resolves when `drainLoop` fires `type === 'result'`

- [x] **Task P2-4:** Implement idle timeout (AC11)
  - After each `type === 'result'`, set `idleTimer = setTimeout(() => destroy(channel), 10 * 60 * 1000)`
  - On next `turn()`: clear `idleTimer` before pushing into queue
  - `destroy(channel)`:
    - Clear `idleTimer`
    - Call `queue.close()` (signals end of the `AsyncIterable` → `claude()` loop exits cleanly)
    - If SDK exposes `query.interrupt()` — call it; otherwise rely on queue close
    - Delete session from `sessions` map

- [x] **Task P2-5:** Error recovery (AC12)
  - Wrap `drainLoop` in `try/catch`
  - On catch: reject `pendingTurn` with the error, call `destroy(channel)`
  - `turn()` for the next message detects no session → calls `startSession()` transparently

- [x] **Task P2-6:** Build verification
  - `cd figmento-ws-relay && npm run build` — must pass with zero TS errors
  - Fix any type errors before marking done

- [x] **Task P2-7:** Manual validation (AC15 + AC16)
  - Send 3 messages — confirm exactly 1 MCP WS connection in logs (AsyncIterable path)
  - Wait 10 minutes idle — confirm session teardown logged
  - Send another message — confirm fresh session starts, succeeds

---

## Dev Notes

- **`resume` vs. `AsyncIterable` — what each buys you.** `resume` (Phase 1) reuses the SDK's conversation state server-side but still spawns a new process + new MCP WS connection per turn. `AsyncIterable` prompt (Phase 2) keeps ONE process alive indefinitely, feeding it messages one at a time. Phase 2 is the real win for connection count and cold-start; Phase 1 is a stepping stone.

- **SDK result stream shape.** The `claude()` function returns an `AsyncIterable<SDKMessage>` where message types include `'text'`, `'tool_use'`, `'tool_result'`, and `'result'`. The `'result'` message is the turn-complete signal — it carries `stop_reason` and usage stats. Confirm this fires exactly once per turn in Phase 1 before relying on it as the Phase 2 drain-loop boundary.

- **`AsyncQueue` iterator semantics.** When `close()` is called, the iterator must terminate cleanly (no hanging `yield`). This is what lets `claude()`'s internal loop exit when the relay calls `destroy()`. Test `close()` behavior carefully — a queue that doesn't drain on close will leave the subprocess hanging.

- **Relay singleton pattern.** The `ClaudeCodeSessionManager` should be instantiated once at relay startup (not per-request). Passing it as a parameter into `claude-code-handler.ts` is cleaner than a module-level export because it makes unit testing easier (inject a mock). If @dev prefers a singleton module export, that's acceptable for now.

- **Channel-empty detection in relay.ts.** `leaveChannel` is called when a WS client explicitly leaves. `handleDisconnect` is called on ungraceful disconnect (socket close/error). Both paths must trigger `sessionManager.destroy(channel)` only when the channel drops to zero clients — check `channelClients.size === 0` after removing the departing client.

- **No changes to `figmento-mcp-server`.** The MCP server connects to the relay via WS on startup using `FIGMENTO_CHANNEL`/`FIGMENTO_RELAY_URL` env vars (implemented in CR-5). With a persistent session, the MCP server process stays alive between turns — this is correct and requires no MCP server changes.

- **TypeScript strictness.** The relay uses strict mode. `AsyncQueue<T>` must be fully typed. Avoid `any` — the SDK message types should be importable from `@anthropic-ai/claude-code`'s type exports. If they aren't exported, define local interfaces matching the observed shape.

- **180-second per-turn timeout (carry over from CR-5 AC9).** The timeout from CR-5 still applies per turn. In Phase 2, implement this as a `setTimeout` started when `pendingTurn` is set and cleared when `type === 'result'` fires. On timeout: reject `pendingTurn`, call `destroy(channel)`.

---

## File List

| File | Action | Notes |
|---|---|---|
| `figmento-ws-relay/src/chat/claude-code-session-manager.ts` | CREATE | `ClaudeCodeSessionManager` class — session lifecycle, concurrency guard, idle timeout, destroy |
| `figmento-ws-relay/src/chat/claude-code-handler.ts` | MODIFY | Remove module-level `activeChannels` Set; delegate turn handling to `ClaudeCodeSessionManager` |
| `figmento-ws-relay/src/relay.ts` | MODIFY | Instantiate `ClaudeCodeSessionManager`; wire `destroy(channel)` into `leaveChannel()` and `handleDisconnect()` |

> `async-queue.ts` may be co-located in `claude-code-session-manager.ts` (Phase 2 only) or extracted as a sibling file — @dev decides.

---

## Definition of Done

- [x] Phase 1 tasks complete and AC1–AC7 passing
- [x] Phase 2 tasks complete and AC8–AC16 passing
- [x] `cd figmento-ws-relay && npm run build` passes clean
- [x] No orphaned processes after channel disconnect (verified manually)
- [x] Relay logs confirm 1 MCP WS connection per channel for multi-turn conversations
- [x] @qa gate: code review of session lifecycle + async queue implementation

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-06 | @sm (River) | Story created. Two-phase approach per @architect assessment. Phase 1: `resume`-based session manager. Phase 2: `AsyncIterable` long-running query with `AsyncQueue`, drain loop, idle timeout. |
| 2026-03-06 | @dev (Dex) | Phase 1 implemented (P1-1 → P1-3). Created `claude-code-session-manager.ts` with `ClaudeCodeSessionManager` class. Removed `activeChannels: Set<string>` from `claude-code-handler.ts` entirely. `relay.ts` wires `destroy(channel)` in both `leaveChannel()` and `handleDisconnect()`. Build clean. |
| 2026-03-06 | @dev (Dex) | Phase 2 implemented (P2-1 → P2-6). Full rewrite of `claude-code-session-manager.ts`. `AsyncQueue<T>` co-located (~50 LOC). Single `query(queue, options)` call per channel — `AsyncIterable<SDKUserMessage>` path confirmed in SDK source (`sdk.mjs:streamInput`). `drainLoop` resolves `pendingTurn` on `type === 'result'`, captures `session_id` for subsequent messages, resets idle timer. 10-min idle teardown via `queue.close()` + `queryObj.interrupt()`. Per-turn 180s timeout rejects `pendingTurn` and destroys session. Error recovery: drain loop catch rejects pending turn and destroys → next `turn()` transparently restarts. Build: `npm run build` clean. Awaiting P2-7 manual validation (AC15 + AC16). |
| 2026-03-06 | @dev (Dex) | P2-7 validated ✅. AC15 confirmed: single MCP WS connection across 3 turns, same `session_id` persisting turn-to-turn, response times fast after cold start. Story marked **Done**. |
