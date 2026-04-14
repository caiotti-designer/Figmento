import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface PageContext {
  industry: string;
  brand: string;
  purpose: string;
  tone: string;
  colors: string;
  sections: string[];
}

export interface ImageSlot {
  nodeId: string;
  width: number;
  height: number;
  siblingContext: string;
  parentName: string;
}

interface ScannedNode {
  nodeId?: string;
  id?: string;
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fills?: Array<{ type?: string; [k: string]: unknown }>;
  children?: ScannedNode[];
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  [k: string]: unknown;
}

interface SlotResult {
  nodeId: string;
  width: number;
  height: number;
  prompt: string;
  siblingContext: string;
  fallbackUsed: boolean;
  success: boolean;
  error?: string;
}

// ─── Page Context Cache (30-min TTL) ────────────────────────────────────────────

const contextCache = new Map<string, { context: PageContext; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function getCachedContext(key: string): PageContext | null {
  const entry = contextCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    contextCache.delete(key);
    return null;
  }
  return entry.context;
}

function setCachedContext(key: string, context: PageContext): void {
  contextCache.set(key, { context, timestamp: Date.now() });
}

// ─── Phase 1: Page Context Analysis ────────────────────────────────────────────

const ANALYSIS_PROMPT = `Analyze this website design screenshot. Extract the following in JSON format ONLY (no markdown, no explanation):
{
  "industry": "specific industry/business type",
  "brand": "company/brand name if visible, or empty string",
  "purpose": "page purpose (e.g. corporate homepage, product landing, portfolio)",
  "tone": "visual tone (e.g. corporate professional, warm artisanal, tech modern)",
  "colors": "dominant color palette description (e.g. navy blue and white with gold accents)",
  "sections": ["list of visible sections with their apparent purpose"]
}`;

async function analyzePageWithVision(
  screenshotBase64: string,
  apiKey: string,
  userContext?: string,
): Promise<PageContext> {
  const ai = new GoogleGenAI({ apiKey });

  const promptSuffix = userContext
    ? `\n\nAdditional context from the user: ${userContext}`
    : '';

  const rawResponse = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [
        { inlineData: { mimeType: 'image/png', data: screenshotBase64 } },
        { text: ANALYSIS_PROMPT + promptSuffix },
      ],
    }],
  });

  const responseData = (rawResponse as Record<string, unknown>)['response'] ?? rawResponse;
  const candidates = (responseData as Record<string, unknown>)['candidates'] as unknown[];
  if (!candidates?.length) throw new Error('No candidates in Gemini analysis response');

  const parts = ((candidates[0] as Record<string, unknown>)['content'] as Record<string, unknown>)?.['parts'] as unknown[] ?? [];
  const textPart = parts.find((p) => (p as Record<string, unknown>)['text']) as Record<string, string> | undefined;
  if (!textPart?.text) throw new Error('No text in Gemini analysis response');

  // Parse JSON from response (strip markdown fences if present)
  let jsonStr = textPart.text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(jsonStr) as Partial<PageContext>;
  return {
    industry: parsed.industry || 'general website',
    brand: parsed.brand || '',
    purpose: parsed.purpose || 'website page',
    tone: parsed.tone || 'professional',
    colors: parsed.colors || 'mixed colors',
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
  };
}

/**
 * Fallback: extract context from text content when Vision is unavailable.
 */
function inferContextFromText(textContent: string, userContext?: string): PageContext {
  const lower = textContent.toLowerCase();
  const industry = userContext || (
    lower.includes('lavadora') || lower.includes('limpeza') ? 'industrial cleaning equipment' :
    lower.includes('café') || lower.includes('coffee') ? 'coffee shop' :
    lower.includes('tech') || lower.includes('software') ? 'technology' :
    'general business'
  );

  return {
    industry,
    brand: '',
    purpose: 'website page',
    tone: 'professional',
    colors: 'mixed colors',
    sections: [],
  };
}

