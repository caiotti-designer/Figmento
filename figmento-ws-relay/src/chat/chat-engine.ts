/**
 * Server-Side Chat Engine — CR-1
 *
 * Runs the AI tool-use loop on the relay server instead of in the browser.
 * Routes tool calls through the WS relay channel to the plugin sandbox.
 *
 * Key differences from the plugin's chat.ts:
 *  - No DOM manipulation (server-side, no browser APIs)
 *  - No `anthropic-dangerous-direct-browser-access` header (server-side call)
 *  - Tool calls route through relay's sendCommandToChannel() instead of postMessage()
 *  - Local intelligence tools resolved from bundled compiled knowledge
 *  - Brief detection + system prompt injection runs server-side
 */

import { FigmentoRelay } from '../relay';
import { detectBrief, DesignBrief } from './brief-detector';
import { buildSystemPrompt } from './system-prompt';
import {
  chatToolResolver,
  ToolDefinition,
  ToolResolver,
  ToolResolverContext,
  SCREENSHOT_TOOLS,
  LOCAL_TOOL_NAMES,
} from './chat-tools';
import { LOCAL_TOOL_HANDLERS } from './local-intelligence';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface LearnedPreference {
  id: string;
  property: string;
  category: string;
  context: string;
  direction: string;
  learnedValue?: unknown;
  learnedRange?: { min: unknown; max: unknown };
  description: string;
  confidence: 'low' | 'medium' | 'high';
  correctionCount: number;
  correctionIds: string[];
  enabled: boolean;
  createdAt: number;
  lastSeenAt: number;
}

export interface ChatTurnRequest {
  /** User message text. */
  message: string;
  /** WS channel where the plugin sandbox is connected. */
  channel: string;
  /** AI provider. */
  provider: 'claude' | 'gemini' | 'openai';
  /** API key for the selected provider. */
  apiKey: string;
  /** Model ID (e.g. 'claude-sonnet-4-20250514', 'gemini-2.0-flash'). */
  model: string;
  /** Conversation history (provider-specific format). */
  history: unknown[];
  /** Persistent memory entries from previous sessions. */
  memory?: string[];
  /** Gemini API key for generate_image tool (optional, only needed if using image gen). */
  geminiApiKey?: string;
  /** Optional base64 image attachment (data URI) from user paste. Injected as visual context for the first message only. */
  attachmentBase64?: string;
  /** Learned user preferences to inject into system prompt. */
  preferences?: LearnedPreference[];
}

export interface ChatTurnResponse {
  /** Updated conversation history (includes the new assistant turn). */
  history: unknown[];
  /** Text response from the AI (final text blocks concatenated). */
  text: string;
  /** Tool calls executed during this turn. */
  toolCalls: Array<{ name: string; success: boolean }>;
  /** Number of AI↔tool iterations used. */
  iterationsUsed: number;
  /** Whether the loop completed cleanly (AI stopped calling tools). */
  completedCleanly: boolean;
  /** Memory entries added during this turn (via update_memory tool). */
  newMemoryEntries: string[];
}

interface ToolCallResult {
  content: string;
  is_error: boolean;
  /** Optional: base64 image data to inject as vision context (Gemini inlineData / Claude image block). */
  visionImage?: string;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER API CALLERS (no browser headers)
// ═══════════════════════════════════════════════════════════════

interface AnthropicMessage {
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

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

async function callAnthropicAPI(
  messages: AnthropicMessage[],
  model: string,
  apiKey: string,
  systemPrompt: string,
  tools: ToolDefinition[],
): Promise<{ content: ContentBlock[]; stop_reason: string | null }> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // NO 'anthropic-dangerous-direct-browser-access' — this is server-side
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      tools,
      messages,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${errBody}`);
  }

  return resp.json() as Promise<{ content: ContentBlock[]; stop_reason: string | null }>;
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
  if (schema.type) result.type = (schema.type as string).toUpperCase();
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

async function callGeminiAPI(
  messages: GeminiContent[],
  model: string,
  apiKey: string,
  systemPrompt: string,
  tools: ToolDefinition[],
): Promise<Record<string, unknown>> {
  const geminiTools = tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: convertSchemaToGemini(tool.input_schema),
  }));

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ functionDeclarations: geminiTools }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { maxOutputTokens: 8192 },
      }),
    }
  );

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errBody}`);
  }

  return resp.json() as Promise<Record<string, unknown>>;
}

