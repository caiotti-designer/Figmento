/// <reference types="@figma/plugin-typings" />

/**
 * FN-8: Variable Binding in Generation
 *
 * Automatically binds Figma variables from the DesignSystemCache to node
 * properties (fills, spacing, font size) when values match. Makes generated
 * designs "live" — they update when the design system changes.
 */

import { hexToRgb, rgbToHex } from '../color-utils';
import { getDesignSystemCache } from './design-system-discovery';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VariableMatch {
  variableId: string;
  variableName: string;
  collectionName: string;
}

interface CachedVariable {
  id: string;
  name: string;
  resolvedType: string;
  valuesByMode: Record<string, unknown>;
}

interface CachedCollection {
  id: string;
  name: string;
  variableIds: string[];
}

// ── Global auto-bind setting ─────────────────────────────────────────────────

const AUTO_BIND_STORAGE_KEY = 'figmento-auto-bind-variables';

let globalAutoBindEnabled: boolean | null = null;

export async function isAutoBindEnabled(): Promise<boolean> {
  if (globalAutoBindEnabled !== null) return globalAutoBindEnabled;
  try {
    const stored = await figma.clientStorage.getAsync(AUTO_BIND_STORAGE_KEY);
    globalAutoBindEnabled = stored !== false; // default true
    return globalAutoBindEnabled;
  } catch {
    return true;
  }
}

export async function setAutoBindEnabled(enabled: boolean): Promise<void> {
  globalAutoBindEnabled = enabled;
  await figma.clientStorage.setAsync(AUTO_BIND_STORAGE_KEY, enabled);
}

// ── Semantic name patterns ───────────────────────────────────────────────────

const COLOR_SEMANTIC_NAMES = [
  'primary', 'secondary', 'accent', 'surface', 'background', 'foreground',
  'text', 'muted', 'border', 'error', 'warning', 'success', 'info',
  'on-primary', 'on-secondary', 'on-surface', 'on-background',
];

const SPACING_SEMANTIC_NAMES = [
  'spacing', 'space', 'padding', 'margin', 'gap', 'size', 'radius',
];

const TYPOGRAPHY_SEMANTIC_NAMES = [
  'font-size', 'fontSize', 'text', 'type', 'heading', 'body', 'caption',
  'display', 'title', 'label',
];

// Collections preferred for color matching
const COLOR_COLLECTION_NAMES = ['colors', 'color', 'primitives', 'primitive', 'brand', 'palette', 'theme'];
// Collections preferred for spacing matching
const SPACING_COLLECTION_NAMES = ['spacing', 'space', 'sizing', 'size', 'layout', 'dimension'];

// ── Color distance ───────────────────────────────────────────────────────────

/**
 * Euclidean RGB distance in 0-255 space.
 * Distance < 15 is imperceptible to most users.
 */
