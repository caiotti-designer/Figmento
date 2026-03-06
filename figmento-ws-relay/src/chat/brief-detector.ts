/**
 * Smart Brief Detection — server-side port of figmento/src/ui/brief-detector.ts.
 * Lightweight keyword parser. No AI calls — pure string matching.
 */

export interface DesignBrief {
  format: string | null;
  mood: string | null;
  designType: 'single' | 'multi-section' | null;
  keywords: string[];
}

interface FormatPattern {
  id: string;
  patterns: RegExp[];
}

const FORMAT_PATTERNS: FormatPattern[] = [
  { id: 'ig-post', patterns: [/instagram\s*post/i, /ig\s*post/i, /insta\s*post/i] },
  { id: 'ig-square', patterns: [/instagram\s*square/i] },
  { id: 'ig-story', patterns: [/instagram\s*stor(y|ies)/i, /ig\s*stor(y|ies)/i, /insta\s*stor(y|ies)/i, /instagram\s*reel/i] },
  { id: 'ig-carousel', patterns: [/instagram\s*carousel/i, /ig\s*carousel/i, /insta\s*carousel/i] },
  { id: 'fb-post', patterns: [/facebook\s*post/i, /fb\s*post/i] },
  { id: 'fb-story', patterns: [/facebook\s*stor(y|ies)/i] },
  { id: 'fb-cover', patterns: [/facebook\s*cover/i, /fb\s*cover/i] },
  { id: 'fb-ad', patterns: [/facebook\s*ad/i, /fb\s*ad/i] },
  { id: 'x-post', patterns: [/twitter\s*post/i, /x\s*post/i, /tweet/i] },
  { id: 'x-header', patterns: [/twitter\s*header/i, /x\s*header/i, /twitter\s*banner/i] },
  { id: 'linkedin-post', patterns: [/linkedin\s*post/i] },
  { id: 'linkedin-banner', patterns: [/linkedin\s*banner/i] },
  { id: 'pinterest-pin', patterns: [/pinterest\s*pin/i, /pinterest/i] },
  { id: 'tiktok', patterns: [/tiktok/i] },
  { id: 'yt-thumbnail', patterns: [/youtube\s*thumbnail/i, /yt\s*thumbnail/i] },
  { id: 'yt-banner', patterns: [/youtube\s*banner/i, /yt\s*banner/i] },
  { id: 'a4', patterns: [/\ba4\b/i, /a4\s*(page|document|print|flyer)/i] },
  { id: 'a3', patterns: [/\ba3\b/i] },
  { id: 'us-letter', patterns: [/us\s*letter/i, /letter\s*size/i] },
  { id: 'business-card', patterns: [/business\s*card/i] },
  { id: 'flyer', patterns: [/\bflyer\b/i, /\bflier\b/i] },
  { id: 'poster', patterns: [/\bposter\b/i] },
  { id: 'brochure', patterns: [/\bbrochure\b/i, /\bfolder\b/i, /\bpamphlet\b/i] },
  { id: 'slide-16-9', patterns: [/presentation/i, /\bslide(s)?\b/i, /\bdeck\b/i, /pitch\s*deck/i] },
  { id: 'web-hero', patterns: [/web\s*hero/i, /hero\s*section/i, /hero\s*banner/i] },
  { id: 'landing-page', patterns: [/landing\s*page/i] },
  { id: 'web-banner', patterns: [/web\s*banner/i] },
  { id: 'ig-post', patterns: [/\binstagram\b/i] },
  { id: 'fb-post', patterns: [/\bfacebook\b/i] },
];

interface MoodPattern {
  id: string;
  keywords: string[];
}

const MOOD_PATTERNS: MoodPattern[] = [
  { id: 'moody-dark', keywords: ['moody', 'dark', 'dramatic', 'cinematic', 'noir', 'coffee', 'whiskey'] },
  { id: 'fresh-light', keywords: ['fresh', 'light', 'airy', 'spring', 'clean', 'health', 'wellness'] },
  { id: 'corporate-professional', keywords: ['corporate', 'professional', 'business', 'trustworthy', 'finance', 'enterprise'] },
  { id: 'luxury-premium', keywords: ['luxury', 'premium', 'gold', 'elegant', 'exclusive', 'fashion', 'jewelry'] },
  { id: 'playful-fun', keywords: ['playful', 'fun', 'colorful', 'vibrant', 'kids', 'games', 'party'] },
  { id: 'nature-organic', keywords: ['nature', 'organic', 'earth', 'botanical', 'sustainable', 'eco', 'garden'] },
  { id: 'tech-modern', keywords: ['tech', 'digital', 'futuristic', 'startup', 'ai', 'cyber', 'saas'] },
  { id: 'warm-cozy', keywords: ['warm', 'cozy', 'autumn', 'rustic', 'bakery', 'cafe', 'homey'] },
  { id: 'minimal-clean', keywords: ['minimal', 'simple', 'monochrome', 'black-and-white', 'scandinavian'] },
  { id: 'retro-vintage', keywords: ['retro', 'vintage', 'nostalgic', '70s', '80s', 'groovy', 'film'] },
  { id: 'ocean-calm', keywords: ['ocean', 'calm', 'serene', 'spa', 'meditation', 'water', 'blue'] },
  { id: 'sunset-energy', keywords: ['sunset', 'passionate', 'bold', 'dynamic', 'sport', 'music', 'energy'] },
];

const MULTI_SECTION_PATTERNS = [
  /landing\s*page/i,
  /multi[\s-]*section/i,
  /\bcarousel\b/i,
  /hero.*features.*pricing/i,
  /hero.*features.*cta/i,
  /multiple\s*sections/i,
  /full\s*page/i,
  /\bwebsite\b/i,
  /\bweb\s*page\b/i,
];

export function detectBrief(userMessage: string): DesignBrief {
  const msg = userMessage.toLowerCase();
  const words = msg.split(/\s+/);

  let format: string | null = null;
  for (const fp of FORMAT_PATTERNS) {
    if (fp.patterns.some(p => p.test(userMessage))) {
      format = fp.id;
      break;
    }
  }

  let mood: string | null = null;
  let bestMoodScore = 0;
  for (const mp of MOOD_PATTERNS) {
    let score = 0;
    for (const kw of mp.keywords) {
      if (msg.includes(kw)) score++;
    }
    if (score > bestMoodScore) {
      bestMoodScore = score;
      mood = mp.id;
    }
  }

  let designType: 'single' | 'multi-section' | null = null;
  if (MULTI_SECTION_PATTERNS.some(p => p.test(userMessage))) {
    designType = 'multi-section';
  } else if (format || mood) {
    designType = 'single';
  }

  const stopWords = new Set(['a', 'an', 'the', 'for', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'of', 'is', 'it', 'my', 'me', 'i', 'with', 'this', 'that', 'create', 'make', 'design', 'please', 'can', 'you', 'want', 'need', 'like']);
  const keywords = words
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 20);

  return { format, mood, designType, keywords };
}
