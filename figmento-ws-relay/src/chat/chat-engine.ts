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
// DESIGN AGENT PROMPT — appended to system prompt for ALL providers
// Mirrors CLAUDE_CODE_DESIGN_PROMPT from claude-code-session-manager.ts
// so that Codex, OpenAI, Gemini, etc. get the same design expertise.
// ═══════════════════════════════════════════════════════════════

const DESIGN_AGENT_PROMPT = `

## Figmento Design Agent — Enhanced Mode

You have access to Figmento tools for creating designs in Figma. Use them with expert-level design reasoning.

### Core Design Rules
- ALWAYS set layoutSizingVertical to HUG on content frames. NEVER leave fixed height on dynamic content.
- ALWAYS set layoutSizingHorizontal to FILL on text inside auto-layout frames.
- Use auto-layout on ALL container frames. Never use absolute positioning inside auto-layout parents.
- fontWeight: ONLY use 400 (Regular) or 700 (Bold). NEVER use 600 — it causes Inter fallback on non-Inter fonts.
- lineHeight: ALWAYS pass in PIXELS (fontSize × multiplier). NEVER pass a raw multiplier like 1.5.
- Give every element a descriptive layer name. Never leave "Rectangle" or "Text" defaults.
- Create exactly ONE root frame per design. Never create duplicates.
- ALWAYS end your response with a clear completion summary. NEVER end on "Now let me..." without completing the action.

### Execution Budget Rules (CRITICAL — prevents timeouts and API errors)
- You have a HARD LIMIT of 25 tool call rounds. Plan accordingly.
- ALWAYS use batch_execute to bundle multiple operations into ONE round. This is the #1 way to avoid timeouts.
- NEVER call more than 3 tools in parallel in a single response.
- For COMPLEX requests (full pages, multi-section designs): use batch_execute aggressively — a single batch can hold up to 50 commands.
- Keep your final text response SHORT (2-3 sentences max). Do NOT write long summaries.

### batch_execute Usage (CRITICAL for performance)
Bundle multiple operations into a single batch_execute call using tempId references:
batch_execute({ commands: [
  { action: "create_frame", params: { name: "Card", width: 400, height: 300, fills: [{ type: "SOLID", color: "#FFFFFF" }] }, tempId: "card" },
  { action: "create_text", params: { content: "Title", parentId: "$card", fontSize: 24, fontWeight: 700, fontFamily: "Inter", color: "#000000" } },
  { action: "create_text", params: { content: "Description", parentId: "$card", fontSize: 16, fontWeight: 400, fontFamily: "Inter", color: "#666666" } }
]})
Use $tempId to reference nodes created earlier in the same batch.

### Error Recovery Rules (CRITICAL — prevents hung turns)
- If a tool call fails, do NOT retry more than once with the same arguments.
- If a nodeId-based tool fails with "not found", the ID is stale — call get_page_nodes or get_node_info to get fresh IDs before retrying.
- NEVER enter a loop of retrying the same failed tool call. Accept partial results and finish the turn.

### One-Click Design System Pipeline
When user asks to generate/create a design system:
1. Call analyze_brief with the brief text and brand name
2. Call generate_design_system_in_figma with the BrandAnalysis result
3. After pipeline completes, the showcase is ALREADY complete — do NOT create additional loose elements

### Icons — Lucide Library (MANDATORY for icon elements)
ALWAYS use create_icon to place icons. NEVER use create_ellipse or circles as icon placeholders.
- create_icon(name, parentId, size?, color?) — places a Lucide icon by name
- 1900+ icons available: check, arrow-right, star, heart, zap, shield, map-pin, phone, mail, menu, search, settings, user, home, globe, code, package, leaf, droplets, thermometer, wifi, cpu, database, bar-chart, calendar, clock, bell, lock, eye, download, upload, share, filter, layers, grid, list, file-text, folder, image, camera, play, pause, volume-2, mic, headphones, monitor, smartphone, truck, shopping-cart, credit-card, tag, bookmark, flag, sun, moon, cloud, cloud-rain

### Design Intelligence Tools
Use these for expert decisions — never hardcode or guess values:
- lookup_blueprint(category, mood) — proportional zone layouts
- lookup_palette(mood) — color palettes by mood
- lookup_fonts(mood) — font pairings by mood
- lookup_size(format) — dimensions for social/print/web formats
- get_design_rules(category) — detailed rules for typography|color|layout|refinement|evaluation
- get_contrast_check(foreground, background, fontSize) — WCAG contrast check
- run_refinement_check(nodeId) — automated quality feedback

### Typography Quick Reference
Line Height: Display (>48px) 1.1–1.2 | Headings 1.2–1.3 | Body 1.5–1.6 | Captions 1.4–1.5
Letter Spacing: Display -0.02em | Headings -0.01em | Body 0 | Uppercase +0.05–0.15em
Minimum Sizes (Social 1080px): Headline 48–72px | Sub 32–40px | Body 28–32px | Caption 22–26px

### Spacing (8px grid)
Scale: 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128
Margins: Social 48px | Print 72px | Web 64px

### Image Generation — Context-Aware Prompts (CRITICAL)
When generating images with generate_image, ALWAYS write a descriptive, context-aware brief.
- GOOD: "Industrial warehouse interior with CNC machines and metal fabrication equipment, corporate photography"
- BAD: "modern abstract background with soft gradients and geometric shapes"
The brief should match the content and industry of the page being designed.

### Overlay Gradient Rules
Text at BOTTOM → direction "top-bottom" | Text at TOP → "bottom-top"
EXACTLY 2 stops. Gradient color MUST match section background. Solid end = where text is.
`;

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
  provider: 'claude' | 'gemini' | 'openai' | 'venice' | 'codex';
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
  /** File attachments (PDF, TXT, SVG) as data URIs. Server extracts text content and injects as context. */
  fileAttachments?: Array<{ name: string; type: string; dataUri: string }>;
  /** Learned user preferences to inject into system prompt. */
  preferences?: LearnedPreference[];
  /** Optional snapshot of the user's current Figma selection at time of Send. */
  currentSelection?: Array<{
    id: string;
    type: string;
    name: string;
    width: number;
    height: number;
  }>;
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
// DESIGN SESSION STATE (IG-3)
// ═══════════════════════════════════════════════════════════════

interface LayerNode {
  id: string;
  name: string;
  type: string;
  children?: LayerNode[];
}

interface DesignSession {
  frameId: string;
  frameName: string;
  width: number;
  height: number;
  layerSummary: string;
  updatedAt: number;
  /** CX-6: Cached rich selection context string. */
  richContext?: string;
  /** CX-6: Hash of selection IDs that produced richContext. */
  selectionHash?: string;
}

/** Per-channel session cache. Keyed by channelId. */
const designSessions = new Map<string, DesignSession>();

/** Sessions expire after 30 minutes of inactivity. */
const SESSION_TTL_MS = 30 * 60 * 1000;

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
  thought?: boolean;
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
    signal: AbortSignal.timeout(60_000),
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

/**
 * Build the generationConfig for Gemini, adjusting thinking settings per model family:
 * - Gemini 3.x: uses thinkingConfig.thinkingLevel ("LOW" for tool-use speed)
 * - Gemini 2.5 Pro: uses thinkingConfig.thinkingBudget (min 128, cannot disable)
 * - Gemini 2.5 Flash: uses thinkingConfig.thinkingBudget (0 disables)
 * - Others: no thinking config needed
 */
function buildGeminiGenerationConfig(model: string): Record<string, unknown> {
  const config: Record<string, unknown> = { maxOutputTokens: 8192 };
  // Image-preview models don't support thinking config
  const isImagePreview = model.includes('image');
  if (!isImagePreview && model.startsWith('gemini-3')) {
    config.thinkingConfig = { thinkingLevel: 'LOW' };
  } else if (model.includes('2.5-pro') || model.includes('2.5-flash')) {
    config.thinkingConfig = { thinkingBudget: model.includes('pro') ? 128 : 0 };
  }
  return config;
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
        generationConfig: buildGeminiGenerationConfig(model),
      }),
      signal: AbortSignal.timeout(60_000),
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
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${errBody}`);
  }

  return resp.json() as Promise<Record<string, unknown>>;
}

async function callVeniceAPI(
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

  const resp = await fetch('https://api.venice.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 8192,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: openaiTools,
      tool_choice: 'auto',
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Venice API error ${resp.status}: ${errBody}`);
  }

  return resp.json() as Promise<Record<string, unknown>>;
}

