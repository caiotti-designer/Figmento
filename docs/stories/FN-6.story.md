# FN-6: Design System Discovery

| Field | Value |
|-------|-------|
| **Story ID** | FN-6 |
| **Epic** | FN — Figma Native Agent Migration |
| **Status** | InProgress |
| **Author** | @sm (River) |
| **Executor** | @dev (Dex) |
| **Gate** | @qa |
| **Created** | 2026-03-24 |
| **Complexity** | XL (Extra Large) |
| **Priority** | HIGH |

---

## Description

Add a Design System Discovery capability to the Figmento plugin that scans the current Figma file for local components, component sets, paint/text/effect styles, and variables — then caches the results for use by FN-7 (Component Matching), FN-8 (Variable Binding), and FN-9 (AI Prompt Injection). This is the **foundation story** for Phase 2.

### Current State

The plugin already has `handleReadFigmaContext()` in `canvas-query.ts` which reads **variables and styles** on demand via the `read_figma_context` tool. However:
1. **Components are never scanned.** There is no code that discovers local `ComponentNode` or `ComponentSetNode` instances in the file.
2. **Results are not cached.** Every `read_figma_context` call re-scans everything from scratch.
3. **No UI trigger.** The user has no way to explicitly scan the file's design system or see what was found.
4. **No agent path.** For the Claude Code + Figma MCP agent path, `search_design_system` and `get_variable_defs` exist but are not integrated into Figmento's intelligence layer.

### What This Story Adds

1. **Component Discovery** — A new sandbox handler that calls `figma.root.findAll()` to discover all local components and component sets, extracting name, key, description, variant properties, and a category hint (Button, Card, Input, Badge, etc.).
2. **Unified Discovery Cache** — A `DesignSystemCache` interface combining components + variables + styles, stored in `figma.clientStorage` (plugin path) and in-memory (MCP server path). Capped at 500 components.
3. **UI: "Scan Design System" button** — Added to the plugin settings or a new section, showing a summary of discovered components, variables, and styles after scan.
4. **`scan_design_system` message type** — New `PluginMessage` type that triggers the scan from the UI and returns the cache.
5. **Agent path integration** — *(Deferred to a separate story)* The agent path MCP tool (`discover_design_system`) is out of scope for FN-6. This story focuses on the plugin sandbox path only.

### Why This Matters

Without discovery, Figmento generates designs using raw primitives even when the user's file has a polished Button component, brand color variables, and typography styles. Discovery is the prerequisite for making generated designs use real design system artifacts.

### Architecture Constraints (from FN-0)

- **Plugin sandbox cannot call Figma's MCP server** — discovery in the plugin MUST use `figma.root.findAll()` and `figma.variables.*` APIs.
- **Agent path uses Figma MCP** — `search_design_system`, `get_variable_defs`, `get_code_connect_map` work from external MCP clients only.
- **Cache cap** — 500 components maximum to prevent memory issues in large design system files.
- **Fallback** — If no design system is found, all downstream consumers (FN-7/8/9) behave exactly like current (primitives). Zero regression risk.

---

## Acceptance Criteria

- [x] AC1: A new handler function `handleScanDesignSystem()` exists in `figmento/src/handlers/design-system-discovery.ts` that:
  - [x] AC1a: Discovers all local `ComponentNode` and `ComponentSetNode` instances via `figma.root.findAll()`, capped at 500
  - [x] AC1b: For each component, extracts: `key`, `name`, `description`, `width`, `height`, `type` (COMPONENT or COMPONENT_SET), and for component sets: variant property names and values
  - [x] AC1c: Categorizes each component using name-based heuristics (e.g., name contains "Button" → category "button", "Card" → "card", "Input"/"TextField" → "input", "Badge"/"Tag"/"Chip" → "badge", "Icon" → "icon", "Avatar" → "avatar", "Nav"/"Navbar"/"Header" → "navigation")
  - [x] AC1d: Reads variables, paint styles, text styles, and effect styles (reusing existing `handleReadFigmaContext()` logic)
  - [x] AC1e: Returns a unified `DesignSystemCache` object containing `{ components, variables, collections, paintStyles, textStyles, effectStyles, scannedAt: ISO timestamp }`

