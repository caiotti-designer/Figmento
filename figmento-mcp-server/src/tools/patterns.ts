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

// ═══════════════════════════════════════════════════════════
// Pattern Recipe Types
// ═══════════════════════════════════════════════════════════

interface PatternPropDef {
  type: string;
  required?: boolean;
  default?: unknown;
  values?: string[];
}

interface PatternRecipe {
  description: string;
  props: Record<string, PatternPropDef>;
  recipe: Record<string, unknown>;
  variants?: Record<string, Record<string, unknown>>;
  format_adaptations?: Record<string, Record<string, unknown>>;
}

// ═══════════════════════════════════════════════════════════
// Pattern Loader
// ═══════════════════════════════════════════════════════════

let patternCache: Record<string, PatternRecipe> | null = null;

export function clearPatternCache(): void {
  patternCache = null;
}

function loadPatterns(): Record<string, PatternRecipe> {
  if (patternCache) return patternCache;
  const patternsDir = nodePath.join(getKnowledgeDir(), 'patterns');
  if (!fs.existsSync(patternsDir)) {
    throw new Error('Patterns directory not found at knowledge/patterns/');
  }

  const merged: Record<string, PatternRecipe> = {};
  const files = fs.readdirSync(patternsDir).filter(f => f.endsWith('.yaml'));
  for (const file of files) {
    const content = fs.readFileSync(nodePath.join(patternsDir, file), 'utf-8');
    const data = yaml.load(content) as Record<string, PatternRecipe>;
    Object.assign(merged, data);
  }

  patternCache = merged;
  return patternCache;
}

export function getPatternRecipe(patternName: string): PatternRecipe {
  const patterns = loadPatterns();
  const pattern = patterns[patternName];
  if (!pattern) {
    const available = Object.keys(patterns);
    throw new Error(`Pattern not found: ${patternName}. Available: ${available.join(', ')}`);
  }
  return pattern;
}

// ═══════════════════════════════════════════════════════════
// Format Category Resolver
// ═══════════════════════════════════════════════════════════

