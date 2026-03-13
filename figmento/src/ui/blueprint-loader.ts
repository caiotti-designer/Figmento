// ═══════════════════════════════════════════════════════════════
// Blueprint Loader — MQ-4
// Category/mood matching for layout blueprint injection.
// ═══════════════════════════════════════════════════════════════

import { Blueprint, BLUEPRINTS } from './blueprint-data';

export type BlueprintCategory = Blueprint['category'];

// ── Category inference from format display names ─────────────
const CATEGORY_MAP: Record<string, BlueprintCategory> = {
  Instagram: 'social',
  TikTok: 'social',
  Facebook: 'social',
  Twitter: 'social',
  LinkedIn: 'social',
  Pinterest: 'social',
  Story: 'social',
  Carousel: 'social',
  'Feed Post': 'social',
  'Social Post': 'social',
  'Web Hero': 'web',
  'Landing Page': 'web',
  Hero: 'web',
  Feature: 'web',
  Pricing: 'web',
  CTA: 'web',
  A4: 'print',
  Poster: 'print',
  Flyer: 'print',
  Brochure: 'print',
  Business: 'print',
  Menu: 'print',
  Presentation: 'presentation',
  Slide: 'presentation',
  Keynote: 'presentation',
  Deck: 'presentation',
  Ad: 'ads',
  Banner: 'ads',
  'Display Ad': 'ads',
};

/**
 * Infer the blueprint category from a format display name.
 * Returns null if no match found.
 */
export const inferCategory = (formatName: string): BlueprintCategory | null => {
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (formatName.toLowerCase().includes(key.toLowerCase())) return cat;
  }
  return null;
};

/**
 * Return the best-matching blueprint for a given category and optional mood tags.
 * Scoring: category match required (+10 base), +1 per overlapping mood tag.
 * Returns null when no blueprint matches the category.
 */
export const getRelevantBlueprint = (
  category: BlueprintCategory | null,
  mood?: string | string[]
): Blueprint | null => {
  if (!category) return null;

  const moodList = !mood
    ? []
    : Array.isArray(mood)
    ? mood.map((m) => m.toLowerCase())
    : [mood.toLowerCase()];

  let bestMatch: Blueprint | null = null;
  let bestScore = -1;

  for (const bp of BLUEPRINTS) {
    if (bp.category !== category) continue;

    let score = 10; // base score for category match
    for (const m of moodList) {
      if (bp.moods.some((bm) => bm.toLowerCase().includes(m) || m.includes(bm.toLowerCase()))) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = bp;
    }
  }

  return bestMatch;
};

/**
 * Format blueprint zone data as a concise injection string for the prompt.
 * Example: "visual: 0–64%, content: 64–96%"
 */
export const formatBlueprintZones = (bp: Blueprint, canvasHeight?: number): string => {
  const zoneParts = bp.zones.map((z) => {
    if (canvasHeight) {
      const startPx = Math.round((z.y_start_pct / 100) * canvasHeight);
      const endPx = Math.round((z.y_end_pct / 100) * canvasHeight);
      return `${z.name}: ${z.y_start_pct}–${z.y_end_pct}% (${startPx}–${endPx}px)`;
    }
    return `${z.name}: ${z.y_start_pct}–${z.y_end_pct}%`;
  });
  return zoneParts.join(', ');
};