- [x] AC2: A `DesignSystemCache` TypeScript interface is defined in `figmento/src/types.ts` (via `@figmento/core`) with:
  - [x] AC2a: `components: DiscoveredComponent[]` — array of discovered components
  - [x] AC2b: `variables`, `collections`, `paintStyles`, `textStyles`, `effectStyles` — same shape as current `handleReadFigmaContext()` return value
  - [x] AC2c: `scannedAt: string` — ISO timestamp of last scan
  - [x] AC2d: `DiscoveredComponent` type with fields: `key: string`, `name: string`, `description: string`, `category: string`, `width: number`, `height: number`, `nodeType: 'COMPONENT' | 'COMPONENT_SET'`, `variantProperties?: Record<string, string[]>`

- [x] AC3: The discovery result is cached in `figma.clientStorage` under key `'figmento-design-system-cache'`:
  - [x] AC3a: Cache is written after every successful scan
  - [x] AC3b: Cache is read on plugin startup and sent to UI via `postMessage`
  - [x] AC3c: Cache has a staleness check — if `scannedAt` is older than 1 hour, UI shows a "Rescan" hint

- [x] AC4: A new `PluginMessage` type `'scan-design-system'` is added to `figmento/src/types.ts` (via `@figmento/core`):
  - [x] AC4a: UI sends `{ type: 'scan-design-system' }` to sandbox
  - [x] AC4b: Sandbox responds with `{ type: 'design-system-scanned', cache: DesignSystemCache }` on success
  - [x] AC4c: Sandbox responds with `{ type: 'design-system-scanned', cache: null, error: string }` on failure

- [x] AC5: Plugin UI has a "Scan Design System" button:
  - [x] AC5a: Button is visible in the settings panel in a dedicated "Design System" section
  - [x] AC5b: After scan completes, shows a summary: "Found X components, Y variables, Z styles"
  - [x] AC5c: If cache already exists and is fresh (<1 hour), shows the summary with a "Rescan" option
  - [x] AC5d: Shows loading state during scan

- [x] AC6: The existing `read_figma_context` command handler is updated to also include the cached component list in its response (if cache exists), so the LLM learns about available components without a separate scan call

- [x] AC7: The component scan respects the 500-component cap:
  - [x] AC7a: If more than 500 components are found, only the first 500 (sorted by name) are included
  - [x] AC7b: A `truncated: true` flag is set on the cache when the cap is hit
  - [x] AC7c: The UI summary shows "Found 500+ components (showing first 500)" when truncated

- [x] AC8: Fallback behavior — when the scan finds zero components and zero variables:
  - [x] AC8a: Cache is still created with empty arrays
  - [x] AC8b: UI shows "No design system found in this file"
  - [x] AC8c: All existing plugin behavior remains identical (zero regression)

- [x] AC9: Plugin builds successfully with `npm run build` in the `figmento/` directory after changes
- [ ] AC10: No new runtime errors when loading the plugin in Figma (manual test)

---

## Scope

### IN Scope

- Component discovery via `figma.root.findAll()` in the plugin sandbox
- Name-based component categorization heuristics
- Unified `DesignSystemCache` interface and type definitions
- `figma.clientStorage` caching of discovery results
- Plugin UI button + summary display
- New `PluginMessage` types for scan trigger and response
- Updating `read_figma_context` response to include cached components
- 500-component cap with truncation flag

### OUT of Scope

- Component matching during generation (FN-7)
- Variable binding during generation (FN-8)
- AI prompt injection with discovered DS context (FN-9)
- Agent path MCP tool (`discover_design_system` on Figmento MCP server) — deferred to a separate agent-path story
- Library/team component scanning (only local file components)
- Component thumbnail generation
- Design system diffing or version tracking

---

## Technical Notes

### Key Findings from Source Analysis

#### 1. Plugin Sandbox API for Component Discovery

The Figma Plugin API provides these methods for discovering components:

