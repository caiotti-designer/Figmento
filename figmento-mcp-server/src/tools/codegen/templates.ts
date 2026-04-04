/**
 * Per-action code template functions.
 * Each returns a JavaScript code string for one Figma Plugin API operation.
 */

type Params = Record<string, unknown>;

// ─── Font Fallback Map ──────────────────────────────────────
// Proprietary/unavailable fonts → closest Google Font available in Figma.
// Used when a design system specifies a custom font that isn't installed.
const FONT_FALLBACK: Record<string, string> = {
  // Stripe
  'sohne-var': 'DM Sans',
  'sohne': 'DM Sans',
  'SourceCodePro': 'Source Code Pro',
  // Linear
  'Inter Variable': 'Inter',
  'Berkeley Mono': 'JetBrains Mono',
  // Claude / Anthropic
  'Anthropic Serif': 'Source Serif 4',
  'Anthropic Sans': 'DM Sans',
  'Anthropic Mono': 'DM Mono',
  // Figma
  'figmaSans': 'Plus Jakarta Sans',
  'figmaMono': 'JetBrains Mono',
  // Notion
  'NotionInter': 'Inter',
  // Vercel
  'Geist': 'Inter',
  'Geist Mono': 'JetBrains Mono',
};

function resolveFontFamily(requested: string | undefined): string {
  if (!requested) return 'Inter';
  return FONT_FALLBACK[requested] || requested;
}

// ─── Canvas Templates ────────────────────────────────────────

export function createFrame(p: Params, v: string, parentVar?: string): string {
  const lines = [`const ${v} = figma.createFrame();`];
  lines.push(`${v}.name = ${JSON.stringify(p.name || 'Frame')};`);
  lines.push(`${v}.resize(${p.width || 100}, ${p.height || 100});`);
  if (p.x !== undefined) lines.push(`${v}.x = ${p.x};`);
  if (p.y !== undefined) lines.push(`${v}.y = ${p.y};`);

  // Fills
  if (p.fills) {
    lines.push(`${v}.fills = ${emitFills(p.fills as unknown[])};`);
  } else if (p.fillColor) {
    lines.push(`${v}.fills = [{ type: 'SOLID', color: hexToRgb(${JSON.stringify(p.fillColor)}) }];`);
  }

  if (p.cornerRadius !== undefined) lines.push(`${v}.cornerRadius = ${p.cornerRadius};`);
  if (p.clipsContent !== undefined) lines.push(`${v}.clipsContent = ${p.clipsContent};`);

  // Auto-layout
  if (p.layoutMode) {
    lines.push(`${v}.layoutMode = ${JSON.stringify(p.layoutMode)};`);
    if (p.itemSpacing !== undefined) lines.push(`${v}.itemSpacing = ${p.itemSpacing};`);
    if (p.paddingTop !== undefined) lines.push(`${v}.paddingTop = ${p.paddingTop};`);
    if (p.paddingRight !== undefined) lines.push(`${v}.paddingRight = ${p.paddingRight};`);
    if (p.paddingBottom !== undefined) lines.push(`${v}.paddingBottom = ${p.paddingBottom};`);
    if (p.paddingLeft !== undefined) lines.push(`${v}.paddingLeft = ${p.paddingLeft};`);
    if (p.primaryAxisAlignItems) lines.push(`${v}.primaryAxisAlignItems = ${JSON.stringify(p.primaryAxisAlignItems)};`);
    if (p.counterAxisAlignItems) lines.push(`${v}.counterAxisAlignItems = ${JSON.stringify(p.counterAxisAlignItems)};`);
    if (p.primaryAxisSizingMode) lines.push(`${v}.primaryAxisSizingMode = ${JSON.stringify(p.primaryAxisSizingMode === 'HUG' ? 'AUTO' : p.primaryAxisSizingMode)};`);
    if (p.counterAxisSizingMode) lines.push(`${v}.counterAxisSizingMode = ${JSON.stringify(p.counterAxisSizingMode === 'HUG' ? 'AUTO' : p.counterAxisSizingMode)};`);
  }

  if (parentVar) lines.push(`${parentVar}.appendChild(${v});`);

  // Layout sizing must be set AFTER appendChild
  if (p.layoutSizingHorizontal) lines.push(`${v}.layoutSizingHorizontal = ${JSON.stringify(p.layoutSizingHorizontal)};`);
  if (p.layoutSizingVertical) lines.push(`${v}.layoutSizingVertical = ${JSON.stringify(p.layoutSizingVertical)};`);

  return lines.join('\n');
}

