/**
 * Auto-Batch Command Queue — Groups sequential canvas commands into batch_execute.
 *
 * When the LLM returns multiple tool calls in a single response turn, canvas
 * commands (create_frame, set_fill, etc.) can be batched into a single
 * batch_execute call, reducing WS roundtrips from N to 1.
 *
 * Integration: tool-use-loop.ts calls `onToolCallBatch` when tool calls
 * in a turn exceed BATCH_THRESHOLD. The batch handler separates canvas
 * commands (batched) from non-canvas commands (executed individually).
 *
 * Layer 2 — DS Color Snapping: Before batching, `snapColorsToDS` replaces
 * hex values that are close (RGB distance ≤40) to a design system variable
 * with the exact DS hex. This is a safety net for when the LLM picks
 * "close but not exact" colors despite the prescriptive prompt.
 */

import { designSystemState, isDesignSystemToggleOn } from './state';
import type { DesignSystemCache } from '../types';

// ═══════════════════════════════════════════════════════════════
// CANVAS COMMAND SET — commands that go through the plugin sandbox
// ═══════════════════════════════════════════════════════════════

const CANVAS_COMMANDS = new Set([
  'create_frame',
  'create_text',
  'create_rectangle',
  'create_ellipse',
  'create_image',
  'create_vector',
  'create_icon',
  'set_fill',
  'set_style',
  'set_auto_layout',
  'set_text',
  'set_constraints',
  'set_stroke',
  'set_effects',
  'set_corner_radius',
  'set_opacity',
  'transform_node',
  'resize_node',
  'move_node',
  'delete_node',
  'rename_node',
  'append_child',
  'reorder_child',
  'group_nodes',
  'boolean_operation',
  'flatten_nodes',
  'clone_node',
  'clone_with_overrides',
  'style_text_range',
  'create_design',
  'flip_gradient',
  'bind_variable',
  'apply_paint_style',
  'apply_text_style',
  'apply_effect_style',
  'create_figma_variables',
  'import_component_by_key',
  'import_style_by_key',
]);

/** Minimum number of canvas commands in a turn to trigger auto-batching. */
export const BATCH_THRESHOLD = 5;

/** Check if a tool name is a canvas command eligible for batching. */
export function isCanvasCommand(toolName: string): boolean {
  return CANVAS_COMMANDS.has(toolName);
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ToolCallEntry {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolCallBatchResult {
  /** Result content string (JSON or plain), same as ToolCallResult.content */
  content: string;
  is_error: boolean;
}

type SendCommandFn = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
type SingleToolCallFn = (name: string, args: Record<string, unknown>) => Promise<ToolCallBatchResult>;

// ═══════════════════════════════════════════════════════════════
// DS COLOR SNAPPING (Layer 2 safety net)
// ═══════════════════════════════════════════════════════════════

/** Simple hex → {r,g,b} in 0-255 range. */
function hexTo255(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || typeof hex !== 'string') return null;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const m = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/** Euclidean RGB distance in 0-255 space. */
function rgbDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Max RGB distance to snap a color to a DS variable. */
const SNAP_THRESHOLD = 40;

/** Colors that are always left alone (neutrals). */
const NEUTRAL_COLORS = new Set([
  '#000000', '#ffffff', '#f5f5f5', '#fafafa', '#e5e5e5',
  '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040',
  '#262626', '#171717', '#0a0a0a', '#f0f0f0', '#eeeeee',
]);

function isNeutralColor(hex: string): boolean {
  return NEUTRAL_COLORS.has(hex.toLowerCase());
}

interface DSColorEntry {
  hex: string;
  rgb: { r: number; g: number; b: number };
  name: string;
}

/** Extract COLOR variables from the DS cache as {hex, rgb, name} entries. */
function buildDSColorTable(cache: DesignSystemCache): DSColorEntry[] {
  if (!cache.variables || cache.variables.length === 0) return [];
  const entries: DSColorEntry[] = [];
  for (const v of cache.variables as Array<{ name?: string; resolvedValue?: string; resolvedType?: string }>) {
    if (v.resolvedType !== 'COLOR' || !v.resolvedValue || !v.name) continue;
    const rgb = hexTo255(v.resolvedValue);
    if (rgb) entries.push({ hex: v.resolvedValue, rgb, name: v.name });
  }
  return entries;
}

/** Find the closest DS color within threshold, or null. */
function findClosestDSColor(hex: string, dsColors: DSColorEntry[]): string | null {
  if (isNeutralColor(hex)) return null;
  const rgb = hexTo255(hex);
  if (!rgb) return null;

  let bestDist = Infinity;
  let bestHex: string | null = null;

  for (const ds of dsColors) {
    const dist = rgbDistance(rgb, ds.rgb);
    if (dist === 0) return ds.hex; // exact match — snap to canonical casing
    if (dist <= SNAP_THRESHOLD && dist < bestDist) {
      bestDist = dist;
      bestHex = ds.hex;
    }
  }
  return bestHex;
}

/**
 * Recursively scan a params object for hex color values and snap them to DS colors.
 * Mutates the object in-place. Handles nested objects and arrays.
 */
function snapParamsColors(params: Record<string, unknown>, dsColors: DSColorEntry[]): void {
  for (const key of Object.keys(params)) {
    const val = params[key];
    if (typeof val === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(val)) {
      // It's a hex color — try to snap
      const snapped = findClosestDSColor(val, dsColors);
      if (snapped) params[key] = snapped;
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object') {
          snapParamsColors(item as Record<string, unknown>, dsColors);
        }
      }
    } else if (val && typeof val === 'object') {
      snapParamsColors(val as Record<string, unknown>, dsColors);
    }
  }
}

