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
  DESIGN_RULES,
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

// ── WCAG Contrast Check (pure math) ──

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastCheck(args: Record<string, unknown>): unknown {
  const fg = String(args.foreground || '#000000');
  const bg = String(args.background || '#FFFFFF');
  const fgLum = relativeLuminance(fg);
  const bgLum = relativeLuminance(bg);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  const ratio = Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
  return {
    foreground: fg, background: bg, ratio,
    AA_normal_text: ratio >= 4.5, AA_large_text: ratio >= 3,
    AAA_normal_text: ratio >= 7, AAA_large_text: ratio >= 4.5,
  };
}

// ── Design Rules Lookup ──

function lookupDesignRules(args: Record<string, unknown>): unknown {
  const cat = String(args.category || 'all').toLowerCase().replace(/-/g, '_');
  if (!DESIGN_RULES || Object.keys(DESIGN_RULES).length === 0) {
    return { error: 'Design rules not available.' };
  }
  if (cat === 'all') return DESIGN_RULES;
  const keyMap: Record<string, string> = {
    anti_patterns: 'anti_patterns', antipatterns: 'anti_patterns',
    gradients: 'gradients', taste: 'taste', typography: 'typography',
    layout: 'layout', color: 'color', print: 'print',
    evaluation: 'evaluation', refinement: 'refinement',
  };
  const key = keyMap[cat] || cat;
  const result = (DESIGN_RULES as Record<string, unknown>)[key];
  if (!result) {
    return { error: `Unknown category "${args.category}". Available: ${Object.keys(DESIGN_RULES).join(', ')}` };
  }
  return result;
}

// ── get_design_intelligence — bootstrap playbook for any model ──

function getDesignIntelligence(_args: Record<string, unknown>): unknown {
  return {
    playbook: `# Figmento Design Intelligence Playbook
## You are a top-tier graphic designer. Follow these rules exactly.

## MANDATORY: Design Brief Analysis (do this BEFORE any tool call)
\`\`\`
DESIGN BRIEF ANALYSIS
─────────────────────
Aesthetic direction  : [editorial / brutalist / organic / luxury / geometric / playful]
Font pairing         : [heading font] + [body font] — reason: [why]
Color story          : [dark / light / colorful / monochrome] — dominant: [hex]
Memorable element    : [the ONE thing that makes this unforgettable]
Generic trap avoided : [what the bot version would look like — and what you're doing instead]
\`\`\`

## WORKFLOW (follow this order)
1. Connect to Figma (skip if connected)
2. Analyze brief → fill the template above
3. Call get_design_guidance(aspect="font", mood) or suggest_font_pairing(font) for typography
4. Call generate_accessible_palette(base_color) if user provides a color, OR get_design_guidance(aspect="color", mood) for mood-based palette
5. Call get_layout_blueprint(category, mood) for composition structure
6. Create the design in ONE continuous flow — no pausing for approval
7. Call run_refinement_check → fix flagged issues
8. Take screenshot → self-evaluate: "senior designer or bot?"

## 8 TASTE RULES (non-negotiable)
1. **Commit to an aesthetic direction** before calling any tool. Never start neutral.
2. **Typography is the first decision.** Never default to Inter/Inter. Call suggest_font_pairing or pick from get_design_rules('typography'). Choose a font with CHARACTER.
3. **Color commitment.** Pick a dominant color story and use it boldly. FORBIDDEN: light grey background + timid blue accent.
4. **Background depth.** Never flat solid fills on hero sections. Always: gradient, radial glow, or texture. Even dark-to-slightly-less-dark creates depth.
5. **Spatial generosity.** Increase padding by 1.5× what feels "enough." Generous whitespace = premium feel.
6. **Never converge.** Every brief produces a visually DISTINCT output. Actively diverge.
7. **Self-evaluate ruthlessly.** After screenshot: "senior designer or bot?" If bot — fix the most generic element.
8. **The ONE memorable thing.** Every design needs one unforgettable element: 120px+ headline, unexpected color, grid-breaking element, or full-bleed image.

## ANTI-AI MARKERS (if your design has ANY of these, fix it)
- Hyper-smooth surfaces with no texture → add subtle grain/noise at 3-8% opacity
- Plastic-like shadows → vary shadow angle, blur, tint
- Perfect symmetry everywhere → offset at least one element (60/40 not 50/50)
- Grid-locked with no tension → break grid with one overlapping or bleeding element
- Default font pairing with no personality → choose a font the user would REMEMBER
- Generic harmony, all same saturation → mix muted + vivid intentionally

## TYPOGRAPHY SELECTION
- Call get_design_rules('typography') for the full mood → font pairing table
- Call suggest_font_pairing(font, mode='contrast') when user specifies ONE font
- CRITICAL: If user names a font → use ONLY that font. Never mix without permission.
- fontWeight 600 causes Inter fallback on most fonts. Use 400 or 700 only.
- Line height is PIXELS not multiplier: pass fontSize × multiplier (e.g. 48 × 1.2 = 57.6)

## COLOR SELECTION
- Call generate_accessible_palette(base_color) when user gives a hex → WCAG-guaranteed palette
- Call get_design_guidance(aspect="color", mood) for mood-based palettes
- Contrast minimum: 4.5:1 normal text, 3:1 large text

## GRADIENT OVERLAYS (most common AI mistake)
- Only 2 stops. Never 3+.
- Solid end = WHERE THE TEXT IS. Transparent end = where image shows.
- Gradient color MUST match section background (dark bg → dark gradient)

## COMMON PATTERNS
- **Button:** Auto-layout frame (HORIZONTAL, padding 12-16/24-32, cornerRadius 8-24) + text child.
- **Ad/Hero:** Nested auto-layout: root → background → overlay gradient → content frame → text-group + cta-group
- **Cards:** Auto-layout frame with layoutSizingVertical: HUG (never fixed height)
- **Icons:** Container must have auto-layout + padding. Icon size = container − 2×padding.

## SCORING (target 7+ for production)
| Dimension | Weight |
|-----------|--------|
| Visual Design | 30% |
| Creativity | 20% |
| Content Hierarchy | 20% |
| Technical | 15% |
| AI Distinctiveness | 15% |

## TOOLS AVAILABLE
- suggest_font_pairing(font, mode) — font pairing from compiled knowledge
- generate_accessible_palette(base_color) — WCAG-guaranteed palette from any hex
- get_design_rules(category) — typography | color | layout | print | evaluation | refinement | anti-patterns | gradients | taste
- get_design_guidance(aspect="color", mood) — mood-based color palettes
- get_layout_blueprint(category, mood) — proportional zone systems
- run_refinement_check — automated beauty checks after design creation
- batch_execute — group 3+ element creations into one call`,
  };
}

