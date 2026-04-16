// ═══════════════════════════════════════════════════════════
// Design System Zod Schemas
// Note: Uses z.string() instead of z.enum() to avoid TS2589
// ═══════════════════════════════════════════════════════════

import { z } from 'zod';

export const createDesignSystemSchema = {
  name: z.string().describe('Design system name (lowercase, e.g. "stripe")'),
  preset: z.string().optional().describe('Library preset: shadcn, material, minimal, luxury, or vibrant'),
  primary_color: z.string().optional().describe('Primary brand color hex (e.g. "#2563EB")'),
  secondary_color: z.string().optional().describe('Secondary color hex'),
  accent_color: z.string().optional().describe('Accent color hex'),
  heading_font: z.string().optional().describe('Heading font family (e.g. "Inter")'),
  body_font: z.string().optional().describe('Body font family'),
  mood: z.array(z.string()).optional().describe('Mood keywords like ["fintech", "modern", "trust"]'),
  voice: z.string().optional().describe('Brand voice description'),
};

export const getDesignSystemSchema = {
  name: z.string().describe('Design system name'),
};

export const listDesignSystemsSchema = {};

export const updateDesignSystemSchema = {
  name: z.string().describe('Design system name'),
  changes: z.record(z.string(), z.unknown()).describe('Dot-path keys to update, e.g. { "colors.primary": "#FF0000", "typography.heading.family": "Merriweather" }'),
};

export const deleteDesignSystemSchema = {
  name: z.string().describe('Design system name to delete'),
};

export const createComponentSchema = {
  system: z.string().describe('Design system name (e.g. "stripe")'),
  component: z.string().describe('Component name: button, badge, card, divider, avatar'),
  variant: z.string().optional().describe('Component variant (e.g. "secondary", "ghost", "outlined")'),
  size: z.string().optional().describe('Size variant: sm, md, lg, xl'),
  props: z.record(z.unknown()).optional().describe('Component props, e.g. { label: "Get Started" }'),
  parentId: z.string().optional().describe('Parent frame nodeId to place component inside'),
  x: z.coerce.number().optional().describe('X position'),
  y: z.coerce.number().optional().describe('Y position'),
};

export const listComponentsSchema = {
  system: z.string().optional().describe('Design system name (currently unused, reserved for future brand-specific overrides)'),
};

export const getFormatRulesSchema = {
  format: z.string().describe('Format name, e.g. "instagram_post", "business_card", "slide_16_9"'),
  slide_type: z.string().optional().describe('Slide type for presentation formats, e.g. "title_slide", "content_slide"'),
};

export const listFormatsSchema = {
  category: z.string().optional().describe('Filter by category: social, print, presentation, advertising, web, email. Omit to list all formats grouped by category.'),
};

export const scanFrameStructureSchema = {
  nodeId: z.string().describe('The nodeId of the frame to scan'),
  depth: z.coerce.number().optional().default(5).describe('Maximum depth to recurse (default: 5)'),
  include_styles: z.boolean().optional().default(true).describe('Include fill, stroke, effect, and text style properties (default: true)'),
};

export const designSystemPreviewSchema = {
  system: z.string().describe('Design system name (e.g. "stripe")'),
  x: z.coerce.number().optional().describe('X position on canvas (default: 0)'),
  y: z.coerce.number().optional().describe('Y position on canvas (default: 0)'),
};

export const generateDesignSystemFromUrlSchema = {
  url: z.string().describe('The website URL to extract design tokens from (e.g. "https://stripe.com")'),
  name: z.string().optional().describe('Design system name (defaults to domain name, e.g. "stripe")'),
  preset: z.string().optional().describe('Optional preset to blend with extracted values: shadcn, material, minimal, luxury, vibrant'),
};

export const refineDesignSystemSchema = {
  name: z.string().describe('Design system name to refine'),
  primary_color: z.string().optional().describe('Exact primary brand color as hex (e.g. "#5E6AD2")'),
  fonts: z.string().optional().describe('Font specification, e.g. "Inter for headings, Georgia for body" or just "Inter for both"'),
  border_radius: z.string().optional().describe('Corner rounding style: sharp (0–2px), slight (4px), medium (8px), rounded (16px), pill (999px)'),
  dark_mode: z.boolean().optional().describe('true = dark background, false = light background'),
  mood: z.array(z.string()).optional().describe('3 words describing brand personality, e.g. ["minimal", "sharp", "focused"]'),
};

export const brandConsistencyCheckSchema = {
  nodeId: z.string().describe('First frame nodeId to check'),
  nodeId2: z.string().optional().describe('Second frame nodeId to compare (optional — cross-frame consistency check)'),
  system: z.string().describe('Design system name to compare against'),
};

// DMD-2: import_design_system_from_md — imports a DESIGN.md as a design system
export const importDesignMdSchema = {
  path: z.string().optional().describe('Path to a DESIGN.md file to import. Provide either `path` OR `content` + `name` (not both). When path is given, name is inferred from the YAML frontmatter or filename.'),
  content: z.string().optional().describe('Inline DESIGN.md markdown text to import. Must also provide `name` when using content mode.'),
  name: z.string().optional().describe('Design system name (kebab-case). Required when using `content` mode; overrides frontmatter name when provided with `path` mode.'),
  previewInFigma: z.boolean().optional().default(false).describe('When true, auto-invoke design_system_preview after saving tokens.yaml. Requires Figma connection — if not connected, succeeds with a warning instead of failing.'),
  overwrite: z.boolean().optional().default(false).describe('When true, overwrite an existing design system with the same name without prompting.'),
};

// DMD-3: validate_design_md — zero side effects (no file writes, no Figma calls)
export const validateDesignMdSchema = {
  path: z.string().optional().describe('Path to a DESIGN.md file to validate. Provide either `path` OR `content` (not both).'),
  content: z.string().optional().describe('Inline DESIGN.md markdown text to validate. Provide either `path` OR `content` (not both).'),
};
