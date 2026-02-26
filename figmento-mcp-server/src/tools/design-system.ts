import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';

// ═══════════════════════════════════════════════════════════
// Paths
// ═══════════════════════════════════════════════════════════

export function getKnowledgeDir(): string {
  return nodePath.join(__dirname, '..', 'knowledge');
}

export function getDesignSystemsDir(): string {
  return nodePath.join(getKnowledgeDir(), 'design-systems');
}

function getPresetsDir(): string {
  return nodePath.join(getKnowledgeDir(), 'presets');
}

export function getFormatsDir(): string {
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
    xl: number;
    full: number;
  };
  shadows: {
    sm: { x: number; y: number; blur: number; spread: number; color: string; opacity: number };
    md: { x: number; y: number; blur: number; spread: number; color: string; opacity: number };
    lg: { x: number; y: number; blur: number; spread: number; color: string; opacity: number };
  };
  gradients?: {
    enabled: boolean;
    direction: string | null;
    colors: string[] | null;
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

export function resolveTokens(
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
  const componentsDir = nodePath.join(getKnowledgeDir(), 'components');
  if (!fs.existsSync(componentsDir)) {
    throw new Error('Components directory not found at knowledge/components/');
  }
  const merged: Record<string, ComponentRecipe> = {};
  const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.yaml'));
  if (files.length === 0) {
    throw new Error('No component YAML files found in knowledge/components/');
  }
  for (const file of files) {
    const content = fs.readFileSync(nodePath.join(componentsDir, file), 'utf-8');
    const data = yaml.load(content) as Record<string, ComponentRecipe>;
    Object.assign(merged, data);
  }
  componentCache = merged;
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
export function deepMerge(
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

export function recipeToCommands(
  resolved: Record<string, unknown>,
  opts: { parentId?: string; x?: number; y?: number; componentName?: string; variant?: string },
): BatchCommand[] {
  const commands: BatchCommand[] = [];
  const componentName = opts.componentName || 'Component';
  const variant = opts.variant || 'default';

  // Map recipe type to Figma create action
  const actionMap: Record<string, string> = {
    frame: 'create_frame',
    text: 'create_text',
    rectangle: 'create_rectangle',
    ellipse: 'create_ellipse',
  };

  const skipKeys = new Set(['type', 'children', 'stroke', 'effects']);

  // Recursive helper — processes a single node and all its descendants
  function processNode(
    node: Record<string, unknown>,
    parentTempId: string | null,
    tempId: string,
  ): void {
    const nodeType = node.type as string;
    const action = actionMap[nodeType];
    if (!action) return;

    const nodeChildren = node.children as Array<Record<string, unknown>> | undefined;
    const params: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(node)) {
      if (skipKeys.has(key)) continue;
      if (key === 'content' && nodeType === 'text') {
        params.text = val;
      } else {
        params[key] = val;
      }
    }

    if (parentTempId) {
      params.parentId = `$${parentTempId}`;
    } else {
      // Root node: apply canvas positioning
      if (opts.x !== undefined) params.x = opts.x;
      if (opts.y !== undefined) params.y = opts.y;
      if (opts.parentId) params.parentId = opts.parentId;
      params.name = (node.name as string) || `${componentName}_${variant}`;
    }

    if (!params.name) {
      params.name = (node.name as string) || `${componentName}_node`;
    }

    commands.push({ action, params, tempId });

    // Stroke (applied after creation)
    const stroke = node.stroke as Record<string, unknown> | undefined;
    if (stroke?.color) {
      commands.push({
        action: 'set_stroke',
        params: { nodeId: `$${tempId}`, color: stroke.color, width: stroke.width || 1 },
      });
    }

    // Effects (applied after creation)
    const effects = node.effects as Array<Record<string, unknown>> | undefined;
    if (effects?.length) {
      commands.push({
        action: 'set_effects',
        params: {
          nodeId: `$${tempId}`,
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

    // Auto-layout for frames
    if (nodeType === 'frame' && node.layoutMode) {
      commands.push({
        action: 'set_auto_layout',
        params: {
          nodeId: `$${tempId}`,
          layoutMode: node.layoutMode,
          primaryAxisSizingMode: node.primaryAxisSizingMode,
          counterAxisSizingMode: node.counterAxisSizingMode,
          itemSpacing: node.itemSpacing,
          paddingTop: node.paddingTop,
          paddingRight: node.paddingRight,
          paddingBottom: node.paddingBottom,
          paddingLeft: node.paddingLeft,
          primaryAxisAlignItems: node.primaryAxisAlignItems,
          counterAxisAlignItems: node.counterAxisAlignItems,
        },
      });
    }

    // Recurse into children
    if (nodeChildren?.length) {
      for (let i = 0; i < nodeChildren.length; i++) {
        processNode(nodeChildren[i], tempId, `${tempId}_c${i}`);
      }
    }
  }

  const rootNodeType = resolved.type as string;
  if (!actionMap[rootNodeType]) {
    throw new Error(`Unknown recipe element type: ${rootNodeType}`);
  }

  processNode(resolved, null, 'comp_root');
  return commands;
}

// ═══════════════════════════════════════════════════════════
// DS-25 helpers: URL fetching & CSS token extraction
// ═══════════════════════════════════════════════════════════

async function fetchUrl(url: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 5) throw new Error('Too many redirects');
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = url.startsWith('https') ? require('https') : require('http');
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FigmentoBot/1.0; +https://figmento.dev)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    };
    const req = mod.get(url, options, (res: { statusCode: number; headers: Record<string, string>; on: (e: string, cb: (chunk: Buffer) => void) => void }) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchUrl(res.headers.location, redirectCount + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout fetching URL')); });
  });
}

interface ExtractedDesignTokens {
  colors: string[];
  fonts: string[];
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
  borderRadius?: number;
  mood: string[];
  fontDetectionMethod: string;
  fontDetectionDetails: Record<string, string>; // font name → detection method
  typekitDetected?: string;                     // Typekit URL if found
  colorConfidence: 'high' | 'medium' | 'low';  // confidence of primary color source
}

// ─── EXTRACTION LIMITATIONS — READ BEFORE MODIFYING ─────────────────────
//
// This extraction pipeline is intentionally "best effort". Here's what works
// and what doesn't, so future sessions don't try to "fix" it without context:
//
// WHAT WORKS:
// - CSS hex color extraction from inline styles and <style> blocks
// - :root / body CSS variable detection (--primary, --brand, etc.)
// - Google Fonts URL parsing (link tags and JS-injected)
// - @font-face family detection for self-hosted fonts
// - Typekit/Adobe Fonts URL detection
// - Vision-based structural analysis (border radius, shadows, spacing density)
//
// WHAT DOESN'T WORK (and why):
// - Modern JS-rendered sites (React/Next/Vue) serve minimal HTML — most
//   styles are in JS bundles or CSS-in-JS, invisible to our HTML parser.
// - CSS custom properties like var(--font-monospace) leak through as font
//   names because we can't resolve CSS variable chains.
// - Sites behind Cloudflare/bot-protection return challenge pages, not content.
// - Vision can detect structural properties (rounded vs sharp, shadows vs flat)
//   but cannot reliably identify exact hex colors or font names from a screenshot.
// - Dark-themed sites get light-theme defaults because the color generation
//   pipeline assumes light backgrounds when CSS extraction finds no surface colors.
//
// DESIGN DECISION:
// Rather than making extraction "smarter" (diminishing returns), we pair it
// with refine_design_system — a guided refinement tool that asks the user
// 5 targeted questions and patches the draft tokens. This "draft + refine"
// pattern is more reliable than any amount of automated extraction.
// ────────────────────────────────────────────────────────────────────────────
function extractDesignTokens(html: string): ExtractedDesignTokens {
  // Known web fonts for normalization
  const KNOWN_FONTS = [
    'Inter', 'Roboto', 'Poppins', 'Montserrat', 'Lato', 'Open Sans', 'Nunito',
    'Source Sans Pro', 'Raleway', 'Playfair Display', 'Merriweather', 'DM Sans',
    'Space Grotesk', 'Outfit', 'Figtree', 'Plus Jakarta Sans', 'Sora',
    'Geist', 'SF Pro', 'Helvetica Neue', 'Helvetica',
  ];

  // Brand color filter: saturation > 30% to avoid greys and near-neutral noise
  const isBrandColor = (hex: string): boolean => {
    const { r, g, b } = hexToRgb(hex);
    const { s, l } = rgbToHsl(r, g, b);
    return s > 0.30 && l > 0.10 && l < 0.90;
  };

  // ─── Strip third-party and script-embedded colors before analysis ──────
  // 1. Remove ALL <script> tag contents (colors in JS are never brand colors)
  // 2. Remove <style> blocks referencing known third-party CDN domains
  const THIRD_PARTY_RE = [
    /gstatic\.com/i, /googleapis\.com/i, /doubleclick\.net/i,
    /googletagmanager\.com/i, /google-analytics\.com/i,
    /facebook\.net/i, /twitter\.com/i,
  ];
  const isThirdParty = (s: string) => THIRD_PARTY_RE.some(p => p.test(s));
  const cleanedHtml = html
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')  // strip ALL script contents
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (m, inner) => isThirdParty(inner) ? '' : m);

  // ─── Position heuristic: :root and body blocks are highest-priority ────
  // Colors declared in these selectors are almost certainly brand tokens.
  const rootBodyHexes = new Set<string>();
  const rootBodyCssVars: Record<string, string> = {};
  for (const blk of cleanedHtml.matchAll(/(?::root|body)\s*\{([^}]+)\}/gi)) {
    const block = blk[1];
    for (const vm of block.matchAll(/--([a-zA-Z][\w-]*):\s*(#[0-9A-Fa-f]{6})\b/gi)) {
      rootBodyCssVars[vm[1].toLowerCase()] = vm[2].toLowerCase();
    }
    for (const cm of block.matchAll(/#([0-9A-Fa-f]{6})\b/g)) {
      rootBodyHexes.add(cm[0].toLowerCase());
    }
  }

  // ─── CSS custom properties with brand keyword names ────────────────────
  // Searches all --var-name: #hex pairs; keywords ordered by specificity.
  const BRAND_VAR_KEYWORDS = ['primary', 'brand', 'color-primary', 'primary-color', 'accent', 'main', 'theme'];
  const allCssVars: Record<string, string> = {};
  for (const m of cleanedHtml.matchAll(/--([a-zA-Z][\w-]*):\s*(#[0-9A-Fa-f]{6})\b/gi)) {
    allCssVars[m[1].toLowerCase()] = m[2].toLowerCase();
  }

  // Primary: root/body vars take priority over document-wide vars, keyword order governs tie-breaking
  let primaryColor: string | undefined;
  for (const kw of BRAND_VAR_KEYWORDS) {
    const inRoot = Object.entries(rootBodyCssVars).find(([k]) => k === kw || k.startsWith(kw) || k.endsWith('-' + kw));
    if (inRoot && isBrandColor(inRoot[1])) { primaryColor = inRoot[1]; break; }
    const inDoc = Object.entries(allCssVars).find(([k]) => k === kw || k.startsWith(kw) || k.endsWith('-' + kw));
    if (inDoc && isBrandColor(inDoc[1])) { primaryColor = inDoc[1]; break; }
  }

  // ─── Hex frequency analysis (boosting :root/body hits × 3) ───────────
  const rawColors = [...cleanedHtml.matchAll(/#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g)].map(m => {
    let h = m[0].toLowerCase();
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return h;
  });
  const colorFreq: Record<string, number> = {};
  for (const c of rawColors) colorFreq[c] = (colorFreq[c] || 0) + 1;
  for (const c of rootBodyHexes) { if (colorFreq[c]) colorFreq[c] *= 3; }

  // Luminance skip: if a color is within 20% luminance of pure white or black, skip it
  const isNearWhiteOrBlack = (hex: string): boolean => {
    const lum = relativeLuminance(hex);
    return lum > 0.80 || lum < 0.04; // ~20% of white (1.0) or black (0.0)
  };

  const brandColors = Object.keys(colorFreq)
    .filter(c => isBrandColor(c) && !isNearWhiteOrBlack(c))
    .sort((a, b) => colorFreq[b] - colorFreq[a]);

  // Determine primary color and confidence level
  let colorConfidence: 'high' | 'medium' | 'low' = 'low';

  // Fallback: most-frequent saturated color if no CSS var match
  if (primaryColor) {
    colorConfidence = 'high'; // found via :root CSS var keyword
  } else if (brandColors.length > 0) {
    primaryColor = brandColors[0];
    // Check if it came from body/header scope
    if (rootBodyHexes.has(primaryColor)) {
      colorConfidence = 'medium';
    } else {
      colorConfidence = 'low'; // frequency-ranked fallback
    }
  }
  const secondaryColor = brandColors.find(c => c !== primaryColor);
  const accentColor = brandColors.find(c => c !== primaryColor && c !== secondaryColor);

  // ─── Bug 2 fix: Multi-pass font detection ─────────────────────────────
  const normalizeFont = (f: string) => f.trim().replace(/^['"]|['"]$/g, '').trim();
  const matchKnown = (f: string): string => {
    const kf = KNOWN_FONTS.find(k => f.toLowerCase().startsWith(k.toLowerCase()));
    return kf || f;
  };
  const GENERIC_FONT = /^(inherit|initial|unset|system-ui|-apple|-webkit|sans-serif|serif|monospace|cursive|fantasy)$/i;
  const fontSet = new Set<string>();
  const fontDetectionDetails: Record<string, string> = {}; // font name → method
  let fontDetectionMethod = 'none';
  let typekitDetected: string | undefined;

  const addFont = (name: string, method: string) => {
    const normalized = matchKnown(name);
    if (!fontDetectionDetails[normalized]) fontDetectionDetails[normalized] = method;
    fontSet.add(normalized);
    if (fontDetectionMethod === 'none') fontDetectionMethod = method;
  };

  // Pass 1: @font-face family declarations (most reliable for self-hosted fonts)
  for (const m of html.matchAll(/@font-face\s*\{[^}]*font-family:\s*['"]?([^'";}\n\r]+)['"]?/gi)) {
    const f = normalizeFont(m[1]);
    if (f.length > 2 && !GENERIC_FONT.test(f)) addFont(f, '@font-face');
  }

  // Pass 2: Google Fonts CDN URL in src/href attributes (catches JS-loaded fonts)
  // Handles both css?family=Roboto:400,700 and css2?family=Inter:ital,wght@0,400
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)) {
    for (const fm of m[1].matchAll(/family=([^&|"'\s]+)/gi)) {
      const familyRaw = decodeURIComponent(fm[1].replace(/\+/g, ' ')).split(':')[0].split('|')[0].trim();
      if (familyRaw.length > 1) addFont(familyRaw, 'google-fonts-url');
    }
  }

  // Pass 3: <link href="...googleapis.com/css..."> tag — parse family= param directly
  // Also detects the preconnect+link pattern used by 90% of sites loading Google Fonts
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']*fonts\.googleapis\.com[^"']*)["'][^>]*>/gi)) {
    for (const fm of m[1].matchAll(/family=([^&|"'\s]+)/gi)) {
      const familyRaw = decodeURIComponent(fm[1].replace(/\+/g, ' ')).split(':')[0].split('|')[0].trim();
      if (familyRaw.length > 1) addFont(familyRaw, 'google-fonts-link');
    }
  }

  // Pass 4: Typekit / Adobe Fonts detection
  // Pattern: <link href="https://use.typekit.net/XXXXX.css">
  for (const m of html.matchAll(/<link[^>]+href=["'](https?:\/\/use\.typekit\.net\/[^"']+)["'][^>]*>/gi)) {
    typekitDetected = m[1];
  }

  // Pass 5 (fallback): inline font-family: declarations in CSS
  if (fontSet.size === 0) {
    const allFontRaw = [...html.matchAll(/font-family:\s*['"]?([^'";,\n\r}]+)['"]?/gi)]
      .flatMap(m => m[1].split(',').map(normalizeFont));
    for (const f of allFontRaw) {
      if (f.length > 2 && !GENERIC_FONT.test(f)) addFont(f, 'font-family-css');
    }
  }

  const allFonts = [...fontSet].slice(0, 6);
  const headingFont = allFonts[0];
  const bodyFont = allFonts[1] || allFonts[0];

  // ─── Border radius ─────────────────────────────────────────────────────
  const radii = [...cleanedHtml.matchAll(/border-radius:\s*(\d+)px/g)]
    .map(m => parseInt(m[1])).filter(r => r > 0 && r < 100);
  const borderRadius = radii.length > 0
    ? Math.round(radii.reduce((a, b) => a + b, 0) / radii.length)
    : undefined;

  return {
    colors: brandColors.slice(0, 10),
    fonts: allFonts,
    primaryColor,
    secondaryColor,
    accentColor,
    headingFont,
    bodyFont,
    borderRadius,
    mood: [],
    fontDetectionMethod,
    fontDetectionDetails,
    typekitDetected,
    colorConfidence,
  };
}

// ═══════════════════════════════════════════════════════════
// DS-25 Hybrid: Vision Extraction (screenshot + Claude vision)
// ═══════════════════════════════════════════════════════════

interface VisionExtraction {
  heading_font: string | null;
  body_font: string | null;
  border_radius: number;
  has_gradients: boolean;
  gradient_direction: string | null;
  gradient_colors: string[] | null;
  shadow_style: 'none' | 'subtle' | 'medium' | 'pronounced';
  card_style: 'flat' | 'bordered' | 'elevated' | 'ghost';
  button_style: 'filled' | 'outlined' | 'ghost' | 'pill';
  spacing_density: 'compact' | 'normal' | 'spacious';
  overall_mood: string[];
  design_personality: string;
  confidence: Record<string, number>;
}

const VISION_DEFAULTS: VisionExtraction = {
  heading_font: null,
  body_font: null,
  border_radius: 8,
  has_gradients: false,
  gradient_direction: null,
  gradient_colors: null,
  shadow_style: 'subtle',
  card_style: 'bordered',
  button_style: 'filled',
  spacing_density: 'normal',
  overall_mood: ['modern', 'professional', 'clean'],
  design_personality: 'A modern, professional web presence.',
  confidence: {},
};

async function fetchScreenshot(url: string): Promise<Buffer | null> {
  const services = [
    `https://image.thum.io/get/width/1440/${url}`,
    `https://mini.s-shot.ru/1440x900/JPEG/1440/${url}`,
  ];

  for (const screenshotUrl of services) {
    try {
      const buf = await new Promise<Buffer>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = screenshotUrl.startsWith('https') ? require('https') : require('http');
        const req = mod.get(screenshotUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FigmentoBot/1.0)' },
        }, (res: { statusCode: number; headers: Record<string, string>; on: (e: string, cb: (chunk: Buffer) => void) => void }) => {
          if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
          const contentType = res.headers['content-type'] || '';
          if (!contentType.startsWith('image/')) { reject(new Error(`Not an image: ${contentType}`)); return; }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('Screenshot timeout')); });
      });
      if (buf.length > 5000) return buf; // valid image (>5KB)
    } catch {
      continue; // try next service
    }
  }
  return null;
}

async function visionExtract(screenshotBase64: string): Promise<VisionExtraction | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const visionPrompt = `Analyze this website screenshot as a senior UI designer. Extract the design system and return ONLY this JSON (no markdown, no explanation):
{
  "heading_font": "font name used for headings",
  "body_font": "font name used for body text",
  "border_radius": number in px (0=sharp corners, 4=slight, 8=medium, 16=rounded, 24=very rounded, 999=pill),
  "has_gradients": boolean,
  "gradient_direction": "linear-to-right" | "linear-to-bottom" | "radial" | null,
  "gradient_colors": ["#hex1", "#hex2"] or null,
  "shadow_style": "none" | "subtle" | "medium" | "pronounced",
  "card_style": "flat" | "bordered" | "elevated" | "ghost",
  "button_style": "filled" | "outlined" | "ghost" | "pill",
  "spacing_density": "compact" | "normal" | "spacious",
  "overall_mood": ["keyword1", "keyword2", "keyword3"],
  "design_personality": "one sentence describing the brand aesthetic",
  "confidence": { "heading_font": 0.0-1.0, "body_font": 0.0-1.0, "border_radius": 0.0-1.0, "has_gradients": 0.0-1.0, "shadow_style": 0.0-1.0, "card_style": 0.0-1.0, "button_style": 0.0-1.0, "spacing_density": 0.0-1.0, "overall_mood": 0.0-1.0, "design_personality": 0.0-1.0 }
}`;

    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/png', data: screenshotBase64 } },
          { text: visionPrompt },
        ],
      }],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.1,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    // Parse JSON — handle potential markdown wrapping
    let jsonStr = text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as VisionExtraction;
    return parsed;
  } catch {
    return null;
  }
}

interface HybridMergeResult {
  heading_font?: string;
  body_font?: string;
  border_radius?: number;
  shadow_style?: 'none' | 'subtle' | 'medium' | 'pronounced';
  spacing_density?: 'compact' | 'normal' | 'spacious';
  has_gradients: boolean;
  gradient_direction?: string | null;
  gradient_colors?: string[] | null;
  mood: string[];
  voice: string | null;
  extraction_method: 'hybrid' | 'css_only' | 'vision_only';
  css_extracted: { colors: string[]; fonts: string[] };
  vision_extracted: Record<string, unknown> | null;
  confidence: Record<string, number>;
  tokens_generated: number;
}

function mergeExtractions(
  css: ExtractedDesignTokens,
  vision: VisionExtraction | null,
): HybridMergeResult {
  const conf = vision?.confidence || {};
  const THRESHOLD = 0.6;

  // CSS colors always win (more accurate)
  const cssColors = css.colors;
  const cssFonts = css.fonts;

  // Vision wins for everything CSS can't reliably give us
  // But only if confidence >= threshold; otherwise fall back to defaults
  const pickVision = <T>(field: string, visionVal: T | null | undefined, fallback: T): T => {
    if (!vision || visionVal == null) return fallback;
    if ((conf[field] ?? 0) < THRESHOLD) return fallback;
    return visionVal;
  };

  // Fonts: vision wins over CSS for heading/body distinction (CSS often can't tell which is which)
  // But if CSS found fonts and vision didn't, use CSS
  const heading_font = pickVision('heading_font', vision?.heading_font, css.headingFont) || undefined;
  const body_font = pickVision('body_font', vision?.body_font, css.bodyFont) || undefined;

  // Border radius: vision wins (CSS average is unreliable)
  const border_radius = pickVision('border_radius', vision?.border_radius, css.borderRadius) ?? VISION_DEFAULTS.border_radius;

  // Shadow, spacing, gradients: vision only
  const shadow_style = pickVision('shadow_style', vision?.shadow_style, VISION_DEFAULTS.shadow_style);
  const spacing_density = pickVision('spacing_density', vision?.spacing_density, VISION_DEFAULTS.spacing_density);
  const has_gradients = pickVision('has_gradients', vision?.has_gradients, false);
  const gradient_direction = has_gradients ? (vision?.gradient_direction || null) : null;
  const gradient_colors = has_gradients ? (vision?.gradient_colors || null) : null;

  // Mood + personality: vision only
  const mood = pickVision('overall_mood', vision?.overall_mood, VISION_DEFAULTS.overall_mood);
  const voice = pickVision('design_personality', vision?.design_personality, null);

  const method = vision ? 'hybrid' : 'css_only';

  return {
    heading_font,
    body_font,
    border_radius,
    shadow_style,
    spacing_density,
    has_gradients,
    gradient_direction,
    gradient_colors,
    mood,
    voice,
    extraction_method: method,
    css_extracted: { colors: cssColors, fonts: cssFonts },
    vision_extracted: vision ? {
      heading_font: vision.heading_font,
      body_font: vision.body_font,
      border_radius: vision.border_radius,
      shadow_style: vision.shadow_style,
      card_style: vision.card_style,
      button_style: vision.button_style,
      spacing_density: vision.spacing_density,
      has_gradients: vision.has_gradients,
      gradient_direction: vision.gradient_direction,
      gradient_colors: vision.gradient_colors,
      overall_mood: vision.overall_mood,
      design_personality: vision.design_personality,
    } : null,
    confidence: conf,
    tokens_generated: 0, // filled by caller
  };
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
      const categories = ['social', 'print', 'presentation', 'advertising', 'web', 'email'];
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
    'List all available format adapters (social, print, presentation, web, email, advertising). Each format includes its size_variants (e.g. instagram_post has square/portrait/landscape), default_size, and dimensions. Use size_variant in create_from_pattern to enforce the correct canvas size. Optionally filter by category.',
    {
      category: z.enum(['social', 'print', 'presentation', 'advertising', 'web', 'email']).optional().describe('Filter by category. Omit to list all formats grouped by category.'),
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

  // ═══════════════════════════════════════════════════════════
  // DS-27: design_system_preview
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'design_system_preview',
    'Generate a visual design system swatch sheet on the Figma canvas. Creates a single preview frame showing all color tokens, typography scale, component samples, and spacing scale for the named design system.',
    {
      system: z.string().describe('Design system name (e.g. "testbrand")'),
      x: z.coerce.number().optional().describe('X position on canvas (default: 0)'),
      y: z.coerce.number().optional().describe('Y position on canvas (default: 0)'),
    },
    async (params: { system: string; x?: number; y?: number }) => {
      const safeName = params.system.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');
      if (!fs.existsSync(tokensPath)) {
        const available = listAvailableSystems();
        throw new Error(`Design system not found: ${safeName}. Available: ${available.join(', ')}`);
      }
      const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(tokensContent) as Record<string, unknown>;

      const colors = (tokens.colors || {}) as Record<string, string>;
      const typography = (tokens.typography || {}) as Record<string, unknown>;
      const typographyScale = ((typography as Record<string, unknown>).scale || {}) as Record<string, number>;
      const headingFamily = ((typography as Record<string, Record<string, unknown>>).heading?.family || 'Inter') as string;
      const bodyFamily = ((typography as Record<string, Record<string, unknown>>).body?.family || 'Inter') as string;
      const spacingTokens = (tokens.spacing || {}) as Record<string, number>;
      const radiusTokens = (tokens.radius || {}) as Record<string, number>;

      const commands: Array<{ action: string; params: Record<string, unknown>; tempId?: string }> = [];
      let cmdIdx = 0;
      const uid = () => `p${cmdIdx++}`;

      // Color display order
      const colorOrder = [
        'primary', 'primary_light', 'primary_dark', 'secondary', 'accent',
        'surface', 'background', 'border', 'on_surface', 'on_surface_muted',
        'on_primary', 'success', 'warning', 'error', 'info',
      ].filter(k => k in colors);

      // Typography scale display order
      const typeOrder = ['display', 'h1', 'h2', 'h3', 'body_lg', 'body', 'body_sm', 'caption']
        .filter(k => k in typographyScale);

      // Spacing tokens (sorted ascending, excludes 'unit')
      const spacingOrder = Object.entries(spacingTokens)
        .filter(([k, v]) => k !== 'unit' && typeof v === 'number' && (v as number) > 0)
        .sort(([, a], [, b]) => (a as number) - (b as number))
        .map(([k, v]) => ({ key: k, value: v as number }));

      // Layout constants
      const FRAME_W = 1376;
      const FRAME_PAD = 48;
      const INNER_W = FRAME_W - FRAME_PAD * 2;
      const SECTION_GAP = 40;
      const SWATCH_SIZE = 64;
      const SWATCH_GAP = 16;
      const SWATCH_COL_W = SWATCH_SIZE + SWATCH_GAP;
      const TYPE_COL_W = 144;
      const BG_COLOR = colors.background || '#FFFFFF';
      const TEXT_COLOR = colors.on_surface || '#1A1A1A';
      const MUTED_COLOR = colors.on_surface_muted || '#888888';
      const PRIMARY_COLOR = colors.primary || '#6366F1';

      // Section layout helper — returns section header Y and advances cursor
      let curY = FRAME_PAD;

      function sectionHeader(label: string): { headerY: number } {
        const headerY = curY;
        curY += 28 + 16; // 28px header text + 16px gap
        return { headerY };
      }

      // === Root frame ===
      const rootId = uid();
      // Estimate total height
      const totalH = FRAME_PAD + 48 + SECTION_GAP
        + 28 + 16 + SWATCH_SIZE + 40 + SECTION_GAP   // colors
        + 28 + 16 + 80 + 36 + SECTION_GAP            // typography
        + 28 + 16 + 100 + SECTION_GAP                // components
        + 28 + 16 + 64 + 32 + FRAME_PAD;             // spacing
      commands.push({
        action: 'create_frame',
        params: {
          name: `${safeName} — Design System Preview`,
          width: FRAME_W,
          height: Math.max(totalH, 1200),
          x: params.x ?? 0,
          y: params.y ?? 0,
          fills: [{ type: 'SOLID', color: BG_COLOR }],
        },
        tempId: rootId,
      });

      // Title
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: safeName.toUpperCase() + ' Design System',
          name: 'Preview Title',
          fontSize: 24,
          fontFamily: headingFamily,
          fontWeight: 700,
          color: TEXT_COLOR,
          x: FRAME_PAD,
          y: curY,
          width: INNER_W,
          height: 36,
        },
      });
      curY += 36 + SECTION_GAP;

      // ── Row 1: Colors ──
      const { headerY: colorsHeaderY } = sectionHeader('COLORS');
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: 'COLORS',
          name: 'Section: Colors',
          fontSize: 11,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: MUTED_COLOR,
          letterSpacing: 2,
          x: FRAME_PAD,
          y: colorsHeaderY,
          width: INNER_W,
          height: 20,
        },
      });

      // Divider line
      const colorDivId = uid();
      commands.push({
        action: 'create_rectangle',
        params: {
          parentId: `$${rootId}`,
          name: 'Divider',
          width: INNER_W,
          height: 1,
          x: FRAME_PAD,
          y: colorsHeaderY + 24,
          fills: [{ type: 'SOLID', color: colors.border || '#E5E5E5' }],
        },
        tempId: colorDivId,
      });

      const swatchStartY = curY;
      let swatchX = FRAME_PAD;
      for (const colorKey of colorOrder) {
        const colorHex = colors[colorKey];
        // Swatch rectangle
        const swId = uid();
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${rootId}`,
            name: `Swatch: ${colorKey}`,
            width: SWATCH_SIZE,
            height: SWATCH_SIZE,
            x: swatchX,
            y: swatchStartY,
            cornerRadius: 8,
            fills: [{ type: 'SOLID', color: colorHex }],
          },
          tempId: swId,
        });
        // Hex label
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${rootId}`,
            text: colorHex.toUpperCase(),
            name: `Hex: ${colorKey}`,
            fontSize: 9,
            fontFamily: bodyFamily,
            fontWeight: 400,
            color: MUTED_COLOR,
            x: swatchX,
            y: swatchStartY + SWATCH_SIZE + 4,
            width: SWATCH_SIZE,
            height: 14,
            textAlign: 'CENTER',
          },
        });
        // Token name
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${rootId}`,
            text: colorKey,
            name: `Name: ${colorKey}`,
            fontSize: 9,
            fontFamily: bodyFamily,
            fontWeight: 600,
            color: TEXT_COLOR,
            x: swatchX,
            y: swatchStartY + SWATCH_SIZE + 20,
            width: SWATCH_SIZE,
            height: 14,
            textAlign: 'CENTER',
          },
        });
        swatchX += SWATCH_COL_W;
      }
      curY = swatchStartY + SWATCH_SIZE + 40 + SECTION_GAP;

      // ── Row 2: Typography ──
      const { headerY: typeHeaderY } = sectionHeader('TYPOGRAPHY');
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: 'TYPOGRAPHY',
          name: 'Section: Typography',
          fontSize: 11,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: MUTED_COLOR,
          letterSpacing: 2,
          x: FRAME_PAD,
          y: typeHeaderY,
          width: INNER_W,
          height: 20,
        },
      });
      const typeDivId = uid();
      commands.push({
        action: 'create_rectangle',
        params: {
          parentId: `$${rootId}`,
          name: 'Divider',
          width: INNER_W,
          height: 1,
          x: FRAME_PAD,
          y: typeHeaderY + 24,
          fills: [{ type: 'SOLID', color: colors.border || '#E5E5E5' }],
        },
        tempId: typeDivId,
      });

      const typeStartY = curY;
      let typeX = FRAME_PAD;
      for (const scaleKey of typeOrder) {
        const fontSize = typographyScale[scaleKey] as number;
        const displaySize = Math.min(fontSize, 48);
        const isHeading = ['display', 'h1', 'h2', 'h3'].includes(scaleKey);
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${rootId}`,
            text: 'Aa',
            name: `Type: ${scaleKey}`,
            fontSize: displaySize,
            fontFamily: isHeading ? headingFamily : bodyFamily,
            fontWeight: isHeading ? 700 : 400,
            color: TEXT_COLOR,
            x: typeX,
            y: typeStartY,
            width: TYPE_COL_W,
            height: 56,
          },
        });
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${rootId}`,
            text: `${scaleKey} / ${fontSize}px`,
            name: `Type label: ${scaleKey}`,
            fontSize: 9,
            fontFamily: bodyFamily,
            fontWeight: 400,
            color: MUTED_COLOR,
            x: typeX,
            y: typeStartY + 58,
            width: TYPE_COL_W,
            height: 14,
          },
        });
        typeX += TYPE_COL_W;
      }
      curY = typeStartY + 80 + SECTION_GAP;

      // ── Row 3: Component Samples ──
      const { headerY: compHeaderY } = sectionHeader('COMPONENTS');
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: 'COMPONENTS',
          name: 'Section: Components',
          fontSize: 11,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: MUTED_COLOR,
          letterSpacing: 2,
          x: FRAME_PAD,
          y: compHeaderY,
          width: INNER_W,
          height: 20,
        },
      });
      const compDivId = uid();
      commands.push({
        action: 'create_rectangle',
        params: {
          parentId: `$${rootId}`,
          name: 'Divider',
          width: INNER_W,
          height: 1,
          x: FRAME_PAD,
          y: compHeaderY + 24,
          fills: [{ type: 'SOLID', color: colors.border || '#E5E5E5' }],
        },
        tempId: compDivId,
      });

      const compStartY = curY;
      const mdRadius = radiusTokens.md || 8;
      const lgRadius = radiusTokens.lg || 12;

      // Button (primary)
      const btnId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${rootId}`,
          name: 'Component: Button (primary)',
          width: 144,
          height: 40,
          x: FRAME_PAD,
          y: compStartY,
          cornerRadius: mdRadius,
          fills: [{ type: 'SOLID', color: PRIMARY_COLOR }],
          layoutMode: 'HORIZONTAL',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
        },
        tempId: btnId,
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${btnId}`,
          text: 'Button',
          fontSize: 14,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: colors.on_primary || '#FFFFFF',
          width: 120,
          height: 20,
          textAlign: 'CENTER',
        },
      });

      // Badge
      const badgeId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${rootId}`,
          name: 'Component: Badge',
          width: 80,
          height: 24,
          x: FRAME_PAD + 160,
          y: compStartY + 8,
          cornerRadius: 12,
          fills: [{ type: 'SOLID', color: colors.primary_light || PRIMARY_COLOR }],
          layoutMode: 'HORIZONTAL',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
        },
        tempId: badgeId,
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${badgeId}`,
          text: 'Badge',
          fontSize: 11,
          fontFamily: bodyFamily,
          fontWeight: 600,
          color: PRIMARY_COLOR,
          width: 60,
          height: 16,
          textAlign: 'CENTER',
        },
      });

      // Card placeholder
      const cardId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${rootId}`,
          name: 'Component: Card',
          width: 220,
          height: 100,
          x: FRAME_PAD + 280,
          y: compStartY,
          cornerRadius: lgRadius,
          fills: [{ type: 'SOLID', color: colors.surface || '#FFFFFF' }],
          layoutMode: 'VERTICAL',
          itemSpacing: 8,
          paddingTop: 16,
          paddingBottom: 16,
          paddingLeft: 16,
          paddingRight: 16,
        },
        tempId: cardId,
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${cardId}`,
          text: 'Card Title',
          fontSize: 14,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: TEXT_COLOR,
          width: 188,
          height: 20,
        },
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${cardId}`,
          text: 'Card body content goes here.',
          fontSize: 12,
          fontFamily: bodyFamily,
          fontWeight: 400,
          color: MUTED_COLOR,
          width: 188,
          height: 32,
        },
      });
      curY = compStartY + 100 + SECTION_GAP;

      // ── Row 4: Spacing Scale ──
      const { headerY: spacingHeaderY } = sectionHeader('SPACING');
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: 'SPACING',
          name: 'Section: Spacing',
          fontSize: 11,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: MUTED_COLOR,
          letterSpacing: 2,
          x: FRAME_PAD,
          y: spacingHeaderY,
          width: INNER_W,
          height: 20,
        },
      });
      const spacingDivId = uid();
      commands.push({
        action: 'create_rectangle',
        params: {
          parentId: `$${rootId}`,
          name: 'Divider',
          width: INNER_W,
          height: 1,
          x: FRAME_PAD,
          y: spacingHeaderY + 24,
          fills: [{ type: 'SOLID', color: colors.border || '#E5E5E5' }],
        },
        tempId: spacingDivId,
      });

      const spacingStartY = curY;
      const MAX_BAR_H = 48;
      const maxSpacingVal = Math.max(...spacingOrder.map(s => s.value), 1);
      let spX = FRAME_PAD;
      for (const { key, value } of spacingOrder) {
        const barH = Math.max(4, Math.round((value / maxSpacingVal) * MAX_BAR_H));
        const barW = 32;
        const barSpId = uid();
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${rootId}`,
            name: `Spacing: ${key}`,
            width: barW,
            height: barH,
            x: spX,
            y: spacingStartY + (MAX_BAR_H - barH),
            fills: [{ type: 'SOLID', color: PRIMARY_COLOR }],
            cornerRadius: 3,
          },
          tempId: barSpId,
        });
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${rootId}`,
            text: `${key}\n${value}px`,
            name: `Spacing label: ${key}`,
            fontSize: 9,
            fontFamily: bodyFamily,
            fontWeight: 400,
            color: MUTED_COLOR,
            x: spX,
            y: spacingStartY + MAX_BAR_H + 4,
            width: barW + 12,
            height: 28,
            textAlign: 'CENTER',
          },
        });
        spX += barW + 16;
      }

      // Execute
      const data = await sendDesignCommand('batch_execute', { commands });
      const results = (data as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined;
      const rootNodeId = results?.[0]?.nodeId || results?.[0]?.id || 'unknown';

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            nodeId: rootNodeId,
            system: safeName,
            sections: ['colors', 'typography', 'components', 'spacing'],
            colorCount: colorOrder.length,
            typeScaleCount: typeOrder.length,
            spacingTokenCount: spacingOrder.length,
            totalCommands: commands.length,
          }, null, 2),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-25: generate_design_system_from_url (Hybrid Vision Pipeline)
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'generate_design_system_from_url',
    'Generates a design system draft from a URL. Extracts what it can via CSS and vision, then guides you through refining the result. Best used as a starting point, not a final output.',
    {
      url: z.string().describe('The website URL to extract design tokens from (e.g. "https://stripe.com")'),
      name: z.string().optional().describe('Design system name (defaults to domain name, e.g. "stripe")'),
      preset: z.string().optional().describe('Optional preset to blend with extracted values: shadcn, material, minimal, luxury, vibrant'),
    },
    async (params: { url: string; name?: string; preset?: string }) => {
      // ─── Step 1: CSS extraction (colors + fonts — accurate and cheap) ────
      let pageContent: string;
      try {
        pageContent = await fetchUrl(params.url);
      } catch (err) {
        throw new Error(`Failed to fetch ${params.url}: ${(err as Error).message}`);
      }
      const cssExtracted = extractDesignTokens(pageContent);

      // ─── Step 2: Vision extraction (screenshot + Claude vision) ──────────
      let visionResult: VisionExtraction | null = null;
      let screenshotSource: string | null = null;
      try {
        const screenshotBuf = await fetchScreenshot(params.url);
        if (screenshotBuf) {
          const base64 = screenshotBuf.toString('base64');
          screenshotSource = 'screenshot_service';
          visionResult = await visionExtract(base64);
        }
      } catch {
        // Vision extraction is best-effort — CSS alone is sufficient
      }

      // ─── Step 3: Merge (CSS colors win, vision wins for everything else) ─
      const merged = mergeExtractions(cssExtracted, visionResult);

      // ─── Step 4: Map to tokens ──────────────────────────────────────────
      let systemName = params.name;
      if (!systemName) {
        try {
          const urlObj = new URL(params.url);
          systemName = urlObj.hostname.replace(/^www\./, '').split('.')[0];
        } catch {
          systemName = 'extracted';
        }
      }
      systemName = systemName.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      if (!systemName) systemName = 'extracted';

      let preset: ReturnType<typeof loadPreset> | null = null;
      if (params.preset) {
        preset = loadPreset(params.preset);
      }

      const tokens = generateTokens({
        name: systemName,
        primary_color: cssExtracted.primaryColor,
        secondary_color: cssExtracted.secondaryColor,
        accent_color: cssExtracted.accentColor,
        heading_font: merged.heading_font,
        body_font: merged.body_font,
        mood: merged.mood,
        voice: merged.voice,
        preset,
        // Vision-extracted fields
        border_radius: merged.border_radius,
        shadow_style: merged.shadow_style,
        spacing_density: merged.spacing_density,
        has_gradients: merged.has_gradients,
        gradient_direction: merged.gradient_direction,
        gradient_colors: merged.gradient_colors,
      });

      // Save to disk
      const systemDir = nodePath.join(getDesignSystemsDir(), systemName);
      if (!fs.existsSync(systemDir)) {
        fs.mkdirSync(systemDir, { recursive: true });
      }
      const tokensPath = nodePath.join(systemDir, 'tokens.yaml');
      fs.writeFileSync(tokensPath, yaml.dump(tokens, { lineWidth: 120 }), 'utf-8');

      // ─── Step 5: Extraction report ─────────────────────────────────────
      const tokenFieldCount = Object.keys(tokens.colors).length
        + Object.keys(tokens.typography).length
        + Object.keys(tokens.spacing).length
        + Object.keys(tokens.radius).length
        + Object.keys(tokens.shadows).length
        + (tokens.gradients ? 1 : 0);

      // ─── Overall confidence score ──────────────────────────────────────
      // Weighted average: color extraction quality (40%), font detection (25%),
      // vision structural data (35%)
      const colorScore = cssExtracted.colorConfidence === 'high' ? 1.0
        : cssExtracted.colorConfidence === 'medium' ? 0.6 : 0.2;
      const fontScore = cssExtracted.fonts.length > 0 && cssExtracted.fontDetectionMethod !== 'none' ? 0.8 : 0.1;
      const visionConfValues = Object.values(merged.confidence || {}) as number[];
      const visionScore = visionConfValues.length > 0
        ? visionConfValues.reduce((a, b) => a + b, 0) / visionConfValues.length
        : 0;
      const overallConfidence = Math.round((colorScore * 0.40 + fontScore * 0.25 + visionScore * 0.35) * 100);

      // ─── Post-extraction refinement prompt ─────────────────────────────
      const refinementPrompt = `\n\nDraft created with ${overallConfidence}% confidence. To refine it, tell me:\n`
        + `1. What is your exact primary brand color? (hex or description)\n`
        + `2. What fonts do you use? (or "not sure")\n`
        + `3. Sharp corners, slightly rounded, or very rounded?\n`
        + `4. Light or dark background?\n`
        + `5. 3 words that describe the brand personality?\n`
        + `\nThen call refine_design_system with the answers to update the tokens.`;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            name: systemName,
            sourceUrl: params.url,
            extraction_method: merged.extraction_method,
            overallConfidence: `${overallConfidence}%`,
            css_extracted: {
              colorsFound: cssExtracted.colors.length,
              brandColors: cssExtracted.colors.slice(0, 5),
              primaryColor: cssExtracted.primaryColor || '(none found — generated)',
              secondaryColor: cssExtracted.secondaryColor || '(none found — generated)',
              accentColor: cssExtracted.accentColor || '(none found — generated)',
              colorConfidence: cssExtracted.colorConfidence,
              fonts: cssExtracted.fonts,
              fontDetectionMethod: cssExtracted.fontDetectionMethod === 'none'
                ? '(not detected — fallback to vision or Inter)'
                : cssExtracted.fontDetectionMethod,
              typekitDetected: cssExtracted.typekitDetected || null,
            },
            vision_extracted: merged.vision_extracted ? {
              ...merged.vision_extracted,
              screenshotSource,
              apiKeyConfigured: !!process.env.GEMINI_API_KEY,
            } : {
              status: !process.env.GEMINI_API_KEY
                ? 'skipped — GEMINI_API_KEY not set'
                : screenshotSource === null
                  ? 'skipped — screenshot services unavailable'
                  : 'skipped — vision analysis failed',
            },
            confidence: merged.confidence,
            generatedTokens: {
              total: tokenFieldCount,
              colors: Object.keys(tokens.colors).length,
              headingFont: tokens.typography.heading.family,
              bodyFont: tokens.typography.body.family,
              spacingUnit: tokens.spacing.unit,
              borderRadius: tokens.radius,
              shadowStyle: merged.shadow_style,
              spacingDensity: merged.spacing_density,
              hasGradients: tokens.gradients?.enabled || false,
              mood: tokens.mood,
              voice: tokens.voice,
              presetUsed: tokens.preset_used,
            },
            savedAs: systemName,
            tokensPath,
            refinementPrompt,
          }, null, 2),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-26: refine_design_system
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'refine_design_system',
    'Refine a draft design system with user-provided corrections. Use after generate_design_system_from_url to fix colors, fonts, border radius, dark/light mode, and mood. Returns a diff of what changed.',
    {
      name: z.string().describe('Design system name to refine'),
      primary_color: z.string().optional().describe('Exact primary brand color as hex (e.g. "#5E6AD2")'),
      fonts: z.string().optional().describe('Font specification, e.g. "Inter for headings, Georgia for body" or just "Inter for both"'),
      border_radius: z.enum(['sharp', 'slight', 'medium', 'rounded', 'pill']).optional()
        .describe('Corner rounding style: sharp (0–2px), slight (4px), medium (8px), rounded (16px), pill (999px)'),
      dark_mode: z.boolean().optional().describe('true = dark background, false = light background'),
      mood: z.array(z.string()).optional().describe('3 words describing brand personality, e.g. ["minimal", "sharp", "focused"]'),
    },
    async (params: {
      name: string;
      primary_color?: string;
      fonts?: string;
      border_radius?: 'sharp' | 'slight' | 'medium' | 'rounded' | 'pill';
      dark_mode?: boolean;
      mood?: string[];
    }) => {
      const safeName = params.name.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');

      if (!fs.existsSync(tokensPath)) {
        const available = listAvailableSystems();
        throw new Error(`Design system not found: ${safeName}. Available: ${available.join(', ')}`);
      }

      const content = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(content) as Record<string, unknown>;
      const changes: Record<string, { from: unknown; to: unknown }> = {};

      // Helper to track changes
      const apply = (dotPath: string, newValue: unknown) => {
        const oldValue = getByDotPath(tokens, dotPath);
        if (oldValue !== newValue) {
          changes[dotPath] = { from: oldValue, to: newValue };
          setByDotPath(tokens, dotPath, newValue);
        }
      };

      // ─── Primary color + derived colors ────────────────────────────
      if (params.primary_color) {
        const pc = params.primary_color;
        apply('colors.primary', pc);
        apply('colors.primary_light', lighten(pc, 0.3));
        apply('colors.primary_dark', darken(pc, 0.2));
        apply('colors.on_primary', bestTextColor(pc));

        // Re-derive secondary and accent from the new primary
        const currentSecondary = getByDotPath(tokens, 'colors.secondary') as string | undefined;
        const currentAccent = getByDotPath(tokens, 'colors.accent') as string | undefined;
        // Only re-derive if current values look auto-generated (not manually set before)
        if (currentSecondary) {
          apply('colors.secondary', rotateHue(pc, 180));
        }
        if (currentAccent) {
          apply('colors.accent', rotateHue(pc, 30));
        }

        // Update shadow colors to match new primary
        for (const size of ['sm', 'md', 'lg'] as const) {
          apply(`shadows.${size}.color`, pc);
        }
      }

      // ─── Fonts ─────────────────────────────────────────────────────
      if (params.fonts) {
        const fontStr = params.fonts.trim();
        // Parse patterns: "Inter for both", "Inter for headings, Georgia for body"
        const bothMatch = fontStr.match(/^(.+?)\s+for\s+both$/i);
        const splitMatch = fontStr.match(/^(.+?)\s+for\s+headings?\s*,\s*(.+?)\s+for\s+body$/i);

        if (bothMatch) {
          const font = bothMatch[1].trim();
          apply('typography.heading.family', font);
          apply('typography.body.family', font);
        } else if (splitMatch) {
          apply('typography.heading.family', splitMatch[1].trim());
          apply('typography.body.family', splitMatch[2].trim());
        } else {
          // Single font name — use for both
          apply('typography.heading.family', fontStr);
          apply('typography.body.family', fontStr);
        }
      }

      // ─── Border radius ─────────────────────────────────────────────
      if (params.border_radius) {
        const radiusMap: Record<string, { sm: number; md: number; lg: number; xl: number }> = {
          sharp:   { sm: 0, md: 2, lg: 4, xl: 6 },
          slight:  { sm: 2, md: 4, lg: 6, xl: 8 },
          medium:  { sm: 4, md: 8, lg: 12, xl: 16 },
          rounded: { sm: 8, md: 16, lg: 24, xl: 32 },
          pill:    { sm: 999, md: 999, lg: 999, xl: 999 },
        };
        const r = radiusMap[params.border_radius];
        apply('radius.sm', r.sm);
        apply('radius.md', r.md);
        apply('radius.lg', r.lg);
        apply('radius.xl', r.xl);
      }

      // ─── Dark mode ─────────────────────────────────────────────────
      if (params.dark_mode != null) {
        const primary = (getByDotPath(tokens, 'colors.primary') as string) || '#5E6AD2';
        const { h: primaryH } = hexToHsl(primary);

        if (params.dark_mode) {
          // Dark theme: near-black surface/background, light text
          apply('colors.surface', hslToHex(primaryH, 0.08, 0.12));
          apply('colors.background', hslToHex(primaryH, 0.06, 0.08));
          apply('colors.border', hslToHex(primaryH, 0.10, 0.20));
          apply('colors.on_surface', '#F0F0F3');
          apply('colors.on_surface_muted', hslToHex(primaryH, 0.06, 0.55));
        } else {
          // Light theme: near-white surface/background, dark text
          apply('colors.surface', hslToHex(primaryH, 0.02, 0.99));
          apply('colors.background', hslToHex(primaryH, 0.03, 0.97));
          apply('colors.border', desaturate(lighten(primary, 0.55), 0.6));
          apply('colors.on_surface', hslToHex(primaryH, 0.08, 0.09));
          apply('colors.on_surface_muted', hslToHex(primaryH, 0.05, 0.45));
        }
      }

      // ─── Mood ──────────────────────────────────────────────────────
      if (params.mood && params.mood.length > 0) {
        apply('mood', params.mood);
      }

      // ─── Save ──────────────────────────────────────────────────────
      fs.writeFileSync(tokensPath, yaml.dump(tokens, { lineWidth: 120 }), 'utf-8');

      const changeCount = Object.keys(changes).length;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            refined: safeName,
            changesApplied: changeCount,
            diff: changes,
            tip: changeCount > 0
              ? `${changeCount} token(s) updated. Call design_system_preview to see the result visually.`
              : 'No changes were needed — the system already matched your inputs.',
          }, null, 2),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-28: brand_consistency_check
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'brand_consistency_check',
    'Check if one or two Figma frames are brand-consistent by comparing the colors and fonts used against a design system. Returns a score (0–100), list of issues, and a consistent boolean.',
    {
      nodeId: z.string().describe('First frame nodeId to check'),
      nodeId2: z.string().optional().describe('Second frame nodeId to compare (optional — cross-frame consistency check)'),
      system: z.string().describe('Design system name to compare against'),
    },
    async (params: { nodeId: string; nodeId2?: string; system: string }) => {
      // Load design system tokens
      const safeName = params.system.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');
      if (!fs.existsSync(tokensPath)) {
        const available = listAvailableSystems();
        throw new Error(`Design system not found: ${safeName}. Available: ${available.join(', ')}`);
      }
      const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(tokensContent) as Record<string, unknown>;

      const systemColors = Object.values((tokens.colors || {}) as Record<string, string>).map(c => c.toLowerCase());
      const headingFont = (((tokens.typography as Record<string, unknown> || {}).heading as Record<string, string>)?.family || '').toLowerCase();
      const bodyFont = (((tokens.typography as Record<string, unknown> || {}).body as Record<string, string>)?.family || '').toLowerCase();
      const systemFonts = [headingFont, bodyFont].filter(Boolean);

      // Scan both frames
      const scan1Raw = await sendDesignCommand('scan_frame_structure', { nodeId: params.nodeId, depth: 6, include_styles: true });
      const scan2Raw = params.nodeId2
        ? await sendDesignCommand('scan_frame_structure', { nodeId: params.nodeId2, depth: 6, include_styles: true })
        : null;

      // Extract colors and fonts from a scan_frame_structure response
      function extractFromScan(scan: Record<string, unknown>): { colors: string[]; fonts: string[] } {
        const colors = new Set<string>();
        const fonts = new Set<string>();

        function traverse(node: unknown): void {
          if (!node || typeof node !== 'object') return;
          const n = node as Record<string, unknown>;

          // fills array (from scan_frame_structure style data)
          if (Array.isArray(n.fills)) {
            for (const fill of n.fills) {
              if (!fill || typeof fill !== 'object') continue;
              const f = fill as Record<string, unknown>;
              const hex = (f.hex || f.color || f.value) as string | undefined;
              if (hex && typeof hex === 'string' && hex.startsWith('#')) {
                colors.add(hex.toLowerCase());
              }
            }
          }
          // Direct color fields on text nodes
          if (n.color && typeof n.color === 'string' && (n.color as string).startsWith('#')) {
            colors.add((n.color as string).toLowerCase());
          }

          // Font family
          if (n.fontFamily && typeof n.fontFamily === 'string') fonts.add((n.fontFamily as string).toLowerCase());
          if (n.fontName && typeof n.fontName === 'object') {
            const fn = n.fontName as Record<string, string>;
            if (fn.family) fonts.add(fn.family.toLowerCase());
          }

          // Recurse
          for (const key of ['children', 'elements', 'nodes']) {
            if (Array.isArray(n[key])) {
              for (const child of n[key] as unknown[]) traverse(child);
            }
          }
        }

        traverse(scan);
        return { colors: [...colors], fonts: [...fonts] };
      }

      const s1 = extractFromScan(scan1Raw as Record<string, unknown>);
      const s2 = scan2Raw ? extractFromScan(scan2Raw as Record<string, unknown>) : null;

      const issues: string[] = [];
      let score = 100;

      // Normalize hex for comparison
      const normalizeHex = (h: string) => h.replace('#', '').toLowerCase();
      const matchesSystem = (hex: string) =>
        systemColors.some(sc => normalizeHex(sc) === normalizeHex(hex));

      // Frame 1 color check
      const badColors1 = s1.colors.filter(c => !matchesSystem(c));
      if (badColors1.length > 0) {
        issues.push(`Frame 1: ${badColors1.length} color(s) not in "${safeName}" design system (e.g. ${badColors1.slice(0, 3).join(', ')})`);
        score -= Math.min(35, badColors1.length * 5);
      }

      // Frame 1 font check
      const matchesFont = (f: string) => systemFonts.some(sf => f === sf || f.includes(sf) || sf.includes(f));
      const badFonts1 = s1.fonts.filter(f => !matchesFont(f));
      if (badFonts1.length > 0) {
        issues.push(`Frame 1: font(s) not in design system — found "${badFonts1.join('", "')}", expected "${systemFonts.join('", "')}"`);
        score -= Math.min(20, badFonts1.length * 10);
      }

      if (s2) {
        // Frame 2 color check
        const badColors2 = s2.colors.filter(c => !matchesSystem(c));
        if (badColors2.length > 0) {
          issues.push(`Frame 2: ${badColors2.length} color(s) not in "${safeName}" design system (e.g. ${badColors2.slice(0, 3).join(', ')})`);
          score -= Math.min(25, badColors2.length * 4);
        }

        // Frame 2 font check
        const badFonts2 = s2.fonts.filter(f => !matchesFont(f));
        if (badFonts2.length > 0) {
          issues.push(`Frame 2: font(s) not in design system — found "${badFonts2.join('", "')}", expected "${systemFonts.join('", "')}"`);
          score -= Math.min(10, badFonts2.length * 5);
        }

        // Cross-frame font consistency
        const commonFonts = s1.fonts.filter(f => s2.fonts.includes(f));
        if (s1.fonts.length > 0 && s2.fonts.length > 0 && commonFonts.length === 0) {
          issues.push('Frames use entirely different fonts — cross-frame inconsistency');
          score -= 10;
        }
      }

      score = Math.max(0, Math.min(100, score));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            consistent: score >= 80,
            score,
            system: safeName,
            frame1: {
              nodeId: params.nodeId,
              colorsFound: s1.colors.length,
              fontsFound: s1.fonts,
              unknownColors: s1.colors.filter(c => !matchesSystem(c)),
            },
            ...(s2 ? {
              frame2: {
                nodeId: params.nodeId2,
                colorsFound: s2.colors.length,
                fontsFound: s2.fonts,
                unknownColors: s2.colors.filter(c => !matchesSystem(c)),
              },
            } : {}),
            systemTokens: {
              colors: systemColors,
              fonts: systemFonts,
            },
            issues,
          }, null, 2),
        }],
      };
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

