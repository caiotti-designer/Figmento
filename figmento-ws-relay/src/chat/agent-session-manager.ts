/**
 * Agent Session Manager — common interface for engine-specific session managers.
 *
 * Two implementations:
 *   - ClaudeCodeSessionManager (claude-code-session-manager.ts) — Anthropic Agent SDK
 *   - CodexSessionManager     (codex-session-manager.ts)        — OpenAI Codex SDK
 *
 * Both engines run a long-running per-channel session with the same MCP server
 * (figmento-mcp-server), the same FIGMENTO_DESIGN_PROMPT, and identical lifecycle
 * semantics (boot on first message, idle teardown, stale detection, retry on
 * orphaned tool_use). The relay/handler layer dispatches turns to the correct
 * implementation based on the request's `engine` field.
 *
 * Wire-format compatibility: both engines return the same ClaudeCodeTurnResult /
 * ClaudeCodeTurnError shapes (named `claude-code-turn-result` for backward
 * compatibility with the plugin's bridge handler — the type literal is a wire
 * tag, not an engine identifier).
 */

import type { ClaudeCodeTurnResult, ClaudeCodeTurnError } from './claude-code-handler';

// ═══════════════════════════════════════════════════════════════
// SHARED CONSTANTS — used by both engines
// ═══════════════════════════════════════════════════════════════

/** Hard safety-net timeout — only fires if stale detection fails. */
export const HARD_TIMEOUT_MS = 600_000; // 10 min absolute max

/**
 * Stale activity timeout — if no SDK event arrives in this window, abort the turn.
 *
 * Anthropic rate-limit waits are NOT counted toward this — when the SDK emits a
 * `rate_limit_event` with status=rejected/allowed_warning, the watchdog is paused
 * until the bucket resets (handled in claude-code-session-manager.ts). So 90s is
 * a tight-but-fair budget for genuine SDK silence, not "model is rate-limited."
 * Per-tool overrides below are reserved for tools whose execution itself is
 * known to be slow (image gen).
 */
export const STALE_ACTIVITY_MS = 90_000;

/** Per-tool execution budgets — milliseconds before a tool call is considered stalled. */
export const TOOL_BUDGETS: Record<string, number> = {
  generate_design_image: 180_000,        // image tool has its own 75s API timeout + fallback
  set_image_fill: 180_000,               // image placement/fallback can still be slower than canvas ops
};

/** Stale check interval — how often we poll for activity. */
export const STALE_CHECK_INTERVAL_MS = 10_000;

/** Thinking-phase timeout — if no SDK event at all in this window (before any tool call), abort. */
export const THINKING_TIMEOUT_MS = 120_000;

/** Session idle teardown — destroy session after this long with no activity. */
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════
// PROGRESS CALLBACK — both engines emit identical events
// ═══════════════════════════════════════════════════════════════

/** Callback for streaming progress updates to the UI during a turn. */
export type ProgressCallback = (event: {
  type: 'tool_start' | 'tool_done' | 'thinking' | 'tool_progress' | 'auth_status' | 'rate_limit';
  toolName?: string;
  toolIndex?: number;
  totalTools?: number;
  /** For tool_progress: seconds elapsed inside the tool. */
  elapsedSeconds?: number;
  /** For auth_status: whether the engine is currently re-authenticating. */
  isAuthenticating?: boolean;
  /** For auth_status: optional error string if auth failed. */
  authError?: string;
  /** For rate_limit: 'allowed' | 'allowed_warning' | 'rejected' from Anthropic. */
  rateLimitStatus?: 'allowed' | 'allowed_warning' | 'rejected';
  /** For rate_limit: epoch ms when the bucket resets (if known). */
  rateLimitResetsAt?: number;
  /** For rate_limit: which bucket (five_hour, seven_day, etc). */
  rateLimitType?: string;
  /** For rate_limit: 0–1 utilization. */
  rateLimitUtilization?: number;
}) => void;

// ═══════════════════════════════════════════════════════════════
// AGENT IDENTIFIER
// ═══════════════════════════════════════════════════════════════

/** Identifier for which engine handles a turn. */
export type AgentEngine = 'claude-code' | 'codex';

/**
 * Figmento MCP tools the agent should NOT see. Same surface for both engines so
 * Claude Code and Codex pick from the identical set of ~55 design tools.
 *
 * Names are bare (no `mcp__figmento__` prefix) — engine-specific code prepends
 * its own prefix (Claude Code) or passes them as-is (Codex `disabled_tools`).
 */
