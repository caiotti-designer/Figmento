# Figmento MCP — Project Briefing

> Transforming our Figma plugin into an MCP-powered design agent

---

## Architecture Overview

```
                         Claude Code (or any MCP client)
                                    |
                              [stdio / MCP protocol]
                                    |
                     +==============================+
                     |   COMPONENT 2                |
                     |   Figmento MCP Server        |
                     |   (Node.js / TypeScript)     |
                     |                              |
                     |  Design Tools:               |
                     |   create_frame               |
                     |   create_text                |
                     |   set_fill                   |
                     |   place_image                |
                     |   export_node ...            |
                     |                              |
                     |  Intelligence Tools:         |
                     |   get_size_preset            |
                     |   get_font_pairing           |
                     |   get_brand_kit ...          |
                     +==============================+
                                    |
                           [WebSocket messages]
                           (JSON commands/responses)
                                    |
                     +==============================+
                     |   COMPONENT 3                |
                     |   WebSocket Relay Server     |
                     |   (Node.js / ws)             |
                     |                              |
                     |  - Channel-based routing     |
                     |  - MCP ←→ Plugin bridging    |
                     |  - Multi-file support        |
                     +==============================+
                                    |
                           [WebSocket messages]
                                    |
                     +==============================+
                     |   COMPONENT 1                |
                     |   Figmento Figma Plugin      |
                     |   (Revamped)                 |
                     |                              |
                     |  - WS listener in UI iframe  |
                     |  - Executes Figma API cmds   |
                     |  - Returns node IDs, exports |
                     |  - Minimal status UI         |
                     +==============================+
                                    |
                              [Figma Plugin API]
                                    |
                            Figma Canvas / Document


    External:
    +====================+
    |  mcp-image server  |  (Gemini 3 Pro Image generation)
    |  Already configured|  → generates images to disk
    +====================+  → Figmento MCP reads & places into Figma
```

---

## Component Breakdown

### Component 1 — Figmento Figma Plugin (Revamped)

**What changes:** Strip the AI/UI-driven logic. Plugin becomes a thin WebSocket command executor.

**What stays:** All element creation code (`element-creators.ts`, `color-utils.ts`, `svg-utils.ts`, `types.ts`).

```
figmento-plugin/
├── src/
│   ├── code.ts                 # REVAMPED — message router for WS commands
│   ├── element-creators.ts     # REUSED AS-IS — createElement(), all node factories
│   ├── color-utils.ts          # REUSED AS-IS — hexToRgb, rgbToHex, getFontStyle
│   ├── svg-utils.ts            # REUSED AS-IS — scalePathData, parsePath
│   ├── types.ts                # EXTENDED — add WS message types, keep UIElement
│   └── ui.html                 # REWRITTEN — minimal connection UI
├── manifest.json               # UPDATED — add WS domain to allowedDomains
├── build.js                    # REUSED AS-IS
├── package.json
└── tsconfig.json
```

**UI iframe responsibilities (new):**
- Connect to WebSocket relay server
- Display connection status (connected/disconnected) and channel ID
- Relay commands from WS → `figma.ui.postMessage()` → sandbox
- Relay results from sandbox → `postMessage()` → WS

**Sandbox responsibilities (revised `code.ts`):**
- Listen for command messages from UI iframe
- Execute Figma API operations per command type
- Return results (node IDs, success/error, exported images)

### Component 2 — Figmento MCP Server (New)

