# Figmento MCP — Project Briefing

> MCP-powered design agent for Figma — Claude Code creates, styles, and iterates on designs directly on the Figma canvas.

---

## Architecture Overview

```
                         Claude Code (or any MCP client)
                                    |
                              [stdio / MCP protocol]
                                    |
                     +==============================+
                     |   Figmento MCP Server        |
                     |   (Node.js / TypeScript)     |
                     |                              |
                     |  Design Tools:               |
                     |   create_frame, create_text  |
                     |   create_rectangle, ellipse  |
                     |   create_image, create_icon  |
                     |   set_fill, set_stroke, ...  |
                     |                              |
                     |  Batch Tools:                |
                     |   batch_execute (multi-cmd)  |
                     |   clone_with_overrides       |
                     |   create_design (UIAnalysis) |
                     |                              |
                     |  Scene Tools:                |
                     |   get/delete/move/resize     |
                     |   clone_node, group_nodes    |
                     |   reorder_child, append      |
                     |                              |
                     |  Template Tools:             |
                     |   scan_template              |
                     |   apply_template_text/image  |
                     |   create_carousel            |
                     |   create_presentation        |
                     |                              |
                     |  Export Tools:                |
                     |   export_node, evaluate      |
                     |   export_node_to_file        |
                     |                              |
                     |  Intelligence Tools:         |
                     |   get_size_preset            |
                     |   get_font_pairing           |
                     |   get_color_palette          |
                     |   get_brand_kit ...          |
                     +==============================+
                                    |
                           [WebSocket messages]
                           (JSON commands/responses)
                                    |
                     +==============================+
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
                     |   Figmento Figma Plugin      |
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

### Component 1 — Figmento Figma Plugin

A thin WebSocket command executor. All design intelligence lives in the MCP server — the plugin only executes Figma API operations.

```
figmento-plugin/
├── src/
│   ├── code.ts                 # Command router — 30+ action handlers
│   ├── element-creators.ts     # createElement() factory, all node creation
│   ├── color-utils.ts          # hexToRgb, rgbToHex, getFontStyle
│   ├── svg-utils.ts            # scalePathData, parsePath for icons
│   ├── gradient-utils.ts       # Gradient transform calculations
│   ├── types.ts                # UIElement, WSCommand/WSResponse, plugin messages
│   └── ui.html                 # Minimal connection UI with WS client
├── manifest.json               # Plugin manifest with WS domain allowlist
├── build.js                    # esbuild pipeline
├── package.json
└── tsconfig.json
```

**Plugin command handlers (code.ts):**

| Category | Actions |
|----------|---------|
| Canvas creation | `create_frame`, `create_text`, `create_rectangle`, `create_ellipse`, `create_image`, `create_icon` |
| Styling | `set_fill`, `set_stroke`, `set_effects`, `set_corner_radius`, `set_opacity`, `set_auto_layout` |
| Scene management | `get_selection`, `get_node_info`, `get_page_nodes`, `delete_node`, `move_node`, `resize_node`, `rename_node`, `append_child`, `reorder_child`, `clone_node`, `group_nodes` |
| Batch | `batch_execute` (multi-command with tempId chaining), `clone_with_overrides`, `create_design` (UIAnalysis) |
| Templates | `scan_template`, `apply_template_text`, `apply_template_image` |
| Export | `export_node` |

### Component 2 — Figmento MCP Server

```
figmento-mcp-server/
├── src/
│   ├── index.ts                # Entry point (stdio transport)
│   ├── server.ts               # MCP server setup, tool module registration
│   ├── tools/
│   │   ├── canvas.ts           # create_frame, create_text, create_rectangle, create_ellipse,
│   │   │                       #   create_image, create_icon, place_generated_image, set_text
│   │   ├── style.ts            # set_fill, set_stroke, set_effects, set_corner_radius,
│   │   │                       #   set_opacity, set_auto_layout
│   │   ├── scene.ts            # get_selection, get_node_info, get_page_nodes, delete_node,
│   │   │                       #   move_node, resize_node, rename_node, append_child,
│   │   │                       #   reorder_child, clone_node, group_nodes
│   │   ├── batch.ts            # batch_execute, clone_with_overrides, create_design
│   │   ├── export.ts           # export_node, evaluate_design, export_node_to_file
│   │   ├── template.ts         # scan_template, apply_template_text, apply_template_image,
│   │   │                       #   create_carousel, create_presentation
│   │   ├── connection.ts       # connect_to_figma, disconnect_from_figma
│   │   └── intelligence.ts     # get_size_preset, get_font_pairing, get_type_scale,
│   │                           #   get_color_palette, get_contrast_check, get_spacing_scale,
│   │                           #   get_layout_guide, get_brand_kit, save_brand_kit
│   ├── ws-client.ts            # WebSocket client (auto-reconnect, command queue, heartbeat)
│   └── types.ts                # WSCommand, WSResponse, CommandErrorCode, FillDef, EffectDef
├── knowledge/
│   ├── size-presets.yaml       # Social media + print + presentation sizes
│   ├── typography.yaml         # Type scales, font pairings, line heights
│   ├── color-system.yaml       # Mood palettes, WCAG contrast, safe combos
│   ├── layout.yaml             # 8px grid, spacing scale, margins, safe zones
│   └── brand-kit-schema.yaml   # Brand kit YAML format + example
├── package.json
└── tsconfig.json
```

### Component 3 — WebSocket Relay Server

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

## Complete MCP Tools Inventory

### Canvas Creation Tools (`tools/canvas.ts`)

| MCP Tool | Description |
|----------|-------------|
| `create_frame` | Create frame with optional auto-layout, padding, fills, cornerRadius |
| `create_text` | Create text node with font, size, weight, color, segments, layout sizing |
| `create_rectangle` | Create rectangle with fills, stroke, corner radius |
| `create_ellipse` | Create ellipse/circle with fills |
| `create_image` | Place image from base64 data |
| `create_icon` | Place Lucide icon by name with optional SVG paths |
| `place_generated_image` | Read image file from disk (mcp-image output), send to Figma as image fill |
| `set_text` | Update existing text node content and style properties |

### Style Tools (`tools/style.ts`)

| MCP Tool | Description |
|----------|-------------|
| `set_fill` | Set SOLID or GRADIENT_LINEAR fill on a node |
| `set_stroke` | Set stroke color and width |
| `set_effects` | Add DROP_SHADOW / INNER_SHADOW effects |
| `set_corner_radius` | Set uniform or per-corner radius |
| `set_opacity` | Set node opacity (0-1) |
| `set_auto_layout` | Set layout mode, spacing, padding, alignment on a frame |

### Scene Management Tools (`tools/scene.ts`)

| MCP Tool | Description |
|----------|-------------|
| `get_selection` | Get current Figma selection info |
| `get_node_info` | Get detailed node properties by ID (recursive with depth param) |
| `get_page_nodes` | List all top-level nodes on current page |
| `delete_node` | Remove a node from the canvas |
| `move_node` | Reposition a node (x, y) |
| `resize_node` | Resize a node (width, height) |
| `rename_node` | Rename a node |
| `append_child` | Move a node into a parent frame |
| `reorder_child` | Reorder a child within its parent (by index) |
| `clone_node` | Clone a node with optional offset, rename, and reparenting |
| `group_nodes` | Group multiple nodes into a Figma group |

### Batch / Composite Tools (`tools/batch.ts`)

| MCP Tool | Description |
|----------|-------------|
| `batch_execute` | Execute up to 50 commands in a single WS round trip. Supports `tempId` chaining — reference nodes created earlier in the batch via `$tempId`. Failed commands don't abort the batch. |
| `clone_with_overrides` | Clone a node N times in one call with positional offsets and named child property overrides (text, color, fontSize, fontWeight, opacity). Replaces clone → find → set_text × N pattern. |
| `create_design` | Create a complete design from a UIAnalysis JSON structure in one operation. |

### Export / Evaluation Tools (`tools/export.ts`)

| MCP Tool | Description |
|----------|-------------|
| `export_node` | Export node as PNG/SVG/JPG base64 |
| `evaluate_design` | Export + deep node tree + computed stats (font sizes, typography levels, element count) |
| `export_node_to_file` | Export node to a file on disk |

### Template Tools (`tools/template.ts`)

| MCP Tool | Description |
|----------|-------------|
| `scan_template` | Scan frames for `#`-prefixed placeholder layers |
| `apply_template_text` | Fill text placeholders with content and optional style overrides |
| `apply_template_image` | Fill image placeholders with base64 image data |
| `create_carousel` | Create multi-slide carousel (sequential frame creation) |
| `create_presentation` | Create multi-slide presentation |

