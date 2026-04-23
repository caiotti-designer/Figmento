/**
 * DMD-3: validate_design_md — Unit + integration tests
 *
 * Covers:
 * - Parser: marked-based section walking, fenced-block extraction, mood/do-dont
 * - Validator: severity classes (CRITICAL, HIGH, MEDIUM, LOW), verdict mapping
 * - Reference samples: notion, aurelia, claude (DMD-1 §12.5 regression suite)
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseDesignMd } from '../src/tools/design-system/ds-md-parser';
import { validateDesignMdIR } from '../src/tools/design-system/ds-md-validator';
import type { DesignMdIR } from '../src/tools/design-system/ds-md-types';

const KNOWLEDGE_DIR = path.resolve(__dirname, '..', 'knowledge', 'design-systems');

// ═══════════════════════════════════════════════════════════
// Parser tests
// ═══════════════════════════════════════════════════════════

describe('parseDesignMd', () => {
  it('extracts frontmatter fields', () => {
    const md = `---\nname: test-system\nversion: 1.0.0\ncreated: "2026-04-15T00:00:00.000Z"\n---\n\n## Visual Theme & Atmosphere\n\nSome prose.\n\n**Mood**: warm, modern\n`;
    const ir = parseDesignMd(md);
    expect(ir.frontmatter.name).toBe('test-system');
    expect(ir.frontmatter.version).toBe('1.0.0');
    expect(ir.frontmatter.created).toBe('2026-04-15T00:00:00.000Z');
  });

  it('handles missing frontmatter gracefully', () => {
    const md = `## Visual Theme & Atmosphere\n\nNo frontmatter here.\n\n**Mood**: minimalist\n`;
    const ir = parseDesignMd(md);
    expect(ir.frontmatter.name).toBe('');
    expect(ir.frontmatter.created).toBe('');
    expect(ir.sections.visual_theme_atmosphere?.mood).toEqual(['minimalist']);
  });

  it('strips numbered H2 headings (upstream tolerance)', () => {
    const md = `---\nname: numbered\ncreated: "2026-01-01T00:00:00.000Z"\n---\n\n## 1. Visual Theme & Atmosphere\n\nTest.\n\n**Mood**: bold\n\n## 2. Color Palette & Roles\n\n\`\`\`color\nprimary: "#ff0000"\n\`\`\`\n`;
    const ir = parseDesignMd(md);
    expect(ir.sections.visual_theme_atmosphere).toBeDefined();
    expect(ir.sections.visual_theme_atmosphere?.mood).toEqual(['bold']);
    expect(ir.sections.color_palette_roles?.color).toBeDefined();
    expect((ir.sections.color_palette_roles?.color as Record<string, string>)?.primary).toBe('#ff0000');
  });

  it('extracts do and dont lists', () => {
    const md = `---\nname: test\ncreated: "2026-01-01T00:00:00.000Z"\n---\n\n## Do's and Don'ts\n\n### Do\n\n- Use warm colors\n- Stay on the grid\n\n### Don't\n\n- Never use cool grays\n`;
    const ir = parseDesignMd(md);
    expect(ir.sections.dos_and_donts?.do).toEqual(['Use warm colors', 'Stay on the grid']);
    expect(ir.sections.dos_and_donts?.dont).toEqual(['Never use cool grays']);
  });

  it('extracts multiple fenced blocks per section', () => {
    const md = `---\nname: multi\ncreated: "2026-01-01T00:00:00.000Z"\n---\n\n## Typography Rules\n\nSome prose.\n\n\`\`\`font-family\nheading:\n  family: "Inter"\n  weights: [600]\nbody:\n  family: "Inter"\n  weights: [400]\n\`\`\`\n\n\`\`\`type-scale\ndisplay: 48\nbody: 16\n\`\`\`\n`;
    const ir = parseDesignMd(md);
    expect(ir.sections.typography_rules?.font_family?.heading.family).toBe('Inter');
    expect(ir.sections.typography_rules?.type_scale?.display).toBe(48);
  });

  it('normalizes Date objects to ISO strings', () => {
    // Unquoted ISO date → js-yaml creates a Date object; parser normalizes
    const md = `---\nname: date-test\ncreated: 2026-04-15T00:00:00.000Z\n---\n\n## Visual Theme & Atmosphere\n\n**Mood**: clean\n`;
    const ir = parseDesignMd(md);
    expect(typeof ir.frontmatter.created).toBe('string');
    expect(ir.frontmatter.created).toContain('2026');
  });
});

// ═══════════════════════════════════════════════════════════
// Validator severity tests
// ═══════════════════════════════════════════════════════════

describe('validateDesignMdIR', () => {
  function minimalIR(overrides?: Partial<DesignMdIR>): DesignMdIR {
    return {
      frontmatter: { name: 'test', created: '2026-04-15T00:00:00.000Z' },
      sections: {
        color_palette_roles: {
          color: {
            primary: '#2563eb', primary_light: '#60a5fa', primary_dark: '#1e40af',
            secondary: '#64748b', accent: '#2563eb', surface: '#ffffff',
            background: '#f8fafc', border: '#e2e8f0', on_primary: '#ffffff',
            on_surface: '#0f172a', on_surface_muted: '#64748b',
            success: '#16a34a', warning: '#eab308', error: '#dc2626', info: '#2563eb',
          },
        },
        typography_rules: {
          font_family: {
            heading: { family: 'Inter', weights: [600, 700] },
            body: { family: 'Inter', weights: [400, 500] },
          },
        },
      },
      ...overrides,
    };
  }

  it('PASS — well-formed IR with known fonts and valid colors', () => {
    const report = validateDesignMdIR(minimalIR());
    expect(report.verdict).toBe('PASS');
    expect(report.issues.filter(i => i.severity === 'CRITICAL')).toHaveLength(0);
  });

  it('CRITICAL — schema structural error (non-kebab-case name)', () => {
    const ir = minimalIR({ frontmatter: { name: 'Not Valid', created: '2026-04-15T00:00:00.000Z' } });
    const report = validateDesignMdIR(ir);
    expect(report.verdict).toBe('FAIL');
    expect(report.issues.some(i => i.severity === 'CRITICAL' && i.category === 'schema')).toBe(true);
  });

  it('CRITICAL — missing both color and typography sections', () => {
    const ir: DesignMdIR = {
      frontmatter: { name: 'empty', created: '2026-04-15T00:00:00.000Z' },
      sections: {},
    };
    const report = validateDesignMdIR(ir);
    expect(report.verdict).toBe('FAIL');
    expect(report.issues.some(i => i.severity === 'CRITICAL' && i.category === 'structure')).toBe(true);
  });

  it('HIGH — invalid hex color', () => {
    const ir = minimalIR();
    (ir.sections.color_palette_roles!.color as Record<string, string>).primary = '#XYZ';
    const report = validateDesignMdIR(ir);
    expect(report.verdict).toBe('CONCERNS');
    expect(report.issues.some(i => i.severity === 'HIGH' && i.category === 'hex')).toBe(true);
  });

  it('HIGH — contrast below 4.5:1 on on_primary/primary', () => {
    const ir = minimalIR();
    const colors = ir.sections.color_palette_roles!.color as Record<string, string>;
    colors.primary = '#888888';
    colors.on_primary = '#999999';
    const report = validateDesignMdIR(ir);
    expect(report.issues.some(i => i.severity === 'HIGH' && i.category === 'contrast')).toBe(true);
  });

  it('MEDIUM — spacing off-grid', () => {
    const ir = minimalIR();
    ir.sections.layout_principles = {
      spacing: { unit: 8, xs: 4, sm: 8, md: 15, lg: 24, xl: 32, '2xl': 48, '3xl': 64 },
    };
    const report = validateDesignMdIR(ir);
    expect(report.issues.some(i => i.severity === 'MEDIUM' && i.category === 'grid')).toBe(true);
  });

  it('MEDIUM — missing color block', () => {
    const ir: DesignMdIR = {
      frontmatter: { name: 'no-color', created: '2026-04-15T00:00:00.000Z' },
      sections: {
        typography_rules: {
          font_family: {
            heading: { family: 'Inter', weights: [600] },
            body: { family: 'Inter', weights: [400] },
          },
        },
      },
    };
    const report = validateDesignMdIR(ir);
    expect(report.issues.some(i => i.severity === 'MEDIUM' && i.category === 'structure' && i.message.includes('color'))).toBe(true);
  });

  it('LOW — unknown font family', () => {
    const ir = minimalIR();
    ir.sections.typography_rules!.font_family!.heading.family = 'SomeObscureFont';
    const report = validateDesignMdIR(ir);
    expect(report.issues.some(i => i.severity === 'LOW' && i.category === 'font')).toBe(true);
  });

  it('LOW — missing frontmatter name', () => {
    const ir = minimalIR({ frontmatter: { name: '', created: '2026-04-15T00:00:00.000Z' } as DesignMdIR['frontmatter'] });
    const report = validateDesignMdIR(ir);
    expect(report.issues.some(i => i.severity === 'LOW' && i.message.includes('name'))).toBe(true);
  });

  it('verdict precedence — CRITICAL wins over HIGH+MEDIUM', () => {
    const ir: DesignMdIR = {
      frontmatter: { name: 'Not Valid Name', created: '2026-04-15T00:00:00.000Z' },
      sections: {},
    };
    const report = validateDesignMdIR(ir);
    expect(report.verdict).toBe('FAIL');
  });
});

// ═══════════════════════════════════════════════════════════
// Reference sample regression tests (DMD-1 §12.5)
// ═══════════════════════════════════════════════════════════

describe('reference sample validation', () => {
  for (const system of ['notion', 'aurelia', 'claude']) {
    it(`${system}/DESIGN.md parses and validates without FAIL`, () => {
      const mdPath = path.join(KNOWLEDGE_DIR, system, 'DESIGN.md');
      expect(fs.existsSync(mdPath)).toBe(true);
      const md = fs.readFileSync(mdPath, 'utf-8');
      const ir = parseDesignMd(md);
      const report = validateDesignMdIR(ir);
      expect(report.verdict).not.toBe('FAIL');
      expect(report.issues.filter(i => i.severity === 'CRITICAL')).toHaveLength(0);
    });
  }

  it('aurelia validates as thin system (no elevation/gradient/constraints in tokens.yaml)', () => {
    const md = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'aurelia', 'DESIGN.md'), 'utf-8');
    const ir = parseDesignMd(md);
    // aurelia's DESIGN.md has no elevation block — schema must accept this
    expect(ir.sections.depth_elevation?.elevation).toBeUndefined();
    const report = validateDesignMdIR(ir);
    expect(report.verdict).not.toBe('FAIL');
  });

  it('aurelia surfaces the existing on_surface/surface contrast bug as HIGH', () => {
    const md = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'aurelia', 'DESIGN.md'), 'utf-8');
    const ir = parseDesignMd(md);
    const report = validateDesignMdIR(ir);
    // on_surface: "#151917" on surface: "#0D0D0D" ≈ 1.1:1 — should be flagged
    const contrastIssue = report.issues.find(
      i => i.severity === 'HIGH' && i.category === 'contrast' && i.message.includes('on_surface')
    );
    expect(contrastIssue).toBeDefined();
  });

  it('notion has 22+ tokens.yaml fields present in parsed IR', () => {
    const md = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'notion', 'DESIGN.md'), 'utf-8');
    const ir = parseDesignMd(md);
    expect(ir.frontmatter.name).toBe('notion');
    expect(Object.keys(ir.sections.color_palette_roles?.color ?? {}).length).toBeGreaterThanOrEqual(15);
    expect(ir.sections.typography_rules?.type_scale?.display).toBe(64);
    expect(ir.sections.depth_elevation?.elevation?.soft_card?.shadow).toContain('rgba');
  });
});
