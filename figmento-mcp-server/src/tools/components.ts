import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';
import * as yaml from 'js-yaml';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

// ═══════════════════════════════════════════════════════════════
// IC-1: Create Component + Convert to Component
// ═══════════════════════════════════════════════════════════════

export const createComponentSchema = {
  name: z.string().optional().describe('Component name. Use "Property=Value" naming for variants (e.g. "state=default")'),
  width: z.number().optional().describe('Width in pixels (default: 100)'),
  height: z.number().optional().describe('Height in pixels (default: 100)'),
  x: z.number().optional().describe('X position'),
  y: z.number().optional().describe('Y position'),
  parentId: z.string().optional().describe('Parent frame nodeId to append to'),
  fillColor: z.string().optional().describe('Solid fill hex color (e.g. "#FF5733")'),
  cornerRadius: z.number().optional().describe('Corner radius in pixels'),
  description: z.string().optional().describe('Component description (visible in Assets panel)'),
  layoutMode: z.string().optional().describe('Auto-layout: HORIZONTAL, VERTICAL, or NONE'),
  itemSpacing: z.number().optional().describe('Gap between auto-layout children'),
  padding: z.number().optional().describe('Uniform padding (all sides)'),
  paddingTop: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingBottom: z.number().optional(),
  paddingLeft: z.number().optional(),
  primaryAxisAlignItems: z.string().optional().describe('MIN, CENTER, MAX, or SPACE_BETWEEN'),
  counterAxisAlignItems: z.string().optional().describe('MIN, CENTER, or MAX'),
  primaryAxisSizingMode: z.string().optional().describe('FIXED or AUTO'),
  counterAxisSizingMode: z.string().optional().describe('FIXED or AUTO'),
  clipsContent: z.boolean().optional(),
};

export const convertToComponentSchema = {
  nodeId: z.string().describe('Node ID of the frame/group to convert to a component'),
};

// ═══════════════════════════════════════════════════════════════
// IC-2: Combine as Variants
// ═══════════════════════════════════════════════════════════════

export const combineAsVariantsSchema = {
  componentIds: z.array(z.string()).min(2).describe('Array of component or frame node IDs to combine (minimum 2). Frames are auto-converted to components. Names should use "Property=Value" format (e.g. "state=default", "state=hover") for auto-detection of variant properties.'),
  name: z.string().optional().describe('Name for the component set (e.g. "Button")'),
};

// ═══════════════════════════════════════════════════════════════
// IC-3: Create Instance + Detach
// ═══════════════════════════════════════════════════════════════

export const createInstanceSchema = {
  componentId: z.string().describe('Component or ComponentSet node ID to instantiate'),
  x: z.number().optional().describe('X position for the instance'),
  y: z.number().optional().describe('Y position for the instance'),
  parentId: z.string().optional().describe('Parent frame to append instance to'),
  variantProperties: z.record(z.string()).optional().describe('Variant property values to select (e.g. { "state": "hover" }). Only used with ComponentSet.'),
};

export const detachInstanceSchema = {
  nodeId: z.string().describe('Instance node ID to detach back to a frame'),
};

// ═══════════════════════════════════════════════════════════════
// IC-5: Set Reactions (Prototype Interactions)
// ═══════════════════════════════════════════════════════════════

const simplifiedReactionSchema = z.object({
  trigger: z.string().describe('Trigger type: ON_CLICK, ON_HOVER, ON_PRESS, ON_DRAG, MOUSE_ENTER, MOUSE_LEAVE, AFTER_TIMEOUT, MOUSE_UP, MOUSE_DOWN'),
  action: z.string().describe('Action type: NODE (navigate/swap/overlay/change_to), BACK, CLOSE, URL'),
  destination: z.string().optional().describe('Target node ID for NODE actions'),
  navigation: z.string().optional().describe('Navigation mode: NAVIGATE, SWAP, OVERLAY, SCROLL_TO, CHANGE_TO (default: NAVIGATE)'),
  transition: z.string().optional().describe('Transition: DISSOLVE, SMART_ANIMATE, SCROLL_ANIMATE, MOVE_IN, MOVE_OUT, PUSH, SLIDE_IN, SLIDE_OUT'),
  duration: z.number().optional().describe('Transition duration in ms (default: 300)'),
  easing: z.string().optional().describe('Easing: EASE_IN, EASE_OUT, EASE_IN_AND_OUT, LINEAR, GENTLE, QUICK, BOUNCY, SLOW'),
  delay: z.number().optional().describe('Trigger delay in ms for MOUSE_ENTER/LEAVE (default: 0)'),
  timeout: z.number().optional().describe('Timeout in ms for AFTER_TIMEOUT trigger'),
  direction: z.string().optional().describe('Direction for directional transitions: LEFT, RIGHT, TOP, BOTTOM'),
  url: z.string().optional().describe('URL for URL actions'),
  openInNewTab: z.boolean().optional().describe('Open URL in new tab (default: true)'),
});

