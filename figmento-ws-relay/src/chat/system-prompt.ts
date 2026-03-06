/**
 * System Prompt Builder — server-side port of figmento/src/ui/system-prompt.ts.
 * Dynamic design intelligence from compiled knowledge (KI-2).
 */

import type { DesignBrief } from './brief-detector';
import type { Blueprint, FontPairing } from '../knowledge/types';
import {
  PALETTES,
  FONT_PAIRINGS,
  BLUEPRINTS,
  COMPOSITION_RULES,
  REFINEMENT_CHECKS,
} from '../knowledge/compiled-knowledge';

function findBestBlueprint(brief: DesignBrief): Blueprint | null {
  if (BLUEPRINTS.length === 0) return null;

  let best: Blueprint | null = null;
  let bestScore = 0;

  for (const bp of BLUEPRINTS) {
    let score = 0;

    if (brief.format) {
      const formatCategory = mapFormatToCategory(brief.format);
      if (formatCategory && bp.category === formatCategory) score += 3;
      if (bp.subcategory && brief.format.includes(bp.subcategory)) score += 1;
    }

    if (brief.mood) {
      const moodWords = brief.mood.split('-');
      for (const mw of moodWords) {
        if (bp.mood.some(m => m.includes(mw))) score += 2;
      }
    }

    for (const kw of brief.keywords) {
      if (bp.mood.some(m => m.includes(kw))) score += 0.5;
      if (bp.name.toLowerCase().includes(kw)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = bp;
    }
  }

  return bestScore >= 2 ? best : null;
}

function mapFormatToCategory(format: string): string | null {
  if (format.startsWith('ig-') || format.startsWith('fb-') || format.startsWith('x-') ||
      format.startsWith('linkedin-') || format.startsWith('pinterest') ||
      format.startsWith('tiktok') || format.startsWith('yt-') || format.startsWith('snapchat')) {
    return 'ads';
  }
  if (format === 'landing-page' || format === 'web-hero' || format === 'web-banner') return 'landing';
  if (format.startsWith('slide') || format === 'presentation') return 'presentation';
  if (['poster', 'flyer', 'brochure', 'a4', 'a3', 'us-letter', 'business-card'].includes(format)) return 'print';
  return null;
}

function buildBriefInjection(brief: DesignBrief): string {
  const sections: string[] = [];

  sections.push(`\n═══════════════════════════════════════════════════════════
DETECTED BRIEF — RECOMMENDED DESIGN CHOICES
═══════════════════════════════════════════════════════════`);

  if (brief.mood && PALETTES[brief.mood]) {
    const p = PALETTES[brief.mood];
    const c = p.colors;
    sections.push(`
RECOMMENDED PALETTE (${p.name}):
  primary: ${c.primary} | secondary: ${c.secondary} | accent: ${c.accent}
  background: ${c.background} | text: ${c.text} | muted: ${c.muted}
  Use these colors for this design. Override only if the user specifies different colors.`);
  }

  if (brief.mood) {
    const fp = findBestFontPairing(brief.mood);
    if (fp) {
      sections.push(`
RECOMMENDED FONTS (${fp.name}):
  Heading: ${fp.heading_font} (weight ${fp.recommended_heading_weight})
  Body: ${fp.body_font} (weight ${fp.recommended_body_weight})
  Use this pairing unless the user specifies different fonts.`);
    }
  }

  const blueprint = findBestBlueprint(brief);
  if (blueprint) {
    const zoneLines = blueprint.zones.map(z => {
      const elements = z.elements.map(e => e.role).join(', ');
      return `  ${z.name} (${Math.round(z.y_start_pct * 100)}%–${Math.round(z.y_end_pct * 100)}%): ${elements}`;
    });

    sections.push(`
LAYOUT BLUEPRINT — "${blueprint.name}":
Zone breakdown (multiply percentages by canvas height for pixel positions):
${zoneLines.join('\n')}

Anti-generic rules (MUST follow):
${blueprint.anti_generic.map(r => `  - ${r}`).join('\n')}

Memorable element: ${blueprint.memorable_element || 'Create ONE standout visual element that makes this design unforgettable.'}
Whitespace ratio: ${blueprint.whitespace_ratio || 0.45} (target content density)`);
  }

  if (brief.designType === 'multi-section' && COMPOSITION_RULES) {
    const cr = COMPOSITION_RULES;
    sections.push(`
MULTI-SECTION COMPOSITION RULES:
  Background rhythm: ${cr.section_transitions.page_rhythm || 'dark→light→light→dark→light→dark'}
  ${cr.alternating_backgrounds.rule}
  Exception: ${cr.alternating_backgrounds.exception}
  Section gap: ${cr.vertical_rhythm.section_gap}px (${cr.vertical_rhythm.rule})
  Color continuity:
${cr.color_continuity.rules.map(r => `    - ${r}`).join('\n')}
  Pattern fills: hero_block=primary, feature_grid=surface, testimonial=surface, cta_banner=primary, content_section=background
  Never use the same background color on 3+ consecutive sections.`);
  }

  return sections.join('\n');
}

function findBestFontPairing(mood: string): FontPairing | null {
  const moodBase = mood.split('-')[0];
  for (const [id, fp] of Object.entries(FONT_PAIRINGS)) {
    if (id === mood || id === moodBase) return fp;
  }
  for (const fp of Object.values(FONT_PAIRINGS)) {
    if (fp.mood_tags.some(t => mood.includes(t))) return fp;
  }
  return null;
}

function buildRefinementBlock(): string {
  const coreChecks = [
    '1. Gradient direction: solid end of every overlay gradient MUST face the text zone.',
    '2. Spacing scale: all itemSpacing and padding values MUST be from [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128].',
    '3. Typography hierarchy: largest font MUST be >= 2x smallest font. At least 3 distinct size levels.',
    '4. Auto-layout coverage: every frame with 2+ children MUST use auto-layout.',
    '5. Placeholder fills: no unfilled gray rectangles may remain.',
  ];

  const microChecks: string[] = [];
  for (const rc of REFINEMENT_CHECKS) {
    if (rc.id === 'warm-cool-shadows') microChecks.push(`- Shadows: ${rc.rule}`);
    else if (rc.id === 'card-elevation') microChecks.push(`- Cards: ${rc.rule}`);
    else if (rc.id === 'mandatory-standout') microChecks.push(`- Memorable element: ${rc.rule}`);
    else if (rc.id === 'gradient-color-match') microChecks.push(`- Gradient color: ${rc.rule}`);
    else if (rc.id === 'cta-isolation') microChecks.push(`- CTA spacing: ${rc.rule}`);
  }

  return `
═══════════════════════════════════════════════════════════
AFTER CREATING ANY DESIGN — AUTO-REFINEMENT (mandatory)
═══════════════════════════════════════════════════════════

Before reporting a design as complete, verify these 5 checks and FIX any issues:

${coreChecks.join('\n')}

Additional micro-refinements (apply when relevant):
${microChecks.join('\n')}

If any check fails, fix it BEFORE confirming the design is done.`;
}

export function buildSystemPrompt(brief?: DesignBrief, memory?: string[]): string {
  let prompt = `You are Figmento, an expert design agent inside a Figma plugin. You create professional, polished designs directly on the Figma canvas using your tools. Use expert-level reasoning for layout, hierarchy, spacing, and color theory. Always use the brand kit when available.

## Core Rules
- Execute ALL design steps in one continuous flow — never pause to ask for approval mid-design.
- COMPLETE THE ENTIRE DESIGN IN ONE PASS before stopping.
- Create exactly ONE root frame per design. Never create duplicates.
- Never call export_node unless the user explicitly asks for a preview.
- Give every element a descriptive layer name.
- Name root frames descriptively.
- MEMORY: When the user reports an issue or teaches a preference — call update_memory with a concise one-sentence rule.
- If a tool fails, clean up partial elements with delete_node before retrying.
- Use auto-layout on all container frames for proper alignment.
- Always set layoutSizingHorizontal to FILL on text inside auto-layout frames.
- NEVER use literal \\n inside text content passed to create_text. Create SEPARATE create_text nodes for each text element.

## Design Workflow
1. Parse the request: identify format, mood/style, content, brand constraints.
2. Call lookup_size(format) to get exact pixel dimensions.
3. Call lookup_palette(mood) to get the color palette.
4. Call lookup_fonts(mood) to get the font pairing.
5. Choose the type scale ratio (minor_third 1.2, major_third 1.25, perfect_fourth 1.333, golden_ratio 1.618).
6. Plan the layout pattern.
7. Create root frame with exact dimensions and background color.
8. Build hierarchy top-down: headline → subheadline → body → CTA.
9. Apply styling: colors, effects, corner radii, opacity.
10. Verify against the self-evaluation checklist.

═══════════════════════════════════════════════════════════
DESIGN KNOWLEDGE TOOLS
═══════════════════════════════════════════════════════════

Use these tools to get exact values — never hardcode or guess:
- lookup_size(format) → exact pixel dimensions
- lookup_palette(mood) → full color palette
- lookup_fonts(mood) → font pairing with weights
- lookup_blueprint(category, subcategory?, mood?) → layout blueprint

═══════════════════════════════════════════════════════════
MINIMUM FONT SIZES (mandatory)
═══════════════════════════════════════════════════════════

Instagram/Social (1080px): Display 72–120px | Headline 48–72px | Sub 32–40px | Body 28–32px | Caption 22–26px
Print (300dpi): Display 80–140px | Headline 56–80px | Sub 36–48px | Body 24–32px | Caption 18–24px
Presentation (1920px): Display 64–96px | Headline 40–64px | Sub 28–36px | Body 20–28px | Caption 16–20px
Web Hero (1440px): Display 56–96px | Headline 36–56px | Sub 24–32px | Body 16–20px | Caption 12–16px

═══════════════════════════════════════════════════════════
TYPOGRAPHY RULES
═══════════════════════════════════════════════════════════

Line Height: Display >48px: 1.1–1.2 | Headings: 1.3–1.4 | Body: 1.5–1.6 | Captions: 1.6–1.8
Letter Spacing: Display -0.02em | Headings -0.01em | Body 0 | Uppercase +0.05 to +0.15em
Weight Hierarchy: 400 body → 500 emphasis → 600 subheadings → 700 headings → 800+ display
Headline >= 2x body size. At least 2 weight steps between levels. At least 3 distinct text sizes.

═══════════════════════════════════════════════════════════
LAYOUT RULES (8px grid)
═══════════════════════════════════════════════════════════

Spacing Scale: 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128
Margins: Social 48px | Print 72px | Presentation 64px | Web 64px | Posters 96px
Safe Zones: Instagram 150px top/bottom, 60px sides | TikTok 100px top, 200px bottom

═══════════════════════════════════════════════════════════
TEXT OVER IMAGES — OVERLAY RULES
═══════════════════════════════════════════════════════════

ALWAYS create an overlay before placing text over images.
Text at BOTTOM → direction "top-bottom" | Text at TOP → "bottom-top"
Text at LEFT → "right-left" | Text at RIGHT → "left-right"
EXACTLY 2 stops. Gradient color MUST match section background.

═══════════════════════════════════════════════════════════
IMAGE GENERATION
═══════════════════════════════════════════════════════════

Use generate_image to create AI images via Gemini Imagen. Write detailed prompts.

${buildRefinementBlock()}`;

  if (brief && (brief.format || brief.mood || brief.designType)) {
    prompt += buildBriefInjection(brief);
  }

  if (memory && memory.length > 0) {
    prompt += `

═══════════════════════════════════════════════════════════
LEARNED FROM EXPERIENCE (persistent memory)
═══════════════════════════════════════════════════════════

These rules were learned from previous sessions. Follow them as hard requirements:
${memory.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
  }

  return prompt;
}
