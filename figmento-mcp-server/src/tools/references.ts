import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';

// ═══════════════════════════════════════════════════════════
// Reference Schema — Zod Validation
// z.enum() is safe here (data validation, not tool input schema)
// ═══════════════════════════════════════════════════════════

const CompositionNotesSchema = z.object({
  zones: z.string().optional(),
  typography_scale: z.string().optional(),
  color_distribution: z.string().optional(),
  whitespace_strategy: z.string().optional(),
});

export const ReferenceSchema = z.object({
  id: z.string(),
  category: z.enum(['web', 'social', 'ads', 'print', 'presentation']),
  subcategory: z.string(),
  tags: z.array(z.string()).min(2),
  palette: z.enum(['dark', 'light', 'colorful', 'monochrome']),
  layout: z.string(),
  notable: z.string(),
  source: z.string().optional(),
  industry: z.array(z.string()).optional(),
  composition_notes: CompositionNotesSchema.optional(),
});

export type Reference = z.infer<typeof ReferenceSchema>;

export interface ReferenceWithPath extends Reference {
  image_path: string;
}

// ═══════════════════════════════════════════════════════════
// Loading + Caching
// ═══════════════════════════════════════════════════════════

const referenceCache = new Map<string, ReferenceWithPath[]>();

function getReferencesDir(): string {
  // Works in all contexts: ts-jest (__dirname = src/tools/), esbuild dist (__dirname = dist/)
  // In both cases, going one extra level up reaches the package root where knowledge/ lives.
  const oneUp = nodePath.join(__dirname, '..', 'knowledge', 'references');
  if (fs.existsSync(oneUp)) return oneUp;
  return nodePath.join(__dirname, '..', '..', 'knowledge', 'references');
}

const CATEGORIES = ['web', 'social', 'ads', 'print', 'presentation'] as const;

export function loadAllReferences(category?: string, subcategory?: string): ReferenceWithPath[] {
  const cacheKey = `${category ?? '__all__'}:${subcategory ?? '__all__'}`;
  if (referenceCache.has(cacheKey)) return referenceCache.get(cacheKey)!;

  const refsDir = getReferencesDir();
  const results: ReferenceWithPath[] = [];
  const categoriesToScan: string[] = category ? [category] : [...CATEGORIES];

  for (const cat of categoriesToScan) {
    const catDir = nodePath.join(refsDir, cat);
    if (!fs.existsSync(catDir)) continue;

    let subcategoriesToScan: string[];
    if (subcategory) {
      subcategoriesToScan = [subcategory];
    } else {
      subcategoriesToScan = fs.readdirSync(catDir).filter(d => {
        return fs.statSync(nodePath.join(catDir, d)).isDirectory();
      });
    }

    for (const sub of subcategoriesToScan) {
      const subDir = nodePath.join(catDir, sub);
      if (!fs.existsSync(subDir)) continue;

      const files = fs.readdirSync(subDir).filter(
        f => f.endsWith('.yaml') && !f.startsWith('_')
      );

      for (const file of files) {
        const filePath = nodePath.join(subDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const raw = yaml.load(content) as Record<string, unknown>;
          const parsed = ReferenceSchema.parse(raw);
          const basePath = filePath.replace(/\.yaml$/, '');
          const imagePath = IMAGE_EXTS.map(ext => basePath + ext).find(p => fs.existsSync(p)) ?? basePath + '.png';
          results.push({ ...parsed, image_path: imagePath });
        } catch (err) {
          console.warn(`[references] Skipping invalid YAML ${filePath}:`, (err as Error).message);
        }
      }
    }
  }

  referenceCache.set(cacheKey, results);
  return results;
}

export function clearReferenceCache(): void {
  referenceCache.clear();
}

// ═══════════════════════════════════════════════════════════
// Scoring
// ═══════════════════════════════════════════════════════════

export function scoreReference(
  ref: Reference,
  query: { moodTags: string[]; industry?: string; palette?: string }
): number {
  let score = 0;

  for (const m of query.moodTags) {
    const lower = m.toLowerCase();
    if (ref.tags.includes(lower)) {
      score += 2;
    } else if (ref.tags.some(t => t.includes(lower) || lower.includes(t))) {
      score += 1;
    }
  }

  if (query.industry && ref.industry?.includes(query.industry.toLowerCase())) {
    score += 3;
  }

  if (query.palette && ref.palette === query.palette) {
    score += 1;
  }

  return score;
}

