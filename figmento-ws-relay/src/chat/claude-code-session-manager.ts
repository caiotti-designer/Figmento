/**
 * Claude Code Session Manager — CR-5.1 Phase 2
 *
 * Maintains ONE long-running `query()` call per relay channel.
 * New user messages are pushed into an `AsyncQueue<SDKUserMessage>` that feeds
 * the single SDK process.  The `drainLoop` resolves each pending turn when
 * `type === 'result'` fires.  A 10-minute idle timer tears the session down
 * cleanly; a stale-activity detector (90s no SDK events) catches hung turns.
 *
 *  IDLE ──[first message]──▶ BOOTING ──[SDK ready]──▶ RUNNING
 *    ▲                                                    │
 *    └──[10-min idle / channel empty]──[interrupt]──TEARDOWN──▶ IDLE
 */

import * as path from 'path';
import * as fs from 'fs';
import { query, type SDKUserMessage, type Query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { buildSystemPrompt } from './system-prompt';
import { detectBrief } from './brief-detector';
import type { ClaudeCodeTurnResult, ClaudeCodeTurnError } from './claude-code-handler';
import { FIGMENTO_DESIGN_PROMPT, withSessionContext } from './figmento-design-prompt';
import {
  type AgentSessionManager,
  type ProgressCallback,
  HARD_TIMEOUT_MS,
  STALE_ACTIVITY_MS,
  TOOL_BUDGETS,
  STALE_CHECK_INTERVAL_MS,
  THINKING_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  FIGMENTO_DISABLED_TOOLS,
} from './agent-session-manager';

// ═══════════════════════════════════════════════════════════════
// .env LOADER — reads project root .env into process.env
// ═══════════════════════════════════════════════════════════════

function loadRootEnv(): void {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // .env values OVERRIDE system env (project config takes precedence)
    if (value) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();
console.log(`[Figmento Claude Code] .env loaded — GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.slice(0, 8) + '...' : 'NOT SET'}`);

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
//
// Lifecycle constants (HARD_TIMEOUT_MS, STALE_ACTIVITY_MS, TOOL_BUDGETS,
// STALE_CHECK_INTERVAL_MS, THINKING_TIMEOUT_MS, IDLE_TIMEOUT_MS) are
// imported from agent-session-manager.ts so both engines share them.

const MCP_SERVER_PATH = path.resolve(
  __dirname,
  '../../../figmento-mcp-server/dist/index.js',
);


// ═══════════════════════════════════════════════════════════════
// ASYNC QUEUE (P2-1)
// A push/pull buffer backed by an async iterator.  close() terminates
// the iterator cleanly so the SDK's streamInput loop exits gracefully.
// ═══════════════════════════════════════════════════════════════

class AsyncQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private waiting: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    if (this.waiting.length > 0) {
      this.waiting.shift()!({ value: item, done: false });
    } else {
      this.buffer.push(item);
    }
  }

  /** Signal end-of-stream.  The SDK's streamInput loop exits; the daemon gets EOF. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.waiting.length > 0) {
      this.waiting.shift()!({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiting.push(resolve);
        });
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// SDK MESSAGE HELPERS
// ═══════════════════════════════════════════════════════════════

/** Construct the SDKUserMessage shape the SDK expects over the AsyncIterable path. */
function makeUserMessage(
  text: string,
  sessionId = '',
  attachmentBase64?: string,
  fileAttachments?: Array<{ name: string; type: string; dataUri: string }>,
): SDKUserMessage {
  const content: any[] = [];

  // Include image attachment if provided (data URI → base64 content block)
  if (attachmentBase64) {
    const commaIdx = attachmentBase64.indexOf(',');
    const meta = commaIdx > 0 ? attachmentBase64.slice(0, commaIdx) : '';
    const base64Data = commaIdx > 0 ? attachmentBase64.slice(commaIdx + 1) : attachmentBase64;
    // Extract MIME from "data:image/png;base64" prefix
    const mimeMatch = meta.match(/data:([^;]+)/);
    const mediaType = mimeMatch?.[1] || 'image/png';

    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64Data },
    });
  }

  // ODS-1a: Include non-image file attachments (PDFs, TXT, SVG) as text context
  if (fileAttachments && fileAttachments.length > 0) {
    const fileContextParts: string[] = [];
    for (const f of fileAttachments) {
      // Extract raw content from data URI
      const commaIdx = f.dataUri.indexOf(',');
      const rawData = commaIdx > 0 ? f.dataUri.slice(commaIdx + 1) : f.dataUri;

      if (f.type === 'application/pdf') {
        // PDF: include as document content block for Claude (base64)
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: rawData },
        });
      } else {
        // Text files (TXT, SVG): decode and include as text
        try {
          const decoded = Buffer.from(rawData, 'base64').toString('utf-8');
          fileContextParts.push(`[File: ${f.name}]\n${decoded}`);
        } catch {
          fileContextParts.push(`[File: ${f.name}] (could not decode)`);
        }
      }
    }
    if (fileContextParts.length > 0) {
      text += '\n\n[ATTACHED FILE CONTENTS]\n' + fileContextParts.join('\n\n');
    }
  }

  content.push({ type: 'text', text });

  return {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
    parent_tool_use_id: null,
    session_id: sessionId,
  };
}

