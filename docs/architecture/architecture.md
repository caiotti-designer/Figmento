# Figmento MCP — Brownfield Enhancement Architecture

> Architectural blueprint for evolving Figmento from a functional MCP bridge into a top-tier AI design automation platform.

| Change | Date | Version | Description | Author |
|--------|------|---------|-------------|--------|
| Initial architecture | 2026-02-24 | 1.0 | Brownfield analysis of existing Figmento MCP system | @architect (Aria) |
| ADR updates | 2026-02-24 | 1.1 | Dual-plugin strategy, error contracts, idempotency, revised sequence | @architect (Aria) |
| Implementation complete | 2026-02-24 | 1.2 | All 26 stories (S-01–S-26) implemented across Milestones 1–6 | @dev (Dex) |
| S-27: export_node_to_file | 2026-02-24 | 1.3 | Add file-based export for self-evaluation pipeline | @dev (Dex) |

---

## 1. Introduction

This document outlines the architectural approach for enhancing **Figmento MCP** — a three-component system (Figma Plugin + MCP Server + WebSocket Relay) that enables Claude Code to create and manipulate Figma designs programmatically. The goal is to evolve from a working command bridge into a **top-tier AI design automation platform** with intelligent design decisions, image generation integration, and self-evaluation capabilities.

**Relationship to Existing Architecture:**
This document supplements the existing [PROJECT-BRIEFING.md](../PROJECT-BRIEFING.md) by defining how new capabilities (design intelligence, image pipeline, quality refinement) integrate with the current working system. Where the briefing describes what was planned, this document reflects what actually exists and what comes next.

### 1.1 Existing Project Analysis

**Current Project State:**
- **Primary Purpose:** Enable AI agents (Claude Code) to automate Figma design creation via MCP protocol
- **Current Tech Stack:** TypeScript 5.3+, MCP SDK 1.12, WebSocket (ws 8.18), Zod 3.24, esbuild, Puppeteer
- **Architecture Style:** Three-component bridge — Plugin (executor) ↔ WS Relay (router) ↔ MCP Server (API)
- **Deployment Method:** Local-only (all 3 components on localhost)

**Available Documentation:**
- `docs/PROJECT-BRIEFING.md` — Original architecture plan and phased implementation roadmap
- `figmento-mcp-server/knowledge/*.yaml` — 6 design knowledge files (sizes, typography, colors, layout, brand kits, print)
- `.claude/CLAUDE.md` — Extensive design agent rules and HTML-to-Figma pipeline documentation

**What's Working (Phase 1 + Phase 2 + Phase 3 — COMPLETE):**
- Full MCP-to-Figma pipeline operational (**36 tools** — 24 original + 12 new)
- WebSocket relay with channel-based routing and 10MB max payload limit (S-26)
- Plugin sandbox executing all Figma API operations including icons, templates, and multi-slide
- Batch design creation via `create_design` (UIAnalysis JSON)
- Export/screenshot capability for self-evaluation
- Knowledge base YAML files created, populated, and **exposed as MCP tools** (S-08–S-15)
- HTML-to-PNG rendering pipeline via Puppeteer
- `place_generated_image` tool with path validation (S-01, S-02)
- `create_icon` tool with Lucide SVG path support (S-16)
- Template tools: `scan_template`, `apply_template_text`, `apply_template_image` (S-17–S-19)
- Multi-slide tools: `create_carousel`, `create_presentation` (S-20, S-21)
- Structured error contract with `CommandErrorCode` and `recoverable` hints (S-03)
- WS auto-reconnection with exponential backoff, command queue, and heartbeat (S-04–S-06)
- Brand kit CRUD with YAML persistence (S-15)
- Tool organization: modular `tools/` directory with 7 modules (S-07)
- `export_node_to_file` tool for disk-based export enabling self-evaluation pipeline (S-27)
- ESLint + Prettier configured for MCP server and relay (S-23)
- Jest test suite with 16 unit tests for intelligence module (S-24)

**What's Remaining (future enhancements):**
- Self-evaluation loop automation (design quality scoring — `export_node_to_file` now provides the file-based export, but the analyze-and-iterate loop is not yet automated)
- Shared code extraction (`packages/figmento-core/`) deferred — current duplication is minimal (S-22)
- Integration test harness for full tool suite end-to-end (S-25 — unit tests done, integration deferred)
- No chunking or compression for large base64 payloads over WS