// ═══════════════════════════════════════════════════════════
// Image Extension Helpers
// ═══════════════════════════════════════════════════════════

const IMAGE_EXTS = ['.png', '.webp', '.jpg', '.jpeg'] as const;
type ImageExt = typeof IMAGE_EXTS[number];

function isImageFile(name: string): boolean {
  return IMAGE_EXTS.includes(nodePath.extname(name).toLowerCase() as ImageExt);
}

function imageToYamlPath(imagePath: string): string {
  return imagePath.replace(/\.(png|webp|jpe?g)$/i, '.yaml');
}

function basenameWithoutImageExt(imagePath: string): string {
  return nodePath.basename(imagePath).replace(/\.(png|webp|jpe?g)$/i, '');
}

function getMediaType(imagePath: string): 'image/png' | 'image/webp' | 'image/jpeg' {
  switch (nodePath.extname(imagePath).toLowerCase()) {
    case '.webp': return 'image/webp';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    default: return 'image/png';
  }
}

// ═══════════════════════════════════════════════════════════
// Vision Analysis — Helpers (DQ-10)
// ═══════════════════════════════════════════════════════════

const ANALYSIS_PROMPT = `Analyze this design screenshot for its compositional DNA. Respond ONLY with a JSON object (no markdown, no backticks, no explanation) containing exactly these fields:
{
  "tags": ["5-8 mood/style/technique tags, lowercase, hyphenated"],
  "palette": "dark|light|colorful|monochrome",
  "layout": "layout pattern name (e.g., centered, asymmetric-left, split-image, editorial-overlay, grid)",
  "notable": "The ONE design decision that makes this worth studying (1-2 sentences max)",
  "industry": ["1-3 industry tags if identifiable, otherwise empty array"],
  "composition_notes": {
    "zones": "Proportional zone breakdown (e.g., '60% hero image, 25% text content, 15% CTA')",
    "typography_scale": "Font size hierarchy (e.g., 'Display ~72px, heading ~36px, body ~16px')",
    "color_distribution": "Dominant/accent/neutral percentages with hex estimates",
    "whitespace_strategy": "Where and how negative space is used"
  }
}`;

export function resolveImagePath(imagePath: string): string {
  if (nodePath.isAbsolute(imagePath)) return imagePath;
  return nodePath.resolve(getReferencesDir(), imagePath);
}

export function inferCategoryFromPath(absolutePath: string): string {
  const refsDir = getReferencesDir();
  const rel = nodePath.relative(refsDir, absolutePath);
  const parts = rel.split(nodePath.sep);
  return parts[0] ?? '';
}

export function inferSubcategoryFromPath(absolutePath: string): string {
  const refsDir = getReferencesDir();
  const rel = nodePath.relative(refsDir, absolutePath);
  const parts = rel.split(nodePath.sep);
  return parts[1] ?? '';
}

function extractJSON(text: string): string {
  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Find first { and last } as fallback
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text;
}

async function callAnthropicVision(
  imageBuffer: Buffer,
  apiKey: string,
  mediaType: 'image/png' | 'image/webp' | 'image/jpeg'
): Promise<unknown> {
  const base64 = imageBuffer.toString('base64');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: ANALYSIS_PROMPT },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errorBody}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const rawText = data.content.find(c => c.type === 'text')?.text ?? '';
  return JSON.parse(extractJSON(rawText));
}

export type AnalyzeResult =
  | { status: 'analyzed'; data: Reference }
  | { status: 'skipped'; data: Reference }
  | { status: 'failed'; error: string };

