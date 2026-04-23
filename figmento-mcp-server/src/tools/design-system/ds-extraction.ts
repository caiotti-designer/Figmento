// ═══════════════════════════════════════════════════════════
// Extraction Tools: generate_design_system_from_url, refine_design_system
// CRITICAL: Does NOT import ds-crud.ts for saving — uses saveFn callback
// ═══════════════════════════════════════════════════════════

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';
import { hexToHsl, hslToHex, lighten, darken, rotateHue, desaturate, bestTextColor, hexToRgb, rgbToHsl, relativeLuminance } from '../utils/color';
import { getDesignSystemsDir } from '../utils/knowledge-paths';
import { getByDotPath, setByDotPath } from '../utils/tokens';
import { generateDesignSystemFromUrlSchema, refineDesignSystemSchema, importDesignMdSchema, exportDesignMdSchema, validateDesignMdSchema } from './ds-schemas';
import { generateTokens, listAvailableSystems } from './ds-crud';
import { parseDesignMd } from './ds-md-parser';
import { validateDesignMdIR } from './ds-md-validator';
import { irToTokens } from './ds-md-to-tokens';
import { tokensToIR } from './ds-tokens-to-ir';
import { renderMarkdown } from './ds-ir-to-markdown';
import type { DesignTokens, PresetDefaults, ExtractedDesignTokens, VisionExtraction, HybridMergeResult, SendDesignCommand } from './ds-types';

// ═══════════════════════════════════════════════════════════
// URL Fetching
// ═══════════════════════════════════════════════════════════

async function fetchUrl(url: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 5) throw new Error('Too many redirects');
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = url.startsWith('https') ? require('https') : require('http');
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FigmentoBot/1.0; +https://figmento.dev)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    };
    const req = mod.get(url, options, (res: { statusCode: number; headers: Record<string, string>; on: (e: string, cb: (chunk: Buffer) => void) => void }) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchUrl(res.headers.location, redirectCount + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout fetching URL')); });
  });
}

// ═══════════════════════════════════════════════════════════
// CSS Token Extraction
// ═══════════════════════════════════════════════════════════

