import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════
// Pure function reimplementations for testing
// (These mirror the functions in tools/intelligence.ts)
// ═══════════════════════════════════════════════════════════

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(fg: string, bg: string): number {
  const fgLum = relativeLuminance(fg);
  const bgLum = relativeLuminance(bg);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

function flattenPresets(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  for (const [category, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const preset of value) {
        results.push({ ...preset, category });
      }
    } else if (typeof value === 'object' && value !== null) {
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

const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');

function loadKnowledge(filename: string): Record<string, unknown> {
  const filePath = path.join(KNOWLEDGE_DIR, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(content) as Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

describe('WCAG Contrast Check', () => {
  test('black on white has ratio 21', () => {
    const ratio = contrastRatio('#000000', '#FFFFFF');
    expect(ratio).toBe(21);
  });

  test('white on black has ratio 21', () => {
    const ratio = contrastRatio('#FFFFFF', '#000000');
    expect(ratio).toBe(21);
  });

  test('same color has ratio 1', () => {
    const ratio = contrastRatio('#FF0000', '#FF0000');
    expect(ratio).toBe(1);
  });

  test('AA normal text requires 4.5:1', () => {
    // #767676 on white is exactly 4.54:1 — the lightest gray that passes AA
    const ratio = contrastRatio('#767676', '#FFFFFF');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('low contrast fails AA', () => {
    const ratio = contrastRatio('#AAAAAA', '#FFFFFF');
    expect(ratio).toBeLessThan(4.5);
  });
});

describe('Knowledge files load correctly', () => {
  test('size-presets.yaml loads and has social presets', () => {
    const data = loadKnowledge('size-presets.yaml');
    expect(data.social).toBeDefined();
    expect(data.print).toBeDefined();
    expect(data.presentation).toBeDefined();
  });

  test('typography.yaml has font pairings and type scales', () => {
    const data = loadKnowledge('typography.yaml');
    expect(data.font_pairings).toBeDefined();
    expect(data.type_scales).toBeDefined();
    expect(Array.isArray(data.font_pairings)).toBe(true);
  });

  test('color-system.yaml has palettes', () => {
    const data = loadKnowledge('color-system.yaml');
    expect(data.palettes).toBeDefined();
    expect(Array.isArray(data.palettes)).toBe(true);
    const palettes = data.palettes as Array<Record<string, unknown>>;
    expect(palettes.length).toBeGreaterThan(0);
    // Each palette should have required fields
    for (const p of palettes) {
      expect(p.id).toBeDefined();
      expect(p.colors).toBeDefined();
    }
  });

  test('layout.yaml has spacing scale and grid', () => {
    const data = loadKnowledge('layout.yaml');
    expect(data.grid).toBeDefined();
    expect(data.spacing_scale).toBeDefined();
    expect(data.margins).toBeDefined();
  });
});

describe('Size presets flattening', () => {
  test('flattens nested social presets with platform', () => {
    const data = loadKnowledge('size-presets.yaml');
    const presets = flattenPresets(data);
    expect(presets.length).toBeGreaterThan(10);

    const igPost = presets.find(p => p.id === 'ig-post');
    expect(igPost).toBeDefined();
    expect(igPost!.category).toBe('social');
    expect(igPost!.platform).toBe('instagram');
    expect(igPost!.width).toBe(1080);
    expect(igPost!.height).toBe(1350);
  });

  test('flattens direct array presets (presentation)', () => {
    const data = loadKnowledge('size-presets.yaml');
    const presets = flattenPresets(data);

    const pres169 = presets.find(p => p.id === 'pres-16-9');
    expect(pres169).toBeDefined();
    expect(pres169!.category).toBe('presentation');
    expect(pres169!.width).toBe(1920);
    expect(pres169!.height).toBe(1080);
  });
});

describe('Type scale computation', () => {
  test('major_third scale computes correct sizes from base 16', () => {
    const data = loadKnowledge('typography.yaml');
    const scales = data.type_scales as Record<string, Record<string, unknown>>;
    const scale = scales['major_third'];
    expect(scale).toBeDefined();

    const ratio = scale.ratio as number;
    expect(ratio).toBe(1.25);

    const base = 16;
    const computed = {
      xs: Math.round(base / (ratio * ratio)),
      sm: Math.round(base / ratio),
      base,
      lg: Math.round(base * ratio),
      xl: Math.round(base * ratio * ratio),
    };

    expect(computed.xs).toBe(10);
    expect(computed.sm).toBe(13);
    expect(computed.lg).toBe(20);
    expect(computed.xl).toBe(25);
  });

  test('golden_ratio produces dramatic size differences', () => {
    const data = loadKnowledge('typography.yaml');
    const scales = data.type_scales as Record<string, Record<string, unknown>>;
    const scale = scales['golden_ratio'];
    const ratio = scale.ratio as number;
    expect(ratio).toBeCloseTo(1.618, 2);

    const base = 16;
    const display = Math.round(base * Math.pow(ratio, 6));
    // Golden ratio should produce very large display sizes
    expect(display).toBeGreaterThan(100);
  });
});

describe('Font pairings', () => {
  test('mood filtering works', () => {
    const data = loadKnowledge('typography.yaml');
    const pairings = data.font_pairings as Array<Record<string, unknown>>;

    const modernPairings = pairings.filter(p => {
      const tags = (p.mood_tags as string[]) || [];
      return tags.some(tag => tag.toLowerCase().includes('modern'));
    });

    expect(modernPairings.length).toBeGreaterThan(0);
    expect(modernPairings[0].heading_font).toBe('Inter');
  });
});

describe('Color palettes', () => {
  test('mood filtering finds tech palette', () => {
    const data = loadKnowledge('color-system.yaml');
    const palettes = data.palettes as Array<Record<string, unknown>>;

    const techPalettes = palettes.filter(p => {
      const tags = (p.mood_tags as string[]) || [];
      return tags.some(tag => tag.toLowerCase().includes('tech'));
    });

    expect(techPalettes.length).toBeGreaterThan(0);
    expect(techPalettes[0].id).toBe('tech-modern');
  });

  test('all palette colors are valid hex', () => {
    const data = loadKnowledge('color-system.yaml');
    const palettes = data.palettes as Array<Record<string, unknown>>;
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;

    for (const palette of palettes) {
      const colors = palette.colors as Record<string, string>;
      for (const [key, value] of Object.entries(colors)) {
        expect(value).toMatch(hexPattern);
      }
    }
  });
});