// ── suggest_font_pairing — font pairing from compiled knowledge ──

function suggestFontPairing(args: Record<string, unknown>): unknown {
  const font = String(args.font || '').trim();
  const mode = String(args.mode || 'both').toLowerCase();
  const count = Number(args.count) || 5;

  if (!font) {
    return { error: 'font parameter is required. Pass a font family name (e.g. "Playfair Display").' };
  }

  // Check if the requested font is used in any known pairing
  const allPairings = Object.values(FONT_PAIRINGS);
  const fontLower = font.toLowerCase();

  // Find pairings where this font is used as heading or body
  const asHeading = allPairings.filter(fp => fp.heading_font.toLowerCase() === fontLower);
  const asBody = allPairings.filter(fp => fp.body_font.toLowerCase() === fontLower);
  const inPairing = [...asHeading, ...asBody];

  // Build similar suggestions (same mood family)
  const similar: Array<{
    font: string;
    role: string;
    pairing_name: string;
    mood_tags: string[];
    weight: number;
  }> = [];

  // Build contrasting suggestions (cross-role partners from known pairings)
  const contrasting: Array<{
    font: string;
    role: string;
    pairing_name: string;
    mood_tags: string[];
    weight: number;
    note: string;
  }> = [];

  // Direct partners: if the font appears in a pairing, suggest its partner
  for (const fp of asHeading) {
    contrasting.push({
      font: fp.body_font,
      role: 'body',
      pairing_name: fp.name,
      mood_tags: fp.mood_tags,
      weight: fp.recommended_body_weight,
      note: `Proven pair: ${fp.heading_font} (heading) + ${fp.body_font} (body)`,
    });
  }
  for (const fp of asBody) {
    contrasting.push({
      font: fp.heading_font,
      role: 'heading',
      pairing_name: fp.name,
      mood_tags: fp.mood_tags,
      weight: fp.recommended_heading_weight,
      note: `Proven pair: ${fp.heading_font} (heading) + ${fp.body_font} (body)`,
    });
  }

  // Similar: fonts from pairings with overlapping mood tags
  if (inPairing.length > 0) {
    const sourceMoods = new Set(inPairing.flatMap(fp => fp.mood_tags));
    for (const fp of allPairings) {
      if (inPairing.includes(fp)) continue;
      const overlap = fp.mood_tags.filter(t => sourceMoods.has(t)).length;
      if (overlap > 0) {
        // Add heading font if different from source
        if (fp.heading_font.toLowerCase() !== fontLower) {
          similar.push({
            font: fp.heading_font,
            role: 'heading',
            pairing_name: fp.name,
            mood_tags: fp.mood_tags,
            weight: fp.recommended_heading_weight,
          });
        }
        // Add body font if different from source
        if (fp.body_font.toLowerCase() !== fontLower) {
          similar.push({
            font: fp.body_font,
            role: 'body',
            pairing_name: fp.name,
            mood_tags: fp.mood_tags,
            weight: fp.recommended_body_weight,
          });
        }
      }
    }
  } else {
    // Font not found in pairings — suggest all unique fonts as alternatives
    const seen = new Set<string>();
    for (const fp of allPairings) {
      if (!seen.has(fp.heading_font)) {
        similar.push({
          font: fp.heading_font,
          role: 'heading',
          pairing_name: fp.name,
          mood_tags: fp.mood_tags,
          weight: fp.recommended_heading_weight,
        });
        seen.add(fp.heading_font);
      }
      if (!seen.has(fp.body_font)) {
        similar.push({
          font: fp.body_font,
          role: 'body',
          pairing_name: fp.name,
          mood_tags: fp.mood_tags,
          weight: fp.recommended_body_weight,
        });
        seen.add(fp.body_font);
      }
    }
  }

  // Deduplicate by font name
  const dedup = <T extends { font: string }>(arr: T[]): T[] => {
    const seen = new Set<string>();
    return arr.filter(item => {
      if (seen.has(item.font)) return false;
      seen.add(item.font);
      return true;
    });
  };

  const result: Record<string, unknown> = {
    source_font: font,
    found_in_pairings: inPairing.length > 0,
  };

  if (mode === 'similar' || mode === 'both') {
    result.similar = dedup(similar).slice(0, count);
  }
  if (mode === 'contrast' || mode === 'both') {
    result.contrasting = dedup(contrasting).slice(0, count);
  }

  if (inPairing.length === 0) {
    result.note = `"${font}" was not found in the bundled font pairing database. Showing all available fonts as suggestions. For ML-based pairing with 802 Google Fonts, use the MCP server's suggest_font_pairing tool.`;
  }

  return result;
}