// ═══════════════════════════════════════════════════════════════
// CODEX / RESPONSES API
// ═══════════════════════════════════════════════════════════════

function convertSchemaToResponses(schema: Record<string, unknown>): Record<string, unknown> {
  // Responses API with strict: true requires:
  // - additionalProperties: false on every object
  // - required must list ALL keys in properties
  if (schema.oneOf) {
    const options = schema.oneOf as Record<string, unknown>[];
    if (options.length > 0) {
      const flattened = convertSchemaToResponses(options[0]);
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
  if (schema.properties) {
    const props: Record<string, unknown> = {};
    const allKeys: string[] = [];
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      props[key] = convertSchemaToResponses(value as Record<string, unknown>);
      allKeys.push(key);
    }
    result.properties = props;
    result.additionalProperties = false;
    result.required = allKeys;
  }
  // strict mode: every type=object must have additionalProperties: false
  if (result.type === 'object' && result.additionalProperties === undefined) {
    result.additionalProperties = false;
    if (!result.properties) {
      result.properties = {};
      result.required = [];
    }
  }
  if (schema.items) result.items = convertSchemaToResponses(schema.items as Record<string, unknown>);
  if (schema.minimum !== undefined) result.minimum = schema.minimum;
  if (schema.maximum !== undefined) result.maximum = schema.maximum;
  return result;
}

/** Map Figmento display model names to real Codex API model names.
 *  e.g. "gpt-5.4-codex" → "gpt-5.4" (routing suffix stripped)
 *  Models like "gpt-5.3-codex" are real API names and pass through unchanged. */
function toCodexApiModel(displayModel: string): string {
  const mapping: Record<string, string> = {
    'gpt-5.4-codex': 'gpt-5.4',
    'gpt-5.4-mini-codex': 'gpt-5.4-mini',
  };
  return mapping[displayModel] || displayModel;
}

async function callCodexAPI(
  input: Array<Record<string, unknown>>,
  model: string,
  oauthToken: string,
  systemPrompt: string,
  tools: ToolDefinition[],
): Promise<Record<string, unknown>> {
  const apiModel = toCodexApiModel(model);

  const codexTools = tools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: convertSchemaToOpenAI(tool.input_schema),
    strict: false,
  }));

  const resp = await fetch('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${oauthToken}`,
    },
    body: JSON.stringify({
      model: apiModel,
      instructions: systemPrompt,
      input,
      tools: codexTools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      stream: true,
      store: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Codex API error ${resp.status}: ${errBody}`);
  }

  // Parse SSE stream — collect events and build final response
  const rawText = await resp.text();
  const lines = rawText.split('\n');

  // Log ALL event types for debugging
  const allEvents: Array<Record<string, unknown>> = [];
  const outputItems: Array<Record<string, unknown>> = [];
  let finalResponse: Record<string, unknown> | null = null;

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') break;
    if (!data) continue;

    try {
      const event = JSON.parse(data);
      allEvents.push(event);

      // response.completed contains the full response
      if (event.type === 'response.completed' && event.response) {
        finalResponse = event.response;
      }
      // Collect output items as they arrive
      if (event.type === 'response.output_item.done' && event.item) {
        outputItems.push(event.item);
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Prioritize collected output items — response.completed often has output: []
  if (outputItems.length > 0) {
    return { output: outputItems, status: 'completed' };
  }
  if (finalResponse && Array.isArray(finalResponse.output) && (finalResponse.output as unknown[]).length > 0) {
    return finalResponse;
  }

  throw new Error('Empty response from Codex');
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Retry wrapper for API calls — retries once on timeout, then throws a user-friendly error. */
async function callWithRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 2000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < retries && err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        await sleep(delayMs);
        continue;
      }
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new Error('API request timed out. The model may be overloaded — try again or switch models.');
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
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

const TOOL_RESULT_MAX_CHARS = 1000;

/** Tools whose results carry context the model MUST see in full. Never truncate these. */
const CONTEXT_TOOLS = new Set([
  'analyze_canvas_context',
  'get_node_info',
  'scan_frame_structure',
  'get_page_nodes',
]);

function truncateForHistory(content: string, toolName?: string): string {
  // Context-critical tools get a much higher budget (4KB) to preserve extracted texts/colors/structure
  const limit = toolName && CONTEXT_TOOLS.has(toolName) ? 4000 : TOOL_RESULT_MAX_CHARS;
  if (content.length <= limit) return content;

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
      for (const key of ['nodeId', 'name', 'id', 'error', 'note', 'count', 'success', 'saved', 'width', 'height', 'x', 'y', 'parentId', 'matchedComponent', 'texts', 'colors', 'structure', 'dimensions', 'images']) {
        if (key in parsed) slim[key] = parsed[key];
      }
      if (Object.keys(slim).length > 0) {
        const slimStr = JSON.stringify(slim);
        if (slimStr.length <= limit) return slimStr;
        // Still too big — drop structure, keep texts/colors
        delete slim.structure;
        const slimStr2 = JSON.stringify(slim);
        if (slimStr2.length <= limit) return slimStr2;
        slim.note = 'Result truncated for history';
        return JSON.stringify(slim).slice(0, limit);
      }
    }
  } catch { /* not JSON */ }

  return content.slice(0, limit - 3) + '...';
}

// ═══════════════════════════════════════════════════════════════
// FILE ATTACHMENT PROCESSING (PDF, TXT, SVG → text context)
// ═══════════════════════════════════════════════════════════════

interface ExtractedFileContent {
  name: string;
  type: string;
  textContent: string;
  pageCount?: number;
  detectedColors?: string[];
  detectedFonts?: string[];
  warning?: string;
}

async function extractFileContent(
  attachment: { name: string; type: string; dataUri: string },
): Promise<ExtractedFileContent> {
  const { name, type, dataUri } = attachment;

  // Decode base64 data URI to buffer
  const commaIndex = dataUri.indexOf(',');
  const base64Data = commaIndex >= 0 ? dataUri.slice(commaIndex + 1) : dataUri;
  const buffer = Buffer.from(base64Data, 'base64');

  // Plain text / SVG — decode as UTF-8
  if (type === 'text/plain' || type === 'image/svg+xml') {
    const text = buffer.toString('utf-8').slice(0, 10000);
    return { name, type, textContent: text };
  }

  // PDF — extract with pdf-parse
  if (type === 'application/pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      const fullText: string = data.text || '';

      // Detect hex color codes
      const colorRegex = /#([0-9A-Fa-f]{3,8})\b/g;
      const detectedColors = [...new Set(
        (fullText.match(colorRegex) || []).map((c: string) => c.toUpperCase()),
      )];

      // Detect font mentions
      const fontRegex = /(?:font|typeface|typography|font-family)[:\s]+["']?([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/gi;
      const fontMatches: string[] = [];
      let fontMatch: RegExpExecArray | null;
      while ((fontMatch = fontRegex.exec(fullText)) !== null) {
        fontMatches.push(fontMatch[1].trim());
      }
      const detectedFonts = [...new Set(fontMatches)];

      return {
        name,
        type,
        textContent: fullText.slice(0, 10000),
        pageCount: data.numpages || 0,
        detectedColors,
        detectedFonts,
        warning: fullText.length === 0 ? 'No text extracted — PDF may be image-only (scanned document)' : undefined,
      };
    } catch (err) {
      return {
        name,
        type,
        textContent: '',
        warning: `PDF parsing failed: ${(err as Error).message}`,
      };
    }
  }

  return { name, type, textContent: '', warning: `Unsupported file type: ${type}` };
}

/**
 * Process all file attachments and build a context block to prepend to the user message.
 * PDFs get text-extracted, TXT/SVG are read directly.
 */
async function buildFileAttachmentContext(
  attachments: Array<{ name: string; type: string; dataUri: string }>,
): Promise<string> {
  if (!attachments || attachments.length === 0) return '';

  const results = await Promise.all(attachments.map(extractFileContent));

  const blocks: string[] = [];
  for (const result of results) {
    const header = result.pageCount
      ? `📄 ${result.name} (PDF, ${result.pageCount} pages)`
      : `📄 ${result.name}`;

    const parts: string[] = [header];

    if (result.warning) {
      parts.push(`⚠️ ${result.warning}`);
    }
    if (result.textContent) {
      parts.push(`Content:\n${result.textContent}`);
    }
    if (result.detectedColors && result.detectedColors.length > 0) {
      parts.push(`Detected colors: ${result.detectedColors.join(', ')}`);
    }
    if (result.detectedFonts && result.detectedFonts.length > 0) {
      parts.push(`Detected fonts: ${result.detectedFonts.join(', ')}`);
    }

    blocks.push(parts.join('\n'));
  }

  return `[EXTRACTED FILE CONTENT]\n${blocks.join('\n\n---\n\n')}`;
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
        signal: AbortSignal.timeout(60_000),
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

interface TextEntry {
  text: string;
  fontSize: number;
  fontFamily?: string;
  y: number;
  x: number;
}

/** Recursively extract all TEXT nodes from a node tree. */
function extractTextsRecursive(node: Record<string, unknown>, results: TextEntry[] = []): TextEntry[] {
  if (node.type === 'TEXT' && node.characters) {
    results.push({
      text: (node.characters as string).slice(0, 200),
      fontSize: (node.fontSize as number) || 0,
      fontFamily: node.fontFamily as string | undefined,
      y: (node.y as number) ?? 0,
      x: (node.x as number) ?? 0,
    });
  }
  const children = (node.children as Array<Record<string, unknown>>) || [];
  for (const child of children) extractTextsRecursive(child, results);
  return results;
}

/** Recursively extract all unique solid fill colors from a node tree. */
function extractColorsRecursive(node: Record<string, unknown>, colorSet: Set<string> = new Set()): Set<string> {
  const fills = (node.fills as Array<Record<string, unknown>>) || [];
  for (const f of fills) {
    if (f.type === 'SOLID' && f.color) colorSet.add(f.color as string);
  }
  const children = (node.children as Array<Record<string, unknown>>) || [];
  for (const child of children) extractColorsRecursive(child, colorSet);
  return colorSet;
}

/** Build a compact structural outline (name [TYPE]) up to maxDepth. */
function buildStructureSummary(node: Record<string, unknown>, depth = 0, maxDepth = 3): string {
  const name = (node.name as string) || (node.type as string) || '?';
  const type = node.type as string;
  const label = `${name} [${type}]`;
  if (depth >= maxDepth) return label;
  const children = (node.children as Array<Record<string, unknown>>) || [];
  if (children.length === 0) return label;
  const childSummaries = children.slice(0, 8).map(c => buildStructureSummary(c, depth + 1, maxDepth));
  const suffix = children.length > 8 ? `, +${children.length - 8} more` : '';
  return `${label} > ${childSummaries.join(', ')}${suffix}`;
}

/** Count image fills and empty placeholders in a node tree. */
function countImages(node: Record<string, unknown>): { imageFills: number; emptyPlaceholders: number } {
  let imageFills = 0;
  let emptyPlaceholders = 0;
  const fills = (node.fills as Array<Record<string, unknown>>) || [];
  const hasImageFill = fills.some(f => f.type === 'IMAGE');
  const hasChildren = ((node.children as unknown[]) || []).length > 0;
  const w = (node.width as number) || 0;
  const h = (node.height as number) || 0;
  if (hasImageFill) {
    imageFills++;
  } else if ((node.type === 'RECTANGLE' || node.type === 'FRAME') && !hasChildren && w >= 80 && h >= 80) {
    emptyPlaceholders++;
  }
  const children = (node.children as Array<Record<string, unknown>>) || [];
  for (const child of children) {
    const sub = countImages(child);
    imageFills += sub.imageFills;
    emptyPlaceholders += sub.emptyPlaceholders;
  }
  return { imageFills, emptyPlaceholders };
}

/** Extract rich context from a single frame's node info. */
function extractFrameContext(nodeInfo: Record<string, unknown>, nodeId: string) {
  // Recursive text extraction, sorted by position, capped at 30
  const allTexts = extractTextsRecursive(nodeInfo);
  allTexts.sort((a, b) => a.y - b.y || a.x - b.x);
  const texts = allTexts.slice(0, 30).map(t => {
    const font = t.fontFamily ? ` ${t.fontFamily}` : '';
    return { text: t.text, fontSize: t.fontSize, font: font.trim() || undefined };
  });

  // Recursive color extraction, deduplicated, capped at 8
  const colorSet = extractColorsRecursive(nodeInfo);
  const colors = [...colorSet].slice(0, 8);

  // Structural summary, capped at 500 chars
  let structure = buildStructureSummary(nodeInfo);
  if (structure.length > 500) structure = structure.slice(0, 497) + '...';

  // Image counts
  const images = countImages(nodeInfo);

  return {
    nodeId,
    name: nodeInfo.name || 'frame',
    dimensions: `${nodeInfo.width ?? '?'}x${nodeInfo.height ?? '?'}`,
    colors,
    texts,
    structure,
    images: `${images.imageFills} image fills, ${images.emptyPlaceholders} empty placeholders`,
  };
}

const MAX_CONTEXT_CHARS = 4000;

/** Trim context to fit within character budget — drop structure first, then smaller texts. */
function trimContextToBudget(contexts: Record<string, unknown>[]): string {
  let json = JSON.stringify(contexts.length === 1 ? contexts[0] : contexts);
  if (json.length <= MAX_CONTEXT_CHARS) return json;

  // Pass 1: remove structure fields
  for (const ctx of contexts) delete ctx.structure;
  json = JSON.stringify(contexts.length === 1 ? contexts[0] : contexts);
  if (json.length <= MAX_CONTEXT_CHARS) return json;

  // Pass 2: keep only largest-fontSize texts (headlines first)
  for (const ctx of contexts) {
    const texts = (ctx.texts as Array<{ text: string; fontSize: number }>) || [];
    texts.sort((a, b) => b.fontSize - a.fontSize);
    ctx.texts = texts.slice(0, 10);
  }
  json = JSON.stringify(contexts.length === 1 ? contexts[0] : contexts);
  if (json.length <= MAX_CONTEXT_CHARS) return json;

  // Pass 3: truncate text content
  for (const ctx of contexts) {
    const texts = (ctx.texts as Array<{ text: string; fontSize: number }>) || [];
    for (const t of texts) t.text = t.text.slice(0, 60);
    ctx.texts = texts.slice(0, 6);
  }
  return JSON.stringify(contexts.length === 1 ? contexts[0] : contexts).slice(0, MAX_CONTEXT_CHARS);
}

async function executeAnalyzeCanvasContext(
  args: Record<string, unknown>,
  sendToPlugin: (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<ToolCallResult> {
  try {
    // Step 1: Resolve target nodeIds (arg → selection → first page node)
    let nodeIds: string[] = [];

    if (args.nodeId) {
      nodeIds = [args.nodeId as string];
    }

    if (nodeIds.length === 0) {
      const selection = await sendToPlugin('get_selection', {});
      const selNodes = (selection.nodes as Array<Record<string, unknown>>) || [];
      const frames = selNodes.filter(n => n.type === 'FRAME');
      nodeIds = (frames.length > 0 ? frames : selNodes).map(n => n.nodeId as string).slice(0, 5);
    }

    if (nodeIds.length === 0) {
      const pageResult = await sendToPlugin('get_page_nodes', {});
      const pageNodes = (pageResult.nodes as Array<Record<string, unknown>>) || [];
      const firstFrame = pageNodes.find(n => n.type === 'FRAME') || pageNodes[0];
      if (firstFrame) nodeIds = [firstFrame.nodeId as string];
    }

    if (nodeIds.length === 0) {
      return { content: 'No frames found on the canvas to analyze.', is_error: true };
    }

    // Step 2: Get node properties with deep tree (depth=4) for all frames
    const nodeInfos = await Promise.all(
      nodeIds.map(id => sendToPlugin('get_node_info', { nodeId: id, depth: 4 }))
    );

    // Step 3: Get screenshot of first frame (optional — fails gracefully)
    let visionImage: string | undefined;
    try {
      const screenshot = await sendToPlugin('get_screenshot', { nodeId: nodeIds[0] });
      const imgData = screenshot.imageData as string | undefined;
      if (imgData && imgData.startsWith('data:image/')) visionImage = imgData;
    } catch { /* screenshot is optional */ }

    // Step 4: Extract rich context from each frame
    const contexts = nodeInfos.map((info, i) => extractFrameContext(info, nodeIds[i]));

    // Step 5: Add note and trim to budget
    const result = {
      frames: contexts.length === 1 ? undefined : contexts,
      ...(contexts.length === 1 ? contexts[0] : {}),
      note: visionImage
        ? 'A screenshot has been attached for visual reference. Use the texts, colors, structure, and visual style to inform design decisions.'
        : 'Use the texts, colors, and structure above to understand the full page content and design context.',
    };

    const content = trimContextToBudget(contexts.length === 1 ? [{ ...contexts[0], note: result.note }] : contexts);

    return {
      content,
      is_error: false,
      visionImage,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { content: `analyze_canvas_context failed: ${msg}`, is_error: true };
  }
}

// ═══════════════════════════════════════════════════════════════
// SMART ROUTING: Fill Image Intent Detection
// ═══════════════════════════════════════════════════════════════

const FILL_IMAGE_PATTERNS = [
  // Portuguese
  /(?:gere?|cri[ea]|adicione?|coloque?|preencha?|bota?|ponha?).*imagens?\b.*(?:se[çc][ãa]o|cards?|frames?|aqui|nessa?|dessa?|nesse?|desse?)/i,
  /(?:imagens?\b.*(?:para|nos?|nas?|dentro|preencher?).*(?:se[çc][ãa]o|cards?|frames?))/i,
  /(?:preencha?|fill)\b.*(?:com\s+)?imagens?/i,
  // English
  /(?:fill|add|generate|place|put)\b.*images?\b.*(?:section|cards?|frames?|slots?|here|this|these)/i,
  /(?:images?\b.*(?:for|in|into|to)\b.*(?:section|cards?|frames?))/i,
  /fill\b.*(?:template\s+)?placeholders?/i,
];

interface FillImageIntent {
  context?: string;
}

function detectFillImageIntent(message: string): FillImageIntent | null {
  // Strip Figma selection context injected by the plugin
  const cleanMsg = message.split('\n\n[FIGMA SELECTION')[0].split('\n\n[ATTACHED FILES]')[0].trim();

  for (const pattern of FILL_IMAGE_PATTERNS) {
    if (pattern.test(cleanMsg)) {
      // Extract optional user context (e.g., "é um site de café artesanal")
      const contextMatch = cleanMsg.match(/(?:[,;]\s*)?(?:é\s+(?:um\s+)?(?:site|p[áa]gina)\s+(?:de?\s+)?|this\s+is\s+(?:a\s+)?|context:\s*)(.+?)$/i);
      return { context: contextMatch?.[1]?.trim() || undefined };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXTUAL IMAGE FILL (composite server-side tool)
// ═══════════════════════════════════════════════════════════════

interface FillScannedNode {
  nodeId?: string; id?: string; name?: string; type?: string;
  width?: number; height?: number;
  fills?: Array<{ type?: string; [k: string]: unknown }>;
  children?: FillScannedNode[];
  text?: string;
  [k: string]: unknown;
}

function fillExtractAllText(node: FillScannedNode): string {
  const parts: string[] = [];
  if (node.text) parts.push(node.text);
  if (node.name && node.type === 'TEXT') parts.push(node.name);
  if (node.children) {
    for (const child of node.children) parts.push(fillExtractAllText(child));
  }
  return parts.filter(Boolean).join(' | ');
}

function fillHasTextChildren(node: FillScannedNode): boolean {
  if (!node.children) return false;
  return node.children.some(c => c.type === 'TEXT' || fillHasTextChildren(c));
}

function fillIsImageSlot(node: FillScannedNode): boolean {
  if (!node.type || !['FRAME', 'RECTANGLE'].includes(node.type)) return false;
  if (node.fills?.some(f => f.type === 'IMAGE')) return false;
  if (node.children?.some(c => c.type === 'TEXT')) return false;
  const w = node.width ?? 0, h = node.height ?? 0;
  if (w < 80 || h < 80) return false;
  const ratio = w / h;
  if (ratio < 0.3 || ratio > 3.5) return false;
  return true;
}

interface FillSlot { nodeId: string; width: number; height: number; siblingContext: string; parentName: string; }

function fillFindSlots(node: FillScannedNode, parent: FillScannedNode | null, slots: FillSlot[]): void {
  if (fillIsImageSlot(node) && parent) {
    const slotId = node.nodeId || node.id;
    const textParts: string[] = [];
    if (parent.children) {
      for (const c of parent.children) {
        if ((c.nodeId || c.id) === slotId) continue;
        if (c.type === 'TEXT' || fillHasTextChildren(c)) textParts.push(fillExtractAllText(c));
      }
    }
    slots.push({
      nodeId: slotId as string,
      width: node.width ?? 200, height: node.height ?? 200,
      siblingContext: textParts.filter(Boolean).join(' | ') || parent.name || '',
      parentName: parent.name || 'unknown',
    });
  }
  if (node.children) {
    for (const child of node.children) fillFindSlots(child, node, slots);
  }
}

async function executeFillContextualImages(
  args: Record<string, unknown>,
  geminiApiKey: string | undefined,
  sendToPlugin: (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<ToolCallResult> {
  if (!geminiApiKey) {
    return { content: 'Gemini API key not configured for image generation.', is_error: true };
  }

  const maxImages = Math.min((args.maxImages as number) ?? 6, 8);
  const userContext = args.context as string | undefined;
  const style = (args.style as string) || 'photographic';
  const targetNodeIds = args.targetNodeIds as string[] | undefined;

  try {
    // Resolve section
    let sectionId = args.sectionId as string | undefined;
    if (!sectionId && !targetNodeIds?.length) {
      const sel = await sendToPlugin('get_selection', {});
      const nodes = (sel.selection ?? sel.nodes ?? (Array.isArray(sel) ? sel : [])) as Array<Record<string, unknown>>;
      if (nodes[0]) sectionId = (nodes[0].id ?? nodes[0].nodeId) as string;
      if (!sectionId) return { content: 'No section selected. Select a frame or pass sectionId.', is_error: true };
    }

    // Phase 1: Page context via Vision
    let pageContext = { industry: 'website', brand: '', purpose: 'website', tone: 'professional', colors: 'mixed' };
    if (!(args.skipAnalysis && userContext)) {
      try {
        const screenshotResult = await sendToPlugin('get_screenshot', { scale: 0.5 });
        const base64 = screenshotResult.base64 as string;
        if (base64) {
          const analysisPrompt = `Analyze this website design screenshot. Extract in JSON only (no markdown): {"industry":"...","brand":"...","purpose":"...","tone":"...","colors":"...","sections":["..."]}${userContext ? `. Additional context: ${userContext}` : ''}`;
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [
                  { inlineData: { mimeType: 'image/png', data: base64 } },
                  { text: analysisPrompt },
                ] }],
              }),
            }
          );
          if (resp.ok) {
            const r = await resp.json() as Record<string, unknown>;
            const candidates = r.candidates as Array<Record<string, unknown>> | undefined;
            const parts = ((candidates?.[0] as Record<string, unknown>)?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
            const textPart = parts?.find(p => p.text) as Record<string, string> | undefined;
            if (textPart?.text) {
              let json = textPart.text.trim();
              if (json.startsWith('```')) json = json.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
              const parsed = JSON.parse(json);
              pageContext = { ...pageContext, ...parsed };
            }
          }
        }
      } catch {
        if (userContext) pageContext.industry = userContext;
      }
    } else if (userContext) {
      pageContext.industry = userContext;
    }

    // Phase 2: Discover slots
    let slots: FillSlot[] = [];
    if (targetNodeIds?.length) {
      for (const nid of targetNodeIds) {
        try {
          const info = await sendToPlugin('get_node_info', { nodeId: nid });
          const bounds = info.absoluteBoundingBox as Record<string, number> | undefined;
          slots.push({
            nodeId: nid,
            width: (info.width as number) ?? bounds?.width ?? 400,
            height: (info.height as number) ?? bounds?.height ?? 300,
            siblingContext: (info.name as string) || '',
            parentName: 'user-specified',
          });
        } catch { /* skip */ }
      }
    } else if (sectionId) {
      const structure = await sendToPlugin('scan_frame_structure', { nodeId: sectionId, depth: 3 });
      fillFindSlots(structure as unknown as FillScannedNode, null, slots);
      slots.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    }

    if (slots.length === 0) {
      return {
        content: JSON.stringify({ pageContext, slotsFound: 0, slotsFilled: 0, message: 'No empty image slots found.' }),
        is_error: false,
      };
    }

    const slotsToFill = slots.slice(0, maxImages);
    const slotsSkipped = Math.max(0, slots.length - maxImages);

    // Phase 3+4: Generate & place images sequentially
    const results: Array<Record<string, unknown>> = [];
    for (const slot of slotsToFill) {
      const industryPart = pageContext.industry !== 'website' ? `for a ${pageContext.industry} company website` : 'for a website';
      const prompt = `Professional ${style} ${industryPart}. ${slot.siblingContext ? `This image is for: ${slot.siblingContext}.` : ''} Clean composition suitable for web use. No text overlays. Dimensions: ${slot.width}×${slot.height}px.`;

      let success = false;
      let fallbackUsed = false;
      let error: string | undefined;

      try {
        // Generate with Gemini
        const genResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: ['IMAGE'] },
            }),
          }
        );
        if (!genResp.ok) throw new Error(`Gemini ${genResp.status}`);
        const genResult = await genResp.json() as Record<string, unknown>;
        const candidates = genResult.candidates as Array<Record<string, unknown>> | undefined;
        const parts = ((candidates?.[0] as Record<string, unknown>)?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
        const imgPart = parts?.find(p => p.inlineData);
        const inlineData = imgPart?.inlineData as Record<string, unknown> | undefined;
        const b64 = inlineData?.data as string | undefined;
        if (!b64) throw new Error('No image data');

        await sendToPlugin('create_image', {
          imageData: `data:image/png;base64,${b64}`,
          name: `Contextual Image — ${slot.siblingContext.slice(0, 40) || 'auto'}`,
          width: slot.width, height: slot.height,
          x: 0, y: 0, parentId: slot.nodeId, scaleMode: 'FILL',
        });
        success = true;
      } catch (genErr) {
        fallbackUsed = true;
        // Fallback: Picsum
        try {
          const words = (slot.siblingContext || pageContext.industry).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 3);
          const seed = words.join('-') || 'design';
          const picRes = await fetch(`https://picsum.photos/seed/${encodeURIComponent(seed)}/${slot.width}/${slot.height}`, { redirect: 'follow' });
          if (!picRes.ok) throw new Error(`Picsum ${picRes.status}`);
          const ct = picRes.headers.get('content-type') || 'image/jpeg';
          const buf = Buffer.from(await picRes.arrayBuffer());
          await sendToPlugin('create_image', {
            imageData: `data:${ct};base64,${buf.toString('base64')}`,
            name: `Placeholder — ${slot.siblingContext.slice(0, 40) || 'auto'}`,
            width: slot.width, height: slot.height,
            x: 0, y: 0, parentId: slot.nodeId, scaleMode: 'FILL',
          });
          success = true;
        } catch (fbErr) {
          error = `Generation and placeholder failed: ${(fbErr as Error).message}`;
        }
      }

      results.push({ nodeId: slot.nodeId, width: slot.width, height: slot.height, prompt, siblingContext: slot.siblingContext, fallbackUsed, success, error });
    }

    const filled = results.filter(r => r.success).length;
    const suggestions = slotsSkipped > 0 ? [`${slotsSkipped} more slot(s) skipped (budget). Call again with remaining targetNodeIds.`] : [];

    return {
      content: JSON.stringify({ pageContext, slotsFound: slots.length, slotsFilled: filled, slotsSkipped, results, ...(suggestions.length ? { suggestions } : {}) }),
      is_error: false,
    };
  } catch (err) {
    return { content: `fill_contextual_images failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true };
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

function buildLayerSummary(nodes: LayerNode[], depth = 0, remaining = { count: 50 }): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (remaining.count <= 0) {
      parts.push('[... more layers]');
      break;
    }
    remaining.count--;
    const indent = '> '.repeat(depth);
    const childSummary = node.children?.length
      ? ` {${buildLayerSummary(node.children, depth + 1, remaining)}}`
      : '';
    parts.push(`${indent}${node.name} [${node.type} id:${node.id}]${childSummary}`);
  }
  return parts.join(', ');
}

function buildLayerContext(session: DesignSession): string {
  return `[Layer map for "${session.frameName}" (id: ${session.frameId}, ${session.width}×${session.height}px): ${session.layerSummary}. Use these nodeIds to target layers directly — do NOT call scan_frame_structure or get_selection.]`;
}

function buildSessionContext(
  channel: string,
  selection?: ChatTurnRequest['currentSelection'],
): string {
  const session = designSessions.get(channel);
  if (!session) return '';
  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    designSessions.delete(channel);
    return '';
  }
  if (!selection?.some(n => n.id === session.frameId)) return '';
  return buildLayerContext(session);
}

interface FrameContextResult {
  nodeId: string;
  name: string | {};
  dimensions: string;
  colors: string[];
  texts: Array<{ text: string; fontSize: number; font?: string }>;
  structure: string;
  images: string;
}

/** CX-6: Build a hash of selection IDs for cache comparison. */
function hashSelection(frames: Array<{ id: string }>): string {
  return frames.map(f => f.id).sort().join(',');
}

/** CX-6: Format a single frame's rich context as a compact text block. */
function formatFrameContextLine(ctx: FrameContextResult): string {
  const textSummary = ctx.texts
    .slice(0, 15)
    .map(t => {
      const font = t.font ? ` ${t.font}` : '';
      return `"${t.text.slice(0, 80)}" (${t.fontSize}px${font})`;
    })
    .join(', ');
  const colorSummary = (ctx.colors as string[]).join(', ');
  const lines = [
    `Frame "${ctx.name}" (id: ${ctx.nodeId}, ${ctx.dimensions})`,
    `  Texts: ${textSummary || 'none'}`,
    `  Colors: ${colorSummary || 'none'}`,
    `  ${ctx.images}`,
  ];
  if (ctx.structure) {
    const struct = (ctx.structure as string).slice(0, 200);
    lines.splice(3, 0, `  Structure: ${struct}`);
  }
  return lines.join('\n');
}

const MAX_RICH_CONTEXT_CHARS = 3000;
const EXTRACTION_TIMEOUT_MS = 3000;

/**
 * CX-6: Auto-extract rich content from selected frames.
 * Returns a context block to prepend to the user message.
 * Uses cache when selection hasn't changed.
 */
async function buildRichSelectionContext(
  selection: ChatTurnRequest['currentSelection'],
  sendToPlugin: (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>,
  channel: string,
): Promise<string> {
  if (!selection || selection.length === 0) return '';
  const frames = selection.filter(n => n.type === 'FRAME').slice(0, 3);
  if (frames.length === 0) return '';

  const currentHash = hashSelection(frames);

  // Check cache first
  const cached = designSessions.get(channel);
  if (cached?.richContext && cached.selectionHash === currentHash &&
      Date.now() - cached.updatedAt < SESSION_TTL_MS) {
    return cached.richContext;
  }

  // Parallel extraction with per-frame timeout
  const results: FrameContextResult[] = await Promise.all(
    frames.map(async (f): Promise<FrameContextResult> => {
      try {
        const result = await Promise.race([
          sendToPlugin('get_node_info', { nodeId: f.id, depth: 4 }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), EXTRACTION_TIMEOUT_MS)
          ),
        ]);
        return extractFrameContext(result as Record<string, unknown>, f.id);
      } catch {
        // Fallback to basic metadata
        return {
          nodeId: f.id,
          name: f.name,
          dimensions: `${f.width}×${f.height}`,
          colors: [],
          texts: [],
          structure: '',
          images: 'unknown',
        };
      }
    })
  );

  // Format and cap
  let contextLines = results.map(r => formatFrameContextLine(r));
  let context = `[Page context for selected frames:\n${contextLines.join('\n\n')}\n\nUse these texts, colors, and structure to understand the full page content. Pass frameId to tools instead of calling get_selection.]`;

  if (context.length > MAX_RICH_CONTEXT_CHARS) {
    // Trim: reduce texts per frame
    contextLines = results.map(r => {
      r.texts = (r.texts as Array<{ text: string; fontSize: number; font?: string }>)
        .sort((a, b) => b.fontSize - a.fontSize)
        .slice(0, 6);
      r.structure = '';
      return formatFrameContextLine(r);
    });
    context = `[Page context for selected frames:\n${contextLines.join('\n\n')}\n\nUse these texts, colors, and structure to understand the full page content. Pass frameId to tools instead of calling get_selection.]`;
    if (context.length > MAX_RICH_CONTEXT_CHARS) {
      context = context.slice(0, MAX_RICH_CONTEXT_CHARS - 3) + '...]';
    }
  }

  // Cache it
  const existingSession = designSessions.get(channel);
  designSessions.set(channel, {
    frameId: frames[0].id,
    frameName: frames[0].name,
    width: frames[0].width,
    height: frames[0].height,
    layerSummary: existingSession?.layerSummary || '',
    updatedAt: Date.now(),
    richContext: context,
    selectionHash: currentHash,
  });

  return context;
}

/** Fallback: basic selection context (used when rich extraction is skipped). */
function buildSelectionContextBasic(selection?: ChatTurnRequest['currentSelection']): string {
  if (!selection || selection.length === 0) return '';
  const frames = selection.filter(n => n.type === 'FRAME');
  if (frames.length === 0) return '';
  const descriptions = frames.map(f => `"${f.name}" (id: ${f.id}, ${f.width}×${f.height}px)`);
  return `[Figma context: user has ${frames.length === 1 ? 'a frame' : 'frames'} selected — ${descriptions.join(', ')}. Pass frameId to generate_design_image or other frame-targeting tools instead of calling get_selection.]`;
}

/**
 * Sanitize conversation history to prevent API 400 errors from orphaned tool_use blocks.
 * If the last assistant message contains tool_use blocks but no following tool_result user message,
 * strip it (and keep stripping until history is valid).
 */
function sanitizeHistory<T extends { role?: unknown; content?: unknown }>(history: T[]): T[] {
  while (history.length > 0) {
    const last = history[history.length - 1];
    if (last.role !== 'assistant') break;

    const content = last.content;
    if (!Array.isArray(content)) break;
    const hasToolUse = content.some((block: { type?: string }) => block.type === 'tool_use');
    if (!hasToolUse) break;

    // Assistant has tool_use but no following tool_result — orphaned → remove
    history.pop();
  }
  return history;
}

export async function handleChatTurn(
  relay: FigmentoRelay,
  request: ChatTurnRequest,
): Promise<ChatTurnResponse> {
  const { channel, provider, apiKey, model, memory, geminiApiKey } = request;

  // IG-3: Inject cached layer map (session context) — only when same frame is selected
  const sessionContext = buildSessionContext(channel, request.currentSelection);

  // Verify the channel has connected clients (needed before sendToPlugin)
  if (!relay.hasClientsInChannel(channel)) {
    designSessions.delete(channel);
    throw new Error(`No plugin connected to channel "${channel}". Ensure the Bridge tab is connected.`);
  }

  // Send a command to the plugin sandbox through the relay channel
  const sendToPlugin = (action: string, params: Record<string, unknown>) =>
    relay.sendCommandToChannel(channel, action, params);

  // CX-6: Build rich selection context (auto-extracts content from selected frames)
  let selectionContext: string;
  try {
    selectionContext = await buildRichSelectionContext(request.currentSelection, sendToPlugin, channel);
  } catch {
    // Fallback to basic metadata if extraction fails entirely
    selectionContext = buildSelectionContextBasic(request.currentSelection);
  }

  // Extract text content from file attachments (PDFs, TXT, SVG)
  let fileContext = '';
  if (request.fileAttachments && request.fileAttachments.length > 0) {
    try {
      fileContext = await buildFileAttachmentContext(request.fileAttachments);
      console.log(`[Figmento Chat] Extracted text from ${request.fileAttachments.length} file attachment(s)`);
    } catch (err) {
      console.error(`[Figmento Chat] File attachment extraction failed:`, (err as Error).message);
    }
  }

  const message = [sessionContext, selectionContext, fileContext, request.message].filter(Boolean).join('\n\n');

  // ── Smart Routing: detect "fill images" intent and bypass LLM ──
  const fillImageIntent = detectFillImageIntent(request.message);
  if (fillImageIntent) {
    const selectionNodes = request.currentSelection || [];
    const sectionId = selectionNodes.length > 0 ? selectionNodes[0].id : undefined;

    const fillResult = await executeFillContextualImages(
      { sectionId, context: fillImageIntent.context },
      geminiApiKey,
      sendToPlugin,
    );

    const parsed = JSON.parse(fillResult.content);
    const slotsFilled = parsed.slotsFilled ?? 0;
    const slotsFound = parsed.slotsFound ?? 0;
    const pageCtx = parsed.pageContext;

    let responseText: string;
    if (fillResult.is_error) {
      responseText = `Could not fill images: ${fillResult.content}`;
    } else if (slotsFound === 0) {
      responseText = 'No empty image slots found in the selected section. All frames either already have images, contain text, or are too small (< 80px).';
    } else {
      const contextDesc = pageCtx?.industry && pageCtx.industry !== 'website'
        ? ` for "${pageCtx.industry}"`
        : '';
      responseText = `Done! Filled ${slotsFilled}/${slotsFound} image slot${slotsFound > 1 ? 's' : ''}${contextDesc}. Images were generated based on the page context and nearby text content.`;
      if (parsed.suggestions?.length) {
        responseText += ` ${parsed.suggestions[0]}`;
      }
    }

    // Build tool call log for the UI
    const toolCalls = [
      { name: 'get_screenshot', success: true },
      { name: 'analyze_page_context', success: !fillResult.is_error },
      { name: 'scan_frame_structure', success: !fillResult.is_error },
      ...(parsed.results || []).map((r: Record<string, unknown>) => ({
        name: `generate_image → ${(r.siblingContext as string || 'slot').slice(0, 30)}`,
        success: r.success as boolean,
      })),
    ];

    return {
      text: responseText,
      toolCalls,
      history: request.history || [],
      iterationsUsed: 1,
      completedCleanly: true,
      newMemoryEntries: [],
    };
  }

  // Detect design brief from user message
  const brief: DesignBrief = detectBrief(message);
  const systemPrompt = buildSystemPrompt(brief, memory || [], request.preferences || [])
    + DESIGN_AGENT_PROMPT;

  // Build tool resolver
  const tools: ToolResolver = chatToolResolver();
  const toolsUsed = new Set<string>();

  // Track results
  const textParts: string[] = [];
  const toolCallLog: Array<{ name: string; success: boolean }> = [];
  const newMemoryEntries: string[] = [];

  // Deduplication cache for creation commands — prevents identical tool calls
  // from creating duplicate elements when the model retries after truncated context.
  const DEDUP_COMMANDS = new Set([
    'create_frame', 'create_text', 'create_rectangle', 'create_ellipse',
    'create_image', 'create_icon', 'create_vector', 'create_component_node',
    'create_instance', 'set_fill', 'set_stroke', 'set_effects',
  ]);
  const executedCallHashes = new Map<string, ToolCallResult>();

  function hashToolCall(name: string, args: Record<string, unknown>): string {
    // Stable hash: sort keys for deterministic stringification
    const sorted = JSON.stringify(args, Object.keys(args).sort());
    return `${name}::${sorted}`;
  }

  // Tool call handler
  const handleToolCall = async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
    // Check dedup cache for creation commands
    if (DEDUP_COMMANDS.has(name)) {
      const hash = hashToolCall(name, args);
      const cached = executedCallHashes.get(hash);
      if (cached) {
        console.log(`[Figmento Chat] Dedup: skipping duplicate ${name} call`);
        return { content: cached.content + ' (deduplicated)', is_error: false };
      }
    }

    // generate_image — server-side Gemini call + place via plugin
    if (name === 'generate_image') {
      return executeGenerateImage(args, geminiApiKey, sendToPlugin);
    }

    // analyze_canvas_context — composite: get_selection + get_node_info + get_screenshot
    if (name === 'analyze_canvas_context') {
      return executeAnalyzeCanvasContext(args, sendToPlugin);
    }

    // fill_contextual_images — composite: page analysis + slot discovery + image gen + placement
    if (name === 'fill_contextual_images') {
      return executeFillContextualImages(args, geminiApiKey, sendToPlugin);
    }

    // update_memory — persist in response, no sandbox call
    if (name === 'update_memory') {
      const entry = (args.entry as string) || '';
      if (!entry) return { content: 'entry is required', is_error: true };
      newMemoryEntries.push(entry);
      return { content: JSON.stringify({ saved: true, entry }), is_error: false };
    }

    // ODS-1b: analyze_brief — routes to plugin (which forwards to MCP server via tool call pattern)
    // The chat agent should call this, then pass the result to generate_design_system_in_figma
    // Since analyze_brief is server-side only, we handle it by letting the AI do the analysis
    // inline and then calling generate_design_system_in_figma with the structured result.
    // For now, route analyze_brief and generate_design_system_in_figma to the plugin sandbox
    // which has the handlers registered via command-router.

    // ODS-7: generate_design_system_in_figma — composite: variables → styles → components
    if (name === 'generate_design_system_in_figma') {
      const ba = args.brandAnalysis as Record<string, unknown>;
      if (!ba) return { content: JSON.stringify({ error: 'brandAnalysis is required' }), is_error: true };

      const errors: Array<{ step: string; error: string }> = [];
      const startTime = Date.now();

      // Step 1: Transform BrandAnalysis → variable collections and create them
      let varResult: Record<string, unknown> = {};
      try {
        const colors = ba.colors as Record<string, unknown>;
        const spacing = ba.spacing as Record<string, unknown>;
        const radius = ba.radius as Record<string, unknown>;
        const scales = (colors?.scales || {}) as Record<string, Record<string, string>>;
        const neutrals = (colors?.neutrals || {}) as Record<string, string>;

        const brandColorVars: Array<{ name: string; type: string; value: unknown }> = [];
        for (const [colorName, scale] of Object.entries(scales)) {
          for (const [step, hex] of Object.entries(scale)) {
            brandColorVars.push({ name: `${colorName}/${step}`, type: 'COLOR', value: hex });
          }
        }
        for (const key of ['background', 'text', 'muted', 'surface', 'error', 'success'] as const) {
          if (colors?.[key]) brandColorVars.push({ name: key, type: 'COLOR', value: colors[key] });
        }

        const neutralVars = Object.entries(neutrals).map(([step, hex]) => ({ name: step, type: 'COLOR', value: hex }));
        const spacingScale = ((spacing as Record<string, unknown>)?.scale || []) as number[];
        const spacingVars = spacingScale.map(v => ({ name: String(v), type: 'FLOAT', value: v }));
        const radiusValues = ((radius as Record<string, unknown>)?.values || {}) as Record<string, number>;
        const radiusVars = Object.entries(radiusValues).map(([n, v]) => ({ name: n, type: 'FLOAT', value: v }));

        varResult = await sendToPlugin('create_variable_collections', {
          collections: [
            { name: 'Brand Colors', variables: brandColorVars },
            { name: 'Neutrals', variables: neutralVars },
            { name: 'Spacing', variables: spacingVars },
            { name: 'Radius', variables: radiusVars },
          ],
        });
      } catch (err) { errors.push({ step: 'variables', error: (err as Error).message }); }

      // Step 2: Transform typography → text styles
      let styleResult: Record<string, unknown> = {};
      try {
        const typo = ba.typography as Record<string, unknown>;
        const headingFont = (typo?.headingFont || 'Inter') as string;
        const bodyFont = (typo?.bodyFont || 'Inter') as string;
        const styles = (typo?.styles || {}) as Record<string, Record<string, number>>;

        const mapStyle = (name: string, font: string, s: Record<string, number> | undefined) => ({
          name, fontFamily: font,
          fontSize: s?.size || 16, fontWeight: s?.weight || 400,
          lineHeight: s?.lineHeight || 24, letterSpacing: s?.letterSpacing || 0,
        });
        const styleArray = [
          mapStyle('DS/Display',    headingFont, styles.display),
          mapStyle('DS/H1',         headingFont, styles.h1),
          mapStyle('DS/H2',         headingFont, styles.h2),
          mapStyle('DS/H3',         headingFont, styles.h3),
          mapStyle('DS/Body Large', bodyFont,    styles.bodyLg),
          mapStyle('DS/Body',       bodyFont,    styles.body),
          mapStyle('DS/Body Small', bodyFont,    styles.bodySm),
          mapStyle('DS/Caption',    bodyFont,    styles.caption),
        ];

        styleResult = await sendToPlugin('create_text_styles', { styles: styleArray });
      } catch (err) { errors.push({ step: 'textStyles', error: (err as Error).message }); }

      // Step 3: Create components
      let compResult: Record<string, unknown> = {};
      try {
        const colors = ba.colors as Record<string, unknown>;
        const typo = ba.typography as Record<string, unknown>;
        const radiusObj = ba.radius as Record<string, unknown>;
        const headingFont = (typo?.headingFont || 'Inter') as string;
        const bodyFont = (typo?.bodyFont || 'Inter') as string;
        const radiusDefault = (radiusObj?.default || 8) as number;

        compResult = await sendToPlugin('create_ds_components', {
          components: [
            {
              type: 'button', name: 'DS/Button',
              fillColor: colors?.primary || '#1E3A5F', textColor: '#FFFFFF',
              fontFamily: bodyFont, fontSize: 16, fontWeight: 700, lineHeight: 24,
              text: 'Button', cornerRadius: radiusDefault,
              padding: { top: 16, right: 48, bottom: 16, left: 48 }, itemSpacing: 8,
            },
            {
              type: 'card', name: 'DS/Card',
              fillColor: colors?.surface || '#F7FAFC', textColor: colors?.text || '#1A202C',
              fontFamily: headingFont, fontSize: 24, fontWeight: 700, lineHeight: 30,
              text: 'Card Title', cornerRadius: 12, width: 320,
              padding: { top: 32, right: 32, bottom: 32, left: 32 }, itemSpacing: 16,
              children: [
                { text: 'Card Title', fontFamily: headingFont, fontSize: 24, fontWeight: 700, lineHeight: 30, textColor: colors?.text || '#1A202C' },
                { text: 'Card description text goes here.', fontFamily: bodyFont, fontSize: 16, fontWeight: 400, lineHeight: 24, textColor: colors?.text || '#1A202C' },
              ],
            },
            {
              type: 'badge', name: 'DS/Badge',
              fillColor: colors?.accent || '#3182CE', textColor: '#FFFFFF',
              fontFamily: bodyFont, fontSize: 12, fontWeight: 700, lineHeight: 17,
              text: 'Badge', cornerRadius: 9999,
              padding: { top: 4, right: 12, bottom: 4, left: 12 }, itemSpacing: 0,
            },
          ],
        });
      } catch (err) { errors.push({ step: 'components', error: (err as Error).message }); }

      // Step 4: Visual DS Showcase page
      let showcaseResult: Record<string, unknown> = {};
      try {
        showcaseResult = await sendToPlugin('create_ds_showcase', {
          brandName: ba.brandName || 'Design System',
          colors: ba.colors || {},
          typography: {
            headingFont: (ba.typography as Record<string, unknown>)?.headingFont || 'Inter',
            bodyFont: (ba.typography as Record<string, unknown>)?.bodyFont || 'Inter',
            headingWeight: (ba.typography as Record<string, unknown>)?.headingWeight || 700,
            bodyWeight: (ba.typography as Record<string, unknown>)?.bodyWeight || 400,
          },
          spacing: ba.spacing || { scale: [4, 8, 12, 16, 24, 32, 48, 64] },
          radius: ba.radius || { default: 8, values: {} },
          icons: ['home', 'search', 'settings', 'user', 'mail', 'phone', 'star', 'heart', 'zap', 'shield', 'globe', 'camera'],
        });
      } catch (err) { errors.push({ step: 'showcase', error: (err as Error).message }); }

      // Step 5: Populate icon grid with actual icons
      const iconGridId = (showcaseResult as Record<string, unknown>).iconGridId as string;
      const iconNames = ((showcaseResult as Record<string, unknown>).icons || []) as string[];
      if (iconGridId && iconNames.length > 0) {
        for (const iconName of iconNames) {
          try {
            await sendToPlugin('create_icon', {
              name: iconName,
              size: 24,
              color: (ba.colors as Record<string, unknown>)?.primary || '#1E3A5F',
              parentId: iconGridId,
            });
          } catch { /* non-critical — icon may not exist in library */ }
        }
      }

      // Enable DS toggle
      try { await sendToPlugin('save-ds-toggle', { enabled: true }); } catch { /* non-critical */ }

      const totalMs = Date.now() - startTime;
      return {
        content: JSON.stringify({
          success: errors.length === 0,
          brandName: (ba as Record<string, unknown>).brandName,
          totalTimeMs: totalMs,
          variables: { count: (varResult as Record<string, unknown>).totalVariablesCreated || 0 },
          textStyles: { count: (styleResult as Record<string, unknown>).stylesCreated || 0 },
          components: { count: (compResult as Record<string, unknown>).componentsCreated || 0 },
          showcase: { created: !!(showcaseResult as Record<string, unknown>).showcaseId },
          icons: { count: iconNames.length },
          ...(errors.length > 0 && { errors }),
        }, null, 2),
        is_error: false,
      };
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

      // IG-3: Cache scan_frame_structure result as design session
      if (name === 'scan_frame_structure') {
        try {
          const r = data as Record<string, unknown>;
          const frameId = (r['frameId'] ?? r['id']) as string | undefined;
          const frameName = r['name'] as string | undefined;
          const width = r['width'] as number | undefined;
          const height = r['height'] as number | undefined;
          const children = (r['children'] ?? r['nodes']) as LayerNode[] | undefined;
          if (frameId && children) {
            designSessions.set(channel, {
              frameId,
              frameName: frameName ?? 'Design Frame',
              width: width ?? 0,
              height: height ?? 0,
              layerSummary: buildLayerSummary(children),
              updatedAt: Date.now(),
            });
          }
        } catch {
          // Parse failure — skip session update, no side effect
        }
      }

      const content = SCREENSHOT_TOOLS.has(name)
        ? summarizeScreenshotResult(name, data)
        : JSON.stringify(stripBase64FromResult(data));

      const toolResult: ToolCallResult = { content, is_error: false };

      // Cache successful creation commands for dedup
      if (DEDUP_COMMANDS.has(name)) {
        const hash = hashToolCall(name, args);
        executedCallHashes.set(hash, toolResult);
      }

      return toolResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { content: msg, is_error: true };
    }
  };

  // Resolve tools for current iteration
  const resolveTools = (iteration: number): ToolDefinition[] => {
    return tools({ toolsUsed, iteration } as ToolResolverContext);
  };

  // Clone history and sanitize orphaned tool_use blocks.
  // If the last assistant message has tool_use blocks but no following tool_result,
  // the API returns 400. Strip the orphan to recover from crashed turns.
  const history = sanitizeHistory([...request.history] as Array<{ role?: unknown; content?: unknown }>);

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

      const response = await callWithRetry(() => callGeminiAPI(geminiHistory, model, apiKey, systemPrompt, resolveTools(iterationsUsed)));
      const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
      const candidate = candidates?.[0];
      if (!candidate?.content) throw new Error('Empty response from Gemini');

      const content = candidate.content as { parts: GeminiPart[] };
      const parts = content.parts;

      const texts: string[] = [];
      const functionCalls: GeminiPart[] = [];
      for (const part of parts) {
        if (part.text && !part.thought) texts.push(part.text);
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
        let result: ToolCallResult;
        try {
          result = await handleToolCall(name, args);
        } catch (err) {
          result = {
            content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          };
        }
        toolCallLog.push({ name, success: !result.is_error });

        if (result.visionImage) pendingVisionImages.push(result.visionImage);

        const trimmed = truncateForHistory(result.content, name);
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

      // Inject only the LAST vision screenshot per iteration to limit token bloat
      // (each base64 screenshot adds ~20K+ tokens to history)
      if (pendingVisionImages.length > 0) {
        const lastImg = pendingVisionImages[pendingVisionImages.length - 1];
        const base64 = lastImg.replace(/^data:image\/\w+;base64,/, '');
        geminiHistory.push({
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: base64 } } as unknown as GeminiPart,
            { text: 'Screenshot of the frame analyzed above. Use the visual style, colors, and composition to inform your design decisions.' },
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

  // ── Codex / Responses API ──
  if (provider === 'codex') {
    const codexInput = history as Array<Record<string, unknown>>;

    // Handle image attachments
    if (request.attachmentBase64) {
      const base64 = request.attachmentBase64.replace(/^data:image\/\w+;base64,/, '');
      const mimeMatch = request.attachmentBase64.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeMatch?.[1] || 'image/png';
      codexInput.push({
        type: 'message', role: 'user',
        content: [
          { type: 'input_image', image_url: `data:${mimeType};base64,${base64}` },
          { type: 'input_text', text: message },
        ],
      });
    } else {
      codexInput.push({ type: 'message', role: 'user', content: message });
    }

    let remaining = MAX_ITERATIONS;
    while (remaining-- > 0) {
      if (iterationsUsed > 0) await sleep(500);
      iterationsUsed++;

      const toolsForCall = resolveTools(iterationsUsed);
      const response = await callWithRetry(() => callCodexAPI(codexInput, model, apiKey, systemPrompt, toolsForCall));

      let output = response.output as Array<Record<string, unknown>> | undefined;

      // Responses API may return text in a "text" field instead of output array
      if ((!output || output.length === 0) && response.text) {
        const textObj = response.text as Record<string, unknown>;
        // text can be a string or an object like { format: {...}, content: "..." }
        let textContent: string | undefined;
        if (typeof response.text === 'string') {
          textContent = response.text as string;
        } else if (textObj && typeof textObj === 'object') {
          // Check for nested content array or string
          const content = textObj.content;
          if (typeof content === 'string') {
            textContent = content;
          } else if (Array.isArray(content) && content.length > 0) {
            textContent = content.map((c: Record<string, unknown>) => c.text || '').join('');
          }
        }
        if (textContent) {
          output = [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: textContent }] }];
        }
      }

      if (!output || output.length === 0) {
        throw new Error('Empty response from Codex');
      }

      // Process output items
      let hasToolCalls = false;
      for (const item of output) {
        if (item.type === 'message') {
          const content = item.content as Array<Record<string, unknown>> | string | undefined;
          if (typeof content === 'string') {
            textParts.push(content);
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if (part.type === 'output_text' || part.type === 'text') {
                textParts.push(part.text as string);
              }
            }
          }
        } else if (item.type === 'function_call') {
          hasToolCalls = true;
          const fnName = item.name as string;
          let args: Record<string, unknown>;
          try { args = JSON.parse(item.arguments as string); } catch { args = {}; }

          toolsUsed.add(fnName);
          let result: ToolCallResult;
          try {
            result = await handleToolCall(fnName, args);
          } catch (err) {
            result = {
              content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
              is_error: true,
            };
          }
          toolCallLog.push({ name: fnName, success: !result.is_error });

          const trimmed = truncateForHistory(result.content, fnName);
          // Responses API: include the function_call item, then its output
          // call_id is the unique identifier the API uses to match call → output
          const callId = (item.call_id || item.id) as string;
          codexInput.push({
            type: 'function_call',
            id: item.id as string,
            call_id: callId,
            name: fnName,
            arguments: item.arguments as string,
          });
          codexInput.push({
            type: 'function_call_output',
            call_id: callId,
            output: result.is_error ? `Error: ${trimmed}` : trimmed,
          });
        }
      }

      if (!hasToolCalls) { completedCleanly = true; break; }
    }

    return {
      history: codexInput,
      text: textParts.join('\n'),
      toolCalls: toolCallLog,
      iterationsUsed,
      completedCleanly,
      newMemoryEntries,
    };
  }

  // ── OpenAI / Venice ──
  if (provider === 'openai' || provider === 'venice') {
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

    const callFn = provider === 'venice' ? callVeniceAPI : callOpenAIAPI;
    let remaining = MAX_ITERATIONS;
    while (remaining-- > 0) {
      if (iterationsUsed > 0) await sleep(500);
      iterationsUsed++;

      const response = await callWithRetry(() => callFn(openaiHistory, model, apiKey, systemPrompt, resolveTools(iterationsUsed)));
      const choices = response.choices as Array<Record<string, unknown>> | undefined;
      const choice = choices?.[0];
      if (!choice?.message) throw new Error(`Empty response from ${provider === 'venice' ? 'Venice' : 'OpenAI'}`);

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
        let result: ToolCallResult;
        try {
          result = await handleToolCall(fnName, args);
        } catch (err) {
          result = {
            content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          };
        }
        toolCallLog.push({ name: fnName, success: !result.is_error });

        const trimmed = truncateForHistory(result.content, fnName);
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

    const response = await callWithRetry(() => callAnthropicAPI(claudeHistory, model, apiKey, systemPrompt, resolveTools(iterationsUsed)));

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
    let screenshotInjectedThisIteration = false;
    for (const toolUse of toolUses) {
      toolsUsed.add(toolUse.name!);
      let result: ToolCallResult;
      try {
        result = await handleToolCall(toolUse.name!, toolUse.input || {});
      } catch (err) {
        // Always produce a tool_result — an orphaned tool_use breaks the API protocol
        result = {
          content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        };
      }
      toolCallLog.push({ name: toolUse.name!, success: !result.is_error });

      // Limit to 1 screenshot per iteration to prevent token bloat (~20K+ tokens each)
      if (result.visionImage && !result.is_error && !screenshotInjectedThisIteration) {
        screenshotInjectedThisIteration = true;
        const base64 = result.visionImage.replace(/^data:image\/\w+;base64,/, '');
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: [
            { type: 'text', text: truncateForHistory(result.content, toolUse.name!) } as unknown as ContentBlock,
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } } as unknown as ContentBlock,
          ] as unknown as string,
        });
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: truncateForHistory(result.content, toolUse.name!),
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