/** Commands whose params may contain hex color values. */
const COLOR_BEARING_COMMANDS = new Set([
  'set_fill', 'set_stroke', 'set_style',
  'create_text', 'create_frame', 'create_rectangle', 'create_ellipse',
  'create_image', 'create_icon', 'create_design',
  'style_text_range', 'set_effects',
]);

/**
 * Snap hex colors in canvas commands to the nearest DS variable color.
 * Only processes commands that may contain color values.
 * Only snaps colors within SNAP_THRESHOLD (40) RGB distance — leaves
 * clearly different colors (backgrounds, shadows, decorative) alone.
 *
 * Mutates batchCommands in-place.
 */
function snapColorsToDS(
  batchCommands: Array<{ action: string; params: Record<string, unknown>; tempId?: string }>,
  cache: DesignSystemCache | null,
): void {
  if (!cache) return;
  const dsColors = buildDSColorTable(cache);
  if (dsColors.length === 0) return;

  for (const cmd of batchCommands) {
    if (!COLOR_BEARING_COMMANDS.has(cmd.action)) continue;
    if (!cmd.params || typeof cmd.params !== 'object') continue;
    snapParamsColors(cmd.params, dsColors);
  }
}

// ═══════════════════════════════════════════════════════════════
// BATCH EXECUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Creates an `onToolCallBatch` handler for the tool-use-loop.
 *
 * When called with a batch of tool calls:
 * 1. Non-canvas commands execute individually via `onToolCall`
 * 2. Canvas commands are bundled into one `batch_execute` via `sendCommand`
 * 3. Results are returned in the same order as the input tool calls
 *
 * @param sendCommand - Function to send commands to the plugin sandbox
 * @param onToolCall  - The existing single-tool handler (for non-canvas tools)
 * @param formatResult - Callback to format a successful sandbox result into a string
 */
export function createBatchToolCallHandler(
  sendCommand: SendCommandFn,
  onToolCall: SingleToolCallFn,
  formatResult: (toolName: string, data: Record<string, unknown>) => string,
): (toolCalls: ToolCallEntry[]) => Promise<ToolCallBatchResult[]> {
  return async (toolCalls: ToolCallEntry[]): Promise<ToolCallBatchResult[]> => {
    // Separate canvas and non-canvas commands while preserving original indices
    const canvasIndices: number[] = [];
    const nonCanvasIndices: number[] = [];

    for (let i = 0; i < toolCalls.length; i++) {
      if (isCanvasCommand(toolCalls[i].name)) {
        canvasIndices.push(i);
      } else {
        nonCanvasIndices.push(i);
      }
    }

    const results: ToolCallBatchResult[] = new Array(toolCalls.length);

    // Execute non-canvas commands individually first (they may be needed for context)
    for (const idx of nonCanvasIndices) {
      const tc = toolCalls[idx];
      try {
        results[idx] = await onToolCall(tc.name, tc.args);
      } catch (err) {
        results[idx] = {
          content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        };
      }
    }

    // Bundle canvas commands into one batch_execute
    if (canvasIndices.length > 0) {
      const batchCommands = canvasIndices.map((idx, batchIdx) => ({
        action: toolCalls[idx].name,
        params: toolCalls[idx].args as Record<string, unknown>,
        tempId: `auto_${batchIdx}`,
      }));

      // Layer 2: Snap close-but-not-exact colors to DS variables
      if (isDesignSystemToggleOn()) {
        snapColorsToDS(batchCommands, designSystemState.cache);
      }

      try {
        const batchResult = await sendCommand('batch_execute', {
          commands: batchCommands,
        });

        const batchResults = (batchResult.results || []) as Array<{
          tempId?: string;
          success: boolean;
          data?: Record<string, unknown>;
          error?: string;
        }>;

        for (let i = 0; i < canvasIndices.length; i++) {
          const originalIdx = canvasIndices[i];
          const toolName = toolCalls[originalIdx].name;
          const result = batchResults[i];

          if (!result) {
            results[originalIdx] = {
              content: 'No result from batch_execute (possible timeout)',
              is_error: true,
            };
          } else if (result.success && result.data) {
            results[originalIdx] = {
              content: formatResult(toolName, result.data),
              is_error: false,
            };
          } else {
            results[originalIdx] = {
              content: result.error || 'Unknown batch error',
              is_error: true,
            };
          }
        }
      } catch (err) {
        // If the entire batch fails, mark all canvas commands as failed
        const errorMsg = err instanceof Error ? err.message : String(err);
        for (const idx of canvasIndices) {
          results[idx] = {
            content: `Batch execution failed: ${errorMsg}`,
            is_error: true,
          };
        }
      }
    }

    return results;
  };
}
