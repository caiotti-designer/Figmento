import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';

// ═══════════════════════════════════════════════════════════
// Paths
// ═══════════════════════════════════════════════════════════

function getKnowledgeDir(): string {
  return nodePath.join(__dirname, '..', 'knowledge');
}

function getDesignSystemsDir(): string {
  return nodePath.join(getKnowledgeDir(), 'design-systems');
}

function getPresetsDir(): string {
  return nodePath.join(getKnowledgeDir(), 'presets');
}

function getFormatsDir(): string {
  return nodePath.join(getKnowledgeDir(), 'formats');
}

// ═══════════════════════════════════════════════════════════
// Color Utilities
// ═══════════════════════════════════════════════════════════

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function lighten(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.min(1, l + amount));
}

function darken(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - amount));
}

function rotateHue(hex: string, degrees: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h + degrees, s, l);
}

function desaturate(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, Math.max(0, s - amount), l);
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function bestTextColor(bg: string): string {
  return contrastRatio('#FFFFFF', bg) >= contrastRatio('#000000', bg) ? '#FFFFFF' : '#000000';
}

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
// DS-01: Token Auto-Generation Engine
// ═══════════════════════════════════════════════════════════

interface DesignTokens {
  name: string;
  created: string;
  preset_used: string | null;
  mood: string[];
  voice: string | null;
  colors: {
    primary: string;
    primary_light: string;
    primary_dark: string;
    secondary: string;
    accent: string;
    surface: string;
    background: string;
    border: string;
    on_primary: string;
    on_surface: string;
    on_surface_muted: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  typography: {
    heading: { family: string; weights: number[] };
    body: { family: string; weights: number[] };
    scale: {
      display: number;
      h1: number;
      h2: number;
      h3: number;
      body_lg: number;
      body: number;
      body_sm: number;
      caption: number;
    };
  };
  spacing: {
    unit: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    '2xl': number;
    '3xl': number;
  };
  radius: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    full: number;
  };
  shadows: {
    sm: { x: number; y: number; blur: number; spread: number; color: string; opacity: number };
    md: { x: number; y: number; blur: number; spread: number; color: string; opacity: number };
    lg: { x: number; y: number; blur: number; spread: number; color: string; opacity: number };
  };
}

interface PresetDefaults {
  name: string;
  description: string;
  defaults: {
    primary: string;
    secondary: string;
    accent: string;
    surface?: string;
    background?: string;
    border?: string;
    heading_font: string;
    body_font: string;
    radius: { sm: number; md: number; lg: number };
    shadows: 'none' | 'subtle' | 'pronounced';
    spacing_unit: number;
    style?: string;
  };
}

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

function generateTokens(opts: {
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

  // Spacing
  const unit = preset?.spacing_unit || 8;

  // Radius
  const radius = preset?.radius || { sm: 4, md: 8, lg: 12 };

  // Shadows
  const shadowLevel = preset?.shadows || 'subtle';
  const shadows = generateShadows(shadowLevel, primary);

  // Type scale (major third 1.25)
  const baseSize = 16;
  const ratio = 1.25;
  const scale = {
    display: Math.round(baseSize * Math.pow(ratio, 6)),
    h1: Math.round(baseSize * Math.pow(ratio, 5)),
    h2: Math.round(baseSize * Math.pow(ratio, 4)),
    h3: Math.round(baseSize * Math.pow(ratio, 3)),
    body_lg: Math.round(baseSize * ratio),
    body: baseSize,
    body_sm: Math.round(baseSize / ratio),
    caption: Math.round(baseSize / (ratio * ratio)),
  };

  return {
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
      full: 9999,
    },
    shadows,
  };
}

// ═══════════════════════════════════════════════════════════
// DS-04 helper: dot-path set/get on nested objects
// ═══════════════════════════════════════════════════════════

function getByDotPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const key of parts) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setByDotPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

