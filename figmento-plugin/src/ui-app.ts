/**
 * Figmento Plugin — UI Application
 * Handles Chat (Anthropic + Gemini), Bridge (WebSocket), and Settings tabs.
 */

import { FIGMENTO_TOOLS, ToolDefinition } from './tools-schema';
import { buildSystemPrompt } from './system-prompt';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

// Anthropic types
interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface APIResponse {
  id: string;
  type: string;
  role: string;
  content: ContentBlock[];
  stop_reason: string | null;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

// Gemini types
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface PendingCommand {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

function isGeminiModel(model: string): boolean {
  return model.startsWith('gemini-');
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let conversationHistory: Message[] = [];
let isProcessing = false;
let chatCommandCounter = 0;
const pendingChatCommands = new Map<string, PendingCommand>();

// Bridge state
let ws: WebSocket | null = null;
let bridgeChannelId: string | null = null;
let isBridgeConnected = false;
let bridgeCommandCount = 0;
let bridgeErrorCount = 0;

// Settings
let settings = {
  anthropicApiKey: '',
  model: 'gemini-2.5-flash-preview-05-20',
  geminiApiKey: '',
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

// ═══════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab!;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $(tab).classList.add('active');
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════

function initSettings() {
  postToSandbox({ type: 'get-settings' });

  $('settings-save').addEventListener('click', saveSettings);

  const modelSelect = $('settings-model') as HTMLSelectElement;
  modelSelect.value = settings.model;
  modelSelect.addEventListener('change', updateSettingsUI);
  updateSettingsUI();
}

function updateSettingsUI() {
  const model = ($('settings-model') as HTMLSelectElement).value;
  const useGemini = model.startsWith('gemini-');

  // Chat key section: show the right input
  $('key-gemini-chat').style.display = useGemini ? 'block' : 'none';
  $('key-anthropic-chat').style.display = useGemini ? 'none' : 'block';

  // Image gen section: show separate key input only for Claude models
  $('image-gen-separate').style.display = useGemini ? 'none' : 'block';
  $('image-gen-shared').style.display = useGemini ? 'block' : 'none';
}

function saveSettings() {
  const model = ($('settings-model') as HTMLSelectElement).value;
  const useGemini = model.startsWith('gemini-');

  settings.model = model;
  settings.anthropicApiKey = ($('settings-api-key') as HTMLInputElement).value.trim();

  // Gemini key comes from either the chat input or the alt image-gen input
  if (useGemini) {
    settings.geminiApiKey = ($('settings-gemini-key') as HTMLInputElement).value.trim();
  } else {
    // When Claude is selected, read from the image-gen alt field
    const altKey = ($('settings-gemini-key-alt') as HTMLInputElement).value.trim();
    if (altKey) settings.geminiApiKey = altKey;
    // Also check if the main field has a value (from a previous Gemini session)
    const mainKey = ($('settings-gemini-key') as HTMLInputElement).value.trim();
    if (mainKey && !altKey) settings.geminiApiKey = mainKey;
  }

  postToSandbox({
    type: 'save-settings',
    settings: {
      anthropicApiKey: settings.anthropicApiKey,
      model: settings.model,
      geminiApiKey: settings.geminiApiKey,
    },
  });

  showSettingsStatus('Settings saved!', false);
}

function loadSettings(saved: Record<string, string>) {
  if (saved.anthropicApiKey) {
    settings.anthropicApiKey = saved.anthropicApiKey;
    ($('settings-api-key') as HTMLInputElement).value = saved.anthropicApiKey;
  }
  if (saved.model) {
    settings.model = saved.model;
    ($('settings-model') as HTMLSelectElement).value = saved.model;
  }
  if (saved.geminiApiKey) {
    settings.geminiApiKey = saved.geminiApiKey;
    // Populate both Gemini key inputs so the value is visible regardless of which model is selected
    ($('settings-gemini-key') as HTMLInputElement).value = saved.geminiApiKey;
    ($('settings-gemini-key-alt') as HTMLInputElement).value = saved.geminiApiKey;
  }
  updateSettingsUI();
}

function showSettingsStatus(text: string, isError: boolean) {
  const el = $('settings-status');
  el.textContent = text;
  el.className = 'settings-status ' + (isError ? 'error' : 'success');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// CHAT — UI
// ═══════════════════════════════════════════════════════════════

function initChat() {
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
  // Remove welcome if present
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
// CHAT — API
// ═══════════════════════════════════════════════════════════════

async function sendMessage() {
  const input = $('chat-input') as HTMLTextAreaElement;
  const text = input.value.trim();
  if (!text || isProcessing) return;

  const useGemini = isGeminiModel(settings.model);

  if (useGemini && !settings.geminiApiKey) {
    appendChatBubble('assistant', '<span class="chat-error">Set your Gemini API key in Settings first.</span>');
    return;
  }
  if (!useGemini && !settings.anthropicApiKey) {
    appendChatBubble('assistant', '<span class="chat-error">Set your Anthropic API key in Settings first.</span>');
    return;
  }

  input.value = '';
  appendChatBubble('user', escapeHtml(text));

  setProcessing(true);
  try {
    if (useGemini) {
      geminiHistory.push({ role: 'user', parts: [{ text }] });
      await runGeminiLoop();
    } else {
      conversationHistory.push({ role: 'user', content: text });
      await runAnthropicLoop();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    appendChatBubble('assistant', `<span class="chat-error">Error: ${escapeHtml(msg)}</span>`);
  } finally {
    setProcessing(false);
  }
}

// ── Anthropic conversation loop ──

async function runAnthropicLoop() {
  let maxIterations = 50;
  while (maxIterations-- > 0) {
    const response = await callAnthropicAPI();

    const textParts: string[] = [];
    const toolUses: ContentBlock[] = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolUses.push(block);
      }
    }

    if (textParts.length > 0) {
      appendChatBubble('assistant', formatMarkdown(textParts.join('\n')));
    }

    if (toolUses.length === 0) {
      conversationHistory.push({ role: 'assistant', content: response.content });
      break;
    }

    conversationHistory.push({ role: 'assistant', content: response.content });

    const toolResults: ContentBlock[] = [];
    for (const toolUse of toolUses) {
      const result = await executeToolCall(toolUse);
      toolResults.push(result);
    }

    conversationHistory.push({ role: 'user', content: toolResults });
  }
}

async function callAnthropicAPI(): Promise<APIResponse> {
  const body = {
    model: settings.model,
    max_tokens: 8192,
    system: buildSystemPrompt(),
    tools: FIGMENTO_TOOLS,
    messages: conversationHistory,
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${errBody}`);
  }

  return resp.json();
}

// ── Gemini conversation loop ──

let geminiHistory: GeminiContent[] = [];

async function runGeminiLoop() {
  let maxIterations = 50;
  while (maxIterations-- > 0) {
    const response = await callGeminiAPI();

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      appendChatBubble('assistant', '<span class="chat-error">Empty response from Gemini</span>');
      break;
    }

    const parts = candidate.content.parts as GeminiPart[];
    const textParts: string[] = [];
    const functionCalls: GeminiPart[] = [];

    for (const part of parts) {
      if (part.text) textParts.push(part.text);
      if (part.functionCall) functionCalls.push(part);
    }

    if (textParts.length > 0) {
      appendChatBubble('assistant', formatMarkdown(textParts.join('\n')));
    }

    // Store model response in history
    geminiHistory.push({ role: 'model', parts });

    if (functionCalls.length === 0) break;

    // Execute function calls and collect responses
    const responseParts: GeminiPart[] = [];
    for (const fc of functionCalls) {
      const { name, args } = fc.functionCall!;
      let resultData: Record<string, unknown>;
      let isErr = false;

      if (name === 'generate_image') {
        const imgResult = await executeGenerateImage(`gemini-${Date.now()}`, args);
        if (imgResult.is_error) {
          resultData = { error: imgResult.content };
          isErr = true;
        } else {
          resultData = JSON.parse(imgResult.content || '{}');
        }
      } else {
        try {
          resultData = await sendCommandToSandbox(name, args);
          const summary = formatToolSummary(name, resultData);
          appendToolAction(name, summary);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          appendToolAction(name, msg, true);
          resultData = { error: msg };
          isErr = true;
        }
      }

      responseParts.push({
        functionResponse: {
          name,
          response: isErr ? { error: resultData.error } : { result: resultData },
        },
      });
    }

    // Add function responses to history
    geminiHistory.push({ role: 'user', parts: responseParts });
  }
}

async function callGeminiAPI(): Promise<Record<string, unknown>> {
  const geminiTools = convertToolsToGemini(FIGMENTO_TOOLS);

  const body = {
    contents: geminiHistory,
    systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
    tools: [{ functionDeclarations: geminiTools }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { maxOutputTokens: 8192 },
  };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errBody}`);
  }

  return resp.json();
}

// ── Gemini tool schema converter ──

function convertToolsToGemini(tools: ToolDefinition[]): Record<string, unknown>[] {
  const converted = tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: convertSchemaToGemini(tool.input_schema),
  }));
  console.log('[Figmento] Converted Gemini tool schemas:', JSON.stringify(converted, null, 2));
  return converted;
}

function convertSchemaToGemini(schema: Record<string, unknown>): Record<string, unknown> {
  // Handle oneOf first — Gemini doesn't support it, flatten to first option
  // but preserve any sibling properties like description
  if (schema.oneOf) {
    const options = schema.oneOf as Record<string, unknown>[];
    if (options.length > 0) {
      const flattened = convertSchemaToGemini(options[0]);
      // Carry over description from the parent schema if the flattened result lacks one
      if (schema.description && !flattened.description) {
        flattened.description = schema.description;
      }
      return flattened;
    }
  }

  const result: Record<string, unknown> = {};

  if (schema.type) {
    result.type = (schema.type as string).toUpperCase();
  }

  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;

  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      props[key] = convertSchemaToGemini(value as Record<string, unknown>);
    }
    result.properties = props;
  }

  if (schema.required) result.required = schema.required;

  // Handle arrays: Gemini requires "items" for ARRAY type
  if (schema.items) {
    result.items = convertSchemaToGemini(schema.items as Record<string, unknown>);
  } else if (result.type === 'ARRAY' && !result.items) {
    // Array without items schema — default to generic object so Gemini doesn't reject it
    result.items = { type: 'OBJECT' };
  }

  // Gemini doesn't support minItems/maxItems — strip them
  // (they were already not being copied, but this is explicit)

  return result;
}