### Connection Tools (`tools/connection.ts`)

| MCP Tool | Description |
|----------|-------------|
| `connect_to_figma` | Connect to plugin via WS relay using channel ID |
| `disconnect_from_figma` | Disconnect from current channel |

### Design Intelligence Tools (`tools/intelligence.ts`)

Server-side only — no WS needed. Reads from `knowledge/` YAML files.

| MCP Tool | Description |
|----------|-------------|
| `get_size_preset` | Query social media / print / presentation size presets |
| `get_font_pairing` | Get font pairs by mood/style (modern, classic, luxury, etc.) |
| `get_type_scale` | Get font sizes for a given base size and scale ratio |
| `get_color_palette` | Get palette by mood keywords |
| `get_contrast_check` | Check WCAG contrast ratio between two colors |
| `get_spacing_scale` | Get 8px-grid spacing values |
| `get_layout_guide` | Get layout recommendations for a format (margins, safe zones, columns) |
| `get_brand_kit` | Load a saved brand kit |
| `save_brand_kit` | Save a brand kit for reuse |

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

### Why both granular tools and batch tools?

- **Granular tools** (`create_frame`, `create_text`, etc.) give fine control for iterative refinement
- **`batch_execute`** cuts round trips from N to 1 — a 25-element design goes from 25 sequential calls (~5s) to 1 batch call (~200ms). `tempId` chaining enables parent→child references within the batch.
- **`clone_with_overrides`** replaces the N-step clone→find→setText pattern for repeated elements
- **`create_design`** (UIAnalysis JSON) creates an entire nested design tree in one call — best for initial full-design creation

