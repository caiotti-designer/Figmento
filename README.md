# Figmento

**Figmento is an MCP server that gives Claude Code direct, programmatic control over Figma.** You describe what you want — a landing page, a pitch deck, a brand system, a social media kit — and Claude designs it end-to-end: tokens resolved, typography scaled, icons placed, images generated and composited, sections stacked with rhythm. No Figma plugin UI, no manual layout. The model drives the canvas.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Claude Code                          │
│                    (MCP client, stdio)                      │
└───────────────────────────┬─────────────────────────────────┘
                            │  stdio / MCP protocol
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  figmento-mcp-server                        │
│                                                             │
│  63 tools across:                                           │
│  canvas · scene · style · batch · icons                     │
│  design-system · patterns · templates                       │
│  intelligence · export · connection                         │
│                                                             │
│  Knowledge base (YAML):                                     │
│  size-presets · typography · color-system                   │
│  layout · design-systems · format adapters                  │
└───────────────────────────┬─────────────────────────────────┘
                            │  WebSocket  ws://localhost:3055
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   figmento-ws-relay                         │
│            (channel-based WS message broker)                │
└───────────────────────────┬─────────────────────────────────┘
                            │  WebSocket (channel ID handshake)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   figmento-plugin                           │
│          (Figma Desktop plugin — sandbox + UI iframe)       │
└───────────────────────────┬─────────────────────────────────┘
                            │  Figma Plugin API
                            ▼
                     Figma Canvas
```

---

## Quick Start

**Step 1 — Install dependencies**

```bash
cd figmento-mcp-server && npm install && npm run build
cd ../figmento-ws-relay  && npm install && npm run build
```

**Step 2 — Run the WebSocket relay**

```bash
cd figmento-ws-relay && npm start
# Listening on ws://localhost:3055
```

**Step 3 — Configure the MCP server in Claude Code**

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "figmento": {
      "command": "node",
      "args": ["./figmento-mcp-server/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_key_here"
      }
    }
  }
}
```

Then open Figma Desktop, install the Figmento plugin, copy the channel ID it shows, and in Claude Code:

```
connect_to_figma channel="figmento-xxxxxx"
```

You're live.

---

## What Claude Can Do

### Design Systems
| Tool | Description |
|------|-------------|
| `create_design_system` | Generate a complete token system from a name + mood/color/font. Missing values are derived via color theory. |
| `get_design_system` | Load an existing system by name. Returns all tokens. |
| `update_design_system` | Patch specific tokens with dot-path keys (`colors.primary`, `typography.heading.size`). |
| `design_system_preview` | Render a visual swatch sheet on canvas: colors, type scale, spacing, components. |
| `generate_design_system_from_url` | Extract a design system from a live URL via CSS and vision. Best-effort starting point. |
| `brand_consistency_check` | Score a frame 0–100 against a design system. Returns violations and a `consistent` flag. |
| `create_component` | Instantiate a system component on canvas (`button`, `badge`, `card`, `avatar`, `divider`). |

### Patterns
| Tool | Description |
|------|-------------|
| `create_from_pattern` | Build a complete UI block from a named pattern. Tokens resolved automatically. |
| `list_patterns` | Browse all 10 patterns: `hero_block`, `feature_grid`, `pricing_card`, `testimonial`, `cta_banner`, `image_text_row`, `data_row`, `content_section`, `contact_block`, `gallery`. |

### Templates
| Tool | Description |
|------|-------------|
| `create_from_template` | Build a full multi-frame project from a template in one call. |
| `list_templates` | List all templates with frame counts and estimated time. |

Available templates: `landing_page_full` (6 sections), `pitch_deck` (8 slides), `social_media_kit` (9 frames), `restaurant_menu` (5 frames), `brand_stationery` (4 frames).

### Format Adapters
| Tool | Description |
|------|-------------|
| `list_formats` | Browse all 48 format definitions with size variants and safe zones. |
| `get_format_rules` | Get full adapter rules for a format: dimensions, safe zones, type scale, layout rules. |
| `get_size_preset` | Look up exact pixel dimensions by platform or format ID. |

### Icons
| Tool | Description |
|------|-------------|
| `create_icon` | Place a Lucide icon by name. 1,900+ icons, SVG paths loaded automatically. |
| `list_icons` | Search by name or browse by category (`arrows`, `media`, `commerce`, `dev`, `social`, etc.). |

### Intelligence
| Tool | Description |
|------|-------------|
| `get_color_palette` | Get a palette by mood keyword or palette ID. Returns 6-color system with safe combos. |
| `get_font_pairing` | Get heading + body font recommendations by mood (editorial, luxury, tech, playful, etc.). |
| `get_type_scale` | Compute a full type scale from a base size and ratio (`minor_third`, `perfect_fourth`, `golden_ratio`). |
| `get_contrast_check` | WCAG AA/AAA contrast check between two hex colors. |
| `get_spacing_scale` | Returns the 8px grid scale with usage context for every step. |
| `get_layout_guide` | Margins, safe zones, and layout patterns for a specific format. |
| `get_brand_kit` / `save_brand_kit` | Persist and load full brand identities across sessions. |

