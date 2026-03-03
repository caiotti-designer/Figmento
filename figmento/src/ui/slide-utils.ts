/**
 * slide-utils.ts — Shared utilities for per-slide tool-use loop modes.
 * Used by: presentation.ts (FC-5), text-layout.ts carousel path (FC-6).
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SlideDesignSystem {
  backgroundColor: string;
  accentColor: string;
  fontFamily: string;
}

export type ToolCallLogEntry = {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
};

// ═══════════════════════════════════════════════════════════════
// DESIGN SYSTEM EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extracts a design system summary from slide 1's tool call log.
 * Falls back to safe defaults if the AI returned transparent/undefined values.
 *
 * Guards:
 * - backgroundColor: rejects "transparent", empty, non-#-prefixed
 * - accentColor: rejects near-grey (R≈G≈B within 30), black, white
 * - fontFamily: rejects "undefined" and empty
 */
export function extractDesignSystem(toolCallLog: ToolCallLogEntry[]): SlideDesignSystem {
  const FALLBACK: SlideDesignSystem = {
    backgroundColor: '#FFFFFF',
    accentColor: '#000000',
    fontFamily: 'Inter',
  };

  let backgroundColor = '';
  let accentColor = '';
  let fontFamily = '';

  for (const entry of toolCallLog) {
    // First create_frame → grab fillColor as background
    if (!backgroundColor && entry.name === 'create_frame') {
      const fill = (entry.args.fillColor as string) || '';
      if (fill && fill !== 'transparent' && fill.startsWith('#')) {
        backgroundColor = fill;
      }
    }

    // First create_text → grab fontFamily
    if (!fontFamily && entry.name === 'create_text') {
      const ff = (entry.args.fontFamily as string) || '';
      if (ff && ff !== 'undefined') {
        fontFamily = ff;
      }
    }

    // set_fill calls → look for non-neutral accent (not white/black/grey)
    if (!accentColor && entry.name === 'set_fill') {
      const color = (entry.args.color as string) || '';
      if (
        color &&
        color.startsWith('#') &&
        color !== '#000000' &&
        color !== '#FFFFFF' &&
        color !== '#ffffff' &&
        color !== '#000'
      ) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        // Skip near-grey colors (r≈g≈b within 30)
        const isGrey = Math.max(r, g, b) - Math.min(r, g, b) < 30;
        if (!isGrey) {
          accentColor = color;
        }
      }
    }
  }

  return {
    backgroundColor: backgroundColor || FALLBACK.backgroundColor,
    accentColor: accentColor || FALLBACK.accentColor,
    fontFamily: fontFamily || FALLBACK.fontFamily,
  };
}

// ═══════════════════════════════════════════════════════════════
// CONSISTENCY INJECTION HELPER
// ═══════════════════════════════════════════════════════════════

/**
 * Formats the designSystem as a consistency constraint string for slides 2+.
 * Only includes fields that differ from the fallback defaults.
 * Returns null if nothing meaningful to inject.
 */
export function formatConsistencyConstraint(ds: SlideDesignSystem): string | null {
  const parts: string[] = [];
  if (ds.backgroundColor && ds.backgroundColor !== '#FFFFFF') {
    parts.push(`background color: ${ds.backgroundColor}`);
  }
  if (ds.accentColor && ds.accentColor !== '#000000') {
    parts.push(`accent color: ${ds.accentColor}`);
  }
  if (ds.fontFamily && ds.fontFamily !== 'Inter') {
    parts.push(`font: ${ds.fontFamily}`);
  }
  if (parts.length === 0) return null;
  return parts.join(', ');
}