// ═══════════════════════════════════════════════════════════════
// CHAT — TOOL EXECUTION
// ═══════════════════════════════════════════════════════════════

async function executeToolCall(toolUse: ContentBlock): Promise<ContentBlock> {
  const { id, name, input } = toolUse;

  // Special case: generate_image calls Gemini directly
  if (name === 'generate_image') {
    return await executeGenerateImage(id!, input!);
  }

  // All other tools go to the Figma sandbox
  try {
    const data = await sendCommandToSandbox(name!, input || {});
    const summary = formatToolSummary(name!, data);
    appendToolAction(name!, summary);

    return {
      type: 'tool_result',
      tool_use_id: id,
      content: JSON.stringify(data),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    appendToolAction(name!, msg, true);

    return {
      type: 'tool_result',
      tool_use_id: id,
      content: `Error: ${msg}`,
      is_error: true,
    };
  }
}

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
// GEMINI IMAGE GENERATION
// ═══════════════════════════════════════════════════════════════

async function executeGenerateImage(toolUseId: string, input: Record<string, unknown>): Promise<ContentBlock> {
  const prompt = input.prompt as string;

  if (!settings.geminiApiKey) {
    appendToolAction('generate_image', 'No Gemini API key set', true);
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: 'Error: Gemini API key not configured. Ask the user to add it in Settings.',
      is_error: true,
    };
  }

  try {
    appendToolAction('generate_image', `Generating: "${prompt.substring(0, 60)}..."`);

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${settings.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1 },
        }),
      }
    );

    if (!resp.ok) {
      throw new Error(`Gemini API error ${resp.status}`);
    }

    const result = await resp.json();
    const base64 = result.predictions?.[0]?.bytesBase64Encoded;
    if (!base64) throw new Error('No image returned from Gemini');

    // Place the image on canvas via create_image
    const imageData = `data:image/png;base64,${base64}`;
    const createParams: Record<string, unknown> = {
      imageData,
      name: (input.name as string) || 'AI Generated Image',
      width: (input.width as number) || 400,
      height: (input.height as number) || 400,
    };
    if (input.x !== undefined) createParams.x = input.x;
    if (input.y !== undefined) createParams.y = input.y;
    if (input.parentId) createParams.parentId = input.parentId;

    const data = await sendCommandToSandbox('create_image', createParams);
    appendToolAction('generate_image', `Placed image: ${data.name} (${data.nodeId})`);

    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: JSON.stringify(data),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    appendToolAction('generate_image', msg, true);
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: `Error: ${msg}`,
      is_error: true,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// BRIDGE (WebSocket — existing functionality)
