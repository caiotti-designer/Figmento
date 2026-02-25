/// <reference types="@figma/plugin-typings" />

/**
 * Element creation functions for converting UIElement definitions
 * into Figma SceneNode objects. Split from code.ts for maintainability.
 */

import { UIElement } from './types';
import { hexToRgb, getFontStyle, getFontStyleWithItalic } from './color-utils';
import { scalePathData } from './svg-utils';
import { getGradientTransform } from './gradient-utils';

// ═══════════════════════════════════════════════════════════════
// MAIN ELEMENT FACTORY
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a Figma node from a UIElement definition.
 * Delegates to type-specific creators, then applies common properties.
 * @param skipChildren - if true, children will be handled by caller (for progress tracking)
 */
export async function createElement(element: UIElement, skipChildren?: boolean): Promise<SceneNode | null> {
  let node: SceneNode;

  switch (element.type) {
    case 'frame':
    case 'button':
    case 'input':
    case 'card':
      node = createFrameNode(element);
      break;

    case 'rectangle':
      node = figma.createRectangle();
      break;

    case 'image':
      node = element.generatedImage
        ? await createImageFromBase64(element, element.generatedImage)
        : await createImagePlaceholder(element);
      break;

    case 'icon':
      node = await createIconPlaceholder(element);
      break;

    case 'text':
      node = figma.createText();
      await setupTextNode(node as TextNode, element);
      break;

    case 'ellipse':
      node = figma.createEllipse();
      break;

    default:
      node = figma.createRectangle();
  }

  applyCommonProperties(node, element);
  applyFills(node, element);
  applyStroke(node, element);
  applyEffects(node, element);
  applyLayoutProperties(node, element);

  // Handle children recursively (only for frame-like nodes, unless skipChildren is true)
  if (!skipChildren && element.children && element.children.length > 0 && 'appendChild' in node) {
    for (let k = 0; k < element.children.length; k++) {
      const childNode = await createElement(element.children[k]);
      if (childNode) {
        (node as FrameNode).appendChild(childNode);
      }
    }
  }

  return node;
}

// ═══════════════════════════════════════════════════════════════
// TYPE-SPECIFIC CREATORS
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a FrameNode with auto-layout configuration.
 */
function createFrameNode(element: UIElement): FrameNode {
  const frame = figma.createFrame();
  frame.clipsContent = element.clipsContent === true;

  // Only set fills if explicitly provided, otherwise keep transparent
  if (!element.fills || element.fills.length === 0) {
    frame.fills = [];
  }

  // Apply Auto Layout if specified
  if (element.layoutMode && element.layoutMode !== 'NONE') {
    frame.layoutMode = element.layoutMode;

    if (element.itemSpacing !== undefined) frame.itemSpacing = element.itemSpacing;
    if (element.paddingTop !== undefined) frame.paddingTop = element.paddingTop;
    if (element.paddingRight !== undefined) frame.paddingRight = element.paddingRight;
    if (element.paddingBottom !== undefined) frame.paddingBottom = element.paddingBottom;
    if (element.paddingLeft !== undefined) frame.paddingLeft = element.paddingLeft;

    if (element.primaryAxisAlignItems) frame.primaryAxisAlignItems = element.primaryAxisAlignItems;
    if (element.counterAxisAlignItems) frame.counterAxisAlignItems = element.counterAxisAlignItems;

    // Sizing mode: default to HUG (AUTO) unless explicitly set to FIXED
    frame.primaryAxisSizingMode = element.primaryAxisSizingMode === 'FIXED' ? 'FIXED' : 'AUTO';
    frame.counterAxisSizingMode = element.counterAxisSizingMode === 'FIXED' ? 'FIXED' : 'AUTO';
  }

  return frame;
}

/**
 * Creates an image node with actual image data from base64.
 */
