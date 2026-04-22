/**
 * DMD-5 — Seed validation gate
 *
 * Runs the canonical export pipeline on every seeded design system that is
 * missing a DESIGN.md file, writes the result into
 *   knowledge/design-systems/{name}/DESIGN.md
 * then parses it back and asserts the full round-trip survives (verdict ≠ FAIL).
 *
 * Bundles the TS pipeline via esbuild → temp file → loads and runs.
 * Usage:
 *   node scripts/seed-design-md.js           # seed any missing DESIGN.md
 *   node scripts/seed-design-md.js --force   # re-seed even if file exists
 *   node scripts/seed-design-md.js --check   # dry-run, print but don't write
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const FORCE = process.argv.includes('--force');
const CHECK = process.argv.includes('--check');

const ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE_DIR = path.join(ROOT, 'knowledge', 'design-systems');
const ENTRY = path.join(ROOT, 'scripts', '_seed-entry.ts');

const ENTRY_SRC = `
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { tokensToIR } from '../src/tools/design-system/ds-tokens-to-ir';
import { renderMarkdown } from '../src/tools/design-system/ds-ir-to-markdown';
import { parseDesignMd } from '../src/tools/design-system/ds-md-parser';
import { irToTokens } from '../src/tools/design-system/ds-md-to-tokens';
import { validateDesignMdIR } from '../src/tools/design-system/ds-md-validator';

export function exportOne(tokensPath: string) {
  const tokens = yaml.load(fs.readFileSync(tokensPath, 'utf-8')) as Record<string, unknown>;
  const ir = tokensToIR(tokens);
  const markdown = renderMarkdown(ir);
  const parsedIR = parseDesignMd(markdown);
  const reimported = irToTokens(parsedIR);
  const report = validateDesignMdIR(parsedIR);
  return { markdown, report, original: tokens, reimported };
}
`;

async function main() {
  fs.writeFileSync(ENTRY, ENTRY_SRC);
  // Must be 3 levels deep under ROOT so the validator's __dirname-relative
  // schema path (../../../schemas/design-md.schema.json) resolves correctly.
  const tmpOut = path.join(ROOT, 'src', 'tools', 'design-system', '_seed-entry.cjs');
  try {
    await esbuild.build({
      entryPoints: [ENTRY],
      bundle: true,
      outfile: tmpOut,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      logLevel: 'warning',
      external: ['js-yaml', 'marked', 'ajv', 'ajv-formats'],
    });
  } finally {
    fs.unlinkSync(ENTRY);
  }

  const { exportOne } = require(tmpOut);
  fs.unlinkSync(tmpOut);

  const systems = fs.readdirSync(KNOWLEDGE_DIR)
    .filter((n) => fs.statSync(path.join(KNOWLEDGE_DIR, n)).isDirectory());

  const results = [];
  for (const name of systems) {
    const dir = path.join(KNOWLEDGE_DIR, name);
    const tokensPath = path.join(dir, 'tokens.yaml');
    const mdPath = path.join(dir, 'DESIGN.md');

    if (!fs.existsSync(tokensPath)) {
      results.push({ name, action: 'skip-no-tokens' });
      continue;
    }
    if (fs.existsSync(mdPath) && !FORCE) {
      results.push({ name, action: 'skip-exists' });
      continue;
    }

    const { markdown, report, original, reimported } = exportOne(tokensPath);
    const verdict = report.verdict;

    // Assertions
    const origColorKeys = Object.keys(original.colors || {}).sort();
    const reimpColorKeys = Object.keys(reimported.colors || {}).sort();
    const colorsMatch = JSON.stringify(origColorKeys) === JSON.stringify(reimpColorKeys);

    if (verdict === 'FAIL' || !colorsMatch) {
      results.push({
        name,
        action: 'ERROR',
        verdict,
        colorsMatch,
        issues: report.issues.filter((i) => i.severity === 'CRITICAL'),
      });
      continue;
    }

    if (!CHECK) {
      fs.writeFileSync(mdPath, markdown, 'utf-8');
    }
    results.push({
      name,
      action: CHECK ? 'would-write' : 'wrote',
      verdict,
      bytes: markdown.length,
      colorCount: origColorKeys.length,
      issueCount: report.issues.length,
    });
  }

  // Report
  console.log('\nDMD-5 seed results');
  console.log('─'.repeat(60));
  for (const r of results) {
    const tag = r.action === 'ERROR' ? '✗' : (r.action.startsWith('skip') ? '·' : '✓');
    console.log(`${tag} ${r.name.padEnd(12)} ${r.action.padEnd(16)} ${r.verdict || ''}`);
    if (r.issues && r.issues.length) {
      for (const i of r.issues) {
        console.log(`    CRITICAL: ${i.message}`);
      }
    }
  }
  console.log('─'.repeat(60));
  const errors = results.filter((r) => r.action === 'ERROR');
  if (errors.length) {
    console.error(`\n${errors.length} system(s) failed. Aborting.`);
    process.exit(1);
  }
  const written = results.filter((r) => r.action === 'wrote').length;
  const skipped = results.filter((r) => r.action.startsWith('skip')).length;
  console.log(`\n${written} written, ${skipped} skipped${CHECK ? ' (check mode, no writes)' : ''}.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
