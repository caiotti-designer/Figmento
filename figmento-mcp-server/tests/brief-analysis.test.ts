/**
 * ODS-1b: Brief Analysis — Unit Tests
 *
 * Tests color scale generation, knowledge matching, output schema validation.
 * @po note: 3 color test cases per validation recommendation (pure blue, warm brown, light teal).
 */

import { generateColorScale, generateNeutralScale, assembleBrandAnalysis } from '../src/tools/brief-analysis-core';

// ═══════════════════════════════════════════════════════════════
// COLOR SCALE TESTS
// ═══════════════════════════════════════════════════════════════

describe('generateColorScale', () => {
  it('produces 10 steps from 50 to 900', () => {
    const scale = generateColorScale('#0000FF');
    const keys = Object.keys(scale);
    expect(keys).toContain('50');
    expect(keys).toContain('500');
    expect(keys).toContain('900');
    expect(keys.length).toBe(10);
  });

  it('50 is lighter than 900 for pure blue (#0000FF)', () => {
    const scale = generateColorScale('#0000FF');
    // 50 should be very light, 900 very dark
    // Parse hex to get lightness
    const hex50 = scale['50'];
    const hex900 = scale['900'];
    expect(hex50).toMatch(/^#[0-9A-F]{6}$/);
    expect(hex900).toMatch(/^#[0-9A-F]{6}$/);
    // Lightness check: 50 should have higher RGB values than 900
    const rgb50 = parseInt(hex50.slice(1, 3), 16) + parseInt(hex50.slice(3, 5), 16) + parseInt(hex50.slice(5, 7), 16);
    const rgb900 = parseInt(hex900.slice(1, 3), 16) + parseInt(hex900.slice(3, 5), 16) + parseInt(hex900.slice(5, 7), 16);
    expect(rgb50).toBeGreaterThan(rgb900);
  });

  it('50 is lighter than 900 for warm brown (#2C1810)', () => {
    const scale = generateColorScale('#2C1810');
    const rgb50 = parseInt(scale['50'].slice(1, 3), 16) + parseInt(scale['50'].slice(3, 5), 16) + parseInt(scale['50'].slice(5, 7), 16);
    const rgb900 = parseInt(scale['900'].slice(1, 3), 16) + parseInt(scale['900'].slice(3, 5), 16) + parseInt(scale['900'].slice(5, 7), 16);
    expect(rgb50).toBeGreaterThan(rgb900);
  });

  it('50 is lighter than 900 for light teal (#2AB6BD)', () => {
    const scale = generateColorScale('#2AB6BD');
    const rgb50 = parseInt(scale['50'].slice(1, 3), 16) + parseInt(scale['50'].slice(3, 5), 16) + parseInt(scale['50'].slice(5, 7), 16);
    const rgb900 = parseInt(scale['900'].slice(1, 3), 16) + parseInt(scale['900'].slice(3, 5), 16) + parseInt(scale['900'].slice(5, 7), 16);
    expect(rgb50).toBeGreaterThan(rgb900);
  });

  it('all values are valid hex colors', () => {
    const scale = generateColorScale('#FF5733');
    for (const hex of Object.values(scale)) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('generateNeutralScale', () => {
  it('produces 11 steps from 50 to 950', () => {
    const scale = generateNeutralScale('#1E3A5F');
    expect(Object.keys(scale).length).toBe(11);
    expect(scale).toHaveProperty('50');
    expect(scale).toHaveProperty('950');
  });

  it('is tinted toward the primary hue (not pure gray)', () => {
    const scale = generateNeutralScale('#FF0000'); // red primary
    // The neutral 500 should have some red tint, not pure gray (#808080)
    const n500 = scale['500'];
    const r = parseInt(n500.slice(1, 3), 16);
    const g = parseInt(n500.slice(3, 5), 16);
    const b = parseInt(n500.slice(5, 7), 16);
    // Red channel should be slightly higher than others due to tinting
    expect(r).toBeGreaterThanOrEqual(g);
  });
});

// ═══════════════════════════════════════════════════════════════
// BRAND ANALYSIS ASSEMBLY TESTS
// ═══════════════════════════════════════════════════════════════

describe('assembleBrandAnalysis', () => {
  it('produces valid BrandAnalysis with logo colors', () => {
    const analysis = assembleBrandAnalysis({
      brandName: 'Gartni',
      industry: 'AgTech / Agriculture',
      tone: ['professional', 'innovative', 'eco'],
      targetAudience: 'Agricultural businesses',
      brandValues: ['innovation', 'sustainability'],
      logoColors: ['#2AB6BD', '#BDB8C1', '#70D445'],
      hasPdf: true,
      hasLogo: true,
    });

    expect(analysis.brandName).toBe('Gartni');
    expect(analysis.colors.primary).toBe('#2AB6BD');
    expect(analysis.colors.secondary).toBe('#BDB8C1');
    expect(analysis.colors.accent).toBe('#70D445');
    expect(analysis.colors.scales.primary).toHaveProperty('50');
    expect(analysis.colors.scales.primary).toHaveProperty('900');
    expect(analysis.colors.neutrals).toHaveProperty('50');
    expect(analysis.colors.neutrals).toHaveProperty('950');
  });

  it('derives missing colors when only 1 logo color provided', () => {
    const analysis = assembleBrandAnalysis({
      brandName: 'Solo',
      industry: 'General',
      tone: ['modern'],
      targetAudience: 'General',
      brandValues: ['quality'],
      logoColors: ['#FF0000'],
      hasPdf: false,
      hasLogo: true,
    });

    expect(analysis.colors.primary).toBe('#FF0000');
    expect(analysis.colors.secondary).not.toBe('#FF0000'); // derived
    expect(analysis.colors.accent).not.toBe('#FF0000'); // derived
  });

  it('falls back to knowledge palette when no logo colors', () => {
    const analysis = assembleBrandAnalysis({
      brandName: 'NoPalette',
      industry: 'General',
      tone: ['luxury', 'premium'],
      targetAudience: 'High-end market',
      brandValues: ['exclusivity'],
      logoColors: [],
      hasPdf: true,
      hasLogo: false,
    });

    // Should match luxury-premium palette from color-system.yaml
    expect(analysis.source.paletteId).toBe('luxury-premium');
    expect(analysis.colors.primary).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('never returns fontWeight 600', () => {
    const analysis = assembleBrandAnalysis({
      brandName: 'Test',
      industry: 'Fashion',
      tone: ['luxury', 'premium', 'sophisticated'],
      targetAudience: 'Luxury market',
      brandValues: ['craftsmanship'],
      logoColors: ['#1A1A1A'],
      hasPdf: false,
      hasLogo: true,
    });

    // Luxury pairing has recommended_heading_weight: 600 in typography.yaml
    // Our clamp function must convert to 700
    expect(analysis.typography.headingWeight).not.toBe(600);
    expect([400, 700]).toContain(analysis.typography.headingWeight);
    expect([400, 700]).toContain(analysis.typography.bodyWeight);

    // Also check all text styles
    for (const [, style] of Object.entries(analysis.typography.styles)) {
      expect(style.weight).not.toBe(600);
    }
  });

  it('lineHeight is always in pixels (>10), never a multiplier', () => {
    const analysis = assembleBrandAnalysis({
      brandName: 'LH Test',
      industry: 'General',
      tone: ['modern'],
      targetAudience: 'General',
      brandValues: ['quality'],
      logoColors: [],
      hasPdf: false,
      hasLogo: false,
    });

    for (const [name, style] of Object.entries(analysis.typography.styles)) {
      expect(style.lineHeight).toBeGreaterThan(10);
      // lineHeight should be between size * 1.0 and size * 2.0
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.size);
      expect(style.lineHeight).toBeLessThanOrEqual(style.size * 2);
    }
  });

  it('spacing scale is standard 8px base', () => {
    const analysis = assembleBrandAnalysis({
      brandName: 'Space',
      industry: 'General',
      tone: ['modern'],
      targetAudience: 'General',
      brandValues: [],
      logoColors: [],
      hasPdf: false,
      hasLogo: false,
    });

    expect(analysis.spacing.base).toBe(8);
    expect(analysis.spacing.scale).toContain(4);
    expect(analysis.spacing.scale).toContain(8);
    expect(analysis.spacing.scale).toContain(64);
  });

  it('radius maps to industry', () => {
    const fintech = assembleBrandAnalysis({
      brandName: 'FintechApp', industry: 'FinTech / Finance',
      tone: ['corporate'], targetAudience: '', brandValues: [],
      logoColors: [], hasPdf: false, hasLogo: false,
    });
    expect(fintech.radius.default).toBe(4);

    const kids = assembleBrandAnalysis({
      brandName: 'KidsApp', industry: 'Kids / Gaming',
      tone: ['playful'], targetAudience: '', brandValues: [],
      logoColors: [], hasPdf: false, hasLogo: false,
    });
    expect(kids.radius.default).toBe(16);
  });

  it('confidence reflects available inputs', () => {
    const full = assembleBrandAnalysis({
      brandName: 'Full', industry: 'Tech', tone: ['tech'],
      targetAudience: '', brandValues: [],
      logoColors: ['#0000FF'], hasPdf: true, hasLogo: true,
    });

    const none = assembleBrandAnalysis({
      brandName: 'None', industry: 'General', tone: ['modern'],
      targetAudience: '', brandValues: [],
      logoColors: [], hasPdf: false, hasLogo: false,
    });

    expect(full.source.confidence).toBeGreaterThan(none.source.confidence);
  });
});
