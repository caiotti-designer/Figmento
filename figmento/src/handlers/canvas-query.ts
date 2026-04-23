/// <reference types="@figma/plugin-typings" />

import { hexToRgb, rgbToHex, getFontStyle } from '../color-utils';

export async function handleExportNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const scale = (params.scale as number) || 1;
  const format = ((params.format as string) || 'PNG').toUpperCase();

  if (!('exportAsync' in node)) throw new Error(`Node ${nodeId} cannot be exported`);

  const bytes = await (node as SceneNode).exportAsync({
    format: format as 'PNG' | 'SVG' | 'JPG',
    constraint: { type: 'SCALE', value: scale },
  });

  const base64 = figma.base64Encode(bytes);
  const mimeType = format === 'SVG' ? 'image/svg+xml' : format === 'JPG' ? 'image/jpeg' : 'image/png';

  return {
    nodeId,
    base64: `data:${mimeType};base64,${base64}`,
    width: (node as SceneNode).width,
    height: (node as SceneNode).height,
  };
}

// Max base64 size for API compatibility (Claude limit is 5MB, keep under 4MB for safety)
const MAX_BASE64_BYTES = 4 * 1024 * 1024;

export async function handleGetScreenshot(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('exportAsync' in node)) throw new Error(`Node ${nodeId} cannot be exported`);

  const requestedScale = Math.min(Math.max((params.scale as number) || 1, 0.1), 3);
  const sceneNode = node as SceneNode;

  // Try progressively lower scales until under the size limit
  const scales = [requestedScale, 0.75, 0.5, 0.35, 0.25];
  // Also try JPG as last resort (much smaller for photos/complex designs)
  const attempts: Array<{ scale: number; format: 'PNG' | 'JPG' }> = [
    ...scales.map(s => ({ scale: s, format: 'PNG' as const })),
    { scale: 0.5, format: 'JPG' as const },
    { scale: 0.25, format: 'JPG' as const },
  ];

  for (const { scale, format } of attempts) {
    const bytes = await sceneNode.exportAsync({
      format,
      constraint: { type: 'SCALE', value: scale },
    });

    const base64 = figma.base64Encode(bytes);

    if (base64.length <= MAX_BASE64_BYTES) {
      return {
        nodeId,
        name: node.name,
        width: sceneNode.width,
        height: sceneNode.height,
        scale,
        format,
        base64,
      };
    }
  }

  // All attempts exceeded limit — return metadata only, no image
  return {
    nodeId,
    name: node.name,
    width: sceneNode.width,
    height: sceneNode.height,
    error: `Screenshot too large even at 0.25x JPG (node is ${Math.round(sceneNode.width)}×${Math.round(sceneNode.height)}). Use export_node_to_file instead.`,
  };
}

// ═══════════════════════════════════════════════════════════════
// SCAN FRAME STRUCTURE HANDLER
// ═══════════════════════════════════════════════════════════════

interface ScannedNode {
  nodeId: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: unknown[];
  stroke?: { color: string; weight: number } | null;
  effects?: unknown[];
  cornerRadius?: number | number[];
  opacity?: number;
  layoutMode?: string;
  itemSpacing?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  text?: {
    content: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    color: string;
    textAlign: string;
    lineHeight: number | 'AUTO';
  };
  children?: ScannedNode[];
}