export function resolveFormatCategory(formatName: string): string | null {
  const formatsDir = getFormatsDir();
  const categories = ['social', 'print', 'presentation', 'advertising', 'web', 'email'];
  for (const category of categories) {
    const filePath = nodePath.join(formatsDir, category, `${formatName}.yaml`);
    if (fs.existsSync(filePath)) {
      return category;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// Tool Registration
// ═══════════════════════════════════════════════════════════

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function registerPatternTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  // ═══════════════════════════════════════════════════════════
  // DS-13: create_from_pattern
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'create_from_pattern',
    'Instantiate a cross-format design pattern on the Figma canvas. Loads design system tokens, resolves the pattern recipe with format-specific adaptations, and enforces canvas dimensions from the format YAML — the format always wins. Use size_variant to select a specific size (e.g. "portrait" → instagram_post 1080×1350, "landscape" → 1080×566, "square" → 1080×1080, "desktop" → landing_page 1440×1024, "mobile" → 390×844). If omitted, the format\'s default_size is used automatically. Patterns: hero_block, feature_grid, pricing_card, testimonial, contact_block, content_section, image_text_row, gallery, data_row, cta_banner.',
    {
      system: z.string().describe('Design system name (e.g. "payflow")'),
      pattern: z.string().describe('Pattern name: hero_block, feature_grid, pricing_card, testimonial, contact_block, content_section, image_text_row, gallery, data_row, cta_banner'),
      format: z.string().describe('Target format name (e.g. "instagram_post", "landing_page", "business_card"). Used to look up the format category and apply format_adaptations.'),
      size_variant: z.string().optional().describe('Size variant key from the format\'s size_variants map (e.g. "portrait", "landscape", "square", "desktop", "mobile", "screen", "print_ready"). If omitted, uses the format\'s default_size.'),
      props: z.record(z.unknown()).optional().describe('Pattern props, e.g. { headline: "Welcome", subheadline: "Get started today" }'),
      variant: z.string().optional().describe('Pattern variant (e.g. "dark", "stacked", "highlighted")'),
      parentId: z.string().optional().describe('Parent frame nodeId to place pattern inside'),
      x: z.coerce.number().optional().describe('X position'),
      y: z.coerce.number().optional().describe('Y position'),
    },
    async (params) => {
      // Always reload patterns from disk — ensures YAML edits are hot without server restart
      clearPatternCache();

      // 1. Load design system tokens
      const safeName = params.system.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');
      if (!fs.existsSync(tokensPath)) {
        throw new Error(`Design system not found: ${safeName}`);
      }
      const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(tokensContent) as Record<string, unknown>;

      // 2. Load pattern recipe
      const patternDef = getPatternRecipe(params.pattern);

      // 3. Validate required props
      const patternProps = params.props || {};
      for (const [propName, propDef] of Object.entries(patternDef.props)) {
        if (propDef.required && patternProps[propName] === undefined) {
          throw new Error(
            `Pattern '${params.pattern}' requires prop '${propName}'`
          );
        }
        if (patternProps[propName] === undefined && propDef.default !== undefined) {
          patternProps[propName] = propDef.default;
        }
      }

      // 4. Start with base recipe
      let recipe = JSON.parse(JSON.stringify(patternDef.recipe)) as Record<string, unknown>;

      // 5. Apply variant overrides
      const variant = params.variant || 'default';
      if (variant !== 'default' && patternDef.variants) {
        const variantOverrides = patternDef.variants[variant];
        if (!variantOverrides) {
          const available = Object.keys(patternDef.variants);
          throw new Error(
            `Variant '${variant}' not found for pattern '${params.pattern}'. Available: ${available.join(', ')}`
          );
        }
        recipe = deepMerge(recipe, variantOverrides);
      }

      // 6. Apply format adaptations
      const formatCategory = resolveFormatCategory(params.format);
      if (formatCategory && patternDef.format_adaptations) {
        const adaptations = patternDef.format_adaptations[formatCategory];
        if (adaptations) {
          recipe = deepMerge(recipe, adaptations);
        }
      }

      // 6b. Resolve and enforce canvas dimensions from format YAML
      // Format YAML is the single source of truth for dimensions — the pattern recipe must not override them.
      let enforcedWidth: number | undefined;
      let enforcedHeight: number | undefined;
      let resolvedSizeVariantId: string | undefined;

      if (formatCategory) {
        const formatsDir = getFormatsDir();
        const formatFilePath = nodePath.join(formatsDir, formatCategory, `${params.format}.yaml`);
        if (fs.existsSync(formatFilePath)) {
          const formatContent = fs.readFileSync(formatFilePath, 'utf-8');
          const formatData = yaml.load(formatContent) as Record<string, unknown>;

          const sizeVariants = formatData.size_variants as Record<string, { width: number; height: number }> | undefined;
          const defaultSize = formatData.default_size as string | undefined;

          if (sizeVariants) {
            // Resolve which variant to use
            const variantKey = params.size_variant || defaultSize || Object.keys(sizeVariants)[0];
            const chosenVariant = sizeVariants[variantKey];

            if (params.size_variant && !chosenVariant) {
              const available = Object.keys(sizeVariants);
              throw new Error(
                `Size variant '${params.size_variant}' not found for format '${params.format}'. Available: ${available.join(', ')}`
              );
            }

            if (chosenVariant) {
              enforcedWidth = chosenVariant.width;
              enforcedHeight = chosenVariant.height;
              resolvedSizeVariantId = variantKey;
            }
          } else {
            // Fallback to top-level dimensions
            const dims = formatData.dimensions as Record<string, unknown> | undefined;
            if (dims) {
              enforcedWidth = dims.width as number | undefined;
              enforcedHeight = dims.height as number | undefined;
            }
          }
        }
      }

      // Override root frame dimensions in recipe — format always wins.
      // For web formats: only enforce width (patterns hug their content height).
      // For all other formats (social, print, presentation): enforce both dimensions.
      const isWebFormat = formatCategory === 'web';
      if (enforcedWidth !== undefined) recipe.width = enforcedWidth;
      if (enforcedHeight !== undefined && !isWebFormat) recipe.height = enforcedHeight;

      // When enforcing canvas dimensions on auto-layout frames, lock sizing to FIXED
      // so Figma doesn't collapse the frame to hug its contents.
      // VERTICAL layout: primaryAxis = height, counterAxis = width
      // HORIZONTAL layout: primaryAxis = width, counterAxis = height
      // Web exception: only lock the width axis — height stays HUG so sections
      // collapse to their natural content height instead of filling 1024px of dead space.
      if ((enforcedWidth !== undefined || enforcedHeight !== undefined) && recipe.layoutMode) {
        const isVertical = recipe.layoutMode === 'VERTICAL';
        if (isVertical) {
          if (enforcedHeight !== undefined && !isWebFormat) recipe.primaryAxisSizingMode = 'FIXED';
          if (enforcedWidth !== undefined) recipe.counterAxisSizingMode = 'FIXED';
        } else {
          if (enforcedWidth !== undefined) recipe.primaryAxisSizingMode = 'FIXED';
          if (enforcedHeight !== undefined && !isWebFormat) recipe.counterAxisSizingMode = 'FIXED';
        }
      }

      // 7. Resolve token references and prop substitutions
      const resolved = resolveTokens(recipe, tokens, patternProps, params.pattern);

      // 8. Convert to batch commands
      const commands = recipeToCommands(resolved, {
        parentId: params.parentId,
        x: params.x,
        y: params.y,
        componentName: params.pattern,
        variant,
      });

      // 9. Execute via batch_execute
      const data = await sendDesignCommand('batch_execute', { commands });

      // 10. Extract result info
      const results = (data as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined;
      const rootResult = results?.[0];
      const rootData = rootResult?.data as Record<string, unknown> | undefined;
      const nodeId = rootData?.nodeId || rootResult?.nodeId || rootResult?.id || 'unknown';
      const childCount = (resolved.children as unknown[] | undefined)?.length || 0;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            nodeId,
            name: `${params.pattern}_${variant}`,
            pattern: params.pattern,
            variant,
            format: params.format,
            size_variant: resolvedSizeVariantId || null,
            dimensions: enforcedWidth && enforcedHeight ? { width: enforcedWidth, height: enforcedHeight } : null,
            formatCategory: formatCategory || 'unknown',
            childCount,
            batchResults: data,
          }, null, 2),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-14: list_patterns
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'list_patterns',
    'List all available cross-format design patterns with their names, descriptions, props, and variants.',
    {},
    async () => {
      const patterns = loadPatterns();
      const result = Object.entries(patterns).map(([name, def]) => ({
        name,
        description: def.description,
        variants: def.variants ? Object.keys(def.variants) : ['default'],
        format_adaptations: def.format_adaptations ? Object.keys(def.format_adaptations) : [],
        props: Object.entries(def.props).map(([propName, propDef]) => ({
          name: propName,
          type: propDef.type,
          required: propDef.required || false,
          default: propDef.default,
        })),
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
