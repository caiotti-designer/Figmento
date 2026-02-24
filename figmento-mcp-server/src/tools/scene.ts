// @ts-nocheck — MCP SDK server.tool() generics cause TS2589 at project scale
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function registerSceneTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'get_selection',
    'Get information about the currently selected nodes in Figma.',
    {},
    async () => {
      const data = await sendDesignCommand('get_selection', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'get_page_nodes',
    'List all top-level nodes on the current Figma page.',
    {},
    async () => {
      const data = await sendDesignCommand('get_page_nodes', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );
}
