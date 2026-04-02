import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export const setFillSchema = {
  nodeId: z.string().describe('Target node ID'),
  color: z.string().optional().describe('Simple hex color (e.g. "#FF5733")'),
  opacity: z.number().optional().describe('Fill opacity 0-1'),
  fills: z.array(z.object({
    type: z.string().describe('Fill type: SOLID or GRADIENT_LINEAR'),
    color: z.string().optional(),
    opacity: z.number().optional(),
    gradientStops: z.array(z.object({
      position: z.number(),
      color: z.string(),
      opacity: z.number().optional(),
    })).optional(),
    gradientDirection: z.string().optional().describe('Direction of gradient visual flow: left-right, right-left, top-bottom, bottom-top (default: top-bottom)'),
  })).optional().describe('Full fills array (overrides color param)'),
};

export const setStrokeSchema = {
  nodeId: z.string().describe('Target node ID'),
  color: z.string().optional().describe('Hex color (omit to remove stroke)'),
  width: z.number().optional().describe('Stroke width in pixels (default: 1)'),
};

export const setEffectsSchema = {
  nodeId: z.string().describe('Target node ID'),
  effects: z.array(z.object({
    type: z.string().describe('Effect type: DROP_SHADOW or INNER_SHADOW'),
    color: z.string().describe('Shadow color hex'),
    opacity: z.number().optional().describe('Shadow opacity 0-1 (default: 0.25)'),
    offset: z.object({ x: z.number(), y: z.number() }),
    blur: z.number(),
    spread: z.number().optional(),
  })).describe('Effects array (empty to clear)'),
};

export const setCornerRadiusSchema = {
  nodeId: z.string().describe('Target node ID'),
  radius: z.union([
    z.number().describe('Uniform radius'),
    z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[topLeft, topRight, bottomRight, bottomLeft]'),
  ]),
};

export const setOpacitySchema = {
  nodeId: z.string().describe('Target node ID'),
  opacity: z.number().min(0).max(1).describe('Opacity value 0-1'),
};

export const setAutoLayoutSchema = {
  nodeId: z.string().describe('Target frame node ID'),
  layoutMode: z.string().describe('Layout direction: HORIZONTAL, VERTICAL, or NONE'),
  itemSpacing: z.number().optional().describe('Gap between children'),
  paddingTop: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingBottom: z.number().optional(),
  paddingLeft: z.number().optional(),
  primaryAxisAlignItems: z.string().optional().describe('MIN, CENTER, MAX, or SPACE_BETWEEN'),
  counterAxisAlignItems: z.string().optional().describe('MIN, CENTER, or MAX'),
  primaryAxisSizingMode: z.string().optional().describe('FIXED = fixed size; HUG/AUTO = hug contents'),
  counterAxisSizingMode: z.string().optional().describe('FIXED = fixed size; HUG/AUTO = hug contents'),
};

// ═══════════════════════════════════════════════════════════
// Consolidated set_style schema
// ═══════════════════════════════════════════════════════════

export const setStyleSchema = {
  property: z.string().describe('Which style property to set: "fill" | "stroke" | "effects" | "cornerRadius" | "opacity"'),
  nodeId: z.string().describe('Target node ID'),
  // fill params
  color: z.string().optional().describe('Hex color for fill or stroke'),
  opacity: z.number().optional().describe('Opacity value (0-1). For fill: fill opacity. For opacity property: node opacity.'),
  fills: z.array(z.object({
    type: z.string().describe('Fill type: SOLID or GRADIENT_LINEAR'),
    color: z.string().optional(),
    opacity: z.number().optional(),
    gradientStops: z.array(z.object({
      position: z.number(),
      color: z.string(),
      opacity: z.number().optional(),
    })).optional(),
    gradientDirection: z.string().optional().describe('Gradient direction: left-right, right-left, top-bottom, bottom-top'),
  })).optional().describe('Full fills array (overrides color param). Used when property="fill".'),
  // stroke params
  width: z.number().optional().describe('Stroke width in pixels. Used when property="stroke".'),
  // effects params
  effects: z.array(z.object({
    type: z.string().describe('Effect type: DROP_SHADOW or INNER_SHADOW'),
    color: z.string().describe('Shadow color hex'),
    opacity: z.number().optional().describe('Shadow opacity 0-1 (default: 0.25)'),
    offset: z.object({ x: z.number(), y: z.number() }),
    blur: z.number(),
    spread: z.number().optional(),
  })).optional().describe('Effects array. Used when property="effects".'),
  // cornerRadius params
  radius: z.union([
    z.number().describe('Uniform radius'),
    z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[topLeft, topRight, bottomRight, bottomLeft]'),
  ]).optional().describe('Corner radius. Used when property="cornerRadius".'),
};

