/**
 * Claude Code Session Manager — CR-5.1 Phase 2
 *
 * Maintains ONE long-running `query()` call per relay channel.
 * New user messages are pushed into an `AsyncQueue<SDKUserMessage>` that feeds
 * the single SDK process.  The `drainLoop` resolves each pending turn when
 * `type === 'result'` fires.  A 10-minute idle timer tears the session down
 * cleanly; a 180-second per-turn timer prevents hung turns.
 *
 *  IDLE ──[first message]──▶ BOOTING ──[SDK ready]──▶ RUNNING
 *    ▲                                                    │
 *    └──[10-min idle / channel empty]──[interrupt]──TEARDOWN──▶ IDLE
 */

import * as path from 'path';
import { query, type SDKUserMessage, type Query, type Options } from '@anthropic-ai/claude-code';
import { buildSystemPrompt } from './system-prompt';
import { detectBrief } from './brief-detector';
import type { ClaudeCodeTurnResult, ClaudeCodeTurnError } from './claude-code-handler';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const CLAUDE_CODE_TIMEOUT_MS = 600_000;  // per-turn hard limit (10 min — complex designs need tool loops)
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10-min session idle teardown

const MCP_SERVER_PATH = path.resolve(
  __dirname,
  '../../../figmento-mcp-server/dist/index.js',
);

/**
 * Condensed design prompt appended to Claude Code sessions.
 * Gives the SDK session design awareness without duplicating the full system prompt.
 * The full design rules are accessible via tools (get_design_guidance, get_design_rules, lookup_*).
 */
const CLAUDE_CODE_DESIGN_PROMPT = `
## Figmento Design Agent — Enhanced Mode

You have access to Figmento MCP tools (prefixed mcp__figmento__) for creating designs in Figma. Use them with expert-level design reasoning.

**CRITICAL: ONLY use mcp__figmento__* tools. NEVER use mcp__pencil__* tools or any other MCP tools. Pencil is a different editor — it does NOT connect to Figma. If you see Pencil tools available, IGNORE them completely.**

### Core Design Rules
- ALWAYS set layoutSizingVertical to HUG on content frames. NEVER leave fixed height on dynamic content.
- ALWAYS set layoutSizingHorizontal to FILL on text inside auto-layout frames.
- Use auto-layout on ALL container frames. Never use absolute positioning inside auto-layout parents.
- fontWeight: ONLY use 400 (Regular) or 700 (Bold). NEVER use 600 — it causes Inter fallback on non-Inter fonts.
- lineHeight: ALWAYS pass in PIXELS (fontSize × multiplier). NEVER pass a raw multiplier like 1.5.
- Give every element a descriptive layer name. Never leave "Rectangle" or "Text" defaults.
- Create exactly ONE root frame per design. Never create duplicates.
- ALWAYS end your response with a clear completion summary. NEVER end on "Now let me..." without completing the action.

### One-Click Design System Pipeline
When user asks to generate/create a design system:
1. Call analyze_brief with the brief text and brand name
2. Call generate_design_system_in_figma with the BrandAnalysis result
3. The pipeline creates: ~65 variables (4 collections), 8 text styles, 3 components, and a visual showcase page
4. After pipeline completes, the showcase is ALREADY complete — do NOT create additional loose elements

### Design Intelligence Tools
Use these for expert decisions — never hardcode or guess values:
- get_design_guidance(aspect="color|fonts|size|typeScale|spacing|layout") — knowledge base lookups
- get_design_rules(category="typography|color|layout|refinement|evaluation") — detailed rules
- get_layout_blueprint(category, mood) — proportional zone layouts
- find_design_references(category, mood) — inspiration from reference library
- run_refinement_check(nodeId) — automated quality feedback

### Typography Quick Reference
Line Height: Display (>48px) 1.1–1.2 | Headings 1.2–1.3 | Body 1.5–1.6 | Captions 1.4–1.5
Letter Spacing: Display -0.02em | Headings -0.01em | Body 0 | Uppercase +0.05–0.15em
Minimum Sizes (Social 1080px): Headline 48–72px | Sub 32–40px | Body 28–32px | Caption 22–26px

### Spacing (8px grid)
Scale: 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128
Margins: Social 48px | Print 72px | Web 64px

### Overlay Gradient Rules
Text at BOTTOM → direction "top-bottom" | Text at TOP → "bottom-top"
EXACTLY 2 stops. Gradient color MUST match section background. Solid end = where text is.
`;

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

