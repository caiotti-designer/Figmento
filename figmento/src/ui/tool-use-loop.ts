/**
 * Shared Tool-Use Execution Engine — FC-1
 *
 * Provider-agnostic loop used by Chat mode and all function-calling modes
 * (Screenshot, Text-to-Layout, Presentation, Carousel, Hero, Ad Analyzer).
 *
 * Design contract:
 *  - Caller pushes the user turn into `messages` before calling runToolUseLoop.
 *  - The loop mutates `messages` in place (appends assistant + tool-result turns).
 *  - All DOM/UI side effects happen via callbacks (onToolCall, onProgress, onTextChunk).
 *  - No imports from state.ts or any DOM API — fully UI-agnostic.
 */

import { ToolDefinition, ToolResolver, ToolResolverContext } from './tools-schema';

// ═══════════════════════════════════════════════════════════════
// PROVIDER-SPECIFIC TYPES (re-exported for callers)
// ═══════════════════════════════════════════════════════════════

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Returned by `onToolCall`. The `content` field is the pre-sanitized
 * string to store in message history (base64 stripped, screenshot
 * summarized, JSON-serialized). Error messages should NOT include an
 * "Error: " prefix — the loop adds it where needed per provider.
 */
export interface ToolCallResult {
  /** Sanitized result content string (JSON or plain message). */
  content: string;
  is_error: boolean;
}

export interface ToolUseLoopOptions {
  /** Which AI provider to call. */
  provider: 'claude' | 'gemini' | 'openai';
  /** Provider API key. */
  apiKey: string;
  /** Model ID. */
  model: string;
  /** Full system prompt string. */
  systemPrompt: string;
  /** Tool definitions — static array or phase-aware resolver function. */
  tools: ToolDefinition[] | ToolResolver;
  /**
   * Provider-specific message history array. Mutated in place by the loop.
   * Caller must push the initial user turn before calling runToolUseLoop.
   */
  messages: AnthropicMessage[] | GeminiContent[] | Array<Record<string, unknown>>;
  /**
   * Execute a tool call and return its result. Called for every tool the AI
   * invokes. Responsible for: sandbox communication, special-tool handling
   * (generate_image, update_memory), and base64 stripping / screenshot
   * summarization before returning content.
   */
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
  /**
   * Progress notification. Called at loop start, on each tool call
   * (with toolName), and at loop end.
   */
  onProgress: (message: string, toolName?: string) => void;
  /**
   * Receives text content from each AI response iteration.
   * Called once per iteration when the response contains text blocks.
   */
  onTextChunk: (text: string) => void;
  /** Maximum AI↔tool iterations. Defaults to 50. */
  maxIterations?: number;
}

export interface ToolUseResult {
  iterationsUsed: number;
  toolCallCount: number;
  /** true if the loop ended because the AI stopped calling tools (clean finish). */
  completedCleanly: boolean;
}

// ═══════════════════════════════════════════════════════════════
// BASE64 / SCREENSHOT UTILITIES  (loop-internal, exported for callers)
// ═══════════════════════════════════════════════════════════════

/** Tools whose full result payload must be replaced with a compact summary. */
export const SCREENSHOT_TOOLS = new Set(['get_screenshot', 'export_node']);

/**
 * Recursively strip base64 image data and large strings from tool results
 * before they are appended to conversation history. Prevents context-window
 * overflow (especially with Gemini).
 */
export function stripBase64FromResult(data: Record<string, unknown>): Record<string, unknown> {
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

/** Delay helper — spreads API calls to avoid TPM rate limits. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Cap a tool-result string for conversation history. Keeps the AI informed
 * (nodeId, name, key fields) while preventing unbounded history growth
 * that triggers TPM limits after 10+ tool calls.
 */
const TOOL_RESULT_MAX_CHARS = 300;

/** Tools whose results carry context the model MUST see in full. */
const CONTEXT_TOOLS = new Set([
  'analyze_canvas_context',
  'get_node_info',
  'scan_frame_structure',
  'get_page_nodes',
]);

function truncateForHistory(content: string, toolName?: string): string {
  // Context-critical tools get a much higher budget (4KB)
  const limit = toolName && CONTEXT_TOOLS.has(toolName) ? 4000 : TOOL_RESULT_MAX_CHARS;
  if (content.length <= limit) return content;

  // Try to parse as JSON and keep only essential fields
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null) {
      const slim: Record<string, unknown> = {};
      // Keep essential identifiers + context fields
      for (const key of ['nodeId', 'name', 'id', 'error', 'note', 'count', 'success', 'saved', 'width', 'height', 'texts', 'colors', 'structure', 'dimensions', 'images']) {
        if (key in parsed) slim[key] = parsed[key];
      }
      // For arrays (e.g. batch_execute results, get_page_nodes), keep count + first item
      if (Array.isArray(parsed)) {
        const first = parsed[0];
        const slimFirst = first && typeof first === 'object'
          ? { nodeId: first.nodeId, name: first.name }
          : first;
        return JSON.stringify({ count: parsed.length, first: slimFirst, note: `${parsed.length} items (truncated)` });
      }
      // If we extracted anything useful, return the slim version
      if (Object.keys(slim).length > 0) {
        const slimStr = JSON.stringify(slim);
        if (slimStr.length <= limit) return slimStr;
        // Still too big — drop structure, keep texts/colors
        delete slim.structure;
        slim.note = 'Result truncated for history';
        return JSON.stringify(slim).slice(0, limit);
      }
    }
  } catch { /* not JSON, fall through to simple truncation */ }

  return content.slice(0, limit - 3) + '...';
}

