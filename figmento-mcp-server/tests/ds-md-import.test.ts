/**
 * DMD-2: import_design_system_from_md — Integration + unit tests
 *
 * Tests the full pipeline: parse → validate → irToTokens → compare.
 * Reference samples: notion (22/22), aurelia (15/15), claude (22/22).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { parseDesignMd } from '../src/tools/design-system/ds-md-parser';
import { validateDesignMdIR } from '../src/tools/design-system/ds-md-validator';
import { irToTokens } from '../src/tools/design-system/ds-md-to-tokens';

const KNOWLEDGE_DIR = path.resolve(__dirname, '..', 'knowledge', 'design-systems');

function loadTokensYaml(systemName: string): Record<string, unknown> {
  const tokensPath = path.join(KNOWLEDGE_DIR, systemName, 'tokens.yaml');
  return yaml.load(fs.readFileSync(tokensPath, 'utf-8')) as Record<string, unknown>;
}

function loadAndConvert(systemName: string): { ir: ReturnType<typeof parseDesignMd>; tokens: Record<string, unknown> } {
  const mdPath = path.join(KNOWLEDGE_DIR, systemName, 'DESIGN.md');
  const md = fs.readFileSync(mdPath, 'utf-8');
  const ir = parseDesignMd(md);
  const tokens = irToTokens(ir);
  return { ir, tokens };
}

// ═══════════════════════════════════════════════════════════
// irToTokens converter tests
// ═══════════════════════════════════════════════════════════

describe('irToTokens', () => {
  it('produces all mandatory tokens.yaml fields from a full IR', () => {
    const { tokens } = loadAndConvert('notion');
    expect(tokens.name).toBe('notion');
    expect(tokens.created).toBe('2026-04-04T00:00:00.000Z');
    expect(tokens.mood).toEqual(['warm', 'approachable', 'productive']);
    expect(typeof tokens.voice).toBe('string');
    expect(tokens.colors).toBeDefined();
    expect(tokens.typography).toBeDefined();
    expect(tokens.spacing).toBeDefined();
    expect(tokens.radius).toBeDefined();
    expect(tokens.shadows).toBeDefined();
  });

  it('preserves extended color keys (beyond canonical 15)', () => {
    const { tokens } = loadAndConvert('notion');
    const colors = tokens.colors as Record<string, string>;
    expect(colors.primary).toBe('#0075de');
    expect(colors.warm_white).toBe('#f6f5f4');
    expect(colors.badge_blue_bg).toBe('#f2f9ff');
    expect(Object.keys(colors).length).toBeGreaterThanOrEqual(31);
  });

  it('preserves opentype_features in typography', () => {
    const { tokens } = loadAndConvert('notion');
    const typography = tokens.typography as Record<string, unknown>;
    expect(typography.opentype_features).toEqual(['lnum', 'locl']);
  });

  it('preserves letter_spacing in typography', () => {
    const { tokens } = loadAndConvert('notion');
    const typography = tokens.typography as Record<string, unknown>;
    const ls = typography.letter_spacing as Record<string, string>;
    expect(ls.display).toBe('-2.125px');
    expect(ls.body).toBe('normal');
  });

  it('preserves elevation opaque CSS pass-through', () => {
    const { tokens } = loadAndConvert('notion');
    const elevation = tokens.elevation as Record<string, { shadow: string }>;
    expect(elevation.soft_card.shadow).toContain('rgba(0,0,0,0.04)');
    expect(elevation.flat.shadow).toBe('none');
  });

  it('preserves constraints (do/dont)', () => {
    const { tokens } = loadAndConvert('notion');
    const constraints = tokens.constraints as { do: string[]; dont: string[] };
    expect(constraints.do.length).toBe(9);
    expect(constraints.dont.length).toBe(8);
  });

  it('preserves gradient block', () => {
    const { tokens } = loadAndConvert('notion');
    const gradients = tokens.gradients as { enabled: boolean };
    expect(gradients.enabled).toBe(false);
  });

  it('handles aurelia thin system (no elevation, no gradient block, no constraints in tokens.yaml)', () => {
    const { tokens } = loadAndConvert('aurelia');
    expect(tokens.name).toBe('aurelia');
    // aurelia tokens.yaml has no elevation field
    // But aurelia's DESIGN.md has hand-authored do/dont — these SHOULD appear
    const constraints = tokens.constraints as { do: string[]; dont: string[] } | undefined;
    expect(constraints?.do?.length).toBeGreaterThan(0);
    expect(constraints?.dont?.length).toBeGreaterThan(0);
    // No elevation in the shadow section
    expect(tokens.elevation).toBeUndefined();
  });

  it('maps source_url from frontmatter', () => {
    const { tokens } = loadAndConvert('notion');
    expect(tokens.source).toBe('https://github.com/VoltAgent/awesome-design-md');
  });

  it('applies defaults for missing spacing/radius', () => {
    const ir = parseDesignMd(`---\nname: bare\ncreated: "2026-01-01T00:00:00.000Z"\n---\n\n## Color Palette & Roles\n\n\`\`\`color\nprimary: "#000"\n\`\`\`\n`);
    const tokens = irToTokens(ir);
    const spacing = tokens.spacing as Record<string, number>;
    expect(spacing.unit).toBe(8);
    expect(spacing.md).toBe(16);
    const radius = tokens.radius as Record<string, number>;
    expect(radius.full).toBe(9999);
  });
});

// ═══════════════════════════════════════════════════════════
// Full pipeline integration tests (parse → validate → convert)
// ═══════════════════════════════════════════════════════════

describe('full import pipeline — reference samples', () => {
  for (const system of ['notion', 'claude'] as const) {
    it(`${system}: DESIGN.md → irToTokens matches committed tokens.yaml on key fields`, () => {
      const committed = loadTokensYaml(system);
      const { tokens: imported } = loadAndConvert(system);

      // Core identity
      expect(imported.name).toBe(committed.name);
      expect(imported.created).toBe(committed.created);

      // Colors — check canonical + count
      const committedColors = committed.colors as Record<string, string>;
      const importedColors = imported.colors as Record<string, string>;
      expect(importedColors.primary).toBe(committedColors.primary);
      expect(importedColors.on_surface).toBe(committedColors.on_surface);
      expect(Object.keys(importedColors).length).toBe(Object.keys(committedColors).length);

      // Typography
      const committedTypo = committed.typography as Record<string, unknown>;
      const importedTypo = imported.typography as Record<string, unknown>;
      expect((importedTypo.heading as Record<string, unknown>).family).toBe((committedTypo.heading as Record<string, unknown>).family);
      expect((importedTypo.scale as Record<string, number>).display).toBe((committedTypo.scale as Record<string, number>).display);

      // Spacing + radius
      expect((imported.spacing as Record<string, number>).md).toBe((committed.spacing as Record<string, number>).md);
      expect((imported.radius as Record<string, number>).full).toBe((committed.radius as Record<string, number>).full);

      // Shadows
      const committedShadows = committed.shadows as Record<string, Record<string, number>>;
      const importedShadows = imported.shadows as Record<string, Record<string, number>>;
      expect(importedShadows.lg.blur).toBe(committedShadows.lg.blur);
    });
  }

  it('aurelia: DESIGN.md → irToTokens matches tokens.yaml (thin system, superset in DESIGN.md)', () => {
    const committed = loadTokensYaml('aurelia');
    const { tokens: imported } = loadAndConvert('aurelia');

    expect(imported.name).toBe(committed.name);
    expect(imported.created).toBe(committed.created);

    // Colors (aurelia has exactly 15 canonical)
    const committedColors = committed.colors as Record<string, string>;
    const importedColors = imported.colors as Record<string, string>;
    expect(importedColors.primary).toBe(committedColors.primary);
    expect(Object.keys(importedColors).length).toBe(Object.keys(committedColors).length);

    // Typography
    const importedTypo = imported.typography as Record<string, unknown>;
    const committedTypo = committed.typography as Record<string, unknown>;
    expect((importedTypo.heading as Record<string, unknown>).family).toBe((committedTypo.heading as Record<string, unknown>).family);

    // DESIGN.md has DO/DONT authored from brief that DON'T exist in tokens.yaml
    // The imported tokens will HAVE constraints (from DESIGN.md) even though
    // the committed tokens.yaml does NOT — this is the documented superset behavior
    const importedConstraints = imported.constraints as { do: string[]; dont: string[] } | undefined;
    expect(importedConstraints).toBeDefined();
    expect(importedConstraints!.do.length).toBeGreaterThan(0);
  });

  it('all 3 reference samples validate before conversion', () => {
    for (const system of ['notion', 'aurelia', 'claude']) {
      const mdPath = path.join(KNOWLEDGE_DIR, system, 'DESIGN.md');
      const md = fs.readFileSync(mdPath, 'utf-8');
      const ir = parseDesignMd(md);
      const report = validateDesignMdIR(ir);
      expect(report.verdict).not.toBe('FAIL');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Edge case tests
// ═══════════════════════════════════════════════════════════

describe('import edge cases', () => {
  it('missing frontmatter — infers defaults', () => {
    const md = `## Color Palette & Roles\n\n\`\`\`color\nprimary: "#ff0000"\n\`\`\`\n`;
    const ir = parseDesignMd(md);
    const tokens = irToTokens(ir);
    expect(tokens.name).toBe('unnamed');
    expect(typeof tokens.created).toBe('string');
  });

  it('missing both color and typography — validator returns FAIL', () => {
    const md = `---\nname: empty\ncreated: "2026-01-01T00:00:00.000Z"\n---\n\n## Component Stylings\n\nSome prose.\n`;
    const ir = parseDesignMd(md);
    const report = validateDesignMdIR(ir);
    expect(report.verdict).toBe('FAIL');
  });

  it('malformed color block (bad YAML) — block is skipped, other sections still parse', () => {
    const md = `---\nname: bad-block\ncreated: "2026-01-01T00:00:00.000Z"\n---\n\n## Color Palette & Roles\n\n\`\`\`color\n{invalid yaml\n\`\`\`\n\n## Typography Rules\n\n\`\`\`font-family\nheading:\n  family: "Inter"\n  weights: [600]\nbody:\n  family: "Inter"\n  weights: [400]\n\`\`\`\n`;
    const ir = parseDesignMd(md);
    expect(ir.sections.color_palette_roles?.color).toBeUndefined();
    expect(ir.sections.typography_rules?.font_family?.heading.family).toBe('Inter');
  });

  it('unknown fenced-block language — silently ignored', () => {
    const md = `---\nname: unknown-lang\ncreated: "2026-01-01T00:00:00.000Z"\n---\n\n## Color Palette & Roles\n\n\`\`\`motion\nfade: 400ms\n\`\`\`\n\n\`\`\`color\nprimary: "#000"\n\`\`\`\n`;
    const ir = parseDesignMd(md);
    // The motion block is silently dropped, color block is parsed
    expect((ir.sections.color_palette_roles?.color as Record<string, string>)?.primary).toBe('#000');
  });
});
