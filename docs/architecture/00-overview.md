# Figmento — Architecture Overview

> Quick-load linking document for agents. Each section below links to a self-contained doc.

## System Map

```
┌──────────────┐   stdio    ┌──────────────────┐   WS    ┌──────────────┐  postMessage  ┌──────────────────┐
│ Claude Code  │ ◄────────► │ figmento-mcp-    │ ◄─────► │ figmento-ws- │ ◄───────────► │ figmento-plugin  │
│ (AI client)  │   MCP      │ server           │  :3055  │ relay        │   (UI iframe) │ (Figma sandbox)  │
└──────────────┘            └──────────────────┘         └──────────────┘               └──────────────────┘
                                                                                               │
                                                                                        Figma Plugin API
                                                                                               │
                                                         ┌──────────────────────────────────────┘
                                                         │  figmento/ (original standalone plugin)
                                                         │  Runs independently — direct AI chat in-plugin
                                                         └──────────────────────────────────────
```

## Component Docs

| # | Doc | Scope | When to load |
|---|-----|-------|--------------|
| [01](01-shared-core.md) | Shared Core | `element-creators.ts`, `color-utils.ts`, `svg-utils.ts`, core types | Working on rendering logic shared by both plugins |
| [02](02-figmento-original.md) | Figmento (Original) | `figmento/` — standalone AI plugin | Working on the original plugin's UI, modes, or AI chat |
| [03](03-figmento-mcp-plugin.md) | Figmento MCP Plugin | `figmento-plugin/` — thin WS executor | Working on the MCP-driven Figma plugin |
| [04](04-figmento-mcp-server.md) | Figmento MCP Server | `figmento-mcp-server/` — MCP↔WS bridge | Working on MCP tools or WS client |
| [05](05-figmento-ws-relay.md) | Figmento WS Relay | `figmento-ws-relay/` — channel router | Working on the relay server |
| [06](06-figma-constraints.md) | Figma Constraints | Sandbox, fonts, images, manifests, builds | Debugging Figma API issues or build problems |

## Shared Code Location (Duplicated Today)

These 4 files exist in both `figmento/src/` and `figmento-plugin/src/` with near-identical code:

| File | Lines | Purpose |
|------|-------|---------|
| `element-creators.ts` | ~649 | Element factory — creates Figma nodes from UIElement schema |
| `color-utils.ts` | ~101 | Hex↔RGB, font style mapping, contrast checking |
| `svg-utils.ts` | ~388 | SVG path parsing, normalization, arc→bezier conversion |
| `types.ts` (core subset) | ~93 | `UIElement`, `UIAnalysis`, `Fill`, `Stroke`, `ShadowEffect`, `TextSegment`, `TextProperties` |

**Drift risk:** Changes to one copy don't propagate. Planned extraction into `packages/figmento-core/` (see [architecture.md](architecture.md) §1.2).

## Protocol Flow (MCP Path)

```
1. Claude Code calls MCP tool (e.g., create_frame)
2. figmento-mcp-server validates input (Zod), wraps as WSCommand
3. WSCommand sent to figmento-ws-relay over WS (channel "figmento")
4. Relay forwards to all other channel members (the plugin's UI iframe)
5. Plugin UI receives, posts to sandbox via figma.ui.onmessage
6. Sandbox executes Figma API call, returns WSResponse
7. Response flows back: sandbox → UI → relay → MCP server → Claude Code
```

## Key Types (Cross-Component)

```typescript
// WS protocol (used by MCP server, relay, and plugin)
interface WSCommand { type: 'command'; id: string; channel: string; action: string; params: Record<string, unknown> }
interface WSResponse { type: 'response'; id: string; channel: string; success: boolean; data?: Record<string, unknown>; error?: string }

// Design schema (used by both plugins)
interface UIElement { id: string; type: 'frame'|'rectangle'|'text'|'image'|'button'|'input'|'icon'|'ellipse'|'card'; name: string; width: number; height: number; /* + fills, stroke, effects, text, children, layout props */ }
interface UIAnalysis { width: number; height: number; backgroundColor: string; elements: UIElement[] }
```

## Build Commands

| Component | Dev | Build | Entry |
|-----------|-----|-------|-------|
| `figmento/` | `npm run watch` | `npm run build` | esbuild → `dist/code.js` + `dist/ui.html` |
| `figmento-plugin/` | `npm run watch` | `npm run build` | esbuild → `dist/code.js` + `dist/ui.html` |
| `figmento-mcp-server/` | `npm run dev` | `npm run build` | esbuild → `dist/index.js` (CLI binary) |
| `figmento-ws-relay/` | `npm run dev` | `npm run build` | esbuild → `dist/index.js` |

## Quick Start (Local Development)

```bash
# 1. Start relay
cd figmento-ws-relay && npm run dev     # ws://localhost:3055

# 2. Start MCP server (auto-started by Claude Code via claude_desktop_config.json)
# Or manually: cd figmento-mcp-server && npm run dev

# 3. Load plugin in Figma
# figmento-plugin/ → Import from manifest.json in Figma Dev Mode

# 4. Connect: Claude Code calls connect_to_figma tool
```
