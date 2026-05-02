/// <reference types="@figma/plugin-typings" />

/**
 * Frame Presets (UI label: "Templates")
 *
 * Two scopes:
 *   - 'builtin' — Caiotti presets baked into code (frame skeletons only)
 *   - 'user'    — saved by the user, persisted in figma.clientStorage
 *
 * v2 capture (this file):
 *   When the user saves a selection, we recursively serialize the entire
 *   subtree — text content + font config, fills (solid + gradient), strokes,
 *   corner radii, auto-layout, opacity, rotation, children. Image fills
 *   become placeholders (gray rectangles tagged so the user can fill them
 *   later). v1's flat PresetFrame[] shape is preserved on the Preset type
 *   for backward-compat with anything already in clientStorage.
 *
 * Naming: this module is `presets` not `templates` because handlers/templates.ts
 * already exists for the legacy AI-fill (#-prefixed placeholder) flow.
 */

const STORAGE_KEY_USER_PRESETS = 'figmento-user-presets';
const PRESET_GAP = 100; // px gap when instantiating multi-frame presets
const PRESET_VERSION = 2;

// ═══════════════════════════════════════════════════════════════
// DATA SHAPES
// ═══════════════════════════════════════════════════════════════

export interface PresetColor {
  r: number;
  g: number;
  b: number;
}

export interface PresetFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'IMAGE_PLACEHOLDER';
  visible?: boolean;
  opacity?: number;
  // SOLID
  color?: PresetColor;
  // GRADIENT
  gradientStops?: { position: number; color: { r: number; g: number; b: number; a: number } }[];
  gradientTransform?: number[][];
  // IMAGE_PLACEHOLDER
  scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE';
}

export interface PresetStroke {
  type: 'SOLID';
  visible?: boolean;
  opacity?: number;
  color: PresetColor;
}

export interface PresetFontName {
  family: string;
  style: string;
}

/**
 * v2.5: effects (drop shadow, inner shadow, layer/background blur).
 * Stores the full effect payload — Figma accepts this shape directly via node.effects = [...].
 */
export interface PresetEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible?: boolean;
  // Shadow-only
  color?: { r: number; g: number; b: number; a: number };
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  blendMode?: BlendMode;
  showShadowBehindNode?: boolean;
  // Blur-only — radius reused
}

/**
 * v2.5: per-character text styling for mixed runs.
 * When a TextNode has any mixed property (fontSize, fontName, fills, etc.),
 * we walk character ranges and emit one entry per contiguous span.
 */
export interface PresetTextRange {
  start: number;
  end: number;
  fontName?: PresetFontName;
  fontSize?: number;
  fills?: PresetFill[];
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  letterSpacing?: { value: number; unit: 'PIXELS' | 'PERCENT' };
  lineHeight?: { value: number; unit: 'PIXELS' | 'PERCENT' } | { unit: 'AUTO' };
}

export interface PresetNode {
  type: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'ELLIPSE' | 'GROUP' | 'IMAGE_PLACEHOLDER' | 'LINE';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;

  // Common visual
  fills?: PresetFill[];
  strokes?: PresetStroke[];
  strokeWeight?: number;
  /** v2.5 */
  strokeAlign?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
  /** v2.5 — uses Figma's StrokeCap union (including newer values like DIAMOND_FILLED) minus figma.mixed */
  strokeCap?: Exclude<StrokeCap, typeof figma.mixed>;
  /** v2.5 */
  strokeJoin?: Exclude<StrokeJoin, typeof figma.mixed>;
  /** v2.5 */
  dashPattern?: number[];
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  opacity?: number;
  rotation?: number;
  /** v2.5 */
  blendMode?: BlendMode;
  /** v2.5 */
  effects?: PresetEffect[];

  /** v2.5 — Style references. Best-effort: applied if the style exists in the destination file, otherwise falls back to the raw values above. */
  fillStyleId?: string;
  strokeStyleId?: string;
  effectStyleId?: string;
  textStyleId?: string;

  // Frame/Group auto-layout (parent props)
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  clipsContent?: boolean;

  // Auto-layout child sizing (applies when parent has layoutMode HORIZONTAL/VERTICAL)
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  layoutGrow?: number;

  // Text-specific
  characters?: string;
  fontSize?: number;
  fontName?: PresetFontName;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
  letterSpacing?: { value: number; unit: 'PIXELS' | 'PERCENT' };
  lineHeight?: { value: number; unit: 'PIXELS' | 'PERCENT' } | { unit: 'AUTO' };
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
  /** v2.5 — present when the source TextNode had any mixed property (different fonts/sizes/colors per character). */
  textRanges?: PresetTextRange[];

  /** v2.5 — forward-compat hook for future component-instance preservation. Captured but not currently restored. */
  instanceOf?: { id: string; name: string; key?: string };

  // Children (FRAME/GROUP)
  children?: PresetNode[];
}

/**
 * v1 shape — flat frame skeletons. Kept for built-ins and backward compat
 * with any user presets saved before v2.
 */
export interface PresetFrame {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: PresetColor;
  cornerRadius?: number;
}

export interface Preset {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  scope: 'builtin' | 'user';
  createdAt?: number;
  version?: number;
  /** v1 skeleton-only shape. Kept for built-ins and backward-compat. */
  frames: PresetFrame[];
  /** v2 deep tree (preferred when present). */
  nodes?: PresetNode[];
}

// ═══════════════════════════════════════════════════════════════
// BUILT-IN CAIOTTI PRESETS (frame skeletons only)
// ═══════════════════════════════════════════════════════════════

function makeRow(count: number, w: number, h: number, prefix: string): PresetFrame[] {
  const frames: PresetFrame[] = [];
  for (let i = 0; i < count; i++) {
    frames.push({ name: `${prefix} ${i + 1}`, x: i * (w + PRESET_GAP), y: 0, width: w, height: h });
  }
  return frames;
}

function makeGrid(cols: number, rows: number, w: number, h: number, prefix: string): PresetFrame[] {
  const frames: PresetFrame[] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      i += 1;
      frames.push({
        name: `${prefix} ${i}`,
        x: c * (w + PRESET_GAP),
        y: r * (h + PRESET_GAP),
        width: w,
        height: h,
      });
    }
  }
  return frames;
}

