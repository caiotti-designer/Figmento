import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';
import * as yaml from 'js-yaml';
import { analyzeAndSave } from './references';
import { resolveBlueprint, getLayoutsDir } from './layouts';
import { generateFigmaCode } from './codegen/codegen';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function loadBrandKit(name: string): Record<string, unknown> | null {
  const knowledgeDir = nodePath.join(__dirname, '..', 'knowledge');
  const filePath = nodePath.join(knowledgeDir, 'brand-kits', `${name.replace(/[^a-z0-9-]/gi, '')}.yaml`);
  if (!fs.existsSync(filePath)) return null;
  return yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
}

const VARIATION_MODIFIERS = [
  'same subject and product, slightly different camera angle, warm natural lighting',
  'same subject and product, close-up detail shot, soft bokeh background',
  'same subject and product, lifestyle context, environmental setting',
  'same subject and product, flat lay composition, clean minimal background',
  'same subject and product, dramatic side lighting, high contrast',
  'same subject and product, bird\'s eye view, geometric arrangement',
];

// ─── Schemas ────────────────────────────────────────────────────────────────────

export const designFromReferenceSchema = {
  referenceImagePath: z.string().describe('Absolute path to the reference image (from store_temp_file)'),
  brief: z.string().describe('Design brief describing the desired output'),
  format: z.string().optional().describe('Format preset (e.g., "instagram_portrait", "hero"). Defaults to "instagram_square".'),
  brandKit: z.string().optional().describe('Brand kit name to load colors/fonts from'),
  outputMode: z.enum(['execute', 'codegen']).optional().describe('Output mode: "execute" (default) or "codegen" for use_figma JavaScript'),
};

export const generateAdVariationsSchema = {
  referenceImagePath: z.string().describe('Absolute path to the reference ad image'),
  count: z.number().int().min(1).max(6).optional().describe('Number of variations to generate (default 4, max 6)'),
  format: z.string().optional().describe('Format preset (default "instagram_square")'),
  prompt: z.string().optional().describe('Additional prompt guidance for variations'),
  brandKit: z.string().optional().describe('Brand kit name for brand-consistent overlays'),
  outputMode: z.enum(['execute', 'codegen']).optional().describe('Output mode: "execute" (default) or "codegen" for use_figma JavaScript'),
};

// ─── Tool Registration ──────────────────────────────────────────────────────────

