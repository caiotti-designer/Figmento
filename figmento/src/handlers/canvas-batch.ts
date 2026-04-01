/// <reference types="@figma/plugin-typings" />

import type { UIAnalysis } from '../types';
import { hexToRgb, getFontStyle } from '../color-utils';
import { createElement } from '../element-creators';
import { resolveTempIds, isCreationAction } from '../utils/temp-id-resolver';
import type { TempIdMap } from '../utils/temp-id-resolver';

// Import all handlers needed by executeSingleAction
import { handleCreateFrame, handleCreateText, handleCreateRectangle, handleCreateEllipse, handleCreateImage, handleCreateIcon, handleCreateVector } from './canvas-create';
import { handleSetFill, handleSetStroke, handleSetEffects, handleSetCornerRadius, handleSetOpacity, handleSetAutoLayout, handleSetText, handleStyleTextRange } from './canvas-style';
import { handleDeleteNode, handleMoveNode, handleResizeNode, handleRenameNode, handleAppendChild, handleReorderChild, handleCloneNode, handleCloneWithOverrides, handleGroupNodes, handleGetSelection, handleGetNodeInfo, handleGetPageNodes, handleFindNodes, handleListAvailableFonts, handleBooleanOperation, handleFlattenNodes, handleImportComponentByKey, handleImportStyleByKey } from './canvas-scene';
import { handleExportNode, handleGetScreenshot, handleReadFigmaContext, handleBindVariable, handleApplyPaintStyle, handleApplyTextStyle, handleApplyEffectStyle, handleCreateFigmaVariables, handleExportAsSvg, handleSetConstraints } from './canvas-query';
import { getDesignSystemCache } from './design-system-discovery';
import { tryComponentInstance, isComponentMatchableFrame } from './component-matcher';
import { tryBindFillVariable, tryBindSpacingVariables, tryBindTextVariables } from './variable-binder';
import { handleCreateComponent, handleConvertToComponent, handleCombineAsVariants, handleCreateInstance, handleDetachInstance, handleSetReactions, handleGetReactions, handleMakeInteractive, handleCreatePrototypeFlow } from './canvas-components';
import type { DesignSystemCache } from '../types';

// ═══════════════════════════════════════════════════════════════
// ENHANCED BATCH DSL — Types
// ═══════════════════════════════════════════════════════════════

interface BatchCommand {
  action: string;
  params: Record<string, unknown>;
  tempId?: string;
}

interface RepeatCommand {
  action: 'repeat';
  count: number;
  template: DSLCommand;
}

interface ConditionalCommand {
  action: 'if';
  condition: string;
  then: DSLCommand[];
  else?: DSLCommand[];
}

/** Any command in the enhanced DSL — regular, repeat, or conditional */
type DSLCommand = BatchCommand | RepeatCommand | ConditionalCommand;

