import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';
import { execFile } from 'child_process';

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

/**
 * Pre-warm the knowledge cache by eagerly loading the most commonly used YAML files.
 * Called at server startup (fire-and-forget). Fault-tolerant — logs errors but never throws.
 */
export function preWarmKnowledgeCache(): void {
  const filesToPreload = [
    'size-presets.yaml',
    'typography.yaml',
    'color-system.yaml',
    'layout.yaml',
    'image-generation.yaml',
  ];

  for (const filename of filesToPreload) {
    try {
      loadKnowledge(filename);
    } catch (err) {
      console.error(`[Figmento MCP] Pre-warm cache: failed to load ${filename}: ${(err as Error).message}`);
    }
  }

  console.error(`[Figmento MCP] Knowledge cache pre-warmed (${filesToPreload.length} files)`);
}

export const getSizePresetSchema = {
  platform: z.string().optional().describe('Platform filter: instagram, facebook, tiktok, youtube, linkedin, twitter, pinterest, snapchat'),
  category: z.string().optional().describe('Category filter: social, print, presentation, web'),
  id: z.string().optional().describe('Specific preset ID (e.g., "ig-post", "print-a4", "pres-16-9")'),
};

export const getFontPairingSchema = {
  mood: z.string().optional().describe('Mood keywords: modern, classic, bold, luxury, playful, corporate, editorial, minimalist, creative, elegant'),
  id: z.string().optional().describe('Specific pairing ID (e.g., "modern", "luxury", "playful")'),
};

export const getTypeScaleSchema = {
  baseSize: z.number().optional().describe('Base font size in pixels (default: 16)'),
  ratio: z.string().optional().describe('Scale ratio: minor_third, major_third, perfect_fourth, golden_ratio (default: major_third)'),
};

export const getColorPaletteSchema = {
  mood: z.string().optional().describe('Mood keywords: moody, fresh, corporate, luxury, playful, nature, tech, warm, minimal, retro, ocean, sunset'),
  id: z.string().optional().describe('Specific palette ID (e.g., "moody-dark", "tech-modern", "luxury-premium")'),
};

export const getContrastCheckSchema = {
  foreground: z.string().describe('Foreground hex color (e.g., "#FFFFFF")'),
  background: z.string().describe('Background hex color (e.g., "#000000")'),
};

export const getSpacingScaleSchema = {};

export const getLayoutGuideSchema = {
  format: z.string().optional().describe('Design format type for margin/safe-zone filtering: social, print, presentation, web, poster'),
};

export const getBrandKitSchema = {
  name: z.string().describe('Brand kit name (e.g., "cafe-noir"). Use lowercase with hyphens.'),
};

export const saveBrandKitSchema = {
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
};

// ═══════════════════════════════════════════════════════════
// Consolidated get_design_guidance schema
// ═══════════════════════════════════════════════════════════

export const getDesignGuidanceSchema = {
  aspect: z.string().describe('Which design guidance to retrieve: "size" | "fonts" | "typeScale" | "color" | "spacing" | "layout"'),
  // size params
  platform: z.string().optional().describe('Platform filter (for aspect="size"): instagram, facebook, tiktok, etc.'),
  category: z.string().optional().describe('Category filter (for aspect="size"): social, print, presentation, web'),
  id: z.string().optional().describe('Specific preset/pairing/palette ID'),
  // fonts + color params
  mood: z.string().optional().describe('Mood keywords (for aspect="fonts" or "color")'),
  // typeScale params
  baseSize: z.number().optional().describe('Base font size in pixels (for aspect="typeScale", default: 16)'),
  ratio: z.string().optional().describe('Scale ratio (for aspect="typeScale"): minor_third, major_third, perfect_fourth, golden_ratio'),
  // layout params
  format: z.string().optional().describe('Design format (for aspect="layout"): social, print, presentation, web, poster'),
};

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

// ═══════════════════════════════════════════════════════════
// Shared handler implementations for each aspect
// ═══════════════════════════════════════════════════════════

