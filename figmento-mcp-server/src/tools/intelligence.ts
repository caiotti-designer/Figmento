import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';

// Knowledge base loader with lazy caching
const knowledgeCache = new Map<string, unknown>();

function getKnowledgeDir(): string {
  // When bundled with esbuild, __dirname is the dist/ folder.
  // Knowledge files are at the package root under knowledge/.
  return nodePath.join(__dirname, '..', 'knowledge');
}

function loadKnowledge(filename: string): Record<string, unknown> {
  if (knowledgeCache.has(filename)) return knowledgeCache.get(filename) as Record<string, unknown>;
  const filePath = nodePath.join(getKnowledgeDir(), filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = yaml.load(content) as Record<string, unknown>;
  knowledgeCache.set(filename, data);
  return data;
}

/** Flatten nested size-presets.yaml structure into a flat array of presets */
function flattenPresets(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];

  for (const [category, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      // Direct array (e.g., presentation)
      for (const preset of value) {
        results.push({ ...preset, category });
      }
    } else if (typeof value === 'object' && value !== null) {
      // Nested object (e.g., social.instagram, print.standard_paper)
      for (const [platform, presets] of Object.entries(value as Record<string, unknown>)) {
        if (Array.isArray(presets)) {
          for (const preset of presets) {
            results.push({ ...preset, category, platform });
          }
        }
      }
    }
  }

  return results;
}

