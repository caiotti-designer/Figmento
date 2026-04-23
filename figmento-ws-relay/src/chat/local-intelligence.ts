/**
 * Local Intelligence Tools — server-side port of figmento/src/ui/local-intelligence.ts.
 * Resolves from bundled compiled knowledge. Zero network latency.
 */

import {
  PALETTES,
  FONT_PAIRINGS,
  SIZE_PRESETS,
  BLUEPRINTS,
  DESIGN_RULES,
} from '../knowledge/compiled-knowledge';

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

// ═══════════════════════════════════════════════════════════════
// WCAG Contrast Check (pure math, zero I/O)
// ═══════════════════════════════════════════════════════════════

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastCheck(args: Record<string, unknown>): unknown {
  const fg = String(args.foreground || '#000000');
  const bg = String(args.background || '#FFFFFF');

  const fgLum = relativeLuminance(fg);
  const bgLum = relativeLuminance(bg);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  const ratio = Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;

  return {
    foreground: fg,
    background: bg,
    ratio,
    AA_normal_text: ratio >= 4.5,
    AA_large_text: ratio >= 3,
    AAA_normal_text: ratio >= 7,
    AAA_large_text: ratio >= 4.5,
  };
}

// ═══════════════════════════════════════════════════════════════
// Design Rules (compiled from design-rules.yaml)
// ═══════════════════════════════════════════════════════════════

export function lookupDesignRules(args: Record<string, unknown>): unknown {
  const cat = String(args.category || 'all').toLowerCase().replace(/-/g, '_');

  if (!DESIGN_RULES || Object.keys(DESIGN_RULES).length === 0) {
    return { error: 'Design rules not available in compiled knowledge.' };
  }

  const keyMap: Record<string, string> = {
    anti_patterns: 'anti_patterns',
    antipatterns: 'anti_patterns',
    gradients: 'gradients',
    taste: 'taste',
    typography: 'typography',
    layout: 'layout',
    color: 'color',
    print: 'print',
    evaluation: 'evaluation',
    refinement: 'refinement',
  };

  if (cat === 'all') return DESIGN_RULES;

  const key = keyMap[cat] || cat;
  const result = (DESIGN_RULES as Record<string, unknown>)[key];
  if (!result) {
    const available = Object.keys(DESIGN_RULES).join(', ');
    return { error: `Unknown category "${args.category}". Available: ${available}` };
  }
  return result;
}

export const LOCAL_TOOL_HANDLERS: Record<string, (args: Record<string, unknown>) => unknown> = {
  lookup_blueprint: lookupBlueprint,
  lookup_palette: lookupPalette,
  lookup_fonts: lookupFonts,
  lookup_size: lookupSize,
  get_contrast_check: contrastCheck,
  get_design_rules: lookupDesignRules,
};