// ═══════════════════════════════════════════════════════════
// DS-05: Token Resolution Engine
// ═══════════════════════════════════════════════════════════

function resolveTokens(
  recipe: Record<string, unknown>,
  tokens: Record<string, unknown>,
  props: Record<string, unknown>,
  componentName?: string,
): Record<string, unknown> {
  function resolveValue(value: unknown, key?: string): unknown {
    if (typeof value === 'string') {
      // $tokens.* reference
      if (value.startsWith('$tokens.')) {
        const tokenPath = value.slice('$tokens.'.length);
        const resolved = getByDotPath(tokens, tokenPath);
        if (resolved === undefined) {
          console.warn(`[design-system] Unknown token path: ${value}`);
          return value;
        }
        return resolved;
      }
      // {{propName}} substitution
      if (value.includes('{{') && value.includes('}}')) {
        return value.replace(/\{\{(\w+)\}\}/g, (_match, propName: string) => {
          if (props[propName] === undefined) {
            throw new Error(
              `Component '${componentName || 'unknown'}' requires prop '${propName}'`
            );
          }
          return String(props[propName]);
        });
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item, i) => resolveValue(item, `${key || ''}[${i}]`));
    }
    if (typeof value === 'object' && value !== null) {
      return resolveObject(value as Record<string, unknown>);
    }
    return value;
  }

  function resolveObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveValue(v, k);
    }
    return result;
  }

  return resolveObject(recipe);
}

// ═══════════════════════════════════════════════════════════
// DS-06: Component Recipe Loader
// ═══════════════════════════════════════════════════════════

interface ComponentPropDef {
  type: string;
  required?: boolean;
  default?: unknown;
  values?: string[];
}

interface ComponentRecipe {
  description: string;
  props: Record<string, ComponentPropDef>;
  recipe: Record<string, unknown>;
  variants?: Record<string, Record<string, unknown>>;
  size_overrides?: Record<string, Record<string, unknown>>;
}

let componentCache: Record<string, ComponentRecipe> | null = null;

