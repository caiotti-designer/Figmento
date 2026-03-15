import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';
import { GoogleGenAI } from '@google/genai';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

// ─── Composition Tables ────────────────────────────────────────────────────────

interface FormatConfig {
  textZone: string;
  width: number;
  height: number;
}

/**
 * Maps format preset names to their canonical dimensions and default text zone.
 * Text zone describes which area of the image should be dark/defocused to
 * provide clean negative space for headline and CTA overlays.
 */
const FORMAT_MAP: Record<string, FormatConfig> = {
  // Tall portrait formats — CTA lives at bottom
  instagram_portrait: { textZone: 'bottom-40%', width: 1080, height: 1350 },
  instagram_story:    { textZone: 'bottom-40%', width: 1080, height: 1920 },
  story:              { textZone: 'bottom-40%', width: 1080, height: 1920 },
  tiktok:             { textZone: 'bottom-40%', width: 1080, height: 1920 },
  pinterest:          { textZone: 'bottom-35%', width: 1000, height: 1500 },

  // Square formats — headline at bottom
  instagram_square:   { textZone: 'bottom-30%', width: 1080, height: 1080 },
  facebook_post:      { textZone: 'bottom-30%', width: 1200, height: 630 },

  // Web hero formats — headline below the fold
  hero:               { textZone: 'bottom-40%', width: 1440, height: 810 },
  landing_hero:       { textZone: 'bottom-40%', width: 1440, height: 810 },

  // Landscape formats — short text strip at bottom
  landscape:          { textZone: 'bottom-25%', width: 1920, height: 1080 },
  youtube_thumbnail:  { textZone: 'bottom-25%', width: 1280, height: 720 },

  // Wide banner formats — text on the left side
  facebook_cover:     { textZone: 'left-40%', width: 820,  height: 312 },
  twitter_header:     { textZone: 'left-40%', width: 1500, height: 500 },
  linkedin_banner:    { textZone: 'left-40%', width: 1584, height: 396 },
};

/**
 * Maps text zone identifiers to Gemini prompt composition suffixes.
 * Each suffix instructs the model to leave a specific area dark/defocused
 * so text overlays remain readable without an additional gradient.
 */
const TEXT_ZONE_SUFFIX_MAP: Record<string, string> = {
  'bottom-40%': 'Visual subject and detail fills upper 60% of frame. Lower 40% transitions to dark, softly defocused — clean negative space for headline and CTA text overlay. No busy details or high-contrast elements in the lower portion.',
  'bottom-35%': 'Subject fills upper 65%. Bottom 35% is dark, low-contrast, slightly blurred — text-friendly negative space.',
  'bottom-30%': 'Visual interest concentrated in upper 70%. Bottom strip is dark and minimal for text.',
  'bottom-25%': 'Subject fills most of frame. A thin dark band at the bottom for short headline text.',
  'left-40%':   'Subject and visual complexity sits in right 60% of frame. Left 40% is dark, minimal, breathable — reserved for headline and body copy.',
};

// ─── Prompt Builder ────────────────────────────────────────────────────────────

function buildGeminiPrompt(brief: string, mood?: string, textZone?: string): string {
  const moodClause = mood ? `, ${mood} mood and atmosphere` : '';
  const suffix = textZone ? (TEXT_ZONE_SUFFIX_MAP[textZone] ?? '') : '';
  const base = `High quality photograph or illustration: ${brief}${moodClause}.`;
  return suffix ? `${base} ${suffix} Professional quality, suitable for social media or digital advertising.` : `${base} Professional quality, suitable for social media or digital advertising.`;
}

// ─── Gemini API Call ───────────────────────────────────────────────────────────

