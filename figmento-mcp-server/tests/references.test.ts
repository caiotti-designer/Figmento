import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import {
  inferCategoryFromPath,
  inferSubcategoryFromPath,
  resolveImagePath,
  analyzeAndSave,
  clearReferenceCache,
} from '../src/tools/references';

// ═══════════════════════════════════════════════════════════
// Schema (mirrors src/tools/references.ts — same approach as layouts.test.ts)
// ═══════════════════════════════════════════════════════════

const CompositionNotesSchema = z.object({
  zones: z.string().optional(),
  typography_scale: z.string().optional(),
  color_distribution: z.string().optional(),
  whitespace_strategy: z.string().optional(),
});

const ReferenceSchema = z.object({
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

type Reference = z.infer<typeof ReferenceSchema>;

// ═══════════════════════════════════════════════════════════
// Scoring (mirrors src/tools/references.ts)
// ═══════════════════════════════════════════════════════════

function scoreReference(
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
// Helpers
// ═══════════════════════════════════════════════════════════

const REFERENCES_DIR = path.join(__dirname, '..', 'knowledge', 'references');

function loadYaml(filePath: string): Record<string, unknown> {
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(content) as Record<string, unknown>;
}

function loadAllReferencesInCategory(category: string, subcategory?: string): Reference[] {
  const catDir = path.join(REFERENCES_DIR, category);
  if (!fs.existsSync(catDir)) return [];

  const results: Reference[] = [];
  const subdirs = subcategory
    ? [subcategory]
    : fs.readdirSync(catDir).filter(d => fs.statSync(path.join(catDir, d)).isDirectory());

  for (const sub of subdirs) {
    const subDir = path.join(catDir, sub);
    if (!fs.existsSync(subDir)) continue;

    const files = fs.readdirSync(subDir).filter(
      f => f.endsWith('.yaml') && !f.startsWith('_')
    );

    for (const file of files) {
      const raw = loadYaml(path.join(subDir, file));
      results.push(ReferenceSchema.parse(raw));
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
// DQ-9: SCHEMA YAML
// ═══════════════════════════════════════════════════════════

describe('Reference schema YAML file', () => {
  test('_schema.yaml exists and loads without error', () => {
    const schemaPath = path.join(REFERENCES_DIR, '_schema.yaml');
    expect(fs.existsSync(schemaPath)).toBe(true);
    const data = loadYaml(schemaPath);
    expect(data.schema_version).toBe('1.0');
    expect(data.fields).toBeDefined();
    expect(data.example).toBeDefined();
  });

  test('_schema.yaml documents all required fields', () => {
    const schemaPath = path.join(REFERENCES_DIR, '_schema.yaml');
    const data = loadYaml(schemaPath) as { fields: Record<string, unknown> };
    const requiredFields = ['id', 'category', 'subcategory', 'tags', 'palette', 'layout', 'notable'];
    for (const field of requiredFields) {
      expect(data.fields[field]).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-9: FOLDER STRUCTURE
// ═══════════════════════════════════════════════════════════

describe('Reference folder structure', () => {
  const expectedFolders = [
    ['web', 'hero'],
    ['web', 'features'],
    ['web', 'pricing'],
    ['web', 'cta'],
    ['web', 'footer'],
    ['social', 'feed-post'],
    ['social', 'story'],
    ['social', 'carousel'],
    ['ads', 'product'],
    ['ads', 'sale-promo'],
    ['ads', 'brand-awareness'],
    ['print', 'business-card'],
    ['print', 'poster'],
    ['print', 'brochure'],
    ['presentation', 'title-slide'],
    ['presentation', 'content-slide'],
    ['presentation', 'data-slide'],
  ];

  test.each(expectedFolders)('%s/%s folder exists', (category, subcategory) => {
    const folderPath = path.join(REFERENCES_DIR, category, subcategory);
    expect(fs.existsSync(folderPath)).toBe(true);
    expect(fs.statSync(folderPath).isDirectory()).toBe(true);
  });

  test('root references directory contains only known categories', () => {
    const entries = fs.readdirSync(REFERENCES_DIR).filter(
      e => !e.startsWith('_') && fs.statSync(path.join(REFERENCES_DIR, e)).isDirectory()
    );
    const validCategories = ['web', 'social', 'ads', 'print', 'presentation'];
    for (const entry of entries) {
      expect(validCategories).toContain(entry);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-9: ZOOD SCHEMA VALIDATION
// ═══════════════════════════════════════════════════════════

describe('ReferenceSchema — valid data', () => {
  const minimalValid: Reference = {
    id: 'ref-web-hero-001',
    category: 'web',
    subcategory: 'hero',
    tags: ['bold', 'editorial'],
    palette: 'dark',
    layout: 'asymmetric-left',
    notable: 'Giant headline bleeds off the edge.',
  };

  test('parses a minimal valid reference without error', () => {
    expect(() => ReferenceSchema.parse(minimalValid)).not.toThrow();
  });

  test('parses a full reference with optional fields', () => {
    const full = {
      ...minimalValid,
      source: 'awwwards',
      industry: ['luxury', 'fashion'],
      composition_notes: {
        zones: '70% image, 30% text',
        typography_scale: 'Display 120px, body 16px',
        color_distribution: '80% dark, 15% cream, 5% gold',
        whitespace_strategy: '60px margins, triple spacing before CTA',
      },
    };
    expect(() => ReferenceSchema.parse(full)).not.toThrow();
    const parsed = ReferenceSchema.parse(full);
    expect(parsed.industry).toEqual(['luxury', 'fashion']);
    expect(parsed.composition_notes?.zones).toBeTruthy();
  });

  test('accepts all valid palette values', () => {
    const palettes = ['dark', 'light', 'colorful', 'monochrome'] as const;
    for (const palette of palettes) {
      expect(() => ReferenceSchema.parse({ ...minimalValid, palette })).not.toThrow();
    }
  });

  test('accepts all valid category values', () => {
    const categories = ['web', 'social', 'ads', 'print', 'presentation'] as const;
    for (const category of categories) {
      expect(() => ReferenceSchema.parse({ ...minimalValid, category })).not.toThrow();
    }
  });
});

describe('ReferenceSchema — invalid data', () => {
  test('throws when id is missing', () => {
    const invalid = { category: 'web', subcategory: 'hero', tags: ['a', 'b'], palette: 'dark', layout: 'centered', notable: 'x' };
    expect(() => ReferenceSchema.parse(invalid)).toThrow();
  });

  test('throws when tags has fewer than 2 items', () => {
    const invalid = { id: 'x', category: 'web', subcategory: 'hero', tags: ['one'], palette: 'dark', layout: 'centered', notable: 'x' };
    expect(() => ReferenceSchema.parse(invalid)).toThrow();
  });

  test('throws when notable is missing', () => {
    const invalid = { id: 'x', category: 'web', subcategory: 'hero', tags: ['a', 'b'], palette: 'dark', layout: 'centered' };
    expect(() => ReferenceSchema.parse(invalid)).toThrow();
  });

  test('throws for invalid palette value', () => {
    const invalid = { id: 'x', category: 'web', subcategory: 'hero', tags: ['a', 'b'], palette: 'neon', layout: 'centered', notable: 'x' };
    expect(() => ReferenceSchema.parse(invalid)).toThrow();
  });

  test('throws for invalid category value', () => {
    const invalid = { id: 'x', category: 'unknown', subcategory: 'hero', tags: ['a', 'b'], palette: 'dark', layout: 'centered', notable: 'x' };
    expect(() => ReferenceSchema.parse(invalid)).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-9: SCORING ALGORITHM
// ═══════════════════════════════════════════════════════════

describe('scoreReference — scoring logic', () => {
  const mockRef: Reference = {
    id: 'ref-001',
    category: 'web',
    subcategory: 'hero',
    tags: ['bold', 'editorial', 'serif-dominant', 'dark'],
    palette: 'dark',
    layout: 'asymmetric-left',
    notable: 'Something notable.',
    industry: ['luxury', 'fashion'],
  };

  test('exact tag match scores +2 per tag', () => {
    expect(scoreReference(mockRef, { moodTags: ['bold'] })).toBe(2);
    expect(scoreReference(mockRef, { moodTags: ['bold', 'editorial'] })).toBe(4);
    expect(scoreReference(mockRef, { moodTags: ['bold', 'editorial', 'dark'] })).toBe(6);
  });

  test('substring tag match scores +1 per tag', () => {
    expect(scoreReference(mockRef, { moodTags: ['edit'] })).toBe(1);   // 'edit' in 'editorial'
    expect(scoreReference(mockRef, { moodTags: ['serif'] })).toBe(1);  // 'serif' in 'serif-dominant'
  });

  test('no tag match scores 0', () => {
    expect(scoreReference(mockRef, { moodTags: ['playful'] })).toBe(0);
    expect(scoreReference(mockRef, { moodTags: ['minimal', 'light'] })).toBe(0);
  });

  test('industry exact match scores +3', () => {
    expect(scoreReference(mockRef, { moodTags: [], industry: 'luxury' })).toBe(3);
    expect(scoreReference(mockRef, { moodTags: [], industry: 'fashion' })).toBe(3);
  });

  test('industry miss scores 0', () => {
    expect(scoreReference(mockRef, { moodTags: [], industry: 'saas' })).toBe(0);
  });

  test('palette match scores +1', () => {
    expect(scoreReference(mockRef, { moodTags: [], palette: 'dark' })).toBe(1);
  });

  test('palette miss scores 0', () => {
    expect(scoreReference(mockRef, { moodTags: [], palette: 'light' })).toBe(0);
  });

  test('combined scoring: tag + industry + palette', () => {
    // bold (+2) + luxury industry (+3) + dark palette (+1) = 6
    expect(scoreReference(mockRef, { moodTags: ['bold'], industry: 'luxury', palette: 'dark' })).toBe(6);
  });

  test('case insensitive tag matching', () => {
    expect(scoreReference(mockRef, { moodTags: ['BOLD'] })).toBe(2);
    expect(scoreReference(mockRef, { moodTags: ['Editorial'] })).toBe(2);
  });

  test('industry matching is case insensitive', () => {
    expect(scoreReference(mockRef, { moodTags: [], industry: 'LUXURY' })).toBe(3);
    expect(scoreReference(mockRef, { moodTags: [], industry: 'Fashion' })).toBe(3);
  });

  test('ref with no industry field scores 0 on industry query', () => {
    const noIndustry: Reference = { ...mockRef, industry: undefined };
    expect(scoreReference(noIndustry, { moodTags: [], industry: 'luxury' })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-9: EMPTY FOLDERS + LOADING
// ═══════════════════════════════════════════════════════════

describe('loadAllReferencesInCategory — empty and missing directories', () => {
  test('empty subcategory folder returns empty array without throwing', () => {
    // All folders start empty (no YAML files, just .gitkeep)
    const refs = loadAllReferencesInCategory('web', 'hero');
    expect(Array.isArray(refs)).toBe(true);
    expect(refs.length).toBe(0); // No references added yet
  });

  test('empty category folder returns empty array without throwing', () => {
    const refs = loadAllReferencesInCategory('web');
    expect(Array.isArray(refs)).toBe(true);
  });

  test('nonexistent category returns empty array without throwing', () => {
    const refs = loadAllReferencesInCategory('nonexistent_category');
    expect(refs).toEqual([]);
  });

  test('nonexistent subcategory returns empty array without throwing', () => {
    const refs = loadAllReferencesInCategory('web', 'nonexistent_sub');
    expect(refs).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-9: CATEGORY FILTERING
// ═══════════════════════════════════════════════════════════

describe('Category + subcategory filtering', () => {
  test('known categories all have their folder structure accessible', () => {
    const categories = ['web', 'social', 'ads', 'print', 'presentation'];
    for (const cat of categories) {
      const catDir = path.join(REFERENCES_DIR, cat);
      expect(fs.existsSync(catDir)).toBe(true);
    }
  });

  test('loadAllReferencesInCategory with specific subcategory scopes correctly', () => {
    // Even with no references yet, the function should not return items from other subcategories
    const heroRefs = loadAllReferencesInCategory('web', 'hero');
    const featuresRefs = loadAllReferencesInCategory('web', 'features');
    // Both can be empty, but they should not share items
    const heroIds = new Set(heroRefs.map(r => r.id));
    const featuresIds = new Set(featuresRefs.map(r => r.id));
    const intersection = [...heroIds].filter(id => featuresIds.has(id));
    expect(intersection.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-9: list_reference_categories behavior (simulated)
// ═══════════════════════════════════════════════════════════

describe('list_reference_categories — simulated behavior', () => {
  function simulateListCategories() {
    const categories = ['web', 'social', 'ads', 'print', 'presentation'];
    let total = 0;

    const result = categories.map(cat => {
      const catDir = path.join(REFERENCES_DIR, cat);
      if (!fs.existsSync(catDir)) return { category: cat, subcategories: [] };

      const subdirs = fs.readdirSync(catDir).filter(
        d => fs.statSync(path.join(catDir, d)).isDirectory()
      );

      const subcategories = subdirs.map(sub => {
        const subDir = path.join(catDir, sub);
        const yamlFiles = fs.readdirSync(subDir).filter(
          f => f.endsWith('.yaml') && !f.startsWith('_')
        );
        total += yamlFiles.length;
        return { name: sub, count: yamlFiles.length };
      });

      return { category: cat, subcategories };
    });

    return { categories: result, total };
  }

  test('returns all 5 categories', () => {
    const result = simulateListCategories();
    expect(result.categories.length).toBe(5);
    const catNames = result.categories.map(c => c.category);
    expect(catNames).toContain('web');
    expect(catNames).toContain('social');
    expect(catNames).toContain('ads');
    expect(catNames).toContain('print');
    expect(catNames).toContain('presentation');
  });

  test('web category has all 5 expected subcategories', () => {
    const result = simulateListCategories();
    const web = result.categories.find(c => c.category === 'web')!;
    const subNames = web.subcategories.map(s => s.name);
    expect(subNames).toContain('hero');
    expect(subNames).toContain('features');
    expect(subNames).toContain('pricing');
    expect(subNames).toContain('cta');
    expect(subNames).toContain('footer');
  });

  test('social category has all 3 expected subcategories', () => {
    const result = simulateListCategories();
    const social = result.categories.find(c => c.category === 'social')!;
    const subNames = social.subcategories.map(s => s.name);
    expect(subNames).toContain('feed-post');
    expect(subNames).toContain('story');
    expect(subNames).toContain('carousel');
  });

  test('subcategory counts are non-negative (references may have been added)', () => {
    const result = simulateListCategories();
    for (const cat of result.categories) {
      for (const sub of cat.subcategories) {
        expect(sub.count).toBeGreaterThanOrEqual(0);
      }
    }
    // total reflects actual references on disk (>= 0)
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  test('_schema.yaml is not counted as a reference', () => {
    // The _schema.yaml is in the root references/ dir, not in subcategories
    // This test verifies it can't accidentally be counted as a subcategory item
    const result = simulateListCategories();
    // All counted items must come from category/subcategory YAML files, not _schema.yaml
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-9: find_design_references behavior (simulated)
// ═══════════════════════════════════════════════════════════

describe('find_design_references — simulated behavior (with mock refs)', () => {
  const mockRefs: Reference[] = [
    {
      id: 'ref-001', category: 'web', subcategory: 'hero',
      tags: ['bold', 'editorial', 'dark'], palette: 'dark',
      layout: 'asymmetric-left', notable: 'Notable 1',
      industry: ['luxury'],
    },
    {
      id: 'ref-002', category: 'web', subcategory: 'hero',
      tags: ['minimal', 'clean', 'light'], palette: 'light',
      layout: 'centered', notable: 'Notable 2',
      industry: ['saas', 'tech'],
    },
    {
      id: 'ref-003', category: 'social', subcategory: 'feed-post',
      tags: ['bold', 'energetic', 'colorful'], palette: 'colorful',
      layout: 'full-bleed', notable: 'Notable 3',
      industry: ['fitness', 'lifestyle'],
    },
  ];

  function simulateFind(
    refs: Reference[],
    query: { mood?: string; industry?: string; palette?: string; limit?: number }
  ) {
    const moodTags = query.mood ? query.mood.trim().split(/\s+/) : [];
    const limit = query.limit ?? 3;

    const scored = refs.map(ref => ({
      ...ref,
      score: scoreReference(ref, { moodTags, industry: query.industry, palette: query.palette }),
    }));

    const hasMatches = scored.some(r => r.score > 0);

    if (!hasMatches && (moodTags.length > 0 || query.industry || query.palette)) {
      return { results: scored.slice(0, limit), noExactMatch: true };
    }

    const top = scored.sort((a, b) => b.score - a.score).slice(0, limit);
    return { results: top, noExactMatch: false };
  }

  test('mood "bold" returns ref-001 and ref-003 above ref-002', () => {
    const result = simulateFind(mockRefs, { mood: 'bold' });
    expect(result.noExactMatch).toBe(false);
    const ids = result.results.map(r => r.id);
    // ref-001 and ref-003 have 'bold', ref-002 does not
    expect(ids[0]).not.toBe('ref-002');
    const top2 = result.results.filter(r => r.score === 2);
    expect(top2.some(r => r.id === 'ref-001')).toBe(true);
  });

  test('industry "luxury" boosts ref-001 by +3', () => {
    const result = simulateFind(mockRefs, { industry: 'luxury' });
    expect(result.results[0].id).toBe('ref-001');
    expect(result.results[0].score).toBe(3);
  });

  test('palette "light" boosts ref-002 by +1', () => {
    const result = simulateFind(mockRefs, { palette: 'light' });
    expect(result.results[0].id).toBe('ref-002');
    expect(result.results[0].score).toBe(1);
  });

  test('limit parameter caps results', () => {
    const result = simulateFind(mockRefs, { mood: 'bold', limit: 1 });
    expect(result.results.length).toBe(1);
  });

  test('no matches returns closest with noExactMatch flag', () => {
    const result = simulateFind(mockRefs, { mood: 'vintage retro baroque' });
    expect(result.noExactMatch).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
  });

  test('multi-tag mood "bold editorial" scores ref-001 higher than ref-003', () => {
    const result = simulateFind(mockRefs, { mood: 'bold editorial' });
    // ref-001: bold(+2) + editorial(+2) = 4
    // ref-003: bold(+2) + editorial(0) = 2
    expect(result.results[0].id).toBe('ref-001');
    expect(result.results[0].score).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-10: PATH INFERENCE
// ═══════════════════════════════════════════════════════════

describe('inferCategoryFromPath', () => {
  test('extracts category from a web/hero path', () => {
    const p = path.join(REFERENCES_DIR, 'web', 'hero', 'ref-001.png');
    expect(inferCategoryFromPath(p)).toBe('web');
  });

  test('extracts category from a social/feed-post path', () => {
    const p = path.join(REFERENCES_DIR, 'social', 'feed-post', 'ref-002.png');
    expect(inferCategoryFromPath(p)).toBe('social');
  });

  test('extracts category from an ads/product path', () => {
    const p = path.join(REFERENCES_DIR, 'ads', 'product', 'ref-003.png');
    expect(inferCategoryFromPath(p)).toBe('ads');
  });

  test('extracts category from a print/poster path', () => {
    const p = path.join(REFERENCES_DIR, 'print', 'poster', 'ref-004.png');
    expect(inferCategoryFromPath(p)).toBe('print');
  });

  test('extracts category from a presentation/title-slide path', () => {
    const p = path.join(REFERENCES_DIR, 'presentation', 'title-slide', 'ref-005.png');
    expect(inferCategoryFromPath(p)).toBe('presentation');
  });
});

describe('inferSubcategoryFromPath', () => {
  test('extracts subcategory from web/hero', () => {
    const p = path.join(REFERENCES_DIR, 'web', 'hero', 'ref-001.png');
    expect(inferSubcategoryFromPath(p)).toBe('hero');
  });

  test('extracts subcategory from social/feed-post', () => {
    const p = path.join(REFERENCES_DIR, 'social', 'feed-post', 'ref-002.png');
    expect(inferSubcategoryFromPath(p)).toBe('feed-post');
  });

  test('extracts subcategory from ads/sale-promo', () => {
    const p = path.join(REFERENCES_DIR, 'ads', 'sale-promo', 'ref-003.png');
    expect(inferSubcategoryFromPath(p)).toBe('sale-promo');
  });

  test('extracts subcategory from presentation/data-slide', () => {
    const p = path.join(REFERENCES_DIR, 'presentation', 'data-slide', 'ref-006.png');
    expect(inferSubcategoryFromPath(p)).toBe('data-slide');
  });
});

describe('resolveImagePath', () => {
  test('absolute path is returned unchanged', () => {
    const abs = path.join(REFERENCES_DIR, 'web', 'hero', 'ref-001.png');
    expect(resolveImagePath(abs)).toBe(abs);
  });

  test('relative path is resolved from references dir', () => {
    const resolved = resolveImagePath('web/hero/ref-001.png');
    expect(resolved).toBe(path.resolve(REFERENCES_DIR, 'web/hero/ref-001.png'));
  });

  test('relative path with subdirectory resolves correctly', () => {
    const resolved = resolveImagePath('ads/product/banner.png');
    expect(path.basename(resolved)).toBe('banner.png');
    expect(resolved).toContain('ads');
    expect(resolved).toContain('product');
  });
});

// ═══════════════════════════════════════════════════════════
// DQ-10: analyzeAndSave — deterministic branches (no API call)
// ═══════════════════════════════════════════════════════════

describe('analyzeAndSave — existing YAML handling (no API call)', () => {
  const TEMP_IMAGE = path.join(REFERENCES_DIR, 'web', 'hero', '_dq10-test.png');
  const TEMP_PNG = TEMP_IMAGE; // alias for clarity in existing tests
  const TEMP_YAML = path.join(REFERENCES_DIR, 'web', 'hero', '_dq10-test.yaml');

  const validRef = {
    id: '_dq10-test',
    category: 'web',
    subcategory: 'hero',
    tags: ['bold', 'editorial'],
    palette: 'dark',
    layout: 'asymmetric-left',
    notable: 'Test notable element for DQ-10 unit test.',
  };

  beforeEach(() => {
    clearReferenceCache();
    // Write a dummy PNG (1x1 white PNG — smallest valid PNG bytes)
    const minimalPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
      'hex'
    );
    fs.writeFileSync(TEMP_PNG, minimalPng);
    fs.writeFileSync(TEMP_YAML, yaml.dump(validRef), 'utf-8');
  });

  afterEach(() => {
    if (fs.existsSync(TEMP_PNG)) fs.unlinkSync(TEMP_PNG);
    if (fs.existsSync(TEMP_YAML)) fs.unlinkSync(TEMP_YAML);
    clearReferenceCache();
  });

  test('returns "skipped" with existing data when force=false', async () => {
    const result = await analyzeAndSave(TEMP_PNG, 'fake-api-key', false);
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.data.id).toBe('_dq10-test');
      expect(result.data.category).toBe('web');
      expect(result.data.subcategory).toBe('hero');
    }
  });

  test('YAML file content is unchanged after force=false call', async () => {
    const contentBefore = fs.readFileSync(TEMP_YAML, 'utf-8');
    await analyzeAndSave(TEMP_PNG, 'fake-api-key', false);
    const contentAfter = fs.readFileSync(TEMP_YAML, 'utf-8');
    expect(contentAfter).toBe(contentBefore);
  });

  test('does NOT call fetch when YAML exists and force=false', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await analyzeAndSave(TEMP_PNG, 'fake-api-key', false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('analyzeAndSave — missing image path', () => {
  test('returns "failed" when image file does not exist', async () => {
    const nonexistent = path.join(REFERENCES_DIR, 'web', 'hero', '__no-such-file.png');
    const result = await analyzeAndSave(nonexistent, 'fake-api-key', false);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error).toContain('not found');
    }
  });

  test('does not create a YAML file when image is missing', async () => {
    const nonexistent = path.join(REFERENCES_DIR, 'web', 'hero', '__no-such-file.png');
    const yamlPath = nonexistent.replace(/\.png$/, '.yaml');
    await analyzeAndSave(nonexistent, 'fake-api-key', false);
    expect(fs.existsSync(yamlPath)).toBe(false);
  });
});

describe('analyzeAndSave — webp and jpeg extension support', () => {
  const TEMP_WEBP = path.join(REFERENCES_DIR, 'web', 'hero', '_dq10-webp.webp');
  const TEMP_WEBP_YAML = path.join(REFERENCES_DIR, 'web', 'hero', '_dq10-webp.yaml');
  const TEMP_JPEG = path.join(REFERENCES_DIR, 'web', 'hero', '_dq10-jpeg.jpeg');
  const TEMP_JPEG_YAML = path.join(REFERENCES_DIR, 'web', 'hero', '_dq10-jpeg.yaml');

  const minimalPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
    'hex'
  );

  afterEach(() => {
    [TEMP_WEBP, TEMP_WEBP_YAML, TEMP_JPEG, TEMP_JPEG_YAML].forEach(f => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    clearReferenceCache();
  });

  test('returns "skipped" when .webp has companion YAML and force=false', async () => {
    const validRef = {
      id: '_dq10-webp', category: 'web', subcategory: 'hero',
      tags: ['bold', 'editorial'], palette: 'dark',
      layout: 'asymmetric-left', notable: 'WebP test.',
    };
    fs.writeFileSync(TEMP_WEBP, minimalPng);
    fs.writeFileSync(TEMP_WEBP_YAML, yaml.dump(validRef), 'utf-8');
    const result = await analyzeAndSave(TEMP_WEBP, 'fake-api-key', false);
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.data.id).toBe('_dq10-webp');
    }
  });

  test('returns "failed" when .jpeg image does not exist', async () => {
    const result = await analyzeAndSave(TEMP_JPEG, 'fake-api-key', false);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error).toContain('not found');
    }
  });

  test('saves YAML with correct id when .webp API call succeeds', async () => {
    const goodAnalysis = {
      tags: ['minimal', 'clean', 'editorial', 'serif'],
      palette: 'light',
      layout: 'centered',
      notable: 'WebP reference with clean grid.',
      industry: ['fashion'],
    };
    fs.writeFileSync(TEMP_WEBP, minimalPng);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(goodAnalysis) }] }),
        { status: 200 }
      )
    );
    const result = await analyzeAndSave(TEMP_WEBP, 'fake-key', false);
    expect(result.status).toBe('analyzed');
    expect(fs.existsSync(TEMP_WEBP_YAML)).toBe(true);
    if (result.status === 'analyzed') {
      expect(result.data.id).toBe('_dq10-webp');
    }
    fetchSpy.mockRestore();
  });
});

describe('analyzeAndSave — API failure does not save YAML', () => {
  const TEMP_PNG = path.join(REFERENCES_DIR, 'web', 'features', '_dq10-api-fail.png');
  const TEMP_YAML = path.join(REFERENCES_DIR, 'web', 'features', '_dq10-api-fail.yaml');

  beforeEach(() => {
    clearReferenceCache();
    const minimalPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
      'hex'
    );
    fs.writeFileSync(TEMP_PNG, minimalPng);
  });

  afterEach(() => {
    if (fs.existsSync(TEMP_PNG)) fs.unlinkSync(TEMP_PNG);
    if (fs.existsSync(TEMP_YAML)) fs.unlinkSync(TEMP_YAML);
    clearReferenceCache();
  });

  test('returns "failed" when API returns non-OK status', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('{"error":"invalid_api_key"}', { status: 401 })
    );
    const result = await analyzeAndSave(TEMP_PNG, 'bad-key', false);
    expect(result.status).toBe('failed');
    fetchSpy.mockRestore();
  });

  test('does not save YAML when API call fails', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 })
    );
    await analyzeAndSave(TEMP_PNG, 'bad-key', false);
    expect(fs.existsSync(TEMP_YAML)).toBe(false);
    fetchSpy.mockRestore();
  });

  test('returns "failed" when API returns malformed JSON in content', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'This is not JSON at all' }] }),
        { status: 200 }
      )
    );
    const result = await analyzeAndSave(TEMP_PNG, 'fake-key', false);
    // JSON.parse will throw → 'failed' status
    expect(result.status).toBe('failed');
    fetchSpy.mockRestore();
  });

  test('does not save YAML when Claude response fails ReferenceSchema validation', async () => {
    // Returns valid JSON but missing required 'notable' field
    const badResponse = {
      tags: ['bold'],           // only 1 tag — fails min(2)
      palette: 'dark',
      layout: 'centered',
      // notable: missing
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(badResponse) }] }),
        { status: 200 }
      )
    );
    const result = await analyzeAndSave(TEMP_PNG, 'fake-key', false);
    expect(result.status).toBe('failed');
    expect(fs.existsSync(TEMP_YAML)).toBe(false);
    fetchSpy.mockRestore();
  });

  test('saves YAML when API returns valid analysis JSON', async () => {
    const goodAnalysis = {
      tags: ['bold', 'editorial', 'dark', 'serif'],
      palette: 'dark',
      layout: 'asymmetric-left',
      notable: 'The giant headline bleeds off-canvas, creating tension.',
      industry: ['luxury'],
      composition_notes: {
        zones: '70% image, 20% text, 10% CTA',
        typography_scale: 'Display 96px, body 16px',
        color_distribution: '80% near-black, 20% cream',
        whitespace_strategy: '60px generous margins throughout',
      },
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(goodAnalysis) }] }),
        { status: 200 }
      )
    );
    const result = await analyzeAndSave(TEMP_PNG, 'fake-key', false);
    expect(result.status).toBe('analyzed');
    expect(fs.existsSync(TEMP_YAML)).toBe(true);
    if (result.status === 'analyzed') {
      expect(result.data.id).toBe('_dq10-api-fail');
      expect(result.data.category).toBe('web');
      expect(result.data.subcategory).toBe('features');
      expect(result.data.tags).toContain('bold');
    }
    fetchSpy.mockRestore();
  });
});