interface BatchResult {
  tempId?: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// SECURITY CAPS
// ═══════════════════════════════════════════════════════════════

const MAX_REPEAT_ITERATIONS = 50;
const MAX_EXPANDED_COMMANDS = 200;
const BATCH_TIMEOUT_MS = 30_000;
const MAX_NESTING_DEPTH = 5;

// ═══════════════════════════════════════════════════════════════
// EXPRESSION INTERPOLATION
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluate a simple `${...}` expression with the current loop index `i`.
 * Supports: ${i}, ${i * N}, ${i + N}, ${i - N}, ${i * N + M}, ${i * N - M}
 * Only integer arithmetic with the single variable `i`.
 */
function evaluateIndexExpression(expr: string, i: number): number {
  const trimmed = expr.trim();

  // Just `i`
  if (trimmed === 'i') return i;

  // `i OP N` (e.g. `i * 320`, `i + 1`, `i - 5`)
  const twoPartMatch = trimmed.match(/^i\s*([*+\-])\s*(-?\d+)$/);
  if (twoPartMatch) {
    const op = twoPartMatch[1];
    const n = parseInt(twoPartMatch[2], 10);
    if (op === '*') return i * n;
    if (op === '+') return i + n;
    if (op === '-') return i - n;
  }

  // `i * N OP M` (e.g. `i * 320 + 40`, `i * 100 - 10`)
  const threePartMatch = trimmed.match(/^i\s*\*\s*(-?\d+)\s*([+\-])\s*(-?\d+)$/);
  if (threePartMatch) {
    const n = parseInt(threePartMatch[1], 10);
    const op2 = threePartMatch[2];
    const m = parseInt(threePartMatch[3], 10);
    const product = i * n;
    if (op2 === '+') return product + m;
    if (op2 === '-') return product - m;
  }

  throw new Error(`Unsupported expression in repeat template: \${${expr}}. Allowed: \${i}, \${i * N}, \${i + N}, \${i - N}, \${i * N + M}, \${i * N - M}`);
}

/**
 * Interpolate all `${...}` expressions in a string value using the current index.
 * Returns a string if the result contains non-numeric parts, or a number if the
 * entire string was a single `${...}` expression that evaluated to a number.
 */
function interpolateString(value: string, i: number): string | number {
  // Check if the entire value is a single ${...} expression
  const singleExprMatch = value.match(/^\$\{([^}]+)\}$/);
  if (singleExprMatch) {
    return evaluateIndexExpression(singleExprMatch[1], i);
  }

  // Replace all ${...} occurrences within the string
  return value.replace(/\$\{([^}]+)\}/g, (_match, expr) => {
    return String(evaluateIndexExpression(expr, i));
  });
}

/**
 * Deep-interpolate all string values in an object/array with the current index `i`.
 */
