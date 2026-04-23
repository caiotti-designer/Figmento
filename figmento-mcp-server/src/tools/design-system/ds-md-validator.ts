// ═══════════════════════════════════════════════════════════
// DESIGN.md Validator — shared module for DMD-2 + DMD-3
// Consumed by: import_design_system_from_md (pre-write check)
//              validate_design_md (standalone MCP tool)
// See: docs/architecture/DESIGN-MD-SPEC.md §10 + DMD-3 story Dev Notes
// ═══════════════════════════════════════════════════════════

import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as nodePath from 'path';
import type {
  DesignMdIR,
  ValidationReport,
  ValidationIssue,
  Severity,
} from './ds-md-types';
import { hexToRgb, rgbToHsl } from '../utils/color';

// ─── Shared Ajv instance (compiled once) ─────────────────────────────

let cachedValidator: ReturnType<InstanceType<typeof Ajv>['compile']> | null = null;

function getValidator() {
  if (cachedValidator) return cachedValidator;
  // Schema lives at figmento-mcp-server/schemas/design-md.schema.json
  const schemaPath = nodePath.resolve(__dirname, '..', '..', '..', 'schemas', 'design-md.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ajv = new (Ajv as any)({ strict: true, allErrors: true });
  addFormats(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator!;
}

// ─── Color utilities ─────────────────────────────────────────────────

function isValidCssColor(value: string): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v === 'none' || v === 'transparent') return true;
  // 6- or 8-digit hex
  if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) return true;
  // rgb() / rgba()
  if (/^rgba?\(\s*\d+(\s*,\s*\d+){2}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/.test(v)) return true;
  // hsl() / hsla()
  if (/^hsla?\(\s*\d+(\.\d+)?\s*,\s*\d+%\s*,\s*\d+%(\s*,\s*(0|1|0?\.\d+))?\s*\)$/.test(v)) return true;
  // CSS keyword colors — skip structural validation, accept as-is
  if (/^[a-zA-Z]+$/.test(v)) return true;
  return false;
}

/**
 * Approximate relative luminance for WCAG contrast ratio.
 * Works on #RRGGBB hex; rgba()/hsla() are skipped by callers (too much
 * parsing for v1; DMD-3 surfaces a LOW note when the color can't be analyzed).
 */
