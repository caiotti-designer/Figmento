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
    'Deep-scan a Figma frame and return its complete structure tree with types, positions, sizes, styles, and text content.',
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
  // Fully auto-layout driven — every frame HUGs content vertically.
  // No fixed heights, no absolute positioning, no cursor math.
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'design_system_preview',
    'Generate a visual design system preview frame showing color tokens, typography, component samples, and spacing. Uses nested auto-layout with HUG sizing throughout — sections never overlap and never clip content.',
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

      // ── Token ordering (filtered to what exists) ──
      const colorOrder = [
        'primary', 'primary_light', 'primary_dark', 'secondary', 'accent',
        'surface', 'background', 'border', 'on_surface', 'on_surface_muted',
        'on_primary', 'success', 'warning', 'error', 'info',
      ].filter(k => k in colors);

      const typeOrder = ['display', 'h1', 'h2', 'h3', 'body_lg', 'body', 'body_sm', 'caption']
        .filter(k => k in typographyScale);

      const spacingOrder = Object.entries(spacingTokens)
        .filter(([k, v]) => k !== 'unit' && typeof v === 'number' && (v as number) > 0)
        .sort(([, a], [, b]) => (a as number) - (b as number))
        .map(([k, v]) => ({ key: k, value: v as number }));

      // ── Design constants ──
      const FRAME_W = 1376;
      const FRAME_PAD = 48;
      const SECTION_GAP = 48;
      const SWATCH_SIZE = 64;
      const SWATCH_COL_W = 80;   // swatch + label breathing room
      const SWATCH_GAP = 16;
      const TYPE_COL_W = 144;
      const TYPE_COL_GAP = 16;
      const BG_COLOR = colors.background || '#FFFFFF';
      const TEXT_COLOR = colors.on_surface || '#1A1A1A';
      const MUTED_COLOR = colors.on_surface_muted || '#888888';
      const PRIMARY_COLOR = colors.primary || '#6366F1';
      const BORDER_COLOR = colors.border || '#E5E5E5';

      // ── Helpers ──

      // Build a section frame: VERTICAL auto-layout, FILL width, HUG height.
      // Contains a header text, a 1px divider, and a content child added later.
      function pushSectionFrame(label: string, parentId: string, tempId: string, contentSpacing: number): void {
        commands.push({
          action: 'create_frame',
          params: {
            parentId,
            name: `Section: ${label}`,
            layoutMode: 'VERTICAL',
            layoutSizingHorizontal: 'FILL',
            layoutSizingVertical: 'HUG',
            itemSpacing: contentSpacing,
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            paddingRight: 0,
            fills: [],
          },
          tempId,
        });
        // Section header (short label — WIDTH_AND_HEIGHT so it never wraps / never fixed-width)
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${tempId}`,
            text: label.toUpperCase(),
            name: `Section header: ${label}`,
            fontSize: 11,
            fontFamily: headingFamily,
            fontWeight: 700,
            color: MUTED_COLOR,
            letterSpacing: 2,
            textAutoResize: 'WIDTH_AND_HEIGHT',
          },
        });
        // Divider — 1px tall, stretches full width of parent section
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${tempId}`,
            name: 'Divider',
            layoutMode: 'HORIZONTAL',
            layoutSizingHorizontal: 'FILL',
            layoutSizingVertical: 'FIXED',
            height: 1,
            fills: [{ type: 'SOLID', color: BORDER_COLOR }],
          },
        });
      }

      // ═══════════════════════════════════════════════════════════
      // Root Frame — VERTICAL auto-layout, HUG height
      // ═══════════════════════════════════════════════════════════
      const rootId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          name: `${safeName} — Design System Preview`,
          width: FRAME_W,
          x: params.x ?? 0,
          y: params.y ?? 0,
          layoutMode: 'VERTICAL',
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          paddingTop: FRAME_PAD,
          paddingBottom: FRAME_PAD,
          paddingLeft: FRAME_PAD,
          paddingRight: FRAME_PAD,
          itemSpacing: SECTION_GAP,
          fills: [{ type: 'SOLID', color: BG_COLOR }],
        },
        tempId: rootId,
      });

      // ── Title ──
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${rootId}`,
          text: `${safeName.toUpperCase()} · DESIGN SYSTEM`,
          name: 'Preview Title',
          fontSize: 28,
          fontFamily: headingFamily,
          fontWeight: 700,
          color: TEXT_COLOR,
          letterSpacing: 1,
          textAutoResize: 'WIDTH_AND_HEIGHT',
        },
      });

      // ═══════════════════════════════════════════════════════════
      // Section: Colors
      // ═══════════════════════════════════════════════════════════
      const colorsSectionId = uid();
      pushSectionFrame('Colors', `$${rootId}`, colorsSectionId, 20);

      // Swatches row — HORIZONTAL auto-layout, WRAP, FILL width, HUG height
      const colorsRowId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${colorsSectionId}`,
          name: 'Swatches Row',
          layoutMode: 'HORIZONTAL',
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutWrap: 'WRAP',
          itemSpacing: SWATCH_GAP,
          counterAxisSpacing: SWATCH_GAP,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          paddingRight: 0,
          fills: [],
        },
        tempId: colorsRowId,
      });

      for (const colorKey of colorOrder) {
        const colorHex = colors[colorKey];
        // Swatch column: VERTICAL, FIXED width, HUG height
        const swColId = uid();
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${colorsRowId}`,
            name: `Swatch column: ${colorKey}`,
            layoutMode: 'VERTICAL',
            layoutSizingHorizontal: 'FIXED',
            layoutSizingVertical: 'HUG',
            width: SWATCH_COL_W,
            itemSpacing: 6,
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            paddingRight: 0,
            counterAxisAlignItems: 'CENTER',
            fills: [],
          },
          tempId: swColId,
        });
        // Swatch chip: fixed 64x64 with color fill
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${swColId}`,
            name: `Swatch: ${colorKey}`,
            layoutMode: 'NONE',
            width: SWATCH_SIZE,
            height: SWATCH_SIZE,
            cornerRadius: 8,
            fills: [{ type: 'SOLID', color: colorHex }],
          },
        });
        // Token name (WIDTH_AND_HEIGHT — short label, no wrap)
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${swColId}`,
            text: colorKey,
            name: `Name: ${colorKey}`,
            fontSize: 10,
            fontFamily: bodyFamily,
            fontWeight: 700,
            color: TEXT_COLOR,
            textAutoResize: 'WIDTH_AND_HEIGHT',
          },
        });
        // Hex value (WIDTH_AND_HEIGHT)
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${swColId}`,
            text: colorHex.toUpperCase(),
            name: `Hex: ${colorKey}`,
            fontSize: 9,
            fontFamily: bodyFamily,
            fontWeight: 400,
            color: MUTED_COLOR,
            textAutoResize: 'WIDTH_AND_HEIGHT',
          },
        });
      }

      // ═══════════════════════════════════════════════════════════
      // Section: Typography
      // ═══════════════════════════════════════════════════════════
      const typeSectionId = uid();
      pushSectionFrame('Typography', `$${rootId}`, typeSectionId, 24);

      // Type row — HORIZONTAL wrap
      const typeRowId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${typeSectionId}`,
          name: 'Type Row',
          layoutMode: 'HORIZONTAL',
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutWrap: 'WRAP',
          itemSpacing: TYPE_COL_GAP,
          counterAxisSpacing: 24,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          paddingRight: 0,
          counterAxisAlignItems: 'MAX',
          fills: [],
        },
        tempId: typeRowId,
      });

      for (const scaleKey of typeOrder) {
        const fontSize = typographyScale[scaleKey] as number;
        const displaySize = Math.min(fontSize, 56);
        const isHeading = ['display', 'h1', 'h2', 'h3'].includes(scaleKey);
        // Type column: VERTICAL, FIXED width (keeps the Aa specimen aligned), HUG height
        const typeColId = uid();
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${typeRowId}`,
            name: `Type column: ${scaleKey}`,
            layoutMode: 'VERTICAL',
            layoutSizingHorizontal: 'FIXED',
            layoutSizingVertical: 'HUG',
            width: TYPE_COL_W,
            itemSpacing: 8,
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            paddingRight: 0,
            counterAxisAlignItems: 'MIN',
            fills: [],
          },
          tempId: typeColId,
        });
        // Specimen — wraps to column width, HUG height so tall fonts grow naturally
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${typeColId}`,
            text: 'Aa',
            name: `Type: ${scaleKey}`,
            fontSize: displaySize,
            fontFamily: isHeading ? headingFamily : bodyFamily,
            fontWeight: isHeading ? 700 : 400,
            color: TEXT_COLOR,
            layoutSizingHorizontal: 'FILL',
            textAutoResize: 'HEIGHT',
          },
        });
        // Label — short, WIDTH_AND_HEIGHT
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${typeColId}`,
            text: `${scaleKey} · ${fontSize}px`,
            name: `Type label: ${scaleKey}`,
            fontSize: 10,
            fontFamily: bodyFamily,
            fontWeight: 400,
            color: MUTED_COLOR,
            letterSpacing: 0.5,
            textAutoResize: 'WIDTH_AND_HEIGHT',
          },
        });
      }

      // ═══════════════════════════════════════════════════════════
      // Section: Components
      // ═══════════════════════════════════════════════════════════
      const compSectionId = uid();
      pushSectionFrame('Components', `$${rootId}`, compSectionId, 24);

      const mdRadius = radiusTokens.md || 8;
      const lgRadius = radiusTokens.lg || 12;

      // Components row — HORIZONTAL, HUG width, HUG height, aligned center
      const compRowId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${compSectionId}`,
          name: 'Components Row',
          layoutMode: 'HORIZONTAL',
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          itemSpacing: 32,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 0,
          paddingRight: 0,
          counterAxisAlignItems: 'CENTER',
          fills: [],
        },
        tempId: compRowId,
      });

      // Button — HUG × HUG, proper padding
      const btnId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${compRowId}`,
          name: 'Component: Button (primary)',
          layoutMode: 'HORIZONTAL',
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 24,
          paddingRight: 24,
          cornerRadius: mdRadius,
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          fills: [{ type: 'SOLID', color: PRIMARY_COLOR }],
        },
        tempId: btnId,
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${btnId}`,
          text: 'Primary Button',
          fontSize: 14,
          fontFamily: headingFamily,
          fontWeight: 700,
          color: colors.on_primary || '#FFFFFF',
          letterSpacing: 0.5,
          textAutoResize: 'WIDTH_AND_HEIGHT',
        },
      });

      // Badge — HUG × HUG, pill shape
      const badgeId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${compRowId}`,
          name: 'Component: Badge',
          layoutMode: 'HORIZONTAL',
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 14,
          paddingRight: 14,
          cornerRadius: 9999,
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          fills: [{ type: 'SOLID', color: colors.accent || colors.primary_light || PRIMARY_COLOR }],
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
          fontWeight: 700,
          color: colors.on_primary || '#FFFFFF',
          letterSpacing: 0.5,
          textAutoResize: 'WIDTH_AND_HEIGHT',
        },
      });

      // Card — FIXED width, HUG height, auto-layout for padding + content
      const cardId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${compRowId}`,
          name: 'Component: Card',
          layoutMode: 'VERTICAL',
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          width: 260,
          itemSpacing: 8,
          paddingTop: 20,
          paddingBottom: 20,
          paddingLeft: 20,
          paddingRight: 20,
          cornerRadius: lgRadius,
          fills: [{ type: 'SOLID', color: colors.surface || '#FFFFFF' }],
          strokes: [{ type: 'SOLID', color: BORDER_COLOR }],
          strokeWeight: 1,
        },
        tempId: cardId,
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${cardId}`,
          text: 'Card Title',
          fontSize: 16,
          fontFamily: headingFamily,
          fontWeight: 700,
          color: TEXT_COLOR,
          layoutSizingHorizontal: 'FILL',
          textAutoResize: 'HEIGHT',
        },
      });
      commands.push({
        action: 'create_text',
        params: {
          parentId: `$${cardId}`,
          text: 'Card body content demonstrates surface + text tokens.',
          fontSize: 12,
          fontFamily: bodyFamily,
          fontWeight: 400,
          color: MUTED_COLOR,
          layoutSizingHorizontal: 'FILL',
          textAutoResize: 'HEIGHT',
        },
      });

      // ═══════════════════════════════════════════════════════════
      // Section: Spacing
      // ═══════════════════════════════════════════════════════════
      const spacingSectionId = uid();
      pushSectionFrame('Spacing', `$${rootId}`, spacingSectionId, 20);

      // Spacing row — HORIZONTAL, FILL width, HUG height, counterAxis MAX (bars bottom-aligned)
      const spacingRowId = uid();
      commands.push({
        action: 'create_frame',
        params: {
          parentId: `$${spacingSectionId}`,
          name: 'Spacing Row',
          layoutMode: 'HORIZONTAL',
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          itemSpacing: 20,
          paddingTop: 8,
          paddingBottom: 0,
          paddingLeft: 0,
          paddingRight: 0,
          counterAxisAlignItems: 'MAX',
          fills: [],
        },
        tempId: spacingRowId,
      });

      const MAX_BAR_H = 72;
      const BAR_W = 32;
      const maxSpacingVal = Math.max(...spacingOrder.map(s => s.value), 1);
      for (const { key, value } of spacingOrder) {
        const barH = Math.max(4, Math.round((value / maxSpacingVal) * MAX_BAR_H));
        // Column: VERTICAL, HUG, center-aligned
        const colId = uid();
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${spacingRowId}`,
            name: `Spacing column: ${key}`,
            layoutMode: 'VERTICAL',
            layoutSizingHorizontal: 'HUG',
            layoutSizingVertical: 'HUG',
            itemSpacing: 8,
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            paddingRight: 0,
            counterAxisAlignItems: 'CENTER',
            fills: [],
          },
          tempId: colId,
        });
        // Bar slot — FIXED height (MAX_BAR_H), inner bar bottom-aligned
        const slotId = uid();
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${colId}`,
            name: `Bar slot: ${key}`,
            layoutMode: 'VERTICAL',
            layoutSizingHorizontal: 'FIXED',
            layoutSizingVertical: 'FIXED',
            width: BAR_W,
            height: MAX_BAR_H,
            primaryAxisAlignItems: 'MAX',
            counterAxisAlignItems: 'CENTER',
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            paddingRight: 0,
            fills: [],
          },
          tempId: slotId,
        });
        // Bar (fixed dims, this is the only place we legitimately use fixed sizing — it IS the viz)
        commands.push({
          action: 'create_frame',
          params: {
            parentId: `$${slotId}`,
            name: `Bar: ${key}`,
            layoutMode: 'NONE',
            width: BAR_W,
            height: barH,
            cornerRadius: 3,
            fills: [{ type: 'SOLID', color: PRIMARY_COLOR }],
          },
        });
        // Label
        commands.push({
          action: 'create_text',
          params: {
            parentId: `$${colId}`,
            text: `${key}\n${value}`,
            name: `Spacing label: ${key}`,
            fontSize: 10,
            fontFamily: bodyFamily,
            fontWeight: 400,
            color: MUTED_COLOR,
            textAlign: 'CENTER',
            textAutoResize: 'WIDTH_AND_HEIGHT',
          },
        });
      }

      // ═══════════════════════════════════════════════════════════
      // Execute
      // ═══════════════════════════════════════════════════════════
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
            layout: 'nested-auto-layout-hug',
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
    'Check brand consistency of Figma frames against a design system. Returns score (0-100) and issues.',
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
