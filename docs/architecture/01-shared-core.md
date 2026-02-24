# Shared Core — Element Creators, Color Utils, SVG Utils, Types

> Duplicated in `figmento/src/` and `figmento-plugin/src/`. This doc describes the canonical behavior.

## element-creators.ts (~649 lines)

Central factory that converts `UIElement` JSON → Figma `SceneNode`.

### Entry Point

```typescript
export async function createElement(element: UIElement, skipChildren?: boolean): Promise<SceneNode | null>
```

### Type Routing

| `element.type` | Figma API | Notes |
|----------------|-----------|-------|
| `frame`, `button`, `input`, `card` | `figma.createFrame()` via `createFrameNode()` | All use frame with different styling |
| `rectangle` | `figma.createRectangle()` | Direct creation |
| `ellipse` | `figma.createEllipse()` | Direct creation |
| `text` | `figma.createText()` via `setupTextNode()` | Font loading required first |
| `image` (has `generatedImage`) | `createImageFromBase64()` | Base64 → frame with IMAGE fill |
| `image` (no data) | `createImagePlaceholder()` | Dashed-border frame with label |
| `icon` | `createIconPlaceholder()` | Lucide SVG paths or fallback shapes |

### Property Application Pipeline

Applied in order after node creation:
1. `applyCommonProperties()` — name, position (x/y), resize, opacity, clipsContent
2. `applyFills()` — SOLID or GRADIENT_LINEAR fills
3. `applyStroke()` — color + width
4. `applyEffects()` — DROP_SHADOW / INNER_SHADOW
5. `applyLayoutProperties()` — auto-layout mode, spacing, padding, alignment, sizing

### Font Loading (Critical Path)

```typescript
async function setupTextNode(element: UIElement): Promise<TextNode>
```

1. Attempts `figma.loadFontAsync({ family, style })` with 5-second timeout
2. On failure: tries fallback chain → Inter → Roboto
3. Per-segment styling via `setRangeFontName/setRangeFontSize/setRangeFills`
4. Supports `textAlign`, `lineHeight`, `letterSpacing`
5. Layout sizing: `layoutSizingHorizontal`, `layoutSizingVertical`

**Gotcha:** Font loading is the #1 failure point. Google Fonts must be available. The 5s timeout + fallback chain prevents hard failures.

### Image Handling

```typescript
async function createImageFromBase64(element: UIElement): Promise<FrameNode>
```

- Strips `data:image/...;base64,` prefix
- Uses `figma.base64Decode()` → `figma.createImage()` → IMAGE fill with `scaleMode: 'FILL'`
- No URL-based images — Figma sandbox cannot fetch external URLs

### Icon Handling

`createIconPlaceholder()` renders hardcoded Lucide SVG paths for: `check`, `x`, `chevron-right`, `chevron-down`. All others get a default circle.

Uses `figma.createVector()` + `vectorPaths` with absolute M/L/C/Z commands (via svg-utils normalization).

---

## color-utils.ts (~101 lines)

### Functions

| Function | Signature | Notes |
|----------|-----------|-------|
| `hexToRgb(hex)` | `string → {r, g, b}` | Returns 0-1 range (Figma standard). Handles `#ABC` shorthand. |
| `rgbToHex(color)` | `{r, g, b} → string` | Expects 0-1 range input. Returns `#RRGGBB`. |
| `getFontStyle(weight)` | `number → string` | Maps 100-900 → "Thin"..."Black". Uses closest-match. |
| `isContrastingColor(c1, c2)` | `(string, string) → boolean` | WCAG relative luminance. Returns `true` if ratio ≥ 3:1. |

### Font Weight Map

```
100→Thin, 200→ExtraLight, 300→Light, 400→Regular,
500→Medium, 600→SemiBold, 700→Bold, 800→ExtraBold, 900→Black
```

---

## svg-utils.ts (~388 lines)

Converts arbitrary SVG path data to Figma-compatible format.

### Functions

| Function | Purpose |
|----------|---------|
| `scalePathData(pathData, scale)` | Scales all coordinates in a path string |
| `parsePath(pathData)` | Tokenizes SVG path into `PathCommand[]` |
| `normalizeCommands(commands)` | Converts all commands to absolute M/L/C/Q/Z only |
| `arcToCubicBeziers(...)` | Converts SVG arc (A) commands to cubic bezier (C) approximations |

### Why Needed

Figma's `vectorPaths` only accepts absolute M, L, C, Q, Z commands. SVG paths can contain:
- Relative commands (m, l, c, s, q, t, a, z)
- Shorthand commands (H, V, S, T)
- Arc commands (A) — not supported by Figma at all

The normalization pipeline handles all of these, including the non-trivial arc→cubic bezier conversion.

---

## Core Types (from types.ts)

### Design Schema

```typescript
interface UIElement {
  id: string;
  type: 'frame' | 'rectangle' | 'text' | 'image' | 'button' | 'input' | 'icon' | 'ellipse' | 'card';
  name: string;
  x?: number;       // Optional when inside auto-layout parent
  y?: number;
  width: number;
  height: number;
  cornerRadius?: number | [number, number, number, number];
  fills?: Fill[];
  stroke?: Stroke | null;
  effects?: ShadowEffect[];
  text?: TextProperties;
  children?: UIElement[];
  imageDescription?: string;
  lucideIcon?: string;
  generatedImage?: string;     // Base64 image data
  svgPaths?: string[];
  opacity?: number;
  clipsContent?: boolean;
  // Auto-layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  itemSpacing?: number;
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX';
  layoutSizingHorizontal?: 'FIXED' | 'FILL' | 'HUG';
  layoutSizingVertical?: 'FIXED' | 'FILL' | 'HUG';
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
}

interface UIAnalysis {
  width: number;
  height: number;
  backgroundColor: string;
  elements: UIElement[];
}
```

### Supporting Types

```typescript
interface Fill { type: 'SOLID' | 'GRADIENT_LINEAR' | 'IMAGE'; color?: string; opacity?: number; gradientStops?: GradientStop[] }
interface Stroke { color: string; width: number }
interface ShadowEffect { type: 'DROP_SHADOW' | 'INNER_SHADOW'; color: string; opacity?: number; offset: {x: number; y: number}; blur: number; spread?: number }
interface TextSegment { text: string; fontWeight?: number; fontSize?: number; color?: string }
interface TextProperties { content: string; fontSize: number; fontWeight: number; fontFamily: string; color: string; textAlign?: 'LEFT'|'CENTER'|'RIGHT'; lineHeight?: number|'AUTO'; letterSpacing?: number; segments?: TextSegment[] }
```

These types are the contract between AI output and Figma rendering. Both plugins use them identically.
