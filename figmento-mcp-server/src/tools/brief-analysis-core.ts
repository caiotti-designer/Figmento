/**
 * ODS-1b: Brief Analysis — Core Logic (testable, no MCP SDK dependency)
 *
 * Separated from brief-analysis.ts to avoid TS2589 in ts-jest.
 * The server.tool() registration stays in brief-analysis.ts (built by esbuild).
 * The pure functions live here (tested by ts-jest).
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';
import type { BrandAnalysis, TextStyleSpec } from '../types/brand-analysis';

// ═══════════════════════════════════════════════════════════════
// KNOWLEDGE BASE LOADER
// ═══════════════════════════════════════════════════════════════

const knowledgeCache = new Map<string, unknown>();

function getKnowledgeDir(): string {
  // Two-candidate fallback per MEMORY.md: works in ts-jest, esbuild dist, and any other context
  const oneUp = nodePath.join(__dirname, '..', 'knowledge');
  if (fs.existsSync(oneUp)) return oneUp;
  return nodePath.join(__dirname, '..', '..', 'knowledge');
}

function loadKnowledge(filename: string): Record<string, unknown> {
  if (knowledgeCache.has(filename)) return knowledgeCache.get(filename) as Record<string, unknown>;
  const filePath = nodePath.join(getKnowledgeDir(), filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = yaml.load(content) as Record<string, unknown>;
  knowledgeCache.set(filename, data);
  return data;
}

// ═══════════════════════════════════════════════════════════════
// COLOR UTILITIES
// ═══════════════════════════════════════════════════════════════

function hexToHsl(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0.5];
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h = h / 360; s = s / 100; l = l / 100;
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function generateColorScale(hex: string): Record<string, string> {
  const [h, s, l] = hexToHsl(hex);

  const steps: Record<string, number> = {
    '50': 95, '100': 90, '200': 80, '300': 65, '400': 55,
    '500': l, '600': 35, '700': 25, '800': 18, '900': 12,
  };

  const scale: Record<string, string> = {};
  for (const [step, targetL] of Object.entries(steps)) {
    let finalL = step === '500' ? l : targetL;
    let finalS = s;
    if (finalL > 85) finalS = Math.max(s * 0.4, 10);
    else if (finalL > 70) finalS = s * 0.7;
    else if (finalL < 20) finalS = s * 0.8;

    scale[step] = hslToHex(h, finalS, finalL);
  }
  return scale;
}

export function generateNeutralScale(primaryHex: string): Record<string, string> {
  const [h] = hexToHsl(primaryHex);
  const tintS = 5;
  const steps: Record<string, number> = {
    '50': 97, '100': 94, '200': 88, '300': 78, '400': 65,
    '500': 50, '600': 40, '700': 30, '800': 20, '900': 12, '950': 7,
  };

  const scale: Record<string, string> = {};
  for (const [step, lightness] of Object.entries(steps)) {
    scale[step] = hslToHex(h, tintS, lightness);
  }
  return scale;
}

// ═══════════════════════════════════════════════════════════════
// KNOWLEDGE MATCHING
// ═══════════════════════════════════════════════════════════════

interface PaletteEntry {
  id: string;
  mood_tags: string[];
  colors: Record<string, string>;
}

interface FontPairingEntry {
  id: string;
  heading_font: string;
  body_font: string;
  mood_tags: string[];
  recommended_heading_weight: number;
  recommended_body_weight: number;
}

interface TypeScaleEntry {
  ratio: number;
  sizes: Record<string, number>;
}

function matchPalette(toneKeywords: string[]): PaletteEntry | null {
  const colorData = loadKnowledge('color-system.yaml');
  const palettes = (colorData.palettes || []) as PaletteEntry[];
  const lowerTone = toneKeywords.map(t => t.toLowerCase());

  let bestMatch: PaletteEntry | null = null;
  let bestScore = 0;

  for (const palette of palettes) {
    const score = palette.mood_tags.filter(tag => lowerTone.includes(tag)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = palette;
    }
  }
  return bestMatch;
}

function matchFontPairing(toneKeywords: string[]): FontPairingEntry | null {
  const typoData = loadKnowledge('typography.yaml');
  const pairings = (typoData.font_pairings || []) as FontPairingEntry[];
  const lowerTone = toneKeywords.map(t => t.toLowerCase());

  let bestMatch: FontPairingEntry | null = null;
  let bestScore = 0;

  for (const pairing of pairings) {
    const score = pairing.mood_tags.filter(tag => lowerTone.includes(tag)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pairing;
    }
  }
  if (!bestMatch) {
    bestMatch = pairings.find(p => p.id === 'modern') || pairings[0];
  }
  return bestMatch;
}

function getTypeScale(scaleId: string): TypeScaleEntry {
  const typoData = loadKnowledge('typography.yaml');
  const scales = (typoData.type_scales || {}) as Record<string, TypeScaleEntry>;
  return scales[scaleId] || scales['major_third'];
}

/**
 * Clamp font weight to 400 or 700. NEVER return 600.
 */
