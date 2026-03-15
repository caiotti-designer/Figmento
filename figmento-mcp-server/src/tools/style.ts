import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

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
    'Reverse the direction of gradient fills on a node by inverting all stop positions (position → 1 - position). Use when the gradient is going the wrong direction. One atomic call — no need to read stops first.',
    {
      nodeId: z.string().describe('NodeId of the node whose gradient fills should be flipped'),
    },
    async (params) => {
      const result = await sendDesignCommand('flip_gradient', { nodeId: params.nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );
}
