/// <reference types="@figma/plugin-typings" />

import { rgbToHex } from '../color-utils';
import type { DiscoveredComponent, DesignSystemCache } from '../types';

// ═══════════════════════════════════════════════════════════════
// FN-6: DESIGN SYSTEM DISCOVERY
// ═══════════════════════════════════════════════════════════════

const DS_CACHE_STORAGE_KEY = 'figmento-design-system-cache';
const COMPONENT_CAP = 500;
const STALENESS_MS = 60 * 60 * 1000; // 1 hour

// ── Category Heuristics ──────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  ['button', ['button', 'btn', 'cta']],
  ['card', ['card']],
  ['input', ['input', 'textfield', 'text-field', 'textarea', 'text-area', 'field']],
  ['badge', ['badge', 'tag', 'chip', 'pill', 'label']],
  ['icon', ['icon', 'ico']],
  ['avatar', ['avatar', 'profile-pic', 'user-image']],
  ['navigation', ['nav', 'navbar', 'header', 'sidebar', 'menu', 'breadcrumb', 'tab', 'tabs']],
  ['modal', ['modal', 'dialog', 'popup', 'drawer', 'sheet']],
  ['toggle', ['toggle', 'switch', 'checkbox', 'radio']],
  ['select', ['select', 'dropdown', 'picker', 'combobox']],
  ['divider', ['divider', 'separator', 'hr']],
  ['list', ['list', 'table', 'row']],
];

function categorizeComponent(name: string): string {
  const lower = name.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    for (const kw of keywords) {
      // Match keyword as a whole word or path segment
      // e.g. "UI/Buttons/Primary" should match "button" via "buttons"
      if (lower.includes(kw)) {
        return category;
      }
    }
  }
  return 'other';
}

// ── Component Scanner ────────────────────────────────────────────────────────

function discoverComponents(): { components: DiscoveredComponent[]; truncated: boolean } {
  const allNodes = figma.root.findAll(node =>
    node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
  );

  // Sort by name for deterministic truncation
  allNodes.sort((a, b) => a.name.localeCompare(b.name));

  const truncated = allNodes.length > COMPONENT_CAP;
  const capped = allNodes.slice(0, COMPONENT_CAP);

  const components: DiscoveredComponent[] = [];

  for (const node of capped) {
    try {
      const entry: DiscoveredComponent = {
        key: (node as ComponentNode | ComponentSetNode).key,
        name: node.name,
        description: (node as ComponentNode | ComponentSetNode).description || '',
        category: categorizeComponent(node.name),
        width: Math.round(node.width),
        height: Math.round(node.height),
        nodeType: node.type as 'COMPONENT' | 'COMPONENT_SET',
      };

      // Extract variant properties for ComponentSetNode
      if (node.type === 'COMPONENT_SET') {
        try {
          const variantProps = (node as ComponentSetNode).variantGroupProperties;
          if (variantProps && typeof variantProps === 'object') {
            const mapped: Record<string, string[]> = {};
            for (const [propName, propDef] of Object.entries(variantProps)) {
              mapped[propName] = (propDef as { values: string[] }).values || [];
            }
            entry.variantProperties = mapped;
          }
        } catch (_e) {
          // Skip malformed variant properties
        }
      }

      components.push(entry);
    } catch (_e) {
      // Skip nodes that error during extraction
    }
  }

  return { components, truncated };
}

// ── Variable/Style Reader (reuses handleReadFigmaContext logic) ──────────────

