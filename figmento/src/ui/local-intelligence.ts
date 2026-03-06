/**
 * Local Intelligence Tools — resolve from bundled compiled knowledge.
 * Zero network latency, no WebSocket calls.
 * These are the chat-mode equivalents of the MCP server's intelligence tools.
 */

import {
  PALETTES,
  FONT_PAIRINGS,
  SIZE_PRESETS,
  BLUEPRINTS,
} from '../knowledge/compiled-knowledge';

// ── Blueprint Lookup ──

function scoreMoodMatch(blueprintMoods: string[], targetMood: string): number {
  const target = targetMood.toLowerCase();
  for (const m of blueprintMoods) {
    if (m === target) return 1.0;
  }
  for (const m of blueprintMoods) {
    if (m.includes(target) || target.includes(m)) return 0.5;
  }
  return 0;
}

export function lookupBlueprint(args: Record<string, unknown>): unknown {
  const category = String(args.category || '').toLowerCase();
  const mood = args.mood ? String(args.mood).toLowerCase() : null;
  const subcategory = args.subcategory ? String(args.subcategory).toLowerCase() : null;

  let candidates = BLUEPRINTS.filter(b => b.category === category);

  if (subcategory) {
    const subFiltered = candidates.filter(b => b.subcategory === subcategory);
    if (subFiltered.length > 0) candidates = subFiltered;
  }

  if (candidates.length === 0) {
    const categories = [...new Set(BLUEPRINTS.map(b => b.category))];
    return { error: `No blueprints found for category "${category}". Available: ${categories.join(', ')}` };
  }

  if (mood) {
    const scored = candidates.map(b => ({
      blueprint: b,
      score: scoreMoodMatch(b.mood, mood),
    }));
    scored.sort((a, b) => b.score - a.score);
    if (scored[0].score > 0) {
      return scored[0].blueprint;
    }
  }

  if (candidates.length === 1) return candidates[0];
  return candidates;
}

// ── Palette Lookup ──

export function lookupPalette(args: Record<string, unknown>): unknown {
  const mood = String(args.mood || '').toLowerCase();

  if (PALETTES[mood]) return PALETTES[mood];

  for (const palette of Object.values(PALETTES)) {
    if (palette.mood_tags.some(t => t === mood)) return palette;
  }

  for (const palette of Object.values(PALETTES)) {
    if (palette.mood_tags.some(t => t.includes(mood) || mood.includes(t))) return palette;
  }

  const keys = Object.keys(PALETTES);
  return { error: `No palette found for mood "${mood}". Available: ${keys.join(', ')}` };
}

// ── Font Pairing Lookup ──

export function lookupFonts(args: Record<string, unknown>): unknown {
  const mood = String(args.mood || '').toLowerCase();

  if (FONT_PAIRINGS[mood]) return FONT_PAIRINGS[mood];

  for (const fp of Object.values(FONT_PAIRINGS)) {
    if (fp.mood_tags.some(t => t === mood)) return fp;
  }

  for (const fp of Object.values(FONT_PAIRINGS)) {
    if (fp.mood_tags.some(t => t.includes(mood) || mood.includes(t))) return fp;
  }

  const keys = Object.keys(FONT_PAIRINGS);
  return { error: `No font pairing found for mood "${mood}". Available: ${keys.join(', ')}` };
}

// ── Size Preset Lookup ──

export function lookupSize(args: Record<string, unknown>): unknown {
  const format = String(args.format || '').toLowerCase();

  if (SIZE_PRESETS[format]) return SIZE_PRESETS[format];

  for (const preset of Object.values(SIZE_PRESETS)) {
    if (preset.id.includes(format) || preset.name.toLowerCase().includes(format)) {
      return preset;
    }
  }

  const keys = Object.keys(SIZE_PRESETS);
  return { error: `No size preset found for format "${format}". Available: ${keys.join(', ')}` };
}

// ── Tool Router ──

export const LOCAL_TOOL_HANDLERS: Record<string, (args: Record<string, unknown>) => unknown> = {
  lookup_blueprint: lookupBlueprint,
  lookup_palette: lookupPalette,
  lookup_fonts: lookupFonts,
  lookup_size: lookupSize,
};
