// scripts/generate-tool-schemas.ts
// Auto-generates figmento/src/ui/tools-schema.generated.ts from MCP server Zod schemas.
// Run: npx tsx ../scripts/generate-tool-schemas.ts  (from figmento/)
//   or: npx tsx scripts/generate-tool-schemas.ts    (from repo root)
//   or: npm run build                               (figmento/ — triggered via prebuild hook)
//
// Description strategy: Option B — descriptions hardcoded here.
// Avoids touching the MCP server's register functions; keeps them in one place for the plugin.

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';

// __dirname polyfill for ESM (tsx provides this, but explicit is safer)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CRITICAL: Zod instance alignment ────────────────────────────────────────
// zodToJsonSchema uses instanceof ZodType to walk schemas.
// Schema files resolve zod from figmento-mcp-server/node_modules/zod.
// We must ensure zodToJsonSchema also uses that same zod instance.
// Solution: require both packages from figmento-mcp-server/node_modules/ explicitly.
const serverRequire = createRequire(
  path.resolve(__dirname, '../figmento-mcp-server/package.json'),
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { zodToJsonSchema } = serverRequire('zod-to-json-schema') as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { z } = serverRequire('zod') as any;

// ── Import named schema exports from all MCP tool files (SU-2.1 exports) ────
import * as canvasSchemas from '../figmento-mcp-server/src/tools/canvas';
import * as styleSchemas from '../figmento-mcp-server/src/tools/style';
import * as batchSchemas from '../figmento-mcp-server/src/tools/batch';
import * as sceneSchemas from '../figmento-mcp-server/src/tools/scene';
import * as exportSchemas from '../figmento-mcp-server/src/tools/export';
import * as refinementSchemas from '../figmento-mcp-server/src/tools/refinement';
import * as intelligenceSchemas from '../figmento-mcp-server/src/tools/intelligence';
import * as nativeSchemas from '../figmento-mcp-server/src/tools/figma-native';
import * as iconsSchemas from '../figmento-mcp-server/src/tools/icons';
import * as layoutsSchemas from '../figmento-mcp-server/src/tools/layouts';
import * as patternsSchemas from '../figmento-mcp-server/src/tools/patterns';
import * as templateSchemas from '../figmento-mcp-server/src/tools/template';
import * as dsTemplatesSchemas from '../figmento-mcp-server/src/tools/ds-templates';
import * as connectionSchemas from '../figmento-mcp-server/src/tools/connection';
import * as referencesSchemas from '../figmento-mcp-server/src/tools/references';
import * as adAnalyzerSchemas from '../figmento-mcp-server/src/tools/ad-analyzer';
import * as designSystemSchemas from '../figmento-mcp-server/src/tools/design-system';

// ── PLUGIN_TOOLS whitelist: 35 MCP tools surfaced in the plugin ──────────────
// generate_image and update_memory are plugin-only — kept hand-authored in tools-schema.ts.
const PLUGIN_TOOLS: string[] = [
  'create_frame', 'create_text', 'create_rectangle', 'create_ellipse', 'create_image',
  'set_fill', 'set_stroke', 'set_effects', 'set_corner_radius', 'set_opacity', 'set_auto_layout',
  'get_selection', 'get_screenshot', 'export_node', 'get_node_info', 'get_page_nodes',
  'delete_node', 'move_node', 'resize_node', 'rename_node', 'append_child', 'reorder_child',
  'group_nodes', 'clone_node', 'create_design', 'scan_frame_structure', 'create_icon',
  'read_figma_context', 'bind_variable', 'apply_paint_style', 'apply_text_style',
  'apply_effect_style', 'run_refinement_check', 'create_figma_variables',
  'get_layout_blueprint', 'get_color_palette', 'get_font_pairing', 'get_size_preset',
  'get_contrast_check', 'get_design_rules',
];

// ── Tool descriptions (Option B: hardcoded — no MCP server changes needed) ───
const TOOL_DESCRIPTIONS: Record<string, string> = {
  create_frame:
    'Create a frame (container) on the Figma canvas. Frames can have auto-layout, fills, padding, and contain children. Returns the nodeId of the created frame.',
  create_text:
    'Create a text element on the Figma canvas. Supports Google Fonts, mixed-weight segments, and auto-layout sizing. Returns the nodeId.',
  create_rectangle: 'Create a rectangle shape on the Figma canvas.',
  create_ellipse: 'Create an ellipse/circle on the Figma canvas.',
  create_image:
    'Place an image on the Figma canvas from base64 data. Use this after generating an image with mcp-image — read the file and pass the base64 content.',
  set_fill:
    'Set or replace the fill(s) of a node. Supports solid colors, linear gradients, and image fills. Provide either a simple hex color or a fills array.',
  set_stroke: 'Set or remove the stroke (border) on a node.',
  set_effects: 'Add drop shadow or inner shadow effects to a node.',
  set_corner_radius: 'Set corner radius on a frame or rectangle.',
  set_opacity: 'Set the opacity of a node.',
  set_auto_layout: 'Configure auto-layout on a frame (flexbox-like container).',
  get_selection: 'Get information about the currently selected nodes in Figma.',
  get_screenshot:
    'Capture a PNG screenshot of a node and return it as a base64 image for inline rendering. Use this to visually verify designs.',
  export_node: 'Export a node as a PNG/SVG/JPG image (base64). Use for screenshots/self-evaluation.',
  get_node_info: 'Get detailed information about a specific node (properties, fills, children, etc.).',
  get_page_nodes: 'List all top-level nodes on the current Figma page.',
  delete_node: 'Delete a node from the canvas.',
  move_node: 'Move a node to a new position.',
  resize_node: 'Resize a node.',
  rename_node: 'Rename a node.',
  append_child: 'Move a node inside a parent frame.',
  reorder_child: 'Reorder a child node within its parent frame. Use index=0 to send to back (bottom layer behind all siblings), or omit index to send to front (top layer). Essential for placing background images behind text.',
  scan_frame_structure: 'Deep-scan a Figma frame and return its complete structure tree with types, positions, sizes, styles, text content, and children. Use this to understand the full layout and content of a frame. Returns much more detail than get_node_info.',
  create_icon: 'Place a Lucide icon on the canvas. Over 1900 icons available by name (e.g. "check", "arrow-right", "star", "heart", "zap", "shield"). Returns the icon nodeId. Specify size in pixels and optional color.',
  group_nodes:
    'Group multiple nodes into a single group. All nodes must share the same parent. Useful for bundling related elements (e.g. a button bg + label, a speaker card) so they can be moved/cloned as a unit.',
  clone_node:
    "Clone (duplicate) an existing node. Returns the new node's ID. Great for repeating patterns like menu items, speaker cards, tags, etc.",
  create_design:
    'Create a complete design from a UIAnalysis JSON structure. This is the batch tool — it creates a main frame with all child elements (text, shapes, images, icons, auto-layout) in a single operation. Best for creating full designs at once rather than element-by-element.',
  read_figma_context:
    "Read the current Figma file's design context: all local Variables (with collections and modes), Paint Styles, Text Styles, Effect Styles, and available fonts. Call this FIRST when working with a file that has an existing design system — use the returned variable IDs and style IDs with bind_variable and apply_*_style tools instead of hardcoding values.",
  bind_variable:
    'Bind a Figma Variable to a property on a node. Creates a LIVE binding — changing the variable value in Figma updates the node automatically. Use read_figma_context first to discover variable IDs. For fill/stroke binding, ensures a placeholder paint exists before binding.',
  apply_paint_style:
    "Apply a Figma Paint Style to a node's fills. The node will reference the style — updating the style updates all nodes using it. Use read_figma_context to discover available style IDs.",
  apply_text_style:
    'Apply a Figma Text Style to a text node. Sets font family, size, weight, spacing, and line height from the style. Only works on TEXT nodes.',
  apply_effect_style: 'Apply a Figma Effect Style to a node. Sets shadows and blurs from the style definition.',
  run_refinement_check:
    'Run a structural quality check on a design node. Checks: gradient direction (solid end must face text), auto-layout coverage (frames with 2+ children should have layoutMode), spacing scale (itemSpacing must be on the 8px grid), typography hierarchy (largest font must be ≥2× smallest), and empty placeholders (default-named or gray-filled nodes). Returns a report with nodeId, totalChecked, issues array, and passed boolean.',
  create_figma_variables:
    'Create a Figma Variable Collection with variables. Converts hex colors to native COLOR variables, numbers to FLOAT variables. Use "/" in names for folder grouping (e.g., "color/primary"). If a collection with the same name exists, returns its info instead of duplicating.',
  get_layout_blueprint:
    'Look up a layout blueprint from the bundled knowledge base. Returns zone breakdown, anti-generic rules, and memorable element hint. Categories: ads, social, web, presentation, print. Optional mood filter (e.g. "luxury", "minimal", "bold"). Optional subcategory (e.g. "product", "hero", "instagram_post").',
  get_color_palette:
    'Get a color palette by mood keywords or palette ID. Returns primary, secondary, accent, background, text, and muted colors.',
  get_font_pairing:
    'Get font pairing recommendations by mood/style. Returns heading and body fonts with recommended weights.',
  get_size_preset:
    'Get exact pixel dimensions for common design formats (social media, print, presentations, web). Query by platform, category, or specific preset ID.',
  get_contrast_check:
    'Check WCAG contrast ratio between two colors. Returns ratio and pass/fail for AA/AAA levels (normal and large text). Use to verify text readability.',
  get_design_rules:
    'Retrieve design reference data by category: typography (font rules, hierarchy), layout (8px grid, spacing), color (palettes, WCAG), print (page structure), evaluation (16-point checklist), refinement (7-step pass), anti-patterns (what to avoid), gradients (direction map), taste (aesthetic directions).',
};

// ── Map schema export name → tool name ──────────────────────────────────────
// e.g. createFrameSchema → create_frame
function schemaExportToToolName(exportName: string): string {
  const base = exportName.replace(/Schema$/, '');
  return base.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

// ── Build flat name → raw schema object map ──────────────────────────────────
const allModules: Record<string, unknown>[] = [
  canvasSchemas as Record<string, unknown>,
  styleSchemas as Record<string, unknown>,
  batchSchemas as Record<string, unknown>,
  sceneSchemas as Record<string, unknown>,
  exportSchemas as Record<string, unknown>,
  refinementSchemas as Record<string, unknown>,
  intelligenceSchemas as Record<string, unknown>,
  nativeSchemas as Record<string, unknown>,
  iconsSchemas as Record<string, unknown>,
  layoutsSchemas as Record<string, unknown>,
  patternsSchemas as Record<string, unknown>,
  templateSchemas as Record<string, unknown>,
  dsTemplatesSchemas as Record<string, unknown>,
  connectionSchemas as Record<string, unknown>,
  referencesSchemas as Record<string, unknown>,
  adAnalyzerSchemas as Record<string, unknown>,
  designSystemSchemas as Record<string, unknown>,
];

const schemaMap: Record<string, unknown> = {};
for (const mod of allModules) {
  for (const [exportName, value] of Object.entries(mod)) {
    if (exportName.endsWith('Schema') && typeof value === 'object' && value !== null) {
      const toolName = schemaExportToToolName(exportName);
      schemaMap[toolName] = value;
    }
  }
}

// ── Generate tool definitions for whitelisted tools ──────────────────────────
const generated: Array<{ name: string; description: string; input_schema: unknown }> = [];

for (const toolName of PLUGIN_TOOLS) {
  const rawSchema = schemaMap[toolName] as Record<string, unknown> | undefined;
  if (rawSchema === undefined) {
    console.warn(`[generate-tool-schemas] WARNING: no schema found for '${toolName}'`);
    continue;
  }

  // Wrap the raw plain-object schema in z.object() using the same zod instance as the files.
  // This is required because zodToJsonSchema expects a ZodType, not a plain object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zodSchema = z.object(rawSchema as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonSchema = zodToJsonSchema(zodSchema, { errorMessages: false }) as any;

  // Strip the $schema meta-property — not needed in tool definitions
  delete jsonSchema.$schema;

  generated.push({
    name: toolName,
    description: TOOL_DESCRIPTIONS[toolName] ?? '',
    input_schema: jsonSchema,
  });
}

// ── Write output file ────────────────────────────────────────────────────────
const outputPath = path.resolve(__dirname, '../figmento/src/ui/tools-schema.generated.ts');
const content = [
  '// AUTO-GENERATED — do not edit manually.',
  '// Source: scripts/generate-tool-schemas.ts',
  '// Regenerate: cd figmento && npm run build  (or: npx tsx ../scripts/generate-tool-schemas.ts)',
  `// Last generated: ${new Date().toISOString()}`,
  "import type { ToolDefinition } from './tools-schema';",
  '',
  `export const GENERATED_TOOLS: ToolDefinition[] = ${JSON.stringify(generated, null, 2)};`,
  '',
].join('\n');

fs.writeFileSync(outputPath, content, 'utf-8');
console.log(`[generate-tool-schemas] Wrote ${generated.length} tools → tools-schema.generated.ts`);
