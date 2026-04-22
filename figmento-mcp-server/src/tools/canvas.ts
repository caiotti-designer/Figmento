import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';
import { buildSiblingWarning } from './design-system/showcase-tracker';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

const fillsArraySchema = z.array(z.object({
  type: z.string().describe('Fill type: SOLID or GRADIENT_LINEAR'),
  color: z.string().optional().describe('Hex color (e.g. "#FF5733")'),
  opacity: z.number().optional(),
  gradientStops: z.array(z.object({
    position: z.number(),
    color: z.string(),
    opacity: z.number().optional(),
  })).optional(),
  gradientDirection: z.string().optional().describe('Gradient direction: left-right, right-left, top-bottom, bottom-top (default: top-bottom)'),
}));

export const createFrameSchema = {
  name: z.string().optional().describe('Frame name'),
  width: z.number().describe('Width in pixels'),
  height: z.number().describe('Height in pixels'),
  x: z.number().optional().describe('X position (default: viewport center)'),
  y: z.number().optional().describe('Y position (default: viewport center)'),
  parentId: z.string().optional().describe('Parent frame nodeId to append to'),
  fillColor: z.string().optional().describe('Shorthand solid fill: hex color (e.g. "#FF5733"). Use instead of the fills array for a single solid color.'),
  fills: fillsArraySchema.optional().describe('Fill paints array. Use fillColor instead for a single solid color.'),
  cornerRadius: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
  layoutMode: z.string().optional().describe('Auto-layout direction: HORIZONTAL, VERTICAL, or NONE'),
  itemSpacing: z.number().optional().describe('Gap between auto-layout children'),
  paddingTop: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingBottom: z.number().optional(),
  paddingLeft: z.number().optional(),
  primaryAxisAlignItems: z.string().optional().describe('MIN, CENTER, MAX, or SPACE_BETWEEN'),
  counterAxisAlignItems: z.string().optional().describe('MIN, CENTER, or MAX'),
  primaryAxisSizingMode: z.string().optional().describe('Pass FIXED to preserve explicit width/height — omitting or passing AUTO/HUG causes the frame to shrink to fit its children'),
  counterAxisSizingMode: z.string().optional().describe('Pass FIXED to preserve explicit width/height — omitting or passing AUTO/HUG causes the frame to shrink to fit its children'),
  clipsContent: z.boolean().optional(),
};

export const createTextSchema = {
  text: z.string().min(1, 'Text content cannot be empty').describe('Text content (use \\n for line breaks)'),
  fontSize: z.number().optional().describe('Font size in pixels (default: 16)'),
  fontFamily: z.string().optional().describe('Google Font name. IMPORTANT: Use the font specified in the design prompt. Do not default to Inter if another font was requested.'),
  fontWeight: z.number().optional().describe('Font weight: 100-900 (default: 400)'),
  color: z.string().optional().describe('Hex text color (default: "#000000"). Also accepted as fillColor.'),
  fillColor: z.string().optional().describe('Alias for color — hex text color (e.g. "#FF5733").'),
  name: z.string().optional().describe('Layer name'),
  width: z.number().optional().describe('Text box width (default: 200)'),
  height: z.number().optional().describe('Text box height (default: 40)'),
  x: z.number().optional(),
  y: z.number().optional(),
  parentId: z.string().optional().describe('Parent frame nodeId to append to'),
  textAlign: z.string().optional().describe('Text alignment: LEFT, CENTER, or RIGHT'),
  lineHeight: z.number().optional().describe('Line height: values < 10 treated as a multiplier (e.g. 1.5 = 1.5× fontSize, 1.2 = tight). Values ≥ 10 treated as pixels. Pass 1.2–1.6 for ratios, or e.g. 70 for exact pixels.'),
  letterSpacing: z.number().optional(),
  italic: z.boolean().optional().describe('Italic style for entire text'),
  underline: z.boolean().optional().describe('Underline decoration for entire text'),
  strikethrough: z.boolean().optional().describe('Strikethrough decoration for entire text'),
  layoutSizingHorizontal: z.string().optional().describe('FIXED, FILL, or HUG'),
  layoutSizingVertical: z.string().optional().describe('FIXED, FILL, or HUG'),
  segments: z.array(z.object({
    text: z.string(),
    fontWeight: z.number().optional(),
    fontSize: z.number().optional(),
    color: z.string().optional(),
    italic: z.boolean().optional().describe('Italic style for this segment'),
    underline: z.boolean().optional().describe('Underline decoration for this segment'),
    strikethrough: z.boolean().optional().describe('Strikethrough decoration for this segment'),
  })).optional().describe('Mixed-style text segments (weight, size, color, italic, underline, strikethrough)'),
};

