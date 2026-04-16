// ═══════════════════════════════════════════════════════════
// DESIGN.md IR → tokens.yaml converter
// DMD-2: import_design_system_from_md
// See: docs/architecture/DESIGN-MD-SPEC.md §8 (coverage table)
// ═══════════════════════════════════════════════════════════

import type { DesignMdIR } from './ds-md-types';

// Default values applied when the DESIGN.md omits fields
// (per DESIGN-MD-SPEC.md §10 — upstream tolerance defaults)
const DEFAULT_SPACING = { unit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64 };
const DEFAULT_RADIUS = { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 };
const DEFAULT_SHADOW = { x: 0, y: 0, blur: 0, spread: 0, color: 'rgba(0,0,0,0)', opacity: 0 };

/**
 * Convert a parsed DESIGN.md IR to the tokens.yaml shape that
 * `saveDesignSystem` writes to disk.
 *
 * The output is typed loosely as Record<string, unknown> because it
 * includes fields beyond the strict DesignTokens TypeScript interface
 * (elevation, constraints, opentype_features, letter_spacing, etc.).
 * `yaml.dump` serializes all properties regardless of the TS type.
 */
export function irToTokens(ir: DesignMdIR): Record<string, unknown> {
  const fm = ir.frontmatter;
  const s = ir.sections;

  // ─── Top-level metadata ────────────────────────────────────────────
  const tokens: Record<string, unknown> = {
    name: fm.name || 'unnamed',
    created: fm.created || new Date().toISOString(),
    preset_used: fm.preset_used ?? null,
  };

  // source — mapped from frontmatter.source_url
  if (fm.source_url) {
    tokens.source = fm.source_url;
  }

  // ─── Visual Theme & Atmosphere → mood + voice ──────────────────────
  tokens.mood = s.visual_theme_atmosphere?.mood ?? [];
  tokens.voice = s.visual_theme_atmosphere?.prose ?? null;

  // ─── Color Palette & Roles → colors ────────────────────────────────
  const colorBlock = s.color_palette_roles?.color;
  if (colorBlock && typeof colorBlock === 'object') {
    tokens.colors = { ...colorBlock };
  } else {
    // Minimal fallback for thin systems without color blocks
    tokens.colors = {
      primary: '#000000', primary_light: '#333333', primary_dark: '#000000',
      secondary: '#666666', accent: '#000000', surface: '#ffffff',
      background: '#ffffff', border: '#e5e5e5', on_primary: '#ffffff',
      on_surface: '#000000', on_surface_muted: '#666666',
      success: '#16A34A', warning: '#EAB308', error: '#DC2626', info: '#2563EB',
    };
  }

  // ─── Typography Rules → typography ─────────────────────────────────
  const fontBlock = s.typography_rules?.font_family;
  const scaleBlock = s.typography_rules?.type_scale;
  const letterBlock = s.typography_rules?.letter_spacing;

  const typography: Record<string, unknown> = {};

  if (fontBlock) {
    // heading role
    typography.heading = { ...fontBlock.heading };
    // body role
    typography.body = { ...fontBlock.body };
    // mono role (optional)
    if (fontBlock.mono) {
      typography.mono = { ...fontBlock.mono };
    }
    // OpenType features
    if (fontBlock.opentype_features) {
      typography.opentype_features = [...fontBlock.opentype_features];
    }
    if (fontBlock.tabular_features) {
      typography.tabular_features = [...fontBlock.tabular_features];
    }
  } else {
    typography.heading = { family: 'Inter', weights: [600, 700] };
    typography.body = { family: 'Inter', weights: [400, 500] };
  }

  if (scaleBlock) {
    typography.scale = { ...scaleBlock };
  } else {
    typography.scale = { display: 48, h1: 36, h2: 28, h3: 22, body_lg: 18, body: 16, body_sm: 14, caption: 12 };
  }

  if (letterBlock) {
    typography.letter_spacing = { ...letterBlock };
  }

  tokens.typography = typography;

  // ─── Layout Principles → spacing + radius ──────────────────────────
  tokens.spacing = s.layout_principles?.spacing
    ? { ...s.layout_principles.spacing }
    : { ...DEFAULT_SPACING };

  tokens.radius = s.layout_principles?.radius
    ? { ...s.layout_principles.radius }
    : { ...DEFAULT_RADIUS };

  // ─── Depth & Elevation → shadows + elevation ──────────────────────
  if (s.depth_elevation?.shadow) {
    tokens.shadows = { ...s.depth_elevation.shadow };
  } else {
    tokens.shadows = { sm: { ...DEFAULT_SHADOW }, md: { ...DEFAULT_SHADOW }, lg: { ...DEFAULT_SHADOW } };
  }

  if (s.depth_elevation?.elevation) {
    tokens.elevation = { ...s.depth_elevation.elevation };
  }

  // ─── Gradients ─────────────────────────────────────────────────────
  const gradientBlock = s.color_palette_roles?.gradient;
  if (gradientBlock) {
    tokens.gradients = { ...gradientBlock };
  } else {
    tokens.gradients = { enabled: false };
  }

  // ─── Do's and Don'ts → constraints ─────────────────────────────────
  if (s.dos_and_donts?.do || s.dos_and_donts?.dont) {
    tokens.constraints = {
      do: s.dos_and_donts.do ?? [],
      dont: s.dos_and_donts.dont ?? [],
    };
  }

  // ─── Format Variants (Figmento extension) ──────────────────────────
  if (ir.format_variants && Object.keys(ir.format_variants).length > 0) {
    tokens.format_variants = { ...ir.format_variants };
  }

  return tokens;
}
