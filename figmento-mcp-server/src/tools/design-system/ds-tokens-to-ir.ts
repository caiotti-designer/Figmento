// ═══════════════════════════════════════════════════════════
// tokens.yaml → DESIGN.md IR converter (inverse of ds-md-to-tokens.ts)
// DMD-4: export_design_system_to_md
// ═══════════════════════════════════════════════════════════

import type { DesignMdIR, DesignMdFrontmatter, DesignMdSections } from './ds-md-types';

/**
 * Convert a tokens.yaml object (as loaded by js-yaml) to the DESIGN.md
 * intermediate representation. This is the inverse of `irToTokens`.
 */
export function tokensToIR(tokens: Record<string, unknown>): DesignMdIR {
  const frontmatter: DesignMdFrontmatter = {
    name: (tokens.name as string) || 'unnamed',
    version: '1.0.0',
    created: (tokens.created as string) || new Date().toISOString(),
    schema_version: '1.0',
  };
  if (tokens.source) frontmatter.source_url = tokens.source as string;
  if (tokens.preset_used !== undefined) frontmatter.preset_used = tokens.preset_used as string | null;

  const sections: DesignMdSections = {};

  // ─── Visual Theme & Atmosphere ─────────────────────────────────────
  const mood = tokens.mood as string[] | undefined;
  const voice = tokens.voice as string | undefined;
  if (mood || voice) {
    sections.visual_theme_atmosphere = {};
    if (mood && mood.length > 0) sections.visual_theme_atmosphere.mood = mood;
    if (voice) sections.visual_theme_atmosphere.prose = voice;
  }

  // ─── Color Palette & Roles ─────────────────────────────────────────
  const colors = tokens.colors as Record<string, string> | undefined;
  const gradients = tokens.gradients as Record<string, unknown> | undefined;
  if (colors || gradients) {
    sections.color_palette_roles = {};
    if (colors) sections.color_palette_roles.color = colors;
    if (gradients) sections.color_palette_roles.gradient = gradients as DesignMdSections['color_palette_roles'] extends { gradient?: infer G } ? G : never;
  }

  // ─── Typography Rules ──────────────────────────────────────────────
  const typo = tokens.typography as Record<string, unknown> | undefined;
  if (typo) {
    sections.typography_rules = {};
    const fontFamily: Record<string, unknown> = {};
    if (typo.heading) fontFamily.heading = typo.heading;
    if (typo.body) fontFamily.body = typo.body;
    if (typo.mono) fontFamily.mono = typo.mono;
    if (typo.opentype_features) fontFamily.opentype_features = typo.opentype_features;
    if (typo.tabular_features) fontFamily.tabular_features = typo.tabular_features;
    if (Object.keys(fontFamily).length > 0) {
      sections.typography_rules.font_family = fontFamily as DesignMdSections['typography_rules'] extends { font_family?: infer F } ? F : never;
    }
    if (typo.scale) sections.typography_rules.type_scale = typo.scale as Record<string, number>;
    if (typo.letter_spacing) sections.typography_rules.letter_spacing = typo.letter_spacing as Record<string, string>;
  }

  // ─── Layout Principles ─────────────────────────────────────────────
  const spacing = tokens.spacing as Record<string, number> | undefined;
  const radius = tokens.radius as Record<string, number> | undefined;
  if (spacing || radius) {
    sections.layout_principles = {};
    if (spacing) sections.layout_principles.spacing = spacing as DesignMdSections['layout_principles'] extends { spacing?: infer S } ? S : never;
    if (radius) sections.layout_principles.radius = radius as DesignMdSections['layout_principles'] extends { radius?: infer R } ? R : never;
  }

  // ─── Depth & Elevation ─────────────────────────────────────────────
  const shadows = tokens.shadows as Record<string, unknown> | undefined;
  const elevation = tokens.elevation as Record<string, unknown> | undefined;
  if (shadows || elevation) {
    sections.depth_elevation = {};
    if (shadows) sections.depth_elevation.shadow = shadows as DesignMdSections['depth_elevation'] extends { shadow?: infer S } ? S : never;
    if (elevation) sections.depth_elevation.elevation = elevation as DesignMdSections['depth_elevation'] extends { elevation?: infer E } ? E : never;
  }

  // ─── Do's and Don'ts ──────────────────────────────────────────────
  const constraints = tokens.constraints as { do?: string[]; dont?: string[] } | undefined;
  if (constraints) {
    sections.dos_and_donts = {};
    if (constraints.do) sections.dos_and_donts.do = constraints.do;
    if (constraints.dont) sections.dos_and_donts.dont = constraints.dont;
  }

  // ─── Format Variants ──────────────────────────────────────────────
  const formatVariants = tokens.format_variants as Record<string, Record<string, unknown>> | undefined;

  return JSON.parse(JSON.stringify({
    frontmatter,
    sections,
    ...(formatVariants ? { format_variants: formatVariants } : {}),
  })) as DesignMdIR;
}
