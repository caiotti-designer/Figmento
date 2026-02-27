/**
 * Figmento Tool Definitions for Anthropic API tool_use format.
 * These mirror the MCP server tools but formatted as JSON Schema for the Messages API.
 * Excludes connect_to_figma and disconnect_from_figma (not needed inside the plugin).
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const fillSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['SOLID', 'GRADIENT_LINEAR'] },
    color: { type: 'string', description: 'Hex color (e.g. "#FF5733")' },
    opacity: { type: 'number' },
    gradientStops: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          position: { type: 'number' },
          color: { type: 'string' },
          opacity: { type: 'number' },
        },
        required: ['position', 'color'],
      },
    },
    gradientDirection: {
      type: 'string',
      enum: ['left-right', 'right-left', 'top-bottom', 'bottom-top'],
      description: 'Gradient direction (default: top-bottom)',
    },
  },
  required: ['type'],
};

const cornerRadiusSchema = {
  oneOf: [
    { type: 'number' },
    { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
  ],
};

export const FIGMENTO_TOOLS: ToolDefinition[] = [
  // ── Canvas Creation ──
  {
    name: 'create_frame',
    description: 'Create a frame (container) on the Figma canvas. Frames can have auto-layout, fills, padding, and contain children. Returns the nodeId.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Frame name' },
        width: { type: 'number', description: 'Width in pixels' },
        height: { type: 'number', description: 'Height in pixels' },
        x: { type: 'number', description: 'X position' },
        y: { type: 'number', description: 'Y position' },
        parentId: { type: 'string', description: 'Parent frame nodeId to append to' },
        fills: { type: 'array', items: fillSchema, description: 'Fill paints array' },
        cornerRadius: cornerRadiusSchema,
        layoutMode: { type: 'string', enum: ['HORIZONTAL', 'VERTICAL', 'NONE'], description: 'Auto-layout direction' },
        itemSpacing: { type: 'number', description: 'Gap between auto-layout children' },
        paddingTop: { type: 'number' },
        paddingRight: { type: 'number' },
        paddingBottom: { type: 'number' },
        paddingLeft: { type: 'number' },
        primaryAxisAlignItems: { type: 'string', enum: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'] },
        counterAxisAlignItems: { type: 'string', enum: ['MIN', 'CENTER', 'MAX'] },
        primaryAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO'], description: 'FIXED = fixed size; AUTO = hug contents (default)' },
        counterAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO'], description: 'FIXED = fixed size; AUTO = hug contents (default)' },
        clipsContent: { type: 'boolean' },
      },
      required: ['width', 'height'],
    },
  },
  {
    name: 'create_text',
    description: 'Create a text element on the Figma canvas. Supports Google Fonts, mixed-weight segments, and auto-layout sizing. Returns the nodeId.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text content (use \\n for line breaks)' },
        fontSize: { type: 'number', description: 'Font size in pixels (default: 16)' },
        fontFamily: { type: 'string', description: 'Google Font name (default: "Inter")' },
        fontWeight: { type: 'number', description: 'Font weight: 100-900 (default: 400)' },
        color: { type: 'string', description: 'Hex text color (default: "#000000"). Also accepted as fillColor.' },
        fillColor: { type: 'string', description: 'Alias for color — hex text color.' },
        textAlignHorizontal: { type: 'string', enum: ['LEFT', 'CENTER', 'RIGHT'], description: 'Alias for textAlign.' },
        name: { type: 'string', description: 'Layer name' },
        width: { type: 'number', description: 'Text box width (default: 200)' },
        height: { type: 'number', description: 'Text box height (default: 40)' },
        x: { type: 'number' },
        y: { type: 'number' },
        parentId: { type: 'string', description: 'Parent frame nodeId' },
        textAlign: { type: 'string', enum: ['LEFT', 'CENTER', 'RIGHT'] },
        lineHeight: { type: 'number', description: 'Line height: values > 3 = pixels, values ≤ 3 = multiplier (e.g. 1.5 = 1.5× fontSize).' },
        letterSpacing: { type: 'number' },
        italic: { type: 'boolean', description: 'Italic style for entire text' },
        underline: { type: 'boolean', description: 'Underline decoration for entire text' },
        strikethrough: { type: 'boolean', description: 'Strikethrough decoration for entire text' },
        layoutSizingHorizontal: { type: 'string', enum: ['FIXED', 'FILL', 'HUG'] },
        layoutSizingVertical: { type: 'string', enum: ['FIXED', 'FILL', 'HUG'] },
        segments: {
          type: 'array',
          description: 'Mixed-style text segments (weight, size, color, italic, underline, strikethrough)',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              fontWeight: { type: 'number' },
              fontSize: { type: 'number' },
              color: { type: 'string' },
              italic: { type: 'boolean', description: 'Italic style for this segment' },
              underline: { type: 'boolean', description: 'Underline decoration for this segment' },
              strikethrough: { type: 'boolean', description: 'Strikethrough decoration for this segment' },
            },
            required: ['text'],
          },
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'create_rectangle',
    description: 'Create a rectangle shape on the Figma canvas.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        width: { type: 'number', description: 'Width in pixels' },
        height: { type: 'number', description: 'Height in pixels' },
        x: { type: 'number' },
        y: { type: 'number' },
        parentId: { type: 'string' },
        fills: { type: 'array', items: fillSchema },
        stroke: {
          type: 'object',
          properties: { color: { type: 'string' }, width: { type: 'number' } },
          required: ['color', 'width'],
        },
        cornerRadius: cornerRadiusSchema,
      },
      required: ['width', 'height'],
    },
  },
  {
    name: 'create_ellipse',
    description: 'Create an ellipse/circle on the Figma canvas.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        width: { type: 'number', description: 'Width (same as height for circle)' },
        height: { type: 'number' },
        x: { type: 'number' },
        y: { type: 'number' },
        parentId: { type: 'string' },
        fills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['SOLID'] },
              color: { type: 'string' },
              opacity: { type: 'number' },
            },
            required: ['type'],
          },
        },
      },
      required: ['width', 'height'],
    },
  },
  {
    name: 'create_image',
    description: 'Place an image on the Figma canvas from base64 data.',
    input_schema: {
      type: 'object',
      properties: {
        imageData: { type: 'string', description: 'Base64 image data (with or without data: prefix)' },
        name: { type: 'string' },
        width: { type: 'number', description: 'Width (default: 400)' },
        height: { type: 'number', description: 'Height (default: 300)' },
        x: { type: 'number' },
        y: { type: 'number' },
        parentId: { type: 'string' },
        cornerRadius: cornerRadiusSchema,
      },
      required: ['imageData'],
    },
  },

  // ── Style Tools ──
  {
    name: 'set_fill',
    description: 'Set the fill color of an existing node. Supports solid colors and gradients.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        color: { type: 'string', description: 'Simple hex color' },
        opacity: { type: 'number', description: 'Fill opacity 0-1' },
        fills: { type: 'array', items: fillSchema, description: 'Full fills array (overrides color)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'set_stroke',
    description: 'Set or remove the stroke (border) on a node.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        color: { type: 'string', description: 'Hex color (omit to remove stroke)' },
        width: { type: 'number', description: 'Stroke width (default: 1)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'set_effects',
    description: 'Add drop shadow or inner shadow effects to a node.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        effects: {
          type: 'array',
          description: 'Effects array (empty to clear)',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['DROP_SHADOW', 'INNER_SHADOW'] },
              color: { type: 'string' },
              opacity: { type: 'number' },
              offset: {
                type: 'object',
                properties: { x: { type: 'number' }, y: { type: 'number' } },
                required: ['x', 'y'],
              },
              blur: { type: 'number' },
              spread: { type: 'number' },
            },
            required: ['type', 'color', 'offset', 'blur'],
          },
        },
      },
      required: ['nodeId', 'effects'],
    },
  },
  {
    name: 'set_corner_radius',
    description: 'Set corner radius on a frame or rectangle.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        radius: cornerRadiusSchema,
      },
      required: ['nodeId', 'radius'],
    },
  },
  {
    name: 'set_opacity',
    description: 'Set the opacity of a node.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        opacity: { type: 'number', description: 'Opacity value 0-1', minimum: 0, maximum: 1 },
      },
      required: ['nodeId', 'opacity'],
    },
  },
  {
    name: 'set_auto_layout',
    description: 'Configure auto-layout on a frame (flexbox-like container).',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target frame node ID' },
        layoutMode: { type: 'string', enum: ['HORIZONTAL', 'VERTICAL', 'NONE'] },
        itemSpacing: { type: 'number', description: 'Gap between children' },
        paddingTop: { type: 'number' },
        paddingRight: { type: 'number' },
        paddingBottom: { type: 'number' },
        paddingLeft: { type: 'number' },
        primaryAxisAlignItems: { type: 'string', enum: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'] },
        counterAxisAlignItems: { type: 'string', enum: ['MIN', 'CENTER', 'MAX'] },
        primaryAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO', 'HUG'], description: 'HUG or AUTO = hug contents; FIXED = fixed size' },
        counterAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO', 'HUG'], description: 'HUG or AUTO = hug contents; FIXED = fixed size' },
      },
      required: ['nodeId', 'layoutMode'],
    },
  },

  // ── Scene Management ──
  {
    name: 'get_selection',
    description: 'Get information about the currently selected nodes in Figma.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_screenshot',
    description: 'Capture a PNG screenshot of a node and return it as a base64 image for inline rendering. Use this to visually verify designs.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to screenshot' },
        scale: { type: 'number', description: 'Export scale 0.1–3 (default: 1)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'export_node',
    description: 'Export a node as a PNG/SVG/JPG image (base64). Use for screenshots/self-evaluation.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to export' },
        format: { type: 'string', enum: ['PNG', 'SVG', 'JPG'], description: 'Export format (default: PNG)' },
        scale: { type: 'number', description: 'Export scale (default: 1)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_node_info',
    description: 'Get detailed information about a specific node (properties, fills, children).',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to inspect' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_page_nodes',
    description: 'List all top-level nodes on the current Figma page.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_node',
    description: 'Delete a node from the canvas.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to delete' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'move_node',
    description: 'Move a node to a new position.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to move' },
        x: { type: 'number', description: 'New X position' },
        y: { type: 'number', description: 'New Y position' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'resize_node',
    description: 'Resize a node.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to resize' },
        width: { type: 'number', description: 'New width' },
        height: { type: 'number', description: 'New height' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'rename_node',
    description: 'Rename a node.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to rename' },
        name: { type: 'string', description: 'New name' },
      },
      required: ['nodeId', 'name'],
    },
  },
  {
    name: 'append_child',
    description: 'Move a node inside a parent frame.',
    input_schema: {
      type: 'object',
      properties: {
        parentId: { type: 'string', description: 'Parent frame node ID' },
        childId: { type: 'string', description: 'Child node ID' },
      },
      required: ['parentId', 'childId'],
    },
  },
  {
    name: 'group_nodes',
    description: 'Group multiple nodes into a single group. All nodes must share the same parent.',
    input_schema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, minItems: 2, description: 'Array of node IDs to group (minimum 2)' },
        name: { type: 'string', description: 'Name for the group' },
      },
      required: ['nodeIds'],
    },
  },
  {
    name: 'clone_node',
    description: 'Clone (duplicate) an existing node. Returns the new node\'s ID. Great for repeating patterns like menu items, speaker cards, tags.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to clone' },
        offsetX: { type: 'number', description: 'X offset from original position (default: 0)' },
        offsetY: { type: 'number', description: 'Y offset from original position (default: 0)' },
        newName: { type: 'string', description: 'New name for the cloned node' },
        parentId: { type: 'string', description: 'Parent frame to place clone into (default: same parent)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'create_design',
    description: 'Create a complete design from a UIAnalysis JSON structure. Batch tool — creates a main frame with all child elements in one operation.',
    input_schema: {
      type: 'object',
      properties: {
        design: {
          type: 'object',
          description: 'Complete UIAnalysis design structure',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' },
            backgroundColor: { type: 'string' },
            elements: { type: 'array' },
          },
          required: ['width', 'height', 'backgroundColor', 'elements'],
        },
        name: { type: 'string', description: 'Name for the main frame' },
      },
      required: ['design'],
    },
  },

  // ── Memory ──
  {
    name: 'update_memory',
    description: 'Save a design lesson, user preference, or rule to persistent memory. Use this when the user reports an issue, says "remember this", "always do X", "never do Y", or teaches you something about their preferences. Keep entries concise (one sentence).',
    input_schema: {
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Concise rule or lesson to remember (e.g., "Always use Outfit font for this brand", "User prefers dark themes")' },
      },
      required: ['entry'],
    },
  },

  // ── Image Generation (Gemini) ──
  {
    name: 'generate_image',
    description: 'Generate an image using AI (Gemini Imagen) and place it on the canvas. Provide a descriptive prompt for the image you want.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to generate' },
        name: { type: 'string', description: 'Layer name for the image' },
        width: { type: 'number', description: 'Width to place the image (default: 400)' },
        height: { type: 'number', description: 'Height to place the image (default: 400)' },
        x: { type: 'number' },
        y: { type: 'number' },
        parentId: { type: 'string', description: 'Parent frame nodeId' },
      },
      required: ['prompt'],
    },
  },
];
