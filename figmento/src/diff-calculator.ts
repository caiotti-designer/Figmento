/**
 * diff-calculator.ts
 *
 * Pure function module for comparing two depth-1 node snapshots and returning
 * a list of corrections (changes that exceed minimum delta thresholds).
 *
 * Zero Figma API dependencies — fully unit-testable outside the sandbox.
 */

import type { NodeSnapshot, CorrectionEntry, SerializedFill } from './types';

// ═══════════════════════════════════════════════════════════════
// DELTA THRESHOLDS (PRD-004 §C4)
// ═══════════════════════════════════════════════════════════════

export const DELTA_THRESHOLDS = {
  width: 8,
  height: 8,
  x: 8,
  y: 8,
  fontSize: 2,
  /** Sum of per-channel absolute diffs in 0–255 scale */
  colorChannelSum: 30,
  cornerRadius: 2,
  opacity: 0.05,
  fontWeight: 100,
  itemSpacing: 4,
  paddingTop: 4,
  paddingRight: 4,
  paddingBottom: 4,
  paddingLeft: 4,
  letterSpacing: 0.01,
  lineHeight: 2,
} as const;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a hex color string to 0–255 RGB integers.
 * Returns null if the string is not a valid hex color.
 */
function parseHex255(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || typeof hex !== 'string') return null;
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const m = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(clean);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

/**
 * Compare two fill arrays and return the channel-sum delta of the first
 * solid fill that changed, or -1 if no significant change detected.
 */
function colorDelta(before: SerializedFill[], after: SerializedFill[]): number {
  // Compare first fill's color only (solid fill case)
  const bFill = before.find(f => f.color);
  const aFill = after.find(f => f.color);
  if (!bFill?.color || !aFill?.color) return -1;
  if (bFill.color === aFill.color) return -1;
  const bRgb = parseHex255(bFill.color);
  const aRgb = parseHex255(aFill.color);
  if (!bRgb || !aRgb) return -1;
  return Math.abs(aRgb.r - bRgb.r) + Math.abs(aRgb.g - bRgb.g) + Math.abs(aRgb.b - bRgb.b);
}

/**
 * Map a property name to its correction category.
 */
export function categorizeProperty(
  property: string
): 'typography' | 'color' | 'spacing' | 'shape' {
  if (['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing'].includes(property)) {
    return 'typography';
  }
  if (property === 'fills' || property === 'opacity') {
    return 'color';
  }
  if (property === 'itemSpacing' || property.startsWith('padding')) {
    return 'spacing';
  }
  return 'shape'; // cornerRadius, strokeWeight, x, y, width, height
}

/**
 * Infer the hierarchy context of a node from its name and type.
 * Used to scope preferences (e.g. "headline fontSize" vs "body fontSize").
 */
export function inferContext(node: NodeSnapshot): string {
  const nameLower = node.name.toLowerCase();

  if (/hero|display/.test(nameLower)) return 'display';
  // Check h2 before h1: "subheading" contains "heading" so h2 must run first
  if (/subheading|subtitle|sub(?!line)|h2/.test(nameLower)) return 'h2';
  if (/heading|title|h1/.test(nameLower)) return 'h1';
  if (/body|paragraph|description|content/.test(nameLower)) return 'body';
  if (/caption|label|note|tag|badge/.test(nameLower)) return 'caption';
  if (/card/.test(nameLower)) return 'card';

  // FRAME with auto-layout = section
  if (node.type === 'FRAME' && node.layoutMode && node.layoutMode !== 'NONE') {
    return 'section';
  }

  return 'root-frame';
}

/**
 * Generate a simple unique ID suitable for local clientStorage.
 * (Figma sandbox has no crypto.randomUUID.)
 */