// ═══════════════════════════════════════════════════════════════
// SESSION SHAPE (P2-2)
// ═══════════════════════════════════════════════════════════════

interface PendingTurn {
  resolve: (r: ClaudeCodeTurnResult) => void;
  reject: (e: Error) => void;
}

// ProgressCallback is imported from agent-session-manager.ts (shared by both engines).
// Re-export so existing handler import paths keep working.
export type { ProgressCallback } from './agent-session-manager';

interface ClaudeCodeSession {
  /** Message queue fed into the long-running query(). */
  queue: AsyncQueue<SDKUserMessage>;
  /** The live SDK query object — used for interrupt() on teardown. */
  queryObj: Query;
  /** AbortController for graceful cancellation. */
  abortController: AbortController;
  /** Resolves / rejects when the current turn's `type === 'result'` fires. */
  pendingTurn: PendingTurn | null;
  /** Accumulated assistant text for the current turn. */
  accumText: string;
  /** Accumulated tool calls for the current turn. */
  accumToolCalls: Array<{ name: string; success: boolean }>;
  /** Conversation history as it was at the START of the current turn. */
  turnHistory: Array<{ role: string; content: string }>;
  /** User message text for the current turn (used to extend history on result). */
  turnMessage: string;
  /** Last session_id captured from a result message — used on next push. */
  lastSessionId: string;
  /** True while a turn is in-flight — concurrency guard. */
  inFlight: boolean;
  /** Idle-teardown timer (10 min after last result). */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Per-turn hard-timeout timer. */
  turnTimer: ReturnType<typeof setTimeout> | null;
  /** Stale activity checker interval. */
  staleChecker: ReturnType<typeof setInterval> | null;
  /** Timestamp of last SDK event received during current turn. */
  lastActivity: number;
  /** True after the first tool_use event — stale detection only activates after this. */
  hasCalledTool: boolean;
  /** Currently-active tool name (set on tool_use event, cleared when next tool starts or turn ends). */
  activeToolName: string | null;
  /** Timestamp when the active tool started — used to enforce per-tool budget. */
  activeToolStartTime: number;
  /** Optional callback to stream progress events to the UI. */
  onProgress: ProgressCallback | null;
}

// ═══════════════════════════════════════════════════════════════
// SESSION MANAGER
// ═══════════════════════════════════════════════════════════════

export class ClaudeCodeSessionManager implements AgentSessionManager {
  private readonly sessions = new Map<string, ClaudeCodeSession>();

  // ─── PUBLIC: turn() ─────────────────────────────────────────

