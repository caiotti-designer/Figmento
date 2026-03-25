/**
 * AUTO-GENERATED — DO NOT EDIT
 * Compiled from figmento-mcp-server/knowledge/ YAML files.
 * Run: npx tsx scripts/compile-knowledge.ts
 * Generated: 2026-03-25T01:20:20.897Z
 */

import type {
  Palette,
  FontPairing,
  TypeScale,
  SizePreset,
  Blueprint,
  PatternRecipe,
  CompositionRules,
  RefinementCheck,
} from './types';

export const PALETTES: Record<string, Palette> = {
  "moody-dark": {
    "id": "moody-dark",
    "name": "Moody / Dark",
    "mood_tags": [
      "moody",
      "dark",
      "dramatic",
      "cinematic",
      "noir",
      "coffee",
      "whiskey"
    ],
    "colors": {
      "primary": "#2C1810",
      "secondary": "#4A3228",
      "accent": "#D4A574",
      "background": "#1A0E0A",
      "text": "#F5E6D3",
      "muted": "#8B6F5E"
    }
  },
  "fresh-light": {
    "id": "fresh-light",
    "name": "Fresh / Light",
    "mood_tags": [
      "fresh",
      "light",
      "airy",
      "spring",
      "clean",
      "health",
      "wellness"
    ],
    "colors": {
      "primary": "#4CAF50",
      "secondary": "#81C784",
      "accent": "#29B6F6",
      "background": "#FAFFFE",
      "text": "#1B2E1B",
      "muted": "#A5D6A7"
    }
  },
  "corporate-professional": {
    "id": "corporate-professional",
    "name": "Corporate / Professional",
    "mood_tags": [
      "corporate",
      "professional",
      "business",
      "trustworthy",
      "finance",
      "enterprise"
    ],
    "colors": {
      "primary": "#1E3A5F",
      "secondary": "#2C5282",
      "accent": "#3182CE",
      "background": "#FFFFFF",
      "text": "#1A202C",
      "muted": "#A0AEC0"
    }
  },
  "luxury-premium": {
    "id": "luxury-premium",
    "name": "Luxury / Premium",
    "mood_tags": [
      "luxury",
      "premium",
      "gold",
      "elegant",
      "exclusive",
      "fashion",
      "jewelry"
    ],
    "colors": {
      "primary": "#1A1A1A",
      "secondary": "#2D2D2D",
      "accent": "#C9A84C",
      "background": "#0D0D0D",
      "text": "#F5F0E8",
      "muted": "#7A6F5D"
    }
  },
  "playful-fun": {
    "id": "playful-fun",
    "name": "Playful / Fun",
    "mood_tags": [
      "playful",
      "fun",
      "colorful",
      "vibrant",
      "kids",
      "games",
      "party"
    ],
    "colors": {
      "primary": "#FF6B6B",
      "secondary": "#4ECDC4",
      "accent": "#FFE66D",
      "background": "#FFFFFF",
      "text": "#2C3E50",
      "muted": "#95A5A6"
    }
  },
  "nature-organic": {
    "id": "nature-organic",
    "name": "Nature / Organic",
    "mood_tags": [
      "nature",
      "organic",
      "earth",
      "botanical",
      "sustainable",
      "eco",
      "garden"
    ],
    "colors": {
      "primary": "#2D6A4F",
      "secondary": "#40916C",
      "accent": "#B7791F",
      "background": "#F0FFF4",
      "text": "#1B4332",
      "muted": "#95D5B2"
    }
  },
  "tech-modern": {
    "id": "tech-modern",
    "name": "Tech / Modern",
    "mood_tags": [
      "tech",
      "modern",
      "digital",
      "futuristic",
      "startup",
      "ai",
      "cyber"
    ],
    "colors": {
      "primary": "#0D1117",
      "secondary": "#161B22",
      "accent": "#58A6FF",
      "background": "#0D1117",
      "text": "#E6EDF3",
      "muted": "#484F58"
    }
  },
  "warm-cozy": {
    "id": "warm-cozy",
    "name": "Warm / Cozy",
    "mood_tags": [
      "warm",
      "cozy",
      "autumn",
      "rustic",
      "homey",
      "bakery",
      "cafe"
    ],
    "colors": {
      "primary": "#C2590A",
      "secondary": "#A0522D",
      "accent": "#E8A87C",
      "background": "#FFF8F0",
      "text": "#3E2723",
      "muted": "#D7CCC8"
    }
  },
  "minimal-clean": {
    "id": "minimal-clean",
    "name": "Minimal / Clean",
    "mood_tags": [
      "minimal",
      "clean",
      "simple",
      "monochrome",
      "black-and-white",
      "scandinavian"
    ],
    "colors": {
      "primary": "#000000",
      "secondary": "#333333",
      "accent": "#0066CC",
      "background": "#FFFFFF",
      "text": "#111111",
      "muted": "#999999"
    }
  },
  "retro-vintage": {
    "id": "retro-vintage",
    "name": "Retro / Vintage",
    "mood_tags": [
      "retro",
      "vintage",
      "nostalgic",
      "70s",
      "80s",
      "groovy",
      "film"
    ],
    "colors": {
      "primary": "#D4A373",
      "secondary": "#CCD5AE",
      "accent": "#E76F51",
      "background": "#FEFAE0",
      "text": "#3D405B",
      "muted": "#A8A878"
    }
  },
  "ocean-calm": {
    "id": "ocean-calm",
    "name": "Ocean / Calm",
    "mood_tags": [
      "ocean",
      "calm",
      "serene",
      "spa",
      "meditation",
      "water",
      "blue"
    ],
    "colors": {
      "primary": "#0077B6",
      "secondary": "#00B4D8",
      "accent": "#90E0EF",
      "background": "#CAF0F8",
      "text": "#03045E",
      "muted": "#ADE8F4"
    }
  },
  "sunset-energy": {
    "id": "sunset-energy",
    "name": "Sunset / Energy",
    "mood_tags": [
      "sunset",
      "energy",
      "passionate",
      "bold",
      "dynamic",
      "sport",
      "music"
    ],
    "colors": {
      "primary": "#E63946",
      "secondary": "#F4A261",
      "accent": "#E9C46A",
      "background": "#FFF8F0",
      "text": "#2D3436",
      "muted": "#DFE6E9"
    }
  }
} as Record<string, Palette>;

