/// <reference types="@figma/plugin-typings" />

import { hexToRgb, getFontStyle } from '../color-utils';
import { getGradientTransform } from '../gradient-utils';
import { tryBindFillVariable, tryBindSpacingVariables } from './variable-binder';

export async function handleSetFill(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('fills' in node)) throw new Error(`Node ${nodeId} does not support fills`);

  let boundVariable: string | null = null;
  let solidHex: string | null = null;

  if (params.color) {
    const rgb = hexToRgb(params.color as string);
    const opacity = params.opacity as number | undefined;
    (node as GeometryMixin).fills = [{
      type: 'SOLID',
      color: rgb,
      opacity: opacity != null ? opacity : 1,
    }];
    solidHex = params.color as string;
  } else if (params.fills) {
    const fills = params.fills as Array<{ type: string; color?: string; opacity?: number; gradientStops?: Array<{ position: number; color: string; opacity?: number }>; gradientDirection?: string }>;
    const paintFills: Paint[] = [];

    for (const fill of fills) {
      if (fill.type === 'SOLID' && fill.color) {
        paintFills.push({
          type: 'SOLID',
          color: hexToRgb(fill.color),
          opacity: fill.opacity != null ? fill.opacity : 1,
        });
        // Only bind if there's a single solid fill
        if (fills.length === 1) solidHex = fill.color;
      } else if (fill.type === 'GRADIENT_LINEAR' && fill.gradientStops) {
        paintFills.push({
          type: 'GRADIENT_LINEAR',
          gradientTransform: getGradientTransform(fill.gradientDirection as any),
          gradientStops: fill.gradientStops.map(stop => ({
            position: stop.position,
            color: { ...hexToRgb(stop.color), a: stop.opacity != null ? stop.opacity : 1 },
          })),
        });
      }
    }

    (node as GeometryMixin).fills = paintFills;
  }

  // FN-8: Auto-bind COLOR variable if a solid fill was set
  if (solidHex && 'fills' in node) {
    try {
      const autoBindParam = params.autoBindVariables as boolean | undefined;
      const match = await tryBindFillVariable(node as SceneNode, solidHex, autoBindParam);
      if (match) {
        boundVariable = match.variableName;
      }
    } catch {
      // Binding failure is silent
    }
  }

  return { nodeId, success: true, boundVariable };
}