// ─── EXTRACTION LIMITATIONS — READ BEFORE MODIFYING ─────────────────────
//
// This extraction pipeline is intentionally "best effort". Here's what works
// and what doesn't, so future sessions don't try to "fix" it without context:
//
// WHAT WORKS:
// - CSS hex color extraction from inline styles and <style> blocks
// - :root / body CSS variable detection (--primary, --brand, etc.)
// - Google Fonts URL parsing (link tags and JS-injected)
// - @font-face family detection for self-hosted fonts
// - Typekit/Adobe Fonts URL detection
// - Vision-based structural analysis (border radius, shadows, spacing density)
//
// WHAT DOESN'T WORK (and why):
// - Modern JS-rendered sites (React/Next/Vue) serve minimal HTML — most
//   styles are in JS bundles or CSS-in-JS, invisible to our HTML parser.
// - CSS custom properties like var(--font-monospace) leak through as font
//   names because we can't resolve CSS variable chains.
// - Sites behind Cloudflare/bot-protection return challenge pages, not content.
// - Vision can detect structural properties (rounded vs sharp, shadows vs flat)
//   but cannot reliably identify exact hex colors or font names from a screenshot.
// - Dark-themed sites get light-theme defaults because the color generation
//   pipeline assumes light backgrounds when CSS extraction finds no surface colors.
//
// DESIGN DECISION:
// Rather than making extraction "smarter" (diminishing returns), we pair it
// with refine_design_system — a guided refinement tool that asks the user
// 5 targeted questions and patches the draft tokens. This "draft + refine"
// pattern is more reliable than any amount of automated extraction.
// ────────────────────────────────────────────────────────────────────────────
function extractDesignTokens(html: string): ExtractedDesignTokens {
  // Known web fonts for normalization
  const KNOWN_FONTS = [
    'Inter', 'Roboto', 'Poppins', 'Montserrat', 'Lato', 'Open Sans', 'Nunito',
    'Source Sans Pro', 'Raleway', 'Playfair Display', 'Merriweather', 'DM Sans',
    'Space Grotesk', 'Outfit', 'Figtree', 'Plus Jakarta Sans', 'Sora',
    'Geist', 'SF Pro', 'Helvetica Neue', 'Helvetica',
  ];

  // Brand color filter: saturation > 30% to avoid greys and near-neutral noise
  const isBrandColor = (hex: string): boolean => {
    const { r, g, b } = hexToRgb(hex);
    const { s, l } = rgbToHsl(r, g, b);
    return s > 0.30 && l > 0.10 && l < 0.90;
  };

  // ─── Strip third-party and script-embedded colors before analysis ──────
  const THIRD_PARTY_RE = [
    /gstatic\.com/i, /googleapis\.com/i, /doubleclick\.net/i,
    /googletagmanager\.com/i, /google-analytics\.com/i,
    /facebook\.net/i, /twitter\.com/i,
  ];
  const isThirdParty = (s: string) => THIRD_PARTY_RE.some(p => p.test(s));
  const cleanedHtml = html
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (m, inner) => isThirdParty(inner) ? '' : m);

  // ─── Position heuristic: :root and body blocks are highest-priority ────
  const rootBodyHexes = new Set<string>();
  const rootBodyCssVars: Record<string, string> = {};
  for (const blk of cleanedHtml.matchAll(/(?::root|body)\s*\{([^}]+)\}/gi)) {
    const block = blk[1];
    for (const vm of block.matchAll(/--([a-zA-Z][\w-]*):\s*(#[0-9A-Fa-f]{6})\b/gi)) {
      rootBodyCssVars[vm[1].toLowerCase()] = vm[2].toLowerCase();
    }
    for (const cm of block.matchAll(/#([0-9A-Fa-f]{6})\b/g)) {
      rootBodyHexes.add(cm[0].toLowerCase());
    }
  }

  // ─── CSS custom properties with brand keyword names ────────────────────
  const BRAND_VAR_KEYWORDS = ['primary', 'brand', 'color-primary', 'primary-color', 'accent', 'main', 'theme'];
  const allCssVars: Record<string, string> = {};
  for (const m of cleanedHtml.matchAll(/--([a-zA-Z][\w-]*):\s*(#[0-9A-Fa-f]{6})\b/gi)) {
    allCssVars[m[1].toLowerCase()] = m[2].toLowerCase();
  }

  let primaryColor: string | undefined;
  for (const kw of BRAND_VAR_KEYWORDS) {
    const inRoot = Object.entries(rootBodyCssVars).find(([k]) => k === kw || k.startsWith(kw) || k.endsWith('-' + kw));
    if (inRoot && isBrandColor(inRoot[1])) { primaryColor = inRoot[1]; break; }
    const inDoc = Object.entries(allCssVars).find(([k]) => k === kw || k.startsWith(kw) || k.endsWith('-' + kw));
    if (inDoc && isBrandColor(inDoc[1])) { primaryColor = inDoc[1]; break; }
  }

  // ─── Hex frequency analysis (boosting :root/body hits × 3) ───────────
  const rawColors = [...cleanedHtml.matchAll(/#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g)].map(m => {
    let h = m[0].toLowerCase();
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return h;
  });
  const colorFreq: Record<string, number> = {};
  for (const c of rawColors) colorFreq[c] = (colorFreq[c] || 0) + 1;
  for (const c of rootBodyHexes) { if (colorFreq[c]) colorFreq[c] *= 3; }

  const isNearWhiteOrBlack = (hex: string): boolean => {
    const lum = relativeLuminance(hex);
    return lum > 0.80 || lum < 0.04;
  };

  const brandColors = Object.keys(colorFreq)
    .filter(c => isBrandColor(c) && !isNearWhiteOrBlack(c))
    .sort((a, b) => colorFreq[b] - colorFreq[a]);

  let colorConfidence: 'high' | 'medium' | 'low' = 'low';

  if (primaryColor) {
    colorConfidence = 'high';
  } else if (brandColors.length > 0) {
    primaryColor = brandColors[0];
    if (rootBodyHexes.has(primaryColor)) {
      colorConfidence = 'medium';
    } else {
      colorConfidence = 'low';
    }
  }
  const secondaryColor = brandColors.find(c => c !== primaryColor);
  const accentColor = brandColors.find(c => c !== primaryColor && c !== secondaryColor);

  // ─── Multi-pass font detection ─────────────────────────────
  const normalizeFont = (f: string) => f.trim().replace(/^['"]|['"]$/g, '').trim();
  const matchKnown = (f: string): string => {
    const kf = KNOWN_FONTS.find(k => f.toLowerCase().startsWith(k.toLowerCase()));
    return kf || f;
  };
  const GENERIC_FONT = /^(inherit|initial|unset|system-ui|-apple|-webkit|sans-serif|serif|monospace|cursive|fantasy)$/i;
  const fontSet = new Set<string>();
  const fontDetectionDetails: Record<string, string> = {};
  let fontDetectionMethod = 'none';
  let typekitDetected: string | undefined;

  const addFont = (name: string, method: string) => {
    const normalized = matchKnown(name);
    if (!fontDetectionDetails[normalized]) fontDetectionDetails[normalized] = method;
    fontSet.add(normalized);
    if (fontDetectionMethod === 'none') fontDetectionMethod = method;
  };

  // Pass 1: @font-face family declarations
  for (const m of html.matchAll(/@font-face\s*\{[^}]*font-family:\s*['"]?([^'";}\n\r]+)['"]?/gi)) {
    const f = normalizeFont(m[1]);
    if (f.length > 2 && !GENERIC_FONT.test(f)) addFont(f, '@font-face');
  }

  // Pass 2: Google Fonts CDN URL in src/href attributes
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)) {
    for (const fm of m[1].matchAll(/family=([^&|"'\s]+)/gi)) {
      const familyRaw = decodeURIComponent(fm[1].replace(/\+/g, ' ')).split(':')[0].split('|')[0].trim();
      if (familyRaw.length > 1) addFont(familyRaw, 'google-fonts-url');
    }
  }

  // Pass 3: <link href="...googleapis.com/css...">
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']*fonts\.googleapis\.com[^"']*)["'][^>]*>/gi)) {
    for (const fm of m[1].matchAll(/family=([^&|"'\s]+)/gi)) {
      const familyRaw = decodeURIComponent(fm[1].replace(/\+/g, ' ')).split(':')[0].split('|')[0].trim();
      if (familyRaw.length > 1) addFont(familyRaw, 'google-fonts-link');
    }
  }

  // Pass 4: Typekit / Adobe Fonts detection
  for (const m of html.matchAll(/<link[^>]+href=["'](https?:\/\/use\.typekit\.net\/[^"']+)["'][^>]*>/gi)) {
    typekitDetected = m[1];
  }

  // Pass 5 (fallback): inline font-family declarations in CSS
  if (fontSet.size === 0) {
    const allFontRaw = [...html.matchAll(/font-family:\s*['"]?([^'";,\n\r}]+)['"]?/gi)]
      .flatMap(m => m[1].split(',').map(normalizeFont));
    for (const f of allFontRaw) {
      if (f.length > 2 && !GENERIC_FONT.test(f)) addFont(f, 'font-family-css');
    }
  }

  const allFonts = [...fontSet].slice(0, 6);
  const headingFont = allFonts[0];
  const bodyFont = allFonts[1] || allFonts[0];

  // ─── Border radius ─────────────────────────────────────────────────────
  const radii = [...cleanedHtml.matchAll(/border-radius:\s*(\d+)px/g)]
    .map(m => parseInt(m[1])).filter(r => r > 0 && r < 100);
  const borderRadius = radii.length > 0
    ? Math.round(radii.reduce((a, b) => a + b, 0) / radii.length)
    : undefined;

  return {
    colors: brandColors.slice(0, 10),
    fonts: allFonts,
    primaryColor,
    secondaryColor,
    accentColor,
    headingFont,
    bodyFont,
    borderRadius,
    mood: [],
    fontDetectionMethod,
    fontDetectionDetails,
    typekitDetected,
    colorConfidence,
  };
}

// ═══════════════════════════════════════════════════════════
// Vision Extraction (screenshot + Gemini vision)
// ═══════════════════════════════════════════════════════════

const VISION_DEFAULTS: VisionExtraction = {
  heading_font: null,
  body_font: null,
  border_radius: 8,
  has_gradients: false,
  gradient_direction: null,
  gradient_colors: null,
  shadow_style: 'subtle',
  card_style: 'bordered',
  button_style: 'filled',
  spacing_density: 'normal',
  overall_mood: ['modern', 'professional', 'clean'],
  design_personality: 'A modern, professional web presence.',
  confidence: {},
};

async function fetchScreenshot(url: string): Promise<Buffer | null> {
  const services = [
    `https://image.thum.io/get/width/1440/${url}`,
    `https://mini.s-shot.ru/1440x900/JPEG/1440/${url}`,
  ];

  for (const screenshotUrl of services) {
    try {
      const buf = await new Promise<Buffer>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = screenshotUrl.startsWith('https') ? require('https') : require('http');
        const req = mod.get(screenshotUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FigmentoBot/1.0)' },
        }, (res: { statusCode: number; headers: Record<string, string>; on: (e: string, cb: (chunk: Buffer) => void) => void }) => {
          if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
          const contentType = res.headers['content-type'] || '';
          if (!contentType.startsWith('image/')) { reject(new Error(`Not an image: ${contentType}`)); return; }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('Screenshot timeout')); });
      });
      if (buf.length > 5000) return buf;
    } catch {
      continue;
    }
  }
  return null;
}

async function visionExtract(screenshotBase64: string): Promise<VisionExtraction | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const visionPrompt = `Analyze this website screenshot as a senior UI designer. Extract the design system and return ONLY this JSON (no markdown, no explanation):
{
  "heading_font": "font name used for headings",
  "body_font": "font name used for body text",
  "border_radius": number in px (0=sharp corners, 4=slight, 8=medium, 16=rounded, 24=very rounded, 999=pill),
  "has_gradients": boolean,
  "gradient_direction": "linear-to-right" | "linear-to-bottom" | "radial" | null,
  "gradient_colors": ["#hex1", "#hex2"] or null,
  "shadow_style": "none" | "subtle" | "medium" | "pronounced",
  "card_style": "flat" | "bordered" | "elevated" | "ghost",
  "button_style": "filled" | "outlined" | "ghost" | "pill",
  "spacing_density": "compact" | "normal" | "spacious",
  "overall_mood": ["keyword1", "keyword2", "keyword3"],
  "design_personality": "one sentence describing the brand aesthetic",
  "confidence": { "heading_font": 0.0-1.0, "body_font": 0.0-1.0, "border_radius": 0.0-1.0, "has_gradients": 0.0-1.0, "shadow_style": 0.0-1.0, "card_style": 0.0-1.0, "button_style": 0.0-1.0, "spacing_density": 0.0-1.0, "overall_mood": 0.0-1.0, "design_personality": 0.0-1.0 }
}`;

    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/png', data: screenshotBase64 } },
          { text: visionPrompt },
        ],
      }],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.1,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    // Parse JSON — handle potential markdown wrapping
    let jsonStr = text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as VisionExtraction;
    return parsed;
  } catch {
    return null;
  }
}

