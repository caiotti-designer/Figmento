// ═══════════════════════════════════════════════════════════
// DESIGN.md Parser — marked@^12 lexer + js-yaml bodies
// Consumed by: DMD-2 importer (import_design_system_from_md),
//              DMD-3 validator (validate_design_md).
// See: docs/architecture/DESIGN-MD-SPEC.md §4–§6
// ═══════════════════════════════════════════════════════════

import { marked } from 'marked';
import * as yaml from 'js-yaml';
import type {
  DesignMdIR,
  DesignMdFrontmatter,
  DesignMdSections,
} from './ds-md-types';
import { HEADING_TO_SECTION_KEY, BLOCK_LANG_TO_KEY } from './ds-md-types';

/**
 * Parse a DESIGN.md file (full markdown string) into the intermediate
 * representation validated by `design-md.schema.json`.
 *
 * Behavior (matches spec §10 tolerance contract):
 *  - Missing frontmatter → `{ name: '', created: '' }` placeholder (caller sets defaults)
 *  - Numbered H2 headings (`## 1. Visual Theme & Atmosphere`) are normalized
 *  - Unknown sections / unknown fenced-block languages are silently dropped
 *  - Date objects from js-yaml timestamp auto-parsing are normalized to ISO strings
 *  - Unicode apostrophes in "Do's and Don'ts" are normalized to straight apostrophes
 */
export function parseDesignMd(markdown: string): DesignMdIR {
  // ─── Step 1: Extract + parse YAML frontmatter ────────────────────────
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  let frontmatter: DesignMdFrontmatter;
  let body: string;

  if (frontmatterMatch) {
    const yamlBody = frontmatterMatch[1];
    frontmatter = (yaml.load(yamlBody) ?? {}) as DesignMdFrontmatter;
    body = markdown.slice(frontmatterMatch[0].length);
  } else {
    frontmatter = { name: '', created: '' };
    body = markdown;
  }

  // ─── Step 2: Tokenize body via marked lexer ──────────────────────────
  const tokens = marked.lexer(body);
  const sections: DesignMdSections = {};

  // Walk tokens: find H2 headings as section boundaries, collect code +
  // paragraph tokens until the next H2.
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.type !== 'heading' || (token as unknown as { depth: number }).depth !== 2) {
      i++;
      continue;
    }

    // Normalize heading text: strip optional "N. " numeric prefix, strip
    // escape sequences from apostrophes, trim whitespace.
    const rawText = (token.text as string)
      .replace(/^\s*\d+\.\s*/, '')
      .replace(/\\'/g, "'")
      .replace(/&#39;/g, "'")
      .trim();

    const sectionKey = HEADING_TO_SECTION_KEY[rawText];

    // Find the next H2 (or end of tokens) — that's this section's boundary
    let j = i + 1;
    while (j < tokens.length) {
      const next = tokens[j];
      if (next.type === 'heading' && (next as unknown as { depth: number }).depth === 2) break;
      j++;
    }
    const sectionTokens = tokens.slice(i + 1, j);

    if (sectionKey) {
      const sectionObj: Record<string, unknown> = {};

      // Collect fenced code blocks by language hint, parse as YAML
      for (const t of sectionTokens) {
        if (t.type !== 'code') continue;
        const lang = (t.lang || '').trim();
        const blockKey = BLOCK_LANG_TO_KEY[lang];
        if (!blockKey) continue;
        try {
          sectionObj[blockKey] = yaml.load(t.text as string);
        } catch {
          // Malformed YAML body — skip this block. DMD-3 validator
          // surfaces it as a HIGH-severity issue via schema validation
          // on the parsed IR (the missing block triggers a MEDIUM
          // "missing recommended block" warning).
        }
      }

      // Collect prose: paragraph + blockquote + list tokens outside of
      // known structural patterns (do/dont, mood).
      const proseLines: string[] = [];
      for (const t of sectionTokens) {
        if (t.type === 'paragraph') {
          proseLines.push(t.raw.trim());
        }
      }
      let prose = proseLines.join('\n\n').trim();

      // Special-case: mood extraction from visual_theme_atmosphere
      if (sectionKey === 'visual_theme_atmosphere' && prose) {
        const moodMatch = prose.match(/\*\*Mood\*\*\s*:\s*(.+?)(\n|$)/);
        if (moodMatch) {
          sectionObj['mood'] = moodMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
          prose = prose.replace(/\*\*Mood\*\*\s*:[^\n]*\n?/, '').trim();
        }
      }

      // Special-case: do/dont extraction from dos_and_donts
      if (sectionKey === 'dos_and_donts') {
        const doItems: string[] = [];
        const dontItems: string[] = [];
        let currentBucket: 'do' | 'dont' | null = null;

        for (const t of sectionTokens) {
          if (t.type === 'heading' && (t as unknown as { depth: number }).depth === 3) {
            const h3Text = ((t.text as string) || '')
              .replace(/\\'/g, "'")
              .replace(/&#39;/g, "'")
              .trim();
            if (h3Text === 'Do') currentBucket = 'do';
            else if (h3Text === "Don't" || h3Text === 'Don´t' || h3Text === 'Dont') currentBucket = 'dont';
            else currentBucket = null;
          } else if (t.type === 'list' && currentBucket) {
            const bucket = currentBucket === 'do' ? doItems : dontItems;
            for (const item of (t.items as Array<{ text: string }>)) {
              bucket.push(item.text.trim());
            }
          }
        }
        if (doItems.length > 0) sectionObj['do'] = doItems;
        if (dontItems.length > 0) sectionObj['dont'] = dontItems;
        // dos_and_donts prose is intentionally discarded — the section
        // is structured data only, prose lives in the ### Do / ### Don't items
      } else if (prose) {
        sectionObj['prose'] = prose;
      }

      (sections as Record<string, unknown>)[sectionKey] = sectionObj;
    }

    i = j;
  }

  // ─── Step 3: JSON round-trip normalization ───────────────────────────
  // Converts any Date objects (js-yaml timestamp auto-parsing) to ISO
  // strings, drops undefined values, and ensures the IR is JSON-clean
  // for ajv validation against design-md.schema.json.
  return JSON.parse(JSON.stringify({ frontmatter, sections })) as DesignMdIR;
}