export async function handleSetStroke(params: Record<string, unknown>): Promise<Record<string, unknown>> {
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

export async function handleSetEffects(params: Record<string, unknown>): Promise<Record<string, unknown>> {
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

export async function handleSetCornerRadius(params: Record<string, unknown>): Promise<Record<string, unknown>> {
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

export async function handleSetOpacity(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('opacity' in node)) throw new Error(`Node ${nodeId} not found or does not support opacity`);

  (node as BlendMixin).opacity = (params.opacity as number) ?? 1;
  return { nodeId, success: true };
}

export async function handleSetAutoLayout(params: Record<string, unknown>): Promise<Record<string, unknown>> {
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

  if (params.primaryAxisSizingMode !== undefined) {
    const raw = params.primaryAxisSizingMode as string;
    frame.primaryAxisSizingMode = (raw === 'HUG' ? 'AUTO' : raw) as 'FIXED' | 'AUTO';
  }
  if (params.counterAxisSizingMode !== undefined) {
    const raw = params.counterAxisSizingMode as string;
    frame.counterAxisSizingMode = (raw === 'HUG' ? 'AUTO' : raw) as 'FIXED' | 'AUTO';
  }

  // FN-8: Auto-bind FLOAT spacing variables
  let boundSpacingVariables: Record<string, string> = {};
  if (mode !== 'NONE') {
    try {
      const autoBindParam = params.autoBindVariables as boolean | undefined;
      boundSpacingVariables = await tryBindSpacingVariables(frame, {
        paddingTop: params.paddingTop as number | undefined,
        paddingRight: params.paddingRight as number | undefined,
        paddingBottom: params.paddingBottom as number | undefined,
        paddingLeft: params.paddingLeft as number | undefined,
        itemSpacing: params.itemSpacing as number | undefined,
      }, autoBindParam);
    } catch {
      // Binding failure is silent
    }
  }

  return { nodeId, success: true, boundSpacingVariables };
}

export function handleFlipGradient(params: Record<string, unknown>): Record<string, unknown> {
  const nodeId = params.nodeId as string;
  if (!nodeId) return { success: false, error: 'nodeId is required' };

  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) return { success: false, error: `Node "${nodeId}" not found` };
  if (!('fills' in node)) return { success: false, error: `Node "${nodeId}" has no fills` };

  const fills = (node as GeometryMixin).fills;
  if (!Array.isArray(fills)) {
    return { success: false, error: 'Node has mixed fills (multi-selection not supported)' };
  }

  let flippedCount = 0;
  const newFills: Paint[] = fills.map(fill => {
    if (
      (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') &&
      fill.gradientStops?.length
    ) {
      flippedCount++;
      return {
        ...fill,
        gradientStops: fill.gradientStops.map(stop => ({
          ...stop,
          position: 1 - stop.position,
        })),
      } as Paint;
    }
    return fill;
  });

  (node as GeometryMixin).fills = newFills;
  return { success: true, nodeId, flippedCount };
}

export async function handleStyleTextRange(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (node.type !== 'TEXT') throw new Error(`Node ${nodeId} is not a text node (type: ${node.type})`);

  const textNode = node as TextNode;
  const ranges = params.ranges as Array<{
    start: number;
    end: number;
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    color?: string;
    letterSpacing?: number;
    lineHeight?: number;
    textDecoration?: string;
    textCase?: string;
  }>;

  if (!ranges || !Array.isArray(ranges) || ranges.length === 0) {
    throw new Error('ranges array is required and must not be empty');
  }

  const textLength = textNode.characters.length;
  let rangesApplied = 0;

  for (const range of ranges) {
    const { start, end } = range;

    if (start < 0 || end > textLength || start >= end) {
      throw new Error(`Invalid range [${start}, ${end}] — text length is ${textLength}`);
    }

    // Load the font currently at this range position before modifying
    const currentFont = textNode.getRangeFontName(start, start + 1) as FontName;
    try {
      await figma.loadFontAsync(currentFont);
    } catch (_e) {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    }

    if (range.fontFamily !== undefined || range.fontWeight !== undefined) {
      const family = range.fontFamily || currentFont.family;
      const style = range.fontWeight !== undefined ? getFontStyle(range.fontWeight) : currentFont.style;
      try {
        await figma.loadFontAsync({ family, style });
        textNode.setRangeFontName(start, end, { family, style });
      } catch (_e) {
        // If the exact style isn't available, try Regular
        try {
          await figma.loadFontAsync({ family, style: 'Regular' });
          textNode.setRangeFontName(start, end, { family, style: 'Regular' });
        } catch (_e2) {
          // Keep existing font if load fails entirely
        }
      }
    }

    if (range.fontSize !== undefined) {
      textNode.setRangeFontSize(start, end, range.fontSize);
    }

    if (range.color !== undefined) {
      const rgb = hexToRgb(range.color);
      textNode.setRangeFills(start, end, [{ type: 'SOLID', color: rgb }]);
    }

    if (range.letterSpacing !== undefined) {
      textNode.setRangeLetterSpacing(start, end, { value: range.letterSpacing, unit: 'PIXELS' });
    }

    if (range.lineHeight !== undefined) {
      textNode.setRangeLineHeight(start, end, { value: range.lineHeight, unit: 'PIXELS' });
    }

    if (range.textDecoration !== undefined) {
      textNode.setRangeTextDecoration(start, end, range.textDecoration as TextDecoration);
    }

    if (range.textCase !== undefined) {
      textNode.setRangeTextCase(start, end, range.textCase as TextCase);
    }

    rangesApplied++;
  }

  return { nodeId, rangesApplied, textLength };
}

export async function handleSetText(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (node.type !== 'TEXT') throw new Error(`Node ${nodeId} is not a text node`);

  const textNode = node as TextNode;
  const content = (params.text as string) || (params.content as string);
  if (!content) throw new Error('text content is required');

  const existingFont = textNode.fontName as FontName;
  try {
    await figma.loadFontAsync(existingFont);
  } catch (_e) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  }

  textNode.characters = content;
  return { nodeId, characters: textNode.characters };
}
