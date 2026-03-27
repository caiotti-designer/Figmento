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
  'create_design',
]);

const BUILD_PHASE_TRIGGERS = new Set([
  'create_frame',
  'create_text',
  'create_rectangle',
  'create_ellipse',
  'create_image',
  'set_fill',
  'set_auto_layout',
  'create_component_node',
]);

const PLAN_PHASE_TOOLS = new Set([
  'lookup_blueprint', 'lookup_palette', 'lookup_fonts', 'lookup_size',
  'get_contrast_check', 'get_design_rules',
  'get_selection', 'get_page_nodes', 'get_node_info', 'analyze_canvas_context',
  'scan_frame_structure', 'get_screenshot', 'read_figma_context',
  'create_frame', 'create_text', 'create_rectangle', 'create_ellipse',
  'set_fill',
  'create_image', 'generate_image', 'fill_contextual_images', 'update_memory',
  'reorder_child',
  'analyze_brief', 'generate_design_system_in_figma',
  'create_component_node', 'convert_to_component', 'combine_as_variants', 'set_reactions',
]);

const BUILD_PHASE_TOOLS = new Set([
  'create_frame', 'create_text', 'create_rectangle', 'create_ellipse', 'create_image',
  'create_icon',
  'set_fill', 'set_stroke', 'set_effects', 'set_corner_radius', 'set_opacity', 'set_auto_layout',
  'move_node', 'resize_node', 'append_child', 'reorder_child', 'clone_node', 'delete_node',
  'get_node_info', 'get_screenshot', 'scan_frame_structure',
  'generate_image', 'fill_contextual_images', 'update_memory',
  'flip_gradient',
  'run_refinement_check',
  'read_figma_context', 'bind_variable', 'apply_paint_style', 'apply_text_style', 'apply_effect_style',
  'create_figma_variables',
  'analyze_brief', 'generate_design_system_in_figma',
  'create_variable_collections', 'create_text_styles', 'create_ds_components',
  // IC: Interactive Components
  'create_component_node', 'convert_to_component', 'combine_as_variants',
  'create_instance', 'detach_instance', 'set_reactions', 'get_reactions',
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
  'get_contrast_check',
  'get_design_rules',
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
    name: 'reorder_child',
    description: 'Reorder a child node within its parent frame. Use index=0 to send to back (bottom layer), or omit index to send to front (top layer).',
    input_schema: {
      type: 'object',
      properties: {
        parentId: { type: 'string', description: 'ID of the parent frame' },
        childId: { type: 'string', description: 'ID of the child node to reorder' },
        index: { type: 'number', description: 'Target index (0 = back/bottom, omit = front/top)' },
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

  // ── Contextual Image Fill (MCP-routed orchestration tool) ──
  {
    name: 'fill_contextual_images',
    description: 'Analyze the page context and fill empty image slots in a selected section with AI-generated contextual images. Call when user says "fill images", "generate images for this section", "add images to these cards", "preencha com imagens", or "gere imagens para essa seção". Analyzes page industry/brand/tone, discovers empty frames, generates contextual prompts from nearby text, and places images.',
    input_schema: {
      type: 'object',
      properties: {
        sectionId: { type: 'string', description: 'Frame ID of the section to fill. If omitted, uses current selection.' },
        targetNodeIds: { type: 'array', items: { type: 'string' }, description: 'Explicit list of node IDs to fill (overrides auto-discovery).' },
        context: { type: 'string', description: 'Extra context: "industrial cleaning company", "artisanal coffee shop", etc.' },
        style: { type: 'string', description: 'Image style: "photographic" (default), "illustration", "3d-render".' },
        maxImages: { type: 'number', description: 'Max images to generate (default 6, max 8).' },
        skipAnalysis: { type: 'boolean', description: 'Skip page analysis if context is provided manually.' },
      },
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
  {
    name: 'get_contrast_check',
    description: 'Check WCAG contrast ratio between two colors. Returns ratio and pass/fail for AA/AAA levels (normal and large text).',
    input_schema: {
      type: 'object',
      properties: {
        foreground: { type: 'string', description: 'Foreground color hex (e.g. "#FFFFFF")' },
        background: { type: 'string', description: 'Background color hex (e.g. "#000000")' },
      },
      required: ['foreground', 'background'],
    },
  },
  {
    name: 'get_design_rules',
    description: 'Retrieve design reference data by category. Categories: typography (font rules, sizes, hierarchy), layout (8px grid, spacing, margins), color (palettes, WCAG), print (page structure), evaluation (16-point checklist), refinement (7-step pass), anti-patterns (what to avoid), gradients (direction map), taste (aesthetic directions).',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category: typography | layout | color | print | evaluation | refinement | anti-patterns | gradients | taste | all' },
      },
      required: ['category'],
    },
  },
  {
    name: 'scan_frame_structure',
    description: 'Deep-scan a Figma frame and return its complete structure tree with types, positions, sizes, styles, text content, and children. Returns much more detail than get_node_info — use this to fully understand a frame layout.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Frame node ID to scan' },
        depth: { type: 'number', description: 'Max depth to scan (default 5)' },
        include_styles: { type: 'boolean', description: 'Include fill/stroke/effect styles (default true)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'create_icon',
    description: 'Place a Lucide icon on the canvas. Over 1900 icons available by name (e.g. "check", "arrow-right", "star", "heart", "zap", "shield", "map-pin", "phone", "mail", "menu", "search"). Specify size in pixels and optional color hex.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Lucide icon name (e.g. "arrow-right", "check", "star")' },
        size: { type: 'number', description: 'Icon size in pixels (default 24)' },
        color: { type: 'string', description: 'Icon color hex (default "#000000")' },
        parentId: { type: 'string', description: 'Parent frame to place icon in' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_screenshot',
    description: 'Capture a PNG screenshot of a node for visual inspection. Use this to verify how a design actually looks. Returns base64 image data.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to screenshot' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'run_refinement_check',
    description: 'Run automated quality checks on a design: gradient direction, auto-layout coverage, spacing scale (8px grid), typography hierarchy, empty placeholders. Returns issues array with fix suggestions.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Root frame node ID to check' },
      },
      required: ['nodeId'],
    },
  },
  // ── Tier 3: Figma Native (variables, styles) ──
  {
    name: 'read_figma_context',
    description: "Read the current Figma file's design context: all local Variables (with collections and modes), Paint Styles, Text Styles, Effect Styles, and available fonts. Call this FIRST when working with a file that has an existing design system.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'bind_variable',
    description: 'Bind a Figma Variable to a node property. Creates a live binding — changing the variable updates the node automatically. Use read_figma_context first to discover variable IDs.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        variableId: { type: 'string', description: 'Variable ID from read_figma_context' },
        field: { type: 'string', description: 'Property to bind: fills, strokes, opacity, width, height, paddingTop/Right/Bottom/Left, itemSpacing, cornerRadius, fontSize' },
      },
      required: ['nodeId', 'variableId', 'field'],
    },
  },
  {
    name: 'apply_paint_style',
    description: "Apply a Figma Paint Style to a node's fills. Use read_figma_context to discover style IDs.",
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        styleId: { type: 'string', description: 'Paint style ID from read_figma_context' },
      },
      required: ['nodeId', 'styleId'],
    },
  },
  {
    name: 'apply_text_style',
    description: 'Apply a Figma Text Style to a text node. Sets font, size, weight, spacing from the style.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target TEXT node ID' },
        styleId: { type: 'string', description: 'Text style ID from read_figma_context' },
      },
      required: ['nodeId', 'styleId'],
    },
  },
  {
    name: 'apply_effect_style',
    description: 'Apply a Figma Effect Style (shadows, blurs) to a node.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        styleId: { type: 'string', description: 'Effect style ID from read_figma_context' },
      },
      required: ['nodeId', 'styleId'],
    },
  },
  {
    name: 'create_figma_variables',
    description: 'Create a Figma Variable Collection with variables. Converts hex colors to native COLOR variables, numbers to FLOAT. Use "/" in names for grouping (e.g. "color/primary").',
    input_schema: {
      type: 'object',
      properties: {
        collectionName: { type: 'string', description: 'Name for the variable collection' },
        variables: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Variable name' },
              type: { type: 'string', description: 'Type: COLOR | FLOAT | STRING | BOOLEAN' },
              value: { description: 'Value (hex for COLOR, number for FLOAT, etc.)' },
              group: { type: 'string', description: 'Folder group prefix' },
            },
            required: ['name', 'type'],
          },
        },
      },
      required: ['collectionName', 'variables'],
    },
  },

  // ── ODS Pipeline Tools (One-Click Design System) ──

  {
    name: 'analyze_brief',
    description: 'Analyze a PDF brief and/or logo to extract brand identity. Returns structured BrandAnalysis JSON (colors, typography, spacing, radius) ready for generate_design_system_in_figma. Call when user uploads a PDF brief, provides a brand description, or says "generate a design system", "create a DS", "analyze this brief". All parameters are optional.',
    input_schema: {
      type: 'object',
      properties: {
        pdfText: { type: 'string', description: 'Extracted text from PDF (if the PDF was already read from the attachment)' },
        briefText: { type: 'string', description: 'Plain text brand/project description' },
        brandName: { type: 'string', description: 'Brand name (overrides auto-detection)' },
        logoBase64: { type: 'string', description: 'Logo image as base64 data URI' },
      },
    },
  },

  {
    name: 'generate_design_system_in_figma',
    description: 'One-click Design System generation. Takes a BrandAnalysis JSON (from analyze_brief) and creates a complete Figma design system: 4 variable collections (~65 variables), 8 text styles, 3 components (Button, Card, Badge). Call AFTER analyze_brief. This is the headline ODS feature.',
    input_schema: {
      type: 'object',
      properties: {
        brandAnalysis: { type: 'object', description: 'Full BrandAnalysis JSON from analyze_brief' },
      },
      required: ['brandAnalysis'],
    },
  },

  {
    name: 'create_variable_collections',
    description: 'Create multiple Figma Variable Collections in one call. Supports upsert (adds new variables to existing collections). Used internally by generate_design_system_in_figma.',
    input_schema: {
      type: 'object',
      properties: {
        collections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              variables: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, value: {} }, required: ['name', 'type'] } },
            },
            required: ['name', 'variables'],
          },
        },
      },
      required: ['collections'],
    },
  },

  {
    name: 'create_text_styles',
    description: 'Create Figma Text Styles from typography configuration. Creates 8 reusable text styles (DS/Display through DS/Caption). Used internally by generate_design_system_in_figma.',
    input_schema: {
      type: 'object',
      properties: {
        styles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, fontFamily: { type: 'string' }, fontSize: { type: 'number' },
              fontWeight: { type: 'number' }, lineHeight: { type: 'number' }, letterSpacing: { type: 'number' },
            },
            required: ['name', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'],
          },
        },
      },
      required: ['styles'],
    },
  },

  {
    name: 'create_ds_components',
    description: 'Create base design system components (Button, Card, Badge) with auto-layout and variable bindings. Used internally by generate_design_system_in_figma.',
    input_schema: {
      type: 'object',
      properties: {
        components: { type: 'array', items: { type: 'object' } },
      },
      required: ['components'],
    },
  },

  // ── IC: Interactive Components ──
  {
    name: 'create_component_node',
    description: 'Create a real Figma component (appears in Assets panel). Like create_frame but returns a ComponentNode. Use "Property=Value" naming for variants (e.g. "state=default", "state=hover").',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name. Use "Property=Value" for variants.' },
        width: { type: 'number', description: 'Width in pixels' },
        height: { type: 'number', description: 'Height in pixels' },
        x: { type: 'number' }, y: { type: 'number' },
        parentId: { type: 'string', description: 'Parent frame nodeId' },
        fillColor: { type: 'string', description: 'Hex fill color' },
        cornerRadius: { type: 'number' },
        description: { type: 'string', description: 'Component description' },
        layoutMode: { type: 'string', enum: ['HORIZONTAL', 'VERTICAL', 'NONE'] },
        itemSpacing: { type: 'number' },
        padding: { type: 'number', description: 'Uniform padding all sides' },
        paddingTop: { type: 'number' }, paddingRight: { type: 'number' },
        paddingBottom: { type: 'number' }, paddingLeft: { type: 'number' },
        primaryAxisAlignItems: { type: 'string', enum: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'] },
        counterAxisAlignItems: { type: 'string', enum: ['MIN', 'CENTER', 'MAX'] },
        clipsContent: { type: 'boolean' },
      },
    },
  },
  {
    name: 'convert_to_component',
    description: 'Convert an existing frame/group into a real Figma component in-place. Preserves all children, fills, auto-layout.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Frame or group node ID to convert' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'combine_as_variants',
    description: 'Combine 2+ components into a Component Set with auto-detected variant properties. Names should use "Property=Value" format. Frames are auto-converted to components.',
    input_schema: {
      type: 'object',
      properties: {
        componentIds: { type: 'array', items: { type: 'string' }, minItems: 2, description: 'Component/frame node IDs' },
        name: { type: 'string', description: 'Name for the component set' },
      },
      required: ['componentIds'],
    },
  },
  {
    name: 'create_instance',
    description: 'Create an instance of a component or component set. For component sets, use variantProperties to pick a variant.',
    input_schema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Component or ComponentSet node ID' },
        x: { type: 'number' }, y: { type: 'number' },
        parentId: { type: 'string' },
        variantProperties: { type: 'object', description: 'Variant selection e.g. { "state": "hover" }' },
      },
      required: ['componentId'],
    },
  },
  {
    name: 'detach_instance',
    description: 'Detach a component instance back to a plain frame.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Instance node ID to detach' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'set_reactions',
    description: 'Set prototype interactions on a node. For hover effects: trigger=MOUSE_ENTER, action=NODE, navigation=CHANGE_TO, destination=variantId, transition=SMART_ANIMATE. Pass empty reactions [] to clear.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to set interactions on' },
        reactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              trigger: { type: 'string', description: 'ON_CLICK, MOUSE_ENTER, MOUSE_LEAVE, ON_HOVER, ON_PRESS, ON_DRAG, AFTER_TIMEOUT' },
              action: { type: 'string', description: 'NODE, BACK, CLOSE, URL' },
              destination: { type: 'string', description: 'Target node ID for NODE actions' },
              navigation: { type: 'string', enum: ['NAVIGATE', 'SWAP', 'OVERLAY', 'SCROLL_TO', 'CHANGE_TO'] },
              transition: { type: 'string', enum: ['DISSOLVE', 'SMART_ANIMATE', 'MOVE_IN', 'MOVE_OUT', 'PUSH', 'SLIDE_IN', 'SLIDE_OUT'] },
              duration: { type: 'number', description: 'Transition duration in ms (default: 300)' },
              easing: { type: 'string', enum: ['EASE_IN', 'EASE_OUT', 'EASE_IN_AND_OUT', 'LINEAR', 'GENTLE', 'QUICK', 'BOUNCY', 'SLOW'] },
              delay: { type: 'number', description: 'Trigger delay in ms (default: 0)' },
              direction: { type: 'string', enum: ['LEFT', 'RIGHT', 'TOP', 'BOTTOM'] },
              url: { type: 'string' },
            },
            required: ['trigger', 'action'],
          },
        },
      },
      required: ['nodeId', 'reactions'],
    },
  },
  {
    name: 'get_reactions',
    description: 'Read current prototype interactions on a node. Returns reactions in simplified format.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to read interactions from' },
      },
      required: ['nodeId'],
    },
  },
];