```
figmento-mcp-server/
├── src/
│   ├── index.ts                # MCP server entry point (stdio transport)
│   ├── server.ts               # MCP server setup, tool registration
│   ├── tools/
│   │   ├── canvas.ts           # create_frame, create_rectangle, create_ellipse, group_nodes
│   │   ├── text.ts             # create_text, update_text
│   │   ├── style.ts            # set_fill, set_stroke, set_effects, set_corner_radius, set_opacity
│   │   ├── layout.ts           # set_auto_layout, set_layout_sizing, set_layout_align
│   │   ├── image.ts            # place_image, place_generated_image
│   │   ├── icon.ts             # place_icon (Lucide)
│   │   ├── export.ts           # export_node (PNG/SVG screenshot)
│   │   ├── scene.ts            # get_node_info, get_selection, get_page_nodes, delete_node, move_node
│   │   └── intelligence.ts     # get_size_preset, get_font_pairing, get_color_palette, get_brand_kit
│   ├── ws-client.ts            # WebSocket client connecting to relay
│   ├── channel.ts              # Channel management (join/leave)
│   └── types.ts                # Shared types, command/response schemas
├── knowledge/
│   ├── size-presets.yaml       # Social media + print sizes
│   ├── typography.yaml         # Type scales, font pairings, line heights
│   ├── color-system.yaml       # Mood palettes, contrast ratios
│   ├── layout.yaml             # 8px grid, spacing scale
│   └── brand-kit-schema.yaml   # Brand kit YAML format
├── package.json
└── tsconfig.json
```

### Component 3 — WebSocket Relay Server (New)

```
figmento-ws-relay/
├── src/
│   ├── index.ts                # Server entry point
│   ├── relay.ts                # WebSocket server, channel routing
│   └── types.ts                # Message protocol types
├── package.json
└── tsconfig.json
```

**Protocol:**
```json
// Client joins a channel
{ "type": "join", "channel": "figmento-abc123" }

// MCP → Plugin command
{ "type": "command", "id": "cmd-001", "channel": "figmento-abc123",
  "action": "create_frame", "params": { "name": "Hero", "width": 1080, "height": 1350 } }

// Plugin → MCP response
{ "type": "response", "id": "cmd-001", "channel": "figmento-abc123",
  "success": true, "data": { "nodeId": "42:17" } }
```

---

## MCP Tools Inventory

### Design Primitive Tools (mapped from existing code)

These tools map directly to capabilities already implemented in `element-creators.ts` and `code.ts`:

| MCP Tool | Existing Code Reference | Description |
|----------|------------------------|-------------|
| `create_frame` | `createFrameNode()` in `element-creators.ts:L~15-50` | Create frame with optional auto-layout, padding, fills |
| `create_text` | `setupTextNode()` in `element-creators.ts:L~200-320` | Create text with font, size, weight, color, segments |
| `create_rectangle` | `createElement()` case `rectangle` | Create rectangle with fills, stroke, corner radius |
| `create_ellipse` | `createElement()` case `ellipse` | Create ellipse/circle |
| `create_image` | `createImageFromBase64()` in `element-creators.ts:L~100-140` | Place image from base64 data as rectangle fill |
| `create_icon` | `createIconPlaceholder()` in `element-creators.ts:L~150-195` | Place Lucide icon by name |
| `set_fill` | `applyFills()` in `element-creators.ts` | Set SOLID, GRADIENT_LINEAR, or IMAGE fill |
| `set_stroke` | `applyStroke()` in `element-creators.ts` | Set stroke color and width |
| `set_effects` | `applyEffects()` in `element-creators.ts` | Add drop shadow / inner shadow |
| `set_corner_radius` | `applyCornerRadius()` in `element-creators.ts` | Uniform or per-corner radius |
| `set_opacity` | `applyCommonProperties()` in `element-creators.ts` | Set node opacity 0-1 |
| `set_auto_layout` | `createFrameNode()` auto-layout config | Set layout mode, spacing, padding, alignment |
| `set_layout_sizing` | `applyLayoutProperties()` in `element-creators.ts` | Set FIXED/FILL/HUG sizing for auto-layout children |

### Scene Management Tools (mapped from existing code)

| MCP Tool | Existing Code Reference | Description |
|----------|------------------------|-------------|
| `get_selection` | `handleGetSelectedImage()` in `code.ts:L450` | Get current Figma selection info |
| `export_node` | `node.exportAsync()` in `code.ts:L468` | Export node as PNG base64 (for AI self-evaluation) |
| `get_node_info` | `figma.getNodeById()` used throughout `code.ts` | Get node properties by ID |
| `delete_node` | `node.remove()` (Figma API) | Remove a node |
| `move_node` | Node `.x`, `.y` setters used in `code.ts:L64-66` | Reposition a node |
| `resize_node` | `node.resize()` used in `code.ts:L364` | Resize a node |
| `rename_node` | `node.name` setter | Rename a node |
| `append_child` | `parent.appendChild()` used in `code.ts:L766` | Move node into a parent frame |
| `get_page_nodes` | `figma.currentPage.children` | List top-level nodes on current page |