export async function handleScanFrameStructure(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const maxDepth = (params.depth as number) || 5;
  const includeStyles = params.include_styles !== false;

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  function extractFills(n: SceneNode): unknown[] | undefined {
    if (!includeStyles) return undefined;
    if (!('fills' in n)) return undefined;
    const fills = n.fills;
    if (!Array.isArray(fills) || fills.length === 0) return undefined;
    return fills.map((f: Paint) => {
      if (f.type === 'SOLID') {
        return {
          type: 'SOLID',
          color: rgbToHex(f.color),
          opacity: f.opacity !== undefined ? f.opacity : 1,
        };
      }
      return { type: f.type };
    });
  }

  function extractStroke(n: SceneNode): { color: string; weight: number } | null {
    if (!includeStyles) return null;
    if (!('strokes' in n)) return null;
    const strokes = (n as GeometryMixin).strokes;
    if (!Array.isArray(strokes) || strokes.length === 0) return null;
    const first = strokes[0];
    if (first.type === 'SOLID') {
      const sw = ('strokeWeight' in n) ? (n as GeometryMixin).strokeWeight : 1;
      return {
        color: rgbToHex(first.color),
        weight: sw === figma.mixed ? 1 : sw as number,
      };
    }
    return null;
  }

  function extractEffects(n: SceneNode): unknown[] | undefined {
    if (!includeStyles) return undefined;
    if (!('effects' in n)) return undefined;
    const effects = (n as BlendMixin).effects;
    if (!Array.isArray(effects) || effects.length === 0) return undefined;
    return effects.map((e: Effect) => {
      const result: Record<string, unknown> = { type: e.type, visible: e.visible };
      if ('color' in e && e.color) {
        result.color = rgbToHex(e.color);
        result.opacity = e.color.a;
      }
      if ('offset' in e) result.offset = e.offset;
      if ('radius' in e) result.blur = e.radius;
      if ('spread' in e) result.spread = e.spread;
      return result;
    });
  }

  function extractCornerRadius(n: SceneNode): number | number[] | undefined {
    if (!includeStyles) return undefined;
    if (!('cornerRadius' in n)) return undefined;
    const cr = (n as CornerMixin).cornerRadius;
    if (cr === figma.mixed) {
      const rn = n as RectangleCornerMixin;
      return [
        rn.topLeftRadius,
        rn.topRightRadius,
        rn.bottomRightRadius,
        rn.bottomLeftRadius,
      ];
    }
    return cr;
  }

  function extractTextProps(n: TextNode): ScannedNode['text'] {
    const fontSize = n.fontSize === figma.mixed ? 16 : n.fontSize;
    let fontFamily = 'Inter';
    let fontWeight = 400;
    const fontName = n.fontName;
    if (fontName !== figma.mixed) {
      fontFamily = fontName.family;
      const style = fontName.style.toLowerCase();
      if (style.includes('bold')) fontWeight = 700;
      else if (style.includes('semibold') || style.includes('semi bold')) fontWeight = 600;
      else if (style.includes('medium')) fontWeight = 500;
      else if (style.includes('light')) fontWeight = 300;
      else if (style.includes('thin')) fontWeight = 100;
      else if (style.includes('black') || style.includes('extra bold')) fontWeight = 800;
    }

    let color = '#000000';
    const fills = n.fills;
    if (Array.isArray(fills) && fills.length > 0 && fills[0].type === 'SOLID') {
      color = rgbToHex(fills[0].color);
    }

    const textAlign = n.textAlignHorizontal || 'LEFT';

    let lineHeight: number | 'AUTO' = 'AUTO';
    const lh = n.lineHeight;
    if (lh !== figma.mixed) {
      if (lh.unit === 'PIXELS') lineHeight = lh.value;
      else if (lh.unit === 'PERCENT') lineHeight = lh.value;
    }

    return {
      content: n.characters,
      fontSize,
      fontFamily,
      fontWeight,
      color,
      textAlign,
      lineHeight,
    };
  }

  function scanNode(n: SceneNode, currentDepth: number): ScannedNode {
    const result: ScannedNode = {
      nodeId: n.id,
      name: n.name,
      type: n.type,
      x: Math.round(n.x),
      y: Math.round(n.y),
      width: Math.round(n.width),
      height: Math.round(n.height),
    };

    if (includeStyles) {
      const fills = extractFills(n);
      if (fills) result.fills = fills;

      const stroke = extractStroke(n);
      if (stroke) result.stroke = stroke;

      const effects = extractEffects(n);
      if (effects) result.effects = effects;

      const cr = extractCornerRadius(n);
      if (cr !== undefined) result.cornerRadius = cr;

      result.opacity = (n as BlendMixin).opacity;
    }

    if ('layoutMode' in n) {
      const frame = n as FrameNode;
      if (frame.layoutMode !== 'NONE') {
        result.layoutMode = frame.layoutMode;
        result.itemSpacing = frame.itemSpacing;
        result.padding = {
          top: frame.paddingTop,
          right: frame.paddingRight,
          bottom: frame.paddingBottom,
          left: frame.paddingLeft,
        };
      }
      if (frame.layoutSizingHorizontal) result.layoutSizingHorizontal = frame.layoutSizingHorizontal;
      if (frame.layoutSizingVertical) result.layoutSizingVertical = frame.layoutSizingVertical;
    }

    if (n.type === 'TEXT') {
      result.text = extractTextProps(n as TextNode);
    }

    if ('children' in n && currentDepth < maxDepth) {
      const parent = n as ChildrenMixin;
      if (parent.children.length > 0) {
        result.children = parent.children.map(child => scanNode(child as SceneNode, currentDepth + 1));
      }
    }

    return result;
  }

  return scanNode(node as SceneNode, 0) as unknown as Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// FIGMA NATIVE: read_figma_context, bind_variable, apply_*_style
// ═══════════════════════════════════════════════════════════════

export async function handleReadFigmaContext(): Promise<Record<string, unknown>> {
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
      if (typeof value === 'object' && value !== null && 'type' in value && (value as unknown as Record<string, unknown>).type === 'VARIABLE_ALIAS') {
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

  const allFonts = await figma.listAvailableFontsAsync();
  const familySet = new Set<string>();
  const fonts: string[] = [];
  for (const f of allFonts) {
    if (!familySet.has(f.fontName.family)) {
      familySet.add(f.fontName.family);
      fonts.push(f.fontName.family);
      if (fonts.length >= 100) break;
    }
  }

  return { variables, collections, paintStyles, textStyles, effectStyles, fonts };
}

export async function handleBindVariable(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  const variableId = params.variableId as string;
  const field = params.field as string;
  if (!nodeId || !variableId || !field) throw new Error('nodeId, variableId, and field are required');

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const variable = await figma.variables.getVariableByIdAsync(variableId);
  if (!variable) throw new Error(`Variable not found: ${variableId}`);

  const fieldMapping: Record<string, VariableBindableNodeField> = {
    fills: 'fills' as VariableBindableNodeField, strokes: 'strokes' as VariableBindableNodeField, opacity: 'opacity',
    width: 'width', height: 'height',
    paddingTop: 'paddingTop', paddingRight: 'paddingRight',
    paddingBottom: 'paddingBottom', paddingLeft: 'paddingLeft',
    itemSpacing: 'itemSpacing', cornerRadius: 'topLeftRadius',
    fontSize: 'fontSize' as VariableBindableNodeField, fontFamily: 'fontFamily' as VariableBindableNodeField, fontWeight: 'fontWeight' as VariableBindableNodeField,
  };

  const figmaField = fieldMapping[field];
  if (!figmaField) throw new Error(`Unsupported field: "${field}". Supported: ${Object.keys(fieldMapping).join(', ')}`);

  if (field === 'fills' || field === 'strokes') {
    if (!('fills' in node)) throw new Error(`Node ${nodeId} does not support fills/strokes`);
    const geom = node as GeometryMixin;
    const existing = (field === 'fills' ? geom.fills : geom.strokes) as Paint[];
    const basePaint: SolidPaint = existing.length > 0 && existing[0].type === 'SOLID'
      ? existing[0] as SolidPaint
      : { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };
    const boundPaint = figma.variables.setBoundVariableForPaint(basePaint, 'color', variable);
    if (field === 'fills') geom.fills = [boundPaint];
    else geom.strokes = [boundPaint];
  } else if (field === 'cornerRadius') {
    for (const corner of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'] as VariableBindableNodeField[]) {
      (node as SceneNode).setBoundVariable(corner, variable);
    }
  } else {
    (node as SceneNode).setBoundVariable(figmaField, variable);
  }

  return {
    success: true, nodeId, variableId, variableName: variable.name, field,
    message: `Bound variable "${variable.name}" to ${field} on node "${(node as SceneNode).name}"`,
  };
}

export async function handleApplyPaintStyle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  const styleId = params.styleId as string;
  if (!nodeId || !styleId) throw new Error('nodeId and styleId are required');

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('fillStyleId' in node)) throw new Error(`Node ${nodeId} does not support paint styles`);

  const style = await figma.getStyleByIdAsync(styleId);
  if (!style) throw new Error(`Style not found: ${styleId}`);

  (node as GeometryMixin).fillStyleId = styleId;
  return { success: true, nodeId, styleId, styleName: style.name, message: `Applied paint style "${style.name}" to node "${(node as SceneNode).name}"` };
}