export async function analyzePageContext(
  sendDesignCommand: SendDesignCommand,
  userContext?: string,
): Promise<PageContext> {
  const apiKey = process.env.GEMINI_API_KEY;

  // Try to get page nodes for cache key
  let cacheKey = 'default';
  try {
    const pageNodes = await sendDesignCommand('get_page_nodes', {}) as Record<string, unknown>;
    const nodes = (pageNodes['nodes'] as unknown[]) ?? (Array.isArray(pageNodes) ? pageNodes : []);
    cacheKey = nodes.map((n) => (n as Record<string, string>)['id'] ?? '').join(',').slice(0, 100) || 'default';
  } catch {
    // Use default key
  }

  // Check cache (but append userContext to key if provided)
  const fullKey = userContext ? `${cacheKey}::${userContext}` : cacheKey;
  const cached = getCachedContext(fullKey);
  if (cached) {
    // If user provided extra context, merge it
    if (userContext && !cached.industry.includes(userContext)) {
      cached.industry = `${cached.industry} — ${userContext}`;
    }
    return cached;
  }

  // Try Vision analysis with screenshot
  if (apiKey) {
    try {
      const screenshotResult = await sendDesignCommand('get_screenshot', { scale: 0.5 }) as Record<string, unknown>;
      const base64 = screenshotResult['base64'] as string;
      if (base64) {
        const context = await analyzePageWithVision(base64, apiKey, userContext);
        setCachedContext(fullKey, context);
        return context;
      }
    } catch (err) {
      process.stderr.write(`[Figmento] Vision analysis failed, falling back to text: ${(err as Error).message}\n`);
    }
  }

  // Fallback: text-only analysis via scan_frame_structure
  try {
    const structure = await sendDesignCommand('scan_frame_structure', { depth: 2 }) as ScannedNode;
    const allText = extractAllText(structure);
    const context = inferContextFromText(allText, userContext);
    setCachedContext(fullKey, context);
    return context;
  } catch {
    const context = inferContextFromText('', userContext);
    setCachedContext(fullKey, context);
    return context;
  }
}

// ─── Phase 2: Image Slot Discovery ─────────────────────────────────────────────

/**
 * Recursively extract all text content from a scanned node tree.
 */
export function extractAllText(node: ScannedNode): string {
  const parts: string[] = [];
  if (node.text) parts.push(node.text);
  if (node.name && node.type === 'TEXT') parts.push(node.name);
  if (node.children) {
    for (const child of node.children) {
      parts.push(extractAllText(child));
    }
  }
  return parts.filter(Boolean).join(' | ');
}

function hasTextChildren(node: ScannedNode): boolean {
  if (!node.children) return false;
  return node.children.some((c) => c.type === 'TEXT' || hasTextChildren(c));
}

/**
 * Determines if a scanned node is an image slot candidate.
 */
export function isImageSlot(node: ScannedNode): boolean {
  // Must be FRAME or RECTANGLE
  if (!node.type || !['FRAME', 'RECTANGLE'].includes(node.type)) return false;

  // Must not already have an IMAGE fill
  if (node.fills?.some((f) => f.type === 'IMAGE')) return false;

  // Must not contain text children (it's a content frame, not an image slot)
  if (node.children?.some((c) => c.type === 'TEXT')) return false;

  // Need dimensions
  const width = node.width ?? 0;
  const height = node.height ?? 0;
  if (width < 80 || height < 80) return false;

  // Reasonable aspect ratio (not a thin divider or separator)
  const ratio = width / height;
  if (ratio < 0.3 || ratio > 3.5) return false;

  return true;
}

/**
 * Extract contextual text from siblings/parent to describe a slot's purpose.
 */
export function getSlotContext(slot: ScannedNode, parent: ScannedNode): string {
  if (!parent.children) return parent.name || '';

  const slotId = slot.nodeId || slot.id;
  const textParts: string[] = [];

  for (const child of parent.children) {
    const childId = child.nodeId || child.id;
    if (childId === slotId) continue; // Skip the slot itself

    if (child.type === 'TEXT' || hasTextChildren(child)) {
      textParts.push(extractAllText(child));
    }
  }

  return textParts.filter(Boolean).join(' | ') || parent.name || '';
}

/**
 * Walk the scanned tree to find image slot candidates with their sibling context.
 */
function findSlotsRecursive(node: ScannedNode, parent: ScannedNode | null, slots: ImageSlot[]): void {
  if (isImageSlot(node) && parent) {
    slots.push({
      nodeId: (node.nodeId || node.id) as string,
      width: node.width ?? 200,
      height: node.height ?? 200,
      siblingContext: getSlotContext(node, parent),
      parentName: parent.name || 'unknown',
    });
  }

  if (node.children) {
    for (const child of node.children) {
      findSlotsRecursive(child, node, slots);
    }
  }
}

export async function discoverImageSlots(
  sectionId: string,
  sendDesignCommand: SendDesignCommand,
): Promise<ImageSlot[]> {
  const structure = await sendDesignCommand('scan_frame_structure', {
    nodeId: sectionId,
    depth: 3,
  }) as ScannedNode;

  const slots: ImageSlot[] = [];
  findSlotsRecursive(structure, null, slots);

  // Sort by area (largest first) — larger slots are more likely to be primary image slots
  slots.sort((a, b) => (b.width * b.height) - (a.width * a.height));

  return slots;
}

