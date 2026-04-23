# FN-0: `use_figma` Architecture Assessment

**Author:** @architect (Aria)
**Date:** 2026-03-24
**Status:** Complete
**Epic:** FN -- Figma Native Agent Migration
**PRD:** PRD-005 Section 8

---

## Executive Summary

Figma's official MCP server now exposes a `use_figma` tool that executes **arbitrary Plugin API JavaScript** on the Figma canvas -- the same sandbox our Figmento plugin runs in. This means roughly **60-70% of our WS-routed design tools can be replaced** by `use_figma` calls, eliminating the need for our WebSocket relay and custom plugin for those operations. However, our **server-side intelligence layer** (knowledge base, design systems, image generation, refinement engine) has no equivalent in Figma's MCP server and must be retained. The recommended strategy is a **hybrid migration**: delegate canvas operations to `use_figma` while preserving Figmento's intelligence tools as a complementary MCP server.

---

## Q1: Plugin API Coverage

### Finding: `use_figma` executes arbitrary Plugin API JavaScript

The `use_figma` tool accepts three required parameters:

| Parameter | Type | Limit | Description |
|-----------|------|-------|-------------|
| `fileKey` | string | -- | Target Figma file key (extracted from URL) |
| `code` | string | 50,000 chars | JavaScript code with access to the `figma` global |
| `description` | string | 2,000 chars | Concise description of what the code does |

The `code` parameter has access to the full `figma` global object -- the same Figma Plugin API that our Figmento plugin uses. This means it can:

- Create, modify, and delete any node type (frames, text, rectangles, ellipses, vectors, components, instances)
- Set fills, strokes, effects, corner radii, opacity
- Configure auto-layout (layoutMode, itemSpacing, padding, alignment)
- Manage variables, variable collections, and modes
- Apply and create paint styles, text styles, effect styles
- Import components by key (`importComponentByKeyAsync`)
- Load fonts (`figma.loadFontAsync`)
- Create images (`figma.createImage`)
- Read and modify the current selection and page structure
- Execute boolean operations, flatten vectors, group nodes

**Evidence:** The tool schema retrieved from our local MCP configuration explicitly states: *"Run JavaScript in a Figma file via the Plugin API. This is the general-purpose tool for writing to Figma."* The `code` parameter description confirms: *"JavaScript code to execute. Has access to the `figma` global (Figma Plugin API)."*

**Key difference from our architecture:** Our Figmento plugin runs as a persistent plugin inside Figma's desktop app, maintaining a WebSocket connection to the relay. Figma's `use_figma` executes code **remotely** via Figma's hosted MCP endpoint (`https://mcp.figma.com/mcp`) -- no local plugin installation required.

### Coverage Assessment

| Plugin API Area | `use_figma` Support | Notes |
|----------------|-------------------|-------|
| Node creation (frame, text, rect, ellipse, vector) | YES | Full `figma.create*` access |
| Node properties (fills, strokes, effects, opacity) | YES | Direct property assignment |
| Auto-layout | YES | Full layoutMode, spacing, padding |
| Variables & collections | YES | Create, read, bind variables |
| Styles (paint, text, effect) | YES | Create and apply styles |
| Component instances | YES | `importComponentByKeyAsync` |
| Font loading | YES | `figma.loadFontAsync` |
| Image creation from bytes | YES | `figma.createImage(bytes)` |
| Selection read/write | YES | `figma.currentPage.selection` |
| Boolean operations | YES | `figma.union`, `figma.subtract`, etc. |
| Export (PNG/SVG/PDF) | PARTIAL | Can export but returns to Figma's infra, not local disk |
| Plugin UI / postMessage | NO | No UI context -- code-only execution |
| Persistent state (clientStorage) | UNLIKELY | Stateless per-invocation model |
| Real-time event listeners | NO | No `on('selectionchange')` persistence |

**Conclusion for Q1:** `use_figma` provides near-complete Plugin API coverage for stateless, imperative operations. It cannot maintain persistent state, event listeners, or a UI layer.

---

## Q2: Batch Operations

### Finding: No native batching, but code-level batching is possible