interface ClaudeCodeSession {
  /** Message queue fed into the long-running query(). */
  queue: AsyncQueue<SDKUserMessage>;
  /** The live SDK query object — used for interrupt() on teardown. */
  queryObj: Query;
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
  /** Per-turn hard-timeout timer (180 s). */
  turnTimer: ReturnType<typeof setTimeout> | null;
}

// ═══════════════════════════════════════════════════════════════
// SESSION MANAGER
// ═══════════════════════════════════════════════════════════════

export class ClaudeCodeSessionManager {
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
    attachmentBase64?: string,
    fileAttachments?: Array<{ name: string; type: string; dataUri: string }>,
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
      session = this.startSession(channel, history, memory, model);
    }

    // Stage turn context before pushing (drain loop reads these fields)
    session.inFlight = true;
    session.turnMessage = message;
    session.turnHistory = history;
    session.accumText = '';
    session.accumToolCalls = [];

    // Promise that resolves when drainLoop fires type === 'result'
    const resultPromise = new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
      session!.pendingTurn = { resolve, reject };
    });

    // Per-turn 180-second hard timeout
    const turnTimer = setTimeout(() => {
      const s = this.sessions.get(channel);
      if (s?.pendingTurn) {
        s.pendingTurn.reject(
          new Error(`Claude Code turn timed out after ${CLAUDE_CODE_TIMEOUT_MS / 1000} seconds.`),
        );
        s.pendingTurn = null;
        s.inFlight = false;
      }
      // Session is in an undefined state after timeout — destroy it
      this.destroy(channel);
    }, CLAUDE_CODE_TIMEOUT_MS);
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
      return result;
    } catch (err) {
      clearTimeout(turnTimer);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
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
  ): ClaudeCodeSession {
    const queue = new AsyncQueue<SDKUserMessage>();

    // System prompt is built once per session — from the channel context
    // (We don't have the first message yet at this point; brief detection happens
    // inside turn() before calling startSession.  We use history to infer context.)
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content ?? '';
    const brief = detectBrief(lastUserMsg);
    const systemPrompt = buildSystemPrompt(brief, memory);

    // Resolve project root so the SDK reads .claude/settings.json (deniedMcpServers etc.)
    const projectRoot = path.resolve(__dirname, '../../..');

    console.log(`[Figmento Claude Code] MCP server path: ${MCP_SERVER_PATH}`);
    console.log(`[Figmento Claude Code] Project root (cwd): ${projectRoot}`);

    const options: Options = {
      cwd: projectRoot,
      customSystemPrompt: systemPrompt,
      appendSystemPrompt: CLAUDE_CODE_DESIGN_PROMPT,
      maxTurns: 50,
      maxThinkingTokens: 10000,
      permissionMode: 'bypassPermissions',
      // Default to Sonnet for fast tool-calling; Opus is too slow for chat UX
      model: model || 'claude-sonnet-4-6',
      // Log all SDK subprocess output for debugging
      stderr: (data: string) => {
        const t = data.trim();
        if (t) console.error(`[SDK] ${t}`);
      },
      mcpServers: {
        figmento: {
          command: 'node',
          args: [MCP_SERVER_PATH],
          env: {
            FIGMENTO_CHANNEL: channel,
            FIGMENTO_RELAY_URL: 'ws://localhost:3055',
          },
        },
      },
    };

    // Single long-running query — feeds from the AsyncQueue
    const queryObj = query({ prompt: queue as unknown as AsyncIterable<SDKUserMessage>, options });

    const session: ClaudeCodeSession = {
      queue,
      queryObj,
      pendingTurn: null,
      accumText: '',
      accumToolCalls: [],
      turnHistory: history,
      turnMessage: '',
      lastSessionId: '',
      inFlight: false,
      idleTimer: null,
      turnTimer: null,
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

        if (msg.type === 'assistant') {
          const content = (msg as any).message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                session.accumText = block.text;
              } else if (block.type === 'tool_use') {
                session.accumToolCalls.push({ name: (block as any).name, success: true });
              }
            }
          }
        } else if (msg.type === 'result') {
          const resultMsg = msg as any;
          if (resultMsg.subtype === 'success' && resultMsg.result) {
            session.accumText = resultMsg.result;
          }

          // Capture session_id for the next message push
          if (resultMsg.session_id) session.lastSessionId = resultMsg.session_id;

          // Clear per-turn timer
          if (session.turnTimer) { clearTimeout(session.turnTimer); session.turnTimer = null; }

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