### Batch/Composite Tools (mapped from existing code)

| MCP Tool | Existing Code Reference | Description |
|----------|------------------------|-------------|
| `create_design` | `createDesignFromAnalysis()` in `code.ts:L732` | Create full design from UIAnalysis JSON (the big one) |
| `create_carousel` | `create-carousel` handler in `code.ts:L52-81` | Create multi-slide carousel |
| `create_presentation` | `create-presentation` handler in `code.ts:L83-114` | Create multi-slide presentation |
| `scan_template` | `scanTemplateFrames()` in `code.ts:L505` | Scan selected frames for #-prefixed placeholder layers |
| `apply_template_text` | `applyTemplateText()` in `code.ts:L610` | Fill template text placeholders |
| `apply_template_image` | `applyTemplateImage()` in `code.ts:L668` | Fill template image placeholders |
| `scan_slide_style` | `scan-slide-style` handler in `code.ts:L116` | Extract color/font style from selected slide |

### Design Intelligence Tools (new — embedded knowledge)

| MCP Tool | Description |
|----------|-------------|
| `get_size_preset` | Query social media / print size presets by platform or name |
| `get_font_pairing` | Get complementary font pairs (heading + body) by mood/style |
| `get_type_scale` | Get recommended font sizes for a given base size and scale ratio |
| `get_color_palette` | Generate palette from mood keywords or base color |
| `get_contrast_check` | Check WCAG contrast ratio between two colors |
| `get_spacing_scale` | Get 8px-grid spacing values for a design system |
| `get_brand_kit` | Load saved brand kit (colors, fonts, logos, voice) |
| `save_brand_kit` | Save brand kit for reuse across sessions |
| `get_layout_guide` | Get layout recommendations for a given format (margins, columns, grid) |

---

## Code Reuse Mapping

### Reused As-Is (copy into plugin component)

| File | Lines | What It Does |
|------|-------|-------------|
| `figmento/src/element-creators.ts` | ~400 | All Figma node creation: frames, text, images, icons, shapes, effects |
| `figmento/src/color-utils.ts` | ~80 | hex↔rgb conversion, font weight mapping, contrast checking |
| `figmento/src/svg-utils.ts` | ~200 | SVG path parsing and scaling for icons |
| `figmento/src/types.ts` (partial) | ~100 | `UIElement`, `UIAnalysis`, `Fill`, `Stroke`, `ShadowEffect`, `TextProperties` |

### Reused with Modifications

| File | What Changes |
|------|-------------|
| `figmento/src/code.ts` | Strip AI/UI message handlers. Add WebSocket command dispatcher. Keep `createDesignFromAnalysis()`, template functions, and helper functions. |
| `figmento/src/types.ts` | Keep design types. Add WebSocket command/response types. Remove AI provider types (`APIConfig`, `PROVIDERS`). Remove UI-specific message types. |
| `figmento/manifest.json` | Add WebSocket server domain to `networkAccess.allowedDomains`. Remove AI API domains. |
| `figmento/build.js` | Reuse build pipeline, just different entry points. |

### New Code

| Component | What's New |
|-----------|-----------|
| **MCP Server** | Entire server: MCP protocol handling, tool definitions, WS client, design intelligence knowledge base |
| **WS Relay** | Entire relay: WebSocket server, channel management, message routing |
| **Plugin UI** | Rewritten `ui.html` — minimal connection status UI with WebSocket client |

---

## Existing Design Knowledge to Port

The current codebase already contains substantial design knowledge in `types.ts`:

