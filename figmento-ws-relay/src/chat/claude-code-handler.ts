/**
 * Claude Code Handler — CR-5
 *
 * Spawns a Claude Code subprocess via the @anthropic-ai/claude-code SDK
 * with figmento-mcp-server as a stdio MCP child. Uses the user's local
 * Max subscription — no API key needed.
 *
 * Local-only: rejects requests when not running on localhost.
 */

import * as path from 'path';
import { query, type SDKMessage, type Options } from '@anthropic-ai/claude-code';
import { buildSystemPrompt } from './system-prompt';
import { detectBrief } from './brief-detector';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ClaudeCodeTurnRequest {
  type: 'claude-code-turn';
  channel: string;
  message: string;
  history: Array<{ role: string; content: string }>;
  memory?: string[];
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
// CONCURRENCY + TIMEOUT
// ═══════════════════════════════════════════════════════════════

/** Per-channel concurrency lock — one Claude Code turn at a time per channel. */
const activeChannels = new Set<string>();

/** Timeout for Claude Code subprocess (180s — extended for complex tool chains). */
const CLAUDE_CODE_TIMEOUT_MS = 180_000;

// ═══════════════════════════════════════════════════════════════
// LOCAL-ONLY GUARD
// ═══════════════════════════════════════════════════════════════

/**
 * Check if the relay is running locally. Rejects claude-code-turn on
 * non-localhost to prevent confusing SDK auth failures on Railway.
 */
export function isLocalRelay(): boolean {
  const host = process.env.RAILWAY_STATIC_URL || process.env.RENDER_EXTERNAL_HOSTNAME;
  if (host) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════

export async function handleClaudeCodeTurn(
  request: ClaudeCodeTurnRequest,
): Promise<ClaudeCodeTurnResult | ClaudeCodeTurnError> {
  const { channel, message, history, memory } = request;

  // AC15: Local-only guard
  if (!isLocalRelay()) {
    return {
      type: 'claude-code-turn-result',
      channel,
      error: 'Claude Code provider is only available on a local relay (localhost:3055).',
    };
  }

  // AC8: Per-channel concurrency lock
  if (activeChannels.has(channel)) {
    return {
      type: 'claude-code-turn-result',
      channel,
      error: 'A Claude Code turn is already in progress on this channel.',
    };
  }

  activeChannels.add(channel);
  const abortController = new AbortController();

  try {
    // Detect brief from user message for system prompt enrichment
    const brief = detectBrief(message);
    const systemPrompt = buildSystemPrompt(brief, memory);

    // AC5: MCP server configuration — figmento-mcp-server as stdio child
    const mcpServerPath = path.resolve(__dirname, '../../../figmento-mcp-server/dist/index.js');

    console.log(`[Figmento Claude Code] Starting turn on channel=${channel} history=${history.length} msgs`);
    console.log(`[Figmento Claude Code] MCP server env: FIGMENTO_CHANNEL=${channel} FIGMENTO_RELAY_URL=ws://localhost:3055`);
    console.log(`[Figmento Claude Code] MCP server path: ${mcpServerPath}`);

    // AC9: Timeout
    const timeout = setTimeout(() => {
      abortController.abort();
    }, CLAUDE_CODE_TIMEOUT_MS);

    const options: Options = {
      abortController,
      customSystemPrompt: systemPrompt,
      maxTurns: 50,
      permissionMode: 'bypassPermissions',
      mcpServers: {
        figmento: {
          command: 'node',
          args: [mcpServerPath],
          env: {
            FIGMENTO_CHANNEL: channel,
            FIGMENTO_RELAY_URL: 'ws://localhost:3055',
          },
        },
      },
    };

    // Collect all messages from the async generator
    const toolCalls: Array<{ name: string; success: boolean }> = [];
    let text = '';
    let completedCleanly = false;

    const conversation = query({ prompt: message, options });

    for await (const msg of conversation) {
      if (msg.type === 'assistant') {
        // Extract text and tool_use from assistant messages
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              text = block.text;
            } else if (block.type === 'tool_use') {
              toolCalls.push({ name: (block as any).name, success: true });
            }
          }
        }
      } else if (msg.type === 'result') {
        completedCleanly = !msg.is_error;
        if (msg.subtype === 'success' && 'result' in msg) {
          // The result field contains the final text
          if (msg.result) text = msg.result;
        }
      }
    }

    clearTimeout(timeout);

    // Build updated history for the plugin
    const updatedHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: text },
    ];

    console.log(`[Figmento Claude Code] Turn complete: ${toolCalls.length} tool calls, text=${text.length} chars`);

    return {
      type: 'claude-code-turn-result',
      channel,
      text,
      toolCalls,
      history: updatedHistory,
      completedCleanly,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    if (abortController.signal.aborted) {
      console.error(`[Figmento Claude Code] Turn timeout after ${CLAUDE_CODE_TIMEOUT_MS / 1000}s on channel=${channel}`);
      return {
        type: 'claude-code-turn-result',
        channel,
        error: `Claude Code turn timed out after ${CLAUDE_CODE_TIMEOUT_MS / 1000} seconds.`,
      };
    }

    console.error(`[Figmento Claude Code] Turn error on channel=${channel}:`, errorMessage);
    return {
      type: 'claude-code-turn-result',
      channel,
      error: errorMessage,
    };
  } finally {
    activeChannels.delete(channel);
  }
}

/** Get the count of active Claude Code turns (for health check). */
export function getActiveClaudeCodeTurns(): number {
  return activeChannels.size;
}