function relativeLuminance(hex: string): number | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(fg: string, bg: string): number | null {
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  if (lFg === null || lBg === null) return null;
  const [lighter, darker] = lFg > lBg ? [lFg, lBg] : [lBg, lFg];
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Bundled font allowlist (fallback when Figma not connected) ─────

const KNOWN_FONTS = new Set([
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Montserrat',
  'Source Sans Pro', 'Raleway', 'PT Sans', 'Nunito', 'DM Sans', 'Work Sans',
  'Plus Jakarta Sans', 'Figtree', 'Sora', 'Outfit',
  'Geist', 'Geist Mono', 'Space Grotesk', 'Space Mono',
  'SF Pro Display', 'SF Pro Text', 'SF Mono', 'SF Pro',
  'Helvetica', 'Helvetica Neue', 'Arial',
  'Georgia', 'Times New Roman', 'Playfair Display', 'Merriweather',
  'Cormorant Garamond', 'EB Garamond', 'Libre Baskerville', 'Lora',
  'Source Serif 4', 'Source Serif Pro',
  'JetBrains Mono', 'Fira Code', 'Roboto Mono', 'IBM Plex Mono', 'DM Mono',
  // Custom / brand faces that appear in seeded systems — accepted without warning
  'NotionInter', 'sohne-var', 'SourceCodePro', 'figmaSans', 'figmaMono',
  'Berkeley Mono', 'Inter Variable', 'Anthropic Serif', 'Anthropic Sans', 'Anthropic Mono',
  'system-ui', '-apple-system', 'monospace', 'sans-serif', 'serif',
]);

function isKnownFont(family: string): boolean {
  // Take the first family name from a comma-separated fallback chain
  const first = family.split(',')[0].trim().replace(/^["']|["']$/g, '');
  return KNOWN_FONTS.has(first);
}

// ─── Main entry point ────────────────────────────────────────────────

/**
 * Validates a parsed DESIGN.md IR against the JSON Schema + semantic rules.
 *
 * Verdict mapping (authoritative — shared with DMD-2):
 *  - Any CRITICAL issue → FAIL
 *  - Any HIGH or MEDIUM issue (no CRITICAL) → CONCERNS
 *  - Only LOW issues or no issues → PASS
 *
 * Semantic rules:
 *  - Hex validity (invalid → HIGH)
 *  - WCAG contrast on on_primary/primary and on_surface/surface (< 4.5:1 → HIGH)
 *  - 8px-grid snap on spacing values (not multiple of 4 → MEDIUM)
 *  - Font availability (unknown family → LOW)
 *  - Missing BOTH color AND typography sections → CRITICAL
 *  - Missing frontmatter name/created → LOW (caller applies defaults)
 *  - Missing individual sections → MEDIUM (actionable nudges)
 */
export function validateDesignMdIR(ir: DesignMdIR): ValidationReport {
  const issues: ValidationIssue[] = [];

  // ─── Structural validation via ajv ─────────────────────────────────
  try {
    const validate = getValidator();
    const ok = validate(ir);
    if (!ok && validate.errors) {
      for (const err of validate.errors as ErrorObject[]) {
        issues.push({
          severity: 'CRITICAL',
          category: 'schema',
          message: `Schema error at ${err.instancePath || '(root)'}: ${err.message}`,
          suggestion: err.params ? `Params: ${JSON.stringify(err.params)}` : undefined,
        });
      }
    }
  } catch (err) {
    issues.push({
      severity: 'CRITICAL',
      category: 'structure',
      message: `Validator failed to compile or run: ${(err as Error).message}`,
    });
    return { verdict: 'FAIL', issues };
  }

  // ─── Semantic rule: missing BOTH color + typography sections ───────
  const hasColors = Boolean(ir.sections?.color_palette_roles?.color && Object.keys(ir.sections.color_palette_roles.color).length > 0);
  const hasTypography = Boolean(ir.sections?.typography_rules?.font_family);
  if (!hasColors && !hasTypography) {
    issues.push({
      severity: 'CRITICAL',
      category: 'structure',
      message: "DESIGN.md must contain at least one of '## Color Palette & Roles' or '## Typography Rules' to be usable",
      suggestion: 'Add a ```color fenced block to ## Color Palette & Roles, or a ```font-family block to ## Typography Rules.',
    });
  }

  // ─── Frontmatter default notes ─────────────────────────────────────
  if (!ir.frontmatter?.name) {
    issues.push({
      severity: 'LOW',
      category: 'structure',
      message: 'Frontmatter `name` missing — importer will infer from filename',
      suggestion: 'Add `name: <kebab-case-name>` to the YAML frontmatter.',
    });
  }
  if (!ir.frontmatter?.created) {
    issues.push({
      severity: 'LOW',
      category: 'structure',
      message: 'Frontmatter `created` missing — importer will use current timestamp',
      suggestion: 'Add `created: "2026-MM-DDTHH:mm:ss.sssZ"` (ISO 8601, quoted) to the YAML frontmatter.',
    });
  }

  // ─── Color validation ──────────────────────────────────────────────
  const colors = ir.sections?.color_palette_roles?.color;
  if (colors && typeof colors === 'object') {
    for (const [key, value] of Object.entries(colors)) {
      if (typeof value !== 'string') continue;
      if (!isValidCssColor(value)) {
        issues.push({
          severity: 'HIGH',
          category: 'hex',
          message: `Color \`${key}: "${value}"\` is not a recognized CSS color`,
          suggestion: 'Use #RRGGBB, #RRGGBBAA, rgb()/rgba(), or hsl()/hsla().',
        });
      }
    }

    // WCAG contrast checks
    if (colors.on_primary && colors.primary) {
      const ratio = contrastRatio(colors.on_primary, colors.primary);
      if (ratio !== null && ratio < 4.5) {
        issues.push({
          severity: 'HIGH',
          category: 'contrast',
          message: `Contrast on_primary/primary ≈ ${ratio.toFixed(2)}:1 (WCAG AA requires ≥ 4.5:1 for normal text)`,
          suggestion: 'Choose a darker or lighter on_primary color to meet WCAG AA.',
        });
      }
    }
    if (colors.on_surface && colors.surface) {
      const ratio = contrastRatio(colors.on_surface, colors.surface);
      if (ratio !== null && ratio < 4.5) {
        issues.push({
          severity: 'HIGH',
          category: 'contrast',
          message: `Contrast on_surface/surface ≈ ${ratio.toFixed(2)}:1 (WCAG AA requires ≥ 4.5:1 for normal text)`,
          suggestion: 'Choose a darker or lighter on_surface color to meet WCAG AA.',
        });
      }
    }
  } else {
    issues.push({
      severity: 'MEDIUM',
      category: 'structure',
      message: 'No `color` fenced block found in ## Color Palette & Roles',
      suggestion: 'Add a ```color block with at least the 15 canonical keys (primary, on_surface, background, ...)',
    });
  }

  // ─── Spacing grid-snap (soft check, MEDIUM) ─────────────────────────
  const spacing = ir.sections?.layout_principles?.spacing;
  if (spacing) {
    const unit = spacing.unit || 8;
    for (const [key, value] of Object.entries(spacing)) {
      if (key === 'unit' || typeof value !== 'number') continue;
      // We check against half the unit (4 for the 8-grid) to allow xs = 4 on an 8-grid
      if (value > 0 && value % (unit / 2) !== 0) {
        issues.push({
          severity: 'MEDIUM',
          category: 'grid',
          message: `spacing.${key} = ${value} is off-grid (unit: ${unit}, expected multiples of ${unit / 2})`,
          suggestion: `Snap to ${Math.round(value / (unit / 2)) * (unit / 2)} or adjust spacing.unit.`,
        });
      }
    }
  }

  // ─── Font availability ─────────────────────────────────────────────
  const fontFamily = ir.sections?.typography_rules?.font_family;
  if (fontFamily) {
    for (const role of ['heading', 'body', 'mono'] as const) {
      const entry = fontFamily[role];
      if (!entry || !entry.family) continue;
      if (!isKnownFont(entry.family)) {
        issues.push({
          severity: 'LOW',
          category: 'font',
          message: `Unknown font family \`${entry.family}\` for ${role} — will rely on fallback chain`,
          suggestion: entry.fallback ? `Fallback chain provided: "${entry.fallback}"` : `Add a \`fallback\` field listing widely-available fonts.`,
        });
      }
    }
  } else if (ir.sections?.typography_rules) {
    issues.push({
      severity: 'MEDIUM',
      category: 'structure',
      message: 'No `font-family` fenced block in ## Typography Rules',
      suggestion: 'Add a ```font-family block with heading + body roles.',
    });
  }

  // ─── Verdict mapping ───────────────────────────────────────────────
  const hasCritical = issues.some((i) => i.severity === 'CRITICAL');
  const hasHighOrMedium = issues.some((i) => i.severity === 'HIGH' || i.severity === 'MEDIUM');
  const verdict: Severity extends never ? never : 'PASS' | 'CONCERNS' | 'FAIL' =
    hasCritical ? 'FAIL' : hasHighOrMedium ? 'CONCERNS' : 'PASS';

  return { verdict, issues };
}