export function createText(p: Params, v: string, parentVar?: string): string {
  const family = resolveFontFamily(p.fontFamily as string);
  const weight = (p.fontWeight as number) || 400;
  const text = (p.text || p.content || '') as string;

  const lines = [
    `await figma.loadFontAsync({ family: ${JSON.stringify(family)}, style: getFontStyle(${weight}) });`,
    `const ${v} = figma.createText();`,
    `${v}.name = ${JSON.stringify(p.name || 'Text')};`,
    `${v}.fontName = { family: ${JSON.stringify(family)}, style: getFontStyle(${weight}) };`,
    `${v}.fontSize = ${p.fontSize || 16};`,
    `${v}.characters = ${JSON.stringify(text)};`,
  ];

  // Color
  const color = (p.color || p.fillColor || '#000000') as string;
  lines.push(`${v}.fills = [{ type: 'SOLID', color: hexToRgb(${JSON.stringify(color)}) }];`);

  if (p.textAlignHorizontal || p.textAlign) {
    lines.push(`${v}.textAlignHorizontal = ${JSON.stringify(p.textAlignHorizontal || p.textAlign)};`);
  }
  if (p.lineHeight !== undefined) {
    lines.push(`${v}.lineHeight = { value: ${p.lineHeight}, unit: 'PIXELS' };`);
  }
  if (p.letterSpacing !== undefined) {
    lines.push(`${v}.letterSpacing = { value: ${p.letterSpacing}, unit: 'PIXELS' };`);
  }
  if (p.textAutoResize) {
    lines.push(`${v}.textAutoResize = ${JSON.stringify(p.textAutoResize)};`);
  }

  if (p.width) lines.push(`${v}.resize(${p.width}, ${p.height || (p.fontSize || 16) * 1.5});`);

  if (parentVar) lines.push(`${parentVar}.appendChild(${v});`);
  if (p.layoutSizingHorizontal) lines.push(`${v}.layoutSizingHorizontal = ${JSON.stringify(p.layoutSizingHorizontal)};`);
  if (p.layoutSizingVertical) lines.push(`${v}.layoutSizingVertical = ${JSON.stringify(p.layoutSizingVertical)};`);

  return lines.join('\n');
}

export function createRectangle(p: Params, v: string, parentVar?: string): string {
  const lines = [`const ${v} = figma.createRectangle();`];
  lines.push(`${v}.name = ${JSON.stringify(p.name || 'Rectangle')};`);
  lines.push(`${v}.resize(${p.width || 100}, ${p.height || 100});`);
  if (p.x !== undefined) lines.push(`${v}.x = ${p.x};`);
  if (p.y !== undefined) lines.push(`${v}.y = ${p.y};`);

  if (p.fills) {
    lines.push(`${v}.fills = ${emitFills(p.fills as unknown[])};`);
  } else if (p.fillColor) {
    lines.push(`${v}.fills = [{ type: 'SOLID', color: hexToRgb(${JSON.stringify(p.fillColor)}) }];`);
  }

  if (p.cornerRadius !== undefined) lines.push(`${v}.cornerRadius = ${p.cornerRadius};`);

  if (p.stroke) {
    const s = p.stroke as Record<string, unknown>;
    lines.push(`${v}.strokes = [{ type: 'SOLID', color: hexToRgb(${JSON.stringify(s.color || '#000000')}) }];`);
    lines.push(`${v}.strokeWeight = ${s.width || 1};`);
  }

  if (parentVar) lines.push(`${parentVar}.appendChild(${v});`);
  if (p.layoutSizingHorizontal) lines.push(`${v}.layoutSizingHorizontal = ${JSON.stringify(p.layoutSizingHorizontal)};`);
  if (p.layoutSizingVertical) lines.push(`${v}.layoutSizingVertical = ${JSON.stringify(p.layoutSizingVertical)};`);

  return lines.join('\n');
}

