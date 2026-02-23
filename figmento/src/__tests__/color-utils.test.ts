import { hexToRgb, rgbToHex, getFontStyle, isContrastingColor } from '../color-utils';

// ═══════════════════════════════════════════════════════════════
// hexToRgb
// ═══════════════════════════════════════════════════════════════

describe('hexToRgb', () => {
  test('converts standard 6-digit hex', () => {
    const result = hexToRgb('#FF0000');
    expect(result).toEqual({ r: 1, g: 0, b: 0 });
  });

  test('converts hex without # prefix', () => {
    const result = hexToRgb('00FF00');
    expect(result).toEqual({ r: 0, g: 1, b: 0 });
  });

  test('converts shorthand 3-digit hex', () => {
    const result = hexToRgb('#FFF');
    expect(result).toEqual({ r: 1, g: 1, b: 1 });
  });

  test('converts shorthand 3-digit hex without #', () => {
    const result = hexToRgb('ABC');
    expect(result).toEqual({
      r: 0xAA / 255,
      g: 0xBB / 255,
      b: 0xCC / 255,
    });
  });

  test('handles lowercase hex', () => {
    const result = hexToRgb('#ff8800');
    expect(result.r).toBeCloseTo(1);
    expect(result.g).toBeCloseTo(0x88 / 255);
    expect(result.b).toBeCloseTo(0);
  });

  test('returns black for empty string', () => {
    expect(hexToRgb('')).toEqual({ r: 0, g: 0, b: 0 });
  });

  test('returns black for null/undefined', () => {
    expect(hexToRgb(null as any)).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb(undefined as any)).toEqual({ r: 0, g: 0, b: 0 });
  });

  test('returns black for invalid hex', () => {
    expect(hexToRgb('#GGGGGG')).toEqual({ r: 0, g: 0, b: 0 });
  });

  test('produces values in 0-1 range', () => {
    const result = hexToRgb('#808080');
    expect(result.r).toBeCloseTo(0x80 / 255);
    expect(result.g).toBeCloseTo(0x80 / 255);
    expect(result.b).toBeCloseTo(0x80 / 255);
  });
});

// ═══════════════════════════════════════════════════════════════
// rgbToHex
// ═══════════════════════════════════════════════════════════════

describe('rgbToHex', () => {
  test('converts pure red', () => {
    expect(rgbToHex({ r: 1, g: 0, b: 0 })).toBe('#FF0000');
  });

  test('converts pure green', () => {
    expect(rgbToHex({ r: 0, g: 1, b: 0 })).toBe('#00FF00');
  });

  test('converts pure blue', () => {
    expect(rgbToHex({ r: 0, g: 0, b: 1 })).toBe('#0000FF');
  });

  test('converts white', () => {
    expect(rgbToHex({ r: 1, g: 1, b: 1 })).toBe('#FFFFFF');
  });

  test('converts black', () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
  });

  test('converts mid-gray', () => {
    const result = rgbToHex({ r: 0.5, g: 0.5, b: 0.5 });
    expect(result).toBe('#808080');
  });

  test('pads single-digit hex with zero', () => {
    // 1/255 ≈ 0.00392, rounds to 1 → "01"
    const result = rgbToHex({ r: 1 / 255, g: 0, b: 0 });
    expect(result).toBe('#010000');
  });

  test('roundtrips with hexToRgb', () => {
    const original = '#3A7BC8';
    const rgb = hexToRgb(original);
    const hex = rgbToHex(rgb);
    expect(hex).toBe(original);
  });
});

// ═══════════════════════════════════════════════════════════════
// getFontStyle
// ═══════════════════════════════════════════════════════════════

describe('getFontStyle', () => {
  test('maps exact weight 400 to Regular', () => {
    expect(getFontStyle(400)).toBe('Regular');
  });

  test('maps exact weight 700 to Bold', () => {
    expect(getFontStyle(700)).toBe('Bold');
  });

  test('maps exact weight 100 to Thin', () => {
    expect(getFontStyle(100)).toBe('Thin');
  });

  test('maps exact weight 900 to Black', () => {
    expect(getFontStyle(900)).toBe('Black');
  });

  test('maps all standard weights', () => {
    expect(getFontStyle(200)).toBe('Extra Light');
    expect(getFontStyle(300)).toBe('Light');
    expect(getFontStyle(500)).toBe('Medium');
    expect(getFontStyle(600)).toBe('Semi Bold');
    expect(getFontStyle(800)).toBe('Extra Bold');
  });

  test('snaps to closest weight (450 → Regular or Medium)', () => {
    const result = getFontStyle(450);
    // 450 is equidistant from 400 and 500; reduce picks first match
    expect(['Regular', 'Medium']).toContain(result);
  });

  test('snaps weight 350 to Light (300) — equidistant, reduce picks first', () => {
    expect(getFontStyle(350)).toBe('Light');
  });

  test('snaps weight 750 to Bold (700) or Extra Bold (800)', () => {
    const result = getFontStyle(750);
    expect(['Bold', 'Extra Bold']).toContain(result);
  });

  test('handles weight below minimum (50 → Thin)', () => {
    expect(getFontStyle(50)).toBe('Thin');
  });

  test('handles weight above maximum (1000 → Black)', () => {
    expect(getFontStyle(1000)).toBe('Black');
  });
});

// ═══════════════════════════════════════════════════════════════
// isContrastingColor
// ═══════════════════════════════════════════════════════════════

describe('isContrastingColor', () => {
  test('black on white has sufficient contrast', () => {
    expect(isContrastingColor('#000000', '#FFFFFF')).toBe(true);
  });

  test('white on black has sufficient contrast', () => {
    expect(isContrastingColor('#FFFFFF', '#000000')).toBe(true);
  });

  test('same color has no contrast', () => {
    expect(isContrastingColor('#808080', '#808080')).toBe(false);
  });

  test('similar grays fail contrast check', () => {
    expect(isContrastingColor('#777777', '#999999')).toBe(false);
  });

  test('dark blue on white passes', () => {
    expect(isContrastingColor('#000080', '#FFFFFF')).toBe(true);
  });

  test('is symmetric (order does not matter)', () => {
    const a = isContrastingColor('#FF0000', '#FFFFFF');
    const b = isContrastingColor('#FFFFFF', '#FF0000');
    expect(a).toBe(b);
  });
});
