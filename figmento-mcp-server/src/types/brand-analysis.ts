/**
 * BrandAnalysis — the Phase A→B contract type.
 *
 * Output of `analyze_brief` (ODS-1b).
 * Input of `generate_design_system_in_figma` (ODS-7), consumed by ODS-4/5/6a.
 *
 * @po note: This interface is the shared contract between Phase A and Phase B.
 * Changes here break ODS-4/5/6a/7. Guard accordingly.
 */

export interface TextStyleSpec {
  size: number;
  weight: number;
  lineHeight: number;     // pixels (size × multiplier), NEVER raw multiplier
  letterSpacing: number;  // pixels
}

export interface BrandAnalysis {
  // Brand identity (from PDF)
  brandName: string;
  industry: string;
  tone: string[];
  targetAudience: string;
  brandValues: string[];

  // Color system (from logo + AI + knowledge)
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    muted: string;
    surface: string;
    error: string;
    success: string;
    scales: {
      primary: Record<string, string>;
      secondary: Record<string, string>;
      accent: Record<string, string>;
    };
    neutrals: Record<string, string>;
  };

  // Typography (from mood → knowledge mapping)
  typography: {
    headingFont: string;
    bodyFont: string;
    headingWeight: number;
    bodyWeight: number;
    typeScale: string;
    styles: {
      display: TextStyleSpec;
      h1: TextStyleSpec;
      h2: TextStyleSpec;
      h3: TextStyleSpec;
      bodyLg: TextStyleSpec;
      body: TextStyleSpec;
      bodySm: TextStyleSpec;
      caption: TextStyleSpec;
    };
  };

  // Spacing & radius
  spacing: {
    base: number;
    scale: number[];
  };
  radius: {
    values: Record<string, number>;
    default: number;
  };

  // Metadata
  source: {
    hasPdf: boolean;
    hasLogo: boolean;
    paletteId: string | null;
    fontPairingId: string | null;
    confidence: number;
  };
}
