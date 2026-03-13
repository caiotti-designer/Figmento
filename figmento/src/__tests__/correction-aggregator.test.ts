import {
  aggregateCorrections,
  describePreference,
  getConfidenceLevel,
  CONFIDENCE_THRESHOLDS,
} from '../correction-aggregator';
import type { CorrectionEntry } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let idCounter = 0;
function makeEntry(overrides: Partial<CorrectionEntry> = {}): CorrectionEntry {
  idCounter++;
  return {
    id: `entry-${idCounter}`,
    frameId: 'frame-1',
    nodeId: 'node-1',
    nodeName: 'Hero Title',
    nodeType: 'TEXT',
    property: 'fontSize',
    category: 'typography',
    context: 'h1',
    beforeValue: 64,
    afterValue: 96,
    direction: 'increase',
    magnitude: 32,
    timestamp: 1000 * idCounter,
    confirmed: true,
    ...overrides,
  };
}

// ── getConfidenceLevel ────────────────────────────────────────────────────────

describe('getConfidenceLevel', () => {
  it('returns low for count 3', () => expect(getConfidenceLevel(3)).toBe('low'));
  it('returns low for count 4', () => expect(getConfidenceLevel(4)).toBe('low'));
  it('returns medium for count 5', () => expect(getConfidenceLevel(5)).toBe('medium'));
  it('returns medium for count 7', () => expect(getConfidenceLevel(7)).toBe('medium'));
  it('returns high for count 8', () => expect(getConfidenceLevel(8)).toBe('high'));
  it('returns high for count 20', () => expect(getConfidenceLevel(20)).toBe('high'));
});

// ── describePreference ────────────────────────────────────────────────────────

