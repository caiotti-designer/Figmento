/// <reference types="@figma/plugin-typings" />

/**
 * Figmento Plugin — Sandbox (main thread)
 *
 * Receives commands from the UI iframe (which gets them from WebSocket),
 * executes Figma Plugin API operations, and returns results.
 */

import { UIAnalysis, UIElement, WSCommand, WSResponse, PluginMessage, CommandErrorCode } from './types';
import { hexToRgb, rgbToHex, getFontStyle } from './color-utils';
import { createElement } from './element-creators';

// Show plugin UI
figma.showUI(__html__, { width: 380, height: 600 });

// Handle messages from UI iframe
figma.ui.onmessage = async function (msg: PluginMessage) {
  switch (msg.type) {
    case 'execute-command':
      try {
        const result = await executeCommand(msg.command);
        figma.ui.postMessage({
          type: 'command-result',
          response: result,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const classified = classifyError(errorMessage);
        figma.ui.postMessage({
          type: 'command-result',
          response: {
            type: 'response',
            id: msg.command.id,
            channel: msg.command.channel,
            success: false,
            error: errorMessage,
            errorCode: classified.code,
            recoverable: classified.recoverable,
          },
        });
      }
      break;

    case 'status':
      figma.notify(msg.message, { timeout: 2000 });
      break;

    case 'get-settings':
      (async () => {
        const keys = ['anthropicApiKey', 'model', 'geminiApiKey'];
        const settings: Record<string, string> = {};
        for (const key of keys) {
          const val = await figma.clientStorage.getAsync(key);
          if (val) settings[key] = val;
        }
        figma.ui.postMessage({ type: 'settings-loaded', settings });
      })();
      break;

    case 'save-settings':
      (async () => {
        const s = msg.settings as Record<string, string>;
        for (const [key, value] of Object.entries(s)) {
          if (value) {
            await figma.clientStorage.setAsync(key, value);
          }
        }
      })();
      break;
  }
};

// ═══════════════════════════════════════════════════════════════
// COMMAND ROUTER
// ═══════════════════════════════════════════════════════════════

async function executeCommand(cmd: WSCommand): Promise<WSResponse> {
  const baseResponse = {
    type: 'response' as const,
    id: cmd.id,
    channel: cmd.channel,
  };

  try {
    switch (cmd.action) {
      case 'create_frame':
        return { ...baseResponse, success: true, data: await handleCreateFrame(cmd.params) };

      case 'create_text':
        return { ...baseResponse, success: true, data: await handleCreateText(cmd.params) };

      case 'set_fill':
        return { ...baseResponse, success: true, data: await handleSetFill(cmd.params) };

      case 'export_node':
        return { ...baseResponse, success: true, data: await handleExportNode(cmd.params) };

      case 'get_selection':
        return { ...baseResponse, success: true, data: await handleGetSelection() };

      case 'create_rectangle':
        return { ...baseResponse, success: true, data: await handleCreateRectangle(cmd.params) };

      case 'create_ellipse':
        return { ...baseResponse, success: true, data: await handleCreateEllipse(cmd.params) };

      case 'create_image':
        return { ...baseResponse, success: true, data: await handleCreateImage(cmd.params) };

      case 'set_stroke':
        return { ...baseResponse, success: true, data: await handleSetStroke(cmd.params) };

      case 'set_effects':
        return { ...baseResponse, success: true, data: await handleSetEffects(cmd.params) };

      case 'set_corner_radius':
        return { ...baseResponse, success: true, data: await handleSetCornerRadius(cmd.params) };

      case 'set_opacity':
        return { ...baseResponse, success: true, data: await handleSetOpacity(cmd.params) };

      case 'set_auto_layout':
        return { ...baseResponse, success: true, data: await handleSetAutoLayout(cmd.params) };

      case 'delete_node':
        return { ...baseResponse, success: true, data: await handleDeleteNode(cmd.params) };

      case 'move_node':
        return { ...baseResponse, success: true, data: await handleMoveNode(cmd.params) };

      case 'resize_node':
        return { ...baseResponse, success: true, data: await handleResizeNode(cmd.params) };

      case 'rename_node':
        return { ...baseResponse, success: true, data: await handleRenameNode(cmd.params) };

      case 'append_child':
        return { ...baseResponse, success: true, data: await handleAppendChild(cmd.params) };

      case 'get_node_info':
        return { ...baseResponse, success: true, data: await handleGetNodeInfo(cmd.params) };

      case 'get_page_nodes':
        return { ...baseResponse, success: true, data: await handleGetPageNodes() };

      case 'create_design':
        return { ...baseResponse, success: true, data: await handleCreateDesign(cmd.params) };

      case 'create_icon':
        return { ...baseResponse, success: true, data: await handleCreateIcon(cmd.params) };

      case 'scan_template':
        return { ...baseResponse, success: true, data: await handleScanTemplate(cmd.params) };

      case 'apply_template_text':
        return { ...baseResponse, success: true, data: await handleApplyTemplateText(cmd.params) };

      case 'apply_template_image':
        return { ...baseResponse, success: true, data: await handleApplyTemplateImage(cmd.params) };

      default:
        return { ...baseResponse, success: false, error: `Unknown action: ${cmd.action}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const { code, recoverable } = classifyError(errorMessage);
    return { ...baseResponse, success: false, error: errorMessage, errorCode: code, recoverable };
  }
}

/** Classify an error message into a structured CommandErrorCode */
function classifyError(message: string): { code: CommandErrorCode; recoverable: boolean } {
  const lower = message.toLowerCase();
  if (lower.includes('node not found') || lower.includes('not found:')) {
    return { code: 'NODE_NOT_FOUND', recoverable: false };
  }
  if (lower.includes('font') && (lower.includes('load') || lower.includes('fail') || lower.includes('timeout'))) {
    return { code: 'FONT_LOAD_FAILED', recoverable: true };
  }
  if (lower.includes('export') && lower.includes('fail')) {
    return { code: 'EXPORT_FAILED', recoverable: true };
  }
  if (lower.includes('cannot have children') || lower.includes('not a frame') || lower.includes('parent')) {
    return { code: 'PARENT_MISMATCH', recoverable: false };
  }
  if (lower.includes('decode') || lower.includes('image data') || lower.includes('createimage')) {
    return { code: 'IMAGE_DECODE_FAILED', recoverable: false };
  }
  if (lower.includes('timeout')) {
    return { code: 'TIMEOUT', recoverable: true };
  }
  if (lower.includes('required') || lower.includes('invalid') || lower.includes('cannot be empty')) {
    return { code: 'INVALID_PARAMS', recoverable: false };
  }
  return { code: 'UNKNOWN', recoverable: false };
}

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleCreateFrame(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const element: UIElement = {
    id: 'frame',
    type: 'frame',
    name: (params.name as string) || 'Frame',
    width: (params.width as number) || 100,
    height: (params.height as number) || 100,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    fills: params.fills as UIElement['fills'] | undefined,
    layoutMode: params.layoutMode as UIElement['layoutMode'] | undefined,
    itemSpacing: params.itemSpacing as number | undefined,
    paddingTop: params.paddingTop as number | undefined,
    paddingRight: params.paddingRight as number | undefined,
    paddingBottom: params.paddingBottom as number | undefined,
    paddingLeft: params.paddingLeft as number | undefined,
    primaryAxisAlignItems: params.primaryAxisAlignItems as UIElement['primaryAxisAlignItems'] | undefined,
    counterAxisAlignItems: params.counterAxisAlignItems as UIElement['counterAxisAlignItems'] | undefined,
    cornerRadius: params.cornerRadius as UIElement['cornerRadius'] | undefined,
    clipsContent: params.clipsContent as boolean | undefined,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create frame');

  // If parentId is specified, append to that frame
  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  } else {
    // Position at viewport center if no x/y specified
    if (element.x === undefined && element.y === undefined) {
      const center = figma.viewport.center;
      node.x = center.x - element.width / 2;
      node.y = center.y - element.height / 2;
    }
  }

  figma.currentPage.selection = [node];

  return { nodeId: node.id, name: node.name };
}

async function handleCreateText(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Validate text content is non-empty before creating any node
  const textContent = (params.text as string) || (params.content as string) || '';
  if (!textContent || textContent.trim().length === 0) {
    throw new Error('Text content is required and cannot be empty. Provide a non-empty "text" parameter.');
  }

  const element: UIElement = {
    id: 'text',
    type: 'text',
    name: (params.name as string) || 'Text',
    width: (params.width as number) || 200,
    height: (params.height as number) || 40,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    text: {
      content: textContent,
      fontSize: (params.fontSize as number) || 16,
      fontWeight: (params.fontWeight as number) || 400,
      fontFamily: (params.fontFamily as string) || 'Inter',
      color: (params.color as string) || '#000000',
      textAlign: params.textAlign as TextProperties['textAlign'] | undefined,
      lineHeight: params.lineHeight as number | undefined,
      letterSpacing: params.letterSpacing as number | undefined,
      segments: params.segments as TextProperties['segments'] | undefined,
    },
    layoutSizingHorizontal: params.layoutSizingHorizontal as UIElement['layoutSizingHorizontal'] | undefined,
    layoutSizingVertical: params.layoutSizingVertical as UIElement['layoutSizingVertical'] | undefined,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create text');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  }

  return { nodeId: node.id, name: node.name };
}

// Import TextProperties for the type reference above
import type { TextProperties } from './types';

async function handleSetFill(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('fills' in node)) throw new Error(`Node ${nodeId} does not support fills`);

  if (params.color) {
    // Simple hex color fill
    const rgb = hexToRgb(params.color as string);
    const opacity = params.opacity as number | undefined;
    (node as GeometryMixin).fills = [{
      type: 'SOLID',
      color: rgb,
      opacity: opacity != null ? opacity : 1,
    }];
  } else if (params.fills) {
    // Full fills array
    const fills = params.fills as Array<{ type: string; color?: string; opacity?: number; gradientStops?: Array<{ position: number; color: string; opacity?: number }> }>;
    const paintFills: Paint[] = [];

    for (const fill of fills) {
      if (fill.type === 'SOLID' && fill.color) {
        paintFills.push({
          type: 'SOLID',
          color: hexToRgb(fill.color),
          opacity: fill.opacity != null ? fill.opacity : 1,
        });
      } else if (fill.type === 'GRADIENT_LINEAR' && fill.gradientStops) {
        paintFills.push({
          type: 'GRADIENT_LINEAR',
          gradientTransform: [[1, 0, 0], [0, 1, 0]] as Transform,
          gradientStops: fill.gradientStops.map(stop => ({
            position: stop.position,
            color: { ...hexToRgb(stop.color), a: stop.opacity != null ? stop.opacity : 1 },
          })),
        });
      }
    }

    (node as GeometryMixin).fills = paintFills;
  }

  return { nodeId, success: true };
}

async function handleExportNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const scale = (params.scale as number) || 1;
  const format = ((params.format as string) || 'PNG').toUpperCase();

  if (!('exportAsync' in node)) throw new Error(`Node ${nodeId} cannot be exported`);

  const bytes = await (node as SceneNode).exportAsync({
    format: format as 'PNG' | 'SVG' | 'JPG',
    constraint: { type: 'SCALE', value: scale },
  });

  const base64 = figma.base64Encode(bytes);
  const mimeType = format === 'SVG' ? 'image/svg+xml' : format === 'JPG' ? 'image/jpeg' : 'image/png';

  return {
    nodeId,
    base64: `data:${mimeType};base64,${base64}`,
    width: (node as SceneNode).width,
    height: (node as SceneNode).height,
  };
}

async function handleGetSelection(): Promise<Record<string, unknown>> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return { count: 0, nodes: [] };
  }

  const nodes = selection.map(node => ({
    nodeId: node.id,
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));

  return { count: selection.length, nodes };
}

async function handleCreateRectangle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const element: UIElement = {
    id: 'rect',
    type: 'rectangle',
    name: (params.name as string) || 'Rectangle',
    width: (params.width as number) || 100,
    height: (params.height as number) || 100,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    fills: params.fills as UIElement['fills'] | undefined,
    stroke: params.stroke as UIElement['stroke'] | undefined,
    cornerRadius: params.cornerRadius as UIElement['cornerRadius'] | undefined,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create rectangle');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  }

  return { nodeId: node.id, name: node.name };
}

async function handleCreateEllipse(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const element: UIElement = {
    id: 'ellipse',
    type: 'ellipse',
    name: (params.name as string) || 'Ellipse',
    width: (params.width as number) || 100,
    height: (params.height as number) || 100,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    fills: params.fills as UIElement['fills'] | undefined,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create ellipse');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  }

  return { nodeId: node.id, name: node.name };
}

async function handleCreateImage(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const imageData = params.imageData as string;
  if (!imageData) throw new Error('imageData (base64) is required');

  const element: UIElement = {
    id: 'image',
    type: 'image',
    name: (params.name as string) || 'Image',
    width: (params.width as number) || 400,
    height: (params.height as number) || 300,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    generatedImage: imageData,
    cornerRadius: params.cornerRadius as UIElement['cornerRadius'] | undefined,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create image');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  }

  return { nodeId: node.id, name: node.name };
}

async function handleSetStroke(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('strokes' in node)) throw new Error(`Node ${nodeId} not found or does not support strokes`);

  const color = params.color as string;
  const width = (params.width as number) || 1;

  if (color) {
    (node as GeometryMixin).strokes = [{ type: 'SOLID', color: hexToRgb(color) }];
    (node as GeometryMixin).strokeWeight = width;
  } else {
    (node as GeometryMixin).strokes = [];
  }

  return { nodeId, success: true };
}

async function handleSetEffects(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('effects' in node)) throw new Error(`Node ${nodeId} not found or does not support effects`);

  const effects = params.effects as Array<{
    type: 'DROP_SHADOW' | 'INNER_SHADOW';
    color: string;
    opacity?: number;
    offset: { x: number; y: number };
    blur: number;
    spread?: number;
  }>;

  if (!effects || effects.length === 0) {
    (node as BlendMixin).effects = [];
    return { nodeId, success: true };
  }

  const figmaEffects: Effect[] = effects.map(e => {
    const rgb = hexToRgb(e.color);
    return {
      type: e.type,
      color: { r: rgb.r, g: rgb.g, b: rgb.b, a: e.opacity != null ? e.opacity : 0.25 },
      offset: { x: e.offset.x, y: e.offset.y },
      radius: e.blur,
      spread: e.spread || 0,
      visible: true,
      blendMode: 'NORMAL' as const,
    };
  });

  (node as BlendMixin).effects = figmaEffects;
  return { nodeId, success: true };
}

async function handleSetCornerRadius(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('cornerRadius' in node)) throw new Error(`Node ${nodeId} not found or does not support corner radius`);

  const radius = params.radius as number | [number, number, number, number];
  if (Array.isArray(radius)) {
    (node as FrameNode).topLeftRadius = radius[0];
    (node as FrameNode).topRightRadius = radius[1];
    (node as FrameNode).bottomRightRadius = radius[2];
    (node as FrameNode).bottomLeftRadius = radius[3];
  } else {
    (node as FrameNode).cornerRadius = radius;
  }

  return { nodeId, success: true };
}

async function handleSetOpacity(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('opacity' in node)) throw new Error(`Node ${nodeId} not found or does not support opacity`);

  (node as SceneNode).opacity = (params.opacity as number) ?? 1;
  return { nodeId, success: true };
}

async function handleSetAutoLayout(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error(`Node ${nodeId} not found or is not a frame`);

  const frame = node as FrameNode;
  const mode = params.layoutMode as 'HORIZONTAL' | 'VERTICAL' | 'NONE';

  if (mode === 'NONE') {
    frame.layoutMode = 'NONE';
    return { nodeId, success: true };
  }

  frame.layoutMode = mode || 'VERTICAL';

  if (params.itemSpacing !== undefined) frame.itemSpacing = params.itemSpacing as number;
  if (params.paddingTop !== undefined) frame.paddingTop = params.paddingTop as number;
  if (params.paddingRight !== undefined) frame.paddingRight = params.paddingRight as number;
  if (params.paddingBottom !== undefined) frame.paddingBottom = params.paddingBottom as number;
  if (params.paddingLeft !== undefined) frame.paddingLeft = params.paddingLeft as number;
  if (params.primaryAxisAlignItems) frame.primaryAxisAlignItems = params.primaryAxisAlignItems as 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  if (params.counterAxisAlignItems) frame.counterAxisAlignItems = params.counterAxisAlignItems as 'MIN' | 'CENTER' | 'MAX';

  return { nodeId, success: true };
}

async function handleDeleteNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const name = node.name;
  node.remove();

  return { deleted: true, name };
}

async function handleMoveNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  if (params.x !== undefined) (node as SceneNode).x = params.x as number;
  if (params.y !== undefined) (node as SceneNode).y = params.y as number;

  return { nodeId, x: (node as SceneNode).x, y: (node as SceneNode).y };
}

async function handleResizeNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('resize' in node)) throw new Error(`Node ${nodeId} not found or cannot be resized`);

  const width = (params.width as number) || (node as SceneNode).width;
  const height = (params.height as number) || (node as SceneNode).height;
  (node as FrameNode).resize(width, height);

  return { nodeId, width, height };
}

async function handleRenameNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const name = (params.name as string) || 'Renamed';
  node.name = name;

  return { nodeId, name };
}

async function handleAppendChild(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parentId = params.parentId as string;
  const childId = params.childId as string;
  if (!parentId || !childId) throw new Error('parentId and childId are required');

  const parent = figma.getNodeById(parentId);
  const child = figma.getNodeById(childId);
  if (!parent || !('appendChild' in parent)) throw new Error(`Parent ${parentId} not found or cannot have children`);
  if (!child) throw new Error(`Child ${childId} not found`);

  (parent as FrameNode).appendChild(child as SceneNode);

  return { parentId, childId, success: true };
}

async function handleGetNodeInfo(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const info: Record<string, unknown> = {
    nodeId: node.id,
    name: node.name,
    type: node.type,
  };

  if ('x' in node) info.x = (node as SceneNode).x;
  if ('y' in node) info.y = (node as SceneNode).y;
  if ('width' in node) info.width = (node as SceneNode).width;
  if ('height' in node) info.height = (node as SceneNode).height;
  if ('opacity' in node) info.opacity = (node as SceneNode).opacity;

  if ('fills' in node && Array.isArray((node as GeometryMixin).fills)) {
    const fills = (node as GeometryMixin).fills as Paint[];
    info.fills = fills.map(f => {
      if (f.type === 'SOLID') {
        return { type: 'SOLID', color: rgbToHex(f.color), opacity: f.opacity };
      }
      return { type: f.type };
    });
  }

  if ('children' in node) {
    info.childCount = (node as FrameNode).children.length;
    info.children = (node as FrameNode).children.map(c => ({
      nodeId: c.id,
      name: c.name,
      type: c.type,
    }));
  }

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    info.characters = textNode.characters;
    info.fontSize = textNode.fontSize;
  }

  if ('layoutMode' in node) {
    info.layoutMode = (node as FrameNode).layoutMode;
  }

  return info;
}

async function handleGetPageNodes(): Promise<Record<string, unknown>> {
  const children = figma.currentPage.children;
  const nodes = children.map(node => ({
    nodeId: node.id,
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));

  return { pageName: figma.currentPage.name, count: nodes.length, nodes };
}

async function handleCreateIcon(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const iconName = (params.iconName as string) || 'circle';
  const size = (params.size as number) || 24;
  const color = (params.color as string) || '#333333';
  const svgPaths = params.svgPaths as string[] | undefined;

  const element: UIElement = {
    id: 'icon',
    type: 'icon',
    name: (params.name as string) || `icon-${iconName}`,
    width: size,
    height: size,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    lucideIcon: iconName,
    svgPaths: svgPaths,
    fills: [{ type: 'SOLID', color }],
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create icon');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  }

  return { nodeId: node.id, name: node.name };
}

async function handleScanTemplate(params: Record<string, unknown>): Promise<Record<string, unknown>> {
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
      const isImage = placeholderName.startsWith('img') ||
                      node.type === 'RECTANGLE' ||
                      (node.type === 'FRAME' && !('characters' in node));
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

async function handleApplyTemplateText(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required — the text placeholder node ID');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (node.type !== 'TEXT') throw new Error(`Node ${nodeId} is not a text node (type: ${node.type})`);

  const textNode = node as TextNode;
  const content = params.content as string;
  if (!content) throw new Error('content is required');

  // Load the existing font before modifying
  const existingFont = textNode.fontName as FontName;
  try {
    await figma.loadFontAsync(existingFont);
  } catch (_e) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  }

  textNode.characters = content;

  // Optionally override style properties
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
      // Keep existing font if specified one fails to load
    }
  }

  return { nodeId, characters: textNode.characters };
}

async function handleApplyTemplateImage(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required — the image placeholder node ID');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const imageData = params.imageData as string;
  if (!imageData) throw new Error('imageData (base64) is required');

  // Decode base64 image and apply as fill
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

async function handleCreateDesign(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const analysis = params.design as UIAnalysis;
  if (!analysis) throw new Error('design (UIAnalysis) is required');

  const frameName = (params.name as string) || 'Generated Design';

  // Create main container frame
  const mainFrame = figma.createFrame();
  mainFrame.name = frameName;
  mainFrame.resize(analysis.width, analysis.height);
  mainFrame.fills = [{
    type: 'SOLID',
    color: hexToRgb(analysis.backgroundColor),
  }];

  // Position at viewport center
  const center = figma.viewport.center;
  mainFrame.x = center.x - analysis.width / 2;
  mainFrame.y = center.y - analysis.height / 2;

  // Create all elements recursively
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