const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'caiotti-instagram-carousel-9',
    name: 'Instagram Carousel × 9',
    icon: '📸',
    description: '9 frames · 1080×1350 · horizontal row',
    scope: 'builtin',
    frames: makeRow(9, 1080, 1350, 'Slide'),
  },
  {
    id: 'caiotti-pitch-deck-6',
    name: 'Pitch Deck × 6',
    icon: '📊',
    description: '6 frames · 1920×1080 · horizontal row',
    scope: 'builtin',
    frames: makeRow(6, 1920, 1080, 'Slide'),
  },
  {
    id: 'caiotti-mood-board-3x3',
    name: 'Mood Board 3×3',
    icon: '🎨',
    description: '9 squares · 800×800 · 3×3 grid',
    scope: 'builtin',
    frames: makeGrid(3, 3, 800, 800, 'Tile'),
  },
  {
    id: 'caiotti-web-hero-stack',
    name: 'Web Hero + 3 Sections',
    icon: '🌐',
    description: 'Hero 1440×800 + 3 sections 1440×600 · stacked',
    scope: 'builtin',
    frames: [
      { name: 'Hero', x: 0, y: 0, width: 1440, height: 800 },
      { name: 'Section 1', x: 0, y: 800 + PRESET_GAP, width: 1440, height: 600 },
      { name: 'Section 2', x: 0, y: 800 + (600 + PRESET_GAP) + PRESET_GAP, width: 1440, height: 600 },
      { name: 'Section 3', x: 0, y: 800 + 2 * (600 + PRESET_GAP) + PRESET_GAP, width: 1440, height: 600 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════

async function loadUserPresets(): Promise<Preset[]> {
  const raw = await figma.clientStorage.getAsync(STORAGE_KEY_USER_PRESETS);
  if (!Array.isArray(raw)) return [];
  return raw as Preset[];
}

async function saveUserPresets(presets: Preset[]): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEY_USER_PRESETS, presets);
}

// ═══════════════════════════════════════════════════════════════
// DEEP CAPTURE — recursive serialization
// ═══════════════════════════════════════════════════════════════

const CAPTURABLE_TOP_LEVEL = new Set<NodeType>([
  'FRAME',
  'COMPONENT',
  'INSTANCE',
  'SECTION',
  'GROUP',
]);

function serializeFills(fills: readonly Paint[] | typeof figma.mixed): PresetFill[] | undefined {
  if (fills === figma.mixed) return undefined;
  if (!Array.isArray(fills) || fills.length === 0) return undefined;

  const out: PresetFill[] = [];
  for (const fill of fills) {
    if (!fill) continue;
    if (fill.type === 'SOLID') {
      out.push({
        type: 'SOLID',
        visible: fill.visible !== false,
        opacity: fill.opacity ?? 1,
        color: { r: fill.color.r, g: fill.color.g, b: fill.color.b },
      });
    } else if (fill.type === 'IMAGE') {
      // Lossy: drop the imageHash, mark as placeholder.
      out.push({
        type: 'IMAGE_PLACEHOLDER',
        visible: fill.visible !== false,
        opacity: fill.opacity ?? 1,
        scaleMode: fill.scaleMode,
      });
    } else if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
      const gradient = fill as GradientPaint;
      out.push({
        type: fill.type,
        visible: fill.visible !== false,
        opacity: fill.opacity ?? 1,
        gradientStops: gradient.gradientStops.map((s: ColorStop) => ({
          position: s.position,
          color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
        })),
        gradientTransform: gradient.gradientTransform.map((row: readonly number[]) => Array.from(row)),
      });
    }
    // GRADIENT_ANGULAR / GRADIENT_DIAMOND / VIDEO etc. silently dropped (rare in our use cases)
  }
  return out.length > 0 ? out : undefined;
}

function serializeStrokes(strokes: readonly Paint[] | typeof figma.mixed): PresetStroke[] | undefined {
  if (strokes === figma.mixed) return undefined;
  if (!Array.isArray(strokes) || strokes.length === 0) return undefined;
  const out: PresetStroke[] = [];
  for (const s of strokes) {
    if (s.type !== 'SOLID') continue; // only solid strokes for v1
    out.push({
      type: 'SOLID',
      visible: s.visible !== false,
      opacity: s.opacity ?? 1,
      color: { r: s.color.r, g: s.color.g, b: s.color.b },
    });
  }
  return out.length > 0 ? out : undefined;
}

function serializeEffects(effects: readonly Effect[] | typeof figma.mixed): PresetEffect[] | undefined {
  if (effects === figma.mixed) return undefined;
  if (!Array.isArray(effects) || effects.length === 0) return undefined;
  const out: PresetEffect[] = [];
  for (const e of effects) {
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      out.push({
        type: e.type,
        visible: e.visible !== false,
        color: { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a },
        offset: { x: e.offset.x, y: e.offset.y },
        radius: e.radius,
        spread: 'spread' in e ? e.spread : undefined,
        blendMode: e.blendMode,
        showShadowBehindNode: 'showShadowBehindNode' in e ? e.showShadowBehindNode : undefined,
      });
    } else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
      out.push({ type: e.type, visible: e.visible !== false, radius: e.radius });
    }
    // NOISE/TEXTURE effects (newer additions) silently dropped — rare in templates.
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Walk a TextNode's characters and emit one PresetTextRange per contiguous
 * span where every captured property is identical. Only called when at least
 * one property reports figma.mixed.
 */
