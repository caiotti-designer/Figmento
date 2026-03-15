/**
 * Chat Tool Definitions — server-side mirror of the plugin's tools-schema.ts.
 *
 * Matches the plugin's 37 chat-mode tools formatted as Anthropic tool_use JSON Schema.
 * Phase-aware filtering: plan phase (lookups + basic creation) → build phase (full toolset).
 *
 * Ported from figmento/src/ui/tools-schema.ts (CR-1).
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolResolverContext {
  toolsUsed: Set<string>;
  iteration: number;
}

export type ToolResolver = (ctx: ToolResolverContext) => ToolDefinition[];

// ═══════════════════════════════════════════════════════════════
// SHARED SCHEMAS
// ═══════════════════════════════════════════════════════════════

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
// PHASE-BASED TOOL FILTERING
// ═══════════════════════════════════════════════════════════════

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

const BUILD_PHASE_TRIGGERS = new Set([
  'create_frame',
  'create_text',
  'create_rectangle',
  'create_ellipse',
  'create_image',
  'set_fill',
  'set_auto_layout',
]);

const PLAN_PHASE_TOOLS = new Set([
  'lookup_blueprint', 'lookup_palette', 'lookup_fonts', 'lookup_size',
  'get_selection', 'get_page_nodes', 'get_node_info', 'analyze_canvas_context',
  'create_frame', 'create_text', 'create_rectangle', 'create_ellipse',
  'set_fill',
  'create_image', 'generate_image', 'update_memory',
]);

const BUILD_PHASE_TOOLS = new Set([
  'create_frame', 'create_text', 'create_rectangle', 'create_ellipse', 'create_image',
  'set_fill', 'set_stroke', 'set_effects', 'set_corner_radius', 'set_opacity', 'set_auto_layout',
  'move_node', 'resize_node', 'append_child', 'clone_node', 'delete_node',
  'get_node_info',
  'generate_image', 'update_memory',
  'flip_gradient',
]);

/**
 * Returns a phase-aware tool resolver for the chat engine.
 * Plan phase: lookups + basic creation; Build phase: full creation + styling.
 */
export function chatToolResolver(): ToolResolver {
  const chatTools = FIGMENTO_TOOLS.filter(t => !CHAT_EXCLUDED.has(t.name));
  const planTools = chatTools.filter(t => PLAN_PHASE_TOOLS.has(t.name));
  const buildTools = chatTools.filter(t => BUILD_PHASE_TOOLS.has(t.name));

  return (ctx: ToolResolverContext): ToolDefinition[] => {
    const inBuildPhase = [...ctx.toolsUsed].some(t => BUILD_PHASE_TRIGGERS.has(t));
    return inBuildPhase ? buildTools : planTools;
  };
}

/** Tools whose results must be replaced with compact summaries. */
export const SCREENSHOT_TOOLS = new Set(['get_screenshot', 'export_node']);

/** Local intelligence tools resolved from bundled knowledge (no WS needed). */
export const LOCAL_TOOL_NAMES = new Set([
  'lookup_blueprint',
  'lookup_palette',
  'lookup_fonts',
  'lookup_size',
]);