export const setReactionsSchema = {
  nodeId: z.string().describe('Node ID to set interactions on'),
  reactions: z.array(simplifiedReactionSchema).describe('Array of reactions. Pass empty array [] to clear all interactions.'),
};

export const getReactionsSchema = {
  nodeId: z.string().describe('Node ID to read interactions from'),
};

// ═══════════════════════════════════════════════════════════════
// IC-7: Apply Interaction Preset
// ═══════════════════════════════════════════════════════════════

export const applyInteractionSchema = {
  nodeId: z.string().describe('Node ID to apply the interaction preset to'),
  preset: z.string().describe('Preset name from interactions.yaml (e.g. "button-hover", "card-hover", "nav-link", "modal-open", "modal-close", "tab-switch", "carousel-next", "carousel-prev", "back-navigation", "tooltip-show", "page-transition-push", "button-full", "button-press")'),
  bindings: z.record(z.string()).optional().describe('Map $placeholder → nodeId. E.g. { "$hover_variant": "123:456", "$default_variant": "123:457" }. Check the preset\'s reactions to see which placeholders are needed.'),
};

export const listInteractionPresetsSchema = {};

// ═══════════════════════════════════════════════════════════════
// Interactions YAML loader
// ═══════════════════════════════════════════════════════════════

interface PresetReaction {
  trigger: string;
  action: string;
  destination?: string;
  navigation?: string;
  transition?: string;
  duration?: number;
  easing?: string;
  delay?: number;
  direction?: string;
}

interface InteractionPreset {
  description: string;
  requires?: string;
  reactions: PresetReaction[];
}

interface InteractionsFile {
  presets: Record<string, InteractionPreset>;
}

let cachedPresets: InteractionsFile | null = null;

function getKnowledgePath(name: string): string {
  // Handle both ts-jest (src/tools/) and esbuild dist (dist/) paths
  const oneUp = nodePath.join(__dirname, '..', 'knowledge', name);
  if (fs.existsSync(oneUp)) return oneUp;
  return nodePath.join(__dirname, '..', '..', 'knowledge', name);
}

function loadPresets(): InteractionsFile {
  if (cachedPresets) return cachedPresets;
  const filePath = getKnowledgePath('interactions.yaml');
  const raw = fs.readFileSync(filePath, 'utf-8');
  cachedPresets = yaml.load(raw) as InteractionsFile;
  return cachedPresets;
}

function resolveBindings(reactions: PresetReaction[], bindings: Record<string, string>): PresetReaction[] {
  return reactions.map(r => {
    const resolved = { ...r };
    if (resolved.destination && resolved.destination.startsWith('$')) {
      const key = resolved.destination;
      if (bindings[key]) {
        resolved.destination = bindings[key];
      } else {
        throw new Error(`Missing binding for "${key}". Provide it in the bindings parameter.`);
      }
    }
    return resolved;
  });
}

// ═══════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════

