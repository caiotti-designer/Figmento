import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function registerStyleTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'set_fill',
    'Set the fill color of an existing node. Supports solid colors and gradients.',
    {
      nodeId: z.string().describe('Target node ID'),
      color: z.string().optional().describe('Simple hex color (e.g. "#FF5733")'),
      opacity: z.number().optional().describe('Fill opacity 0-1'),
      fills: z.array(z.object({
        type: z.enum(['SOLID', 'GRADIENT_LINEAR']),
        color: z.string().optional(),
        opacity: z.number().optional(),
        gradientStops: z.array(z.object({
          position: z.number(),
          color: z.string(),
          opacity: z.number().optional(),
        })).optional(),
      })).optional().describe('Full fills array (overrides color param)'),
    },
    async (params) => {
      const data = await sendDesignCommand('set_fill', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'set_stroke',
    'Set or remove the stroke (border) on a node.',
    {
      nodeId: z.string().describe('Target node ID'),
      color: z.string().optional().describe('Hex color (omit to remove stroke)'),
      width: z.number().optional().describe('Stroke width in pixels (default: 1)'),
    },
    async (params) => {
      const data = await sendDesignCommand('set_stroke', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'set_effects',
    'Add drop shadow or inner shadow effects to a node.',
    {
      nodeId: z.string().describe('Target node ID'),
      effects: z.array(z.object({
        type: z.enum(['DROP_SHADOW', 'INNER_SHADOW']),
        color: z.string().describe('Shadow color hex'),
        opacity: z.number().optional().describe('Shadow opacity 0-1 (default: 0.25)'),
        offset: z.object({ x: z.number(), y: z.number() }),
        blur: z.number(),
        spread: z.number().optional(),
      })).describe('Effects array (empty to clear)'),
    },
    async (params) => {
      const data = await sendDesignCommand('set_effects', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'set_corner_radius',
    'Set corner radius on a frame or rectangle.',
    {
      nodeId: z.string().describe('Target node ID'),
      radius: z.union([
        z.number().describe('Uniform radius'),
        z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[topLeft, topRight, bottomRight, bottomLeft]'),
      ]),
    },
    async (params) => {
      const data = await sendDesignCommand('set_corner_radius', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'set_opacity',
    'Set the opacity of a node.',
    {
      nodeId: z.string().describe('Target node ID'),
      opacity: z.number().min(0).max(1).describe('Opacity value 0-1'),
    },
    async (params) => {
      const data = await sendDesignCommand('set_opacity', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'set_auto_layout',
    'Configure auto-layout on a frame (turns it into a flexbox-like container).',
    {
      nodeId: z.string().describe('Target frame node ID'),
      layoutMode: z.enum(['HORIZONTAL', 'VERTICAL', 'NONE']).describe('Layout direction'),
      itemSpacing: z.number().optional().describe('Gap between children'),
      paddingTop: z.number().optional(),
      paddingRight: z.number().optional(),
      paddingBottom: z.number().optional(),
      paddingLeft: z.number().optional(),
      primaryAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']).optional(),
      counterAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX']).optional(),
    },
    async (params) => {
      const data = await sendDesignCommand('set_auto_layout', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );
}
