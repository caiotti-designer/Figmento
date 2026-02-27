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
                     |  Canvas Tools:               |
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
                     |  Design System Tools:        |
                     |   create/get/list/update/    |
                     |   delete_design_system       |
                     |   create_component           |
                     |   get_format_rules           |
                     |   scan_frame_structure       |
                     |   brand_consistency_check    |
                     |                              |
                     |  Pattern & Template Tools:   |
                     |   create_from_pattern        |
                     |   create_from_template       |
                     |   scan/apply templates       |
                     |   create_carousel            |
                     |   create_presentation        |
                     |                              |
                     |  Icon Tools:                 |
                     |   create_icon, list_icons    |
                     |                              |
                     |  Ad Analyzer Tools:          |
                     |   start_ad_analyzer          |
                     |   complete_ad_analyzer       |
                     |                              |
                     |  Export Tools:                |
                     |   get_screenshot, export     |
                     |   evaluate_design            |
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
                     |  - MCP <-> Plugin bridging   |
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
                     |  - Chat UI (Anthropic/Gemini)|
                     |  - Ad Analyzer mode          |
                     +==============================+
                                    |
                              [Figma Plugin API]
                                    |
                            Figma Canvas / Document


    External:
    +====================+
    |  mcp-image server  |  (Gemini 3 Pro Image generation)
    |  Already configured|  -> generates images to disk
    +====================+  -> Figmento MCP reads & places into Figma
```

---

## Component Breakdown

### Component 1 — Figmento Figma Plugin

A WebSocket command executor with built-in LLM chat UI and Ad Analyzer mode. All design intelligence lives in the MCP server — the plugin executes Figma API operations, routes direct LLM conversations, and provides a guided workflow for ad analysis and redesign.

```
figmento/                          # Unified plugin (figmento-plugin/ is deprecated)
├── src/
│   ├── code.ts                 # Sandbox — command router, 40+ action handlers
│   ├── element-creators.ts     # createElement() factory, all node creation
│   ├── color-utils.ts          # hexToRgb, rgbToHex, getFontStyle
│   ├── svg-utils.ts            # scalePathData, parsePath for icons
│   ├── gradient-utils.ts       # Gradient transform calculations
│   ├── types.ts                # UIElement, WSCommand/WSResponse, plugin messages
│   ├── ui.html                 # Plugin iframe — modes, chat, bridge, ad analyzer
│   └── ui/
│       ├── index.ts            # UI entry point, module init orchestration
│       ├── bridge.ts           # WebSocket Bridge — channel management, command routing
│       ├── ad-analyzer.ts      # Ad Analyzer mode — upload, brief, status, report UI
│       ├── chat.ts             # Chat UI (Anthropic/Gemini direct LLM conversations)
│       ├── chat-settings.ts    # Chat model & provider settings
│       ├── system-prompt.ts    # LLM chat system prompt (built from knowledge YAMLs)
│       ├── tools-schema.ts     # JSON Schema definitions mirroring MCP tools
│       ├── screenshot.ts       # Screenshot-to-layout mode
│       ├── text-layout.ts      # Text-to-design mode
│       ├── presentation.ts     # Presentation mode
│       ├── images.ts           # Image generation (Gemini/GPT)
│       ├── template.ts         # Template fill mode
│       ├── messages.ts         # Figma sandbox message handlers
│       ├── settings.ts         # API key & provider settings
│       └── state.ts            # Centralized application state
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
| Export | `export_node`, `get_screenshot` |
| Workflow | `ad-analyzer-complete` (forwards report to UI), `zoom-to-node` (viewport navigation) |

### Component 2 — Figmento MCP Server