export const styleTextRangeSchema = {
  nodeId: z.string().describe('Text node ID'),
  ranges: z.array(z.object({
    start: z.number().describe('Start character index (0-based, inclusive)'),
    end: z.number().describe('End character index (exclusive)'),
    fontFamily: z.string().optional().describe('Font family name (e.g. "Poppins", "Inter")'),
    fontWeight: z.number().optional().describe('Font weight (100-900). Maps to style: 400=Regular, 700=Bold, etc.'),
    fontSize: z.number().optional().describe('Font size in pixels'),
    color: z.string().optional().describe('Text color as hex (e.g. "#FF0000")'),
    letterSpacing: z.number().optional().describe('Letter spacing in pixels'),
    lineHeight: z.number().optional().describe('Line height in pixels'),
    textDecoration: z.string().optional().describe('Text decoration: NONE, UNDERLINE, or STRIKETHROUGH'),
    textCase: z.string().optional().describe('Text case: ORIGINAL, UPPER, LOWER, or TITLE'),
  })).describe('Array of ranges to style. Each range specifies a character span and the styles to apply.'),
};

function wrap(data: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

async function handleSetStyle(params: Record<string, unknown>, sendDesignCommand: SendDesignCommand) {
  const property = params.property as string;
  switch (property) {
    case 'fill':
      return wrap(await sendDesignCommand('set_fill', { nodeId: params.nodeId, color: params.color, opacity: params.opacity, fills: params.fills }));
    case 'stroke':
      return wrap(await sendDesignCommand('set_stroke', { nodeId: params.nodeId, color: params.color, width: params.width }));
    case 'effects':
      return wrap(await sendDesignCommand('set_effects', { nodeId: params.nodeId, effects: params.effects }));
    case 'cornerRadius':
      return wrap(await sendDesignCommand('set_corner_radius', { nodeId: params.nodeId, radius: params.radius }));
    case 'opacity':
      return wrap(await sendDesignCommand('set_opacity', { nodeId: params.nodeId, opacity: params.opacity }));
    default:
      throw new Error(`Unknown set_style property: "${property}". Must be one of: fill, stroke, effects, cornerRadius, opacity`);
  }
}

export function registerStyleTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  // ═══════════════════════════════════════════════════════════
  // Consolidated tool: set_style
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'set_style',
    'Set a visual style property on a node. Use the "property" param to choose what to set: "fill" (solid or gradient fills), "stroke" (border), "effects" (shadows), "cornerRadius", or "opacity".',
    setStyleSchema,
    async (params) => handleSetStyle(params as Record<string, unknown>, sendDesignCommand)
  );

  // ═══════════════════════════════════════════════════════════
  // set_auto_layout stays separate (not merged into set_style)
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'set_auto_layout',
    'Configure auto-layout on a frame (turns it into a flexbox-like container).',
    setAutoLayoutSchema,
    async (params) => {
      const data = await sendDesignCommand('set_auto_layout', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'flip_gradient',
    'Reverse gradient direction on a node by inverting stop positions. One atomic call.',
    {
      nodeId: z.string().describe('NodeId of the node whose gradient fills should be flipped'),
    },
    async (params) => {
      const result = await sendDesignCommand('flip_gradient', { nodeId: params.nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK + zod
  server.tool(
    'style_text_range',
    'Apply different styles to specific character ranges within a text node. Supports multiple ranges in one call.',
    styleTextRangeSchema,
    async (params) => {
      const data = await sendDesignCommand('style_text_range', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // set_image_fill — set IMAGE fill on an existing node from a local file
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'set_image_fill',
    'Set an IMAGE fill on an existing node from a local file path. Reads and base64-encodes the file server-side, then applies it as the node\'s fill. Use this to replace a frame\'s background with an image without creating a child node.',
    {
      nodeId: z.string().describe('Target node ID to apply the image fill to'),
      filePath: z.string().describe('Absolute path to the image file (PNG, JPG, or WebP)'),
      scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional().describe('Image scale mode (default: FILL)'),
    },
    async (params) => {
      const resolvedPath = nodePath.resolve(params.filePath);

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

      const data = await sendDesignCommand('apply_template_image', {
        nodeId: params.nodeId,
        imageData: base64,
        scaleMode: params.scaleMode || 'FILL',
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );
}