function loadComponents(): Record<string, ComponentRecipe> {
  if (componentCache) return componentCache;
  const filePath = nodePath.join(getKnowledgeDir(), 'components', 'core.yaml');
  if (!fs.existsSync(filePath)) {
    throw new Error('Component recipes not found at knowledge/components/core.yaml');
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  componentCache = yaml.load(content) as Record<string, ComponentRecipe>;
  return componentCache;
}

function getComponentRecipe(componentName: string): ComponentRecipe {
  const components = loadComponents();
  const component = components[componentName];
  if (!component) {
    const available = Object.keys(components);
    throw new Error(`Component not found: ${componentName}. Available: ${available.join(', ')}`);
  }
  return component;
}

// Deep merge: target values are overwritten by source values.
// Special handling for 'children' arrays: merge by index position.
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const [key, srcVal] of Object.entries(source)) {
    const tgtVal = result[key];
    if (key === 'children' && Array.isArray(tgtVal) && Array.isArray(srcVal)) {
      // Merge children by index: source overrides into corresponding target child
      result[key] = tgtVal.map((child, i) => {
        if (i < srcVal.length && typeof srcVal[i] === 'object' && srcVal[i] !== null) {
          if (typeof child === 'object' && child !== null) {
            return deepMerge(child as Record<string, unknown>, srcVal[i] as Record<string, unknown>);
          }
          return srcVal[i];
        }
        return child;
      });
    } else if (
      typeof srcVal === 'object' && srcVal !== null && !Array.isArray(srcVal) &&
      typeof tgtVal === 'object' && tgtVal !== null && !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// DS-07 helper: Convert resolved recipe → batch_execute commands
// ═══════════════════════════════════════════════════════════

interface BatchCommand {
  action: string;
  params: Record<string, unknown>;
  tempId?: string;
}

function recipeToCommands(
  resolved: Record<string, unknown>,
  opts: { parentId?: string; x?: number; y?: number; componentName?: string; variant?: string },
): BatchCommand[] {
  const commands: BatchCommand[] = [];
  const nodeType = resolved.type as string;
  const children = resolved.children as Array<Record<string, unknown>> | undefined;

  // Map recipe type to Figma create action
  const actionMap: Record<string, string> = {
    frame: 'create_frame',
    text: 'create_text',
    rectangle: 'create_rectangle',
    ellipse: 'create_ellipse',
  };
  const action = actionMap[nodeType];
  if (!action) {
    throw new Error(`Unknown recipe element type: ${nodeType}`);
  }

  // Build root command params
  const rootParams: Record<string, unknown> = {};
  const skipKeys = new Set(['type', 'children', 'stroke', 'effects']);

  for (const [key, val] of Object.entries(resolved)) {
    if (skipKeys.has(key)) continue;
    // Map recipe keys to command params
    if (key === 'content' && nodeType === 'text') {
      rootParams.text = val;
    } else {
      rootParams[key] = val;
    }
  }

  // Apply positioning and parentId
  if (opts.x !== undefined) rootParams.x = opts.x;
  if (opts.y !== undefined) rootParams.y = opts.y;
  if (opts.parentId) rootParams.parentId = opts.parentId;

  // Set descriptive name
  const variant = opts.variant || 'default';
  rootParams.name = (resolved.name as string) || `${opts.componentName || 'Component'}_${variant}`;

  const rootTempId = 'comp_root';
  commands.push({ action, params: rootParams, tempId: rootTempId });

  // Handle stroke (applied after creation)
  const stroke = resolved.stroke as Record<string, unknown> | undefined;
  if (stroke && stroke.color) {
    commands.push({
      action: 'set_stroke',
      params: {
        nodeId: `$${rootTempId}`,
        color: stroke.color,
        width: stroke.width || 1,
      },
    });
  }

  // Handle effects (applied after creation)
  const effects = resolved.effects as Array<Record<string, unknown>> | undefined;
  if (effects && effects.length > 0) {
    commands.push({
      action: 'set_effects',
      params: {
        nodeId: `$${rootTempId}`,
        effects: effects.map(e => ({
          type: e.type || 'DROP_SHADOW',
          color: e.color as string,
          opacity: e.opacity as number,
          offset: e.offset || { x: 0, y: 0 },
          blur: e.blur || 0,
          spread: e.spread || 0,
        })),
      },
    });
  }

  // Handle auto-layout for frames
  if (nodeType === 'frame' && resolved.layoutMode) {
    commands.push({
      action: 'set_auto_layout',
      params: {
        nodeId: `$${rootTempId}`,
        layoutMode: resolved.layoutMode,
        itemSpacing: resolved.itemSpacing,
        paddingTop: resolved.paddingTop,
        paddingRight: resolved.paddingRight,
        paddingBottom: resolved.paddingBottom,
        paddingLeft: resolved.paddingLeft,
        primaryAxisAlignItems: resolved.primaryAxisAlignItems,
        counterAxisAlignItems: resolved.counterAxisAlignItems,
      },
    });
  }

  // Handle children
  if (children && children.length > 0) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childType = child.type as string;
      const childAction = actionMap[childType];
      if (!childAction) continue;

      const childParams: Record<string, unknown> = {
        parentId: `$${rootTempId}`,
      };

      for (const [key, val] of Object.entries(child)) {
        if (key === 'type') continue;
        if (key === 'content' && childType === 'text') {
          childParams.text = val;
        } else {
          childParams[key] = val;
        }
      }

      childParams.name = childParams.name || `${opts.componentName || 'Component'}_child_${i}`;

      commands.push({
        action: childAction,
        params: childParams,
        tempId: `comp_child_${i}`,
      });
    }
  }

  return commands;
}