// ═══════════════════════════════════════════════════════════════

function initBridge() {
  $('bridge-connect').addEventListener('click', toggleBridge);
}

function generateChannelId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'figmento-';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function setBridgeConnected(connected: boolean) {
  isBridgeConnected = connected;
  $('bridge-dot').className = 'status-dot' + (connected ? ' connected' : '');
  $('bridge-status').textContent = connected ? 'Connected' : 'Disconnected';
  $('bridge-connect').textContent = connected ? 'Disconnect' : 'Connect';
  ($('bridge-connect') as HTMLElement).className = 'btn' + (connected ? ' btn-danger' : ' btn-primary');
  $('bridge-channel').textContent = connected ? bridgeChannelId! : '---';
}

function addBridgeLog(text: string, type: string = 'sys') {
  const area = $('bridge-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `${time}  ${text}`;
  area.appendChild(entry);
  area.scrollTop = area.scrollHeight;
  while (area.children.length > 100) area.removeChild(area.firstChild!);
}

function toggleBridge() {
  if (isBridgeConnected) {
    if (ws) { ws.close(); ws = null; }
    setBridgeConnected(false);
    addBridgeLog('Disconnected', 'sys');
  } else {
    connectBridge();
  }
}

function connectBridge() {
  const url = ($('bridge-url') as HTMLInputElement).value.trim();
  if (!url) return;

  bridgeChannelId = generateChannelId();
  addBridgeLog(`Connecting to ${url}...`, 'sys');

  try {
    ws = new WebSocket(url);
  } catch (e) {
    addBridgeLog(`Failed: ${(e as Error).message}`, 'err');
    return;
  }

  ws.onopen = () => {
    addBridgeLog('WebSocket connected', 'ok');
    ws!.send(JSON.stringify({ type: 'join', channel: bridgeChannelId }));
  };

  ws.onmessage = (event) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(event.data as string); } catch { return; }

    if (msg.type === 'joined') {
      setBridgeConnected(true);
      addBridgeLog(`Joined channel: ${msg.channel} (${msg.clients} client(s))`, 'ok');
      return;
    }

    if (msg.type === 'command') {
      bridgeCommandCount++;
      $('bridge-cmd-count').textContent = String(bridgeCommandCount);
      addBridgeLog(`CMD ${msg.id}: ${msg.action}`, 'cmd');
      postToSandbox({ type: 'execute-command', command: msg });
      return;
    }

    if (msg.type === 'error') {
      addBridgeLog(`Server error: ${msg.error}`, 'err');
    }
  };

  ws.onclose = () => {
    setBridgeConnected(false);
    addBridgeLog('WebSocket disconnected', 'err');
    ws = null;
  };

  ws.onerror = () => addBridgeLog('WebSocket error', 'err');
}

