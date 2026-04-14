/**
 * SP-8: Chat engine tool batching — server-side command aggregation.
 *
 * When Claude returns multiple tool_use blocks in a single response, this
 * module groups consecutive plain plugin tool calls into one batch_execute
 * WS round-trip instead of N individual round-trips. Composite tools
 * (generate_image, analyze_canvas_context, fill_contextual_images,
 * generate_design_system_in_figma), local intelligence tools, screenshot
 * tools, and update_memory stay on the sequential path because they need
 * server-side orchestration or special result handling.
 *
 * A design session with 20 plugin commands previously cost 20 WS round-trips
 * (~2-4s of network overhead on Railway). Batching collapses that to 1.
 */
import { LOCAL_TOOL_NAMES, SCREENSHOT_TOOLS } from './chat-tools';

/**
 * Tools that MUST go through the sequential handler because they require
 * server-side composition, vision injection, or have no WS call at all.
 * Everything else is assumed to be a plain plugin tool and is batchable.
 */
export const NON_BATCHABLE_TOOLS = new Set<string>([
  // Composites (server-side orchestration)
  'generate_image',
  'analyze_canvas_context',
  'fill_contextual_images',
  'generate_design_system_in_figma',
  // No WS call
  'update_memory',
  // Screenshots need vision handling inside the Claude loop
  ...SCREENSHOT_TOOLS,
  // Local intelligence — resolved from bundled knowledge
  ...LOCAL_TOOL_NAMES,
]);

export interface BatchableToolUse {
  id?: string;
  name: string;
  input?: Record<string, unknown>;
}

export interface ClassifiedToolUses<T extends BatchableToolUse> {
  /** Tools that must run sequentially via the existing handleToolCall path. */
  individual: T[];
  /** Tools that can be packed into a single batch_execute call. */
  batchable: T[];
}

/**
 * Split a list of tool_use blocks into individual (sequential) and batchable groups.
 * Preserves order within each group. Does NOT preserve cross-group order — callers
 * that need strict ordering should run individual tools first, then the batch.
 */
export function classifyToolUses<T extends BatchableToolUse>(
  toolUses: T[],
): ClassifiedToolUses<T> {
  const individual: T[] = [];
  const batchable: T[] = [];
  for (const t of toolUses) {
    if (!t.name || NON_BATCHABLE_TOOLS.has(t.name)) {
      individual.push(t);
    } else {
      batchable.push(t);
    }
  }
  return { individual, batchable };
}

/**
 * Minimum batch size. Single-tool responses don't benefit from batching
 * and single-command batch_execute calls add an extra envelope for no gain.
 */
export const MIN_BATCH_SIZE = 2;

/**
 * A single entry in a batch_execute command list, as consumed by the plugin's
 * handleBatchExecute handler (figmento/src/handlers/canvas-batch.ts).
 */
export interface BatchCommand {
  action: string;
  params: Record<string, unknown>;
  tempId?: string;
}

/**
 * Convert a list of batchable tool_uses into batch_execute commands. Each
 * command gets a tempId derived from its position so results can be mapped
 * back to the originating tool_use_id after the batch completes.
 */
export function assembleBatch<T extends BatchableToolUse>(toolUses: T[]): BatchCommand[] {
  return toolUses.map((t, i) => ({
    action: t.name,
    params: t.input || {},
    tempId: `sp8_${i}`,
  }));
}

export interface BatchResultEntry {
  tempId?: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * Result shape returned by the plugin's batch_execute handler.
 * See figmento/src/handlers/canvas-batch.ts — executeRegularCommand pushes
 * one entry per command in the order they were submitted.
 */
export interface BatchExecuteResponse {
  results: BatchResultEntry[];
  summary?: { total: number; succeeded: number; failed: number };
  tempIdResolutions?: Record<string, Record<string, unknown>>;
  createdNodeIds?: string[];
}