async function createImageFromBase64(element: UIElement, base64Data: string): Promise<RectangleNode> {
  try {
    if (!base64Data || typeof base64Data !== 'string') {
      throw new Error('Invalid image data');
    }

    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const bytes = figma.base64Decode(base64);
    if (!bytes || bytes.length === 0) {
      throw new Error('Failed to decode image data');
    }

    const image = figma.createImage(bytes);
    const rect = figma.createRectangle();
    rect.name = element.name || 'Generated Image';
    rect.resize(Math.max(1, element.width), Math.max(1, element.height));
    rect.fills = [
      {
        type: 'IMAGE',
        imageHash: image.hash,
        scaleMode: element.scaleMode || 'FILL',
      },
    ];

    if (element.cornerRadius) {
      applyCornerRadius(rect, element.cornerRadius);
    }

    return rect;
  } catch (_error) {
    // Fall back to placeholder on error
    const placeholder = await createImagePlaceholder(element);
    return placeholder as unknown as RectangleNode;
  }
}

/**
 * Creates an image placeholder with a gray background and Lucide image icon.
 */
async function createImagePlaceholder(element: UIElement): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = element.name || 'Image Placeholder';
  frame.resize(Math.max(1, element.width), Math.max(1, element.height));
  frame.clipsContent = true;

  // Gray background #E0E0E0
  frame.fills = [{ type: 'SOLID', color: { r: 0.878, g: 0.878, b: 0.878 } }];

  if (element.cornerRadius) {
    applyCornerRadius(frame, element.cornerRadius);
  }

  // Add Lucide-style image icon in the center
  let iconSize = Math.min(element.width, element.height) * 0.25;
  iconSize = Math.max(16, Math.min(iconSize, 48));
  const iconX = (element.width - iconSize) / 2;
  const iconY = (element.height - iconSize) / 2;
  const iconColor = { r: 0.6, g: 0.6, b: 0.6 };
  const strokeWidth = Math.max(1.5, iconSize * 0.08);
  const scale = iconSize / 24;

  // Create icon container frame
  const iconFrame = figma.createFrame();
  iconFrame.name = 'Image Icon';
  iconFrame.resize(iconSize, iconSize);
  iconFrame.x = iconX;
  iconFrame.y = iconY;
  iconFrame.fills = [];
  iconFrame.clipsContent = false;

  // Draw rounded rectangle (image frame outline)
  const rectPath = 'M 5 3 L 19 3 C 20.1 3 21 3.9 21 5 L 21 19 C 21 20.1 20.1 21 19 21 L 5 21 C 3.9 21 3 20.1 3 19 L 3 5 C 3 3.9 3.9 3 5 3 Z';
  const rectVector = createStrokedVector(scalePathData(rectPath, scale), iconColor, strokeWidth);
  iconFrame.appendChild(rectVector);

  // Draw circle (sun) - at position 8.5, 8.5 with radius 1.5
  const circleSize = 3 * scale;
  const circle = figma.createEllipse();
  circle.resize(circleSize, circleSize);
  circle.x = 8.5 * scale - circleSize / 2;
  circle.y = 8.5 * scale - circleSize / 2;
  circle.fills = [];
  circle.strokes = [{ type: 'SOLID', color: iconColor }];
  circle.strokeWeight = strokeWidth;
  iconFrame.appendChild(circle);

  // Draw mountain polyline
  const mountainVector = createStrokedVector(scalePathData('M 21 15 L 16 10 L 5 21', scale), iconColor, strokeWidth);
  iconFrame.appendChild(mountainVector);

  frame.appendChild(iconFrame);
  return frame;
}

/**
 * Creates an icon using Lucide SVG paths or fallback shapes.
 */
async function createIconPlaceholder(element: UIElement): Promise<FrameNode> {
  const frame = figma.createFrame();
  const lucideIcon = element.lucideIcon || 'circle';
  const svgPaths = element.svgPaths as string[] | undefined;

  frame.name = 'icon-' + lucideIcon;
  frame.resize(Math.max(1, element.width), Math.max(1, element.height));
  frame.clipsContent = false;

  // Get icon color from fills or default to gray
  let iconColor = { r: 0.4, g: 0.4, b: 0.4 };
  if (element.fills && element.fills.length > 0 && element.fills[0].color) {
    iconColor = hexToRgb(element.fills[0].color);
  }

  frame.fills = [];
  const size = Math.min(element.width, element.height);
  const strokeWidth = Math.max(1.5, size * 0.08);

  // If we have pre-fetched SVG paths from Lucide, use them
  if (svgPaths && svgPaths.length > 0) {
    const scale = size / 24;
    for (let i = 0; i < svgPaths.length; i++) {
      const vector = createStrokedVector(scalePathData(svgPaths[i], scale), iconColor, strokeWidth);
      frame.appendChild(vector);
    }
    return frame;
  }

  // Fallback to basic shapes
  createFallbackIcon(frame, lucideIcon, size, iconColor, strokeWidth);
  return frame;
}