function serializeTextRanges(t: TextNode): PresetTextRange[] | undefined {
  const len = t.characters.length;
  if (len === 0) return undefined;

  const at = (i: number): Omit<PresetTextRange, 'start' | 'end'> => {
    const out: Omit<PresetTextRange, 'start' | 'end'> = {};
    try {
      const fn = t.getRangeFontName(i, i + 1);
      if (fn !== figma.mixed) out.fontName = fn as PresetFontName;
    } catch {/* ignore */}
    try {
      const fs = t.getRangeFontSize(i, i + 1);
      if (typeof fs === 'number') out.fontSize = fs;
    } catch {/* ignore */}
    try {
      const fills = t.getRangeFills(i, i + 1);
      if (fills !== figma.mixed) {
        const serialized = serializeFills(fills as readonly Paint[]);
        if (serialized) out.fills = serialized;
      }
    } catch {/* ignore */}
    try {
      const tc = t.getRangeTextCase(i, i + 1);
      if (tc !== figma.mixed) out.textCase = tc as PresetTextRange['textCase'];
    } catch {/* ignore */}
    try {
      const td = t.getRangeTextDecoration(i, i + 1);
      if (td !== figma.mixed) out.textDecoration = td as PresetTextRange['textDecoration'];
    } catch {/* ignore */}
    try {
      const ls = t.getRangeLetterSpacing(i, i + 1);
      if (ls !== figma.mixed) out.letterSpacing = ls as PresetTextRange['letterSpacing'];
    } catch {/* ignore */}
    try {
      const lh = t.getRangeLineHeight(i, i + 1);
      if (lh !== figma.mixed) out.lineHeight = lh as PresetTextRange['lineHeight'];
    } catch {/* ignore */}
    return out;
  };

  const eq = (a: Omit<PresetTextRange, 'start' | 'end'>, b: Omit<PresetTextRange, 'start' | 'end'>): boolean =>
    JSON.stringify(a) === JSON.stringify(b);

  const ranges: PresetTextRange[] = [];
  let spanStart = 0;
  let spanProps = at(0);
  for (let i = 1; i < len; i++) {
    const here = at(i);
    if (!eq(here, spanProps)) {
      ranges.push({ start: spanStart, end: i, ...spanProps });
      spanStart = i;
      spanProps = here;
    }
  }
  ranges.push({ start: spanStart, end: len, ...spanProps });
  return ranges.length > 0 ? ranges : undefined;
}

function isTextMixed(t: TextNode): boolean {
  return (
    t.fontSize === figma.mixed ||
    t.fontName === figma.mixed ||
    t.fills === figma.mixed ||
    t.textCase === figma.mixed ||
    t.textDecoration === figma.mixed ||
    t.letterSpacing === figma.mixed ||
    t.lineHeight === figma.mixed
  );
}

/**
 * v2.5: capture all stroke-related properties onto the base PresetNode.
 * Mutates base in place to keep call sites tight.
 */
function captureStrokeProps(base: PresetNode, node: SceneNode): void {
  // Cast through unknown — most node types have these props but the SceneNode union
  // doesn't expose them directly. Each guarded with 'in' + runtime checks below.
  const n = node as unknown as {
    strokes?: readonly Paint[] | typeof figma.mixed;
    strokeWeight?: number | typeof figma.mixed;
    strokeAlign?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
    strokeCap?: StrokeCap | typeof figma.mixed;
    strokeJoin?: StrokeJoin | typeof figma.mixed;
    dashPattern?: readonly number[];
    strokeStyleId?: string;
  };
  if ('strokes' in node && n.strokes) {
    const strokes = serializeStrokes(n.strokes);
    if (strokes) base.strokes = strokes;
  }
  if ('strokeWeight' in node && n.strokeWeight !== undefined && n.strokeWeight !== figma.mixed && (n.strokeWeight as number) > 0) {
    base.strokeWeight = n.strokeWeight as number;
  }
  if ('strokeAlign' in node && n.strokeAlign) base.strokeAlign = n.strokeAlign;
  if ('strokeCap' in node && n.strokeCap && n.strokeCap !== figma.mixed) {
    base.strokeCap = n.strokeCap as PresetNode['strokeCap'];
  }
  if ('strokeJoin' in node && n.strokeJoin && n.strokeJoin !== figma.mixed) {
    base.strokeJoin = n.strokeJoin as PresetNode['strokeJoin'];
  }
  if ('dashPattern' in node && Array.isArray(n.dashPattern) && n.dashPattern.length > 0) {
    base.dashPattern = Array.from(n.dashPattern);
  }
  if ('strokeStyleId' in node && typeof n.strokeStyleId === 'string' && n.strokeStyleId) {
    base.strokeStyleId = n.strokeStyleId;
  }
}

function captureCornerRadii(
  node: FrameNode | ComponentNode | InstanceNode | RectangleNode | EllipseNode
): Pick<PresetNode, 'cornerRadius' | 'topLeftRadius' | 'topRightRadius' | 'bottomLeftRadius' | 'bottomRightRadius'> {
  const result: ReturnType<typeof captureCornerRadii> = {};
  const cr = (node as { cornerRadius?: number | typeof figma.mixed }).cornerRadius;
  if (typeof cr === 'number' && cr > 0) {
    result.cornerRadius = cr;
  } else if (cr === figma.mixed) {
    const tl = (node as { topLeftRadius?: number }).topLeftRadius;
    const tr = (node as { topRightRadius?: number }).topRightRadius;
    const bl = (node as { bottomLeftRadius?: number }).bottomLeftRadius;
    const br = (node as { bottomRightRadius?: number }).bottomRightRadius;
    if (tl) result.topLeftRadius = tl;
    if (tr) result.topRightRadius = tr;
    if (bl) result.bottomLeftRadius = bl;
    if (br) result.bottomRightRadius = br;
  }
  return result;
}