```
figmento-mcp-server/
├── src/
│   ├── index.ts                # Entry point (stdio transport)
│   ├── server.ts               # MCP server setup, 13 tool module registrations
│   ├── tools/
│   │   ├── canvas.ts           # create_frame, create_text, create_rectangle, create_ellipse,
│   │   │                       #   create_image, create_icon, place_generated_image,
│   │   │                       #   fetch_placeholder_image, set_text
│   │   ├── style.ts            # set_fill, set_stroke, set_effects, set_corner_radius,
│   │   │                       #   set_opacity, set_auto_layout
│   │   ├── scene.ts            # get_selection, get_node_info, get_page_nodes, delete_node,
│   │   │                       #   move_node, resize_node, rename_node, append_child,
│   │   │                       #   reorder_child, clone_node, group_nodes
│   │   ├── batch.ts            # batch_execute, clone_with_overrides, create_design
│   │   ├── export.ts           # get_screenshot, export_node, evaluate_design, export_node_to_file
│   │   ├── template.ts         # scan_template, apply_template_text, apply_template_image,
│   │   │                       #   create_carousel, create_presentation
│   │   ├── connection.ts       # connect_to_figma, disconnect_from_figma
│   │   ├── intelligence.ts     # get_size_preset, get_font_pairing, get_type_scale,
│   │   │                       #   get_color_palette, get_contrast_check, get_spacing_scale,
│   │   │                       #   get_layout_guide, get_brand_kit, save_brand_kit
│   │   ├── design-system.ts    # create/get/list/update/delete_design_system, create_component,
│   │   │                       #   list_components, get_format_rules, list_formats,
│   │   │                       #   scan_frame_structure, design_system_preview,
│   │   │                       #   generate_design_system_from_url, brand_consistency_check
│   │   ├── patterns.ts         # create_from_pattern, list_patterns
│   │   ├── ds-templates.ts     # create_from_template, list_templates
│   │   ├── icons.ts            # create_icon (Lucide 1900+), list_icons
│   │   └── ad-analyzer.ts      # start_ad_analyzer, complete_ad_analyzer
│   ├── ws-client.ts            # WebSocket client (auto-reconnect, command queue, heartbeat)
│   └── types.ts                # WSCommand, WSResponse, CommandErrorCode, FillDef, EffectDef
├── knowledge/                  # Design intelligence knowledge base (see section below)
├── package.json
└── tsconfig.json
```

### Component 3 — WebSocket Relay Server

```
figmento-ws-relay/
├── src/
│   ├── index.ts                # Server entry point (HTTP health + WS upgrade)
│   ├── relay.ts                # WebSocket server, channel routing, heartbeat
│   └── types.ts                # Message protocol types
├── .env.example                # Environment variable template
├── Procfile                    # Railway deployment process definition
├── railway.json                # Railway deployment configuration
├── README.md                   # Setup and deployment guide
├── package.json
└── tsconfig.json
```

