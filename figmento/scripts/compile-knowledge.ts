/**
 * Knowledge Compiler — KI-1
 *
 * Reads YAML knowledge files from figmento-mcp-server/knowledge/
 * and compiles them into a TypeScript module that the plugin can import.
 *
 * Usage: npx tsx scripts/compile-knowledge.ts
 * Or:    node -e "require('./scripts/compile-knowledge.js')"  (after tsc)
 *
 * Output: src/knowledge/compiled-knowledge.ts (auto-generated, gitignored)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';

// Resolve paths relative to figmento/ root
const FIGMENTO_ROOT = path.resolve(__dirname, '..');
const MCP_KNOWLEDGE = path.resolve(FIGMENTO_ROOT, '..', 'figmento-mcp-server', 'knowledge');
const OUTPUT_FILE = path.resolve(FIGMENTO_ROOT, 'src', 'knowledge', 'compiled-knowledge.ts');

// --- Helpers ---

function readYaml(relPath: string): unknown | null {
  const fullPath = path.join(MCP_KNOWLEDGE, relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[compile-knowledge] WARNING: Missing YAML file: ${relPath}`);
    return null;
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  return yaml.load(content);
}

function readYamlDir(dirRelPath: string): Array<{ file: string; data: unknown }> {
  const dirPath = path.join(MCP_KNOWLEDGE, dirRelPath);
  if (!fs.existsSync(dirPath)) {
    console.warn(`[compile-knowledge] WARNING: Missing directory: ${dirRelPath}`);
    return [];
  }
  const results: Array<{ file: string; data: unknown }> = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
        // Skip schema files
        if (entry.name.startsWith('_')) continue;
        const fullPath = path.join(dir, entry.name);
        const content = fs.readFileSync(fullPath, 'utf-8');
        results.push({ file: fullPath, data: yaml.load(content) });
      }
    }
  }
  walk(dirPath);
  return results;
}

function hashFiles(paths: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const p of paths.sort()) {
    if (fs.existsSync(p)) {
      hash.update(fs.readFileSync(p));
    }
  }
  return hash.digest('hex').slice(0, 16);
}

function collectAllYamlPaths(): string[] {
  const paths: string[] = [];
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) paths.push(full);
    }
  }
  walk(MCP_KNOWLEDGE);
  return paths;
}

// --- Compilers ---

interface RawPalette {
  id: string;
  name: string;
  mood_tags: string[];
  colors: Record<string, string>;
  description?: string;
}

function compilePalettes(): string {
  const data = readYaml('color-system.yaml') as { palettes?: RawPalette[] } | null;
  if (!data?.palettes) return '{}';
  const result: Record<string, unknown> = {};
  for (const p of data.palettes) {
    result[p.id] = {
      id: p.id,
      name: p.name,
      mood_tags: p.mood_tags,
      colors: p.colors,
    };
  }
  return JSON.stringify(result, null, 2);
}

interface RawFontPairing {
  id: string;
  name: string;
  heading_font: string;
  body_font: string;
  mood_tags: string[];
  recommended_heading_weight: number;
  recommended_body_weight: number;
  description?: string;
}

function compileFontPairings(): string {
  const data = readYaml('typography.yaml') as { font_pairings?: RawFontPairing[] } | null;
  if (!data?.font_pairings) return '{}';
  const result: Record<string, unknown> = {};
  for (const fp of data.font_pairings) {
    result[fp.id] = {
      id: fp.id,
      name: fp.name,
      heading_font: fp.heading_font,
      body_font: fp.body_font,
      mood_tags: fp.mood_tags,
      recommended_heading_weight: fp.recommended_heading_weight,
      recommended_body_weight: fp.recommended_body_weight,
    };
  }
  return JSON.stringify(result, null, 2);
}

interface RawTypeScale {
  name: string;
  ratio: number;
  description?: string;
  sizes: Record<string, number>;
}

function compileTypeScales(): string {
  const data = readYaml('typography.yaml') as { type_scales?: Record<string, RawTypeScale> } | null;
  if (!data?.type_scales) return '{}';
  const result: Record<string, unknown> = {};
  for (const [key, ts] of Object.entries(data.type_scales)) {
    result[key] = {
      name: ts.name,
      ratio: ts.ratio,
      sizes: ts.sizes,
    };
  }
  return JSON.stringify(result, null, 2);
}

interface RawSizePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  aspect: string;
  notes?: string;
}

function compileSizePresets(): string {
  const data = readYaml('size-presets.yaml') as Record<string, unknown> | null;
  if (!data) return '{}';
  const result: Record<string, unknown> = {};
  // Flatten nested categories: social.instagram[], social.facebook[], print[], etc.
  function extractPresets(obj: unknown) {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (item && typeof item === 'object' && 'id' in item) {
          const preset = item as RawSizePreset;
          result[preset.id] = {
            id: preset.id,
            name: preset.name,
            width: preset.width,
            height: preset.height,
            aspect: preset.aspect,
            ...(preset.notes ? { notes: preset.notes } : {}),
          };
        }
      }
    } else if (obj && typeof obj === 'object') {
      for (const val of Object.values(obj)) {
        extractPresets(val);
      }
    }
  }
  extractPresets(data);
  return JSON.stringify(result, null, 2);
}

interface RawBlueprint {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  description?: string;
  mood?: string[];
  canvas?: { aspect_ratio: string; reference_size: { width: number; height: number } };
  zones?: Array<{
    name: string;
    y_start_pct: number;
    y_end_pct: number;
    elements?: Array<{ role: string; type: string }>;
    typography_hierarchy?: Record<string, string>;
    positioning?: string;
  }>;
  anti_generic?: string[];
  memorable_element?: string;
  rhythm?: { whitespace_ratio?: number };
}

function compileBlueprints(): string {
  const entries = readYamlDir('layouts');
  const blueprints: unknown[] = [];
  for (const { data } of entries) {
    const bp = data as RawBlueprint;
    if (!bp || !bp.id) continue;
    blueprints.push({
      id: bp.id,
      name: bp.name,
      category: bp.category,
      ...(bp.subcategory ? { subcategory: bp.subcategory } : {}),
      mood: bp.mood || [],
      zones: (bp.zones || []).map(z => ({
        name: z.name,
        y_start_pct: z.y_start_pct,
        y_end_pct: z.y_end_pct,
        elements: z.elements || [],
        ...(z.typography_hierarchy ? { typography_hierarchy: z.typography_hierarchy } : {}),
        ...(z.positioning ? { positioning: z.positioning } : {}),
      })),
      anti_generic: bp.anti_generic || [],
      ...(bp.memorable_element ? { memorable_element: bp.memorable_element } : {}),
      ...(bp.rhythm?.whitespace_ratio != null ? { whitespace_ratio: bp.rhythm.whitespace_ratio } : {}),
    });
  }
  // Compact: one blueprint per line for size reduction
  return '[\n' + blueprints.map(bp => '  ' + JSON.stringify(bp)).join(',\n') + '\n]';
}

function compilePatterns(): string {
  const data = readYaml('patterns/cross-format.yaml') as Record<string, unknown> | null;
  if (!data) return '{}';
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (!val || typeof val !== 'object') continue;
    const pattern = val as Record<string, unknown>;
    // Only include entries that have a recipe (skip metadata comments)
    if (!pattern.recipe) continue;
    result[key] = {
      description: pattern.description || '',
      props: pattern.props || {},
      recipe: pattern.recipe,
      ...(pattern.format_adaptations ? { format_adaptations: pattern.format_adaptations } : {}),
    };
  }
  // Compact: one pattern per line
  const lines = Object.entries(result).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return '{\n' + lines.join(',\n') + '\n}';
}

function compileCompositionRules(): string {
  const data = readYaml('patterns/composition-rules.yaml') as Record<string, unknown> | null;
  if (!data) return '{}';
  const rules: Record<string, unknown> = {};

  // Extract key sections, stripping verbose descriptions
  const altBg = data.alternating_backgrounds as Record<string, string> | undefined;
  if (altBg) {
    rules.alternating_backgrounds = {
      rule: altBg.rule || '',
      exception: altBg.exception || '',
    };
  }

  if (data.pattern_fill_defaults) {
    rules.pattern_fill_defaults = data.pattern_fill_defaults;
  }

  const vr = data.vertical_rhythm as Record<string, unknown> | undefined;
  if (vr) {
    rules.vertical_rhythm = {
      section_gap: vr.section_gap ?? 0,
      layout_direction: vr.layout_direction || 'vertical',
      rule: vr.rule || '',
    };
  }

  const cc = data.color_continuity as Record<string, unknown> | undefined;
  if (cc) {
    rules.color_continuity = { rules: cc.rules || [] };
  }

  const st = data.section_transitions as Record<string, string> | undefined;
  if (st) {
    rules.section_transitions = st;
  }

  return JSON.stringify(rules, null, 2);
}

interface RawRefinementItem {
  id: string;
  rule: string;
  check: string | string[];
  applies_to?: string[];
  trigger?: string;
  fix?: string;
}

function compileRefinementChecks(): string {
  const data = readYaml('refinement-rules.yaml') as Record<string, unknown> | null;
  if (!data) return '[]';
  const checks: unknown[] = [];
  // Each top-level key is a category with an array of check items
  for (const [category, items] of Object.entries(data)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const ri = item as RawRefinementItem;
      if (!ri.id) continue;
      const checkStr = Array.isArray(ri.check) ? ri.check.join(' | ') : ri.check;
      checks.push({
        id: ri.id,
        rule: ri.rule,
        check: checkStr,
        applies_to: ri.applies_to || [],
        category,
      });
    }
  }
  return JSON.stringify(checks, null, 2);
}

function compileDesignRules(): string {
  const data = readYaml('design-rules.yaml') as Record<string, unknown> | null;
  if (!data) return '{}';
  return JSON.stringify(data, null, 2);
}

// --- Main ---

function main() {
  console.log('[compile-knowledge] Starting knowledge compilation...');
  console.log(`[compile-knowledge] Source: ${MCP_KNOWLEDGE}`);
  console.log(`[compile-knowledge] Output: ${OUTPUT_FILE}`);

  if (!fs.existsSync(MCP_KNOWLEDGE)) {
    console.warn('[compile-knowledge] WARNING: MCP knowledge directory not found. Generating empty module.');
  }

  // Ensure output directory exists
  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Compile each section
  const palettes = compilePalettes();
  const fontPairings = compileFontPairings();
  const typeScales = compileTypeScales();
  const sizePresets = compileSizePresets();
  const blueprints = compileBlueprints();
  const patterns = compilePatterns();
  const compositionRules = compileCompositionRules();
  const refinementChecks = compileRefinementChecks();
  const designRules = compileDesignRules();

  // Compute version hash across all source YAML files
  const allYamlPaths = collectAllYamlPaths();
  const versionHash = hashFiles(allYamlPaths);

  // Generate TypeScript output
  // Note: no Generated timestamp — the versionHash below is derived from YAML content
  // and changes only when the inputs change. Keeping the output deterministic means the
  // tracked copy in figmento-ws-relay/src/knowledge/ (used as the Fly.io deploy fallback)
  // doesn't churn on every build.
  const output = `/**
 * AUTO-GENERATED — DO NOT EDIT
 * Compiled from figmento-mcp-server/knowledge/ YAML files.
 * Run: npx tsx scripts/compile-knowledge.ts
 */