/** Replace a screenshot/export result with a compact, token-efficient summary. */
export function summarizeScreenshotResult(toolName: string, data: Record<string, unknown>): string {
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

// ═══════════════════════════════════════════════════════════════
// GEMINI TOOL SCHEMA CONVERTER
// ═══════════════════════════════════════════════════════════════

export function convertSchemaToGemini(schema: Record<string, unknown>): Record<string, unknown> {
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

function convertToolsToGemini(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: convertSchemaToGemini(tool.input_schema),
  }));
}

// ═══════════════════════════════════════════════════════════════
// OPENAI TOOL SCHEMA CONVERTER
// ═══════════════════════════════════════════════════════════════

export function convertSchemaToOpenAI(schema: Record<string, unknown>): Record<string, unknown> {
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

// ═══════════════════════════════════════════════════════════════
// API CALLERS
// ═══════════════════════════════════════════════════════════════

interface AnthropicAPIResponse {
  content: ContentBlock[];
  stop_reason: string | null;
}

async function callAnthropicAPI(
  messages: AnthropicMessage[],
  model: string,
  apiKey: string,
  systemPrompt: string,
  tools: ToolDefinition[],
): Promise<AnthropicAPIResponse> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
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

  return resp.json();
}

async function callGeminiAPI(
  messages: GeminiContent[],
  model: string,
  apiKey: string,
  systemPrompt: string,
  tools: ToolDefinition[],
): Promise<Record<string, unknown>> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ functionDeclarations: convertToolsToGemini(tools) }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { maxOutputTokens: 8192 },
      }),
    }
  );

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errBody}`);
  }

  return resp.json();
}

async function callOpenAIAPI(
  messages: Array<Record<string, unknown>>,
  model: string,
  apiKey: string,
  systemPrompt: string,
  tools: ToolDefinition[],
): Promise<Record<string, unknown>> {
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
      tools: convertToolsToOpenAI(tools),
      tool_choice: 'auto',
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${errBody}`);
  }

  return resp.json();
}

// ═══════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════

/**
 * Provider-agnostic tool-use execution loop.
 *
 * Runs the AI↔tool iteration cycle for the specified provider, calling
 * `onToolCall` for each tool invocation and `onTextChunk` for each text
 * response block. Mutates `options.messages` in place.
 *
 * Exits when:
 *  - AI returns a response with no tool calls (completedCleanly = true)
 *  - `maxIterations` is reached (completedCleanly = false)
 */
