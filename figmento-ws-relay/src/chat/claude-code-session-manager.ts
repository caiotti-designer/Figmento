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
  type ProgressCallback,
  type BaseSessionState,
  BaseSessionManager,
  HARD_TIMEOUT_MS,
  STALE_ACTIVITY_MS,
  TOOL_BUDGETS,
  STALE_CHECK_INTERVAL_MS,
  THINKING_TIMEOUT_MS,
  FIGMENTO_DISABLED_TOOLS,
  makeBaseSessionState,
  stageTurnState,
  buildTurnResult,
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

/**
 * Embedded Claude Code runs inside Figmento, not as the user's general CLI.
 *
 * Keep it isolated from global Claude settings/plugins/MCP servers; otherwise
 * Claude can defer Figmento MCP tools behind its internal ToolSearch and stall
 * before the design turn starts.
 */
const CLAUDE_SETTING_SOURCES: NonNullable<Options['settingSources']> = [];
const CLAUDE_BUILTIN_TOOLS: NonNullable<Options['tools']> = [];


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
// SESSION SHAPE
// ═══════════════════════════════════════════════════════════════

// ProgressCallback + BaseSessionState are imported from
// agent-session-manager.ts so both engines stay in lock-step.
// Re-export so existing handler import paths keep working.
export type { ProgressCallback } from './agent-session-manager';

/** Claude Code-specific session: base lifecycle fields + the long-running SDK handles. */
interface ClaudeCodeSession extends BaseSessionState {
  /** Message queue fed into the long-running query(). */
  queue: AsyncQueue<SDKUserMessage>;
  /** The live SDK query object — used for interrupt() on teardown. */
  queryObj: Query;
  /** AbortController for graceful cancellation. */
  abortController: AbortController;
  /** Last session_id captured from a result message — used on next push. */
  lastSessionId: string;
}

// ═══════════════════════════════════════════════════════════════
// SESSION MANAGER
// ═══════════════════════════════════════════════════════════════

export class ClaudeCodeSessionManager extends BaseSessionManager<ClaudeCodeSession> {
  protected readonly logPrefix = 'Figmento Claude Code';

  /** Engine-specific teardown beyond timer cleanup (queue close + abort + interrupt). */
  protected teardownEngine(session: ClaudeCodeSession): void {
    session.abortController.abort();
    session.queue.close();
    // Interrupt the running query for a faster teardown
    session.queryObj.interrupt().catch(() => { /* ignore — process may already be dead */ });
  }

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
    const guard = this.guardConcurrencyAndCancelIdle(channel, 'Claude Code');
    if (guard) return guard;

    let session = this.sessions.get(channel);

    // Boot a fresh session if none exists
    if (!session) {
      console.log(`[${this.logPrefix}] Booting new session channel=${channel} model=${model ?? 'default'}`);
      session = this.startSession(channel, history, memory, model, imageModel);
    }

    // Stage turn context before pushing (drain loop reads these fields)
    stageTurnState(session, message, history, onProgress);