export async function analyzeAndSave(
  absolutePath: string,
  apiKey: string,
  force: boolean
): Promise<AnalyzeResult> {
  const yamlPath = imageToYamlPath(absolutePath);

  // Return existing YAML if not forcing
  if (fs.existsSync(yamlPath) && !force) {
    try {
      const existing = yaml.load(fs.readFileSync(yamlPath, 'utf-8'));
      const validated = ReferenceSchema.parse(existing);
      return { status: 'skipped', data: validated };
    } catch {
      // Existing YAML is corrupt — fall through to re-analyze
    }
  }

  if (!fs.existsSync(absolutePath)) {
    return { status: 'failed', error: `Image not found: ${absolutePath}` };
  }

  const imageBuffer = fs.readFileSync(absolutePath);
  const id = basenameWithoutImageExt(absolutePath);
  const category = inferCategoryFromPath(absolutePath);
  const subcategory = inferSubcategoryFromPath(absolutePath);

  let parsed: unknown;
  try {
    parsed = await callAnthropicVision(imageBuffer, apiKey, getMediaType(absolutePath));
  } catch (err) {
    return { status: 'failed', error: `API call failed: ${(err as Error).message}` };
  }

  // Inject path-derived fields (override anything the model may have hallucinated)
  const withMeta = {
    ...(parsed as Record<string, unknown>),
    id,
    category,
    subcategory,
  };

  let validated: Reference;
  try {
    validated = ReferenceSchema.parse(withMeta);
  } catch (err) {
    console.error(`[analyze_reference] Validation failed for ${absolutePath}:`, JSON.stringify(withMeta, null, 2));
    return { status: 'failed', error: `Schema validation failed: ${(err as Error).message}` };
  }

  fs.writeFileSync(yamlPath, yaml.dump(validated), 'utf-8');
  clearReferenceCache();
  return { status: 'analyzed', data: validated };
}

function findImagesWithoutYaml(dir: string): string[] {
  const result: string[] = [];
  if (!fs.existsSync(dir)) return result;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...findImagesWithoutYaml(fullPath));
    } else if (entry.isFile() && isImageFile(entry.name)) {
      if (!fs.existsSync(imageToYamlPath(fullPath))) {
        result.push(fullPath);
      }
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// Exported list handler (used by resources.ts dispatcher)
// ═══════════════════════════════════════════════════════════

export async function listReferenceCategoriesHandler(_filter?: string) {
  const refsDir = getReferencesDir();
  let total = 0;

  const categories = CATEGORIES.map(cat => {
    const catDir = nodePath.join(refsDir, cat);
    if (!fs.existsSync(catDir)) {
      return { category: cat, subcategories: [] };
    }

    const subdirs = fs.readdirSync(catDir).filter(d => {
      return fs.statSync(nodePath.join(catDir, d)).isDirectory();
    });

    const subcategories = subdirs.map(sub => {
      const subDir = nodePath.join(catDir, sub);
      const yamlFiles = fs.readdirSync(subDir).filter(
        f => f.endsWith('.yaml') && !f.startsWith('_')
      );
      total += yamlFiles.length;
      return { name: sub, count: yamlFiles.length };
    });

    return { category: cat, subcategories };
  });

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ categories, total }, null, 2),
    }],
  };
}

// ═══════════════════════════════════════════════════════════
// MCP Tool Registration
// ═══════════════════════════════════════════════════════════

export const findDesignReferencesSchema = {
  category: z.string().optional().describe('Filter by category: web | social | ads | print | presentation'),
  subcategory: z.string().optional().describe('Filter by subcategory (e.g., hero, feed-post, product, poster)'),
  mood: z.string().optional().describe('Mood/style tags — space-separated for multiple (e.g., "dark bold editorial" or "minimal clean")'),
  industry: z.string().optional().describe('Industry tag for domain matching (e.g., saas, food, health, luxury, finance, fashion, tech)'),
  palette: z.string().optional().describe('Color palette filter: dark | light | colorful | monochrome'),
  limit: z.number().optional().describe('Max results to return (default: 3)'),
};

export const analyzeReferenceSchema = {
  imagePath: z.string().describe('Path to image file (PNG, WebP, JPEG, JPG). Relative paths resolve from knowledge/references/. Absolute paths also accepted.'),
  force: z.boolean().optional().describe('Overwrite existing companion YAML if true. Default: false (returns existing without re-analyzing).'),
};

export const batchAnalyzeReferencesSchema = {
  dryRun: z.boolean().optional().describe('If true, report which files need analysis without generating any YAMLs. Default: false.'),
};

