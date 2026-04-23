/**
 * ODS-7: One-Click DS Pipeline — generate_design_system_in_figma
 *
 * Orchestrates: BrandAnalysis → ODS-4 (variables) → ODS-5 (text styles) → ODS-6a (components)
 * Single MCP tool call creates full DS in Figma.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BrandAnalysis } from '../types/brand-analysis';
import { recordShowcase } from './design-system/showcase-tracker';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

// ═══════════════════════════════════════════════════════════════
// DATA TRANSFORMATION — BrandAnalysis → downstream tool inputs
// ═══════════════════════════════════════════════════════════════

/**
 * Transform BrandAnalysis colors/spacing/radius into ODS-4 collections input.
 */
export function brandAnalysisToCollections(ba: BrandAnalysis) {
  const brandColorVars: Array<{ name: string; type: string; value: unknown }> = [];

  // Color scales (primary, secondary, accent)
  for (const [colorName, scale] of Object.entries(ba.colors.scales)) {
    for (const [step, hex] of Object.entries(scale)) {
      brandColorVars.push({ name: `${colorName}/${step}`, type: 'COLOR', value: hex });
    }
  }

  // Semantic colors
  const semanticColors = ['background', 'text', 'muted', 'surface', 'error', 'success'] as const;
  for (const key of semanticColors) {
    brandColorVars.push({ name: key, type: 'COLOR', value: ba.colors[key] });
  }

  // Neutrals
  const neutralVars = Object.entries(ba.colors.neutrals).map(([step, hex]) => ({
    name: step, type: 'COLOR' as const, value: hex,
  }));

  // Spacing
  const spacingVars = ba.spacing.scale.map(val => ({
    name: String(val), type: 'FLOAT' as const, value: val,
  }));

  // Radius
  const radiusVars = Object.entries(ba.radius.values).map(([name, val]) => ({
    name, type: 'FLOAT' as const, value: val,
  }));

  return {
    collections: [
      { name: 'Brand Colors', variables: brandColorVars },
      { name: 'Neutrals', variables: neutralVars },
      { name: 'Spacing', variables: spacingVars },
      { name: 'Radius', variables: radiusVars },
    ],
  };
}

/**
 * Transform BrandAnalysis typography into ODS-5 text styles input.
 */
export function brandAnalysisToTextStyles(ba: BrandAnalysis) {
  const { headingFont, bodyFont, styles } = ba.typography;

  return {
    styles: [
      { name: 'DS/Display',    fontFamily: headingFont, fontSize: styles.display.size, fontWeight: styles.display.weight, lineHeight: styles.display.lineHeight, letterSpacing: styles.display.letterSpacing },
      { name: 'DS/H1',         fontFamily: headingFont, fontSize: styles.h1.size,      fontWeight: styles.h1.weight,      lineHeight: styles.h1.lineHeight,      letterSpacing: styles.h1.letterSpacing },
      { name: 'DS/H2',         fontFamily: headingFont, fontSize: styles.h2.size,      fontWeight: styles.h2.weight,      lineHeight: styles.h2.lineHeight,      letterSpacing: styles.h2.letterSpacing },
      { name: 'DS/H3',         fontFamily: headingFont, fontSize: styles.h3.size,      fontWeight: styles.h3.weight,      lineHeight: styles.h3.lineHeight,      letterSpacing: styles.h3.letterSpacing },
      { name: 'DS/Body Large', fontFamily: bodyFont,    fontSize: styles.bodyLg.size,  fontWeight: styles.bodyLg.weight,  lineHeight: styles.bodyLg.lineHeight,  letterSpacing: styles.bodyLg.letterSpacing },
      { name: 'DS/Body',       fontFamily: bodyFont,    fontSize: styles.body.size,    fontWeight: styles.body.weight,    lineHeight: styles.body.lineHeight,    letterSpacing: styles.body.letterSpacing },
      { name: 'DS/Body Small', fontFamily: bodyFont,    fontSize: styles.bodySm.size,  fontWeight: styles.bodySm.weight,  lineHeight: styles.bodySm.lineHeight,  letterSpacing: styles.bodySm.letterSpacing },
      { name: 'DS/Caption',    fontFamily: bodyFont,    fontSize: styles.caption.size,  fontWeight: styles.caption.weight, lineHeight: styles.caption.lineHeight, letterSpacing: styles.caption.letterSpacing },
    ],
  };
}

