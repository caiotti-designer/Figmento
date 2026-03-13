// ═══════════════════════════════════════════════════════════
// CRUD Tools + Token Generation Engine
// ═══════════════════════════════════════════════════════════

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';
import { hexToHsl, hslToHex, lighten, darken, rotateHue, desaturate, bestTextColor } from '../utils/color';
import { getDesignSystemsDir, getPresetsDir } from '../utils/knowledge-paths';
import { getByDotPath, setByDotPath } from '../utils/tokens';
import {
  createDesignSystemSchema,
  getDesignSystemSchema,
  listDesignSystemsSchema,
  updateDesignSystemSchema,
  deleteDesignSystemSchema,
} from './ds-schemas';
import type { DesignTokens, PresetDefaults, SendDesignCommand } from './ds-types';

// ═══════════════════════════════════════════════════════════
// Mood-to-Preset Mapping
// ═══════════════════════════════════════════════════════════

const MOOD_PRESET_MAP: Record<string, string> = {
  luxury: 'luxury',
  fashion: 'luxury',
  premium: 'luxury',
  elegant: 'luxury',
  dark: 'luxury',
  gold: 'luxury',
  minimal: 'minimal',
  clean: 'minimal',
  monochrome: 'minimal',
  stark: 'minimal',
  simple: 'minimal',
  bold: 'vibrant',
  playful: 'vibrant',
  fun: 'vibrant',
  colorful: 'vibrant',
  energetic: 'vibrant',
  creative: 'vibrant',
  corporate: 'material',
  business: 'material',
  professional: 'material',
  enterprise: 'material',
  tech: 'shadcn',
  fintech: 'shadcn',
  modern: 'shadcn',
  saas: 'shadcn',
  startup: 'shadcn',
  trust: 'shadcn',
  digital: 'shadcn',
};

function selectPresetFromMood(moods: string[]): string | null {
  const votes: Record<string, number> = {};
  for (const mood of moods) {
    const key = mood.toLowerCase().trim();
    const preset = MOOD_PRESET_MAP[key];
    if (preset) {
      votes[preset] = (votes[preset] || 0) + 1;
    }
  }
  if (Object.keys(votes).length === 0) return null;
  return Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
}

// ═══════════════════════════════════════════════════════════
// Preset & Shadow Helpers
// ═══════════════════════════════════════════════════════════