export function clampWeight(weight: number): number {
  if (weight <= 500) return 400;
  return 700;
}

function computeTextStyles(
  scale: TypeScaleEntry,
  headingWeight: number,
  bodyWeight: number,
): Record<string, TextStyleSpec> {
  const sizes = scale.sizes;
  const headingLhMul = 1.2;
  const bodyLhMul = 1.5;

  function heading(size: number): TextStyleSpec {
    return {
      size,
      weight: clampWeight(headingWeight),
      lineHeight: Math.round(size * headingLhMul),
      letterSpacing: size >= 40 ? -0.5 : 0,
    };
  }

  function body(size: number): TextStyleSpec {
    return {
      size,
      weight: clampWeight(bodyWeight),
      lineHeight: Math.round(size * bodyLhMul),
      letterSpacing: 0,
    };
  }

  return {
    display: heading(sizes['display'] || 64),
    h1: heading(sizes['4xl'] || 48),
    h2: heading(sizes['3xl'] || 32),
    h3: heading(sizes['2xl'] || 24),
    bodyLg: body(sizes['lg'] || 20),
    body: body(sizes['base'] || 16),
    bodySm: body(sizes['sm'] || 14),
    caption: { size: sizes['xs'] || 12, weight: clampWeight(bodyWeight), lineHeight: Math.round((sizes['xs'] || 12) * 1.4), letterSpacing: 0.2 },
  };
}

function radiusForIndustry(industry: string): number {
  const lower = industry.toLowerCase();
  if (/fintech|finance|banking|insurance/i.test(lower)) return 4;
  if (/luxury|fashion|jewelry/i.test(lower)) return 0;
  if (/kids|game|play|toy|fun/i.test(lower)) return 16;
  return 8;
}

// ═══════════════════════════════════════════════════════════════
// COLOR ROLE ASSIGNMENT
// ═══════════════════════════════════════════════════════════════

export function assignColorRoles(
  logoColors: string[],
  fallbackPalette: PaletteEntry | null,
): { primary: string; secondary: string; accent: string } {
  if (logoColors.length >= 3) {
    return { primary: logoColors[0], secondary: logoColors[1], accent: logoColors[2] };
  }
  if (logoColors.length === 2) {
    const [h, s, l] = hexToHsl(logoColors[0]);
    return { primary: logoColors[0], secondary: logoColors[1], accent: hslToHex((h + 60) % 360, s, l) };
  }
  if (logoColors.length === 1) {
    const [h, s, l] = hexToHsl(logoColors[0]);
    return {
      primary: logoColors[0],
      secondary: hslToHex(h, s * 0.6, Math.min(l + 15, 90)),
      accent: hslToHex((h + 60) % 360, s, l),
    };
  }
  if (fallbackPalette) {
    return {
      primary: fallbackPalette.colors.primary,
      secondary: fallbackPalette.colors.secondary,
      accent: fallbackPalette.colors.accent,
    };
  }
  return { primary: '#1E3A5F', secondary: '#2C5282', accent: '#3182CE' };
}

