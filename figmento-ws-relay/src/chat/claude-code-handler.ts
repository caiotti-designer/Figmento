/**
 * Agent Turn Handler — dispatches to the right engine session manager.
 *
 * Two engines share the same wire format (`claude-code-turn` / `claude-code-turn-result`):
 *   - 'claude-code' (default) → ClaudeCodeSessionManager (Anthropic Agent SDK)
 *   - 'codex'                 → CodexSessionManager       (OpenAI Codex SDK)
 *
 * The wire-format type literal is kept as `claude-code-turn` for backward
 * compatibility with the plugin bridge — it is a wire tag, not an engine
 * identifier. The new optional `engine` field selects the implementation.
 */

import { sessionManager } from './claude-code-session-manager';
import { codexSessionManager } from './codex-session-manager';
import type { AgentEngine, AgentSessionManager, ProgressCallback } from './agent-session-manager';

// Re-export ProgressCallback so the relay's existing import path still works.
export type { ProgressCallback };

// ═══════════════════════════════════════════════════════════════
// PUBLIC TYPES (consumed by relay.ts and types.ts)
// ═══════════════════════════════════════════════════════════════

export interface ClaudeCodeTurnRequest {
  type: 'claude-code-turn';
  channel: string;
  message: string;
  history: Array<{ role: string; content: string }>;
  memory?: string[];
  model?: string;
  imageModel?: string;
  attachmentBase64?: string;
  fileAttachments?: Array<{ name: string; type: string; dataUri: string }>;
  /** Which engine should execute this turn. Defaults to 'claude-code'. */
  engine?: AgentEngine;
}

export interface ClaudeCodeTurnResult {
  type: 'claude-code-turn-result';
  channel: string;
  text: string;
  toolCalls: Array<{ name: string; success: boolean }>;
  history: Array<{ role: string; content: string }>;
  completedCleanly: boolean;
}

export interface ClaudeCodeTurnError {
  type: 'claude-code-turn-result';
  channel: string;
  error: string;
}

// ═══════════════════════════════════════════════════════════════
// LOCAL-ONLY GUARD
// ═══════════════════════════════════════════════════════════════

/**
 * Returns true when the relay is running locally.
 * Rejects claude-code-turn on cloud deployments to prevent SDK auth failures.
 */
export function isLocalRelay(): boolean {
  return !(process.env.RAILWAY_STATIC_URL || process.env.RENDER_EXTERNAL_HOSTNAME || process.env.FLY_APP_NAME);
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════

/** Pick the session manager for the requested engine. */
function pickManager(engine: AgentEngine | undefined): { manager: AgentSessionManager; otherManager: AgentSessionManager } {
  if (engine === 'codex') {
    return { manager: codexSessionManager, otherManager: sessionManager };
  }
  return { manager: sessionManager, otherManager: codexSessionManager };
}

export async function handleClaudeCodeTurn(
  request: ClaudeCodeTurnRequest,
  onProgress?: ProgressCallback,
): Promise<ClaudeCodeTurnResult | ClaudeCodeTurnError> {
  const { channel, message, history, memory, model, imageModel, attachmentBase64, fileAttachments, engine } = request;

  // AC15: Local-only guard
  if (!isLocalRelay()) {
    return {
      type: 'claude-code-turn-result',
      channel,
      error: 'Agent engines are only available on a local relay (localhost:3055).',
    };
  }

  const { manager, otherManager } = pickManager(engine);

  // Mid-conversation engine switch: tear down the OTHER engine's session on this
  // channel so the next turn boots fresh under the new engine. History is carried
  // forward via the request payload — the new engine injects it into the system
  // prompt on session boot, so the user sees no discontinuity.
  if (otherManager.activeChannels().includes(channel)) {
    console.log(`[Figmento Agent] Engine switch on channel="${channel}" — destroying prior engine session`);
    otherManager.destroy(channel);
  }

  return manager.turn(
    channel,
    message,
    history,
    memory,
    model,
    imageModel,
    attachmentBase64,
    fileAttachments,
    onProgress,
  );
}

/** Active in-flight turn count across both engines — used by the /health endpoint. */
export function getActiveClaudeCodeTurns(): number {
  return sessionManager.activeCount() + codexSessionManager.activeCount();
}
