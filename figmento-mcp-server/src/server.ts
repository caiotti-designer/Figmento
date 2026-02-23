import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FigmentoWSClient } from './ws-client';

/**
 * Creates and configures the Figmento MCP server with all design tools.
 */
export function createFigmentoServer(): McpServer {
  const server = new McpServer({
    name: 'figmento',
    version: '1.0.0',
  });

  const wsClient = new FigmentoWSClient();

  // Helper: ensure connected before executing a tool
  async function requireConnection() {
    if (!wsClient.isConnected) {
      throw new Error(
        'Not connected to Figma. Use the connect_to_figma tool first with the channel ID shown in the Figma plugin.'
      );
    }
  }

  // Helper: send command and return formatted result
  async function sendDesignCommand(action: string, params: Record<string, unknown>) {
    await requireConnection();
    const response = await wsClient.sendCommand(action, params);
    if (!response.success) {
      throw new Error(`Figma error: ${response.error || 'Unknown error'}`);
    }
    return response.data || {};
  }

  // ═══════════════════════════════════════════════════════════
  // CONNECTION TOOL
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'connect_to_figma',
    'Connect to a Figma file via the Figmento plugin. Open the Figmento MCP plugin in Figma, copy the channel ID, and pass it here. The relay server must be running on the specified URL.',
    {
      channel: z.string().describe('Channel ID shown in the Figma plugin (e.g. "figmento-abc123")'),
      url: z.string().optional().describe('WebSocket relay URL (default: ws://localhost:3055)'),
    },
    async ({ channel, url }) => {
      const wsUrl = url || 'ws://localhost:3055';

      // Disconnect if already connected
      if (wsClient.isConnected) {
        wsClient.disconnect();
      }

      try {
        await wsClient.connect(wsUrl, channel);
        return {
          content: [{
            type: 'text' as const,
            text: `Connected to Figma via channel "${channel}". You can now use design tools.`,
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Failed to connect: ${(err as Error).message}\n\nMake sure:\n1. The WebSocket relay server is running (cd figmento-ws-relay && npm start)\n2. The Figmento plugin is open in Figma and connected to the same relay\n3. The channel ID matches what's shown in the plugin`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'disconnect_from_figma',
    'Disconnect from the current Figma session.',
    {},
    async () => {
      wsClient.disconnect();
      return {
        content: [{ type: 'text' as const, text: 'Disconnected from Figma.' }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // CANVAS CREATION TOOLS
  // ═══════════════════════════════════════════════════════════

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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // STYLE TOOLS
  // ═══════════════════════════════════════════════════════════

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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // SCENE MANAGEMENT TOOLS
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'get_selection',
    'Get information about the currently selected nodes in Figma.',
    {},
    async () => {
      const data = await sendDesignCommand('get_selection', {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'export_node',
    'Export a node as a PNG/SVG/JPG image (base64). Use this to screenshot your work for self-evaluation.',
    {
      nodeId: z.string().describe('Node ID to export'),
      format: z.enum(['PNG', 'SVG', 'JPG']).optional().describe('Export format (default: PNG)'),
      scale: z.number().optional().describe('Export scale (default: 1)'),
    },
    async (params) => {
      const data = await sendDesignCommand('export_node', params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
    }
  );

  server.tool(
    'get_node_info',
    'Get detailed information about a specific node (properties, fills, children, etc.).',
    {
      nodeId: z.string().describe('Node ID to inspect'),
    },
    async (params) => {
      const data = await sendDesignCommand('get_node_info', params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'get_page_nodes',
    'List all top-level nodes on the current Figma page.',
    {},
    async () => {
      const data = await sendDesignCommand('get_page_nodes', {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'delete_node',
    'Delete a node from the canvas.',
    {
      nodeId: z.string().describe('Node ID to delete'),
    },
    async (params) => {
      const data = await sendDesignCommand('delete_node', params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
    }
  );

  server.tool(
    'move_node',
    'Move a node to a new position.',
    {
      nodeId: z.string().describe('Node ID to move'),
      x: z.number().optional().describe('New X position'),
      y: z.number().optional().describe('New Y position'),
    },
    async (params) => {
      const data = await sendDesignCommand('move_node', params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
    }
  );

  server.tool(
    'resize_node',
    'Resize a node.',
    {
      nodeId: z.string().describe('Node ID to resize'),
      width: z.number().optional().describe('New width'),
      height: z.number().optional().describe('New height'),
    },
    async (params) => {
      const data = await sendDesignCommand('resize_node', params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
    }
  );

  server.tool(
    'rename_node',
    'Rename a node.',
    {
      nodeId: z.string().describe('Node ID to rename'),
      name: z.string().describe('New name'),
    },
    async (params) => {
      const data = await sendDesignCommand('rename_node', params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
    }
  );

  server.tool(
    'append_child',
    'Move a node inside a parent frame.',
    {
      parentId: z.string().describe('Parent frame node ID'),
      childId: z.string().describe('Child node ID to move into parent'),
    },
    async (params) => {
      const data = await sendDesignCommand('append_child', params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // BATCH / COMPOSITE TOOLS
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'create_design',
    'Create a complete design from a UIAnalysis JSON structure. This is the batch tool — it creates a main frame with all child elements (text, shapes, images, icons, auto-layout) in a single operation. Best for creating full designs at once rather than element-by-element.',
    {
      design: z.object({
        width: z.number(),
        height: z.number(),
        backgroundColor: z.string(),
        elements: z.array(z.any()),
      }).describe('Complete UIAnalysis design structure'),
      name: z.string().optional().describe('Name for the main frame'),
    },
    async (params) => {
      const data = await sendDesignCommand('create_design', params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  return server;
}
