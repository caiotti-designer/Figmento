import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';
import { getDesignSystemsDir } from './design-system';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export const readFigmaContextSchema = {};

export const bindVariableSchema = {
  nodeId: z.string().describe('Target node ID'),
  variableId: z.string().describe('Variable ID from read_figma_context response'),
  field: z.string().describe('Node property to bind. Allowed: fills, strokes, opacity, width, height, paddingTop, paddingRight, paddingBottom, paddingLeft, itemSpacing, cornerRadius, fontSize, fontFamily, fontWeight'),
};

export const applyPaintStyleSchema = {
  nodeId: z.string().describe('Target node ID'),
  styleId: z.string().describe('Paint Style ID from read_figma_context response'),
};

export const applyTextStyleSchema = {
  nodeId: z.string().describe('Target TEXT node ID'),
  styleId: z.string().describe('Text Style ID from read_figma_context response'),
};

export const applyEffectStyleSchema = {
  nodeId: z.string().describe('Target node ID'),
  styleId: z.string().describe('Effect Style ID from read_figma_context response'),
};

export const createFigmaVariablesSchema = {
  collectionName: z.string().describe('Name for the variable collection (e.g., "Brand Colors", "Spacing")'),
  variables: z.array(z.object({
    name: z.string().describe('Variable name (e.g., "primary", "md")'),
    type: z.string().describe('Variable type: COLOR, FLOAT, STRING, or BOOLEAN'),
    value: z.any().describe('Value: hex string for COLOR, number for FLOAT, string for STRING, boolean for BOOLEAN'),
    group: z.string().optional().describe('Folder group prefix (e.g., "color" → creates "color/primary")'),
  })).describe('Variables to create'),
};

export const createDSComponentsSchema = {
  components: z.array(z.object({
    type: z.string().describe('Component type: "button", "card", or "badge"'),
    name: z.string().describe('Component name with DS/ prefix (e.g., "DS/Button")'),
    fillColor: z.string().describe('Background fill hex color'),
    textColor: z.string().describe('Text fill hex color'),
    fontFamily: z.string().describe('Font family for primary text'),
    fontSize: z.number().describe('Font size in pixels'),
    fontWeight: z.number().describe('Font weight: 400 or 700'),
    lineHeight: z.number().describe('Line height in pixels'),
    text: z.string().describe('Default label text'),
    cornerRadius: z.number().describe('Corner radius in pixels'),
    padding: z.object({
      top: z.number(), right: z.number(), bottom: z.number(), left: z.number(),
    }).describe('Padding in pixels'),
    itemSpacing: z.number().describe('Auto-layout item spacing'),
    width: z.number().optional().describe('Fixed width (for Card)'),
    textStyleId: z.string().optional().describe('Text style ID from ODS-5'),
    fillVariableId: z.string().optional().describe('Variable ID for fill binding from ODS-4'),
    children: z.array(z.object({
      text: z.string(),
      fontFamily: z.string(),
      fontSize: z.number(),
      fontWeight: z.number(),
      lineHeight: z.number(),
      textColor: z.string(),
      textStyleId: z.string().optional(),
    })).optional().describe('Child text nodes (for Card with multiple text slots)'),
  })).describe('Array of component definitions'),
  interactive: z.boolean().optional().describe('When true, auto-generates state=default/hover/pressed variants for buttons/badges and state=default/hover for cards, combines as variant set, and wires button-hover/button-press/card-hover interaction presets. Max 3 variants per component. Default: false.'),
};

export const createTextStylesSchema = {
  styles: z.array(z.object({
    name: z.string().describe('Style name with DS/ prefix (e.g., "DS/Display", "DS/H1", "DS/Body")'),
    fontFamily: z.string().describe('Font family name (e.g., "Manrope", "Inter")'),
    fontSize: z.number().describe('Font size in pixels'),
    fontWeight: z.number().describe('Font weight: 400 (Regular) or 700 (Bold). Never 600.'),
    lineHeight: z.number().describe('Line height in PIXELS (e.g., 73.6 for 64px × 1.15). NOT a multiplier.'),
    letterSpacing: z.number().describe('Letter spacing in pixels (e.g., -1.28). Use 0 for body text.'),
  })).describe('Array of text style definitions to create'),
};

export const createVariableCollectionsSchema = {
  collections: z.array(z.object({
    name: z.string().describe('Collection name (e.g., "Brand Colors", "Spacing", "Radius")'),
    variables: z.array(z.object({
      name: z.string().describe('Variable name with optional folder path (e.g., "primary/500", "md", "none"). Use "/" for folder hierarchy.'),
      type: z.string().describe('Variable type: COLOR, FLOAT, STRING, or BOOLEAN'),
      value: z.any().describe('Value: hex string for COLOR, number for FLOAT, string for STRING, boolean for BOOLEAN'),
    })).describe('Variables to create in this collection'),
  })).describe('Array of collection definitions to create'),
};

export const createVariablesFromDesignSystemSchema = {
  designSystemName: z.string().describe('Name of the Figmento design system (e.g., "payflow", "stripe", "noir")'),
};