  /**
   * Execute one user turn on `channel`.
   *
   * - First call: boots a new long-running session (cold start).
   * - Subsequent calls: pushes the message into the existing queue — no new
   *   subprocess, no new MCP WebSocket connection.
   * - Concurrent calls on the same channel are rejected immediately (AC13).
   */
  async turn(
    channel: string,
    message: string,
    history: Array<{ role: string; content: string }>,
    memory: string[] | undefined,
    model?: string,
    imageModel?: string,
    attachmentBase64?: string,
    fileAttachments?: Array<{ name: string; type: string; dataUri: string }>,
    onProgress?: ProgressCallback,
  ): Promise<ClaudeCodeTurnResult | ClaudeCodeTurnError> {
    let session = this.sessions.get(channel);

    // Concurrency guard
    if (session?.inFlight) {
      return {
        type: 'claude-code-turn-result',
        channel,
        error: 'A Claude Code turn is already in progress on this channel.',
      };
    }

    // Cancel idle timer when a new turn arrives
    if (session?.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }

    // Boot a fresh session if none exists
    if (!session) {
      console.log(`[Figmento Claude Code] Booting new session channel=${channel} model=${model ?? 'default'}`);
      session = this.startSession(channel, history, memory, model, imageModel);
    }

    // Stage turn context before pushing (drain loop reads these fields)
    session.inFlight = true;
    session.turnMessage = message;
    session.turnHistory = history;
    session.accumText = '';
    session.accumToolCalls = [];
    session.lastActivity = Date.now();
    session.hasCalledTool = false;
    session.activeToolName = null;
    session.activeToolStartTime = 0;
    session.onProgress = onProgress || null;

    // Promise that resolves when drainLoop fires type === 'result'
    const resultPromise = new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
      session!.pendingTurn = { resolve, reject };
    });

    // Stale activity checker — covers both thinking and tool phases.
    const staleChecker = setInterval(() => {
      const s = this.sessions.get(channel);
      if (!s?.pendingTurn) { clearInterval(staleChecker); return; }
      const elapsed = Date.now() - s.lastActivity;

      // Phase 1: Thinking (no tools called yet) — 2 min timeout
      if (!s.hasCalledTool && elapsed >= THINKING_TIMEOUT_MS) {
        console.error(`[Figmento Claude Code] Thinking timeout channel=${channel} — no SDK activity for ${Math.round(elapsed / 1000)}s (no tools called). Aborting.`);
        clearInterval(staleChecker);
        s.abortController.abort();
        s.pendingTurn.reject(
          new Error(`Claude Code turn timed out during thinking (${Math.round(THINKING_TIMEOUT_MS / 1000)}s). The model may be overloaded. Try again.`),
        );
        s.pendingTurn = null;
        s.inFlight = false;
        this.destroy(channel);
        return;
      }

      // Phase 2: Tool execution — per-tool budget (resets on every SDK event,
      // including tool_progress messages emitted during long-running tools).
      // Falls back to STALE_ACTIVITY_MS for tools without an explicit budget.
      if (s.hasCalledTool) {
        const activeBudget = s.activeToolName
          ? (TOOL_BUDGETS[s.activeToolName] ?? STALE_ACTIVITY_MS)
          : STALE_ACTIVITY_MS;
        if (elapsed >= activeBudget) {
          const toolLabel = s.activeToolName ? `during '${s.activeToolName}'` : 'between tool calls';
          console.error(`[Figmento Claude Code] Stale turn detected channel=${channel} ${toolLabel} — no SDK activity for ${Math.round(elapsed / 1000)}s (budget ${Math.round(activeBudget / 1000)}s). Aborting.`);
          clearInterval(staleChecker);
          s.abortController.abort();
          s.pendingTurn.reject(
            new Error(`Claude Code turn stalled ${toolLabel} — no activity for ${Math.round(elapsed / 1000)}s. Try a simpler request.`),
          );
          s.pendingTurn = null;
          s.inFlight = false;
          this.destroy(channel);
        }
      }
    }, STALE_CHECK_INTERVAL_MS);
    session.staleChecker = staleChecker;

    // Hard safety-net timeout (10 min) — only fires if stale detection fails
    const turnTimer = setTimeout(() => {
      const s = this.sessions.get(channel);
      if (s?.pendingTurn) {
        s.pendingTurn.reject(
          new Error(`Claude Code turn timed out after ${HARD_TIMEOUT_MS / 1000} seconds.`),
        );
        s.pendingTurn = null;
        s.inFlight = false;
      }
      this.destroy(channel);
    }, HARD_TIMEOUT_MS);
    session.turnTimer = turnTimer;

    // Push the user message into the queue → SDK receives it → starts the turn
    session.queue.push(makeUserMessage(message, session.lastSessionId, attachmentBase64, fileAttachments));

    console.log(
      `[Figmento Claude Code] Turn pushed channel=${channel} ` +
      `session=${session.lastSessionId || 'new'} history=${history.length} msgs`,
    );

    try {
      const result = await resultPromise;
      clearTimeout(turnTimer);
      clearInterval(staleChecker);
      return result;
    } catch (err) {
      clearTimeout(turnTimer);
      clearInterval(staleChecker);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // Auto-recovery: orphaned tool_use blocks corrupt the session.
      // Destroy and retry once with a fresh session.
      const isOrphanedToolUse = errorMessage.includes('tool_use ids were found without tool_result');
      if (isOrphanedToolUse) {
        console.log(`[Figmento Claude Code] Orphaned tool_use detected channel=${channel} — destroying session and retrying`);
        this.destroy(channel);

        // Retry with a fresh session — pass history so context is preserved in system prompt
        const freshSession = this.startSession(channel, history, memory, model, imageModel);
        freshSession.inFlight = true;
        freshSession.turnMessage = message;
        freshSession.turnHistory = history;
        freshSession.lastActivity = Date.now();
        freshSession.onProgress = onProgress || null;

        const retryPromise = new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
          freshSession.pendingTurn = { resolve, reject };
        });

        freshSession.queue.push(makeUserMessage(message, '', attachmentBase64, fileAttachments));
        console.log(`[Figmento Claude Code] Retry pushed channel=${channel} (fresh session)`);

        try {
          const retryResult = await retryPromise;
          return retryResult;
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : 'Unknown error on retry';
          return { type: 'claude-code-turn-result', channel, error: retryMsg };
        }
      }

      return { type: 'claude-code-turn-result', channel, error: errorMessage };
    }
  }

  // ─── PUBLIC: destroy() ──────────────────────────────────────

  /**
   * Tear down the session for `channel`.
   * Called by relay.ts when the channel drops to zero clients, or on error/timeout.
   */
  destroy(channel: string): void {
    const session = this.sessions.get(channel);
    if (!session) return;

    console.log(`[Figmento Claude Code] Destroying session channel="${channel}"`);

    // Clear timers
    if (session.idleTimer) { clearTimeout(session.idleTimer); session.idleTimer = null; }
    if (session.turnTimer) { clearTimeout(session.turnTimer); session.turnTimer = null; }
    if (session.staleChecker) { clearInterval(session.staleChecker); session.staleChecker = null; }

    // Abort via controller (signals the SDK to stop)
    session.abortController.abort();

    // Close the queue — ends streamInput loop → daemon gets EOF → exits
    session.queue.close();

    // Interrupt the running query for a faster teardown
    session.queryObj.interrupt().catch(() => { /* ignore — process may already be dead */ });

    this.sessions.delete(channel);
  }

  /** List channels with active sessions. */
  activeChannels(): string[] {
    return [...this.sessions.keys()];
  }

  /** Count of currently in-flight turns (for /health endpoint). */
  activeCount(): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.inFlight) count++;
    }
    return count;
  }

  // ─── PRIVATE: startSession() ────────────────────────────────

  /**
   * Create a new long-running session:
   * 1. Build the system prompt from the first message's brief detection.
   * 2. Create the AsyncQueue and start the SDK query.
   * 3. Launch drainLoop asynchronously.
   */
  private startSession(
    channel: string,
    history: Array<{ role: string; content: string }>,
    memory: string[] | undefined,
    model?: string,
    imageModel?: string,
  ): ClaudeCodeSession {
    const queue = new AsyncQueue<SDKUserMessage>();
    const abortController = new AbortController();

    // System prompt is built once per session — from the channel context.
    // Image-model preference + history injection live in the shared helper so
    // both engines (Claude Code, Codex) carry identical context across switches.
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content ?? '';
    const brief = detectBrief(lastUserMsg);
    const basePrompt = buildSystemPrompt(brief, memory);
    const systemPrompt = withSessionContext(basePrompt, history, imageModel);

    // Resolve project root so the SDK reads .claude/settings.json (deniedMcpServers etc.)
    const projectRoot = path.resolve(__dirname, '../../..');

    console.log(`[Figmento Claude Code] MCP server path: ${MCP_SERVER_PATH}`);
    console.log(`[Figmento Claude Code] Project root (cwd): ${projectRoot}`);

    const options: Options = {
      cwd: projectRoot,
      abortController,
      // SDK 2.x consolidated customSystemPrompt + appendSystemPrompt into a single systemPrompt field.
      // Concatenate manually to preserve previous behavior (custom prompt + design rules appended).
      systemPrompt: systemPrompt + '\n\n' + FIGMENTO_DESIGN_PROMPT,
      maxTurns: 25,
      // SDK 2.x: maxThinkingTokens is deprecated. Use thinking config instead.
      // 'enabled' with fixed budget = predictable thinking cost; 'adaptive' = model decides per turn.
      thinking: { type: 'enabled', budgetTokens: 12288 },
      permissionMode: 'bypassPermissions',
      model: model || 'claude-sonnet-4-6',
      // Tool surface reduction: 109 → 55 visible tools (109 figmento + 6 SDK file tools).
      // The shared FIGMENTO_DISABLED_TOOLS list keeps Codex and Claude Code aligned.
      // Hidden tools remain callable via batch_execute DSL (plugin-side actions).
      disallowedTools: [
        // File system tools — design sessions don't need local file ops
        'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
        // Figmento-specific MCP tools (shared with Codex)
        ...FIGMENTO_DISABLED_TOOLS.map((t) => `mcp__figmento__${t}`),
      ],
      stderr: (data: string) => {
        const t = data.trim();
        if (t) console.error(`[SDK] ${t}`);
      },
      mcpServers: {
        figmento: {
          command: 'node',
          args: [MCP_SERVER_PATH],
          env: Object.fromEntries(
            Object.entries({
              FIGMENTO_CHANNEL: channel,
              FIGMENTO_RELAY_URL: 'ws://localhost:3055',
              GEMINI_API_KEY: process.env.GEMINI_API_KEY,
              ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
              IMAGE_OUTPUT_DIR: process.env.IMAGE_OUTPUT_DIR,
              PATH: process.env.PATH,
              NODE_PATH: process.env.NODE_PATH,
              SYSTEMROOT: process.env.SYSTEMROOT,
              TEMP: process.env.TEMP,
              TMP: process.env.TMP,
              APPDATA: process.env.APPDATA,
              USERPROFILE: process.env.USERPROFILE,
              HOME: process.env.HOME,
            }).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''),
          ),
        },
      },
    };

    // Single long-running query — feeds from the AsyncQueue
    const queryObj = query({ prompt: queue as unknown as AsyncIterable<SDKUserMessage>, options });

    const session: ClaudeCodeSession = {
      queue,
      queryObj,
      abortController,
      pendingTurn: null,
      accumText: '',
      accumToolCalls: [],
      turnHistory: history,
      turnMessage: '',
      lastSessionId: '',
      inFlight: false,
      idleTimer: null,
      turnTimer: null,
      staleChecker: null,
      lastActivity: Date.now(),
      hasCalledTool: false,
      activeToolName: null,
      activeToolStartTime: 0,
      onProgress: null,
    };

    this.sessions.set(channel, session);

    // drainLoop runs for the lifetime of the session (non-blocking)
    this.drainLoop(channel, queryObj).catch((err) => {
      console.error(`[Figmento Claude Code] Drain loop fatal error channel=${channel}:`, err);
      this.destroy(channel);
    });

    return session;
  }

  // ─── PRIVATE: drainLoop() ───────────────────────────────────

  /**
   * Consume the SDK's output stream for the lifetime of the session.
   *
   * - Accumulates text and tool calls for the current turn.
   * - On `type === 'result'`: resolves pendingTurn, resets turn state, starts
   *   the 10-min idle timer.
   * - On error: rejects pendingTurn, destroys the session.
   */
  private async drainLoop(channel: string, queryObj: Query): Promise<void> {
    try {
      for await (const msg of queryObj) {
        const session = this.sessions.get(channel);
        if (!session) break; // Session was destroyed while iterating

        // Reset stale activity timer on ANY SDK event
        session.lastActivity = Date.now();

        // Debug: log message types to understand SDK 2.x event timing
        if (process.env.FIGMENTO_SDK_DEBUG === '1') {
          console.log(`[SDK msg] type=${(msg as { type?: string }).type ?? 'unknown'} subtype=${(msg as { subtype?: string }).subtype ?? '-'}`);
        }

        if (msg.type === 'assistant') {
          const content = (msg as any).message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                session.accumText = block.text;
              } else if (block.type === 'tool_use') {
                const toolName = (block as any).name as string;
                session.accumToolCalls.push({ name: toolName, success: true });
                session.hasCalledTool = true;
                // Track active tool for per-tool budget (key by Figmento-stripped name to match TOOL_BUDGETS)
                session.activeToolName = toolName.replace('mcp__figmento__', '');
                session.activeToolStartTime = Date.now();
                // Stream progress to UI
                if (session.onProgress) {
                  try {
                    session.onProgress({
                      type: 'tool_start',
                      toolName: session.activeToolName,
                      toolIndex: session.accumToolCalls.length,
                    });
                  } catch { /* non-critical */ }
                }
              }
            }
          }
        } else if (msg.type === 'tool_progress') {
          // SDK 2.x emits tool_progress periodically during long-running tool calls.
          // The lastActivity reset (line above) already prevents stale timeout — we just
          // need to forward to the UI so it can show "still working..." feedback.
          const progressMsg = msg as { tool_name?: string; elapsed_time_seconds?: number };
          if (session.onProgress && progressMsg.tool_name) {
            try {
              session.onProgress({
                type: 'tool_progress',
                toolName: progressMsg.tool_name.replace('mcp__figmento__', ''),
                elapsedSeconds: progressMsg.elapsed_time_seconds,
              });
            } catch { /* non-critical */ }
          }
        } else if (msg.type === 'auth_status') {
          // SDK 2.x emits auth_status when re-authenticating (token rotation, OAuth refresh).
          // Surface to UI so it can show a status indicator instead of looking frozen.
          const authMsg = msg as { isAuthenticating?: boolean; error?: string };
          if (session.onProgress) {
            try {
              session.onProgress({
                type: 'auth_status',
                isAuthenticating: authMsg.isAuthenticating ?? false,
                authError: authMsg.error,
              });
            } catch { /* non-critical */ }
          }
        } else if (msg.type === 'result') {
          const resultMsg = msg as any;
          if (resultMsg.subtype === 'success' && resultMsg.result) {
            session.accumText = resultMsg.result;
          }

          // Capture session_id for the next message push
          if (resultMsg.session_id) session.lastSessionId = resultMsg.session_id;

          // Clear active tool tracking (turn done)
          session.activeToolName = null;
          session.activeToolStartTime = 0;

          // Clear per-turn timers
          if (session.turnTimer) { clearTimeout(session.turnTimer); session.turnTimer = null; }
          if (session.staleChecker) { clearInterval(session.staleChecker); session.staleChecker = null; }

          // Build updated history
          const updatedHistory = [
            ...session.turnHistory,
            { role: 'user', content: session.turnMessage },
            { role: 'assistant', content: session.accumText },
          ];

          const result: ClaudeCodeTurnResult = {
            type: 'claude-code-turn-result',
            channel,
            text: session.accumText,
            toolCalls: session.accumToolCalls,
            history: updatedHistory,
            completedCleanly: !resultMsg.is_error,
          };

          console.log(
            `[Figmento Claude Code] Turn complete channel=${channel} ` +
            `sessionId=${session.lastSessionId} toolCalls=${result.toolCalls.length} ` +
            `text=${result.text.length}c`,
          );

          // Resolve the waiting turn() Promise
          session.pendingTurn?.resolve(result);
          session.pendingTurn = null;
          session.inFlight = false;

          // Reset accumulation buffers
          session.accumText = '';
          session.accumToolCalls = [];

          // Start idle timer — destroy after 10 min of inactivity (AC11)
          session.idleTimer = setTimeout(() => {
            console.log(`[Figmento Claude Code] Idle timeout channel="${channel}" — destroying session`);
            this.destroy(channel);
          }, IDLE_TIMEOUT_MS);
        }
      }

      // Generator exhausted cleanly (queue closed or maxTurns reached)
      console.log(`[Figmento Claude Code] Session ended cleanly channel="${channel}"`);
    } catch (err) {
      // Error during drain — reject pending turn and destroy session (AC12)
      const session = this.sessions.get(channel);
      if (session?.pendingTurn) {
        session.pendingTurn.reject(err instanceof Error ? err : new Error(String(err)));
        session.pendingTurn = null;
      }
      console.error(`[Figmento Claude Code] Session error channel="${channel}":`, err);
      this.destroy(channel);
    }
  }
}

/** Module-level singleton — instantiated once at relay startup. */
export const sessionManager = new ClaudeCodeSessionManager();
