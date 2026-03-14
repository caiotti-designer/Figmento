/// <reference types="@figma/plugin-typings" />

import type { UIElement, TextProperties } from '../types';
import { hexToRgb } from '../color-utils';
import { createElement } from '../element-creators';

export async function handleCreateFrame(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const frameFills: UIElement['fills'] = params.fills as UIElement['fills'] | undefined
    ?? (params.fillColor ? [{ type: 'SOLID' as const, color: params.fillColor as string }] : undefined);

  const element: UIElement = {
    id: 'frame',
    type: 'frame',
    name: (params.name as string) || 'Frame',
    width: (params.width as number) || 100,
    height: (params.height as number) || 100,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    fills: frameFills,
    layoutMode: params.layoutMode as UIElement['layoutMode'] | undefined,
    itemSpacing: params.itemSpacing as number | undefined,
    paddingTop: params.paddingTop as number | undefined,
    paddingRight: params.paddingRight as number | undefined,
    paddingBottom: params.paddingBottom as number | undefined,
    paddingLeft: params.paddingLeft as number | undefined,
    primaryAxisAlignItems: params.primaryAxisAlignItems as UIElement['primaryAxisAlignItems'] | undefined,
    counterAxisAlignItems: params.counterAxisAlignItems as UIElement['counterAxisAlignItems'] | undefined,
    primaryAxisSizingMode: params.primaryAxisSizingMode as UIElement['primaryAxisSizingMode'] | undefined,
    counterAxisSizingMode: params.counterAxisSizingMode as UIElement['counterAxisSizingMode'] | undefined,
    cornerRadius: params.cornerRadius as UIElement['cornerRadius'] | undefined,
    clipsContent: params.clipsContent as boolean | undefined,
    layoutSizingHorizontal: params.layoutSizingHorizontal as UIElement['layoutSizingHorizontal'] | undefined,
    layoutSizingVertical: params.layoutSizingVertical as UIElement['layoutSizingVertical'] | undefined,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create frame');

  const needsResizing = params.parentId && (element.layoutSizingHorizontal || element.layoutSizingVertical);

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  } else {
    if (element.x === undefined && element.y === undefined) {
      const center = figma.viewport.center;
      node.x = center.x - element.width / 2;
      node.y = center.y - element.height / 2;
    }
  }

  if (needsResizing && 'layoutSizingHorizontal' in node) {
    try {
      if (element.layoutSizingHorizontal) {
        (node as FrameNode).layoutSizingHorizontal = element.layoutSizingHorizontal;
      }
      if (element.layoutSizingVertical) {
        (node as FrameNode).layoutSizingVertical = element.layoutSizingVertical;
      }
    } catch { /* parent may not be auto-layout */ }
  }

  figma.currentPage.selection = [node];
  return { nodeId: node.id, name: node.name };
}

export async function handleCreateText(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const textContent = (params.text as string) || (params.content as string) || '';
  if (!textContent || textContent.trim().length === 0) {
    throw new Error('Text content is required and cannot be empty. Provide a non-empty "text" parameter.');
  }

  const textColor = (params.color as string) || (params.fillColor as string) || '#000000';
  const textAlign = (params.textAlign || params.textAlignHorizontal) as TextProperties['textAlign'] | undefined;

  let layoutSizingH = params.layoutSizingHorizontal as UIElement['layoutSizingHorizontal'] | undefined;
  let layoutSizingV = params.layoutSizingVertical as UIElement['layoutSizingVertical'] | undefined;

  if (layoutSizingH === 'FILL' && params.width != null) {
    layoutSizingH = 'FIXED';
  }

  if (!layoutSizingH && !layoutSizingV && params.parentId) {
    const potentialParent = figma.getNodeById(params.parentId as string);
    if (potentialParent && 'layoutMode' in potentialParent &&
        (potentialParent as FrameNode).layoutMode !== 'NONE') {
      layoutSizingH = 'FILL';
      layoutSizingV = 'HUG';
    }
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
      color: textColor,
      textAlign,
      lineHeight: params.lineHeight as number | undefined,
      letterSpacing: params.letterSpacing as number | undefined,
      italic: params.italic as boolean | undefined,
      underline: params.underline as boolean | undefined,
      strikethrough: params.strikethrough as boolean | undefined,
      segments: params.segments as TextProperties['segments'] | undefined,
    },
    layoutSizingHorizontal: layoutSizingH,
    layoutSizingVertical: layoutSizingV,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create text');

  // Belt-and-suspenders: re-apply fill after createElement in case setupTextNode
  // lost it during segment application or font fallback. Ensures fillColor always persists.
  if ('fills' in node) {
    try {
      (node as TextNode).fills = [{ type: 'SOLID', color: hexToRgb(textColor), opacity: 1 }];
    } catch { /* ignore — best effort */ }
  }

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
    if (layoutSizingH && 'layoutSizingHorizontal' in node) {
      try { (node as any).layoutSizingHorizontal = layoutSizingH; } catch { /* ignore */ }
    }
    if (layoutSizingV && 'layoutSizingVertical' in node) {
      try { (node as any).layoutSizingVertical = layoutSizingV; } catch { /* ignore */ }
    }
  }

  return { nodeId: node.id, name: node.name };
}

export async function handleCreateRectangle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
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

export async function handleCreateEllipse(params: Record<string, unknown>): Promise<Record<string, unknown>> {
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

export async function handleCreateImage(params: Record<string, unknown>): Promise<Record<string, unknown>> {
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
    scaleMode: (params.scaleMode as UIElement['scaleMode']) || 'FILL',
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create image');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      const parentFrame = parent as FrameNode;
      parentFrame.appendChild(node);

      if ('layoutMode' in parentFrame && parentFrame.layoutMode !== 'NONE') {
        // Auto-layout parent: stretch image to fill via layout sizing
        (node as RectangleNode).layoutSizingHorizontal = 'FILL';
        (node as RectangleNode).layoutSizingVertical = 'FILL';
      } else {
        // No auto-layout: resize image to match parent dimensions (full-bleed)
        (node as RectangleNode).resize(parentFrame.width, parentFrame.height);
        (node as RectangleNode).x = 0;
        (node as RectangleNode).y = 0;
      }
    }
  }

  return { nodeId: node.id, name: node.name };
}

export async function handleCreateIcon(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const iconName = (params.iconName as string) || 'circle';
  const size = (params.size as number) || 24;
  const color = (params.color as string) || '#333333';
  const strokeWidth = (params.strokeWidth as number) || 2;
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
    strokeWeight: strokeWidth,
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