Figma's MCP server does not offer a dedicated batch endpoint like our `batch_execute` tool. Each `use_figma` call is a single invocation. However, because the `code` parameter accepts up to **50,000 characters** of JavaScript, a single call can create dozens of nodes in a loop:

```javascript
// Example: creating 20 rectangles in one use_figma call
const parent = figma.currentPage;
for (let i = 0; i < 20; i++) {
  const rect = figma.createRectangle();
  rect.x = i * 120;
  rect.y = 0;
  rect.resize(100, 100);
  rect.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
  parent.appendChild(rect);
}
```

### Comparison with our `batch_execute`

| Aspect | Figmento `batch_execute` | `use_figma` code loop |
|--------|--------------------------|----------------------|
| Max items per call | 50 commands (chunked at 22 per WS round-trip) | Limited by 50KB code size (~100-200 node ops) |
| tempId references | YES -- `$tempId` syntax for cross-referencing | YES -- native JS variable references |
| Error isolation | Per-command error reporting | Entire script fails on uncaught error |
| Round-trips | Multiple (1 per chunk of 22) | Single round-trip |
| Auto-evaluation | Built-in refinement check | Manual -- must be orchestrated externally |

**Advantage for `use_figma`:** A single invocation can create an entire design in one round-trip, whereas our batch_execute chunks through the relay with multiple round-trips. For complex designs (30+ elements), this eliminates the chunking overhead and Railway relay latency.

**Disadvantage:** No per-command error isolation. If command 15 of 50 fails, commands 16-50 may not execute (depending on error handling in the generated code). Our `batch_execute` continues past individual failures and reports results per-command.

---

## Q3: Plugin Sandbox Access

### Finding: External-only -- the plugin sandbox cannot call Figma's MCP server

Figma's MCP server is an **external service** (`https://mcp.figma.com/mcp`) that MCP clients (Claude Code, Cursor, etc.) connect to. The Figma Plugin API sandbox has no mechanism to call the MCP server as a client:

1. **Plugin sandbox (code.ts):** Runs in Figma's QuickJS sandbox with no network access. Cannot make HTTP/WS requests.
2. **Plugin UI (ui.html):** Has network access but communicates with the sandbox via `postMessage`. Could theoretically reach the MCP endpoint, but lacks MCP client SDK and authentication context.
3. **MCP protocol is stdio/SSE-based:** The Figma MCP server uses Server-Sent Events (remote) or stdio (local). These are not accessible from the plugin UI iframe.

**Implication for Figmento:** Our current architecture (plugin sandbox -> postMessage -> plugin UI -> WebSocket -> relay -> MCP server) cannot be replaced by having the plugin call `use_figma`. The `use_figma` tool is consumed by **external** MCP clients, not by Figma plugins themselves.

