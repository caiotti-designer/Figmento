import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';
import * as yaml from 'js-yaml';

// ─────────────────────────────────────────────────────────────
// Path resolution — two-candidate fallback for ts-jest and esbuild
// ─────────────────────────────────────────────────────────────

function getLayoutsDir(): string {
  const oneUp = nodePath.join(__dirname, '..', 'knowledge', 'layouts');
  if (fs.existsSync(oneUp)) return oneUp;
  return nodePath.join(__dirname, '..', '..', 'knowledge', 'layouts');
}

// ─────────────────────────────────────────────────────────────
// Types (mirrors schema in tests/layouts.test.ts)
// ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Blueprint = Record<string, any>;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function loadBlueprint(layoutsDir: string, category: string, filename: string): Blueprint {
  const filePath = nodePath.join(layoutsDir, category, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(content) as Blueprint;
}

function loadAllInCategory(layoutsDir: string, category: string): Blueprint[] {
  const catDir = nodePath.join(layoutsDir, category);
  if (!fs.existsSync(catDir)) return [];
  const files = fs.readdirSync(catDir).filter((f) => f.endsWith('.yaml') && !f.startsWith('_'));
  return files.map((f) => loadBlueprint(layoutsDir, category, f));
}

export function scoreMoodMatch(blueprint: Blueprint, queryMoods: string[]): number {
  const blueprintMoods: string[] = Array.isArray(blueprint.mood)
    ? blueprint.mood.map((m: string) => m.toLowerCase())
    : [];
  return queryMoods.reduce((score, qm) => {
    const lower = qm.toLowerCase();
    if (blueprintMoods.includes(lower)) return score + 2;
    if (blueprintMoods.some((bm) => bm.includes(lower) || lower.includes(bm))) return score + 1;
    return score;
  }, 0);
}

function resolveBlueprint(
  layoutsDir: string,
  category: string,
  subcategory?: string,
  mood?: string | string[],
): object {
  const allInCategory = loadAllInCategory(layoutsDir, category);
  if (allInCategory.length === 0) {
    return { available: [], suggestion: `No blueprints found for category "${category}"` };
  }

  if (subcategory) {
    const normalized = subcategory.replace(/_/g, '-').toLowerCase();
    const exact = allInCategory.find((bp) => bp.id === normalized);
    if (exact) {
      const canvasH = exact.canvas?.reference_size?.height || 1;
      const canvasW = exact.canvas?.reference_size?.width || 1;
      const resolvedZones = (exact.zones || []).map((zone: Blueprint) => ({
        ...zone,
        resolved_example: {
          y_start_px: Math.round((zone.y_start_pct / 100) * canvasH),
          y_end_px: Math.round((zone.y_end_pct / 100) * canvasH),
          height_px: Math.round(((zone.y_end_pct - zone.y_start_pct) / 100) * canvasH),
          width_px: canvasW,
        },
      }));
      return { match: { ...exact, zones: resolvedZones } };
    }
  }

  if (mood) {
    const queryMoods = Array.isArray(mood) ? mood : String(mood).split(/[\s,]+/);
    const scored = allInCategory
      .map((bp) => ({ blueprint: bp, score: scoreMoodMatch(bp, queryMoods) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const topScore = scored[0].score;
      const topMatches = scored.filter((s) => s.score >= topScore - 1).slice(0, 3);
      if (topMatches.length === 1) return { match: topMatches[0].blueprint };
      return { top_matches: topMatches.map((m) => ({ ...m.blueprint, mood_score: m.score })) };
    }
  }

  return {
    available: allInCategory.map((bp) => ({ id: bp.id, description: bp.description, mood: bp.mood })),
    suggestion: 'No exact match found. Choose from the available list or try different mood keywords.',
  };
}

// ─────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────

export function registerLayoutTools(server: McpServer): void {
  const LAYOUTS_DIR = getLayoutsDir();

  const VALID_CATEGORIES = ['web', 'social', 'ads', 'print', 'presentation'];

  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK v1.26 + zod 3.25
  server.tool(
    'get_layout_blueprint',
    'Get a layout blueprint for a design. Blueprints define proportional zones (y_start_pct/y_end_pct), typography hierarchy, and memorable element guidance. Use before creating any design to get a structural skeleton.',
    {
      category: z.string().describe(`Layout category: ${VALID_CATEGORIES.join(', ')}`),
      subcategory: z.string().optional().describe('Blueprint subcategory or exact id (e.g. "hero-centered", "instagram-editorial-overlay")'),
      mood: z.string().optional().describe('Mood keywords to match (e.g. "dark luxury bold")'),
    },
    async (params) => {
      const result = resolveBlueprint(LAYOUTS_DIR, params.category, params.subcategory, params.mood);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'list_layout_blueprints',
    'List all available layout blueprints, optionally filtered by category. Returns id, description, mood, and canvas info for each blueprint.',
    {
      category: z.string().optional().describe(`Filter by category: ${VALID_CATEGORIES.join(', ')}. Omit to list all.`),
    },
    async (params) => {
      const categories = params.category ? [params.category] : VALID_CATEGORIES;
      const results: Blueprint[] = [];
      for (const cat of categories) {
        const bps = loadAllInCategory(LAYOUTS_DIR, cat);
        results.push(...bps.map((bp) => ({
          id: bp.id,
          category: bp.category,
          subcategory: bp.subcategory,
          description: bp.description,
          mood: bp.mood,
          canvas: bp.canvas,
        })));
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ blueprints: results, total: results.length }, null, 2) }],
      };
    }
  );
}