### Why YAML for knowledge base?

- Human-readable and editable
- Easy for Claude to parse and reference
- Users can customize (add their own size presets, brand kits)
- Git-friendly for version control

---

## Implementation Status

All 3 phases are **implemented and operational**.

### Phase 1 — WebSocket Bridge + Minimal MCP (Complete)

- WebSocket relay server with channel routing on port 3055
- Plugin rewritten as thin WS command executor
- MCP server with stdio transport and initial tool set
- Auto-reconnect with exponential backoff, command queuing, heartbeat ping/pong

### Phase 2 — Full Tool Suite (Complete)

- All 30+ canvas, style, scene, batch, template, and export tools
- Image pipeline: `place_generated_image` reads from mcp-image output, converts server-side
- Multi-slide: `create_carousel` and `create_presentation`
- Error contract: `CommandErrorCode` enum with `recoverable` hint on all failures

### Phase 3 — Design Intelligence (Complete)

- Knowledge base: 5 YAML files covering sizes, typography, colors, layout, brand kits
- 9 intelligence tools (server-side, no WS needed)
- Comprehensive CLAUDE.md design system prompt with workflow patterns, typography rules, color guides, layout composition rules, self-evaluation checklist
- `evaluate_design` tool for automated design QA (export + structural analysis + stats)

### Recent additions

- `batch_execute` — multi-command batching with tempId chaining (up to 50 commands per batch)
- `clone_with_overrides` — clone N times with child property overrides in one call
- `reorder_child` — reorder children within a parent frame
- `set_text` — update text node content/style on existing nodes
- `evaluate_design` — export + deep node tree + typography/layout stats

---

## Build Commands

```bash
# MCP Server
cd figmento-mcp-server && npm run build

# WebSocket Relay
cd figmento-ws-relay && npm run build

# Figma Plugin
cd figmento-plugin && npm run build
```

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

---

*Figmento MCP Project Briefing v2.0 — February 2026*