// ── generate_accessible_palette — WCAG-compliant palette via pure math ──

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Attempt to adjust a color to meet a target contrast ratio against a background.
 * Lightens or darkens the color in steps until the ratio is met.
 */
function adjustForContrast(baseHex: string, bgHex: string, targetRatio: number): string {
  const bgLum = relativeLuminance(bgHex);
  const baseLum = relativeLuminance(baseHex);
  const base = hexToRgb(baseHex);

  // Determine direction: lighten if bg is dark, darken if bg is light
  const shouldLighten = bgLum < 0.5;

  for (let step = 0; step <= 100; step++) {
    const factor = step / 100;
    let r: number, g: number, b: number;
    if (shouldLighten) {
      // Lerp toward white
      r = base.r + (255 - base.r) * factor;
      g = base.g + (255 - base.g) * factor;
      b = base.b + (255 - base.b) * factor;
    } else {
      // Lerp toward black
      r = base.r * (1 - factor);
      g = base.g * (1 - factor);
      b = base.b * (1 - factor);
    }
    const candidate = rgbToHex(r, g, b);
    if (contrastRatio(candidate, bgHex) >= targetRatio) {
      return candidate;
    }
  }

  // Fallback: return white or black
  return shouldLighten ? '#FFFFFF' : '#000000';
}

/**
 * Generate a tinted neutral by desaturating the base color.
 */