function serializeNode(
  node: SceneNode,
  offsetX: number,
  offsetY: number
): PresetNode | null {
  if (!('visible' in node) || node.visible === false) return null;
  // Skip zero-size nodes
  if (!('width' in node) || node.width <= 0 || node.height <= 0) return null;

  const base: PresetNode = {
    type: 'FRAME',
    name: node.name,
    x: Math.round(node.x - offsetX),
    y: Math.round(node.y - offsetY),
    width: Math.round(node.width),
    height: Math.round(node.height),
  };

  if ('opacity' in node && node.opacity < 1) base.opacity = node.opacity;
  if ('rotation' in node && node.rotation !== 0) base.rotation = node.rotation;
  if ('blendMode' in node && node.blendMode && node.blendMode !== 'PASS_THROUGH' && node.blendMode !== 'NORMAL') {
    base.blendMode = node.blendMode;
  }
  if ('effects' in node) {
    const eff = serializeEffects((node as { effects: readonly Effect[] | typeof figma.mixed }).effects);
    if (eff) base.effects = eff;
  }
  if ('effectStyleId' in node) {
    const id = (node as { effectStyleId: string | typeof figma.mixed }).effectStyleId;
    if (typeof id === 'string' && id) base.effectStyleId = id;
  }

  // Auto-layout child sizing — only meaningful when the parent has layoutMode set,
  // but cheap to capture on every node and let instantiate apply selectively.
  if ('layoutSizingHorizontal' in node) {
    const h = (node as { layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL' }).layoutSizingHorizontal;
    if (h && h !== 'FIXED') base.layoutSizingHorizontal = h;
  }
  if ('layoutSizingVertical' in node) {
    const v = (node as { layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL' }).layoutSizingVertical;
    if (v && v !== 'FIXED') base.layoutSizingVertical = v;
  }
  if ('layoutGrow' in node) {
    const g = (node as { layoutGrow?: number }).layoutGrow;
    if (typeof g === 'number' && g > 0) base.layoutGrow = g;
  }

  if (node.type === 'TEXT') {
    base.type = 'TEXT';
    const t = node;
    base.characters = t.characters;
    base.textAlignHorizontal = t.textAlignHorizontal;
    base.textAlignVertical = t.textAlignVertical;
    base.textAutoResize = t.textAutoResize;
    if (typeof t.textStyleId === 'string' && t.textStyleId) base.textStyleId = t.textStyleId;
    if (typeof t.fillStyleId === 'string' && t.fillStyleId) base.fillStyleId = t.fillStyleId;

    // Uniform fast path
    if (t.fontSize !== figma.mixed) base.fontSize = t.fontSize as number;
    if (t.fontName !== figma.mixed) base.fontName = t.fontName as PresetFontName;
    if (t.letterSpacing !== figma.mixed) {
      base.letterSpacing = t.letterSpacing as { value: number; unit: 'PIXELS' | 'PERCENT' };
    }
    if (t.lineHeight !== figma.mixed) {
      base.lineHeight = t.lineHeight as PresetNode['lineHeight'];
    }
    if (t.textCase !== figma.mixed) base.textCase = t.textCase as PresetNode['textCase'];
    if (t.textDecoration !== figma.mixed) base.textDecoration = t.textDecoration as PresetNode['textDecoration'];
    if (t.fills !== figma.mixed) base.fills = serializeFills(t.fills);

    // Mixed slow path — walk character ranges
    if (isTextMixed(t)) {
      base.textRanges = serializeTextRanges(t);
    }
    return base;
  }

  if (node.type === 'RECTANGLE') {
    base.type = 'RECTANGLE';
    base.fills = serializeFills(node.fills);
    captureStrokeProps(base, node);
    if (typeof node.fillStyleId === 'string' && node.fillStyleId) base.fillStyleId = node.fillStyleId;
    Object.assign(base, captureCornerRadii(node));
    return base;
  }

  if (node.type === 'ELLIPSE') {
    base.type = 'ELLIPSE';
    base.fills = serializeFills(node.fills);
    captureStrokeProps(base, node);
    if (typeof node.fillStyleId === 'string' && node.fillStyleId) base.fillStyleId = node.fillStyleId;
    return base;
  }

  if (node.type === 'LINE') {
    base.type = 'LINE';
    captureStrokeProps(base, node);
    return base;
  }

  if (node.type === 'GROUP') {
    base.type = 'GROUP';
    base.children = serializeChildren(node.children, 0, 0);
    return base;
  }

  if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    base.type = 'FRAME';
    base.fills = serializeFills(node.fills);
    captureStrokeProps(base, node);
    if (typeof node.fillStyleId === 'string' && node.fillStyleId) base.fillStyleId = node.fillStyleId;
    if (node.type === 'INSTANCE') {
      try {
        const main = node.mainComponent;
        if (main) base.instanceOf = { id: main.id, name: main.name, key: main.key };
      } catch {/* main component may be unavailable for remote/lost instances */}
    }
    Object.assign(base, captureCornerRadii(node));
    // Treat GRID layoutMode as NONE for v1 (we don't support grid yet)
    if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
      base.layoutMode = node.layoutMode;
      base.primaryAxisAlignItems = node.primaryAxisAlignItems;
      base.counterAxisAlignItems = node.counterAxisAlignItems;
      base.paddingLeft = node.paddingLeft;
      base.paddingRight = node.paddingRight;
      base.paddingTop = node.paddingTop;
      base.paddingBottom = node.paddingBottom;
      base.itemSpacing = node.itemSpacing;
    }
    base.clipsContent = node.clipsContent;
    base.children = serializeChildren(node.children, 0, 0);
    return base;
  }

  // VECTOR / BOOLEAN_OPERATION / POLYGON / STAR — flatten to a placeholder rectangle so we don't lose visual presence
  if (
    'fills' in node &&
    (node.type === 'VECTOR' ||
      node.type === 'BOOLEAN_OPERATION' ||
      node.type === 'POLYGON' ||
      node.type === 'STAR')
  ) {
    base.type = 'RECTANGLE';
    base.fills = serializeFills(node.fills as readonly Paint[]);
    return base;
  }

  return null;
}

function serializeChildren(
  children: readonly SceneNode[],
  offsetX: number,
  offsetY: number
): PresetNode[] {
  const out: PresetNode[] = [];
  for (const child of children) {
    const serialized = serializeNode(child, offsetX, offsetY);
    if (serialized) out.push(serialized);
  }
  return out;
}

function captureSelectionAsNodes(): PresetNode[] | { error: string } {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    return { error: 'Select one or more frames first.' };
  }

  const supported = selection.filter((n) => CAPTURABLE_TOP_LEVEL.has(n.type));
  if (supported.length === 0) {
    return { error: 'Select frames, components, sections, or groups (not loose layers).' };
  }

  // Normalize the bounding box of the top-level nodes to (0,0)
  const minX = Math.min(...supported.map((n) => n.x));
  const minY = Math.min(...supported.map((n) => n.y));

  const out: PresetNode[] = [];
  for (const node of supported) {
    const serialized = serializeNode(node, minX, minY);
    if (serialized) out.push(serialized);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// FONT LOADING — collect unique fonts and load them in parallel
// ═══════════════════════════════════════════════════════════════

function collectFonts(node: PresetNode, set: Set<string>): void {
  if (node.fontName) {
    set.add(`${node.fontName.family}|${node.fontName.style}`);
  }
  // v2.5 — also collect fonts referenced inside per-character textRanges so
  // they're pre-loaded by loadAllFonts() and applyTextRanges can run synchronously.
  if (node.textRanges) {
    for (const r of node.textRanges) {
      if (r.fontName) set.add(`${r.fontName.family}|${r.fontName.style}`);
    }
  }
  if (node.children) {
    for (const c of node.children) collectFonts(c, set);
  }
}

/**
 * Track which fonts loaded successfully + which families we substituted.
 * Reset on every instantiate.
 */
const loadedFonts = new Set<string>();
const substitutedFamilies = new Set<string>();

/**
 * Try to load each unique font from the saved tree. Always preload Inter at
 * common weights so style-matching fallbacks have material to work with.
 */
async function loadAllFonts(nodes: PresetNode[]): Promise<void> {
  loadedFonts.clear();
  substitutedFamilies.clear();

  const fontKeys = new Set<string>();
  for (const n of nodes) collectFonts(n, fontKeys);

  // Preload Inter at common weights so the fallback can match style/weight
  for (const style of ['Regular', 'Medium', 'SemiBold', 'Bold', 'Light', 'Thin', 'Italic', 'Bold Italic']) {
    fontKeys.add(`Inter|${style}`);
  }

  const tasks: Promise<void>[] = [];
  for (const key of fontKeys) {
    const [family, style] = key.split('|');
    tasks.push(
      figma.loadFontAsync({ family, style }).then(
        () => {
          loadedFonts.add(key);
        },
        () => {
          /* font missing — tracked at write time */
        }
      )
    );
  }
  await Promise.all(tasks);

  // Guarantee Inter Regular is loaded as the absolute last-ditch fallback.
  if (!loadedFonts.has('Inter|Regular')) {
    try {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      loadedFonts.add('Inter|Regular');
    } catch {
      // If even Inter Regular won't load, Figma is in a bad state — do nothing.
    }
  }
}

/**
 * Pick the best loaded font for a captured fontName. Tries in order:
 *   1. Exact match (family + style)
 *   2. Same family, Regular style
 *   3. Inter at the same style (e.g. SemiBold → Inter SemiBold)
 *   4. Inter Regular
 * Tracks substitutions so we can report at the end.
 */
function resolveFont(font: PresetFontName): PresetFontName {
  const exact = `${font.family}|${font.style}`;
  if (loadedFonts.has(exact)) return font;

  const sameFamilyRegular = `${font.family}|Regular`;
  if (loadedFonts.has(sameFamilyRegular)) {
    substitutedFamilies.add(font.family);
    return { family: font.family, style: 'Regular' };
  }

  const interSameStyle = `Inter|${font.style}`;
  if (loadedFonts.has(interSameStyle)) {
    substitutedFamilies.add(font.family);
    return { family: 'Inter', style: font.style };
  }

  substitutedFamilies.add(font.family);
  return { family: 'Inter', style: 'Regular' };
}

// ═══════════════════════════════════════════════════════════════
// INSTANTIATE — deep tree → live nodes
// ═══════════════════════════════════════════════════════════════

// Mid warm-gray — readable on both light and dark surfaces, signals "fill me"
const PLACEHOLDER_FILL: SolidPaint = { type: 'SOLID', color: { r: 0.56, g: 0.55, b: 0.51 } };

function fillToPaint(fill: PresetFill): Paint | null {
  if (fill.type === 'SOLID' && fill.color) {
    const p: SolidPaint = {
      type: 'SOLID',
      color: fill.color,
      ...(typeof fill.opacity === 'number' ? { opacity: fill.opacity } : {}),
      ...(fill.visible === false ? { visible: false } : {}),
    };
    return p;
  }
  if (fill.type === 'IMAGE_PLACEHOLDER') {
    // Render as a mid-gray placeholder so the layout intent reads
    return { ...PLACEHOLDER_FILL, opacity: fill.opacity ?? 1 };
  }
  if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
    if (!fill.gradientStops || !fill.gradientTransform) return null;
    return {
      type: fill.type,
      gradientStops: fill.gradientStops.map((s) => ({
        position: s.position,
        color: s.color,
      })) as ColorStop[],
      gradientTransform: fill.gradientTransform as Transform,
      opacity: fill.opacity,
      visible: fill.visible,
    } as GradientPaint;
  }
  return null;
}

function strokeToPaint(stroke: PresetStroke): SolidPaint {
  return {
    type: 'SOLID',
    color: stroke.color,
    opacity: stroke.opacity,
    visible: stroke.visible !== false,
  };
}

/** v2.5: PresetEffect → Figma Effect. Returns null on unrecognized. */
function effectToFigma(e: PresetEffect): Effect | null {
  if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
    if (!e.color || !e.offset || typeof e.radius !== 'number') return null;
    const out: DropShadowEffect | InnerShadowEffect = {
      type: e.type,
      color: e.color,
      offset: e.offset,
      radius: e.radius,
      spread: e.spread,
      visible: e.visible !== false,
      blendMode: e.blendMode ?? 'NORMAL',
      ...(e.type === 'DROP_SHADOW' && typeof e.showShadowBehindNode === 'boolean'
        ? { showShadowBehindNode: e.showShadowBehindNode }
        : {}),
    } as DropShadowEffect | InnerShadowEffect;
    return out;
  }
  if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
    if (typeof e.radius !== 'number') return null;
    return { type: e.type, radius: e.radius, visible: e.visible !== false } as BlurEffect;
  }
  return null;
}