async function readVariablesAndStyles(): Promise<{
  variables: unknown[];
  collections: unknown[];
  paintStyles: unknown[];
  textStyles: unknown[];
  effectStyles: unknown[];
}> {
  const rawVariables = await figma.variables.getLocalVariablesAsync();
  const rawCollections = await figma.variables.getLocalVariableCollectionsAsync();

  const modeNameMap = new Map<string, string>();
  for (const col of rawCollections) {
    for (const mode of col.modes) {
      modeNameMap.set(mode.modeId, mode.name);
    }
  }

  const variables = await Promise.all(rawVariables.map(async v => {
    const resolvedValues: Record<string, unknown> = {};
    for (const [modeId, value] of Object.entries(v.valuesByMode)) {
      const modeName = modeNameMap.get(modeId) || modeId;
      if (typeof value === 'object' && value !== null && 'type' in value && (value as Record<string, unknown>).type === 'VARIABLE_ALIAS') {
        const aliasId = (value as VariableAlias).id;
        const aliasVar = await figma.variables.getVariableByIdAsync(aliasId);
        resolvedValues[modeName] = { alias: true, aliasName: aliasVar?.name || aliasId, aliasId };
      } else if (v.resolvedType === 'COLOR' && typeof value === 'object' && value !== null && 'r' in value) {
        const rgb = value as { r: number; g: number; b: number; a?: number };
        resolvedValues[modeName] = { hex: rgbToHex(rgb), opacity: rgb.a !== undefined ? rgb.a : 1 };
      } else {
        resolvedValues[modeName] = value;
      }
    }
    return { id: v.id, name: v.name, resolvedType: v.resolvedType, valuesByMode: resolvedValues };
  }));

  const collections = rawCollections.map(c => ({
    id: c.id,
    name: c.name,
    modes: c.modes.map(m => ({ id: m.modeId, name: m.name })),
    variableIds: c.variableIds,
  }));

  const rawPaintStyles = await figma.getLocalPaintStylesAsync();
  const paintStyles = rawPaintStyles.map(s => ({
    id: s.id,
    name: s.name,
    key: s.key,
    paints: (s.paints as Paint[]).map(p => {
      if (p.type === 'SOLID') return { type: 'SOLID', color: rgbToHex(p.color), opacity: p.opacity ?? 1 };
      if (p.type === 'GRADIENT_LINEAR') return { type: 'GRADIENT_LINEAR', stops: (p as GradientPaint).gradientStops.map(gs => ({ position: gs.position, color: rgbToHex({ r: gs.color.r, g: gs.color.g, b: gs.color.b }), opacity: gs.color.a })) };
      return { type: p.type };
    }),
  }));

  const rawTextStyles = await figma.getLocalTextStylesAsync();
  const textStyles = rawTextStyles.map(s => ({
    id: s.id, name: s.name, key: s.key,
    fontFamily: s.fontName.family, fontStyle: s.fontName.style,
    fontSize: s.fontSize, letterSpacing: s.letterSpacing,
    lineHeight: s.lineHeight, textCase: s.textCase, textDecoration: s.textDecoration,
  }));

  const rawEffectStyles = await figma.getLocalEffectStylesAsync();
  const effectStyles = rawEffectStyles.map(s => ({
    id: s.id, name: s.name, key: s.key,
    effects: s.effects.map(e => ({
      type: e.type, visible: e.visible,
      ...(e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW' ? {
        color: rgbToHex({ r: (e as DropShadowEffect).color.r, g: (e as DropShadowEffect).color.g, b: (e as DropShadowEffect).color.b }),
        opacity: (e as DropShadowEffect).color.a,
        offset: (e as DropShadowEffect).offset,
        radius: (e as DropShadowEffect).radius,
        spread: (e as DropShadowEffect).spread,
      } : {}),
    })),
  }));

  return { variables, collections, paintStyles, textStyles, effectStyles };
}

// ── Public Handlers ──────────────────────────────────────────────────────────

/**
 * Full design system scan: components + variables + styles.
 * Caches result in clientStorage and returns it.
 */
export async function handleScanDesignSystem(): Promise<DesignSystemCache> {
  const startTime = Date.now();

  // Discover components
  const { components, truncated } = discoverComponents();

  // Read variables and styles
  const { variables, collections, paintStyles, textStyles, effectStyles } = await readVariablesAndStyles();

  // Build the unified cache
  const cache: DesignSystemCache = {
    components,
    variables,
    collections,
    paintStyles,
    textStyles,
    effectStyles,
    scannedAt: new Date().toISOString(),
    truncated,
    fileKey: figma.fileKey || figma.root.name,
  };

  // Persist to clientStorage
  await figma.clientStorage.setAsync(DS_CACHE_STORAGE_KEY, cache);

  const elapsed = Date.now() - startTime;
  console.log(`[FN-6] Design system scan complete in ${elapsed}ms: ${components.length} components, ${variables.length} variables, ${paintStyles.length + textStyles.length + effectStyles.length} styles${truncated ? ' (TRUNCATED)' : ''}`);

  return cache;
}

/**
 * Retrieve cached design system from clientStorage.
 * Returns null if no cache exists.
 */
export async function getDesignSystemCache(): Promise<DesignSystemCache | null> {
  try {
    const cache = await figma.clientStorage.getAsync(DS_CACHE_STORAGE_KEY) as DesignSystemCache | null;
    return cache || null;
  } catch (_e) {
    return null;
  }
}

/**
 * Check if the cached design system is stale (older than 1 hour).
 */
export function isCacheStale(cache: DesignSystemCache): boolean {
  const scannedTime = new Date(cache.scannedAt).getTime();
  return Date.now() - scannedTime > STALENESS_MS;
}
