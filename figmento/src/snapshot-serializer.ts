/**
 * snapshot-serializer.ts
 *
 * Converts Figma sandbox nodes to the serializable NodeSnapshot format.
 * Runs inside the Figma plugin sandbox (has access to Figma Plugin API).
 *
 * Key constraints:
 * - Depth-1 only: root frame + direct children, no recursion
 * - Handles figma.mixed gracefully on cornerRadius, fontSize, fontName
 * - Color: SolidPaint RGB (0-1) → hex string. Non-solid → { type } only
 */

/// <reference types="@figma/plugin-typings" />

import type { NodeSnapshot, SerializedFill, SerializedEffect } from './types';

// ── Color conversion ──────────────────────────────────────────────────────────

function componentToHex(c: number): string {
  const hex = Math.round(c * 255).toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

// ── Fill serialization ────────────────────────────────────────────────────────

function serializeFills(fills: readonly Paint[] | typeof figma.mixed): SerializedFill[] {
  if (fills === figma.mixed || !fills) return [];
  return fills.map(fill => {
    if (fill.type === 'SOLID') {
      return {
        type: 'SOLID',
        color: rgbToHex(fill.color.r, fill.color.g, fill.color.b),
        opacity: fill.opacity ?? 1,
      };
    }
    return { type: fill.type };
  });
}

// ── Effect serialization ──────────────────────────────────────────────────────

function serializeEffects(effects: readonly Effect[]): SerializedEffect[] {
  if (!effects) return [];
  return effects.map(effect => {
    const out: SerializedEffect = { type: effect.type };
    if ('color' in effect && effect.color) {
      out.color = rgbToHex(effect.color.r, effect.color.g, effect.color.b);
    }
    if ('offset' in effect && effect.offset) {
      out.offset = { x: effect.offset.x, y: effect.offset.y };
    }
    if ('radius' in effect) {
      out.radius = effect.radius;
    }
    return out;
  });
}

// ── Node serialization ────────────────────────────────────────────────────────

export function serializeNode(node: SceneNode): NodeSnapshot {
  const snapshot: NodeSnapshot = {
    id: node.id,
    name: node.name,
    type: node.type as NodeSnapshot['type'],
    x: 'x' in node ? node.x : 0,
    y: 'y' in node ? node.y : 0,
    width: 'width' in node ? node.width : 0,
    height: 'height' in node ? node.height : 0,
    fills: 'fills' in node ? serializeFills(node.fills as readonly Paint[] | typeof figma.mixed) : [],
    opacity: 'opacity' in node ? node.opacity : 1,
  };

  // Corner radius — handle figma.mixed
  if ('cornerRadius' in node) {
    const cr = node.cornerRadius;
    if (cr === figma.mixed) {
      snapshot.cornerRadius = 'topLeftRadius' in node ? (node as RectangleNode).topLeftRadius : 0;
    } else {
      snapshot.cornerRadius = cr as number;
    }
  }

  // Stroke
  if ('strokeWeight' in node && node.strokeWeight !== figma.mixed) {
    snapshot.strokeWeight = node.strokeWeight as number;
  }
  if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    if (stroke.type === 'SOLID') {
      snapshot.strokeColor = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
    }
  }

  // Effects
  if ('effects' in node && node.effects) {
    snapshot.effects = serializeEffects(node.effects);
  }

  // Layout (FRAME and COMPONENT nodes)
  if ('layoutMode' in node) {
    snapshot.layoutMode = node.layoutMode as 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    snapshot.itemSpacing = node.itemSpacing;
    snapshot.paddingTop = node.paddingTop;
    snapshot.paddingRight = node.paddingRight;
    snapshot.paddingBottom = node.paddingBottom;
    snapshot.paddingLeft = node.paddingLeft;
  }

  // Text-specific properties
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;

    // fontSize — handle figma.mixed
    const fs = textNode.fontSize;
    snapshot.fontSize = fs === figma.mixed ? textNode.getRangeFontSize(0, 1) as number : fs;

    // fontName — handle figma.mixed
    const fn = textNode.fontName;
    const resolvedFont = fn === figma.mixed ? textNode.getRangeFontName(0, 1) as FontName : fn;
    snapshot.fontFamily = resolvedFont.family;
    // Map style string to weight
    snapshot.fontWeight = fontStyleToWeight(resolvedFont.style);

    // lineHeight
    const lh = textNode.lineHeight;
    if (lh !== figma.mixed && lh.unit === 'PIXELS') {
      snapshot.lineHeight = lh.value;
    }

    // letterSpacing
    const ls = textNode.letterSpacing;
    if (ls !== figma.mixed) {
      snapshot.letterSpacing = ls.unit === 'PERCENT' ? ls.value / 100 : ls.value;
    }

    snapshot.characters = textNode.characters;
  }

  return snapshot;
}

/**
 * Capture a frame and all its direct children (depth 1).
 * Returns [rootSnapshot, ...childSnapshots].
 */
export function serializeFrame(frame: FrameNode | ComponentNode): NodeSnapshot[] {
  const result: NodeSnapshot[] = [];

  // Root frame snapshot
  result.push(serializeNode(frame));

  // Direct children only — no recursion
  for (const child of frame.children) {
    result.push(serializeNode(child));
  }

  return result;
}

// ── Font style → weight mapping ───────────────────────────────────────────────

function fontStyleToWeight(style: string): number {
  const lower = style.toLowerCase();
  if (lower.includes('thin')) return 100;
  if (lower.includes('extralight') || lower.includes('extra light') || lower.includes('ultralight')) return 200;
  if (lower.includes('light')) return 300;
  if (lower.includes('medium')) return 500;
  if (lower.includes('semibold') || lower.includes('semi bold') || lower.includes('demibold')) return 600;
  if (lower.includes('extrabold') || lower.includes('extra bold') || lower.includes('ultrabold')) return 800;
  if (lower.includes('black') || lower.includes('heavy')) return 900;
  if (lower.includes('bold')) return 700;
  return 400; // Regular / Normal
}