/** v2.5: apply effects + blendMode + effectStyleId. Mutates target. */
function applyEffectsAndBlend(target: SceneNode, n: PresetNode): void {
  if (n.effects && 'effects' in target) {
    const out: Effect[] = [];
    for (const e of n.effects) {
      const f = effectToFigma(e);
      if (f) out.push(f);
    }
    try { (target as { effects: readonly Effect[] }).effects = out; } catch {/* node type may reject */}
  }
  if (n.blendMode && 'blendMode' in target) {
    try { (target as { blendMode: BlendMode }).blendMode = n.blendMode; } catch {/* ignore */}
  }
  if (n.effectStyleId && 'effectStyleId' in target) {
    void tryApplyStyleId(target as unknown as { effectStyleId: string }, 'effectStyleId', n.effectStyleId);
  }
}

/**
 * v2.5: apply stroke geometry props captured by captureStrokeProps. Strokes
 * (paints) are still applied per-node-type by the existing instantiate code;
 * this only handles align/cap/join/dashPattern/strokeStyleId.
 */
function applyStrokeGeometry(target: SceneNode, n: PresetNode): void {
  if (n.strokeAlign && 'strokeAlign' in target) {
    try { (target as { strokeAlign: 'CENTER' | 'INSIDE' | 'OUTSIDE' }).strokeAlign = n.strokeAlign; } catch {/* ignore */}
  }
  if (n.strokeCap && 'strokeCap' in target) {
    try { (target as { strokeCap: PresetNode['strokeCap'] }).strokeCap = n.strokeCap; } catch {/* ignore */}
  }
  if (n.strokeJoin && 'strokeJoin' in target) {
    try { (target as { strokeJoin: PresetNode['strokeJoin'] }).strokeJoin = n.strokeJoin; } catch {/* ignore */}
  }
  if (n.dashPattern && 'dashPattern' in target) {
    try { (target as { dashPattern: readonly number[] }).dashPattern = n.dashPattern; } catch {/* ignore */}
  }
  if (n.strokeStyleId && 'strokeStyleId' in target) {
    void tryApplyStyleId(target as unknown as { strokeStyleId: string }, 'strokeStyleId', n.strokeStyleId);
  }
}