```typescript
// Find all components in the file
const components = figma.root.findAll(node =>
  node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
);

// ComponentNode properties
component.key          // Unique key for importComponentByKeyAsync
component.name         // Display name (e.g., "Button", "Card/Default")
component.description  // Optional description
component.width        // Default width
component.height       // Default height

// ComponentSetNode (contains variants)
componentSet.name           // Base name
componentSet.children       // Array of ComponentNode variants
componentSet.variantGroupProperties  // { "Size": { values: ["Small", "Medium", "Large"] } }
```

#### 2. Existing `handleReadFigmaContext()` (canvas-query.ts:303)

Already reads variables, collections, paint/text/effect styles. The discovery handler should reuse this logic rather than duplicate it. Strategy: extract the variable/style reading into a shared helper, then compose it with the new component scanning.

#### 3. Existing `handleImportComponentByKey()` (canvas-scene.ts:346)

Already supports importing components by key and creating instances. FN-7 will use this existing handler — FN-6 just needs to discover the keys.

#### 4. `clientStorage` Usage Pattern (handlers/storage.ts, handlers/settings.ts)

The codebase extensively uses `figma.clientStorage.getAsync`/`setAsync` for persistence. Pattern:
```typescript
const cached = await figma.clientStorage.getAsync('figmento-design-system-cache');
// ... on scan complete:
await figma.clientStorage.setAsync('figmento-design-system-cache', cache);
```

#### 5. Category Heuristics

Name-based categorization is intentionally simple for v1. The matching keywords:

| Category | Keywords in component name |
|----------|--------------------------|
| button | button, btn, cta |
| card | card |
| input | input, textfield, text-field, textarea, text-area, field |
| badge | badge, tag, chip, pill, label |
| icon | icon, ico |
| avatar | avatar, profile-pic, user-image |
| navigation | nav, navbar, header, sidebar, menu, breadcrumb, tab, tabs |
| modal | modal, dialog, popup, drawer, sheet |
| toggle | toggle, switch, checkbox, radio |
| select | select, dropdown, picker, combobox |
| divider | divider, separator, hr |
| other | (default fallback) |

Case-insensitive matching on the full component name path (e.g., "UI/Buttons/Primary" matches "button").

### Component Data Shape

```typescript
interface DiscoveredComponent {
  key: string;                    // For importComponentByKeyAsync
  name: string;                   // Full component name path
  description: string;            // Component description (may be empty)
  category: string;               // Heuristic category
  width: number;                  // Default width
  height: number;                 // Default height
  nodeType: 'COMPONENT' | 'COMPONENT_SET';
  variantProperties?: Record<string, string[]>;  // Only for COMPONENT_SET
}
```

---

## Source Material Inventory

| Source File | What It Provides |
|-------------|-----------------|
| `figmento/src/handlers/canvas-query.ts` (lines 299-380) | Existing `handleReadFigmaContext()` — reads variables, collections, paint/text/effect styles. Reuse this logic for the styles/variables portion of the cache. |
| `figmento/src/handlers/canvas-scene.ts` (lines 346-400) | Existing `handleImportComponentByKey()` — shows how component keys and variant properties are accessed. Confirms `ComponentSetNode.variantGroupProperties` API. |
| `figmento/src/handlers/storage.ts` | Pattern for `clientStorage` usage — get/set async, storage key constants, pruning old data. |
| `figmento/src/handlers/settings.ts` | More `clientStorage` patterns and `PluginMessage` handler delegation pattern. |
| `figmento/src/code.ts` | Main message handler — shows how to add new message types and delegate to handler functions. |
| `figmento/src/types.ts` | Type definitions for `PluginMessage` union type and other shared interfaces. |
| `figmento/src/ui/state.ts` | App state module — where the UI-side cache reference would be stored. |
| `figmento/src/ui/system-prompt.ts` | `buildSystemPrompt()` — will be modified in FN-9 to inject DS context, but FN-6 just provides the data. |
| `docs/architecture/fn-0-use-figma-assessment.md` (Q3) | Confirms plugin sandbox cannot call Figma MCP — must use `figma.root.findAll()` for discovery. |

---

## Dependencies

- **None** — FN-6 is the Phase 2 foundation with zero dependencies on other FN stories
- **Requires:** Figma Plugin API access to `figma.root.findAll()`, `figma.variables.*`, `figma.getLocalPaintStylesAsync()`, `figma.clientStorage`
- **Downstream:** FN-7, FN-8, FN-9 all depend on FN-6's `DesignSystemCache`

