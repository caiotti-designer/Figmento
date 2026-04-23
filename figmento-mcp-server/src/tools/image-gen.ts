import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';
import * as yaml from 'js-yaml';
import { GoogleGenAI } from '@google/genai';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

// ─── Image Generation Knowledge (lazy-loaded) ────────────────────────────────

let imageGenKnowledge: Record<string, unknown> | null = null;

function getImageGenKnowledge(): Record<string, unknown> {
  if (imageGenKnowledge) return imageGenKnowledge;
  try {
    const knowledgeDir = nodePath.join(__dirname, '..', 'knowledge');
    const filePath = nodePath.join(knowledgeDir, 'image-generation.yaml');
    const content = fs.readFileSync(filePath, 'utf-8');
    imageGenKnowledge = yaml.load(content) as Record<string, unknown>;
  } catch {
    imageGenKnowledge = {};
  }
  return imageGenKnowledge!;
}

function getResolutionForFormat(formatKey: string): string {
  const knowledge = getImageGenKnowledge();
  const map = knowledge['resolution_by_format'] as Record<string, string> | undefined;
  return map?.[formatKey] ?? '1K';
}

function getAspectRatioForFormat(formatKey: string): string {
  const knowledge = getImageGenKnowledge();
  const map = knowledge['aspect_ratio_by_format'] as Record<string, string> | undefined;
  return map?.[formatKey] ?? '1:1';
}

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

// ─── Reference Image Helpers ──────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

interface ReferenceImage {
  data: string;     // base64-encoded image data (no prefix)
  mimeType: string; // e.g. "image/jpeg"
}

function loadReferenceImage(filePath: string): ReferenceImage | null {
  try {
    if (!fs.existsSync(filePath)) {
      process.stderr.write(`[Figmento] Reference image not found: ${filePath}\n`);
      return null;
    }
    const buffer = fs.readFileSync(filePath);
    const ext = nodePath.extname(filePath).toLowerCase();
    const mimeType = MIME_MAP[ext];
    if (!mimeType) {
      process.stderr.write(`[Figmento] Unsupported reference image format: ${ext}\n`);
      return null;
    }
    return { data: buffer.toString('base64'), mimeType };
  } catch (err) {
    process.stderr.write(`[Figmento] Failed to read reference image: ${(err as Error).message}\n`);
    return null;
  }
}

// ─── Image API Calls (Gemini + Venice) ───────────────────────────────────────

interface CallGeminiOptions {
  aspectRatio?: string;
  imageSize?: string;
  referenceImages?: ReferenceImage[];
  model?: string;
}

/** Returns true for Venice image models (use Venice API, not Gemini). */
function isVeniceImageModel(model: string): boolean {
  return model.startsWith('grok-');
}

/**
 * Generate an image via Venice's OpenAI-compatible images API.
 * Returns raw image buffer.
 */
async function callVeniceImage(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<Buffer> {
  const resp = await fetch('https://api.venice.ai/api/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      response_format: 'b64_json',
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`Venice Image API error ${resp.status}: ${errBody}`);
  }

  const data = await resp.json();
  const b64 = (data as Record<string, unknown[]>)?.data?.[0] as Record<string, string> | undefined;
  if (!b64?.b64_json) {
    throw new Error('No image data in Venice response');
  }

  return Buffer.from(b64.b64_json, 'base64');
}