// ═══════════════════════════════════════════════════════════════
// SANDBOX COMMUNICATION
// ═══════════════════════════════════════════════════════════════

function postToSandbox(msg: Record<string, unknown>) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// Handle messages from the Figma sandbox
window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage;
  if (!msg) return;

  if (msg.type === 'command-result') {
    const resp = msg.response;
    const cmdId = resp.id as string;

    // Route to chat if it's a chat command
    if (cmdId.startsWith('chat-')) {
      const pending = pendingChatCommands.get(cmdId);
      if (pending) {
        pendingChatCommands.delete(cmdId);
        if (resp.success) {
          pending.resolve(resp.data || {});
        } else {
          pending.reject(new Error(resp.error || 'Command failed'));
        }
      }
      return;
    }

    // Otherwise route to bridge
    if (resp.success) {
      addBridgeLog(`RSP ${cmdId}: OK`, 'ok');
    } else {
      bridgeErrorCount++;
      $('bridge-err-count').textContent = String(bridgeErrorCount);
      addBridgeLog(`RSP ${cmdId}: ERR ${resp.error}`, 'err');
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(resp));
    }
  }

  if (msg.type === 'settings-loaded') {
    loadSettings(msg.settings || {});
  }
};

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

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initChat();
  initBridge();
  initSettings();
});
