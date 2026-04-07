/**
 * Claude Code Handler — CR-5 / CR-5.1
 *
 * Thin routing layer: validates the request (local-only guard) then delegates
 * to ClaudeCodeSessionManager for session lifecycle and turn execution.
 *
 * The module-level activeChannels Set from CR-5 has been removed — concurrency
 * tracking is now owned by ClaudeCodeSessionManager (CR-5.1 AC4).
 */

import { sessionManager, type ProgressCallback } from './claude-code-session-manager';

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
  return !(process.env.RAILWAY_STATIC_URL || process.env.RENDER_EXTERNAL_HOSTNAME);
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════

export async function handleClaudeCodeTurn(
  request: ClaudeCodeTurnRequest,
  onProgress?: ProgressCallback,
): Promise<ClaudeCodeTurnResult | ClaudeCodeTurnError> {
  const { channel, message, history, memory, model, imageModel, attachmentBase64, fileAttachments } = request;

  // AC15: Local-only guard
  if (!isLocalRelay()) {
    return {
      type: 'claude-code-turn-result',
      channel,
      error: 'Claude Code provider is only available on a local relay (localhost:3055).',
    };
  }

  // Delegate entirely to the session manager (concurrency + session lifecycle)
  return sessionManager.turn(channel, message, history, memory, model, imageModel, attachmentBase64, fileAttachments, onProgress);
}

/** Active in-flight turn count — used by the /health endpoint. */
export function getActiveClaudeCodeTurns(): number {
  return sessionManager.activeCount();
}