function mergeExtractions(
  css: ExtractedDesignTokens,
  vision: VisionExtraction | null,
): HybridMergeResult {
  const conf = vision?.confidence || {};
  const THRESHOLD = 0.6;

  const cssColors = css.colors;
  const cssFonts = css.fonts;

  const pickVision = <T>(field: string, visionVal: T | null | undefined, fallback: T): T => {
    if (!vision || visionVal == null) return fallback;
    if ((conf[field] ?? 0) < THRESHOLD) return fallback;
    return visionVal;
  };

  const heading_font = pickVision('heading_font', vision?.heading_font, css.headingFont) || undefined;
  const body_font = pickVision('body_font', vision?.body_font, css.bodyFont) || undefined;
  const border_radius = pickVision('border_radius', vision?.border_radius, css.borderRadius) ?? VISION_DEFAULTS.border_radius;
  const shadow_style = pickVision('shadow_style', vision?.shadow_style, VISION_DEFAULTS.shadow_style);
  const spacing_density = pickVision('spacing_density', vision?.spacing_density, VISION_DEFAULTS.spacing_density);
  const has_gradients = pickVision('has_gradients', vision?.has_gradients, false);
  const gradient_direction = has_gradients ? (vision?.gradient_direction || null) : null;
  const gradient_colors = has_gradients ? (vision?.gradient_colors || null) : null;
  const mood = pickVision('overall_mood', vision?.overall_mood, VISION_DEFAULTS.overall_mood);
  const voice = pickVision('design_personality', vision?.design_personality, null);
  const method = vision ? 'hybrid' : 'css_only';

  return {
    heading_font,
    body_font,
    border_radius,
    shadow_style,
    spacing_density,
    has_gradients,
    gradient_direction,
    gradient_colors,
    mood,
    voice,
    extraction_method: method,
    css_extracted: { colors: cssColors, fonts: cssFonts },
    vision_extracted: vision ? {
      heading_font: vision.heading_font,
      body_font: vision.body_font,
      border_radius: vision.border_radius,
      shadow_style: vision.shadow_style,
      card_style: vision.card_style,
      button_style: vision.button_style,
      spacing_density: vision.spacing_density,
      has_gradients: vision.has_gradients,
      gradient_direction: vision.gradient_direction,
      gradient_colors: vision.gradient_colors,
      overall_mood: vision.overall_mood,
      design_personality: vision.design_personality,
    } : null,
    confidence: conf,
    tokens_generated: 0,
  };
}

