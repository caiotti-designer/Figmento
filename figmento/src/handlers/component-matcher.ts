/// <reference types="@figma/plugin-typings" />

import { hexToRgb } from '../color-utils';
import type { DiscoveredComponent, DesignSystemCache } from '../types';

// ═══════════════════════════════════════════════════════════════
// FN-7: COMPONENT MATCHING IN GENERATION
// ═══════════════════════════════════════════════════════════════

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ComponentMatch {
  component: DiscoveredComponent;
  confidence: MatchConfidence;
  score: number;
}

// ── Category keywords for recognizing matchable frame names ──────────────────
const COMPONENT_KEYWORDS: string[] = [
  'button', 'btn', 'cta',
  'card',
  'input', 'textfield', 'text-field', 'textarea', 'field',
  'badge', 'tag', 'chip', 'pill', 'label',
  'icon',
  'avatar',
  'nav', 'navbar', 'header', 'sidebar', 'menu', 'breadcrumb', 'tab', 'tabs',
  'modal', 'dialog', 'popup', 'drawer', 'sheet',
  'toggle', 'switch', 'checkbox', 'radio',
  'select', 'dropdown', 'picker', 'combobox',
  'divider', 'separator',
  'list', 'table', 'row',
];

// ── Score thresholds ─────────────────────────────────────────────────────────
const HIGH_THRESHOLD = 8;
const MEDIUM_THRESHOLD = 4;

/**
 * Match an intent string against the DesignSystemCache to find the best
 * matching component. Returns null if no match above the MEDIUM threshold.
 *
 * AC1: matchComponent function with name + category + keyword scoring.
 * AC1a: Exact match (10), name-contains-intent (6), intent-contains-name (5), category match (+4), keyword overlap (+1 each).
 * AC1b: Returns null if best score < MEDIUM_THRESHOLD (4).
 */
export function matchComponent(
  intent: string,
  category?: string,
  cache?: DesignSystemCache | null,
): ComponentMatch | null {
  if (!cache || !cache.components || cache.components.length === 0) return null;

  const intentLower = intent.toLowerCase();
  const candidates: Array<{ comp: DiscoveredComponent; score: number }> = [];

  for (const comp of cache.components) {
    let score = 0;
    const nameLower = comp.name.toLowerCase();

    // Exact name match (highest signal)
    if (nameLower === intentLower) {
      score += 10;
    }
    // Name contains the entire intent
    else if (nameLower.includes(intentLower)) {
      score += 6;
    }
    // Intent contains the entire component name
    else if (intentLower.includes(nameLower)) {
      score += 5;
    }

    // Category match
    if (category && comp.category === category) {
      score += 4;
    }

    // Keyword overlap — split intent and name by space, slash, dash
    const intentWords = intentLower.split(/[\s/\-_]+/).filter(w => w.length > 0);
    const nameWords = nameLower.split(/[\s/\-_]+/).filter(w => w.length > 0);
    for (const iw of intentWords) {
      if (iw.length < 2) continue; // skip single-char fragments
      if (nameWords.some(nw => nw.includes(iw) || iw.includes(nw))) {
        score += 1;
      }
    }

    if (score > 0) candidates.push({ comp, score });
  }

  if (candidates.length === 0) return null;

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const confidence: MatchConfidence =
    best.score >= HIGH_THRESHOLD ? 'HIGH' :
    best.score >= MEDIUM_THRESHOLD ? 'MEDIUM' : 'LOW';

  // AC1b: Only return HIGH and MEDIUM; LOW = too risky for false positives
  if (confidence === 'LOW') return null;

  return { component: best.comp, confidence, score: best.score };
}

/**
 * AC5: Select the appropriate variant from a ComponentSet.
 *
 * AC5a: If variant hints are provided (e.g., size: "small", state: "hover"),
 *       find the child whose name properties best match.
 * AC5b: If no hints, use defaultVariant.
 * AC5c: Matching is case-insensitive and supports partial matching.
 */
