/**
 * DMD-4: export_design_system_to_md — Round-trip tests
 *
 * The central contract: tokens.yaml → tokensToIR → renderMarkdown →
 * parseDesignMd → irToTokens → compare original tokens.yaml.
 * Tests all 7 seeded systems.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { tokensToIR } from '../src/tools/design-system/ds-tokens-to-ir';
import { renderMarkdown } from '../src/tools/design-system/ds-ir-to-markdown';
import { parseDesignMd } from '../src/tools/design-system/ds-md-parser';
import { irToTokens } from '../src/tools/design-system/ds-md-to-tokens';
import { validateDesignMdIR } from '../src/tools/design-system/ds-md-validator';

const KNOWLEDGE_DIR = path.resolve(__dirname, '..', 'knowledge', 'design-systems');

function loadTokens(name: string): Record<string, unknown> {
  const p = path.join(KNOWLEDGE_DIR, name, 'tokens.yaml');
  return yaml.load(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
}

/**
 * Full round-trip: tokens.yaml → IR → markdown → parse → IR → tokens → compare.
 * Returns the original and re-imported token objects for assertion.
 */
function roundTrip(name: string) {
  const original = loadTokens(name);
  const ir = tokensToIR(original);
  const markdown = renderMarkdown(ir);
  const parsedIR = parseDesignMd(markdown);
  const reimported = irToTokens(parsedIR);
  return { original, reimported, markdown, parsedIR };
}

// ─── Helper: deep-compare specific token fields ──────────────────────
// We compare key fields rather than raw byte-identity because:
// (1) voice/prose may have minor whitespace normalization from markdown rendering
// (2) js-yaml dump/load may reformat some strings
// (3) the exporter adds frontmatter fields (version, schema_version) that
//     the original tokens.yaml doesn't have
// The "semantic round-trip" ensures every DATA field survives.

function compareField(label: string, orig: unknown, reimp: unknown) {
  expect(reimp).toEqual(orig);
}

// ═══════════════════════════════════════════════════════════
// Round-trip tests for each seeded system
// ═══════════════════════════════════════════════════════════