export function colorDistance(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const dr = (rgb1.r - rgb2.r) * 255;
  const dg = (rgb1.g - rgb2.g) * 255;
  const db = (rgb1.b - rgb2.b) * 255;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCollectionMap(collections: CachedCollection[]): Map<string, string> {
  // variableId → collectionName
  const map = new Map<string, string>();
  for (const col of collections) {
    for (const vid of col.variableIds) {
      map.set(vid, col.name);
    }
  }
  return map;
}

function getDefaultModeValue(v: CachedVariable): unknown {
  // Get the first mode's value (default mode)
  const modes = Object.keys(v.valuesByMode);
  if (modes.length === 0) return undefined;
  return v.valuesByMode[modes[0]];
}

function resolvedHex(value: unknown): string | null {
  if (typeof value === 'object' && value !== null && 'hex' in value) {
    return (value as { hex: string }).hex;
  }
  return null;
}

function isSemanticSpacingName(name: string): boolean {
  const lower = name.toLowerCase();
  return SPACING_SEMANTIC_NAMES.some(kw => lower.includes(kw));
}

function isSemanticTypographyName(name: string): boolean {
  const lower = name.toLowerCase();
  return TYPOGRAPHY_SEMANTIC_NAMES.some(kw => lower.includes(kw));
}

function collectionPreferenceScore(collectionName: string, preferredNames: string[]): number {
  const lower = collectionName.toLowerCase();
  return preferredNames.some(n => lower.includes(n)) ? 1 : 0;
}

function semanticNameScore(varName: string): number {
  const lower = varName.toLowerCase();
  // Prefer names that contain semantic tokens (e.g. "primary" over "blue-500")
  const semanticAll = [...COLOR_SEMANTIC_NAMES, ...SPACING_SEMANTIC_NAMES];
  return semanticAll.some(s => lower.includes(s)) ? 1 : 0;
}

// ── matchVariable (COLOR) ────────────────────────────────────────────────────

export function matchColorVariable(
  hex: string,
  variables: CachedVariable[],
  collections: CachedCollection[],
): VariableMatch | null {
  const collectionMap = buildCollectionMap(collections);
  const targetHex = hex.toUpperCase();

  type Candidate = { v: CachedVariable; priority: number; collPref: number; semScore: number };
  const candidates: Candidate[] = [];

  for (const v of variables) {
    if (v.resolvedType !== 'COLOR') continue;
    // Skip aliases — they resolve through their target
    const val = getDefaultModeValue(v);
    if (typeof val === 'object' && val !== null && 'alias' in val) continue;

    const varHex = resolvedHex(val);
    if (!varHex) continue;

    const colName = collectionMap.get(v.id) || '';
    const collPref = collectionPreferenceScore(colName, COLOR_COLLECTION_NAMES);
    const semScore = semanticNameScore(v.name);

    // Priority 1: exact hex match
    if (varHex.toUpperCase() === targetHex) {
      candidates.push({ v, priority: 3, collPref, semScore });
      continue;
    }

    // Priority 2: proximity match (distance < 15)
    const dist = colorDistance(hex, varHex);
    if (dist < 15) {
      candidates.push({ v, priority: 1, collPref, semScore });
    }
  }

  if (candidates.length === 0) return null;

  // Sort: highest priority first, then collection preference, then semantic name
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.collPref !== a.collPref) return b.collPref - a.collPref;
    return b.semScore - a.semScore;
  });

  const best = candidates[0];
  return {
    variableId: best.v.id,
    variableName: best.v.name,
    collectionName: collectionMap.get(best.v.id) || '',
  };
}

// ── matchVariable (FLOAT) ────────────────────────────────────────────────────

export function matchFloatVariable(
  value: number,
  variables: CachedVariable[],
  collections: CachedCollection[],
  options: { requireSemanticSpacing?: boolean; requireSemanticTypography?: boolean } = {},
): VariableMatch | null {
  const collectionMap = buildCollectionMap(collections);

  type Candidate = { v: CachedVariable; priority: number; collPref: number; semScore: number };
  const candidates: Candidate[] = [];

  const preferredCollections = options.requireSemanticTypography
    ? ['typography', 'type', 'text', 'font']
    : SPACING_COLLECTION_NAMES;

  for (const v of variables) {
    if (v.resolvedType !== 'FLOAT') continue;
    const val = getDefaultModeValue(v);
    if (typeof val !== 'number') continue;

    // Semantic name check
    if (options.requireSemanticSpacing && !isSemanticSpacingName(v.name)) continue;
    if (options.requireSemanticTypography && !isSemanticTypographyName(v.name)) continue;

    const colName = collectionMap.get(v.id) || '';
    const collPref = collectionPreferenceScore(colName, preferredCollections);
    const semScore = semanticNameScore(v.name);

    // Priority 1: exact value match
    if (val === value) {
      candidates.push({ v, priority: 3, collPref, semScore });
      continue;
    }

    // Priority 2: within 10% tolerance
    if (value !== 0) {
      const tolerance = Math.abs(value * 0.1);
      if (Math.abs(val - value) <= tolerance) {
        candidates.push({ v, priority: 1, collPref, semScore });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.collPref !== a.collPref) return b.collPref - a.collPref;
    return b.semScore - a.semScore;
  });

  const best = candidates[0];
  return {
    variableId: best.v.id,
    variableName: best.v.name,
    collectionName: collectionMap.get(best.v.id) || '',
  };
}

// ── Binding Helpers ──────────────────────────────────────────────────────────

/**
 * Bind a COLOR variable to a node's solid fill at index 0.
 * Returns the bound variable name, or null if binding failed/skipped.
 */