function loadPreset(presetName: string): PresetDefaults {
  const filePath = nodePath.join(getPresetsDir(), `${presetName}.yaml`);
  if (!fs.existsSync(filePath)) {
    const available = fs.readdirSync(getPresetsDir())
      .filter(f => f.endsWith('.yaml'))
      .map(f => f.replace('.yaml', ''));
    throw new Error(`Preset not found: ${presetName}. Available: ${available.join(', ')}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(content) as PresetDefaults;
}

function generateShadows(level: 'none' | 'subtle' | 'pronounced', primaryHex: string) {
  const color = primaryHex;
  if (level === 'none') {
    return {
      sm: { x: 0, y: 0, blur: 0, spread: 0, color, opacity: 0 },
      md: { x: 0, y: 0, blur: 0, spread: 0, color, opacity: 0 },
      lg: { x: 0, y: 0, blur: 0, spread: 0, color, opacity: 0 },
    };
  }
  if (level === 'subtle') {
    return {
      sm: { x: 0, y: 1, blur: 2, spread: 0, color, opacity: 0.05 },
      md: { x: 0, y: 4, blur: 8, spread: -2, color, opacity: 0.08 },
      lg: { x: 0, y: 8, blur: 24, spread: -4, color, opacity: 0.12 },
    };
  }
  // pronounced
  return {
    sm: { x: 0, y: 2, blur: 4, spread: -1, color, opacity: 0.1 },
    md: { x: 0, y: 8, blur: 16, spread: -4, color, opacity: 0.15 },
    lg: { x: 0, y: 16, blur: 48, spread: -8, color, opacity: 0.2 },
  };
}

// ═══════════════════════════════════════════════════════════
// DS-01: Token Auto-Generation Engine
// ═══════════════════════════════════════════════════════════

export function generateTokens(opts: {
  name: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  surface?: string;
  background?: string;
  border?: string;
  heading_font?: string;
  body_font?: string;
  mood?: string[];
  voice?: string;
  preset?: PresetDefaults | null;
  // Vision-extracted fields
  border_radius?: number;
  shadow_style?: 'none' | 'subtle' | 'medium' | 'pronounced';
  spacing_density?: 'compact' | 'normal' | 'spacious';
  has_gradients?: boolean;
  gradient_direction?: string | null;
  gradient_colors?: string[] | null;
}): DesignTokens {
  const preset = opts.preset?.defaults;

  // Resolve colors — explicit > preset > auto-generated
  const primary = opts.primary_color || preset?.primary || '#2563EB';
  const secondary = opts.secondary_color || preset?.secondary || rotateHue(primary, 180);
  const accent = opts.accent_color || preset?.accent || rotateHue(primary, 30);

  const { h: primaryH } = hexToHsl(primary);
  const surface = opts.surface || preset?.surface || hslToHex(primaryH, 0.02, 0.99);
  const background = opts.background || preset?.background || hslToHex(primaryH, 0.03, 0.97);
  const border = opts.border || preset?.border || desaturate(lighten(primary, 0.55), 0.6);

  const on_primary = bestTextColor(primary);
  const on_surface = hslToHex(primaryH, 0.08, 0.09);
  const on_surface_muted = hslToHex(primaryH, 0.05, 0.45);

  // Fonts
  const heading_font = opts.heading_font || preset?.heading_font || 'Inter';
  const body_font = opts.body_font || preset?.body_font || 'Inter';

  // Spacing — vision density overrides preset
  const densityMap: Record<string, number> = { compact: 6, normal: 8, spacious: 10 };
  const unit = (opts.spacing_density && densityMap[opts.spacing_density]) || preset?.spacing_unit || 8;

  // Radius — vision border_radius populates the full scale
  let radius: { sm: number; md: number; lg: number; xl: number };
  if (opts.border_radius != null) {
    const base = opts.border_radius;
    radius = {
      sm: Math.max(2, Math.round(base * 0.5)),
      md: base,
      lg: Math.round(base * 1.5),
      xl: Math.round(base * 2),
    };
  } else {
    const pr = preset?.radius || { sm: 4, md: 8, lg: 12 };
    radius = { sm: pr.sm, md: pr.md, lg: pr.lg, xl: Math.round(pr.lg * 1.5) };
  }

  // Shadows — vision shadow_style overrides preset
  const shadowMap: Record<string, 'none' | 'subtle' | 'pronounced'> = {
    none: 'none', subtle: 'subtle', medium: 'subtle', pronounced: 'pronounced',
  };
  const shadowLevel = (opts.shadow_style && shadowMap[opts.shadow_style]) || preset?.shadows || 'subtle';
  const shadows = generateShadows(shadowLevel, primary);

  // Gradients
  const gradients = opts.has_gradients ? {
    enabled: true,
    direction: opts.gradient_direction || null,
    colors: opts.gradient_colors || null,
  } : undefined;

  // Type scale (major third 1.25)
  const baseSize = 16;
  const scaleRatio = 1.25;
  const h2 = Math.round(baseSize * Math.pow(scaleRatio, 4));
  const scale = {
    display: Math.round(baseSize * Math.pow(scaleRatio, 6)),
    h1: Math.round(baseSize * Math.pow(scaleRatio, 5)),
    h2,
    h3: Math.round(baseSize * Math.pow(scaleRatio, 3)),
    heading: h2,
    body_lg: Math.round(baseSize * scaleRatio),
    body: baseSize,
    body_sm: Math.round(baseSize / scaleRatio),
    caption: Math.round(baseSize / (scaleRatio * scaleRatio)),
  };

  const tokens: DesignTokens = {
    name: opts.name,
    created: new Date().toISOString(),
    preset_used: opts.preset?.name || null,
    mood: opts.mood || [],
    voice: opts.voice || null,
    colors: {
      primary,
      primary_light: lighten(primary, 0.3),
      primary_dark: darken(primary, 0.2),
      secondary,
      accent,
      surface,
      background,
      border,
      on_primary,
      on_surface,
      on_surface_muted,
      success: '#16A34A',
      warning: '#EAB308',
      error: '#DC2626',
      info: '#2563EB',
    },
    typography: {
      heading: { family: heading_font, weights: [600, 700, 800] },
      body: { family: body_font, weights: [400, 500, 600] },
      scale,
    },
    spacing: {
      unit,
      xs: unit / 2,
      sm: unit,
      md: unit * 2,
      lg: unit * 3,
      xl: unit * 4,
      '2xl': unit * 6,
      '3xl': unit * 8,
    },
    radius: {
      none: 0,
      sm: radius.sm,
      md: radius.md,
      lg: radius.lg,
      xl: radius.xl,
      full: 9999,
    },
    shadows,
  };

  if (gradients) tokens.gradients = gradients;

  return tokens;
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

export function listAvailableSystems(): string[] {
  const dir = getDesignSystemsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

// Standalone save function — passed as saveFn callback to ds-extraction
export async function saveDesignSystem(name: string, tokens: DesignTokens): Promise<void> {
  const systemDir = nodePath.join(getDesignSystemsDir(), name);
  if (!fs.existsSync(systemDir)) {
    fs.mkdirSync(systemDir, { recursive: true });
  }
  const tokensPath = nodePath.join(systemDir, 'tokens.yaml');
  fs.writeFileSync(tokensPath, yaml.dump(tokens, { lineWidth: 120 }), 'utf-8');
}

// ═══════════════════════════════════════════════════════════
// Tool Registration
// ═══════════════════════════════════════════════════════════

export function registerCrudTools(server: McpServer, _sendDesignCommand: SendDesignCommand): void {

  server.tool(
    'create_design_system',
    'Create a complete design system with auto-generated tokens from minimal input. Provide a name plus any combination of: preset, colors, fonts, or mood keywords. Missing values are auto-generated using color theory.',
    createDesignSystemSchema,
    async (params: { name: string; preset?: string; primary_color?: string; secondary_color?: string; accent_color?: string; heading_font?: string; body_font?: string; mood?: string[]; voice?: string }) => {
      const safeName = params.name.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      if (!safeName) {
        throw new Error('Invalid name. Use lowercase letters, numbers, and hyphens.');
      }

      // Determine preset: explicit > mood-inferred > null
      let preset: PresetDefaults | null = null;
      let presetName: string | null = params.preset || null;
      if (!presetName && params.mood && params.mood.length > 0) {
        presetName = selectPresetFromMood(params.mood);
      }
      if (presetName) {
        preset = loadPreset(presetName);
      }

      // Generate tokens
      const tokens = generateTokens({
        name: safeName,
        primary_color: params.primary_color,
        secondary_color: params.secondary_color,
        accent_color: params.accent_color,
        heading_font: params.heading_font,
        body_font: params.body_font,
        mood: params.mood,
        voice: params.voice,
        preset,
      });

      // Write to disk
      await saveDesignSystem(safeName, tokens);
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');

      const summary = {
        name: safeName,
        colors: Object.keys(tokens.colors).length,
        fonts: { heading: tokens.typography.heading.family, body: tokens.typography.body.family },
        spacingUnit: tokens.spacing.unit,
        presetUsed: tokens.preset_used,
        path: tokensPath,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.tool(
    'get_design_system',
    'Load an existing design system by name. Returns the complete token object (colors, fonts, spacing, radius, shadows).',
    getDesignSystemSchema,
    async (params) => {
      const safeName = params.name.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');

      if (!fs.existsSync(tokensPath)) {
        // List available systems
        const available = listAvailableSystems();
        throw new Error(
          `Design system not found: ${safeName}. Available: ${available.length > 0 ? available.join(', ') : '(none created yet)'}`
        );
      }

      const content = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(content);
      return { content: [{ type: 'text' as const, text: JSON.stringify(tokens, null, 2) }] };
    }
  );

  server.tool(
    'list_design_systems',
    'List all saved design systems with summary info (name, preset used, primary color).',
    listDesignSystemsSchema,
    async () => {
      const dir = getDesignSystemsDir();
      if (!fs.existsSync(dir)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify([], null, 2) }] };
      }

      const systems: Array<Record<string, unknown>> = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const tokensPath = nodePath.join(dir, entry.name, 'tokens.yaml');
        if (!fs.existsSync(tokensPath)) continue;
        try {
          const content = fs.readFileSync(tokensPath, 'utf-8');
          const tokens = yaml.load(content) as Record<string, unknown>;
          const colors = tokens.colors as Record<string, string> | undefined;
          systems.push({
            name: tokens.name || entry.name,
            created: tokens.created,
            presetUsed: tokens.preset_used,
            primaryColor: colors?.primary,
          });
        } catch {
          // Skip malformed files
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(systems, null, 2) }] };
    }
  );

  server.tool(
    'update_design_system',
    'Update specific tokens in an existing design system using dot-path keys. Example: { "colors.primary": "#FF0000" }',
    updateDesignSystemSchema,
    async (params) => {
      const safeName = params.name.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');

      if (!fs.existsSync(tokensPath)) {
        throw new Error(`Design system not found: ${safeName}`);
      }

      const content = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(content) as Record<string, unknown>;

      const updatedPaths: string[] = [];
      for (const [dotPath, value] of Object.entries(params.changes)) {
        setByDotPath(tokens, dotPath, value);
        updatedPaths.push(dotPath);
      }

      fs.writeFileSync(tokensPath, yaml.dump(tokens, { lineWidth: 120 }), 'utf-8');

      const result = {
        updated: updatedPaths,
        affectedCount: updatedPaths.length,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'delete_design_system',
    'Delete a design system and all its files.',
    deleteDesignSystemSchema,
    async (params) => {
      const safeName = params.name.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const systemDir = nodePath.join(getDesignSystemsDir(), safeName);

      if (!fs.existsSync(systemDir)) {
        throw new Error(`Design system not found: ${safeName}`);
      }

      fs.rmSync(systemDir, { recursive: true, force: true });

      return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, name: safeName }) }] };
    }
  );
}