export const listReferenceCategoriesSchema = {};

export function registerReferenceTools(server: McpServer): void {

  // ───────────────────────────────────────────────────────────
  // find_design_references
  // ───────────────────────────────────────────────────────────

  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK v1.26 + zod 3.25
  server.tool(
    'find_design_references',
    'Search the curated reference library for design inspiration. Call BEFORE get_layout_blueprint. Returns references scored by tag/industry/palette match. Returns image_path for each match.',
    findDesignReferencesSchema,
    async (params) => {
      const all = loadAllReferences(params.category, params.subcategory);
      const limit = params.limit ?? 3;

      if (all.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              results: [],
              total_in_library: 0,
              message: `No references found${params.category ? ` for category "${params.category}"` : ''}${params.subcategory ? `/${params.subcategory}` : ''}. Add reference images to the library first, then run batch_analyze_references.`,
            }, null, 2),
          }],
        };
      }

      const moodTags = params.mood ? params.mood.trim().split(/\s+/) : [];

      const scored = all.map(ref => ({
        ...ref,
        score: scoreReference(ref, {
          moodTags,
          industry: params.industry,
          palette: params.palette,
        }),
      }));

      const hasMatches = scored.some(r => r.score > 0);

      if (!hasMatches && (moodTags.length > 0 || params.industry || params.palette)) {
        // Return closest matches with a suggestion
        const closest = scored.slice(0, limit);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              results: closest.map(({ score, ...ref }) => ({ ...ref, score })),
              total_in_library: all.length,
              message: 'No exact matches found. Showing closest references. Try broader mood tags or remove filters.',
            }, null, 2),
          }],
        };
      }

      const top = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            results: top,
            total_in_library: all.length,
          }, null, 2),
        }],
      };
    }
  );

  // ───────────────────────────────────────────────────────────
  // analyze_reference  (DQ-10)
  // ───────────────────────────────────────────────────────────

  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK v1.26 + zod 3.25
  server.tool(
    'analyze_reference',
    'Analyze a reference screenshot and generate a companion YAML with compositional DNA. Uses Claude vision (ANTHROPIC_API_KEY required). Each call costs ~$0.01-0.02. Server-side only — no Figma connection needed.',
    analyzeReferenceSchema,
    async (params) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: ANTHROPIC_API_KEY not set. Add it to your MCP server environment.',
          }],
        };
      }

      const absolutePath = resolveImagePath(params.imagePath);
      const result = await analyzeAndSave(absolutePath, apiKey, params.force ?? false);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  // ───────────────────────────────────────────────────────────
  // batch_analyze_references  (DQ-10)
  // ───────────────────────────────────────────────────────────

  server.tool(
    'batch_analyze_references',
    'Scan all image files (PNG, WebP, JPEG, JPG) in the reference library and generate companion YAMLs for any that are missing one. Uses Claude vision (ANTHROPIC_API_KEY required). Batch of 50 references ≈ $0.50-1.00.',
    batchAnalyzeReferencesSchema,
    async (params) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: ANTHROPIC_API_KEY not set. Add it to your MCP server environment.',
          }],
        };
      }

      const pending = findImagesWithoutYaml(getReferencesDir());

      if (params.dryRun) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              dry_run: true,
              pending_count: pending.length,
              files: pending,
            }, null, 2),
          }],
        };
      }

      const summary = { total: pending.length, analyzed: 0, skipped: 0, failed: 0, errors: [] as string[] };

      for (const pngPath of pending) {
        const result = await analyzeAndSave(pngPath, apiKey, false);
        if (result.status === 'analyzed') summary.analyzed++;
        else if (result.status === 'skipped') summary.skipped++;
        else { summary.failed++; summary.errors.push(`${pngPath}: ${result.error}`); }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(summary, null, 2),
        }],
      };
    }
  );

  // ───────────────────────────────────────────────────────────
  // list_reference_categories
  // ───────────────────────────────────────────────────────────

  server.tool(
    'list_reference_categories',
    '[DEPRECATED — use list_resources(type="references") instead] List all available reference categories, subcategories, and reference counts.',
    listReferenceCategoriesSchema,
    async () => listReferenceCategoriesHandler(),
  );
}
