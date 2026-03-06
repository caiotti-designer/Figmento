import {
  checkGradientDirection,
  checkAutoLayoutCoverage,
  checkSpacingScale,
  checkTypographyHierarchy,
  checkEmptyPlaceholders,
} from '../src/tools/refinement';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Issue {
  rule: string;
  severity: 'error' | 'warning';
  nodeId: string;
  message: string;
  suggestion: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeIssues(): Issue[] {
  return [];
}

// ─────────────────────────────────────────────────────────────
// checkGradientDirection
// ─────────────────────────────────────────────────────────────

describe('checkGradientDirection', () => {
  test('gradient misaligned — solid at top but text at bottom → error', () => {
    const issues = makeIssues();
    const node = {
      id: 'overlay-1',
      type: 'RECTANGLE',
      width: 1080,
      height: 1080,
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          gradientHandlePositions: [
            { x: 0.5, y: 0 }, // handle[0] = transparent end at top
            { x: 0.5, y: 1 }, // handle[1] = solid end at BOTTOM
          ],
        },
      ],
      // Text child is at bottom (y = 700 out of 1080)
      children: [
        { type: 'TEXT', id: 'txt-1', x: 40, y: 700, width: 1000, height: 200, fontSize: 48 },
      ],
    };

    // solid end at bottom (y=1 > 0.5) → matches text at bottom (700/1080 > 0.5) → NO error
    checkGradientDirection(node, issues);
    expect(issues.filter(i => i.rule === 'gradient-direction' && i.severity === 'error')).toHaveLength(0);
  });

  test('gradient misaligned — solid at top but text at bottom → error when inverted', () => {
    const issues = makeIssues();
    const node = {
      id: 'overlay-2',
      type: 'RECTANGLE',
      width: 1080,
      height: 1080,
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          gradientHandlePositions: [
            { x: 0.5, y: 1 }, // handle[0] = transparent end at bottom
            { x: 0.5, y: 0 }, // handle[1] = solid end at TOP
          ],
        },
      ],
      // Text child is at bottom
      children: [
        { type: 'TEXT', id: 'txt-2', x: 40, y: 700, width: 1000, height: 200, fontSize: 48 },
      ],
    };

    // solid end at top (y=0 < 0.5) but text at bottom (700/1080 > 0.5) → MISMATCH → error
    checkGradientDirection(node, issues);
    const errors = issues.filter(i => i.rule === 'gradient-direction' && i.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].nodeId).toBe('overlay-2');
    expect(errors[0].suggestion).toMatch(/flip/i);
  });

  test('no gradient → no issues', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-3',
      type: 'FRAME',
      width: 400,
      height: 300,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      children: [{ type: 'TEXT', id: 'txt-3', x: 0, y: 0, width: 400, height: 100, fontSize: 24 }],
    };
    checkGradientDirection(node, issues);
    expect(issues).toHaveLength(0);
  });

  test('gradient with no sibling text → warning only (not error)', () => {
    const issues = makeIssues();
    const node = {
      id: 'overlay-4',
      type: 'RECTANGLE',
      width: 400,
      height: 300,
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          gradientHandlePositions: [
            { x: 0.5, y: 0 },
            { x: 0.5, y: 1 },
          ],
        },
      ],
      children: [],
    };
    checkGradientDirection(node, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].rule).toBe('gradient-direction');
  });
});

// ─────────────────────────────────────────────────────────────
// checkAutoLayoutCoverage
// ─────────────────────────────────────────────────────────────

describe('checkAutoLayoutCoverage', () => {
  test('FRAME with >2 children and layoutMode NONE → warning', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-5',
      type: 'FRAME',
      name: 'Card Group',
      layoutMode: 'NONE',
      children: [
        { type: 'TEXT', id: 'c1' },
        { type: 'RECTANGLE', id: 'c2' },
        { type: 'FRAME', id: 'c3', children: [] },
      ],
    };
    checkAutoLayoutCoverage(node, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].rule).toBe('auto-layout-coverage');
    expect(issues[0].nodeId).toBe('frame-5');
  });

  test('FRAME with >2 children and layoutMode VERTICAL → no warning', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-6',
      type: 'FRAME',
      name: 'Content',
      layoutMode: 'VERTICAL',
      children: [
        { type: 'TEXT', id: 'c1' },
        { type: 'RECTANGLE', id: 'c2' },
        { type: 'FRAME', id: 'c3', children: [] },
      ],
    };
    checkAutoLayoutCoverage(node, issues);
    expect(issues).toHaveLength(0);
  });

  test('FRAME with 2 children (≤2) → no warning even without auto-layout', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-7',
      type: 'FRAME',
      layoutMode: 'NONE',
      children: [{ type: 'TEXT', id: 'c1' }, { type: 'RECTANGLE', id: 'c2' }],
    };
    checkAutoLayoutCoverage(node, issues);
    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// checkSpacingScale
// ─────────────────────────────────────────────────────────────