export const createRectangleSchema = {
  name: z.string().optional(),
  width: z.number().describe('Width in pixels'),
  height: z.number().describe('Height in pixels'),
  x: z.number().optional(),
  y: z.number().optional(),
  parentId: z.string().optional(),
  fills: fillsArraySchema.optional(),
  stroke: z.object({
    color: z.string(),
    width: z.number(),
  }).optional(),
  cornerRadius: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
};

export const createEllipseSchema = {
  name: z.string().optional(),
  width: z.number().describe('Width (use same as height for circle)'),
  height: z.number().describe('Height'),
  x: z.number().optional(),
  y: z.number().optional(),
  parentId: z.string().optional(),
  fills: z.array(z.object({
    type: z.string().describe('Fill type: SOLID'),
    color: z.string().optional(),
    opacity: z.number().optional(),
  })).optional(),
};

export const createImageSchema = {
  imageData: z.string().describe('Base64 image data (with or without data: prefix)'),
  name: z.string().optional(),
  width: z.number().optional().describe('Width (default: 400)'),
  height: z.number().optional().describe('Height (default: 300)'),
  x: z.number().optional(),
  y: z.number().optional(),
  parentId: z.string().optional(),
  cornerRadius: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
  scaleMode: z.string().optional().describe('Image scale mode: FILL, FIT, CROP, or TILE (default: FILL)'),
};

export const placeGeneratedImageSchema = {
  filePath: z.string().describe('Absolute path to the image file (PNG, JPG, or WebP)'),
  name: z.string().optional().describe('Layer name for the image in Figma'),
  width: z.number().optional().describe('Width in pixels (default: 400)'),
  height: z.number().optional().describe('Height in pixels (default: 300)'),
  x: z.number().optional().describe('X position'),
  y: z.number().optional().describe('Y position'),
  parentId: z.string().optional().describe('Parent frame nodeId to append the image to'),
  cornerRadius: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
  scaleMode: z.string().optional().describe('Image scale mode: FILL, FIT, CROP, or TILE (default: FILL)'),
};

export const fetchPlaceholderImageSchema = {
  prompt: z.string().optional().describe('Image generation prompt — 2-3 meaningful nouns are extracted as seed keywords'),
  keywords: z.string().optional().describe('Explicit search keywords, overrides prompt extraction (e.g. "fintech office minimal")'),
  width: z.number().default(1080).describe('Image width in pixels (default: 1080)'),
  height: z.number().default(1080).describe('Image height in pixels (default: 1080)'),
};

export const createVectorSchema = {
  name: z.string().optional().describe('Layer name (default: "Vector")'),
  x: z.number().optional().describe('X position'),
  y: z.number().optional().describe('Y position'),
  width: z.number().optional().describe('Bounding box width'),
  height: z.number().optional().describe('Bounding box height'),
  svgPath: z.string().optional().describe('SVG path data string (e.g. "M 0 0 L 100 0 L 50 86.6 Z"). Simplest way to create a vector shape.'),
  vectorPaths: z.array(z.object({
    data: z.string().describe('SVG path data string'),
    windingRule: z.string().optional().describe('NONZERO (default) or EVENODD'),
  })).optional().describe('Multiple SVG path data strings (for compound shapes)'),
  vertices: z.array(z.object({
    x: z.number(),
    y: z.number(),
    cornerRadius: z.number().optional(),
  })).optional().describe('Simple polygon vertices — auto-generates a closed shape from 3+ points'),
  fillColor: z.string().optional().describe('Hex fill color'),
  strokeColor: z.string().optional().describe('Hex stroke color'),
  strokeWeight: z.number().optional().describe('Stroke weight in pixels'),
  parentId: z.string().optional().describe('Parent frame to append to'),
};

export const setTextSchema = {
  nodeId: z.string().describe('Text node ID to update'),
  content: z.string().describe('New text content'),
  fontSize: z.number().optional().describe('New font size in pixels'),
  fontFamily: z.string().optional().describe('New font family (e.g., "Inter", "Poppins")'),
  fontWeight: z.number().optional().describe('Font weight (400=Regular, 500=Medium, 600=SemiBold, 700=Bold)'),
  color: z.string().optional().describe('Text color as hex (e.g., "#FFFFFF")'),
};