/**
 * Assemble ODS-6a component config from pipeline artifacts + BrandAnalysis.
 */
export function assembleComponentConfig(
  variableResults: Record<string, unknown>,
  textStyleResults: Record<string, unknown>,
  ba: BrandAnalysis,
) {
  // Build variable ID lookup from ODS-4 results
  const varIdMap: Record<string, string> = {};
  const collections = (variableResults.collections || []) as Array<{
    variables: Array<{ id: string; name: string }>;
  }>;
  for (const coll of collections) {
    for (const v of coll.variables || []) {
      varIdMap[v.name] = v.id;
    }
  }

  // Build text style ID lookup from ODS-5 results
  const styleIdMap: Record<string, string> = {};
  const styles = (textStyleResults.styles || []) as Array<{ id: string; name: string }>;
  for (const s of styles) {
    styleIdMap[s.name] = s.id;
  }

  const { headingFont, bodyFont } = ba.typography;

  return {
    components: [
      {
        type: 'button',
        name: 'DS/Button',
        fillColor: ba.colors.primary,
        textColor: '#FFFFFF',
        fontFamily: bodyFont,
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 24,
        text: 'Button',
        cornerRadius: ba.radius.default,
        padding: { top: 16, right: 48, bottom: 16, left: 48 },
        itemSpacing: 8,
        textStyleId: styleIdMap['DS/Body'] || undefined,
        fillVariableId: varIdMap['primary/500'] || undefined,
      },
      {
        type: 'card',
        name: 'DS/Card',
        fillColor: ba.colors.surface,
        textColor: ba.colors.text,
        fontFamily: headingFont,
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 30,
        text: 'Card Title',
        cornerRadius: ba.radius.values.lg || 12,
        padding: { top: 32, right: 32, bottom: 32, left: 32 },
        itemSpacing: 16,
        width: 320,
        textStyleId: styleIdMap['DS/H3'] || undefined,
        fillVariableId: varIdMap['surface'] || undefined,
        children: [
          {
            text: 'Card Title',
            fontFamily: headingFont,
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 30,
            textColor: ba.colors.text,
            textStyleId: styleIdMap['DS/H3'] || undefined,
          },
          {
            text: 'Card description text goes here.',
            fontFamily: bodyFont,
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
            textColor: ba.colors.text,
            textStyleId: styleIdMap['DS/Body'] || undefined,
          },
        ],
      },
      {
        type: 'badge',
        name: 'DS/Badge',
        fillColor: ba.colors.accent,
        textColor: '#FFFFFF',
        fontFamily: bodyFont,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 17,
        text: 'Badge',
        cornerRadius: 9999,
        padding: { top: 4, right: 12, bottom: 4, left: 12 },
        itemSpacing: 0,
        textStyleId: styleIdMap['DS/Caption'] || undefined,
        fillVariableId: varIdMap['accent/500'] || undefined,
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// MCP TOOL REGISTRATION
// ═══════════════════════════════════════════════════════════════

// Schema uses z.any() for the BrandAnalysis to avoid TS2589 — validated at runtime
export const generateDSSchema = {
  brandAnalysis: z.any().describe('Full BrandAnalysis JSON from analyze_brief tool. Contains colors, typography, spacing, radius, and brand identity.'),
};

export function registerDSPipelineTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  server.tool(
    'generate_design_system_in_figma',
    'One-click Design System generation from BrandAnalysis JSON. Creates variable collections, text styles, and components in Figma.',
    generateDSSchema,
    async (params) => handleGenerateDS(params as { brandAnalysis: BrandAnalysis }, sendDesignCommand),
  );
}

async function handleGenerateDS(
  params: { brandAnalysis: BrandAnalysis },
  sendDesignCommand: SendDesignCommand,
) {
  const ba = params.brandAnalysis;
  const startTime = Date.now();
  const stepResults: Record<string, unknown> = {};
  const errors: Array<{ step: string; error: string }> = [];

  // ── Step 1: Variables (ODS-4) ────────────────────────────────
  let variableResult: Record<string, unknown> = {};
  try {
    const collectionsInput = brandAnalysisToCollections(ba);
    variableResult = await sendDesignCommand('create_variable_collections', collectionsInput);
    stepResults.variables = {
      success: true,
      collectionsProcessed: variableResult.collectionsProcessed,
      totalVariablesCreated: variableResult.totalVariablesCreated,
    };
  } catch (err) {
    errors.push({ step: 'variables', error: (err as Error).message });
    stepResults.variables = { success: false, error: (err as Error).message };
  }

  // ── Step 2: Text Styles (ODS-5) ─────────────────────────────
  let textStyleResult: Record<string, unknown> = {};
  try {
    const stylesInput = brandAnalysisToTextStyles(ba);
    textStyleResult = await sendDesignCommand('create_text_styles', stylesInput);
    stepResults.textStyles = {
      success: true,
      stylesCreated: textStyleResult.stylesCreated,
    };
  } catch (err) {
    errors.push({ step: 'textStyles', error: (err as Error).message });
    stepResults.textStyles = { success: false, error: (err as Error).message };
  }

  // ── Step 3: Components (ODS-6a) ─────────────────────────────
  let componentResult: Record<string, unknown> = {};
  try {
    const componentInput = assembleComponentConfig(variableResult, textStyleResult, ba);
    componentResult = await sendDesignCommand('create_ds_components', componentInput);
    stepResults.components = {
      success: true,
      componentsCreated: componentResult.componentsCreated,
    };
  } catch (err) {
    errors.push({ step: 'components', error: (err as Error).message });
    stepResults.components = { success: false, error: (err as Error).message };
  }

  // ── Step 4: Visual DS Showcase ─────────────────────────────
  let showcaseResult: Record<string, unknown> = {};
  try {
    showcaseResult = await sendDesignCommand('create_ds_showcase', {
      brandName: ba.brandName,
      colors: ba.colors,
      typography: {
        headingFont: ba.typography.headingFont,
        bodyFont: ba.typography.bodyFont,
        headingWeight: ba.typography.headingWeight,
        bodyWeight: ba.typography.bodyWeight,
      },
      spacing: ba.spacing,
      radius: ba.radius,
      icons: ['home', 'search', 'settings', 'user', 'mail', 'phone', 'star', 'heart', 'zap', 'shield', 'globe', 'camera'],
    });
    stepResults.showcase = { success: true, showcaseId: showcaseResult.showcaseId };

    // DQ-HF-1: record for sibling-frame warning window
    if (typeof showcaseResult.showcaseId === 'string' && typeof showcaseResult.width === 'number') {
      recordShowcase(showcaseResult.showcaseId, showcaseResult.width);
    }

    // Populate icon grid
    const iconGridId = showcaseResult.iconGridId as string;
    const iconNames = (showcaseResult.icons || []) as string[];
    if (iconGridId && iconNames.length > 0) {
      for (const iconName of iconNames) {
        try {
          await sendDesignCommand('create_icon', { name: iconName, size: 24, color: ba.colors.primary, parentId: iconGridId });
        } catch { /* non-critical */ }
      }
    }
  } catch (err) {
    errors.push({ step: 'showcase', error: (err as Error).message });
    stepResults.showcase = { success: false, error: (err as Error).message };
  }

  // ── Step 5: Post-generation ──────────────────────────────────
  try {
    await sendDesignCommand('save-ds-toggle', { enabled: true });
  } catch { /* Non-critical */ }

  try {
    await sendDesignCommand('read_figma_context', {});
  } catch { /* Non-critical */ }

  const totalTime = Date.now() - startTime;

  // Build summary
  const summary = {
    success: errors.length === 0,
    brandName: ba.brandName,
    totalTimeMs: totalTime,
    totalTimeSeconds: Math.round(totalTime / 1000),
    steps: stepResults,
    artifacts: {
      variables: {
        count: (variableResult.totalVariablesCreated as number) || 0,
        collections: ((variableResult.collections || []) as Array<{ collectionId: string; collectionName: string }>)
          .map(c => ({ id: c.collectionId, name: c.collectionName })),
      },
      textStyles: {
        count: (textStyleResult.stylesCreated as number) || 0,
        styles: ((textStyleResult.styles || []) as Array<{ id: string; name: string }>)
          .map(s => ({ id: s.id, name: s.name })),
      },
      components: {
        count: (componentResult.componentsCreated as number) || 0,
        components: ((componentResult.components || []) as Array<{ id: string; name: string }>)
          .map(c => ({ id: c.id, name: c.name })),
      },
    },
    ...(errors.length > 0 && { errors }),
  };

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(summary, null, 2),
    }],
  };
}