// ═══════════════════════════════════════════════════════════════
// PROPERTY APPLICATION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Applies common properties (name, position, dimensions, corner radius) to any node.
 */
function applyCommonProperties(node: SceneNode, element: UIElement): void {
  node.name = element.name || element.id || element.type || 'Element';

  if (element.x !== undefined) node.x = element.x;
  if (element.y !== undefined) node.y = element.y;

  // Set dimensions (skip for special nodes that already have size set)
  if ('resize' in node && element.type !== 'image' && element.type !== 'icon') {
    const w = typeof element.width === 'number' && !isNaN(element.width) ? element.width : 100;
    const h = typeof element.height === 'number' && !isNaN(element.height) ? element.height : 100;

    if (element.type === 'text') {
      (node as TextNode).resize(Math.max(1, w), (node as TextNode).height);
    } else {
      node.resize(Math.max(1, w), Math.max(1, h));
    }
  }

  // Set corner radius
  if (element.cornerRadius !== undefined && 'cornerRadius' in node) {
    applyCornerRadius(node as RectangleNode | FrameNode, element.cornerRadius);
  }

  // Set element-level opacity
  if (element.opacity !== undefined && 'opacity' in node) {
    (node as SceneNode & { opacity: number }).opacity = element.opacity;
  }
}

/**
 * Applies fill paints to shape nodes (not text, image, or icon nodes).
 */
function applyFills(node: SceneNode, element: UIElement): void {
  const isShape =
    element.type === 'rectangle' ||
    element.type === 'ellipse' ||
    element.type === 'frame' ||
    element.type === 'button' ||
    element.type === 'input' ||
    element.type === 'card';

  if (!('fills' in node) || !isShape || element.type === 'text' || element.type === 'image' || element.type === 'icon') {
    return;
  }

  if (element.fills && element.fills.length > 0) {
    const fills: Paint[] = [];
    for (let i = 0; i < element.fills.length; i++) {
      const fill = element.fills[i];
      if (fill.type === 'SOLID' && fill.color) {
        fills.push({
          type: 'SOLID' as const,
          color: hexToRgb(fill.color),
          opacity: fill.opacity != null ? fill.opacity : 1,
        });
      } else if (fill.type === 'GRADIENT_LINEAR' && fill.gradientStops) {
        const stops = fill.gradientStops;
        fills.push({
          type: 'GRADIENT_LINEAR' as const,
          gradientTransform: getGradientTransform(fill.gradientDirection),
          gradientStops: stops.map(function (stop) {
            const stopRgb = hexToRgb(stop.color);
            return {
              position: stop.position,
              color: { r: stopRgb.r, g: stopRgb.g, b: stopRgb.b, a: stop.opacity != null ? stop.opacity : 1 },
            };
          }),
        });
      }
    }
    if (fills.length > 0) {
      (node as GeometryMixin).fills = fills;
    }
  } else {
    (node as GeometryMixin).fills = [];
  }
}

/**
 * Applies stroke to a node (skip for icon/image frames).
 */
function applyStroke(node: SceneNode, element: UIElement): void {
  if (!element.stroke || !('strokes' in node) || element.type === 'icon' || element.type === 'image') return;

  (node as GeometryMixin).strokes = [
    {
      type: 'SOLID',
      color: hexToRgb(element.stroke.color),
    },
  ];
  (node as GeometryMixin).strokeWeight = element.stroke.width;
}

/**
 * Applies shadow effects to a node.
 */
