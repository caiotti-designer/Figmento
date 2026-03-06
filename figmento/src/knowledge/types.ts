/**
 * TypeScript interfaces for compiled knowledge data.
 * These types match the compressed structures output by scripts/compile-knowledge.ts.
 * DO NOT edit compiled-knowledge.ts directly — it is auto-generated.
 */

// --- Color System ---

export interface Palette {
  id: string;
  name: string;
  mood_tags: string[];
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    muted: string;
  };
}

// --- Typography ---

export interface FontPairing {
  id: string;
  name: string;
  heading_font: string;
  body_font: string;
  mood_tags: string[];
  recommended_heading_weight: number;
  recommended_body_weight: number;
}

export interface TypeScale {
  name: string;
  ratio: number;
  sizes: Record<string, number>;
}

// --- Size Presets ---

export interface SizePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  aspect: string;
  notes?: string;
}

// --- Layout Blueprints (compressed) ---

export interface BlueprintElement {
  role: string;
  type: string;
}

export interface BlueprintZone {
  name: string;
  y_start_pct: number;
  y_end_pct: number;
  elements: BlueprintElement[];
  typography_hierarchy?: Record<string, string>;
  positioning?: string;
}

export interface Blueprint {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  mood: string[];
  zones: BlueprintZone[];
  anti_generic: string[];
  memorable_element?: string;
  whitespace_ratio?: number;
}

// --- Pattern Recipes (compressed) ---

export interface PatternRecipe {
  description: string;
  props: Record<string, { type: string; required: boolean; default?: unknown }>;
  recipe: Record<string, unknown>;
  format_adaptations?: Record<string, unknown>;
}

// --- Composition Rules ---

export interface CompositionRules {
  alternating_backgrounds: {
    rule: string;
    exception: string;
  };
  pattern_fill_defaults: Record<string, string>;
  vertical_rhythm: {
    section_gap: number;
    layout_direction: string;
    rule: string;
  };
  color_continuity: {
    rules: string[];
  };
  section_transitions: Record<string, string>;
}

// --- Refinement Checks ---

export interface RefinementCheck {
  id: string;
  rule: string;
  check: string;
  applies_to: string[];
  category: string;
}

// --- Top-Level Compiled Knowledge ---

export interface CompiledKnowledge {
  PALETTES: Record<string, Palette>;
  FONT_PAIRINGS: Record<string, FontPairing>;
  TYPE_SCALES: Record<string, TypeScale>;
  SIZE_PRESETS: Record<string, SizePreset>;
  BLUEPRINTS: Blueprint[];
  PATTERNS: Record<string, PatternRecipe>;
  COMPOSITION_RULES: CompositionRules;
  REFINEMENT_CHECKS: RefinementCheck[];
  KNOWLEDGE_VERSION: string;
}
