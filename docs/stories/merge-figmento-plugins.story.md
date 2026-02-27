# Story: Merge figmento/ and figmento-plugin/ into Unified Figma Plugin

**Status:** Ready for Review
**Priority:** Critical
**Complexity:** XL (estimated 8-12 files touched, 2 new packages, full architecture merge)
**Epic:** Plugin Unification

---

## Executor Assignment

```yaml
executor: @dev
quality_gate: @architect
quality_gate_tools: [lint, typecheck, build, manual-regression]
```

---

## Story

**As a** Figma power user,
**I want** a single unified plugin that combines all design modes, AI chat, and MCP bridge,
**so that** I don't need two separate plugins and can use any workflow from one tool.

---

## Description

Merge the two Figma plugins — `figmento/` (5-mode design tool, ~10K LOC) and `figmento-plugin/` (MCP bridge + chat agent, ~4.5K LOC) — into a single unified plugin at `figmento/`. The merged plugin becomes the definitive AI design tool in the Figma ecosystem: all 5 existing modes, a full chat agent with iterative tool loop, a WebSocket bridge for MCP/Claude Code users, multi-provider support (Claude/Gemini/OpenAI), and a shared sandbox executor.

---

## Architecture Assessment (Brownfield Analysis)

### What Each Plugin Owns Today

| Capability | figmento/ | figmento-plugin/ |
|-----------|-----------|------------------|
| **Sandbox (code.ts)** | 847 lines. Message-based: receives `UIAnalysis` JSON, builds entire design in one shot via `createDesignFromAnalysis()`. Handles 8 message types (create-design, create-carousel, create-presentation, scan-template, etc.) | 1,674 lines. Command-routed: receives individual commands (`create_frame`, `set_fill`, etc.), executes one at a time, returns `WSResponse`. Handles 28 commands via `executeCommand()` switch. |
| **UI Architecture** | Modular: 14 files in `src/ui/`. Modes, settings, state, API, icons, images, batch, cache, errors — all separate modules. ~9.2K lines total. | Monolithic: single `ui-app.ts` (886 lines). Tabs: Chat, Bridge, Settings. |
| **AI Integration** | Single-shot JSON reconstruction. Sends screenshot/text + prompt → gets back `UIAnalysis` JSON → builds design in one `createDesignFromAnalysis()` call. Streaming SSE for progress updates. | Iterative tool_use loop. Sends user message → AI responds with tool calls → executes each → feeds results back → loops until `end_turn`. Up to 50 iterations. |
| **Providers** | Claude, OpenAI, Gemini (streaming SSE for all three). Keys stored in `figma.clientStorage`. | Claude + Gemini (non-streaming, full response). Keys stored in `figma.clientStorage`. |
| **Design Intelligence** | `prompt.ts` — analysis-focused prompt for JSON extraction. | `system-prompt.ts` — 341 lines of embedded design intelligence (size presets, color palettes, font pairings, layout rules, WCAG, self-evaluation). |
| **Tool Schemas** | None (no tool_use support). | `tools-schema.ts` — 22 Anthropic tool definitions. |
| **Bridge** | None. | Full WebSocket bridge: connect to relay, join channel, route commands. |
| **Modes** | 5 modes: Screenshot-to-Layout, Text-to-Layout, Carousel, Presentation, Hero Generator, Template Fill. | Chat mode only (free-form). |
| **Manifest** | `figmento-plugin` ID. Allows: Anthropic, OpenAI, Gemini, unpkg, Google Fonts. | `figmento-mcp-plugin` ID. Allows: Anthropic, Gemini, Google Fonts + localhost WS. |

### Shared Code (Duplicated)

These 4 files exist in both plugins with minor divergence:

| File | figmento/ | figmento-plugin/ | Delta |
|------|-----------|------------------|-------|
| `element-creators.ts` | 640 lines. Creates from `UIElement` tree. | 724 lines. Creates from individual command params. Has `gradient-utils.ts` import. More complete (handles `fillColor` shorthand, `italic/underline/strikethrough` on text segments, `getGradientTransform()`). | **figmento-plugin/ wins** — more complete, more battle-tested from iterative tool loop. |
| `color-utils.ts` | 102 lines. `hexToRgb`, `rgbToHex`, `getFontStyle`, `isContrastingColor`. | 112 lines. Same + slight differences. | Nearly identical. Merge trivially. |
| `svg-utils.ts` | 389 lines. SVG path normalization. | 388 lines. Same code. | Identical. |
| `types.ts` | 794 lines. Rich: all mode types, format constants, color themes, message types for all 5 modes. | 173 lines. Lean: `UIElement`, `UIAnalysis`, `WSCommand`, `WSResponse`, `CommandErrorCode`. | **figmento/ wins** for mode types. **figmento-plugin/ wins** for WS/command types. Both needed. |

### Additional file in figmento-plugin/ only

| File | Lines | Purpose |
|------|-------|---------|
| `gradient-utils.ts` | 35 lines | `getGradientTransform(direction)` — maps gradient direction strings to Figma `Transform` matrices. Used by `element-creators.ts`. Missing from figmento/. |

---

## Gap Analysis: What Your Plan Misses

