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

/** Stale activity timeout — if no SDK event arrives in this window, abort the turn. */
export const STALE_ACTIVITY_MS = 90_000;

/** Per-tool execution budgets — milliseconds before a tool call is considered stalled. */
export const TOOL_BUDGETS: Record<string, number> = {
  generate_design_image: 300_000,        // 5 min — image API can be slow
  set_image_fill: 120_000,               // 2 min — also calls image API
  apply_template_image: 60_000,          // 1 min — local Figma op
  get_screenshot: 60_000,                // 1 min — Figma plugin screenshot
  run_refinement_check: 90_000,          // 1.5 min — walks node tree
  batch_execute: 90_000,                 // 1.5 min — variable batch size
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
  type: 'tool_start' | 'tool_done' | 'thinking' | 'tool_progress' | 'auth_status';
  toolName?: string;
  toolIndex?: number;
  totalTools?: number;
  /** For tool_progress: seconds elapsed inside the tool. */
  elapsedSeconds?: number;
  /** For auth_status: whether the engine is currently re-authenticating. */
  isAuthenticating?: boolean;
  /** For auth_status: optional error string if auth failed. */
  authError?: string;
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
