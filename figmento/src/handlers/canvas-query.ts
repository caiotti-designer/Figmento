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
      return {
        color: rgbToHex(first.color),
        weight: ('strokeWeight' in n) ? (n as GeometryMixin).strokeWeight as number : 1,
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
    fills: 'fills', strokes: 'strokes', opacity: 'opacity',
    width: 'width', height: 'height',
    paddingTop: 'paddingTop', paddingRight: 'paddingRight',
    paddingBottom: 'paddingBottom', paddingLeft: 'paddingLeft',
    itemSpacing: 'itemSpacing', cornerRadius: 'topLeftRadius',
    fontSize: 'fontSize', fontFamily: 'fontFamily', fontWeight: 'fontWeight',
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