describe('round-trip: tokens → markdown → tokens', () => {

  // Systems with committed DESIGN.md files (DMD-1 samples)
  for (const name of ['notion', 'claude']) {
    describe(name, () => {
      it('name, created, mood survive round-trip', () => {
        const { original, reimported } = roundTrip(name);
        compareField('name', original.name, reimported.name);
        compareField('created', original.created, reimported.created);
        compareField('mood', original.mood, reimported.mood);
      });

      it('colors survive round-trip (all keys + values)', () => {
        const { original, reimported } = roundTrip(name);
        const origColors = original.colors as Record<string, string>;
        const reimpColors = reimported.colors as Record<string, string>;
        expect(Object.keys(reimpColors).sort()).toEqual(Object.keys(origColors).sort());
        for (const key of Object.keys(origColors)) {
          compareField(`colors.${key}`, origColors[key], reimpColors[key]);
        }
      });

      it('typography.heading + body + scale survive', () => {
        const { original, reimported } = roundTrip(name);
        const origT = original.typography as Record<string, unknown>;
        const reimpT = reimported.typography as Record<string, unknown>;
        compareField('typography.heading', origT.heading, reimpT.heading);
        compareField('typography.body', origT.body, reimpT.body);
        compareField('typography.scale', origT.scale, reimpT.scale);
      });

      it('spacing + radius survive', () => {
        const { original, reimported } = roundTrip(name);
        compareField('spacing', original.spacing, reimported.spacing);
        compareField('radius', original.radius, reimported.radius);
      });

      it('shadows survive', () => {
        const { original, reimported } = roundTrip(name);
        compareField('shadows', original.shadows, reimported.shadows);
      });

      it('elevation survives as opaque CSS pass-through', () => {
        const { original, reimported } = roundTrip(name);
        if (original.elevation) {
          const origE = original.elevation as Record<string, Record<string, string>>;
          const reimpE = reimported.elevation as Record<string, Record<string, string>>;
          for (const key of Object.keys(origE)) {
            compareField(`elevation.${key}.shadow`, origE[key].shadow, reimpE[key].shadow);
          }
        }
      });

      it('constraints (do/dont) survive', () => {
        const { original, reimported } = roundTrip(name);
        if (original.constraints) {
          const origC = original.constraints as { do: string[]; dont: string[] };
          const reimpC = reimported.constraints as { do: string[]; dont: string[] };
          compareField('constraints.do', origC.do, reimpC.do);
          compareField('constraints.dont', origC.dont, reimpC.dont);
        }
      });

      it('gradients survive', () => {
        const { original, reimported } = roundTrip(name);
        if (original.gradients) {
          const origG = original.gradients as Record<string, unknown>;
          const reimpG = reimported.gradients as Record<string, unknown>;
          compareField('gradients.enabled', origG.enabled, reimpG.enabled);
          if (origG.colors) compareField('gradients.colors', origG.colors, reimpG.colors);
        }
      });

      it('exported markdown validates against the schema', () => {
        const { parsedIR } = roundTrip(name);
        const report = validateDesignMdIR(parsedIR);
        if (report.verdict === 'FAIL') {
          const criticals = report.issues.filter(i => i.severity === 'CRITICAL');
          // eslint-disable-next-line no-console
          console.log(`[${name}] CRITICAL issues:`, JSON.stringify(criticals, null, 2));
        }
        expect(report.verdict).not.toBe('FAIL');
      });
    });
  }

  // Aurelia — semantic round-trip (superset in DESIGN.md)
  describe('aurelia (thin system)', () => {
    it('core fields survive round-trip from tokens.yaml', () => {
      const { original, reimported } = roundTrip('aurelia');
      compareField('name', original.name, reimported.name);
      compareField('created', original.created, reimported.created);
      compareField('colors', original.colors, reimported.colors);
      compareField('spacing', original.spacing, reimported.spacing);
      compareField('radius', original.radius, reimported.radius);
      compareField('shadows', original.shadows, reimported.shadows);
    });

    it('thin-system fields absent in original are absent in reimported', () => {
      const { original, reimported } = roundTrip('aurelia');
      // aurelia tokens.yaml has no elevation, no constraints, no gradients
      expect(original.elevation).toBeUndefined();
      expect(reimported.elevation).toBeUndefined();
      // gradients defaults to { enabled: false } which IS expected
      expect((reimported.gradients as Record<string, unknown>).enabled).toBe(false);
    });

    it('exported markdown validates', () => {
      const { parsedIR } = roundTrip('aurelia');
      const report = validateDesignMdIR(parsedIR);
      expect(report.verdict).not.toBe('FAIL');
    });
  });

  // Systems WITHOUT committed DESIGN.md (DMD-5 will commit these)
  for (const name of ['figma', 'linear', 'stripe', 'vercel']) {
    describe(name, () => {
      it('core fields survive round-trip', () => {
        const { original, reimported } = roundTrip(name);
        compareField('name', original.name, reimported.name);
        compareField('created', original.created, reimported.created);
        compareField('spacing', original.spacing, reimported.spacing);
        compareField('radius', original.radius, reimported.radius);
        compareField('shadows', original.shadows, reimported.shadows);
      });

      it('colors survive with correct key count', () => {
        const { original, reimported } = roundTrip(name);
        const origKeys = Object.keys(original.colors as Record<string, unknown>).sort();
        const reimpKeys = Object.keys(reimported.colors as Record<string, unknown>).sort();
        expect(reimpKeys).toEqual(origKeys);
      });

      it('typography heading + body survive', () => {
        const { original, reimported } = roundTrip(name);
        const origT = original.typography as Record<string, unknown>;
        const reimpT = reimported.typography as Record<string, unknown>;
        compareField('typography.heading', origT.heading, reimpT.heading);
        compareField('typography.body', origT.body, reimpT.body);
      });

      it('constraints survive when present', () => {
        const { original, reimported } = roundTrip(name);
        if (original.constraints) {
          const origC = original.constraints as { do: string[]; dont: string[] };
          const reimpC = reimported.constraints as { do: string[]; dont: string[] };
          expect(reimpC.do.length).toBe(origC.do.length);
          expect(reimpC.dont.length).toBe(origC.dont.length);
        }
      });

      it('exported markdown validates against schema', () => {
        const { parsedIR } = roundTrip(name);
        const report = validateDesignMdIR(parsedIR);
        expect(report.verdict).not.toBe('FAIL');
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════
// renderMarkdown canonical output tests
// ═══════════════════════════════════════════════════════════

describe('renderMarkdown', () => {
  it('produces all 9 canonical section headings', () => {
    const tokens = loadTokens('notion');
    const ir = tokensToIR(tokens);
    const md = renderMarkdown(ir);
    expect(md).toContain('## Visual Theme & Atmosphere');
    expect(md).toContain('## Color Palette & Roles');
    expect(md).toContain('## Typography Rules');
    expect(md).toContain('## Component Stylings');
    expect(md).toContain('## Layout Principles');
    expect(md).toContain('## Depth & Elevation');
    expect(md).toContain("## Do's and Don'ts");
    expect(md).toContain('## Responsive Behavior');
    expect(md).toContain('## Agent Prompt Guide');
  });

  it('emits fenced blocks with correct language hints', () => {
    const tokens = loadTokens('notion');
    const ir = tokensToIR(tokens);
    const md = renderMarkdown(ir);
    expect(md).toContain('```color');
    expect(md).toContain('```font-family');
    expect(md).toContain('```type-scale');
    expect(md).toContain('```spacing');
    expect(md).toContain('```radius');
    expect(md).toContain('```shadow');
    expect(md).toContain('```elevation');
    expect(md).toContain('```gradient');
  });

  it('emits frontmatter with quoted values', () => {
    const tokens = loadTokens('notion');
    const ir = tokensToIR(tokens);
    const md = renderMarkdown(ir);
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('"notion"');
    expect(md).toContain('"2026-04-04T00:00:00.000Z"');
  });

  it('deterministic output — two calls produce identical markdown', () => {
    const tokens = loadTokens('claude');
    const ir1 = tokensToIR(tokens);
    const md1 = renderMarkdown(ir1);
    const ir2 = tokensToIR(tokens);
    const md2 = renderMarkdown(ir2);
    expect(md1).toBe(md2);
  });

  it('omits elevation block for aurelia (thin system)', () => {
    const tokens = loadTokens('aurelia');
    const ir = tokensToIR(tokens);
    const md = renderMarkdown(ir);
    expect(md).not.toContain('```elevation');
    expect(md).toContain('```shadow');
  });
});