function generateId(): string {
  return `correction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════════
// MAIN: calculateDiff
// ═══════════════════════════════════════════════════════════════

/**
 * Compare two depth-1 snapshot arrays (before vs after) and return a list of
 * CorrectionEntry objects for changes that exceed the minimum delta thresholds.
 *
 * - Additions and deletions are NOT returned as corrections (they are skipped).
 * - Only property changes on nodes present in both snapshots are evaluated.
 */
export function calculateDiff(
  before: NodeSnapshot[],
  after: NodeSnapshot[]
): CorrectionEntry[] {
  const corrections: CorrectionEntry[] = [];

  // Build a lookup map for before nodes
  const beforeMap = new Map<string, NodeSnapshot>();
  for (const node of before) {
    beforeMap.set(node.id, node);
  }

  // Root frame id: first node in the before array with no layoutMode or with one
  // (the first element is always the root when depth-1 is used)
  const rootFrameId = before[0]?.id ?? after[0]?.id ?? '';

  for (const afterNode of after) {
    const beforeNode = beforeMap.get(afterNode.id);

    // Node added since snapshot — skip (not a correction)
    if (!beforeNode) continue;

    const context = inferContext(afterNode);

    type NumericProp = keyof typeof DELTA_THRESHOLDS;

    // ── Numeric properties ──────────────────────────────────────
    const numericProps: Array<{ key: keyof NodeSnapshot; thresholdKey: NumericProp }> = [
      { key: 'width', thresholdKey: 'width' },
      { key: 'height', thresholdKey: 'height' },
      { key: 'x', thresholdKey: 'x' },
      { key: 'y', thresholdKey: 'y' },
      { key: 'fontSize', thresholdKey: 'fontSize' },
      { key: 'cornerRadius', thresholdKey: 'cornerRadius' },
      { key: 'opacity', thresholdKey: 'opacity' },
      { key: 'fontWeight', thresholdKey: 'fontWeight' },
      { key: 'itemSpacing', thresholdKey: 'itemSpacing' },
      { key: 'paddingTop', thresholdKey: 'paddingTop' },
      { key: 'paddingRight', thresholdKey: 'paddingRight' },
      { key: 'paddingBottom', thresholdKey: 'paddingBottom' },
      { key: 'paddingLeft', thresholdKey: 'paddingLeft' },
      { key: 'letterSpacing', thresholdKey: 'letterSpacing' },
      { key: 'lineHeight', thresholdKey: 'lineHeight' },
      { key: 'strokeWeight', thresholdKey: 'cornerRadius' }, // reuse shape threshold = 2
    ];

    for (const { key, thresholdKey } of numericProps) {
      const bVal = beforeNode[key] as number | undefined;
      const aVal = afterNode[key] as number | undefined;

      // Both must be defined and differ
      if (bVal === undefined || aVal === undefined) continue;
      if (bVal === aVal) continue;

      const threshold = DELTA_THRESHOLDS[thresholdKey];
      const delta = Math.abs(aVal - bVal);

      if (delta < threshold) continue;

      corrections.push({
        id: generateId(),
        frameId: rootFrameId,
        nodeId: afterNode.id,
        nodeName: afterNode.name,
        nodeType: afterNode.type,
        property: key,
        category: categorizeProperty(key),
        context,
        beforeValue: bVal,
        afterValue: aVal,
        direction: aVal > bVal ? 'increase' : 'decrease',
        magnitude: delta,
        timestamp: Date.now(),
        confirmed: false,
      });
    }

    // ── Color (fills) ────────────────────────────────────────────
    if (beforeNode.fills && afterNode.fills) {
      const delta = colorDelta(beforeNode.fills, afterNode.fills);
      if (delta >= DELTA_THRESHOLDS.colorChannelSum) {
        const bColor = beforeNode.fills.find(f => f.color)?.color ?? '';
        const aColor = afterNode.fills.find(f => f.color)?.color ?? '';
        corrections.push({
          id: generateId(),
          frameId: rootFrameId,
          nodeId: afterNode.id,
          nodeName: afterNode.name,
          nodeType: afterNode.type,
          property: 'fills',
          category: 'color',
          context,
          beforeValue: bColor,
          afterValue: aColor,
          direction: 'change',
          magnitude: delta,
          timestamp: Date.now(),
          confirmed: false,
        });
      }
    }

    // ── fontFamily (string, non-numeric) ─────────────────────────
    if (
      beforeNode.fontFamily !== undefined &&
      afterNode.fontFamily !== undefined &&
      beforeNode.fontFamily !== afterNode.fontFamily
    ) {
      corrections.push({
        id: generateId(),
        frameId: rootFrameId,
        nodeId: afterNode.id,
        nodeName: afterNode.name,
        nodeType: afterNode.type,
        property: 'fontFamily',
        category: 'typography',
        context,
        beforeValue: beforeNode.fontFamily,
        afterValue: afterNode.fontFamily,
        direction: 'change',
        magnitude: 0,
        timestamp: Date.now(),
        confirmed: false,
      });
    }
  }

  return corrections;
}