| Constant | Location | Content |
|----------|----------|---------|
| `SOCIAL_FORMATS` | `types.ts:285-293` | 7 social media sizes (IG post/square/story, Twitter, LinkedIn, Facebook, Carousel) |
| `HERO_FORMATS` | `types.ts:765-775` | 9 hero/banner sizes (web, tablet, mobile, social) |
| `PRESENTATION_FORMATS` | `types.ts:549-560` | 7 presentation/paper sizes (16:9, 4:3, A4, A5, A6, Letter, Tabloid) |
| `COLOR_THEMES` | `types.ts:325-380` | 6 color theme presets (Vibrant, Minimal, Dark, Ocean, Forest, Sunset) |
| `PRESENTATION_COLOR_THEMES` | `types.ts:607-662` | 6 presentation-optimized themes |
| `FONT_OPTIONS` | `types.ts:296-312` | 15 Google Font options |
| `DESIGN_STYLES` | `types.ts:569-575` | 5 design style presets (Auto, Minimal, Corporate, Bold, Creative) |

These should be migrated into the MCP server's `knowledge/` YAML files and expanded.

---

## Phased Implementation Plan

### Phase 1 — WebSocket Bridge + Minimal MCP (Foundation)

**Goal:** Get Claude Code talking to Figma via MCP. Prove the pipeline works end-to-end.

**Deliverables:**

1. **WebSocket Relay Server** (`figmento-ws-relay/`)
   - Simple `ws` server on configurable port (default 3055)
   - Channel join/leave protocol
   - Message routing: forward commands to correct channel subscribers
   - Health check endpoint

2. **Figma Plugin — WebSocket Listener** (`figmento-plugin/`)
   - Rewrite `ui.html` — minimal UI with:
     - WebSocket URL input (default `ws://localhost:3055`)
     - Channel ID display (auto-generated or manual)
     - Connection status indicator (green/red dot)
     - "Copy Channel ID" button
   - UI iframe connects to WS relay on load
   - Message bridge: WS → `figma.ui.postMessage()` → sandbox
   - Sandbox command router in `code.ts`:
     - `create_frame` → calls existing `createFrameNode()`
     - `create_text` → calls existing `setupTextNode()`
     - `create_rectangle` → calls existing `createElement()`
     - `set_fill` → calls existing `applyFills()`
     - `export_node` → calls `node.exportAsync()`
   - Returns responses via: sandbox → `postMessage()` → UI → WS

3. **MCP Server — Minimal** (`figmento-mcp-server/`)
   - stdio transport MCP server
   - WebSocket client connecting to relay
   - 5 initial tools:
     - `create_frame` (name, width, height, x, y, fills, auto-layout)
     - `create_text` (content, fontSize, fontFamily, fontWeight, color, parent)
     - `set_fill` (nodeId, fills array)
     - `export_node` (nodeId → base64 PNG)
     - `get_selection` (returns selection info)
   - `connect_to_figma` tool or resource for channel management

**Validation:** Claude Code can create a colored frame with text inside it on the Figma canvas.

---

### Phase 2 — Full Tool Suite (Feature Complete)

**Goal:** Expose all design primitives. Enable complex multi-element designs.

**Deliverables:**

1. **Complete MCP tool set** — all tools from the inventory above:
   - Remaining canvas tools: `create_rectangle`, `create_ellipse`, `create_image`, `create_icon`
   - All style tools: `set_stroke`, `set_effects`, `set_corner_radius`, `set_opacity`
   - All layout tools: `set_auto_layout`, `set_layout_sizing`
   - All scene tools: `delete_node`, `move_node`, `resize_node`, `rename_node`, `append_child`, `get_page_nodes`, `get_node_info`
   - Batch tool: `create_design` (pass full UIAnalysis JSON)
   - Template tools: `scan_template`, `apply_template_text`, `apply_template_image`

2. **Image pipeline integration:**
   - `place_generated_image` tool: reads image from `mcp-image` output directory, converts to base64, sends to plugin
   - Workflow: Claude uses `mcp-image` to generate → uses `place_generated_image` to put in Figma

3. **Multi-slide support:**
   - `create_carousel` (array of slides)
   - `create_presentation` (array of slides + format)
   - `add_slide` (after existing slide)

4. **Plugin hardening:**
   - Reconnection logic (auto-reconnect on WS drop)
   - Command queuing (buffer commands during reconnect)
   - Error propagation (Figma errors → MCP error responses)
   - Timeout handling (commands that take too long)

**Validation:** Claude Code can create a full Instagram carousel with images, styled text, and auto-layout — all through natural language.

---

### Phase 3 — Design Intelligence (Smart Agent)

