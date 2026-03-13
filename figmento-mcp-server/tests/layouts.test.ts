import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// Reimplemented schema for testing (mirrors src/tools/layouts.ts)
// ═══════════════════════════════════════════════════════════

const BlueprintElementSchema = z.object({
  role: z.string(),
  type: z.enum(['text', 'frame', 'image', 'rectangle', 'icon']),
});

const BlueprintColumnSchema = z.object({
  name: z.string(),
  width_pct: z.number().min(0).max(100),
});

const BlueprintSplitSchema = z.object({
  type: z.enum(['equal', 'weighted']),
  columns: z.array(BlueprintColumnSchema).min(2),
});

const BlueprintZoneSchema = z.object({
  name: z.string(),
  y_start_pct: z.number().min(0).max(100),
  y_end_pct: z.number().min(0).max(100),
  split: BlueprintSplitSchema.optional(),
  elements: z.array(BlueprintElementSchema).optional(),
  typography_hierarchy: z.record(z.string(), z.string()).optional(),
  positioning: z.enum(['flow', 'absolute']).optional(),
});

const BlueprintCanvasSchema = z.object({
  aspect_ratio: z.string().regex(/^\d+:\d+$/),
  reference_size: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
});

const BlueprintRhythmSchema = z.object({
  whitespace_ratio: z.number().min(0).max(1),
  dominant_gesture: z.string(),
  section_gap_scale: z.string().optional(),
});

const BlueprintSchema = z.object({
  name: z.string(),
  id: z.string(),
  category: z.enum(['web', 'social', 'ads', 'print', 'presentation']),
  subcategory: z.string(),
  description: z.string(),
  mood: z.array(z.string()).min(1),
  industry: z.array(z.string()).optional(),
  canvas: BlueprintCanvasSchema,
  zones: z.array(BlueprintZoneSchema).min(1),
  rhythm: BlueprintRhythmSchema,
  anti_generic: z.array(z.string()).min(2),
  memorable_element: z.string(),
}).refine(
  (data) => data.zones.every(z => z.y_start_pct < z.y_end_pct),
  { message: 'All zones must have y_start_pct < y_end_pct' }
);

type Blueprint = z.infer<typeof BlueprintSchema>;

// ═══════════════════════════════════════════════════════════
// Reimplemented scoreMoodMatch for testing (mirrors src/tools/layouts.ts)
// ═══════════════════════════════════════════════════════════

