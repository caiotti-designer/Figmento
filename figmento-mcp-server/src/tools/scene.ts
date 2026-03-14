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

// ═══════════════════════════════════════════════════════════
// Consolidated transform_node schema
// ═══════════════════════════════════════════════════════════

export const transformNodeSchema = {
  nodeId: z.string().describe('Node ID to transform'),
  x: z.number().optional().describe('New X position'),
  y: z.number().optional().describe('New Y position'),
  width: z.number().optional().describe('New width'),
  height: z.number().optional().describe('New height'),
};

function wrap(data: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function wrapPretty(data: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

async function handleTransformNode(params: { nodeId: string; x?: number; y?: number; width?: number; height?: number }, sendDesignCommand: SendDesignCommand) {
  const hasPosition = params.x !== undefined || params.y !== undefined;
  const hasSize = params.width !== undefined || params.height !== undefined;

  let moveResult: Record<string, unknown> | undefined;
  let resizeResult: Record<string, unknown> | undefined;

  // Move first, then resize (per spec)
  if (hasPosition) {
    moveResult = await sendDesignCommand('move_node', { nodeId: params.nodeId, x: params.x, y: params.y });
  }
  if (hasSize) {
    resizeResult = await sendDesignCommand('resize_node', { nodeId: params.nodeId, width: params.width, height: params.height });
  }

  if (moveResult && resizeResult) {
    return wrap({ move: moveResult, resize: resizeResult });
  }
  return wrap(moveResult || resizeResult || { nodeId: params.nodeId, status: 'no changes' });
}

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

  // ═══════════════════════════════════════════════════════════
  // Consolidated tool: transform_node
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'transform_node',
    'Move and/or resize a node in a single call. Provide x/y for position, width/height for size, or all four. When both are provided, move executes first, then resize.',
    transformNodeSchema,
    async (params) => handleTransformNode(params, sendDesignCommand)
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
    '[DEPRECATED — use clone_with_overrides(copies=[{...}]) instead] Clone (duplicate) an existing node. Returns the new node\'s ID. Great for repeating patterns like menu items, speaker cards, tags, etc.',
    cloneNodeSchema,
    async (params) => {
      const data = await sendDesignCommand('clone_node', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );
}
