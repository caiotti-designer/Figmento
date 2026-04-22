/**
 * DQ-HF-1 — regression tests for post-showcase extension discipline.
 *
 * Exercises the two bug paths from 2026-04-16 Coral de Dois:
 *   1. Invisible dark-on-dark text (contrast discipline — validated by a
 *      simple luminance-contrast calc; the real get_contrast_check lives
 *      in the plugin, so we just verify the ratio that would be computed)
 *   2. Sibling-of-showcase frame (nesting discipline — validated by the
 *      showcase-tracker's buildSiblingWarning function)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  recordShowcase,
  clearShowcaseTracker,
  getRecentShowcase,
  buildSiblingWarning,
} from '../src/tools/design-system/showcase-tracker';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'dark-theme-brief.json');

// ─── WCAG contrast helper (mirrors the formula the plugin uses) ──────
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('DQ-HF-1 — post-showcase discipline', () => {
  beforeEach(() => clearShowcaseTracker());

  describe('fixture loads cleanly', () => {
    it('dark-theme-brief.json exists and parses', () => {
      const raw = fs.readFileSync(FIXTURE_PATH, 'utf-8');
      const fixture = JSON.parse(raw);
      expect(fixture.brandName).toBe('Coral de Dois');
      expect(fixture.colors.primary).toBe('#1F3A2E');
      expect(fixture.colors.background).toBe('#000000');
    });
  });

  describe('contrast discipline (AC1)', () => {
    it('reproduces the Coral de Dois dark-on-dark bug', () => {
      // Agent placed #151917 (on_surface) onto #1F3A2E (primary) — invisible.
      const ratio = contrastRatio('#151917', '#1F3A2E');
      expect(ratio).toBeLessThan(4.5);  // fails WCAG AA normal text
      expect(ratio).toBeLessThan(3.0);  // fails even large-text threshold
    });

    it('verifies the correct fix (on_primary on primary)', () => {
      // The fix: #FFFFFF (on_primary) on #1F3A2E (primary).
      const ratio = contrastRatio('#FFFFFF', '#1F3A2E');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThanOrEqual(7.0);  // comfortably AAA too
    });

    it('near-black surface + on_surface color is ALSO low contrast — another failure mode', () => {
      // Another Coral-de-Dois-style bug: muted dark text on a near-black panel.
      // Both colors are near-black; ratio stays well under 4.5.
      const ratio = contrastRatio('#151917', '#0D0D0D');
      expect(ratio).toBeLessThan(1.2);
    });
  });

  describe('nesting discipline (AC2/AC3 — tracker + warning)', () => {
    it('tracker starts empty', () => {
      expect(getRecentShowcase()).toBeNull();
    });

    it('recordShowcase + getRecentShowcase round-trip', () => {
      recordShowcase('1:2345', 1200);
      const r = getRecentShowcase();
      expect(r).not.toBeNull();
      expect(r!.rootFrameId).toBe('1:2345');
      expect(r!.width).toBe(1200);
    });

    it('sibling warning fires for matching-width frame with no parentId', () => {
      recordShowcase('1:2345', 1200);
      const warning = buildSiblingWarning({ width: 1200 });
      expect(warning).not.toBeNull();
      expect(warning).toContain('1:2345');
      expect(warning).toContain('parentId');
      expect(warning).toContain('1200');
    });

    it('no warning when parentId is passed (agent already nested)', () => {
      recordShowcase('1:2345', 1200);
      const warning = buildSiblingWarning({ parentId: '1:2345', width: 1200 });
      expect(warning).toBeNull();
    });

    it('no warning when width differs from showcase', () => {
      recordShowcase('1:2345', 1200);
      const warning = buildSiblingWarning({ width: 400 });
      expect(warning).toBeNull();
    });

    it('no warning when no recent showcase', () => {
      const warning = buildSiblingWarning({ width: 1200 });
      expect(warning).toBeNull();
    });

    it('tracker expires after 60s', () => {
      const realNow = Date.now;
      try {
        const base = 1_700_000_000_000;
        Date.now = () => base;
        recordShowcase('1:2345', 1200);
        expect(getRecentShowcase()).not.toBeNull();
        Date.now = () => base + 61_000;
        expect(getRecentShowcase()).toBeNull();
      } finally {
        Date.now = realNow;
      }
    });

    it('never blocks — warning is a pure string, not an error', () => {
      recordShowcase('1:2345', 1200);
      const warning = buildSiblingWarning({ width: 1200 });
      expect(typeof warning).toBe('string');
      // The caller embeds it as a `warning` field — no throw path
    });
  });
});