export function registerOrchestrationTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  // ═══════════════════════════════════════════════════════════════════════════════
  // CF-4: design_from_reference
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'design_from_reference',
    'Orchestrated workflow: analyze reference image, match layout blueprint, generate design. Returns frameId + analysis for adding content.',
    designFromReferenceSchema,
    async (params) => {
      const format = params.format || 'instagram_square';

      // Step 1: Analyze reference image (graceful fallback)
      let analysis: Record<string, unknown> | null = null;
      const anthropicKey = process.env.ANTHROPIC_API_KEY;

      if (anthropicKey && fs.existsSync(params.referenceImagePath)) {
        try {
          const result = await analyzeAndSave(params.referenceImagePath, anthropicKey, false);
          if (result.status === 'analyzed' || result.status === 'skipped') {
            analysis = result.data as Record<string, unknown>;
          }
        } catch (err) {
          process.stderr.write(`[Figmento] Reference analysis failed: ${(err as Error).message}\n`);
        }
      } else {
        process.stderr.write('[Figmento] Skipping reference analysis — ANTHROPIC_API_KEY not set or file not found\n');
      }

      // Step 2: Match layout blueprint
      let blueprint: unknown = null;
      if (analysis) {
        try {
          const layoutField = (analysis.layout as string) || '';
          const tags = (analysis.tags as string[]) || [];
          const category = format.includes('hero') || format.includes('landing') ? 'web' : 'social';
          blueprint = resolveBlueprint(getLayoutsDir(), category, layoutField, tags);
        } catch (err) {
          process.stderr.write(`[Figmento] Blueprint matching failed: ${(err as Error).message}\n`);
        }
      }

      // Step 3: Build enriched prompt
      let enrichedBrief = params.brief;
      const mood = analysis ? ((analysis.tags as string[]) || []).slice(0, 3).join(', ') : undefined;

      // Brand kit enrichment
      if (params.brandKit) {
        const kit = loadBrandKit(params.brandKit);
        if (kit) {
          const colors = kit.colors as Record<string, string> | undefined;
          const fonts = kit.fonts as Record<string, string> | undefined;
          if (colors) enrichedBrief += `. Brand colors: primary ${colors.primary}, secondary ${colors.secondary}, accent ${colors.accent}`;
          if (fonts) enrichedBrief += `. Typography: ${fonts.heading} for headings, ${fonts.body} for body`;
        }
      }

      // Step 4: Codegen path — return Plugin API JavaScript
      if (params.outputMode === 'codegen') {
        const commands = [{
          action: 'create_frame' as const,
          params: { name: `Reference Design — ${params.brief.slice(0, 30)}`, width: 1080, height: 1080, fillColor: '#0A0A0F' },
          tempId: 'ref_frame',
        }];
        const code = generateFigmaCode(commands);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            outputMode: 'codegen', code, commandCount: 1,
            analysis, blueprint, enrichedBrief: params.brief,
          }) }],
        };
      }

      // Step 4b: Execute path — Generate design image
      let frameResult: Record<string, unknown> = {};
      try {
        const formatKey = format.toLowerCase().replace(/[\s-]/g, '_');

        // Create frame
        const frameData = await sendDesignCommand('create_frame', {
          name: `Reference Design — ${params.brief.slice(0, 30)}`,
          width: 1080,
          height: 1080,
          fillColor: '#0A0A0F',
        });
        const frameId = (frameData['nodeId'] as string) ?? (frameData['id'] as string);

        // Place reference-influenced background image
        const imageData = await sendDesignCommand('create_image', {
          imageData: '', // Will be filled by generate_design_image
          name: 'Background',
          width: 1080,
          height: 1080,
          parentId: frameId,
        }).catch(() => null);

        frameResult = {
          frameId,
          width: 1080,
          height: 1080,
          imageStatus: 'generating',
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Frame creation failed: ${(err as Error).message}` }) }],
          isError: true,
        };
      }

      // Build suggested elements based on analysis
      const suggestedElements: string[] = [];
      if (analysis) {
        const palette = analysis.palette as string;
        const notable = analysis.notable as string;
        suggestedElements.push(`Style: ${palette} palette`);
        if (notable) suggestedElements.push(`Notable: ${notable}`);
        suggestedElements.push('Add: headline, subheadline, CTA button');
        suggestedElements.push('Consider: brand logo top-left, gradient overlay for text readability');
      } else {
        suggestedElements.push('Add: headline, subheadline, CTA button, gradient overlay');
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ...frameResult,
            analysis: analysis ? { tags: analysis.tags, palette: analysis.palette, layout: analysis.layout, notable: analysis.notable } : null,
            blueprint: blueprint || null,
            textZone: 'bottom-40%',
            suggestedElements,
            referenceImagePath: params.referenceImagePath,
            brandKit: params.brandKit || null,
          }),
        }],
      };
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // CF-7: generate_ad_variations
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'generate_ad_variations',
    'Generate multiple ad variations from a reference image. Creates N frames with varied compositions, offset 200px apart.',
    generateAdVariationsSchema,
    async (params) => {
      const count = Math.min(params.count ?? 4, 6);
      const format = params.format || 'instagram_square';
      const seed = Math.floor(Math.random() * 1000000); // Consistent seed for all variations

      // Step 1: Analyze reference
      let analysis: Record<string, unknown> | null = null;
      const anthropicKey = process.env.ANTHROPIC_API_KEY;

      if (anthropicKey && fs.existsSync(params.referenceImagePath)) {
        try {
          const result = await analyzeAndSave(params.referenceImagePath, anthropicKey, false);
          if (result.status === 'analyzed' || result.status === 'skipped') {
            analysis = result.data as Record<string, unknown>;
          }
        } catch (err) {
          process.stderr.write(`[Figmento] Ad variation analysis failed: ${(err as Error).message}\n`);
        }
      }

      // Load brand kit if provided
      let brandContext = '';
      if (params.brandKit) {
        const kit = loadBrandKit(params.brandKit);
        if (kit) {
          const colors = kit.colors as Record<string, string> | undefined;
          if (colors) brandContext = ` Brand colors: ${colors.primary}, ${colors.secondary}, ${colors.accent}.`;
        }
      }

      // Step 2: Find canvas placement offset
      let startX = 0;
      try {
        const pageNodes = await sendDesignCommand('get_page_nodes', {}) as Record<string, unknown>;
        const children = (pageNodes['children'] as Array<Record<string, unknown>>) || [];
        for (const child of children) {
          const x = (child['x'] as number) || 0;
          const w = (child['width'] as number) || 0;
          if (x + w > startX) startX = x + w;
        }
        if (startX > 0) startX += 200; // 200px gap from last frame
      } catch {
        // get_page_nodes failed — start at 0
      }

      // Determine frame dimensions from format
      const formatDims: Record<string, { w: number; h: number }> = {
        instagram_square: { w: 1080, h: 1080 },
        instagram_portrait: { w: 1080, h: 1350 },
        instagram_story: { w: 1080, h: 1920 },
        facebook_post: { w: 1200, h: 630 },
        hero: { w: 1440, h: 810 },
      };
      const dims = formatDims[format.toLowerCase().replace(/[\s-]/g, '_')] || { w: 1080, h: 1080 };

      // Step 3: Codegen path — batch all frames into single code block
      const baseMood = analysis ? ((analysis.tags as string[]) || []).slice(0, 2).join(' ') : 'modern professional';
      const basePrompt = params.prompt || (analysis?.notable as string) || 'Professional product advertisement';

      if (params.outputMode === 'codegen') {
        const commands = [];
        for (let i = 0; i < count; i++) {
          const x = i * (dims.w + 200);
          commands.push({
            action: 'create_frame',
            params: { name: `Ad Variation ${i + 1}`, width: dims.w, height: dims.h, x, y: 0, fillColor: '#0A0A0F' },
            tempId: `ad_var_${i}`,
          });
        }
        const code = generateFigmaCode(commands);
        const variations = commands.map((c, i) => ({
          index: i + 1, tempId: c.tempId, width: dims.w, height: dims.h,
          prompt: `${basePrompt}. ${VARIATION_MODIFIERS[i % VARIATION_MODIFIERS.length]}.${brandContext}`,
          mood: baseMood, textZone: 'bottom-40%',
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ outputMode: 'codegen', code, commandCount: commands.length, format, count, analysis, variations }) }],
        };
      }

      // Step 3b: Execute path — Generate variations
      const variations: Array<Record<string, unknown>> = [];

      for (let i = 0; i < count; i++) {
        const modifier = VARIATION_MODIFIERS[i % VARIATION_MODIFIERS.length];
        const variationPrompt = `${basePrompt}. ${modifier}.${brandContext}`;
        const x = startX + i * (dims.w + 200);

        try {
          // Create frame
          const frameData = await sendDesignCommand('create_frame', {
            name: `Ad Variation ${i + 1}`,
            width: dims.w,
            height: dims.h,
            x,
            y: 0,
            fillColor: '#0A0A0F',
          }) as Record<string, unknown>;

          const frameId = (frameData['nodeId'] as string) ?? (frameData['id'] as string);

          variations.push({
            index: i + 1,
            frameId,
            width: dims.w,
            height: dims.h,
            prompt: variationPrompt,
            mood: baseMood,
            textZone: 'bottom-40%',
            suggestedCopy: `Variation ${i + 1}: ${modifier.split(',')[0]}`,
            seed,
          });
        } catch (err) {
          variations.push({
            index: i + 1,
            error: `Frame creation failed: ${(err as Error).message}`,
          });
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            count,
            format,
            seed,
            analysis: analysis ? { tags: analysis.tags, palette: analysis.palette, layout: analysis.layout } : null,
            variations,
            instructions: 'For each variation frameId, call generate_design_image with the variation prompt, referenceImagePath, awaitImage=true, and skipPreview=true to place the background image. Then add text, CTA, and overlay elements.',
          }),
        }],
      };
    },
  );
}