export function createEllipse(p: Params, v: string, parentVar?: string): string {
  const lines = [`const ${v} = figma.createEllipse();`];
  lines.push(`${v}.name = ${JSON.stringify(p.name || 'Ellipse')};`);
  lines.push(`${v}.resize(${p.width || 100}, ${p.height || 100});`);
  if (p.x !== undefined) lines.push(`${v}.x = ${p.x};`);
  if (p.y !== undefined) lines.push(`${v}.y = ${p.y};`);
  if (p.fills) lines.push(`${v}.fills = ${emitFills(p.fills as unknown[])};`);
  else if (p.fillColor) lines.push(`${v}.fills = [{ type: 'SOLID', color: hexToRgb(${JSON.stringify(p.fillColor)}) }];`);
  if (parentVar) lines.push(`${parentVar}.appendChild(${v});`);
  return lines.join('\n');
}

export function createVector(p: Params, v: string, parentVar?: string): string {
  const lines = [`const ${v} = figma.createVector();`];
  lines.push(`${v}.name = ${JSON.stringify(p.name || 'Vector')};`);
  if (p.vectorPaths) lines.push(`${v}.vectorPaths = ${JSON.stringify(p.vectorPaths)};`);
  if (p.width && p.height) lines.push(`${v}.resize(${p.width}, ${p.height});`);
  if (p.x !== undefined) lines.push(`${v}.x = ${p.x};`);
  if (p.y !== undefined) lines.push(`${v}.y = ${p.y};`);
  if (p.fills) lines.push(`${v}.fills = ${emitFills(p.fills as unknown[])};`);
  if (parentVar) lines.push(`${parentVar}.appendChild(${v});`);
  return lines.join('\n');
}

export function createComponent(p: Params, v: string, parentVar?: string): string {
  const lines = [`const ${v} = figma.createComponent();`];
  lines.push(`${v}.name = ${JSON.stringify(p.name || 'Component')};`);
  if (p.width && p.height) lines.push(`${v}.resize(${p.width}, ${p.height});`);
  if (p.fills) lines.push(`${v}.fills = ${emitFills(p.fills as unknown[])};`);
  else if (p.fillColor) lines.push(`${v}.fills = [{ type: 'SOLID', color: hexToRgb(${JSON.stringify(p.fillColor)}) }];`);
  if (parentVar) lines.push(`${parentVar}.appendChild(${v});`);
  return lines.join('\n');
}

// ─── Style Templates ─────────────────────────────────────────

export function setStyle(p: Params, v: string): string {
  const prop = p.property as string;
  switch (prop) {
    case 'fill': return setFill(p, v);
    case 'stroke': return setStroke(p, v);
    case 'effects': return setEffects(p, v);
    case 'cornerRadius': return setCornerRadius(p, v);
    case 'opacity': return `${v}.opacity = ${p.opacity ?? 1};`;
    default: return `// Unknown set_style property: ${prop}`;
  }
}

function setFill(p: Params, v: string): string {
  if (p.fills) return `${v}.fills = ${emitFills(p.fills as unknown[])};`;
  if (p.color) return `${v}.fills = [{ type: 'SOLID', color: hexToRgb(${JSON.stringify(p.color)}), opacity: ${p.opacity ?? 1} }];`;
  return '';
}

function setStroke(p: Params, v: string): string {
  const lines: string[] = [];
  if (p.color) lines.push(`${v}.strokes = [{ type: 'SOLID', color: hexToRgb(${JSON.stringify(p.color)}) }];`);
  lines.push(`${v}.strokeWeight = ${p.width || 1};`);
  return lines.join('\n');
}

function setEffects(p: Params, v: string): string {
  const effects = p.effects as Array<Record<string, unknown>>;
  if (!effects) return '';
  const mapped = effects.map(e => {
    const color = e.color as string || '#000000';
    const offset = e.offset as Record<string, number> || { x: 0, y: 4 };
    return `{ type: ${JSON.stringify(e.type || 'DROP_SHADOW')}, color: { ...hexToRgb(${JSON.stringify(color)}), a: ${e.opacity ?? 0.25} }, offset: { x: ${offset.x || 0}, y: ${offset.y || 4} }, radius: ${e.blur || 4}, spread: ${e.spread || 0}, visible: true, blendMode: 'NORMAL' }`;
  });
  return `${v}.effects = [${mapped.join(', ')}];`;
}