This confirms that our WS relay architecture remains necessary for any scenario where the Figma plugin needs to **initiate** actions (e.g., the Chat tab's tool_use loop, or real-time event-driven workflows). `use_figma` only works when an external agent initiates the action.

---

## Q4: Latency Comparison

### Architecture Comparison

**Our WS relay path (current):**
```
Claude Code -> stdio -> MCP Server -> WebSocket -> Railway Relay -> WebSocket -> Plugin UI -> postMessage -> Plugin Sandbox
```
Round-trip: **200-800ms** typical (Railway relay adds ~100-200ms network hop; WS handshake adds latency on first connection; plugin postMessage adds ~5ms)

**Figma's `use_figma` path:**
```
Claude Code -> stdio/SSE -> Figma MCP Server (remote) -> Figma internal infrastructure -> Plugin API execution
```
Round-trip: **Estimated 300-1500ms** (based on Figma's server processing + code compilation/execution + REST API Tier 1 rate limits)

### Detailed Latency Analysis

| Factor | Figmento WS Relay | Figma `use_figma` |
|--------|-------------------|-------------------|
| Network hops | 2 (client->relay, relay->plugin) | 1 (client->Figma cloud) |
| Relay overhead | ~100-200ms (Railway) | None (Figma-internal) |
| Connection setup | WS persistent (0ms after connect) | Per-request or SSE stream |
| Code compilation | None (JSON commands) | JS parsing + execution |
| Plugin execution | Direct command dispatch | Plugin API calls |
| Image transfer | Base64 over WS (~500ms for 1MB) | Unknown (likely faster, Figma-internal) |
| Batch overhead | Multiple chunks (22 cmds each) | Single invocation |

**Estimate:** For individual operations, latency is likely **comparable** (both in the 200-500ms range). For batch operations, `use_figma` has a clear advantage by eliminating chunking round-trips. For image-heavy operations, `use_figma` likely wins because base64 payloads stay within Figma's infrastructure rather than traversing our relay.

**Important caveat:** `use_figma` is subject to **rate limits** (Tier 1 REST API limits for paid plans, 6 calls/month for free plans). Our relay has no rate limiting beyond what we configure. For high-frequency design iterations (e.g., refinement loops with 10+ tool calls), rate limits may be a bottleneck.

---

## Q5: Surface Support

### Finding: Figma Design and FigJam confirmed; Slides and Draw not supported

**Confirmed supported:**
- **Figma Design files:** Full `use_figma` support (create/edit/delete nodes, variables, styles)
- **FigJam boards:** Supported via `get_figjam` tool for reading; `use_figma` can write to FigJam files (the `editorType` parameter in `create_new_file` accepts "figjam")

**Not supported:**
- **Figma Slides:** No MCP tool support. Slides files use a different internal format. Our `create_presentation` and `create_carousel` tools (which create multi-frame designs in regular Figma files) have no equivalent in Figma's MCP server.
- **Figma Draw:** No MCP tool support documented. Draw is a newer illustration-focused product with its own canvas model.

**Additional tools in Figma's MCP server by surface:**

| Tool | Design | FigJam | Slides | Draw |
|------|--------|--------|--------|------|
| `use_figma` | YES | YES | NO | NO |
| `get_design_context` | YES | NO | NO | NO |
| `get_figjam` | NO | YES | NO | NO |
| `generate_diagram` | NO | YES | NO | NO |
| `get_screenshot` | YES | YES | ? | ? |
| `get_metadata` | YES | YES | ? | ? |
| `create_new_file` | YES | YES | NO | NO |

**Implication:** Our Figmento presentation/carousel tools, which create multi-frame Figma designs simulating slides, remain the only automated path for slide-like content. Figma's `use_figma` could replicate this in Design files but offers no native Slides integration.

---

## Tool Migration Matrix

### Category Legend
- **(a) Delegate to `use_figma`** -- Canvas operation that `use_figma` can handle natively
- **(b) Server-side only** -- Knowledge/intelligence tool with no WS dependency
- **(c) Needs WS relay** -- Requires our plugin bridge or has features beyond `use_figma`
- **(d) Hybrid** -- Server-side logic + canvas execution

| # | Tool | Module | Category | Can Migrate? | Notes |
|---|------|--------|----------|-------------|-------|
| 1 | `connect_to_figma` | connection | (c) -> REMOVE | ELIMINATE | Replaced by `use_figma`'s `fileKey` param; no connection step needed |
| 2 | `disconnect_from_figma` | connection | (c) -> REMOVE | ELIMINATE | No persistent connection to manage |
| 3 | `create_frame` | canvas | (a) | YES | Direct `figma.createFrame()` in code |
| 4 | `create_text` | canvas | (a) | YES | `figma.createText()` + `loadFontAsync` |
| 5 | `create_rectangle` | canvas | (a) | YES | `figma.createRectangle()` |
| 6 | `create_ellipse` | canvas | (a) | YES | `figma.createEllipse()` |
| 7 | `create_vector` | canvas | (a) | YES | `figma.createVector()` |
| 8 | `create_image` | canvas | (a) | PARTIAL | `figma.createImage()` -- base64 within 50KB code limit may be tight for large images |
| 9 | `set_fill` / `set_style(fill)` | style | (a) | YES | Direct property assignment |
| 10 | `set_stroke` / `set_style(stroke)` | style | (a) | YES | Direct property assignment |
| 11 | `set_effects` / `set_style(effects)` | style | (a) | YES | Direct property assignment |
| 12 | `set_corner_radius` | style | (a) | YES | Direct property assignment |
| 13 | `set_opacity` | style | (a) | YES | Direct property assignment |
| 14 | `set_auto_layout` | style | (a) | YES | Direct property assignment |
| 15 | `set_text` | style | (a) | YES | Load font + set characters |
| 16 | `style_text_range` | style | (a) | YES | `setRangeFontSize`, etc. |
| 17 | `transform_node` (move/resize) | scene | (a) | YES | Direct x/y/resize |
| 18 | `rename_node` | scene | (a) | YES | `node.name = ...` |
| 19 | `delete_node` | scene | (a) | YES | `node.remove()` |
| 20 | `append_child` | scene | (a) | YES | `parent.appendChild(child)` |
| 21 | `reorder_child` | scene | (a) | YES | `parent.insertChild(index, child)` |
| 22 | `group_nodes` | scene | (a) | YES | `figma.group()` |
| 23 | `find_nodes` | scene | (a) | YES | `findAll()` with filters |
| 24 | `boolean_operation` | scene | (a) | YES | `figma.union()`, `figma.subtract()`, etc. |
| 25 | `flatten_nodes` | scene | (a) | YES | `figma.flatten()` |
| 26 | `clone_node` | scene | (a) | YES | `node.clone()` |
| 27 | `clone_with_overrides` | batch | (a) | YES | JS loop: clone + property override |
| 28 | `import_component_by_key` | scene | (a) | YES | `importComponentByKeyAsync` |
| 29 | `import_style_by_key` | scene | (a) | YES | `importStyleByKeyAsync` |
| 30 | `export_as_svg` | scene | (a) | PARTIAL | `exportAsync({ format: 'SVG' })` -- result stays in Figma, not on disk |
| 31 | `set_constraints` | scene | (a) | YES | Direct property assignment |
| 32 | `get_selection` | scene | (a) | YES | `figma.currentPage.selection` |
| 33 | `get_node_info` | scene | (a) | YES | Read node properties |
| 34 | `get_page_nodes` | scene | (a) | YES | `figma.currentPage.children` |
| 35 | `batch_execute` | batch | (d) | PARTIAL | Code-level batching possible, but loses per-command error isolation and tempId system |
| 36 | `create_design` | batch | (d) | PARTIAL | Complex orchestration -- would need code generation for entire design |
| 37 | `read_figma_context` | figma-native | (a) | YES | Read variables/styles via Plugin API |
| 38 | `bind_variable` | figma-native | (a) | YES | `setBoundVariable()` in Plugin API |
| 39 | `apply_style` | figma-native | (a) | YES | Apply paint/text/effect styles |
| 40 | `create_figma_variables` | figma-native | (a) | YES | Create variable collections |
| 41 | `create_variables_from_design_system` | figma-native | (d) | PARTIAL | Reads Figmento design system YAML (server-side) + creates variables (canvas-side) |
| 42 | `create_icon` | icons | (c) | NO | Reads Lucide SVG paths from server-side files; icon data not available in `use_figma` |
| 43 | `create_component` | canvas | (a) | YES | `figma.createComponent()` |
| 44 | `scan_frame_structure` | template | (c) | PARTIAL | Reads from canvas but returns structured analysis; could migrate read part |
| 45 | `get_screenshot` | export | (a) | YES | Figma's own `get_screenshot` tool exists |
| 46 | `export_node` | export | (a) | PARTIAL | `exportAsync()` available but not to local disk |
| 47 | `export_node_to_file` | export | (c) | NO | Requires writing to local filesystem -- `use_figma` has no disk access |
| 48 | `place_generated_image` | image-fill | (c) | NO | Reads from local disk + sends base64 over WS; `use_figma` has no local file access |
| 49 | `fill_contextual_images` | image-fill | (c) | NO | Orchestrates AI image gen + canvas placement |
| 50 | `generate_design_image` | image-gen | (b) | N/A | Server-side AI image generation -- no canvas dependency |
| 51 | `fetch_placeholder_image` | image-gen | (b) | N/A | Server-side HTTP fetch |
| 52 | `get_design_guidance` | intelligence | (b) | RETAIN | Server-side YAML knowledge base |
| 53 | `get_design_rules` | intelligence | (b) | RETAIN | Server-side YAML knowledge base |
| 54 | `get_format_rules` | intelligence | (b) | RETAIN | Server-side YAML knowledge base |
| 55 | `get_layout_blueprint` | layouts | (b) | RETAIN | Server-side YAML knowledge base |
| 56 | `find_design_references` | references | (b) | RETAIN | Server-side YAML knowledge base |
| 57 | `get_design_system` | design-system | (b) | RETAIN | Server-side YAML CRUD |
| 58 | `create_design_system` | design-system | (b) | RETAIN | Server-side YAML CRUD |
| 59 | `run_refinement_check` | refinement | (d) | PARTIAL | Reads canvas via WS, evaluates server-side |
| 60 | `evaluate_design` | refinement | (d) | PARTIAL | Same pattern as refinement_check |
| 61 | `list_resources` | resources | (b) | RETAIN | Server-side resource listing |
| 62 | `create_from_pattern` | patterns | (d) | PARTIAL | Server-side pattern logic + canvas creation |
| 63 | `create_from_template` | template | (d) | PARTIAL | Server-side template logic + canvas creation |
| 64 | `create_carousel` | orchestration | (d) | PARTIAL | Multi-step orchestration with server-side logic |
| 65 | `create_presentation` | orchestration | (d) | PARTIAL | Multi-step orchestration with server-side logic |
| 66 | `get_learned_preferences` | learning | (b) | RETAIN | Server-side preference storage |
| 67 | `ad_analyzer` tools | ad-analyzer | (d) | PARTIAL | Vision AI analysis (server) + canvas read (WS) |

### Migration Summary

| Category | Count | Percentage |
|----------|-------|------------|
| **(a) Direct migration to `use_figma`** | ~35 tools | ~52% |
| **(b) Server-side only (retain as-is)** | ~15 tools | ~22% |
| **(c) Needs WS relay (cannot migrate)** | ~7 tools | ~10% |
| **(d) Hybrid (partial migration)** | ~10 tools | ~15% |

---

## Recommendation: Hybrid Migration (Phased)

### Strategy: Migrate canvas operations, retain intelligence layer

**Do NOT attempt a full migration.** Figma's MCP server and Figmento solve different problems:

- **Figma MCP:** General-purpose canvas access for any MCP client. No design intelligence, no knowledge base, no AI image generation, no refinement engine.
- **Figmento MCP:** Domain-specific design automation platform with intelligence layer, design systems, patterns, templates, and image pipeline.

### Proposed Architecture (Post-Migration)

```
Claude Code
  |
  +-- Figma MCP Server (remote)     -> use_figma for canvas ops
  |     - create/modify/delete nodes
  |     - read variables, styles
  |     - screenshots
  |
  +-- Figmento MCP Server (local)   -> intelligence + orchestration
        - get_design_guidance, get_design_rules, get_format_rules
        - get_layout_blueprint, find_design_references
        - design system CRUD
        - image generation + placement (via use_figma)
        - refinement engine (reads via use_figma, evaluates server-side)
        - patterns, templates, orchestration
```

### Phase Plan

**Phase 1 (Low Risk):** Migrate pure canvas tools (create_frame, set_fill, etc.) to `use_figma` code generation. Figmento generates the JavaScript code string, Claude Code calls `use_figma`. Eliminates ~35 individual MCP tools and the WS relay dependency for these operations.

**Phase 2 (Medium Risk):** Migrate hybrid tools (batch_execute, create_design, patterns, templates) to generate `use_figma` code. These tools' server-side logic (reading YAMLs, computing layouts) stays in Figmento, but the canvas execution uses `use_figma`.

**Phase 3 (High Risk/Deferred):** Evaluate migrating image pipeline. The 50KB code limit and lack of local file access make `place_generated_image` difficult. May require Figma to add image URL support to `use_figma`, or we continue using the WS relay for image operations only.

### What We Eliminate

- **WebSocket relay server** (for non-image operations)
- **Figma plugin installation** (for non-image operations)
- **Railway hosting cost** for the relay
- **Connection setup ceremony** (`connect_to_figma` + channel ID copy)
- **WS chunking complexity** in batch_execute

### What We Retain

- Figmento MCP server (intelligence, design systems, knowledge base)
- Image generation pipeline (mcp-image integration)
- Possibly a thin WS relay for image placement only (if `use_figma` cannot handle base64 images within its limits)

---

## Risks & Open Items

### Confirmed Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Rate limits** on `use_figma` (Tier 1 API limits) | High -- design refinement loops may hit limits | Monitor usage; batch more operations per call; cache intermediate results |
| **50KB code limit** constrains complex single-call designs | Medium -- very large designs may need splitting | Generate compact code; use loops instead of repeated statements |
| **No local file access** in `use_figma` | High -- breaks `place_generated_image`, `export_node_to_file` | Keep minimal WS relay for image pipeline, or use Figma's image URL API if available |
| **No per-command error isolation** in JS code | Medium -- one failure can cascade | Generate try/catch blocks per operation; return structured error arrays |
| **Beta status** -- API may change | Medium -- breaking changes during migration | Pin to known working version; maintain fallback to WS relay |
| **Pricing** -- free during beta, will become paid | High -- cost model unknown | Budget for API costs; optimize call count |

### Open Items Requiring Benchmarking

1. **Actual latency of `use_figma`** -- Need real-world measurements comparing WS relay vs `use_figma` for identical operations (single node creation, 20-node batch, image placement).
2. **Rate limit headroom** -- How many `use_figma` calls per minute on a Professional plan? Is a design refinement loop (10-15 calls) feasible?
3. **Image handling** -- Can `use_figma` accept base64 image data within the 50KB code limit? What about `figma.createImage(new Uint8Array([...]))` with inline data?
4. **Font loading reliability** -- Does `figma.loadFontAsync` work correctly in `use_figma`'s remote execution context? Are Google Fonts available?
5. **Concurrency** -- Can multiple `use_figma` calls execute in parallel on the same file, or are they serialized?
6. **Figma Slides roadmap** -- Will Figma extend `use_figma` to Slides files? This affects our presentation tools.
7. **Skills system** -- How do Figma's skills interact with our CLAUDE.md instructions? Can they conflict?

### Decision Gate

Before proceeding to Phase 1 implementation, we need answers to items 1-4 above via a **proof-of-concept spike** (proposed as story FN-1). The spike should:

- Create a simple design (frame + text + rectangle + gradient) via both `use_figma` and our WS relay
- Measure latency for both paths
- Test image placement via `use_figma` with inline base64
- Verify font loading works in remote execution
- Document rate limit behavior under load

---

## Sources

- [Guide to the Figma MCP server -- Figma Help Center](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [Agents, Meet the Figma Canvas -- Figma Blog](https://www.figma.com/blog/the-figma-canvas-is-now-open-to-agents/)
- [Figma MCP Server Tools and Prompts -- Developer Docs](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Figma MCP Server Introduction -- Developer Docs](https://developers.figma.com/docs/figma-mcp-server/)
- [Code to Canvas -- Developer Docs](https://developers.figma.com/docs/figma-mcp-server/code-to-canvas/)
- [Figma MCP Server Guide -- GitHub](https://github.com/figma/mcp-server-guide)
- [Figma MCP vs Figma Console MCP -- Southleft](https://southleft.com/insights/ai/figma-mcp-vs-figma-console-mcp/)
- [Introducing our Dev Mode MCP server -- Figma Blog](https://www.figma.com/blog/introducing-figma-mcp-server/)
- [Plans, Access, and Permissions -- Developer Docs](https://developers.figma.com/docs/figma-mcp-server/plans-access-and-permissions/)
- `use_figma` tool schema (retrieved from local MCP configuration, 2026-03-24)