// ═══════════════════════════════════════════════════════════
// Tool Registration
// ═══════════════════════════════════════════════════════════

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function registerDesignSystemTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  // ═══════════════════════════════════════════════════════════
  // DS-03: create_design_system
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'create_design_system',
    'Create a complete design system with auto-generated tokens from minimal input. Provide a name plus any combination of: preset, colors, fonts, or mood keywords. Missing values are auto-generated using color theory.',
    {
      name: z.string().describe('Design system name (lowercase, e.g. "payflow")'),
      preset: z.string().optional().describe('Library preset: shadcn, material, minimal, luxury, or vibrant'),
      primary_color: z.string().optional().describe('Primary brand color hex (e.g. "#2563EB")'),
      secondary_color: z.string().optional().describe('Secondary color hex'),
      accent_color: z.string().optional().describe('Accent color hex'),
      heading_font: z.string().optional().describe('Heading font family (e.g. "Inter")'),
      body_font: z.string().optional().describe('Body font family'),
      mood: z.array(z.string()).optional().describe('Mood keywords like ["fintech", "modern", "trust"]'),
      voice: z.string().optional().describe('Brand voice description'),
    },
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
      const systemDir = nodePath.join(getDesignSystemsDir(), safeName);
      if (!fs.existsSync(systemDir)) {
        fs.mkdirSync(systemDir, { recursive: true });
      }
      const tokensPath = nodePath.join(systemDir, 'tokens.yaml');
      fs.writeFileSync(tokensPath, yaml.dump(tokens, { lineWidth: 120 }), 'utf-8');

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

  // ═══════════════════════════════════════════════════════════
  // DS-04: get_design_system
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_design_system',
    'Load an existing design system by name. Returns the complete token object (colors, fonts, spacing, radius, shadows).',
    {
      name: z.string().describe('Design system name'),
    },
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

  // ═══════════════════════════════════════════════════════════
  // DS-04: list_design_systems
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'list_design_systems',
    'List all saved design systems with summary info (name, preset used, primary color).',
    {},
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

  // ═══════════════════════════════════════════════════════════
  // DS-04: update_design_system
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'update_design_system',
    'Update specific tokens in an existing design system using dot-path keys. Example: { "colors.primary": "#FF0000" }',
    {
      name: z.string().describe('Design system name'),
      changes: z.record(z.string(), z.unknown()).describe('Dot-path keys to update, e.g. { "colors.primary": "#FF0000", "typography.heading.family": "Merriweather" }'),
    },
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

  // ═══════════════════════════════════════════════════════════
  // DS-04: delete_design_system
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'delete_design_system',
    'Delete a design system and all its files.',
    {
      name: z.string().describe('Design system name to delete'),
    },
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

  // ═══════════════════════════════════════════════════════════
  // DS-07: create_component
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'create_component',
    'Instantiate a design system component on the Figma canvas. Loads tokens from the named design system, resolves the component recipe, and sends batch commands to create the element. Components: button, badge, card, divider, avatar.',
    {
      system: z.string().describe('Design system name (e.g. "payflow")'),
      component: z.string().describe('Component name: button, badge, card, divider, avatar'),
      variant: z.string().optional().describe('Component variant (e.g. "secondary", "ghost", "outlined")'),
      size: z.string().optional().describe('Size variant: sm, md, lg, xl'),
      props: z.record(z.unknown()).optional().describe('Component props, e.g. { label: "Get Started" }'),
      parentId: z.string().optional().describe('Parent frame nodeId to place component inside'),
      x: z.coerce.number().optional().describe('X position'),
      y: z.coerce.number().optional().describe('Y position'),
    },
    async (params: {
      system: string; component: string; variant?: string; size?: string;
      props?: Record<string, unknown>; parentId?: string; x?: number; y?: number;
    }) => {
      // 1. Load design system tokens
      const safeName = params.system.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');
      if (!fs.existsSync(tokensPath)) {
        const available = listAvailableSystems();
        throw new Error(
          `Design system not found: ${safeName}. Available: ${available.length > 0 ? available.join(', ') : '(none created yet)'}`
        );
      }
      const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(tokensContent) as Record<string, unknown>;

      // 2. Load component recipe
      const componentDef = getComponentRecipe(params.component);

      // 3. Validate required props
      const componentProps = params.props || {};
      for (const [propName, propDef] of Object.entries(componentDef.props)) {
        if (propDef.required && componentProps[propName] === undefined) {
          throw new Error(
            `Component '${params.component}' requires prop '${propName}'`
          );
        }
        // Apply defaults
        if (componentProps[propName] === undefined && propDef.default !== undefined) {
          componentProps[propName] = propDef.default;
        }
      }

      // 4. Start with base recipe
      let recipe = JSON.parse(JSON.stringify(componentDef.recipe)) as Record<string, unknown>;

      // 5. Apply variant overrides
      const variant = params.variant || 'default';
      if (variant !== 'default' && variant !== 'primary' && componentDef.variants) {
        const variantOverrides = componentDef.variants[variant];
        if (!variantOverrides) {
          const available = Object.keys(componentDef.variants);
          throw new Error(
            `Variant '${variant}' not found for '${params.component}'. Available: ${available.join(', ')}`
          );
        }
        recipe = deepMerge(recipe, variantOverrides);
      }

      // 6. Apply size overrides
      if (params.size && componentDef.size_overrides) {
        const sizeOverrides = componentDef.size_overrides[params.size];
        if (!sizeOverrides) {
          const available = Object.keys(componentDef.size_overrides);
          throw new Error(
            `Size '${params.size}' not found for '${params.component}'. Available: ${available.join(', ')}`
          );
        }
        recipe = deepMerge(recipe, sizeOverrides);
      }

      // 7. Resolve token references and prop substitutions
      const resolved = resolveTokens(recipe, tokens, componentProps, params.component);

      // 8. Convert to batch commands
      const commands = recipeToCommands(resolved, {
        parentId: params.parentId,
        x: params.x,
        y: params.y,
        componentName: params.component,
        variant,
      });

      // 9. Execute via batch_execute
      const data = await sendDesignCommand('batch_execute', { commands });

      // 10. Extract result info
      const results = (data as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined;
      const rootResult = results?.[0];
      const nodeId = rootResult?.nodeId || rootResult?.id || 'unknown';

      const childCount = (resolved.children as unknown[] | undefined)?.length || 0;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            nodeId,
            name: `${params.component}_${variant}`,
            component: params.component,
            variant,
            size: params.size || 'md',
            childCount,
            batchResults: data,
          }, null, 2),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-08: list_components
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'list_components',
    'List all available design system components with their variants, props, and descriptions.',
    {
      system: z.string().optional().describe('Design system name (currently unused, reserved for future brand-specific overrides)'),
    },
    async () => {
      const components = loadComponents();
      const result = Object.entries(components).map(([name, def]) => ({
        name,
        description: def.description,
        variants: def.variants ? Object.keys(def.variants) : ['default'],
        sizes: def.size_overrides ? Object.keys(def.size_overrides) : [],
        props: Object.entries(def.props).map(([propName, propDef]) => ({
          name: propName,
          type: propDef.type,
          required: propDef.required || false,
          default: propDef.default,
          values: propDef.values,
        })),
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-12: get_format_rules
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_format_rules',
    'Get complete format adapter rules for a specific output format (dimensions, safe zones, typography scale, layout rules). For presentation formats, optionally specify a slide_type.',
    {
      format: z.string().describe('Format name, e.g. "instagram_post", "business_card", "slide_16_9"'),
      slide_type: z.string().optional().describe('Slide type for presentation formats, e.g. "title_slide", "content_slide"'),
    },
    async (params) => {
      const formatName = params.format.toLowerCase().trim();
      const formatsDir = getFormatsDir();

      // Search across all category subdirectories
      const categories = ['social', 'print', 'presentation'];
      let formatData: Record<string, unknown> | null = null;

      for (const category of categories) {
        const filePath = nodePath.join(formatsDir, category, `${formatName}.yaml`);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          formatData = yaml.load(content) as Record<string, unknown>;
          break;
        }
      }

      if (!formatData) {
        // List available formats for helpful error
        const available = listAvailableFormats();
        const names = available.map(f => f.name);
        throw new Error(`Format not found: ${formatName}. Available: ${names.join(', ')}`);
      }

      // If slide_type requested and this is a presentation format, extract that slide type
      if (params.slide_type && formatData.slide_types) {
        const slideTypes = formatData.slide_types as Record<string, unknown>;
        const slideType = slideTypes[params.slide_type];
        if (!slideType) {
          const available = Object.keys(slideTypes);
          throw new Error(`Slide type not found: ${params.slide_type}. Available: ${available.join(', ')}`);
        }
        // Return the full format data plus the specific slide type highlighted
        formatData = {
          ...formatData,
          requested_slide_type: params.slide_type,
          slide_type_details: slideType,
        };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(formatData, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-12: list_formats
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'list_formats',
    'List all available format adapters (social, print, presentation). Optionally filter by category.',
    {
      category: z.enum(['social', 'print', 'presentation']).optional().describe('Filter by category. Omit to list all formats grouped by category.'),
    },
    async (params) => {
      const allFormats = listAvailableFormats();

      if (params.category) {
        const filtered = allFormats.filter(f => f.category === params.category);
        return { content: [{ type: 'text' as const, text: JSON.stringify(filtered, null, 2) }] };
      }

      // Group by category
      const grouped: Record<string, typeof allFormats> = {};
      for (const format of allFormats) {
        if (!grouped[format.category]) grouped[format.category] = [];
        grouped[format.category].push(format);
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(grouped, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-13: scan_frame_structure
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'scan_frame_structure',
    'Deep-scan a Figma frame and return its complete structure tree (types, positions, sizes, styles, text content, children). Enables clone+customize and template analysis workflows.',
    {
      nodeId: z.string().describe('The nodeId of the frame to scan'),
      depth: z.coerce.number().optional().default(5).describe('Maximum depth to recurse (default: 5)'),
      include_styles: z.boolean().optional().default(true).describe('Include fill, stroke, effect, and text style properties (default: true)'),
    },
    async (params) => {
      const data = await sendDesignCommand('scan_frame_structure', {
        nodeId: params.nodeId,
        depth: params.depth,
        include_styles: params.include_styles,
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function listAvailableSystems(): string[] {
  const dir = getDesignSystemsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

function listAvailableFormats(): Array<{ name: string; category: string; dimensions: { width: number; height: number }; description: string }> {
  const formatsDir = getFormatsDir();
  if (!fs.existsSync(formatsDir)) return [];

  const results: Array<{ name: string; category: string; dimensions: { width: number; height: number }; description: string }> = [];
  const categories = ['social', 'print', 'presentation'];

  for (const category of categories) {
    const catDir = nodePath.join(formatsDir, category);
    if (!fs.existsSync(catDir)) continue;

    const files = fs.readdirSync(catDir).filter(f => f.endsWith('.yaml'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(nodePath.join(catDir, file), 'utf-8');
        const data = yaml.load(content) as Record<string, unknown>;
        const dims = data.dimensions as Record<string, unknown> | undefined;
        results.push({
          name: data.name as string || file.replace('.yaml', ''),
          category: data.category as string || category,
          dimensions: {
            width: (dims?.width as number) || 0,
            height: (dims?.height as number) || 0,
          },
          description: (data.description as string) || '',
        });
      } catch {
        // Skip malformed files
      }
    }
  }

  return results;
}
