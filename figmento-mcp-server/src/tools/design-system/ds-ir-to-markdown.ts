// ═══════════════════════════════════════════════════════════
// DESIGN.md IR → Markdown renderer (canonical output)
// DMD-4: export_design_system_to_md
// Produces deterministic, human-readable DESIGN.md files from the IR.
// Key ordering is canonical so round-trip is byte-reproducible.
// ═══════════════════════════════════════════════════════════

import * as yaml from 'js-yaml';
import type { DesignMdIR } from './ds-md-types';

// ─── Canonical key orderings ─────────────────────────────────────────

const CANONICAL_COLOR_ORDER = [
  'primary', 'primary_light', 'primary_dark', 'secondary', 'accent',
  'surface', 'background', 'border', 'on_primary', 'on_surface',
  'on_surface_muted', 'success', 'warning', 'error', 'info',
];

const CANONICAL_SCALE_ORDER = [
  'display', 'h1', 'h2', 'h3', 'heading', 'body_lg', 'body', 'body_sm',
  'caption', 'label',
];

const CANONICAL_SPACING_ORDER = ['unit', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];
const CANONICAL_RADIUS_ORDER = ['none', 'sm', 'md', 'lg', 'xl', 'full'];
const CANONICAL_SHADOW_ORDER = ['sm', 'md', 'lg'];
const SHADOW_FIELD_ORDER = ['x', 'y', 'blur', 'spread', 'color', 'opacity'];

const PLACEHOLDER = '_Not specified in tokens.yaml — add prose here if authoring the design system by hand._';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Reorder object keys: canonical first in order, then remaining alphabetically. */
function reorder(obj: Record<string, unknown>, canonical: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of canonical) {
    if (key in obj) result[key] = obj[key];
  }
  const remaining = Object.keys(obj).filter(k => !canonical.includes(k)).sort();
  for (const key of remaining) {
    result[key] = obj[key];
  }
  return result;
}

/** Reorder shadow layer sub-keys to canonical order. */
function reorderShadow(shadow: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const level of CANONICAL_SHADOW_ORDER) {
    if (level in shadow) {
      const layer = shadow[level] as Record<string, unknown>;
      const ordered: Record<string, unknown> = {};
      for (const f of SHADOW_FIELD_ORDER) {
        if (f in layer) ordered[f] = layer[f];
      }
      result[level] = ordered;
    }
  }
  return result;
}

/** Dump a YAML block body with quoted strings, bare numbers, 2-space indent. */
function dumpBlock(obj: Record<string, unknown>): string {
  return yaml.dump(obj, {
    quotingType: '"',
    forceQuotes: false,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  }).trimEnd();
}

// ─── Main renderer ───────────────────────────────────────────────────

/**
 * Render a DESIGN.md IR to canonical markdown string.
 *
 * Ordering rules (per DMD-4 AC6):
 * - Sections always in the 9-canonical order from DESIGN-MD-SPEC.md §4
 * - Fenced-block keys in canonical order per block type
 * - Extended keys (beyond canonical) sorted alphabetically
 */