async function callGemini(prompt: string, apiKey: string): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey });

  const rawResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseModalities: ['IMAGE'] },
  });

  // Handle both wrapped ({ response: ... }) and direct response shapes
  const responseData = (rawResponse as Record<string, unknown>)['response'] ?? rawResponse;
  const candidates = (responseData as Record<string, unknown>)['candidates'] as unknown[];

  if (!candidates || candidates.length === 0) {
    throw new Error('No image generated: empty candidates in Gemini response');
  }

  const parts = ((candidates[0] as Record<string, unknown>)['content'] as Record<string, unknown>)?.['parts'] as unknown[] ?? [];
  const imagePart = parts.find((p) => (p as Record<string, unknown>)['inlineData']) as Record<string, unknown> | undefined;
  const inlineData = imagePart?.['inlineData'] as Record<string, string> | undefined;

  if (!inlineData?.['data']) {
    throw new Error('No image data in Gemini response parts');
  }

  return Buffer.from(inlineData['data'], 'base64');
}

// ─── Placeholder Fallback ─────────────────────────────────────────────────────

async function fetchPlaceholderBase64(brief: string, width: number, height: number): Promise<string> {
  const words = brief
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);
  const seed = words.join('-') || 'design';
  const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Picsum fetch failed: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buf.toString('base64')}`;
}

// ─── Frame Resolution ──────────────────────────────────────────────────────────

interface ResolvedFrame {
  frameId: string;
  width: number;
  height: number;
  isNewFrame: boolean;
}

function normalizeFormatKey(format: string): string {
  return format.toLowerCase().replace(/[\s-]/g, '_');
}

async function resolveFrame(
  params: { frameId?: string; format?: string; name?: string; brief: string },
  sendDesignCommand: SendDesignCommand,
): Promise<ResolvedFrame> {
  // Priority 1: explicit frameId passed
  if (params.frameId) {
    const info = await sendDesignCommand('get_node_info', { nodeId: params.frameId }) as Record<string, unknown>;
    const bounds = info['absoluteBoundingBox'] as Record<string, number> | undefined;
    const width = (info['width'] as number) ?? bounds?.['width'] ?? 1080;
    const height = (info['height'] as number) ?? bounds?.['height'] ?? 1080;
    return { frameId: params.frameId, width, height, isNewFrame: false };
  }

  // Priority 2: current Figma selection is a FRAME
  try {
    const sel = await sendDesignCommand('get_selection', {}) as Record<string, unknown>;
    // Plugin may return { selection: [...] } or { nodes: [...] } or a direct array
    const nodes: unknown[] = (sel['selection'] as unknown[]) ?? (sel['nodes'] as unknown[]) ?? (Array.isArray(sel) ? sel : []);
    const firstFrame = nodes.find((n) => (n as Record<string, unknown>)['type'] === 'FRAME') as Record<string, unknown> | undefined;

    if (firstFrame) {
      const bounds = firstFrame['absoluteBoundingBox'] as Record<string, number> | undefined;
      const width = (firstFrame['width'] as number) ?? bounds?.['width'] ?? 1080;
      const height = (firstFrame['height'] as number) ?? bounds?.['height'] ?? 1080;
      const frameId = (firstFrame['id'] as string) ?? (firstFrame['nodeId'] as string);
      return { frameId, width, height, isNewFrame: false };
    }
  } catch {
    // get_selection failed — fall through to frame creation
  }

  // Priority 3: create new frame from format preset
  if (!params.format) {
    throw new Error(
      'No target frame found. Pass frameId, select a frame in Figma, or provide a format (e.g. "instagram_portrait").',
    );
  }

  const formatKey = normalizeFormatKey(params.format);
  const config = FORMAT_MAP[formatKey];

  if (!config) {
    process.stderr.write(`[Figmento] Unknown format "${params.format}", defaulting to 1080×1080\n`);
  }

  const width = config?.width ?? 1080;
  const height = config?.height ?? 1080;
  const frameName = params.name ?? params.brief.slice(0, 40);

  const created = await sendDesignCommand('create_frame', {
    name: frameName,
    width,
    height,
    fillColor: '#0A0A0F',
  }) as Record<string, unknown>;

  const frameId = (created['nodeId'] as string) ?? (created['id'] as string);
  return { frameId, width, height, isNewFrame: true };
}

// ─── Tool Registration ─────────────────────────────────────────────────────────

export function registerImageGenTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'generate_design_image',
    'Generate a composition-aware background image with Gemini and place it directly in a Figma frame. Auto-resolves the target frame from the current Figma selection, or creates a new frame if a format is provided. Use this as the FIRST step in every design — before adding text, CTAs, or gradient overlays.',
    {
      brief: z.string().describe('Design brief describing the image subject and style (e.g. "hippie coffee shop warm earthy vintage")'),
      format: z.string().optional().describe('Format preset: instagram_portrait, story, tiktok, pinterest, instagram_square, facebook_post, hero, landing_hero, landscape, youtube_thumbnail, facebook_cover, twitter_header, linkedin_banner. Determines frame dimensions and default text zone.'),
      mood: z.string().optional().describe('Mood or atmosphere hint appended to the Gemini prompt (e.g. "earthy", "luxury", "playful", "dark cinematic")'),
      textZone: z.string().optional().describe('Override composition text zone: bottom-40%, bottom-35%, bottom-30%, bottom-25%, or left-40%'),
      frameId: z.string().optional().describe('Target frame nodeId. If omitted, auto-resolved from current Figma selection or a new frame is created using the format dimensions.'),
      name: z.string().optional().describe('Frame name when a new frame is created. Defaults to the brief truncated to 40 characters.'),
    },
    async (params) => {
      // AC5: fail fast if API key missing
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: 'GEMINI_API_KEY not set in environment. Add it to .env to use image generation.' }),
          }],
          isError: true,
        };
      }

      // Resolve target frame
      let frame: ResolvedFrame;
      try {
        frame = await resolveFrame(params, sendDesignCommand);
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: (err as Error).message }) }],
          isError: true,
        };
      }

      // Determine text zone (explicit override > format inference > default)
      const formatKey = params.format ? normalizeFormatKey(params.format) : '';
      const inferredTextZone = FORMAT_MAP[formatKey]?.textZone ?? 'bottom-40%';
      const textZone = params.textZone ?? inferredTextZone;

      // Build composition-aware Gemini prompt
      const geminiPrompt = buildGeminiPrompt(params.brief, params.mood, textZone);

      // Ensure IMAGE_OUTPUT_DIR exists (AC: Risk mitigation — missing output dir)
      const IMAGE_OUTPUT_DIR = process.env.IMAGE_OUTPUT_DIR ?? nodePath.join(process.cwd(), 'output');
      fs.mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });

      // Generate image via Gemini, fallback to placeholder on any failure
      let imageBase64: string;
      let fallbackUsed = false;

      try {
        const imageBuffer = await callGemini(geminiPrompt, apiKey);
        const outPath = nodePath.join(IMAGE_OUTPUT_DIR, `figmento-generated-${Date.now()}.png`);
        fs.writeFileSync(outPath, imageBuffer);
        imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      } catch (geminiErr) {
        // AC6 + AC11: silent fallback — log to stderr, return fallbackUsed: true
        process.stderr.write(`[Figmento] Gemini fallback triggered: ${(geminiErr as Error).message}\n`);
        fallbackUsed = true;
        try {
          imageBase64 = await fetchPlaceholderBase64(params.brief, frame.width, frame.height);
        } catch (fallbackErr) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Image generation failed and placeholder fallback also failed: ${(fallbackErr as Error).message}` }),
            }],
            isError: true,
          };
        }
      }

      // Place image in the resolved frame
      const imageResult = await sendDesignCommand('create_image', {
        imageData: imageBase64,
        name: 'Background Image',
        width: frame.width,
        height: frame.height,
        x: 0,
        y: 0,
        parentId: frame.frameId,
        scaleMode: 'FILL',
      }) as Record<string, unknown>;

      const imageNodeId = (imageResult['nodeId'] as string) ?? (imageResult['id'] as string);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            frameId: frame.frameId,
            imageNodeId,
            width: frame.width,
            height: frame.height,
            isNewFrame: frame.isNewFrame,
            textZone,
            geminiPrompt,
            fallbackUsed,
          }),
        }],
      };
    },
  );
}
