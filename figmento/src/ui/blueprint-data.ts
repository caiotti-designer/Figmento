// ═══════════════════════════════════════════════════════════════
// Blueprint Data — MQ-4
// Embedded at build time from figmento-mcp-server/knowledge/layouts/
// After adding new blueprint YAMLs, rebuild to update this file.
// ═══════════════════════════════════════════════════════════════

export interface Blueprint {
  id: string;
  name: string;
  category: 'social' | 'web' | 'ads' | 'print' | 'presentation';
  subcategory: string;
  moods: string[];
  zones: Array<{ name: string; y_start_pct: number; y_end_pct: number }>;
  memorable_element: string;
}

export const BLUEPRINTS: Blueprint[] = [
  // ── SOCIAL ──────────────────────────────────────────────────
  {
    id: 'instagram-centered-minimal',
    name: 'Instagram — Centered Minimal',
    category: 'social',
    subcategory: 'instagram_post',
    moods: ['minimal', 'typographic', 'elegant', 'bold'],
    zones: [
      { name: 'top-space',       y_start_pct: 0,  y_end_pct: 25  },
      { name: 'content-centered', y_start_pct: 25, y_end_pct: 75  },
      { name: 'bottom-space',    y_start_pct: 75, y_end_pct: 100 },
    ],
    memorable_element: 'Oversized headline with extreme weight contrast — the typography alone creates all the visual tension',
  },
  {
    id: 'instagram-editorial-overlay',
    name: 'Instagram — Editorial Overlay',
    category: 'social',
    subcategory: 'instagram_post',
    moods: ['moody', 'cinematic', 'editorial', 'dark'],
    zones: [
      { name: 'hero-image',    y_start_pct: 0,  y_end_pct: 64  },
      { name: 'gradient-overlay', y_start_pct: 24, y_end_pct: 100 },
      { name: 'content-zone',  y_start_pct: 65, y_end_pct: 96  },
    ],
    memorable_element: 'Cinematic gradient that reveals content from darkness — the transition from image to text is the design\'s signature',
  },
  {
    id: 'instagram-carousel-slide',
    name: 'Instagram — Carousel Slide',
    category: 'social',
    subcategory: 'instagram_carousel',
    moods: ['educational', 'structured', 'informative', 'professional'],
    zones: [
      { name: 'header-bar',  y_start_pct: 0,  y_end_pct: 10  },
      { name: 'content',     y_start_pct: 10, y_end_pct: 85  },
      { name: 'footer-bar',  y_start_pct: 85, y_end_pct: 100 },
    ],
    memorable_element: 'Consistent slide number indicator in the corner — small but creates professional carousel identity across all slides',
  },
  {
    id: 'linkedin-post-professional',
    name: 'LinkedIn — Professional Post',
    category: 'social',
    subcategory: 'linkedin_post',
    moods: ['corporate', 'professional', 'data-driven', 'authoritative'],
    zones: [
      { name: 'headline-bar',  y_start_pct: 0,  y_end_pct: 18  },
      { name: 'data-visual',   y_start_pct: 18, y_end_pct: 68  },
      { name: 'insight-text',  y_start_pct: 70, y_end_pct: 88  },
      { name: 'branding',      y_start_pct: 90, y_end_pct: 100 },
    ],
    memorable_element: 'Single bold statistic or data point at display scale that dominates the center — the number IS the content',
  },

  // ── WEB ─────────────────────────────────────────────────────
  {
    id: 'hero-centered',
    name: 'Hero — Centered Stack',
    category: 'web',
    subcategory: 'hero',
    moods: ['versatile', 'clean', 'confident', 'modern'],
    zones: [
      { name: 'nav',          y_start_pct: 0,  y_end_pct: 8  },
      { name: 'hero-content', y_start_pct: 20, y_end_pct: 70 },
      { name: 'social-proof', y_start_pct: 78, y_end_pct: 88 },
    ],
    memorable_element: 'Oversized headline spanning near-full canvas width with tight letter-spacing (-0.02em)',
  },
  {
    id: 'hero-split-image',
    name: 'Hero — Split Image',
    category: 'web',
    subcategory: 'hero',
    moods: ['clean', 'editorial', 'professional', 'elegant'],
    zones: [
      { name: 'nav',        y_start_pct: 0,  y_end_pct: 8   },
      { name: 'split-main', y_start_pct: 8,  y_end_pct: 100 },
    ],
    memorable_element: 'Bold color block on the text side creating a strong contrast against the photographic half',
  },

  // ── ADS ─────────────────────────────────────────────────────
  {
    id: 'product-hero-gradient',
    name: 'Product Ad — Hero Gradient',
    category: 'ads',
    subcategory: 'product',
    moods: ['premium', 'moody', 'conversion', 'cinematic'],
    zones: [
      { name: 'hero-image',       y_start_pct: 0,  y_end_pct: 64  },
      { name: 'gradient-overlay', y_start_pct: 24, y_end_pct: 100 },
      { name: 'content-zone',     y_start_pct: 64, y_end_pct: 96  },
    ],
    memorable_element: 'Cinematic 2-stop gradient that seamlessly transitions from product photography to content',
  },

  // ── PRINT ────────────────────────────────────────────────────
  {
    id: 'poster-typographic',
    name: 'Poster — Typographic',
    category: 'print',
    subcategory: 'poster',
    moods: ['bold', 'dramatic', 'typographic', 'artistic'],
    zones: [
      { name: 'top-margin',      y_start_pct: 0,  y_end_pct: 8  },
      { name: 'primary-headline', y_start_pct: 25, y_end_pct: 65 },
      { name: 'supporting-text', y_start_pct: 67, y_end_pct: 80 },
      { name: 'details-footer',  y_start_pct: 82, y_end_pct: 95 },
    ],
    memorable_element: 'Headline is THE design — occupying 40%+ of visual area with dramatic scale that reads from across a room',
  },
  {
    id: 'brochure-panel',
    name: 'Brochure — Single Panel',
    category: 'print',
    subcategory: 'brochure',
    moods: ['professional', 'informative', 'structured', 'corporate'],
    zones: [
      { name: 'image-area',   y_start_pct: 0,  y_end_pct: 38 },
      { name: 'headline-zone', y_start_pct: 40, y_end_pct: 52 },
      { name: 'body-content', y_start_pct: 54, y_end_pct: 84 },
      { name: 'footer',       y_start_pct: 87, y_end_pct: 97 },
    ],
    memorable_element: 'Strong image-to-text transition — the moment where photography meets typography defines the panel\'s character',
  },

  // ── PRESENTATION ─────────────────────────────────────────────
  {
    id: 'title-slide-bold',
    name: 'Presentation — Title Slide Bold',
    category: 'presentation',
    subcategory: 'title_slide',
    moods: ['bold', 'confident', 'professional', 'impactful'],
    zones: [
      { name: 'branding',        y_start_pct: 3,  y_end_pct: 12 },
      { name: 'headline-center', y_start_pct: 25, y_end_pct: 62 },
      { name: 'tagline',         y_start_pct: 64, y_end_pct: 75 },
      { name: 'visual-accent',   y_start_pct: 80, y_end_pct: 97 },
    ],
    memorable_element: 'Headline at heroic scale that occupies 40%+ of the slide — fills the room and commands instant attention',
  },
  {
    id: 'content-split',
    name: 'Presentation — Content Split',
    category: 'presentation',
    subcategory: 'content',
    moods: ['structured', 'clear', 'professional', 'informative'],
    zones: [
      { name: 'header',       y_start_pct: 0,  y_end_pct: 12 },
      { name: 'content-area', y_start_pct: 14, y_end_pct: 88 },
      { name: 'footer',       y_start_pct: 90, y_end_pct: 98 },
    ],
    memorable_element: 'Clear visual separation between text and visual halves — one side teaches, the other proves',
  },
];