export function renderMarkdown(ir: DesignMdIR): string {
  const lines: string[] = [];

  // ─── Frontmatter ───────────────────────────────────────────────────
  const fm: Record<string, unknown> = {};
  fm.name = ir.frontmatter.name;
  if (ir.frontmatter.version) fm.version = ir.frontmatter.version;
  fm.created = ir.frontmatter.created;
  if (ir.frontmatter.source_url) fm.source_url = ir.frontmatter.source_url;
  if (ir.frontmatter.preset_used !== undefined) fm.preset_used = ir.frontmatter.preset_used;
  if (ir.frontmatter.schema_version) fm.schema_version = ir.frontmatter.schema_version;

  lines.push('---');
  lines.push(yaml.dump(fm, { quotingType: '"', forceQuotes: true, lineWidth: 120, noRefs: true, sortKeys: false }).trimEnd());
  lines.push('---');
  lines.push('');

  const s = ir.sections;

  // ─── 1. Visual Theme & Atmosphere ──────────────────────────────────
  lines.push('## Visual Theme & Atmosphere');
  lines.push('');
  if (s.visual_theme_atmosphere?.prose) {
    lines.push(s.visual_theme_atmosphere.prose);
    lines.push('');
  }
  if (s.visual_theme_atmosphere?.mood && s.visual_theme_atmosphere.mood.length > 0) {
    lines.push(`**Mood**: ${s.visual_theme_atmosphere.mood.join(', ')}`);
    lines.push('');
  }
  if (!s.visual_theme_atmosphere?.prose && !s.visual_theme_atmosphere?.mood) {
    lines.push(PLACEHOLDER);
    lines.push('');
  }

  // ─── 2. Color Palette & Roles ──────────────────────────────────────
  lines.push('## Color Palette & Roles');
  lines.push('');
  if (s.color_palette_roles?.color) {
    const ordered = reorder(s.color_palette_roles.color, CANONICAL_COLOR_ORDER);
    lines.push('```color');
    lines.push(dumpBlock(ordered));
    lines.push('```');
    lines.push('');
  }
  if (s.color_palette_roles?.gradient) {
    const g = s.color_palette_roles.gradient;
    const gradObj: Record<string, unknown> = { enabled: g.enabled };
    if (g.direction) gradObj.direction = g.direction;
    if (g.colors) gradObj.colors = g.colors;
    if (g.note) gradObj.note = g.note;
    lines.push('```gradient');
    lines.push(dumpBlock(gradObj));
    lines.push('```');
    lines.push('');
  }
  if (!s.color_palette_roles?.color && !s.color_palette_roles?.gradient) {
    lines.push(PLACEHOLDER);
    lines.push('');
  }

  // ─── 3. Typography Rules ───────────────────────────────────────────
  lines.push('## Typography Rules');
  lines.push('');
  if (s.typography_rules?.font_family) {
    const ff = s.typography_rules.font_family;
    const ffObj: Record<string, unknown> = {};
    if (ff.heading) ffObj.heading = ff.heading;
    if (ff.body) ffObj.body = ff.body;
    if (ff.mono) ffObj.mono = ff.mono;
    if (ff.opentype_features) ffObj.opentype_features = ff.opentype_features;
    if (ff.tabular_features) ffObj.tabular_features = ff.tabular_features;
    lines.push('```font-family');
    lines.push(dumpBlock(ffObj));
    lines.push('```');
    lines.push('');
  }
  if (s.typography_rules?.type_scale) {
    const ordered = reorder(s.typography_rules.type_scale, CANONICAL_SCALE_ORDER);
    lines.push('```type-scale');
    lines.push(dumpBlock(ordered));
    lines.push('```');
    lines.push('');
  }
  if (s.typography_rules?.letter_spacing) {
    const ordered = reorder(s.typography_rules.letter_spacing, CANONICAL_SCALE_ORDER);
    lines.push('```letter-spacing');
    lines.push(dumpBlock(ordered));
    lines.push('```');
    lines.push('');
  }
  if (!s.typography_rules?.font_family && !s.typography_rules?.type_scale) {
    lines.push(PLACEHOLDER);
    lines.push('');
  }

  // ─── 4. Component Stylings ─────────────────────────────────────────
  lines.push('## Component Stylings');
  lines.push('');
  if (s.component_stylings?.prose) {
    lines.push(s.component_stylings.prose);
    lines.push('');
  } else {
    lines.push(PLACEHOLDER);
    lines.push('');
  }

  // ─── 5. Layout Principles ──────────────────────────────────────────
  lines.push('## Layout Principles');
  lines.push('');
  if (s.layout_principles?.spacing) {
    const ordered = reorder(s.layout_principles.spacing as unknown as Record<string, unknown>, CANONICAL_SPACING_ORDER);
    lines.push('```spacing');
    lines.push(dumpBlock(ordered));
    lines.push('```');
    lines.push('');
  }
  if (s.layout_principles?.radius) {
    const ordered = reorder(s.layout_principles.radius as unknown as Record<string, unknown>, CANONICAL_RADIUS_ORDER);
    lines.push('```radius');
    lines.push(dumpBlock(ordered));
    lines.push('```');
    lines.push('');
  }
  if (!s.layout_principles?.spacing && !s.layout_principles?.radius) {
    lines.push(PLACEHOLDER);
    lines.push('');
  }

  // ─── 6. Depth & Elevation ──────────────────────────────────────────
  lines.push('## Depth & Elevation');
  lines.push('');
  if (s.depth_elevation?.shadow) {
    const ordered = reorderShadow(s.depth_elevation.shadow as unknown as Record<string, unknown>);
    lines.push('```shadow');
    lines.push(dumpBlock(ordered));
    lines.push('```');
    lines.push('');
  }
  if (s.depth_elevation?.elevation) {
    lines.push('```elevation');
    lines.push(dumpBlock(s.depth_elevation.elevation as unknown as Record<string, unknown>));
    lines.push('```');
    lines.push('');
  }
  if (!s.depth_elevation?.shadow && !s.depth_elevation?.elevation) {
    lines.push(PLACEHOLDER);
    lines.push('');
  }

  // ─── 7. Do's and Don'ts ───────────────────────────────────────────
  lines.push("## Do's and Don'ts");
  lines.push('');
  if (s.dos_and_donts?.do && s.dos_and_donts.do.length > 0) {
    lines.push('### Do');
    lines.push('');
    for (const item of s.dos_and_donts.do) lines.push(`- ${item}`);
    lines.push('');
  }
  if (s.dos_and_donts?.dont && s.dos_and_donts.dont.length > 0) {
    lines.push("### Don't");
    lines.push('');
    for (const item of s.dos_and_donts.dont) lines.push(`- ${item}`);
    lines.push('');
  }
  if (!s.dos_and_donts?.do?.length && !s.dos_and_donts?.dont?.length) {
    lines.push(PLACEHOLDER);
    lines.push('');
  }

  // ─── 8. Responsive Behavior ────────────────────────────────────────
  lines.push('## Responsive Behavior');
  lines.push('');
  lines.push(s.responsive_behavior?.prose || PLACEHOLDER);
  lines.push('');

  // ─── 9. Agent Prompt Guide ─────────────────────────────────────────
  lines.push('## Agent Prompt Guide');
  lines.push('');
  lines.push(s.agent_prompt_guide?.prose || PLACEHOLDER);
  lines.push('');

  return lines.join('\n');
}
