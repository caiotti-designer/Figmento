/**
 * Figmento Chat Module — AI design agent chat (Anthropic + Gemini).
 * Ported from figmento-plugin/src/ui-app.ts chat sections.
 */

import { FIGMENTO_TOOLS, ToolDefinition } from './tools-schema';
import { buildSystemPrompt } from './system-prompt';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

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

export interface ChatSettings {
  anthropicApiKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
  model: string;
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let conversationHistory: Message[] = [];
let geminiHistory: GeminiContent[] = [];
let openaiHistory: Array<Record<string, unknown>> = [];
let isProcessing = false;
let chatCommandCounter = 0;
const pendingChatCommands = new Map<string, PendingCommand>();
let memoryEntries: string[] = [];

// Settings reference — updated from outside via updateChatSettings()
let chatSettings: ChatSettings = {
  anthropicApiKey: '',
  geminiApiKey: '',
  openaiApiKey: '',
  model: 'gemini-3.1-flash-image-preview',
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
// CHAT — API
// ═══════════════════════════════════════════════════════════════

async function sendMessage() {
  const input = $('chat-input') as HTMLTextAreaElement;
  const text = input.value.trim();
  if (!text || isProcessing) return;

  const useGemini = isGeminiModel(chatSettings.model);
  const useOpenAI = isOpenAIModel(chatSettings.model);

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

  setProcessing(true);
  try {
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
    model: chatSettings.model,
    max_tokens: 8192,
    system: buildSystemPrompt(memoryEntries),
    tools: FIGMENTO_TOOLS,
    messages: conversationHistory,
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': chatSettings.anthropicApiKey,
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

async function runGeminiLoop() {
  let maxIterations = 50;
  while (maxIterations-- > 0) {
    const response = await callGeminiAPI();

    const candidate = (response as any).candidates?.[0];
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

    geminiHistory.push({ role: 'model', parts });

    if (functionCalls.length === 0) break;

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
      } else if (name === 'update_memory') {
        const memResult = await executeUpdateMemory(`gemini-mem-${Date.now()}`, args);
        resultData = memResult.is_error ? { error: memResult.content } : { saved: true };
        isErr = !!memResult.is_error;
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

      let cleanedResult: Record<string, unknown>;
      if (isErr) {
        cleanedResult = { error: resultData.error };
      } else if (SCREENSHOT_TOOLS.has(name)) {
        cleanedResult = { result: JSON.parse(summarizeScreenshotResult(name, resultData)) };
      } else {
        cleanedResult = { result: stripBase64FromResult(resultData) };
      }

      responseParts.push({
        functionResponse: { name, response: cleanedResult },
      });
    }

    geminiHistory.push({ role: 'user', parts: responseParts });
  }
}

async function callGeminiAPI(): Promise<Record<string, unknown>> {
  const geminiTools = convertToolsToGemini(FIGMENTO_TOOLS);

  const body = {
    contents: geminiHistory,
    systemInstruction: { parts: [{ text: buildSystemPrompt(memoryEntries) }] },
    tools: [{ functionDeclarations: geminiTools }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { maxOutputTokens: 8192 },
  };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${chatSettings.model}:generateContent?key=${chatSettings.geminiApiKey}`,
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
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: convertSchemaToGemini(tool.input_schema),
  }));
}

function convertSchemaToGemini(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.oneOf) {
    const options = schema.oneOf as Record<string, unknown>[];
    if (options.length > 0) {
      const flattened = convertSchemaToGemini(options[0]);
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

  if (schema.items) {
    result.items = convertSchemaToGemini(schema.items as Record<string, unknown>);
  } else if (result.type === 'ARRAY' && !result.items) {
    result.items = { type: 'OBJECT' };
  }

  return result;
}

// ── OpenAI conversation loop ──

async function runOpenAILoop() {
  let maxIterations = 50;
  while (maxIterations-- > 0) {
    const response = await callOpenAIAPI();

    const choice = (response as any).choices?.[0];
    if (!choice?.message) {
      appendChatBubble('assistant', '<span class="chat-error">Empty response from OpenAI</span>');
      break;
    }

    const message = choice.message;

    if (message.content) {
      appendChatBubble('assistant', formatMarkdown(message.content));
    }

    // Store assistant message in history
    openaiHistory.push(message);

    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) break;

    // Execute each tool call and push results
    for (const tc of toolCalls) {
      const fnName = tc.function.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      let resultContent: string;
      let isErr = false;

      if (fnName === 'generate_image') {
        const imgResult = await executeGenerateImage(`openai-${Date.now()}`, args);
        resultContent = imgResult.content || '{}';
        isErr = !!imgResult.is_error;
      } else if (fnName === 'update_memory') {
        const memResult = await executeUpdateMemory(`openai-mem-${Date.now()}`, args);
        resultContent = memResult.content || '{}';
        isErr = !!memResult.is_error;
      } else {
        try {
          const data = await sendCommandToSandbox(fnName, args);
          const summary = formatToolSummary(fnName, data);
          appendToolAction(fnName, summary);
          resultContent = SCREENSHOT_TOOLS.has(fnName)
            ? summarizeScreenshotResult(fnName, data)
            : JSON.stringify(stripBase64FromResult(data));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          appendToolAction(fnName, msg, true);
          resultContent = `Error: ${msg}`;
          isErr = true;
        }
      }

      openaiHistory.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: isErr ? `Error: ${resultContent}` : resultContent,
      });
    }
  }
}

async function callOpenAIAPI(): Promise<Record<string, unknown>> {
  const openaiTools = convertToolsToOpenAI(FIGMENTO_TOOLS);

  const body = {
    model: chatSettings.model,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: buildSystemPrompt(memoryEntries) },
      ...openaiHistory,
    ],
    tools: openaiTools,
    tool_choice: 'auto',
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${chatSettings.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${errBody}`);
  }

  return resp.json();
}

// ── OpenAI tool schema converter ──

function convertToolsToOpenAI(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertSchemaToOpenAI(tool.input_schema),
    },
  }));
}

