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
      fills: z.array(z.object({
        type: z.enum(['SOLID', 'GRADIENT_LINEAR']),
        color: z.string().optional().describe('Hex color (e.g. "#FF5733")'),
        opacity: z.number().optional(),
        gradientStops: z.array(z.object({
          position: z.number(),
          color: z.string(),
          opacity: z.number().optional(),
        })).optional(),
      })).optional().describe('Fill paints array'),
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
      color: z.string().optional().describe('Hex color (default: "#000000")'),
      name: z.string().optional().describe('Layer name'),
      width: z.number().optional().describe('Text box width (default: 200)'),
      height: z.number().optional().describe('Text box height (default: 40)'),
      x: z.number().optional(),
      y: z.number().optional(),
      parentId: z.string().optional().describe('Parent frame nodeId to append to'),
      textAlign: z.enum(['LEFT', 'CENTER', 'RIGHT']).optional(),
      lineHeight: z.number().optional().describe('Line height in pixels'),
      letterSpacing: z.number().optional(),
      layoutSizingHorizontal: z.enum(['FIXED', 'FILL', 'HUG']).optional(),
      layoutSizingVertical: z.enum(['FIXED', 'FILL', 'HUG']).optional(),
      segments: z.array(z.object({
        text: z.string(),
        fontWeight: z.number().optional(),
        fontSize: z.number().optional(),
        color: z.string().optional(),
      })).optional().describe('Mixed-weight text segments'),
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
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );
}
