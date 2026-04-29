/**
 * Codex Session Manager — sibling of claude-code-session-manager.ts.
 *
 * Maintains ONE Codex Thread per relay channel. Each user turn calls
 * `thread.runStreamed()` which spawns a `codex exec` subprocess; the Thread
 * persists transcript across turns so context is retained without us re-sending it.
 *
 * Wire-format compatibility: returns the same ClaudeCodeTurnResult shape so
 * the relay handler and plugin bridge don't need to branch on engine.
 */

import * as path from 'path';
import * as fs from 'fs';
// @openai/codex-sdk is published as ESM-only (no CJS export). This file is
// compiled to CJS, so we load the SDK via dynamic import() at runtime and only
// import its types statically (types are erased at compile time).
import type { Thread, ThreadEvent, ModelReasoningEffort } from '@openai/codex-sdk';
import { buildSystemPrompt } from './system-prompt';
import { detectBrief } from './brief-detector';
import type { ClaudeCodeTurnResult, ClaudeCodeTurnError } from './claude-code-handler';
import { withSessionContext, materializeDesignPromptWorkspace } from './figmento-design-prompt';
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

const MCP_SERVER_PATH = path.resolve(__dirname, '../../../figmento-mcp-server/dist/index.js');

/** Lazy ESM loader for the Codex SDK. Cached on first call. */
let codexSdkPromise: Promise<typeof import('@openai/codex-sdk')> | null = null;
function loadCodexSdk(): Promise<typeof import('@openai/codex-sdk')> {
  if (!codexSdkPromise) {
    // Use Function constructor to keep the dynamic import as native ESM loader,
    // bypassing tsc's transpilation to require() (which would fail on ESM-only modules).
    codexSdkPromise = (new Function('return import("@openai/codex-sdk")')() as Promise<typeof import('@openai/codex-sdk')>);
  }
  return codexSdkPromise;
}

/**
 * Resolve the codex executable path, preferring the native binary over the npm
 * shim. On Windows the default `codex.cmd` shim opens a console window every
 * turn; pointing the SDK directly at the bundled `.exe` (or `.bin` on POSIX)
 * sidesteps that flicker and shaves a fork off the spawn cost.
 *
 * @openai/codex >= 0.x uses platform-specific optional dependencies
 * (`@openai/codex-{win32-x64,darwin-arm64,linux-x64,...}`) under
 * `node_modules/@openai/codex/node_modules/@openai/codex-<plat>/vendor/<arch>/codex/codex(.exe)`.
 */
function resolveCodexExecutable(): string | undefined {
  const override = process.env.FIGMENTO_CODEX_PATH;
  if (override && fs.existsSync(override)) return override;

  const npmGlobalRoot = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm')
    : '/usr/local/lib'; // best-effort POSIX fallback
  const codexPkgRoot = path.join(npmGlobalRoot, 'node_modules', '@openai', 'codex');

  const platMap: Record<string, { dir: string; arch: string; exe: string }[]> = {
    win32: [
      { dir: 'codex-win32-x64', arch: 'x86_64-pc-windows-msvc', exe: 'codex.exe' },
      { dir: 'codex-win32-arm64', arch: 'aarch64-pc-windows-msvc', exe: 'codex.exe' },
    ],
    darwin: [
      { dir: 'codex-darwin-arm64', arch: 'aarch64-apple-darwin', exe: 'codex' },
      { dir: 'codex-darwin-x64', arch: 'x86_64-apple-darwin', exe: 'codex' },
    ],
    linux: [
      { dir: 'codex-linux-x64', arch: 'x86_64-unknown-linux-gnu', exe: 'codex' },
      { dir: 'codex-linux-arm64', arch: 'aarch64-unknown-linux-gnu', exe: 'codex' },
    ],
  };
  const variants = platMap[process.platform] ?? [];
  for (const v of variants) {
    const p = path.join(codexPkgRoot, 'node_modules', '@openai', v.dir, 'vendor', v.arch, 'codex', v.exe);
    if (fs.existsSync(p)) return p;
  }
  // Legacy 0.30 layout (kept for users on older CLI installs)
  const legacy = path.join(codexPkgRoot, 'bin', process.platform === 'win32' ? 'codex-x86_64-pc-windows-msvc.exe' : 'codex');
  if (fs.existsSync(legacy)) return legacy;

  return undefined;
}