export const FONT_PAIRINGS: Record<string, FontPairing> = {
  "modern": {
    "id": "modern",
    "name": "Modern",
    "heading_font": "Inter",
    "body_font": "Inter",
    "mood_tags": [
      "modern",
      "clean",
      "tech",
      "neutral",
      "versatile"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "classic": {
    "id": "classic",
    "name": "Classic",
    "heading_font": "Playfair Display",
    "body_font": "Source Serif Pro",
    "mood_tags": [
      "classic",
      "elegant",
      "editorial",
      "literary",
      "traditional"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "bold": {
    "id": "bold",
    "name": "Bold",
    "heading_font": "Montserrat",
    "body_font": "Hind",
    "mood_tags": [
      "bold",
      "strong",
      "confident",
      "marketing",
      "startup"
    ],
    "recommended_heading_weight": 800,
    "recommended_body_weight": 400
  },
  "luxury": {
    "id": "luxury",
    "name": "Luxury",
    "heading_font": "Cormorant Garamond",
    "body_font": "Proza Libre",
    "mood_tags": [
      "luxury",
      "premium",
      "fashion",
      "sophisticated",
      "refined"
    ],
    "recommended_heading_weight": 600,
    "recommended_body_weight": 400
  },
  "playful": {
    "id": "playful",
    "name": "Playful",
    "heading_font": "Poppins",
    "body_font": "Nunito",
    "mood_tags": [
      "playful",
      "friendly",
      "fun",
      "approachable",
      "youthful"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "corporate": {
    "id": "corporate",
    "name": "Corporate",
    "heading_font": "Roboto",
    "body_font": "Roboto Slab",
    "mood_tags": [
      "corporate",
      "professional",
      "trustworthy",
      "stable",
      "enterprise"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "editorial": {
    "id": "editorial",
    "name": "Editorial",
    "heading_font": "Libre Baskerville",
    "body_font": "Open Sans",
    "mood_tags": [
      "editorial",
      "journalistic",
      "readable",
      "authoritative",
      "content"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "minimalist": {
    "id": "minimalist",
    "name": "Minimalist",
    "heading_font": "DM Sans",
    "body_font": "DM Sans",
    "mood_tags": [
      "minimalist",
      "simple",
      "understated",
      "quiet",
      "focused"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "creative": {
    "id": "creative",
    "name": "Creative",
    "heading_font": "Space Grotesk",
    "body_font": "General Sans",
    "mood_tags": [
      "creative",
      "artistic",
      "experimental",
      "design",
      "studio"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "elegant": {
    "id": "elegant",
    "name": "Elegant",
    "heading_font": "Lora",
    "body_font": "Merriweather",
    "mood_tags": [
      "elegant",
      "warm",
      "literary",
      "sophisticated",
      "timeless"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "scholarly": {
    "id": "scholarly",
    "name": "Scholarly",
    "heading_font": "Merriweather",
    "body_font": "Source Sans Pro",
    "mood_tags": [
      "authoritative",
      "scholarly",
      "government",
      "institutional",
      "readable"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "warm-editorial": {
    "id": "warm-editorial",
    "name": "Warm Editorial",
    "heading_font": "Playfair Display",
    "body_font": "Fira Sans",
    "mood_tags": [
      "editorial",
      "magazine",
      "warm",
      "refined",
      "publishing"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "impactful": {
    "id": "impactful",
    "name": "Impactful",
    "heading_font": "Oswald",
    "body_font": "PT Sans",
    "mood_tags": [
      "impactful",
      "condensed",
      "bold",
      "strong",
      "headline",
      "news"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "slab-warmth": {
    "id": "slab-warmth",
    "name": "Slab Warmth",
    "heading_font": "Arvo",
    "body_font": "Cabin",
    "mood_tags": [
      "warm",
      "sturdy",
      "vintage",
      "mechanical",
      "trustworthy"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "thin-geometric": {
    "id": "thin-geometric",
    "name": "Thin Geometric",
    "heading_font": "Raleway",
    "body_font": "Libre Baskerville",
    "mood_tags": [
      "refined",
      "architectural",
      "thin",
      "sophisticated",
      "gallery"
    ],
    "recommended_heading_weight": 800,
    "recommended_body_weight": 400
  },
  "whimsical": {
    "id": "whimsical",
    "name": "Whimsical",
    "heading_font": "Josefin Sans",
    "body_font": "Merriweather",
    "mood_tags": [
      "whimsical",
      "dreamy",
      "artistic",
      "delicate",
      "storytelling"
    ],
    "recommended_heading_weight": 600,
    "recommended_body_weight": 300
  },
  "versatile": {
    "id": "versatile",
    "name": "Versatile",
    "heading_font": "Lato",
    "body_font": "Lato",
    "mood_tags": [
      "versatile",
      "balanced",
      "universal",
      "neutral",
      "professional"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "slab-journalistic": {
    "id": "slab-journalistic",
    "name": "Slab Journalistic",
    "heading_font": "Bitter",
    "body_font": "Source Sans Pro",
    "mood_tags": [
      "journalistic",
      "content",
      "readable",
      "serious",
      "news"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "adobe-matched": {
    "id": "adobe-matched",
    "name": "Adobe Matched",
    "heading_font": "Source Serif Pro",
    "body_font": "Source Sans Pro",
    "mood_tags": [
      "refined",
      "matched",
      "professional",
      "polished",
      "corporate"
    ],
    "recommended_heading_weight": 700,
    "recommended_body_weight": 400
  },
  "condensed-readable": {
    "id": "condensed-readable",
    "name": "Condensed Readable",
    "heading_font": "Roboto Condensed",
    "body_font": "Vollkorn",
    "mood_tags": [
      "compact",
      "readable",
      "dense",
      "informational",
      "data"
    ],
    "recommended_heading_weight": 400,
    "recommended_body_weight": 400
  }
} as Record<string, FontPairing>;

export const TYPE_SCALES: Record<string, TypeScale> = {
  "minor_third": {
    "name": "Minor Third",
    "ratio": 1.2,
    "sizes": {
      "xs": 11,
      "sm": 13,
      "base": 16,
      "lg": 19,
      "xl": 23,
      "2xl": 28,
      "3xl": 33,
      "4xl": 40,
      "display": 48
    }
  },
  "major_third": {
    "name": "Major Third",
    "ratio": 1.25,
    "sizes": {
      "xs": 10,
      "sm": 13,
      "base": 16,
      "lg": 20,
      "xl": 25,
      "2xl": 31,
      "3xl": 39,
      "4xl": 49,
      "display": 61
    }
  },
  "perfect_fourth": {
    "name": "Perfect Fourth",
    "ratio": 1.333,
    "sizes": {
      "xs": 9,
      "sm": 12,
      "base": 16,
      "lg": 21,
      "xl": 28,
      "2xl": 38,
      "3xl": 51,
      "4xl": 67,
      "display": 90
    }
  },
  "golden_ratio": {
    "name": "Golden Ratio",
    "ratio": 1.618,
    "sizes": {
      "xs": 6,
      "sm": 10,
      "base": 16,
      "lg": 26,
      "xl": 42,
      "2xl": 68,
      "3xl": 110,
      "display": 177
    }
  }
} as Record<string, TypeScale>;

export const SIZE_PRESETS: Record<string, SizePreset> = {
  "ig-post": {
    "id": "ig-post",
    "name": "Instagram Post",
    "width": 1080,
    "height": 1350,
    "aspect": "4:5",
    "notes": "Recommended feed post size, max vertical real estate"
  },
  "ig-square": {
    "id": "ig-square",
    "name": "Instagram Square",
    "width": 1080,
    "height": 1080,
    "aspect": "1:1",
    "notes": "Classic square post, also used for carousel slides"
  },
  "ig-story": {
    "id": "ig-story",
    "name": "Instagram Story",
    "width": 1080,
    "height": 1920,
    "aspect": "9:16",
    "notes": "Full-screen vertical story/reel format"
  },
  "ig-reel": {
    "id": "ig-reel",
    "name": "Instagram Reel",
    "width": 1080,
    "height": 1920,
    "aspect": "9:16",
    "notes": "Same as story, optimized for video cover"
  },
  "ig-carousel": {
    "id": "ig-carousel",
    "name": "Instagram Carousel",
    "width": 1080,
    "height": 1080,
    "aspect": "1:1",
    "notes": "Per-slide size for swipeable carousels"
  },
  "fb-post": {
    "id": "fb-post",
    "name": "Facebook Post",
    "width": 1200,
    "height": 630,
    "aspect": "1.91:1",
    "notes": "Standard shared image / link preview"
  },
  "fb-story": {
    "id": "fb-story",
    "name": "Facebook Story",
    "width": 1080,
    "height": 1920,
    "aspect": "9:16",
    "notes": "Full-screen vertical story"
  },
  "fb-cover": {
    "id": "fb-cover",
    "name": "Facebook Cover",
    "width": 820,
    "height": 312,
    "aspect": "2.63:1",
    "notes": "Profile/page cover photo"
  },
  "fb-ad": {
    "id": "fb-ad",
    "name": "Facebook Ad",
    "width": 1200,
    "height": 628,
    "aspect": "1.91:1",
    "notes": "Single image ad recommended size"
  },
  "x-post": {
    "id": "x-post",
    "name": "X/Twitter Post",
    "width": 1600,
    "height": 900,
    "aspect": "16:9",
    "notes": "In-stream photo, max engagement size"
  },
  "x-header": {
    "id": "x-header",
    "name": "X/Twitter Header",
    "width": 1500,
    "height": 500,
    "aspect": "3:1",
    "notes": "Profile header/banner"
  },
  "li-post": {
    "id": "li-post",
    "name": "LinkedIn Post",
    "width": 1200,
    "height": 627,
    "aspect": "1.91:1",
    "notes": "Shared image in feed"
  },
  "li-story": {
    "id": "li-story",
    "name": "LinkedIn Story",
    "width": 1080,
    "height": 1920,
    "aspect": "9:16",
    "notes": "Vertical story format"
  },
  "li-banner": {
    "id": "li-banner",
    "name": "LinkedIn Banner",
    "width": 1584,
    "height": 396,
    "aspect": "4:1",
    "notes": "Personal profile background"
  },
  "pin-standard": {
    "id": "pin-standard",
    "name": "Pinterest Pin",
    "width": 1000,
    "height": 1500,
    "aspect": "2:3",
    "notes": "Optimal pin ratio for feed visibility"
  },
  "pin-square": {
    "id": "pin-square",
    "name": "Pinterest Square",
    "width": 1000,
    "height": 1000,
    "aspect": "1:1",
    "notes": "Square pin format"
  },
  "tiktok-video": {
    "id": "tiktok-video",
    "name": "TikTok Video",
    "width": 1080,
    "height": 1920,
    "aspect": "9:16",
    "notes": "Video cover / thumbnail"
  },
  "yt-thumbnail": {
    "id": "yt-thumbnail",
    "name": "YouTube Thumbnail",
    "width": 1280,
    "height": 720,
    "aspect": "16:9",
    "notes": "Video thumbnail, keep text large"
  },
  "yt-banner": {
    "id": "yt-banner",
    "name": "YouTube Banner",
    "width": 2560,
    "height": 1440,
    "aspect": "16:9",
    "notes": "Channel art; safe area 1546x423 center"
  },
  "snap-story": {
    "id": "snap-story",
    "name": "Snapchat Story",
    "width": 1080,
    "height": 1920,
    "aspect": "9:16",
    "notes": "Full-screen vertical"
  },
  "print-a4": {
    "id": "print-a4",
    "name": "A4",
    "width": 2480,
    "height": 3508
  },
  "print-a3": {
    "id": "print-a3",
    "name": "A3",
    "width": 3508,
    "height": 4961
  },
  "print-letter": {
    "id": "print-letter",
    "name": "US Letter",
    "width": 2550,
    "height": 3300
  },
  "print-legal": {
    "id": "print-legal",
    "name": "US Legal",
    "width": 2550,
    "height": 4200
  },
  "print-business-card": {
    "id": "print-business-card",
    "name": "Business Card",
    "width": 1050,
    "height": 600,
    "notes": "Standard US business card"
  },
  "print-flyer": {
    "id": "print-flyer",
    "name": "Flyer",
    "width": 1275,
    "height": 1875,
    "notes": "Quarter-page flyer"
  },
  "print-poster-11x17": {
    "id": "print-poster-11x17",
    "name": "Poster 11x17",
    "width": 3300,
    "height": 5100
  },
  "print-poster-18x24": {
    "id": "print-poster-18x24",
    "name": "Poster 18x24",
    "width": 5400,
    "height": 7200
  },
  "print-poster-24x36": {
    "id": "print-poster-24x36",
    "name": "Poster 24x36",
    "width": 7200,
    "height": 10800
  },
  "pres-16-9": {
    "id": "pres-16-9",
    "name": "16:9 Widescreen",
    "width": 1920,
    "height": 1080,
    "aspect": "16:9",
    "notes": "Standard presentation, most projectors/screens"
  },
  "pres-4-3": {
    "id": "pres-4-3",
    "name": "4:3 Standard",
    "width": 1024,
    "height": 768,
    "aspect": "4:3",
    "notes": "Legacy projector format"
  },
  "pres-widescreen-2k": {
    "id": "pres-widescreen-2k",
    "name": "Widescreen 2K",
    "width": 2560,
    "height": 1440,
    "aspect": "16:9",
    "notes": "High-res presentations for retina/4K displays"
  },
  "web-hero-16-9": {
    "id": "web-hero-16-9",
    "name": "Web Hero 16:9",
    "width": 1920,
    "height": 1080
  },
  "web-banner": {
    "id": "web-banner",
    "name": "Web Banner",
    "width": 1440,
    "height": 600
  },
  "web-landing": {
    "id": "web-landing",
    "name": "Landing Page",
    "width": 1440,
    "height": 900
  },
  "tablet-landscape": {
    "id": "tablet-landscape",
    "name": "Tablet Landscape",
    "width": 1194,
    "height": 834
  },
  "tablet-portrait": {
    "id": "tablet-portrait",
    "name": "Tablet Portrait",
    "width": 834,
    "height": 1194
  },
  "mobile-hero": {
    "id": "mobile-hero",
    "name": "Mobile Hero",
    "width": 430,
    "height": 932
  },
  "mobile-banner": {
    "id": "mobile-banner",
    "name": "Mobile Banner",
    "width": 430,
    "height": 300
  }
} as Record<string, SizePreset>;

export const BLUEPRINTS: Blueprint[] = [
  {"id":"comparison-split","name":"Ad — Comparison Split","category":"ads","subcategory":"comparison","mood":["clear","comparative","educational","conversion"],"zones":[{"name":"header","y_start_pct":0,"y_end_pct":12,"elements":[{"role":"comparison-title","type":"text"}],"typography_hierarchy":{"comparison-title":"h2"}},{"name":"split-area","y_start_pct":12,"y_end_pct":78,"elements":[{"role":"side-a-label","type":"text"},{"role":"side-a-visual","type":"image"},{"role":"side-a-description","type":"text"},{"role":"divider","type":"rectangle"},{"role":"side-b-label","type":"text"},{"role":"side-b-visual","type":"image"},{"role":"side-b-description","type":"text"}],"typography_hierarchy":{"side-a-label":"h3","side-b-label":"h3","side-a-description":"body","side-b-description":"body"}},{"name":"verdict","y_start_pct":80,"y_end_pct":96,"elements":[{"role":"verdict-text","type":"text"},{"role":"cta-button","type":"frame"}],"typography_hierarchy":{"verdict-text":"h3","cta-button":"body"}}],"anti_generic":["Center divider must be a visual element — thin vertical line, VS badge, or arrow icon. Empty space between halves looks unfinished.","The 'winning' side (side-b typically) must have a subtle visual advantage — accent border, slightly brighter background, or checkmark icons","Side labels must use contrasting colors (e.g., muted red for 'Before' vs vibrant green for 'After') to create instant visual narrative"],"memorable_element":"Visual arrow or VS element at the split point that transforms a simple comparison into a dramatic reveal","whitespace_ratio":0.45},
  {"id":"lifestyle-fullbleed","name":"Ad — Lifestyle Full-Bleed","category":"ads","subcategory":"lifestyle","mood":["cinematic","aspirational","luxury","minimal"],"zones":[{"name":"hero-image","y_start_pct":0,"y_end_pct":100,"elements":[{"role":"lifestyle-image","type":"image"}]},{"name":"subtle-overlay","y_start_pct":70,"y_end_pct":100,"elements":[{"role":"soft-gradient","type":"rectangle"}]},{"name":"whisper-text","y_start_pct":78,"y_end_pct":96,"elements":[{"role":"tagline","type":"text"},{"role":"brand-name","type":"text"},{"role":"cta-text","type":"text"}],"typography_hierarchy":{"tagline":"h3","brand-name":"caption","cta-text":"caption"}}],"anti_generic":["Gradient overlay must be extremely subtle: 2 stops, opacity 0 → 0.6 max. The image must remain dominant — heavy gradients kill the cinematic feel.","Text must be small and elegant — no headline larger than h3 scale. If text competes with the image, the layout has failed.","Brand name should be understated (caption scale, 60-70% opacity) — luxury whispers, it doesn't shout"],"memorable_element":"The image itself IS the memorable element — text is so minimal it barely exists, creating aspirational tension","whitespace_ratio":0.3},
  {"id":"product-hero-gradient","name":"Product Ad — Hero Gradient","category":"ads","subcategory":"product","mood":["premium","moody","conversion","cinematic"],"zones":[{"name":"background","y_start_pct":0,"y_end_pct":100,"elements":[{"role":"background-fill","type":"rectangle"}]},{"name":"hero-image","y_start_pct":0,"y_end_pct":64,"elements":[{"role":"product-image","type":"image"}]},{"name":"gradient-overlay","y_start_pct":24,"y_end_pct":100,"elements":[{"role":"overlay-gradient","type":"rectangle"}]},{"name":"logo-zone","y_start_pct":4,"y_end_pct":10,"elements":[{"role":"brand-name","type":"text"},{"role":"brand-tagline","type":"text"}],"typography_hierarchy":{"brand-name":"h3","brand-tagline":"caption"},"positioning":"absolute"},{"name":"badge-zone","y_start_pct":4,"y_end_pct":15,"elements":[{"role":"discount-badge","type":"frame"}],"typography_hierarchy":{"discount-percent":"h2","discount-label":"caption"},"positioning":"absolute"},{"name":"content-zone","y_start_pct":64,"y_end_pct":96,"elements":[{"role":"headline","type":"text"},{"role":"subheadline","type":"text"},{"role":"price-group","type":"frame"},{"role":"cta-button","type":"frame"},{"role":"installment-note","type":"text"}],"typography_hierarchy":{"headline":"display","subheadline":"h3","price-sale":"h1","price-original":"body","cta-button":"body","installment-note":"caption"}}],"anti_generic":["Gradient overlay: EXACTLY 2 stops. Stop 1: position 0, bg color, opacity 0. Stop 2: position 0.4, bg color, opacity 1. NEVER 3+ stops.","Gradient color MUST match section background color. Dark theme → dark gradient. Light theme → light gradient. NEVER hardcode.","Content frame uses VERTICAL auto-layout with layoutSizingVertical: HUG. Never fixed height.","CTA button must be the highest-contrast element — pill shape (cornerRadius: 999), generous padding (20px/96px)"],"memorable_element":"Cinematic 2-stop gradient that seamlessly transitions from product photography to content — the gradient IS the design's elegance","whitespace_ratio":0.42},
  {"id":"product-hero-pricing","name":"Ad — Product Hero with Pricing","category":"ads","subcategory":"product","mood":["commercial","bold","promotional","luxury"],"zones":[{"name":"product-image","y_start_pct":0,"y_end_pct":55,"elements":[{"role":"product-photo","type":"image","notes":"Product centered, floating on dark/neutral surface. No busy backgrounds."}]},{"name":"badge","y_start_pct":4,"y_end_pct":20,"elements":[{"role":"discount-badge","type":"frame","notes":"Circular frame, accent color fill. cornerRadius = width/2. Contains discount text (e.g. '25% OFF'). Must NOT overlap product name or CTA."}]},{"name":"gradient-transition","y_start_pct":40,"y_end_pct":60,"elements":[{"role":"image-to-content-fade","type":"rectangle","notes":"2-stop gradient only. direction=bottom-top. Stops: pos=0 opacity=0, pos=1.0 opacity=1. Color matches background."}]},{"name":"content","y_start_pct":58,"y_end_pct":94,"elements":[{"role":"tagline","type":"text"},{"role":"features","type":"text","notes":"Inline, separated by · (middle dot). Gold/accent color."},{"role":"original-price","type":"text","notes":"De-emphasized — small size, muted color. Prefix with 'was'. Never strike-through (Figma doesn't support it natively)."},{"role":"sale-price","type":"text","notes":"DOMINANT element in content zone. 2-3x larger than original-price. Full-brightness color (white or accent)."},{"role":"cta-button","type":"frame","notes":"Auto-layout frame with horizontal padding. Accent color fill. Dark text on light button. 2x itemSpacing gap above this vs other elements."}],"typography_hierarchy":{"tagline":"h2","features":"body","original-price":"caption","sale-price":"display","cta-button":"label"}}],"anti_generic":["Sale price must be visually DOMINANT — if it doesn't dwarf the original price, the layout has failed. Use 2-3x font size difference minimum.","Badge must be circular, not a rounded rectangle. cornerRadius = frame.width / 2.","Gradient overlay color MUST match the canvas background exactly. Mismatched gradient = visible hard edge.","Features row in accent/gold color creates a visual mid-layer between image and price — don't skip it or collapse it into body text.","CTA button needs isolation — double the itemSpacing above it compared to other content gaps."],"memorable_element":"Oversized sale price number dominates the content zone — it should feel almost too large. The price IS the hero of the lower half.","whitespace_ratio":0.35},
  {"id":"sale-badge-overlay","name":"Ad — Sale Badge Overlay","category":"ads","subcategory":"sale","mood":["energetic","bold","sale","urgent"],"zones":[{"name":"hero-image","y_start_pct":0,"y_end_pct":100,"elements":[{"role":"lifestyle-image","type":"image"}]},{"name":"badge-zone","y_start_pct":3,"y_end_pct":18,"elements":[{"role":"discount-badge","type":"frame"}],"typography_hierarchy":{"discount-percent":"h1","discount-label":"caption"},"positioning":"absolute"},{"name":"gradient-overlay","y_start_pct":55,"y_end_pct":100,"elements":[{"role":"bottom-gradient","type":"rectangle"}]},{"name":"content-bottom","y_start_pct":72,"y_end_pct":96,"elements":[{"role":"headline","type":"text"},{"role":"price-group","type":"frame"},{"role":"cta-button","type":"frame"}],"typography_hierarchy":{"headline":"h1","price-sale":"h2","cta-button":"body"}}],"anti_generic":["Badge must be circular (cornerRadius = width/2) positioned top-right, 15-20% of frame width. High-contrast fill (e.g., red, gold) against image.","Gradient overlay: 2 stops, bottom-to-top, color matches bg, opacity 0 → 0.8. Subtler than product-hero (0.8 not 1.0) to let image breathe.","CTA must be bottom-aligned and pill-shaped — it's the only actionable element so it must dominate the lower zone"],"memorable_element":"Bold circular discount badge with high-contrast percentage number floating over the lifestyle image","whitespace_ratio":0.35},
  {"id":"closing-cta","name":"Presentation — Closing CTA","category":"presentation","subcategory":"closing","mood":["action","closing","memorable","conversion"],"zones":[{"name":"summary-headline","y_start_pct":15,"y_end_pct":38,"elements":[{"role":"closing-headline","type":"text"}],"typography_hierarchy":{"closing-headline":"h1"}},{"name":"key-points","y_start_pct":40,"y_end_pct":65,"elements":[{"role":"takeaway-1","type":"text"},{"role":"takeaway-2","type":"text"},{"role":"takeaway-3","type":"text"}],"typography_hierarchy":{"takeaway-1":"body","takeaway-2":"body","takeaway-3":"body"}},{"name":"cta-zone","y_start_pct":68,"y_end_pct":85,"elements":[{"role":"cta-headline","type":"text"},{"role":"cta-button","type":"frame"},{"role":"contact-info","type":"text"}],"typography_hierarchy":{"cta-headline":"h2","cta-button":"h3","contact-info":"caption"}}],"anti_generic":["CTA must get maximum visual weight — accent background, large button, contrasting color. It's the LAST thing the audience sees.","Key points must be concise (1 line each) with numbered or icon-prefixed bullets — not paragraph text","Background should match or complement the title slide — visual consistency bookends the presentation"],"memorable_element":"Final CTA gets maximum visual weight — oversized button or accent-colored action prompt that's the last image burned into the audience's mind","whitespace_ratio":0.55},
  {"id":"content-split","name":"Presentation — Content Split","category":"presentation","subcategory":"content","mood":["structured","clear","professional","informative"],"zones":[{"name":"header","y_start_pct":0,"y_end_pct":12,"elements":[{"role":"slide-title","type":"text"}],"typography_hierarchy":{"slide-title":"h2"}},{"name":"content-area","y_start_pct":14,"y_end_pct":88,"elements":[{"role":"content-heading","type":"text"},{"role":"bullet-points","type":"frame"},{"role":"body-text","type":"text"},{"role":"visual-placeholder","type":"image"}],"typography_hierarchy":{"content-heading":"h3","body-text":"body"}},{"name":"footer","y_start_pct":90,"y_end_pct":98,"elements":[{"role":"page-number","type":"text"},{"role":"company-logo","type":"frame"}],"typography_hierarchy":{"page-number":"caption"}}],"anti_generic":["Visual zone must breathe — generous padding (40px+) around the image/chart, never edge-to-edge within its half","Text zone bullet points must use custom icons or accent-colored markers, never default black circles","Clear vertical divider between halves — either whitespace gap (40px+) or thin accent line. Halves must not blend together."],"memorable_element":"Clear visual separation between text and visual halves — one side teaches, the other proves","whitespace_ratio":0.5},
  {"id":"title-slide-bold","name":"Presentation — Title Slide Bold","category":"presentation","subcategory":"title_slide","mood":["bold","confident","professional","impactful"],"zones":[{"name":"branding","y_start_pct":3,"y_end_pct":12,"elements":[{"role":"company-logo","type":"frame"}],"typography_hierarchy":{"company-name":"caption"},"positioning":"absolute"},{"name":"headline-center","y_start_pct":25,"y_end_pct":62,"elements":[{"role":"presentation-title","type":"text"}],"typography_hierarchy":{"presentation-title":"display"}},{"name":"tagline","y_start_pct":64,"y_end_pct":75,"elements":[{"role":"subtitle","type":"text"},{"role":"presenter-name","type":"text"}],"typography_hierarchy":{"subtitle":"h3","presenter-name":"body"}},{"name":"visual-accent","y_start_pct":80,"y_end_pct":97,"elements":[{"role":"decorative-element","type":"rectangle"},{"role":"date-info","type":"text"}],"typography_hierarchy":{"date-info":"caption"}}],"anti_generic":["Headline must be display-scale (64px+ for 1920×1080) with tight letter-spacing — it must be readable from the back of the room","Background must NOT be plain white — use a dark theme, gradient, or tinted solid. White slides look amateur in 2025.","Visual accent (bottom zone) must add depth — subtle gradient bar, geometric shape, or accent line. Never leave the bottom empty."],"memorable_element":"Headline at heroic scale that occupies 40%+ of the slide — fills the room and commands instant attention","whitespace_ratio":0.6},
  {"id":"brochure-panel","name":"Brochure — Single Panel","category":"print","subcategory":"brochure","mood":["professional","informative","structured","corporate"],"zones":[{"name":"image-area","y_start_pct":0,"y_end_pct":38,"elements":[{"role":"panel-image","type":"image"}]},{"name":"headline-zone","y_start_pct":40,"y_end_pct":52,"elements":[{"role":"panel-headline","type":"text"},{"role":"accent-underline","type":"rectangle"}],"typography_hierarchy":{"panel-headline":"h1"}},{"name":"body-content","y_start_pct":54,"y_end_pct":84,"elements":[{"role":"body-text","type":"text"},{"role":"bullet-points","type":"frame"}],"typography_hierarchy":{"body-text":"body"}},{"name":"footer","y_start_pct":87,"y_end_pct":97,"elements":[{"role":"contact-info","type":"text"},{"role":"company-logo","type":"frame"}],"typography_hierarchy":{"contact-info":"caption"}}],"anti_generic":["Image-to-text transition must be clean — either hard edge with generous gap (24px+) or accent line divider. No gradients on print.","Print bleed awareness: 9px bleed minimum. No critical text within 18px of trim edge. Mark bleed area in design notes.","Body text ≥18px, headlines ≥36px for print readability at 300dpi"],"memorable_element":"Strong image-to-text transition — the moment where photography meets typography defines the panel's character","whitespace_ratio":0.5},
  {"id":"business-card-modern","name":"Business Card — Modern","category":"print","subcategory":"business_card","mood":["professional","modern","clean","minimal"],"zones":[{"name":"primary-info","y_start_pct":15,"y_end_pct":65,"elements":[{"role":"full-name","type":"text"},{"role":"job-title","type":"text"},{"role":"company-name","type":"text"},{"role":"email","type":"text"},{"role":"phone","type":"text"},{"role":"website","type":"text"}],"typography_hierarchy":{"full-name":"h2","job-title":"body","company-name":"body","email":"caption","phone":"caption","website":"caption"}},{"name":"accent-zone","y_start_pct":75,"y_end_pct":82,"elements":[{"role":"accent-line","type":"rectangle"}]},{"name":"bleed-zone","y_start_pct":95,"y_end_pct":100,"elements":[{"role":"bleed-area","type":"rectangle"}]}],"anti_generic":["Must include bleed zone awareness: 9px bleed on all sides (3.5×2in at 300dpi = 1050×600 with 9px bleed). No critical content within 18px of edges.","A single accent element (line, shape, or color block) must anchor the composition — without it, business cards look like Word templates","Body text must be ≥18px and headings ≥24px for print legibility at 300dpi"],"memorable_element":"Single accent line or geometric shape anchoring the composition — minimal but gives the card its identity","whitespace_ratio":0.6},
  {"id":"menu-restaurant","name":"Menu — Restaurant","category":"print","subcategory":"menu","mood":["elegant","warm","appetizing","structured"],"zones":[{"name":"header","y_start_pct":0,"y_end_pct":12,"elements":[{"role":"restaurant-name","type":"text"},{"role":"tagline","type":"text"},{"role":"decorative-rule","type":"rectangle"}],"typography_hierarchy":{"restaurant-name":"h1","tagline":"caption"}},{"name":"menu-sections","y_start_pct":14,"y_end_pct":88,"elements":[{"role":"section-title","type":"text"},{"role":"item-name","type":"text"},{"role":"item-description","type":"text"},{"role":"item-price","type":"text"},{"role":"section-divider","type":"rectangle"}],"typography_hierarchy":{"section-title":"h2","item-name":"body","item-description":"caption","item-price":"body"}},{"name":"footer","y_start_pct":90,"y_end_pct":98,"elements":[{"role":"address","type":"text"},{"role":"hours","type":"text"},{"role":"phone","type":"text"}],"typography_hierarchy":{"address":"caption","hours":"caption"}}],"anti_generic":["Decorative dividers between menu sections are mandatory — thin rules, ornamental lines, or small illustrations. Without them, menus look like spreadsheets.","Print bleed awareness: 9px bleed, no critical text within 18px of trim. Minimum body text 18px at 300dpi.","Item name and price must be on the same visual line with a dot-leader or whitespace gap — never stacked vertically"],"memorable_element":"Decorative dividers between sections — ornamental rules or small culinary illustrations that give the menu its character","whitespace_ratio":0.45},
  {"id":"poster-typographic","name":"Poster — Typographic","category":"print","subcategory":"poster","mood":["bold","dramatic","typographic","artistic"],"zones":[{"name":"top-margin","y_start_pct":0,"y_end_pct":8,"elements":[{"role":"organizer-logo","type":"frame"}]},{"name":"primary-headline","y_start_pct":25,"y_end_pct":65,"elements":[{"role":"headline","type":"text"}],"typography_hierarchy":{"headline":"display"}},{"name":"supporting-text","y_start_pct":67,"y_end_pct":80,"elements":[{"role":"subheadline","type":"text"},{"role":"date-location","type":"text"}],"typography_hierarchy":{"subheadline":"h2","date-location":"h3"}},{"name":"details-footer","y_start_pct":82,"y_end_pct":95,"elements":[{"role":"details","type":"text"},{"role":"sponsor-logos","type":"frame"}],"typography_hierarchy":{"details":"body"}}],"anti_generic":["Headline must occupy 40%+ of the poster's visual area — if it doesn't dominate, it's not typographic enough","Margins must be ≥96px (poster standard). Content within bleed-safe area only.","Maximum 2 fonts — the type contrast between headline and body IS the visual system"],"memorable_element":"Headline is THE design — occupying 40%+ of visual area with dramatic scale that reads from across a room","whitespace_ratio":0.55},
  {"id":"instagram-carousel-slide","name":"Instagram — Carousel Slide","category":"social","subcategory":"instagram_carousel","mood":["educational","structured","informative","professional"],"zones":[{"name":"header-bar","y_start_pct":0,"y_end_pct":10,"elements":[{"role":"brand-name","type":"text"},{"role":"slide-indicator","type":"text"}],"typography_hierarchy":{"brand-name":"caption","slide-indicator":"caption"}},{"name":"content","y_start_pct":10,"y_end_pct":85,"elements":[{"role":"slide-title","type":"text"},{"role":"slide-body","type":"text"},{"role":"visual-element","type":"frame"}],"typography_hierarchy":{"slide-title":"h1","slide-body":"body"}},{"name":"footer-bar","y_start_pct":85,"y_end_pct":100,"elements":[{"role":"cta-text","type":"text"},{"role":"swipe-indicator","type":"frame"}],"typography_hierarchy":{"cta-text":"caption"}}],"anti_generic":["Header and footer bars must have a tinted background (5-10% darker than main) creating clear persistent zones across slides","Slide indicator (e.g., '03/10') must be in a fixed position across all slides — top-right corner recommended","Safe zones: all text within 150px top/bottom, 60px sides"],"memorable_element":"Consistent slide number indicator in the corner — small but creates professional carousel identity across all slides","whitespace_ratio":0.5},
  {"id":"instagram-centered-minimal","name":"Instagram — Centered Minimal","category":"social","subcategory":"instagram_post","mood":["minimal","typographic","elegant","bold"],"zones":[{"name":"top-space","y_start_pct":0,"y_end_pct":25,"elements":[{"role":"brand-mark","type":"frame"}],"typography_hierarchy":{"brand-mark":"caption"}},{"name":"content-centered","y_start_pct":25,"y_end_pct":75,"elements":[{"role":"headline","type":"text"},{"role":"subheadline","type":"text"},{"role":"accent-divider","type":"rectangle"}],"typography_hierarchy":{"headline":"display","subheadline":"h3"}},{"name":"bottom-space","y_start_pct":75,"y_end_pct":100,"elements":[{"role":"cta-text","type":"text"},{"role":"handle","type":"text"}],"typography_hierarchy":{"cta-text":"body","handle":"caption"}}],"anti_generic":["Headline must use ≥3 weight steps from body text — the weight contrast IS the visual hierarchy","Background must NOT be plain white — use an off-white, tinted neutral, or deep solid color","Safe zones: all text within 150px top/bottom, 60px sides"],"memorable_element":"Oversized headline with extreme weight contrast — the typography alone creates all the visual tension","whitespace_ratio":0.65},
  {"id":"instagram-editorial-overlay","name":"Instagram — Editorial Overlay","category":"social","subcategory":"instagram_post","mood":["moody","cinematic","editorial","dark"],"zones":[{"name":"logo-zone","y_start_pct":4,"y_end_pct":10,"elements":[{"role":"brand-name","type":"text"},{"role":"brand-sub","type":"text"}],"typography_hierarchy":{"brand-name":"h3","brand-sub":"caption"},"positioning":"absolute"},{"name":"hero-image","y_start_pct":0,"y_end_pct":64,"elements":[{"role":"hero-image","type":"image"}]},{"name":"gradient-overlay","y_start_pct":24,"y_end_pct":100,"elements":[{"role":"overlay-gradient","type":"rectangle"}]},{"name":"content-zone","y_start_pct":65,"y_end_pct":96,"elements":[{"role":"headline","type":"text"},{"role":"subheadline","type":"text"},{"role":"price","type":"text"},{"role":"cta-button","type":"frame"},{"role":"note","type":"text"}],"typography_hierarchy":{"headline":"display","subheadline":"h3","price":"h2","cta-button":"body","note":"caption"}}],"anti_generic":["Gradient overlay MUST use exactly 2 stops: position 0 = bg color at 0% opacity, position 0.4 = bg color at 100% opacity. Never 3+ stops.","Gradient color MUST match the content zone background — dark bg → dark gradient, light bg → light gradient. Never hardcode one color.","Content frame must use layoutSizingVertical: HUG — never fixed height, which clips text","Safe zones: keep all text within 150px of top/bottom and 60px of sides per Instagram spec"],"memorable_element":"Cinematic gradient that reveals content from darkness — the transition from image to text is the design's signature","whitespace_ratio":0.45},
  {"id":"instagram-split-horizontal","name":"Instagram — Split Horizontal","category":"social","subcategory":"instagram_post","mood":["clean","structured","fresh","bright"],"zones":[{"name":"image-zone","y_start_pct":0,"y_end_pct":52,"elements":[{"role":"hero-image","type":"image"}]},{"name":"divider","y_start_pct":52,"y_end_pct":53,"elements":[{"role":"accent-line","type":"rectangle"}]},{"name":"content-zone","y_start_pct":53,"y_end_pct":100,"elements":[{"role":"headline","type":"text"},{"role":"subheadline","type":"text"},{"role":"body-text","type":"text"},{"role":"cta-button","type":"frame"}],"typography_hierarchy":{"headline":"h1","subheadline":"h3","body-text":"body","cta-button":"body"}}],"anti_generic":["Content zone background must be a solid brand color or warm neutral — never white or light gray","A thin accent-colored divider line (2-4px) between image and content zones creates the signature separation","Safe zones: text stays within 150px top/bottom, 60px sides"],"memorable_element":"Bold color-block divider line between image and content zones — a single accent stripe that anchors the composition","whitespace_ratio":0.5},
  {"id":"linkedin-post-professional","name":"LinkedIn — Professional Post","category":"social","subcategory":"linkedin_post","mood":["corporate","professional","data-driven","authoritative"],"zones":[{"name":"headline-bar","y_start_pct":0,"y_end_pct":18,"elements":[{"role":"topic-label","type":"text"},{"role":"headline","type":"text"}],"typography_hierarchy":{"topic-label":"caption","headline":"h2"}},{"name":"data-visual","y_start_pct":18,"y_end_pct":68,"elements":[{"role":"big-number","type":"text"},{"role":"metric-label","type":"text"},{"role":"chart-placeholder","type":"frame"}],"typography_hierarchy":{"big-number":"display","metric-label":"h3"}},{"name":"insight-text","y_start_pct":70,"y_end_pct":88,"elements":[{"role":"insight-body","type":"text"},{"role":"source-citation","type":"text"}],"typography_hierarchy":{"insight-body":"body","source-citation":"caption"}},{"name":"branding","y_start_pct":90,"y_end_pct":100,"elements":[{"role":"company-name","type":"text"},{"role":"website-url","type":"text"}],"typography_hierarchy":{"company-name":"body","website-url":"caption"}}],"anti_generic":["The big-number/statistic must be display-scale (96px+) and visually dominate the entire layout — it's the hook","Background must use a professional palette — navy, charcoal, or dark blue. Never bright colors for LinkedIn.","Source citation must be present — unsourced data looks amateur on LinkedIn"],"memorable_element":"Single bold statistic or data point at display scale that dominates the center — the number IS the content","whitespace_ratio":0.5},
  {"id":"story-fullbleed-text","name":"Story — Full-Bleed Text","category":"social","subcategory":"story","mood":["bold","dramatic","energetic","announcement"],"zones":[{"name":"top-breathing","y_start_pct":0,"y_end_pct":12,"elements":[{"role":"brand-mark","type":"frame"}],"typography_hierarchy":{"brand-mark":"caption"}},{"name":"main-text","y_start_pct":15,"y_end_pct":60,"elements":[{"role":"headline","type":"text"},{"role":"subheadline","type":"text"}],"typography_hierarchy":{"headline":"display","subheadline":"h2"}},{"name":"supporting","y_start_pct":62,"y_end_pct":78,"elements":[{"role":"body-text","type":"text"},{"role":"details","type":"text"}],"typography_hierarchy":{"body-text":"body","details":"caption"}},{"name":"cta","y_start_pct":80,"y_end_pct":92,"elements":[{"role":"cta-button","type":"frame"},{"role":"swipe-text","type":"text"}],"typography_hierarchy":{"cta-button":"h3","swipe-text":"caption"}}],"anti_generic":["Headline must fill nearly full width (90%+) with dramatic scale — at least 72px, ideally 96px+","TikTok safe zones apply: 100px top, 200px bottom, 60px left, 100px right — keep CTA above bottom 200px","Background must NOT be plain solid — use a diagonal gradient, radial glow, or textured fill"],"memorable_element":"Headline fills nearly full width at dramatic scale — the text IS the visual, not an accessory to it","whitespace_ratio":0.5},
  {"id":"cta-full-width","name":"CTA — Full Width Band","category":"web","subcategory":"cta","mood":["bold","action","energetic","conversion"],"zones":[{"name":"cta-band","y_start_pct":10,"y_end_pct":90,"elements":[{"role":"headline","type":"text"},{"role":"subheadline","type":"text"},{"role":"cta-button","type":"frame"},{"role":"trust-note","type":"text"}],"typography_hierarchy":{"headline":"h1","subheadline":"body","cta-button":"h3","trust-note":"caption"}}],"anti_generic":["Background MUST be primary brand color or dark gradient — never white or light gray, which makes the CTA disappear","CTA button must be a contrasting color from the background (e.g., white on primary, primary on dark) — never same-hue-different-shade","Pill button (cornerRadius: 999) with generous horizontal padding (≥48px) — rectangular small buttons feel timid"],"memorable_element":"Oversized pill CTA button (h3-scale text, 999 radius, 48px+ horizontal padding) that dominates the section","whitespace_ratio":0.6},
  {"id":"feature-bento","name":"Feature Grid — Bento","category":"web","subcategory":"features","mood":["modern","creative","dynamic","tech"],"zones":[{"name":"section-heading","y_start_pct":3,"y_end_pct":18,"elements":[{"role":"section-title","type":"text"},{"role":"section-description","type":"text"}],"typography_hierarchy":{"section-title":"h1","section-description":"body"}},{"name":"bento-row-1","y_start_pct":20,"y_end_pct":55,"elements":[{"role":"primary-card-visual","type":"image"},{"role":"primary-card-title","type":"text"},{"role":"primary-card-description","type":"text"},{"role":"secondary-card-1","type":"frame"}],"typography_hierarchy":{"primary-card-title":"h2","primary-card-description":"body"}},{"name":"bento-row-2","y_start_pct":58,"y_end_pct":90,"elements":[{"role":"secondary-card-2","type":"frame"},{"role":"secondary-card-3","type":"frame"}]}],"anti_generic":["Large card MUST have an accent or gradient background — never the same fill as small cards","Card corner radii must be generous (16-24px) to create the distinctive bento feel — 4-8px looks generic","At least one small card should use a contrasting background color or pattern, breaking the uniformity"],"memorable_element":"Oversized primary card with accent gradient background that visually anchors the entire grid","whitespace_ratio":0.45},
  {"id":"feature-grid-3col","name":"Feature Grid — 3 Column","category":"web","subcategory":"features","mood":["professional","organized","structured","clean"],"zones":[{"name":"section-heading","y_start_pct":5,"y_end_pct":25,"elements":[{"role":"eyebrow","type":"text"},{"role":"section-title","type":"text"},{"role":"section-description","type":"text"}],"typography_hierarchy":{"eyebrow":"caption","section-title":"h1","section-description":"body"}},{"name":"feature-grid","y_start_pct":28,"y_end_pct":85,"elements":[{"role":"card-icon","type":"frame"},{"role":"card-title","type":"text"},{"role":"card-description","type":"text"}],"typography_hierarchy":{"card-title":"h3","card-description":"body"}},{"name":"bottom-space","y_start_pct":88,"y_end_pct":100,"elements":[{"role":"section-cta","type":"frame"}],"typography_hierarchy":{"section-cta":"body"}}],"anti_generic":["Center card must be visually elevated — larger shadow, slight scale increase (102-105%), or accent border-top","Card icons must NOT all be the same size or weight — vary at least one to create visual interest","Section heading must be left-aligned or left-of-center, never dead-center with equal padding — dead-center is the #1 generic AI pattern"],"memorable_element":"Center feature card elevated with deeper shadow and subtle accent border-top, creating clear visual dominance","whitespace_ratio":0.5},
  {"id":"hero-asymmetric-left","name":"Hero — Asymmetric Left","category":"web","subcategory":"hero","mood":["modern","tech","confident","bold"],"zones":[{"name":"nav","y_start_pct":0,"y_end_pct":8,"elements":[{"role":"logo","type":"frame"},{"role":"nav-links","type":"frame"},{"role":"nav-cta","type":"frame"}],"typography_hierarchy":{"nav-links":"caption","nav-cta":"caption"}},{"name":"hero-main","y_start_pct":18,"y_end_pct":72,"elements":[{"role":"eyebrow","type":"text"},{"role":"headline","type":"text"},{"role":"subheadline","type":"text"},{"role":"cta-primary","type":"frame"},{"role":"cta-secondary","type":"text"},{"role":"hero-visual","type":"image"}],"typography_hierarchy":{"eyebrow":"caption","headline":"display","subheadline":"h3","cta-primary":"body"}},{"name":"social-proof","y_start_pct":80,"y_end_pct":90,"elements":[{"role":"metric-cards","type":"frame"}],"typography_hierarchy":{"metric-value":"h2","metric-label":"caption"}}],"anti_generic":["Hero visual MUST bleed past the right edge of the frame or overflow its container — never neatly contained","Text zone left margin must be generous (≥80px) to create editorial breathing room","CTA group must be left-aligned, never centered — centering kills the asymmetric tension"],"memorable_element":"Product visual or 3D render that bleeds past the right frame edge, creating depth and forward motion","whitespace_ratio":0.5},
  {"id":"hero-centered","name":"Hero — Centered Stack","category":"web","subcategory":"hero","mood":["versatile","clean","confident","modern"],"zones":[{"name":"nav","y_start_pct":0,"y_end_pct":8,"elements":[{"role":"logo","type":"frame"},{"role":"nav-links","type":"frame"},{"role":"nav-cta","type":"frame"}],"typography_hierarchy":{"nav-links":"caption","nav-cta":"caption"}},{"name":"hero-content","y_start_pct":20,"y_end_pct":70,"elements":[{"role":"eyebrow","type":"text"},{"role":"headline","type":"text"},{"role":"subheadline","type":"text"},{"role":"cta-primary","type":"frame"},{"role":"cta-secondary","type":"text"}],"typography_hierarchy":{"eyebrow":"caption","headline":"display","subheadline":"h3","cta-primary":"body","cta-secondary":"caption"}},{"name":"social-proof","y_start_pct":78,"y_end_pct":88,"elements":[{"role":"proof-label","type":"text"},{"role":"logos-strip","type":"frame"}],"typography_hierarchy":{"proof-label":"caption"}}],"anti_generic":["Headline font must differ from body font OR use ≥3 weight steps between levels","At least one element must break visual symmetry — offset CTA group, asymmetric spacing, or oversized text that spans near-full width","Social proof strip must NOT be a row of identical gray logos — add subtle opacity variation or colored accent on one"],"memorable_element":"Oversized headline spanning near-full canvas width with tight letter-spacing (-0.02em)","whitespace_ratio":0.55},
  {"id":"hero-split-image","name":"Hero — Split Image","category":"web","subcategory":"hero","mood":["clean","editorial","professional","elegant"],"zones":[{"name":"nav","y_start_pct":0,"y_end_pct":8,"elements":[{"role":"logo","type":"frame"},{"role":"nav-links","type":"frame"}],"typography_hierarchy":{"nav-links":"caption"}},{"name":"split-main","y_start_pct":8,"y_end_pct":100,"elements":[{"role":"headline","type":"text"},{"role":"subheadline","type":"text"},{"role":"body-text","type":"text"},{"role":"cta-primary","type":"frame"},{"role":"hero-image","type":"image"}],"typography_hierarchy":{"headline":"display","subheadline":"h3","body-text":"body","cta-primary":"body"}}],"anti_generic":["Content side must have a bold color block background (primary or accent) — never white or light gray","Image must be full-bleed within its half — no padding or borders around the image","Text content must be vertically centered within its half with generous padding (≥80px horizontal)"],"memorable_element":"Bold color block on the text side creating a strong contrast against the photographic half","whitespace_ratio":0.5},
  {"id":"pricing-3tier","name":"Pricing — 3 Tier","category":"web","subcategory":"pricing","mood":["conversion","saas","clear","structured"],"zones":[{"name":"section-heading","y_start_pct":3,"y_end_pct":18,"elements":[{"role":"section-title","type":"text"},{"role":"section-description","type":"text"},{"role":"billing-toggle","type":"frame"}],"typography_hierarchy":{"section-title":"h1","section-description":"body"}},{"name":"pricing-cards","y_start_pct":20,"y_end_pct":90,"elements":[{"role":"tier-name","type":"text"},{"role":"tier-price","type":"text"},{"role":"tier-period","type":"text"},{"role":"tier-description","type":"text"},{"role":"feature-list","type":"frame"},{"role":"tier-cta","type":"frame"},{"role":"popular-badge","type":"frame"}],"typography_hierarchy":{"tier-name":"h3","tier-price":"display","tier-period":"caption","tier-description":"body","tier-cta":"body"}}],"anti_generic":["Center card MUST be 110% scale or have accent background + deeper shadow — identical cards is the #1 pricing anti-pattern","Price number must use tabular figures and be the visually heaviest element in each card (display scale, bold weight)","Feature lists must use check icons with the tier's accent color, not generic gray bullets"],"memorable_element":"Recommended tier card at 110% scale with accent background, 'Most Popular' badge, and elevated shadow creating unmistakable hierarchy","whitespace_ratio":0.45}
] as Blueprint[];

export const PATTERNS: Record<string, PatternRecipe> = {
  "hero_block": {"description":"Hero section with optional eyebrow, headline, subheadline, primary CTA pill, and ghost CTA","props":{"eyebrow":{"type":"string","required":false,"default":""},"headline":{"type":"string","required":true},"subheadline":{"type":"string","required":false},"cta_label":{"type":"string","required":false,"default":"Get Started"},"cta_secondary_label":{"type":"string","required":false,"default":""}},"recipe":{"type":"frame","name":"Hero Block","layoutMode":"VERTICAL","primaryAxisSizingMode":"HUG","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","itemSpacing":"$tokens.spacing.2xl","paddingTop":"$tokens.spacing.3xl","paddingBottom":"$tokens.spacing.3xl","paddingLeft":"$tokens.spacing.2xl","paddingRight":"$tokens.spacing.2xl","fills":[{"type":"SOLID","color":"$tokens.colors.background"}],"children":[{"type":"text","content":"{{eyebrow}}","fontSize":"$tokens.typography.scale.caption","fontFamily":"$tokens.typography.body.family","fontWeight":600,"color":"$tokens.colors.primary","letterSpacing":3,"textCase":"UPPER","textAlign":"CENTER","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{headline}}","fontSize":"$tokens.typography.scale.display","fontFamily":"$tokens.typography.heading.family","fontWeight":700,"color":"$tokens.colors.on_surface","textAlign":"CENTER","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{subheadline}}","fontSize":"$tokens.typography.scale.body_lg","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","textAlign":"CENTER","lineHeight":1.7,"layoutSizingHorizontal":"FILL"},{"type":"frame","name":"CTA Row","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","itemSpacing":"$tokens.spacing.md","children":[{"type":"frame","name":"CTA Button","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","paddingTop":"$tokens.spacing.md","paddingBottom":"$tokens.spacing.md","paddingLeft":"$tokens.spacing.xl","paddingRight":"$tokens.spacing.xl","cornerRadius":999,"fills":[{"type":"SOLID","color":"$tokens.colors.primary"}],"children":[{"type":"text","content":"{{cta_label}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":600,"color":"$tokens.colors.on_primary"}]},{"type":"frame","name":"Ghost CTA","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","paddingTop":"$tokens.spacing.md","paddingBottom":"$tokens.spacing.md","paddingLeft":"$tokens.spacing.xl","paddingRight":"$tokens.spacing.xl","cornerRadius":999,"fills":[],"strokes":[{"type":"SOLID","color":"$tokens.colors.border"}],"strokeWeight":1.5,"children":[{"type":"text","content":"{{cta_secondary_label}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":600,"color":"$tokens.colors.on_surface"}]}]}]},"format_adaptations":{"social":{"width":1080,"paddingTop":100,"paddingBottom":100,"paddingLeft":60,"paddingRight":60,"children":[{"fontSize":20},{"fontSize":72},{"fontSize":32}]},"print":{"width":2480,"paddingTop":140,"paddingBottom":140,"paddingLeft":96,"paddingRight":96,"children":[{"fontSize":16},{"fontSize":80},{"fontSize":32}]},"presentation":{"width":1920,"paddingTop":200,"paddingBottom":200,"paddingLeft":100,"paddingRight":100,"children":[{"fontSize":16},{"fontSize":80},{"fontSize":32}]},"web":{"width":1440,"paddingTop":96,"paddingBottom":96,"paddingLeft":64,"paddingRight":64,"children":[{"fontSize":13},{"fontSize":64,"width":900},{"fontSize":22,"width":700}]}}},
  "feature_grid": {"description":"Grid of feature cards with icon, title, and description. After creating the pattern, call create_icon for each card using contextually appropriate Lucide icon names.","props":{"title_1":{"type":"string","required":true},"desc_1":{"type":"string","required":true},"title_2":{"type":"string","required":true},"desc_2":{"type":"string","required":true},"title_3":{"type":"string","required":true},"desc_3":{"type":"string","required":true},"icon_1":{"type":"string","default":"zap","description":"Lucide icon name for feature 1"},"icon_2":{"type":"string","default":"shield","description":"Lucide icon name for feature 2"},"icon_3":{"type":"string","default":"target","description":"Lucide icon name for feature 3"}},"recipe":{"type":"frame","name":"Feature Grid","layoutMode":"HORIZONTAL","primaryAxisSizingMode":"FIXED","counterAxisSizingMode":"HUG","primaryAxisAlignItems":"MIN","counterAxisAlignItems":"MIN","itemSpacing":"$tokens.spacing.xl","paddingTop":"$tokens.spacing.2xl","paddingBottom":"$tokens.spacing.2xl","paddingLeft":"$tokens.spacing.2xl","paddingRight":"$tokens.spacing.2xl","fills":[{"type":"SOLID","color":"$tokens.colors.surface"}],"children":[{"type":"frame","name":"Feature 1","layoutMode":"VERTICAL","itemSpacing":"$tokens.spacing.md","paddingTop":"$tokens.spacing.xl","paddingBottom":"$tokens.spacing.xl","paddingLeft":"$tokens.spacing.lg","paddingRight":"$tokens.spacing.lg","cornerRadius":"$tokens.radius.lg","layoutSizingHorizontal":"FILL","fills":[{"type":"SOLID","color":"$tokens.colors.background"}],"strokes":[{"type":"SOLID","color":"$tokens.colors.border","opacity":0.6}],"strokeWeight":1,"children":[{"type":"frame","name":"Icon Container","width":48,"height":48,"cornerRadius":"$tokens.radius.md","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","paddingTop":8,"paddingBottom":8,"paddingLeft":8,"paddingRight":8,"fills":[{"type":"SOLID","color":"$tokens.colors.primary","opacity":0.12}]},{"type":"text","content":"{{title_1}}","fontSize":"$tokens.typography.scale.h3","fontFamily":"$tokens.typography.heading.family","fontWeight":600,"color":"$tokens.colors.on_surface","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{desc_1}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","lineHeight":1.7,"layoutSizingHorizontal":"FILL"}]},{"type":"frame","name":"Feature 2","layoutMode":"VERTICAL","itemSpacing":"$tokens.spacing.md","paddingTop":"$tokens.spacing.xl","paddingBottom":"$tokens.spacing.xl","paddingLeft":"$tokens.spacing.lg","paddingRight":"$tokens.spacing.lg","cornerRadius":"$tokens.radius.lg","layoutSizingHorizontal":"FILL","fills":[{"type":"SOLID","color":"$tokens.colors.background"}],"strokes":[{"type":"SOLID","color":"$tokens.colors.border","opacity":0.6}],"strokeWeight":1,"children":[{"type":"frame","name":"Icon Container","width":48,"height":48,"cornerRadius":"$tokens.radius.md","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","paddingTop":8,"paddingBottom":8,"paddingLeft":8,"paddingRight":8,"fills":[{"type":"SOLID","color":"$tokens.colors.primary","opacity":0.12}]},{"type":"text","content":"{{title_2}}","fontSize":"$tokens.typography.scale.h3","fontFamily":"$tokens.typography.heading.family","fontWeight":600,"color":"$tokens.colors.on_surface","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{desc_2}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","lineHeight":1.7,"layoutSizingHorizontal":"FILL"}]},{"type":"frame","name":"Feature 3","layoutMode":"VERTICAL","itemSpacing":"$tokens.spacing.md","paddingTop":"$tokens.spacing.xl","paddingBottom":"$tokens.spacing.xl","paddingLeft":"$tokens.spacing.lg","paddingRight":"$tokens.spacing.lg","cornerRadius":"$tokens.radius.lg","layoutSizingHorizontal":"FILL","fills":[{"type":"SOLID","color":"$tokens.colors.background"}],"strokes":[{"type":"SOLID","color":"$tokens.colors.border","opacity":0.6}],"strokeWeight":1,"children":[{"type":"frame","name":"Icon Container","width":48,"height":48,"cornerRadius":"$tokens.radius.md","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","paddingTop":8,"paddingBottom":8,"paddingLeft":8,"paddingRight":8,"fills":[{"type":"SOLID","color":"$tokens.colors.primary","opacity":0.12}]},{"type":"text","content":"{{title_3}}","fontSize":"$tokens.typography.scale.h3","fontFamily":"$tokens.typography.heading.family","fontWeight":600,"color":"$tokens.colors.on_surface","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{desc_3}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","lineHeight":1.7,"layoutSizingHorizontal":"FILL"}]}]},"format_adaptations":{"social":{"layoutMode":"VERTICAL","children":[{"width":960},{"width":960},{"width":960}]},"print":{"itemSpacing":48},"presentation":{"itemSpacing":40,"paddingLeft":100,"paddingRight":100},"web":{"width":1440,"itemSpacing":32}}},
  "pricing_card": {"description":"Pricing card with plan name, price, feature list, and CTA pill","props":{"plan":{"type":"string","required":true},"price":{"type":"string","required":true},"period":{"type":"string","required":false,"default":"/month"},"features":{"type":"string","required":true},"cta_label":{"type":"string","required":false,"default":"Choose Plan"}},"recipe":{"type":"frame","name":"Pricing Card","layoutMode":"VERTICAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","itemSpacing":"$tokens.spacing.lg","paddingTop":"$tokens.spacing.2xl","paddingBottom":"$tokens.spacing.2xl","paddingLeft":"$tokens.spacing.xl","paddingRight":"$tokens.spacing.xl","cornerRadius":"$tokens.radius.lg","width":320,"fills":[{"type":"SOLID","color":"$tokens.colors.surface"}],"strokes":[{"type":"SOLID","color":"$tokens.colors.border","opacity":0.6}],"strokeWeight":1,"effects":[{"type":"DROP_SHADOW","color":"$tokens.shadows.md.color","opacity":"$tokens.shadows.md.opacity","offset":{"x":"$tokens.shadows.md.x","y":"$tokens.shadows.md.y"},"blur":"$tokens.shadows.md.blur"}],"children":[{"type":"text","content":"{{plan}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.heading.family","fontWeight":600,"color":"$tokens.colors.on_surface_muted","letterSpacing":2,"textCase":"UPPER","textAlign":"CENTER","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{price}}","fontSize":"$tokens.typography.scale.display","fontFamily":"$tokens.typography.heading.family","fontWeight":800,"color":"$tokens.colors.primary","textAlign":"CENTER","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{period}}","fontSize":"$tokens.typography.scale.caption","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","textAlign":"CENTER","layoutSizingHorizontal":"FILL"},{"type":"rectangle","name":"Divider","width":260,"height":1,"fills":[{"type":"SOLID","color":"$tokens.colors.border","opacity":0.6}]},{"type":"text","content":"{{features}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface","textAlign":"CENTER","lineHeight":1.7,"layoutSizingHorizontal":"FILL"},{"type":"frame","name":"CTA Button","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","paddingTop":"$tokens.spacing.md","paddingBottom":"$tokens.spacing.md","paddingLeft":"$tokens.spacing.xl","paddingRight":"$tokens.spacing.xl","cornerRadius":999,"fills":[{"type":"SOLID","color":"$tokens.colors.primary"}],"children":[{"type":"text","content":"{{cta_label}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":600,"color":"$tokens.colors.on_primary"}]}]},"format_adaptations":{"social":{"width":960,"paddingTop":64,"paddingBottom":64},"print":{"width":600,"paddingTop":72,"paddingBottom":72},"presentation":{"width":500,"paddingTop":48,"paddingBottom":48},"web":{"width":360,"paddingTop":40,"paddingBottom":40}}},
  "testimonial": {"description":"Testimonial block with decorative quote mark, quote text, divider, author name, and role","props":{"quote":{"type":"string","required":true},"author":{"type":"string","required":true},"role":{"type":"string","required":false,"default":""}},"recipe":{"type":"frame","name":"Testimonial","layoutMode":"VERTICAL","primaryAxisSizingMode":"HUG","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","itemSpacing":"$tokens.spacing.xl","paddingTop":"$tokens.spacing.2xl","paddingBottom":"$tokens.spacing.2xl","paddingLeft":"$tokens.spacing.2xl","paddingRight":"$tokens.spacing.2xl","cornerRadius":"$tokens.radius.lg","fills":[{"type":"SOLID","color":"$tokens.colors.surface"}],"strokes":[{"type":"SOLID","color":"$tokens.colors.border","opacity":0.6}],"strokeWeight":1,"children":[{"type":"text","content":"“","name":"Decorative Quote","fontSize":"$tokens.typography.scale.display","fontFamily":"$tokens.typography.heading.family","fontWeight":700,"color":"$tokens.colors.primary","opacity":0.2,"textAlign":"CENTER","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{quote}}","fontSize":"$tokens.typography.scale.body_lg","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface","textAlign":"CENTER","lineHeight":1.7,"layoutSizingHorizontal":"FILL"},{"type":"rectangle","name":"Author Divider","width":48,"height":2,"fills":[{"type":"SOLID","color":"$tokens.colors.primary","opacity":0.4}]},{"type":"text","content":"{{author}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.heading.family","fontWeight":600,"color":"$tokens.colors.on_surface","textAlign":"CENTER","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{role}}","fontSize":"$tokens.typography.scale.caption","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","textAlign":"CENTER","layoutSizingHorizontal":"FILL"}]},"format_adaptations":{"social":{"paddingTop":80,"paddingBottom":80,"children":[{"fontSize":96},{"fontSize":32}]},"print":{"paddingTop":64,"paddingBottom":64,"children":[{"fontSize":72},{"fontSize":28}]},"presentation":{"paddingTop":80,"paddingBottom":80,"children":[{"fontSize":96},{"fontSize":40}]},"web":{"width":800,"paddingTop":48,"paddingBottom":48,"children":[{"fontSize":64},{"fontSize":20}]}}},
  "contact_block": {"description":"Contact information block with email, phone, and address fields","props":{"email":{"type":"string","required":true},"phone":{"type":"string","required":false,"default":""},"address":{"type":"string","required":false,"default":""}},"recipe":{"type":"frame","name":"Contact Block","layoutMode":"VERTICAL","primaryAxisSizingMode":"HUG","primaryAxisAlignItems":"MIN","counterAxisAlignItems":"MIN","itemSpacing":"$tokens.spacing.xl","paddingTop":"$tokens.spacing.xl","paddingBottom":"$tokens.spacing.xl","paddingLeft":"$tokens.spacing.xl","paddingRight":"$tokens.spacing.xl","fills":[{"type":"SOLID","color":"$tokens.colors.surface"}],"strokes":[{"type":"SOLID","color":"$tokens.colors.border","opacity":0.6}],"strokeWeight":1,"children":[{"type":"text","content":"Contact","fontSize":"$tokens.typography.scale.h2","fontFamily":"$tokens.typography.heading.family","fontWeight":700,"color":"$tokens.colors.on_surface","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{email}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.primary","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{phone}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{address}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","lineHeight":1.7,"layoutSizingHorizontal":"FILL"}]},"format_adaptations":{"social":{"children":[{"fontSize":36},{"fontSize":28},{"fontSize":28},{"fontSize":24}]},"print":{"children":[{"fontSize":24},{"fontSize":14},{"fontSize":14},{"fontSize":14}]},"presentation":{"children":[{"fontSize":48},{"fontSize":24},{"fontSize":24},{"fontSize":24}]},"web":{"children":[{"fontSize":24},{"fontSize":16},{"fontSize":16},{"fontSize":16}]}}},
  "content_section": {"description":"Content section with uppercase eyebrow, heading, body text, and optional left accent variant","props":{"heading":{"type":"string","required":true},"body":{"type":"string","required":true},"subheading":{"type":"string","required":false,"default":""}},"recipe":{"type":"frame","name":"Content Section","layoutMode":"VERTICAL","primaryAxisSizingMode":"HUG","primaryAxisAlignItems":"MIN","counterAxisAlignItems":"MIN","itemSpacing":"$tokens.spacing.xl","paddingTop":"$tokens.spacing.2xl","paddingBottom":"$tokens.spacing.2xl","paddingLeft":"$tokens.spacing.2xl","paddingRight":"$tokens.spacing.2xl","fills":[{"type":"SOLID","color":"$tokens.colors.background"}],"children":[{"type":"text","content":"{{subheading}}","fontSize":"$tokens.typography.scale.caption","fontFamily":"$tokens.typography.body.family","fontWeight":600,"color":"$tokens.colors.primary","letterSpacing":2.5,"textCase":"UPPER","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{heading}}","fontSize":"$tokens.typography.scale.h1","fontFamily":"$tokens.typography.heading.family","fontWeight":700,"color":"$tokens.colors.on_surface","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{body}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","lineHeight":1.7,"layoutSizingHorizontal":"FILL"}]},"format_adaptations":{"social":{"children":[{"fontSize":24},{"fontSize":48},{"fontSize":28}]},"print":{"children":[{"fontSize":14},{"fontSize":36},{"fontSize":18}]},"presentation":{"children":[{"fontSize":18},{"fontSize":48},{"fontSize":24}]},"web":{"children":[{"fontSize":14},{"fontSize":36},{"fontSize":18}]}}},
  "image_text_row": {"description":"Horizontal layout with image placeholder on one side and text content on the other","props":{"heading":{"type":"string","required":true},"body":{"type":"string","required":true}},"recipe":{"type":"frame","name":"Image Text Row","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","itemSpacing":"$tokens.spacing.2xl","paddingTop":"$tokens.spacing.2xl","paddingBottom":"$tokens.spacing.2xl","paddingLeft":"$tokens.spacing.2xl","paddingRight":"$tokens.spacing.2xl","fills":[{"type":"SOLID","color":"$tokens.colors.background"}],"children":[{"type":"rectangle","name":"Image Placeholder","width":400,"height":300,"cornerRadius":"$tokens.radius.lg","fills":[{"type":"SOLID","color":"$tokens.colors.border"}]},{"type":"frame","name":"Text Content","layoutMode":"VERTICAL","primaryAxisSizingMode":"HUG","itemSpacing":"$tokens.spacing.xl","layoutSizingHorizontal":"FILL","children":[{"type":"text","content":"{{heading}}","fontSize":"$tokens.typography.scale.h1","fontFamily":"$tokens.typography.heading.family","fontWeight":700,"color":"$tokens.colors.on_surface","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{body}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","lineHeight":1.7,"layoutSizingHorizontal":"FILL"}]}]},"format_adaptations":{"social":{"layoutMode":"VERTICAL","children":[{"width":960,"height":500}]},"print":{"children":[{"width":500,"height":350}]},"presentation":{"children":[{"width":800,"height":500}]},"web":{"width":1440,"children":[{"width":480,"height":360}]}}},
  "gallery": {"description":"Grid gallery of image placeholders with optional captions","props":{"caption_1":{"type":"string","required":false,"default":""},"caption_2":{"type":"string","required":false,"default":""},"caption_3":{"type":"string","required":false,"default":""},"caption_4":{"type":"string","required":false,"default":""}},"recipe":{"type":"frame","name":"Gallery","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"MIN","counterAxisAlignItems":"MIN","itemSpacing":"$tokens.spacing.lg","paddingTop":"$tokens.spacing.xl","paddingBottom":"$tokens.spacing.xl","paddingLeft":"$tokens.spacing.xl","paddingRight":"$tokens.spacing.xl","fills":[{"type":"SOLID","color":"$tokens.colors.background"}],"children":[{"type":"frame","name":"Gallery Item 1","layoutMode":"VERTICAL","itemSpacing":"$tokens.spacing.sm","children":[{"type":"rectangle","name":"Image 1","width":200,"height":200,"cornerRadius":"$tokens.radius.md","fills":[{"type":"SOLID","color":"$tokens.colors.border"}]},{"type":"text","content":"{{caption_1}}","fontSize":"$tokens.typography.scale.caption","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","layoutSizingHorizontal":"FILL"}]},{"type":"frame","name":"Gallery Item 2","layoutMode":"VERTICAL","itemSpacing":"$tokens.spacing.sm","children":[{"type":"rectangle","name":"Image 2","width":200,"height":200,"cornerRadius":"$tokens.radius.md","fills":[{"type":"SOLID","color":"$tokens.colors.border"}]},{"type":"text","content":"{{caption_2}}","fontSize":"$tokens.typography.scale.caption","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","layoutSizingHorizontal":"FILL"}]},{"type":"frame","name":"Gallery Item 3","layoutMode":"VERTICAL","itemSpacing":"$tokens.spacing.sm","children":[{"type":"rectangle","name":"Image 3","width":200,"height":200,"cornerRadius":"$tokens.radius.md","fills":[{"type":"SOLID","color":"$tokens.colors.border"}]},{"type":"text","content":"{{caption_3}}","fontSize":"$tokens.typography.scale.caption","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","layoutSizingHorizontal":"FILL"}]},{"type":"frame","name":"Gallery Item 4","layoutMode":"VERTICAL","itemSpacing":"$tokens.spacing.sm","children":[{"type":"rectangle","name":"Image 4","width":200,"height":200,"cornerRadius":"$tokens.radius.md","fills":[{"type":"SOLID","color":"$tokens.colors.border"}]},{"type":"text","content":"{{caption_4}}","fontSize":"$tokens.typography.scale.caption","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted","layoutSizingHorizontal":"FILL"}]}]},"format_adaptations":{"social":{"children":[{"children":[{"width":480,"height":480}]},{"children":[{"width":480,"height":480}]},{"children":[{"width":480,"height":480}]},{"children":[{"width":480,"height":480}]}]},"print":{"children":[{"children":[{"width":350,"height":350}]},{"children":[{"width":350,"height":350}]},{"children":[{"width":350,"height":350}]},{"children":[{"width":350,"height":350}]}]},"presentation":{"children":[{"children":[{"width":380,"height":280}]},{"children":[{"width":380,"height":280}]},{"children":[{"width":380,"height":280}]},{"children":[{"width":380,"height":280}]}]},"web":{"children":[{"children":[{"width":280,"height":280}]},{"children":[{"width":280,"height":280}]},{"children":[{"width":280,"height":280}]},{"children":[{"width":280,"height":280}]}]}}},
  "data_row": {"description":"Stat display with large number and label — for dashboards and data slides","props":{"value":{"type":"string","required":true},"label":{"type":"string","required":true}},"recipe":{"type":"frame","name":"Data Row","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","itemSpacing":"$tokens.spacing.lg","paddingTop":"$tokens.spacing.xl","paddingBottom":"$tokens.spacing.xl","paddingLeft":"$tokens.spacing.xl","paddingRight":"$tokens.spacing.xl","cornerRadius":"$tokens.radius.md","fills":[{"type":"SOLID","color":"$tokens.colors.surface"}],"strokes":[{"type":"SOLID","color":"$tokens.colors.border","opacity":0.6}],"strokeWeight":1,"children":[{"type":"text","content":"{{value}}","fontSize":"$tokens.typography.scale.display","fontFamily":"$tokens.typography.heading.family","fontWeight":800,"color":"$tokens.colors.primary"},{"type":"text","content":"{{label}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_surface_muted"}]},"format_adaptations":{"social":{"layoutMode":"VERTICAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","children":[{"fontSize":64,"textAlign":"CENTER"},{"fontSize":28,"textAlign":"CENTER"}]},"print":{"children":[{"fontSize":48},{"fontSize":18}]},"presentation":{"itemSpacing":"$tokens.spacing.xl","children":[{"fontSize":56},{"fontSize":24}]},"web":{"width":1440,"children":[{"fontSize":48},{"fontSize":16}]}}},
  "cta_banner": {"description":"Full-width call-to-action banner with headline, optional subtext, and pill button","props":{"headline":{"type":"string","required":true},"subtext":{"type":"string","required":false,"default":""},"cta_label":{"type":"string","required":false,"default":"Get Started"}},"recipe":{"type":"frame","name":"CTA Banner","layoutMode":"HORIZONTAL","primaryAxisSizingMode":"HUG","primaryAxisAlignItems":"SPACE_BETWEEN","counterAxisAlignItems":"CENTER","paddingTop":"$tokens.spacing.2xl","paddingBottom":"$tokens.spacing.2xl","paddingLeft":"$tokens.spacing.2xl","paddingRight":"$tokens.spacing.2xl","cornerRadius":"$tokens.radius.lg","fills":[{"type":"SOLID","color":"$tokens.colors.primary"}],"children":[{"type":"frame","name":"CTA Text","layoutMode":"VERTICAL","primaryAxisSizingMode":"HUG","itemSpacing":"$tokens.spacing.sm","layoutSizingHorizontal":"FILL","children":[{"type":"text","content":"{{headline}}","fontSize":"$tokens.typography.scale.h1","fontFamily":"$tokens.typography.heading.family","fontWeight":700,"color":"$tokens.colors.on_primary","layoutSizingHorizontal":"FILL"},{"type":"text","content":"{{subtext}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":400,"color":"$tokens.colors.on_primary","opacity":0.75,"layoutSizingHorizontal":"FILL"}]},{"type":"frame","name":"CTA Button","layoutMode":"HORIZONTAL","primaryAxisAlignItems":"CENTER","counterAxisAlignItems":"CENTER","paddingTop":"$tokens.spacing.md","paddingBottom":"$tokens.spacing.md","paddingLeft":"$tokens.spacing.xl","paddingRight":"$tokens.spacing.xl","cornerRadius":999,"fills":[{"type":"SOLID","color":"#FFFFFF"}],"children":[{"type":"text","content":"{{cta_label}}","fontSize":"$tokens.typography.scale.body","fontFamily":"$tokens.typography.body.family","fontWeight":600,"color":"$tokens.colors.primary"}]}]},"format_adaptations":{"social":{"width":1080,"paddingTop":64,"paddingBottom":64,"children":[{"children":[{"fontSize":40},{"fontSize":24}]}]},"print":{"width":2480,"paddingTop":48,"paddingBottom":48,"children":[{"children":[{"fontSize":32},{"fontSize":18}]}]},"presentation":{"width":1920,"paddingTop":48,"paddingBottom":48,"children":[{"children":[{"fontSize":40},{"fontSize":24}]}]},"web":{"width":1440,"paddingTop":40,"paddingBottom":40}}}
} as Record<string, PatternRecipe>;

export const COMPOSITION_RULES: CompositionRules = {
  "alternating_backgrounds": {
    "rule": "Non-special sections alternate: odd indices (1,3,5) use colors.background, even indices (2,4,6) use colors.surface",
    "exception": "Patterns listed in pattern_fill_defaults with primary fill always use primary regardless of position"
  },
  "pattern_fill_defaults": {
    "hero_block": "primary",
    "cta_banner": "primary",
    "data_row": "primary",
    "feature_grid": "surface",
    "testimonial": "surface",
    "image_text_row": "background",
    "content_section": "background",
    "pricing_card": "surface",
    "contact_block": "background",
    "gallery": "surface"
  },
  "vertical_rhythm": {
    "section_gap": 0,
    "layout_direction": "vertical",
    "rule": "Sections butt up against each other with no gap — internal padding creates rhythm, not external margins. Frames stack vertically in connected mode."
  },
  "color_continuity": {
    "rules": [
      "Every section has at least one element using primary color (eyebrow, icon, accent bar, button)",
      "Never have 3 consecutive sections with no primary color touch point"
    ]
  },
  "section_transitions": {
    "description": "Recommended background pairs for common pattern sequences",
    "hero_to_features": "surface",
    "features_to_image_text": "background",
    "image_text_to_data": "primary",
    "data_to_testimonial": "surface",
    "testimonial_to_cta": "primary",
    "data_between": "primary",
    "page_rhythm": "dark→light→light→dark→light→dark (bold open → breathe → breathe → bold break → breathe → bold close)"
  }
} as CompositionRules;

export const REFINEMENT_CHECKS: RefinementCheck[] = [
  {
    "id": "circle-optical-size",
    "rule": "Circles and rounded elements (cornerRadius > 50%): increase visual size +3% to appear same size as adjacent rectangles",
    "check": "If a circle is next to a rectangle of equal dimensions, the circle will look smaller. Scale the circle to 103% of the rectangle.",
    "applies_to": [
      "frame",
      "rectangle",
      "ellipse"
    ],
    "category": "optical_adjustments"
  },
  {
    "id": "descender-padding",
    "rule": "Text blocks ending with descenders (g, y, p, q): add +4px bottom padding for optical centering in containers",
    "check": "Inspect the last character of bottom-aligned text. If it has a descender, add 4px extra padding below.",
    "applies_to": [
      "text"
    ],
    "category": "optical_adjustments"
  },
  {
    "id": "uppercase-letter-spacing",
    "rule": "Uppercase text blocks: letter-spacing +0.05em minimum, +0.10em for labels/badges",
    "check": "If textCase is UPPER or text content is all-caps, letterSpacing must be >= 0.05em. For badge/chip text, >= 0.10em.",
    "applies_to": [
      "text"
    ],
    "category": "optical_adjustments"
  },
  {
    "id": "icon-text-alignment",
    "rule": "Icons next to text: vertical-center icons at text x-height (not full line height) — offset icons up 1-2px",
    "check": "When an icon is inline with text, the icon center should align with the text x-height. This typically means offsetting the icon 1-2px upward from strict center.",
    "applies_to": [
      "icon",
      "frame"
    ],
    "category": "optical_adjustments"
  },
  {
    "id": "auto-layout-edge-breathing",
    "rule": "First/last elements in auto-layout: outer padding should be 1.25x the itemSpacing for visual breathing room",
    "check": "If itemSpacing is 24px, paddingTop/paddingBottom should be at least 30px (24 × 1.25). If they're equal or less, increase outer padding.",
    "applies_to": [
      "frame"
    ],
    "category": "optical_adjustments"
  },
  {
    "id": "display-letter-spacing",
    "rule": "Display text (>40px): letter-spacing -0.02em to avoid floaty appearance",
    "check": "Any text node with fontSize > 40 should have letterSpacing <= -0.02em. If it's 0 or positive, tighten it.",
    "applies_to": [
      "text"
    ],
    "category": "typographic_refinement"
  },
  {
    "id": "inverted-pyramid",
    "rule": "Headlines with line breaks: second line should be shorter (inverted pyramid shape)",
    "check": "If a multi-line headline has a second line equal to or longer than the first, either adjust width, font-size, or rewrite to create a narrowing shape.",
    "applies_to": [
      "text"
    ],
    "category": "typographic_refinement"
  },
  {
    "id": "tabular-figures",
    "rule": "Number strings (prices, stats, percentages): use tabular figures if available (fontFeatures: 'tnum') for proper column alignment",
    "check": "Text nodes containing prices ($XX.XX), statistics, or percentage columns should use tabular figures for alignment.",
    "applies_to": [
      "text"
    ],
    "category": "typographic_refinement"
  },
  {
    "id": "line-length-cap",
    "rule": "Body text line length: cap at 65-75 characters per line maximum",
    "check": "If body text (14-20px) has lines exceeding 75 characters, either increase font size, narrow the container, or add columns.",
    "applies_to": [
      "text"
    ],
    "category": "typographic_refinement"
  },
  {
    "id": "orphan-prevention",
    "rule": "Orphan prevention: if last line of a paragraph has only 1-2 words, widen the container or adjust text to reflow",
    "check": "Inspect the last line of multi-line body text. If it contains fewer than 3 words, adjust the container width or text to prevent orphans.",
    "applies_to": [
      "text"
    ],
    "category": "typographic_refinement"
  },
  {
    "id": "warm-cool-shadows",
    "rule": "Shadows must match palette temperature: warm palette → shadow tinted warm (add 10% brown). Cool palette → shadow tinted cool (add 10% blue). Never use pure black (#000000) shadows.",
    "check": "If any shadow effect uses #000000 or pure gray, tint it. Warm palette: mix with #8B4513 at 10%. Cool palette: mix with #1E3A5F at 10%.",
    "applies_to": [
      "frame",
      "rectangle"
    ],
    "category": "color_micro_adjustments"
  },
  {
    "id": "card-elevation",
    "rule": "Card-on-background: card fill should be 3-5% lighter than section background, never identical",
    "check": "Compare card fill to parent/section background. If identical (ΔE < 1), lighten the card fill by 3-5% lightness in HSL.",
    "applies_to": [
      "frame",
      "rectangle"
    ],
    "category": "color_micro_adjustments"
  },
  {
    "id": "accent-text-lightening",
    "rule": "Accent color for text vs fills: when using accent color AS TEXT on dark bg, lighten it 15-20% from the fill version",
    "check": "If accent color (e.g. #C45A3C) is used as button fill AND as text elsewhere, the text version must be 15-20% lighter (e.g. #E8956A).",
    "applies_to": [
      "text"
    ],
    "category": "color_micro_adjustments"
  },
  {
    "id": "hover-state-derivation",
    "rule": "Hover state derivation: light theme → darken fill 10%. Dark theme → lighten fill 10%. Never invert or use unrelated color.",
    "check": "If designing interactive states, hover color must be a 10% lightness shift in the same hue direction as the theme.",
    "applies_to": [
      "frame",
      "rectangle"
    ],
    "category": "color_micro_adjustments"
  },
  {
    "id": "gradient-color-match",
    "rule": "Gradient overlays on images: gradient end color MUST equal the section background color exactly",
    "check": "The opaque end of any overlay gradient must be the exact hex color of the section/frame background. Mismatched colors create ugly visible edges.",
    "applies_to": [
      "rectangle"
    ],
    "category": "color_micro_adjustments"
  },
  {
    "id": "gradient-contrast-check",
    "rule": "Verify gradient orientation matches text position — solid end must be behind text zone",
    "check": "Text zone (where text sits): gradient opacity ≥ 0.85 | Image zone (where image shows): gradient opacity ≤ 0.15 | If text is at bottom but gradient is solid at top: FLIP the direction | If text is at top but gradient is solid at bottom: FLIP the direction",
    "applies_to": [
      "rectangle"
    ],
    "category": "color_micro_adjustments"
  },
  {
    "id": "visual-weight-balance",
    "rule": "Visual weight balance: if one side has a heavy element (image, icon cluster), the opposite side needs 15-20% more whitespace to compensate",
    "check": "In split layouts, the lighter side should have 15-20% more padding/margin than the heavier side.",
    "applies_to": [
      "frame"
    ],
    "category": "spatial_refinement"
  },
  {
    "id": "cta-isolation",
    "rule": "CTA isolation: primary CTA must have at minimum 2x the surrounding element spacing",
    "check": "If section itemSpacing is 24px, the gap before the CTA must be >= 48px. CTA must be visually separated from content.",
    "applies_to": [
      "frame"
    ],
    "category": "spatial_refinement"
  },
  {
    "id": "content-density",
    "rule": "Content density: no more than 60% of any section should be filled. 40% minimum breathing room.",
    "check": "Sum of all child element areas / section area should be <= 0.60. If higher, increase section size or reduce element count.",
    "applies_to": [
      "frame"
    ],
    "category": "spatial_refinement"
  },
  {
    "id": "fibonacci-vertical-rhythm",
    "rule": "Vertical rhythm: use Fibonacci-adjacent section gaps. If smallest gap is 24px, next is 40px, next is 64px (approximately 1:1.6:2.6)",
    "check": "Section gaps should follow approximate Fibonacci scaling: each subsequent gap is ~1.6x the previous. Gaps like 24→24→24 (equal) are mechanical.",
    "applies_to": [
      "frame"
    ],
    "category": "spatial_refinement"
  },
  {
    "id": "edge-proximity",
    "rule": "Edge proximity: no element should be closer than the section margin to ANY frame edge",
    "check": "If margin is 48px, no element's bounding box should be within 48px of any frame edge. Check all four sides.",
    "applies_to": [
      "frame",
      "text",
      "rectangle",
      "image"
    ],
    "category": "spatial_refinement"
  },
  {
    "id": "mandatory-standout",
    "rule": "EVERY design MUST have one disproportionate visual element. This is non-negotiable.",
    "check": "Identify the single element that breaks the pattern. If everything is proportional and evenly distributed, the design has failed.",
    "applies_to": [],
    "category": "memorable_element"
  },
  {
    "id": "standout-options",
    "rule": "Options for the memorable element: oversized number/statistic, image that bleeds an edge, high-contrast color block, dramatic negative space, accent-colored divider, circular badge/stamp, diagonal or rotated element",
    "check": "At least one element should be 2x+ larger than expected, or use a contrasting treatment that breaks the grid.",
    "applies_to": [],
    "category": "memorable_element"
  },
  {
    "id": "bot-test",
    "rule": "Test: if you removed the memorable element, would the design look like any other AI output? If yes, it's the right element.",
    "check": "Mentally remove the standout element. If the remaining design is generic, the element is doing its job.",
    "applies_to": [],
    "category": "memorable_element"
  },
  {
    "id": "content-relevance",
    "rule": "The memorable element should be related to the content's most important message",
    "check": "The standout element must amplify the primary message, not distract from it. A giant price tag works for a sale ad. A giant icon doesn't.",
    "applies_to": [],
    "category": "memorable_element"
  }
] as RefinementCheck[];

export const DESIGN_RULES: Record<string, unknown> = {
  "typography": {
    "font_pairings": {
      "description": "Mood → font pairing table. Use when no font is specified in the brief.",
      "entries": [
        {
          "mood": "Modern, tech, SaaS",
          "pairing_id": "modern",
          "heading": "Inter",
          "body": "Inter"
        },
        {
          "mood": "Classic, editorial",
          "pairing_id": "classic",
          "heading": "Playfair Display",
          "body": "Source Serif Pro"
        },
        {
          "mood": "Bold, marketing",
          "pairing_id": "bold",
          "heading": "Montserrat",
          "body": "Hind"
        },
        {
          "mood": "Luxury, fashion",
          "pairing_id": "luxury",
          "heading": "Cormorant Garamond",
          "body": "Proza Libre"
        },
        {
          "mood": "Playful, friendly",
          "pairing_id": "playful",
          "heading": "Poppins",
          "body": "Nunito"
        },
        {
          "mood": "Corporate, finance",
          "pairing_id": "corporate",
          "heading": "Roboto",
          "body": "Roboto Slab"
        },
        {
          "mood": "Journalistic, blog",
          "pairing_id": "editorial",
          "heading": "Libre Baskerville",
          "body": "Open Sans"
        },
        {
          "mood": "Minimal, portfolio",
          "pairing_id": "minimalist",
          "heading": "DM Sans",
          "body": "DM Sans"
        },
        {
          "mood": "Creative, agency",
          "pairing_id": "creative",
          "heading": "Space Grotesk",
          "body": "General Sans"
        },
        {
          "mood": "Elegant, literary",
          "pairing_id": "elegant",
          "heading": "Lora",
          "body": "Merriweather"
        },
        {
          "mood": "Scholarly, government, institutional",
          "pairing_id": "scholarly",
          "heading": "Merriweather",
          "body": "Source Sans Pro"
        },
        {
          "mood": "Magazine, warm editorial",
          "pairing_id": "warm-editorial",
          "heading": "Playfair Display",
          "body": "Fira Sans"
        },
        {
          "mood": "Impact, condensed, news",
          "pairing_id": "impactful",
          "heading": "Oswald",
          "body": "PT Sans"
        },
        {
          "mood": "Vintage, craft, artisan",
          "pairing_id": "slab-warmth",
          "heading": "Arvo",
          "body": "Cabin"
        },
        {
          "mood": "Architectural, gallery, refined",
          "pairing_id": "thin-geometric",
          "heading": "Raleway",
          "body": "Libre Baskerville"
        },
        {
          "mood": "Whimsical, dreamy, storytelling",
          "pairing_id": "whimsical",
          "heading": "Josefin Sans",
          "body": "Merriweather"
        },
        {
          "mood": "Universal, balanced, versatile",
          "pairing_id": "versatile",
          "heading": "Lato",
          "body": "Lato"
        },
        {
          "mood": "Journalistic, content, news",
          "pairing_id": "slab-journalistic",
          "heading": "Bitter",
          "body": "Source Sans Pro"
        },
        {
          "mood": "Polished, documentation, SaaS",
          "pairing_id": "adobe-matched",
          "heading": "Source Serif Pro",
          "body": "Source Sans Pro"
        },
        {
          "mood": "Data-dense, informational, compact",
          "pairing_id": "condensed-readable",
          "heading": "Roboto Condensed",
          "body": "Vollkorn"
        }
      ]
    },
    "line_height_rules": [
      {
        "range": ">48px (display/hero)",
        "line_height": "1.1–1.2"
      },
      {
        "range": "H1–H3 (headings)",
        "line_height": "1.3–1.4"
      },
      {
        "range": "14–18px (body)",
        "line_height": "1.5–1.6"
      },
      {
        "range": "<14px (captions)",
        "line_height": "1.6–1.8"
      }
    ],
    "letter_spacing_rules": [
      {
        "context": "Display text",
        "value": "-0.02em (tighten)"
      },
      {
        "context": "Headings",
        "value": "-0.01em"
      },
      {
        "context": "Body",
        "value": "0 (natural)"
      },
      {
        "context": "Uppercase labels",
        "value": "+0.05 to +0.15em (open up)"
      }
    ],
    "weight_hierarchy": "400 body → 500 emphasis → 600 subheadings → 700 headings → 800+ display",
    "font_consistency_rule": "When a prompt specifies a font (e.g. 'use Outfit'), use ONLY that font for the entire design. Never mix it with Inter or any other font unless the prompt explicitly requests multiple fonts. The pairing table above is for when NO font is specified — if the user names a font, that overrides the table completely. Before every create_text call, verify you are passing the correct fontFamily.\n",
    "minimum_sizes_by_format": [
      {
        "format": "Instagram/Social (1080px wide)",
        "display": "72–120px",
        "headline": "48–72px",
        "subheadline": "32–40px",
        "body": "28–32px",
        "caption": "22–26px"
      },
      {
        "format": "Print (300dpi)",
        "display": "80–140px",
        "headline": "56–80px",
        "subheadline": "36–48px",
        "body": "24–32px",
        "caption": "18–24px"
      },
      {
        "format": "Presentation (1920px wide)",
        "display": "64–96px",
        "headline": "40–64px",
        "subheadline": "28–36px",
        "body": "20–28px",
        "caption": "16–20px"
      },
      {
        "format": "Web Hero (1440px wide)",
        "display": "56–96px",
        "headline": "36–56px",
        "subheadline": "24–32px",
        "body": "16–20px",
        "caption": "12–16px"
      }
    ]
  },
  "layout": {
    "grid": "8px grid — all spacing values must come from the scale: 4|8|12|16|20|24|32|40|48|64|80|96|128",
    "margins_by_format": [
      {
        "type": "Social media",
        "range": "40–60px",
        "default": 48
      },
      {
        "type": "Print",
        "range": "72–96px",
        "default": 72
      },
      {
        "type": "Presentation slides",
        "range": "60–80px",
        "default": 64
      },
      {
        "type": "Web heroes",
        "range": "40–80px",
        "default": 64
      },
      {
        "type": "Posters",
        "range": "96–128px",
        "default": 96
      }
    ],
    "social_safe_zones": [
      {
        "platform": "Instagram",
        "top_bottom": 150,
        "sides": 60
      },
      {
        "platform": "TikTok",
        "top": 100,
        "bottom": 200,
        "left": 60,
        "right": 100
      },
      {
        "platform": "YouTube thumbnails",
        "note": "Avoid bottom-right (timestamp overlay)"
      }
    ],
    "visual_hierarchy_checklist": [
      "Headlines ≥ 2× body size",
      "At least 2 weight steps between hierarchy levels",
      "Primary text at full color, secondary at muted, tertiary at light muted",
      "Section gaps ≥ 2× item gaps"
    ]
  },
  "color": {
    "mood_to_palette": {
      "description": "Match mood keywords to palette ID in color-system.yaml",
      "entries": [
        {
          "keywords": "moody, dark, coffee, cinematic",
          "palette": "moody-dark"
        },
        {
          "keywords": "fresh, light, health, wellness",
          "palette": "fresh-light"
        },
        {
          "keywords": "corporate, business, finance",
          "palette": "corporate-professional"
        },
        {
          "keywords": "luxury, gold, premium, fashion",
          "palette": "luxury-premium"
        },
        {
          "keywords": "playful, fun, colorful, kids",
          "palette": "playful-fun"
        },
        {
          "keywords": "nature, organic, eco, botanical",
          "palette": "nature-organic"
        },
        {
          "keywords": "tech, digital, AI, startup",
          "palette": "tech-modern"
        },
        {
          "keywords": "warm, cozy, autumn, bakery",
          "palette": "warm-cozy"
        },
        {
          "keywords": "minimal, clean, monochrome",
          "palette": "minimal-clean"
        },
        {
          "keywords": "retro, vintage, nostalgic",
          "palette": "retro-vintage"
        },
        {
          "keywords": "ocean, calm, serene, spa",
          "palette": "ocean-calm"
        },
        {
          "keywords": "sunset, energy, sport, music",
          "palette": "sunset-energy"
        }
      ]
    },
    "contrast_rules": [
      {
        "text_size": "Normal (<18px)",
        "min_ratio": "4.5:1"
      },
      {
        "text_size": "Large (≥18px)",
        "min_ratio": "3:1"
      }
    ],
    "forbidden": "Light grey background + timid blue accent — this is the generic AI look."
  },
  "gradients": {
    "overlay_rules": {
      "description": "When placing text over an image, the gradient direction depends on WHERE the text sits, not a fixed recipe. Place solid opacity at the text, transparency at the image.\n",
      "text_position_map": [
        {
          "position": "Bottom",
          "direction": "bottom-top",
          "stop_0": "opacity: 0 (top = transparent, image shows)",
          "stop_1": "opacity: 1 (bottom = solid, text readable)"
        },
        {
          "position": "Top",
          "direction": "top-bottom",
          "stop_0": "opacity: 0 (bottom = transparent)",
          "stop_1": "opacity: 1 (top = solid)"
        },
        {
          "position": "Left",
          "direction": "left-right",
          "stop_0": "opacity: 0 (right = transparent)",
          "stop_1": "opacity: 1 (left = solid)"
        },
        {
          "position": "Right",
          "direction": "right-left",
          "stop_0": "opacity: 0 (left = transparent)",
          "stop_1": "opacity: 1 (right = solid)"
        }
      ],
      "rules": [
        "Only 2 stops. Never 3+.",
        "The 0.4–0.5 breakpoint: 40-50% of the overlay is fully solid.",
        "Gradient color ALWAYS matches section/page background color.",
        "NEVER use black gradient on a light section or white gradient on a dark section."
      ]
    }
  },
  "print": {
    "mandatory_auto_layout": "ALL print designs (A4+) MUST use auto-layout exclusively. Never use absolute x/y positioning. Absolute positioning on A4 (2480×3508px) creates unpredictable gaps.\n",
    "spacing_scale": [
      {
        "token": "page-margin",
        "size": "72px",
        "usage": "Root frame padding on all sides"
      },
      {
        "token": "section-gap",
        "size": "48–64px",
        "usage": "Between major page sections"
      },
      {
        "token": "content-gap",
        "size": "24–32px",
        "usage": "Between heading and body, or between content blocks"
      },
      {
        "token": "element-gap",
        "size": "12–16px",
        "usage": "Between list items, paragraphs, small elements"
      },
      {
        "token": "tight-gap",
        "size": "4–8px",
        "usage": "Between icon and label, or label and value"
      }
    ],
    "page_structure": "Page Frame (VERTICAL auto-layout, padding: 72 all sides, itemSpacing: 48-64)\n├── Header (HORIZONTAL auto-layout, gap: 16)\n├── Main Content (VERTICAL auto-layout, gap: 32)\n│   ├── Section (VERTICAL auto-layout, gap: 16)\n│   │   ├── Section heading\n│   │   ├── Body text\n│   │   └── Supporting image\n│   └── Card grid (HORIZONTAL auto-layout, gap: 16)\n└── Footer (HORIZONTAL auto-layout, gap: 16)\n",
    "auto_layout_rules": [
      "Call set_auto_layout on EVERY frame — root, sections, subsections, card groups.",
      "Use itemSpacing from the spacing scale above.",
      "Use paddingTop/Right/Bottom/Left on root frame for page margins.",
      "For multi-column: HORIZONTAL parent with VERTICAL children.",
      "Set primaryAxisSizingMode: FIXED, counterAxisSizingMode: FILL on child frames.",
      "If page looks empty: reduce section-gap or add content. Never leave >100px unstructured space."
    ],
    "typography_hierarchy": [
      {
        "level": "Display",
        "size": "96–120px",
        "weight": "700–800",
        "usage": "Cover title only"
      },
      {
        "level": "H1 — Page Title",
        "size": "64–80px",
        "weight": "700",
        "usage": "Page/section main title"
      },
      {
        "level": "H2 — Section Title",
        "size": "40–48px",
        "weight": "600–700",
        "usage": "Section headings"
      },
      {
        "level": "H3 — Subsection",
        "size": "28–32px",
        "weight": "600",
        "usage": "Sub-headings, card titles"
      },
      {
        "level": "Body",
        "size": "24–28px",
        "weight": "400",
        "usage": "Main body text (NEVER below 24px on A4)"
      },
      {
        "level": "Caption",
        "size": "18–22px",
        "weight": "400",
        "usage": "Photo captions, footnotes"
      },
      {
        "level": "Label",
        "size": "16–18px",
        "weight": "500–600 UPPERCASE",
        "usage": "Tags, categories (tracking 0.1em)"
      }
    ],
    "size_ratios": [
      "H1 ≥ 2.5× Body",
      "H2 ≥ 1.5× Body",
      "H3 ≥ 1.1× Body",
      "Body NEVER below 24px on A4 print"
    ]
  },
  "evaluation": {
    "checklist_16": [
      "Alignment — All elements on a consistent grid? No stray offsets?",
      "Contrast — All text readable? WCAG AA?",
      "Hierarchy — Clear reading order: first, second, third?",
      "Whitespace — Enough breathing room? Not cramped?",
      "Consistency — Spacing, colors, fonts consistent throughout?",
      "Safe zones — Critical text within platform safe zone?",
      "Balance — Composition balanced, not top-heavy?",
      "Intent — Does the design serve the user's stated goal and mood?",
      "Typography polish — Display text tightened? Uppercase spaced? Lines under 75 chars?",
      "Shadow quality — Shadows match palette temperature? Not pure black?",
      "Memorable element — ONE standout element that makes this unforgettable?",
      "Refinement applied — At least 3 micro-adjustments made?",
      "Reference consulted — find_design_references called? Composition aligns with proven reference?",
      "Images resolved — All image areas filled? Zero empty rectangles remaining?",
      "Gradient direction — Solid end of every gradient overlay behind the text?",
      "Print structure — Every frame uses auto-layout? No manually positioned elements? (print only)"
    ],
    "scoring": {
      "description": "Score designs on a 1-10 scale across weighted dimensions. Total = weighted average. Target: 7+ for production, 8.5+ for portfolio-quality.\n",
      "dimensions": [
        {
          "name": "Visual Design",
          "weight": 0.3,
          "source": "Awwwards (40% → normalized to 30% with AI Distinctiveness)",
          "criteria": [
            "Color harmony and intentional palette usage",
            "Typography quality — hierarchy, spacing, font choice appropriateness",
            "Composition balance and visual flow",
            "Consistent spacing rhythm and grid adherence",
            "Professional finish — no rough edges, orphaned elements, or misalignments"
          ]
        },
        {
          "name": "Creativity & Originality",
          "weight": 0.2,
          "source": "Awwwards (20%) + 99designs (Conceptual Thought)",
          "criteria": [
            "Contains at least one memorable/unexpected element",
            "Not replicable by default parameters — shows intentional creative choices",
            "Avoids all items in the anti_patterns.ai_tells checklist",
            "Design tells a visual story — it has a concept, not just arranged elements"
          ]
        },
        {
          "name": "Content Hierarchy",
          "weight": 0.2,
          "source": "CrowdCrit (CMU) — Information Architecture dimension",
          "criteria": [
            "Clear primary-secondary-tertiary reading order",
            "User's eye naturally flows to the most important element first",
            "CTA or key message is immediately identifiable",
            "Supporting content is subordinate but accessible"
          ]
        },
        {
          "name": "Technical Execution",
          "weight": 0.15,
          "source": "99designs (Technical Skills) + checklist_16 automated checks",
          "criteria": [
            "WCAG AA contrast on all text",
            "Platform safe zones respected",
            "Images resolved (no empty rectangles)",
            "Gradient directions correct",
            "Auto-layout structure clean (print)"
          ]
        },
        {
          "name": "AI Distinctiveness",
          "weight": 0.15,
          "source": "Anti-AI research (Crea8ive Solution 2026)",
          "criteria": [
            "Would a viewer identify this as human-designed? (the 'senior designer or bot?' test)",
            "Has texture/depth — not hyper-smooth flat surfaces",
            "Includes intentional asymmetry or grid-breaking element",
            "Typography has personality — not default safe pairing",
            "Color has tension — not all same saturation, has one surprise"
          ]
        }
      ],
      "score_tiers": [
        {
          "range": "9-10",
          "label": "Exceptional",
          "description": "Award-worthy. Publishable as-is. Memorable and distinctive."
        },
        {
          "range": "7-8",
          "label": "Professional",
          "description": "Production-ready. Would pass client review. Clear and polished."
        },
        {
          "range": "5-6",
          "label": "Adequate",
          "description": "Functional but generic. Needs creative refinement."
        },
        {
          "range": "3-4",
          "label": "Below Standard",
          "description": "Obvious issues. Looks AI-generated. Needs significant rework."
        },
        {
          "range": "1-2",
          "label": "Failed",
          "description": "Broken layout, unreadable text, or fundamentally flawed."
        }
      ]
    }
  },
  "refinement": {
    "pass_steps": [
      {
        "step": "Typography tightening",
        "check": "Display text letter-spacing -0.02em? Uppercase labels +0.05em or more?"
      },
      {
        "step": "Shadow warmth",
        "check": "Shadows match palette temperature? Warm palette → warm shadow (10% brown tint). Cool → cool (10% blue tint). Never pure black."
      },
      {
        "step": "Card elevation",
        "check": "Cards 3-5% lighter than section background? Identical fills = flat hierarchy."
      },
      {
        "step": "CTA isolation",
        "check": "Primary CTA has 2× surrounding element spacing? itemSpacing 24 → gap before CTA 48+"
      },
      {
        "step": "Memorable element",
        "check": "ONE disproportionate element? Check blueprint's memorable_element hint."
      },
      {
        "step": "Whitespace ratio",
        "check": "Content density under 60%? Vertical rhythm follows Fibonacci-adjacent gaps (1:1.6:2.6)?"
      },
      {
        "step": "Accent text contrast",
        "check": "Accent color as text on dark bg: lightened 15-20% vs fill version? (e.g. button #C45A3C → text #E8956A)"
      }
    ]
  },
  "anti_patterns": {
    "description": "These are signals of generic AI output. If you catch yourself doing any of these, stop and redesign that element.\n",
    "structural": [
      "White or light-grey background as the default for any hero or full-page design",
      "Inter Regular for everything — weight variation is the minimum; font variety is better",
      "Centered text on every single element — vary alignment by hierarchy level",
      "Equal padding on every frame — vary padding to create visual rhythm",
      "Three feature cards that look identical to every other three-card grid ever generated",
      "CTA button in the same blue/purple as every other SaaS product — commit to something specific",
      "Pricing cards with no visual hierarchy — one card must dominate (scale, color, shadow)",
      "Shadow on everything or shadow on nothing — use shadow to direct attention",
      "A design with no negative space — some elements should breathe alone",
      "Typography without contrast — if all text is the same weight and size, hierarchy is broken",
      "Gradient overlay with wrong color — gradient end doesn't match section background = ugly visible edge",
      "fontWeight 600 on non-Inter fonts — silently falls back to Inter. Only use 400 or 700 unless verified.",
      "Content frames with fixed height — clips text on overflow. Use layoutSizingVertical: HUG on text containers.",
      "Gradient solid end facing away from text — most common AI gradient mistake. Solid must be behind text.",
      "Absolute positioning on print pages — creates random gaps. Every print frame MUST use auto-layout."
    ],
    "ai_tells": {
      "surfaces": [
        {
          "marker": "Hyper-smooth surfaces with no texture variation",
          "fix": "Add subtle grain/noise overlay at 3-8% opacity on large fill areas. Layer a scanned paper or fabric texture."
        },
        {
          "marker": "Noise-free backgrounds — zero texture, perfectly clean",
          "fix": "Even 'clean' designs need micro-texture. A 2-4% noise layer prevents the sterile AI look."
        },
        {
          "marker": "Plastic-like shadows — identical angle, blur, and spread on every element",
          "fix": "Vary shadow properties across elements. Use warm shadow tint for warm palettes, cool for cool."
        }
      ],
      "composition": [
        {
          "marker": "Perfect symmetry — every element centered, balanced, mathematically safe",
          "fix": "Offset at least one major element. Introduce slight asymmetry (60/40 split instead of 50/50)."
        },
        {
          "marker": "Grid-locked layouts with no visual tension",
          "fix": "Break the grid with one overlapping element, one element bleeding into an adjacent section, or scale contrast."
        },
        {
          "marker": "Uniform spacing — identical gaps everywhere, mathematically optimized",
          "fix": "Vary spacing deliberately: tighter grouping for related items, generous whitespace for separation."
        }
      ],
      "typography": [
        {
          "marker": "Default font pairing — safe sans + safe serif with no personality",
          "fix": "Choose a font with character (Bitter, Josefin Sans, Playfair Display) — a font the user would remember."
        },
        {
          "marker": "Every text block center-aligned identically",
          "fix": "Mix alignments by hierarchy: left-align body, center display, right-align accents."
        }
      ],
      "color": [
        {
          "marker": "Generic color harmony — safe, balanced palette with no tension or surprise",
          "fix": "Introduce one unexpected color. Mix muted and vivid saturation levels intentionally."
        },
        {
          "marker": "Every color at the same saturation — flat, even, no depth",
          "fix": "Use 2-3 saturation levels: vivid for CTA, muted for backgrounds, mid for secondary elements."
        }
      ],
      "meta": [
        {
          "marker": "Replicable perfection — work that any tool could produce with the same parameters",
          "fix": "Add ONE non-obvious creative choice: an unusual color treatment, a broken grid element, a typographic surprise."
        },
        {
          "marker": "No memorable element — nothing stands out, everything is equally 'nice'",
          "fix": "Every design needs a focal point that could not have been generated by default parameters."
        }
      ]
    }
  },
  "taste": {
    "description": "Design taste rules — apply when no brand system is specified or creative latitude is given.",
    "aesthetic_directions": [
      {
        "name": "editorial",
        "description": "Asymmetric grids, large serif display, generous whitespace, minimal color"
      },
      {
        "name": "brutalist",
        "description": "Raw structure exposed, stark contrast, oversized type, no decoration"
      },
      {
        "name": "organic",
        "description": "Soft curves, warm tones, layered textures, humanist sans-serif"
      },
      {
        "name": "luxury",
        "description": "Near-black backgrounds, gold/champagne accents, thin serifs, airspace"
      },
      {
        "name": "geometric",
        "description": "Clean grids, primary color blocks, sans-serif, mathematical spacing"
      },
      {
        "name": "playful",
        "description": "Bold saturated colors, rounded type, irregular layouts, energetic"
      }
    ],
    "rules": [
      {
        "rule": "Commit to ONE aesthetic direction before calling any tool."
      },
      {
        "rule": "Typography is the first decision — never default to Inter/Inter."
      },
      {
        "rule": "Pick a dominant color story and paint with it boldly. Forbidden: light grey + timid blue."
      },
      {
        "rule": "Never use flat solid fills on hero sections — always depth (gradient, radial glow, etc.)"
      },
      {
        "rule": "Increase all padding by 1.5× what feels enough. Designs need room to breathe."
      },
      {
        "rule": "Every brief produces a visually distinct output — actively diverge from the last design."
      },
      {
        "rule": "After every get_screenshot: does this look like a senior designer or a bot? Fix the most generic element."
      },
      {
        "rule": "Every design must have ONE element that makes it unforgettable (giant headline, unexpected color, full-bleed image)."
      }
    ]
  }
};

export const KNOWLEDGE_VERSION: string = "13ae97f984b509e7";
