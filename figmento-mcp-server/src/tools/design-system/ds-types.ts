// ═══════════════════════════════════════════════════════════
// Design System Type Definitions
// ═══════════════════════════════════════════════════════════

export interface DesignTokens {
  name: string;
  created: string;
  preset_used: string | null;
  mood: string[];
  voice: string | null;
  colors: {
    primary: string;
    primary_light: string;
    primary_dark: string;
    secondary: string;
    accent: string;
    surface: string;
    background: string;
    border: string;
    on_primary: string;
    on_surface: string;
    on_surface_muted: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  typography: {
    heading: { family: string; weights: number[] };
    body: { family: string; weights: number[] };
    scale: {
      display: number;
      h1: number;
      h2: number;
      h3: number;
      body_lg: number;
      body: number;
      body_sm: number;
      caption: number;
    };
  };
  spacing: {
    unit: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    '2xl': number;
    '3xl': number;
  };
  radius: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
  };
  shadows: {
    sm: { x: number; y: number; blur: number; spread: number; color: string; opacity: number };
    md: { x: number; y: number; blur: number; spread: number; color: string; opacity: number };
    lg: { x: number; y: number; blur: number; spread: number; color: string; opacity: number };
  };
  gradients?: {
    enabled: boolean;
    direction: string | null;
    colors: string[] | null;
  };
}

export interface PresetDefaults {
  name: string;
  description: string;
  defaults: {
    primary: string;
    secondary: string;
    accent: string;
    surface?: string;
    background?: string;
    border?: string;
    heading_font: string;
    body_font: string;
    radius: { sm: number; md: number; lg: number };
    shadows: 'none' | 'subtle' | 'pronounced';
    spacing_unit: number;
    style?: string;
  };
}

export interface ComponentPropDef {
  type: string;
  required?: boolean;
  default?: unknown;
  values?: string[];
}

export interface ComponentRecipe {
  description: string;
  props: Record<string, ComponentPropDef>;
  recipe: Record<string, unknown>;
  variants?: Record<string, Record<string, unknown>>;
  size_overrides?: Record<string, Record<string, unknown>>;
}

export interface BatchCommand {
  action: string;
  params: Record<string, unknown>;
  tempId?: string;
}

export interface ExtractedDesignTokens {
  colors: string[];
  fonts: string[];
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
  borderRadius?: number;
  mood: string[];
  fontDetectionMethod: string;
  fontDetectionDetails: Record<string, string>;
  typekitDetected?: string;
  colorConfidence: 'high' | 'medium' | 'low';
}

export interface VisionExtraction {
  heading_font: string | null;
  body_font: string | null;
  border_radius: number;
  has_gradients: boolean;
  gradient_direction: string | null;
  gradient_colors: string[] | null;
  shadow_style: 'none' | 'subtle' | 'medium' | 'pronounced';
  card_style: 'flat' | 'bordered' | 'elevated' | 'ghost';
  button_style: 'filled' | 'outlined' | 'ghost' | 'pill';
  spacing_density: 'compact' | 'normal' | 'spacious';
  overall_mood: string[];
  design_personality: string;
  confidence: Record<string, number>;
}

export interface HybridMergeResult {
  heading_font?: string;
  body_font?: string;
  border_radius?: number;
  shadow_style?: 'none' | 'subtle' | 'medium' | 'pronounced';
  spacing_density?: 'compact' | 'normal' | 'spacious';
  has_gradients: boolean;
  gradient_direction?: string | null;
  gradient_colors?: string[] | null;
  mood: string[];
  voice: string | null;
  extraction_method: 'hybrid' | 'css_only' | 'vision_only';
  css_extracted: { colors: string[]; fonts: string[] };
  vision_extracted: Record<string, unknown> | null;
  confidence: Record<string, number>;
  tokens_generated: number;
}

export interface FormatSizeVariant {
  id: string;
  width: number;
  height: number;
  aspect_ratio?: string;
  description?: string;
}

export interface FormatListEntry {
  name: string;
  category: string;
  dimensions: { width: number; height: number };
  description: string;
  default_size: string | null;
  size_variants: FormatSizeVariant[];
}

export type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