export async function handleApplyTextStyle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  const styleId = params.styleId as string;
  if (!nodeId || !styleId) throw new Error('nodeId and styleId are required');

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (node.type !== 'TEXT') throw new Error(`Node ${nodeId} is not a text node (type: ${node.type})`);

  const style = await figma.getStyleByIdAsync(styleId);
  if (!style) throw new Error(`Style not found: ${styleId}`);

  await figma.loadFontAsync((style as TextStyle).fontName);
  (node as TextNode).textStyleId = styleId;
  return { success: true, nodeId, styleId, styleName: style.name, message: `Applied text style "${style.name}" to node "${(node as SceneNode).name}"` };
}

export async function handleApplyEffectStyle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  const styleId = params.styleId as string;
  if (!nodeId || !styleId) throw new Error('nodeId and styleId are required');

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('effectStyleId' in node)) throw new Error(`Node ${nodeId} does not support effect styles`);

  const style = await figma.getStyleByIdAsync(styleId);
  if (!style) throw new Error(`Style not found: ${styleId}`);

  (node as BlendMixin).effectStyleId = styleId;
  return { success: true, nodeId, styleId, styleName: style.name, message: `Applied effect style "${style.name}" to node "${(node as SceneNode).name}"` };
}

export async function handleExportAsSvg(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('exportAsync' in node)) throw new Error(`Node ${nodeId} cannot be exported`);

  const includeChildren = (params.include_children as boolean) || false;

  if (includeChildren && 'children' in node) {
    const children = (node as FrameNode).children;
    const results: Array<{ name: string; id: string; svg: string }> = [];

    for (const child of children) {
      if (!('exportAsync' in child)) continue;
      const bytes = await (child as SceneNode).exportAsync({ format: 'SVG' });
      const svgString = String.fromCharCode.apply(null, Array.from(bytes));
      results.push({ name: child.name, id: child.id, svg: svgString });
    }

    return { nodeId, mode: 'children', count: results.length, children: results };
  }

  // Single node export
  const bytes = await (node as SceneNode).exportAsync({ format: 'SVG' });
  const svgString = String.fromCharCode.apply(null, Array.from(bytes));

  return { nodeId, mode: 'single', svg: svgString };
}