**Goal:** Make Claude a knowledgeable design agent, not just a command executor.

**Deliverables:**

1. **Knowledge base YAML files:**
   - `size-presets.yaml` — All social media sizes (IG, FB, X, LinkedIn, TikTok, Pinterest, YouTube, Snapchat) + all print sizes (A-series, Letter, Legal, Tabloid, business card, flyer, poster, banner)
   - `typography.yaml` — Type scale ratios (minor third, major third, perfect fourth, golden ratio), font pairings by mood (modern, classic, playful, corporate, luxury), line height rules, letter spacing guidelines
   - `color-system.yaml` — Mood-to-palette mappings, complementary/analogous/triadic generation, WCAG contrast matrix, color psychology reference
   - `layout.yaml` — 8px grid system, spacing scale (4/8/12/16/24/32/48/64), margin recommendations by format, column grids, visual hierarchy rules
   - `brand-kit-schema.yaml` — YAML schema for brand kits (primary/secondary/accent colors, heading/body fonts, logo paths, tone of voice, do's and don'ts)

2. **Intelligence MCP tools:**
   - `get_size_preset` — query by platform name or category
   - `get_font_pairing` — input mood/style, get heading + body font pair
   - `get_type_scale` — input base size + ratio, get full scale
   - `get_color_palette` — input mood keywords or base color, get full palette
   - `get_contrast_check` — input two hex colors, get WCAG ratio + pass/fail
   - `get_spacing_scale` — get the 8px grid spacing values
   - `get_brand_kit` / `save_brand_kit` — CRUD for brand kits (stored as YAML files)
   - `get_layout_guide` — input format dimensions, get margin/column recommendations

3. **CLAUDE.md design system prompt:**
   - Comprehensive design rules embedded in the project's CLAUDE.md
   - Teaches Claude how to use the tools together effectively
   - Design workflow patterns (start with frame → add background → add content hierarchy → style)
   - Common design patterns (hero section, card grid, feature list, CTA block, navbar)
   - Self-evaluation loop: create → export → analyze screenshot → iterate

4. **Self-evaluation pipeline:**
   - After creating a design, automatically `export_node` to get a screenshot
   - Claude analyzes the screenshot for visual issues
   - Iterates: adjusts spacing, alignment, colors as needed
   - Up to 2-3 refinement passes

**Validation:** User says "make me an Instagram post about coffee with a warm aesthetic" and gets a polished, brand-consistent design with generated imagery — automatically refined.

---

## Key Design Decisions

### Why WebSocket (not HTTP)?

- Figma plugins run in an iframe sandbox — they can make outbound connections but can't host a server
- WebSocket gives us bidirectional real-time communication
- The relay pattern (plugin ↔ relay ↔ MCP server) is proven by Figsor/Cursor-Talk-To-Figma plugins

### Why a separate relay server?

- MCP servers communicate via stdio with Claude Code — they can't host a WebSocket server on a port
- The relay is a lightweight bridge: runs locally, routes messages by channel
- Enables multiple Figma files to connect simultaneously

### Why keep `create_design` (batch) alongside granular tools?

- Granular tools (`create_frame`, `create_text`, etc.) give Claude fine control for iterative work
- Batch `create_design` (accepting full `UIAnalysis` JSON) enables creating complex layouts in a single call
- Both are useful: granular for refinement, batch for initial creation

### Why YAML for knowledge base?

- Human-readable and editable
- Easy for Claude to parse and reference
- Users can customize (add their own size presets, brand kits)
- Git-friendly for version control

---

## Reference: Existing Code Deep Dive

### element-creators.ts — The Heart of Figma Node Creation

**Entry point:** `createElement(element: UIElement, skipChildren?: boolean): Promise<SceneNode | null>`

**Node type routing:**

| UIElement.type | Figma Node Created | Factory Function |
|----------------|-------------------|-----------------|
| `frame`, `button`, `input`, `card` | `FrameNode` | `createFrameNode()` |
| `rectangle` | `RectangleNode` | `figma.createRectangle()` |
| `image` (with `generatedImage`) | `RectangleNode` with IMAGE fill | `createImageFromBase64()` |
| `image` (no data) | `FrameNode` placeholder | `createImagePlaceholder()` |
| `icon` | `FrameNode` with vector children | `createIconPlaceholder()` |
| `text` | `TextNode` | `setupTextNode()` |
| `ellipse` | `EllipseNode` | `figma.createEllipse()` |