function interpolateValue(value: unknown, i: number): unknown {
  if (typeof value === 'string') {
    return interpolateString(value, i);
  }
  if (Array.isArray(value)) {
    return value.map(item => interpolateValue(item, i));
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = interpolateValue(v, i);
    }
    return result;
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════
// PRE-EXPANSION — count total commands to enforce the 200 cap
// ═══════════════════════════════════════════════════════════════

function isRepeatCommand(cmd: DSLCommand): cmd is RepeatCommand {
  return cmd.action === 'repeat' && 'count' in cmd && 'template' in cmd;
}

function isConditionalCommand(cmd: DSLCommand): cmd is ConditionalCommand {
  return cmd.action === 'if' && 'condition' in cmd && 'then' in cmd;
}

/**
 * Count the maximum possible expanded commands from a DSL command array.
 * Repeat is always expanded (count is known). Conditionals count both branches
 * (worst case). Returns the total count. Throws if any repeat exceeds MAX_REPEAT_ITERATIONS.
 */
function countExpandedCommands(commands: DSLCommand[], depth: number = 0): number {
  if (depth > MAX_NESTING_DEPTH) {
    throw new Error(`DSL nesting depth exceeds ${MAX_NESTING_DEPTH} levels`);
  }

  let total = 0;
  for (const cmd of commands) {
    if (isRepeatCommand(cmd)) {
      if (cmd.count > MAX_REPEAT_ITERATIONS) {
        throw new Error(`Repeat count ${cmd.count} exceeds maximum of ${MAX_REPEAT_ITERATIONS} iterations`);
      }
      if (cmd.count < 0) {
        throw new Error(`Repeat count must be non-negative, got ${cmd.count}`);
      }
      // Each iteration produces 1 command from the template
      total += cmd.count;
    } else if (isConditionalCommand(cmd)) {
      // Worst case: the larger branch runs
      const thenCount = countExpandedCommands(cmd.then, depth + 1);
      const elseCount = cmd.else ? countExpandedCommands(cmd.else, depth + 1) : 0;
      total += Math.max(thenCount, elseCount);
    } else {
      total += 1;
    }
  }
  return total;
}

// ═══════════════════════════════════════════════════════════════
// CONDITIONAL EVALUATION
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluate a condition string against the current tempIdMap.
 * V1 supports only: `exists($name)`
 */
function evaluateCondition(condition: string, tempIdMap: TempIdMap): boolean {
  const existsMatch = condition.trim().match(/^exists\(\$(\w+)\)$/);
  if (existsMatch) {
    const name = existsMatch[1];
    return tempIdMap.has(name);
  }
  throw new Error(`Unsupported condition: "${condition}". V1 supports only exists($name).`);
}

// ═══════════════════════════════════════════════════════════════
// BATCH EXECUTOR
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// FN-7/FN-8: POST-EXECUTION DS BINDING FOR BATCH COMMANDS
// ═══════════════════════════════════════════════════════════════

/**
 * Apply design system bindings after a batch command executes.
 * Mirrors the interceptor logic in command-router.ts and canvas-create.ts / canvas-style.ts
 * but runs inside the batch loop so batch_execute commands get the same DS binding
 * as individually-routed commands.
 *
 * All operations are best-effort — failures are silent.
 */
async function applyDsBindings(
  action: string,
  params: Record<string, unknown>,
  response: Record<string, unknown>,
  _dsCache: DesignSystemCache,
): Promise<void> {
  const nodeId = response.nodeId as string;
  if (!nodeId) return;

  const autoBindParam = params.autoBindVariables as boolean | undefined;

  switch (action) {
    case 'set_fill': {
      // Bind COLOR variable to solid fill (same as canvas-style.ts handleSetFill)
      const solidHex = params.color as string | undefined;
      if (!solidHex) break;
      const node = figma.getNodeById(nodeId);
      if (!node || !('fills' in node)) break;
      const match = await tryBindFillVariable(node as SceneNode, solidHex, autoBindParam);
      if (match) {
        response.boundVariable = match.variableName;
      }
      break;
    }

    case 'set_auto_layout': {
      // Bind FLOAT spacing variables (same as canvas-style.ts handleSetAutoLayout)
      const mode = params.layoutMode as string | undefined;
      if (mode === 'NONE') break;
      const node = figma.getNodeById(nodeId);
      if (!node || node.type !== 'FRAME') break;
      const boundSpacing = await tryBindSpacingVariables(node as FrameNode, {
        paddingTop: params.paddingTop as number | undefined,
        paddingRight: params.paddingRight as number | undefined,
        paddingBottom: params.paddingBottom as number | undefined,
        paddingLeft: params.paddingLeft as number | undefined,
        itemSpacing: params.itemSpacing as number | undefined,
      }, autoBindParam);
      if (Object.keys(boundSpacing).length > 0) {
        response.boundSpacingVariables = boundSpacing;
      }
      break;
    }

    case 'create_text': {
      // Bind text color + font size variables (same as canvas-create.ts handleCreateText)
      const textColor = (params.color as string) || (params.fillColor as string) || '#000000';
      const node = figma.getNodeById(nodeId);
      if (!node || node.type !== 'TEXT') break;
      const textBindResult = await tryBindTextVariables(
        node as TextNode,
        textColor,
        (params.fontSize as number) || undefined,
        autoBindParam,
      );
      if (textBindResult.boundColor) {
        response.boundColor = textBindResult.boundColor.variableName;
      }
      if (textBindResult.boundFontSize) {
        response.boundFontSize = textBindResult.boundFontSize.variableName;
      }
      break;
    }

    // create_frame matching is already handled inside executeSingleAction
    // (the switch case for 'create_frame' calls tryComponentInstance directly)
    // so we don't need to duplicate it here.
  }
}

export async function handleBatchExecute(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const commands = params.commands as DSLCommand[];
  if (!commands || !Array.isArray(commands)) {
    throw new Error('commands array is required');
  }

  // Pre-expansion validation: count total commands and enforce caps
  const expandedTotal = countExpandedCommands(commands);
  if (expandedTotal > MAX_EXPANDED_COMMANDS) {
    throw new Error(
      `Batch expansion would produce ${expandedTotal} commands, exceeding the maximum of ${MAX_EXPANDED_COMMANDS}. ` +
      `Reduce repeat counts or split into multiple batch_execute calls.`
    );
  }

  const tempIdMap: TempIdMap = new Map();
  const results: BatchResult[] = [];
  const createdNodeIds: string[] = [];
  const startTime = Date.now();
  let timedOut = false;

  // FN-7/FN-8: Load DS cache once for the entire batch (not per-command)
  let dsCache: DesignSystemCache | null = null;
  try {
    dsCache = await getDesignSystemCache();
  } catch {
    // Silent — DS binding is best-effort
  }

  /**
   * Execute a list of DSL commands sequentially, handling repeat/if constructs.
   * Mutates results, createdNodeIds, tempIdMap. Returns early if timeout hit.
   */
  async function executeCommandList(cmds: DSLCommand[], depth: number): Promise<void> {
    if (depth > MAX_NESTING_DEPTH) {
      results.push({ success: false, error: `DSL nesting depth exceeds ${MAX_NESTING_DEPTH} levels` });
      return;
    }

    for (const cmd of cmds) {
      // Timeout check before each command
      if (Date.now() - startTime > BATCH_TIMEOUT_MS) {
        timedOut = true;
        return;
      }

      if (isRepeatCommand(cmd)) {
        await executeRepeat(cmd, depth);
      } else if (isConditionalCommand(cmd)) {
        await executeConditional(cmd, depth);
      } else {
        await executeRegularCommand(cmd as BatchCommand);
      }

      if (timedOut) return;
    }
  }

  async function executeRepeat(cmd: RepeatCommand, depth: number): Promise<void> {
    if (cmd.count > MAX_REPEAT_ITERATIONS) {
      results.push({
        success: false,
        error: `Repeat count ${cmd.count} exceeds maximum of ${MAX_REPEAT_ITERATIONS} iterations`,
      });
      return;
    }

    for (let i = 0; i < cmd.count; i++) {
      if (timedOut || Date.now() - startTime > BATCH_TIMEOUT_MS) {
        timedOut = true;
        return;
      }

      // Deep-interpolate the template with the current index
      const expanded = interpolateValue(cmd.template, i) as BatchCommand;

      // Interpolate tempId if present
      if ((cmd.template as BatchCommand).tempId) {
        expanded.tempId = String(interpolateString((cmd.template as BatchCommand).tempId!, i));
      }

      await executeRegularCommand(expanded);
    }
  }

  async function executeConditional(cmd: ConditionalCommand, depth: number): Promise<void> {
    try {
      const conditionResult = evaluateCondition(cmd.condition, tempIdMap);
      if (conditionResult) {
        await executeCommandList(cmd.then, depth + 1);
      } else if (cmd.else) {
        await executeCommandList(cmd.else, depth + 1);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({ success: false, error: `Conditional evaluation failed: ${errorMessage}` });
    }
  }

  async function executeRegularCommand(command: BatchCommand): Promise<void> {
    try {
      const resolvedParams = resolveTempIds(command.params || {}, tempIdMap);
      const response = await executeSingleAction(command.action, resolvedParams);

      // FN-7/FN-8: Post-execution DS binding (mirrors command-router.ts interceptors)
      // These are best-effort — failures are silent and don't affect the command result.
      if (dsCache && response.nodeId) {
        try {
          await applyDsBindings(command.action, resolvedParams, response, dsCache);
        } catch {
          // DS binding failure is always silent
        }
      }

      // Store the FULL result object in tempIdMap (AC6)
      if (command.tempId) {
        tempIdMap.set(command.tempId, response);
      }

      if (response.nodeId && isCreationAction(command.action)) {
        createdNodeIds.push(response.nodeId as string);
      }

      results.push({
        tempId: command.tempId,
        success: true,
        data: response,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        tempId: command.tempId,
        success: false,
        error: errorMessage,
      });
    }
  }

  // Execute the full command list
  await executeCommandList(commands, 0);

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  // Build tempIdResolutions: for backward compat, serialize full result objects
  const tempIdResolutions: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of tempIdMap) {
    tempIdResolutions[key] = value;
  }

  return {
    results,
    summary: { total: results.length, succeeded, failed, expandedTotal },
    tempIdResolutions,
    createdNodeIds,
    ...(timedOut ? { timedOut: true } : {}),
  };
}

export async function executeSingleAction(action: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (action) {
    case 'create_frame': {
      // FN-7: Intercept create_frame calls that match a discovered component
      const frameName = (params.name as string) || '';
      if (params.useDesignSystem !== false && isComponentMatchableFrame(frameName)) {
        const dsCache = await getDesignSystemCache();
        const instanceResult = await tryComponentInstance(params, dsCache);
        if (instanceResult) return instanceResult;
      }
      return await handleCreateFrame(params);
    }
    case 'create_text': return await handleCreateText(params);
    case 'set_fill': return await handleSetFill(params);
    case 'export_node': return await handleExportNode(params);
    case 'get_screenshot': return await handleGetScreenshot(params);
    case 'get_selection': return await handleGetSelection();
    case 'create_rectangle': return await handleCreateRectangle(params);
    case 'create_ellipse': return await handleCreateEllipse(params);
    case 'create_image': return await handleCreateImage(params);
    case 'set_stroke': return await handleSetStroke(params);
    case 'set_effects': return await handleSetEffects(params);
    case 'set_corner_radius': return await handleSetCornerRadius(params);
    case 'set_opacity': return await handleSetOpacity(params);
    case 'set_auto_layout': return await handleSetAutoLayout(params);
    case 'delete_node': return await handleDeleteNode(params);
    case 'move_node': return await handleMoveNode(params);
    case 'resize_node': return await handleResizeNode(params);
    case 'rename_node': return await handleRenameNode(params);
    case 'append_child': return await handleAppendChild(params);
    case 'reorder_child': return await handleReorderChild(params);
    case 'clone_node': return await handleCloneNode(params);
    case 'group_nodes': return await handleGroupNodes(params);
    case 'get_node_info': return await handleGetNodeInfo(params);
    case 'get_page_nodes': return await handleGetPageNodes();
    case 'create_design': return await handleCreateDesignCmd(params);
    case 'create_icon': return await handleCreateIcon(params);
    case 'scan_template': return await handleScanTemplateCmd(params);
    case 'apply_template_text': return await handleApplyTemplateTextCmd(params);
    case 'apply_template_image': return await handleApplyTemplateImageCmd(params);
    case 'clone_with_overrides': return await handleCloneWithOverrides(params);
    case 'set_text': return await handleSetText(params);
    case 'style_text_range': return await handleStyleTextRange(params);
    case 'find_nodes': return await handleFindNodes(params);
    case 'list_available_fonts': return await handleListAvailableFonts(params);
    case 'create_vector': return await handleCreateVector(params);
    case 'boolean_operation': return await handleBooleanOperation(params);
    case 'flatten_nodes': return await handleFlattenNodes(params);
    case 'import_component_by_key': return await handleImportComponentByKey(params);
    case 'import_style_by_key': return await handleImportStyleByKey(params);
    case 'export_as_svg': return await handleExportAsSvg(params);
    case 'set_constraints': return await handleSetConstraints(params);
    case 'read_figma_context': return await handleReadFigmaContext();
    case 'bind_variable': return await handleBindVariable(params);
    case 'apply_paint_style': return await handleApplyPaintStyle(params);
    case 'apply_text_style': return await handleApplyTextStyle(params);
    case 'apply_effect_style': return await handleApplyEffectStyle(params);
    case 'create_figma_variables': return await handleCreateFigmaVariables(params);
    case 'run_refinement_check': return await runRefinementCheck(String(params.nodeId));
    // IC-1/2/3: Component actions
    case 'create_component_node': return await handleCreateComponent(params);
    case 'convert_to_component': return await handleConvertToComponent(params);
    case 'combine_as_variants': return await handleCombineAsVariants(params);
    case 'create_instance': return await handleCreateInstance(params);
    case 'detach_instance': return await handleDetachInstance(params);
    case 'set_reactions': return await handleSetReactions(params);
    case 'get_reactions': return await handleGetReactions(params);
    // IC-10/12: Smart interactions
    case 'make_interactive': return await handleMakeInteractive(params);
    case 'create_prototype_flow': return await handleCreatePrototypeFlow(params);
    default:
      throw new Error(`Unknown action in batch: ${action}`);
  }
}

/** Command-router version of create_design (takes design JSON) */
export async function handleCreateDesignCmd(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const analysis = params.design as UIAnalysis;
  if (!analysis) throw new Error('design (UIAnalysis) is required');

  const frameName = (params.name as string) || 'Generated Design';

  const mainFrame = figma.createFrame();
  mainFrame.name = frameName;
  mainFrame.resize(analysis.width, analysis.height);
  mainFrame.fills = [{
    type: 'SOLID',
    color: hexToRgb(analysis.backgroundColor),
  }];

  const center = figma.viewport.center;
  mainFrame.x = center.x - analysis.width / 2;
  mainFrame.y = center.y - analysis.height / 2;

  for (const element of analysis.elements) {
    const node = await createElement(element);
    if (node) {
      mainFrame.appendChild(node);
    }
  }

  figma.currentPage.selection = [mainFrame];
  figma.viewport.scrollAndZoomIntoView([mainFrame]);

  return {
    nodeId: mainFrame.id,
    name: mainFrame.name,
    width: mainFrame.width,
    height: mainFrame.height,
    childCount: mainFrame.children.length,
  };
}

/** Command-router version of scan_template (takes nodeId param) */
export async function handleScanTemplateCmd(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string | undefined;

  let targetNodes: readonly SceneNode[];
  if (nodeId) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    targetNodes = [node as SceneNode];
  } else {
    targetNodes = figma.currentPage.selection;
    if (targetNodes.length === 0) {
      throw new Error('No node selected and no nodeId provided. Select a frame or pass a nodeId.');
    }
  }

  const placeholders: Array<{ nodeId: string; name: string; type: 'text' | 'image'; path: string }> = [];

  function scanNode(node: SceneNode, path: string): void {
    if (node.name.startsWith('#')) {
      const placeholderName = node.name.substring(1);
      const isText = node.type === 'TEXT';

      placeholders.push({
        nodeId: node.id,
        name: placeholderName,
        type: isText ? 'text' : 'image',
        path: path + '/' + node.name,
      });
    }

    if ('children' in node) {
      const frame = node as FrameNode;
      for (const child of frame.children) {
        scanNode(child, path + '/' + node.name);
      }
    }
  }

  for (const node of targetNodes) {
    scanNode(node, '');
  }

  return { count: placeholders.length, placeholders };
}