const CODEX_EXECUTABLE_PATH = resolveCodexExecutable();

/**
 * Map Figmento display model names to Codex CLI model IDs.
 *
 * The ChatGPT auth backend (auth_mode="chatgpt") rejects `*-codex` model IDs
 * regardless of the version (5.3/5.4/5.5). Those suffixed names are API-tier
 * billing variants. ChatGPT Plus/Pro users must use the bare family name
 * (`gpt-5.5`, `gpt-5.4`, etc.).
 *
 * Strategy:
 *   1. FIGMENTO_CODEX_MODEL env var wins.
 *   2. Strip the `-codex` suffix on any `gpt-X.Y[-mini]-codex` input.
 *   3. Pass everything else through unchanged.
 */
function toCodexModel(displayModel: string | undefined): string | undefined {
  const override = process.env.FIGMENTO_CODEX_MODEL;
  if (override) return override;
  if (!displayModel) return undefined;

  const codexStripped = displayModel.match(/^(gpt-\d+(?:\.\d+)?(?:-mini)?)-codex$/);
  if (codexStripped) return codexStripped[1];

  return displayModel;
}

/** Pick a reasoning effort. Default to "high" for design quality. */
function toReasoningEffort(model: string | undefined): ModelReasoningEffort {
  // Allow opt-in via env for users who want speed over quality
  const envEffort = process.env.FIGMENTO_CODEX_REASONING_EFFORT?.toLowerCase();
  if (envEffort === 'minimal' || envEffort === 'low' || envEffort === 'medium' || envEffort === 'high' || envEffort === 'xhigh') {
    return envEffort as ModelReasoningEffort;
  }
  return 'high';
}

interface PendingTurn {
  resolve: (r: ClaudeCodeTurnResult) => void;
  reject: (e: Error) => void;
}

interface CodexSession {
  thread: Thread;
  /** AbortController for the current turn's runStreamed call. */
  turnAbort: AbortController | null;
  pendingTurn: PendingTurn | null;
  /** Accumulated assistant text for the current turn (latest agent_message wins). */
  accumText: string;
  /** Accumulated tool calls for the current turn. */
  accumToolCalls: Array<{ name: string; success: boolean }>;
  /** Conversation history as it was at the START of the current turn. */
  turnHistory: Array<{ role: string; content: string }>;
  /** User message text for the current turn (used to extend history on result). */
  turnMessage: string;
  /** True while a turn is in-flight — concurrency guard. */
  inFlight: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  staleChecker: ReturnType<typeof setInterval> | null;
  lastActivity: number;
  hasCalledTool: boolean;
  activeToolName: string | null;
  activeToolStartTime: number;
  onProgress: ProgressCallback | null;
  /** True after the design preamble has been delivered (first turn only). */
  preambleSent: boolean;
}

export class CodexSessionManager implements AgentSessionManager {
  private readonly sessions = new Map<string, CodexSession>();

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

    if (session?.inFlight) {
      return {
        type: 'claude-code-turn-result',
        channel,
        error: 'A Codex turn is already in progress on this channel.',
      };
    }

    if (session?.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }

    if (!session) {
      console.log(`[Figmento Codex] Booting new session channel=${channel} model=${model ?? 'default'}`);
      session = await this.startSession(channel, model);
    }

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

    const abortController = new AbortController();
    session.turnAbort = abortController;

