import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function registerCanvasTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'create_frame',
    'Create a frame (container) on the Figma canvas. Frames can have auto-layout, fills, padding, and contain children. Returns the nodeId of the created frame.',
    {
      name: z.string().optional().describe('Frame name'),
      width: z.number().describe('Width in pixels'),
      height: z.number().describe('Height in pixels'),
      x: z.number().optional().describe('X position (default: viewport center)'),
      y: z.number().optional().describe('Y position (default: viewport center)'),
      parentId: z.string().optional().describe('Parent frame nodeId to append to'),
      fillColor: z.string().optional().describe('Shorthand solid fill: hex color (e.g. "#FF5733"). Use instead of the fills array for a single solid color.'),
      fills: z.array(z.object({
        type: z.enum(['SOLID', 'GRADIENT_LINEAR']),
        color: z.string().optional().describe('Hex color (e.g. "#FF5733")'),
        opacity: z.number().optional(),
        gradientStops: z.array(z.object({
          position: z.number(),
          color: z.string(),
          opacity: z.number().optional(),
        })).optional(),
        gradientDirection: z.enum(['left-right', 'right-left', 'top-bottom', 'bottom-top']).optional().describe('Gradient direction (default: top-bottom)'),
      })).optional().describe('Fill paints array. Use fillColor instead for a single solid color.'),
      cornerRadius: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
      layoutMode: z.enum(['HORIZONTAL', 'VERTICAL', 'NONE']).optional().describe('Auto-layout direction'),
      itemSpacing: z.number().optional().describe('Gap between auto-layout children'),
      paddingTop: z.number().optional(),
      paddingRight: z.number().optional(),
      paddingBottom: z.number().optional(),
      paddingLeft: z.number().optional(),
      primaryAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']).optional(),
      counterAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX']).optional(),
      clipsContent: z.boolean().optional(),
    },
    async (params) => {
      const data = await sendDesignCommand('create_frame', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'create_text',
    'Create a text element on the Figma canvas. Supports Google Fonts, mixed-weight segments, and auto-layout sizing. Returns the nodeId.',
    {
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
      textAlign: z.enum(['LEFT', 'CENTER', 'RIGHT']).optional(),
      lineHeight: z.number().optional().describe('Line height: values > 3 treated as pixels, values ≤ 3 treated as a multiplier (e.g. 1.5 = 1.5× fontSize).'),
      letterSpacing: z.number().optional(),
      italic: z.boolean().optional().describe('Italic style for entire text'),
      underline: z.boolean().optional().describe('Underline decoration for entire text'),
      strikethrough: z.boolean().optional().describe('Strikethrough decoration for entire text'),
      layoutSizingHorizontal: z.enum(['FIXED', 'FILL', 'HUG']).optional(),
      layoutSizingVertical: z.enum(['FIXED', 'FILL', 'HUG']).optional(),
      segments: z.array(z.object({
        text: z.string(),
        fontWeight: z.number().optional(),
        fontSize: z.number().optional(),
        color: z.string().optional(),
        italic: z.boolean().optional().describe('Italic style for this segment'),
        underline: z.boolean().optional().describe('Underline decoration for this segment'),
        strikethrough: z.boolean().optional().describe('Strikethrough decoration for this segment'),
      })).optional().describe('Mixed-style text segments (weight, size, color, italic, underline, strikethrough)'),
    },
    async (params) => {
      const data = await sendDesignCommand('create_text', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'create_rectangle',
    'Create a rectangle shape on the Figma canvas.',
    {
      name: z.string().optional(),
      width: z.number().describe('Width in pixels'),
      height: z.number().describe('Height in pixels'),
      x: z.number().optional(),
      y: z.number().optional(),
      parentId: z.string().optional(),
      fills: z.array(z.object({
        type: z.enum(['SOLID', 'GRADIENT_LINEAR']),
        color: z.string().optional(),
        opacity: z.number().optional(),
        gradientStops: z.array(z.object({
          position: z.number(),
          color: z.string(),
          opacity: z.number().optional(),
        })).optional(),
        gradientDirection: z.enum(['left-right', 'right-left', 'top-bottom', 'bottom-top']).optional().describe('Gradient direction (default: top-bottom)'),
      })).optional(),
      stroke: z.object({
        color: z.string(),
        width: z.number(),
      }).optional(),
      cornerRadius: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
    },
    async (params) => {
      const data = await sendDesignCommand('create_rectangle', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'create_ellipse',
    'Create an ellipse/circle on the Figma canvas.',
    {
      name: z.string().optional(),
      width: z.number().describe('Width (use same as height for circle)'),
      height: z.number().describe('Height'),
      x: z.number().optional(),
      y: z.number().optional(),
      parentId: z.string().optional(),
      fills: z.array(z.object({
        type: z.enum(['SOLID']),
        color: z.string().optional(),
        opacity: z.number().optional(),
      })).optional(),
    },
    async (params) => {
      const data = await sendDesignCommand('create_ellipse', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'create_image',
    'Place an image on the Figma canvas from base64 data. Use this after generating an image with mcp-image — read the file and pass the base64 content.',
    {
      imageData: z.string().describe('Base64 image data (with or without data: prefix)'),
      name: z.string().optional(),
      width: z.number().optional().describe('Width (default: 400)'),
      height: z.number().optional().describe('Height (default: 300)'),
      x: z.number().optional(),
      y: z.number().optional(),
      parentId: z.string().optional(),
      cornerRadius: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
      scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional().default('FILL').describe('Image scale mode (default: FILL)'),
    },
    async (params) => {
      const data = await sendDesignCommand('create_image', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'create_icon',
    'Create a Lucide icon on the Figma canvas. Provide SVG path data for precise rendering, or just the icon name for a basic fallback shape.',
    {
      iconName: z.string().describe('Lucide icon name (e.g., "check", "x", "chevron-right", "circle")'),
      size: z.number().optional().describe('Icon size in pixels (default: 24)'),
      color: z.string().optional().describe('Icon color as hex (default: "#333333")'),
      svgPaths: z.array(z.string()).optional().describe('SVG path data strings from Lucide. Each path is rendered as a stroked vector scaled to the icon size.'),
      name: z.string().optional().describe('Layer name'),
      x: z.number().optional(),
      y: z.number().optional(),
      parentId: z.string().optional().describe('Parent frame nodeId to append to'),
    },
    async (params) => {
      const data = await sendDesignCommand('create_icon', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'place_generated_image',
    'Place an AI-generated image from a local file onto the Figma canvas. Reads the image file from disk, base64 encodes it, and sends it to Figma via the existing image pipeline. Use this after generating images with mcp-image or any other tool that saves images to disk.',
    {
      filePath: z.string().describe('Absolute path to the image file (PNG, JPG, or WebP)'),
      name: z.string().optional().describe('Layer name for the image in Figma'),
      width: z.number().optional().describe('Width in pixels (default: 400)'),
      height: z.number().optional().describe('Height in pixels (default: 300)'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      parentId: z.string().optional().describe('Parent frame nodeId to append the image to'),
      cornerRadius: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
      scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional().default('FILL').describe('Image scale mode (default: FILL)'),
    },
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
    'fetch_unsplash_image',
    'Fetch a relevant photo from Unsplash as a base64-encoded fallback when AI image generation fails or is unavailable. Extracts keywords from the prompt automatically, or accepts explicit keywords. Downloads the image server-side and returns { source: "unsplash_fallback", url, base64, width, height }. Use the base64 field with create_image or set_fill to place the photo on canvas.',
    {
      prompt: z.string().optional().describe('Image generation prompt — 2-3 meaningful nouns are extracted as search keywords'),
      keywords: z.string().optional().describe('Explicit search keywords, overrides prompt extraction (e.g. "fintech office minimal")'),
      width: z.number().default(1080).describe('Image width in pixels (default: 1080)'),
      height: z.number().default(1080).describe('Image height in pixels (default: 1080)'),
    },
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

      let keyword: string;
      if (params.keywords) {
        keyword = params.keywords.trim().replace(/\s+/g, ',');
      } else if (params.prompt) {
        const words = params.prompt
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
        keyword = words.slice(0, 3).join(',') || 'workspace';
      } else {
        keyword = 'workspace';
      }

      const width = params.width ?? 1080;
      const height = params.height ?? 1080;
      const unsplashUrl = `https://source.unsplash.com/featured/${width}x${height}/?${encodeURIComponent(keyword)}`;

      const response = await fetch(unsplashUrl);
      if (!response.ok) {
        throw new Error(`Unsplash fetch failed: ${response.status} ${response.statusText}`);
      }

      const finalUrl = response.url;
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            source: 'unsplash_fallback',
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
    'Update text content and optionally style on an existing text node. Use this to change what a text node says, its font size, font family, weight, or color — without recreating it.',
    {
      nodeId: z.string().describe('Text node ID to update'),
      content: z.string().describe('New text content'),
      fontSize: z.number().optional().describe('New font size in pixels'),
      fontFamily: z.string().optional().describe('New font family (e.g., "Inter", "Poppins")'),
      fontWeight: z.number().optional().describe('Font weight (400=Regular, 500=Medium, 600=SemiBold, 700=Bold)'),
      color: z.string().optional().describe('Text color as hex (e.g., "#FFFFFF")'),
    },
    async (params) => {
      const data = await sendDesignCommand('apply_template_text', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );
}