async function callGemini(
  prompt: string,
  apiKey: string,
  options?: CallGeminiOptions,
): Promise<Buffer> {
  const geminiModel = options?.model || 'gemini-3.1-flash-image-preview';

  // Route to Venice if model is a Venice image model
  if (isVeniceImageModel(geminiModel)) {
    const veniceKey = process.env.VENICE_API_KEY;
    if (!veniceKey) throw new Error('VENICE_API_KEY not set in environment. Add it to .env to use Venice image models.');
    return callVeniceImage(prompt, veniceKey, geminiModel);
  }

  const ai = new GoogleGenAI({ apiKey });

  const imageConfig: Record<string, string> = {};
  if (options?.aspectRatio) imageConfig.aspectRatio = options.aspectRatio;
  if (options?.imageSize) imageConfig.imageSize = options.imageSize;

  // Build contents: reference images (as inlineData parts) + text prompt
  const parts: Array<Record<string, unknown>> = [];

  if (options?.referenceImages?.length) {
    for (const ref of options.referenceImages) {
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
    }
  }
  parts.push({ text: prompt });

  const rawResponse = await ai.models.generateContent({
    model: geminiModel,
    contents: [{ parts }],
    config: {
      responseModalities: ['IMAGE'],
      ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
    },
  });

  // Handle both wrapped ({ response: ... }) and direct response shapes
  const responseData = (rawResponse as Record<string, unknown>)['response'] ?? rawResponse;
  const candidates = (responseData as Record<string, unknown>)['candidates'] as unknown[];

  if (!candidates || candidates.length === 0) {
    throw new Error('No image generated: empty candidates in Gemini response');
  }

  const responseParts = ((candidates[0] as Record<string, unknown>)['content'] as Record<string, unknown>)?.['parts'] as unknown[] ?? [];
  const imagePart = responseParts.find((p) => (p as Record<string, unknown>)['inlineData']) as Record<string, unknown> | undefined;
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

// ─── Background Image Placement ──────────────────────────────────────────────
// Fire-and-forget: generates image via Gemini, places in frame, reorders to back.
// If skipPreview=false (default), does two-phase: 512px preview first, then high-res replacement.

async function placeImageInBackground(
  sendDesignCommand: SendDesignCommand,
  frameId: string,
  width: number,
  height: number,
  geminiPrompt: string,
  apiKey: string,
  aspectRatio: string,
  imageSize: string,
  brief: string,
  skipPreview: boolean,
  referenceImages?: ReferenceImage[],
  asFill?: boolean,
  imageModel?: string,
): Promise<void> {
  const IMAGE_OUTPUT_DIR = process.env.IMAGE_OUTPUT_DIR || nodePath.join(process.cwd(), 'output');
  fs.mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });

  // Helper: place an image buffer in the frame
  // asFill=true → sets the image directly as the frame's fill (no child node)
  // asFill=false → creates a child image node and reorders to back (legacy)
  async function placeAndReorder(imageBase64: string, name: string): Promise<string> {
    if (asFill) {
      await sendDesignCommand('apply_template_image', {
        nodeId: frameId,
        imageData: imageBase64,
        scaleMode: 'FILL',
      });
      return frameId;
    }

    const imageResult = await sendDesignCommand('create_image', {
      imageData: imageBase64,
      name,
      width,
      height,
      x: 0,
      y: 0,
      parentId: frameId,
      scaleMode: 'FILL',
    }) as Record<string, unknown>;

    const nodeId = (imageResult['nodeId'] as string) ?? (imageResult['id'] as string);

    // Reorder to index 0 (bottom-most layer, behind all other elements)
    try {
      await sendDesignCommand('reorder_child', { parentId: frameId, nodeId, index: 0 });
    } catch {
      // reorder_child may not be available — image still placed, just not at back
      process.stderr.write('[Figmento] reorder_child failed — image may not be at bottom layer\n');
    }

    return nodeId;
  }

  // Helper: generate image and convert to base64
  async function generateAndEncode(size: string): Promise<string> {
    const imageBuffer = await callGemini(geminiPrompt, apiKey, { aspectRatio, imageSize: size, referenceImages: referenceImages?.length ? referenceImages : undefined, model: imageModel });
    const outPath = nodePath.join(IMAGE_OUTPUT_DIR, `figmento-generated-${Date.now()}.png`);
    fs.writeFileSync(outPath, imageBuffer);
    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  }

  // Helper: fallback to picsum placeholder
  async function placeFallback(): Promise<void> {
    try {
      const fallbackBase64 = await fetchPlaceholderBase64(brief, width, height);
      await placeAndReorder(fallbackBase64, 'Background Image (placeholder)');
      process.stderr.write('[Figmento] Background: placeholder image placed\n');
    } catch (err) {
      process.stderr.write(`[Figmento] Background: placeholder also failed: ${(err as Error).message}\n`);
    }
  }

  try {
    if (skipPreview) {
      // Single-phase: generate at target resolution directly
      const imageBase64 = await generateAndEncode(imageSize);
      await placeAndReorder(imageBase64, 'Background Image');
      process.stderr.write(`[Figmento] Background: image placed at ${imageSize} resolution\n`);
    } else {
      // Two-phase: 512px preview first, then high-res replacement
      // Phase A: Fast 512px preview (~1.2s)
      let previewNodeId: string | null = null;
      try {
        const previewBase64 = await generateAndEncode('512');
        previewNodeId = await placeAndReorder(previewBase64, 'Background Image (preview)');
        process.stderr.write('[Figmento] Background: 512px preview placed\n');
      } catch (previewErr) {
        process.stderr.write(`[Figmento] Background: 512px preview failed: ${(previewErr as Error).message}\n`);
        // Fall through to try high-res directly
      }

      // Phase B: High-res replacement
      try {
        const highResBase64 = await generateAndEncode(imageSize);

        // Delete preview if it was placed
        if (previewNodeId) {
          try {
            await sendDesignCommand('delete_node', { nodeId: previewNodeId });
          } catch {
            // Preview deletion failed — high-res will stack on top, acceptable
          }
        }

        await placeAndReorder(highResBase64, 'Background Image');
        process.stderr.write(`[Figmento] Background: high-res image placed at ${imageSize} resolution\n`);
      } catch (highResErr) {
        process.stderr.write(`[Figmento] Background: high-res failed: ${(highResErr as Error).message}\n`);
        // If preview was placed, keep it (SP-5 AC4). If not, use placeholder.
        if (!previewNodeId) {
          await placeFallback();
        }
      }
    }
  } catch (err) {
    process.stderr.write(`[Figmento] Background: image generation failed: ${(err as Error).message}\n`);
    await placeFallback();
  }
}