function tintedNeutral(baseHex: string, bgHex: string, targetRatio: number, saturation: number): string {
  const base = hexToRgb(baseHex);
  const gray = Math.round(base.r * 0.299 + base.g * 0.587 + base.b * 0.114);
  // Blend toward gray by (1 - saturation)
  const r = base.r * saturation + gray * (1 - saturation);
  const g = base.g * saturation + gray * (1 - saturation);
  const b = base.b * saturation + gray * (1 - saturation);
  const desaturated = rgbToHex(r, g, b);
  return adjustForContrast(desaturated, bgHex, targetRatio);
}

function generateAccessiblePalette(args: Record<string, unknown>): unknown {
  const baseColor = String(args.base_color || '#2680EB');
  const bgLight = '#FFFFFF';
  const bgDark = '#141414';
  const mode = String(args.mode || 'both').toLowerCase();
  const userBg = args.background ? String(args.background) : null;

  const result: Record<string, unknown> = {
    base_color: baseColor,
    contrast_method: 'WCAG 2.1 relative luminance (pure math)',
    wcag_guaranteed: true,
  };

  if (mode === 'light' || mode === 'both') {
    const bg = userBg || bgLight;
    result.light = {
      background: bg,
      'brand-subtle': adjustForContrast(baseColor, bg, 1.25),
      'brand-muted': adjustForContrast(baseColor, bg, 2),
      'brand-default': adjustForContrast(baseColor, bg, 4.5),
      'brand-emphasis': adjustForContrast(baseColor, bg, 7),
      'brand-strong': adjustForContrast(baseColor, bg, 10),
      'neutral-border': tintedNeutral(baseColor, bg, 2, 0.1),
      'neutral-muted': tintedNeutral(baseColor, bg, 3, 0.1),
      'neutral-text': tintedNeutral(baseColor, bg, 4.5, 0.1),
      'neutral-heading': tintedNeutral(baseColor, bg, 7, 0.1),
      'neutral-strong': tintedNeutral(baseColor, bg, 11, 0.1),
    };
  }

  if (mode === 'dark' || mode === 'both') {
    const bg = userBg || bgDark;
    result.dark = {
      background: bg,
      'brand-subtle': adjustForContrast(baseColor, bg, 1.25),
      'brand-muted': adjustForContrast(baseColor, bg, 2),
      'brand-default': adjustForContrast(baseColor, bg, 4.5),
      'brand-emphasis': adjustForContrast(baseColor, bg, 7),
      'brand-strong': adjustForContrast(baseColor, bg, 10),
      'neutral-border': tintedNeutral(baseColor, bg, 2, 0.1),
      'neutral-muted': tintedNeutral(baseColor, bg, 3, 0.1),
      'neutral-text': tintedNeutral(baseColor, bg, 4.5, 0.1),
      'neutral-heading': tintedNeutral(baseColor, bg, 7, 0.1),
      'neutral-strong': tintedNeutral(baseColor, bg, 11, 0.1),
    };
  }

  return result;
}

/** Dispatcher for the consolidated get_design_guidance tool (TC-1). */
function designGuidanceDispatcher(args: Record<string, unknown>): unknown {
  const aspect = String(args.aspect || '').toLowerCase();
  switch (aspect) {
    case 'color': return lookupPalette(args);
    case 'font': case 'typography': return lookupFonts(args);
    case 'size': return lookupSize(args);
    case 'layout': return lookupBlueprint(args);
    case 'contrast': return contrastCheck(args);
    default:
      return { error: `Unknown aspect "${aspect}". Use: color | font | size | layout | contrast` };
  }
}

export const LOCAL_TOOL_HANDLERS: Record<string, (args: Record<string, unknown>) => unknown> = {
  get_design_guidance: designGuidanceDispatcher,
  // Backward compat — old names still callable until TC-3 removes them
  get_layout_blueprint: lookupBlueprint,
  get_color_palette: lookupPalette,
  get_font_pairing: lookupFonts,
  get_size_preset: lookupSize,
  get_contrast_check: contrastCheck,
  get_design_rules: lookupDesignRules,
  get_design_intelligence: getDesignIntelligence,
  suggest_font_pairing: suggestFontPairing,
  generate_accessible_palette: generateAccessiblePalette,
};