/** WCAG relative luminance calculation */
function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function registerIntelligenceTools(server: McpServer): void {

  // ═══════════════════════════════════════════════════════════
  // S-08: get_size_preset
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_size_preset',
    'Get exact pixel dimensions for common design formats (social media, print, presentations, web). Query by platform, category, or specific preset ID.',
    {
      platform: z.string().optional().describe('Platform filter: instagram, facebook, tiktok, youtube, linkedin, twitter, pinterest, snapchat'),
      category: z.string().optional().describe('Category filter: social, print, presentation, web'),
      id: z.string().optional().describe('Specific preset ID (e.g., "ig-post", "print-a4", "pres-16-9")'),
    },
    async (params) => {
      const data = loadKnowledge('size-presets.yaml');
      const allPresets = flattenPresets(data);

      let results = allPresets;
      if (params.id) {
        results = results.filter(p => p.id === params.id);
      }
      if (params.platform) {
        results = results.filter(p => p.platform === params.platform);
      }
      if (params.category) {
        results = results.filter(p => p.category === params.category);
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-09: get_font_pairing
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_font_pairing',
    'Get font pairing recommendations by mood/style. Returns heading and body fonts with recommended weights.',
    {
      mood: z.string().optional().describe('Mood keywords: modern, classic, bold, luxury, playful, corporate, editorial, minimalist, creative, elegant'),
      id: z.string().optional().describe('Specific pairing ID (e.g., "modern", "luxury", "playful")'),
    },
    async (params) => {
      const data = loadKnowledge('typography.yaml');
      const pairings = data.font_pairings as Array<Record<string, unknown>>;

      let results = pairings;
      if (params.id) {
        results = results.filter(p => p.id === params.id);
      }
      if (params.mood) {
        const keywords = params.mood.toLowerCase().split(/[\s,]+/);
        results = results.filter(p => {
          const tags = (p.mood_tags as string[]) || [];
          return keywords.some(kw => tags.some(tag => tag.toLowerCase().includes(kw)));
        });
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-10: get_type_scale
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_type_scale',
    'Compute a typographic scale from a base size and ratio. Returns sizes for xs through display. Optionally provide a custom base size.',
    {
      baseSize: z.number().optional().describe('Base font size in pixels (default: 16)'),
      ratio: z.enum(['minor_third', 'major_third', 'perfect_fourth', 'golden_ratio']).optional().describe('Scale ratio (default: major_third)'),
    },
    async (params) => {
      const data = loadKnowledge('typography.yaml');
      const scales = data.type_scales as Record<string, Record<string, unknown>>;
      const scaleId = params.ratio || 'major_third';
      const scale = scales[scaleId];

      if (!scale) {
        throw new Error(`Unknown scale: ${scaleId}. Available: ${Object.keys(scales).join(', ')}`);
      }

      const base = params.baseSize || 16;
      const r = scale.ratio as number;

      const computed = {
        xs: Math.round(base / (r * r)),
        sm: Math.round(base / r),
        base,
        lg: Math.round(base * r),
        xl: Math.round(base * r * r),
        '2xl': Math.round(base * Math.pow(r, 3)),
        '3xl': Math.round(base * Math.pow(r, 4)),
        '4xl': Math.round(base * Math.pow(r, 5)),
        display: Math.round(base * Math.pow(r, 6)),
      };

      const result = {
        ...scale,
        computedSizes: computed,
        baseSize: base,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-11: get_color_palette
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_color_palette',
    'Get a color palette by mood keywords or palette ID. Returns primary, secondary, accent, background, text, and muted colors.',
    {
      mood: z.string().optional().describe('Mood keywords: moody, fresh, corporate, luxury, playful, nature, tech, warm, minimal, retro, ocean, sunset'),
      id: z.string().optional().describe('Specific palette ID (e.g., "moody-dark", "tech-modern", "luxury-premium")'),
    },
    async (params) => {
      const data = loadKnowledge('color-system.yaml');
      const palettes = data.palettes as Array<Record<string, unknown>>;

      let results = palettes;
      if (params.id) {
        results = results.filter(p => p.id === params.id);
      }
      if (params.mood) {
        const keywords = params.mood.toLowerCase().split(/[\s,]+/);
        results = results.filter(p => {
          const tags = (p.mood_tags as string[]) || [];
          return keywords.some(kw => tags.some(tag => tag.toLowerCase().includes(kw)));
        });
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-12: get_contrast_check
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_contrast_check',
    'Check WCAG contrast ratio between two colors. Returns the ratio and pass/fail for AA and AAA levels.',
    {
      foreground: z.string().describe('Foreground hex color (e.g., "#FFFFFF")'),
      background: z.string().describe('Background hex color (e.g., "#000000")'),
    },
    async (params) => {
      const fgLum = relativeLuminance(params.foreground);
      const bgLum = relativeLuminance(params.background);
      const lighter = Math.max(fgLum, bgLum);
      const darker = Math.min(fgLum, bgLum);
      const ratio = (lighter + 0.05) / (darker + 0.05);
      const roundedRatio = Math.round(ratio * 100) / 100;

      const result = {
        foreground: params.foreground,
        background: params.background,
        ratio: roundedRatio,
        AA_normal_text: roundedRatio >= 4.5,
        AA_large_text: roundedRatio >= 3,
        AAA_normal_text: roundedRatio >= 7,
        AAA_large_text: roundedRatio >= 4.5,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-13: get_spacing_scale
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_spacing_scale',
    'Get the 8px grid spacing scale values with usage guidance. Use these values for all spacing decisions — never use arbitrary pixel amounts.',
    {},
    async () => {
      const data = loadKnowledge('layout.yaml');
      const result = {
        grid: data.grid,
        spacing_scale: data.spacing_scale,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-14: get_layout_guide
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_layout_guide',
    'Get layout recommendations for a specific format: margins, safe zones, hierarchy rules, and common layout patterns.',
    {
      format: z.enum(['social', 'print', 'presentation', 'web', 'poster']).optional().describe('Design format type for margin/safe-zone filtering'),
    },
    async (params) => {
      const data = loadKnowledge('layout.yaml');
      const result: Record<string, unknown> = {};

      const margins = data.margins as Record<string, unknown> | undefined;
      const safeZones = data.safe_zones as Record<string, unknown> | undefined;

      if (params.format && margins) {
        // Map 'poster' to the closest key in margins
        const formatKey = params.format === 'poster' ? 'poster' :
                          params.format === 'web' ? 'web_hero' : params.format;
        result.margins = margins[formatKey] || margins;
      } else {
        result.margins = margins;
      }

      if (params.format === 'social' && safeZones) {
        result.safe_zones = safeZones;
      } else if (!params.format) {
        result.safe_zones = safeZones;
      }

      result.hierarchy = data.hierarchy;
      result.patterns = data.patterns;

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-15: get_brand_kit + save_brand_kit
  // ═══════════════════════════════════════════════════════════

  const BRAND_KITS_DIR = nodePath.join(getKnowledgeDir(), 'brand-kits');

  server.tool(
    'get_brand_kit',
    'Load a saved brand kit by name. Returns colors, fonts, logo paths, and brand guidelines.',
    {
      name: z.string().describe('Brand kit name (e.g., "cafe-noir"). Use lowercase with hyphens.'),
    },
    async (params) => {
      const safeName = params.name.replace(/[^a-z0-9-]/gi, '');
      const filePath = nodePath.join(BRAND_KITS_DIR, `${safeName}.yaml`);

      if (!fs.existsSync(filePath)) {
        // List available brand kits
        let available: string[] = [];
        if (fs.existsSync(BRAND_KITS_DIR)) {
          available = fs.readdirSync(BRAND_KITS_DIR)
            .filter(f => f.endsWith('.yaml'))
            .map(f => f.replace('.yaml', ''));
        }
        throw new Error(
          `Brand kit not found: ${safeName}. Available: ${available.length > 0 ? available.join(', ') : '(none saved yet)'}`
        );
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const kit = yaml.load(content);
      return { content: [{ type: 'text' as const, text: JSON.stringify(kit, null, 2) }] };
    }
  );

  server.tool(
    'save_brand_kit',
    'Save a brand kit to disk as a YAML file. Brand kits store colors, fonts, and brand identity for consistent design generation.',
    {
      name: z.string().describe('Brand kit identifier (lowercase with hyphens, e.g., "cafe-noir")'),
      data: z.object({
        brand_name: z.string().describe('Display name of the brand'),
        colors: z.object({
          primary: z.string(),
          secondary: z.string(),
          accent: z.string(),
          background: z.string(),
          text: z.string(),
        }).passthrough().describe('Brand color palette (hex values)'),
        fonts: z.object({
          heading: z.string(),
          body: z.string(),
        }).passthrough().optional().describe('Brand fonts'),
      }).passthrough().describe('Brand kit data'),
    },
    async (params) => {
      if (!fs.existsSync(BRAND_KITS_DIR)) {
        fs.mkdirSync(BRAND_KITS_DIR, { recursive: true });
      }

      const safeName = params.name.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      if (!safeName) {
        throw new Error('Invalid brand kit name. Use lowercase letters, numbers, and hyphens only.');
      }

      const filePath = nodePath.join(BRAND_KITS_DIR, `${safeName}.yaml`);
      const content = yaml.dump(params.data, { lineWidth: 120 });
      fs.writeFileSync(filePath, content, 'utf-8');

      return { content: [{ type: 'text' as const, text: `Brand kit saved: ${safeName}` }] };
    }
  );
}