import type {
  Palette,
  FontPairing,
  TypeScale,
  SizePreset,
  Blueprint,
  PatternRecipe,
  CompositionRules,
  RefinementCheck,
} from './types';

export const PALETTES: Record<string, Palette> = ${palettes} as Record<string, Palette>;

export const FONT_PAIRINGS: Record<string, FontPairing> = ${fontPairings} as Record<string, FontPairing>;

export const TYPE_SCALES: Record<string, TypeScale> = ${typeScales} as Record<string, TypeScale>;

export const SIZE_PRESETS: Record<string, SizePreset> = ${sizePresets} as unknown as Record<string, SizePreset>;

export const BLUEPRINTS: Blueprint[] = ${blueprints} as Blueprint[];

export const PATTERNS: Record<string, PatternRecipe> = ${patterns} as unknown as Record<string, PatternRecipe>;

export const COMPOSITION_RULES: CompositionRules = ${compositionRules} as CompositionRules;

export const REFINEMENT_CHECKS: RefinementCheck[] = ${refinementChecks} as RefinementCheck[];

export const DESIGN_RULES: Record<string, unknown> = ${designRules};

export const KNOWLEDGE_VERSION: string = "${versionHash}";
`;

  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');

  // Stats
  const outputSize = Buffer.byteLength(output, 'utf-8');
  const palettesCount = Object.keys(JSON.parse(palettes)).length;
  const fontPairingsCount = Object.keys(JSON.parse(fontPairings)).length;
  const sizePresetsCount = Object.keys(JSON.parse(sizePresets)).length;
  const blueprintsCount = JSON.parse(blueprints).length;
  const patternsCount = Object.keys(JSON.parse(patterns)).length;
  const refinementCount = JSON.parse(refinementChecks).length;

  console.log(`[compile-knowledge] Compiled successfully!`);
  console.log(`  Palettes:          ${palettesCount}`);
  console.log(`  Font pairings:     ${fontPairingsCount}`);
  console.log(`  Size presets:      ${sizePresetsCount}`);
  console.log(`  Blueprints:        ${blueprintsCount}`);
  console.log(`  Patterns:          ${patternsCount}`);
  console.log(`  Refinement checks: ${refinementCount}`);
  console.log(`  Output size:       ${(outputSize / 1024).toFixed(1)} KB`);
  console.log(`  Version hash:      ${versionHash}`);
}

main();