**Protocol:**
```json
// Client joins a channel
{ "type": "join", "channel": "figmento-abc123" }

// MCP -> Plugin command
{ "type": "command", "id": "cmd-001", "channel": "figmento-abc123",
  "action": "create_frame", "params": { "name": "Hero", "width": 1080, "height": 1350 } }

// Plugin -> MCP response
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
| `fetch_placeholder_image` | Fetch placeholder photo from picsum.photos as base64 fallback when AI generation is unavailable |
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
| `clone_with_overrides` | Clone a node N times in one call with positional offsets and named child property overrides (text, color, fontSize, fontWeight, opacity). Replaces clone -> find -> set_text x N pattern. |
| `create_design` | Create a complete design from a UIAnalysis JSON structure in one operation. |

### Export / Evaluation Tools (`tools/export.ts`)

| MCP Tool | Description |
|----------|-------------|
| `get_screenshot` | Capture PNG screenshot of a Figma node and render inline for visual verification |
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

### Design System Tools (`tools/design-system.ts`)

The design system module provides token-driven design with auto-generation, component instantiation, format-aware rules, and brand consistency checking.

| MCP Tool | Description |
|----------|-------------|
| `create_design_system` | Create a design system with auto-generated tokens from minimal input (preset, colors, fonts, or mood keywords). Missing values are auto-generated using color theory. |
| `get_design_system` | Load an existing design system by name. Returns complete token object (colors, fonts, spacing, radius, shadows). |
| `list_design_systems` | List all saved design systems with summary info (name, preset, primary color). |
| `update_design_system` | Update specific tokens using dot-path keys (e.g. `{ "colors.primary": "#FF0000" }`). |
| `delete_design_system` | Delete a design system and all its files. |
| `create_component` | Instantiate a design system component on Figma canvas. Loads tokens, resolves recipe, sends batch commands. Components: button, badge, card, divider, avatar. |
| `list_components` | List all available components with their variants, props, and descriptions. |
| `get_format_rules` | Get complete format adapter rules for a specific output format (dimensions, safe zones, typography scale, layout rules). |
| `list_formats` | List all available format adapters (social, print, presentation, web, email, advertising) with size variants and dimensions. |
| `scan_frame_structure` | Deep-scan a Figma frame and return its complete structure tree (types, positions, sizes, styles, text content, children). |
| `design_system_preview` | Generate a visual swatch sheet on canvas showing all color tokens, typography scale, component samples, and spacing. |
| `generate_design_system_from_url` | Extract a design system from a website URL by analyzing HTML/CSS for colors, fonts, and border radius. |
| `brand_consistency_check` | Check if Figma frames are brand-consistent against a design system. Returns score (0-100), issues list, and pass/fail. |

### Pattern Tools (`tools/patterns.ts`)

Cross-format design patterns that adapt to any format and design system.

| MCP Tool | Description |
|----------|-------------|
| `create_from_pattern` | Instantiate a cross-format pattern on canvas with design system tokens and format-specific adaptations. Patterns: hero_block, feature_grid, pricing_card, testimonial, contact_block, content_section, image_text_row, gallery, data_row, cta_banner. Supports size_variant selection. |
| `list_patterns` | List all available patterns with names, descriptions, props, and variants. |

### Project Template Tools (`tools/ds-templates.ts`)

Multi-frame project templates that compose patterns into complete deliverables.

| MCP Tool | Description |
|----------|-------------|
| `create_from_template` | Instantiate a multi-frame project template on canvas. Templates: social_media_kit (9 frames), pitch_deck (8 slides), brand_stationery (4 frames), landing_page_full (6 sections), restaurant_menu (5 frames). |
| `list_templates` | List all available templates with names, descriptions, frame counts, and formats used. |

### Icon Tools (`tools/icons.ts`)

Lucide icon library integration (1900+ icons).

| MCP Tool | Description |
|----------|-------------|
| `create_icon` | Place a Lucide icon on canvas by name. Auto-loads SVG path data from bundled icon set. Supports color, size, and parent placement. |
| `list_icons` | Search or browse available Lucide icons by name or category (arrows, media, communication, data, ui, nature, commerce, social, dev, shapes). |

### Ad Analyzer Tools (`tools/ad-analyzer.ts`)

Guided workflow for analyzing ads and building redesigned variants.

| MCP Tool | Description |
|----------|-------------|
| `start_ad_analyzer` | Initialize the Ad Analyzer workflow. Receives brief + base64 image from plugin, saves image to disk, returns brief, critical rules, and MISSION.md instructions for Phases 2-5. |
| `complete_ad_analyzer` | Signal workflow completion. Sends design report markdown and carousel node IDs to the plugin via Bridge, which displays the report in the UI. |

---

## Knowledge Base

The `knowledge/` directory provides design intelligence as YAML files, organized hierarchically:

```
figmento-mcp-server/knowledge/
├── size-presets.yaml               # Dimensions for all social/print/presentation/web formats
├── typography.yaml                 # Type scales, font pairings, line heights, letter spacing
├── color-system.yaml               # Mood-based palettes, WCAG contrast, safe combos
├── layout.yaml                     # 8px grid, spacing scale, margins, safe zones
├── brand-kit-schema.yaml           # Brand kit YAML format + example
├── print-design.yaml               # Print-specific layout patterns & typography rules
│
├── design-systems/                 # Pre-built design system token sets
│   ├── payflow/tokens.yaml
│   ├── stripe/tokens.yaml
│   ├── noir-cafe/tokens.yaml
│   ├── linear/tokens.yaml
│   ├── flowdesk/tokens.yaml
│   └── testbrand/tokens.yaml
│
├── presets/                        # Design system presets (starting points)
│   ├── shadcn.yaml
│   ├── material.yaml
│   ├── minimal.yaml
│   ├── luxury.yaml
│   └── vibrant.yaml
│
├── components/                     # Component recipes
│   ├── core.yaml                   # button, badge, card, divider, avatar
│   └── web-ui.yaml                 # Web UI component definitions
│
├── formats/                        # Format-specific rules & dimensions
│   ├── social/                     # 14 formats (instagram_post, tiktok, youtube, etc.)
│   ├── print/                      # 14 formats (brochure, business_card, poster, etc.)
│   ├── web/                        # 10 formats (landing_page, dashboard, error_404, etc.)
│   ├── advertising/                # 6 formats (facebook_ad, google_leaderboard, etc.)
│   ├── email/                      # 3 formats (email_banner, header, newsletter)
│   └── presentation/               # 2 formats (slide_16_9, slide_4_3)
│
├── patterns/
│   └── cross-format.yaml           # 10 pattern recipes (hero_block, feature_grid, etc.)
│
├── templates/                      # Multi-frame project templates
│   ├── social_media_kit.yaml       # 9 frames
│   ├── pitch_deck.yaml             # 8 slides
│   ├── brand_stationery.yaml       # 4 frames
│   ├── landing_page_full.yaml      # 6 sections
│   └── restaurant_menu.yaml        # 5 frames
│
└── brand-kits/                     # User-saved brand kits (initially empty)
```

**Totals:** 70+ YAML files, 6 pre-built design systems, 5 presets, 49 format adapters, 10 cross-format patterns, 5 project templates.

---

## Key Design Decisions

### Why WebSocket (not HTTP)?

- Figma plugins run in an iframe sandbox — they can make outbound connections but can't host a server
- WebSocket gives us bidirectional real-time communication
- The relay pattern (plugin <-> relay <-> MCP server) is proven by Figsor/Cursor-Talk-To-Figma plugins

### Why a separate relay server?

- MCP servers communicate via stdio with Claude Code — they can't host a WebSocket server on a port
- The relay is a lightweight bridge: runs locally, routes messages by channel
- Enables multiple Figma files to connect simultaneously

### Why both granular tools and batch tools?

- **Granular tools** (`create_frame`, `create_text`, etc.) give fine control for iterative refinement
- **`batch_execute`** cuts round trips from N to 1 — a 25-element design goes from 25 sequential calls (~5s) to 1 batch call (~200ms). `tempId` chaining enables parent->child references within the batch.
- **`clone_with_overrides`** replaces the N-step clone->find->setText pattern for repeated elements
- **`create_design`** (UIAnalysis JSON) creates an entire nested design tree in one call — best for initial full-design creation

### Why YAML for knowledge base?

- Human-readable and editable
- Easy for Claude to parse and reference
- Users can customize (add their own size presets, brand kits, design systems)
- Git-friendly for version control

### Why a Design System layer?

- **Token-driven design** ensures brand consistency across all outputs
- **Auto-generation** from minimal input (just a primary color + mood) makes setup fast
- **Format adapters** enforce correct dimensions, safe zones, and typography scales per platform
- **Cross-format patterns** let the same "hero_block" recipe produce an Instagram post, landing page, or email header with format-appropriate sizing
- **Component recipes** resolve to batch commands — a single `create_component("button")` becomes a frame + padding + text + fill + radius in one round trip

---

## Implementation Status

All 5 phases are **implemented and operational**.

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
- `get_screenshot` for inline visual verification during design iteration
- `fetch_placeholder_image` fallback when AI image generation is unavailable

### Phase 3 — Design Intelligence (Complete)

- Knowledge base: 5 core YAML files covering sizes, typography, colors, layout, brand kits
- 9 intelligence tools (server-side, no WS needed)
- Comprehensive CLAUDE.md design system prompt with workflow patterns, typography rules, color guides, layout composition rules, self-evaluation checklist
- `evaluate_design` tool for automated design QA (export + structural analysis + stats)

### Phase 4 — Design System Engine (Complete)

- **Token engine:** Auto-generates complete design system tokens from minimal input (preset, primary color, mood)
- **6 pre-built design systems:** payflow, stripe, noir-cafe, linear, flowdesk, testbrand
- **5 presets:** shadcn, material, minimal, luxury, vibrant
- **Component recipes:** button, badge, card, divider, avatar — resolved to batch commands with design system tokens
- **49 format adapters** across 6 categories (social, print, web, email, advertising, presentation) with dimensions, safe zones, typography scales
- **10 cross-format patterns:** hero_block, feature_grid, pricing_card, testimonial, contact_block, content_section, image_text_row, gallery, data_row, cta_banner
- **5 project templates:** social_media_kit, pitch_deck, brand_stationery, landing_page_full, restaurant_menu
- **Brand consistency checker:** Compares frame colors/fonts against design system, returns 0-100 score
- **URL-based extraction:** Generate design system tokens by analyzing any website's HTML/CSS
- **Visual preview:** `design_system_preview` generates swatch sheet on canvas

### Phase 5 — Ad Analyzer, Bridge, Chat & Shared Core (Complete)

- **Ad Analyzer mode:** Plugin UI for uploading ads, filling briefs, copying prompts to Claude Code, watching Bridge activity, and displaying completion reports with "View in Figma" navigation
- **MCP tools:** `start_ad_analyzer` (saves image to disk, returns brief + rules + MISSION.md instructions), `complete_ad_analyzer` (sends report to plugin via Bridge)
- **Bridge module:** Extracted to standalone `bridge.ts` with channel management, command routing, copy-to-clipboard, and exported getters (`getBridgeChannelId`, `getBridgeConnected`)
- **Chat UI:** Full LLM chat with Anthropic/Gemini support, chat settings, system prompt, and tools schema modules
- **Icon tools:** `create_icon` (Lucide 1900+ icons with auto SVG loading), `list_icons` (search by name/category)
- **Shared core package:** `packages/figmento-core/` with extracted color-utils, element-creators, gradient-utils, svg-utils, types
- **WS relay deployment:** Railway config (Procfile, railway.json), .env.example, improved channel-based relay with heartbeat
- **Plugin consolidation:** Unified `figmento/` plugin, `figmento-plugin/` deprecated
- **Tests:** 12 suites, 291 tests passing

---

## Build Commands

```bash
# Figma Plugin (unified)
cd figmento && npm run build

# MCP Server
cd figmento-mcp-server && npm run build

# WebSocket Relay
cd figmento-ws-relay && npm run build
```

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/render-html.js` | Render HTML to PNG using headless Chromium (Puppeteer). Viewport: 2480x3508 (A4 at 300dpi). Used in HTML-to-Figma pipeline for print designs. |
| `scripts/run-mcp-image.js` | Spawns mcp-image subprocess with env validation. Loads .env, checks GEMINI_API_KEY/OPENAI_API_KEY. |

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

*Figmento MCP Project Briefing v4.0 — February 2026*
