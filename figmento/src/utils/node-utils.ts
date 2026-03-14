/// <reference types="@figma/plugin-typings" />

import { rgbToHex } from '../color-utils';

export function serializeNode(node: BaseNode, currentDepth: number, maxDepth: number): Record<string, unknown> {
  const info: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if ('x' in node) info.x = (node as SceneNode).x;
  if ('y' in node) info.y = (node as SceneNode).y;
  if ('width' in node) info.width = (node as SceneNode).width;
  if ('height' in node) info.height = (node as SceneNode).height;
  if ('opacity' in node) info.opacity = (node as BlendMixin).opacity;

  if ('fills' in node && Array.isArray((node as GeometryMixin).fills)) {
    const fills = (node as GeometryMixin).fills as Paint[];
    info.fills = fills.map(f => {
      if (f.type === 'SOLID') {
        return { type: 'SOLID', color: rgbToHex(f.color), opacity: f.opacity };
      }
      return { type: f.type };
    });
  }

  if ('cornerRadius' in node) info.cornerRadius = (node as RectangleNode).cornerRadius;

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    info.characters = textNode.characters;
    info.fontSize = textNode.fontSize;
    const fontName = textNode.fontName;
    if (fontName && typeof fontName === 'object' && 'family' in fontName) {
      info.fontFamily = fontName.family;
      info.fontWeight = fontName.style;
    }
  }

  if ('layoutMode' in node) {
    const frame = node as FrameNode;
    info.layoutMode = frame.layoutMode;
    if (frame.layoutMode !== 'NONE') {
      info.itemSpacing = frame.itemSpacing;
      info.paddingLeft = frame.paddingLeft;
      info.paddingRight = frame.paddingRight;
      info.paddingTop = frame.paddingTop;
      info.paddingBottom = frame.paddingBottom;
    }
  }

  if ('children' in node) {
    const children = (node as FrameNode).children;
    info.childCount = children.length;
    if (currentDepth < maxDepth) {
      info.children = children.map(c => serializeNode(c, currentDepth + 1, maxDepth));
    } else {
      info.children = children.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
      }));
    }
  }

  return info;
}

export function findChildByName(node: BaseNode, name: string): SceneNode | null {
  if ('children' in node) {
    for (const child of (node as FrameNode).children) {
      if (child.name === name) return child;
      const found = findChildByName(child, name);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Walk up the parent chain to find the top-level frame on the page.
 * Returns the frame, or null if the node doesn't exist or isn't in a frame.
 */
export function findRootFrame(nodeId: string): FrameNode | null {
  const node = figma.getNodeById(nodeId);
  if (!node) return null;

  let current: BaseNode = node;
  while (current.parent && current.parent.type !== 'PAGE') {
    current = current.parent;
  }

  if (current.type === 'FRAME' && current.parent?.type === 'PAGE') {
    return current as FrameNode;
  }
  return null;
}
