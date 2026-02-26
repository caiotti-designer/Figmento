import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';
import {
  getKnowledgeDir,
  getDesignSystemsDir,
  getFormatsDir,
  resolveTokens,
  recipeToCommands,
  deepMerge,
} from './design-system';
import { getPatternRecipe, resolveFormatCategory } from './patterns';

// ═══════════════════════════════════════════════════════════
// Template Schema Types
// ═══════════════════════════════════════════════════════════

interface TemplatePropDef {
  type: string;
  required?: boolean;
  default?: unknown;
  description?: string;
}

interface TemplateFrameDef {
  id: string;
  name: string;
  pattern: string;
  format: string;
  variant?: string;
  props?: Record<string, unknown>;
  section_background?: string; // Token key for background in connected mode (e.g. "primary", "surface", "background")
}

interface TemplateDefinition {
  name: string;
  description: string;
  frame_count: number;
  formats_used: string[];
  estimated_time?: string;
  layout?: 'sequential' | 'grid';
  grid_columns?: number;
  gap?: number;
  default_composition_mode?: 'connected' | 'isolated';
  props: Record<string, TemplatePropDef>;
  frames: TemplateFrameDef[];
}

interface CompositionRules {
  pattern_fill_defaults?: Record<string, string>;
  vertical_rhythm?: { section_gap: number; layout_direction: string };
  alternating_backgrounds?: { exceptions?: string[] };
}

// ═══════════════════════════════════════════════════════════
// Template Loader
// ═══════════════════════════════════════════════════════════

function getTemplatesDir(): string {
  return nodePath.join(getKnowledgeDir(), 'templates');
}