export const FIGMENTO_DISABLED_TOOLS: string[] = [
  // Connection — never needed (sessions end naturally)
  'disconnect_from_figma',
  // Canvas — trivial via batch_execute or redundant
  'create_carousel',
  'create_presentation',
  'fetch_placeholder_image',
  'evaluate_design',
  // Scene — advanced vector ops, never used
  'boolean_operation',
  'flatten_nodes',
  'export_as_svg',
  'set_constraints',
  'import_component_by_key',
  'import_style_by_key',
  'list_available_fonts',
  // Intelligence — redundant with consolidated tools
  'generate_accessible_palette',
  'suggest_font_pairing',
  'get_contrast_check',
  'evaluate_layout',
  // DS CRUD support — managed by pipeline
  'update_design_system',
  'delete_design_system',
  'refine_design_system',
  // Brand kit / assets — rarely used
  'get_brand_kit',
  'save_brand_kit',
  'save_brand_assets',
  'load_brand_assets',
  'list_brand_assets',
  // File storage — support tools
  'store_temp_file',
  'list_temp_files',
  'place_brand_asset',
  'import_pdf',
  // Ad analyzer — separate specialized flow
  'start_ad_analyzer',
  'complete_ad_analyzer',
  // Orchestration — model should compose primitives
  'design_from_reference',
  'generate_ad_variations',
  // References — CLAUDE.md guides usage, rarely called directly
  'find_design_references',
  'analyze_reference',
  'batch_analyze_references',
  // Figma native — DS pipeline handles these internally
  'create_figma_variables',
  'create_variable_collections',
  'create_ds_components',
  'create_variables_from_design_system',
  // Interactive components — entire module unused
  'convert_to_component',
  'combine_as_variants',
  'create_instance',
  'detach_instance',
  'set_reactions',
  'get_reactions',
  'apply_interaction',
  'list_interaction_presets',
  'make_interactive',
  'create_prototype_flow',
  // DS analysis — low usage, pipeline handles
  'design_system_preview',
  'brand_consistency_check',
  'get_layout_blueprint',
  // Learning — never used
  'get_learned_preferences',
  // Template — deprecated (scan_frame_structure replaces)
  'scan_template',
];

// ═══════════════════════════════════════════════════════════════
// MANAGER INTERFACE — both engines must implement this
// ═══════════════════════════════════════════════════════════════

export interface AgentSessionManager {
  /**
   * Execute one user turn on `channel`. First call boots a new long-running session;
   * subsequent calls reuse it. Concurrent calls on the same channel are rejected.
   */
  turn(
    channel: string,
    message: string,
    history: Array<{ role: string; content: string }>,
    memory: string[] | undefined,
    model?: string,
    imageModel?: string,
    attachmentBase64?: string,
    fileAttachments?: Array<{ name: string; type: string; dataUri: string }>,
    onProgress?: ProgressCallback,
  ): Promise<ClaudeCodeTurnResult | ClaudeCodeTurnError>;

  /** Tear down the session for `channel` (idle timeout, error, or explicit). */
  destroy(channel: string): void;

  /** List channels with active sessions. */
  activeChannels(): string[];

  /** Count of currently in-flight turns (for /health endpoint). */
  activeCount(): number;
}

// ═══════════════════════════════════════════════════════════════
// SHARED SESSION SHAPE + LIFECYCLE BASE
//
// Both engines previously duplicated ~70% of their session lifecycle —
// pendingTurn shape, accumulation buffers, timer fields, watchdog and idle
// teardown, destroy() boilerplate, activeChannels/activeCount. The drift
// (orphan-retry only on Claude, destroy-on-error only on Claude until tonight,
// auth_status only on Claude) was real and bit us in production.
//
// Strategy here is INTENTIONALLY conservative: we share the data shape, the
// shared bookkeeping helpers, and the shared `destroy/activeChannels/activeCount`
// methods, but each engine still owns its own `turn()` flow and its own
// event-stream parser — those legitimately differ (Claude runs ONE long-lived
// `query()` with an AsyncQueue feeding it; Codex calls `runStreamed()` per turn
// with a thread). Trying to unify those is more refactor than the value
// justifies right now.
// ═══════════════════════════════════════════════════════════════

/** Promise-bridge between the SDK's event stream and the awaiter of `turn()`. */
export interface PendingTurn {
  resolve: (r: ClaudeCodeTurnResult) => void;
  reject: (e: Error) => void;
}

/**
 * Fields every engine session carries. Engine-specific sessions extend this
 * with their own SDK handles (queue/queryObj for Claude, thread for Codex).
 *
 * `rateLimitedUntil` lives on the base shape even though only Claude Code
 * currently sets it — keeping it on every session means future Codex rate-limit
 * support is a one-line drainEvents change, no schema migration.
 */
export interface BaseSessionState {
  /** Resolves / rejects when the current turn lands. */
  pendingTurn: PendingTurn | null;
  /** Accumulated assistant text for the current turn. */
  accumText: string;
  /** Accumulated tool calls for the current turn. */
  accumToolCalls: Array<{ name: string; success: boolean }>;
  /** Conversation history as it was at the START of the current turn. */
  turnHistory: Array<{ role: string; content: string }>;
  /** User message text for the current turn (used to extend history on result). */
  turnMessage: string;
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
  /** Currently-active tool name (set on tool_use, cleared when next tool starts or turn ends). */
  activeToolName: string | null;
  /** Timestamp when the active tool started. */
  activeToolStartTime: number;
  /** Epoch ms until which the watchdog is paused due to upstream rate-limiting.
   *  0 = not paused. While > now, the staleChecker should skip its budget checks. */
  rateLimitedUntil: number;
  /** Optional callback to stream progress events to the UI. */
  onProgress: ProgressCallback | null;
}

