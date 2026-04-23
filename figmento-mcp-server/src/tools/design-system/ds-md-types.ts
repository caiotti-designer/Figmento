// ═══════════════════════════════════════════════════════════
// DESIGN.md Intermediate Representation — Shared Types
// Mirror of figmento-mcp-server/schemas/design-md.schema.json
// Consumed by: ds-md-parser.ts, ds-md-validator.ts, DMD-2 importer, DMD-4 exporter
// ═══════════════════════════════════════════════════════════

/** Frontmatter block of a DESIGN.md file. */
export interface DesignMdFrontmatter {
  name: string;
  version?: string;
  created: string;
  source_url?: string;
  figma_file_key?: string | null;
  preset_used?: string | null;
  schema_version?: '1.0';
}

// ─── Fenced-block sub-schemas ──────────────────────────────────────────

export interface ColorBlock {
  [key: string]: string;
}

export interface FontRole {
  family: string;
  figma_fallback?: string;
  fallback?: string;
  weights: number[];
}

export interface FontFamilyBlock {
  heading: FontRole;
  body: FontRole;
  mono?: FontRole;
  opentype_features?: string[];
  tabular_features?: string[];
}

export interface TypeScaleBlock {
  [role: string]: number;
}

export interface LetterSpacingBlock {
  [role: string]: string;
}

export interface SpacingBlock {
  unit: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  '2xl': number;
  '3xl': number;
}

export interface RadiusBlock {
  none: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
}

export interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
}

export interface ShadowBlock {
  sm: ShadowLayer;
  md: ShadowLayer;
  lg: ShadowLayer;
}

export interface ElevationLayer {
  shadow: string;
  background?: string;
  border?: string;
}

export interface ElevationBlock {
  [name: string]: ElevationLayer;
}

export interface GradientBlock {
  enabled: boolean;
  direction?: string;
  colors?: string[];
  note?: string;
}

// ─── Section shapes ────────────────────────────────────────────────────

export interface VisualThemeSection {
  prose?: string;
  mood?: string[];
}

export interface ColorPaletteSection {
  prose?: string;
  color?: ColorBlock;
  gradient?: GradientBlock;
}

export interface TypographySection {
  prose?: string;
  font_family?: FontFamilyBlock;
  type_scale?: TypeScaleBlock;
  letter_spacing?: LetterSpacingBlock;
}

export interface ComponentStylingsSection {
  prose?: string;
}

export interface LayoutSection {
  prose?: string;
  spacing?: SpacingBlock;
  radius?: RadiusBlock;
}

export interface DepthElevationSection {
  prose?: string;
  shadow?: ShadowBlock;
  elevation?: ElevationBlock;
}

export interface DosAndDontsSection {
  do?: string[];
  dont?: string[];
}

export interface ProseOnlySection {
  prose?: string;
}

export interface DesignMdSections {
  visual_theme_atmosphere?: VisualThemeSection;
  color_palette_roles?: ColorPaletteSection;
  typography_rules?: TypographySection;
  component_stylings?: ComponentStylingsSection;
  layout_principles?: LayoutSection;
  depth_elevation?: DepthElevationSection;
  dos_and_donts?: DosAndDontsSection;
  responsive_behavior?: ProseOnlySection;
  agent_prompt_guide?: ProseOnlySection;
}

// ─── Top-level IR ──────────────────────────────────────────────────────

export interface DesignMdIR {
  frontmatter: DesignMdFrontmatter;
  sections: DesignMdSections;
  format_variants?: Record<string, Record<string, unknown>>;
}

// ─── Validation report ─────────────────────────────────────────────────

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type Verdict = 'PASS' | 'CONCERNS' | 'FAIL';

export type IssueCategory =
  | 'schema'
  | 'hex'
  | 'contrast'
  | 'font'
  | 'grid'
  | 'token_reference'
  | 'structure';

export interface ValidationIssue {
  severity: Severity;
  category: IssueCategory;
  message: string;
  suggestion?: string;
  line?: number;
}

export interface ValidationReport {
  verdict: Verdict;
  issues: ValidationIssue[];
}

// ─── Section heading mapping ───────────────────────────────────────────

/**
 * Canonical heading → snake_case key mapping.
 * Parser accepts both `## <Heading>` and `## N. <Heading>` forms (numbered
 * headings come from awesome-design-md upstream files — see DESIGN-MD-SPEC.md §10).
 */
export const HEADING_TO_SECTION_KEY: Readonly<Record<string, keyof DesignMdSections>> = {
  'Visual Theme & Atmosphere': 'visual_theme_atmosphere',
  'Color Palette & Roles': 'color_palette_roles',
  'Typography Rules': 'typography_rules',
  'Component Stylings': 'component_stylings',
  'Layout Principles': 'layout_principles',
  'Depth & Elevation': 'depth_elevation',
  "Do's and Don'ts": 'dos_and_donts',
  'Responsive Behavior': 'responsive_behavior',
  'Agent Prompt Guide': 'agent_prompt_guide',
};

/** Fenced-block language hint → section sub-key mapping. */
export const BLOCK_LANG_TO_KEY: Readonly<Record<string, string>> = {
  color: 'color',
  'font-family': 'font_family',
  'type-scale': 'type_scale',
  'letter-spacing': 'letter_spacing',
  spacing: 'spacing',
  radius: 'radius',
  shadow: 'shadow',
  elevation: 'elevation',
  gradient: 'gradient',
};