function convertSchemaToOpenAI(schema: Record<string, unknown>): Record<string, unknown> {
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
  if (schema.items) result.items = convertSchemaToOpenAI(schema.items as Record<string, unknown>);
  if (schema.minimum !== undefined) result.minimum = schema.minimum;
  if (schema.maximum !== undefined) result.maximum = schema.maximum;
  return result;
}

async function callOpenAIAPI(
  messages: Array<Record<string, unknown>>,
  model: string,
  apiKey: string,
  systemPrompt: string,
  tools: ToolDefinition[],
): Promise<Record<string, unknown>> {
  const openaiTools = tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertSchemaToOpenAI(tool.input_schema),
    },
  }));

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: openaiTools,
      tool_choice: 'auto',
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${errBody}`);
  }

  return resp.json() as Promise<Record<string, unknown>>;
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function summarizeScreenshotResult(toolName: string, data: Record<string, unknown>): string {
  const nodeId = data.nodeId || 'unknown';
  const w = data.width || '?';
  const h = data.height || '?';
  return JSON.stringify({
    nodeId, width: w, height: h,
    note: `Screenshot exported for ${nodeId} at ${w}x${h}. Use get_node_info to inspect.`,
  });
}

const TOOL_RESULT_MAX_CHARS = 300;

function truncateForHistory(content: string): string {
  if (content.length <= TOOL_RESULT_MAX_CHARS) return content;

  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null) {
      if (Array.isArray(parsed)) {
        const first = parsed[0];
        const slimFirst = first && typeof first === 'object'
          ? { nodeId: first.nodeId, name: first.name }
          : first;
        return JSON.stringify({ count: parsed.length, first: slimFirst, note: `${parsed.length} items (truncated)` });
      }
      const slim: Record<string, unknown> = {};
      for (const key of ['nodeId', 'name', 'id', 'error', 'note', 'count', 'success', 'saved', 'width', 'height']) {
        if (key in parsed) slim[key] = parsed[key];
      }
      if (Object.keys(slim).length > 0) {
        slim.note = 'Result truncated for history';
        return JSON.stringify(slim);
      }
    }
  } catch { /* not JSON */ }

  return content.slice(0, TOOL_RESULT_MAX_CHARS - 3) + '...';
}

// ═══════════════════════════════════════════════════════════════
// SPECIAL TOOL HANDLERS (server-side)
// ═══════════════════════════════════════════════════════════════

async function executeGenerateImage(
  args: Record<string, unknown>,
  geminiApiKey: string | undefined,
  sendToPlugin: (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<ToolCallResult> {
  const prompt = args.prompt as string;

  if (!geminiApiKey) {
    return { content: 'Gemini API key not configured for image generation.', is_error: true };
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );

    if (!resp.ok) throw new Error(`Gemini API error ${resp.status}`);

    const result = await resp.json() as Record<string, unknown>;
    const candidates = result.candidates as Array<Record<string, unknown>> | undefined;
    const parts = (candidates?.[0] as Record<string, unknown>)?.content as Record<string, unknown> | undefined;
    const partsList = ((parts?.parts as Array<Record<string, unknown>>) || []);
    const imgPart = partsList.find((p: Record<string, unknown>) => p.inlineData);
    const inlineData = imgPart?.inlineData as Record<string, unknown> | undefined;
    const base64 = inlineData?.data as string | undefined;
    if (!base64) throw new Error('No image returned from Gemini');

    const imageData = `data:image/png;base64,${base64}`;
    const createParams: Record<string, unknown> = {
      imageData,
      name: (args.name as string) || 'AI Generated Image',
    };
    if (args.width) createParams.width = args.width;
    if (args.height) createParams.height = args.height;
    if (!args.parentId && !createParams.width) createParams.width = 400;
    if (!args.parentId && !createParams.height) createParams.height = 400;
    if (args.x !== undefined) createParams.x = args.x;
    if (args.y !== undefined) createParams.y = args.y;
    if (args.parentId) createParams.parentId = args.parentId;

    const data = await sendToPlugin('create_image', createParams);

    return {
      content: JSON.stringify({
        nodeId: data.nodeId,
        name: data.name,
        note: 'Image generated and placed on canvas successfully.',
      }),
      is_error: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { content: msg, is_error: true };
  }
}

// ═══════════════════════════════════════════════════════════════
// CANVAS CONTEXT ANALYSIS (composite server-side tool)
// ═══════════════════════════════════════════════════════════════

async function executeAnalyzeCanvasContext(
  args: Record<string, unknown>,
  sendToPlugin: (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<ToolCallResult> {
  try {
    // Step 1: Resolve target nodeId (arg → selection → first page node)
    let nodeId = args.nodeId as string | undefined;

    if (!nodeId) {
      const selection = await sendToPlugin('get_selection', {});
      const selNodes = (selection.nodes as Array<Record<string, unknown>>) || [];
      if (selNodes.length > 0) nodeId = selNodes[0].nodeId as string;
    }

    if (!nodeId) {
      const pageResult = await sendToPlugin('get_page_nodes', {});
      const pageNodes = (pageResult.nodes as Array<Record<string, unknown>>) || [];
      const firstFrame = pageNodes.find(n => n.type === 'FRAME') || pageNodes[0];
      if (firstFrame) nodeId = firstFrame.nodeId as string;
    }

    if (!nodeId) {
      return { content: 'No frames found on the canvas to analyze.', is_error: true };
    }

    // Step 2: Get node properties
    const nodeInfo = await sendToPlugin('get_node_info', { nodeId });

    // Step 3: Get screenshot (optional — fails gracefully)
    let visionImage: string | undefined;
    try {
      const screenshot = await sendToPlugin('get_screenshot', { nodeId });
      const imgData = screenshot.imageData as string | undefined;
      if (imgData && imgData.startsWith('data:image/')) visionImage = imgData;
    } catch { /* screenshot is optional */ }

    // Step 4: Extract context from node properties
    const fills = (nodeInfo.fills as Array<Record<string, unknown>>) || [];
    const dominantColors = fills
      .filter(f => f.type === 'SOLID' && f.color)
      .map(f => f.color as string)
      .slice(0, 4);

    const children = (nodeInfo.children as Array<Record<string, unknown>>) || [];
    const textContent = children
      .filter(c => c.type === 'TEXT' && c.characters)
      .map(c => c.characters as string)
      .slice(0, 6);

    const context = {
      nodeId,
      name: nodeInfo.name || 'frame',
      dimensions: `${nodeInfo.width ?? '?'}x${nodeInfo.height ?? '?'}`,
      dominantColors,
      textContent,
      childCount: children.length,
      note: visionImage
        ? 'A screenshot of this frame has been attached for visual reference. Use the colors, composition, and visual style you can see to inform any image generation or design decisions.'
        : 'Use the color and text data above to infer the design mood and style.',
    };

    return {
      content: JSON.stringify(context),
      is_error: false,
      visionImage,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { content: `analyze_canvas_context failed: ${msg}`, is_error: true };
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN CHAT TURN HANDLER
// ═══════════════════════════════════════════════════════════════

const MAX_ITERATIONS = 50;

/**
 * Execute a single chat turn: detect brief, build system prompt, run the
 * AI tool-use loop, and route tool calls through the relay channel.
 */
export async function handleChatTurn(
  relay: FigmentoRelay,
  request: ChatTurnRequest,
): Promise<ChatTurnResponse> {
  const { message, channel, provider, apiKey, model, memory, geminiApiKey } = request;

  // Verify the channel has connected clients
  if (!relay.hasClientsInChannel(channel)) {
    throw new Error(`No plugin connected to channel "${channel}". Ensure the Bridge tab is connected.`);
  }

  // Detect design brief from user message
  const brief: DesignBrief = detectBrief(message);
  const systemPrompt = buildSystemPrompt(brief, memory || [], request.preferences || []);

  // Build tool resolver
  const tools: ToolResolver = chatToolResolver();
  const toolsUsed = new Set<string>();

  // Track results
  const textParts: string[] = [];
  const toolCallLog: Array<{ name: string; success: boolean }> = [];
  const newMemoryEntries: string[] = [];

  // Send a command to the plugin sandbox through the relay channel
  const sendToPlugin = (action: string, params: Record<string, unknown>) =>
    relay.sendCommandToChannel(channel, action, params);

  // Tool call handler
  const handleToolCall = async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
    // generate_image — server-side Gemini call + place via plugin
    if (name === 'generate_image') {
      return executeGenerateImage(args, geminiApiKey, sendToPlugin);
    }

    // analyze_canvas_context — composite: get_selection + get_node_info + get_screenshot
    if (name === 'analyze_canvas_context') {
      return executeAnalyzeCanvasContext(args, sendToPlugin);
    }

    // update_memory — persist in response, no sandbox call
    if (name === 'update_memory') {
      const entry = (args.entry as string) || '';
      if (!entry) return { content: 'entry is required', is_error: true };
      newMemoryEntries.push(entry);
      return { content: JSON.stringify({ saved: true, entry }), is_error: false };
    }

    // Local intelligence — resolved from bundled compiled knowledge, no WS
    if (LOCAL_TOOL_NAMES.has(name)) {
      const handler = LOCAL_TOOL_HANDLERS[name];
      if (handler) {
        const result = handler(args);
        return { content: JSON.stringify(result), is_error: false };
      }
    }

    // All other tools — route through relay WS channel to plugin sandbox
    try {
      const data = await sendToPlugin(name, args);

      const content = SCREENSHOT_TOOLS.has(name)
        ? summarizeScreenshotResult(name, data)
        : JSON.stringify(stripBase64FromResult(data));

      return { content, is_error: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { content: msg, is_error: true };
    }
  };

  // Resolve tools for current iteration
  const resolveTools = (iteration: number): ToolDefinition[] => {
    return tools({ toolsUsed, iteration } as ToolResolverContext);
  };

  // Clone history to avoid mutating the caller's array
  const history = [...request.history];

  let iterationsUsed = 0;
  let completedCleanly = false;

  // ── Provider-specific loops ──

  if (provider === 'gemini') {
    const geminiHistory = history as GeminiContent[];
    if (request.attachmentBase64) {
      const base64 = request.attachmentBase64.replace(/^data:image\/\w+;base64,/, '');
      const mimeMatch = request.attachmentBase64.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeMatch?.[1] || 'image/png';
      geminiHistory.push({
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } } as unknown as GeminiPart,
          { text: message },
        ],
      });
    } else {
      geminiHistory.push({ role: 'user', parts: [{ text: message }] });
    }

    let remaining = MAX_ITERATIONS;
    while (remaining-- > 0) {
      if (iterationsUsed > 0) await sleep(500);
      iterationsUsed++;

      const response = await callGeminiAPI(geminiHistory, model, apiKey, systemPrompt, resolveTools(iterationsUsed));
      const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
      const candidate = candidates?.[0];
      if (!candidate?.content) throw new Error('Empty response from Gemini');

      const content = candidate.content as { parts: GeminiPart[] };
      const parts = content.parts;

      const texts: string[] = [];
      const functionCalls: GeminiPart[] = [];
      for (const part of parts) {
        if (part.text) texts.push(part.text);
        if (part.functionCall) functionCalls.push(part);
      }
      if (texts.length > 0) textParts.push(texts.join('\n'));
      geminiHistory.push({ role: 'model', parts });

      if (functionCalls.length === 0) { completedCleanly = true; break; }

      const responseParts: GeminiPart[] = [];
      const pendingVisionImages: string[] = [];

      for (const fc of functionCalls) {
        const { name, args } = fc.functionCall!;
        toolsUsed.add(name);
        const result = await handleToolCall(name, args);
        toolCallLog.push({ name, success: !result.is_error });

        if (result.visionImage) pendingVisionImages.push(result.visionImage);

        const trimmed = truncateForHistory(result.content);
        let cleanedResponse: Record<string, unknown>;
        if (result.is_error) {
          cleanedResponse = { error: trimmed };
        } else {
          try { cleanedResponse = { result: JSON.parse(trimmed) }; }
          catch { cleanedResponse = { result: trimmed }; }
        }
        responseParts.push({ functionResponse: { name, response: cleanedResponse } });
      }
      geminiHistory.push({ role: 'user', parts: responseParts });

      // Inject vision screenshots as a follow-up user message (Gemini supports inlineData)
      for (const imgData of pendingVisionImages) {
        const base64 = imgData.replace(/^data:image\/\w+;base64,/, '');
        geminiHistory.push({
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: base64 } } as unknown as GeminiPart,
            { text: 'This is a screenshot of the frame analyzed above. Use the visual style, colors, composition, and imagery you can see to inform your design decisions and image generation prompts.' },
          ],
        });
      }
    }

    return {
      history: geminiHistory,
      text: textParts.join('\n'),
      toolCalls: toolCallLog,
      iterationsUsed,
      completedCleanly,
      newMemoryEntries,
    };
  }

  if (provider === 'openai') {
    const openaiHistory = history as Array<Record<string, unknown>>;
    if (request.attachmentBase64 && (model.startsWith('gpt-4') || model.includes('gpt-4o'))) {
      openaiHistory.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: request.attachmentBase64 } },
          { type: 'text', text: message },
        ],
      });
    } else {
      openaiHistory.push({ role: 'user', content: message });
    }

    let remaining = MAX_ITERATIONS;
    while (remaining-- > 0) {
      if (iterationsUsed > 0) await sleep(500);
      iterationsUsed++;

      const response = await callOpenAIAPI(openaiHistory, model, apiKey, systemPrompt, resolveTools(iterationsUsed));
      const choices = response.choices as Array<Record<string, unknown>> | undefined;
      const choice = choices?.[0];
      if (!choice?.message) throw new Error('Empty response from OpenAI');

      const msg = choice.message as Record<string, unknown>;
      if (msg.content) textParts.push(msg.content as string);
      openaiHistory.push(msg);

      const toolCalls = msg.tool_calls as Array<Record<string, unknown>> | undefined;
      if (!toolCalls || toolCalls.length === 0) { completedCleanly = true; break; }

      for (const tc of toolCalls) {
        const fn = tc.function as Record<string, unknown>;
        const fnName = fn.name as string;
        let args: Record<string, unknown>;
        try { args = JSON.parse(fn.arguments as string); } catch { args = {}; }

        toolsUsed.add(fnName);
        const result = await handleToolCall(fnName, args);
        toolCallLog.push({ name: fnName, success: !result.is_error });

        const trimmed = truncateForHistory(result.content);
        openaiHistory.push({
          role: 'tool',
          tool_call_id: tc.id as string,
          content: result.is_error ? `Error: ${trimmed}` : trimmed,
        });
      }
    }

    return {
      history: openaiHistory,
      text: textParts.join('\n'),
      toolCalls: toolCallLog,
      iterationsUsed,
      completedCleanly,
      newMemoryEntries,
    };
  }

  // ── Anthropic / Claude (default) ──
  const claudeHistory = history as AnthropicMessage[];
  if (request.attachmentBase64) {
    const base64 = request.attachmentBase64.replace(/^data:image\/\w+;base64,/, '');
    const mimeMatch = request.attachmentBase64.match(/^data:(image\/\w+);base64,/);
    const mediaType = (mimeMatch?.[1] || 'image/png') as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    claudeHistory.push({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } } as unknown as ContentBlock,
        { type: 'text', text: message } as ContentBlock,
      ] as unknown as string,
    });
  } else {
    claudeHistory.push({ role: 'user', content: message });
  }

  let remaining = MAX_ITERATIONS;
  while (remaining-- > 0) {
    if (iterationsUsed > 0) await sleep(500);
    iterationsUsed++;

    const response = await callAnthropicAPI(claudeHistory, model, apiKey, systemPrompt, resolveTools(iterationsUsed));

    const texts: string[] = [];
    const toolUses: ContentBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text' && block.text) texts.push(block.text);
      else if (block.type === 'tool_use') toolUses.push(block);
    }
    if (texts.length > 0) textParts.push(texts.join('\n'));

    if (toolUses.length === 0) {
      claudeHistory.push({ role: 'assistant', content: response.content });
      completedCleanly = true;
      break;
    }

    claudeHistory.push({ role: 'assistant', content: response.content });

    const toolResults: ContentBlock[] = [];
    for (const toolUse of toolUses) {
      toolsUsed.add(toolUse.name!);
      const result = await handleToolCall(toolUse.name!, toolUse.input || {});
      toolCallLog.push({ name: toolUse.name!, success: !result.is_error });

      if (result.visionImage && !result.is_error) {
        // Include screenshot inline in the tool_result for Claude vision
        const base64 = result.visionImage.replace(/^data:image\/\w+;base64,/, '');
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: [
            { type: 'text', text: truncateForHistory(result.content) } as unknown as ContentBlock,
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } } as unknown as ContentBlock,
          ] as unknown as string,
        });
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: truncateForHistory(result.content),
          ...(result.is_error && { is_error: true }),
        });
      }
    }
    claudeHistory.push({ role: 'user', content: toolResults });
  }

  return {
    history: claudeHistory,
    text: textParts.join('\n'),
    toolCalls: toolCallLog,
    iterationsUsed,
    completedCleanly,
    newMemoryEntries,
  };
}