**Identified Constraints:**
- Figma Plugin API runs in a sandbox — cannot host servers, limited to outbound WS connections
- MCP servers communicate via stdio — cannot host WS servers directly (hence the relay)
- Plugin UI iframe is the only component with network access (sandbox communicates via postMessage)
- Google Fonts must be loaded at runtime in the Figma sandbox (5s timeout with fallback chain)
- Base64 is the only image transport mechanism to the plugin (Figma's `createImage()` requires decoded bytes)
- Large base64 payloads (images) can strain the WS relay — max payload set to 10MB, no chunking or compression

### 1.2 Dual-Plugin Strategy (ADR)

**Decision:** Both `figmento/` (original standalone plugin) and `figmento-plugin/` (MCP-driven thin executor) coexist as **separate Figma plugin manifests**. This is intentional — the original plugin retains its full AI-powered UI for standalone use, while the MCP plugin is stripped to a WebSocket command executor.

**Shared Code Problem:**
Both plugins currently maintain independent copies of core files:

| File | figmento/ | figmento-plugin/ | Status |
|------|-----------|-------------------|--------|
| `element-creators.ts` | 649 lines | 649 lines | Identical — will drift |
| `color-utils.ts` | 101 lines | 101 lines | Identical — will drift |
| `svg-utils.ts` | 388 lines | 388 lines | Identical — will drift |
| `types.ts` (core subset) | UIElement, Fill, Stroke, etc. | UIElement, Fill, Stroke, etc. | Diverged — MCP plugin has WS types |

**Risk:** Any bug fix or enhancement to element creation logic must be applied to both copies. Drift is inevitable and creates subtle bugs (e.g., a fix to font loading in one plugin not reaching the other).

**Recommended Strategy: Extract `packages/figmento-core/`**

```
packages/
└── figmento-core/
    ├── src/
    │   ├── element-creators.ts    # Single source of truth
    │   ├── color-utils.ts         # Single source of truth
    │   ├── svg-utils.ts           # Single source of truth
    │   └── types.ts               # Core design types only (UIElement, Fill, Stroke, etc.)
    ├── package.json               # "figmento-core", private: true
    └── tsconfig.json
```

- Both plugins import from `figmento-core` as a workspace dependency
- Plugin-specific types (WSCommand, WSResponse, PluginMessage) stay in their respective `types.ts`
- Build: each plugin's esbuild bundles the core code inline (no runtime dependency resolution needed in Figma sandbox)

**Current Status (v1.2):** S-22 was **deferred**. The `create_icon` tool (S-16) was implemented by adding a `handleCreateIcon` handler in `figmento-plugin/src/code.ts` that delegates to the existing `createIconPlaceholder()` in `element-creators.ts` — no modification to the shared file was needed, so the extraction trigger was not hit. The shared files remain duplicated but identical. Extraction should be triggered the moment any shared file needs a divergent change.

**Evaluation criteria for extraction timing:**
- Extract the moment any shared file (`element-creators.ts`, `color-utils.ts`, `svg-utils.ts`) needs a change
- The practical trigger has not yet been hit — all new functionality was added via new handler functions, not by modifying shared files

**Alternative considered:** Git submodule or symlinks. Rejected — esbuild doesn't follow symlinks reliably in the Figma plugin context, and submodules add workflow friction.

---

## 2. Enhancement Scope and Integration Strategy

### 2.1 Enhancement Overview

**Enhancement Type:** Feature completion + Intelligence layer addition
**Scope:** Complete Phase 2 gaps, implement full Phase 3, add image generation pipeline
**Integration Impact:** Medium — new tools added alongside existing ones, no breaking changes to current pipeline

### 2.2 Integration Approach

**Code Integration Strategy:** Additive only — new tools registered in existing `server.ts`, new command handlers added to existing `code.ts` command router. No modifications to existing tool signatures or behaviors.

**Database Integration:** N/A — no database in this system. Brand kits stored as local YAML files.

**API Integration:** New MCP tools follow the identical pattern established by the 24 existing tools: Zod schema → `sendDesignCommand()` → plugin handler → response. External API integration limited to image generation (Nano Banana Pro) accessed via separate MCP server.

**UI Integration:** Plugin UI (`ui-app.ts`) unchanged for tool additions. Status indicators may be enhanced for reconnection state.

### 2.3 Compatibility Requirements

- **Existing API Compatibility:** All 24 current MCP tools remain unchanged in signature and behavior
- **Plugin Protocol Compatibility:** WSCommand/WSResponse protocol unchanged — new actions added to existing `action` union
- **Performance Impact:** Intelligence tools are read-only YAML lookups (sub-millisecond). Image tools will increase WS payload sizes (base64) — monitor for timeouts
- **Claude Code Compatibility:** New tools appear alongside existing ones — no reconfiguration needed

---

## 3. Tech Stack Alignment

### 3.1 Existing Technology Stack

| Category | Current Technology | Version | Usage in Enhancement | Notes |
|----------|-------------------|---------|---------------------|-------|
| Language | TypeScript | 5.3+ | All new code | No change |
| MCP SDK | @modelcontextprotocol/sdk | 1.12.1 | New tool registrations | Same API |
| WebSocket | ws | 8.18.0 | Reconnection logic | Existing lib |
| Validation | Zod | 3.24.0 | New tool schemas | Same patterns |
| Build | esbuild | 0.20.x | All components | No change |
| Runtime | Node.js | 18+ | MCP + Relay | No change |
| Plugin Types | @figma/plugin-typings | 1.98.0 | New command handlers | No change |
| Rendering | Puppeteer | 24.37.5 | HTML-to-PNG pipeline | Root package |

### 3.2 New Technology Additions

| Technology | Version | Purpose | Rationale | Integration Method | Status |
|-----------|---------|---------|-----------|-------------------|--------|
| js-yaml | ^4.1.1 | Parse knowledge YAML files at runtime | Knowledge base is YAML; need runtime parsing for intelligence tools | npm dependency in figmento-mcp-server | **Installed** |
| jest + ts-jest | ^29.7 / ^29.4 | Unit testing for MCP server | Test intelligence tools, YAML parsing, contrast calc | devDependency in figmento-mcp-server | **Installed** |
| eslint + @typescript-eslint | ^8.57 / ^7.0 | Code linting | Consistent style across MCP server and relay | devDependency in both | **Installed** |
| prettier | ^3.2 | Code formatting | Consistent formatting across MCP server and relay | devDependency in both | **Installed** |
| chokidar (optional) | ^3.6.0 | Watch brand-kit files for hot-reload | Users may edit brand kits while MCP server runs | npm dependency, lazy-loaded | **Not installed** — deferred |

No framework changes. No new build tools. The stack is intentionally minimal and aligned with existing choices.

---

## 4. Component Architecture

### 4.1 New Components / Capabilities

#### 4.1.1 Design Intelligence Module (`figmento-mcp-server/src/tools/intelligence.ts`) — IMPLEMENTED

**Status:** Complete (S-08 through S-15). 10 MCP tools registered. 16 unit tests passing.

**Responsibility:** Expose the 6 knowledge base YAML files as queryable MCP tools. Transform static design knowledge into actionable AI guidance.

**Integration Points:** Registered in `server.ts` via `registerIntelligenceTools(server)`. Reads from `knowledge/` directory with lazy `Map<string, unknown>` cache. No WebSocket interaction (server-side only).

**Implemented Tools:**
- `get_size_preset(platform?, category?, id?)` → filters `size-presets.yaml` via `flattenPresets()` helper
- `get_font_pairing(mood?, id?)` → filters `typography.yaml` → `font_pairings` by mood tags
- `get_type_scale(baseSize?, ratio?)` → computes sizes from base + ratio using `typography.yaml` → `type_scales`
- `get_color_palette(mood?, id?)` → filters `color-system.yaml` → `palettes` by mood tags
- `get_contrast_check(foreground, background)` → WCAG relative luminance formula (pure computation)
- `get_spacing_scale()` → returns `layout.yaml` → `grid` + `spacing_scale`
- `get_layout_guide(format?)` → returns margins, safe zones, hierarchy, patterns from `layout.yaml`
- `get_brand_kit(name)` → reads `knowledge/brand-kits/{name}.yaml`
- `save_brand_kit(name, data)` → writes brand kit YAML with name sanitization

**Dependencies:**
- `knowledge/*.yaml` files (6 files)
- `js-yaml` ^4.1.1 (runtime dependency)

#### 4.1.2 Image Pipeline (`figmento-mcp-server/src/tools/canvas.ts`) — IMPLEMENTED

**Status:** Complete (S-01, S-02). `place_generated_image` tool with path traversal prevention.

**Responsibility:** Bridge between external image generation and Figma canvas placement. Reads image files from disk, converts to base64, sends to plugin via existing `create_image` WS command.

**Implementation Details:**
- `place_generated_image(filePath, name?, width?, height?, x?, y?, parentId?, cornerRadius?)` → reads file, detects MIME from extension, base64 encodes with `data:` prefix, calls `sendDesignCommand('create_image', ...)`
- Path validation: resolves and normalizes path, verifies it starts with `IMAGE_OUTPUT_DIR` (env var, defaults to `cwd()/output`). Prevents `../` traversal attacks.
- Supported formats: PNG, JPG, JPEG, WebP

**Dependencies:**
- `create_image` command handler in plugin (existing)
- Node.js `fs` + `path` (built-in)

#### 4.1.3 Template Tools Module (`figmento-mcp-server/src/tools/template.ts`) — IMPLEMENTED

**Status:** Complete (S-17, S-18, S-19). 3 MCP tools + 3 plugin command handlers.

**Responsibility:** Template scanning and content application for `#`-prefixed placeholder layers.

**Implemented Tools:**
- `scan_template(nodeId?)` → recursively scans frame children for `#`-prefixed layers, categorizes as `text` or `image`, returns `{ count, placeholders[] }`
- `apply_template_text(nodeId, content, fontSize?, color?, fontFamily?, fontWeight?)` → loads existing font before modifying text, supports optional style overrides
- `apply_template_image(nodeId, imageData, scaleMode?)` → sets IMAGE fill on rectangle/frame nodes with configurable scale mode (FILL/FIT/CROP/TILE)

**Plugin Handlers:** `handleScanTemplate`, `handleApplyTemplateText`, `handleApplyTemplateImage` in `code.ts`

#### 4.1.4 Multi-Slide Module (`figmento-mcp-server/src/tools/template.ts`) — IMPLEMENTED

**Status:** Complete (S-20, S-21). 2 MCP tools. Server-side orchestration using existing `create_frame` command.

**Implemented Tools:**
- `create_carousel(slideCount, slideWidth, slideHeight, name?, backgroundColor?, gap?)` → creates `slideCount` frames positioned side-by-side with configurable gap (default 40px). Returns all `slideIds`.
- `create_presentation(slideCount, slideWidth?, slideHeight?, name?, backgroundColor?, gap?)` → creates presentation slides (default 1920x1080, 80px gap, white background). Returns all `slideIds`.

**Note:** These tools are server-side orchestrations that compose multiple `create_frame` calls. No new plugin handlers needed — they reuse the existing `create_frame` command.

#### 4.1.5 Icon Tool (`figmento-mcp-server/src/tools/canvas.ts` + plugin) — IMPLEMENTED

**Status:** Complete (S-16). 1 MCP tool + 1 plugin command handler.

**Implemented Tool:**
- `create_icon(iconName, size?, color?, svgPaths?, name?, x?, y?, parentId?)` → creates a Lucide icon frame with stroked vector paths. Accepts pre-fetched SVG path data for precise rendering, or falls back to basic shapes for common icons (check, x, chevron-right, chevron-down, circle).

**Plugin Handler:** `handleCreateIcon` in `code.ts` → delegates to existing `createIconPlaceholder()` in `element-creators.ts` via `createElement()`.

#### 4.1.6 Reconnection & Resilience (`figmento-mcp-server/src/ws-client.ts`) — IMPLEMENTED

**Status:** Complete (S-03, S-04, S-05, S-06). Full rewrite of `FigmentoWSClient`.

**Responsibility:** Auto-reconnect on WS drop, queue commands during reconnection, heartbeat detection.

**Implementation Details:**
- **Error contract (S-03):** `CommandErrorCode` union type + `CommandError` interface in plugin and MCP server types. `classifyError()` function in plugin maps error messages to structured codes. `WSResponse` extended with optional `errorCode` and `recoverable` fields (backward compatible).
- **Reconnection (S-04):** Exponential backoff: 1s → 2s → 4s → 8s → max 30s. Max 10 attempts. `intentionalDisconnect` flag prevents reconnect after `disconnect_from_figma`.
- **Command queue (S-05):** `replayQueue` Map (max 50 entries) + `acknowledgedIds` Set. Commands buffered during disconnection, replayed on reconnect (skipping acknowledged). Oldest entries dropped with warning when queue full.
- **Heartbeat (S-06):** WebSocket ping every 15s, expects pong within 5s. On timeout: terminates connection and triggers reconnect. Uses ws library's native ping/pong.

### 4.2 Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Claude Code (MCP Client)                     │
│                                                                     │
│  "Create a coffee shop Instagram post with warm aesthetic"          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ stdio (MCP protocol)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Figmento MCP Server                               │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Intelligence  │  │ Design Tools │  │ Template + Slides        │  │
│  │ (10 tools)    │  │ (26 tools)   │  │ (5 tools)                │  │
│  │              │  │              │  │                          │  │
│  │ get_size_    │  │ create_frame │  │ scan_template            │  │
│  │ preset       │  │ create_text  │  │ apply_template_text      │  │
│  │ get_font_    │  │ create_icon  │  │ apply_template_image     │  │
│  │ pairing      │  │ set_fill     │  │ create_carousel          │  │
│  │ get_color_   │  │ place_image  │  │ create_presentation      │  │
│  │ palette      │  │ export_node  │  └──────────────────────────┘  │
│  │ ...          │  │ ...          │                                │
│  └──────┬───────┘  └──────┬───────┘                                │
│         │                 │                                        │
│  knowledge/*.yaml   ws-client.ts ◄─── reconnect + queue + ping    │
│  (local read)             │                                        │
└───────────────────────────┼──────────────────────────────────┼─────┘
                            │ WebSocket                        │
                            ▼                                  │
┌─────────────────────────────────────┐    ┌──────────────────┴──────┐
│        WS Relay (port 3055)         │    │  mcp-image Server       │
│                                     │    │  (Nano Banana Pro)      │
│  Channel: "figmento-abc123"         │    │                         │
│  Routes: CMD ──→ Plugin             │    │  Generates images to    │
│          RSP ◄── Plugin             │    │  IMAGE_OUTPUT_DIR       │
└──────────────────┬──────────────────┘    └─────────────────────────┘
                   │ WebSocket
                   ▼
┌─────────────────────────────────────┐
│     Figmento Figma Plugin           │
│                                     │
│  UI iframe (ws-client.ts)           │
│        ↕ postMessage                │
│  Sandbox (code.ts)                  │
│        ↕ Figma Plugin API           │
│  Figma Canvas                       │
└─────────────────────────────────────┘
```

---

## 5. Source Tree Integration

### 5.1 Current Project Structure (v1.2)

```
figmento-mcp-server/
├── src/
│   ├── index.ts              # Entry point (stdio transport)
│   ├── server.ts             # ~50 lines — thin orchestrator, imports tool modules
│   ├── ws-client.ts          # ~300 lines — WS client with reconnect, queue, heartbeat
│   ├── types.ts              # ~55 lines — WSCommand, WSResponse, CommandErrorCode
│   └── tools/                # Modular tool organization (7 modules)
│       ├── connection.ts     # 2 tools: connect_to_figma, disconnect_from_figma
│       ├── canvas.ts         # 7 tools: create_frame/text/rect/ellipse/image/icon, place_generated_image
│       ├── style.ts          # 6 tools: set_fill/stroke/effects/corner_radius/opacity/auto_layout
│       ├── scene.ts          # 10 tools: get_selection/node_info/page_nodes, export/export_to_file, delete/move/resize/rename, append_child
│       ├── batch.ts          # 1 tool: create_design
│       ├── intelligence.ts   # 10 tools: size/font/scale/color/contrast/spacing/layout/brand_kit (get+save)
│       └── template.ts       # 5 tools: scan_template, apply_template_text/image, create_carousel/presentation
├── tests/
│   └── intelligence.test.ts  # 16 unit tests (Jest + ts-jest)
├── knowledge/
│   ├── size-presets.yaml
│   ├── typography.yaml
│   ├── color-system.yaml
│   ├── layout.yaml
│   ├── brand-kit-schema.yaml
│   ├── print-design.yaml
│   └── brand-kits/           # Saved brand kits directory
│       └── .gitkeep
├── eslint.config.js
├── jest.config.js
├── .prettierrc
└── package.json              # deps: js-yaml; devDeps: jest, ts-jest, eslint, prettier, @typescript-eslint

figmento-plugin/
├── src/
│   ├── code.ts               # ~900 lines — command router (28 cases) + handlers
│   ├── element-creators.ts   # 649 lines — Figma node factories (unchanged)
│   ├── color-utils.ts        # 101 lines — hex/rgb conversion + getFontStyle
│   ├── svg-utils.ts          # 388 lines — SVG path operations
│   ├── types.ts              # ~163 lines — UIElement, WSCommand/Response, CommandErrorCode, CommandError
│   ├── ui-app.ts             # 846 lines — UI iframe WS bridge
│   ├── tools-schema.ts       # 421 lines — tool definitions
│   └── system-prompt.ts      # 341 lines — AI system prompt
└── package.json

figmento-ws-relay/
├── src/
│   ├── index.ts              # 17 lines — startup + shutdown
│   ├── relay.ts              # ~167 lines — channel routing + 10MB max payload
│   └── types.ts              # ~35 lines — message protocol + errorCode/recoverable
├── eslint.config.js
├── .prettierrc
└── package.json              # devDeps: eslint, prettier, @typescript-eslint
```

### 5.3 Integration Guidelines

- **File Naming:** Lowercase kebab-case, matching existing convention (`ws-client.ts`, `element-creators.ts`)
- **Folder Organization:** New `tools/` directory in MCP server to avoid monolithic `server.ts` growth
- **Import/Export Patterns:** Named exports from tool modules, registered in `server.ts` via `registerIntelligenceTools(server, wsClient)` pattern

---

## 6. Infrastructure and Deployment

### 6.1 Existing Infrastructure

**Current Deployment:** All local. Three separate `npm start` processes.
**Infrastructure Tools:** Node.js, npm, esbuild
**Environments:** Development only (localhost)

### 6.2 Enhancement Deployment Strategy

**Deployment Approach:** No infrastructure changes needed. New tools are compiled into existing bundles.

**Build Process:**
```bash
# Build all (from root)
cd figmento-ws-relay && npm run build
cd figmento-mcp-server && npm run build
cd figmento-plugin && npm run build
```

**MCP Server Registration (Claude Code):**
```json
{
  "figmento": {
    "command": "node",
    "args": ["c:/Users/Caio/Downloads/Projects/Figmento/figmento-mcp-server/dist/index.js"]
  }
}
```

**Startup Sequence:**
1. `figmento-ws-relay` — start relay on port 3055
2. Load `figmento-plugin` in Figma — connects to relay
3. Claude Code starts MCP server automatically — connects via `connect_to_figma` tool

### 6.3 Rollback Strategy

**Rollback Method:** Git-based. All changes are additive — existing tools unchanged. `git revert` any problematic commit.
**Risk Mitigation:** New tool modules are isolated in `tools/` directory. Can be disabled by commenting out registration in `server.ts`.
**Monitoring:** Console logging in relay + MCP server. Plugin status notifications via `figma.notify()`.

---

## 7. Coding Standards and Conventions

### 7.1 Existing Standards Compliance

**Code Style:** TypeScript strict mode, no explicit `any` (use `Record<string, unknown>`), consistent error handling with structured `CommandErrorCode` types
**Linting Rules:** ESLint + Prettier configured across all 3 components (S-23). Shared config: `singleQuote: true`, `printWidth: 120`, `trailingComma: "es5"`, `@typescript-eslint/no-unused-vars` with `_` prefix ignore.
**Testing Patterns:** Jest + ts-jest configured in MCP server (S-24). 16 unit tests for intelligence module. Tests in `figmento-mcp-server/tests/`. Run via `npm test`.
**Documentation Style:** JSDoc comments on classes/functions, inline comments for complex logic

### 7.2 Error Contract Specification (ADR) — IMPLEMENTED (S-03)

**Decision:** Define a structured `CommandError` type to replace ad-hoc `throw new Error(string)` in the plugin command pipeline. This is a **prerequisite** for WS reconnection and command queuing — the queue needs to know whether a failed command is worth retrying.

**Implementation:** The `classifyError()` function in `figmento-plugin/src/code.ts` maps error messages to structured codes via pattern matching on the error string. The catch block in `executeCommand()` calls `classifyError()` and populates `errorCode` and `recoverable` in the response. Existing handlers continue to work unchanged — plain `throw new Error()` maps to `UNKNOWN`.

**CommandError type (in `figmento-plugin/src/types.ts` and `figmento-mcp-server/src/types.ts`):**

```typescript
export interface CommandError {
  code: CommandErrorCode;
  message: string;
  recoverable: boolean;
}

export type CommandErrorCode =
  | 'NODE_NOT_FOUND'       // figma.getNodeById() returned null
  | 'FONT_LOAD_FAILED'     // Font loading timeout or fallback exhausted
  | 'EXPORT_FAILED'        // exportAsync() failed (node too large, corrupt, etc.)
  | 'INVALID_PARAMS'       // Zod validation passed but Figma API rejected params
  | 'PARENT_MISMATCH'      // Parent node can't accept children (not a frame)
  | 'IMAGE_DECODE_FAILED'  // Base64 decode or createImage() failed
  | 'TIMEOUT'              // Command exceeded time limit
  | 'UNKNOWN';             // Catch-all for unexpected errors
```

**Recoverability matrix:**

| Code | Recoverable | Retry Strategy |
|------|-------------|----------------|
| `NODE_NOT_FOUND` | No | Node was deleted or ID is wrong. Don't retry. |
| `FONT_LOAD_FAILED` | Yes | Font server may be slow. Retry once, then fallback to Inter. |
| `EXPORT_FAILED` | Yes | Transient Figma issue. Retry once. |
| `INVALID_PARAMS` | No | Caller error. Don't retry with same params. |
| `PARENT_MISMATCH` | No | Structural error. Don't retry. |
| `IMAGE_DECODE_FAILED` | No | Bad data. Don't retry with same payload. |
| `TIMEOUT` | Yes | Network/plugin slow. Retry with increased timeout. |
| `UNKNOWN` | No | Unpredictable. Log and surface to user. |

**WSResponse extension:**

```typescript
export interface WSResponse {
  type: 'response';
  id: string;
  channel: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;           // Keep for backward compat
  errorCode?: CommandErrorCode;  // NEW — structured code
  recoverable?: boolean;         // NEW — retry hint
}
```

**Migration path:** Existing handlers continue to work (plain `throw new Error()` maps to `code: 'UNKNOWN', recoverable: false`). New and updated handlers adopt structured errors progressively. The command queue uses `recoverable` to decide retry behavior.

### 7.3 Command Idempotency Guidance (ADR)

**Problem:** With WS reconnection + command queuing, a command sent before a disconnect may have been received and executed by the plugin but the response lost in transit. On reconnect, the queue replays the command, potentially creating duplicate frames/text/shapes on the canvas.

**Decision:** Commands are **NOT idempotent by default**. The queue must track acknowledged command IDs to avoid replay of completed commands.

**Implementation rules:**

1. **Command ID tracking:** The `FigmentoWSClient` maintains a `Set<string>` of acknowledged command IDs (received a response, regardless of success/failure). On reconnect, the queue only replays commands whose IDs are NOT in the acknowledged set.

2. **Queue lifecycle:**
   ```
   Command created → added to pendingCommands (existing Map)
                   → added to replayQueue (NEW)
   Response received → removed from pendingCommands (existing)
                     → added to acknowledgedIds (NEW)
                     → removed from replayQueue (NEW)
   Disconnect → pendingCommands timers cleared (existing)
              → replayQueue preserved
   Reconnect → replayQueue entries not in acknowledgedIds get resent
             → acknowledgedIds cleared after successful replay cycle
   ```

3. **Command categories by side-effect risk:**

   | Category | Commands | Replay Risk | Guidance |
   |----------|----------|-------------|----------|
   | **Create** (side-effecting) | `create_frame`, `create_text`, `create_rectangle`, `create_ellipse`, `create_image`, `create_design` | HIGH — duplicates elements | Queue must check acknowledgedIds before replay |
   | **Mutate** (idempotent) | `set_fill`, `set_stroke`, `set_effects`, `set_corner_radius`, `set_opacity`, `set_auto_layout`, `move_node`, `resize_node`, `rename_node` | LOW — same result if applied twice | Safe to replay, but unnecessary if acknowledged |
   | **Delete** (idempotent after first) | `delete_node` | LOW — second call returns NODE_NOT_FOUND | Safe to replay; plugin handles "not found" gracefully |
   | **Read** (no side-effects) | `get_selection`, `get_node_info`, `get_page_nodes`, `export_node` | NONE | Always safe to replay |
   | **Reparent** (idempotent) | `append_child` | LOW — already a child = no-op in Figma | Safe to replay |

4. **Maximum replay window:** Queue holds at most 50 unacknowledged commands. Older entries are dropped with a warning log. This prevents unbounded memory growth during extended disconnections.

5. **User notification:** If the queue drops commands, the MCP server returns an error to Claude Code: `"Connection lost. X commands were not delivered and could not be retried. You may need to verify the canvas state with get_page_nodes."`.

### 7.4 Critical Integration Rules

- **Existing API Compatibility:** All 24 MCP tool signatures are frozen. New tools use new names only.
- **Plugin Command Router:** New actions added as new `case` branches in `executeCommand()` switch — never modify existing cases.
- **Error Handling:** New handlers should use structured `CommandError` codes (Section 7.2). Existing handlers are migrated progressively — plain `throw new Error()` maps to `UNKNOWN`.
- **Logging Consistency:** Relay logs with `[Figmento Relay]` prefix. MCP server uses `[WS]` prefix. Maintain these conventions.

---

## 8. Testing Strategy

### 8.1 Current Test Infrastructure — IMPLEMENTED (S-24)

**Test Framework:** Jest 29.7 + ts-jest 29.4 in `figmento-mcp-server/`
**Test Location:** `figmento-mcp-server/tests/intelligence.test.ts`
**Test Runner:** `cd figmento-mcp-server && npm test`
**Coverage Requirements:** None enforced currently

**Current Test Suite (16 tests, all passing):**

| Test Group | Tests | What's Tested |
|-----------|-------|---------------|
| WCAG Contrast Check | 5 | Black/white ratio 21:1, same-color 1:1, AA threshold 4.5:1 boundary |
| Knowledge File Loading | 4 | All 4 YAML files load, have expected top-level keys, palettes have required fields |
| Size Preset Flattening | 2 | Nested social presets flatten with platform, direct array presets flatten correctly |
| Type Scale Computation | 2 | Major third computes correct sizes, golden ratio produces dramatic differences |
| Font Pairings | 1 | Mood filtering returns correct pairing (modern → Inter) |
| Color Palettes | 2 | Mood filtering finds tech palette, all hex values match `#[0-9A-Fa-f]{6}` |

### 8.2 Remaining Testing Opportunities

#### Integration Tests (S-25 — deferred)

- **Scope:** End-to-end command flow (MCP tool call → WS → plugin → response)
- **Existing System Verification:** Run all 36 tools after adding new ones to confirm no regressions
- **Blocker:** Requires running Figma plugin + relay simultaneously — needs headless test harness or mock

#### Additional Unit Tests (future)

- Image pipeline: base64 encoding, path validation, MIME detection
- WS client reconnection: backoff timing, queue management, heartbeat (requires mocking ws library)
- Template tools: placeholder detection (requires mocking Figma API)

#### Manual Testing

- **Visual verification in Figma:** Build all 3 components, start relay, load plugin, connect via Claude Code, test tools
- **Regression:** Call original 24 tools to confirm no signature/behavior changes

---

## 9. Security Integration

### 9.1 Existing Security Measures

**Authentication:** None — all local communication. Plugin uses Figma's auth context.
**Authorization:** Figma Plugin API scoped to current user's document permissions.
**Data Protection:** API keys stored in Figma `clientStorage` (encrypted by Figma) and `.env` (gitignored).
**Security Tools:** None formally configured.

### 9.2 Enhancement Security Requirements

**Implemented Security Measures:**
- **Path traversal prevention (S-02):** `place_generated_image` resolves and normalizes file paths, verifies they start with `IMAGE_OUTPUT_DIR` (env var, defaults to `cwd()/output`). Rejects any path outside the allowed directory.
- **Brand kit name sanitization (S-15):** `save_brand_kit` strips non-alphanumeric/hyphen characters from brand kit names before writing to disk.
- **Max WS payload (S-26):** Relay sets `maxPayload: 10MB` on `WebSocketServer` to prevent OOM from oversized base64 payloads.
- **YAML parsing:** Uses `js-yaml` default `load()` (safe schema). No use of `loadAll` or `UNSAFE_SCHEMA`.

**Compliance Requirements:** None (local development tool)

### 9.3 Security Testing

- **Existing Security Tests:** None
- **New Security Test Requirements:** Path traversal tests for image tool, YAML injection tests for brand kit CRUD
- **Penetration Testing:** Not applicable (local-only tool)

---

## 10. Architecture Checklist Results

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | All existing tools preserved unchanged | PASS | 24 original tools frozen, 12 new tools additive |
| 2 | No breaking protocol changes | PASS | WSResponse extended with optional `errorCode`/`recoverable` fields only |
| 3 | Build process compatible | PASS | Same esbuild pipeline, all 3 components build successfully |
| 4 | Deployment process unchanged | PASS | Same npm start, no new services |
| 5 | Error handling consistent | PASS | Error contract implemented (S-03): `classifyError()` + structured `CommandErrorCode` |
| 6 | Logging consistent | PASS | Prefix conventions maintained (`[Figmento Relay]`, `[WS]`) |
| 7 | Type safety maintained | PASS | Zod validation on all 36 tool inputs |
| 8 | File path security | PASS | S-02: `IMAGE_OUTPUT_DIR` path validation prevents traversal |
| 9 | Test coverage | PARTIAL | S-24: 16 unit tests for intelligence module. Integration tests deferred (S-25). |
| 10 | Reconnection resilience | PASS | S-04/S-05/S-06: exponential backoff, command queue, heartbeat |
| 11 | Command idempotency | PASS | `acknowledgedIds` Set prevents duplicate replay on reconnect |
| 12 | Shared code drift prevention | DEFERRED | S-22: extraction not triggered — no shared file modifications needed |
| 13 | Dual-plugin coexistence | PASS | Separate manifests, independent builds confirmed |
| 14 | Linting configured | PASS | S-23: ESLint + Prettier for MCP server and relay |
| 15 | WS payload limits | PASS | S-26: 10MB max payload on relay |

---

## 11. Implementation Roadmap

All 26 stories have been implemented across 6 milestones. S-22 (shared module extraction) was deferred as no shared files needed modification. S-25 (integration test harness) was partially implemented — unit tests are in place, but full end-to-end integration tests require a headless Figma test harness.

### Implementation Status

**Milestone 1: Image Pipeline** — COMPLETE

| Story | Title | Status | Component |
|-------|-------|--------|-----------|
| S-01 | Add `place_generated_image` MCP tool | ✅ DONE | MCP Server (`tools/canvas.ts`) |
| S-02 | Path validation for image pipeline | ✅ DONE | MCP Server (`tools/canvas.ts`) |

**Milestone 2: Connection Resilience** — COMPLETE

| Story | Title | Status | Component |
|-------|-------|--------|-----------|
| S-03 | Define `CommandError` type with error codes | ✅ DONE | Plugin + MCP Server + Relay types |
| S-04 | WS reconnection with exponential backoff | ✅ DONE | MCP Server (`ws-client.ts`) |
| S-05 | Command queue with idempotency tracking | ✅ DONE | MCP Server (`ws-client.ts`) |
| S-06 | WS heartbeat mechanism | ✅ DONE | MCP Server (`ws-client.ts`) |

**Milestone 3: Tool Organization** — COMPLETE

| Story | Title | Status | Component |
|-------|-------|--------|-----------|
| S-07 | Refactor `server.ts` into `tools/` modules | ✅ DONE | MCP Server (7 modules in `tools/`) |

**Milestone 4: Design Intelligence** — COMPLETE

| Story | Title | Status | Component |
|-------|-------|--------|-----------|
| S-08 | YAML query foundation + `get_size_preset` | ✅ DONE | MCP Server (`tools/intelligence.ts`) |
| S-09 | `get_font_pairing` — query by mood/style | ✅ DONE | MCP Server (`tools/intelligence.ts`) |
| S-10 | `get_type_scale` — compute from base + ratio | ✅ DONE | MCP Server (`tools/intelligence.ts`) |
| S-11 | `get_color_palette` — query by mood/keywords | ✅ DONE | MCP Server (`tools/intelligence.ts`) |
| S-12 | `get_contrast_check` — WCAG ratio calculation | ✅ DONE | MCP Server (`tools/intelligence.ts`) |
| S-13 | `get_spacing_scale` — 8px grid spacing values | ✅ DONE | MCP Server (`tools/intelligence.ts`) |
| S-14 | `get_layout_guide` — margins, columns, safe zones | ✅ DONE | MCP Server (`tools/intelligence.ts`) |
| S-15 | `get_brand_kit` + `save_brand_kit` — CRUD | ✅ DONE | MCP Server (`tools/intelligence.ts`) |

**Milestone 5: Remaining Design Tools** — COMPLETE

| Story | Title | Status | Component |
|-------|-------|--------|-----------|
| S-16 | Add `create_icon` tool (Lucide icons) | ✅ DONE | MCP Server (`tools/canvas.ts`) + Plugin |
| S-17 | Port `scan_template` tool | ✅ DONE | MCP Server (`tools/template.ts`) + Plugin |
| S-18 | Port `apply_template_text` tool | ✅ DONE | MCP Server (`tools/template.ts`) + Plugin |
| S-19 | Port `apply_template_image` tool | ✅ DONE | MCP Server (`tools/template.ts`) + Plugin |
| S-20 | Port `create_carousel` tool | ✅ DONE | MCP Server (`tools/template.ts`) |
| S-21 | Port `create_presentation` tool | ✅ DONE | MCP Server (`tools/template.ts`) |

**Milestone 6: Shared Code & Quality** — COMPLETE (S-22 deferred)

| Story | Title | Status | Component |
|-------|-------|--------|-----------|
| S-22 | Extract `packages/figmento-core/` shared module | ⏸️ DEFERRED | Not triggered — no shared files modified |
| S-23 | ESLint + Prettier config for MCP server + relay | ✅ DONE | MCP Server + Relay |
| S-24 | Unit tests for intelligence module | ✅ DONE | MCP Server (`tests/intelligence.test.ts`) |
| S-25 | Integration test harness (all tools) | ⚠️ PARTIAL | 16 unit tests passing; full integration deferred |
| S-26 | Max payload limit on WS relay | ✅ DONE | Relay (`relay.ts`) |
| S-27 | `export_node_to_file` for self-evaluation pipeline | ✅ DONE | MCP Server (`tools/scene.ts`) |

### Summary

- **24/27 stories fully complete** (S-01 through S-21, S-23, S-24, S-26, S-27)
- **1 story deferred** (S-22 — shared module extraction, trigger condition never met)
- **1 story partial** (S-25 — unit tests done, integration tests need headless Figma harness)
- **Total MCP tools:** 36 (24 original + 12 new)
- **All 3 components build successfully**
- **All 16 unit tests passing**

---

## 12. Future Enhancements

### 12.1 Remaining Work

| Item | Priority | Description |
|------|----------|-------------|
| S-22: Shared module extraction | Low | Extract `packages/figmento-core/` when shared files (`element-creators.ts`, `color-utils.ts`, `svg-utils.ts`) need modification. Currently no drift — identical copies work fine. |
| S-25: Integration tests | Medium | Build a headless test harness that mocks the Figma plugin API to test the full MCP → WS → Plugin → Response pipeline without a running Figma instance. |
| Self-evaluation loop | Low | Auto-export after design creation, analyze screenshot, iterate (max 2-3 passes). Requires `export_node` + image analysis integration. |
| WS message chunking | Low | For payloads approaching the 10MB limit, implement chunked transfer with reassembly. Currently not needed — largest payloads are base64 images well under 10MB. |

### 12.2 Adding New Tools (Developer Reference)

**Pattern for WS-routed tools (requires plugin handler):**
1. Define Zod schema in the appropriate `tools/*.ts` module
2. Add handler function in `figmento-plugin/src/code.ts`
3. Add case to `executeCommand()` switch
4. Use `CommandError` codes for structured error reporting
5. Register in `server.ts` via the module's `registerXTools()` function

**Pattern for server-side-only tools (no WS/plugin):**
1. Add tool in the appropriate `tools/*.ts` module
2. Load data with `loadKnowledge()` or compute directly
3. Return structured JSON — no `sendDesignCommand()` needed

**Key files:**
- `figmento-mcp-server/src/tools/` — 7 modules: connection, canvas, style, scene, batch, intelligence, template
- `figmento-mcp-server/src/server.ts` — tool registration hub (~30 lines)
- `figmento-plugin/src/code.ts` — command router + handler functions
- `figmento-mcp-server/src/ws-client.ts` — WS client with reconnection, queue, heartbeat

**Critical rules:**
- Never modify the signature or behavior of existing 36 tools
- All new WS commands must use structured `CommandError` codes
- All new tool inputs must have Zod validation schemas
- Test new intelligence tools with `npm test` in `figmento-mcp-server/`

---

*— Architecture document v1.3 — All milestones 1-6 implemented (24/27 stories complete, 1 deferred, 2 partial)*
