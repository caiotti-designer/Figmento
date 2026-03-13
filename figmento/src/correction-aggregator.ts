/**
 * correction-aggregator.ts
 *
 * Pure function module for aggregating CorrectionEntry[] into LearnedPreference[].
 * Applies the N≥3 consistent-direction rule (PRD-004 §C6).
 *
 * Zero Figma API dependencies — fully unit-testable outside the sandbox.
 */

import type { CorrectionEntry } from './types';
import type { ConfidenceLevel, LearnedPreference } from './types';
import { categorizeProperty } from './diff-calculator';

// ═══════════════════════════════════════════════════════════════
// CONFIDENCE THRESHOLDS
// ═══════════════════════════════════════════════════════════════

export const CONFIDENCE_THRESHOLDS = {
  low: 3,
  medium: 5,
  high: 8,
} as const;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

export function getConfidenceLevel(count: number): ConfidenceLevel {
  if (count >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (count >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Generate a human-readable description for a learned preference.
 */
export function describePreference(
  property: string,
  context: string,
  direction: string,
  value: unknown,
): string {
  const ctx = context || 'element';

  if (property === 'fontSize') {
    if (direction === 'increase' && value != null) {
      return `Prefers ${ctx} font size ≥${value}px`;
    }
    if (direction === 'increase') return `Tends toward larger ${ctx} font size`;
    if (direction === 'decrease') return `Tends toward smaller ${ctx} font size`;
    return `Prefers ${ctx} font size of ${value}px`;
  }

  if (property === 'cornerRadius') {
    if (direction === 'increase') return `Tends toward larger ${ctx} corner radius`;
    if (direction === 'decrease') return `Tends toward smaller ${ctx} corner radius`;
    return `Prefers ${ctx} corner radius of ${value}`;
  }

  if (property === 'itemSpacing' || property.startsWith('padding')) {
    const label = property === 'itemSpacing' ? 'item spacing' : property.replace(/([A-Z])/g, ' $1').toLowerCase();
    if (direction === 'increase' && value != null) {
      return `Prefers ${ctx} ${label} ≥${value}px`;
    }
    if (direction === 'increase') return `Tends toward larger ${ctx} ${label}`;
    if (direction === 'decrease') return `Tends toward smaller ${ctx} ${label}`;
    return `Prefers ${ctx} ${label} of ${value}`;
  }

  if (property === 'fills' || property === 'opacity') {
    if (value != null) return `Prefers ${ctx} fill: ${value}`;
    return `Tends to change ${ctx} color`;
  }

  if (property === 'fontWeight') {
    if (direction === 'increase') return `Tends toward bolder ${ctx} text`;
    if (direction === 'decrease') return `Tends toward lighter ${ctx} text`;
    return `Prefers ${ctx} font weight of ${value}`;
  }

  if (direction === 'increase') return `Tends toward larger ${ctx} ${property}`;
  if (direction === 'decrease') return `Tends toward smaller ${ctx} ${property}`;
  return `Prefers ${ctx} ${property}: ${value}`;
}

/**
 * Find the longest consecutive run of the same direction in a sorted correction array.
 * Returns the start index, count, and the direction of the longest run.
 * If there are ties, returns the LATEST (most recent) run.
 */
function findLongestConsistentRun(
  sorted: CorrectionEntry[],
): { startIdx: number; count: number; direction: 'increase' | 'decrease' | 'change' } | null {
  if (sorted.length === 0) return null;

  let best: { startIdx: number; count: number; direction: 'increase' | 'decrease' | 'change' } | null = null;

  let runStart = 0;
  let runCount = 1;
  let runDir = sorted[0].direction;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].direction === runDir) {
      runCount++;
    } else {
      // Check if this run beats or ties (ties go to latest = current best replaced)
      if (best === null || runCount >= best.count) {
        best = { startIdx: runStart, count: runCount, direction: runDir };
      }
      runStart = i;
      runCount = 1;
      runDir = sorted[i].direction;
    }
  }
  // Check final run
  if (best === null || runCount >= best.count) {
    best = { startIdx: runStart, count: runCount, direction: runDir };
  }

  return best;
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════

/**
 * Aggregate confirmed CorrectionEntry[] into LearnedPreference[].
 *
 * Rules:
 * - Only confirmed corrections (confirmed: true) are counted
 * - Groups by `property::context`
 * - Requires longest consistent-direction run ≥ 3
 * - Deduplicates against existingPreferences by property+context
 */
export function aggregateCorrections(
  corrections: CorrectionEntry[],
  existingPreferences?: LearnedPreference[],
): LearnedPreference[] {
  // Step 1: filter to confirmed only
  const confirmed = corrections.filter(c => c.confirmed === true);

  // Step 2: group by property::context
  const groups = new Map<string, CorrectionEntry[]>();
  for (const entry of confirmed) {
    const key = `${entry.property}::${entry.context}`;
    const arr = groups.get(key) ?? [];
    arr.push(entry);
    groups.set(key, arr);
  }

  const result: LearnedPreference[] = [];

  for (const [key, entries] of groups) {
    // Step 3: sort by timestamp
    const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);

    // Step 4: find longest consistent-direction run
    const run = findLongestConsistentRun(sorted);
    if (!run || run.count < CONFIDENCE_THRESHOLDS.low) continue;

    const runEntries = sorted.slice(run.startIdx, run.startIdx + run.count);
    const runDirection = run.direction;

    // Step 5: compute learnedValue or learnedRange
    const afterValues = runEntries.map(e => e.afterValue);
    const uniqueValues = new Set(afterValues.map(v => JSON.stringify(v)));

    let learnedValue: unknown = undefined;
    let learnedRange: { min: unknown; max: unknown } | undefined = undefined;

    if (uniqueValues.size === 1) {
      learnedValue = afterValues[0];
    } else if (runDirection !== 'change') {
      // Numeric range
      const nums = afterValues.filter(v => typeof v === 'number') as number[];
      if (nums.length >= 2) {
        learnedRange = { min: Math.min(...nums), max: Math.max(...nums) };
      } else {
        learnedValue = afterValues[afterValues.length - 1];
      }
    } else {
      // 'change' direction: use most recent value
      learnedValue = afterValues[afterValues.length - 1];
    }

    // Step 6: deduplication against existing preferences
    const parts = key.split('::');
    const property = parts[0];
    const context = parts.slice(1).join('::');
    const category = categorizeProperty(property);
    const now = Date.now();

    const existing = existingPreferences?.find(
      p => p.property === property && p.context === context,
    );

    if (existing) {
      // Merge: accumulate correctionIds and correctionCount, update lastSeenAt
      const newIds = runEntries.map(e => e.id).filter(id => !existing.correctionIds.includes(id));
      if (newIds.length === 0) {
        // No new corrections — keep existing as-is
        result.push(existing);
        continue;
      }
      const mergedIds = [...existing.correctionIds, ...newIds];
      const mergedCount = mergedIds.length;
      result.push({
        ...existing,
        correctionCount: mergedCount,
        correctionIds: mergedIds,
        confidence: getConfidenceLevel(mergedCount),
        lastSeenAt: now,
        direction: runDirection,
        learnedValue,
        learnedRange,
        description: describePreference(property, context, runDirection, learnedValue ?? learnedRange?.max),
      });
    } else {
      // Create new preference
      const prefValue = learnedValue ?? learnedRange?.max;
      result.push({
        id: `pref-${now}-${Math.random().toString(36).slice(2, 8)}`,
        property,
        category,
        context,
        direction: runDirection,
        learnedValue,
        learnedRange,
        description: describePreference(property, context, runDirection, prefValue),
        confidence: getConfidenceLevel(run.count),
        correctionCount: run.count,
        correctionIds: runEntries.map(e => e.id),
        enabled: true,
        createdAt: now,
        lastSeenAt: now,
      });
    }
  }

  return result;
}