function setCornerRadius(p: Params, v: string): string {
  const r = p.cornerRadius ?? p.radius;
  if (Array.isArray(r)) {
    return [
      `${v}.topLeftRadius = ${r[0]};`,
      `${v}.topRightRadius = ${r[1]};`,
      `${v}.bottomRightRadius = ${r[2]};`,
      `${v}.bottomLeftRadius = ${r[3]};`,
    ].join('\n');
  }
  return `${v}.cornerRadius = ${r};`;
}

export function setAutoLayout(p: Params, v: string): string {
  const lines: string[] = [];
  lines.push(`${v}.layoutMode = ${JSON.stringify(p.layoutMode || 'VERTICAL')};`);
  if (p.itemSpacing !== undefined) lines.push(`${v}.itemSpacing = ${p.itemSpacing};`);
  if (p.paddingTop !== undefined) lines.push(`${v}.paddingTop = ${p.paddingTop};`);
  if (p.paddingRight !== undefined) lines.push(`${v}.paddingRight = ${p.paddingRight};`);
  if (p.paddingBottom !== undefined) lines.push(`${v}.paddingBottom = ${p.paddingBottom};`);
  if (p.paddingLeft !== undefined) lines.push(`${v}.paddingLeft = ${p.paddingLeft};`);
  if (p.primaryAxisAlignItems) lines.push(`${v}.primaryAxisAlignItems = ${JSON.stringify(p.primaryAxisAlignItems)};`);
  if (p.counterAxisAlignItems) lines.push(`${v}.counterAxisAlignItems = ${JSON.stringify(p.counterAxisAlignItems)};`);
  if (p.layoutWrap) lines.push(`${v}.layoutWrap = ${JSON.stringify(p.layoutWrap)};`);
  return lines.join('\n');
}

export function setText(p: Params, v: string): string {
  const family = resolveFontFamily(p.fontFamily as string);
  const weight = (p.fontWeight as number) || 400;
  const lines = [
    `await figma.loadFontAsync({ family: ${JSON.stringify(family)}, style: getFontStyle(${weight}) });`,
    `${v}.characters = ${JSON.stringify(p.text || p.characters || '')};`,
  ];
  if (p.fontSize) lines.push(`${v}.fontSize = ${p.fontSize};`);
  if (p.color) lines.push(`${v}.fills = [{ type: 'SOLID', color: hexToRgb(${JSON.stringify(p.color)}) }];`);
  return lines.join('\n');
}

// ─── Scene Templates ─────────────────────────────────────────

export function transformNode(p: Params, v: string): string {
  const lines: string[] = [];
  if (p.x !== undefined) lines.push(`${v}.x = ${p.x};`);
  if (p.y !== undefined) lines.push(`${v}.y = ${p.y};`);
  if (p.width !== undefined && p.height !== undefined) {
    lines.push(`${v}.resize(${p.width}, ${p.height});`);
  } else if (p.width !== undefined) {
    lines.push(`${v}.resize(${p.width}, ${v}.height);`);
  } else if (p.height !== undefined) {
    lines.push(`${v}.resize(${v}.width, ${p.height});`);
  }
  return lines.join('\n');
}

export function renameNode(p: Params, v: string): string {
  return `${v}.name = ${JSON.stringify(p.name || 'Renamed')};`;
}

export function deleteNode(_p: Params, v: string): string {
  return `${v}.remove();`;
}

export function appendChild(p: Params, _v: string): string {
  // Special: needs both parent and child resolved
  return `figma.getNodeById(${JSON.stringify(p.parentId)}).appendChild(figma.getNodeById(${JSON.stringify(p.childId)}));`;
}

export function reorderChild(p: Params, _v: string): string {
  const idx = p.index as number | undefined;
  if (idx !== undefined) {
    return `figma.getNodeById(${JSON.stringify(p.parentId)}).insertChild(${idx}, figma.getNodeById(${JSON.stringify(p.childId)}));`;
  }
  return `figma.getNodeById(${JSON.stringify(p.parentId)}).appendChild(figma.getNodeById(${JSON.stringify(p.childId)}));`;
}