/**
 * v2.5: apply a captured style id only if a style with that id resolves in the
 * destination file. Best-effort — silently no-ops on cross-file mismatch.
 */
async function tryApplyStyleId<T extends Record<string, string>, K extends keyof T & string>(
  target: T,
  key: K,
  id: string
): Promise<void> {
  try {
    const style = await figma.getStyleByIdAsync(id);
    if (style) {
      target[key] = id as T[K];
    }
  } catch {
    // wrong file or stale id — leave raw values in place
  }
}

/**
 * v2.5: apply per-character ranges to a TextNode that had mixed properties.
 * SYNCHRONOUS — relies on loadAllFonts() (called before any instantiate) having
 * already loaded every font referenced by ranges. Running async here introduces
 * a race: text would be appended in Inter Regular, auto-layout would reflow
 * with the wrong widths, then ranges would set the real fonts AFTER layout
 * was already locked in. Result: clipped headlines, wrong wrap points.
 */
function applyTextRanges(t: TextNode, n: PresetNode): void {
  if (!n.textRanges || n.textRanges.length === 0) return;
  for (const r of n.textRanges) {
    const start = Math.max(0, r.start);
    const end = Math.min(t.characters.length, r.end);
    if (end <= start) continue;
    if (r.fontName) {
      const font = resolveFont(r.fontName);
      try { t.setRangeFontName(start, end, font); } catch {/* font load may have failed */}
    }
    if (typeof r.fontSize === 'number') {
      try { t.setRangeFontSize(start, end, r.fontSize); } catch {/* ignore */}
    }
    if (r.fills) {
      const paints = r.fills.map(fillToPaint).filter((p): p is Paint => p !== null);
      try { t.setRangeFills(start, end, paints); } catch {/* ignore */}
    }
    if (r.textCase) {
      try { t.setRangeTextCase(start, end, r.textCase); } catch {/* ignore */}
    }
    if (r.textDecoration) {
      try { t.setRangeTextDecoration(start, end, r.textDecoration); } catch {/* ignore */}
    }
    if (r.letterSpacing) {
      try { t.setRangeLetterSpacing(start, end, r.letterSpacing); } catch {/* ignore */}
    }
    if (r.lineHeight) {
      try { t.setRangeLineHeight(start, end, r.lineHeight as LineHeight); } catch {/* ignore */}
    }
  }
}

function applyCornerRadii(target: FrameNode | RectangleNode | ComponentNode, n: PresetNode): void {
  if (typeof n.cornerRadius === 'number') {
    target.cornerRadius = n.cornerRadius;
    return;
  }
  if (n.topLeftRadius !== undefined) target.topLeftRadius = n.topLeftRadius;
  if (n.topRightRadius !== undefined) target.topRightRadius = n.topRightRadius;
  if (n.bottomLeftRadius !== undefined) target.bottomLeftRadius = n.bottomLeftRadius;
  if (n.bottomRightRadius !== undefined) target.bottomRightRadius = n.bottomRightRadius;
}

function applyAutoLayout(target: FrameNode | ComponentNode, n: PresetNode): void {
  if (!n.layoutMode || n.layoutMode === 'NONE') {
    target.layoutMode = 'NONE';
    return;
  }
  target.layoutMode = n.layoutMode;
  if (n.primaryAxisAlignItems) target.primaryAxisAlignItems = n.primaryAxisAlignItems;
  if (n.counterAxisAlignItems && n.counterAxisAlignItems !== 'BASELINE') {
    target.counterAxisAlignItems = n.counterAxisAlignItems;
  }
  if (typeof n.paddingLeft === 'number') target.paddingLeft = n.paddingLeft;
  if (typeof n.paddingRight === 'number') target.paddingRight = n.paddingRight;
  if (typeof n.paddingTop === 'number') target.paddingTop = n.paddingTop;
  if (typeof n.paddingBottom === 'number') target.paddingBottom = n.paddingBottom;
  if (typeof n.itemSpacing === 'number') target.itemSpacing = n.itemSpacing;
}

function instantiateText(n: PresetNode): TextNode {
  const t = figma.createText();
  // Set font BEFORE characters, else figma throws
  const targetFont = n.fontName ? resolveFont(n.fontName) : { family: 'Inter', style: 'Regular' };
  try {
    t.fontName = targetFont;
  } catch {
    // resolveFont guarantees a loaded font, but belt-and-suspenders
    t.fontName = { family: 'Inter', style: 'Regular' };
  }
  if (typeof n.fontSize === 'number') t.fontSize = n.fontSize;
  if (typeof n.characters === 'string') t.characters = n.characters;
  if (n.textAlignHorizontal) t.textAlignHorizontal = n.textAlignHorizontal;
  if (n.textAlignVertical) t.textAlignVertical = n.textAlignVertical;
  if (n.letterSpacing) t.letterSpacing = n.letterSpacing;
  if (n.lineHeight) t.lineHeight = n.lineHeight as LineHeight;
  if (n.textCase) t.textCase = n.textCase;
  if (n.textDecoration) t.textDecoration = n.textDecoration;
  if (n.textAutoResize) t.textAutoResize = n.textAutoResize;
  if (n.fills) {
    const paints = n.fills.map(fillToPaint).filter((p): p is Paint => p !== null);
    t.fills = paints; // assign even if empty so default black isn't kept on captured-no-fill
  }
  // v2.5 — try to relink to original text/fill styles if they exist in this file
  if (n.textStyleId) void tryApplyStyleId(t as unknown as { textStyleId: string }, 'textStyleId', n.textStyleId);
  if (n.fillStyleId) void tryApplyStyleId(t as unknown as { fillStyleId: string }, 'fillStyleId', n.fillStyleId);
  // Resize after content so explicit size sticks (with NONE auto-resize)
  if (n.textAutoResize === 'NONE' || !n.textAutoResize) {
    try {
      t.resize(n.width, n.height);
    } catch {
      // Some text states refuse resize — best-effort
    }
  }
  // v2.5 — apply per-character ranges last so they override the uniform values above.
  // Synchronous; range fonts are pre-loaded by loadAllFonts() so no await needed.
  // This MUST happen before the parent appendChild + auto-layout reflow, otherwise
  // the layout engine computes widths against the fallback font.
  applyTextRanges(t, n);
  return t;
}