**Property pipeline (applied to every node):**
1. `applyCommonProperties()` — name, position, size, corner radius, opacity
2. `applyFills()` — SOLID (with opacity), GRADIENT_LINEAR (with stops), IMAGE
3. `applyStroke()` — solid stroke with color and width
4. `applyEffects()` — DROP_SHADOW, INNER_SHADOW (color, offset, blur, spread)
5. `applyLayoutProperties()` — FILL/HUG/FIXED sizing, ABSOLUTE positioning

**Text handling (`setupTextNode()`):**
- Font loading with timeout (5s) and fallback chain: specified → Inter → Roboto
- Segment support: per-range fontWeight, fontSize, color via `setRangeFontName()`, `setRangeFills()`
- Auto-resize: `textAutoResize = 'HEIGHT'`
- Alignment, lineHeight, letterSpacing

**Image handling (`createImageFromBase64()`):**
- Strips `data:image/...;base64,` prefix
- `figma.base64Decode()` → `figma.createImage()` → IMAGE fill with `scaleMode: 'FILL'`
- Falls back to placeholder frame with icon on error

### code.ts — The Orchestrator

**Key functions to reuse:**
- `createDesignFromAnalysis(analysis: UIAnalysis, frameName?)` — creates main frame, positions at viewport center, recursively creates all child elements with progress tracking
- `scanTemplateFrames()` — scans selected frames for `#`-prefixed placeholder layers
- `applyTemplateText()` — fills text placeholders preserving existing font styles
- `applyTemplateImage()` — sets image fill on frame/rectangle nodes
- `handleGetSelectedImage()` — exports selection as PNG base64

### types.ts — The Schema

**Core types for MCP (keep these):**
- `UIElement` — the universal element definition (9 types, auto-layout, fills, strokes, effects, text, images)
- `UIAnalysis` — complete design structure (width, height, backgroundColor, elements[])
- `Fill`, `Stroke`, `ShadowEffect`, `GradientStop` — visual property types
- `TextProperties`, `TextSegment` — text styling types
- `SOCIAL_FORMATS`, `HERO_FORMATS`, `PRESENTATION_FORMATS` — size presets to migrate to knowledge base

**Types to remove (UI-specific):**
- `APIConfig`, `PROVIDERS` — AI provider configs (no longer needed in plugin)
- All UI message types (`ValidateApiKeyMessage`, `SaveApiKeyMessage`, etc.)
- `PluginMode`, `TextLayoutInput`, `HeroGeneratorInput` — UI workflow types

---

## External Dependencies

### mcp-image Server (Already Configured)

```json
{
  "mcp-image": {
    "command": "npx",
    "args": ["-y", "mcp-image"],
    "env": {
      "GEMINI_API_KEY": "...",
      "IMAGE_OUTPUT_DIR": "C:\\...\\generated-images"
    }
  }
}
```

**Integration flow:**
1. Claude calls `mcp-image` tool to generate an image (saves to `IMAGE_OUTPUT_DIR`)
2. Claude calls Figmento MCP `place_generated_image` tool with the file path
3. Figmento MCP reads the file, converts to base64, sends to plugin via WS
4. Plugin creates image fill on canvas

### Figsor (Reference Only)

Currently configured in `.cursor/mcp.json`. Our Figmento MCP replaces this — Figsor is a generic Figma MCP; ours is design-optimized with intelligence tools and our existing element creation pipeline.

---

## Success Criteria

| Milestone | Test |
|-----------|------|
| Phase 1 complete | Claude Code creates a blue rectangle with "Hello World" text on Figma canvas |
| Phase 2 complete | Claude Code creates a 3-slide Instagram carousel with auto-layout, icons, and placed images |
| Phase 3 complete | User says "make me a coffee shop Instagram post" → gets a polished design with AI image, proper typography, brand colors, and 1 refinement pass |

---

*Figmento MCP Project Briefing v1.0 — February 2026*