    const resultPromise = new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
      session!.pendingTurn = { resolve, reject };
    });

    // Stale activity checker — same logic as Claude Code path
    const staleChecker = setInterval(() => {
      const s = this.sessions.get(channel);
      if (!s?.pendingTurn) { clearInterval(staleChecker); return; }
      const elapsed = Date.now() - s.lastActivity;

      if (!s.hasCalledTool && elapsed >= THINKING_TIMEOUT_MS) {
        console.error(`[Figmento Codex] Thinking timeout channel=${channel} — no activity for ${Math.round(elapsed / 1000)}s. Aborting.`);
        clearInterval(staleChecker);
        s.turnAbort?.abort();
        s.pendingTurn.reject(
          new Error(`Codex turn timed out during thinking (${Math.round(THINKING_TIMEOUT_MS / 1000)}s). Try again.`),
        );
        s.pendingTurn = null;
        s.inFlight = false;
        this.destroy(channel);
        return;
      }

      if (s.hasCalledTool) {
        const activeBudget = s.activeToolName
          ? (TOOL_BUDGETS[s.activeToolName] ?? STALE_ACTIVITY_MS)
          : STALE_ACTIVITY_MS;
        if (elapsed >= activeBudget) {
          const toolLabel = s.activeToolName ? `during '${s.activeToolName}'` : 'between tool calls';
          console.error(`[Figmento Codex] Stale turn channel=${channel} ${toolLabel} — no activity for ${Math.round(elapsed / 1000)}s.`);
          clearInterval(staleChecker);
          s.turnAbort?.abort();
          s.pendingTurn.reject(
            new Error(`Codex turn stalled ${toolLabel} — no activity for ${Math.round(elapsed / 1000)}s.`),
          );
          s.pendingTurn = null;
          s.inFlight = false;
          this.destroy(channel);
        }
      }
    }, STALE_CHECK_INTERVAL_MS);
    session.staleChecker = staleChecker;

    const turnTimer = setTimeout(() => {
      const s = this.sessions.get(channel);
      if (s?.pendingTurn) {
        s.turnAbort?.abort();
        s.pendingTurn.reject(new Error(`Codex turn timed out after ${HARD_TIMEOUT_MS / 1000} seconds.`));
        s.pendingTurn = null;
        s.inFlight = false;
      }
      this.destroy(channel);
    }, HARD_TIMEOUT_MS);
    session.turnTimer = turnTimer;

    try {
      // Build input — on first turn, prepend the design preamble so the Thread
      // transcript carries it forward without us re-sending each turn.
      const input = this.buildInput(session, message, history, memory, imageModel);
      const streamed = await session.thread.runStreamed(input, { signal: abortController.signal });

      // Drain events
      this.drainEvents(channel, streamed.events).catch((err) => {
        const s = this.sessions.get(channel);
        if (s?.pendingTurn) {
          s.pendingTurn.reject(err instanceof Error ? err : new Error(String(err)));
          s.pendingTurn = null;
          s.inFlight = false;
        }
      });

      const result = await resultPromise;
      clearTimeout(turnTimer);
      clearInterval(staleChecker);
      session.preambleSent = true;
      return result;
    } catch (err) {
      clearTimeout(turnTimer);
      clearInterval(staleChecker);
      session.inFlight = false;
      session.pendingTurn = null;
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Figmento Codex] Turn error channel=${channel}:`, errorMessage);
      return { type: 'claude-code-turn-result', channel, error: errorMessage };
    }
  }

  destroy(channel: string): void {
    const session = this.sessions.get(channel);
    if (!session) return;

    console.log(`[Figmento Codex] Destroying session channel="${channel}"`);

    if (session.idleTimer) { clearTimeout(session.idleTimer); session.idleTimer = null; }
    if (session.turnTimer) { clearTimeout(session.turnTimer); session.turnTimer = null; }
    if (session.staleChecker) { clearInterval(session.staleChecker); session.staleChecker = null; }

    session.turnAbort?.abort();
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

  // ─── PRIVATE ────────────────────────────────────────────────

  private async startSession(channel: string, model?: string): Promise<CodexSession> {
    const projectRoot = path.resolve(__dirname, '../../..');
    const codexModel = toCodexModel(model);
    const reasoningEffort = toReasoningEffort(model);

    // Materialize design rules to disk as AGENTS.md + CLAUDE.md.
    // Codex auto-loads AGENTS.md from cwd as project doc — no per-turn token cost.
    const workspaceDir = path.resolve(__dirname, '../../codex-workspace');
    materializeDesignPromptWorkspace(workspaceDir);

    console.log(`[Figmento Codex] MCP server path: ${MCP_SERVER_PATH}`);
    console.log(`[Figmento Codex] Codex workspace (AGENTS.md): ${workspaceDir}`);
    console.log(`[Figmento Codex] Project root: ${projectRoot}`);
    console.log(`[Figmento Codex] Model: ${codexModel} | reasoning_effort: ${reasoningEffort}`);

    // Configure the figmento MCP server via Codex config overrides.
    // The SDK flattens this object into TOML dotted paths.
    const mcpEnv: Record<string, string> = {};
    const allowedKeys = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'IMAGE_OUTPUT_DIR', 'PATH', 'NODE_PATH', 'SYSTEMROOT', 'TEMP', 'TMP', 'APPDATA', 'USERPROFILE', 'HOME'];
    for (const k of allowedKeys) {
      const v = process.env[k];
      if (typeof v === 'string' && v) mcpEnv[k] = v;
    }
    mcpEnv.FIGMENTO_CHANNEL = channel;
    mcpEnv.FIGMENTO_RELAY_URL = 'ws://localhost:3055';
    // Engine indicator — image-gen.ts branches on this when picking gpt-image-2 vs Gemini.
    mcpEnv.FIGMENTO_ENGINE = 'codex';

    const sdk = await loadCodexSdk();

    // The user's global ~/.codex/config.toml may register other MCP servers
    // (figma, pencil, MCP_DOCKER, etc). Without overrides those load alongside
    // ours and the agent picks the wrong tools. We disable every server name
    // we know exists in Caio's setup. Unknown ones can be added via
    // FIGMENTO_DISABLE_MCP_SERVERS=name1,name2,... in the relay env.
    const KNOWN_OTHER_MCP_SERVERS = ['figma', 'pencil', 'MCP_DOCKER'];
    const extraDisabled = (process.env.FIGMENTO_DISABLE_MCP_SERVERS ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const otherServersToDisable = [...new Set([...KNOWN_OTHER_MCP_SERVERS, ...extraDisabled])];

    // Tool surface stays in lock-step with Claude Code — same FIGMENTO_DISABLED_TOOLS,
    // nothing extra. The Rust → OpenAI converter previously choked on
    // `z.union([number, tuple])` schemas (cornerRadius / radius), but those have
    // been refactored to a non-union split-field shape so all five formerly
    // incompatible tools (create_frame, create_rectangle, create_image, set_style,
    // place_generated_image) now work for both engines.
    const mcpServersConfig: Record<string, unknown> = {
      figmento: {
        command: 'node',
        args: [MCP_SERVER_PATH],
        env: mcpEnv,
        disabled_tools: FIGMENTO_DISABLED_TOOLS,
      },
    };
    for (const name of otherServersToDisable) {
      mcpServersConfig[name] = { enabled: false };
    }

    const codex = new sdk.Codex({
      // Bypass the npm `.cmd` shim on Windows (which flashes a console window)
      // by pointing the SDK at the bundled native binary when we can find it.
      ...(CODEX_EXECUTABLE_PATH ? { codexPathOverride: CODEX_EXECUTABLE_PATH } : {}),
      // SDK config types use a strict CodexConfigValue union; our nested env +
      // disabled_tools shape matches at runtime but TS rejects the inferred
      // Record<string, unknown>. Cast at the boundary — the SDK's flatten step
      // walks plain objects and accepts string/number/boolean/array leaves.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { mcp_servers: mcpServersConfig } as any,
    });
    console.log(`[Figmento Codex] Disabled tools: ${FIGMENTO_DISABLED_TOOLS.length} (parity with Claude Code) | Disabled MCP servers: ${otherServersToDisable.join(', ') || 'none'}`);
    if (CODEX_EXECUTABLE_PATH) {
      console.log(`[Figmento Codex] Codex binary: ${CODEX_EXECUTABLE_PATH}`);
    }

    // Codex needs the project root reachable so it can stat/read referenced
    // assets (CLAUDE.md fall-back, future config, image outputs). Pull both
    // into additionalDirectories.
    const additionalDirs: string[] = [projectRoot];
    const imageOutputDir = process.env.IMAGE_OUTPUT_DIR;
    if (imageOutputDir && fs.existsSync(imageOutputDir)) additionalDirs.push(imageOutputDir);

    const thread = codex.startThread({
      // Omit `model` when we couldn't resolve a ChatGPT-plan-supported value;
      // Codex CLI then uses the plan default (e.g. gpt-5-codex on Plus/Pro).
      ...(codexModel ? { model: codexModel } : {}),
      modelReasoningEffort: reasoningEffort,
      // `danger-full-access` removes sandbox restrictions entirely. We need this
      // because the figmento MCP server (spawned as a child of codex) must dial
      // `ws://localhost:3055` to forward commands to the plugin, and the
      // workspace-write sandbox cancels those network calls even with
      // `networkAccessEnabled: true`. The relay only ever runs locally and the
      // MCP server is fully owned by us — no real safety surface to widen.
      sandboxMode: 'danger-full-access',
      networkAccessEnabled: true,
      // workingDirectory drives Codex's AGENTS.md auto-load. Pointing at the
      // dedicated workspace (not the project root) ensures the agent sees only
      // OUR design rules — not Caio's project-level AGENTS.md (which has
      // unrelated dev guidance).
      workingDirectory: workspaceDir,
      skipGitRepoCheck: true,
      // `on-request` = auto-approve every tool/command call, only escalate when
      // the model itself explicitly asks for human review.
      approvalPolicy: 'on-request',
      additionalDirectories: additionalDirs,
    });

    const session: CodexSession = {
      thread,
      turnAbort: null,
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
      onProgress: null,
      preambleSent: false,
    };

    this.sessions.set(channel, session);
    return session;
  }

  /**
   * Build the input array.
   *
   * The 300-line FIGMENTO_DESIGN_PROMPT lives on disk as AGENTS.md inside the
   * Codex workingDirectory — the CLI auto-loads it as project doc on every
   * turn, so we don't need to ship it in the user input. That saves ~6k tokens
   * per turn versus the old preamble approach and dramatically improves
   * first-turn latency.
   *
   * On the FIRST turn we still prepend the brief-scoped system prompt
   * (buildSystemPrompt — knowledge picks per brief category) + recent history
   * context. Both are short. Subsequent turns send just the user message.
   */
  private buildInput(
    session: CodexSession,
    message: string,
    history: Array<{ role: string; content: string }>,
    memory: string[] | undefined,
    imageModel: string | undefined,
  ): Array<{ type: 'text'; text: string }> {
    if (session.preambleSent) {
      return [{ type: 'text', text: message }];
    }

    const lastUserMsg = [...history].reverse().find((m) => m.role === 'user')?.content ?? message;
    const brief = detectBrief(lastUserMsg);
    const basePrompt = buildSystemPrompt(brief, memory);
    const sessionContext = withSessionContext(basePrompt, history, imageModel);

    // Wrap the small (brief-scoped) context block — design rules already live
    // in AGENTS.md so we explicitly tell Codex it's loaded and don't repeat.
    const preamble =
      `## Session context (apply alongside the AGENTS.md design rules already loaded)\n\n` +
      sessionContext +
      `\n\n## User request\n\n` +
      message;

    return [{ type: 'text', text: preamble }];
  }

  /** Consume the streamed events from one turn until completion. */
  private async drainEvents(channel: string, events: AsyncGenerator<ThreadEvent>): Promise<void> {
    try {
      for await (const evt of events) {
        const session = this.sessions.get(channel);
        if (!session) break;

        session.lastActivity = Date.now();

        if (process.env.FIGMENTO_SDK_DEBUG === '1') {
          const tag = (evt as { type?: string }).type ?? 'unknown';
          console.log(`[Codex msg] type=${tag}`);
        }

        if (evt.type === 'item.started' || evt.type === 'item.updated' || evt.type === 'item.completed') {
          const item = evt.item;

          if (item.type === 'agent_message' && evt.type !== 'item.started') {
            // Latest text wins — Codex emits the full text on completion
            if (typeof item.text === 'string' && item.text) {
              session.accumText = item.text;
            }
          } else if (item.type === 'mcp_tool_call') {
            const toolName = item.tool;
            const stripped = toolName.replace(/^mcp__figmento__/, '');

            if (evt.type === 'item.started') {
              session.accumToolCalls.push({ name: toolName, success: true });
              session.hasCalledTool = true;
              session.activeToolName = stripped;
              session.activeToolStartTime = Date.now();
              if (session.onProgress) {
                try {
                  session.onProgress({
                    type: 'tool_start',
                    toolName: stripped,
                    toolIndex: session.accumToolCalls.length,
                  });
                } catch { /* non-critical */ }
              }
            } else if (evt.type === 'item.completed') {
              // Mark the last tool call's success based on item.status
              const last = session.accumToolCalls[session.accumToolCalls.length - 1];
              if (last && last.name === toolName) {
                last.success = item.status === 'completed';
              }
              if (session.onProgress) {
                try {
                  session.onProgress({
                    type: 'tool_done',
                    toolName: stripped,
                  });
                } catch { /* non-critical */ }
              }
            }
          }
        } else if (evt.type === 'turn.completed') {
          this.resolvePendingTurn(channel, true);
          return;
        } else if (evt.type === 'turn.failed') {
          const session2 = this.sessions.get(channel);
          if (session2?.pendingTurn) {
            const errMsg = evt.error?.message ?? 'Codex turn failed';
            session2.pendingTurn.reject(new Error(errMsg));
            session2.pendingTurn = null;
            session2.inFlight = false;
          }
          return;
        } else if (evt.type === 'error') {
          const session2 = this.sessions.get(channel);
          if (session2?.pendingTurn) {
            session2.pendingTurn.reject(new Error(evt.message || 'Codex stream error'));
            session2.pendingTurn = null;
            session2.inFlight = false;
          }
          return;
        }
      }
    } catch (err) {
      const session = this.sessions.get(channel);
      if (session?.pendingTurn) {
        session.pendingTurn.reject(err instanceof Error ? err : new Error(String(err)));
        session.pendingTurn = null;
        session.inFlight = false;
      }
    }
  }

  private resolvePendingTurn(channel: string, completedCleanly: boolean): void {
    const session = this.sessions.get(channel);
    if (!session?.pendingTurn) return;

    session.activeToolName = null;
    session.activeToolStartTime = 0;

    if (session.turnTimer) { clearTimeout(session.turnTimer); session.turnTimer = null; }
    if (session.staleChecker) { clearInterval(session.staleChecker); session.staleChecker = null; }

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
      completedCleanly,
    };

    console.log(
      `[Figmento Codex] Turn complete channel=${channel} ` +
      `threadId=${session.thread.id ?? 'pending'} toolCalls=${result.toolCalls.length} ` +
      `text=${result.text.length}c`,
    );

    session.pendingTurn.resolve(result);
    session.pendingTurn = null;
    session.inFlight = false;
    session.accumText = '';
    session.accumToolCalls = [];

    session.idleTimer = setTimeout(() => {
      console.log(`[Figmento Codex] Idle timeout channel="${channel}" — destroying session`);
      this.destroy(channel);
    }, IDLE_TIMEOUT_MS);
  }
}

export const codexSessionManager = new CodexSessionManager();
