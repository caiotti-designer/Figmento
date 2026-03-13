// ═══════════════════════════════════════════════════════════
// Analysis Tools: scan_frame_structure, design_system_preview, brand_consistency_check
// ═══════════════════════════════════════════════════════════

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';
import { getDesignSystemsDir } from '../utils/knowledge-paths';
import { scanFrameStructureSchema, designSystemPreviewSchema, brandConsistencyCheckSchema } from './ds-schemas';
import type { SendDesignCommand } from './ds-types';

function listAvailableSystems(): string[] {
  const dir = getDesignSystemsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

export function registerAnalysisTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  // ═══════════════════════════════════════════════════════════
  // DS-13: scan_frame_structure
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'scan_frame_structure',
    'Deep-scan a Figma frame and return its complete structure tree (types, positions, sizes, styles, text content, children). Enables clone+customize and template analysis workflows.',
    scanFrameStructureSchema,
    async (params) => {
      const data = await sendDesignCommand('scan_frame_structure', {
        nodeId: params.nodeId,
        depth: params.depth,
        include_styles: params.include_styles,
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-27: design_system_preview
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'design_system_preview',
    'Generate a visual design system swatch sheet on the Figma canvas. Creates a single preview frame showing all color tokens, typography scale, component samples, and spacing scale for the named design system.',
    designSystemPreviewSchema,
    async (params: { system: string; x?: number; y?: number }) => {
      const safeName = params.system.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');
      if (!fs.existsSync(tokensPath)) {
        const available = listAvailableSystems();
        throw new Error(`Design system not found: ${safeName}. Available: ${available.join(', ')}`);
      }
      const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(tokensContent) as Record<string, unknown>;

      const colors = (tokens.colors || {}) as Record<string, string>;
      const typography = (tokens.typography || {}) as Record<string, unknown>;
      const typographyScale = ((typography as Record<string, unknown>).scale || {}) as Record<string, number>;
      const headingFamily = ((typography as Record<string, Record<string, unknown>>).heading?.family || 'Inter') as string;
      const bodyFamily = ((typography as Record<string, Record<string, unknown>>).body?.family || 'Inter') as string;
      const spacingTokens = (tokens.spacing || {}) as Record<string, number>;
      const radiusTokens = (tokens.radius || {}) as Record<string, number>;

      const commands: Array<{ action: string; params: Record<string, unknown>; tempId?: string }> = [];
      let cmdIdx = 0;
      const uid = () => `p${cmdIdx++}`;

      // Color display order
      const colorOrder = [
        'primary', 'primary_light', 'primary_dark', 'secondary', 'accent',
        'surface', 'background', 'border', 'on_surface', 'on_surface_muted',
        'on_primary', 'success', 'warning', 'error', 'info',
      ].filter(k => k in colors);

      // Typography scale display order
      const typeOrder = ['display', 'h1', 'h2', 'h3', 'body_lg', 'body', 'body_sm', 'caption']
        .filter(k => k in typographyScale);

      // Spacing tokens (sorted ascending, excludes 'unit')
      const spacingOrder = Object.entries(spacingTokens)
        .filter(([k, v]) => k !== 'unit' && typeof v === 'number' && (v as number) > 0)
        .sort(([, a], [, b]) => (a as number) - (b as number))
        .map(([k, v]) => ({ key: k, value: v as number }));

      // Layout constants
      const FRAME_W = 1376;
      const FRAME_PAD = 48;
      const INNER_W = FRAME_W - FRAME_PAD * 2;
      const SECTION_GAP = 40;
      const SWATCH_SIZE = 64;
      const SWATCH_GAP = 16;
      const SWATCH_COL_W = SWATCH_SIZE + SWATCH_GAP;
      const TYPE_COL_W = 144;
      const BG_COLOR = colors.background || '#FFFFFF';
      const TEXT_COLOR = colors.on_surface || '#1A1A1A';
      const MUTED_COLOR = colors.on_surface_muted || '#888888';
      const PRIMARY_COLOR = colors.primary || '#6366F1';

      // Section layout helper — returns section header Y and advances cursor
      let curY = FRAME_PAD;

      function sectionHeader(label: string): { headerY: number } {
        const headerY = curY;
        curY += 28 + 16; // 28px header text + 16px gap
        return { headerY };
      }

      // === Root frame ===
      const rootId = uid();
      // Estimate total height
      const totalH = FRAME_PAD + 48 + SECTION_GAP
        + 28 + 16 + SWATCH_SIZE + 40 + SECTION_GAP   // colors
        + 28 + 16 + 80 + 36 + SECTION_GAP            // typography
        + 28 + 16 + 100 + SECTION_GAP                // components
        + 28 + 16 + 64 + 32 + FRAME_PAD;             // spacing
      commands.push({
        action: 'create_frame',
        params: {
          name: `${safeName} — Design System Preview`,
          width: FRAME_W,
          height: Math.max(totalH, 1200),
          x: params.x ?? 0,
          y: params.y ?? 0,
          fills: [{ type: 'SOLID', color: BG_COLOR }],
        },
        tempId: rootId,
      });

      // Title
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: safeName.toUpperCase() + ' Design System',
          name: 'Preview Title',
          fontSize: 24,
          fontFamily: headingFamily,
          fontWeight: 700,
          color: TEXT_COLOR,
          x: FRAME_PAD,
          y: curY,
          width: INNER_W,
          height: 36,
        },
      });
      curY += 36 + SECTION_GAP;

      // ── Row 1: Colors ──
      const { headerY: colorsHeaderY } = sectionHeader('COLORS');
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: 'COLORS',
          name: 'Section: Colors',
          fontSize: 11,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: MUTED_COLOR,
          letterSpacing: 2,
          x: FRAME_PAD,
          y: colorsHeaderY,
          width: INNER_W,
          height: 20,
        },
      });

      // Divider line
      const colorDivId = uid();
      commands.push({
        action: 'create_rectangle',
        params: {
          parentId: `$${rootId}`,
          name: 'Divider',
          width: INNER_W,
          height: 1,
          x: FRAME_PAD,
          y: colorsHeaderY + 24,
          fills: [{ type: 'SOLID', color: colors.border || '#E5E5E5' }],
        },
        tempId: colorDivId,
      });

      const swatchStartY = curY;
      let swatchX = FRAME_PAD;
      for (const colorKey of colorOrder) {
        const colorHex = colors[colorKey];
        // Swatch rectangle
        const swId = uid();
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${rootId}`,
            name: `Swatch: ${colorKey}`,
            width: SWATCH_SIZE,
            height: SWATCH_SIZE,
            x: swatchX,
            y: swatchStartY,
            cornerRadius: 8,
            fills: [{ type: 'SOLID', color: colorHex }],
          },
          tempId: swId,
        });
        // Hex label
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${rootId}`,
            text: colorHex.toUpperCase(),
            name: `Hex: ${colorKey}`,
            fontSize: 9,
            fontFamily: bodyFamily,
            fontWeight: 400,
            color: MUTED_COLOR,
            x: swatchX,
            y: swatchStartY + SWATCH_SIZE + 4,
            width: SWATCH_SIZE,
            height: 14,
            textAlign: 'CENTER',
          },
        });
        // Token name
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${rootId}`,
            text: colorKey,
            name: `Name: ${colorKey}`,
            fontSize: 9,
            fontFamily: bodyFamily,
            fontWeight: 600,
            color: TEXT_COLOR,
            x: swatchX,
            y: swatchStartY + SWATCH_SIZE + 20,
            width: SWATCH_SIZE,
            height: 14,
            textAlign: 'CENTER',
          },
        });
        swatchX += SWATCH_COL_W;
      }
      curY = swatchStartY + SWATCH_SIZE + 40 + SECTION_GAP;

      // ── Row 2: Typography ──
      const { headerY: typeHeaderY } = sectionHeader('TYPOGRAPHY');
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: 'TYPOGRAPHY',
          name: 'Section: Typography',
          fontSize: 11,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: MUTED_COLOR,
          letterSpacing: 2,
          x: FRAME_PAD,
          y: typeHeaderY,
          width: INNER_W,
          height: 20,
        },
      });
      const typeDivId = uid();
      commands.push({
        action: 'create_rectangle',
        params: {
          parentId: `$${rootId}`,
          name: 'Divider',
          width: INNER_W,
          height: 1,
          x: FRAME_PAD,
          y: typeHeaderY + 24,
          fills: [{ type: 'SOLID', color: colors.border || '#E5E5E5' }],
        },
        tempId: typeDivId,
      });

      const typeStartY = curY;
      let typeX = FRAME_PAD;
      for (const scaleKey of typeOrder) {
        const fontSize = typographyScale[scaleKey] as number;
        const displaySize = Math.min(fontSize, 48);
        const isHeading = ['display', 'h1', 'h2', 'h3'].includes(scaleKey);
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${rootId}`,
            text: 'Aa',
            name: `Type: ${scaleKey}`,
            fontSize: displaySize,
            fontFamily: isHeading ? headingFamily : bodyFamily,
            fontWeight: isHeading ? 700 : 400,
            color: TEXT_COLOR,
            x: typeX,
            y: typeStartY,
            width: TYPE_COL_W,
            height: 56,
          },
        });
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${rootId}`,
            text: `${scaleKey} / ${fontSize}px`,
            name: `Type label: ${scaleKey}`,
            fontSize: 9,
            fontFamily: bodyFamily,
            fontWeight: 400,
            color: MUTED_COLOR,
            x: typeX,
            y: typeStartY + 58,
            width: TYPE_COL_W,
            height: 14,
          },
        });
        typeX += TYPE_COL_W;
      }
      curY = typeStartY + 80 + SECTION_GAP;

      // ── Row 3: Component Samples ──
      const { headerY: compHeaderY } = sectionHeader('COMPONENTS');
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: 'COMPONENTS',
          name: 'Section: Components',
          fontSize: 11,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: MUTED_COLOR,
          letterSpacing: 2,
          x: FRAME_PAD,
          y: compHeaderY,
          width: INNER_W,
          height: 20,
        },
      });
      const compDivId = uid();
      commands.push({
        action: 'create_rectangle',
        params: {
          parentId: `$${rootId}`,
          name: 'Divider',
          width: INNER_W,
          height: 1,
          x: FRAME_PAD,
          y: compHeaderY + 24,
          fills: [{ type: 'SOLID', color: colors.border || '#E5E5E5' }],
        },
        tempId: compDivId,
      });

      const compStartY = curY;
      const mdRadius = radiusTokens.md || 8;
      const lgRadius = radiusTokens.lg || 12;

      // Button (primary)
      const btnId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${rootId}`,
          name: 'Component: Button (primary)',
          width: 144,
          height: 40,
          x: FRAME_PAD,
          y: compStartY,
          cornerRadius: mdRadius,
          fills: [{ type: 'SOLID', color: PRIMARY_COLOR }],
          layoutMode: 'HORIZONTAL',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
        },
        tempId: btnId,
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${btnId}`,
          text: 'Button',
          fontSize: 14,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: colors.on_primary || '#FFFFFF',
          width: 120,
          height: 20,
          textAlign: 'CENTER',
        },
      });

      // Badge
      const badgeId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${rootId}`,
          name: 'Component: Badge',
          width: 80,
          height: 24,
          x: FRAME_PAD + 160,
          y: compStartY + 8,
          cornerRadius: 12,
          fills: [{ type: 'SOLID', color: colors.primary_light || PRIMARY_COLOR }],
          layoutMode: 'HORIZONTAL',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
        },
        tempId: badgeId,
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${badgeId}`,
          text: 'Badge',
          fontSize: 11,
          fontFamily: bodyFamily,
          fontWeight: 600,
          color: PRIMARY_COLOR,
          width: 60,
          height: 16,
          textAlign: 'CENTER',
        },
      });

      // Card placeholder
      const cardId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${rootId}`,
          name: 'Component: Card',
          width: 220,
          height: 100,
          x: FRAME_PAD + 280,
          y: compStartY,
          cornerRadius: lgRadius,
          fills: [{ type: 'SOLID', color: colors.surface || '#FFFFFF' }],
          layoutMode: 'VERTICAL',
          itemSpacing: 8,
          paddingTop: 16,
          paddingBottom: 16,
          paddingLeft: 16,
          paddingRight: 16,
        },
        tempId: cardId,
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${cardId}`,
          text: 'Card Title',
          fontSize: 14,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: TEXT_COLOR,
          width: 188,
          height: 20,
        },
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${cardId}`,
          text: 'Card body content goes here.',
          fontSize: 12,
          fontFamily: bodyFamily,
          fontWeight: 400,
          color: MUTED_COLOR,
          width: 188,
          height: 32,
        },
      });
      curY = compStartY + 100 + SECTION_GAP;

      // ── Row 4: Spacing Scale ──
      const { headerY: spacingHeaderY } = sectionHeader('SPACING');
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: 'SPACING',
          name: 'Section: Spacing',
          fontSize: 11,
          fontFamily: headingFamily,
          fontWeight: 600,
          color: MUTED_COLOR,
          letterSpacing: 2,
          x: FRAME_PAD,
          y: spacingHeaderY,
          width: INNER_W,
          height: 20,
        },
      });
      const spacingDivId = uid();
      commands.push({
        action: 'create_rectangle',
        params: {
          parentId: `$${rootId}`,
          name: 'Divider',
          width: INNER_W,
          height: 1,
          x: FRAME_PAD,
          y: spacingHeaderY + 24,
          fills: [{ type: 'SOLID', color: colors.border || '#E5E5E5' }],
        },
        tempId: spacingDivId,
      });

      const spacingStartY = curY;
      const MAX_BAR_H = 48;
      const maxSpacingVal = Math.max(...spacingOrder.map(s => s.value), 1);
      let spX = FRAME_PAD;
      for (const { key, value } of spacingOrder) {
        const barH = Math.max(4, Math.round((value / maxSpacingVal) * MAX_BAR_H));
        const barW = 32;
        const barSpId = uid();
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${rootId}`,
            name: `Spacing: ${key}`,
            width: barW,
            height: barH,
            x: spX,
            y: spacingStartY + (MAX_BAR_H - barH),
            fills: [{ type: 'SOLID', color: PRIMARY_COLOR }],
            cornerRadius: 3,
          },
          tempId: barSpId,
        });
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${rootId}`,
            text: `${key}\n${value}px`,
            name: `Spacing label: ${key}`,
            fontSize: 9,
            fontFamily: bodyFamily,
            fontWeight: 400,
            color: MUTED_COLOR,
            x: spX,
            y: spacingStartY + MAX_BAR_H + 4,
            width: barW + 12,
            height: 28,
            textAlign: 'CENTER',
          },
        });
        spX += barW + 16;
      }

      // Execute
      const data = await sendDesignCommand('batch_execute', { commands });
      const results = (data as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined;
      const rootNodeId = results?.[0]?.nodeId || results?.[0]?.id || 'unknown';

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            nodeId: rootNodeId,
            system: safeName,
            sections: ['colors', 'typography', 'components', 'spacing'],
            colorCount: colorOrder.length,
            typeScaleCount: typeOrder.length,
            spacingTokenCount: spacingOrder.length,
            totalCommands: commands.length,
          }, null, 2),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // DS-28: brand_consistency_check
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'brand_consistency_check',
    'Check if one or two Figma frames are brand-consistent by comparing the colors and fonts used against a design system. Returns a score (0–100), list of issues, and a consistent boolean.',
    brandConsistencyCheckSchema,
    async (params: { nodeId: string; nodeId2?: string; system: string }) => {
      // Load design system tokens
      const safeName = params.system.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');
      if (!fs.existsSync(tokensPath)) {
        const available = listAvailableSystems();
        throw new Error(`Design system not found: ${safeName}. Available: ${available.join(', ')}`);
      }
      const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(tokensContent) as Record<string, unknown>;

      const systemColors = Object.values((tokens.colors || {}) as Record<string, string>).map(c => c.toLowerCase());
      const headingFont = (((tokens.typography as Record<string, unknown> || {}).heading as Record<string, string>)?.family || '').toLowerCase();
      const bodyFont = (((tokens.typography as Record<string, unknown> || {}).body as Record<string, string>)?.family || '').toLowerCase();
      const systemFonts = [headingFont, bodyFont].filter(Boolean);

      // Scan both frames
      const scan1Raw = await sendDesignCommand('scan_frame_structure', { nodeId: params.nodeId, depth: 6, include_styles: true });
      const scan2Raw = params.nodeId2
        ? await sendDesignCommand('scan_frame_structure', { nodeId: params.nodeId2, depth: 6, include_styles: true })
        : null;

      // Extract colors and fonts from a scan_frame_structure response
      function extractFromScan(scan: Record<string, unknown>): { colors: string[]; fonts: string[] } {
        const colors = new Set<string>();
        const fonts = new Set<string>();

        function traverse(node: unknown): void {
          if (!node || typeof node !== 'object') return;
          const n = node as Record<string, unknown>;

          // fills array (from scan_frame_structure style data)
          if (Array.isArray(n.fills)) {
            for (const fill of n.fills) {
              if (!fill || typeof fill !== 'object') continue;
              const f = fill as Record<string, unknown>;
              const hex = (f.hex || f.color || f.value) as string | undefined;
              if (hex && typeof hex === 'string' && hex.startsWith('#')) {
                colors.add(hex.toLowerCase());
              }
            }
          }
          // Direct color fields on text nodes
          if (n.color && typeof n.color === 'string' && (n.color as string).startsWith('#')) {
            colors.add((n.color as string).toLowerCase());
          }

          // Font family
          if (n.fontFamily && typeof n.fontFamily === 'string') fonts.add((n.fontFamily as string).toLowerCase());
          if (n.fontName && typeof n.fontName === 'object') {
            const fn = n.fontName as Record<string, string>;
            if (fn.family) fonts.add(fn.family.toLowerCase());
          }

          // Recurse
          for (const key of ['children', 'elements', 'nodes']) {
            if (Array.isArray(n[key])) {
              for (const child of n[key] as unknown[]) traverse(child);
            }
          }
        }

        traverse(scan);
        return { colors: [...colors], fonts: [...fonts] };
      }

      const s1 = extractFromScan(scan1Raw as Record<string, unknown>);
      const s2 = scan2Raw ? extractFromScan(scan2Raw as Record<string, unknown>) : null;

      const issues: string[] = [];
      let score = 100;

      // Normalize hex for comparison
      const normalizeHex = (h: string) => h.replace('#', '').toLowerCase();
      const matchesSystem = (hex: string) =>
        systemColors.some(sc => normalizeHex(sc) === normalizeHex(hex));

      // Frame 1 color check
      const badColors1 = s1.colors.filter(c => !matchesSystem(c));
      if (badColors1.length > 0) {
        issues.push(`Frame 1: ${badColors1.length} color(s) not in "${safeName}" design system (e.g. ${badColors1.slice(0, 3).join(', ')})`);
        score -= Math.min(35, badColors1.length * 5);
      }

      // Frame 1 font check
      const matchesFont = (f: string) => systemFonts.some(sf => f === sf || f.includes(sf) || sf.includes(f));
      const badFonts1 = s1.fonts.filter(f => !matchesFont(f));
      if (badFonts1.length > 0) {
        issues.push(`Frame 1: font(s) not in design system — found "${badFonts1.join('", "')}", expected "${systemFonts.join('", "')}"`);
        score -= Math.min(20, badFonts1.length * 10);
      }

      if (s2) {
        // Frame 2 color check
        const badColors2 = s2.colors.filter(c => !matchesSystem(c));
        if (badColors2.length > 0) {
          issues.push(`Frame 2: ${badColors2.length} color(s) not in "${safeName}" design system (e.g. ${badColors2.slice(0, 3).join(', ')})`);
          score -= Math.min(25, badColors2.length * 4);
        }

        // Frame 2 font check
        const badFonts2 = s2.fonts.filter(f => !matchesFont(f));
        if (badFonts2.length > 0) {
          issues.push(`Frame 2: font(s) not in design system — found "${badFonts2.join('", "')}", expected "${systemFonts.join('", "')}"`);
          score -= Math.min(10, badFonts2.length * 5);
        }

        // Cross-frame font consistency
        const commonFonts = s1.fonts.filter(f => s2.fonts.includes(f));
        if (s1.fonts.length > 0 && s2.fonts.length > 0 && commonFonts.length === 0) {
          issues.push('Frames use entirely different fonts — cross-frame inconsistency');
          score -= 10;
        }
      }

      score = Math.max(0, Math.min(100, score));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            consistent: score >= 80,
            score,
            system: safeName,
            frame1: {
              nodeId: params.nodeId,
              colorsFound: s1.colors.length,
              fontsFound: s1.fonts,
              unknownColors: s1.colors.filter(c => !matchesSystem(c)),
            },
            ...(s2 ? {
              frame2: {
                nodeId: params.nodeId2,
                colorsFound: s2.colors.length,
                fontsFound: s2.fonts,
                unknownColors: s2.colors.filter(c => !matchesSystem(c)),
              },
            } : {}),
            systemTokens: {
              colors: systemColors,
              fonts: systemFonts,
            },
            issues,
          }, null, 2),
        }],
      };
    }
  );
}