function applyEffects(node: SceneNode, element: UIElement): void {
  if (!element.effects || element.effects.length === 0 || !('effects' in node)) return;

  const effects: Effect[] = [];
  for (let j = 0; j < element.effects.length; j++) {
    const effect = element.effects[j];
    const rgb = hexToRgb(effect.color);
    effects.push({
      type: effect.type as 'DROP_SHADOW' | 'INNER_SHADOW',
      color: { r: rgb.r, g: rgb.g, b: rgb.b, a: effect.opacity != null ? effect.opacity : 0.25 },
      offset: { x: effect.offset.x, y: effect.offset.y },
      radius: effect.blur,
      spread: effect.spread || 0,
      visible: true,
      blendMode: 'NORMAL' as const,
    });
  }
  (node as BlendMixin).effects = effects;
}

/**
 * Applies layout positioning and sizing properties for auto-layout children.
 */
function applyLayoutProperties(node: SceneNode, element: UIElement): void {
  if (element.layoutPositioning === 'ABSOLUTE' && 'layoutPositioning' in node) {
    try {
      (node as FrameNode).layoutPositioning = 'ABSOLUTE';
    } catch (_e) {
      /* parent may not have auto-layout */
    }
  }

  if (element.layoutSizingHorizontal && 'layoutSizingHorizontal' in node) {
    try {
      (node as FrameNode).layoutSizingHorizontal = element.layoutSizingHorizontal;
    } catch (_e) {
      /* parent may not be auto-layout */
    }
  }
  if (element.layoutSizingVertical && 'layoutSizingVertical' in node) {
    try {
      (node as FrameNode).layoutSizingVertical = element.layoutSizingVertical;
    } catch (_e) {
      /* parent may not be auto-layout */
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// TEXT NODE SETUP
// ═══════════════════════════════════════════════════════════════

/**
 * Sets up a text node with proper font loading and styling.
 */
async function setupTextNode(node: TextNode, element: UIElement): Promise<void> {
  if (!element.text) return;

  const fontFamily = element.text.fontFamily || 'Inter';
  const isItalic = element.text.italic === true;
  const baseFontStyle = getFontStyleWithItalic(element.text.fontWeight || 400, isItalic);
  let loadedFamily = fontFamily;
  let loadedStyle = baseFontStyle;

  // Try to load the specified font with fallback chain (5s timeout per attempt)
  const loadFont = (family: string, style: string): Promise<void> =>
    Promise.race([
      figma.loadFontAsync({ family, style }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Font load timeout')), 5000)),
    ]);

  try {
    await loadFont(fontFamily, baseFontStyle);
    node.fontName = { family: fontFamily, style: baseFontStyle };
  } catch (_e) {
    // If italic variant failed, try non-italic of same weight
    if (isItalic) {
      try {
        const nonItalicStyle = getFontStyle(element.text.fontWeight || 400);
        await loadFont(fontFamily, nonItalicStyle);
        node.fontName = { family: fontFamily, style: nonItalicStyle };
        loadedStyle = nonItalicStyle;
      } catch (_e1b) {
        try {
          await loadFont('Inter', 'Regular');
          node.fontName = { family: 'Inter', style: 'Regular' };
          loadedFamily = 'Inter';
          loadedStyle = 'Regular';
        } catch (_e2) {
          await loadFont('Roboto', 'Regular');
          node.fontName = { family: 'Roboto', style: 'Regular' };
          loadedFamily = 'Roboto';
          loadedStyle = 'Regular';
        }
      }
    } else {
      try {
        await loadFont('Inter', 'Regular');
        node.fontName = { family: 'Inter', style: 'Regular' };
        loadedFamily = 'Inter';
        loadedStyle = 'Regular';
      } catch (_e2) {
        await loadFont('Roboto', 'Regular');
        node.fontName = { family: 'Roboto', style: 'Regular' };
        loadedFamily = 'Roboto';
        loadedStyle = 'Regular';
      }
    }
  }

  node.characters = element.text.content;
  node.fontSize = element.text.fontSize;

  // Apply per-segment styling for mixed-weight text
  if (element.text.segments && element.text.segments.length > 0) {
    await applyTextSegments(node, element.text, loadedFamily);
  }

  // Apply top-level text decorations (underline/strikethrough) to entire text
  const fullLen = node.characters.length;
  if (fullLen > 0) {
    if (element.text.underline) {
      try { node.setRangeTextDecoration(0, fullLen, 'UNDERLINE'); } catch (_e) { /* skip */ }
    }
    if (element.text.strikethrough) {
      try { node.setRangeTextDecoration(0, fullLen, 'STRIKETHROUGH'); } catch (_e) { /* skip */ }
    }
  }

  node.textAutoResize = 'HEIGHT';

  // Set text color
  node.fills = [{ type: 'SOLID', color: hexToRgb(element.text.color) }];

  if (element.text.textAlign) {
    node.textAlignHorizontal = element.text.textAlign;
  }

  if (element.text.lineHeight && typeof element.text.lineHeight === 'number') {
    // Values ≤ 3 are treated as multipliers (e.g. 1.5 → 1.5 × fontSize px).
    // Values > 3 are already in pixels and used as-is.
    const lhValue = element.text.lineHeight <= 3
      ? element.text.lineHeight * element.text.fontSize
      : element.text.lineHeight;
    node.lineHeight = { value: lhValue, unit: 'PIXELS' };
  }

  if (element.text.letterSpacing !== undefined && element.text.letterSpacing !== 0) {
    node.letterSpacing = { value: element.text.letterSpacing, unit: 'PIXELS' };
  }
}

/**
 * Applies per-segment font styling (weight, size, color) to character ranges.
 */
async function applyTextSegments(
  node: TextNode,
  textProps: {
    content: string;
    fontWeight: number;
    fontSize: number;
    color: string;
    italic?: boolean;
    segments?: { text: string; fontWeight?: number; fontSize?: number; color?: string; italic?: boolean; underline?: boolean; strikethrough?: boolean }[];
  },
  resolvedFamily: string
): Promise<void> {
  const segments = textProps.segments!;
  const content = textProps.content;

  // Validate: concatenated segment texts should equal content
  let concatenated = '';
  for (let i = 0; i < segments.length; i++) {
    concatenated += segments[i].text;
  }
  if (concatenated !== content) return;

  // Collect unique font styles and pre-load them (including italic variants)
  const stylesToLoad: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segWeight = segments[i].fontWeight !== undefined ? segments[i].fontWeight! : textProps.fontWeight;
    const segItalic = segments[i].italic !== undefined ? segments[i].italic : textProps.italic;
    const style = getFontStyleWithItalic(segWeight, segItalic);
    if (stylesToLoad.indexOf(style) === -1) {
      stylesToLoad.push(style);
    }
    // Also load non-italic variant as fallback
    if (segItalic) {
      const nonItalic = getFontStyle(segWeight);
      if (stylesToLoad.indexOf(nonItalic) === -1) {
        stylesToLoad.push(nonItalic);
      }
    }
  }

  // Load all font variants (best-effort)
  for (let i = 0; i < stylesToLoad.length; i++) {
    try {
      await figma.loadFontAsync({ family: resolvedFamily, style: stylesToLoad[i] });
    } catch (_e) {
      // Variant unavailable — skip
    }
  }

  // Apply per-segment styling
  let offset = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const start = offset;
    const end = offset + seg.text.length;

    // Determine font style for this segment (weight + italic)
    const segWeight = seg.fontWeight !== undefined ? seg.fontWeight : textProps.fontWeight;
    const segItalic = seg.italic !== undefined ? seg.italic : textProps.italic;
    const targetStyle = getFontStyleWithItalic(segWeight, segItalic);
    const baseStyle = getFontStyleWithItalic(textProps.fontWeight, textProps.italic);

    if (targetStyle !== baseStyle) {
      try {
        node.setRangeFontName(start, end, { family: resolvedFamily, style: targetStyle });
      } catch (_e) {
        // Italic variant may not exist — try non-italic fallback
        if (segItalic) {
          try {
            node.setRangeFontName(start, end, { family: resolvedFamily, style: getFontStyle(segWeight) });
          } catch (_e2) { /* skip */ }
        }
      }
    }

    if (seg.fontSize !== undefined && seg.fontSize !== textProps.fontSize) {
      try {
        node.setRangeFontSize(start, end, seg.fontSize);
      } catch (_e) {
        /* skip */
      }
    }

    if (seg.color !== undefined && seg.color !== textProps.color) {
      try {
        node.setRangeFills(start, end, [{ type: 'SOLID', color: hexToRgb(seg.color) }]);
      } catch (_e) {
        /* skip */
      }
    }

    // Per-segment text decorations
    if (seg.underline) {
      try { node.setRangeTextDecoration(start, end, 'UNDERLINE'); } catch (_e) { /* skip */ }
    }
    if (seg.strikethrough) {
      try { node.setRangeTextDecoration(start, end, 'STRIKETHROUGH'); } catch (_e) { /* skip */ }
    }

    offset = end;
  }
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Applies corner radius to a node (supports uniform or per-corner values).
 */
function applyCornerRadius(node: RectangleNode | FrameNode, cornerRadius: number | [number, number, number, number]): void {
  if (Array.isArray(cornerRadius)) {
    node.topLeftRadius = cornerRadius[0];
    node.topRightRadius = cornerRadius[1];
    node.bottomRightRadius = cornerRadius[2];
    node.bottomLeftRadius = cornerRadius[3];
  } else {
    node.cornerRadius = cornerRadius;
  }
}

/**
 * Creates a stroked vector path for icon rendering.
 */
function createStrokedVector(
  pathData: string,
  color: { r: number; g: number; b: number },
  strokeWidth: number
): VectorNode {
  const vector = figma.createVector();
  vector.vectorPaths = [{ windingRule: 'NONZERO', data: pathData }];
  vector.strokes = [{ type: 'SOLID', color }];
  vector.strokeWeight = strokeWidth;
  vector.strokeCap = 'ROUND';
  vector.strokeJoin = 'ROUND';
  vector.fills = [];
  return vector;
}

/**
 * Creates fallback icon shapes when SVG paths are unavailable.
 */
function createFallbackIcon(
  frame: FrameNode,
  iconName: string,
  size: number,
  iconColor: { r: number; g: number; b: number },
  strokeWidth: number
): void {
  switch (iconName) {
    case 'check': {
      const path =
        'M ' + size * 0.15 + ' ' + size * 0.5 +
        ' L ' + size * 0.4 + ' ' + size * 0.75 +
        ' L ' + size * 0.85 + ' ' + size * 0.25;
      frame.appendChild(createStrokedVector(path, iconColor, strokeWidth));
      break;
    }

    case 'x':
    case 'close': {
      const p = size * 0.2;
      const path =
        'M ' + p + ' ' + p + ' L ' + (size - p) + ' ' + (size - p) +
        ' M ' + (size - p) + ' ' + p + ' L ' + p + ' ' + (size - p);
      const vector = createStrokedVector(path, iconColor, strokeWidth);
      vector.strokeCap = 'ROUND';
      frame.appendChild(vector);
      break;
    }

    case 'chevron-right': {
      const path =
        'M ' + size * 0.35 + ' ' + size * 0.2 +
        ' L ' + size * 0.65 + ' ' + size * 0.5 +
        ' L ' + size * 0.35 + ' ' + size * 0.8;
      frame.appendChild(createStrokedVector(path, iconColor, strokeWidth));
      break;
    }

    case 'chevron-down': {
      const path =
        'M ' + size * 0.2 + ' ' + size * 0.35 +
        ' L ' + size * 0.5 + ' ' + size * 0.65 +
        ' L ' + size * 0.8 + ' ' + size * 0.35;
      frame.appendChild(createStrokedVector(path, iconColor, strokeWidth));
      break;
    }

    default: {
      const circle = figma.createEllipse();
      circle.resize(size * 0.8, size * 0.8);
      circle.x = size * 0.1;
      circle.y = size * 0.1;
      circle.fills = [];
      circle.strokes = [{ type: 'SOLID', color: iconColor }];
      circle.strokeWeight = strokeWidth;
      frame.appendChild(circle);
    }
  }
}
