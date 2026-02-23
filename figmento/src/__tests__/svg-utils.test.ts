import { parsePath, scalePathData, normalizeCommands, PathCommand } from '../svg-utils';

// ═══════════════════════════════════════════════════════════════
// parsePath
// ═══════════════════════════════════════════════════════════════

describe('parsePath', () => {
  test('parses simple moveTo and lineTo', () => {
    const result = parsePath('M 10 20 L 30 40');
    expect(result).toEqual([
      { type: 'M', params: [10, 20] },
      { type: 'L', params: [30, 40] },
    ]);
  });

  test('parses compact path without spaces', () => {
    const result = parsePath('M0,0L100,100Z');
    expect(result).toEqual([
      { type: 'M', params: [0, 0] },
      { type: 'L', params: [100, 100] },
      { type: 'Z', params: [] },
    ]);
  });

  test('parses negative numbers', () => {
    const result = parsePath('M -10 -20 L -30 40');
    expect(result).toEqual([
      { type: 'M', params: [-10, -20] },
      { type: 'L', params: [-30, 40] },
    ]);
  });

  test('parses decimal numbers', () => {
    const result = parsePath('M 1.5 2.75 L 3.14 4.0');
    expect(result).toEqual([
      { type: 'M', params: [1.5, 2.75] },
      { type: 'L', params: [3.14, 4.0] },
    ]);
  });

  test('parses cubic bezier', () => {
    const result = parsePath('M 0 0 C 10 20 30 40 50 60');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'M', params: [0, 0] });
    expect(result[1].type).toBe('C');
    expect(result[1].params).toEqual([10, 20, 30, 40, 50, 60]);
  });

  test('parses closePath (Z)', () => {
    const result = parsePath('M 0 0 L 10 0 L 10 10 Z');
    expect(result).toHaveLength(4);
    expect(result[3]).toEqual({ type: 'Z', params: [] });
  });

  test('handles empty string', () => {
    expect(parsePath('')).toEqual([]);
  });

  test('parses relative commands', () => {
    const result = parsePath('m 10 20 l 30 40');
    expect(result).toEqual([
      { type: 'm', params: [10, 20] },
      { type: 'l', params: [30, 40] },
    ]);
  });

  test('parses arc command', () => {
    const result = parsePath('M 0 0 A 25 25 0 1 1 50 50');
    expect(result).toHaveLength(2);
    expect(result[1].type).toBe('A');
    expect(result[1].params).toEqual([25, 25, 0, 1, 1, 50, 50]);
  });

  test('parses horizontal and vertical line commands', () => {
    const result = parsePath('M 0 0 H 100 V 200');
    expect(result).toEqual([
      { type: 'M', params: [0, 0] },
      { type: 'H', params: [100] },
      { type: 'V', params: [200] },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════
// normalizeCommands
// ═══════════════════════════════════════════════════════════════

describe('normalizeCommands', () => {
  test('converts relative moveTo to absolute', () => {
    const commands: PathCommand[] = [
      { type: 'm', params: [10, 20] },
      { type: 'l', params: [30, 40] },
    ];
    const result = normalizeCommands(commands);
    expect(result[0]).toEqual({ type: 'M', params: [10, 20] });
    expect(result[1]).toEqual({ type: 'L', params: [40, 60] }); // 10+30, 20+40
  });

  test('converts H to L', () => {
    const commands: PathCommand[] = [
      { type: 'M', params: [0, 10] },
      { type: 'H', params: [50] },
    ];
    const result = normalizeCommands(commands);
    expect(result[1]).toEqual({ type: 'L', params: [50, 10] });
  });

  test('converts V to L', () => {
    const commands: PathCommand[] = [
      { type: 'M', params: [10, 0] },
      { type: 'V', params: [50] },
    ];
    const result = normalizeCommands(commands);
    expect(result[1]).toEqual({ type: 'L', params: [10, 50] });
  });

  test('converts relative h to L', () => {
    const commands: PathCommand[] = [
      { type: 'M', params: [10, 20] },
      { type: 'h', params: [30] },
    ];
    const result = normalizeCommands(commands);
    expect(result[1]).toEqual({ type: 'L', params: [40, 20] }); // 10+30, 20
  });

  test('converts relative v to L', () => {
    const commands: PathCommand[] = [
      { type: 'M', params: [10, 20] },
      { type: 'v', params: [30] },
    ];
    const result = normalizeCommands(commands);
    expect(result[1]).toEqual({ type: 'L', params: [10, 50] }); // 10, 20+30
  });

  test('preserves Z command', () => {
    const commands: PathCommand[] = [
      { type: 'M', params: [0, 0] },
      { type: 'L', params: [10, 10] },
      { type: 'Z', params: [] },
    ];
    const result = normalizeCommands(commands);
    expect(result[2]).toEqual({ type: 'Z', params: [] });
  });

  test('handles smooth cubic (S) by generating control point', () => {
    const commands: PathCommand[] = [
      { type: 'M', params: [0, 0] },
      { type: 'C', params: [10, 20, 30, 40, 50, 60] },
      { type: 'S', params: [90, 80, 100, 100] },
    ];
    const result = normalizeCommands(commands);
    // S should become C with reflected control point
    expect(result[2].type).toBe('C');
    expect(result[2].params).toHaveLength(6);
    // First control point is reflection of previous C's second control point (30,40) around (50,60)
    expect(result[2].params[0]).toBeCloseTo(70); // 50 + (50-30)
    expect(result[2].params[1]).toBeCloseTo(80); // 60 + (60-40)
  });

  test('handles smooth quadratic (T) by generating control point', () => {
    const commands: PathCommand[] = [
      { type: 'M', params: [0, 0] },
      { type: 'Q', params: [10, 20, 30, 30] },
      { type: 'T', params: [60, 60] },
    ];
    const result = normalizeCommands(commands);
    // T should become Q with reflected control point
    expect(result[2].type).toBe('Q');
    expect(result[2].params).toHaveLength(4);
    // Reflected from Q control (10,20) around end (30,30)
    expect(result[2].params[0]).toBeCloseTo(50); // 30 + (30-10)
    expect(result[2].params[1]).toBeCloseTo(40); // 30 + (30-20)
  });

  test('converts arc (A) to cubic bezier curves (C)', () => {
    const commands: PathCommand[] = [
      { type: 'M', params: [0, 0] },
      { type: 'A', params: [25, 25, 0, 0, 1, 50, 0] },
    ];
    const result = normalizeCommands(commands);
    // Arc should be converted to one or more C commands
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].type).toBe('C');
      expect(result[i].params).toHaveLength(6);
    }
  });

  test('handles empty command list', () => {
    expect(normalizeCommands([])).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// scalePathData
// ═══════════════════════════════════════════════════════════════

describe('scalePathData', () => {
  test('scales coordinates by given factor', () => {
    const result = scalePathData('M 10 20 L 30 40', 2);
    // Should contain scaled values: 20 40 and 60 80
    expect(result).toContain('M');
    expect(result).toContain('20.00');
    expect(result).toContain('40.00');
    expect(result).toContain('60.00');
    expect(result).toContain('80.00');
  });

  test('scale factor of 1 preserves coordinates', () => {
    const result = scalePathData('M 10 20 L 30 40', 1);
    expect(result).toContain('10.00');
    expect(result).toContain('20.00');
    expect(result).toContain('30.00');
    expect(result).toContain('40.00');
  });

  test('scale factor of 0.5 halves coordinates', () => {
    const result = scalePathData('M 100 200', 0.5);
    expect(result).toContain('50.00');
    expect(result).toContain('100.00');
  });

  test('handles path with Z command', () => {
    const result = scalePathData('M 0 0 L 10 0 L 10 10 Z', 2);
    expect(result).toContain('Z');
    expect(result).toContain('20.00');
  });

  test('normalizes relative commands to absolute', () => {
    // Relative l should become absolute L
    const result = scalePathData('M 10 10 l 20 20', 1);
    expect(result).toContain('M');
    expect(result).toContain('L');
    // l 20 20 relative to 10,10 → L 30 30
    expect(result).toContain('30.00');
  });

  test('handles H and V commands', () => {
    const result = scalePathData('M 0 0 H 50 V 50', 2);
    // H 50 from (0,0) → L 50 0, scaled → L 100 0
    // V 50 from (50,0) → L 50 50, scaled → L 100 100
    expect(result).toContain('L');
    expect(result).toContain('100.00');
  });
});