function instantiateNode(n: PresetNode): SceneNode | null {
  switch (n.type) {
    case 'TEXT':
      return instantiateText(n);

    case 'RECTANGLE': {
      const r = figma.createRectangle();
      r.resize(n.width, n.height);
      // Always overwrite the default fill so transparent originals stay transparent.
      r.fills = n.fills ? n.fills.map(fillToPaint).filter((p): p is Paint => p !== null) : [];
      if (n.strokes) r.strokes = n.strokes.map(strokeToPaint);
      if (typeof n.strokeWeight === 'number') r.strokeWeight = n.strokeWeight;
      applyCornerRadii(r, n);
      return r;
    }

    case 'ELLIPSE': {
      const e = figma.createEllipse();
      e.resize(n.width, n.height);
      e.fills = n.fills ? n.fills.map(fillToPaint).filter((p): p is Paint => p !== null) : [];
      if (n.strokes) e.strokes = n.strokes.map(strokeToPaint);
      if (typeof n.strokeWeight === 'number') e.strokeWeight = n.strokeWeight;
      return e;
    }

    case 'LINE': {
      const l = figma.createLine();
      l.resize(n.width, n.height);
      if (n.strokes) l.strokes = n.strokes.map(strokeToPaint);
      if (typeof n.strokeWeight === 'number') l.strokeWeight = n.strokeWeight;
      return l;
    }

    case 'IMAGE_PLACEHOLDER': {
      const r = figma.createRectangle();
      r.resize(n.width, n.height);
      r.fills = [PLACEHOLDER_FILL];
      r.name = n.name || 'Image';
      return r;
    }

    case 'GROUP':
    case 'FRAME':
    default: {
      const f = figma.createFrame();
      f.resize(n.width, n.height);
      // Always clear Figma's default white fill BEFORE applying captured paints.
      // If the original was transparent (no fill), we want transparent — not white.
      const paints = n.fills
        ? n.fills.map(fillToPaint).filter((p): p is Paint => p !== null)
        : [];
      f.fills = paints;
      if (n.strokes) f.strokes = n.strokes.map(strokeToPaint);
      if (typeof n.strokeWeight === 'number') f.strokeWeight = n.strokeWeight;
      applyCornerRadii(f, n);
      // Children FIRST so layoutMode resize doesn't fight initial size
      if (n.children) {
        for (const child of n.children) {
          const childNode = instantiateNode(child);
          if (childNode) {
            f.appendChild(childNode);
            applyCommonProps(childNode, child);
            // For non-auto-layout, x/y is meaningful. For auto-layout, Figma reflows
            // anyway after applyAutoLayout — set them defensively.
            childNode.x = child.x;
            childNode.y = child.y;
          }
        }
      }
      // Auto-layout AFTER children so positions are interpreted correctly
      applyAutoLayout(f, n);
      if (typeof n.clipsContent === 'boolean') f.clipsContent = n.clipsContent;
      // Apply child layout sizing AFTER parent has its own layoutMode set,
      // because layoutSizingHorizontal/Vertical only resolve in auto-layout context.
      if (n.children && (n.layoutMode === 'HORIZONTAL' || n.layoutMode === 'VERTICAL')) {
        const ch = f.children;
        for (let i = 0; i < ch.length && i < n.children.length; i++) {
          applyChildLayoutSizing(ch[i], n.children[i]);
        }
      }
      return f;
    }
  }
}

function applyChildLayoutSizing(node: SceneNode, n: PresetNode): void {
  // These setters only work when the node is inside an auto-layout parent.
  if (n.layoutSizingHorizontal && 'layoutSizingHorizontal' in node) {
    try {
      (node as { layoutSizingHorizontal: 'FIXED' | 'HUG' | 'FILL' }).layoutSizingHorizontal =
        n.layoutSizingHorizontal;
    } catch {
      // HUG only works on text/auto-layout frames; FILL only when parent has matching primary axis
    }
  }
  if (n.layoutSizingVertical && 'layoutSizingVertical' in node) {
    try {
      (node as { layoutSizingVertical: 'FIXED' | 'HUG' | 'FILL' }).layoutSizingVertical =
        n.layoutSizingVertical;
    } catch {
      // ignore
    }
  }
  if (typeof n.layoutGrow === 'number' && 'layoutGrow' in node) {
    try {
      (node as { layoutGrow: number }).layoutGrow = n.layoutGrow;
    } catch {
      // ignore
    }
  }
}

function applyCommonProps(node: SceneNode, n: PresetNode): void {
  node.name = n.name;
  if (typeof n.opacity === 'number' && 'opacity' in node) (node as { opacity: number }).opacity = n.opacity;
  if (typeof n.rotation === 'number' && 'rotation' in node) (node as { rotation: number }).rotation = n.rotation;
  // v2.5 — effects/blendMode/effectStyleId apply uniformly across every visible node type
  applyEffectsAndBlend(node, n);
  // v2.5 — stroke geometry (align/cap/join/dashPattern/strokeStyleId) applies after the
  // per-type instantiate sets stroke paints + weight. Safe to call on nodes that don't
  // support strokes (try/catch internally).
  applyStrokeGeometry(node, n);
}

function instantiateNodeWithProps(n: PresetNode): SceneNode | null {
  const node = instantiateNode(n);
  if (!node) return null;
  applyCommonProps(node, n);
  return node;
}