// ═══════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════

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
        primaryAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO'] },
        counterAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO'] },
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
        text: { type: 'string', description: 'Text content' },
        fontSize: { type: 'number', description: 'Font size in pixels (default: 16)' },
        fontFamily: { type: 'string', description: 'Google Font name (default: "Inter")' },
        fontWeight: { type: 'number', description: 'Font weight: 100-900 (default: 400)' },
        color: { type: 'string', description: 'Hex text color (default: "#000000")' },
        fillColor: { type: 'string', description: 'Alias for color — hex text color.' },
        textAlignHorizontal: { type: 'string', enum: ['LEFT', 'CENTER', 'RIGHT'] },
        name: { type: 'string', description: 'Layer name' },
        width: { type: 'number', description: 'Text box width (default: 200)' },
        height: { type: 'number', description: 'Text box height (default: 40)' },
        x: { type: 'number' },
        y: { type: 'number' },
        parentId: { type: 'string', description: 'Parent frame nodeId' },
        textAlign: { type: 'string', enum: ['LEFT', 'CENTER', 'RIGHT'] },
        lineHeight: { type: 'number', description: 'Line height: values > 3 = pixels, values <= 3 = multiplier' },
        letterSpacing: { type: 'number' },
        italic: { type: 'boolean' },
        underline: { type: 'boolean' },
        strikethrough: { type: 'boolean' },
        layoutSizingHorizontal: { type: 'string', enum: ['FIXED', 'FILL', 'HUG'] },
        layoutSizingVertical: { type: 'string', enum: ['FIXED', 'FILL', 'HUG'] },
        segments: {
          type: 'array',
          description: 'Mixed-style text segments',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              fontWeight: { type: 'number' },
              fontSize: { type: 'number' },
              color: { type: 'string' },
              italic: { type: 'boolean' },
              underline: { type: 'boolean' },
              strikethrough: { type: 'boolean' },
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
        width: { type: 'number' },
        height: { type: 'number' },
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
        width: { type: 'number' },
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
        imageData: { type: 'string', description: 'Base64 image data' },
        name: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
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
        nodeId: { type: 'string' },
        color: { type: 'string' },
        opacity: { type: 'number' },
        fills: { type: 'array', items: fillSchema },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'flip_gradient',
    description: 'Reverse the direction of gradient fills on a node by inverting all stop positions. Use when the user says "flip the gradient", "reverse the gradient", or "the gradient is going the wrong way". Requires the nodeId of the gradient rectangle/frame — available from the Layer Map context.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'NodeId of the node whose gradient fills should be flipped' },
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
        nodeId: { type: 'string' },
        color: { type: 'string' },
        width: { type: 'number' },
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
        nodeId: { type: 'string' },
        effects: {
          type: 'array',
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
        nodeId: { type: 'string' },
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
        nodeId: { type: 'string' },
        opacity: { type: 'number', minimum: 0, maximum: 1 },
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
        nodeId: { type: 'string' },
        layoutMode: { type: 'string', enum: ['HORIZONTAL', 'VERTICAL', 'NONE'] },
        itemSpacing: { type: 'number' },
        paddingTop: { type: 'number' },
        paddingRight: { type: 'number' },
        paddingBottom: { type: 'number' },
        paddingLeft: { type: 'number' },
        primaryAxisAlignItems: { type: 'string', enum: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'] },
        counterAxisAlignItems: { type: 'string', enum: ['MIN', 'CENTER', 'MAX'] },
        primaryAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO', 'HUG'] },
        counterAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO', 'HUG'] },
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
    name: 'get_node_info',
    description: 'Get detailed information about a specific node (properties, fills, children).',
    input_schema: {
      type: 'object',
      properties: { nodeId: { type: 'string' } },
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
      properties: { nodeId: { type: 'string' } },
      required: ['nodeId'],
    },
  },
  {
    name: 'move_node',
    description: 'Move a node to a new position.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
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
        nodeId: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
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
        nodeId: { type: 'string' },
        name: { type: 'string' },
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
        parentId: { type: 'string' },
        childId: { type: 'string' },
      },
      required: ['parentId', 'childId'],
    },
  },
  {
    name: 'group_nodes',
    description: 'Group multiple nodes into a single group.',
    input_schema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, minItems: 2 },
        name: { type: 'string' },
      },
      required: ['nodeIds'],
    },
  },
  {
    name: 'clone_node',
    description: 'Clone (duplicate) an existing node. Returns the new node\'s ID.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        offsetX: { type: 'number' },
        offsetY: { type: 'number' },
        newName: { type: 'string' },
        parentId: { type: 'string' },
      },
      required: ['nodeId'],
    },
  },

  // ── Memory ──
  {
    name: 'update_memory',
    description: 'Save a design lesson, user preference, or rule to persistent memory.',
    input_schema: {
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Concise rule or lesson to remember' },
      },
      required: ['entry'],
    },
  },

  // ── Image Generation (Gemini) ──
  {
    name: 'generate_image',
    description: 'Generate an image using AI (Gemini Imagen) and place it on the canvas.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to generate' },
        name: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        x: { type: 'number' },
        y: { type: 'number' },
        parentId: { type: 'string' },
      },
      required: ['prompt'],
    },
  },

  // ── Canvas Context Analysis (composite server-side tool) ──
  {
    name: 'analyze_canvas_context',
    description: 'Analyze existing frames on the Figma canvas to extract design context: dominant colors, typography, mood, and visual style. Call this when the user asks to "analyze the design", "use the project context", "match the existing style", or "generate an image that fits this design". Returns colors, text content, inferred mood, and a screenshot for visual reference.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Optional nodeId to analyze. If omitted, uses the current selection or the first frame on the page.',
        },
      },
    },
  },

  // ── Local Intelligence (resolved from bundled knowledge) ──
  {
    name: 'lookup_blueprint',
    description: 'Look up a layout blueprint. Returns zone breakdown, anti-generic rules, and memorable element hint. Categories: ads, social, web, presentation, print.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Blueprint category: ads, social, web, presentation, print' },
        mood: { type: 'string', description: 'Optional mood filter' },
        subcategory: { type: 'string', description: 'Optional subcategory' },
      },
      required: ['category'],
    },
  },
  {
    name: 'lookup_palette',
    description: 'Look up a color palette by mood. Returns 6 colors: primary, secondary, accent, background, text, muted.',
    input_schema: {
      type: 'object',
      properties: {
        mood: { type: 'string', description: 'Mood key or tag' },
      },
      required: ['mood'],
    },
  },
  {
    name: 'lookup_fonts',
    description: 'Look up a font pairing by mood. Returns heading font, body font, and recommended weights.',
    input_schema: {
      type: 'object',
      properties: {
        mood: { type: 'string', description: 'Mood key or tag' },
      },
      required: ['mood'],
    },
  },
  {
    name: 'lookup_size',
    description: 'Look up a size preset by format name. Returns width, height, aspect ratio.',
    input_schema: {
      type: 'object',
      properties: {
        format: { type: 'string', description: 'Format ID or partial name' },
      },
      required: ['format'],
    },
  },
];
