/**
 * Color conversion and font style utilities shared between
 * the Figma sandbox (code.ts) and potentially other modules.
 */

/**
 * Converts a hex color string to a Figma RGB object (0-1 range).
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };

  let cleanHex = hex.replace('#', '');

  // Expand shorthand (#ABC → #AABBCC)
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map(function (c) {
        return c + c;
      })
      .join('');
  }

  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  if (result) {
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
    };
  }

  return { r: 0, g: 0, b: 0 };
}

/**
 * Converts a Figma RGB color object to a hex string.
 */
export function rgbToHex(color: { r: number; g: number; b: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return (
    '#' +
    [r, g, b]
      .map(function (x) {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
      .toUpperCase()
  );
}

/**
 * Maps a CSS font-weight number to a Figma font style string.
 * Finds the closest available weight.
 */
export function getFontStyle(weight: number): string {
  const styles: Record<number, string> = {
    100: 'Thin',
    200: 'Extra Light',
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'Semi Bold',
    700: 'Bold',
    800: 'Extra Bold',
    900: 'Black',
  };

  const weights = Object.keys(styles).map(Number);
  const closest = weights.reduce(function (prev, curr) {
    return Math.abs(curr - weight) < Math.abs(prev - weight) ? curr : prev;
  });

  return styles[closest] || 'Regular';
}

/**
 * Checks if two colors have sufficient contrast for readability.
 * Uses WCAG relative luminance formula. Returns true if contrast ratio >= 3:1.
 */
export function isContrastingColor(color1: string, color2: string): boolean {
  function getLuminance(hex: string): number {
    const rgb = hexToRgb(hex);
    // sRGB linearization: threshold 0.04045 per WCAG 2.0 spec
    const r = rgb.r <= 0.04045 ? rgb.r / 12.92 : Math.pow((rgb.r + 0.055) / 1.055, 2.4);
    const g = rgb.g <= 0.04045 ? rgb.g / 12.92 : Math.pow((rgb.g + 0.055) / 1.055, 2.4);
    const b = rgb.b <= 0.04045 ? rgb.b / 12.92 : Math.pow((rgb.b + 0.055) / 1.055, 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  const contrastRatio = (brightest + 0.05) / (darkest + 0.05);

  return contrastRatio >= 3;
}
