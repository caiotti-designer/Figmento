# FN-P3: Plugin Chat Parity Investigation

**Date:** 2026-03-25
**Investigator:** @dev (Dex)
**Branch:** feat/ad-analyzer-bridge-chat-core

---

## Issue 1: Batch DSL Not Triggering in Plugin Chat

### Root Cause

**`batch_execute` was missing from the plugin tool whitelist entirely.** Two gaps:

1. **`PLUGIN_TOOLS` whitelist in `scripts/generate-tool-schemas.ts` (line 53-63)** did not include `batch_execute` or `clone_with_overrides`. This array controls which MCP server tools get auto-generated into `figmento/src/ui/tools-schema.generated.ts`. Since `batch_execute` was absent, the LLM never received it as a callable tool — regardless of what the system prompt said about "Enhanced DSL."

2. **`BUILD_PHASE_TOOLS` set in `figmento/src/ui/tools-schema.ts` (line 98-115)** did not include `batch_execute`. Even if the tool definition were generated, the `chatToolResolver()` phase filter would have excluded it from both plan and build phases.

The system prompt in `figmento/src/ui/system-prompt.ts` (lines 719-742) correctly documents the Enhanced Batch DSL syntax (repeat, if, tempId, property access). However, this guidance was purely aspirational — the LLM had no `batch_execute` tool to call. Gemini (and Claude/OpenAI in chat mode) would read the batch instructions but could only call individual tools since `batch_execute` was not in their tool declarations.

**The sandbox CAN handle `batch_execute`** — `figmento/src/handlers/command-router.ts:101` already routes it, and `figmento/src/handlers/canvas-batch.ts` implements the full DSL expansion (repeat, if, tempId). The gap was purely in the LLM tool surface.

### Fix (Implemented)

Three changes applied:

1. **`scripts/generate-tool-schemas.ts`** — Added `batch_execute` and `clone_with_overrides` to `PLUGIN_TOOLS` whitelist and `TOOL_DESCRIPTIONS`. The description for `batch_execute` explicitly mentions Enhanced DSL constructs (repeat, if, tempId, $name references).

2. **`figmento/src/ui/tools-schema.ts`** — Added `batch_execute` and `clone_with_overrides` to `BUILD_PHASE_TOOLS` set.

3. **Regenerated** `figmento/src/ui/tools-schema.generated.ts` via `npm run build`. The file now contains 41 tool definitions (up from 35), including both new tools with full JSON Schema input definitions.

**Verification:** `batch_execute` tool definition now includes:
- Description mentioning repeat/if/tempId DSL
- `commands` array schema with action/params/tempId
- `chunkSize` and `autoEvaluate` optional parameters

The plugin chat LLM (Gemini, Claude, or OpenAI) will now see `batch_execute` as a callable tool during the build phase and can use the Enhanced DSL syntax documented in the system prompt.

---

## Issue 2: Knowledge Tool Gap

### Current State

**Plugin Chat tools (41 tool definitions + 3 plugin-only = 44 total):**

MCP-generated (via `tools-schema.generated.ts`):
- Canvas: `create_frame`, `create_text`, `create_rectangle`, `create_ellipse`, `create_image`
- Styling: `set_fill`, `set_stroke`, `set_effects`, `set_corner_radius`, `set_opacity`, `set_auto_layout`
- Scene: `get_selection`, `get_screenshot`, `export_node`, `get_node_info`, `get_page_nodes`, `delete_node`, `move_node`, `resize_node`, `rename_node`, `append_child`, `reorder_child`, `group_nodes`, `clone_node`, `scan_frame_structure`
- Batch: `create_design`, `batch_execute` (NEW), `clone_with_overrides` (NEW)
- Icons: `create_icon`
- Figma Native: `read_figma_context`, `bind_variable`, `apply_paint_style`, `apply_text_style`, `apply_effect_style`, `create_figma_variables`
- Quality: `run_refinement_check`
- Knowledge (local): `get_layout_blueprint`, `get_color_palette`, `get_font_pairing`, `get_size_preset`, `get_contrast_check`, `get_design_rules`

Plugin-only (hand-authored in `tools-schema.ts`):
- `analyze_canvas_context` (plugin vision)
- `update_memory` (persistent memory)
- `generate_image` (Gemini Imagen)

**MCP Server tools NOT available to plugin chat (~50+ tools missing):**

