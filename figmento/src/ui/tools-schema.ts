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

// ═══════════════════════════════════════════════════════════════
// PHASE-BASED TOOL FILTERING (Chat mode)
// ═══════════════════════════════════════════════════════════════

/** Tools never sent in chat mode — MCP-only or irrelevant for iterative chat. */
const CHAT_EXCLUDED = new Set([
  'export_node',
  'get_screenshot',
  'run_refinement_check',
  'create_design',
  'read_figma_context',
  'bind_variable',
  'apply_paint_style',
  'apply_text_style',
  'apply_effect_style',
  'create_figma_variables',
]);

/** Lookup tools — needed in plan phase, removed once design starts. */
const LOOKUP_TOOLS = new Set([
  'lookup_blueprint',
  'lookup_palette',
  'lookup_fonts',
  'lookup_size',
]);

/** Tools that signal we've entered the build phase. */
const BUILD_PHASE_TRIGGERS = new Set([
  'create_frame',
  'create_text',
  'create_rectangle',
  'create_ellipse',
  'create_image',
  'set_fill',
  'set_auto_layout',
]);

/** Plan phase: lookups + basic creation + scene queries (~14 tools). */
const PLAN_PHASE_TOOLS = new Set([
  // Lookups
  'lookup_blueprint', 'lookup_palette', 'lookup_fonts', 'lookup_size',
  // Scene queries
  'get_selection', 'get_page_nodes',
  // Basic creation
  'create_frame', 'create_text', 'create_rectangle', 'create_ellipse',
  // Essential styling
  'set_fill',
  // Image + utility
  'create_image', 'generate_image', 'update_memory',
]);

/** Build phase: creation + styling + scene management (~17 tools). */
const BUILD_PHASE_TOOLS = new Set([
  // Creation
  'create_frame', 'create_text', 'create_rectangle', 'create_ellipse', 'create_image',
  // Styling
  'set_fill', 'set_stroke', 'set_effects', 'set_corner_radius', 'set_opacity', 'set_auto_layout',
  // Scene management
  'move_node', 'resize_node', 'append_child', 'clone_node', 'delete_node',
  // Inspection
  'get_node_info',
  // Image + utility
  'generate_image', 'update_memory',
]);

export interface ToolResolverContext {
  toolsUsed: Set<string>;
  iteration: number;
}

export type ToolResolver = (ctx: ToolResolverContext) => ToolDefinition[];

/**
 * Returns a phase-aware tool resolver for chat mode.
 * - Plan phase (~14 tools): lookups + basic creation + scene queries
 * - Build phase (~17 tools): full creation + styling + scene management, no lookups
 * - Always excludes MCP-only tools (export, screenshot, refinement, variables, styles)
 */