export async function runToolUseLoop(options: ToolUseLoopOptions): Promise<ToolUseResult> {
  const {
    provider,
    apiKey,
    model,
    systemPrompt,
    tools,
    messages,
    onToolCall,
    onProgress,
    onTextChunk,
    maxIterations = 50,
  } = options;

  let iterationsUsed = 0;
  let toolCallCount = 0;
  let completedCleanly = false;
  const toolsUsed = new Set<string>();

  /** Resolve the tool set for the current iteration. */
  const resolveTools = (): ToolDefinition[] => {
    if (typeof tools === 'function') {
      return tools({ toolsUsed, iteration: iterationsUsed } as ToolResolverContext);
    }
    return tools;
  };

  onProgress('Starting design agent loop');

  // ── Gemini branch ────────────────────────────────────────────
  if (provider === 'gemini') {
    const history = messages as GeminiContent[];
    let remaining = maxIterations;

    while (remaining-- > 0) {
      if (iterationsUsed > 0) await sleep(500);
      iterationsUsed++;
      const response = await callGeminiAPI(history, model, apiKey, systemPrompt, resolveTools());

      const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
      const candidate = candidates?.[0];
      if (!candidate?.content) {
        throw new Error('Empty response from Gemini');
      }

      const content = candidate.content as { parts: GeminiPart[] };
      const parts = content.parts;

      const textParts: string[] = [];
      const functionCalls: GeminiPart[] = [];

      for (const part of parts) {
        if (part.text) textParts.push(part.text);
        if (part.functionCall) functionCalls.push(part);
      }

      if (textParts.length > 0) onTextChunk(textParts.join('\n'));

      history.push({ role: 'model', parts });

      if (functionCalls.length === 0) {
        completedCleanly = true;
        break;
      }

      const responseParts: GeminiPart[] = [];
      for (const fc of functionCalls) {
        const { name, args } = fc.functionCall!;
        onProgress(`Calling tool: ${name}`, name);
        toolCallCount++;
        toolsUsed.add(name);

        let result: ToolCallResult;
        try {
          result = await onToolCall(name, args);
        } catch (err) {
          result = {
            content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          };
        }

        const trimmed = truncateForHistory(result.content, name);
        let cleanedResponse: Record<string, unknown>;
        if (result.is_error) {
          cleanedResponse = { error: trimmed };
        } else {
          try {
            cleanedResponse = { result: JSON.parse(trimmed) };
          } catch {
            cleanedResponse = { result: trimmed };
          }
        }

        responseParts.push({
          functionResponse: { name, response: cleanedResponse },
        });
      }

      history.push({ role: 'user', parts: responseParts });
    }

  // ── OpenAI branch ────────────────────────────────────────────
  } else if (provider === 'openai') {
    const history = messages as Array<Record<string, unknown>>;
    let remaining = maxIterations;

    while (remaining-- > 0) {
      if (iterationsUsed > 0) await sleep(500);
      iterationsUsed++;
      const response = await callOpenAIAPI(history, model, apiKey, systemPrompt, resolveTools());

      const choices = response.choices as Array<Record<string, unknown>> | undefined;
      const choice = choices?.[0];
      if (!choice?.message) {
        throw new Error('Empty response from OpenAI');
      }

      const message = choice.message as Record<string, unknown>;
      if (message.content) onTextChunk(message.content as string);

      history.push(message);

      const toolCalls = message.tool_calls as Array<Record<string, unknown>> | undefined;
      if (!toolCalls || toolCalls.length === 0) {
        completedCleanly = true;
        break;
      }

      for (const tc of toolCalls) {
        const fn = tc.function as Record<string, unknown>;
        const fnName = fn.name as string;
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(fn.arguments as string);
        } catch {
          args = {};
        }

        onProgress(`Calling tool: ${fnName}`, fnName);
        toolCallCount++;
        toolsUsed.add(fnName);

        let result: ToolCallResult;
        try {
          result = await onToolCall(fnName, args);
        } catch (err) {
          result = {
            content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          };
        }
        const trimmed = truncateForHistory(result.content, fnName);
        history.push({
          role: 'tool',
          tool_call_id: tc.id as string,
          // OpenAI tool messages have no is_error flag — prefix error messages
          content: result.is_error ? `Error: ${trimmed}` : trimmed,
        });
      }
    }

  // ── Anthropic / claude branch ────────────────────────────────
  } else {
    const history = messages as AnthropicMessage[];
    let remaining = maxIterations;

    while (remaining-- > 0) {
      if (iterationsUsed > 0) await sleep(500);
      iterationsUsed++;
      const response = await callAnthropicAPI(history, model, apiKey, systemPrompt, resolveTools());

      const textParts: string[] = [];
      const toolUses: ContentBlock[] = [];

      for (const block of response.content) {
        if (block.type === 'text' && block.text) textParts.push(block.text);
        else if (block.type === 'tool_use') toolUses.push(block);
      }

      if (textParts.length > 0) onTextChunk(textParts.join('\n'));

      if (toolUses.length === 0) {
        history.push({ role: 'assistant', content: response.content });
        completedCleanly = true;
        break;
      }

      history.push({ role: 'assistant', content: response.content });

      const toolResults: ContentBlock[] = [];
      for (const toolUse of toolUses) {
        onProgress(`Calling tool: ${toolUse.name}`, toolUse.name);
        toolCallCount++;
        toolsUsed.add(toolUse.name!);

        let result: ToolCallResult;
        try {
          result = await onToolCall(toolUse.name!, toolUse.input || {});
        } catch (err) {
          // Always produce a tool_result — an orphaned tool_use breaks the API protocol
          result = {
            content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: truncateForHistory(result.content, toolUse.name!),
          ...(result.is_error && { is_error: true }),
        });
      }

      history.push({ role: 'user', content: toolResults });
    }
  }

  onProgress('Design agent loop complete');

  return { iterationsUsed, toolCallCount, completedCleanly };
}
