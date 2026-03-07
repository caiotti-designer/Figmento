import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export const getSelectionSchema = {};
export const getNodeInfoSchema = {
  nodeId: z.string().describe('Node ID to inspect'),
};
export const getPageNodesSchema = {};
export const deleteNodeSchema = {
  nodeId: z.string().describe('Node ID to delete'),
};
export const moveNodeSchema = {
  nodeId: z.string().describe('Node ID to move'),
  x: z.number().optional().describe('New X position'),
  y: z.number().optional().describe('New Y position'),
};
export const resizeNodeSchema = {
  nodeId: z.string().describe('Node ID to resize'),
  width: z.number().optional().describe('New width'),
  height: z.number().optional().describe('New height'),
};
export const renameNodeSchema = {
  nodeId: z.string().describe('Node ID to rename'),
  name: z.string().describe('New name'),
};
export const appendChildSchema = {
  parentId: z.string().describe('Parent frame node ID'),
  childId: z.string().describe('Child node ID to move into parent'),
};
export const reorderChildSchema = {
  parentId: z.string().describe('Parent frame node ID'),
  childId: z.string().describe('Child node ID to reorder'),
  index: z.number().optional().describe('Target index (0 = bottom/back). If omitted, moves to end (top/front).'),
};
export const groupNodesSchema = {
  nodeIds: z.array(z.string()).min(2).describe('Array of node IDs to group (minimum 2)'),
  name: z.string().optional().describe('Name for the group'),
};
export const cloneNodeSchema = {
  nodeId: z.string().describe('Node ID to clone'),
  offsetX: z.number().optional().describe('X offset from original position (default: 0)'),
  offsetY: z.number().optional().describe('Y offset from original position (default: 0)'),
  newName: z.string().optional().describe('New name for the cloned node'),
  parentId: z.string().optional().describe('Parent frame to place clone into (default: same parent as original)'),
};

export function registerSceneTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'get_selection',
    'Get information about the currently selected nodes in Figma.',
    getSelectionSchema,
    async () => {
      const data = await sendDesignCommand('get_selection', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK + zod
  server.tool(
    'get_node_info',
    'Get detailed information about a specific node (properties, fills, children, etc.).',
    getNodeInfoSchema,
    async (params) => {
      const data = await sendDesignCommand('get_node_info', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'get_page_nodes',
    'List all top-level nodes on the current Figma page.',
    getPageNodesSchema,
    async () => {
      const data = await sendDesignCommand('get_page_nodes', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'delete_node',
    'Delete a node from the canvas.',
    deleteNodeSchema,
    async (params) => {
      const data = await sendDesignCommand('delete_node', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'move_node',
    'Move a node to a new position.',
    moveNodeSchema,
    async (params) => {
      const data = await sendDesignCommand('move_node', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'resize_node',
    'Resize a node.',
    resizeNodeSchema,
    async (params) => {
      const data = await sendDesignCommand('resize_node', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'rename_node',
    'Rename a node.',
    renameNodeSchema,
    async (params) => {
      const data = await sendDesignCommand('rename_node', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'append_child',
    'Move a node inside a parent frame.',
    appendChildSchema,
    async (params) => {
      const data = await sendDesignCommand('append_child', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'reorder_child',
    'Move a child node to a specific index within its parent frame. Use this to fix z-order after clone_node or to reorder layers. If index is omitted, moves child to the end (top of layer stack).',
    reorderChildSchema,
    async (params) => {
      const data = await sendDesignCommand('reorder_child', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK + zod
  server.tool(
    'group_nodes',
    'Group multiple nodes into a single group. All nodes must share the same parent. Useful for bundling related elements (e.g. a button bg + label, a speaker card) so they can be moved/cloned as a unit.',
    groupNodesSchema,
    async (params) => {
      const data = await sendDesignCommand('group_nodes', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'clone_node',
    'Clone (duplicate) an existing node. Returns the new node\'s ID. Great for repeating patterns like menu items, speaker cards, tags, etc.',
    cloneNodeSchema,
    async (params) => {
      const data = await sendDesignCommand('clone_node', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );
}