function loadTemplate(name: string): TemplateDefinition {
  const safeName = name.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
  const filePath = nodePath.join(getTemplatesDir(), `${safeName}.yaml`);
  if (!fs.existsSync(filePath)) {
    const available = listTemplateNames();
    throw new Error(`Template not found: ${safeName}. Available: ${available.join(', ')}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(content) as TemplateDefinition;
}

function listTemplateNames(): string[] {
  const dir = getTemplatesDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace('.yaml', ''));
}

// ═══════════════════════════════════════════════════════════
// Composition Rules Loader
// ═══════════════════════════════════════════════════════════

function loadCompositionRules(): CompositionRules | null {
  const filePath = nodePath.join(getKnowledgeDir(), 'patterns', 'composition-rules.yaml');
  if (!fs.existsSync(filePath)) return null;
  return yaml.load(fs.readFileSync(filePath, 'utf-8')) as CompositionRules;
}

/**
 * Resolve a token key (e.g. "primary", "surface", "background") to a hex color
 * from the loaded design system tokens.
 */
function resolveBackgroundColor(bgKey: string, tokens: Record<string, unknown>): string | null {
  const colors = (tokens as Record<string, Record<string, unknown>>).colors;
  if (!colors) return null;
  const color = colors[bgKey];
  if (typeof color === 'string') return color;
  return null;
}

/**
 * Determine which background token key a frame should use in connected mode.
 * Priority: explicit section_background on frame > pattern_fill_defaults from rules > alternating fallback.
 */
function resolveFrameBackground(
  frameDef: TemplateFrameDef,
  frameIndex: number,
  rules: CompositionRules | null,
): string {
  // 1. Explicit declaration in template frame wins
  if (frameDef.section_background) return frameDef.section_background;

  // 2. Pattern-level default from composition rules
  if (rules?.pattern_fill_defaults) {
    const patternDefault = rules.pattern_fill_defaults[frameDef.pattern];
    if (patternDefault) return patternDefault;
  }

  // 3. Alternating fallback: odd → background, even → surface (0-indexed)
  return frameIndex % 2 === 0 ? 'surface' : 'background';
}

// ═══════════════════════════════════════════════════════════
// Format Dimensions Resolver
// ═══════════════════════════════════════════════════════════

function getFormatDimensions(formatName: string): { width: number; height: number } {
  const formatsDir = getFormatsDir();
  const categories = ['social', 'print', 'presentation', 'advertising', 'web', 'email'];
  for (const category of categories) {
    const filePath = nodePath.join(formatsDir, category, `${formatName}.yaml`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = yaml.load(content) as Record<string, unknown>;
      const dims = data.dimensions as Record<string, unknown> | undefined;
      return {
        width: (dims?.width as number) || 0,
        height: (dims?.height as number) || 0,
      };
    }
  }
  return { width: 0, height: 0 };
}

// ═══════════════════════════════════════════════════════════
// Template Prop Resolver
// Resolves {{global_prop}} references inside frame-level prop values
// so that mappings like { headline: "{{company_name}}" } are expanded
// before being passed to resolveTokens.
// ═══════════════════════════════════════════════════════════

function resolveTemplateProps(
  frameProps: Record<string, unknown>,
  globalProps: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(frameProps)) {
    if (typeof val === 'string' && val.includes('{{')) {
      result[key] = val.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
        const v = globalProps[name];
        return v !== undefined ? String(v) : `{{${name}}}`;
      });
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// Tool Registration
// ═══════════════════════════════════════════════════════════

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function registerDsTemplateTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  // ═══════════════════════════════════════════════════════════
  // DS-18: create_from_template
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'create_from_template',
    'Instantiate a multi-frame project template on the Figma canvas. Loads the template YAML, resolves all frame patterns with design system tokens, and creates every frame in one pass. Templates: social_media_kit (9 frames), pitch_deck (8 slides), brand_stationery (4 frames), landing_page_full (6 sections), restaurant_menu (5 frames). Use composition_mode="connected" (default for landing pages) to stack sections vertically with alternating backgrounds for a cohesive page feel.',
    {
      template: z.string().describe('Template name (e.g. "pitch_deck", "social_media_kit", "brand_stationery", "landing_page_full", "restaurant_menu")'),
      system: z.string().describe('Design system name to use for tokens (e.g. "testbrand", "payflow")'),
      props: z.record(z.unknown()).optional().describe('Props to inject across all template frames'),
      startX: z.coerce.number().optional().describe('Starting X position for the first frame (default: 0)'),
      startY: z.coerce.number().optional().describe('Starting Y position for all frames (default: 0)'),
      composition_mode: z.enum(['connected', 'isolated']).optional().describe('"connected" (default for templates that declare it) — sections stack vertically with gap=0 and composition background rules applied. "isolated" — current behavior, each frame placed horizontally with a gap, no background overrides.'),
    },
    async (params) => {
      // 1. Load template definition
      const template = loadTemplate(params.template);

      // 2. Load design system tokens (once, shared across all frames)
      const safeName = params.system.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');
      if (!fs.existsSync(tokensPath)) {
        throw new Error(`Design system not found: ${safeName}`);
      }
      const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(tokensContent) as Record<string, unknown>;

      // 3. Determine effective composition mode
      // Priority: explicit param > template default > 'isolated'
      const compositionMode = params.composition_mode
        ?? template.default_composition_mode
        ?? 'isolated';
      const isConnected = compositionMode === 'connected';

      // 4. Load composition rules (only needed in connected mode)
      const compositionRules = isConnected ? loadCompositionRules() : null;

      const globalProps = params.props || {};
      // In connected mode: gap=0 and vertical layout. In isolated: use template values.
      const gap = isConnected ? 0 : (template.gap ?? 80);
      const startX = params.startX ?? 0;
      const startY = params.startY ?? 0;
      const layout = template.layout || 'sequential';
      const gridColumns = template.grid_columns || 3;

      const nodeIds: string[] = [];
      const frameResults: Array<{
        id: string;
        name: string;
        nodeId: string;
        pattern: string;
        format: string;
        section_background?: string;
      }> = [];

      let currentX = startX;
      let currentY = startY;
      let colIndex = 0;

      // 5. Iterate through each frame in the template
      for (let frameIndex = 0; frameIndex < template.frames.length; frameIndex++) {
        const frameDef = template.frames[frameIndex];

        // 5a. Resolve frame-level props (expand {{global_prop}} references)
        const resolvedFrameSpecificProps = resolveTemplateProps(
          frameDef.props || {},
          globalProps,
        );
        // Merge: resolved frame props override global props
        const frameProps: Record<string, unknown> = {
          ...globalProps,
          ...resolvedFrameSpecificProps,
        };

        // 5b. Load pattern recipe
        const patternDef = getPatternRecipe(frameDef.pattern);

        // 5c. Fill in pattern-level defaults for any missing props
        for (const [propName, propDef] of Object.entries(patternDef.props)) {
          if (frameProps[propName] === undefined && propDef.default !== undefined) {
            frameProps[propName] = propDef.default;
          }
        }

        // 5d. Build recipe (deep-clone base)
        let recipe = JSON.parse(JSON.stringify(patternDef.recipe)) as Record<string, unknown>;

        // 5e. Apply variant overrides
        const variant = frameDef.variant || 'default';
        if (variant !== 'default' && patternDef.variants) {
          const variantOverrides = patternDef.variants[variant];
          if (variantOverrides) {
            recipe = deepMerge(recipe, variantOverrides);
          }
        }

        // 5f. Apply format adaptations
        const formatCategory = resolveFormatCategory(frameDef.format);
        if (formatCategory && patternDef.format_adaptations) {
          const adaptations = patternDef.format_adaptations[formatCategory];
          if (adaptations) {
            recipe = deepMerge(recipe, adaptations);
          }
        }

        // 5g. Resolve token references and prop substitutions
        const resolved = resolveTokens(recipe, tokens, frameProps, frameDef.pattern);

        // 5h. Calculate position for this frame
        let frameX = currentX;
        let frameY = currentY;

        if (isConnected && layout !== 'grid') {
          // Connected mode: vertical stacking — X is fixed, Y advances by frame height
          const dims = getFormatDimensions(frameDef.format);
          frameX = startX;
          frameY = currentY;
          // currentY advances after frame creation (after we know height)
          // Use format height as the advancement value
          currentY += (dims.height || 900); // gap is already 0
        } else if (layout === 'grid') {
          const dims = getFormatDimensions(frameDef.format);
          if (colIndex > 0 && colIndex % gridColumns === 0) {
            currentX = startX;
            currentY += (dims.height || 1080) + gap;
            colIndex = 0;
          }
          frameX = currentX;
          frameY = currentY;
          currentX += (dims.width || 1920) + gap;
          colIndex++;
        }

        // 5i. Convert to batch commands
        const commands = recipeToCommands(resolved, {
          x: frameX,
          y: frameY,
          componentName: frameDef.pattern,
          variant,
        });

        // 5j. Execute via batch_execute
        const data = await sendDesignCommand('batch_execute', { commands });
        const results = (data as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined;
        const rootResult = results?.[0];
        const rootData = rootResult?.data as Record<string, unknown> | undefined;
        const nodeId = (rootData?.nodeId || rootResult?.nodeId || rootResult?.id || 'unknown') as string;

        // 5k. Apply composition background override in connected mode
        let appliedBackground: string | undefined;
        if (isConnected && nodeId !== 'unknown') {
          const bgKey = resolveFrameBackground(frameDef, frameIndex, compositionRules);
          const bgColor = resolveBackgroundColor(bgKey, tokens);
          if (bgColor) {
            await sendDesignCommand('set_fill', { nodeId, color: bgColor });
            appliedBackground = bgKey;
          }
        }

        // 5l. Typography hierarchy warning — log if adjacent sections both use display scale
        // (informational only, does not block execution)
        if (isConnected && frameIndex > 0) {
          const prevPattern = template.frames[frameIndex - 1].pattern;
          const heroPatterns = ['hero_block'];
          if (heroPatterns.includes(frameDef.pattern) && heroPatterns.includes(prevPattern)) {
            console.warn(`[composition] Warning: adjacent sections ${prevPattern} and ${frameDef.pattern} both use display scale typography`);
          }
        }

        nodeIds.push(nodeId);
        frameResults.push({
          id: frameDef.id,
          name: frameDef.name,
          nodeId,
          pattern: frameDef.pattern,
          format: frameDef.format,
          ...(appliedBackground ? { section_background: appliedBackground } : {}),
        });

        // 5m. Advance X for isolated sequential layout
        if (!isConnected && layout === 'sequential') {
          const dims = getFormatDimensions(frameDef.format);
          currentX += (dims.width || 1920) + gap;
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            template: template.name,
            system: params.system,
            composition_mode: compositionMode,
            framesCreated: frameResults.length,
            nodeIds,
            frames: frameResults,
          }, null, 2),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-19: list_templates
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'list_templates',
    'List all available project templates with their names, descriptions, frame counts, formats used, and estimated creation time.',
    {},
    async () => {
      const names = listTemplateNames();
      const templates = names.map(name => {
        try {
          const t = loadTemplate(name);
          return {
            name: t.name,
            description: t.description,
            frame_count: t.frame_count || t.frames?.length || 0,
            formats_used: t.formats_used || [],
            estimated_time: t.estimated_time || null,
            props: Object.entries(t.props || {}).map(([k, v]) => ({
              name: k,
              type: v.type,
              required: v.required || false,
              description: v.description || null,
            })),
          };
        } catch {
          return { name, error: 'Failed to load template' };
        }
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(templates, null, 2),
        }],
      };
    }
  );
}