interface FormatSizeVariant {
  id: string;
  width: number;
  height: number;
  aspect_ratio?: string;
  description?: string;
}

interface FormatListEntry {
  name: string;
  category: string;
  dimensions: { width: number; height: number };
  description: string;
  default_size: string | null;
  size_variants: FormatSizeVariant[];
}

function listAvailableFormats(): FormatListEntry[] {
  const formatsDir = getFormatsDir();
  if (!fs.existsSync(formatsDir)) return [];

  const results: FormatListEntry[] = [];
  const categories = ['social', 'print', 'presentation', 'advertising', 'web', 'email'];

  for (const category of categories) {
    const catDir = nodePath.join(formatsDir, category);
    if (!fs.existsSync(catDir)) continue;

    const files = fs.readdirSync(catDir).filter(f => f.endsWith('.yaml'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(nodePath.join(catDir, file), 'utf-8');
        const data = yaml.load(content) as Record<string, unknown>;
        const dims = data.dimensions as Record<string, unknown> | undefined;

        // Extract size_variants if present
        const rawVariants = data.size_variants as Record<string, Record<string, unknown>> | undefined;
        const sizeVariants: FormatSizeVariant[] = rawVariants
          ? Object.entries(rawVariants).map(([id, v]) => ({
              id,
              width: (v.width as number) || 0,
              height: (v.height as number) || 0,
              aspect_ratio: v.aspect_ratio as string | undefined,
              description: v.description as string | undefined,
            }))
          : [];

        results.push({
          name: data.name as string || file.replace('.yaml', ''),
          category: data.category as string || category,
          dimensions: {
            width: (dims?.width as number) || 0,
            height: (dims?.height as number) || 0,
          },
          description: (data.description as string) || '',
          default_size: (data.default_size as string) || null,
          size_variants: sizeVariants,
        });
      } catch {
        // Skip malformed files
      }
    }
  }

  return results;
}