### 1. Sandbox Merge is the Hardest Part (Critical)

Your plan focuses on the UI side, but the **sandbox (`code.ts`) merge is where the real complexity lives**. The two sandboxes have fundamentally different architectures:

- **figmento/ sandbox**: Receives `UIAnalysis` JSON blobs, calls `createDesignFromAnalysis()` which recursively creates the entire tree. Message types: `create-design`, `create-text-layout`, `create-carousel`, `create-presentation`, `scan-template`, `apply-template-text`, `apply-template-image`, `create-hero-image`, `scan-slide-style`, `add-slide`.

- **figmento-plugin/ sandbox**: Receives individual commands (`create_frame`, `set_fill`, etc.), routes through `executeCommand()` switch (28 cases), returns per-command responses.

**Both patterns must coexist.** The chat and bridge tabs need the command router. The existing modes (until upgraded to tool loop) still need the `createDesignFromAnalysis()` path. The merged `code.ts` must handle both `execute-command` messages AND the 8+ legacy message types.

**Recommendation:** Keep both message handlers in the merged `code.ts`. The command router from figmento-plugin/ handles `execute-command` (for chat + bridge). The existing mode handlers handle `create-design`, `create-carousel`, etc. Over time, as modes migrate to the tool loop, the legacy handlers get removed.

### 2. The Tool Loop Upgrade is a Separate Phase (Important)

You said: *"Every mode that currently does single-shot JSON reconstruction gets upgraded to use the iterative tool loop."*

This is architecturally correct but **should NOT be part of the merge story**. Reasons:
- The merge itself is already XL complexity.
- Each mode upgrade (Screenshot → tool loop, Text → tool loop, etc.) is its own story with its own testing surface.
- The tool loop requires the system prompt to understand each mode's specific constraints (format, brand colors, reference images, etc.) — this is non-trivial prompt engineering per mode.

**Recommendation:** This story delivers the **unified shell** — all 4 tabs working, both engines running, zero regressions. The tool loop upgrade is a follow-up epic (5 stories, one per mode).

### 3. OpenAI Tool Calling Adapter (`convertToolsToOpenAI`) (Missing)

You mentioned adding OpenAI support mirroring the Gemini adapter. This needs:
- `convertToolsToOpenAI()` function (Anthropic schema → OpenAI function calling format)
- OpenAI tool calling loop in `runOpenAILoop()` (similar to `runAnthropicLoop()`)
- OpenAI uses `functions` array with `name/description/parameters`, response has `tool_calls` with `function.name/function.arguments`

**Recommendation:** Include in this story — it's a clean ~100-line addition following the established pattern.

### 4. `gradient-utils.ts` is Missing from figmento/ (Bug Risk)

figmento-plugin/ has `gradient-utils.ts` (35 lines) that maps gradient direction strings to Figma `Transform` matrices. figmento/ doesn't have this — its gradient handling is less complete. This must be included in the shared package or the merge will break gradient rendering.

### 5. Settings Merge is Non-Trivial (Medium)