export function groupNodes(p: Params, v: string): string {
  const ids = p.nodeIds as string[];
  return `const ${v} = figma.group([${ids.map(id => `figma.getNodeById(${JSON.stringify(id)})`).join(', ')}], figma.currentPage);`;
}

export function cloneNode(p: Params, v: string): string {
  return `const ${v} = figma.getNodeById(${JSON.stringify(p.nodeId)}).clone();`;
}

export function findNodes(p: Params, v: string): string {
  const name = p.name as string | undefined;
  const type = p.type as string | undefined;
  let filter = '() => true';
  if (name && type) filter = `n => n.name === ${JSON.stringify(name)} && n.type === ${JSON.stringify(type)}`;
  else if (name) filter = `n => n.name === ${JSON.stringify(name)}`;
  else if (type) filter = `n => n.type === ${JSON.stringify(type)}`;
  return `const ${v} = figma.currentPage.findAll(${filter});`;
}

// ─── Figma Native Templates ──────────────────────────────────

export function readFigmaContext(_p: Params, v: string): string {
  return [
    `const ${v}_vars = await figma.variables.getLocalVariablesAsync();`,
    `const ${v}_paintStyles = await figma.getLocalPaintStylesAsync();`,
    `const ${v}_textStyles = await figma.getLocalTextStylesAsync();`,
    `const ${v}_effectStyles = await figma.getLocalEffectStylesAsync();`,
  ].join('\n');
}

export function bindVariable(p: Params, v: string): string {
  return `${v}.setBoundVariable(${JSON.stringify(p.field)}, ${JSON.stringify(p.variableId)});`;
}

// ─── Fill emission helper ────────────────────────────────────

function emitFills(fills: unknown[]): string {
  const parts = (fills as Array<Record<string, unknown>>).map(f => {
    if (f.type === 'SOLID') {
      const color = f.color as string || '#000000';
      return `{ type: 'SOLID', color: hexToRgb(${JSON.stringify(color)}), opacity: ${f.opacity ?? 1} }`;
    }
    if ((f.type as string)?.includes('GRADIENT')) {
      const dir = (f.gradientDirection as string) || 'top-bottom';
      const stops = (f.gradientStops as Array<Record<string, unknown>>) || [];
      const stopsCode = stops.map(s =>
        `{ position: ${s.position}, color: { ...hexToRgb(${JSON.stringify(s.color || '#000000')}), a: ${s.opacity ?? 1} } }`
      ).join(', ');
      return `{ type: ${JSON.stringify(f.type)}, gradientTransform: gradientTransforms[${JSON.stringify(dir)}] || gradientTransforms['top-bottom'], gradientStops: [${stopsCode}] }`;
    }
    return JSON.stringify(f);
  });
  return `[${parts.join(', ')}]`;
}

// ─── Template Registry ───────────────────────────────────────

export type CodeTemplate = (params: Params, varName: string, parentVar?: string) => string;

export const TEMPLATES: Record<string, CodeTemplate> = {
  // Canvas
  create_frame: createFrame,
  create_text: createText,
  create_rectangle: createRectangle,
  create_ellipse: createEllipse,
  create_vector: createVector,
  create_component: createComponent,
  // Style
  set_style: setStyle,
  set_fill: (p, v) => setFill(p, v),
  set_stroke: (p, v) => setStroke(p, v),
  set_effects: (p, v) => setEffects(p, v),
  set_corner_radius: (p, v) => setCornerRadius(p, v),
  set_opacity: (p, v) => `${v}.opacity = ${p.opacity ?? 1};`,
  set_auto_layout: setAutoLayout,
  set_text: setText,
  // Scene
  transform_node: transformNode,
  move_node: (p, v) => { const l: string[] = []; if (p.x !== undefined) l.push(`${v}.x = ${p.x};`); if (p.y !== undefined) l.push(`${v}.y = ${p.y};`); return l.join('\n'); },
  resize_node: (p, v) => `${v}.resize(${p.width || `${v}.width`}, ${p.height || `${v}.height`});`,
  rename_node: renameNode,
  delete_node: deleteNode,
  append_child: appendChild,
  reorder_child: reorderChild,
  group_nodes: groupNodes,
  clone_node: cloneNode,
  find_nodes: findNodes,
  // Figma native
  read_figma_context: readFigmaContext,
  bind_variable: bindVariable,
};