---

## Definition of Done

- [x] `DesignSystemCache` and `DiscoveredComponent` types defined in `packages/figmento-core/src/types.ts` (re-exported via `figmento/src/types.ts`)
- [x] `handleScanDesignSystem()` handler discovers components, variables, and styles
- [x] Components are categorized using name-based heuristics (12 categories + 'other' fallback)
- [x] 500-component cap enforced with truncation flag
- [x] Results cached in `figma.clientStorage` with timestamp
- [x] Cache loaded on plugin startup and sent to UI
- [x] `read_figma_context` response includes cached components when available
- [x] New `PluginMessage` types added for scan trigger/response
- [x] UI shows "Scan Design System" button with summary display
- [x] Plugin builds without errors (`npm run build`)
- [ ] Manual test: scan works on a file with components/variables and on an empty file
- [ ] Zero regression: existing plugin behavior unchanged when no scan has been performed

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `figma.root.findAll()` is slow on large files (10K+ nodes) | Medium | Medium | Cap at 500 components; filter by type early (`node.type === 'COMPONENT'`); measure and log scan duration |
| `clientStorage` size limit hit by large cache | Low | Medium | The 500-component cap keeps data under ~100KB; `clientStorage` supports up to 1MB per key |
| Component name heuristics produce wrong categories | Medium | Low | Categories are hints, not hard rules; FN-7's matching will use both category and name; user can rescan after renaming |
| Variant property discovery may fail on malformed component sets | Low | Low | Wrap `variantGroupProperties` access in try-catch; skip malformed entries |

---

## File List

| File | Action | Description |
|------|--------|-------------|
| `packages/figmento-core/src/types.ts` | MODIFY | Added `DesignSystemCache`, `DiscoveredComponent`, `ScanDesignSystemMessage`, `DesignSystemScannedMessage` types and new `PluginMessage` variants |
| `figmento/src/handlers/design-system-discovery.ts` | CREATE | New handler: `handleScanDesignSystem()`, `getDesignSystemCache()`, `isCacheStale()` — component discovery, category heuristics, variable/style reading, clientStorage caching |
| `figmento/src/handlers/command-router.ts` | MODIFY | Added `scan_design_system` command; enriched `read_figma_context` with cached component data |
| `figmento/src/code.ts` | MODIFY | Added `scan-design-system` message handler, cache load on startup via `getDesignSystemCache()` |
| `figmento/src/ui/state.ts` | MODIFY | Added `designSystemState` (cache + isScanning) |
| `figmento/src/ui/messages.ts` | MODIFY | Added `onDesignSystemScanned` callback |
| `figmento/src/ui/index.ts` | MODIFY | Added `handleDesignSystemScanned()`, `triggerDesignSystemScan()`, `initDesignSystemPanel()` |
| `figmento/src/ui.html` | MODIFY | Added "Design System" settings group with scan button, summary, and status display; added CSS for status states |
| `docs/stories/FN-6.story.md` | MODIFY | AC checkboxes, file list, change log |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | @sm (River) | Story drafted from Epic FN Phase 2. Full source analysis of canvas-query.ts (handleReadFigmaContext), canvas-scene.ts (handleImportComponentByKey), storage.ts (clientStorage patterns), code.ts (message routing), state.ts (app state), types.ts (PluginMessage union), and FN-0 assessment (Q3 sandbox limitations). |
| 2026-03-24 | @po (Pax) | **Validated: GO (10/10).** Description/Scope inconsistency fixed (agent-path MCP tool marked as deferred in Description to match OUT of Scope). Status Draft -> Ready. |
| 2026-03-24 | @dev (Dex) | **Implementation complete.** Created `design-system-discovery.ts` handler with component discovery (12 categories), variable/style reading, 500-cap, clientStorage caching. Wired into `code.ts` (startup cache load + scan message), `command-router.ts` (scan_design_system command + read_figma_context enrichment), UI (scan button in settings, summary display, staleness check). Types added to `@figmento/core`. Build passes. Status Ready -> InProgress. |
