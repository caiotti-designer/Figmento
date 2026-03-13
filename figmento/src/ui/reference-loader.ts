// ═══════════════════════════════════════════════════════════════
// Reference Loader — MQ-5
// Category/mood matching for reference design injection.
// ═══════════════════════════════════════════════════════════════

import { ReferenceEntry, REFERENCES } from './reference-data';

/**
 * Return references matching the given category, subcategory, and mood tags.
 * Results are sorted by relevance score descending.
 * Always returns an array (never null) — callers check length > 0.
 *
 * @param category   Top-level category: 'web' | 'social' | 'print' | 'ads' | 'presentation'
 * @param subcategory Optional subcategory filter (e.g., 'hero', 'brochure')
 * @param mood       Optional mood tag(s) for scoring
 * @param limit      Max results to return (default: 1)
 */
export const getRelevantReferences = (
  category: string,
  subcategory?: string,
  mood?: string | string[],
  limit: number = 1
): ReferenceEntry[] => {
  const moodList = !mood
    ? []
    : Array.isArray(mood)
    ? mood.map((m) => m.toLowerCase())
    : [mood.toLowerCase()];

  const scored: Array<{ ref: ReferenceEntry; score: number }> = [];

  for (const ref of REFERENCES) {
    if (ref.category !== category) continue;
    if (subcategory && ref.subcategory !== subcategory) continue;

    let score = 10; // base score for category match
    if (subcategory && ref.subcategory === subcategory) score += 5;

    for (const m of moodList) {
      if (ref.moods.some((rm) => rm.toLowerCase().includes(m) || m.includes(rm.toLowerCase()))) {
        score += 2;
      }
    }

    scored.push({ ref, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.ref);
};