export async function handleSetConstraints(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('constraints' in node)) throw new Error(`Node ${nodeId} does not support constraints`);

  const sceneNode = node as SceneNode;

  // Check if parent uses auto-layout — constraints don't apply there
  if (sceneNode.parent && 'layoutMode' in sceneNode.parent) {
    const parentFrame = sceneNode.parent as FrameNode;
    if (parentFrame.layoutMode !== 'NONE') {
      return {
        nodeId,
        success: false,
        warning: `Parent "${parentFrame.name}" uses auto-layout (${parentFrame.layoutMode}). Constraints don't apply in auto-layout frames — use layoutAlign and layoutGrow instead.`,
      };
    }
  }

  const horizontal = (params.horizontal as string) || 'MIN';
  const vertical = (params.vertical as string) || 'MIN';

  const validValues = ['MIN', 'CENTER', 'MAX', 'STRETCH', 'SCALE'];
  if (!validValues.includes(horizontal)) throw new Error(`Invalid horizontal constraint: ${horizontal}. Must be one of: ${validValues.join(', ')}`);
  if (!validValues.includes(vertical)) throw new Error(`Invalid vertical constraint: ${vertical}. Must be one of: ${validValues.join(', ')}`);

  (node as ConstraintMixin).constraints = {
    horizontal: horizontal as ConstraintType,
    vertical: vertical as ConstraintType,
  };

  return { nodeId, horizontal, vertical, success: true };
}