describe('describePreference', () => {
  it('describes fontSize increase with value', () => {
    expect(describePreference('fontSize', 'h1', 'increase', 96)).toBe('Prefers h1 font size ≥96px');
  });
  it('describes cornerRadius increase without value', () => {
    expect(describePreference('cornerRadius', 'card', 'increase', null)).toBe('Tends toward larger card corner radius');
  });
  it('describes fills change with value', () => {
    const result = describePreference('fills', 'root-frame', 'change', '#0A0A0F');
    expect(result).toContain('#0A0A0F');
  });
  it('produces non-empty string for any inputs', () => {
    const result = describePreference('itemSpacing', 'section', 'increase', 64);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── aggregateCorrections ──────────────────────────────────────────────────────

describe('aggregateCorrections', () => {
  beforeEach(() => { idCounter = 0; });

  it('returns empty array for empty input', () => {
    expect(aggregateCorrections([])).toEqual([]);
  });

  it('ignores unconfirmed corrections', () => {
    const entries = [
      makeEntry({ confirmed: false }),
      makeEntry({ confirmed: false }),
      makeEntry({ confirmed: false }),
    ];
    expect(aggregateCorrections(entries)).toHaveLength(0);
  });

  it('returns nothing for N<3 same-direction corrections', () => {
    const entries = [
      makeEntry({ afterValue: 80 }),
      makeEntry({ afterValue: 96 }),
    ];
    expect(aggregateCorrections(entries)).toHaveLength(0);
  });

  it('returns preference with low confidence for exactly N=3', () => {
    const entries = [
      makeEntry({ afterValue: 80 }),
      makeEntry({ afterValue: 88 }),
      makeEntry({ afterValue: 96 }),
    ];
    const result = aggregateCorrections(entries);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe('low');
    expect(result[0].correctionCount).toBe(3);
  });

  it('returns medium confidence for N=5', () => {
    const entries = Array.from({ length: 5 }, () => makeEntry({ afterValue: 96 }));
    const result = aggregateCorrections(entries);
    expect(result[0].confidence).toBe('medium');
  });

  it('returns high confidence for N=8', () => {
    const entries = Array.from({ length: 8 }, () => makeEntry({ afterValue: 96 }));
    const result = aggregateCorrections(entries);
    expect(result[0].confidence).toBe('high');
  });

  it('returns nothing for mixed directions (2 increase + 1 decrease)', () => {
    const entries = [
      makeEntry({ direction: 'increase', afterValue: 80 }),
      makeEntry({ direction: 'increase', afterValue: 88 }),
      makeEntry({ direction: 'decrease', afterValue: 60 }),
    ];
    // Longest run is 2 — below threshold
    expect(aggregateCorrections(entries)).toHaveLength(0);
  });

  it('uses longest run: 3 increases followed by 2 decreases → low confidence from the run of 3', () => {
    const entries = [
      makeEntry({ direction: 'increase', afterValue: 80, timestamp: 1000 }),
      makeEntry({ direction: 'increase', afterValue: 88, timestamp: 2000 }),
      makeEntry({ direction: 'increase', afterValue: 96, timestamp: 3000 }),
      makeEntry({ direction: 'decrease', afterValue: 72, timestamp: 4000 }),
      makeEntry({ direction: 'decrease', afterValue: 64, timestamp: 5000 }),
    ];
    const result = aggregateCorrections(entries);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe('low');
    expect(result[0].direction).toBe('increase');
    expect(result[0].correctionCount).toBe(3);
  });

  it('sets learnedValue when all afterValues in run are equal', () => {
    const entries = Array.from({ length: 3 }, () => makeEntry({ afterValue: 96 }));
    const result = aggregateCorrections(entries);
    expect(result[0].learnedValue).toBe(96);
    expect(result[0].learnedRange).toBeUndefined();
  });

  it('sets learnedRange when afterValues in run differ (all increases)', () => {
    const entries = [
      makeEntry({ afterValue: 80, direction: 'increase' }),
      makeEntry({ afterValue: 96, direction: 'increase' }),
      makeEntry({ afterValue: 112, direction: 'increase' }),
    ];
    const result = aggregateCorrections(entries);
    expect(result[0].learnedRange).toEqual({ min: 80, max: 112 });
    expect(result[0].learnedValue).toBeUndefined();
  });

  it('returns two separate preferences for two independent property+context groups', () => {
    const entries = [
      makeEntry({ property: 'fontSize', context: 'h1', afterValue: 96, direction: 'increase' }),
      makeEntry({ property: 'fontSize', context: 'h1', afterValue: 96, direction: 'increase' }),
      makeEntry({ property: 'fontSize', context: 'h1', afterValue: 96, direction: 'increase' }),
      makeEntry({ property: 'cornerRadius', context: 'card', afterValue: 16, direction: 'increase', category: 'shape' }),
      makeEntry({ property: 'cornerRadius', context: 'card', afterValue: 16, direction: 'increase', category: 'shape' }),
      makeEntry({ property: 'cornerRadius', context: 'card', afterValue: 16, direction: 'increase', category: 'shape' }),
    ];
    const result = aggregateCorrections(entries);
    expect(result).toHaveLength(2);
    const props = result.map(r => r.property).sort();
    expect(props).toEqual(['cornerRadius', 'fontSize']);
  });

  it('deduplication: merges new corrections into existing preference', () => {
    const firstEntries = [
      makeEntry({ afterValue: 96 }),
      makeEntry({ afterValue: 96 }),
      makeEntry({ afterValue: 96 }),
    ];
    const firstResult = aggregateCorrections(firstEntries);
    expect(firstResult).toHaveLength(1);
    const existingPref = firstResult[0];

    // Now add 2 more confirmed corrections with new IDs
    const newEntries = [
      ...firstEntries,
      makeEntry({ afterValue: 96 }),
      makeEntry({ afterValue: 96 }),
    ];
    const secondResult = aggregateCorrections(newEntries, [existingPref]);
    expect(secondResult).toHaveLength(1);
    expect(secondResult[0].correctionCount).toBe(5);
    expect(secondResult[0].confidence).toBe('medium');
    expect(secondResult[0].id).toBe(existingPref.id); // same id
  });

  it('description field is non-empty for all returned preferences', () => {
    const entries = Array.from({ length: 3 }, () => makeEntry({ afterValue: 96 }));
    const result = aggregateCorrections(entries);
    expect(result[0].description.length).toBeGreaterThan(0);
  });

  it('enabled defaults to true on new preferences', () => {
    const entries = Array.from({ length: 3 }, () => makeEntry());
    const result = aggregateCorrections(entries);
    expect(result[0].enabled).toBe(true);
  });

  it('category matches categorizeProperty result', () => {
    const entries = Array.from({ length: 3 }, () =>
      makeEntry({ property: 'cornerRadius', context: 'card', category: 'shape' }),
    );
    const result = aggregateCorrections(entries);
    expect(result[0].category).toBe('shape');
  });
});