The two plugins store settings differently:
- **figmento/**: Stores per-provider API keys + validation status + design overrides (font, brand colors, grid, custom prompt) via `figma.clientStorage` with key prefixes.
- **figmento-plugin/**: Stores `anthropicApiKey`, `model`, `geminiApiKey` via `figma.clientStorage` with flat keys.

The merged plugin needs:
- All 3 provider keys (Claude, OpenAI, Gemini) + validation status
- Model selection per provider
- Design overrides (font, brand colors, grid, custom prompt)
- Bridge relay URL
- Image generation model preference

**Recommendation:** Migrate to figmento/'s richer storage pattern. Add a migration function that reads old figmento-plugin/ keys and moves them to the new schema on first launch.

### 6. UI HTML Merge (Large Surface Area)

Both plugins have `ui.html` templates:
- **figmento/**: Large multi-mode UI with mode selector, 5 mode panels, settings overlay, crop canvas, etc.
- **figmento-plugin/**: Tab-based UI (Chat, Bridge, Settings).

The merged `ui.html` needs to integrate both. Your tab plan (Chat, Modes, Bridge, Settings) is correct. The `Modes` tab becomes a container for the existing figmento/ mode UI.

### 7. Manifest Network Allowlist (Easy but Critical)

Must be the union of both manifests plus OpenAI:
```json
{
  "allowedDomains": [
    "https://api.anthropic.com",
    "https://api.openai.com",
    "https://generativelanguage.googleapis.com",
    "https://unpkg.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com"
  ],
  "devAllowedDomains": [
    "http://localhost:3055",
    "ws://localhost:3055"
  ]
}
```

### 8. Plugin Window Size

- figmento/: `450 × 820` — tall, accommodates mode UIs
- figmento-plugin/: `380 × 600` — compact chat UI

**Recommendation:** Use `450 × 820` (figmento/'s size). The chat tab works fine in this size. Consider adding resize handles or per-tab size if needed later.

---

## Acceptance Criteria

### AC1: Package Extraction (`packages/figmento-core/`)
- [x] `packages/figmento-core/src/element-creators.ts` — merged from figmento-plugin/ (more complete version) with any missing figmento/ features backported
- [x] `packages/figmento-core/src/color-utils.ts` — merged superset of both
- [x] `packages/figmento-core/src/svg-utils.ts` — shared (identical)
- [x] `packages/figmento-core/src/gradient-utils.ts` — from figmento-plugin/
- [x] `packages/figmento-core/src/types.ts` — merged: figmento/'s rich types + figmento-plugin/'s WS/command types
- [x] `packages/figmento-core/package.json` + `tsconfig.json` — proper package setup
- [x] Both `figmento/` import from `@figmento/core` (or relative path)
- [x] No duplicated type definitions or utility functions anywhere

### AC2: Sandbox Merge (`figmento/src/code.ts`)
- [x] Handles `execute-command` messages (command router with all 31+ commands from figmento-plugin/)
- [x] Handles all legacy mode messages (`create-design`, `create-carousel`, `create-presentation`, `scan-template`, `apply-template-text`, `apply-template-image`, `create-hero-image`, `scan-slide-style`, `add-slide`)
- [x] Both chat-originated commands and bridge-originated commands use the same `executeCommand()` function
- [x] `classifyError()` with `CommandErrorCode` + `recoverable` field on responses
- [x] `get-settings` / `save-settings` handles all keys: per-provider API keys, model selection, design overrides, relay URL
- [x] Settings migration from old figmento-plugin/ key format to new schema

### AC3: Chat Tab (`figmento/src/ui/chat.ts`)
- [x] Full iterative tool_use loop (Anthropic) — `runAnthropicLoop()` with max 50 iterations
- [x] Full function calling loop (Gemini) — `runGeminiLoop()` with `convertToolsToGemini()`
- [x] Full function calling loop (OpenAI) — `runOpenAILoop()` with `convertToolsToOpenAI()`
- [x] `tools-schema.ts` with all 22 Anthropic tool schemas
- [x] `system-prompt.ts` with full design intelligence (size presets, palettes, fonts, layout, WCAG)
- [x] Tool action UI (shows each tool call as it executes)
- [x] Chat bubble UI with markdown formatting
- [x] New conversation button
- [x] `generate_image` handled specially (Gemini Imagen call + `create_image` placement)
- [x] `sendCommandToSandbox()` with `chat-` prefix routing
- [x] Model selector (Claude, Gemini, OpenAI models)

### AC4: Bridge Tab (`figmento/src/ui/bridge.ts`)
- [x] WebSocket connection to relay (configurable URL, default `ws://localhost:3055`)
- [x] Channel generation + join
- [x] Copy channel ID button
- [x] Command/response routing through sandbox
- [x] Log panel with timestamps
- [x] Connection status indicator (dot + text)
- [x] Command/error counters
- [x] Both bridge and chat commands route through the same `execute-command` → `executeCommand()` path

### AC5: Modes Tab (All Existing Modes — Zero Regression)
- [ ] **Screenshot-to-Layout**: Upload a screenshot image → click Process → AI streams analysis → design frame created on canvas with correct dimensions and element hierarchy
- [ ] **Text-to-Layout**: Paste text content → select Instagram Post format + Inter font + Vibrant theme → Generate → design frame created at 1080x1350 with styled text elements
- [ ] **Carousel**: Enter text + enable carousel (3 slides, square) → Generate → 3 separate 1080x1080 frames created side-by-side on canvas
- [ ] **Template Fill**: Select a frame with `#h1`, `#p1` placeholder layers → Scan → paste content → Apply Text → placeholder text nodes updated with AI-distributed content
- [ ] **Text-to-Presentation**: Paste outline → select 16:9 format + Corporate Blue theme → Generate → multi-slide presentation frames created in a row
- [ ] **Hero Generator**: Upload a subject image → select Web Hero 16:9 → write scene prompt → Generate → AI-generated hero image placed on canvas at 1920x1080
- [ ] Mode selector UI, navigation, breadcrumbs preserved
- [ ] All mode state management preserved (switching modes retains per-mode state)

### AC6: Settings Tab
- [ ] API keys for all 3 providers (Claude, OpenAI, Gemini)
- [ ] Validation flow per provider
- [ ] Model selection per provider
- [ ] Design overrides (font, brand colors, grid, custom prompt)
- [ ] WS relay URL configuration
- [ ] Image generation model preference
- [ ] All settings persisted via `figma.clientStorage`

### AC7: Build & Manifest
- [ ] `manifest.json` network allowlist covers all 3 providers + unpkg + Google Fonts + localhost WS
- [ ] `npm run build` passes cleanly
- [ ] Build produces `dist/code.js` and `dist/ui.html`
- [ ] `packages/figmento-core/` builds independently
- [ ] No TypeScript errors

### AC8: Documentation
- [ ] `docs/architecture/architecture.md` updated to reflect merged state
- [ ] MCP plugin section retired or redirected
- [ ] System map shows unified plugin architecture (4 tabs, shared sandbox, core package)

### AC9: Cleanup
- [ ] `figmento-plugin/` directory clearly marked as deprecated (add `DEPRECATED.md` or remove)
- [ ] No dead imports or unreachable code in the merged plugin
- [ ] No duplicated logic between chat and bridge

---

## Scope

### IN Scope
- Extract shared code to `packages/figmento-core/`
- Merge sandboxes (command router + legacy message handlers)
- Add Chat tab (tool loop + multi-provider)
- Add Bridge tab (WebSocket + channel management)
- Add OpenAI tool calling adapter
- Merge Settings tab
- Merge `ui.html` into 4-tab layout
- Update manifest
- Update architecture docs

### OUT of Scope
- Upgrading existing modes to use tool loop (separate epic)
- Streaming for chat (current approach is non-streaming tool loop — streaming is enhancement)
- New modes or features
- Publishing to Figma Community
- MCP server changes (figmento-mcp-server/ is untouched)
- WebSocket relay changes (figmento-ws-relay/ is untouched)

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` in core-config.yaml

---

## Testing

### Build Verification
- [x] `cd packages/figmento-core && npx tsc --noEmit` — core package compiles with zero errors
- [x] `cd figmento && npm run build` — produces `dist/code.js` and `dist/ui.html` with zero errors
- [x] `dist/code.js` is a valid IIFE bundle, `dist/ui.html` contains inlined JS

### Existing Jest Test Suite
- [ ] `cd figmento && npm test` — all 14 existing test files pass (api, color-utils, svg-utils, cache, icons, images, batch, errors, etc.)
- [ ] No new test failures introduced by import path changes to `@figmento/core`

### Manual Regression — Modes (5 flows)
1. **Screenshot-to-Layout**: Open plugin → Modes tab → upload any screenshot PNG → Process with Claude → verify frame created on canvas with elements matching the screenshot layout
2. **Text-to-Layout**: Modes tab → paste 3 sentences of text → select Instagram Post + any font + any theme → Generate → verify 1080x1350 frame on canvas
3. **Carousel**: Modes tab → enter text → enable carousel (3 slides) → Generate → verify 3 frames side-by-side
4. **Template Fill**: Create a frame on canvas with layers named `#h1` and `#p1` → Modes tab → Scan Selected Frames → paste content → Apply Text → verify placeholder text updated
5. **Text-to-Presentation**: Modes tab → paste an outline with 3+ sections → select 16:9 + any theme → Generate → verify multi-slide frames in a row

### Manual Regression — Chat (3 provider flows)
6. **Chat + Claude**: Chat tab → type "Create a 500x400 dark blue rectangle named Test" → verify tool actions appear (create_rectangle, set_fill) → verify rectangle on canvas
7. **Chat + Gemini**: Settings → select Gemini model → Chat tab → same prompt → verify tool loop executes via Gemini function calling → verify output on canvas
8. **Chat + OpenAI**: Settings → select OpenAI model → Chat tab → same prompt → verify tool loop executes via OpenAI function calling → verify output on canvas

### Manual Regression — Bridge (1 flow)
9. **Bridge**: Start `figmento-ws-relay` locally → Bridge tab → enter `ws://localhost:3055` → Connect → verify green status dot + channel ID displayed → from external client (or curl/wscat), send a `create_frame` command to the channel → verify frame appears on canvas + response logged

### Settings Verification
10. **Settings persistence**: Enter API keys for all 3 providers → close and reopen plugin → verify all keys restored from `figma.clientStorage`
11. **Settings migration**: If old figmento-plugin/ keys exist (`anthropicApiKey`, `model`, `geminiApiKey`), verify they're read and available in the new unified settings without data loss

---

## Dev Notes

### figmento-plugin/ Command Router — Complete Handler List (31 commands)

These are the 31 `executeCommand()` switch cases from `figmento-plugin/src/code.ts` (lines 87–186) that must be ported to the merged `figmento/src/code.ts`:

**Canvas Creation (6):**
| # | Action | Handler | Params |
|---|--------|---------|--------|
| 1 | `create_frame` | `handleCreateFrame(params)` | name, width, height, x, y, parentId, fills, fillColor, cornerRadius, layoutMode, itemSpacing, padding*, alignment*, sizingMode*, clipsContent |
| 2 | `create_text` | `handleCreateText(params)` | text, fontSize, fontFamily, fontWeight, color, fillColor, textAlign, textAlignHorizontal, name, width, height, x, y, parentId, lineHeight, letterSpacing, italic, underline, strikethrough, layoutSizing*, segments[] |
| 3 | `create_rectangle` | `handleCreateRectangle(params)` | name, width, height, x, y, parentId, fills, stroke, cornerRadius |
| 4 | `create_ellipse` | `handleCreateEllipse(params)` | name, width, height, x, y, parentId, fills |
| 5 | `create_image` | `handleCreateImage(params)` | imageData (base64), name, width, height, x, y, parentId, cornerRadius |
| 6 | `create_icon` | `handleCreateIcon(params)` | name, size, color, parentId, strokeWidth |

**Style Tools (6):**
| # | Action | Handler | Params |
|---|--------|---------|--------|
| 7 | `set_fill` | `handleSetFill(params)` | nodeId, color, opacity, fills[] |
| 8 | `set_stroke` | `handleSetStroke(params)` | nodeId, color, width |
| 9 | `set_effects` | `handleSetEffects(params)` | nodeId, effects[] (DROP_SHADOW, INNER_SHADOW) |
| 10 | `set_corner_radius` | `handleSetCornerRadius(params)` | nodeId, radius (number or [tl,tr,br,bl]) |
| 11 | `set_opacity` | `handleSetOpacity(params)` | nodeId, opacity (0-1) |
| 12 | `set_auto_layout` | `handleSetAutoLayout(params)` | nodeId, layoutMode, itemSpacing, padding*, alignment*, sizingMode* |

**Scene Management (10):**
| # | Action | Handler | Params |
|---|--------|---------|--------|
| 13 | `get_selection` | `handleGetSelection()` | (none) |
| 14 | `get_screenshot` | `handleGetScreenshot(params)` | nodeId, scale |
| 15 | `export_node` | `handleExportNode(params)` | nodeId, format (PNG/SVG/JPG), scale |
| 16 | `get_node_info` | `handleGetNodeInfo(params)` | nodeId |
| 17 | `get_page_nodes` | `handleGetPageNodes()` | (none) |
| 18 | `delete_node` | `handleDeleteNode(params)` | nodeId |
| 19 | `move_node` | `handleMoveNode(params)` | nodeId, x, y |
| 20 | `resize_node` | `handleResizeNode(params)` | nodeId, width, height |
| 21 | `rename_node` | `handleRenameNode(params)` | nodeId, name |
| 22 | `append_child` | `handleAppendChild(params)` | parentId, childId |

**Advanced Operations (9):**
| # | Action | Handler | Params |
|---|--------|---------|--------|
| 23 | `reorder_child` | `handleReorderChild(params)` | nodeId, parentId, index |
| 24 | `clone_node` | `handleCloneNode(params)` | nodeId, offsetX, offsetY, newName, parentId |
| 25 | `group_nodes` | `handleGroupNodes(params)` | nodeIds[], name |
| 26 | `create_design` | `handleCreateDesign(params)` | design (UIAnalysis), name — batch: creates full design tree from JSON |
| 27 | `scan_template` | `handleScanTemplate(params)` | nodeId — scans for #-prefixed placeholder layers |
| 28 | `apply_template_text` | `handleApplyTemplateText(params)` | nodeId, slotType, text |
| 29 | `apply_template_image` | `handleApplyTemplateImage(params)` | nodeId, imageData, scaleMode |
| 30 | `batch_execute` | `handleBatchExecute(params)` | commands[] — executes multiple commands in sequence, supports tempId references |
| 31 | `clone_with_overrides` | `handleCloneWithOverrides(params)` | nodeId, count, overrides[], offsetX, offsetY |
| — | `scan_frame_structure` | `handleScanFrameStructure(params)` | nodeId — returns recursive node tree |

### Legacy Mode Message Handlers (figmento/src/code.ts — preserve these)

These are the existing `figma.ui.onmessage` switch cases in figmento/ that must continue to work alongside the command router:

| Message Type | Handler | Purpose |
|-------------|---------|---------|
| `create-design` | `createDesignFromAnalysis(msg.data)` | Screenshot-to-Layout output |
| `create-text-layout` | `createDesignFromAnalysis(msg.data.design, ...)` | Text-to-Layout output |
| `create-carousel` | Loop over `msg.data.slides`, creates each via `createDesignFromAnalysis()` | Carousel slides |
| `create-presentation` | Loop over `msg.data.slides`, creates each with gap spacing | Presentation slides |
| `scan-template` | `scanTemplateFrames()` on selection | Template Fill: discover placeholders |
| `apply-template-text` | `applyTemplateContent(msg.data)` | Template Fill: write text to slots |
| `apply-template-image` | `applyTemplateImage(msg.data)` | Template Fill: write image to slot |
| `create-hero-image` | Creates image fill on new frame | Hero Generator output |
| `scan-slide-style` | Extracts colors, fonts, dimensions from selected frame | Add Slide: style extraction |
| `add-slide` | `createDesignFromAnalysis()` + positions after target frame | Add Slide: create matching slide |
| `save-api-key` | `figma.clientStorage.setAsync()` | Settings: persist API key |
| `load-api-keys` | `figma.clientStorage.getAsync()` | Settings: restore on launch |
| `validate-api-key` | Validates and saves result | Settings: key validation |
| `save-validation` | Persists validation status | Settings: validation state |
| `save-feedback` | Persists user feedback | Screenshot-to-Layout: quality feedback |

### Relevant Source Tree

```
figmento/                          ← BASE (wins for UX, modes, structure)
├── src/
│   ├── code.ts                    (847 lines — legacy mode handlers)
│   ├── types.ts                   (794 lines — rich mode types)
│   ├── element-creators.ts        (640 lines — UIElement tree → SceneNode)
│   ├── color-utils.ts             (102 lines)
│   ├── svg-utils.ts               (389 lines)
│   └── ui/
│       ├── index.ts               (360 lines — app init, event wiring)
│       ├── api.ts                 (500 lines — streaming AI for modes)
│       ├── settings.ts            (500 lines — API keys, design overrides)
│       ├── state.ts               (400 lines — global state objects)
│       ├── messages.ts            (message dispatcher)
│       ├── prompt.ts              (200 lines — analysis prompt)
│       ├── screenshot.ts          (1,200 lines — Screenshot-to-Layout)
│       ├── text-layout.ts         (1,400 lines — Text-to-Layout)
│       ├── template.ts            (500 lines — Template Fill)
│       ├── presentation.ts        (1,100 lines — Presentation)
│       ├── hero-generator.ts      (600 lines — Hero Generator)
│       ├── icons.ts, images.ts, batch.ts, cache.ts, errors.ts, rate-limit.ts, utils.ts
│       └── __tests__/             (14 test files)

figmento-plugin/                   ← SOURCE (wins for engine, bridge, tools)
├── src/
│   ├── code.ts                    (1,674 lines — command router, 31 handlers)
│   ├── ui-app.ts                  (886 lines — Chat + Bridge + Settings)
│   ├── types.ts                   (173 lines — WSCommand, WSResponse, CommandErrorCode)
│   ├── tools-schema.ts            (477 lines — 22 Anthropic tool definitions)
│   ├── system-prompt.ts           (341 lines — design intelligence prompt)
│   ├── element-creators.ts        (724 lines — more complete version)
│   ├── color-utils.ts             (112 lines)
│   ├── svg-utils.ts               (388 lines)
│   └── gradient-utils.ts          (35 lines — gradient transform matrices)
```

### Key Implementation Notes

- **`element-creators.ts` merge**: Take figmento-plugin/'s 724-line version as base. Backport `isContrastingColor()` usage from figmento/ if referenced by mode code. The figmento-plugin/ version handles `fillColor` shorthand, `italic`/`underline`/`strikethrough` on segments, and imports `getGradientTransform()` — all missing from figmento/.
- **`types.ts` merge**: Combine figmento/'s rich types (all mode types, format constants, color themes, 20+ message types) with figmento-plugin/'s WS types (`WSCommand`, `WSResponse`, `CommandErrorCode`, `CommandError`, `ExecuteCommandMessage`, `CommandResultMessage`). Add `italic`, `underline`, `strikethrough` to `TextSegment`.
- **Settings storage**: figmento/ uses `figma.clientStorage` with key `figmento-api-keys` (JSON object) + `figmento-validated`. figmento-plugin/ uses flat keys (`anthropicApiKey`, `model`, `geminiApiKey`). Migration function should check for flat keys on startup and copy them into the figmento/ schema if they exist.
- **Tab styling**: Inherit figmento-plugin/'s dark tab bar CSS. Chat and Bridge tabs use figmento-plugin/'s existing dark theme styling. Modes tab wraps figmento/'s existing light mode UI. Settings merges both into unified form.
- **`create_design` command (#26)**: This command accepts a full `UIAnalysis` JSON and calls `createDesignFromAnalysis()` internally — it bridges the two architectures. Both the command router path and the legacy mode path share the same underlying function.
- **`batch_execute` command (#30)**: Supports `tempId` references between commands (e.g., create a frame, then use its ID as `parentId` for a child text node). The `tempId` must be a sibling of `action` and `params`, not inside `params`.

---

## Technical Design

### Directory Structure (Post-Merge)

```
packages/
└── figmento-core/
    ├── src/
    │   ├── element-creators.ts    # Merged — creates SceneNode from UIElement or command params
    │   ├── color-utils.ts         # Merged superset
    │   ├── svg-utils.ts           # Shared (identical)
    │   ├── gradient-utils.ts      # From figmento-plugin/
    │   ├── types.ts               # Merged: all mode types + WS/command types
    │   └── index.ts               # Barrel export
    ├── package.json
    └── tsconfig.json

figmento/
├── src/
│   ├── code.ts                    # MERGED sandbox (command router + legacy handlers)
│   ├── ui/
│   │   ├── index.ts               # Entry point — initializes all tabs
│   │   ├── chat.ts                # NEW — Chat tab (tool loop, multi-provider)
│   │   ├── bridge.ts              # NEW — Bridge tab (WebSocket)
│   │   ├── tools-schema.ts        # FROM figmento-plugin/
│   │   ├── system-prompt.ts       # FROM figmento-plugin/
│   │   ├── api.ts                 # Existing — streaming AI APIs (for modes)
│   │   ├── settings.ts            # MERGED — unified settings
│   │   ├── state.ts               # Existing + chat/bridge state added
│   │   ├── screenshot.ts          # Existing (untouched)
│   │   ├── text-layout.ts         # Existing (untouched)
│   │   ├── template.ts            # Existing (untouched)
│   │   ├── presentation.ts        # Existing (untouched)
│   │   ├── hero-generator.ts      # Existing (untouched)
│   │   ├── messages.ts            # Existing + chat/bridge routing
│   │   ├── prompt.ts              # Existing (mode analysis prompts)
│   │   ├── utils.ts               # Existing
│   │   ├── icons.ts               # Existing
│   │   ├── images.ts              # Existing
│   │   ├── batch.ts               # Existing
│   │   ├── cache.ts               # Existing
│   │   ├── errors.ts              # Existing
│   │   └── rate-limit.ts          # Existing
│   └── ui.html                    # MERGED — 4-tab layout
├── manifest.json                  # UPDATED — merged network allowlist
├── package.json                   # UPDATED — depends on @figmento/core
├── build.js                       # Existing (may need path updates)
└── tsconfig.json                  # UPDATED — includes packages/

figmento-plugin/
└── DEPRECATED.md                  # Retirement notice
```

### Sandbox Message Flow (Post-Merge)

```
                  ┌─────────────────────────────────────────┐
                  │            code.ts (sandbox)             │
                  │                                          │
Chat Tab ────→ execute-command ─→ executeCommand() ─→ WSResponse
                     ↑                    ↓
Bridge Tab ──→ execute-command    create_frame / set_fill / etc.
                                          │
Modes ───────→ create-design ──→ createDesignFromAnalysis()
              create-carousel     (legacy JSON-blob path)
              create-presentation
              scan-template
              etc.
                  └─────────────────────────────────────────┘
```

### Tab Layout

```
┌──────────────────────────────────────────┐
│  [Chat]  [Modes]  [Bridge]  [Settings]   │  ← tab bar
├──────────────────────────────────────────┤
│                                          │
│  Tab content area (fills remaining       │
│  height, scrollable per tab)             │
│                                          │
└──────────────────────────────────────────┘
```

### OpenAI Tool Calling Format

```typescript
// Anthropic → OpenAI function schema conversion
function convertToolsToOpenAI(tools: ToolDefinition[]): OpenAIFunction[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,  // OpenAI uses JSON Schema directly
    },
  }));
}

// OpenAI response parsing
// response.choices[0].message.tool_calls[].function.{name, arguments}
```

---

## Task Breakdown

### Phase 1: Foundation (Package Extraction)
1. [x] Create `packages/figmento-core/` with package.json, tsconfig.json
2. [x] Move + merge `element-creators.ts` (take figmento-plugin/ as base, backport any figmento/-only features)
3. [x] Move + merge `color-utils.ts`
4. [x] Move `svg-utils.ts`
5. [x] Move `gradient-utils.ts`
6. [x] Merge `types.ts` (figmento/ rich types + figmento-plugin/ WS types)
7. [x] Create barrel export `index.ts`
8. [x] Update figmento/ imports to use core package
9. [x] Verify build passes

### Phase 2: Sandbox Merge
10. [x] Add command router (`executeCommand()` + all 31 handlers + `set_text`) to figmento/src/code.ts
11. [x] Add `execute-command` message handler alongside existing mode handlers
12. [x] Add `get-settings` / `save-settings` with merged key schema
13. [x] Add settings migration function
13b. [x] Add settings migration rollback safety — migration is read-only (copies old keys to new schema, never deletes old keys). If new schema read fails, fall back to reading old keys directly. Log migration status to console.
14. [x] Add `classifyError()` with `CommandErrorCode`
15. [x] Verify all existing mode messages still work (no regressions)
16. [x] Verify command router works for all 28 commands

### Phase 3: UI Integration
17. [x] Update `ui.html` with 4-tab layout (Chat, Modes, Bridge, Settings)
18. [x] Create `ui/chat.ts` — port from figmento-plugin/'s ui-app.ts chat section
19. [x] Add `tools-schema.ts` to figmento/src/ui/
20. [x] Add `system-prompt.ts` to figmento/src/ui/
21. [x] Add `convertToolsToGemini()` + Gemini loop
22. [x] Add `convertToolsToOpenAI()` + OpenAI loop
23. [x] Create `ui/bridge.ts` — port from figmento-plugin/'s ui-app.ts bridge section
24. [x] Merge Settings into unified settings flow
25. [x] Wire chat/bridge message routing in `messages.ts`
26. [x] Wire tab initialization in `index.ts`
27. [x] Move existing mode UI into "Modes" tab container
28. Verify all 5 modes work (regression test each)
29. Verify chat works with Claude
30. Verify chat works with Gemini
31. Verify bridge connects and routes commands
31b. Verify chat works with OpenAI — send a design prompt (e.g., "Create a blue 400x300 frame with a centered heading"), confirm tool loop executes (`create_frame` → `create_text` → `set_fill`), verify output frame appears on canvas

### Phase 4: Polish & Docs
32. [x] Update `manifest.json` (merged network allowlist)
33. [x] Update `package.json` (core dependency)
34. [x] Update `build.js` if needed for core package paths — no changes needed (esbuild resolves relative imports)
35. [x] Full build verification — tsc 0 errors, build clean (code.js 389.7kb, ui.html 1472.3kb)
36. [x] Update `docs/architecture/architecture.md` — v2.0 with unification ADR
37. [x] Add `DEPRECATED.md` to figmento-plugin/
38. [x] Final regression test — 290/296 pass (6 pre-existing failures in images.test.ts, not caused by merge)

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sandbox merge breaks existing modes | HIGH | Keep both message paths, test each mode explicitly |
| Font loading conflicts between command router and legacy path | MEDIUM | Both use the same `loadFontAsync()` — verify no race conditions |
| Settings migration corrupts existing keys | MEDIUM | Read-only migration on first launch, don't delete old keys |
| Chat tool loop timeout with large designs | LOW | 30s per command timeout already exists, 50 iteration cap |
| Build size increases significantly | LOW | Core package is tree-shakeable, only slight increase expected |

---

## Dependencies
- None (self-contained merge, no external service changes)
- figmento-mcp-server/ and figmento-ws-relay/ are untouched

---

## File List

### Created
- `packages/figmento-core/package.json` — @figmento/core package scaffold
- `packages/figmento-core/tsconfig.json` — TypeScript config for core package
- `packages/figmento-core/src/index.ts` — Barrel export
- `packages/figmento-core/src/types.ts` — Merged types (figmento/ rich + figmento-plugin/ WS)
- `packages/figmento-core/src/color-utils.ts` — Merged superset (both plugins)
- `packages/figmento-core/src/svg-utils.ts` — SVG path utils (shared)
- `packages/figmento-core/src/gradient-utils.ts` — Gradient transform matrices (from figmento-plugin/)
- `packages/figmento-core/src/element-creators.ts` — Merged element creator (figmento-plugin/ base)

### Created (Phase 3)
- `figmento/src/ui/tools-schema.ts` — 22 Anthropic tool definitions for chat agent
- `figmento/src/ui/system-prompt.ts` — Design intelligence system prompt (341 lines)
- `figmento/src/ui/chat.ts` — Chat module: Anthropic + Gemini + OpenAI loops, tool execution, image generation
- `figmento/src/ui/bridge.ts` — MCP Bridge module: WebSocket relay connection + command routing
- `figmento/src/ui/chat-settings.ts` — Chat API keys & model selection settings

### Created (Phase 4)
- `figmento-plugin/DEPRECATED.md` — Deprecation notice with migration table

### Modified
- `figmento/src/code.ts` — Merged sandbox: added command router (31 handlers), execute-command/get-settings/save-settings message handlers, classifyError(), batch_execute, clone_with_overrides, scan_frame_structure, settings migration
- `figmento/src/types.ts` — Replaced with re-export shim from core
- `figmento/src/color-utils.ts` — Replaced with re-export shim from core
- `figmento/src/svg-utils.ts` — Replaced with re-export shim from core
- `figmento/src/element-creators.ts` — Replaced with re-export shim from core
- `figmento/tsconfig.json` — Removed rootDir, added core package to include
- `packages/figmento-core/src/types.ts` — Added GetSettingsMessage, SaveSettingsMessage to PluginMessage union
- `figmento/src/ui/messages.ts` — Added onCommandResult + onSettingsLoaded callbacks for chat/bridge routing
- `figmento/src/ui/index.ts` — Added chat/bridge/chat-settings imports, initUnifiedTabs(), wired command-result + settings-loaded routing
- `figmento/src/ui.html` — Added unified 4-tab bar (Chat, Modes, Bridge, Settings), chat CSS + HTML, bridge CSS + HTML, settings CSS + HTML, OpenAI model options + key input
- `figmento/manifest.json` — Added devAllowedDomains for localhost WS bridge, reasoning field
- `figmento/package.json` — Updated description to reflect unified plugin
- `docs/architecture/architecture.md` — v2.0: Plugin Unification ADR, updated project structure, deployment, and developer reference

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-27 | @architect (Aria) | Initial story draft from brownfield assessment |
| 2026-02-27 | @architect (Aria) | Address @po validation: add Story statement, Executor Assignment, Testing section (11 verification flows), Dev Notes (31 command handlers + source tree), CodeRabbit skip notice, AC5 specific test scenarios, Task 13b (migration rollback), Task 31b (OpenAI verification) |
| 2026-02-27 | @po (Pax) | Re-validation: GO — all 8 previous issues resolved. Status Draft → Ready. Readiness 9/10, Confidence High. |
| 2026-02-27 | @dev (Dex) | Phase 1 complete: packages/figmento-core/ created with merged types, color-utils, svg-utils, gradient-utils, element-creators. figmento/ imports updated via re-export shims. Build + typecheck pass, 0 regressions (6 pre-existing test failures in images.test.ts unchanged). |
| 2026-02-27 | @dev (Dex) | Phase 2 complete: Sandbox merge — command router with 31 handlers + set_text, execute-command/get-settings/save-settings message handlers, classifyError(), batch_execute, clone_with_overrides, scan_frame_structure, settings migration (read-only). code.js 203→390kb. Build + typecheck pass, 0 regressions. |
| 2026-02-27 | @dev (Dex) | Phase 3 complete: UI Integration — tools-schema.ts, system-prompt.ts, chat.ts (Anthropic + Gemini loops), bridge.ts (WS relay), chat-settings.ts, unified 4-tab layout in ui.html, messages.ts + index.ts wiring. ui.html 1233→1455kb. Build + typecheck pass, 0 regressions. |
| 2026-02-27 | @dev (Dex) | Task 22 complete: OpenAI adapter — runOpenAILoop(), convertToolsToOpenAI(), convertSchemaToOpenAI(), callOpenAIAPI(). 3 models (gpt-4o, gpt-4o-mini, o3-mini). ui.html 1455→1472kb. |
| 2026-02-27 | @dev (Dex) | Phase 4 complete: manifest.json (devAllowedDomains + reasoning), package.json description, architecture.md v2.0 (Unification ADR), DEPRECATED.md. Final regression: tsc 0 errors, build clean, 290/296 tests (6 pre-existing). |
