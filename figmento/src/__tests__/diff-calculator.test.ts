import {
  calculateDiff,
  inferContext,
  categorizeProperty,
  DELTA_THRESHOLDS,
} from '../diff-calculator';
import type { NodeSnapshot } from '../types';

// ── Fixtures ────────────────────────────────────────────────────

function makeNode(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return {
    id: 'node-1',
    name: 'Hero Title',
    type: 'TEXT',
    x: 40,
    y: 100,
    width: 800,
    height: 80,
    fills: [{ type: 'SOLID', color: '#FFFFFF', opacity: 1 }],
    opacity: 1,
    fontSize: 64,
    fontFamily: 'Playfair Display',
    fontWeight: 700,
    lineHeight: 77,
    letterSpacing: -0.02,
    ...overrides,
  };
}

function makeFrame(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return {
    id: 'frame-1',
    name: 'Root Frame',
    type: 'FRAME',
    x: 0,
    y: 0,
    width: 1080,
    height: 1080,
    fills: [{ type: 'SOLID', color: '#0A0A0F', opacity: 1 }],
    opacity: 1,
    layoutMode: 'VERTICAL',
    itemSpacing: 24,
    paddingTop: 48,
    paddingRight: 48,
    paddingBottom: 48,
    paddingLeft: 48,
    cornerRadius: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// calculateDiff — identical snapshots
// ═══════════════════════════════════════════════════════════════

describe('calculateDiff — identical snapshots', () => {
  test('returns empty array when snapshots are identical', () => {
    const node = makeNode();
    expect(calculateDiff([node], [node])).toEqual([]);
  });

  test('returns empty array for two empty arrays', () => {
    expect(calculateDiff([], [])).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// calculateDiff — node additions and deletions
// ═══════════════════════════════════════════════════════════════

describe('calculateDiff — additions and deletions', () => {
  test('does not create correction for added node (in after, not in before)', () => {
    const newNode = makeNode({ id: 'node-new' });
    const result = calculateDiff([], [newNode]);
    expect(result).toHaveLength(0);
  });

  test('does not create correction for deleted node (in before, not in after)', () => {
    const deletedNode = makeNode({ id: 'node-deleted' });
    const result = calculateDiff([deletedNode], []);
    expect(result).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// calculateDiff — below-threshold changes (must be ignored)
// ═══════════════════════════════════════════════════════════════

describe('calculateDiff — sub-threshold changes ignored', () => {
  test('fontSize change of 1px is ignored (threshold: 2px)', () => {
    const b = makeNode({ fontSize: 64 });
    const a = makeNode({ fontSize: 65 });
    expect(calculateDiff([b], [a])).toHaveLength(0);
  });

  test('cornerRadius change of 1px is ignored (threshold: 2px)', () => {
    const b = makeFrame({ cornerRadius: 8 });
    const a = makeFrame({ cornerRadius: 9 });
    expect(calculateDiff([b], [a])).toHaveLength(0);
  });

  test('opacity change of 0.04 is ignored (threshold: 0.05)', () => {
    const b = makeNode({ opacity: 1.0 });
    const a = makeNode({ opacity: 0.96 });
    expect(calculateDiff([b], [a])).toHaveLength(0);
  });

  test('fontWeight change of 50 is ignored (threshold: 100)', () => {
    const b = makeNode({ fontWeight: 400 });
    const a = makeNode({ fontWeight: 450 });
    expect(calculateDiff([b], [a])).toHaveLength(0);
  });

  test('itemSpacing change of 3px is ignored (threshold: 4px)', () => {
    const b = makeFrame({ itemSpacing: 24 });
    const a = makeFrame({ itemSpacing: 27 });
    expect(calculateDiff([b], [a])).toHaveLength(0);
  });

  test('letterSpacing change of 0.005 is ignored (threshold: 0.01)', () => {
    const b = makeNode({ letterSpacing: -0.02 });
    const a = makeNode({ letterSpacing: -0.015 });
    expect(calculateDiff([b], [a])).toHaveLength(0);
  });

  test('lineHeight change of 1px is ignored (threshold: 2px)', () => {
    const b = makeNode({ lineHeight: 77 });
    const a = makeNode({ lineHeight: 78 });
    expect(calculateDiff([b], [a])).toHaveLength(0);
  });

  test('position change of 7px is ignored (threshold: 8px)', () => {
    const b = makeNode({ x: 40 });
    const a = makeNode({ x: 47 });
    expect(calculateDiff([b], [a])).toHaveLength(0);
  });

  test('size change of 7px is ignored (threshold: 8px)', () => {
    const b = makeNode({ width: 800 });
    const a = makeNode({ width: 807 });
    expect(calculateDiff([b], [a])).toHaveLength(0);
  });

  test('color channel sum of 29 is ignored (threshold: 30)', () => {
    // #FF0000 → #FF001C: ΔR=0, ΔG=0, ΔB=28 = sum 28 < 30
    const b = makeNode({ fills: [{ type: 'SOLID', color: '#FF0000', opacity: 1 }] });
    const a = makeNode({ fills: [{ type: 'SOLID', color: '#FF001C', opacity: 1 }] });
    expect(calculateDiff([b], [a])).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// calculateDiff — above-threshold changes (must be detected)
// ═══════════════════════════════════════════════════════════════

describe('calculateDiff — above-threshold changes detected', () => {
  test('fontSize change of 32px is detected', () => {
    const b = makeNode({ fontSize: 64 });
    const a = makeNode({ fontSize: 96 });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('fontSize');
    expect(result[0].beforeValue).toBe(64);
    expect(result[0].afterValue).toBe(96);
    expect(result[0].magnitude).toBe(32);
    expect(result[0].direction).toBe('increase');
    expect(result[0].category).toBe('typography');
  });

  test('fontSize decrease sets direction to decrease', () => {
    const b = makeNode({ fontSize: 96 });
    const a = makeNode({ fontSize: 48 });
    const result = calculateDiff([b], [a]);
    expect(result[0].direction).toBe('decrease');
  });

  test('cornerRadius change of 8px is detected', () => {
    const b = makeFrame({ cornerRadius: 8 });
    const a = makeFrame({ cornerRadius: 16 });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('cornerRadius');
    expect(result[0].category).toBe('shape');
  });

  test('color change with channel sum of 30 is detected', () => {
    // #3B82F6 → #8B5CF6: ΔR=80, ΔG=42, ΔB=0 = 122 > 30
    const b = makeNode({ fills: [{ type: 'SOLID', color: '#3B82F6', opacity: 1 }] });
    const a = makeNode({ fills: [{ type: 'SOLID', color: '#8B5CF6', opacity: 1 }] });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('fills');
    expect(result[0].category).toBe('color');
    expect(result[0].direction).toBe('change');
    expect(result[0].beforeValue).toBe('#3B82F6');
    expect(result[0].afterValue).toBe('#8B5CF6');
  });

  test('color change at exact threshold of 30 is detected', () => {
    // Build two colors with total diff exactly 30: e.g. #000000 → #1E0000 (ΔR=30)
    const b = makeNode({ fills: [{ type: 'SOLID', color: '#000000', opacity: 1 }] });
    const a = makeNode({ fills: [{ type: 'SOLID', color: '#1E0000', opacity: 1 }] });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
  });

  test('fontFamily change is detected with direction=change', () => {
    const b = makeNode({ fontFamily: 'Playfair Display' });
    const a = makeNode({ fontFamily: 'Inter' });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('fontFamily');
    expect(result[0].direction).toBe('change');
    expect(result[0].category).toBe('typography');
  });

  test('fontWeight change of 300 is detected', () => {
    const b = makeNode({ fontWeight: 400 });
    const a = makeNode({ fontWeight: 700 });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('fontWeight');
  });

  test('itemSpacing change of 8px is detected', () => {
    const b = makeFrame({ itemSpacing: 16 });
    const a = makeFrame({ itemSpacing: 24 });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('itemSpacing');
    expect(result[0].category).toBe('spacing');
  });

  test('padding change of 16px is detected', () => {
    const b = makeFrame({ paddingTop: 48 });
    const a = makeFrame({ paddingTop: 64 });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('paddingTop');
    expect(result[0].category).toBe('spacing');
  });

  test('opacity change of 0.2 is detected', () => {
    const b = makeNode({ opacity: 1.0 });
    const a = makeNode({ opacity: 0.8 });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('opacity');
    expect(result[0].category).toBe('color');
  });

  test('letterSpacing change of 0.05 is detected', () => {
    const b = makeNode({ letterSpacing: 0 });
    const a = makeNode({ letterSpacing: 0.05 });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('letterSpacing');
  });

  test('lineHeight change of 10px is detected', () => {
    const b = makeNode({ lineHeight: 70 });
    const a = makeNode({ lineHeight: 80 });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('lineHeight');
  });

  test('width change of 100px is detected', () => {
    const b = makeNode({ width: 800 });
    const a = makeNode({ width: 900 });
    const result = calculateDiff([b], [a]);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('width');
    expect(result[0].category).toBe('shape');
  });
});

// ═══════════════════════════════════════════════════════════════
// calculateDiff — multi-property change
// ═══════════════════════════════════════════════════════════════

describe('calculateDiff — multi-property changes', () => {
  test('detects multiple changes on the same node', () => {
    const b = makeNode({ fontSize: 64, cornerRadius: 8, fontFamily: 'Playfair Display' });
    const a = makeNode({ fontSize: 96, cornerRadius: 16, fontFamily: 'Inter' });
    const result = calculateDiff([b], [a]);
    const props = result.map(r => r.property);
    expect(props).toContain('fontSize');
    expect(props).toContain('cornerRadius');
    expect(props).toContain('fontFamily');
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  test('detects changes across multiple nodes', () => {
    const b = [makeNode({ id: 'n1', fontSize: 64 }), makeNode({ id: 'n2', fontSize: 32 })];
    const a = [makeNode({ id: 'n1', fontSize: 96 }), makeNode({ id: 'n2', fontSize: 48 })];
    const result = calculateDiff(b, a);
    expect(result).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// calculateDiff — CorrectionEntry fields
// ═══════════════════════════════════════════════════════════════

describe('calculateDiff — CorrectionEntry shape', () => {
  test('sets confirmed=false by default', () => {
    const b = makeNode({ fontSize: 64 });
    const a = makeNode({ fontSize: 96 });
    expect(calculateDiff([b], [a])[0].confirmed).toBe(false);
  });

  test('sets timestamp to current time (within 1s)', () => {
    const before = Date.now();
    const b = makeNode({ fontSize: 64 });
    const a = makeNode({ fontSize: 96 });
    const result = calculateDiff([b], [a]);
    expect(result[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(result[0].timestamp).toBeLessThanOrEqual(Date.now() + 100);
  });

  test('sets nodeId, nodeName, nodeType from afterNode', () => {
    const b = makeNode({ id: 'node-abc', name: 'Hero Title', type: 'TEXT', fontSize: 64 });
    const a = makeNode({ id: 'node-abc', name: 'Hero Title', type: 'TEXT', fontSize: 96 });
    const result = calculateDiff([b], [a]);
    expect(result[0].nodeId).toBe('node-abc');
    expect(result[0].nodeName).toBe('Hero Title');
    expect(result[0].nodeType).toBe('TEXT');
  });

  test('generates a unique id for each correction', () => {
    const b = makeNode({ fontSize: 64 });
    const a = makeNode({ fontSize: 96 });
    const result1 = calculateDiff([b], [a]);
    const result2 = calculateDiff([b], [a]);
    expect(result1[0].id).not.toBe(result2[0].id);
  });

  test('sets frameId from first node in before array', () => {
    const root = makeFrame({ id: 'frame-root' });
    const child = makeNode({ id: 'child-1', fontSize: 64 });
    const childAfter = makeNode({ id: 'child-1', fontSize: 96 });
    const result = calculateDiff([root, child], [root, childAfter]);
    expect(result[0].frameId).toBe('frame-root');
  });
});

// ═══════════════════════════════════════════════════════════════
// inferContext
// ═══════════════════════════════════════════════════════════════

describe('inferContext', () => {
  const cases: Array<[string, string, Partial<NodeSnapshot>]> = [
    ['Hero Section', 'display', { name: 'Hero Section', type: 'TEXT' }],
    ['Display Title', 'display', { name: 'Display Title', type: 'TEXT' }],
    ['Heading', 'h1', { name: 'Heading', type: 'TEXT' }],
    ['Page Title', 'h1', { name: 'Page Title', type: 'TEXT' }],
    ['H1 Label', 'h1', { name: 'H1 Label', type: 'TEXT' }],
    ['Subheading', 'h2', { name: 'Subheading', type: 'TEXT' }],
    ['H2 Description', 'h2', { name: 'H2 Description', type: 'TEXT' }],
    ['Body Text', 'body', { name: 'Body Text', type: 'TEXT' }],
    ['Paragraph', 'body', { name: 'Paragraph', type: 'TEXT' }],
    ['Description', 'body', { name: 'Description', type: 'TEXT' }],
    ['Caption', 'caption', { name: 'Caption', type: 'TEXT' }],
    ['Label', 'caption', { name: 'Label', type: 'TEXT' }],
    ['Note', 'caption', { name: 'Note', type: 'TEXT' }],
    ['Card Container', 'card', { name: 'Card Container', type: 'FRAME' }],
    ['Section Wrapper', 'section', { name: 'Section Wrapper', type: 'FRAME', layoutMode: 'VERTICAL' }],
    ['Root Frame', 'root-frame', { name: 'Root Frame', type: 'FRAME' }],
    ['Unknown Element', 'root-frame', { name: 'Unknown Element', type: 'RECTANGLE' }],
  ];

  test.each(cases)('name="%s" → context="%s"', (_name, expected, overrides) => {
    const node = makeNode(overrides as Partial<NodeSnapshot>);
    expect(inferContext(node)).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════
// categorizeProperty
// ═══════════════════════════════════════════════════════════════

describe('categorizeProperty', () => {
  const cases: Array<[string, 'typography' | 'color' | 'spacing' | 'shape']> = [
    ['fontSize', 'typography'],
    ['fontFamily', 'typography'],
    ['fontWeight', 'typography'],
    ['lineHeight', 'typography'],
    ['letterSpacing', 'typography'],
    ['fills', 'color'],
    ['opacity', 'color'],
    ['itemSpacing', 'spacing'],
    ['paddingTop', 'spacing'],
    ['paddingRight', 'spacing'],
    ['paddingBottom', 'spacing'],
    ['paddingLeft', 'spacing'],
    ['cornerRadius', 'shape'],
    ['strokeWeight', 'shape'],
    ['width', 'shape'],
    ['height', 'shape'],
    ['x', 'shape'],
    ['y', 'shape'],
  ];

  test.each(cases)('property="%s" → category="%s"', (prop, expected) => {
    expect(categorizeProperty(prop)).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════
// DELTA_THRESHOLDS — verify all 10 are present
// ═══════════════════════════════════════════════════════════════

describe('DELTA_THRESHOLDS', () => {
  test('has correct threshold values from PRD-004 §C4', () => {
    expect(DELTA_THRESHOLDS.width).toBe(8);
    expect(DELTA_THRESHOLDS.height).toBe(8);
    expect(DELTA_THRESHOLDS.x).toBe(8);
    expect(DELTA_THRESHOLDS.y).toBe(8);
    expect(DELTA_THRESHOLDS.fontSize).toBe(2);
    expect(DELTA_THRESHOLDS.colorChannelSum).toBe(30);
    expect(DELTA_THRESHOLDS.cornerRadius).toBe(2);
    expect(DELTA_THRESHOLDS.opacity).toBe(0.05);
    expect(DELTA_THRESHOLDS.fontWeight).toBe(100);
    expect(DELTA_THRESHOLDS.itemSpacing).toBe(4);
    expect(DELTA_THRESHOLDS.paddingTop).toBe(4);
    expect(DELTA_THRESHOLDS.letterSpacing).toBe(0.01);
    expect(DELTA_THRESHOLDS.lineHeight).toBe(2);
  });
});