// ═══════════════════════════════════════════════════════════
// Preset loader (duplicated to avoid importing from ds-crud)
// ═══════════════════════════════════════════════════════════

function loadPresetLocal(presetName: string): PresetDefaults {
  const { getPresetsDir } = require('../utils/knowledge-paths');
  const filePath = nodePath.join(getPresetsDir(), `${presetName}.yaml`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Preset not found: ${presetName}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(content) as PresetDefaults;
}

// ═══════════════════════════════════════════════════════════
// Tool Registration
// ═══════════════════════════════════════════════════════════

export function registerExtractionTools(
  server: McpServer,
  _sendDesignCommand: SendDesignCommand,
  saveFn: (name: string, tokens: DesignTokens) => Promise<void>,
): void {

  server.tool(
    'generate_design_system_from_url',
    'Generate a design system draft from a URL by extracting CSS colors, fonts, and visual patterns.',
    generateDesignSystemFromUrlSchema,
    async (params: { url: string; name?: string; preset?: string }) => {
      // Step 1: CSS extraction
      let pageContent: string;
      try {
        pageContent = await fetchUrl(params.url);
      } catch (err) {
        throw new Error(`Failed to fetch ${params.url}: ${(err as Error).message}`);
      }
      const cssExtracted = extractDesignTokens(pageContent);

      // Step 2: Vision extraction
      let visionResult: VisionExtraction | null = null;
      let screenshotSource: string | null = null;
      try {
        const screenshotBuf = await fetchScreenshot(params.url);
        if (screenshotBuf) {
          const base64 = screenshotBuf.toString('base64');
          screenshotSource = 'screenshot_service';
          visionResult = await visionExtract(base64);
        }
      } catch {
        // Vision extraction is best-effort
      }

      // Step 3: Merge
      const merged = mergeExtractions(cssExtracted, visionResult);

      // Step 4: Map to tokens
      let systemName = params.name;
      if (!systemName) {
        try {
          const urlObj = new URL(params.url);
          systemName = urlObj.hostname.replace(/^www\./, '').split('.')[0];
        } catch {
          systemName = 'extracted';
        }
      }
      systemName = systemName.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      if (!systemName) systemName = 'extracted';

      let preset: PresetDefaults | null = null;
      if (params.preset) {
        preset = loadPresetLocal(params.preset);
      }

      const tokens = generateTokens({
        name: systemName,
        primary_color: cssExtracted.primaryColor,
        secondary_color: cssExtracted.secondaryColor,
        accent_color: cssExtracted.accentColor,
        heading_font: merged.heading_font,
        body_font: merged.body_font,
        mood: merged.mood,
        voice: merged.voice,
        preset,
        border_radius: merged.border_radius,
        shadow_style: merged.shadow_style,
        spacing_density: merged.spacing_density,
        has_gradients: merged.has_gradients,
        gradient_direction: merged.gradient_direction,
        gradient_colors: merged.gradient_colors,
      });

      // Save using injected saveFn (no direct ds-crud import for saving)
      await saveFn(systemName, tokens);
      const tokensPath = nodePath.join(getDesignSystemsDir(), systemName, 'tokens.yaml');

      // Step 5: Extraction report
      const tokenFieldCount = Object.keys(tokens.colors).length
        + Object.keys(tokens.typography).length
        + Object.keys(tokens.spacing).length
        + Object.keys(tokens.radius).length
        + Object.keys(tokens.shadows).length
        + (tokens.gradients ? 1 : 0);

      const colorScore = cssExtracted.colorConfidence === 'high' ? 1.0
        : cssExtracted.colorConfidence === 'medium' ? 0.6 : 0.2;
      const fontScore = cssExtracted.fonts.length > 0 && cssExtracted.fontDetectionMethod !== 'none' ? 0.8 : 0.1;
      const visionConfValues = Object.values(merged.confidence || {}) as number[];
      const visionScore = visionConfValues.length > 0
        ? visionConfValues.reduce((a, b) => a + b, 0) / visionConfValues.length
        : 0;
      const overallConfidence = Math.round((colorScore * 0.40 + fontScore * 0.25 + visionScore * 0.35) * 100);

      const refinementPrompt = `\n\nDraft created with ${overallConfidence}% confidence. To refine it, tell me:\n`
        + `1. What is your exact primary brand color? (hex or description)\n`
        + `2. What fonts do you use? (or "not sure")\n`
        + `3. Sharp corners, slightly rounded, or very rounded?\n`
        + `4. Light or dark background?\n`
        + `5. 3 words that describe the brand personality?\n`
        + `\nThen call refine_design_system with the answers to update the tokens.`;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            name: systemName,
            sourceUrl: params.url,
            extraction_method: merged.extraction_method,
            overallConfidence: `${overallConfidence}%`,
            css_extracted: {
              colorsFound: cssExtracted.colors.length,
              brandColors: cssExtracted.colors.slice(0, 5),
              primaryColor: cssExtracted.primaryColor || '(none found — generated)',
              secondaryColor: cssExtracted.secondaryColor || '(none found — generated)',
              accentColor: cssExtracted.accentColor || '(none found — generated)',
              colorConfidence: cssExtracted.colorConfidence,
              fonts: cssExtracted.fonts,
              fontDetectionMethod: cssExtracted.fontDetectionMethod === 'none'
                ? '(not detected — fallback to vision or Inter)'
                : cssExtracted.fontDetectionMethod,
              typekitDetected: cssExtracted.typekitDetected || null,
            },
            vision_extracted: merged.vision_extracted ? {
              ...merged.vision_extracted,
              screenshotSource,
              apiKeyConfigured: !!process.env.GEMINI_API_KEY,
            } : {
              status: !process.env.GEMINI_API_KEY
                ? 'skipped — GEMINI_API_KEY not set'
                : screenshotSource === null
                  ? 'skipped — screenshot services unavailable'
                  : 'skipped — vision analysis failed',
            },
            confidence: merged.confidence,
            generatedTokens: {
              total: tokenFieldCount,
              colors: Object.keys(tokens.colors).length,
              headingFont: tokens.typography.heading.family,
              bodyFont: tokens.typography.body.family,
              spacingUnit: tokens.spacing.unit,
              borderRadius: tokens.radius,
              shadowStyle: merged.shadow_style,
              spacingDensity: merged.spacing_density,
              hasGradients: tokens.gradients?.enabled || false,
              mood: tokens.mood,
              voice: tokens.voice,
              presetUsed: tokens.preset_used,
            },
            savedAs: systemName,
            tokensPath,
            refinementPrompt,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'refine_design_system',
    'Refine a draft design system with user corrections (colors, fonts, radius, mode, mood). Returns a diff.',
    refineDesignSystemSchema,
    async (params: {
      name: string;
      primary_color?: string;
      fonts?: string;
      border_radius?: 'sharp' | 'slight' | 'medium' | 'rounded' | 'pill';
      dark_mode?: boolean;
      mood?: string[];
    }) => {
      const safeName = params.name.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');

      if (!fs.existsSync(tokensPath)) {
        const available = listAvailableSystems();
        throw new Error(`Design system not found: ${safeName}. Available: ${available.join(', ')}`);
      }

      const content = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(content) as Record<string, unknown>;
      const changes: Record<string, { from: unknown; to: unknown }> = {};

      const apply = (dotPath: string, newValue: unknown) => {
        const oldValue = getByDotPath(tokens, dotPath);
        if (oldValue !== newValue) {
          changes[dotPath] = { from: oldValue, to: newValue };
          setByDotPath(tokens, dotPath, newValue);
        }
      };

      // Primary color + derived colors
      if (params.primary_color) {
        const pc = params.primary_color;
        apply('colors.primary', pc);
        apply('colors.primary_light', lighten(pc, 0.3));
        apply('colors.primary_dark', darken(pc, 0.2));
        apply('colors.on_primary', bestTextColor(pc));

        const currentSecondary = getByDotPath(tokens, 'colors.secondary') as string | undefined;
        const currentAccent = getByDotPath(tokens, 'colors.accent') as string | undefined;
        if (currentSecondary) {
          apply('colors.secondary', rotateHue(pc, 180));
        }
        if (currentAccent) {
          apply('colors.accent', rotateHue(pc, 30));
        }

        for (const size of ['sm', 'md', 'lg'] as const) {
          apply(`shadows.${size}.color`, pc);
        }
      }

      // Fonts
      if (params.fonts) {
        const fontStr = params.fonts.trim();
        const bothMatch = fontStr.match(/^(.+?)\s+for\s+both$/i);
        const splitMatch = fontStr.match(/^(.+?)\s+for\s+headings?\s*,\s*(.+?)\s+for\s+body$/i);

        if (bothMatch) {
          const font = bothMatch[1].trim();
          apply('typography.heading.family', font);
          apply('typography.body.family', font);
        } else if (splitMatch) {
          apply('typography.heading.family', splitMatch[1].trim());
          apply('typography.body.family', splitMatch[2].trim());
        } else {
          apply('typography.heading.family', fontStr);
          apply('typography.body.family', fontStr);
        }
      }

      // Border radius
      if (params.border_radius) {
        const radiusMap: Record<string, { sm: number; md: number; lg: number; xl: number }> = {
          sharp:   { sm: 0, md: 2, lg: 4, xl: 6 },
          slight:  { sm: 2, md: 4, lg: 6, xl: 8 },
          medium:  { sm: 4, md: 8, lg: 12, xl: 16 },
          rounded: { sm: 8, md: 16, lg: 24, xl: 32 },
          pill:    { sm: 999, md: 999, lg: 999, xl: 999 },
        };
        const r = radiusMap[params.border_radius];
        apply('radius.sm', r.sm);
        apply('radius.md', r.md);
        apply('radius.lg', r.lg);
        apply('radius.xl', r.xl);
      }

      // Dark mode
      if (params.dark_mode != null) {
        const primary = (getByDotPath(tokens, 'colors.primary') as string) || '#5E6AD2';
        const { h: primaryH } = hexToHsl(primary);

        if (params.dark_mode) {
          apply('colors.surface', hslToHex(primaryH, 0.08, 0.12));
          apply('colors.background', hslToHex(primaryH, 0.06, 0.08));
          apply('colors.border', hslToHex(primaryH, 0.10, 0.20));
          apply('colors.on_surface', '#F0F0F3');
          apply('colors.on_surface_muted', hslToHex(primaryH, 0.06, 0.55));
        } else {
          apply('colors.surface', hslToHex(primaryH, 0.02, 0.99));
          apply('colors.background', hslToHex(primaryH, 0.03, 0.97));
          apply('colors.border', desaturate(lighten(primary, 0.55), 0.6));
          apply('colors.on_surface', hslToHex(primaryH, 0.08, 0.09));
          apply('colors.on_surface_muted', hslToHex(primaryH, 0.05, 0.45));
        }
      }

      // Mood
      if (params.mood && params.mood.length > 0) {
        apply('mood', params.mood);
      }

      // Save
      fs.writeFileSync(tokensPath, yaml.dump(tokens, { lineWidth: 120 }), 'utf-8');

      const changeCount = Object.keys(changes).length;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            refined: safeName,
            changesApplied: changeCount,
            diff: changes,
            tip: changeCount > 0
              ? `${changeCount} token(s) updated. Call design_system_preview to see the result visually.`
              : 'No changes were needed — the system already matched your inputs.',
          }, null, 2),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DMD-2: import_design_system_from_md — DESIGN.md → tokens.yaml
  // Parses a DESIGN.md file, validates it, converts to tokens, saves.
  // Optional auto-preview hook when Figma is connected.
  // See: docs/stories/DMD-2-import-design-system-from-md.story.md
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'import_design_system_from_md',
    'Import a DESIGN.md file as a Figmento design system. Parses frontmatter + 9 canonical sections + fenced blocks, validates against the schema, converts to tokens.yaml, and saves to knowledge/design-systems/{name}/. Pass previewInFigma: true to auto-generate a preview frame in Figma after import.',
    importDesignMdSchema,
    async (params: { path?: string; content?: string; name?: string; previewInFigma?: boolean; createVariables?: boolean; overwrite?: boolean }) => {
      // ─── Step 1: Resolve input to markdown string ─────────────────
      let markdown: string;
      let inferredName: string | undefined;

      if (params.path) {
        try {
          markdown = fs.readFileSync(params.path, 'utf-8');
          // Infer name from filename: /path/to/my-system/DESIGN.md → my-system
          const dir = nodePath.basename(nodePath.dirname(params.path));
          if (dir && dir !== '.' && dir !== 'design-systems') {
            inferredName = dir.replace(/[^a-z0-9-]/gi, '').toLowerCase();
          }
        } catch (err) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({
            systemName: null, tokensPath: null, verdict: 'FAIL',
            issues: [{ severity: 'CRITICAL', category: 'structure', message: `Could not read file: ${(err as Error).message}` }],
          }, null, 2) }] };
        }
      } else if (params.content !== undefined) {
        markdown = params.content;
      } else {
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          systemName: null, tokensPath: null, verdict: 'FAIL',
          issues: [{ severity: 'CRITICAL', category: 'structure', message: 'Must provide either `path` or `content` input.' }],
        }, null, 2) }] };
      }

      // ─── Step 2: Parse ────────────────────────────────────────────
      let ir;
      try {
        ir = parseDesignMd(markdown);
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          systemName: null, tokensPath: null, verdict: 'FAIL',
          issues: [{ severity: 'CRITICAL', category: 'structure', message: `Parser error: ${(err as Error).message}` }],
        }, null, 2) }] };
      }

      // ─── Step 3: Validate ─────────────────────────────────────────
      const report = validateDesignMdIR(ir);

      if (report.verdict === 'FAIL') {
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          systemName: null, tokensPath: null,
          verdict: report.verdict, issues: report.issues,
        }, null, 2) }] };
      }

      // ─── Step 4: Resolve system name ──────────────────────────────
      const systemName = (params.name || ir.frontmatter.name || inferredName || 'imported')
        .replace(/[^a-z0-9-]/gi, '')
        .toLowerCase();

      if (!systemName) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          systemName: null, tokensPath: null, verdict: 'FAIL',
          issues: [{ severity: 'CRITICAL', category: 'structure', message: 'Could not determine a system name. Provide `name` parameter or add `name` to the frontmatter.' }],
        }, null, 2) }] };
      }

      // ─── Step 5: Check for duplicate name ─────────────────────────
      const tokensPath = nodePath.join(getDesignSystemsDir(), systemName, 'tokens.yaml');
      if (fs.existsSync(tokensPath) && !params.overwrite) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          systemName, tokensPath: null, verdict: 'CONCERNS',
          issues: [{
            severity: 'HIGH', category: 'structure',
            message: `Design system "${systemName}" already exists at ${tokensPath}.`,
            suggestion: 'Pass overwrite: true to replace, or provide a different name.',
          }],
          warning: 'DUPLICATE_NAME — existing system not overwritten.',
        }, null, 2) }] };
      }

      // ─── Step 6: Convert IR → tokens + save ──────────────────────
      const tokens = irToTokens(ir);
      // Ensure the name in the saved tokens matches the resolved name
      tokens.name = systemName;

      try {
        await saveFn(systemName, tokens as unknown as DesignTokens);
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          systemName, tokensPath: null, verdict: 'FAIL',
          issues: [{ severity: 'CRITICAL', category: 'structure', message: `Save failed: ${(err as Error).message}` }],
        }, null, 2) }] };
      }

      const savedPath = nodePath.join(getDesignSystemsDir(), systemName, 'tokens.yaml');

      // ─── Step 7: Optional Figma-native bindings ──────────────────
      let preview: unknown = undefined;
      let variables: unknown = undefined;
      const warnings: string[] = [];

      if (params.createVariables) {
        try {
          const varsData = await _sendDesignCommand('create_variables_from_design_system', {
            system: systemName,
          });
          variables = varsData;
        } catch {
          warnings.push('Figma not connected — skipping variable creation. tokens.yaml was saved successfully.');
        }
      }

      if (params.previewInFigma) {
        try {
          const previewData = await _sendDesignCommand('design_system_preview', {
            system: systemName,
          });
          preview = previewData;
        } catch {
          if (!warnings.some(w => w.includes('Figma not connected'))) {
            warnings.push('Figma not connected — skipping preview. tokens.yaml was saved successfully.');
          }
        }
      }

      // ─── Step 8: Response ─────────────────────────────────────────
      const response: Record<string, unknown> = {
        systemName,
        tokensPath: savedPath,
        verdict: report.verdict,
      };
      if (report.issues.length > 0) response.issues = report.issues;
      if (variables) response.variables = variables;
      if (preview) response.preview = preview;
      if (warnings.length > 0) response.warning = warnings.join(' ');

      return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DMD-4: export_design_system_to_md — tokens.yaml → DESIGN.md
  // Reads an existing design system's tokens, converts to canonical
  // DESIGN.md format, and writes the file.
  // See: docs/stories/DMD-4-export-design-system-to-md.story.md
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'export_design_system_to_md',
    'Export a Figmento design system as a canonical DESIGN.md file. Reads tokens.yaml, converts to the 9-section markdown format with frontmatter and fenced blocks, writes to knowledge/design-systems/{name}/DESIGN.md (or a custom outputPath). Use this to share design systems with Cursor, Claude Desktop, or the awesome-design-md ecosystem.',
    exportDesignMdSchema,
    async (params: { name: string; outputPath?: string; overwrite?: boolean }) => {
      const safeName = params.name.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');

      if (!fs.existsSync(tokensPath)) {
        const available = listAvailableSystems();
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          exported: false,
          reason: 'NOT_FOUND',
          message: `Design system "${safeName}" not found. Available: ${available.join(', ')}`,
        }, null, 2) }] };
      }

      // Load tokens
      const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(tokensContent) as Record<string, unknown>;

      // Convert to IR then render to markdown
      const ir = tokensToIR(tokens);
      const markdown = renderMarkdown(ir);

      // Resolve output path
      const outputPath = params.outputPath || nodePath.join(getDesignSystemsDir(), safeName, 'DESIGN.md');

      // Collision check
      if (fs.existsSync(outputPath) && !params.overwrite) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          exported: false,
          reason: 'FILE_EXISTS',
          outputPath,
          suggestion: 'Pass overwrite: true to replace the existing file.',
        }, null, 2) }] };
      }

      // Write
      fs.writeFileSync(outputPath, markdown, 'utf-8');

      // Build summary
      const sectionCount = Object.keys(ir.sections).filter(k => {
        const v = ir.sections[k as keyof typeof ir.sections];
        return v && Object.keys(v).length > 0;
      }).length;

      return { content: [{ type: 'text' as const, text: JSON.stringify({
        exported: true,
        outputPath,
        systemName: safeName,
        irSummary: {
          sectionCount,
          frontmatterKeys: Object.keys(ir.frontmatter),
        },
        markdown: markdown.length > 2000 ? markdown.slice(0, 2000) + '\n... (truncated)' : markdown,
      }, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DMD-3: validate_design_md — zero-side-effect validator
  // Parses a DESIGN.md file (or inline content) and returns a structured
  // report of issues. Does NOT write files or call any Figma tool.
  // See: docs/stories/DMD-3-validate-design-md.story.md
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'validate_design_md',
    'Validate a DESIGN.md file against the Figmento schema (docs/architecture/DESIGN-MD-SPEC.md). ZERO SIDE EFFECTS — does not write files or call any Figma tool. Returns a verdict (PASS/CONCERNS/FAIL) plus a structured list of issues with severity, category, message, and suggestion. Use this for the edit-validate-fix authoring loop before committing a DESIGN.md via import_design_system_from_md.',
    validateDesignMdSchema,
    async (params: { path?: string; content?: string }) => {
      let markdown: string;

      if (params.path) {
        try {
          markdown = fs.readFileSync(params.path, 'utf-8');
        } catch (err) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                verdict: 'FAIL',
                issues: [{
                  severity: 'CRITICAL',
                  category: 'structure',
                  message: `Could not read file at ${params.path}: ${(err as Error).message}`,
                }],
              }, null, 2),
            }],
          };
        }
      } else if (params.content !== undefined) {
        markdown = params.content;
      } else {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              verdict: 'FAIL',
              issues: [{
                severity: 'CRITICAL',
                category: 'structure',
                message: 'Must provide either `path` or `content` input',
              }],
            }, null, 2),
          }],
        };
      }

      let report;
      try {
        const ir = parseDesignMd(markdown);
        report = validateDesignMdIR(ir);
      } catch (err) {
        report = {
          verdict: 'FAIL',
          issues: [{
            severity: 'CRITICAL',
            category: 'structure',
            message: `Parser or validator error: ${(err as Error).message}`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(report, null, 2),
        }],
      };
    }
  );
}
