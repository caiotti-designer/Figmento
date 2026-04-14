/**
 * ODS-1b: Brief Analysis MCP Tool — Registration
 *
 * Thin registration wrapper. Core logic lives in brief-analysis-core.ts
 * to avoid TS2589 in ts-jest (MCP SDK + Zod deep type instantiation issue).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { assembleBrandAnalysis, validateBrandAnalysis } from './brief-analysis-core';

// Re-export core functions for any direct consumers
export { generateColorScale, generateNeutralScale, assembleBrandAnalysis, validateBrandAnalysis } from './brief-analysis-core';

// Schema uses z.string() (not z.optional()) to avoid TS2589 — see MEMORY.md
export const analyzeBriefSchema = {
  pdfBase64: z.string().describe('PDF file as base64 data URI. Optional — omit if providing pdfText or briefText.'),
  pdfText: z.string().describe('Extracted text content from PDF (alternative to pdfBase64). Optional.'),
  logoBase64: z.string().describe('Logo image as base64 data URI. Optional.'),
  briefText: z.string().describe('Plain text description of the brand/project. Optional.'),
  brandName: z.string().describe('Brand name (overrides AI extraction). Optional.'),
};

export function registerBriefAnalysisTools(server: McpServer): void {
  server.tool(
    'analyze_brief',
    'Analyze a PDF brief and/or logo to extract brand identity. Returns BrandAnalysis JSON for design system generation. All params optional.',
    analyzeBriefSchema,
    async (params) => handleAnalyzeBrief(params as Record<string, string>),
  );
}

async function handleAnalyzeBrief(params: Record<string, string>) {
  const hasPdf = !!(params.pdfBase64 || params.pdfText);
  const hasLogo = !!params.logoBase64;
  const hasBrief = !!params.briefText;

  // ── Extract text from brief ────────────────────────────────────
  let briefContent = '';
  if (params.pdfText) {
    briefContent = params.pdfText;
  } else if (params.pdfBase64) {
    try {
      const pdfParse = require('pdf-parse');
      const base64Data = params.pdfBase64.replace(/^data:application\/pdf;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const pdfData = await pdfParse(buffer);
      briefContent = pdfData.text || '';
    } catch (err) {
      briefContent = `[PDF parsing failed: ${(err as Error).message}]`;
    }
  } else if (params.briefText) {
    briefContent = params.briefText;
  }

  // ── Heuristic extraction ───────────────────────────────────────
  let brandName = params.brandName || 'Untitled Brand';
  let industry = 'General';
  let tone: string[] = ['professional', 'modern'];
  let targetAudience = 'General audience';
  let brandValues: string[] = ['quality', 'innovation'];
  let logoColors: string[] = [];

  if (briefContent.length > 0) {
    if (!params.brandName) {
      const firstLine = briefContent.split('\n').find(l => l.trim().length > 2 && l.trim().length < 60);
      if (firstLine) brandName = firstLine.trim();
    }

    const hexMatches = briefContent.match(/#[0-9A-Fa-f]{6}\b/g);
    if (hexMatches) logoColors = [...new Set(hexMatches)].slice(0, 5);

    const toneMap: Record<string, string[]> = {
      'luxury': ['luxury', 'premium', 'exclusive', 'high-end', 'elegant'],
      'playful': ['fun', 'playful', 'colorful', 'vibrant', 'kids', 'game'],
      'corporate': ['corporate', 'enterprise', 'business', 'professional', 'finance'],
      'tech': ['tech', 'digital', 'ai', 'startup', 'modern', 'innovation'],
      'nature': ['eco', 'green', 'sustainable', 'organic', 'nature', 'earth'],
      'warm': ['warm', 'cozy', 'artisan', 'craft', 'homey', 'cafe', 'bakery'],
      'minimal': ['minimal', 'clean', 'simple', 'scandinavian'],
      'editorial': ['editorial', 'magazine', 'publishing', 'literary'],
    };

    const lowerContent = briefContent.toLowerCase();
    const detectedTones: string[] = [];
    for (const [mood, keywords] of Object.entries(toneMap)) {
      if (keywords.some(kw => lowerContent.includes(kw))) detectedTones.push(mood);
    }
    if (detectedTones.length > 0) tone = detectedTones.slice(0, 5);

    const industryMap: Record<string, string[]> = {
      'AgTech / Agriculture': ['agriculture', 'farming', 'irrigation', 'agtech', 'crops'],
      'FinTech / Finance': ['finance', 'fintech', 'banking', 'payment', 'investment'],
      'Healthcare': ['health', 'medical', 'pharma', 'wellness', 'clinic'],
      'E-commerce / Retail': ['ecommerce', 'e-commerce', 'retail', 'shop', 'store'],
      'SaaS / Technology': ['saas', 'software', 'platform', 'api', 'cloud'],
      'Food & Beverage': ['restaurant', 'cafe', 'coffee', 'food', 'beverage', 'bakery'],
      'Fashion / Lifestyle': ['fashion', 'clothing', 'lifestyle', 'brand', 'apparel'],
      'Education': ['education', 'learning', 'school', 'university', 'course'],
      'Real Estate': ['real estate', 'property', 'housing', 'construction'],
    };

    for (const [ind, keywords] of Object.entries(industryMap)) {
      if (keywords.some(kw => lowerContent.includes(kw))) { industry = ind; break; }
    }

    const valueKeywords = ['innovation', 'quality', 'trust', 'sustainability', 'craftsmanship',
      'transparency', 'community', 'excellence', 'creativity', 'reliability', 'simplicity'];
    const detectedValues = valueKeywords.filter(v => lowerContent.includes(v));
    if (detectedValues.length > 0) brandValues = detectedValues.slice(0, 5);

    if (lowerContent.includes('b2b') || lowerContent.includes('enterprise')) targetAudience = 'B2B / Enterprise customers';
    else if (lowerContent.includes('b2c') || lowerContent.includes('consumer')) targetAudience = 'B2C / Consumer market';
  }

  // ── Assemble + validate ────────────────────────────────────────
  const analysis = assembleBrandAnalysis({
    brandName, industry, tone, targetAudience, brandValues, logoColors, hasPdf, hasLogo,
  });

  const issues = validateBrandAnalysis(analysis);

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: true,
        analysis,
        ...(issues.length > 0 && { validationWarnings: issues }),
        usage: {
          tip: 'Pass this analysis to generate_design_system_in_figma (ODS-7) to create the full DS in Figma.',
          inputSummary: {
            hasPdf, hasLogo, hasBriefText: hasBrief,
            briefLength: briefContent.length,
            logoColorsExtracted: logoColors.length,
            matchedPalette: analysis.source.paletteId,
            matchedFontPairing: analysis.source.fontPairingId,
          },
        },
      }, null, 2),
    }],
  };
}