/** Command-router version of apply_template_text (takes nodeId + content) */
export async function handleApplyTemplateTextCmd(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required — the text placeholder node ID');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (node.type !== 'TEXT') throw new Error(`Node ${nodeId} is not a text node (type: ${node.type})`);

  const textNode = node as TextNode;
  const content = params.content as string;
  if (!content) throw new Error('content is required');

  const existingFont = textNode.fontName as FontName;
  try {
    await figma.loadFontAsync(existingFont);
  } catch (_e) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  }

  textNode.characters = content;

  if (params.fontSize) textNode.fontSize = params.fontSize as number;
  if (params.color) {
    textNode.fills = [{ type: 'SOLID', color: hexToRgb(params.color as string) }];
  }
  if (params.fontFamily) {
    const family = params.fontFamily as string;
    const weight = (params.fontWeight as number) || 400;
    const style = getFontStyle(weight);
    try {
      await figma.loadFontAsync({ family, style });
      textNode.fontName = { family, style };
    } catch (_e) {
      // Keep existing font weight if load fails
    }
  }

  return { nodeId, characters: textNode.characters };
}

/** Command-router version of apply_template_image (takes nodeId + imageData) */
export async function handleApplyTemplateImageCmd(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required — the image placeholder node ID');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const imageData = params.imageData as string;
  if (!imageData) throw new Error('imageData (base64) is required');

  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
  const bytes = figma.base64Decode(base64);
  if (!bytes || bytes.length === 0) throw new Error('Failed to decode image data');

  const image = figma.createImage(bytes);
  const scaleMode = (params.scaleMode as 'FILL' | 'FIT' | 'CROP' | 'TILE') || 'FILL';

  if ('fills' in node) {
    (node as GeometryMixin).fills = [{
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode,
    }];
  } else {
    throw new Error(`Node ${nodeId} does not support image fills`);
  }

  return { nodeId, success: true };
}