### Canvas & Scene
`create_frame` · `create_text` · `create_rectangle` · `create_ellipse` · `set_fill` · `set_stroke` · `set_effects` · `set_auto_layout` · `set_corner_radius` · `set_opacity` · `move_node` · `resize_node` · `rename_node` · `clone_node` · `clone_with_overrides` · `reorder_child` · `group_nodes` · `delete_node` · `get_node_info` · `get_page_nodes` · `get_selection`

### Images & Export
`place_generated_image` · `fetch_placeholder_image` · `get_screenshot` · `export_node` · `export_node_to_file` · `evaluate_design`

### Batch
`batch_execute` — up to 50 commands in a single round trip with `tempId` references. Use for any design with 3+ elements.

---

## Format Support

| Category | Count | Includes |
|----------|-------|---------|
| **Social** | 14 | Instagram (post/story/reel/carousel), Facebook, Twitter/X, LinkedIn, Pinterest, TikTok, YouTube, Snapchat |
| **Print** | 13 | A2–A4 posters, flyers (A4/Letter), business card, letterhead, brochure (bifold/trifold), menu, invoice, name badge, envelope DL, packaging label |
| **Web** | 10 | Landing page, product page, pricing page, dashboard, blog article, portfolio, login, 404, settings, product detail |
| **Advertising** | 6 | Facebook Ad, Google (leaderboard/rectangle/skyscraper), Instagram Ad, LinkedIn Ad |
| **Presentation** | 2 | 16:9 widescreen, 4:3 standard |
| **Email** | 3 | Newsletter, header, banner |
| **Total** | **48** | |

---

## Example Prompts

### Dark luxury café landing page (Noir demo)

```
Create a design system named "noir" — primary #C9A84C,
Playfair Display + Inter, mood: luxury editorial dark.

Generate a hero image: moody coffee shop interior,
gold lighting, marble surfaces.

Build landing_page_full template with system "noir",
composition_mode "connected":
  headline: "Where darkness meets flavor"
  subheadline: "Single origin. Obsessively sourced."
  features: Single Origin / Dark Roast Only / Slow Brew
  quote: "The darkest cup I have ever tasted."
  author: James Hoffmann, World Barista Champion

Place the hero image as a full-bleed background with
a gradient overlay. Add Lucide icons (map-pin, flame,
clock) in gold to the feature cards.
```

### SaaS pitch deck

```
Create a design system "payflow" — primary #2563EB,
Inter + Inter, mood: fintech modern trust.

Build a pitch_deck template with 8 slides:
  company: PayFlow
  tagline: Move money at the speed of thought
  problem: ACH takes 3 days. Cards take 2%.
           Your customers wait. Your margins suffer.
  solution: Real-time rails with zero interchange
  [...]
```

### Instagram social kit

```
Create a social_media_kit (9 frames) for brand "Bloom"
using system "bloom-wellness" — soft greens, Cormorant + DM Sans.
Formats: feed post, story, carousel (3 slides),
reel cover, profile pic, highlight cover (2).
```

---

## Requirements

- **Node.js 18+**
- **Figma Desktop** (the plugin API requires the desktop client — browser Figma is not supported)
- **Claude Code** with MCP support
- **Gemini API key** — required only for `generate_design_system_from_url` and AI image generation via the `mcp-image` server. All other tools work without it.

---

## Project Structure

```
figmento/
├── figmento-mcp-server/        # MCP server (stdio transport)
│   ├── src/tools/              # 13 tool modules
│   └── knowledge/              # Design intelligence YAML files
│       ├── design-systems/     # Saved design systems (tokens)
│       ├── formats/            # 48 format adapter definitions
│       ├── patterns/           # Cross-format pattern recipes
│       ├── templates/          # Multi-frame project templates
│       └── *.yaml              # Color, type, layout, size reference
├── figmento-ws-relay/          # WebSocket message broker (port 3055)
├── figmento-plugin/            # Figma plugin (esbuild, sandbox + UI)
├── scripts/                    # render-html.js (Puppeteer HTML→PNG)
└── output/                     # Image output dir (required by tools)
```

---

## Known Limitations

- **Image generation requires a Gemini API key.** `mcp-image` calls `gemini-3-pro-image-preview`. Without it, `fetch_placeholder_image` provides picsum.photos fallbacks.
- **`generate_design_system_from_url` is best-effort.** CSS extraction works well for simple sites. Complex SPAs with CSS-in-JS or design tokens buried in JS bundles return partial results. Always use `refine_design_system` to correct the output.
- **Figma Desktop only.** The plugin sandbox API is not available in the browser client. The relay and plugin must be running before any tool calls.
- **One active channel per session.** If you reconnect with a different channel ID, call `disconnect_from_figma` first.
- **`batch_execute` has a 50-command cap.** For very large designs, break into multiple batch calls. Failed commands within a batch do not abort the remaining ones.
- **Font availability is Figma's responsibility.** If a requested Google Font isn't installed in Figma, text falls back to the default. The `get_font_pairing` tool returns commonly available fonts to minimize this.

---

## License

ISC © 2024 Figmento contributors
