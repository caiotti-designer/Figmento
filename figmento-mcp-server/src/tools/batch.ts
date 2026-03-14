import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type SendDesignCommand = (action: string, params: Record<string, unknown>, timeoutMs?: number) => Promise<Record<string, unknown>>;

// Max commands Claude Code may pass in one tool call.
// Chunking handles splitting before each WS round-trip, so this is just an input guard.
const MAX_BATCH_COMMANDS = 50;

const DEFAULT_CHUNK_SIZE = 15;

// ─── BatchCommand type ──────────────────────────────────────────────────────

interface BatchCommand {
  action: string;
  params: Record<string, unknown>;
  tempId?: string;
}

interface CombinedBatchResponse {
  results: unknown[];
  summary: { total: number; succeeded: number; failed: number; chunks: number };
  chunks: number;
  createdNodeIds: string[];
}

export const createDesignSchema = {
  design: z.object({
    width: z.number(),
    height: z.number(),
    backgroundColor: z.string(),
    elements: z.array(z.any()),
  }).describe('Complete UIAnalysis design structure'),
  name: z.string().optional().describe('Name for the main frame'),
  autoEvaluate: z.boolean().optional().describe('Auto-run refinement check + screenshot after design creation. Default true. Skipped when no frame is created.'),
};

export const batchExecuteSchema = {
  commands: z.array(z.object({
    action: z.string().describe('The Figma command action (e.g. create_frame, create_text, set_fill, clone_node, etc.)'),
    params: z.record(z.any()).describe('Parameters for the command. Use "$tempId" values to reference nodes created earlier in the batch.'),
    tempId: z.string().optional().describe('Optional identifier for this command\'s result. Other commands can reference the created nodeId as "$tempId".'),
  })).describe(`Array of commands to execute sequentially. Max ${MAX_BATCH_COMMANDS}.`),
  chunkSize: z.number().int().min(1).max(50).optional().describe(`Number of commands per WS round-trip (default ${DEFAULT_CHUNK_SIZE}). Reduce for Railway relay; increase for localhost-only.`),
  autoEvaluate: z.boolean().optional().describe('Auto-run refinement check + screenshot after batch. Default true. Skipped for batches < 5 commands or when no FRAME is created.'),
};

export const cloneWithOverridesSchema = {
  nodeId: z.string().describe('The node ID to clone'),
  copies: z.array(z.object({
    offsetX: z.number().optional().describe('X offset from the original node position'),
    offsetY: z.number().optional().describe('Y offset from the original node position'),
    newName: z.string().optional().describe('Name for the cloned node'),
    overrides: z.array(z.object({
      childName: z.string().describe('Name of the child node to override (searched recursively)'),
      properties: z.object({
        content: z.string().optional().describe('New text content (for text nodes)'),
        color: z.string().optional().describe('New fill color hex (e.g. "#FF0000")'),
        fontSize: z.number().optional().describe('New font size'),
        fontWeight: z.number().optional().describe('New font weight'),
        opacity: z.number().optional().describe('New opacity (0-1)'),
      }).describe('Properties to override on the matched child'),
    })).optional().describe('Array of child overrides to apply after cloning'),
  })).describe('Array of copy specifications'),
};

// ─── chunkBatch ─────────────────────────────────────────────────────────────

function chunkBatch<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── applyResolvedIds ────────────────────────────────────────────────────────
// Mirrors the plugin's resolveTempIds() but works on a plain Record instead of Map.
// Strings starting with "$" are looked up in resolved; unresolved refs pass through unchanged.

function applyResolvedIds(value: unknown, resolved: Record<string, string>): unknown {
  if (typeof value === 'string' && value.startsWith('$')) {
    const key = value.slice(1);
    return resolved[key] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyResolvedIds(item, resolved));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = applyResolvedIds(v, resolved);
    }
    return out;
  }
  return value;
}

function applyResolvedIdsToCommands(commands: BatchCommand[], resolved: Record<string, string>): BatchCommand[] {
  return commands.map((cmd) => ({
    ...cmd,
    params: applyResolvedIds(cmd.params, resolved) as Record<string, unknown>,
  }));
}

// ─── runChunked ─────────────────────────────────────────────────────────────

async function runChunked(
  commands: BatchCommand[],
  chunkSize: number,
  send: SendDesignCommand,
): Promise<CombinedBatchResponse> {
  // Fast path: single chunk — no extra overhead
  if (commands.length <= chunkSize) {
    const timeoutMs = Math.min(300_000, Math.max(30_000, commands.length * 3_000));
    const data = await send('batch_execute', { commands }, timeoutMs) as Record<string, unknown>;
    const summary = (data.summary as { total: number; succeeded: number; failed: number }) ?? { total: 0, succeeded: 0, failed: 0 };
    return {
      results: (data.results as unknown[]) ?? [],
      summary: { ...summary, chunks: 1 },
      chunks: 1,
      createdNodeIds: (data.createdNodeIds as string[]) ?? [],
    };
  }

  const allResults: unknown[] = [];
  const allCreatedNodeIds: string[] = [];
  let totalSucceeded = 0;
  let totalFailed = 0;
  const resolvedIds: Record<string, string> = {};
  const chunks = chunkBatch(commands, chunkSize);

  for (const chunk of chunks) {
    const substituted = applyResolvedIdsToCommands(chunk, resolvedIds);
    const timeoutMs = Math.min(300_000, Math.max(30_000, substituted.length * 3_000));
    const data = await send('batch_execute', { commands: substituted }, timeoutMs) as Record<string, unknown>;

    const results = (data.results as unknown[]) ?? [];
    const summary = (data.summary as { total: number; succeeded: number; failed: number }) ?? { total: 0, succeeded: 0, failed: 0 };
    const resolutions = (data.tempIdResolutions as Record<string, string>) ?? {};

    allResults.push(...results);
    allCreatedNodeIds.push(...((data.createdNodeIds as string[]) ?? []));
    totalSucceeded += summary.succeeded;
    totalFailed += summary.failed;
    Object.assign(resolvedIds, resolutions);
  }

  return {
    results: allResults,
    summary: { total: allResults.length, succeeded: totalSucceeded, failed: totalFailed, chunks: chunks.length },
    chunks: chunks.length,
    createdNodeIds: allCreatedNodeIds,
  };
}