function convertSchemaToOpenAI(schema: Record<string, unknown>): Record<string, unknown> {
  // OpenAI supports JSON Schema natively, but oneOf on top-level params
  // can cause issues — flatten to first option (same strategy as Gemini)
  if (schema.oneOf) {
    const options = schema.oneOf as Record<string, unknown>[];
    if (options.length > 0) {
      const flattened = convertSchemaToOpenAI(options[0]);
      if (schema.description && !flattened.description) {
        flattened.description = schema.description;
      }
      return flattened;
    }
  }

  const result: Record<string, unknown> = {};

  if (schema.type) result.type = schema.type;
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;
  if (schema.required) result.required = schema.required;

  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      props[key] = convertSchemaToOpenAI(value as Record<string, unknown>);
    }
    result.properties = props;
  }

  if (schema.items) {
    result.items = convertSchemaToOpenAI(schema.items as Record<string, unknown>);
  }

  if (schema.minimum !== undefined) result.minimum = schema.minimum;
  if (schema.maximum !== undefined) result.maximum = schema.maximum;
  if (schema.minItems !== undefined) result.minItems = schema.minItems;
  if (schema.maxItems !== undefined) result.maxItems = schema.maxItems;

  return result;
}

// ═══════════════════════════════════════════════════════════════
// CHAT — BASE64 STRIPPING (prevent token overflow)
// ═══════════════════════════════════════════════════════════════

/**
 * Strip base64 image data from tool results before appending to
 * conversation history. Screenshots / exports return multi-MB base64
 * strings that blow context limits (especially Gemini).
 */
function stripBase64FromResult(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      cleaned[key] = '[image data stripped]';
    } else if (typeof value === 'string' && value.length > 50000) {
      cleaned[key] = '[large data stripped]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = stripBase64FromResult(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/** For screenshot/export tools, replace the entire result with a compact placeholder. */
function summarizeScreenshotResult(toolName: string, data: Record<string, unknown>): string {
  const nodeId = data.nodeId || 'unknown';
  const w = data.width || '?';
  const h = data.height || '?';
  const name = data.name || '';
  const label = name ? `"${name}" (${nodeId})` : `${nodeId}`;
  return JSON.stringify({
    nodeId,
    width: w,
    height: h,
    note: `Screenshot exported for ${label} at ${w}×${h}. Use get_node_info to inspect structure.`,
  });
}

const SCREENSHOT_TOOLS = new Set(['get_screenshot', 'export_node']);

// ═══════════════════════════════════════════════════════════════
// CHAT — TOOL EXECUTION
// ═══════════════════════════════════════════════════════════════

async function executeToolCall(toolUse: ContentBlock): Promise<ContentBlock> {
  const { id, name, input } = toolUse;

  if (name === 'generate_image') {
    return await executeGenerateImage(id!, input!);
  }

  if (name === 'update_memory') {
    return await executeUpdateMemory(id!, input!);
  }

  try {
    const data = await sendCommandToSandbox(name!, input || {});
    const summary = formatToolSummary(name!, data);
    appendToolAction(name!, summary);

    const historyContent = SCREENSHOT_TOOLS.has(name!)
      ? summarizeScreenshotResult(name!, data)
      : JSON.stringify(stripBase64FromResult(data));

    return {
      type: 'tool_result',
      tool_use_id: id,
      content: historyContent,
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

  if (!chatSettings.geminiApiKey) {
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
    // Only pass explicit dimensions — when parentId is set, let
    // handleCreateImage auto-fill the parent frame instead.
    if (input.width) createParams.width = input.width;
    if (input.height) createParams.height = input.height;
    if (!input.parentId && !createParams.width) createParams.width = 400;
    if (!input.parentId && !createParams.height) createParams.height = 400;
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
// CHAT — MEMORY
// ═══════════════════════════════════════════════════════════════

async function executeUpdateMemory(toolUseId: string, input: Record<string, unknown>): Promise<ContentBlock> {
  const entry = (input.entry as string) || '';
  if (!entry) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: 'Error: entry is required',
      is_error: true,
    };
  }

  // Save to clientStorage via sandbox
  postToSandbox({ type: 'save-memory', entry });

  // Also update local state so it's available immediately
  memoryEntries.push(entry);

  appendToolAction('update_memory', `Saved: "${entry.substring(0, 60)}${entry.length > 60 ? '...' : ''}"`);

  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: JSON.stringify({ saved: true, entry }),
  };
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