// ─── Schema ────────────────────────────────────────────────────────────────────

export const generateDesignImageSchema = {
  brief: z.string().describe('Design brief describing the image subject and style (e.g. "hippie coffee shop warm earthy vintage")'),
  format: z.string().optional().describe('Format preset: instagram_portrait, story, tiktok, pinterest, instagram_square, facebook_post, hero, landing_hero, landscape, youtube_thumbnail, facebook_cover, twitter_header, linkedin_banner. Determines frame dimensions and default text zone.'),
  mood: z.string().optional().describe('Mood or atmosphere hint appended to the Gemini prompt (e.g. "earthy", "luxury", "playful", "dark cinematic")'),
  textZone: z.string().optional().describe('Override composition text zone: bottom-40%, bottom-35%, bottom-30%, bottom-25%, or left-40%'),
  frameId: z.string().optional().describe('Target frame nodeId. If omitted, auto-resolved from current Figma selection or a new frame is created using the format dimensions.'),
  name: z.string().optional().describe('Frame name when a new frame is created. Defaults to the brief truncated to 40 characters.'),
  referenceImagePath: z.string().optional().describe('Path to a reference image file (PNG, JPG, WEBP). The generated image will inherit the style, composition, and mood of this reference. Accepts absolute paths or paths within temp/imports/ or brand-assets/.'),
  model: z.string().optional().describe('Image generation model. Gemini: "gemini-3.1-flash-image-preview" (fast, default), "gemini-3.1-pro-preview" (quality). Venice: "grok-imagine-image-pro". Venice models require VENICE_API_KEY in .env.'),
  awaitImage: z.boolean().optional().describe('If true, block until image is fully generated and placed (legacy sequential mode). Default false — returns frameId immediately.'),
  skipPreview: z.boolean().optional().describe('If true, skip the fast 512px preview and generate at target resolution directly. Default false — two-phase (preview + high-res).'),
  asFill: z.boolean().optional().describe('If true, apply the generated image directly as the frame\'s IMAGE fill instead of creating a child node. Use this when you want to replace the frame background without adding children. Default false.'),
};

