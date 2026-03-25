/// <reference types="@figma/plugin-typings" />

import type { UIAnalysis } from '../types';
import { hexToRgb, getFontStyle } from '../color-utils';
import { createElement } from '../element-creators';
import { resolveTempIds, isCreationAction } from '../utils/temp-id-resolver';

// Import all handlers needed by executeSingleAction
import { handleCreateFrame, handleCreateText, handleCreateRectangle, handleCreateEllipse, handleCreateImage, handleCreateIcon, handleCreateVector } from './canvas-create';
import { handleSetFill, handleSetStroke, handleSetEffects, handleSetCornerRadius, handleSetOpacity, handleSetAutoLayout, handleSetText, handleStyleTextRange } from './canvas-style';
import { handleDeleteNode, handleMoveNode, handleResizeNode, handleRenameNode, handleAppendChild, handleReorderChild, handleCloneNode, handleCloneWithOverrides, handleGroupNodes, handleGetSelection, handleGetNodeInfo, handleGetPageNodes, handleFindNodes, handleListAvailableFonts, handleBooleanOperation, handleFlattenNodes, handleImportComponentByKey, handleImportStyleByKey } from './canvas-scene';
import { handleExportNode, handleGetScreenshot, handleReadFigmaContext, handleBindVariable, handleApplyPaintStyle, handleApplyTextStyle, handleApplyEffectStyle, handleCreateFigmaVariables, handleExportAsSvg, handleSetConstraints } from './canvas-query';
import { getDesignSystemCache } from './design-system-discovery';
import { tryComponentInstance, isComponentMatchableFrame } from './component-matcher';

interface BatchCommand {
  action: string;
  params: Record<string, unknown>;
  tempId?: string;
}

interface BatchResult {
  tempId?: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export async function handleBatchExecute(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const commands = params.commands as BatchCommand[];
  if (!commands || !Array.isArray(commands)) {
    throw new Error('commands array is required');
  }

  const tempIdMap = new Map<string, string>();
  const results: BatchResult[] = [];
  const createdNodeIds: string[] = [];

  for (const command of commands) {
    try {
      const resolvedParams = resolveTempIds(command.params || {}, tempIdMap);
      const response = await executeSingleAction(command.action, resolvedParams);

      if (command.tempId && response.nodeId) {
        tempIdMap.set(command.tempId, response.nodeId as string);
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

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return { results, summary: { total: results.length, succeeded, failed }, tempIdResolutions: Object.fromEntries(tempIdMap), createdNodeIds };
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
          const handles = gradientFill.gradientHandlePositions;
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
