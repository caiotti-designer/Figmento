/**
 * Figmento Chat Module — AI design agent chat (Anthropic + Gemini + OpenAI).
 * Ported from figmento-plugin/src/ui-app.ts chat sections.
 *
 * Loop logic lives in tool-use-loop.ts. This module owns:
 *  - DOM manipulation (chat bubbles, tool action rows, loading state)
 *  - Conversation history state (per provider)
 *  - Special tool handlers: generate_image, update_memory
 *  - Sandbox bridge (sendCommandToSandbox)
 */

import { chatToolResolver } from './tools-schema';
import { buildSystemPrompt } from './system-prompt';
import { detectBrief, DesignBrief } from './brief-detector';
import {
  runToolUseLoop,
  ToolCallResult,
  AnthropicMessage,
  GeminiContent,
  SCREENSHOT_TOOLS,
  stripBase64FromResult,
  summarizeScreenshotResult,
} from './tool-use-loop';
import { LOCAL_TOOL_HANDLERS } from './local-intelligence';
import { getBridgeChannelId, getBridgeConnected } from './bridge';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface PendingCommand {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

export interface ChatSettings {
  anthropicApiKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
  model: string;
  chatRelayEnabled: boolean;
  chatRelayUrl: string;
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let conversationHistory: AnthropicMessage[] = [];
let geminiHistory: GeminiContent[] = [];
let openaiHistory: Array<Record<string, unknown>> = [];
let isProcessing = false;
let chatCommandCounter = 0;
const pendingChatCommands = new Map<string, PendingCommand>();
let memoryEntries: string[] = [];
let currentBrief: DesignBrief | undefined;

// Settings reference — updated from outside via updateChatSettings()
let chatSettings: ChatSettings = {
  anthropicApiKey: '',
  geminiApiKey: '',
  openaiApiKey: '',
  model: 'gemini-3.1-flash-image-preview',
  chatRelayEnabled: false,
  chatRelayUrl: 'https://figmento-production.up.railway.app',
};

// ═══════════════════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════════════════

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function postToSandbox(msg: Record<string, unknown>) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function isGeminiModel(model: string): boolean {
  return model.startsWith('gemini-');
}

function isOpenAIModel(model: string): boolean {
  return model.startsWith('gpt-') || model.startsWith('o');
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

export function updateChatSettings(s: ChatSettings) {
  chatSettings = s;
}

export function getChatSettings(): ChatSettings {
  return chatSettings;
}

/** Load memory entries from sandbox into chat state. */
export function loadMemoryEntries(entries: Array<{ entry: string; timestamp: string }>) {
  memoryEntries = entries.map(e => e.entry);
}

/** Resolve a pending chat command (called by message router). */
export function resolveChatCommand(cmdId: string, success: boolean, data: Record<string, unknown>, error?: string) {
  const pending = pendingChatCommands.get(cmdId);
  if (!pending) return;
  pendingChatCommands.delete(cmdId);
  if (success) {
    pending.resolve(data);
  } else {
    pending.reject(new Error(error || 'Command failed'));
  }
}

// ═══════════════════════════════════════════════════════════════
// CHAT — UI
// ═══════════════════════════════════════════════════════════════

export function initChat() {
  const input = $('chat-input') as HTMLTextAreaElement;
  const sendBtn = $('chat-send');

  sendBtn.addEventListener('click', () => sendMessage());
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  $('chat-new').addEventListener('click', () => {
    conversationHistory = [];
    geminiHistory = [];
    openaiHistory = [];
    $('chat-messages').innerHTML = '';
    addChatWelcome();
  });

  addChatWelcome();
}

function addChatWelcome() {
  const messagesEl = $('chat-messages');
  messagesEl.innerHTML = `<div class="chat-welcome">
    <div class="chat-welcome-icon">F</div>
    <div class="chat-welcome-title">Figmento AI</div>
    <div class="chat-welcome-subtitle">AI design agent. Describe what you want to create.</div>
  </div>`;
}

function appendChatBubble(role: 'user' | 'assistant', html: string) {
  const messagesEl = $('chat-messages');
  const welcome = messagesEl.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.innerHTML = html;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendToolAction(name: string, summary: string, isError: boolean = false) {
  const messagesEl = $('chat-messages');
  const action = document.createElement('div');
  action.className = 'tool-action' + (isError ? ' error' : '');
  action.innerHTML = `<span class="tool-icon">${isError ? '!' : '>'}</span>
    <span class="tool-name">${escapeHtml(name)}</span>
    <span class="tool-summary">${escapeHtml(summary)}</span>`;
  messagesEl.appendChild(action);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setProcessing(processing: boolean) {
  isProcessing = processing;
  ($('chat-send') as HTMLButtonElement).disabled = processing;
  ($('chat-input') as HTMLTextAreaElement).disabled = processing;
  $('chat-loading').style.display = processing ? 'flex' : 'none';
}

// ═══════════════════════════════════════════════════════════════
// CHAT — MESSAGE SENDING
// ═══════════════════════════════════════════════════════════════

async function sendMessage() {
  const input = $('chat-input') as HTMLTextAreaElement;
  const text = input.value.trim();
  if (!text || isProcessing) return;

  const useGemini = isGeminiModel(chatSettings.model);
  const useOpenAI = isOpenAIModel(chatSettings.model);

  // API keys required for both relay mode (sent to server) and direct mode
  if (useGemini && !chatSettings.geminiApiKey) {
    appendChatBubble('assistant', '<span class="chat-error">Set your Gemini API key in Settings first.</span>');
    return;
  }
  if (useOpenAI && !chatSettings.openaiApiKey) {
    appendChatBubble('assistant', '<span class="chat-error">Set your OpenAI API key in Settings first.</span>');
    return;
  }
  if (!useGemini && !useOpenAI && !chatSettings.anthropicApiKey) {
    appendChatBubble('assistant', '<span class="chat-error">Set your Anthropic API key in Settings first.</span>');
    return;
  }

  input.value = '';
  appendChatBubble('user', escapeHtml(text));

  // Detect design brief from the user's message (KI-2)
  currentBrief = detectBrief(text);

  setProcessing(true);

  const relayEnabled = chatSettings.chatRelayEnabled;
  const bridgeConnected = getBridgeConnected();
  const channelId = getBridgeChannelId();
  console.log(`[Figmento Chat] sendMessage path: relayEnabled=${relayEnabled} bridgeConnected=${bridgeConnected} channelId=${channelId} model=${chatSettings.model} relayUrl=${chatSettings.chatRelayUrl}`);

  try {
    // Route through relay if enabled and bridge is connected
    if (relayEnabled && bridgeConnected) {
      console.log('[Figmento Chat] → RELAY path');
      await runRelayTurn(text, useGemini, useOpenAI);
    } else if (relayEnabled && !bridgeConnected) {
      // Fallback to direct API — relay is enabled but bridge is unreachable
      console.log('[Figmento Chat] → FALLBACK path (relay enabled but bridge not connected)');
      updateRelayStatus('fallback');
      await runDirectLoop(text, useGemini, useOpenAI);
    } else {
      console.log('[Figmento Chat] → DIRECT path (relay disabled)');
      await runDirectLoop(text, useGemini, useOpenAI);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    appendChatBubble('assistant', `<span class="chat-error">Error: ${escapeHtml(msg)}</span>`);
  } finally {
    setProcessing(false);
  }
}

// ═══════════════════════════════════════════════════════════════
// CHAT — RELAY STATUS
// ═══════════════════════════════════════════════════════════════

export type RelayConnectionState = 'disconnected' | 'connecting' | 'connected' | 'fallback' | 'error';

let relayConnectionState: RelayConnectionState = 'disconnected';

export function getRelayConnectionState(): RelayConnectionState {
  return relayConnectionState;
}

function updateRelayStatus(state: RelayConnectionState) {
  relayConnectionState = state;
  const dot = document.getElementById('relay-status-dot');
  const label = document.getElementById('relay-status-label');
  if (!dot || !label) return;

  dot.className = 'relay-dot ' + state;
  const labels: Record<RelayConnectionState, string> = {
    disconnected: 'Relay: Off',
    connecting: 'Relay: Connecting...',
    connected: 'Relay: Connected',
    fallback: 'Relay: Fallback (direct)',
    error: 'Relay: Error',
  };
  label.textContent = labels[state];
}

// ═══════════════════════════════════════════════════════════════
// CHAT — RELAY TURN (POST /chat/turn)
// ═══════════════════════════════════════════════════════════════

async function runRelayTurn(text: string, useGemini: boolean, useOpenAI: boolean): Promise<void> {
  const channelId = getBridgeChannelId();
  if (!channelId) {
    throw new Error('Bridge channel not available. Falling back to direct API.');
  }

  const provider = useGemini ? 'gemini' : useOpenAI ? 'openai' : 'claude';
  const apiKey = useGemini ? chatSettings.geminiApiKey
    : useOpenAI ? chatSettings.openaiApiKey
    : chatSettings.anthropicApiKey;
  const history = useGemini ? geminiHistory : useOpenAI ? openaiHistory : conversationHistory;

  const url = chatSettings.chatRelayUrl.replace(/\/+$/, '') + '/api/chat/turn';

  const body = {
    message: text,
    channel: channelId,
    provider,
    apiKey,
    model: chatSettings.model,
    history,
    memory: memoryEntries,
    geminiApiKey: chatSettings.geminiApiKey || undefined,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let errMsg: string;
    try {
      errMsg = JSON.parse(errText).error || errText;
    } catch {
      errMsg = errText;
    }
    throw new Error(`Relay error ${resp.status}: ${errMsg}`);
  }

  const result = await resp.json();

  // Update conversation history from relay response
  if (useGemini) {
    geminiHistory.length = 0;
    geminiHistory.push(...(result.history || []));
  } else if (useOpenAI) {
    openaiHistory.length = 0;
    openaiHistory.push(...(result.history || []));
  } else {
    conversationHistory.length = 0;
    conversationHistory.push(...(result.history || []));
  }

  // Display tool calls
  if (result.toolCalls) {
    for (const tc of result.toolCalls) {
      appendToolAction(tc.name, tc.success ? 'Done' : 'Failed', !tc.success);
    }
  }

  // Display assistant text
  if (result.text) {
    appendChatBubble('assistant', formatMarkdown(result.text));
  }

  // Update local memory with new entries from server
  if (result.newMemoryEntries) {
    for (const entry of result.newMemoryEntries) {
      memoryEntries.push(entry);
    }
  }
}

/** Direct API path — used when relay is disabled or as fallback. */
async function runDirectLoop(text: string, useGemini: boolean, useOpenAI: boolean): Promise<void> {
  if (useGemini) {
    geminiHistory.push({ role: 'user', parts: [{ text }] });
    await runGeminiLoop();
  } else if (useOpenAI) {
    openaiHistory.push({ role: 'user', content: text });
    await runOpenAILoop();
  } else {
    conversationHistory.push({ role: 'user', content: text });
    await runAnthropicLoop();
  }
}

// ═══════════════════════════════════════════════════════════════
// CHAT — PROVIDER LOOP WRAPPERS (delegate to runToolUseLoop)
// ═══════════════════════════════════════════════════════════════

async function runAnthropicLoop(): Promise<void> {
  await runToolUseLoop({
    provider: 'claude',
    apiKey: chatSettings.anthropicApiKey,
    model: chatSettings.model,
    systemPrompt: buildSystemPrompt(currentBrief, memoryEntries),
    tools: chatToolResolver(),
    messages: conversationHistory,
    onToolCall: buildToolCallHandler(),
    onProgress: () => { /* progress reserved for future mode UI */ },
    onTextChunk: (text) => appendChatBubble('assistant', formatMarkdown(text)),
  });
}

async function runGeminiLoop(): Promise<void> {
  await runToolUseLoop({
    provider: 'gemini',
    apiKey: chatSettings.geminiApiKey,
    model: chatSettings.model,
    systemPrompt: buildSystemPrompt(currentBrief, memoryEntries),
    tools: chatToolResolver(),
    messages: geminiHistory,
    onToolCall: buildToolCallHandler(),
    onProgress: () => { /* progress reserved for future mode UI */ },
    onTextChunk: (text) => appendChatBubble('assistant', formatMarkdown(text)),
  });
}

async function runOpenAILoop(): Promise<void> {
  await runToolUseLoop({
    provider: 'openai',
    apiKey: chatSettings.openaiApiKey,
    model: chatSettings.model,
    systemPrompt: buildSystemPrompt(currentBrief, memoryEntries),
    tools: chatToolResolver(),
    messages: openaiHistory,
    onToolCall: buildToolCallHandler(),
    onProgress: () => { /* progress reserved for future mode UI */ },
    onTextChunk: (text) => appendChatBubble('assistant', formatMarkdown(text)),
  });
}

// ═══════════════════════════════════════════════════════════════
// CHAT — TOOL CALL HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Returns the unified onToolCall callback used by all three provider loops.
 * Handles special tools (generate_image, update_memory) and routes all
 * other tools through the sandbox bridge.
 *
 * Returned `content` is a sanitized string (base64 stripped, screenshot
 * summarized) ready for insertion into provider-specific message history.
 * Error messages do NOT include an "Error: " prefix — the loop adds it
 * where required by the provider protocol.
 */
function buildToolCallHandler(): (name: string, args: Record<string, unknown>) => Promise<ToolCallResult> {
  return async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
    if (name === 'generate_image') {
      return executeGenerateImage(args);
    }

    if (name === 'update_memory') {
      return executeUpdateMemory(args);
    }

    // Local intelligence tools — resolved from bundled knowledge, no network
    if (name in LOCAL_TOOL_HANDLERS) {
      const result = LOCAL_TOOL_HANDLERS[name](args);
      const content = JSON.stringify(result);
      appendToolAction(name, typeof result === 'object' && result !== null && 'error' in result ? (result as Record<string, string>).error : 'Done');
      return { content, is_error: false };
    }

    try {
      const data = await sendCommandToSandbox(name, args);
      const summary = formatToolSummary(name, data);
      appendToolAction(name, summary);

      const content = SCREENSHOT_TOOLS.has(name)
        ? summarizeScreenshotResult(name, data)
        : JSON.stringify(stripBase64FromResult(data));

      return { content, is_error: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      appendToolAction(name, msg, true);
      return { content: msg, is_error: true };
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// CHAT — SANDBOX BRIDGE
// ═══════════════════════════════════════════════════════════════

function sendCommandToSandbox(action: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const cmdId = `chat-${++chatCommandCounter}-${Date.now()}`;

    const timer = setTimeout(() => {
      pendingChatCommands.delete(cmdId);
      reject(new Error(`Command timeout: ${action}`));
    }, 30000);

    pendingChatCommands.set(cmdId, {
      resolve: (data) => { clearTimeout(timer); resolve(data); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });

    postToSandbox({
      type: 'execute-command',
      command: {
        type: 'command',
        id: cmdId,
        channel: 'chat',
        action,
        params,
      },
    });
  });
}

function formatToolSummary(name: string, data: Record<string, unknown>): string {
  if (data.nodeId && data.name) return `${data.name} (${data.nodeId})`;
  if (data.nodeId) return `Node ${data.nodeId}`;
  if (data.deleted) return `Deleted: ${data.name || 'node'}`;
  if (data.count !== undefined) return `${data.count} nodes`;
  return 'Done';
}

// ═══════════════════════════════════════════════════════════════
// SPECIAL TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════

async function executeGenerateImage(input: Record<string, unknown>): Promise<ToolCallResult> {
  const prompt = input.prompt as string;

  if (!chatSettings.geminiApiKey) {
    appendToolAction('generate_image', 'No Gemini API key set', true);
    return {
      content: 'Gemini API key not configured. Ask the user to add it in Settings.',
      is_error: true,
    };
  }

  try {
    appendToolAction('generate_image', `Generating: "${prompt.substring(0, 60)}..."`);

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${chatSettings.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );

    if (!resp.ok) {
      throw new Error(`Gemini API error ${resp.status}`);
    }

    const result = await resp.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p: Record<string, unknown>) => p.inlineData);
    const base64 = imgPart?.inlineData?.data;
    if (!base64) throw new Error('No image returned from Gemini');

    const imageData = `data:image/png;base64,${base64}`;
    const createParams: Record<string, unknown> = {
      imageData,
      name: (input.name as string) || 'AI Generated Image',
    };
    if (input.width) createParams.width = input.width;
    if (input.height) createParams.height = input.height;
    if (!input.parentId && !createParams.width) createParams.width = 400;
    if (!input.parentId && !createParams.height) createParams.height = 400;
    if (input.x !== undefined) createParams.x = input.x;
    if (input.y !== undefined) createParams.y = input.y;
    if (input.parentId) createParams.parentId = input.parentId;

    const data = await sendCommandToSandbox('create_image', createParams);
    appendToolAction('generate_image', `Placed image: ${data.name} (${data.nodeId})`);

    // Return lightweight placeholder — the full base64 was already sent to
    // the sandbox via create_image. Storing it in conversation history would
    // bloat every subsequent API call and trigger rate limits.
    const summary = JSON.stringify({
      nodeId: data.nodeId,
      name: data.name,
      note: 'Image generated and placed on canvas successfully.',
    });
    return { content: summary, is_error: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    appendToolAction('generate_image', msg, true);
    return { content: msg, is_error: true };
  }
}

async function executeUpdateMemory(input: Record<string, unknown>): Promise<ToolCallResult> {
  const entry = (input.entry as string) || '';
  if (!entry) {
    return { content: 'entry is required', is_error: true };
  }

  // Save to clientStorage via sandbox
  postToSandbox({ type: 'save-memory', entry });

  // Also update local state so it's available immediately
  memoryEntries.push(entry);

  appendToolAction('update_memory', `Saved: "${entry.substring(0, 60)}${entry.length > 60 ? '...' : ''}"`);

  return { content: JSON.stringify({ saved: true, entry }), is_error: false };
}

// ═══════════════════════════════════════════════════════════════
// MARKDOWN (minimal)
// ═══════════════════════════════════════════════════════════════

function formatMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