export async function handleCreateFigmaVariables(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const collectionName = params.collectionName as string;
  const variables = params.variables as Array<{
    name: string;
    type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
    value: unknown;
    group?: string;
  }>;

  if (!collectionName || !variables || !Array.isArray(variables)) {
    throw new Error('collectionName and variables array are required');
  }

  // Check if collection already exists
  const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const existing = existingCollections.find(c => c.name === collectionName);
  if (existing) {
    const existingVars = await figma.variables.getLocalVariablesAsync();
    const collectionVars = existingVars.filter(v => existing.variableIds.includes(v.id));
    return {
      alreadyExists: true,
      collectionId: existing.id,
      collectionName: existing.name,
      variableCount: collectionVars.length,
      variables: collectionVars.map(v => ({ id: v.id, name: v.name, resolvedType: v.resolvedType })),
    };
  }

  // Create new collection
  const collection = figma.variables.createVariableCollection(collectionName);
  const defaultModeId = collection.modes[0].modeId;
  const createdVars: Array<{ id: string; name: string; type: string }> = [];

  for (const varDef of variables) {
    const fullName = varDef.group ? `${varDef.group}/${varDef.name}` : varDef.name;
    const resolvedType = varDef.type as VariableResolvedDataType;
    const variable = figma.variables.createVariable(fullName, collection, resolvedType);

    if (varDef.type === 'COLOR' && typeof varDef.value === 'string') {
      const rgb = hexToRgb(varDef.value);
      variable.setValueForMode(defaultModeId, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
    } else if (varDef.type === 'FLOAT' && typeof varDef.value === 'number') {
      variable.setValueForMode(defaultModeId, varDef.value);
    } else if (varDef.type === 'STRING' && typeof varDef.value === 'string') {
      variable.setValueForMode(defaultModeId, varDef.value);
    } else if (varDef.type === 'BOOLEAN' && typeof varDef.value === 'boolean') {
      variable.setValueForMode(defaultModeId, varDef.value);
    }

    createdVars.push({ id: variable.id, name: fullName, type: varDef.type });
  }

  return {
    alreadyExists: false,
    collectionId: collection.id,
    collectionName: collection.name,
    variableCount: createdVars.length,
    variables: createdVars,
  };
}

/**
 * ODS-4: Create multiple Figma Variable Collections in one call.
 * Supports upsert — if a collection exists, adds new variables to it (skips duplicates).
 */
export async function handleCreateVariableCollections(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const collections = params.collections as Array<{
    name: string;
    variables: Array<{
      name: string;
      type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
      value: unknown;
    }>;
  }>;

  if (!collections || !Array.isArray(collections)) {
    throw new Error('collections array is required');
  }

  // Query existing collections and variables once (O(1) lookups after)
  const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const allExistingVars = await figma.variables.getLocalVariablesAsync();

  const results: Array<{
    collectionId: string;
    collectionName: string;
    created: boolean;
    variableCount: number;
    skippedCount: number;
    variables: Array<{ id: string; name: string; type: string }>;
  }> = [];

  for (const collDef of collections) {
    if (!collDef.name || !collDef.variables || !Array.isArray(collDef.variables)) {
      continue; // skip malformed entries
    }

    let collection: VariableCollection;
    let created = false;
    let existingVarNames: Set<string>;

    // Check if collection already exists
    const existing = existingCollections.find(c => c.name === collDef.name);
    if (existing) {
      collection = existing;
      // Build set of existing variable names for dedup
      const collVars = allExistingVars.filter(v => existing.variableIds.includes(v.id));
      existingVarNames = new Set(collVars.map(v => v.name));
    } else {
      collection = figma.variables.createVariableCollection(collDef.name);
      created = true;
      existingVarNames = new Set();
    }

    const defaultModeId = collection.modes[0].modeId;
    const createdVars: Array<{ id: string; name: string; type: string }> = [];
    let skippedCount = 0;

    for (const varDef of collDef.variables) {
      const varName = varDef.name;

      // Skip if variable with this name already exists in collection
      if (existingVarNames.has(varName)) {
        skippedCount++;
        continue;
      }

      const resolvedType = varDef.type as VariableResolvedDataType;
      const variable = figma.variables.createVariable(varName, collection, resolvedType);

      if (varDef.type === 'COLOR' && typeof varDef.value === 'string') {
        const rgb = hexToRgb(varDef.value);
        variable.setValueForMode(defaultModeId, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
      } else if (varDef.type === 'FLOAT' && typeof varDef.value === 'number') {
        variable.setValueForMode(defaultModeId, varDef.value);
      } else if (varDef.type === 'STRING' && typeof varDef.value === 'string') {
        variable.setValueForMode(defaultModeId, varDef.value);
      } else if (varDef.type === 'BOOLEAN' && typeof varDef.value === 'boolean') {
        variable.setValueForMode(defaultModeId, varDef.value);
      }

      createdVars.push({ id: variable.id, name: varName, type: varDef.type });
      existingVarNames.add(varName); // prevent dups within same batch
    }

    results.push({
      collectionId: collection.id,
      collectionName: collDef.name,
      created,
      variableCount: createdVars.length,
      skippedCount,
      variables: createdVars,
    });
  }

  const totalCreated = results.reduce((sum, r) => sum + r.variableCount, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skippedCount, 0);

  return {
    collectionsProcessed: results.length,
    totalVariablesCreated: totalCreated,
    totalVariablesSkipped: totalSkipped,
    collections: results,
  };
}

/**
 * ODS-5: Create Figma Text Styles from typography config.
 * Each style = figma.createTextStyle() with font loading, size, weight, lineHeight (px), letterSpacing.
 */
export async function handleCreateTextStyles(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const styles = params.styles as Array<{
    name: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;   // pixels
    letterSpacing: number; // pixels
  }>;

  if (!styles || !Array.isArray(styles)) {
    throw new Error('styles array is required');
  }

  // Check for existing text styles to support upsert (skip duplicates)
  const existingStyles = await figma.getLocalTextStylesAsync();
  const existingNames = new Set(existingStyles.map(s => s.name));

  const createdStyles: Array<{ id: string; name: string; fontFamily: string; fontSize: number }> = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  for (const styleDef of styles) {
    // Skip if style already exists
    if (existingNames.has(styleDef.name)) {
      skipped.push(styleDef.name);
      continue;
    }

    // Clamp weight: never 600 (causes Inter fallback on non-Inter fonts)
    const clampedWeight = styleDef.fontWeight <= 500 ? 400 : 700;
    const fontStyleStr = getFontStyle(clampedWeight);

    // 3-tier font loading fallback
    let loadedFamily = styleDef.fontFamily;
    let loadedStyle = fontStyleStr;
    try {
      await figma.loadFontAsync({ family: styleDef.fontFamily, style: fontStyleStr });
    } catch {
      // Tier 2: try Regular
      try {
        await figma.loadFontAsync({ family: styleDef.fontFamily, style: 'Regular' });
        loadedStyle = 'Regular';
        warnings.push(`${styleDef.name}: weight "${fontStyleStr}" not available, fell back to Regular`);
      } catch {
        // Tier 3: skip this style entirely
        warnings.push(`${styleDef.name}: font "${styleDef.fontFamily}" not available, skipped`);
        continue;
      }
    }

    const textStyle = figma.createTextStyle();
    textStyle.name = styleDef.name;
    textStyle.fontName = { family: loadedFamily, style: loadedStyle };
    textStyle.fontSize = styleDef.fontSize;
    textStyle.lineHeight = { value: styleDef.lineHeight, unit: 'PIXELS' };
    textStyle.letterSpacing = { value: styleDef.letterSpacing, unit: 'PIXELS' };

    createdStyles.push({
      id: textStyle.id,
      name: textStyle.name,
      fontFamily: loadedFamily,
      fontSize: styleDef.fontSize,
    });
  }

  return {
    stylesCreated: createdStyles.length,
    stylesSkipped: skipped.length,
    skipped,
    warnings,
    styles: createdStyles,
  };
}

/**
 * ODS-6a + IC-9: Create base DS components (Button, Card, Badge).
 * Uses figma.createComponent() with auto-layout. Variable binding attempted where API supports it.
 * When interactive: true, auto-generates variant states and wires prototype interactions.
 */

/** Adjust a Figma 0-1 RGB color toward white (factor > 0) or black (factor < 0). */
function adjustFillColor(rgb: { r: number; g: number; b: number }, factor: number): { r: number; g: number; b: number } {
  if (factor > 0) {
    return { r: rgb.r + (1 - rgb.r) * factor, g: rgb.g + (1 - rgb.g) * factor, b: rgb.b + (1 - rgb.b) * factor };
  }
  return { r: rgb.r * (1 + factor), g: rgb.g * (1 + factor), b: rgb.b * (1 + factor) };
}

/** Clone a ComponentNode's visual properties into a new component for variant creation. */
async function cloneComponentForVariant(
  source: ComponentNode,
  variantName: string,
  fillRgb: { r: number; g: number; b: number },
  parent: PageNode,
): Promise<ComponentNode> {
  // Create a new component with same dimensions
  const clone = figma.createComponent();
  clone.name = variantName;
  clone.resize(source.width, source.height);

  // Copy auto-layout properties
  clone.layoutMode = source.layoutMode;
  clone.primaryAxisAlignItems = source.primaryAxisAlignItems;
  clone.counterAxisAlignItems = source.counterAxisAlignItems;
  clone.paddingTop = source.paddingTop;
  clone.paddingRight = source.paddingRight;
  clone.paddingBottom = source.paddingBottom;
  clone.paddingLeft = source.paddingLeft;
  clone.itemSpacing = source.itemSpacing;
  clone.cornerRadius = source.cornerRadius;
  clone.layoutSizingVertical = source.layoutSizingVertical;
  clone.layoutSizingHorizontal = source.layoutSizingHorizontal;

  // Set variant fill
  clone.fills = [{ type: 'SOLID', color: fillRgb }];

  // Clone text children
  for (const child of source.children) {
    if (child.type === 'TEXT') {
      const srcText = child as TextNode;
      const fontName = srcText.fontName as FontName;
      try {
        await figma.loadFontAsync(fontName);
      } catch {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      }
      const textNode = figma.createText();
      textNode.fontName = fontName;
      textNode.characters = srcText.characters;
      textNode.fontSize = srcText.fontSize as number;
      const _lh = srcText.lineHeight as { unit: string; value?: number };
      if (_lh && _lh.unit !== 'AUTO' && typeof _lh.value === 'number') {
        textNode.lineHeight = srcText.lineHeight as LineHeight;
      }
      textNode.fills = JSON.parse(JSON.stringify(srcText.fills));
      textNode.layoutSizingHorizontal = srcText.layoutSizingHorizontal;
      clone.appendChild(textNode);
    }
  }

  parent.appendChild(clone);
  return clone;
}

export async function handleCreateDSComponents(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const interactive = params.interactive === true;
  const config = params as {
    components: Array<{
      type: 'button' | 'card' | 'badge';
      name: string;
      fillColor: string;       // hex fallback
      textColor: string;       // hex for text fill
      fontFamily: string;
      fontSize: number;
      fontWeight: number;
      lineHeight: number;      // px
      text: string;            // default label
      cornerRadius: number;
      padding: { top: number; right: number; bottom: number; left: number };
      itemSpacing: number;
      width?: number;          // fixed width (for Card)
      textStyleId?: string;    // from ODS-5
      fillVariableId?: string; // from ODS-4 for variable binding
      // Card-specific
      children?: Array<{
        text: string;
        fontFamily: string;
        fontSize: number;
        fontWeight: number;
        lineHeight: number;
        textColor: string;
        textStyleId?: string;
      }>;
    }>;
    interactive?: boolean;
  };

  if (!config.components || !Array.isArray(config.components)) {
    throw new Error('components array is required');
  }

  // Get or create "Design System" page
  let dsPage = figma.root.children.find(p => p.name === 'Design System') as PageNode | undefined;
  if (!dsPage) {
    dsPage = figma.createPage();
    dsPage.name = 'Design System';
  }

  const createdComponents: Array<{ id: string; name: string; type: string; variantSetId?: string; variants?: string[] }> = [];
  const warnings: string[] = [];
  let xOffset = 0;

  for (const compDef of config.components) {
    // Clamp weight
    const clampedWeight = compDef.fontWeight <= 500 ? 400 : 700;
    const fontStyle = getFontStyle(clampedWeight);

    // Load font
    try {
      await figma.loadFontAsync({ family: compDef.fontFamily, style: fontStyle });
    } catch {
      try {
        await figma.loadFontAsync({ family: compDef.fontFamily, style: 'Regular' });
      } catch {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        warnings.push(`${compDef.name}: font "${compDef.fontFamily}" not available, fell back to Inter`);
      }
    }

    // Create component
    const component = figma.createComponent();
    component.name = interactive ? 'state=default' : compDef.name;

    // Auto-layout
    const isVertical = compDef.type === 'card';
    component.layoutMode = isVertical ? 'VERTICAL' : 'HORIZONTAL';
    component.primaryAxisAlignItems = 'CENTER';
    component.counterAxisAlignItems = 'CENTER';
    component.paddingTop = compDef.padding.top;
    component.paddingRight = compDef.padding.right;
    component.paddingBottom = compDef.padding.bottom;
    component.paddingLeft = compDef.padding.left;
    component.itemSpacing = compDef.itemSpacing;
    component.cornerRadius = compDef.cornerRadius;

    if (compDef.width) {
      component.resize(compDef.width, component.height);
      component.layoutSizingHorizontal = 'FIXED';
    }
    component.layoutSizingVertical = 'HUG';

    // Fill color
    const rgb = hexToRgb(compDef.fillColor);
    component.fills = [{ type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b } }];

    // Try variable binding for fill
    if (compDef.fillVariableId) {
      try {
        const variable = await figma.variables.getVariableByIdAsync(compDef.fillVariableId);
        if (variable) {
          component.setBoundVariable('fills' as VariableBindableNodeField, variable);
        }
      } catch {
        warnings.push(`${compDef.name}: fill variable binding failed, using hardcoded color`);
      }
    }

    // Create text children
    const textDefs = compDef.children || [{
      text: compDef.text,
      fontFamily: compDef.fontFamily,
      fontSize: compDef.fontSize,
      fontWeight: compDef.fontWeight,
      lineHeight: compDef.lineHeight,
      textColor: compDef.textColor,
      textStyleId: compDef.textStyleId,
    }];

    for (const textDef of textDefs) {
      const textClampedWeight = textDef.fontWeight <= 500 ? 400 : 700;
      const textFontStyle = getFontStyle(textClampedWeight);

      // Load text font
      try {
        await figma.loadFontAsync({ family: textDef.fontFamily, style: textFontStyle });
      } catch {
        try {
          await figma.loadFontAsync({ family: textDef.fontFamily, style: 'Regular' });
        } catch {
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        }
      }

      const textNode = figma.createText();
      textNode.fontName = { family: textDef.fontFamily, style: textFontStyle };
      textNode.characters = textDef.text;
      textNode.fontSize = textDef.fontSize;
      textNode.lineHeight = { value: textDef.lineHeight, unit: 'PIXELS' };

      // Text fill color
      const textRgb = hexToRgb(textDef.textColor);
      textNode.fills = [{ type: 'SOLID', color: { r: textRgb.r, g: textRgb.g, b: textRgb.b } }];

      // Apply text style if available
      if (textDef.textStyleId) {
        try {
          const style = figma.getStyleById(textDef.textStyleId);
          if (style && style.type === 'TEXT') {
            textNode.textStyleId = style.id;
          }
        } catch {
          // Text style not found — inline properties already set
        }
      }

      // Auto-layout child sizing
      textNode.layoutSizingHorizontal = compDef.width ? 'FILL' : 'HUG';

      component.appendChild(textNode);
    }

    // Move to DS page
    dsPage.appendChild(component);
    component.x = xOffset;
    component.y = 0;

    // ═══════════════════════════════════════════════════════════
    // IC-9: Interactive variant creation
    // ═══════════════════════════════════════════════════════════
    if (interactive) {
      const baseRgb = hexToRgb(compDef.fillColor);
      const isCard = compDef.type === 'card';

      // Hover variant: lighten fill by 15%
      const hoverRgb = adjustFillColor(baseRgb, 0.15);
      const hoverComp = await cloneComponentForVariant(component, 'state=hover', hoverRgb, dsPage);
      hoverComp.x = component.x;
      hoverComp.y = component.y + component.height + 16;

      const variantComponents: ComponentNode[] = [component, hoverComp];
      const variantNames = ['default', 'hover'];

      // Pressed variant: only for button/badge (max 3 variants)
      let pressedComp: ComponentNode | undefined;
      if (!isCard) {
        const pressedRgb = adjustFillColor(baseRgb, -0.15);
        pressedComp = await cloneComponentForVariant(component, 'state=pressed', pressedRgb, dsPage);
        pressedComp.x = component.x;
        pressedComp.y = hoverComp.y + hoverComp.height + 16;
        variantComponents.push(pressedComp);
        variantNames.push('pressed');
      }

      // Combine as variants
      const componentSet = figma.combineAsVariants(variantComponents, dsPage);
      componentSet.name = compDef.name;

      // Match Figma's manual variant layout: vertical auto-layout with padding + spacing
      componentSet.layoutMode = 'VERTICAL';
      componentSet.paddingTop = 32;
      componentSet.paddingRight = 32;
      componentSet.paddingBottom = 32;
      componentSet.paddingLeft = 32;
      componentSet.itemSpacing = 16;
      componentSet.primaryAxisSizingMode = 'AUTO';
      componentSet.counterAxisSizingMode = 'AUTO';

      componentSet.x = xOffset;
      componentSet.y = 0;

      // Find the default variant inside the set to wire reactions on it
      const defaultVariant = componentSet.children.find(c =>
        c.type === 'COMPONENT' && (c as ComponentNode).variantProperties?.state === 'default'
      ) as ComponentNode | undefined;

      const hoverVariant = componentSet.children.find(c =>
        c.type === 'COMPONENT' && (c as ComponentNode).variantProperties?.state === 'hover'
      ) as ComponentNode | undefined;

      const pressedVariant = componentSet.children.find(c =>
        c.type === 'COMPONENT' && (c as ComponentNode).variantProperties?.state === 'pressed'
      ) as ComponentNode | undefined;

      // Wire interactions on the default variant
      if (defaultVariant && hoverVariant) {
        const reactions: Reaction[] = [];

        // One-way hover: ON_HOVER → CHANGE_TO hover variant (Figma snaps back automatically)
        reactions.push({
          trigger: { type: 'ON_HOVER' } as Trigger,
          actions: [{
            type: 'NODE',
            destinationId: hoverVariant.id,
            navigation: 'CHANGE_TO' as Navigation,
            transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 300 } as SimpleTransition,
            resetScrollPosition: false,
            resetInteractiveComponents: false,
          } as Action],
        });

        // button-press preset: MOUSE_DOWN → pressed, MOUSE_UP → default (button/badge only)
        if (pressedVariant && !isCard) {
          reactions.push({
            trigger: { type: 'MOUSE_DOWN', delay: 0 } as Trigger,
            actions: [{
              type: 'NODE',
              destinationId: pressedVariant.id,
              navigation: 'CHANGE_TO' as Navigation,
              transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_IN' }, duration: 80 } as SimpleTransition,
              resetScrollPosition: false,
              resetInteractiveComponents: false,
            } as Action],
          });
          reactions.push({
            trigger: { type: 'MOUSE_UP', delay: 0 } as Trigger,
            actions: [{
              type: 'NODE',
              destinationId: defaultVariant.id,
              navigation: 'CHANGE_TO' as Navigation,
              transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 120 } as SimpleTransition,
              resetScrollPosition: false,
              resetInteractiveComponents: false,
            } as Action],
          });
        }

        await defaultVariant.setReactionsAsync(reactions);
      }

      xOffset += componentSet.width + 64;

      createdComponents.push({
        id: componentSet.id,
        name: componentSet.name,
        type: compDef.type,
        variantSetId: componentSet.id,
        variants: variantNames,
      });
    } else {
      // Non-interactive: original behavior
      xOffset += (compDef.width || component.width) + 64;

      createdComponents.push({
        id: component.id,
        name: component.name,
        type: compDef.type,
      });
    }
  }

  return {
    componentsCreated: createdComponents.length,
    dsPageId: dsPage.id,
    interactive,
    warnings,
    components: createdComponents,
  };
}