export function selectVariant(
  componentSet: ComponentSetNode,
  variantHints?: Record<string, string>,
): ComponentNode {
  // If no hints, use default
  if (!variantHints || Object.keys(variantHints).length === 0) {
    return (componentSet.defaultVariant || componentSet.children[0]) as ComponentNode;
  }

  // Figma variant names are "Property1=Value1, Property2=Value2"
  // Score each child by how many hints it matches
  let bestChild: ComponentNode | null = null;
  let bestScore = -1;

  for (const child of componentSet.children) {
    if (child.type !== 'COMPONENT') continue;
    const childNameLower = child.name.toLowerCase();
    let score = 0;

    for (const [hintProp, hintVal] of Object.entries(variantHints)) {
      const hintPropLower = hintProp.toLowerCase();
      const hintValLower = hintVal.toLowerCase();

      // Check if variant name contains "Property=Value" (case-insensitive, partial)
      // e.g., "Size=Small" matches hint { size: "sm" }
      const parts = childNameLower.split(',').map(p => p.trim());
      for (const part of parts) {
        const [propPart, valPart] = part.split('=').map(s => s.trim());
        if (!propPart || !valPart) continue;

        // Property name match (partial)
        const propMatches = propPart.includes(hintPropLower) || hintPropLower.includes(propPart);
        // Value match (partial)
        const valMatches = valPart.includes(hintValLower) || hintValLower.includes(valPart);

        if (propMatches && valMatches) {
          score += 2;
        } else if (valMatches) {
          // Value-only match (e.g., hint "Primary" without specifying property name)
          score += 1;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestChild = child as ComponentNode;
    }
  }

  if (bestChild && bestScore > 0) {
    return bestChild;
  }

  // Fallback to default variant
  return (componentSet.defaultVariant || componentSet.children[0]) as ComponentNode;
}

/**
 * AC4: Apply text and fill overrides to a component instance.
 * Wrapped in try-catch — failure does not fail instance creation (AC4d).
 */
export async function applyInstanceOverrides(
  instance: InstanceNode,
  params: Record<string, unknown>,
): Promise<{ textOverrideApplied: boolean; fillOverrideApplied: boolean; resizeApplied: boolean }> {
  const result = { textOverrideApplied: false, fillOverrideApplied: false, resizeApplied: false };

  // AC4a: Text content override
  const textContent = (params.text as string) || (params.content as string) || (params.name as string);
  if (textContent) {
    try {
      const textNode = instance.findOne(n => n.type === 'TEXT') as TextNode | null;
      if (textNode) {
        // Load the font before changing characters
        const fontName = textNode.fontName;
        if (fontName && typeof fontName !== 'symbol') {
          await figma.loadFontAsync(fontName as FontName);
        }
        textNode.characters = textContent;
        result.textOverrideApplied = true;
      }
    } catch (e) {
      console.warn('[FN-7] Text override failed:', e);
    }
  }

  // AC4b: Fill color override
  const fillColor = (params.fillColor as string) || (params.backgroundColor as string);
  if (fillColor) {
    try {
      const rgb = hexToRgb(fillColor);
      if (rgb) {
        // Apply to the instance itself (primary fill)
        instance.fills = [{ type: 'SOLID', color: rgb }];
        result.fillOverrideApplied = true;
      }
    } catch (e) {
      console.warn('[FN-7] Fill override failed:', e);
    }
  }

  // AC4c: Size override
  const width = params.width as number | undefined;
  const height = params.height as number | undefined;
  if (width || height) {
    try {
      instance.resize(
        width || instance.width,
        height || instance.height,
      );
      result.resizeApplied = true;
    } catch (e) {
      console.warn('[FN-7] Resize override failed:', e);
    }
  }

  return result;
}

/**
 * Check if a frame name contains component keywords that make it
 * a candidate for component matching. Used by the command router
 * to decide whether to attempt matching on create_frame calls.
 */
export function isComponentMatchableFrame(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return COMPONENT_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Infer a category hint from a frame name, matching against known categories.
 */
export function inferCategoryFromName(name: string): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();

  // Same keyword → category mapping as design-system-discovery.ts
  const categoryMap: Array<[string, string[]]> = [
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

  for (const [category, keywords] of categoryMap) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return category;
    }
  }
  return undefined;
}

/**
 * Core function: attempt to create a component instance instead of a frame.
 *
 * Returns the response data if a component was matched and instantiated,
 * or null if matching was skipped/failed (caller should fall back to primitives).
 *
 * AC2a: Uses createInstance() from the discovered component.
 * AC2b: Returns null for fallback.
 * AC2c: Response includes matchedComponent field.
 * AC3a: Intercepts create_frame when name matches a component keyword.
 * AC3b: Only auto-intercepts on HIGH confidence.
 * AC3c: Respects useDesignSystem: false opt-out.
 * AC6: Null/empty cache → fast null return.
 */
export async function tryComponentInstance(
  params: Record<string, unknown>,
  cache: DesignSystemCache | null,
): Promise<Record<string, unknown> | null> {
  // AC3c: Opt-out check
  if (params.useDesignSystem === false) return null;

  // AC6a/c: No cache or empty → fast skip
  if (!cache || !cache.components || cache.components.length === 0) return null;

  const name = (params.name as string) || '';
  if (!name) return null;

  // Infer category from the requested element name
  const category = inferCategoryFromName(name);

  // Run the matching algorithm
  const match = matchComponent(name, category, cache);
  if (!match) return null;

  // AC3b: Only auto-intercept on HIGH confidence
  if (match.confidence === 'MEDIUM') {
    console.log(`[FN-7] MEDIUM confidence match: "${name}" → "${match.component.name}" (score: ${match.score}). Using primitives. A component was available.`);
    return null;
  }

  // HIGH confidence — attempt createInstance
  console.log(`[FN-7] HIGH confidence match: "${name}" → "${match.component.name}" (score: ${match.score}). Creating instance.`);

  try {
    let targetComponent: ComponentNode;

    if (match.component.nodeType === 'COMPONENT_SET') {
      // Import the component set, then pick a variant
      let compSet: ComponentSetNode;
      try {
        compSet = await figma.importComponentSetByKeyAsync(match.component.key);
      } catch (_e) {
        // Might be accessible directly by node ID (local component)
        const localNode = figma.getNodeById(match.component.key);
        if (localNode && localNode.type === 'COMPONENT_SET') {
          compSet = localNode as ComponentSetNode;
        } else {
          console.warn('[FN-7] Could not import component set:', match.component.key);
          return null; // Fall back to primitives
        }
      }

      // AC5: Variant selection
      const variantHints: Record<string, string> = {};
      // Collect variant-like params
      if (params.variant) variantHints.variant = String(params.variant);
      if (params.size) variantHints.size = String(params.size);
      if (params.state) variantHints.state = String(params.state);
      if (params.style) variantHints.style = String(params.style);
      if (params.type) variantHints.type = String(params.type);

      // Also check the name itself for variant hints (e.g., "Small Button" → Size=Small)
      const nameLower = name.toLowerCase();
      if (!variantHints.size) {
        for (const sizeKw of ['small', 'sm', 'medium', 'md', 'large', 'lg', 'xl', 'xs']) {
          if (nameLower.includes(sizeKw)) {
            variantHints.size = sizeKw;
            break;
          }
        }
      }

      targetComponent = selectVariant(compSet, variantHints);
    } else {
      // Single component — import directly
      try {
        targetComponent = await figma.importComponentByKeyAsync(match.component.key);
      } catch (_e) {
        // Try local access
        const localNode = figma.getNodeById(match.component.key);
        if (localNode && localNode.type === 'COMPONENT') {
          targetComponent = localNode as ComponentNode;
        } else {
          console.warn('[FN-7] Could not import component:', match.component.key);
          return null;
        }
      }
    }

    // Create the instance
    const instance = targetComponent.createInstance();

    // Position
    instance.x = (params.x as number) || 0;
    instance.y = (params.y as number) || 0;
    if (params.name) instance.name = params.name as string;

    // Parent appending
    if (params.parentId) {
      const parent = figma.getNodeById(params.parentId as string);
      if (parent && 'appendChild' in parent) {
        (parent as FrameNode).appendChild(instance);
      }
    } else {
      // Center on viewport if no parent and no explicit position
      if (params.x === undefined && params.y === undefined) {
        const center = figma.viewport.center;
        instance.x = center.x - instance.width / 2;
        instance.y = center.y - instance.height / 2;
      }
    }

    // AC4: Apply overrides
    const overrides = await applyInstanceOverrides(instance, params);

    figma.currentPage.selection = [instance];

    return {
      nodeId: instance.id,
      name: instance.name,
      matchedComponent: match.component.name,
      matchConfidence: match.confidence,
      matchScore: match.score,
      isComponentInstance: true,
      width: Math.round(instance.width),
      height: Math.round(instance.height),
      overridesApplied: overrides,
    };
  } catch (e) {
    // Any failure → fall back to primitives (AC6b: no error thrown)
    console.warn('[FN-7] Instance creation failed, falling back to primitives:', e);
    return null;
  }
}