function handleSizePreset(params: Record<string, unknown>) {
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

function handleFontPairing(params: Record<string, unknown>) {
  const data = loadKnowledge('typography.yaml');
  const pairings = data.font_pairings as Array<Record<string, unknown>>;

  let results = pairings;
  if (params.id) {
    results = results.filter(p => p.id === params.id);
  }
  if (params.mood) {
    const keywords = (params.mood as string).toLowerCase().split(/[\s,]+/);
    results = results.filter(p => {
      const tags = (p.mood_tags as string[]) || [];
      return keywords.some(kw => tags.some(tag => tag.toLowerCase().includes(kw)));
    });
  }

  return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
}

function handleTypeScale(params: Record<string, unknown>) {
  const data = loadKnowledge('typography.yaml');
  const scales = data.type_scales as Record<string, Record<string, unknown>>;
  const scaleId = (params.ratio as string) || 'major_third';
  const scale = scales[scaleId];

  if (!scale) {
    throw new Error(`Unknown scale: ${scaleId}. Available: ${Object.keys(scales).join(', ')}`);
  }

  const base = (params.baseSize as number) || 16;
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

function handleColorPalette(params: Record<string, unknown>) {
  const data = loadKnowledge('color-system.yaml');
  const palettes = data.palettes as Array<Record<string, unknown>>;

  let results = palettes;
  if (params.id) {
    results = results.filter(p => p.id === params.id);
  }
  if (params.mood) {
    const keywords = (params.mood as string).toLowerCase().split(/[\s,]+/);
    results = results.filter(p => {
      const tags = (p.mood_tags as string[]) || [];
      return keywords.some(kw => tags.some(tag => tag.toLowerCase().includes(kw)));
    });
  }

  return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
}

function handleSpacingScale() {
  const data = loadKnowledge('layout.yaml');
  const result = {
    grid: data.grid,
    spacing_scale: data.spacing_scale,
  };
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

function handleLayoutGuide(params: Record<string, unknown>) {
  const data = loadKnowledge('layout.yaml');
  const result: Record<string, unknown> = {};

  const margins = data.margins as Record<string, unknown> | undefined;
  const safeZones = data.safe_zones as Record<string, unknown> | undefined;

  if (params.format && margins) {
    // Map 'poster' to the closest key in margins
    const formatKey = params.format === 'poster' ? 'poster' :
                      params.format === 'web' ? 'web_hero' : params.format as string;
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

function handleDesignGuidance(params: Record<string, unknown>) {
  const aspect = params.aspect as string;
  switch (aspect) {
    case 'size':
      return handleSizePreset(params);
    case 'fonts':
      return handleFontPairing(params);
    case 'typeScale':
      return handleTypeScale(params);
    case 'color':
      return handleColorPalette(params);
    case 'spacing':
      return handleSpacingScale();
    case 'layout':
      return handleLayoutGuide(params);
    default:
      throw new Error(`Unknown get_design_guidance aspect: "${aspect}". Must be one of: size, fonts, typeScale, color, spacing, layout`);
  }
}

export function registerIntelligenceTools(server: McpServer): void {

  // ═══════════════════════════════════════════════════════════
  // Consolidated tool: get_design_guidance
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_design_guidance',
    'Get design guidance from the knowledge base. Use "aspect" to choose: "size" (format dimensions), "fonts" (font pairings by mood), "typeScale" (computed type scale), "color" (palettes by mood), "spacing" (8px grid scale), "layout" (margins, safe zones, patterns).',
    getDesignGuidanceSchema,
    async (params) => handleDesignGuidance(params as Record<string, unknown>)
  );

  // ═══════════════════════════════════════════════════════════
  // Out-of-scope tools (remain separate, not consolidated)
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_contrast_check',
    'Check WCAG contrast ratio between two colors. Returns the ratio and pass/fail for AA and AAA levels.',
    getContrastCheckSchema,
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

  const BRAND_KITS_DIR = nodePath.join(getKnowledgeDir(), 'brand-kits');

  server.tool(
    'get_brand_kit',
    'Load a saved brand kit by name. Returns colors, fonts, logo paths, and brand guidelines.',
    getBrandKitSchema,
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
    saveBrandKitSchema,
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

  // ═══════════════════════════════════════════════════════════
  // get_design_rules — verbose reference data for design decisions
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_design_rules',
    'Retrieve design rules and reference data by category from the knowledge base.',
    { category: z.string().describe('Category: typography | layout | color | print | evaluation | refinement | anti-patterns | gradients | taste | saliency | all') },
    async (params) => {
      const data = loadKnowledge('design-rules.yaml');
      const cat = (params.category || 'all').toLowerCase().replace(/-/g, '_');

      const keyMap: Record<string, string> = {
        'anti_patterns': 'anti_patterns',
        'antipatterns': 'anti_patterns',
        'gradients': 'gradients',
        'taste': 'taste',
        'typography': 'typography',
        'layout': 'layout',
        'color': 'color',
        'print': 'print',
        'evaluation': 'evaluation',
        'refinement': 'refinement',
        'saliency': '__saliency__',
      };

      let result: unknown;
      if (cat === 'all') {
        result = data;
      } else if (cat === 'saliency') {
        // Saliency rules are in a separate file
        result = loadKnowledge('saliency-rules.yaml');
      } else {
        const key = keyMap[cat] || cat;
        result = (data as Record<string, unknown>)[key];
        if (!result) {
          const available = Object.keys(data).join(', ') + ', saliency';
          throw new Error(`Unknown category '${params.category}'. Available: ${available}`);
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // suggest_font_pairing — algorithmic font pairing via Fontjoy vectors
  // ═══════════════════════════════════════════════════════════

  // Lazy-load fontjoy vectors (944KB JSON)
  let fontjoyData: Record<string, { category: string; vector: number[] }> | null = null;

  function loadFontjoyVectors(): Record<string, { category: string; vector: number[] }> {
    if (fontjoyData) return fontjoyData;
    const filePath = nodePath.join(getKnowledgeDir(), 'fontjoy-vectors.json');
    fontjoyData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return fontjoyData!;
  }

  function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  server.tool(
    'suggest_font_pairing',
    'Suggest complementary fonts using ML-based similarity vectors. Returns similar and contrasting font pairings.',
    {
      font: z.string().describe('The font family name to find pairings for (e.g. "Playfair Display", "Inter")'),
      mode: z.string().describe('contrast (different visual feel, best for heading/body pairs) | similar (same visual feel, same-family harmony) | both').optional(),
      count: z.number().describe('Number of suggestions to return per mode (default 5)').optional(),
    },
    async (params) => {
      const vectors = loadFontjoyVectors();
      const source = vectors[params.font];
      if (!source) {
        // Fuzzy match attempt
        const lowerFont = params.font.toLowerCase();
        const match = Object.keys(vectors).find(k => k.toLowerCase() === lowerFont);
        if (match) {
          return { content: [{ type: 'text' as const, text: `Font not found as "${params.font}". Did you mean "${match}"? Try again with the exact name.` }] };
        }
        return { content: [{ type: 'text' as const, text: `Font "${params.font}" not found in the Fontjoy database (802 Google Fonts). Check spelling or try a different font.` }] };
      }

      const mode = params.mode || 'both';
      const count = params.count || 5;

      // Compute similarity to all other fonts
      const scores: { font: string; category: string; similarity: number }[] = [];
      for (const [name, data] of Object.entries(vectors)) {
        if (name === params.font) continue;
        scores.push({
          font: name,
          category: data.category,
          similarity: cosineSimilarity(source.vector, data.vector),
        });
      }

      const result: Record<string, unknown> = {
        source_font: params.font,
        source_category: source.category,
      };

      if (mode === 'similar' || mode === 'both') {
        // Most similar = highest cosine similarity
        const similar = [...scores].sort((a, b) => b.similarity - a.similarity).slice(0, count);
        result.similar = similar.map(s => ({
          font: s.font,
          category: s.category,
          similarity: Math.round(s.similarity * 1000) / 1000,
        }));
      }

      if (mode === 'contrast' || mode === 'both') {
        // Most contrasting = lowest cosine similarity (but not negative = totally unrelated)
        // Best pairings are moderately different (0.3-0.7 range), not maximally opposite
        const contrasting = [...scores]
          .filter(s => s.similarity > 0.1 && s.similarity < 0.75)
          .sort((a, b) => a.similarity - b.similarity)
          .slice(0, count);
        result.contrasting = contrasting.map(s => ({
          font: s.font,
          category: s.category,
          similarity: Math.round(s.similarity * 1000) / 1000,
          note: s.category !== source.category ? 'cross-category pair (serif+sans)' : 'same-category contrast',
        }));
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // generate_accessible_palette — WCAG-compliant colors via Leonardo
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'generate_accessible_palette',
    'Generate a WCAG-compliant color palette from a base color. Uses Adobe Leonardo to guarantee contrast ratios. Returns light and dark mode variants. Use when you need colors that are guaranteed to pass WCAG AA/AAA contrast checks.',
    {
      base_color: z.string().describe('Base/brand color as hex (e.g. "#2680EB")'),
      background: z.string().describe('Background color as hex (default "#FFFFFF")').optional(),
      mode: z.string().describe('light | dark | both (default both)').optional(),
    },
    async (params) => {
      // Dynamic import for Leonardo (ESM/CJS compatibility)
      const leo = await import('@adobe/leonardo-contrast-colors');
      const { Theme, Color, BackgroundColor } = leo;

      const bgHex = params.background || '#FFFFFF';
      const mode = params.mode || 'both';

      const bg = new BackgroundColor({
        name: 'background',
        colorKeys: [bgHex],
        ratios: [1],
      });

      const brand = new Color({
        name: 'brand',
        colorKeys: [params.base_color],
        colorSpace: 'LCH',
        ratios: {
          'brand-subtle': 1.25,      // Subtle tint, decorative only
          'brand-muted': 2,          // Large text on matching bg
          'brand-default': 4.5,      // WCAG AA normal text
          'brand-emphasis': 7,       // WCAG AAA normal text
          'brand-strong': 10,        // Maximum contrast
        },
        smooth: true,
      });

      // Neutral scale for text/borders
      const neutral = new Color({
        name: 'neutral',
        colorKeys: [params.base_color], // Tinted neutrals from brand color
        colorSpace: 'LCH',
        ratios: {
          'neutral-subtle': 1.15,
          'neutral-border': 2,
          'neutral-muted': 3,
          'neutral-text': 4.5,
          'neutral-heading': 7,
          'neutral-strong': 11,
        },
        smooth: true,
        saturation: 10,              // Near-neutral but warm/cool tinted
      } as any);

      const result: Record<string, unknown> = {
        base_color: params.base_color,
        contrast_method: 'Adobe Leonardo (CIE LCH perceptual)',
        wcag_guaranteed: true,
      };

      if (mode === 'light' || mode === 'both') {
        const lightTheme = new Theme({
          colors: [bg, brand, neutral],
          backgroundColor: bg,
          lightness: 100,
          output: 'HEX',
        });
        result.light = lightTheme.contrastColorPairs;
      }

      if (mode === 'dark' || mode === 'both') {
        const darkTheme = new Theme({
          colors: [bg, brand, neutral],
          backgroundColor: bg,
          lightness: 8,
          output: 'HEX',
        });
        result.dark = darkTheme.contrastColorPairs;
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // evaluate_layout — opt-in layout quality metrics via Python subprocess
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'evaluate_layout',
    'Score a layout\'s alignment and overlap quality using HuggingFace layout metrics. Requires Python 3.11+ with evaluate/numpy installed (pip install evaluate datasets numpy). This is an OPT-IN quality check — not called automatically. Input: array of bounding boxes as normalized [cx, cy, w, h] (0-1 range, center-based). Lower scores = better.',
    {
      bboxes: z.string().describe('JSON array of bounding boxes: [[cx, cy, w, h], ...] — all values normalized 0-1. cx/cy = center position, w/h = size relative to canvas.'),
    },
    async (params) => {
      const bboxes = JSON.parse(params.bboxes);
      if (!Array.isArray(bboxes) || bboxes.length === 0) {
        throw new Error('bboxes must be a non-empty array of [cx, cy, w, h] arrays');
      }

      // Find the layout-metrics.py script
      const scriptPaths = [
        nodePath.join(__dirname, '..', '..', 'scripts', 'layout-metrics.py'),
        nodePath.join(__dirname, '..', 'scripts', 'layout-metrics.py'),
      ];
      const scriptPath = scriptPaths.find(p => fs.existsSync(p));
      if (!scriptPath) {
        throw new Error('layout-metrics.py not found. Expected at: scripts/layout-metrics.py');
      }

      const input = JSON.stringify({ bboxes });

      return new Promise((resolve, reject) => {
        const child = execFile('python', [scriptPath], { timeout: 30000 }, (error, stdout, stderr) => {
          if (error) {
            resolve({
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Layout metrics failed: ${error.message}`,
                  hint: 'Install dependencies: pip install evaluate datasets numpy',
                  stderr: stderr?.slice(0, 500),
                }, null, 2),
              }],
            });
            return;
          }

          try {
            const result = JSON.parse(stdout);
            resolve({ content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] });
          } catch {
            resolve({
              content: [{ type: 'text' as const, text: `Layout metrics returned invalid JSON: ${stdout.slice(0, 500)}` }],
            });
          }
        });

        child.stdin?.write(input);
        child.stdin?.end();
      });
    }
  );

  // ═══════════════════════════════════════════════════════════
  // get_design_intelligence — bootstrap tool for ALL models
  // Returns the complete design playbook so any model (Gemini, GPT, Claude)
  // produces top-tier designs. Call ONCE at the start of any design task.
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_design_intelligence',
    'CALL THIS FIRST before any design task. Returns the complete Figmento design playbook: workflow, taste rules, anti-patterns, typography/color selection, scoring criteria. This is mandatory context for producing top-tier designs. Only needs to be called once per design session.',
    {},
    async () => {
      const playbook = `# Figmento Design Intelligence Playbook
## You are a top-tier graphic designer. Follow these rules exactly.

## MANDATORY: Design Brief Analysis (do this BEFORE any tool call)
Answer these questions and show them to the user:
\`\`\`
DESIGN BRIEF ANALYSIS
─────────────────────
Aesthetic direction  : [editorial / brutalist / organic / luxury / geometric / playful]
Font pairing         : [heading font] + [body font] — reason: [why]
Color story          : [dark / light / colorful / monochrome] — dominant: [hex]
Memorable element    : [the ONE thing that makes this unforgettable]
Generic trap avoided : [what the bot version would look like — and what you're doing instead]
\`\`\`

## WORKFLOW (follow this order)
1. Connect to Figma (skip if connected)
2. Analyze brief → fill the template above
3. Call get_design_guidance(aspect="fonts") or suggest_font_pairing(font) for typography
4. Call generate_accessible_palette(base_color) if user provides a color, OR get_design_guidance(aspect="color", mood=...) for mood-based palette
5. Call get_layout_blueprint(category, mood) for composition structure
6. Create the design in ONE continuous flow — no pausing for approval
7. Call run_refinement_check → fix flagged issues
8. Take screenshot → self-evaluate: "senior designer or bot?"

## 8 TASTE RULES (non-negotiable)
1. **Commit to an aesthetic direction** before calling any tool. Never start neutral.
2. **Typography is the first decision.** Never default to Inter/Inter. Call suggest_font_pairing or pick from get_design_rules('typography'). Choose a font with CHARACTER.
3. **Color commitment.** Pick a dominant color story and use it boldly. FORBIDDEN: light grey background + timid blue accent.
4. **Background depth.** Never flat solid fills on hero sections. Always: gradient, radial glow, or texture. Even dark-to-slightly-less-dark creates depth.
5. **Spatial generosity.** Increase padding by 1.5× what feels "enough." Generous whitespace = premium feel.
6. **Never converge.** Every brief produces a visually DISTINCT output. Actively diverge.
7. **Self-evaluate ruthlessly.** After screenshot: "senior designer or bot?" If bot — fix the most generic element.
8. **The ONE memorable thing.** Every design needs one unforgettable element: 120px+ headline, unexpected color, grid-breaking element, or full-bleed image.

## ANTI-AI MARKERS (if your design has ANY of these, fix it)
### Surfaces
- Hyper-smooth surfaces with no texture → add subtle grain/noise at 3-8% opacity
- Plastic-like shadows (identical on every element) → vary shadow angle, blur, tint

### Composition
- Perfect symmetry everywhere → offset at least one element (60/40 not 50/50)
- Grid-locked with no tension → break grid with one overlapping or bleeding element
- Uniform spacing everywhere → vary: tighter for related items, generous for separation

### Typography
- Default font pairing with no personality → choose a font the user would REMEMBER
- Every text block center-aligned → mix alignments by hierarchy level

### Color
- Generic harmony, all same saturation → mix muted + vivid intentionally
- No color tension or surprise → introduce one unexpected accent

### Meta
- No memorable element → add ONE focal point that couldn't be generated by default
- Replicable by any tool with same params → add a non-obvious creative choice

## TYPOGRAPHY SELECTION
- Call get_design_rules('typography') for the full mood → font pairing table (20 proven pairs)
- Call suggest_font_pairing(font, mode='contrast') when user specifies ONE font
- CRITICAL: If user names a font → use ONLY that font. Never mix without permission.
- fontWeight 600 causes Inter fallback on most fonts. Use 400 or 700 only.
- Line height is PIXELS not multiplier: pass fontSize × multiplier (e.g. 48 × 1.2 = 57.6)

## COLOR SELECTION
- Call generate_accessible_palette(base_color) when user gives a hex → WCAG-guaranteed palette
- Call get_design_guidance(aspect="color", mood=...) for mood-based palettes
- Call get_design_rules('color') for the full mood → palette mapping
- Color psychology: get_design_rules('color') includes emotion → palette lookup
- Contrast minimum: 4.5:1 normal text, 3:1 large text

## GRADIENT OVERLAYS (most common AI mistake)
- Only 2 stops. Never 3+.
- Solid end = WHERE THE TEXT IS. Transparent end = where image shows.
- Gradient color MUST match section background (dark bg → dark gradient, never black on light)
- bottom-top: transparent at bottom, solid at top (text at top)
- top-bottom: transparent at top, solid at bottom (text at bottom)

## SALIENCY-AWARE TEXT PLACEMENT (where to put text on images)
- Never place text over high-detail areas (edges, textures, faces)
- Place text on smooth regions: sky, flat surfaces, dark areas, gradients
- Product centered → text top + bottom. Product left → text right. Product right → text left.
- Portrait/face → text below chin, never over eyes
- Busy/complex image → ALWAYS use overlay (50-70% opacity scrim)
- Flat background → free placement, overlay usually not needed
- Call get_design_rules('saliency') for the full text zone heuristic table

## SCORING (target 7+ for production, 8.5+ for portfolio)
| Dimension | Weight | Key Question |
|-----------|--------|-------------|
| Visual Design | 30% | Typography, color, composition, spacing quality? |
| Creativity | 20% | Memorable element? Not replicable by defaults? |
| Content Hierarchy | 20% | Clear reading order? CTA identifiable? |
| Technical | 15% | WCAG contrast? Safe zones? Images resolved? |
| AI Distinctiveness | 15% | Would a viewer think a human designed this? |

Score tiers: 9-10 Exceptional | 7-8 Professional | 5-6 Adequate | 3-4 Below Standard | 1-2 Failed

## COMMON PATTERNS
- **Button:** Auto-layout frame (HORIZONTAL, padding 12-16/24-32, cornerRadius 8-24) + text child. Never separate rect + text.
- **Ad/Hero:** Nested auto-layout: root → background → overlay gradient → content frame (VERTICAL, padding 96/64, gap 40) → text-group + cta-group
- **Cards:** Auto-layout frame with layoutSizingVertical: HUG (never fixed height — clips text)
- **Icons:** Container must have auto-layout + padding. Icon size = container − 2×padding.

## TOOLS AVAILABLE
- suggest_font_pairing(font, mode) — ML-based font pairing from 802 Google Fonts
- generate_accessible_palette(base_color) — WCAG-guaranteed palette from any hex
- get_design_rules(category) — typography | color | layout | print | evaluation | refinement | anti-patterns | gradients | taste | saliency
- get_design_guidance(aspect, mood) — size | fonts | typeScale | color | spacing | layout
- get_layout_blueprint(category, mood) — proportional zone systems for composition
- run_refinement_check — automated beauty checks after design creation
- batch_execute — group 3+ element creations into one call (max 15 per batch)
- create_component — use for buttons, badges, cards (never build manually)

## SINGLE FRAME RULE
Create exactly ONE root frame per design. Never duplicate. If something fails, fix it — don't create a new frame.`;

      return { content: [{ type: 'text' as const, text: playbook }] };
    }
  );
}