// ═══════════════════════════════════════════════════════════
// Consolidated apply_style schema
// ═══════════════════════════════════════════════════════════

export const applyStyleSchema = {
  styleType: z.string().describe('Type of style to apply: "paint" | "text" | "effect"'),
  nodeId: z.string().describe('Target node ID'),
  styleId: z.string().describe('Style ID from read_figma_context response'),
};

function wrapPretty(data: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

async function handleApplyStyle(params: { styleType: string; nodeId: string; styleId: string }, sendDesignCommand: SendDesignCommand) {
  switch (params.styleType) {
    case 'paint':
      return wrapPretty(await sendDesignCommand('apply_paint_style', { nodeId: params.nodeId, styleId: params.styleId }));
    case 'text':
      return wrapPretty(await sendDesignCommand('apply_text_style', { nodeId: params.nodeId, styleId: params.styleId }));
    case 'effect':
      return wrapPretty(await sendDesignCommand('apply_effect_style', { nodeId: params.nodeId, styleId: params.styleId }));
    default:
      throw new Error(`Unknown apply_style styleType: "${params.styleType}". Must be one of: paint, text, effect`);
  }
}

export function registerFigmaNativeTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'read_figma_context',
    'Read the Figma file\'s design context: variables, paint/text/effect styles, and fonts. Call first to discover IDs for bind_variable and apply_style.',
    readFigmaContextSchema,
    async () => {
      const data = await sendDesignCommand('read_figma_context', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'bind_variable',
    'Bind a Figma Variable to a node property. Creates a live binding that updates when the variable changes.',
    bindVariableSchema,
    async (params) => {
      const data = await sendDesignCommand('bind_variable', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // Consolidated tool: apply_style
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'apply_style',
    'Apply a Figma Style to a node. Use styleType: "paint", "text", or "effect". Get style IDs from read_figma_context.',
    applyStyleSchema,
    async (params) => handleApplyStyle(params as { styleType: string; nodeId: string; styleId: string }, sendDesignCommand)
  );

  server.tool(
    'create_figma_variables',
    'Create a Figma Variable Collection with variables. Use "/" in names for folder grouping. Deduplicates existing collections.',
    createFigmaVariablesSchema,
    async (params) => {
      const data = await sendDesignCommand('create_figma_variables', params as Record<string, unknown>);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'create_variable_collections',
    'Create multiple Figma Variable Collections in one call. Supports upsert — existing collections get new variables added.',
    createVariableCollectionsSchema,
    async (params) => {
      const data = await sendDesignCommand('create_variable_collections', params as Record<string, unknown>);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'create_ds_components',
    'Create design system components (Button, Card, Badge) in Figma. Set interactive: true to auto-generate variant states and wire interactions.',
    createDSComponentsSchema,
    async (params) => {
      const data = await sendDesignCommand('create_ds_components', params as Record<string, unknown>);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'create_text_styles',
    'Create Figma Text Styles from typography configuration. fontWeight must be 400 or 700. lineHeight in pixels.',
    createTextStylesSchema,
    async (params) => {
      const data = await sendDesignCommand('create_text_styles', params as Record<string, unknown>);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'create_variables_from_design_system',
    'Convert a Figmento design system into native Figma Variables. Creates a variable collection from color, spacing, and radius tokens.',
    createVariablesFromDesignSystemSchema,
    async (params) => {
      const dsDir = getDesignSystemsDir();
      const tokensPath = nodePath.join(dsDir, params.designSystemName, 'tokens.yaml');

      if (!fs.existsSync(tokensPath)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Design system "${params.designSystemName}" not found. Check available systems in knowledge/design-systems/.` }, null, 2) }] };
      }

      const dsRaw = yaml.load(fs.readFileSync(tokensPath, 'utf-8')) as Record<string, unknown>;
      const variables: Array<{ name: string; type: string; value: unknown; group: string }> = [];

      // Colors — flat key→hex map
      const colors = dsRaw.colors as Record<string, unknown> | undefined;
      if (colors) {
        for (const [key, value] of Object.entries(colors)) {
          if (typeof value === 'string' && value.startsWith('#')) {
            variables.push({ name: key, type: 'COLOR', value, group: 'color' });
          }
        }
      }

      // Spacing — key→number (skip the 'unit' meta-key)
      const spacing = dsRaw.spacing as Record<string, unknown> | undefined;
      if (spacing) {
        for (const [key, value] of Object.entries(spacing)) {
          if (key !== 'unit' && typeof value === 'number') {
            variables.push({ name: key, type: 'FLOAT', value, group: 'spacing' });
          }
        }
      }

      // Radius — key→number
      const radius = dsRaw.radius as Record<string, unknown> | undefined;
      if (radius) {
        for (const [key, value] of Object.entries(radius)) {
          if (typeof value === 'number') {
            variables.push({ name: key, type: 'FLOAT', value, group: 'radius' });
          }
        }
      }

      const result = await sendDesignCommand('create_figma_variables', {
        collectionName: params.designSystemName,
        variables,
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