    // Promise that resolves when drainLoop fires type === 'result'
    const resultPromise = new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
      session!.pendingTurn = { resolve, reject };
    });

    // Stale activity checker — covers both thinking and tool phases.
    const staleChecker = setInterval(() => {
      const s = this.sessions.get(channel);
      if (!s?.pendingTurn) { clearInterval(staleChecker); return; }

      // Anthropic rate-limit pause: while the SDK is waiting out a rate-limit
      // window, it emits no events. Skip the watchdog entirely until the bucket
      // resets (with a generous 30s fudge for retry roundtrip after reset).
      if (s.rateLimitedUntil > Date.now()) return;

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
          const hint = s.activeToolName
            ? `The model went silent while processing the tool result — retry the request.`
            : `The model paused between tool calls — retry the request.`;
          s.pendingTurn.reject(
            new Error(`Claude Code turn stalled ${toolLabel} — no activity for ${Math.round(elapsed / 1000)}s. ${hint}`),
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
        console.log(`[${this.logPrefix}] Orphaned tool_use detected channel=${channel} — destroying session and retrying`);
        this.destroy(channel);

        // Retry with a fresh session — pass history so context is preserved in system prompt
        const freshSession = this.startSession(channel, history, memory, model, imageModel);
        stageTurnState(freshSession, message, history, onProgress);

        const retryPromise = new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
          freshSession.pendingTurn = { resolve, reject };
        });

        // Re-arm the watchdogs on the fresh session — without these, if the
        // retry hangs (likely the same root cause that triggered the orphan),
        // the channel is held forever with no abort path.
        const retryStaleChecker = setInterval(() => {
          const s = this.sessions.get(channel);
          if (!s?.pendingTurn) { clearInterval(retryStaleChecker); return; }
          if (s.rateLimitedUntil > Date.now()) return;
          const elapsed = Date.now() - s.lastActivity;
          if (!s.hasCalledTool && elapsed >= THINKING_TIMEOUT_MS) {
            clearInterval(retryStaleChecker);
            s.abortController.abort();
            s.pendingTurn.reject(new Error(`Retry timed out during thinking (${Math.round(THINKING_TIMEOUT_MS / 1000)}s).`));
            s.pendingTurn = null;
            s.inFlight = false;
            this.destroy(channel);
            return;
          }
          if (s.hasCalledTool) {
            const budget = s.activeToolName ? (TOOL_BUDGETS[s.activeToolName] ?? STALE_ACTIVITY_MS) : STALE_ACTIVITY_MS;
            if (elapsed >= budget) {
              clearInterval(retryStaleChecker);
              s.abortController.abort();
              s.pendingTurn.reject(new Error(`Retry stalled — no SDK activity for ${Math.round(elapsed / 1000)}s.`));
              s.pendingTurn = null;
              s.inFlight = false;
              this.destroy(channel);
            }
          }
        }, STALE_CHECK_INTERVAL_MS);
        freshSession.staleChecker = retryStaleChecker;

        const retryHardTimer = setTimeout(() => {
          const s = this.sessions.get(channel);
          if (s?.pendingTurn) {
            s.pendingTurn.reject(new Error(`Retry timed out after ${HARD_TIMEOUT_MS / 1000} seconds.`));
            s.pendingTurn = null;
            s.inFlight = false;
          }
          this.destroy(channel);
        }, HARD_TIMEOUT_MS);
        freshSession.turnTimer = retryHardTimer;

        freshSession.queue.push(makeUserMessage(message, '', attachmentBase64, fileAttachments));
        console.log(`[Figmento Claude Code] Retry pushed channel=${channel} (fresh session)`);

        try {
          const retryResult = await retryPromise;
          clearInterval(retryStaleChecker);
          clearTimeout(retryHardTimer);
          return retryResult;
        } catch (retryErr) {
          clearInterval(retryStaleChecker);
          clearTimeout(retryHardTimer);
          const retryMsg = retryErr instanceof Error ? retryErr.message : 'Unknown error on retry';
          return { type: 'claude-code-turn-result', channel, error: retryMsg };
        }
      }

      return { type: 'claude-code-turn-result', channel, error: errorMessage };
    }
  }

  // destroy(), activeChannels(), activeCount() are inherited from BaseSessionManager.
  // The base's destroy() calls our teardownEngine() to abort + close queue + interrupt.

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

    // Resolve project root for stable paths. settingSources=[] below keeps this
    // embedded session isolated from the user's global/project Claude settings.
    const projectRoot = path.resolve(__dirname, '../../..');

    console.log(`[Figmento Claude Code] MCP server path: ${MCP_SERVER_PATH}`);
    console.log(`[Figmento Claude Code] Project root (cwd): ${projectRoot}`);

    const options: Options = {
      cwd: projectRoot,
      abortController,
      // SDK 2.x consolidated customSystemPrompt + appendSystemPrompt into a single systemPrompt field.
      // Concatenate manually to preserve previous behavior (custom prompt + design rules appended).
      systemPrompt: systemPrompt + '\n\n' + FIGMENTO_DESIGN_PROMPT,
      maxTurns: 18,
      // Design generation is tool-heavy. Extended thinking increases the silent
      // pre-tool window and has been the main source of Claude stalls locally.
      thinking: { type: 'disabled' },
      effort: 'low',
      settingSources: CLAUDE_SETTING_SOURCES,
      tools: CLAUDE_BUILTIN_TOOLS,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      model: model || 'claude-sonnet-4-6',
      // Tool surface reduction: 109 → 55 visible tools (109 figmento + 6 SDK file tools).
      // The shared FIGMENTO_DISABLED_TOOLS list keeps Codex and Claude Code aligned.
      // Hidden tools remain callable via batch_execute DSL (plugin-side actions).
      disallowedTools: [
        // File system tools — design sessions don't need local file ops
        'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
        // Claude SDK deferred MCP discovery; Figmento loads its MCP tools eagerly below.
        'mcp__figmento__ToolSearch',
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
          alwaysLoad: true,
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
      ...makeBaseSessionState(),
      turnHistory: history,
      queue,
      queryObj,
      abortController,
      lastSessionId: '',
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
          // SDK marks assistant turns that errored with one of:
          // 'authentication_failed' | 'billing_error' | 'rate_limit' | 'invalid_request'
          // | 'server_error' | 'unknown' | 'max_output_tokens'. Reject the pending
          // turn cleanly with a meaningful message instead of letting it stall.
          const assistantErr = (msg as any).error as string | undefined;
          if (assistantErr) {
            const message = assistantErr === 'rate_limit'
              ? `Anthropic rate-limited the request. Wait a few minutes or switch engine to Codex (OpenAI).`
              : assistantErr === 'authentication_failed'
                ? `Claude Code auth failed — re-authenticate via 'claude' CLI.`
                : assistantErr === 'max_output_tokens'
                  ? `Model hit the max output token limit. Ask it to be more concise or split the task.`
                  : `Model error: ${assistantErr}.`;
            console.error(`[Figmento Claude Code] Assistant error channel=${channel}: ${assistantErr}`);
            if (session.pendingTurn) {
              session.pendingTurn.reject(new Error(message));
              session.pendingTurn = null;
              session.inFlight = false;
            }
            if (session.staleChecker) { clearInterval(session.staleChecker); session.staleChecker = null; }
            if (session.turnTimer) { clearTimeout(session.turnTimer); session.turnTimer = null; }
            this.destroy(channel);
            return;
          }
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
        } else if (msg.type === 'rate_limit_event') {
          // Anthropic emits this when the user's plan rate-limit state changes
          // (status='allowed' / 'allowed_warning' / 'rejected'). On 'rejected'
          // the SDK silently waits until `resetsAt` before retrying, with no
          // intermediate events — that's what makes the watchdog kill turns
          // mid-wait. Push the watchdog out until reset and surface to UI.
          const rlMsg = msg as { rate_limit_info?: {
            status?: 'allowed' | 'allowed_warning' | 'rejected';
            resetsAt?: number;
            rateLimitType?: string;
            utilization?: number;
          }};
          const info = rlMsg.rate_limit_info ?? {};
          const status = info.status ?? 'allowed';
          // resetsAt is epoch SECONDS in the SDK; convert to ms.
          const resetsAtMs = typeof info.resetsAt === 'number' ? info.resetsAt * 1000 : 0;
          // Cap the watchdog pause at +10 min so a buggy resetsAt can't strand a session.
          const MAX_PAUSE_MS = 10 * 60 * 1000;
          const now = Date.now();
          if (status === 'rejected' || status === 'allowed_warning') {
            const pauseUntil = resetsAtMs > now
              ? Math.min(resetsAtMs + 30_000, now + MAX_PAUSE_MS)
              : now + 60_000; // no resetsAt → assume 60s wait
            session.rateLimitedUntil = pauseUntil;
            console.warn(
              `[Figmento Claude Code] Anthropic rate-limit ${status} channel=${channel} ` +
              `type=${info.rateLimitType ?? '?'} utilization=${info.utilization ?? '?'} ` +
              `resetsAt=${resetsAtMs ? new Date(resetsAtMs).toISOString() : '?'} ` +
              `watchdog paused for ${Math.round((pauseUntil - now) / 1000)}s`,
            );
          } else {
            // 'allowed' — clear any prior pause.
            session.rateLimitedUntil = 0;
          }
          if (session.onProgress) {
            try {
              session.onProgress({
                type: 'rate_limit',
                rateLimitStatus: status,
                rateLimitResetsAt: resetsAtMs || undefined,
                rateLimitType: info.rateLimitType,
                rateLimitUtilization: info.utilization,
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

          // Clear active tool tracking + per-turn timers (idleTimer stays — set below)
          session.activeToolName = null;
          session.activeToolStartTime = 0;
          if (session.turnTimer) { clearTimeout(session.turnTimer); session.turnTimer = null; }
          if (session.staleChecker) { clearInterval(session.staleChecker); session.staleChecker = null; }

          const result = buildTurnResult(session, channel, !resultMsg.is_error);

          console.log(
            `[${this.logPrefix}] Turn complete channel=${channel} ` +
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
          this.scheduleIdleTeardown(channel, session);
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