export function registerCanvasTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'create_frame',
    'Create a frame (container) on the Figma canvas. Frames can have auto-layout, fills, padding, and contain children. Returns the nodeId of the created frame.',
    createFrameSchema,
    async (params) => {
      const data = await sendDesignCommand('create_frame', params);
      // DQ-HF-1: warn on likely-sibling-of-recent-showcase mistakes (never blocks)
      const siblingWarning = buildSiblingWarning({ parentId: params.parentId, width: params.width });
      const payload = siblingWarning ? { ...data, warning: siblingWarning } : data;
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
    }
  );

  server.tool(
    'create_text',
    'Create a text element on the Figma canvas. Supports Google Fonts, mixed-weight segments, and auto-layout sizing. Returns the nodeId.',
    createTextSchema,
    async (params) => {
      const data = await sendDesignCommand('create_text', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'create_rectangle',
    'Create a rectangle shape on the Figma canvas.',
    createRectangleSchema,
    async (params) => {
      const data = await sendDesignCommand('create_rectangle', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'create_ellipse',
    'Create an ellipse/circle on the Figma canvas.',
    createEllipseSchema,
    async (params) => {
      const data = await sendDesignCommand('create_ellipse', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'create_image',
    'Place an image on the Figma canvas from base64 data. Use this after generating an image with mcp-image — read the file and pass the base64 content.',
    createImageSchema,
    async (params) => {
      const data = await sendDesignCommand('create_image', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  // NOTE: create_icon has moved to tools/icons.ts with auto SVG loading from lucide-static

  server.tool(
    'place_generated_image',
    'Place an image from a local file path onto the Figma canvas. Reads and base64-encodes the file server-side.',
    placeGeneratedImageSchema,
    async (params) => {
      const IMAGE_OUTPUT_DIR = process.env.IMAGE_OUTPUT_DIR || nodePath.join(process.cwd(), 'output');
      const resolvedPath = nodePath.resolve(params.filePath);
      const normalizedPath = nodePath.normalize(resolvedPath);
      const allowedDir = nodePath.resolve(IMAGE_OUTPUT_DIR);

      if (!normalizedPath.startsWith(allowedDir + nodePath.sep) && normalizedPath !== allowedDir) {
        throw new Error(
          `Access denied: file path must be within IMAGE_OUTPUT_DIR (${allowedDir}). Got: ${normalizedPath}`
        );
      }

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Image file not found: ${resolvedPath}`);
      }

      const buffer = fs.readFileSync(resolvedPath);
      const ext = nodePath.extname(resolvedPath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
      };
      const mime = mimeMap[ext] || 'image/png';
      const base64 = `data:${mime};base64,${buffer.toString('base64')}`;

      const data = await sendDesignCommand('create_image', {
        imageData: base64,
        name: params.name,
        width: params.width,
        height: params.height,
        x: params.x,
        y: params.y,
        parentId: params.parentId,
        cornerRadius: params.cornerRadius,
        scaleMode: params.scaleMode,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'fetch_placeholder_image',
    'Fetch a placeholder photo from picsum.photos as base64. Fallback when AI image generation is unavailable. Returns { base64, width, height }.',
    fetchPlaceholderImageSchema,
    async (params) => {
      const STOP_WORDS = new Set([
        'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'into', 'through', 'during', 'before',
        'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
        'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
        'that', 'this', 'these', 'those', 'it', 'its', 'some', 'any', 'very',
        'just', 'more', 'most', 'also', 'using', 'use', 'high', 'quality',
        'professional', 'modern', 'clean', 'minimal', 'beautiful', 'stunning',
      ]);

      let seed: string;
      if (params.keywords) {
        seed = params.keywords.trim().replace(/\s+/g, '-');
      } else if (params.prompt) {
        const words = params.prompt
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
        seed = words.slice(0, 3).join('-') || 'default';
      } else {
        seed = 'default';
      }

      const width = params.width ?? 1080;
      const height = params.height ?? 1080;
      const picsumUrl = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;

      const response = await fetch(picsumUrl, { redirect: 'follow' });
      if (!response.ok) {
        throw new Error(`Picsum fetch failed: ${response.status} ${response.statusText}`);
      }

      const finalUrl = response.url;
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            source: 'placeholder_image',
            url: finalUrl,
            base64,
            width,
            height,
          }),
        }],
      };
    }
  );

  server.tool(
    'set_text',
    'Update text content and optionally style (font, size, weight, color) on an existing text node.',
    setTextSchema,
    async (params) => {
      const data = await sendDesignCommand('apply_template_text', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK + zod
  server.tool(
    'create_vector',
    'Create a custom vector shape from SVG path data or polygon vertices.',
    createVectorSchema,
    async (params) => {
      const data = await sendDesignCommand('create_vector', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );
}