export async function tryBindFillVariable(
  node: SceneNode,
  hex: string,
  autoBindParam?: boolean,
): Promise<VariableMatch | null> {
  // Check opt-out
  if (autoBindParam === false) return null;
  if (!(await isAutoBindEnabled())) return null;

  const cache = await getDesignSystemCache();
  if (!cache || !cache.variables || cache.variables.length === 0) return null;

  const variables = cache.variables as CachedVariable[];
  const collections = (cache.collections || []) as CachedCollection[];

  const match = matchColorVariable(hex, variables, collections);
  if (!match) return null;

  try {
    if (!('fills' in node)) return null;
    const geom = node as GeometryMixin;
    const existing = geom.fills as Paint[];
    if (!existing || existing.length === 0) return null;
    if (existing[0].type !== 'SOLID') return null; // Don't bind gradients

    // Check if setBoundVariable API exists
    if (typeof (node as any).setBoundVariable !== 'function' &&
        typeof figma.variables.setBoundVariableForPaint !== 'function') {
      return null;
    }

    const variable = await figma.variables.getVariableByIdAsync(match.variableId);
    if (!variable) return null;

    const basePaint = existing[0] as SolidPaint;
    const boundPaint = figma.variables.setBoundVariableForPaint(basePaint, 'color', variable);
    geom.fills = [boundPaint];

    return match;
  } catch {
    // Binding failure is silent — raw fill still applies
    return null;
  }
}

/**
 * Bind FLOAT variables to spacing properties on an auto-layout frame.
 * Returns a record of property → variableName for each bound property.
 */
export async function tryBindSpacingVariables(
  node: FrameNode,
  spacingValues: Record<string, number | undefined>,
  autoBindParam?: boolean,
): Promise<Record<string, string>> {
  const bound: Record<string, string> = {};

  if (autoBindParam === false) return bound;
  if (!(await isAutoBindEnabled())) return bound;

  const cache = await getDesignSystemCache();
  if (!cache || !cache.variables || cache.variables.length === 0) return bound;

  const variables = cache.variables as CachedVariable[];
  const collections = (cache.collections || []) as CachedCollection[];

  const spacingFields: Array<{ param: string; field: VariableBindableNodeField }> = [
    { param: 'paddingTop', field: 'paddingTop' },
    { param: 'paddingRight', field: 'paddingRight' },
    { param: 'paddingBottom', field: 'paddingBottom' },
    { param: 'paddingLeft', field: 'paddingLeft' },
    { param: 'itemSpacing', field: 'itemSpacing' },
  ];

  for (const { param, field } of spacingFields) {
    const value = spacingValues[param];
    if (value === undefined) continue;

    const match = matchFloatVariable(value, variables, collections, { requireSemanticSpacing: true });
    if (!match) continue;

    try {
      if (typeof (node as any).setBoundVariable !== 'function') continue;

      const variable = await figma.variables.getVariableByIdAsync(match.variableId);
      if (!variable) continue;

      node.setBoundVariable(field, variable);
      bound[param] = match.variableName;
    } catch {
      // Silent failure
    }
  }

  return bound;
}

/**
 * Bind a COLOR variable to a text node's fill and optionally a FLOAT
 * variable to its fontSize.
 */
export async function tryBindTextVariables(
  node: TextNode,
  textColor: string,
  fontSize?: number,
  autoBindParam?: boolean,
): Promise<{ boundColor: VariableMatch | null; boundFontSize: VariableMatch | null }> {
  const result = { boundColor: null as VariableMatch | null, boundFontSize: null as VariableMatch | null };

  if (autoBindParam === false) return result;
  if (!(await isAutoBindEnabled())) return result;

  const cache = await getDesignSystemCache();
  if (!cache || !cache.variables || cache.variables.length === 0) return result;

  const variables = cache.variables as CachedVariable[];
  const collections = (cache.collections || []) as CachedCollection[];

  // Bind text color
  const colorMatch = matchColorVariable(textColor, variables, collections);
  if (colorMatch) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(colorMatch.variableId);
      if (variable && 'fills' in node) {
        const existing = node.fills as Paint[];
        if (existing.length > 0 && existing[0].type === 'SOLID') {
          const basePaint = existing[0] as SolidPaint;
          const boundPaint = figma.variables.setBoundVariableForPaint(basePaint, 'color', variable);
          node.fills = [boundPaint];
          result.boundColor = colorMatch;
        }
      }
    } catch {
      // Silent
    }
  }

  // Bind font size
  if (fontSize !== undefined) {
    const fontSizeMatch = matchFloatVariable(fontSize, variables, collections, { requireSemanticTypography: true });
    if (fontSizeMatch) {
      try {
        if (typeof (node as any).setBoundVariable === 'function') {
          const variable = await figma.variables.getVariableByIdAsync(fontSizeMatch.variableId);
          if (variable) {
            node.setBoundVariable('fontSize', variable);
            result.boundFontSize = fontSizeMatch;
          }
        }
      } catch {
        // Silent
      }
    }
  }

  return result;
}