| Category | Missing Tools |
|----------|--------------|
| Intelligence | `get_design_guidance`, `get_design_intelligence`, `suggest_font_pairing`, `generate_accessible_palette` |
| Design System | `get_design_system`, `create_design_system`, `update_design_system`, `delete_design_system`, `refine_design_system`, `design_system_preview`, `generate_design_system_from_url` |
| References | `find_design_references`, `analyze_reference`, `batch_analyze_references` |
| Patterns | `create_from_pattern`, `create_from_template` |
| Templates | `scan_template`, `apply_template_text`, `apply_template_image` |
| Image Pipeline | `generate_design_image`, `place_generated_image`, `fill_contextual_images`, `fetch_placeholder_image` |
| Brand | `get_brand_kit`, `save_brand_kit`, `load_brand_assets`, `save_brand_assets`, `place_brand_asset`, `list_brand_assets`, `brand_consistency_check` |
| Export | `export_node_to_file`, `export_as_svg`, `import_pdf` |
| Presentation | `create_presentation`, `create_carousel` |
| Resources | `list_resources`, `get_format_rules`, `get_learned_preferences` |
| Ad Analyzer | `start_ad_analyzer`, `complete_ad_analyzer`, `generate_ad_variations` |
| Connection | `connect_to_figma`, `disconnect_from_figma` (intentionally excluded) |
| File Storage | `store_temp_file`, `list_temp_files` |
| Advanced | `boolean_operation`, `create_vector`, `flatten_nodes`, `set_constraints`, `set_text`, `style_text_range`, `find_nodes`, `evaluate_design`, `evaluate_layout`, `import_component_by_key`, `import_style_by_key`, `flip_gradient` |

### Root Cause

**Architectural: two completely separate tool execution paths.**

```
MCP Path (Claude Code):
  Claude Code → MCP Protocol (stdio) → figmento-mcp-server → WS relay → plugin sandbox
  [Full 100+ tools: intelligence + design system + references + canvas + everything]

Plugin Chat Path (Gemini/Claude/OpenAI direct API):
  Plugin UI → LLM API (HTTP) → tool_use response → plugin UI → sandbox postMessage
  [44 tools: canvas + styling + scene + 6 local knowledge lookups]
```

The MCP server has full access to the knowledge YAML files, design system storage, reference library, brand kits, image generation pipeline (via mcp-image), and all intelligence tools. These run server-side (Node.js process) with filesystem access.

The plugin chat runs entirely in the browser (Figma iframe). It cannot:
- Access the filesystem (no YAML knowledge files, no design system JSON files)
- Call MCP server tools (no MCP protocol from the browser)
- Run Node.js modules (suggest_font_pairing uses Fontjoy vectors, generate_accessible_palette uses Leonardo color science)

**The bridge partially addresses this:** 6 knowledge tools (`get_layout_blueprint`, `get_color_palette`, `get_font_pairing`, `get_size_preset`, `get_contrast_check`, `get_design_rules`) are implemented as local intelligence in `figmento/src/ui/local-intelligence.ts` using the bundled `compiled-knowledge.ts` (117.5 KB of pre-compiled YAML data). These execute with zero latency, no network.

But the more advanced tools (design system CRUD, references, font pairing ML, accessible palette generation, image pipeline, brand kits) have no local equivalent. They fundamentally require server-side capabilities.

### Proposed Fix (Minimal)

**Tier 1 — Quick wins (no architecture change):**

1. **Add `get_design_intelligence` as a local tool.** The MCP version just returns a static playbook string. Copy it into `local-intelligence.ts` as a hardcoded response. This is the "bootstrap" tool that teaches the LLM the full design workflow. Cost: ~30 lines of code.

2. **Add `suggest_font_pairing` as a local tool.** The Fontjoy vector data (~50KB) could be bundled into compiled-knowledge.ts. The algorithm is pure math (cosine similarity). Cost: bundle vectors + port ~100 lines.

3. **Add `generate_accessible_palette` as a local tool.** The Leonardo color science is pure math (relative luminance, contrast ratios). Could be implemented in ~150 lines without any server dependency.

**Tier 2 — Bridge to MCP server (medium effort):**

For tools that genuinely need filesystem access (design system CRUD, references, brand kits), add a **relay bridge**: plugin chat sends tool calls via WebSocket to the relay, which forwards to the MCP server. This requires:
- A new WS message type: `{ type: 'mcp-tool-call', tool: string, args: object }`
- The relay spawning or connecting to the MCP server process
- Response forwarding back to the plugin chat

This is architecturally significant but would give the plugin chat access to ALL MCP tools, closing the gap entirely. Estimated effort: 1-2 stories.

**Tier 3 — Image generation (already partially solved):**

The plugin chat already has `generate_image` (Gemini Imagen via API key). The gap is the MCP path's `generate_design_image` (which adds design context, auto-placement, mood matching). A local wrapper around `generate_image` with brief-aware prompt enhancement would close most of this gap. Cost: ~50 lines.

**Recommendation:** Start with Tier 1 (3 local tools, ~1 day). Assess Tier 2 as a separate epic — it's the only way to achieve full parity for design system and reference workflows.

---

## Files Modified (Issue 1 Fix)

| File | Change |
|------|--------|
| `scripts/generate-tool-schemas.ts` | Added `batch_execute`, `clone_with_overrides` to PLUGIN_TOOLS + TOOL_DESCRIPTIONS |
| `figmento/src/ui/tools-schema.ts` | Added `batch_execute`, `clone_with_overrides` to BUILD_PHASE_TOOLS |
| `figmento/src/ui/tools-schema.generated.ts` | Auto-regenerated (35 → 41 tools) |
| `figmento/dist/code.js`, `figmento/dist/ui.html` | Rebuilt |