// ─── Tool Registration ─────────────────────────────────────────────────────────

export function registerImageGenTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'generate_design_image',
    'Generate a background image with Gemini and place it in a Figma frame. Returns frameId immediately while image generates in background. Use awaitImage=true to block until placed.',
    generateDesignImageSchema,
    async (params) => {
      // Fail fast if API key missing
      const useVeniceModel = params.model && isVeniceImageModel(params.model);
      const apiKey = useVeniceModel ? (process.env.VENICE_API_KEY || '') : (process.env.GEMINI_API_KEY || '');
      const keyName = useVeniceModel ? 'VENICE_API_KEY' : 'GEMINI_API_KEY';
      process.stderr.write(`[Figmento ImageGen] ${keyName}=${apiKey ? apiKey.slice(0, 8) + '...' : 'NOT SET'} model=${params.model || 'default'}\n`);
      if (!apiKey) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: `${keyName} not set in environment. Add it to .env to use image generation.` }),
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
      const hasReference = !!params.referenceImagePath;
      const promptPrefix = hasReference ? 'Generate an image inspired by this reference style: ' : '';
      const geminiPrompt = promptPrefix + buildGeminiPrompt(params.brief, params.mood, textZone);

      // Load reference image if provided (graceful fallback — null means text-only)
      const referenceImages: ReferenceImage[] = [];
      if (params.referenceImagePath) {
        const ref = loadReferenceImage(params.referenceImagePath);
        if (ref) referenceImages.push(ref);
      }

      // Resolve format-aware image generation parameters
      const imageSize = formatKey ? getResolutionForFormat(formatKey) : '1K';
      const aspectRatio = formatKey ? getAspectRatioForFormat(formatKey) : '1:1';
      const skipPreview = params.skipPreview ?? false;

      if (params.awaitImage) {
        // ─── Legacy sequential mode: block until image is placed ───
        const IMAGE_OUTPUT_DIR = process.env.IMAGE_OUTPUT_DIR || nodePath.join(process.cwd(), 'output');
        fs.mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });

        let imageBase64: string;
        let fallbackUsed = false;

        try {
          const imageBuffer = await callGemini(geminiPrompt, apiKey, { aspectRatio, imageSize, referenceImages: referenceImages.length > 0 ? referenceImages : undefined, model: params.model });
          const outPath = nodePath.join(IMAGE_OUTPUT_DIR, `figmento-generated-${Date.now()}.png`);
          fs.writeFileSync(outPath, imageBuffer);
          imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
        } catch (geminiErr) {
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

        let imageNodeId: string;

        if (params.asFill) {
          // Apply directly as the frame's IMAGE fill (no child node)
          await sendDesignCommand('apply_template_image', {
            nodeId: frame.frameId,
            imageData: imageBase64,
            scaleMode: 'FILL',
          });
          imageNodeId = frame.frameId;
        } else {
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
          imageNodeId = (imageResult['nodeId'] as string) ?? (imageResult['id'] as string);
        }

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
              imageStatus: 'placed' as const,
            }),
          }],
        };
      }

      // ─── Async mode (default): return frameId immediately, image in background ───

      // Fire-and-forget: image generation + placement runs in background
      placeImageInBackground(
        sendDesignCommand,
        frame.frameId,
        frame.width,
        frame.height,
        geminiPrompt,
        apiKey,
        aspectRatio,
        imageSize,
        params.brief,
        skipPreview,
        referenceImages.length > 0 ? referenceImages : undefined,
        params.asFill,
        params.model,
      ).catch((err) => {
        process.stderr.write(`[Figmento] Background image placement error: ${(err as Error).message}\n`);
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            frameId: frame.frameId,
            width: frame.width,
            height: frame.height,
            isNewFrame: frame.isNewFrame,
            textZone,
            geminiPrompt,
            imageStatus: 'generating' as const,
          }),
        }],
      };
    },
  );
}