// ─── Auto-evaluate postamble ────────────────────────────────────────────────
// Runs refinement check + screenshot in parallel after batch/create_design.
// Returns { evaluation, screenshot } or nulls on failure. Non-fatal — caller
// always gets the original batch results even if evaluation blows up.

interface EvalResult {
  evaluation: Record<string, unknown> | null;
  screenshot: Record<string, unknown> | null;
}

async function runAutoEvaluate(
  rootNodeId: string,
  send: SendDesignCommand,
): Promise<EvalResult> {
  try {
    // Verify it's a FRAME before investing in parallel calls
    const nodeInfo = await send('get_node_info', { nodeId: rootNodeId });
    if ((nodeInfo as Record<string, unknown>).type !== 'FRAME') {
      return { evaluation: null, screenshot: null };
    }

    const [refResult, ssResult] = await Promise.all([
      send('run_refinement_check', { nodeId: rootNodeId }).catch(() => null),
      send('get_screenshot', { nodeId: rootNodeId, scale: 1 }).catch(() => null),
    ]);

    return {
      evaluation: refResult as Record<string, unknown> | null,
      screenshot: ssResult as Record<string, unknown> | null,
    };
  } catch {
    return { evaluation: null, screenshot: null };
  }
}

function buildContentBlocks(
  textPayload: Record<string, unknown>,
  screenshot: Record<string, unknown> | null,
): Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> {
  const blocks: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];

  blocks.push({ type: 'text' as const, text: JSON.stringify(textPayload, null, 2) });

  if (screenshot && (screenshot as Record<string, unknown>).base64) {
    blocks.push({
      type: 'image' as const,
      data: (screenshot as Record<string, unknown>).base64 as string,
      mimeType: 'image/png',
    });
  }

  return blocks;
}

export function registerBatchTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  // ─── create_design (existing) ───────────────────────────────
  server.tool(
    'create_design',
    'Create a complete design from a UIAnalysis JSON structure. This is the batch tool — it creates a main frame with all child elements (text, shapes, images, icons, auto-layout) in a single operation. Best for creating full designs at once rather than element-by-element.',
    createDesignSchema,
    async (params) => {
      const data = await sendDesignCommand('create_design', params) as Record<string, unknown>;

      const shouldEvaluate = params.autoEvaluate !== false && data.nodeId;
      if (shouldEvaluate) {
        const { evaluation, screenshot } = await runAutoEvaluate(data.nodeId as string, sendDesignCommand);
        const textPayload: Record<string, unknown> = { ...data };
        if (evaluation) textPayload.evaluation = evaluation;
        return { content: buildContentBlocks(textPayload, screenshot) };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ─── batch_execute ──────────────────────────────────────────
  server.tool(
    'batch_execute',
    `Execute multiple Figma commands in a single logical operation. Each command has an action, params, and optional tempId.
Use tempId to reference nodes created earlier in the same batch: set tempId on a command, then use "$tempId" as a param value in subsequent commands.
Example: create a frame with tempId "card", then create text with parentId "$card". Cross-chunk $tempId references are resolved automatically.
Max ${MAX_BATCH_COMMANDS} commands per call. Failed commands do NOT abort the batch — all commands execute and results are returned.
Optional chunkSize (default ${DEFAULT_CHUNK_SIZE}): commands are split into chunks of this size and sent as sequential WS round-trips. Reduce if you experience timeouts; increase only if your relay is on localhost.
Prefer this over sequential tool calls for any design with 3+ elements.`,
    batchExecuteSchema,
    async (params) => {
      const commands = params.commands as BatchCommand[];
      const chunkSize = params.chunkSize ?? DEFAULT_CHUNK_SIZE;

      if (commands.length > MAX_BATCH_COMMANDS) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: `Batch exceeds maximum of ${MAX_BATCH_COMMANDS} commands (got ${commands.length}). Split into multiple batch_execute calls.`,
            }),
          }],
        };
      }

      const data = await runChunked(commands, chunkSize, sendDesignCommand);

      const shouldEvaluate = params.autoEvaluate !== false
        && data.summary.total >= 5
        && data.createdNodeIds?.length > 0;

      if (shouldEvaluate) {
        const rootId = data.createdNodeIds[0];
        const { evaluation, screenshot } = await runAutoEvaluate(rootId, sendDesignCommand);
        const textPayload: Record<string, unknown> = {
          results: data.results,
          summary: data.summary,
          createdNodeIds: data.createdNodeIds,
        };
        if (evaluation) textPayload.evaluation = evaluation;
        return { content: buildContentBlocks(textPayload, screenshot) };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ─── clone_with_overrides ───────────────────────────────────
  server.tool(
    'clone_with_overrides',
    `Clone a node multiple times in a single call, with optional positional offsets and named child property overrides.
Replaces the clone → find → set_text × N pattern with one call.
Each copy can specify offsetX/offsetY and an array of overrides targeting children by name.
Returns an array of { nodeId, name } for all created clones.`,
    cloneWithOverridesSchema,
    async (params) => {
      const data = await sendDesignCommand('clone_with_overrides', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );
}