// ─── Phase 3: Contextual Prompt Builder ────────────────────────────────────────

export function buildSlotPrompt(
  slot: ImageSlot,
  context: PageContext,
  style?: string,
): string {
  const industryPart = context.industry && context.industry !== 'general website'
    ? `for a ${context.industry} company website`
    : 'for a website';

  const base = `Professional ${style || 'photograph'} ${industryPart}.`;

  const sectionPart = slot.siblingContext
    ? `This image is for a section about: ${slot.siblingContext}.`
    : '';

  const tonePart = context.tone && context.tone !== 'professional'
    ? `Visual style: ${context.tone}.`
    : '';

  const colorPart = context.colors && context.colors !== 'mixed colors'
    ? `Color palette: ${context.colors}.`
    : '';

  const technicalPart = `Dimensions: ${slot.width}×${slot.height}px. Clean composition suitable for web card/section use. No text overlays in the image.`;

  return [base, sectionPart, tonePart, colorPart, technicalPart]
    .filter(Boolean)
    .join(' ');
}

// ─── Phase 4: Image Generation & Placement ──────────────────────────────────────

async function generateAndPlaceImage(
  slot: ImageSlot,
  prompt: string,
  apiKey: string,
  sendDesignCommand: SendDesignCommand,
  brief: string,
): Promise<SlotResult> {
  const result: SlotResult = {
    nodeId: slot.nodeId,
    width: slot.width,
    height: slot.height,
    prompt,
    siblingContext: slot.siblingContext,
    fallbackUsed: false,
    success: false,
  };

  let imageBase64: string;

  try {
    // Generate with Gemini
    const ai = new GoogleGenAI({ apiKey });
    const rawResponse = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseModalities: ['IMAGE'] },
    });

    const responseData = (rawResponse as Record<string, unknown>)['response'] ?? rawResponse;
    const candidates = (responseData as Record<string, unknown>)['candidates'] as unknown[];
    if (!candidates?.length) throw new Error('No candidates');

    const parts = ((candidates[0] as Record<string, unknown>)['content'] as Record<string, unknown>)?.['parts'] as unknown[] ?? [];
    const imagePart = parts.find((p) => (p as Record<string, unknown>)['inlineData']) as Record<string, unknown> | undefined;
    const inlineData = imagePart?.['inlineData'] as Record<string, string> | undefined;
    if (!inlineData?.['data']) throw new Error('No image data in response');

    imageBase64 = `data:image/png;base64,${inlineData['data']}`;
  } catch (genErr) {
    process.stderr.write(`[Figmento] Image gen failed for slot ${slot.nodeId}: ${(genErr as Error).message}, trying placeholder\n`);
    result.fallbackUsed = true;

    try {
      // Fallback: Picsum placeholder
      const words = brief.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
      const seed = words.join('-') || 'design';
      const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${slot.width}/${slot.height}`;
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`Picsum: ${res.status}`);
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await res.arrayBuffer());
      imageBase64 = `data:${contentType};base64,${buf.toString('base64')}`;
    } catch (fallbackErr) {
      result.error = `Generation and placeholder both failed: ${(fallbackErr as Error).message}`;
      return result;
    }
  }

  // Place the image in the target node
  try {
    await sendDesignCommand('create_image', {
      imageData: imageBase64,
      name: `Contextual Image — ${slot.siblingContext.slice(0, 40) || 'auto'}`,
      width: slot.width,
      height: slot.height,
      x: 0,
      y: 0,
      parentId: slot.nodeId,
      scaleMode: 'FILL',
    });
    result.success = true;
  } catch (placeErr) {
    result.error = `Image placement failed: ${(placeErr as Error).message}`;
  }

  return result;
}

// ─── Schema ────────────────────────────────────────────────────────────────────

export const fillContextualImagesSchema = {
  sectionId: z.string().optional().describe('Frame ID of the section to fill. If omitted, uses current Figma selection.'),
  targetNodeIds: z.array(z.string()).optional().describe('Explicit list of node IDs to fill (overrides auto-discovery heuristic).'),
  context: z.string().optional().describe('Extra context to supplement auto-detection (e.g. "industrial cleaning equipment company"). Does NOT replace auto-analysis.'),
  style: z.string().optional().describe('Image style override: "photographic" (default), "illustration", "3d-render", "watercolor", "minimal".'),
  maxImages: z.number().optional().describe('Override budget cap (default 6, max 8).'),
  skipAnalysis: z.boolean().optional().describe('Skip page analysis if context is fully provided manually via the context param.'),
};

// ─── Tool Registration ──────────────────────────────────────────────────────────

export function registerImageFillTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'fill_contextual_images',
    'Auto-fill empty image slots in a section with AI-generated images. Analyzes page context and nearby text to build prompts. Max 6 images per call.',
    fillContextualImagesSchema,
    async (params) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'GEMINI_API_KEY not set. Add it to .env.' }) }],
          isError: true,
        };
      }

      const maxImages = Math.min(params.maxImages ?? 6, 8);

      // ── Resolve target section ──
      let sectionId = params.sectionId;
      if (!sectionId && !params.targetNodeIds?.length) {
        // Use current selection
        try {
          const sel = await sendDesignCommand('get_selection', {}) as Record<string, unknown>;
          const nodes = (sel['selection'] as unknown[]) ?? (sel['nodes'] as unknown[]) ?? (Array.isArray(sel) ? sel : []);
          const first = nodes[0] as Record<string, unknown> | undefined;
          if (first) {
            sectionId = (first['id'] as string) ?? (first['nodeId'] as string);
          }
        } catch {
          // No selection
        }

        if (!sectionId) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No section selected. Select a section in Figma or pass sectionId/targetNodeIds.' }) }],
            isError: true,
          };
        }
      }

      // ── Phase 1: Context Analysis ──
      let pageContext: PageContext;
      if (params.skipAnalysis && params.context) {
        pageContext = {
          industry: params.context,
          brand: '',
          purpose: 'website',
          tone: 'professional',
          colors: 'mixed colors',
          sections: [],
        };
      } else {
        try {
          pageContext = await analyzePageContext(sendDesignCommand, params.context);
        } catch (err) {
          process.stderr.write(`[Figmento] Context analysis error: ${(err as Error).message}\n`);
          pageContext = inferContextFromText('', params.context);
        }
      }

      // ── Phase 2: Slot Discovery ──
      let slots: ImageSlot[];
      if (params.targetNodeIds?.length) {
        // User-specified targets — get node info for each
        slots = [];
        for (const nodeId of params.targetNodeIds) {
          try {
            const info = await sendDesignCommand('get_node_info', { nodeId }) as Record<string, unknown>;
            const bounds = info['absoluteBoundingBox'] as Record<string, number> | undefined;
            slots.push({
              nodeId,
              width: (info['width'] as number) ?? bounds?.['width'] ?? 400,
              height: (info['height'] as number) ?? bounds?.['height'] ?? 300,
              siblingContext: (info['name'] as string) || '',
              parentName: 'user-specified',
            });
          } catch {
            process.stderr.write(`[Figmento] Could not get info for target node ${nodeId}, skipping\n`);
          }
        }
      } else {
        slots = await discoverImageSlots(sectionId!, sendDesignCommand);
      }

      if (slots.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              pageContext,
              slotsFound: 0,
              slotsFilled: 0,
              slotsSkipped: 0,
              results: [],
              message: 'No empty image slots found in the selected section. All frames either already have images, contain text, or are too small.',
            }),
          }],
        };
      }

      // Apply budget cap
      const slotsToFill = slots.slice(0, maxImages);
      const slotsSkipped = Math.max(0, slots.length - maxImages);
      const skippedIds = slots.slice(maxImages).map((s) => s.nodeId);

      // ── Phase 3 + 4: Generate prompts & place images sequentially ──
      const results: SlotResult[] = [];
      for (const slot of slotsToFill) {
        const prompt = buildSlotPrompt(slot, pageContext, params.style);
        const briefForFallback = slot.siblingContext || pageContext.industry;
        const result = await generateAndPlaceImage(slot, prompt, apiKey, sendDesignCommand, briefForFallback);
        results.push(result);
      }

      // Build suggestions for skipped slots
      const suggestions: string[] = [];
      if (slotsSkipped > 0) {
        suggestions.push(
          `${slotsSkipped} more slot(s) found but skipped (budget cap: ${maxImages}). Call again with targetNodeIds: [${skippedIds.map((id) => `"${id}"`).join(', ')}]`,
        );
      }

      const filled = results.filter((r) => r.success).length;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            pageContext,
            slotsFound: slots.length,
            slotsFilled: filled,
            slotsSkipped,
            results,
            ...(suggestions.length > 0 ? { suggestions } : {}),
          }),
        }],
      };
    },
  );
}
