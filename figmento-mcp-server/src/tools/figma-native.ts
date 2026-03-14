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
    'Read the current Figma file\'s design context: all local Variables (with collections and modes), Paint Styles, Text Styles, Effect Styles, and available fonts. Call this FIRST when working with a file that has an existing design system — use the returned variable IDs and style IDs with bind_variable and apply_style tools instead of hardcoding values.',
    readFigmaContextSchema,
    async () => {
      const data = await sendDesignCommand('read_figma_context', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'bind_variable',
    'Bind a Figma Variable to a property on a node. This creates a LIVE binding — changing the variable value in Figma will update the node automatically. Use read_figma_context first to discover available variable IDs.',
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
    'Apply a Figma Style to a node. Use "styleType" to specify: "paint" (fill colors), "text" (font family, size, weight, spacing, line height — TEXT nodes only), or "effect" (shadows, blurs). Use read_figma_context to discover available style IDs.',
    applyStyleSchema,
    async (params) => handleApplyStyle(params as { styleType: string; nodeId: string; styleId: string }, sendDesignCommand)
  );

  // ═══════════════════════════════════════════════════════════
  // Deprecated aliases — delegate to apply_style handler
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'apply_paint_style',
    '[DEPRECATED — use apply_style instead] Apply a Figma Paint Style to a node\'s fills. The node will reference the style — updating the style updates all nodes using it. Use read_figma_context to discover available style IDs.',
    applyPaintStyleSchema,
    async (params) => handleApplyStyle({ styleType: 'paint', nodeId: params.nodeId, styleId: params.styleId }, sendDesignCommand)
  );

  server.tool(
    'apply_text_style',
    '[DEPRECATED — use apply_style instead] Apply a Figma Text Style to a text node. Sets font family, size, weight, spacing, and line height from the style. Only works on TEXT nodes.',
    applyTextStyleSchema,
    async (params) => handleApplyStyle({ styleType: 'text', nodeId: params.nodeId, styleId: params.styleId }, sendDesignCommand)
  );

  server.tool(
    'apply_effect_style',
    '[DEPRECATED — use apply_style instead] Apply a Figma Effect Style to a node. Sets shadows and blurs from the style definition.',
    applyEffectStyleSchema,
    async (params) => handleApplyStyle({ styleType: 'effect', nodeId: params.nodeId, styleId: params.styleId }, sendDesignCommand)
  );

  server.tool(
    'create_figma_variables',
    'Create a Figma Variable Collection with variables. Converts hex colors to native COLOR variables, numbers to FLOAT variables. Use "/" in names for folder grouping (e.g., "color/primary"). If a collection with the same name exists, returns its info instead of duplicating.',
    createFigmaVariablesSchema,
    async (params) => {
      const data = await sendDesignCommand('create_figma_variables', params as Record<string, unknown>);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'create_variables_from_design_system',
    'Convert a Figmento design system into native Figma Variables. Loads the design system by name, extracts all color, spacing, and radius tokens, and creates a Figma Variable Collection. This makes the design system available as native Figma tokens for use with bind_variable.',
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