export function chatToolResolver(): ToolResolver {
  // Pre-filter: remove chat-excluded tools once
  const chatTools = FIGMENTO_TOOLS.filter(t => !CHAT_EXCLUDED.has(t.name));
  const planTools = chatTools.filter(t => PLAN_PHASE_TOOLS.has(t.name));
  const buildTools = chatTools.filter(t => BUILD_PHASE_TOOLS.has(t.name));

  return (ctx: ToolResolverContext): ToolDefinition[] => {
    const inBuildPhase = [...ctx.toolsUsed].some(t => BUILD_PHASE_TRIGGERS.has(t));
    return inBuildPhase ? buildTools : planTools;
  };
}

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

  // ── Figma Native (Variables, Styles) ──
  {
    name: 'read_figma_context',
    description: 'Read the current Figma file\'s design context: all local Variables (with collections and modes), Paint Styles, Text Styles, Effect Styles, and available fonts. Call this FIRST when working with a file that has an existing design system — use the returned variable IDs and style IDs with bind_variable and apply_*_style tools instead of hardcoding values.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'bind_variable',
    description: 'Bind a Figma Variable to a property on a node. Creates a LIVE binding — changing the variable value in Figma updates the node automatically. Use read_figma_context first to discover variable IDs. For fill/stroke binding, ensures a placeholder paint exists before binding.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        variableId: { type: 'string', description: 'Variable ID from read_figma_context response' },
        field: { type: 'string', description: 'Node property to bind. Allowed: fills, strokes, opacity, width, height, paddingTop, paddingRight, paddingBottom, paddingLeft, itemSpacing, cornerRadius, fontSize, fontFamily, fontWeight' },
      },
      required: ['nodeId', 'variableId', 'field'],
    },
  },
  {
    name: 'apply_paint_style',
    description: 'Apply a Figma Paint Style to a node\'s fills. The node will reference the style — updating the style updates all nodes using it. Use read_figma_context to discover available style IDs.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        styleId: { type: 'string', description: 'Paint Style ID from read_figma_context response' },
      },
      required: ['nodeId', 'styleId'],
    },
  },
  {
    name: 'apply_text_style',
    description: 'Apply a Figma Text Style to a text node. Sets font family, size, weight, spacing, and line height from the style. Only works on TEXT nodes.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target TEXT node ID' },
        styleId: { type: 'string', description: 'Text Style ID from read_figma_context response' },
      },
      required: ['nodeId', 'styleId'],
    },
  },
  {
    name: 'apply_effect_style',
    description: 'Apply a Figma Effect Style to a node. Sets shadows and blurs from the style definition.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        styleId: { type: 'string', description: 'Effect Style ID from read_figma_context response' },
      },
      required: ['nodeId', 'styleId'],
    },
  },
  // ── Design Quality ──
  {
    name: 'run_refinement_check',
    description: 'Run a structural quality check on a design node. Checks: gradient direction (solid end must face text), auto-layout coverage (frames with 2+ children should have layoutMode), spacing scale (itemSpacing must be on the 8px grid), typography hierarchy (largest font must be ≥2× smallest), and empty placeholders (default-named or gray-filled nodes). Returns a report with nodeId, totalChecked, issues array, and passed boolean.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'The Figma node ID to check (root of the design)' },
      },
      required: ['nodeId'],
    },
  },

  {
    name: 'create_figma_variables',
    description: 'Create a Figma Variable Collection with variables. Converts hex colors to native COLOR variables, numbers to FLOAT variables. Use "/" in names for folder grouping (e.g., "color/primary"). If a collection with the same name exists, returns its info instead of duplicating.',
    input_schema: {
      type: 'object',
      properties: {
        collectionName: { type: 'string', description: 'Name for the variable collection (e.g., "Brand Colors", "Spacing")' },
        variables: {
          type: 'array',
          description: 'Variables to create',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Variable name (e.g., "primary", "md")' },
              type: { type: 'string', description: 'Variable type: COLOR, FLOAT, STRING, or BOOLEAN' },
              value: { description: 'Value: hex string for COLOR, number for FLOAT, string for STRING, boolean for BOOLEAN' },
              group: { type: 'string', description: 'Folder group prefix (e.g., "color" → creates "color/primary")' },
            },
            required: ['name', 'type', 'value'],
          },
        },
      },
      required: ['collectionName', 'variables'],
    },
  },

  // ── Local Intelligence (resolved from bundled knowledge, no network) ──

  {
    name: 'lookup_blueprint',
    description:
      'Look up a layout blueprint from the bundled knowledge base. Returns zone breakdown, anti-generic rules, and memorable element hint. Categories: ads, social, web, presentation, print. Optional mood filter (e.g. "luxury", "minimal", "bold"). Optional subcategory (e.g. "product", "hero", "instagram_post").',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Blueprint category: ads, social, web, presentation, print',
        },
        mood: {
          type: 'string',
          description: 'Optional mood to filter/rank blueprints (e.g. "luxury", "cinematic", "bold", "minimal")',
        },
        subcategory: {
          type: 'string',
          description: 'Optional subcategory (e.g. "product", "hero", "instagram_post", "pricing", "features")',
        },
      },
      required: ['category'],
    },
  },

  {
    name: 'lookup_palette',
    description:
      'Look up a color palette by mood. Returns 6 colors: primary, secondary, accent, background, text, muted. Available moods: moody-dark, fresh-light, corporate-professional, luxury-premium, playful-fun, nature-organic, tech-modern, warm-cozy, minimal-clean, retro-vintage, ocean-calm, sunset-energy. Also matches by mood tag (e.g. "luxury", "corporate", "playful").',
    input_schema: {
      type: 'object',
      properties: {
        mood: {
          type: 'string',
          description: 'Mood key or tag (e.g. "luxury-premium", "luxury", "corporate", "moody")',
        },
      },
      required: ['mood'],
    },
  },

  {
    name: 'lookup_fonts',
    description:
      'Look up a font pairing by mood. Returns heading font, body font, and recommended weights. Available pairings: modern, classic, bold, luxury, playful, corporate, editorial, minimalist, creative, elegant. Also matches by mood tag (e.g. "tech", "fashion", "friendly").',
    input_schema: {
      type: 'object',
      properties: {
        mood: {
          type: 'string',
          description: 'Mood key or tag (e.g. "luxury", "modern", "editorial", "creative")',
        },
      },
      required: ['mood'],
    },
  },

  {
    name: 'lookup_size',
    description:
      'Look up a size preset by format name. Returns width, height, aspect ratio, and notes. Supports social (ig-post, ig-story, ig-reel, ig-carousel, fb-post, fb-story, fb-cover, x-post, li-post, tiktok-video, yt-thumbnail, yt-banner, pin-standard), print (print-a4, print-a3, print-letter, print-business-card, print-flyer, print-poster-*), presentation (pres-16-9, pres-4-3), web (web-hero-16-9, web-banner, web-landing, mobile-hero, tablet-*).',
    input_schema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: 'Format ID or partial name (e.g. "ig-post", "print-a4", "pres-16-9", "web-landing")',
        },
      },
      required: ['format'],
    },
  },
];