// ═══════════════════════════════════════════════════════════════
// REFINEMENT CHECK HANDLER (MQ-6)
// ═══════════════════════════════════════════════════════════════

export async function runRefinementCheck(nodeId: string): Promise<{
  nodeId: string;
  totalChecked: number;
  issues: Array<{
    nodeId: string;
    nodeName: string;
    check: 'gradient' | 'auto-layout' | 'spacing' | 'typography' | 'placeholder';
    severity: 'warning' | 'error';
    description: string;
  }>;
  passed: boolean;
}> {
  const SPACING_SCALE_SET = new Set([4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128]);
  const PLACEHOLDER_NAMES = /^(rectangle\s*\d*|frame\s*\d*|image\s*placeholder)$/i;
  const PLACEHOLDER_COLORS = new Set(['#e0e0e0', '#cccccc', '#d9d9d9']);

  type RefinementIssue = {
    nodeId: string;
    nodeName: string;
    check: 'gradient' | 'auto-layout' | 'spacing' | 'typography' | 'placeholder';
    severity: 'warning' | 'error';
    description: string;
  };

  const issues: RefinementIssue[] = [];
  let totalChecked = 0;
  const allFontSizes: number[] = [];

  const root = await figma.getNodeByIdAsync(nodeId);
  if (!root) {
    return { nodeId, totalChecked: 0, issues: [], passed: false };
  }

  function solidToHex(paint: SolidPaint): string {
    const r = Math.round(paint.color.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(paint.color.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(paint.color.b * 255).toString(16).padStart(2, '0');
    return '#' + r + g + b;
  }

  function collectTextChildren(node: SceneNode): TextNode[] {
    const result: TextNode[] = [];
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        if (child.type === 'TEXT') result.push(child);
        if ('children' in child) {
          for (const grandchild of (child as ChildrenMixin).children) {
            if (grandchild.type === 'TEXT') result.push(grandchild as TextNode);
          }
        }
      }
    }
    return result;
  }

  function walkNode(node: BaseNode): void {
    totalChecked++;
    const id = node.id;
    const name = node.name;

    if (!('type' in node)) return;
    const sceneNode = node as SceneNode;

    // Gradient direction check
    if ('fills' in sceneNode && Array.isArray(sceneNode.fills)) {
      const gradientFill = (sceneNode.fills as Paint[]).find(
        (f): f is GradientPaint => f.type === 'GRADIENT_LINEAR'
      );
      if (gradientFill && 'children' in sceneNode) {
        const textNodes = collectTextChildren(sceneNode);
        if (textNodes.length === 0) {
          issues.push({
            nodeId: id, nodeName: name, check: 'gradient', severity: 'warning',
            description: `"${name}" has a gradient fill but no sibling text nodes — verify gradient direction manually.`,
          });
        } else {
          const handles = (gradientFill as any).gradientHandlePositions;
          if (handles && handles.length >= 2) {
            const nodeH = (sceneNode as LayoutMixin).height || 1;
            const nodeW = (sceneNode as LayoutMixin).width || 1;
            const solidEnd = handles[1]; // handle[1] = solid/high-opacity end
            const textCentroidY = textNodes.reduce((s, t) => s + (t.y + t.height / 2) / nodeH, 0) / textNodes.length;
            const textCentroidX = textNodes.reduce((s, t) => s + (t.x + t.width / 2) / nodeW, 0) / textNodes.length;
            const dy = Math.abs(handles[1].y - handles[0].y);
            const dx = Math.abs(handles[1].x - handles[0].x);
            if (dy >= dx) {
              if ((solidEnd.y > 0.5) !== (textCentroidY > 0.5)) {
                issues.push({
                  nodeId: id, nodeName: name, check: 'gradient', severity: 'error',
                  description: `"${name}" gradient solid end (${solidEnd.y > 0.5 ? 'bottom' : 'top'}) faces away from text zone (${textCentroidY > 0.5 ? 'bottom' : 'top'}).`,
                });
              }
            } else {
              if ((solidEnd.x > 0.5) !== (textCentroidX > 0.5)) {
                issues.push({
                  nodeId: id, nodeName: name, check: 'gradient', severity: 'error',
                  description: `"${name}" gradient solid end (${solidEnd.x > 0.5 ? 'right' : 'left'}) faces away from text zone (${textCentroidX > 0.5 ? 'right' : 'left'}).`,
                });
              }
            }
          }
        }
      }
    }

    // Auto-layout + spacing checks (FRAME only)
    if (node.type === 'FRAME') {
      const frame = node as FrameNode;
      if (frame.children.length > 2 && frame.layoutMode === 'NONE') {
        issues.push({
          nodeId: id, nodeName: name, check: 'auto-layout', severity: 'warning',
          description: `Frame "${name}" has ${frame.children.length} children but no auto-layout (layoutMode: NONE).`,
        });
      }
      if (frame.layoutMode !== 'NONE' && frame.itemSpacing !== 0 && !SPACING_SCALE_SET.has(frame.itemSpacing)) {
        issues.push({
          nodeId: id, nodeName: name, check: 'spacing', severity: 'warning',
          description: `Frame "${name}" itemSpacing ${frame.itemSpacing}px is not on the 8px scale [4,8,12,16,20,24,32,40,48,64,80,96,128].`,
        });
      }
    }

    // Collect font sizes for typography check
    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      if (typeof textNode.fontSize === 'number') allFontSizes.push(textNode.fontSize);
    }

    // Placeholder check
    if (node.type === 'RECTANGLE' || node.type === 'FRAME') {
      const isDefaultName = PLACEHOLDER_NAMES.test(name);
      let hasPlaceholderColor = false;
      if ('fills' in sceneNode && Array.isArray(sceneNode.fills)) {
        const solidFills = (sceneNode.fills as Paint[]).filter((f): f is SolidPaint => f.type === 'SOLID');
        if (solidFills.length === 1 && PLACEHOLDER_COLORS.has(solidToHex(solidFills[0]))) {
          hasPlaceholderColor = true;
        }
      }
      if (isDefaultName || hasPlaceholderColor) {
        issues.push({
          nodeId: id, nodeName: name, check: 'placeholder', severity: 'warning',
          description: `"${name}" appears to be an unfilled placeholder (default name or placeholder fill color).`,
        });
      }
    }

    // Recurse into children
    if ('children' in node) {
      for (const child of (node as BaseNode & ChildrenMixin).children) {
        walkNode(child);
      }
    }
  }

  walkNode(root);

  // Typography hierarchy check (runs after full tree walk)
  const uniqueSizes = [...new Set(allFontSizes)].sort((a, b) => a - b);
  if (uniqueSizes.length >= 2) {
    const minSize = uniqueSizes[0];
    const maxSize = uniqueSizes[uniqueSizes.length - 1];
    if (maxSize < 2 * minSize) {
      issues.push({
        nodeId, nodeName: root.name, check: 'typography', severity: 'error',
        description: `Typography lacks hierarchy — largest font (${maxSize}px) is less than 2× smallest (${minSize}px). Increase headline size.`,
      });
    }
  }

  return {
    nodeId,
    totalChecked,
    issues,
    passed: issues.every(i => i.severity !== 'error'),
  };
}