function scoreMoodMatch(blueprint: Blueprint, queryMoods: string[]): number {
  const blueprintMoods = blueprint.mood.map(m => m.toLowerCase());
  return queryMoods.reduce((score, qm) => {
    const lower = qm.toLowerCase();
    if (blueprintMoods.includes(lower)) return score + 2;
    if (blueprintMoods.some(bm => bm.includes(lower) || lower.includes(bm))) return score + 1;
    return score;
  }, 0);
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

const LAYOUTS_DIR = path.join(__dirname, '..', 'knowledge', 'layouts');

function loadBlueprint(category: string, filename: string): Blueprint {
  const filePath = path.join(LAYOUTS_DIR, category, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  const raw = yaml.load(content) as Record<string, unknown>;
  return BlueprintSchema.parse(raw);
}

function loadAllBlueprintsInCategory(category: string): Blueprint[] {
  const catDir = path.join(LAYOUTS_DIR, category);
  if (!fs.existsSync(catDir)) return [];
  const files = fs.readdirSync(catDir).filter(f => f.endsWith('.yaml') && !f.startsWith('_'));
  return files.map(f => loadBlueprint(category, f));
}

// ═══════════════════════════════════════════════════════════
// COMMON TEST HELPERS — shared across categories
// ═══════════════════════════════════════════════════════════

function runCategoryTests(
  categoryName: string,
  expectedCategory: string,
  files: string[],
  minCount: number,
) {
  describe(`${categoryName} blueprints — parsing`, () => {
    test.each(files)('%s parses without error', (filename) => {
      expect(() => loadBlueprint(expectedCategory, filename)).not.toThrow();
    });

    test(`at least ${minCount} ${categoryName} blueprints exist`, () => {
      const catDir = path.join(LAYOUTS_DIR, expectedCategory);
      const diskFiles = fs.readdirSync(catDir).filter(f => f.endsWith('.yaml') && !f.startsWith('_'));
      expect(diskFiles.length).toBeGreaterThanOrEqual(minCount);
    });
  });

  describe(`${categoryName} blueprints — Zod validation`, () => {
    test.each(files)('%s passes full Zod validation', (filename) => {
      const bp = loadBlueprint(expectedCategory, filename);
      expect(bp.name).toBeTruthy();
      expect(bp.id).toBeTruthy();
      expect(bp.category).toBe(expectedCategory);
    });
  });

  describe(`${categoryName} blueprints — zone rules`, () => {
    test.each(files)('%s — all zones have y_start_pct < y_end_pct', (filename) => {
      const bp = loadBlueprint(expectedCategory, filename);
      for (const zone of bp.zones) {
        expect(zone.y_start_pct).toBeLessThan(zone.y_end_pct);
      }
    });

    test.each(files)('%s — flow zones do not overlap by more than 5%%', (filename) => {
      const bp = loadBlueprint(expectedCategory, filename);
      // Filter out layered zones that intentionally stack on the z-axis:
      // 1. Zones with positioning: absolute (floating elements like logos, badges)
      // 2. Full-span zones covering 75%+ (backgrounds, full-bleed images)
      // 3. Overlay/gradient zones (named *overlay*, *gradient*, *background*)
      //    that sit behind content zones in the z-order
      const LAYER_NAMES = /overlay|gradient|background|hero-image/i;
      const flowZones = bp.zones.filter(z =>
        z.positioning !== 'absolute' &&
        (z.y_end_pct - z.y_start_pct) < 75 &&
        !LAYER_NAMES.test(z.name)
      );
      const sorted = [...flowZones].sort((a, b) => a.y_start_pct - b.y_start_pct);
      for (let i = 1; i < sorted.length; i++) {
        const overlap = sorted[i - 1].y_end_pct - sorted[i].y_start_pct;
        expect(overlap).toBeLessThanOrEqual(5);
      }
    });
  });

  describe(`${categoryName} blueprints — anti_generic and memorable_element`, () => {
    test.each(files)('%s has non-empty anti_generic (≥2 rules)', (filename) => {
      const bp = loadBlueprint(expectedCategory, filename);
      expect(bp.anti_generic.length).toBeGreaterThanOrEqual(2);
      for (const rule of bp.anti_generic) {
        expect(rule.length).toBeGreaterThan(10);
      }
    });

    test.each(files)('%s has a meaningful memorable_element', (filename) => {
      const bp = loadBlueprint(expectedCategory, filename);
      expect(bp.memorable_element.length).toBeGreaterThan(10);
    });
  });

  describe(`${categoryName} blueprints — typography_hierarchy`, () => {
    test.each(files)('%s has at least one zone with typography_hierarchy', (filename) => {
      const bp = loadBlueprint(expectedCategory, filename);
      const hasTypography = bp.zones.some(z => z.typography_hierarchy && Object.keys(z.typography_hierarchy).length > 0);
      expect(hasTypography).toBe(true);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// DQ-1: SCHEMA + WEB BLUEPRINTS
// ═══════════════════════════════════════════════════════════

const WEB_BLUEPRINT_FILES = [
  'hero-centered.yaml',
  'hero-asymmetric-left.yaml',
  'hero-split-image.yaml',
  'feature-grid-3col.yaml',
  'feature-bento.yaml',
  'pricing-3tier.yaml',
  'cta-full-width.yaml',
];

describe('Blueprint schema YAML file', () => {
  test('_schema.yaml exists and loads', () => {
    const schemaPath = path.join(LAYOUTS_DIR, '_schema.yaml');
    expect(fs.existsSync(schemaPath)).toBe(true);
    const content = fs.readFileSync(schemaPath, 'utf-8');
    const data = yaml.load(content) as Record<string, unknown>;
    expect(data.schema_version).toBe('1.0');
    expect(data.fields).toBeDefined();
    expect(data.example).toBeDefined();
  });
});

runCategoryTests('Web', 'web', WEB_BLUEPRINT_FILES, 7);

describe('Web layout blueprints — proportional zones (no fixed pixels)', () => {
  test.each(WEB_BLUEPRINT_FILES)('%s uses percentage-based zones (0-100)', (filename) => {
    const bp = loadBlueprint('web', filename);
    for (const zone of bp.zones) {
      expect(zone.y_start_pct).toBeGreaterThanOrEqual(0);
      expect(zone.y_start_pct).toBeLessThanOrEqual(100);
      expect(zone.y_end_pct).toBeGreaterThanOrEqual(0);
      expect(zone.y_end_pct).toBeLessThanOrEqual(100);
    }
  });
});

describe('loadBlueprint function', () => {
  test('loads hero-centered by category and name', () => {
    const bp = loadBlueprint('web', 'hero-centered.yaml');
    expect(bp.id).toBe('hero-centered');
    expect(bp.category).toBe('web');
    expect(bp.subcategory).toBe('hero');
    expect(bp.mood).toContain('versatile');
  });

  test('loadAllBlueprintsInCategory returns all web blueprints', () => {
    const all = loadAllBlueprintsInCategory('web');
    expect(all.length).toBeGreaterThanOrEqual(7);
    const ids = all.map(bp => bp.id);
    expect(ids).toContain('hero-centered');
    expect(ids).toContain('hero-asymmetric-left');
    expect(ids).toContain('pricing-3tier');
  });

  test('loadAllBlueprintsInCategory returns empty for missing category', () => {
    const all = loadAllBlueprintsInCategory('nonexistent');
    expect(all).toEqual([]);
  });
});

describe('Blueprint content quality', () => {
  test('each web blueprint has a unique id', () => {
    const all = loadAllBlueprintsInCategory('web');
    const ids = all.map(bp => bp.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('each web blueprint has canvas with reference_size', () => {
    const all = loadAllBlueprintsInCategory('web');
    for (const bp of all) {
      expect(bp.canvas.aspect_ratio).toBeTruthy();
      expect(bp.canvas.reference_size).toBeDefined();
      expect(bp.canvas.reference_size!.width).toBeGreaterThan(0);
      expect(bp.canvas.reference_size!.height).toBeGreaterThan(0);
    }
  });

  test('each web blueprint has rhythm with whitespace_ratio and dominant_gesture', () => {
    const all = loadAllBlueprintsInCategory('web');
    for (const bp of all) {
      expect(bp.rhythm.whitespace_ratio).toBeGreaterThan(0);
      expect(bp.rhythm.whitespace_ratio).toBeLessThanOrEqual(1);
      expect(bp.rhythm.dominant_gesture.length).toBeGreaterThan(5);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-2: SOCIAL BLUEPRINTS
// ═══════════════════════════════════════════════════════════

const SOCIAL_BLUEPRINT_FILES = [
  'instagram-editorial-overlay.yaml',
  'instagram-split-horizontal.yaml',
  'instagram-centered-minimal.yaml',
  'instagram-carousel-slide.yaml',
  'story-fullbleed-text.yaml',
  'linkedin-post-professional.yaml',
];

runCategoryTests('Social', 'social', SOCIAL_BLUEPRINT_FILES, 6);

describe('Social blueprints — safe zone references', () => {
  test('Instagram blueprints reference safe zones in anti_generic rules', () => {
    const igBlueprints = SOCIAL_BLUEPRINT_FILES
      .filter(f => f.startsWith('instagram-'))
      .map(f => loadBlueprint('social', f));

    for (const bp of igBlueprints) {
      const allRules = bp.anti_generic.join(' ').toLowerCase();
      expect(allRules).toMatch(/safe\s*zone/i);
    }
  });

  test('Story blueprint references TikTok safe zones', () => {
    const story = loadBlueprint('social', 'story-fullbleed-text.yaml');
    const allRules = story.anti_generic.join(' ').toLowerCase();
    expect(allRules).toMatch(/tiktok|safe\s*zone/i);
  });
});

describe('Social blueprints — unique IDs across category', () => {
  test('all social blueprints have unique ids', () => {
    const all = loadAllBlueprintsInCategory('social');
    const ids = all.map(bp => bp.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-2: AD BLUEPRINTS
// ═══════════════════════════════════════════════════════════

const ADS_BLUEPRINT_FILES = [
  'product-hero-gradient.yaml',
  'sale-badge-overlay.yaml',
  'lifestyle-fullbleed.yaml',
  'comparison-split.yaml',
];

runCategoryTests('Ads', 'ads', ADS_BLUEPRINT_FILES, 4);

describe('Ad blueprints — gradient overlay rules', () => {
  test('product-hero-gradient includes 2-stop gradient rule in anti_generic', () => {
    const bp = loadBlueprint('ads', 'product-hero-gradient.yaml');
    const rules = bp.anti_generic.join(' ');
    expect(rules).toMatch(/2\s*stop/i);
    expect(rules).toMatch(/gradient/i);
  });

  test('sale-badge-overlay includes gradient rule', () => {
    const bp = loadBlueprint('ads', 'sale-badge-overlay.yaml');
    const rules = bp.anti_generic.join(' ');
    expect(rules).toMatch(/2\s*stop/i);
  });

  test('ad blueprints with overlays reference color matching', () => {
    const bpsWithOverlay = ['product-hero-gradient.yaml', 'sale-badge-overlay.yaml'];
    for (const file of bpsWithOverlay) {
      const bp = loadBlueprint('ads', file);
      const rules = bp.anti_generic.join(' ').toLowerCase();
      expect(rules).toMatch(/match|color/);
    }
  });
});

describe('Ad blueprints — unique IDs', () => {
  test('all ad blueprints have unique ids', () => {
    const all = loadAllBlueprintsInCategory('ads');
    const ids = all.map(bp => bp.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-2: PRINT BLUEPRINTS
// ═══════════════════════════════════════════════════════════

const PRINT_BLUEPRINT_FILES = [
  'business-card-modern.yaml',
  'poster-typographic.yaml',
  'brochure-panel.yaml',
  'menu-restaurant.yaml',
];

runCategoryTests('Print', 'print', PRINT_BLUEPRINT_FILES, 4);

describe('Print blueprints — bleed/trim zone awareness', () => {
  test.each(PRINT_BLUEPRINT_FILES)('%s references bleed or trim in anti_generic', (filename) => {
    const bp = loadBlueprint('print', filename);
    const allText = [...bp.anti_generic, bp.description, bp.memorable_element].join(' ').toLowerCase();
    expect(allText).toMatch(/bleed|trim|margin|print/);
  });
});

describe('Print blueprints — unique IDs', () => {
  test('all print blueprints have unique ids', () => {
    const all = loadAllBlueprintsInCategory('print');
    const ids = all.map(bp => bp.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-2: PRESENTATION BLUEPRINTS
// ═══════════════════════════════════════════════════════════

const PRESENTATION_BLUEPRINT_FILES = [
  'title-slide-bold.yaml',
  'content-split.yaml',
  'closing-cta.yaml',
];

runCategoryTests('Presentation', 'presentation', PRESENTATION_BLUEPRINT_FILES, 3);

describe('Presentation blueprints — unique IDs', () => {
  test('all presentation blueprints have unique ids', () => {
    const all = loadAllBlueprintsInCategory('presentation');
    const ids = all.map(bp => bp.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ═══════════════════════════════════════════════════════════
// CROSS-CATEGORY TESTS
// ═══════════════════════════════════════════════════════════

describe('All blueprints — global uniqueness', () => {
  test('all blueprint IDs are globally unique', () => {
    const categories = ['web', 'social', 'ads', 'print', 'presentation'];
    const allIds: string[] = [];
    for (const cat of categories) {
      const bps = loadAllBlueprintsInCategory(cat);
      allIds.push(...bps.map(bp => bp.id));
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  test('total blueprint count is at least 24 (7 web + 6 social + 4 ads + 4 print + 3 pres)', () => {
    const categories = ['web', 'social', 'ads', 'print', 'presentation'];
    let total = 0;
    for (const cat of categories) {
      total += loadAllBlueprintsInCategory(cat).length;
    }
    expect(total).toBeGreaterThanOrEqual(24);
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-3: MOOD MATCHING TESTS
// ═══════════════════════════════════════════════════════════

describe('scoreMoodMatch — scoring logic', () => {
  const mockBlueprint: Blueprint = {
    name: 'Test',
    id: 'test',
    category: 'web',
    subcategory: 'hero',
    description: 'test blueprint',
    mood: ['modern', 'tech', 'confident'],
    canvas: { aspect_ratio: '16:10' },
    zones: [{ name: 'z1', y_start_pct: 0, y_end_pct: 100 }],
    rhythm: { whitespace_ratio: 0.5, dominant_gesture: 'test' },
    anti_generic: ['rule one is longer than ten chars', 'rule two is longer than ten chars'],
    memorable_element: 'something memorable here',
  };

  test('exact match scores 2 per keyword', () => {
    expect(scoreMoodMatch(mockBlueprint, ['modern'])).toBe(2);
    expect(scoreMoodMatch(mockBlueprint, ['modern', 'tech'])).toBe(4);
    expect(scoreMoodMatch(mockBlueprint, ['modern', 'tech', 'confident'])).toBe(6);
  });

  test('substring match scores 1 per keyword', () => {
    expect(scoreMoodMatch(mockBlueprint, ['mod'])).toBe(1);
    expect(scoreMoodMatch(mockBlueprint, ['tec'])).toBe(1);
  });

  test('no match scores 0', () => {
    expect(scoreMoodMatch(mockBlueprint, ['playful'])).toBe(0);
    expect(scoreMoodMatch(mockBlueprint, ['luxury', 'vintage'])).toBe(0);
  });

  test('mixed exact + substring + miss', () => {
    expect(scoreMoodMatch(mockBlueprint, ['modern', 'tec', 'luxury'])).toBe(3);
  });

  test('case insensitive matching', () => {
    expect(scoreMoodMatch(mockBlueprint, ['MODERN'])).toBe(2);
    expect(scoreMoodMatch(mockBlueprint, ['Tech'])).toBe(2);
  });
});

describe('get_layout_blueprint — query behavior (simulated)', () => {
  function simulateGetLayoutBlueprint(
    category: string,
    subcategory?: string,
    mood?: string | string[],
  ): { match?: Blueprint; top_matches?: Array<Blueprint & { mood_score: number }>; available?: Array<{ id: string }>; suggestion?: string } {
    const allInCategory = loadAllBlueprintsInCategory(category);
    if (allInCategory.length === 0) return { available: [], suggestion: 'No blueprints found' };

    if (subcategory) {
      const normalized = subcategory.replace(/_/g, '-').toLowerCase();
      const exact = allInCategory.find(bp => bp.id === normalized);
      if (exact) return { match: exact };
    }

    if (mood) {
      const queryMoods = Array.isArray(mood) ? mood : mood.split(/[\s,]+/);
      const scored = allInCategory
        .map(bp => ({ blueprint: bp, score: scoreMoodMatch(bp, queryMoods) }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const topScore = scored[0].score;
        const topMatches = scored.filter(s => s.score >= topScore - 1).slice(0, 3);
        if (topMatches.length === 1) return { match: topMatches[0].blueprint };
        return { top_matches: topMatches.map(m => ({ ...m.blueprint, mood_score: m.score })) };
      }
    }

    return { available: allInCategory.map(bp => ({ id: bp.id })), suggestion: 'No exact match found.' };
  }

  test('exact subcategory match returns single match', () => {
    const result = simulateGetLayoutBlueprint('social', 'instagram_editorial_overlay');
    expect(result.match).toBeDefined();
    expect(result.match!.id).toBe('instagram-editorial-overlay');
  });

  test('mood query with clear winner returns single match', () => {
    const result = simulateGetLayoutBlueprint('web', undefined, 'conversion saas');
    expect(result.match).toBeDefined();
    expect(result.match!.id).toBe('pricing-3tier');
  });

  test('mood query with multiple close scores returns top_matches array', () => {
    const result = simulateGetLayoutBlueprint('web', undefined, 'modern');
    expect(result.top_matches).toBeDefined();
    expect(result.top_matches!.length).toBeGreaterThanOrEqual(2);
    const scores = result.top_matches!.map(m => m.mood_score);
    expect(new Set(scores).size).toBe(1);
  });

  test('nonexistent subcategory with no mood returns fallback with available list', () => {
    const result = simulateGetLayoutBlueprint('web', 'totally_nonexistent_subcategory', undefined);
    expect(result.available).toBeDefined();
    expect(result.available!.length).toBeGreaterThan(0);
    expect(result.suggestion).toBeTruthy();
  });

  test('nonexistent mood returns fallback with available list', () => {
    const result = simulateGetLayoutBlueprint('web', undefined, 'zzz_completely_alien_mood');
    expect(result.available).toBeDefined();
    expect(result.available!.length).toBeGreaterThan(0);
  });
});

describe('list_layout_blueprints — filtering behavior (simulated)', () => {
  test('no filter returns all blueprints across categories', () => {
    const categories = ['web', 'social', 'ads', 'print', 'presentation'];
    let total = 0;
    for (const cat of categories) {
      total += loadAllBlueprintsInCategory(cat).length;
    }
    expect(total).toBeGreaterThanOrEqual(24);
  });

  test('filter by "web" returns only web blueprints', () => {
    const webBlueprints = loadAllBlueprintsInCategory('web');
    expect(webBlueprints.length).toBeGreaterThanOrEqual(7);
    for (const bp of webBlueprints) { expect(bp.category).toBe('web'); }
  });

  test('filter by "social" returns only social blueprints', () => {
    const bps = loadAllBlueprintsInCategory('social');
    expect(bps.length).toBeGreaterThanOrEqual(6);
    for (const bp of bps) { expect(bp.category).toBe('social'); }
  });

  test('filter by "ads" returns only ad blueprints', () => {
    const bps = loadAllBlueprintsInCategory('ads');
    expect(bps.length).toBeGreaterThanOrEqual(4);
    for (const bp of bps) { expect(bp.category).toBe('ads'); }
  });

  test('filter by "print" returns only print blueprints', () => {
    const bps = loadAllBlueprintsInCategory('print');
    expect(bps.length).toBeGreaterThanOrEqual(4);
    for (const bp of bps) { expect(bp.category).toBe('print'); }
  });

  test('filter by "presentation" returns only presentation blueprints', () => {
    const bps = loadAllBlueprintsInCategory('presentation');
    expect(bps.length).toBeGreaterThanOrEqual(3);
    for (const bp of bps) { expect(bp.category).toBe('presentation'); }
  });
});
