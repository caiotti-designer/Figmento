// ═══════════════════════════════════════════════════════════════
// Reference Data — MQ-5
// Embedded at build time from figmento-mcp-server/knowledge/references/
//
// NOTE: After adding new reference YAMLs to the knowledge directory,
// run `cd figmento && npm run build` to embed the new data here.
//
// Categories with real data: web/hero (6 refs), print/brochure (3 refs)
// Categories without data yet: social, ads, presentation, print/poster,
//   print/business-card — add entries here when YAMLs are created.
// ═══════════════════════════════════════════════════════════════

export interface ReferenceEntry {
  id: string;
  category: string;
  subcategory: string;
  moods: string[];
  palette: 'dark' | 'light' | 'colorful' | 'monochrome';
  layout: string;
  notable: string;
  composition_notes?: {
    zones?: string;
    typography_scale?: string;
    color_distribution?: string;
    whitespace_strategy?: string;
  };
  color_temperature?: string;
}

export const REFERENCES: ReferenceEntry[] = [
  // ── WEB / HERO ───────────────────────────────────────────────
  {
    id: 'hero-dark-saas',
    category: 'web',
    subcategory: 'hero',
    moods: ['dark', 'cinematic', 'tech', 'ai', 'immersive'],
    palette: 'dark',
    layout: 'full-bleed-overlay-left',
    notable: 'Full-bleed portrait fills the entire viewport with teal/cyan rim lighting — the model\'s gaze anchors the composition while left-aligned monospace text floats over the dark lower third, creating an editorial poster feel inside a browser.',
    composition_notes: {
      zones: '100% full-bleed portrait background; text block occupies bottom-left 35% of frame; nav bar minimal 5% top strip',
      typography_scale: 'Display ~48px bold monospace uppercase, subhead ~13px regular, CTA ~12px tracked uppercase — extreme weight contrast with minimal size steps',
      color_distribution: '78% near-black (#090C12), 15% portrait mid-tones, 5% teal/cyan accent (#00E5CC), 2% white text',
      whitespace_strategy: 'Negative space is the dark background itself — portrait fills it; text left-anchored to ~5% from edge with no horizontal centering',
    },
    color_temperature: 'cool',
  },
  {
    id: 'hero-dark-saas3',
    category: 'web',
    subcategory: 'hero',
    moods: ['dark', 'editorial', 'product-photography', 'centered', 'portfolio'],
    palette: 'dark',
    layout: 'centered-product-grid',
    notable: 'Three cut-out product photos sit below the headline like physical objects dropped onto the dark canvas — their studio lighting and soft drop shadows make them feel tangible against the near-black background.',
    composition_notes: {
      zones: '15% nav; 25% headline zone (centered, large serif); 50% three-column product photo grid; 10% bio/footer strip',
      typography_scale: 'Display ~52px light-weight serif, body ~14px — single hierarchy level with weight doing the work',
      color_distribution: '88% near-black (#111111), 8% white text, 4% product photo color accents',
      whitespace_strategy: 'Ample padding between nav and headline (~80px); product cards have generous internal breathing room',
    },
    color_temperature: 'cool',
  },
  {
    id: 'hero-light-colorful',
    category: 'web',
    subcategory: 'hero',
    moods: ['light', 'playful', 'colorful', 'agency', 'floating-elements'],
    palette: 'colorful',
    layout: 'centered-stack',
    notable: 'Soft lavender-to-white gradient background with 3D illustrated blob/star shapes orbiting the content — the floating objects add depth and motion energy without cluttering the centered text hierarchy.',
    composition_notes: {
      zones: '8% nav; 10% trust badge; 30% headline block; 15% subtitle + CTAs; 37% ambient illustration zone',
      typography_scale: 'Display ~44px bold sans-serif, body ~15px regular — headline dominates with minimal scale steps',
      color_distribution: '60% lavender-white gradient, 20% 3D illustration purples/greens, 12% dark text, 8% purple CTA',
      whitespace_strategy: 'Content column narrow (~540px) in wide viewport — illustration elements use the remaining space as breathing room',
    },
    color_temperature: 'cool',
  },
  {
    id: 'hero-light-minimal',
    category: 'web',
    subcategory: 'hero',
    moods: ['light', 'minimal', 'saas', 'data', 'asymmetric'],
    palette: 'light',
    layout: 'split-asymmetric-right',
    notable: 'The right-side product card layers a portrait photo behind a floating data dashboard UI — the contrast between warm human photography and cold data numbers makes the automation value prop visceral without a word of explanation.',
    composition_notes: {
      zones: '8% nav; left 45%: text block (headline + body + CTA); right 55%: floating product card with photo + data overlay',
      typography_scale: 'Display ~48px mixed-weight (light/bold within same headline), body ~13px — weight contrast within the headline replaces size contrast',
      color_distribution: '70% white, 18% light grey, 8% dark text (#0D0D0D), 4% orange-red product accent (#E85C3A)',
      whitespace_strategy: 'Left column uses top padding ~120px to vertically center in viewport; generous line-height in headline (~1.1)',
    },
    color_temperature: 'neutral',
  },
  {
    id: 'hero-light-saas',
    category: 'web',
    subcategory: 'hero',
    moods: ['light', 'airy', 'saas', 'photography', 'centered'],
    palette: 'light',
    layout: 'centered-full-bleed',
    notable: 'An actual sky photograph fills the entire background — the cloud horizon line acts as a natural visual anchor for the UI cards at the bottom, grounding the composition and making the "scalable" metaphor literal.',
    composition_notes: {
      zones: '8% nav pill; 15% badge + headline block; 12% CTA pair; 65% sky photography with product UI cards emerging from bottom ~20%',
      typography_scale: 'Display ~40px medium sans-serif with italic accent word, body ~14px — stylistic variety within the headline substitutes for size hierarchy',
      color_distribution: '65% sky-blue photography, 25% white/near-white cloud tones, 6% dark text, 4% CTA black',
      whitespace_strategy: 'Sky background creates infinite implied whitespace above; content block vertically centered in the upper two-thirds',
    },
    color_temperature: 'warm',
  },
  {
    id: 'hero-light',
    category: 'web',
    subcategory: 'hero',
    moods: ['light', 'warm', 'wellness', 'asymmetric', 'photography'],
    palette: 'light',
    layout: 'asymmetric-three-column',
    notable: 'Portrait photographs overlap the column boundaries — faces bleed between layout zones, breaking the grid in a way that feels organic rather than designed, matching a mental health brand\'s message of human connection over structure.',
    composition_notes: {
      zones: 'Left 40%: text block (headline + body + CTA + social proof); Center 35%: primary portrait overlapping both columns; Right 25%: secondary content card',
      typography_scale: 'Display ~48px bold serif, secondary heading ~22px medium, body ~14px regular — clear 3-level hierarchy',
      color_distribution: '55% warm white/cream, 25% photography warm skin/earth tones, 12% dark text, 8% olive/sage green accent',
      whitespace_strategy: 'Photos use negative margin to overlap columns — the collision creates breathing room around text by letting images absorb the tension',
    },
    color_temperature: 'warm',
  },

  // ── PRINT / BROCHURE ─────────────────────────────────────────
  {
    id: 'ref-001',
    category: 'print',
    subcategory: 'brochure',
    moods: ['corporate', 'gradient-cover', 'bold-sans', 'editorial', 'newsletter'],
    palette: 'dark',
    layout: 'hero-cover-with-grid-interior',
    notable: 'Warm orange-to-deep-indigo gradient on the cover creates bold brand energy that contrasts deliberately with the disciplined cream interior spreads — one document reads as two visual worlds stitched together.',
    composition_notes: {
      zones: 'Cover: 100% gradient field, headline occupies lower-left 30%. Interior spreads: 50/50 text/image columns across numbered sections 01–05.',
      typography_scale: 'Cover display ~72px white bold sans, stat callout ~48px, interior section label ~11px caps, body ~9px — 8:1 display-to-body ratio.',
      color_distribution: 'Cover: orange (#E8582A) → deep indigo (#1A1040) gradient, white text. Interior: ~90% cream (#F5F0E8), ~10% near-black text.',
      whitespace_strategy: 'Cover stacks text tightly at bottom-left; interior spreads use generous 24px gutters and wide outer margins.',
    },
    color_temperature: 'warm',
  },
  {
    id: 'ref-002',
    category: 'print',
    subcategory: 'brochure',
    moods: ['institutional', 'editorial-serif', 'teal-cream', 'minimal', 'structured'],
    palette: 'light',
    layout: 'alternating-dark-light-spreads',
    notable: 'The hyphenated editorial headline "Intro—duction" spanning a full cream column — a single typographic break — lifts the entire document from institutional to editorial quality without a single extra graphic element.',
    composition_notes: {
      zones: 'Each spread splits 50/50: one cream column, one dark teal column — sides alternate between sections to create a visual heartbeat.',
      typography_scale: 'Section title ~80px light serif, subsection ~20px medium, body ~10px regular — 8:1 ratio.',
      color_distribution: '~45% cream/white (#F5F2EC), ~45% deep teal (#1B3D30), ~10% sage-green accent (#7DB89A).',
      whitespace_strategy: 'Cream pages use 60px+ outer margins; teal pages use whitespace as a separator between labelled value pairs.',
    },
    color_temperature: 'cool',
  },
  {
    id: 'ref-003',
    category: 'print',
    subcategory: 'brochure',
    moods: ['healthcare', 'corporate', 'procedural', 'teal-gradient', 'structured'],
    palette: 'dark',
    layout: 'hero-cover-with-tabular-interior',
    notable: 'Stamping "2035" on a Standard Operating Procedures document reframes routine compliance content as forward-looking institutional authority — a single word choice that transforms the cover\'s mood entirely.',
    composition_notes: {
      zones: 'Cover: 100% blue-teal gradient, headline in upper-left 40%, tagline and footer bottom 15%. Interior: 40% structured tables, 40% body text columns, 20% small photography.',
      typography_scale: 'Cover display ~56px bold white, section headers ~16px teal medium, body ~9px regular — lean print sizing for dense procedural copy.',
      color_distribution: 'Cover: teal-green (#1B7A72) → deep blue (#0A3D5C) gradient. Interior: ~85% white/cream, ~10% teal accent, ~5% photography.',
      whitespace_strategy: 'Interior columns are tightly spaced with ruled dividers; the cover breathes with a wide negative-space zone between headline and tagline.',
    },
    color_temperature: 'cool',
  },
];
