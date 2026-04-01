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
export const findNodesSchema = {
  name: z.string().optional().describe('Substring to match against node names (case-insensitive)'),
  type: z.string().optional().describe('Figma node type filter: FRAME, TEXT, RECTANGLE, ELLIPSE, GROUP, COMPONENT, INSTANCE, VECTOR, LINE, etc.'),
  text_content: z.string().optional().describe('Substring to match against text node content (case-insensitive). Only matches TEXT nodes.'),
  parentId: z.string().optional().describe('Limit search to the subtree of this node. Defaults to entire current page.'),
  max_results: z.number().optional().describe('Maximum results to return (default: 50)'),
};

export const booleanOperationSchema = {
  operation: z.string().describe('Boolean operation: UNION, SUBTRACT, INTERSECT, or EXCLUDE. For SUBTRACT, the first nodeId is the base shape.'),
  nodeIds: z.array(z.string()).min(2).describe('Array of node IDs to combine (minimum 2, order matters for SUBTRACT)'),
  name: z.string().optional().describe('Name for the resulting node'),
};

export const flattenNodesSchema = {
  nodeIds: z.array(z.string()).min(1).describe('Array of node IDs to flatten into a single editable vector'),
  name: z.string().optional().describe('Name for the resulting vector'),
};

export const importComponentByKeySchema = {
  key: z.string().describe('Component key (40-char hex from Figma URL or list_components output)'),
  parentId: z.string().optional().describe('Parent frame to place the instance into'),
  x: z.number().optional().describe('X position'),
  y: z.number().optional().describe('Y position'),
  name: z.string().optional().describe('Override instance name'),
  variantName: z.string().optional().describe('For component sets: variant name to select (exact or partial match)'),
};

export const exportAsSvgSchema = {
  nodeId: z.string().describe('Node ID to export as SVG'),
  include_children: z.boolean().optional().describe('If true, export each direct child as a separate SVG (default: false)'),
};

export const setConstraintsSchema = {
  nodeId: z.string().describe('Target node ID'),
  horizontal: z.string().describe('Horizontal constraint: MIN (left), CENTER, MAX (right), STRETCH, or SCALE'),
  vertical: z.string().describe('Vertical constraint: MIN (top), CENTER, MAX (bottom), STRETCH, or SCALE'),
};

export const importStyleByKeySchema = {
  key: z.string().describe('Style key from Figma URL or get_local_styles output'),
};

export const listAvailableFontsSchema = {
  query: z.string().optional().describe('Filter fonts by family name (case-insensitive substring match)'),
  limit: z.number().optional().describe('Maximum font families to return (default: 50)'),
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
    'Reorder a child node to a specific z-index within its parent. Omit index to move to top.',
    reorderChildSchema,
    async (params) => {
      const data = await sendDesignCommand('reorder_child', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK + zod
  server.tool(
    'group_nodes',
    'Group multiple nodes into a single group. All nodes must share the same parent.',
    groupNodesSchema,
    async (params) => {
      const data = await sendDesignCommand('group_nodes', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'clone_node',
    '[DEPRECATED — use clone_with_overrides] Clone an existing node. Returns the new node ID.',
    cloneNodeSchema,
    async (params) => {
      const data = await sendDesignCommand('clone_node', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'find_nodes',
    'Search the canvas for nodes by name, type, or text content. Use parentId to limit scope. Returns up to max_results matches.',
    findNodesSchema,
    async (params) => {
      const data = await sendDesignCommand('find_nodes', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'list_available_fonts',
    'List fonts available in the Figma environment, grouped by family. Use query to filter.',
    listAvailableFontsSchema,
    async (params) => {
      const data = await sendDesignCommand('list_available_fonts', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK + zod
  server.tool(
    'boolean_operation',
    'Perform a boolean operation (UNION, SUBTRACT, INTERSECT, EXCLUDE) on 2+ shapes.',
    booleanOperationSchema,
    async (params) => {
      const data = await sendDesignCommand('boolean_operation', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK + zod
  server.tool(
    'flatten_nodes',
    'Flatten one or more nodes into a single editable vector with merged paths.',
    flattenNodesSchema,
    async (params) => {
      const data = await sendDesignCommand('flatten_nodes', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'import_component_by_key',
    'Import a component from a team library by key and create an instance. Supports variant selection. Requires Figma Pro.',
    importComponentByKeySchema,
    async (params) => {
      const data = await sendDesignCommand('import_component_by_key', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'import_style_by_key',
    'Import a style from a team library by key. Available locally for apply_style. Requires Figma Pro.',
    importStyleByKeySchema,
    async (params) => {
      const data = await sendDesignCommand('import_style_by_key', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    'export_as_svg',
    'Export a node as raw SVG markup. Use include_children=true to export each child separately.',
    exportAsSvgSchema,
    async (params) => {
      const data = await sendDesignCommand('export_as_svg', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'set_constraints',
    'Set responsive constraints on a node. Only works in non-auto-layout frames.',
    setConstraintsSchema,
    async (params) => {
      const data = await sendDesignCommand('set_constraints', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );
}
