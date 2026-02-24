# Figma Plugin Constraints & Gotchas

> Platform-level constraints that apply to both `figmento/` and `figmento-plugin/`. Must-read for anyone modifying plugin code.

## 1. Sandbox Isolation

Figma plugins run in two isolated contexts:

| Context | Can Do | Cannot Do |
|---------|--------|-----------|
| **Sandbox** (`code.ts`) | Access Figma Plugin API, read/write canvas, load fonts | Make network requests, access DOM, use `fetch` |
| **UI** (`ui.html` iframe) | Make HTTP/WS requests, render HTML/CSS/JS, access DOM | Access Figma API directly |

**Communication:** `figma.ui.postMessage()` (sandbox→UI) and `figma.ui.onmessage` (UI→sandbox). Messages are serialized — no functions, no circular refs.

**Implication:** All network calls (AI APIs, WebSocket) must happen in the UI iframe. All Figma operations must happen in the sandbox. The message bridge is the only link.

## 2. Font Loading

**Every font must be loaded before use.** Calling `textNode.fontName = { family, style }` without loading first throws.

```typescript
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
```

### Failure Modes

- Font not installed/available → throws
- Network timeout → throws
- Mixed fonts on a text node → must load each variant separately

### Current Mitigation (element-creators.ts)

```
1. Try requested font with 5-second timeout
2. On failure → try "Inter Regular"
3. On failure → try "Roboto Regular"
4. On failure → throw (hard failure)
```

### Gotchas

- **Font style string must match exactly.** "Bold" works, "bold" doesn't. Use `getFontStyle()` from color-utils.
- **Google Fonts availability** depends on Figma's font service. Not all weights are available for all fonts.
- **Before modifying text content**, you must load the font that's already applied. Even for `textNode.characters = "new text"`.
- **Mixed-weight segments** require loading each font variant: `Inter Regular` + `Inter Bold` separately.

## 3. Image Handling

**No URL-based images.** Figma plugins cannot set an image fill by URL. The only path is:

```
base64 string → figma.base64Decode() → Uint8Array → figma.createImage() → ImagePaint.imageHash
```

### Image Fill Pattern

```typescript
const bytes = figma.base64Decode(base64String);  // No data: prefix!
const image = figma.createImage(bytes);
frame.fills = [{
  type: 'IMAGE',
  imageHash: image.hash,
  scaleMode: 'FILL'  // or 'FIT', 'CROP', 'TILE'
}];
```

### Gotchas

- **Strip the data URI prefix** before calling `base64Decode()`: `imageData.replace(/^data:image\/\w+;base64,/, '')`
- **Images are frame/rectangle fills**, not standalone nodes. There is no "image node" in Figma.
- **Large base64 strings** can hit message size limits in the postMessage bridge. No hard limit documented, but >10MB is risky.
- **`figma.createImage()` returns an `Image` object** with a `.hash` property — you set the hash on the paint, not the image object itself.

## 4. Manifest Configuration

### Network Access

```json
{
  "networkAccess": {
    "allowedDomains": ["https://api.anthropic.com", ...],
    "devAllowedDomains": ["ws://localhost:3055"]
  }
}
```

- **`allowedDomains`** — production domains the UI iframe can reach
- **`devAllowedDomains`** — additional domains allowed only in development mode
- **WS connections** require the `ws://` or `wss://` scheme explicitly
- **Wildcards not supported** — each domain must be listed

### Plugin ID

```json
{ "id": "figmento-mcp-plugin" }
```

This ID determines `clientStorage` namespace. Different IDs = separate storage. The two plugins (`figmento-plugin` and `figmento-mcp-plugin`) have separate storage.

### Permissions

```json
{ "permissions": ["currentuser"] }
```

Grants `figma.currentUser` access. Required for user-specific features.

## 5. Client Storage

```typescript
await figma.clientStorage.getAsync(key);   // Returns any | undefined
await figma.clientStorage.setAsync(key, value);
```

- **Per-user, per-plugin** — different users see different data, different plugin IDs see different data
- **No size limit documented** — but large values (>1MB) may fail silently
- **Async only** — no synchronous access
- **JSON-serializable values only** — no functions, no class instances
- **Not shared between plugins** — `figmento-plugin` and `figmento-mcp-plugin` have separate namespaces

## 6. Auto-Layout

Figma's auto-layout maps to CSS flexbox concepts:

| Figma Property | CSS Equivalent | Values |
|---------------|----------------|--------|
| `layoutMode` | `flex-direction` | `'HORIZONTAL'` (row), `'VERTICAL'` (column), `'NONE'` (disable) |
| `itemSpacing` | `gap` | number (px) |
| `paddingTop/Right/Bottom/Left` | `padding` | number (px) |
| `primaryAxisAlignItems` | `justify-content` | `'MIN'`(start), `'CENTER'`, `'MAX'`(end), `'SPACE_BETWEEN'` |
| `counterAxisAlignItems` | `align-items` | `'MIN'`(start), `'CENTER'`, `'MAX'`(end) |

### Child Sizing in Auto-Layout

| Property | Values | Meaning |
|----------|--------|---------|
| `layoutSizingHorizontal` | `'FIXED'`, `'FILL'`, `'HUG'` | Fixed width / fill parent / hug content |
| `layoutSizingVertical` | `'FIXED'`, `'FILL'`, `'HUG'` | Same for height |
| `layoutPositioning` | `'AUTO'`, `'ABSOLUTE'` | Participates in flow / absolutely positioned |

### Gotchas

- Setting `layoutMode` on a frame **immediately repositions all children** according to auto-layout rules
- Children with `x`/`y` are ignored in auto-layout (use `layoutPositioning: 'ABSOLUTE'` for manual positioning within auto-layout)
- `FILL` sizing only works if parent has auto-layout enabled
- Must set `layoutSizingHorizontal: 'FILL'` on text inside auto-layout frames for proper wrapping

## 7. Node Operations

### Creating Nodes

```typescript
const frame = figma.createFrame();     // Always created at (0,0) on current page
const text = figma.createText();       // Must load font before setting content
const rect = figma.createRectangle();
const ellipse = figma.createEllipse();
const vector = figma.createVector();   // For SVG paths
```

### Moving Nodes Between Parents

```typescript
parentFrame.appendChild(childNode);    // Moves child into parent (removes from previous parent)
```

### Node Lookup

```typescript
const node = figma.getNodeById(id);    // Returns BaseNode | null — always check for null
```

### Deletion

```typescript
node.remove();   // Immediate removal from document
```

### Export

```typescript
const bytes = await node.exportAsync({
  format: 'PNG',  // or 'SVG', 'JPG', 'PDF'
  constraint: { type: 'SCALE', value: 1 }
});
const base64 = figma.base64Encode(bytes);
```

## 8. Build Pipeline

Both plugins use esbuild with identical patterns:

```javascript
// build.js (simplified)
esbuild.build({
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2017',       // Figma sandbox JS engine
  format: 'iife',
});

// UI: builds HTML with inlined CSS/JS
esbuild.build({
  entryPoints: ['src/ui-app.ts'],  // or src/ui/index.ts
  bundle: true,
  outfile: 'dist/ui.js',
  format: 'iife',
});
// Then wraps in HTML template → dist/ui.html
```

### Gotchas

- **Target `es2017`** — Figma sandbox doesn't support latest JS features
- **IIFE format** — no ES modules in Figma sandbox
- **Single HTML file** — UI must be self-contained (all CSS/JS inlined)
- **No dynamic imports** — everything bundled at build time
- **Node.js APIs unavailable** — no `fs`, `path`, `crypto`, etc. in either context

## 9. Viewport & Selection

```typescript
figma.viewport.center;                          // { x, y } — current viewport center
figma.viewport.scrollAndZoomIntoView([nodes]);  // Pan + zoom to show nodes
figma.currentPage.selection = [node];           // Set selection (array of nodes)
```

Common pattern: create frame at viewport center, select it, scroll into view.

## 10. Notifications

```typescript
figma.notify('Message', { timeout: 2000 });                // Info toast
figma.notify('Error message', { error: true });             // Error toast
figma.notify('Processing...', { timeout: Infinity });       // Persistent (call .cancel())
```

- Max ~100 chars practical limit for readability
- Multiple notifications stack
- `timeout: 0` or omitted = default ~4s

## 11. Known Figma API Quirks

1. **`fills` returns readonly array** — must reassign entire array, not mutate: `node.fills = [newFill]`
2. **`cornerRadius` on frames** — set it on the frame, not individual corners (use `topLeftRadius` etc. for per-corner)
3. **`resize()` vs setting `width`/`height`** — `resize(w, h)` is the correct method; direct property assignment may not work on all node types
4. **`figma.mixed`** — returned when a property varies across selection. Always check: `if (prop !== figma.mixed)`
5. **Text node `characters`** — setting this clears all formatting. To preserve formatting, load font first, then set characters, then reapply formatting.
6. **Vector paths** — only accept absolute M, L, C, Q, Z commands. Use svg-utils normalization.