/** Build the default base state. Engine-specific managers spread their own fields on top. */
export function makeBaseSessionState(): BaseSessionState {
  return {
    pendingTurn: null,
    accumText: '',
    accumToolCalls: [],
    turnHistory: [],
    turnMessage: '',
    inFlight: false,
    idleTimer: null,
    turnTimer: null,
    staleChecker: null,
    lastActivity: Date.now(),
    hasCalledTool: false,
    activeToolName: null,
    activeToolStartTime: 0,
    rateLimitedUntil: 0,
    onProgress: null,
  };
}

/** Stage per-turn fields. Called at the top of each `turn()`. */
export function stageTurnState(
  s: BaseSessionState,
  message: string,
  history: Array<{ role: string; content: string }>,
  onProgress?: ProgressCallback,
): void {
  s.inFlight = true;
  s.turnMessage = message;
  s.turnHistory = history;
  s.accumText = '';
  s.accumToolCalls = [];
  s.lastActivity = Date.now();
  s.hasCalledTool = false;
  s.activeToolName = null;
  s.activeToolStartTime = 0;
  s.rateLimitedUntil = 0;
  s.onProgress = onProgress || null;
}

/** Clear the three lifecycle timers. Safe to call multiple times. */
export function clearLifecycleTimers(s: BaseSessionState): void {
  if (s.idleTimer) { clearTimeout(s.idleTimer); s.idleTimer = null; }
  if (s.turnTimer) { clearTimeout(s.turnTimer); s.turnTimer = null; }
  if (s.staleChecker) { clearInterval(s.staleChecker); s.staleChecker = null; }
}

/** Build the standard turn-result envelope. Both engines emit the same shape. */
export function buildTurnResult(
  s: BaseSessionState,
  channel: string,
  completedCleanly: boolean,
): ClaudeCodeTurnResult {
  return {
    type: 'claude-code-turn-result',
    channel,
    text: s.accumText,
    toolCalls: s.accumToolCalls,
    history: [
      ...s.turnHistory,
      { role: 'user', content: s.turnMessage },
      { role: 'assistant', content: s.accumText },
    ],
    completedCleanly,
  };
}

/**
 * Abstract base implementation of `AgentSessionManager`.
 *
 * Owns the no-brainer shared methods: `destroy`, `activeChannels`, `activeCount`,
 * concurrency guard, idle-teardown scheduling. Subclasses still define `turn()`
 * because the engine lifecycles (long-running query vs per-turn runStreamed) are
 * different enough that a single template method would be more harm than help.
 */
export abstract class BaseSessionManager<TSession extends BaseSessionState>
  implements AgentSessionManager
{
  protected readonly sessions = new Map<string, TSession>();

  /** Short tag used in log lines (e.g. "Figmento Claude Code", "Figmento Codex"). */
  protected abstract readonly logPrefix: string;

  /** Engine-specific teardown beyond clearing timers (close queue, abort thread, etc). */
  protected abstract teardownEngine(session: TSession): void;

  abstract turn(
    channel: string,
    message: string,
    history: Array<{ role: string; content: string }>,
    memory: string[] | undefined,
    model?: string,
    imageModel?: string,
    attachmentBase64?: string,
    fileAttachments?: Array<{ name: string; type: string; dataUri: string }>,
    onProgress?: ProgressCallback,
  ): Promise<ClaudeCodeTurnResult | ClaudeCodeTurnError>;

  destroy(channel: string): void {
    const session = this.sessions.get(channel);
    if (!session) return;
    console.log(`[${this.logPrefix}] Destroying session channel="${channel}"`);
    clearLifecycleTimers(session);
    this.teardownEngine(session);
    this.sessions.delete(channel);
  }

  activeChannels(): string[] {
    return [...this.sessions.keys()];
  }

  activeCount(): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.inFlight) count++;
    }
    return count;
  }

  /**
   * Concurrency guard + idle-cancel — call at the very top of `turn()`.
   * Returns a TurnError to propagate to the caller (in-flight rejection),
   * or null if the channel is free to take a new turn.
   */
  protected guardConcurrencyAndCancelIdle(
    channel: string,
    engineLabel: string,
  ): ClaudeCodeTurnError | null {
    const session = this.sessions.get(channel);
    if (session?.inFlight) {
      return {
        type: 'claude-code-turn-result',
        channel,
        error: `A ${engineLabel} turn is already in progress on this channel.`,
      };
    }
    if (session?.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
    return null;
  }

  /** Schedule the idle-teardown timer. Called after every successful turn result. */
  protected scheduleIdleTeardown(channel: string, session: TSession): void {
    session.idleTimer = setTimeout(() => {
      console.log(`[${this.logPrefix}] Idle timeout channel="${channel}" — destroying session`);
      this.destroy(channel);
    }, IDLE_TIMEOUT_MS);
  }
}