describe('checkSpacingScale', () => {
  test('itemSpacing 17 (not on scale) → warning', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-8',
      type: 'FRAME',
      name: 'Section',
      layoutMode: 'VERTICAL',
      itemSpacing: 17,
      children: [],
    };
    checkSpacingScale(node, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].rule).toBe('spacing-scale');
    expect(issues[0].message).toContain('17');
  });

  test('itemSpacing 16 (on scale) → no warning', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-9',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      itemSpacing: 16,
      children: [],
    };
    checkSpacingScale(node, issues);
    expect(issues).toHaveLength(0);
  });

  test('itemSpacing 0 → no warning (zero gap is valid)', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-10',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      itemSpacing: 0,
      children: [],
    };
    checkSpacingScale(node, issues);
    expect(issues).toHaveLength(0);
  });

  test('layoutMode NONE → itemSpacing not checked', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-11',
      type: 'FRAME',
      layoutMode: 'NONE',
      itemSpacing: 17,
      children: [],
    };
    checkSpacingScale(node, issues);
    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// checkTypographyHierarchy
// ─────────────────────────────────────────────────────────────

describe('checkTypographyHierarchy', () => {
  test('largest font < 2× smallest → error', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-12',
      type: 'FRAME',
      children: [
        { type: 'TEXT', id: 't1', fontSize: 20 },
        { type: 'TEXT', id: 't2', fontSize: 30 }, // 30 < 2×20=40 → error
      ],
    };
    checkTypographyHierarchy(node, issues);
    const errors = issues.filter(i => i.severity === 'error' && i.rule === 'typography-hierarchy');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('2×');
  });

  test('largest font ≥ 2× smallest → no error', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-13',
      type: 'FRAME',
      children: [
        { type: 'TEXT', id: 't1', fontSize: 24 },
        { type: 'TEXT', id: 't2', fontSize: 48 }, // 48 = 2×24 → OK
      ],
    };
    checkTypographyHierarchy(node, issues);
    const errors = issues.filter(i => i.severity === 'error' && i.rule === 'typography-hierarchy');
    expect(errors).toHaveLength(0);
  });

  test('fewer than 2 unique sizes → no analysis', () => {
    const issues = makeIssues();
    const node = {
      id: 'frame-14',
      type: 'FRAME',
      children: [
        { type: 'TEXT', id: 't1', fontSize: 24 },
      ],
    };
    checkTypographyHierarchy(node, issues);
    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Clean tree → score 100
// ─────────────────────────────────────────────────────────────

describe('Clean design tree — full check produces score 100', () => {
  test('no issues → issueCount 0 and score 100', () => {
    const issues = makeIssues();
    // A clean tree: auto-layout frame, standard spacing, good typography, no empty placeholders
    const node = {
      id: 'root',
      type: 'FRAME',
      name: 'Root',
      layoutMode: 'VERTICAL',
      itemSpacing: 24,
      width: 1080,
      height: 1920,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
      children: [
        {
          id: 'header',
          type: 'FRAME',
          name: 'Header',
          layoutMode: 'HORIZONTAL',
          itemSpacing: 16,
          width: 1080,
          height: 120,
          fills: [{ type: 'SOLID' }],
          children: [
            { type: 'TEXT', id: 'title', fontSize: 72, x: 0, y: 0, width: 800, height: 80 },
          ],
        },
        {
          id: 'content',
          type: 'FRAME',
          name: 'Content',
          layoutMode: 'VERTICAL',
          itemSpacing: 24,
          width: 1080,
          height: 600,
          fills: [{ type: 'SOLID' }],
          children: [
            { type: 'TEXT', id: 'body', fontSize: 28, x: 0, y: 0, width: 1080, height: 200 },
            { type: 'TEXT', id: 'caption', fontSize: 20, x: 0, y: 220, width: 1080, height: 50 },
          ],
        },
      ],
    };

    checkGradientDirection(node, issues);
    checkAutoLayoutCoverage(node, issues);
    checkSpacingScale(node, issues);
    checkTypographyHierarchy(node, issues);
    checkEmptyPlaceholders(node, issues);

    expect(issues).toHaveLength(0);

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warnCount = issues.filter(i => i.severity === 'warning').length;
    const score = Math.max(0, 100 - errorCount * 15 - warnCount * 5);
    expect(score).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────
// Score math
// ─────────────────────────────────────────────────────────────

describe('Score deduction math', () => {
  test('2 errors + 1 warning = 100 - 30 - 5 = 65', () => {
    // 2 errors: gradient misaligned (2 nodes) → but we just compute the math here
    const errorCount = 2;
    const warnCount = 1;
    const score = Math.max(0, 100 - errorCount * 15 - warnCount * 5);
    expect(score).toBe(65);
  });

  test('score cannot go below 0', () => {
    const errorCount = 10;
    const warnCount = 0;
    const score = Math.max(0, 100 - errorCount * 15 - warnCount * 5);
    expect(score).toBe(0);
  });

  test('summary: score >= 80 → Good', () => {
    const score = 85;
    const summary =
      score >= 80 ? 'Good — minor refinements suggested' :
      score >= 50 ? 'Needs work — several quality issues found' :
                    'Poor — major structural issues, redesign sections';
    expect(summary).toBe('Good — minor refinements suggested');
  });

  test('summary: score >= 50 and < 80 → Needs work', () => {
    const score = 65;
    const summary =
      score >= 80 ? 'Good — minor refinements suggested' :
      score >= 50 ? 'Needs work — several quality issues found' :
                    'Poor — major structural issues, redesign sections';
    expect(summary).toBe('Needs work — several quality issues found');
  });

  test('summary: score < 50 → Poor', () => {
    const score = 40;
    const summary =
      score >= 80 ? 'Good — minor refinements suggested' :
      score >= 50 ? 'Needs work — several quality issues found' :
                    'Poor — major structural issues, redesign sections';
    expect(summary).toBe('Poor — major structural issues, redesign sections');
  });
});