function deriveSemanticColors(primary: string): {
  background: string; text: string; muted: string; surface: string;
} {
  const [h, , l] = hexToHsl(primary);
  if (l < 40) {
    return {
      background: hslToHex(h, 5, 97),
      text: hslToHex(h, 10, 10),
      muted: hslToHex(h, 5, 60),
      surface: hslToHex(h, 5, 94),
    };
  }
  return {
    background: '#FFFFFF',
    text: hslToHex(h, 10, 12),
    muted: hslToHex(h, 5, 55),
    surface: hslToHex(h, 5, 96),
  };
}

// ═══════════════════════════════════════════════════════════════
// BRAND ANALYSIS ASSEMBLY
// ═══════════════════════════════════════════════════════════════

export function assembleBrandAnalysis(params: {
  brandName: string;
  industry: string;
  tone: string[];
  targetAudience: string;
  brandValues: string[];
  logoColors: string[];
  hasPdf: boolean;
  hasLogo: boolean;
}): BrandAnalysis {
  const { brandName, industry, tone, targetAudience, brandValues, logoColors, hasPdf, hasLogo } = params;

  const palette = matchPalette(tone);
  const fontPairing = matchFontPairing(tone);
  const scaleId = 'major_third';
  const typeScale = getTypeScale(scaleId);

  const { primary, secondary, accent } = assignColorRoles(logoColors, palette);
  const semantic = deriveSemanticColors(primary);

  const scales = {
    primary: generateColorScale(primary),
    secondary: generateColorScale(secondary),
    accent: generateColorScale(accent),
  };
  const neutrals = generateNeutralScale(primary);

  const headingWeight = clampWeight(fontPairing?.recommended_heading_weight || 700);
  const bodyWeight = clampWeight(fontPairing?.recommended_body_weight || 400);
  const textStyles = computeTextStyles(typeScale, headingWeight, bodyWeight);

  const radiusDefault = radiusForIndustry(industry);

  return {
    brandName, industry, tone, targetAudience, brandValues,
    colors: {
      primary, secondary, accent,
      background: semantic.background, text: semantic.text,
      muted: semantic.muted, surface: semantic.surface,
      error: '#DC2626', success: '#16A34A',
      scales, neutrals,
    },
    typography: {
      headingFont: fontPairing?.heading_font || 'Inter',
      bodyFont: fontPairing?.body_font || 'Inter',
      headingWeight, bodyWeight,
      typeScale: scaleId,
      styles: textStyles as BrandAnalysis['typography']['styles'],
    },
    spacing: { base: 8, scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128] },
    radius: {
      values: { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 },
      default: radiusDefault,
    },
    source: {
      hasPdf, hasLogo,
      paletteId: palette?.id || null,
      fontPairingId: fontPairing?.id || null,
      confidence: (hasPdf ? 0.4 : 0) + (hasLogo ? 0.3 : 0) + (palette ? 0.15 : 0) + (fontPairing ? 0.15 : 0),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function validateBrandAnalysis(analysis: BrandAnalysis): string[] {
  const issues: string[] = [];
  const colorFields = ['primary', 'secondary', 'accent', 'background', 'text', 'muted', 'surface', 'error', 'success'] as const;
  for (const field of colorFields) {
    if (!HEX_RE.test(analysis.colors[field])) {
      issues.push(`colors.${field} is not a valid 6-digit hex: ${analysis.colors[field]}`);
    }
  }
  if (analysis.typography.headingWeight === 600) issues.push('headingWeight is 600 (must be 400 or 700)');
  if (analysis.typography.bodyWeight === 600) issues.push('bodyWeight is 600 (must be 400 or 700)');
  for (const [name, style] of Object.entries(analysis.typography.styles)) {
    if (style.lineHeight < 10) {
      issues.push(`typography.styles.${name}.lineHeight is ${style.lineHeight} — looks like a multiplier, not pixels`);
    }
  }
  return issues;
}