export function registerInteractiveComponentTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  // IC-1: Create Component
  server.tool(
    'create_component_node',
    'Create a new Figma component (ComponentNode). Like create_frame but creates a real component that appears in the Assets panel. Use "Property=Value" naming (e.g. "state=default") when creating variants. Supports auto-layout, fills, corner radius, and all frame properties. Also available in batch_execute with tempId support.',
    createComponentSchema,
    async (params) => {
      const data = await sendDesignCommand('create_component_node', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // IC-1: Convert to Component
  server.tool(
    'convert_to_component',
    'Convert an existing frame or group into a Figma component. Preserves all children, fills, auto-layout, and constraints. The node is replaced in-place — same position, same parent. Returns the new componentKey for future instantiation.',
    convertToComponentSchema,
    async (params) => {
      const data = await sendDesignCommand('convert_to_component', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // IC-2: Combine as Variants
  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK + zod
  server.tool(
    'combine_as_variants',
    'Combine 2+ components into a Figma Component Set with auto-detected variant properties. Components should be named with "Property=Value" format (e.g. "state=default", "state=hover", "size=small", "size=large"). Frames/groups in the array are auto-converted to components first. All nodes must share the same parent.',
    combineAsVariantsSchema,
    async (params) => {
      const data = await sendDesignCommand('combine_as_variants', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // IC-3: Create Instance
  server.tool(
    'create_instance',
    'Create an instance of a component or component set. For component sets, use variantProperties to select which variant (e.g. { "state": "hover" }). If no variantProperties provided, the first variant is used. Instance stays linked to main component — edits to the main component propagate to all instances.',
    createInstanceSchema,
    async (params) => {
      const data = await sendDesignCommand('create_instance', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // IC-3: Detach Instance
  server.tool(
    'detach_instance',
    'Detach a component instance back to a plain frame. The node loses its connection to the main component and becomes independently editable. Useful for one-off customizations.',
    detachInstanceSchema,
    async (params) => {
      const data = await sendDesignCommand('detach_instance', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // IC-5: Set Reactions
  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK + zod
  server.tool(
    'set_reactions',
    'Set prototype interactions on a node. Use simplified reaction objects with trigger (ON_CLICK, MOUSE_ENTER, etc.), action (NODE, BACK, CLOSE, URL), and optional transition/easing. For hover effects on component variants: trigger=MOUSE_ENTER, action=NODE, navigation=CHANGE_TO, destination=hoverVariantId, transition=SMART_ANIMATE. Pass empty reactions array [] to clear all interactions.',
    setReactionsSchema,
    async (params) => {
      const data = await sendDesignCommand('set_reactions', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // IC-8: Get Reactions
  server.tool(
    'get_reactions',
    'Read the current prototype interactions on a node. Returns reactions in simplified format (trigger type, action type, destination, transition). Useful for inspecting existing interactions or AI self-evaluation before adding more.',
    getReactionsSchema,
    async (params) => {
      const data = await sendDesignCommand('get_reactions', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // IC-7: Apply Interaction Preset
  server.tool(
    'apply_interaction',
    'Apply a named interaction preset to a node. Presets: button-hover, button-press, button-full, card-hover, nav-link, modal-open, modal-close, tab-switch, carousel-next, carousel-prev, back-navigation, tooltip-show, page-transition-push. Pass bindings to map $placeholder destination IDs (e.g. { "$hover_variant": "nodeId", "$default_variant": "nodeId" }).',
    applyInteractionSchema,
    async (params: { nodeId: string; preset: string; bindings?: Record<string, string> }) => {
      const presets = loadPresets();
      const preset = presets.presets[params.preset];
      if (!preset) {
        const available = Object.keys(presets.presets).join(', ');
        throw new Error(`Unknown preset "${params.preset}". Available: ${available}`);
      }

      const bindings = params.bindings || {};
      const resolved = resolveBindings(preset.reactions, bindings);

      const data = await sendDesignCommand('set_reactions', {
        nodeId: params.nodeId,
        reactions: resolved,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ...data,
            preset: params.preset,
            description: preset.description,
          }, null, 2),
        }],
      };
    }
  );

  // IC-7: List available presets
  server.tool(
    'list_interaction_presets',
    'List all available interaction presets with descriptions. Use this to discover which presets are available for apply_interaction.',
    listInteractionPresetsSchema,
    async () => {
      const presets = loadPresets();
      const list = Object.entries(presets.presets).map(([name, p]) => ({
        name,
        description: p.description,
        requires: p.requires || null,
        reactionCount: p.reactions.length,
        placeholders: p.reactions
          .filter(r => r.destination?.startsWith('$'))
          .map(r => r.destination)
          .filter((v, i, a) => a.indexOf(v) === i),
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(list, null, 2) }] };
    }
  );
}