async function instantiatePreset(preset: Preset): Promise<SceneNode[]> {
  const center = figma.viewport.center;

  // Prefer v2 deep nodes when present, fall back to v1 frames-only
  if (preset.nodes && preset.nodes.length > 0) {
    await loadAllFonts(preset.nodes);

    const maxX = Math.max(...preset.nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...preset.nodes.map((n) => n.y + n.height));
    const offsetX = center.x - maxX / 2;
    const offsetY = center.y - maxY / 2;

    const created: SceneNode[] = [];
    for (const n of preset.nodes) {
      const node = instantiateNodeWithProps(n);
      if (!node) continue;
      figma.currentPage.appendChild(node);
      node.x = offsetX + n.x;
      node.y = offsetY + n.y;
      created.push(node);
    }
    if (created.length > 0) {
      figma.currentPage.selection = created;
      figma.viewport.scrollAndZoomIntoView(created);
    }
    // Surface font substitutions so the user knows what got swapped
    if (substitutedFamilies.size > 0) {
      const list = Array.from(substitutedFamilies).slice(0, 3).join(', ');
      const more = substitutedFamilies.size > 3 ? ` +${substitutedFamilies.size - 3} more` : '';
      figma.notify(`Substituted missing fonts: ${list}${more} (using Inter)`, { timeout: 6000 });
    }
    return created;
  }

  // v1 fallback (built-ins + legacy user presets)
  const maxX = Math.max(...preset.frames.map((f) => f.x + f.width));
  const maxY = Math.max(...preset.frames.map((f) => f.y + f.height));
  const offsetX = center.x - maxX / 2;
  const offsetY = center.y - maxY / 2;

  const created: SceneNode[] = [];
  for (const f of preset.frames) {
    const node = figma.createFrame();
    node.name = f.name;
    node.resize(f.width, f.height);
    node.x = offsetX + f.x;
    node.y = offsetY + f.y;
    if (f.fill) node.fills = [{ type: 'SOLID', color: f.fill }];
    if (typeof f.cornerRadius === 'number') node.cornerRadius = f.cornerRadius;
    figma.currentPage.appendChild(node);
    created.push(node);
  }
  if (created.length > 0) {
    figma.currentPage.selection = created;
    figma.viewport.scrollAndZoomIntoView(created);
  }
  return created;
}

// ═══════════════════════════════════════════════════════════════
// UTILS — derive a v1 frames[] skeleton from v2 nodes[] for backward UI compat
// ═══════════════════════════════════════════════════════════════

function nodesToFramesSummary(nodes: PresetNode[]): PresetFrame[] {
  return nodes.map((n) => {
    const frame: PresetFrame = {
      name: n.name,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    };
    if (n.fills) {
      const solid = n.fills.find((f) => f.type === 'SOLID' && f.color);
      if (solid?.color) frame.fill = solid.color;
    }
    if (typeof n.cornerRadius === 'number') frame.cornerRadius = n.cornerRadius;
    return frame;
  });
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════

interface PresetMessage {
  type: string;
  presetId?: string;
  scope?: 'builtin' | 'user';
  name?: string;
  icon?: string;
  description?: string;
  /** v2 deep tree (preferred) */
  nodes?: PresetNode[];
  /** v1 frames-only (legacy) */
  frames?: PresetFrame[];
}

export async function handlePresetMessage(msg: PresetMessage): Promise<boolean> {
  switch (msg.type) {
    case 'preset-list': {
      const userPresets = await loadUserPresets();
      figma.ui.postMessage({
        type: 'preset-list-result',
        builtin: BUILTIN_PRESETS,
        user: userPresets,
      });
      return true;
    }

    case 'preset-capture-selection': {
      const result = captureSelectionAsNodes();
      if ('error' in result) {
        figma.ui.postMessage({ type: 'preset-capture-error', message: result.error });
      } else {
        figma.ui.postMessage({
          type: 'preset-capture-result',
          nodes: result,
          frames: nodesToFramesSummary(result),
        });
      }
      return true;
    }

    case 'preset-save': {
      const hasNodes = Array.isArray(msg.nodes) && msg.nodes.length > 0;
      const hasFrames = Array.isArray(msg.frames) && msg.frames.length > 0;
      if (!msg.name || (!hasNodes && !hasFrames)) {
        figma.ui.postMessage({ type: 'preset-save-error', message: 'Missing name or content.' });
        return true;
      }
      const userPresets = await loadUserPresets();
      const preset: Preset = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: msg.name.trim().slice(0, 80),
        icon: msg.icon,
        description: msg.description,
        scope: 'user',
        createdAt: Date.now(),
        version: PRESET_VERSION,
        frames: msg.frames || (msg.nodes ? nodesToFramesSummary(msg.nodes) : []),
        nodes: msg.nodes,
      };
      userPresets.unshift(preset);
      await saveUserPresets(userPresets);
      figma.ui.postMessage({ type: 'preset-saved', preset });
      figma.notify(`Saved "${preset.name}"`);
      return true;
    }

    case 'preset-instantiate': {
      let preset: Preset | undefined;
      if (msg.scope === 'builtin') {
        preset = BUILTIN_PRESETS.find((p) => p.id === msg.presetId);
      } else if (msg.scope === 'user') {
        const userPresets = await loadUserPresets();
        preset = userPresets.find((p) => p.id === msg.presetId);
      }
      if (!preset) {
        figma.ui.postMessage({ type: 'preset-instantiate-error', message: 'Preset not found.' });
        return true;
      }
      try {
        const created = await instantiatePreset(preset);
        figma.ui.postMessage({
          type: 'preset-instantiated',
          presetId: preset.id,
          nodeIds: created.map((n) => n.id),
        });
        figma.notify(`Inserted "${preset.name}" (${created.length} frame${created.length === 1 ? '' : 's'})`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to instantiate template.';
        figma.ui.postMessage({ type: 'preset-instantiate-error', message });
        figma.notify(`Template error: ${message}`, { error: true });
      }
      return true;
    }

    case 'preset-delete': {
      if (!msg.presetId) return true;
      const userPresets = await loadUserPresets();
      const next = userPresets.filter((p) => p.id !== msg.presetId);
      await saveUserPresets(next);
      figma.ui.postMessage({ type: 'preset-deleted', presetId: msg.presetId });
      return true;
    }

    /** v2.5 — debug: ship a saved preset's full JSON back to the UI for repro/sharing. */
    case 'preset-export-json': {
      if (!msg.presetId) return true;
      let preset: Preset | undefined;
      if (msg.scope === 'builtin') {
        preset = BUILTIN_PRESETS.find((p) => p.id === msg.presetId);
      } else {
        const userPresets = await loadUserPresets();
        preset = userPresets.find((p) => p.id === msg.presetId);
      }
      figma.ui.postMessage({
        type: 'preset-export-json-result',
        presetId: msg.presetId,
        json: preset ? JSON.stringify(preset, null, 2) : null,
      });
      return true;
    }
  }
  return false;
}
