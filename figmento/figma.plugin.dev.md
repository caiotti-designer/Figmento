# Figma Plugin Development Reference Guide

> A comprehensive reference for AI assistants (like Claude Code) to create Figma plugins with minimal errors.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Structure](#project-structure)
3. [Manifest Configuration](#manifest-configuration)
4. [Architecture Overview](#architecture-overview)
5. [TypeScript Setup](#typescript-setup)
6. [Node Types Reference](#node-types-reference)
7. [Working with Text](#working-with-text)
8. [Working with Images](#working-with-images)
9. [UI Development](#ui-development)
10. [Message Passing](#message-passing)
11. [Network Requests](#network-requests)
12. [Common Patterns](#common-patterns)
13. [Common Errors and Solutions](#common-errors-and-solutions)
14. [Best Practices](#best-practices)
15. [Complete Examples](#complete-examples)

---

## Quick Start

### Minimum Required Files

```
my-plugin/
├── manifest.json      # Plugin configuration (required)
├── code.ts            # Main plugin logic (required)
├── code.js            # Compiled output (generated)
├── ui.html            # Optional UI
├── package.json       # Dependencies
└── tsconfig.json      # TypeScript config
```

### Minimal manifest.json

```json
{
  "name": "My Plugin",
  "id": "PLUGIN_ID_FROM_FIGMA",
  "api": "1.0.0",
  "main": "code.js",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": ["none"]
  }
}
```

### Minimal code.ts (No UI)

```typescript
// Simple plugin that runs immediately
figma.closePlugin("Hello from my plugin!");
```

### Minimal code.ts (With UI)

```typescript
figma.showUI(__html__, { width: 300, height: 200 });

figma.ui.onmessage = (msg: { type: string; [key: string]: any }) => {
  if (msg.type === 'create-rectangles') {
    // Plugin logic here
  }
  figma.closePlugin();
};
```

---

## Project Structure

### Recommended Setup with TypeScript

```
my-plugin/
├── manifest.json
├── package.json
├── tsconfig.json
├── src/
│   ├── code.ts         # Main thread (sandbox)
│   └── ui.ts           # UI thread (iframe) - optional
├── ui.html             # UI markup
├── code.js             # Generated
└── node_modules/
    └── @figma/
        └── plugin-typings/
```

### package.json

```json
{
  "name": "my-figma-plugin",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch"
  },
  "devDependencies": {
    "@figma/plugin-typings": "^1.0.0",
    "typescript": "^5.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "strict": true,
    "moduleResolution": "node",
    "outDir": "./",
    "rootDir": "./src",
    "typeRoots": [
      "./node_modules/@types",
      "./node_modules/@figma"
    ]
  },
  "include": ["src/**/*.ts"]
}
```

---

## Manifest Configuration

### Complete manifest.json Reference

```json
{
  "name": "My Plugin",
  "id": "1234567890",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma", "figjam"],
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": ["api.example.com", "*.google.com"],
    "reasoning": "Required for API calls",
    "devAllowedDomains": ["http://localhost:3000"]
  },
  "menu": [
    { "name": "Action One", "command": "action-one" },
    { "separator": true },
    { "name": "Submenu", "menu": [
      { "name": "Sub Action", "command": "sub-action" }
    ]}
  ],
  "parameters": [
    {
      "name": "Text Input",
      "key": "text",
      "description": "Enter text"
    }
  ],
  "relaunchButtons": [
    { "command": "edit", "name": "Edit" },
    { "command": "open", "name": "Open", "multipleSelection": true }
  ]
}
```

### editorType Options

| Value | Description |
|-------|-------------|
| `"figma"` | Figma Design mode |
| `"figjam"` | FigJam |
| `"dev"` | Dev Mode |
| `"slides"` | Figma Slides |

**Valid Combinations:**
- `["figma"]`
- `["figjam"]`
- `["figma", "figjam"]`
- `["figma", "dev"]`
- `["figjam", "dev"]` ❌ Not supported
- `["slides", "dev"]` ❌ Not supported

### networkAccess Patterns

```json
{
  "networkAccess": {
    "allowedDomains": ["none"]
  }
}
```

```json
{
  "networkAccess": {
    "allowedDomains": ["*"],
    "reasoning": "Plugin needs access to any image URL provided by user"
  }
}
```

```json
{
  "networkAccess": {
    "allowedDomains": [
      "api.example.com",
      "*.googleapis.com",
      "https://specific-url.com/api/"
    ]
  }
}
```

---

## Architecture Overview

### Two-Thread Model

Figma plugins run in **two separate environments**:

```
┌─────────────────────────────────────────────────────────────┐
│                     FIGMA APPLICATION                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐     ┌─────────────────────────┐    │
│  │   MAIN THREAD       │     │   UI THREAD (iframe)    │    │
│  │   (Sandbox)         │     │                         │    │
│  │                     │     │                         │    │
│  │  • code.js runs     │     │  • ui.html runs here    │    │
│  │  • Access to figma  │     │  • Full browser APIs    │    │
│  │    API              │     │  • DOM, fetch, canvas   │    │
│  │  • NO browser APIs  │────▶│  • NO figma API access  │    │
│  │  • NO DOM access    │◀────│                         │    │
│  │                     │     │                         │    │
│  │  figma.ui.postMsg() │     │  parent.postMessage()   │    │
│  │  figma.ui.onmessage │     │  window.onmessage       │    │
│  └─────────────────────┘     └─────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Constraints

**Main Thread (code.ts):**
- ✅ Access Figma document via `figma` global
- ✅ Create, read, modify nodes
- ✅ Use `fetch()` for network requests
- ❌ NO DOM access
- ❌ NO `XMLHttpRequest`
- ❌ NO `localStorage`

**UI Thread (ui.html):**
- ✅ Full browser APIs
- ✅ DOM manipulation
- ✅ `fetch`, `canvas`, WebGL
- ❌ NO direct Figma API access
- ❌ Must communicate via postMessage

---

## TypeScript Setup

### Install Dependencies

```bash
npm install --save-dev @figma/plugin-typings typescript
```

### Enable Strict Mode (Highly Recommended)

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

### Type Checking Node Types

```typescript
// WRONG - Will crash if selection is empty or wrong type
const frame = figma.currentPage.selection[0];
frame.children; // Error: Property 'children' does not exist on type 'SceneNode'

// CORRECT - Always check node type first
const selection = figma.currentPage.selection[0];
if (selection && selection.type === 'FRAME') {
  // TypeScript now knows this is a FrameNode
  console.log(selection.children);
}
```

### Type Guard Helper Functions

```typescript
// Check if node has children
function hasChildren(node: SceneNode): node is FrameNode | GroupNode | ComponentNode | InstanceNode | BooleanOperationNode {
  return ['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'BOOLEAN_OPERATION'].includes(node.type);
}

// Check if node supports fills
function hasFills(node: SceneNode): node is GeometryMixin & SceneNode {
  return 'fills' in node;
}

// Usage
const node = figma.currentPage.selection[0];
if (node && hasChildren(node)) {
  console.log(node.children.length);
}
```

### Common Type Patterns

```typescript
// Handle mixed values
const fontSize = textNode.fontSize;
if (fontSize === figma.mixed) {
  console.log('Multiple font sizes');
} else {
  console.log(`Font size: ${fontSize}`);
}

// Handle async operations
async function processNodes() {
  const nodes = figma.currentPage.findAll();
  for (const node of nodes) {
    if (node.type === 'TEXT') {
      await figma.loadFontAsync(node.fontName as FontName);
    }
  }
}
```

---

## Node Types Reference

### All Node Types

| Node Type | Description | Has Children | Has Fills |
|-----------|-------------|--------------|-----------|
| `DocumentNode` | Root of document | ✅ (pages) | ❌ |
| `PageNode` | Document page | ✅ | ❌ |
| `FrameNode` | Frame/artboard | ✅ | ✅ |
| `GroupNode` | Group | ✅ | ❌ |
| `ComponentNode` | Component definition | ✅ | ✅ |
| `ComponentSetNode` | Variant set | ✅ | ❌ |
| `InstanceNode` | Component instance | ✅ | ✅ |
| `BooleanOperationNode` | Boolean operation | ✅ | ✅ |
| `SectionNode` | Section | ✅ | ❌ |
| `RectangleNode` | Rectangle | ❌ | ✅ |
| `EllipseNode` | Ellipse/circle | ❌ | ✅ |
| `PolygonNode` | Polygon | ❌ | ✅ |
| `StarNode` | Star shape | ❌ | ✅ |
| `VectorNode` | Vector path | ❌ | ✅ |
| `TextNode` | Text layer | ❌ | ✅ |
| `LineNode` | Line | ❌ | ❌ |
| `SliceNode` | Slice for export | ❌ | ❌ |
| `StickyNode` | FigJam sticky | ❌ | ✅ |
| `StampNode` | FigJam stamp | ❌ | ❌ |
| `ConnectorNode` | FigJam connector | ❌ | ❌ |
| `ShapeWithTextNode` | FigJam shape | ❌ | ✅ |
| `HighlightNode` | FigJam highlight | ❌ | ✅ |
| `EmbedNode` | Embedded content | ❌ | ❌ |
| `LinkUnfurlNode` | Link preview | ❌ | ❌ |

### Creating Nodes

```typescript
// Basic shapes
const rect = figma.createRectangle();
const ellipse = figma.createEllipse();
const polygon = figma.createPolygon();
const star = figma.createStar();
const line = figma.createLine();
const vector = figma.createVector();

// Containers
const frame = figma.createFrame();
const component = figma.createComponent();
const componentSet = figma.combineAsVariants([comp1, comp2], parent);

// Text
const text = figma.createText();

// FigJam-specific
const sticky = figma.createSticky();
const stamp = figma.createStamp();
const connector = figma.createConnector();
const shape = figma.createShapeWithText();
const highlight = figma.createHighlight();

// From existing
const clone = node.clone();
```

### Common Node Properties

```typescript
// All SceneNodes have these
node.id          // Unique ID (read-only)
node.name        // Layer name
node.visible     // Visibility
node.locked      // Lock state
node.parent      // Parent node
node.removed     // Check if deleted

// Position & Size (most nodes)
node.x           // X position
node.y           // Y position
node.width       // Width (read-only for some)
node.height      // Height (read-only for some)
node.rotation    // Rotation in degrees

// Methods
node.remove()                    // Delete node
node.resize(width, height)       // Resize
node.rescale(scale)              // Scale
node.clone()                     // Duplicate
```

---

## Working with Text

### ⚠️ CRITICAL: Always Load Fonts First

```typescript
// WRONG - Will throw error
const text = figma.createText();
text.characters = "Hello"; // Error: unloaded font

// CORRECT - Load font first, then set fontName, then characters
async function createText() {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  
  const text = figma.createText();
  text.fontName = { family: "Inter", style: "Regular" };
  text.characters = "Hello World";
  
  return text;
}
```

### Loading Fonts for Existing Text

```typescript
async function modifyText(textNode: TextNode) {
  // Check for missing fonts first
  if (textNode.hasMissingFont) {
    figma.notify("Cannot edit: font is missing");
    return;
  }

  // For single font text
  if (textNode.fontName !== figma.mixed) {
    await figma.loadFontAsync(textNode.fontName as FontName);
    textNode.characters = "New text";
  }
  
  // For mixed fonts (multiple styles)
  else {
    const fonts = textNode.getRangeAllFontNames(0, textNode.characters.length);
    await Promise.all(fonts.map(font => figma.loadFontAsync(font)));
    textNode.characters = "New text";
  }
}
```

### Font Loading Patterns

```typescript
// Load multiple fonts at once
async function loadAllFonts() {
  await Promise.all([
    figma.loadFontAsync({ family: "Inter", style: "Regular" }),
    figma.loadFontAsync({ family: "Inter", style: "Bold" }),
    figma.loadFontAsync({ family: "Inter", style: "Italic" }),
  ]);
}

// Load from existing node
async function copyTextStyle(from: TextNode, to: TextNode) {
  if (from.fontName !== figma.mixed) {
    await figma.loadFontAsync(from.fontName as FontName);
    to.fontName = from.fontName;
  }
}
```

### Text Properties That Require Font Loading

These properties require loading the font first:
- `characters` - The text content
- `fontSize`
- `fontName`
- `textCase`
- `textDecoration`
- `letterSpacing`
- `lineHeight`
- `paragraphIndent`
- `paragraphSpacing`
- `textStyleId`

These do NOT require font loading:
- `fills`
- `fillStyleId`
- `strokes`
- `strokeWeight`
- `effects`

### Handling Mixed Styles

```typescript
// Get font at specific position
const fontAtPos = textNode.getRangeFontName(5, 6) as FontName;

// Set style for a range
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
textNode.setRangeFontName(0, 5, { family: "Inter", style: "Bold" });
textNode.setRangeFontSize(0, 5, 24);
textNode.setRangeTextDecoration(0, 5, "UNDERLINE");
```

---

## Working with Images

### ⚠️ CRITICAL: Images are Fills, Not Nodes

Figma doesn't have "image nodes" - images are applied as fills to shapes.

```typescript
// Create image from URL
async function addImageFromURL(url: string) {
  try {
    const image = await figma.createImageAsync(url);
    const { width, height } = await image.getSizeAsync();
    
    const rect = figma.createRectangle();
    rect.resize(width, height);
    rect.fills = [{
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: 'FILL'
    }];
    
    figma.currentPage.appendChild(rect);
    return rect;
  } catch (error) {
    figma.notify("Failed to load image");
    throw error;
  }
}
```

### Create Image from Bytes

```typescript
// From Uint8Array (e.g., from file input)
function createImageFromBytes(bytes: Uint8Array): string {
  const image = figma.createImage(bytes);
  return image.hash;
}

// Apply to node
function setImageFill(node: RectangleNode | FrameNode, imageHash: string) {
  node.fills = [{
    type: 'IMAGE',
    imageHash: imageHash,
    scaleMode: 'FILL'  // or 'FIT', 'CROP', 'TILE'
  }];
}
```

### Image Scale Modes

| Mode | Description |
|------|-------------|
| `'FILL'` | Fill container, crop excess |
| `'FIT'` | Fit inside container, may have empty space |
| `'CROP'` | Custom crop with transform |
| `'TILE'` | Repeat pattern |

### Reading Images from Nodes

```typescript
async function getImageBytes(node: SceneNode): Promise<Uint8Array | null> {
  if (!('fills' in node)) return null;
  
  const fills = node.fills as Paint[];
  const imageFill = fills.find(f => f.type === 'IMAGE') as ImagePaint | undefined;
  
  if (!imageFill?.imageHash) return null;
  
  const image = figma.getImageByHash(imageFill.imageHash);
  if (!image) return null;
  
  return await image.getBytesAsync();
}
```

### Image Constraints

- Max size: 4096 x 4096 pixels
- Supported formats: PNG, JPEG, GIF
- CORS must allow access (or use base64)

---

## UI Development

### Basic UI Setup

**manifest.json:**
```json
{
  "ui": "ui.html"
}
```

**code.ts:**
```typescript
figma.showUI(__html__, {
  width: 300,
  height: 400,
  title: "My Plugin"
});
```

**ui.html:**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: Inter, sans-serif;
      font-size: 12px;
      margin: 8px;
    }
    button {
      background: #18A0FB;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      cursor: pointer;
    }
    button:hover {
      background: #0D8CE9;
    }
    input {
      width: 100%;
      padding: 8px;
      border: 1px solid #E5E5E5;
      border-radius: 4px;
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  <h2>My Plugin</h2>
  <input type="text" id="input" placeholder="Enter value">
  <button id="submit">Create</button>
  <button id="cancel">Cancel</button>

  <script>
    document.getElementById('submit').onclick = () => {
      const value = document.getElementById('input').value;
      parent.postMessage({ pluginMessage: { type: 'create', value } }, '*');
    };

    document.getElementById('cancel').onclick = () => {
      parent.postMessage({ pluginMessage: { type: 'cancel' } }, '*');
    };
  </script>
</body>
</html>
```

### showUI Options

```typescript
figma.showUI(__html__, {
  width: 300,           // Width in pixels
  height: 400,          // Height in pixels
  title: "Plugin Name", // Window title
  visible: true,        // Show immediately (default: true)
  position: {           // Window position
    x: 100,
    y: 100
  },
  themeColors: true     // Use Figma's theme colors
});
```

### Multiple UI Files

**manifest.json:**
```json
{
  "ui": {
    "main": "ui/main.html",
    "settings": "ui/settings.html"
  }
}
```

**code.ts:**
```typescript
// Access via __uiFiles__
figma.showUI(__uiFiles__["main"], { width: 300, height: 200 });

// Later, switch to settings
figma.showUI(__uiFiles__["settings"], { width: 300, height: 300 });
```

### UI Control Methods

```typescript
// Resize after creation
figma.ui.resize(400, 500);

// Reposition
figma.ui.reposition(100, 100);

// Hide (keeps running)
figma.ui.hide();

// Show again
figma.ui.show();

// Close completely
figma.ui.close();
```

---

## Message Passing

### ⚠️ CRITICAL: Different Syntax in Each Thread

**From UI → Main Thread:**
```javascript
// In ui.html - MUST use pluginMessage wrapper
parent.postMessage({ pluginMessage: { type: 'action', data: 123 } }, '*');
```

**Receive in Main Thread:**
```typescript
// In code.ts
figma.ui.onmessage = (msg) => {
  // msg is the pluginMessage content directly
  console.log(msg.type); // 'action'
  console.log(msg.data); // 123
};
```

**From Main Thread → UI:**
```typescript
// In code.ts - NO wrapper needed
figma.ui.postMessage({ type: 'response', data: 'hello' });
```

**Receive in UI:**
```javascript
// In ui.html - Data is in event.data.pluginMessage
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  console.log(msg.type); // 'response'
  console.log(msg.data); // 'hello'
};
```

### Complete Message Flow Example

**code.ts:**
```typescript
figma.showUI(__html__, { width: 300, height: 200 });

// Send initial data to UI
const selection = figma.currentPage.selection;
figma.ui.postMessage({
  type: 'selection',
  count: selection.length,
  names: selection.map(n => n.name)
});

// Receive from UI
figma.ui.onmessage = (msg) => {
  switch (msg.type) {
    case 'create':
      createRectangles(msg.count);
      break;
    case 'cancel':
      figma.closePlugin();
      break;
  }
};

function createRectangles(count: number) {
  for (let i = 0; i < count; i++) {
    const rect = figma.createRectangle();
    rect.x = i * 150;
    rect.fills = [{ type: 'SOLID', color: { r: 1, g: 0.5, b: 0 } }];
  }
  figma.closePlugin("Created rectangles!");
}
```

**ui.html:**
```html
<script>
  // Receive from main thread
  window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (msg.type === 'selection') {
      document.getElementById('count').textContent = msg.count;
    }
  };

  // Send to main thread
  function create() {
    const count = parseInt(document.getElementById('input').value);
    parent.postMessage({ pluginMessage: { type: 'create', count } }, '*');
  }

  function cancel() {
    parent.postMessage({ pluginMessage: { type: 'cancel' } }, '*');
  }
</script>
```

### Type-Safe Messages

```typescript
// Define message types
type UIMessage = 
  | { type: 'create'; count: number }
  | { type: 'update'; id: string; name: string }
  | { type: 'cancel' };

type PluginMessage =
  | { type: 'selection'; nodes: { id: string; name: string }[] }
  | { type: 'error'; message: string };

// Use in code.ts
figma.ui.onmessage = (msg: UIMessage) => {
  switch (msg.type) {
    case 'create':
      // msg.count is typed as number
      break;
    case 'update':
      // msg.id and msg.name are typed as string
      break;
  }
};
```

---

## Network Requests

### Using Fetch (Recommended)

```typescript
// In code.ts (main thread)
async function fetchData() {
  try {
    const response = await fetch('https://api.example.com/data');
    const json = await response.json();
    return json;
  } catch (error) {
    figma.notify("Network request failed");
    throw error;
  }
}
```

### CORS Considerations

```typescript
// Plugin iframes have null origin
// Only APIs with Access-Control-Allow-Origin: * will work

// If CORS is an issue, use the UI iframe instead
// ui.html can make requests, then send data back
```

### Network Access in Manifest

```json
{
  "networkAccess": {
    "allowedDomains": [
      "api.example.com",
      "*.googleapis.com"
    ],
    "reasoning": "Required to fetch user data from API",
    "devAllowedDomains": [
      "http://localhost:3000"
    ]
  }
}
```

### Making Requests from UI

```html
<!-- ui.html -->
<script>
  async function fetchFromAPI() {
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    
    // Send to main thread
    parent.postMessage({ pluginMessage: { type: 'data', data } }, '*');
  }
</script>
```

---

## Common Patterns

### Iterating Over Selection

```typescript
function processSelection() {
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify("Please select something");
    return;
  }

  for (const node of selection) {
    // Check type before accessing type-specific properties
    if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE') {
      node.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
    }
  }
}
```

### Finding Nodes

```typescript
// Find all in current page
const allFrames = figma.currentPage.findAll(n => n.type === 'FRAME');
const allText = figma.currentPage.findAll(n => n.type === 'TEXT');

// Find by name
const namedNode = figma.currentPage.findOne(n => n.name === 'Header');

// Find children of a specific node
if (frame.type === 'FRAME') {
  const childText = frame.findAll(n => n.type === 'TEXT');
}

// Async find (for dynamic page loading)
const node = await figma.getNodeByIdAsync('1:23');
```

### Creating Structured Content

```typescript
async function createCard(title: string, body: string) {
  // Create frame
  const card = figma.createFrame();
  card.name = 'Card';
  card.resize(300, 200);
  card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  card.cornerRadius = 8;
  
  // Enable auto-layout
  card.layoutMode = 'VERTICAL';
  card.paddingLeft = 16;
  card.paddingRight = 16;
  card.paddingTop = 16;
  card.paddingBottom = 16;
  card.itemSpacing = 8;
  
  // Load font
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  
  // Create title
  const titleText = figma.createText();
  titleText.fontName = { family: 'Inter', style: 'Bold' };
  titleText.fontSize = 18;
  titleText.characters = title;
  card.appendChild(titleText);
  
  // Create body
  const bodyText = figma.createText();
  bodyText.fontName = { family: 'Inter', style: 'Regular' };
  bodyText.fontSize = 14;
  bodyText.characters = body;
  card.appendChild(bodyText);
  
  figma.currentPage.appendChild(card);
  return card;
}
```

### Modifying Fills Safely

```typescript
// ⚠️ WRONG - fills is read-only array
node.fills[0].color = { r: 1, g: 0, b: 0 }; // Error!

// ✅ CORRECT - clone, modify, reassign
const fills = JSON.parse(JSON.stringify(node.fills));
fills[0].color = { r: 1, g: 0, b: 0 };
node.fills = fills;

// Or create new fills
node.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
```

### Working with Components

```typescript
// Create component
const component = figma.createComponent();
component.name = 'Button';
component.resize(100, 40);

// Create instance
const instance = component.createInstance();
instance.x = 200;

// Swap instance component
instance.swapComponent(otherComponent);

// Get main component from instance
const main = instance.mainComponent;

// Import component by key
const imported = await figma.importComponentByKeyAsync('abc123');
```

### Plugin Data Storage

```typescript
// Store data on a node (persists with file)
node.setPluginData('myKey', 'myValue');
const value = node.getPluginData('myKey');

// Store shared data (accessible by all plugins)
node.setSharedPluginData('namespace', 'key', 'value');

// Store in client storage (persists locally)
await figma.clientStorage.setAsync('settings', { theme: 'dark' });
const settings = await figma.clientStorage.getAsync('settings');
```

---

## Common Errors and Solutions

### Error: "Cannot write to node with unloaded font"

**Cause:** Trying to modify text without loading font first.

```typescript
// SOLUTION
async function fixTextError() {
  const textNode = figma.currentPage.selection[0] as TextNode;
  
  // Check for missing fonts
  if (textNode.hasMissingFont) {
    figma.notify("Font is missing from system");
    return;
  }
  
  // Load the font first
  if (textNode.fontName !== figma.mixed) {
    await figma.loadFontAsync(textNode.fontName as FontName);
  } else {
    const fonts = textNode.getRangeAllFontNames(0, textNode.characters.length);
    await Promise.all(fonts.map(f => figma.loadFontAsync(f)));
  }
  
  // NOW you can modify
  textNode.characters = "New text";
}
```

### Error: "Expected property to have type X"

**Cause:** Wrong data type passed to property.

```typescript
// WRONG
node.opacity = "0.5";  // String instead of number

// CORRECT
node.opacity = 0.5;    // Number between 0-1

// WRONG
node.fills = { type: 'SOLID', color: { r: 1, g: 0, b: 0 } };  // Object instead of array

// CORRECT
node.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]; // Array of paints
```

### Error: "Cannot call with documentAccess: dynamic-page"

**Cause:** Using synchronous API that's incompatible with dynamic page loading.

```typescript
// WRONG (for new plugins)
const node = figma.getNodeById('1:23');

// CORRECT
const node = await figma.getNodeByIdAsync('1:23');
```

### Error: "Cannot write to internal and read-only nodes"

**Cause:** Trying to modify nodes in Dev Mode or read-only nodes.

```typescript
// Check editor type first
if (figma.editorType === 'dev') {
  figma.notify("Cannot modify nodes in Dev Mode");
  return;
}

// Check if node is editable
if (node.type === 'INSTANCE') {
  // Some instance properties can't be modified
  // Clone the main component instead
  const clone = node.mainComponent?.clone();
}
```

### Error: CORS / Network Errors

**Cause:** Plugin trying to access domain not in allowedDomains.

```json
// manifest.json - Add required domains
{
  "networkAccess": {
    "allowedDomains": ["api.example.com"]
  }
}
```

### Error: "Property 'X' does not exist on type 'SceneNode'"

**Cause:** Not checking node type before accessing type-specific properties.

```typescript
// WRONG
const children = node.children;  // SceneNode doesn't have children

// CORRECT
if (node.type === 'FRAME' || node.type === 'GROUP') {
  const children = node.children;
}

// Or use type guard
if ('children' in node) {
  const children = (node as ChildrenMixin & SceneNode).children;
}
```

---

## Best Practices

### 1. Always Use TypeScript

TypeScript prevents most common errors at compile time.

```bash
npm install --save-dev @figma/plugin-typings typescript
```

### 2. Handle Empty Selections

```typescript
function processSelection() {
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify("Please select at least one layer", { error: true });
    return;
  }
  
  // Process selection...
}
```

### 3. Validate Node Types

```typescript
function processFrames() {
  const selection = figma.currentPage.selection;
  
  const frames = selection.filter(node => node.type === 'FRAME');
  
  if (frames.length === 0) {
    figma.notify("Please select at least one frame");
    return;
  }
  
  for (const frame of frames) {
    // TypeScript knows these are FrameNodes
    console.log(frame.children.length);
  }
}
```

### 4. Use Async/Await Properly

```typescript
// WRONG - doesn't wait for fonts
function createText() {
  figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  const text = figma.createText();
  text.characters = 'Hello'; // Error: font not loaded
}

// CORRECT - waits for font
async function createText() {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  const text = figma.createText();
  text.fontName = { family: 'Inter', style: 'Regular' };
  text.characters = 'Hello';
}
```

### 5. Clone Arrays Before Modifying

```typescript
// WRONG
node.fills[0].color = newColor;  // Direct modification

// CORRECT
const fills = JSON.parse(JSON.stringify(node.fills));
fills[0].color = newColor;
node.fills = fills;
```

### 6. Provide User Feedback

```typescript
// Notifications
figma.notify("Action completed");
figma.notify("Error occurred", { error: true });
figma.notify("Processing...", { timeout: 10000 });

// Close with message
figma.closePlugin("Created 5 rectangles");
```

### 7. Handle Errors Gracefully

```typescript
async function safeAction() {
  try {
    await riskyOperation();
    figma.closePlugin("Success!");
  } catch (error) {
    figma.notify(`Error: ${error.message}`, { error: true });
    figma.closePlugin();
  }
}
```

### 8. Batch Operations for Performance

```typescript
// SLOW - triggers multiple renders
for (const node of nodes) {
  node.x = 100;
  node.y = 100;
}

// FASTER - batch updates
figma.skipInvisibleInstanceChildren = true;
// Do operations
figma.skipInvisibleInstanceChildren = false;
```

---

## Complete Examples

### Example 1: Simple Color Changer

```typescript
// code.ts
if (figma.currentPage.selection.length === 0) {
  figma.notify("Please select something");
  figma.closePlugin();
} else {
  const nodes = figma.currentPage.selection;
  
  for (const node of nodes) {
    if ('fills' in node) {
      (node as GeometryMixin).fills = [{
        type: 'SOLID',
        color: { r: 1, g: 0, b: 0 }
      }];
    }
  }
  
  figma.closePlugin(`Changed color of ${nodes.length} layers`);
}
```

### Example 2: Text Generator with UI

**manifest.json:**
```json
{
  "name": "Text Generator",
  "id": "123456",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] }
}
```

**code.ts:**
```typescript
figma.showUI(__html__, { width: 300, height: 200 });

figma.ui.onmessage = async (msg: { type: string; text?: string }) => {
  if (msg.type === 'create-text' && msg.text) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    
    const text = figma.createText();
    text.fontName = { family: 'Inter', style: 'Regular' };
    text.characters = msg.text;
    text.fontSize = 24;
    
    // Center in viewport
    text.x = figma.viewport.center.x - text.width / 2;
    text.y = figma.viewport.center.y - text.height / 2;
    
    figma.currentPage.selection = [text];
    figma.viewport.scrollAndZoomIntoView([text]);
    
    figma.closePlugin("Text created!");
  }
  
  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
```

**ui.html:**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Inter, sans-serif; padding: 16px; }
    input { width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid #ddd; border-radius: 4px; }
    .buttons { display: flex; gap: 8px; }
    button { flex: 1; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; }
    .primary { background: #18A0FB; color: white; }
    .secondary { background: #f0f0f0; }
  </style>
</head>
<body>
  <h3>Create Text</h3>
  <input type="text" id="text-input" placeholder="Enter your text">
  <div class="buttons">
    <button class="secondary" onclick="cancel()">Cancel</button>
    <button class="primary" onclick="create()">Create</button>
  </div>
  
  <script>
    function create() {
      const text = document.getElementById('text-input').value;
      if (text) {
        parent.postMessage({ pluginMessage: { type: 'create-text', text } }, '*');
      }
    }
    
    function cancel() {
      parent.postMessage({ pluginMessage: { type: 'cancel' } }, '*');
    }
    
    // Allow Enter key
    document.getElementById('text-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') create();
    });
  </script>
</body>
</html>
```

### Example 3: Image Fetcher

```typescript
// code.ts
figma.showUI(__html__, { width: 400, height: 300 });

figma.ui.onmessage = async (msg: { type: string; url?: string }) => {
  if (msg.type === 'fetch-image' && msg.url) {
    try {
      figma.notify("Loading image...");
      
      const image = await figma.createImageAsync(msg.url);
      const { width, height } = await image.getSizeAsync();
      
      const rect = figma.createRectangle();
      rect.name = 'Image';
      rect.resize(width, height);
      rect.fills = [{
        type: 'IMAGE',
        imageHash: image.hash,
        scaleMode: 'FILL'
      }];
      
      rect.x = figma.viewport.center.x - width / 2;
      rect.y = figma.viewport.center.y - height / 2;
      
      figma.currentPage.selection = [rect];
      figma.viewport.scrollAndZoomIntoView([rect]);
      
      figma.closePlugin("Image added!");
    } catch (error) {
      figma.notify("Failed to load image", { error: true });
    }
  }
};
```

### Example 4: Batch Rename

```typescript
// code.ts - No UI needed, uses parameters
figma.parameters.on('input', ({ parameters, key, query, result }) => {
  if (key === 'prefix') {
    result.setSuggestions([
      { name: 'icon-', data: 'icon-' },
      { name: 'btn-', data: 'btn-' },
      { name: 'img-', data: 'img-' }
    ]);
  }
});

figma.on('run', ({ parameters }) => {
  const prefix = parameters?.prefix || '';
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify("Please select layers to rename");
    figma.closePlugin();
    return;
  }
  
  let count = 0;
  for (const node of selection) {
    if (!node.name.startsWith(prefix)) {
      node.name = prefix + node.name;
      count++;
    }
  }
  
  figma.closePlugin(`Renamed ${count} layers`);
});
```

**manifest.json for parameters:**
```json
{
  "name": "Batch Rename",
  "parameters": [
    {
      "name": "Prefix",
      "key": "prefix",
      "description": "Prefix to add to layer names"
    }
  ]
}
```

---

## Quick Reference Cheat Sheet

### Accessing Figma

```typescript
figma.root                    // DocumentNode
figma.currentPage            // Current PageNode
figma.currentPage.selection  // Selected nodes
figma.viewport.center        // Viewport center {x, y}
figma.editorType            // 'figma' | 'figjam' | 'dev' | 'slides'
```

### Creating Nodes

```typescript
figma.createRectangle()
figma.createEllipse()
figma.createFrame()
figma.createComponent()
figma.createText()
figma.createLine()
figma.createVector()
```

### Common Operations

```typescript
node.clone()                  // Duplicate
node.remove()                 // Delete
node.resize(w, h)            // Resize
parent.appendChild(node)      // Add to parent
figma.loadFontAsync(font)     // Load font
figma.createImageAsync(url)   // Create image
figma.getNodeByIdAsync(id)    // Get node by ID
```

### Plugin Lifecycle

```typescript
figma.showUI(__html__, opts)  // Show UI
figma.ui.postMessage(msg)     // Send to UI
figma.ui.onmessage = (msg) => {} // Receive from UI
figma.closePlugin(msg?)       // Close plugin
figma.notify(msg, opts?)      // Show notification
```

### Colors

```typescript
// RGB values are 0-1, not 0-255
const red = { r: 1, g: 0, b: 0 };
const green = { r: 0, g: 1, b: 0 };
const blue = { r: 0, g: 0, b: 1 };
const white = { r: 1, g: 1, b: 1 };
const black = { r: 0, g: 0, b: 0 };

// Convert hex to Figma RGB
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
}
```

---

## Resources

- **Official Docs:** https://developers.figma.com/docs/plugins/
- **API Reference:** https://www.figma.com/plugin-docs/api/api-reference/
- **TypeScript Typings:** https://github.com/figma/plugin-typings
- **ESLint Rules:** https://github.com/figma/eslint-plugin-figma-plugins
- **Discord Community:** https://discord.gg/xzQhe2Vcvx
- **Plugin Samples:** https://github.com/figma/plugin-samples

---

*Last updated: January 2026*
