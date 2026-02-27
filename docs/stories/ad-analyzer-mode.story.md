# Story: Ad Analyzer Mode in Figmento Plugin

**Status:** Ready
**Priority:** High
**Complexity:** L (estimated 8-10 files touched, 1 new module, 1 new MCP tool, Bridge integration)
**Epic:** Figmento Modes

---

## Executor Assignment

```yaml
executor: @dev
quality_gate: @qa
quality_gate_tools: [lint, typecheck, build, manual-regression]
```

---

## Story

**As a** social media advertiser using Figmento,
**I want** to upload a bad ad and launch a full analyze-and-redesign workflow from the Modes tab,
**so that** I get 3 professionally redesigned ad variants built directly in my Figma file without leaving the plugin or manually orchestrating Claude Code.

---

## Description

Add "Ad Analyzer" as the 6th mode card in the Modes tab. When selected, it presents a focused workflow UI: upload the original ad image, fill in a brief (product name, category, platform), verify Bridge connectivity, and generate a ready-to-paste prompt for Claude Code. The user copies the formatted prompt and pastes it into Claude Code, which calls the `start_ad_analyzer` MCP tool to kick off the full MISSION.md workflow (analyze → generate images → build 3 variants → evaluate → report). The plugin observes real-time progress by watching Bridge command traffic, and receives the final report when Claude Code calls `complete_ad_analyzer` at the end.

### Why Clipboard Handoff (not WS push)

The MCP protocol is pull-based — Claude Code calls tools, tools return results. There is no mechanism for the plugin to push messages to Claude Code through the relay. The clipboard handoff pattern is consistent with how the Bridge channel ID already works: the user copies a value from the plugin and pastes it into Claude Code. This avoids building a store-and-forward layer on the MCP server.

### Why Bridge-First (not in-plugin AI)

The Ad Analyzer workflow requires capabilities the plugin sandbox cannot provide:
- **Web search** (CTR benchmarks, best practices) — blocked by Figma sandbox
- **Filesystem access** for `mcp-image` generation and `place_generated_image`
- **Multi-model orchestration** (Claude analysis + image generation model)
- **MISSION.md's 10 critical rules** as system context — too complex for in-plugin chat

The Bridge relay is the correct transport for the Claude Code → Plugin direction. Claude Code already has all MCP tools loaded and filesystem access. The plugin's role is: capture input, format the prompt, display progress from Bridge traffic, and show the final report.

---

## Architecture

### Data Flow

```
Plugin UI                         User                Claude Code (MCP)
─────────                         ────                ─────────────────
[Upload image + fill brief]
    │
    ├─ Format prompt ──────→ [Copy to clipboard]
    │  (image path, brief,        │
    │   channel ID, instructions) │
    │                             ├──→ [Paste into Claude Code]
    │                             │
    │                             │    Claude Code calls start_ad_analyzer
    │                             │    tool with brief params
    │                             │         │
    │                             │    [PHASE 2: Analyze image]
    │                             │    [PHASE 3: Generate images]
    │                             │    [PHASE 4: Build in Figma]
    │                             │         │
    │  ◄──── bridge commands ◄────────────────┘
    │        (create_frame, set_fill, etc.)
    │        (normal Bridge flow, plugin executes)
    │
[Live status: Bridge activity log]
    │
    │  ◄──── complete_ad_analyzer command ◄──────┘
    │        (report markdown + carousel nodeId,
    │         sent as a Bridge command by MCP tool)
    │
[Report panel + "View in Figma"]
```

### Handoff Prompt Format

The "Copy Brief & Start" button copies a self-contained prompt to the clipboard:

```
Run the Ad Analyzer workflow.

**Brief:**
- Product: [productName]
- Category: [productCategory]
- Platform: [platform]
- Notes: [notes or "None"]

**Image:** [absolute path to saved image in ad-analyzer/original-ad.png]
**Bridge channel:** [channelId]

Call the `start_ad_analyzer` tool with these parameters, then follow the returned MISSION.md instructions for Phases 2-5.
```

The image file is saved by the plugin to `ad-analyzer/original-ad.png` via a Bridge command (`save-ad-image`) before the prompt is generated, so Claude Code has a filesystem path to reference.

### Completion Signal (Claude Code → Plugin)

When the workflow finishes, Claude Code calls the `complete_ad_analyzer` MCP tool. This tool sends a Bridge command via `sendDesignCommand`:

```typescript
// In complete_ad_analyzer tool handler:
await sendDesignCommand('ad-analyzer-complete', {
  report: reportMarkdown,
  carouselNodeId: carouselId,
  variantNodeIds: [slideA, slideB, slideC],
});
```

The plugin receives this as a normal Bridge command. The sandbox (`code.ts`) recognizes `ad-analyzer-complete` as a UI-only message and forwards it to the UI iframe via `figma.ui.postMessage`. The UI dispatches a `CustomEvent` that `ad-analyzer.ts` listens for. This uses the existing command pipeline — no new WS message types needed.

### Progress Inference (Deferred — no dedicated progress tool)

Explicit progress messages (`send_ad_analyzer_progress` tool) are **deferred to a future iteration**. Instead, the plugin infers workflow activity from Bridge command traffic:
- Bridge activity log shows all commands firing in real time (existing pattern)
- The status panel displays a generic "Workflow running — watching for activity..." message with the Bridge activity log embedded
- When `ad-analyzer-complete` arrives, the status panel transitions to the report view

This is acceptable because the Bridge activity log already provides real-time visibility into every command Claude Code executes. A dedicated progress tool would add polish but isn't required for v1.

### File Map

| File | Action | Purpose |
|------|--------|---------|
| `figmento/src/ui/ad-analyzer.ts` | **CREATE** | New module: upload panel, brief form, prompt builder, status panel, report panel |
| `figmento/src/ui.html` | EDIT | Add mode card HTML, ad-analyzer flow container, CSS |
| `figmento/src/ui/text-layout.ts` | EDIT | Add `'ad-analyzer'` to `selectPluginMode` switch + `modeNames` |
| `figmento/src/ui/state.ts` | EDIT | Add `adAnalyzerState` object |
| `figmento/src/ui/bridge.ts` | EDIT | Export `getBridgeChannelId()` and `getBridgeConnected()` getters |
| `figmento/src/ui/messages.ts` | EDIT | Handle `ad-analyzer-complete` message from sandbox, dispatch CustomEvent |
| `figmento/src/code.ts` | EDIT | Handle `ad-analyzer-complete` command (forward to UI) + `zoom-to-node` |
| `packages/figmento-core/src/types.ts` | EDIT | Add `'ad-analyzer'` to `PluginMode` union |
| `figmento-mcp-server/src/tools/ad-analyzer.ts` | **CREATE** | New MCP tools: `start_ad_analyzer` + `complete_ad_analyzer` |
| `figmento-mcp-server/src/server.ts` | EDIT | Register new tool module |

### Bridge Integration Detail

**Problem:** `bridge.ts` keeps `bridgeChannelId` and `isBridgeConnected` as private module variables. The ad-analyzer module needs to read them.

**Solution:** Add two getter functions to `bridge.ts`:

```typescript
export function getBridgeChannelId(): string | null { return bridgeChannelId; }
export function getBridgeConnected(): boolean { return isBridgeConnected; }
```

The ad-analyzer module imports these to:
1. Show/hide the "Connect Bridge first" warning
2. Include the channel ID in the copyable prompt
3. Determine whether the "Copy Brief & Start" button should be enabled

No `sendBridgeMessage` export is needed — the plugin does not send data over WebSocket. The clipboard handles the Plugin → Claude Code direction.

### Image Handoff: Plugin → Claude Code

The plugin has no direct filesystem access. The image reaches Claude Code via the clipboard prompt:

1. User uploads image in plugin → resized to max 2048px → stored as base64 in `adAnalyzerState` (typically under 2-3MB after resize)
2. "Copy Brief & Start" embeds the base64 inside an `<image>` tag in the clipboard prompt
3. Claude Code reads the base64 from the pasted prompt and passes it to `start_ad_analyzer` as the `imageBase64` tool param
4. The MCP tool decodes base64 → saves to `output/original-ad.png` → returns the file path for subsequent phases

**5MB threshold:** If the base64 exceeds 5MB after resize (rare — would require an unusually complex image), the plugin shows a warning: "Image too large for clipboard. Save to `ad-analyzer/original-ad.png` manually." The prompt omits the image data and references the file path instead.

### place_generated_image Filesystem Constraint

**This already works.** The current flow is:
1. Claude Code calls `mcp-image` → file saved to disk
2. Claude Code calls `place_generated_image(filePath)` → MCP server reads file, base64-encodes, sends via WS
3. Plugin receives base64 in the `create_image` command → calls `figma.createImage(bytes)`

**No change needed.** The ad-analyzer workflow runs in Claude Code, which has filesystem access. The plugin just executes the resulting Bridge commands as normal.

### MCP Tools: `start_ad_analyzer` + `complete_ad_analyzer`

**`start_ad_analyzer`** — Called by Claude Code at workflow start. Receives the full brief + base64 image as tool params. Saves image to disk, returns brief + critical rules + MISSION.md instructions.

```typescript
server.tool('start_ad_analyzer', 'Initialize ad analyzer workflow...', schema, async (params) => {
  // 1. Decode base64 → save to output/original-ad.png
  // 2. Return brief + critical rules + instructions to proceed with MISSION.md phases
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        brief: { productName, productCategory, platform, notes },
        imagePath: absoluteImagePath,
        channelId: params.channelId,
        criticalRules: CRITICAL_RULES_TEXT,
        instruction: 'Proceed with MISSION.md Phase 2-5. When complete, call complete_ad_analyzer with the report and carousel nodeId.'
      })
    }]
  };
});
```

**`complete_ad_analyzer`** — Called by Claude Code at workflow end. Sends the report and nodeIds to the plugin via Bridge command.

```typescript
server.tool('complete_ad_analyzer', 'Signal workflow completion...', schema, async (params) => {
  // Send completion to plugin via existing Bridge command pipeline
  await sendDesignCommand('ad-analyzer-complete', {
    report: params.report,
    carouselNodeId: params.carouselNodeId,
    variantNodeIds: params.variantNodeIds,
  });
  return { content: [{ type: 'text', text: 'Completion signal sent to plugin.' }] };
});
```

---

## Acceptance Criteria

### AC-1: Mode Card Appears
- **Given** the user opens Figmento and navigates to the Modes tab
- **When** the mode selector is visible
- **Then** a 6th card "Ad Analyzer" appears with a target/bullseye icon and description "Analyze ads and build 3 redesigned variants"
- **And** clicking it navigates to the ad-analyzer flow (hides mode selector, shows ad-analyzer UI)

### AC-2: Upload Panel
- **Given** the user is in the Ad Analyzer flow
- **When** the upload panel is visible
- **Then** the user can drag-drop or click to upload a PNG/JPG image
- **And** the image is resized client-side to max 2048px on the longest edge before storing
- **And** the image preview shows with dimensions (post-resize)
- **And** only one image is accepted (replacing any previous upload)
- **And** the image is stored as base64 in `adAnalyzerState.imageBase64`

### AC-3: Brief Form
- **Given** the user has uploaded an image
- **When** the brief form is visible
- **Then** it contains: Product Name (text input, required), Product Category (text input, required), Platform (select: Instagram 4:5, Instagram 1:1, Instagram Story 9:16, Facebook Feed), Notes (textarea, optional)
- **And** all required fields must be filled before the "Copy Brief & Start" button enables

### AC-4: Bridge Status Display
- **Given** the user is in the Ad Analyzer flow
- **When** Bridge is connected
- **Then** a green status indicator shows "Bridge Connected" with the channel ID in monospace and a copy button
- **When** Bridge is NOT connected
- **Then** a yellow warning shows "Connect the Bridge tab first" with a "Go to Bridge" link that switches to the Bridge tab
- **And** the "Copy Brief & Start" button is disabled regardless of form completeness

### AC-5: Copy Brief & Start
- **Given** image uploaded, brief filled, and Bridge connected
- **Then** a persistent inline notice appears above the button: "This workflow takes 5-15 minutes and runs in Claude Code. Once started, it cannot be cancelled from the plugin."
- **And** the "Copy Brief & Start" button is enabled
- **When** the user clicks "Copy Brief & Start"
- **Then** a formatted prompt is copied to the clipboard containing: product name, category, platform, notes, channel ID, base64 image (inside an `<image>` tag), and instructions to call `start_ad_analyzer`
- **And** if the base64 image exceeds 5MB, a warning is shown: "Image too large for clipboard. Save to ad-analyzer/original-ad.png manually." and the prompt omits the image data, referencing the file path instead
- **And** a success toast shows: "Copied! Paste into Claude Code to start the analysis."
- **And** the UI transitions to the live status panel (watching for Bridge activity)

### AC-6: Live Status Panel
- **Given** the user has copied the brief and the status panel is visible
- **When** Bridge commands start arriving (from Claude Code executing the workflow)
- **Then** the panel shows: a "Workflow running" indicator, an embedded Bridge activity log showing commands in real time
- **And** the activity log follows the existing Bridge log pattern (timestamped entries, color-coded by type)

### AC-7: Report Panel
- **Given** the workflow completes
- **When** an `ad-analyzer-complete` Bridge command arrives (sent by `complete_ad_analyzer` MCP tool)
- **Then** the status panel transitions to a report view
- **And** the report markdown content renders as formatted text (basic markdown → HTML)
- **And** a "View in Figma" button calls `figma.viewport.scrollAndZoomIntoView([carouselNode])`
- **And** a "Run Again" button resets to the upload panel

### AC-8: Error Handling
- **Given** the workflow is running and Bridge disconnects
- **Then** the status panel shows "Bridge disconnected — workflow may still be running in Claude Code. Reconnect Bridge to resume watching."
- **Given** no Bridge commands arrive for 60 seconds after the panel is shown
- **Then** a hint appears: "No activity detected. Make sure you pasted the prompt into Claude Code."

### AC-9: MCP Tool Registration
- **Given** Claude Code connects to the Figmento MCP server
- **When** it lists available tools
- **Then** `start_ad_analyzer` appears with schema: `{ imageBase64: z.string(), imageMimeType: z.string(), productName: z.string(), productCategory: z.string(), platform: z.string(), channelId: z.string(), notes: z.string().optional() }`
- **And** `complete_ad_analyzer` appears with schema: `{ report: z.string(), carouselNodeId: z.string(), variantNodeIds: z.array(z.string()) }`
- **And** calling `start_ad_analyzer` saves the image to `output/original-ad.png` and returns the brief + critical rules
- **And** calling `complete_ad_analyzer` sends the report to the plugin via Bridge command

### AC-10: Back Navigation
- **Given** the user is in any step of the Ad Analyzer flow
- **When** the status panel is NOT showing (pre-copy)
- **Then** the back button returns to the mode selector
- **When** the status panel IS showing (post-copy, watching for activity)
- **Then** the back button shows a confirmation dialog: "The workflow may still be running in Claude Code. Going back won't stop it. Continue?"

---

## Scope

### IN
- Mode card in Modes tab (HTML + CSS + click handler)
- Ad Analyzer flow UI module (`ad-analyzer.ts`)
- Image upload with drag-drop, file picker, and client-side resize
- Brief form with validation
- Bridge connectivity check and channel display
- Clipboard prompt builder with base64 image embedding
- Live status panel observing Bridge command traffic
- Report panel triggered by `complete_ad_analyzer` Bridge command
- `start_ad_analyzer` MCP tool (receives brief + image, saves image, returns rules)
- `complete_ad_analyzer` MCP tool (sends report to plugin via Bridge command)
- `ad-analyzer-complete` command handling in sandbox + UI message routing
- `zoom-to-node` sandbox command
- `PluginMode` type update
- Back navigation from ad-analyzer flow

### OUT
- In-plugin image generation (future epic — requires breaking sandbox constraints)
- Dedicated `send_ad_analyzer_progress` MCP tool (deferred — progress inferred from command traffic)
- User accounts or saving past analyses
- Multi-ad batch processing
- Modifications to MISSION.md workflow logic (consumed as-is)
- Changes to the WS relay server (existing channel messaging works)
- New network allowlist entries (Bridge relay already allowed)

---

## Risks

### R1: Bridge Dependency — Hard Requirement (HIGH)
**Risk:** The entire workflow requires an active Bridge connection for Claude Code to execute design commands. If the user hasn't set up Bridge, the Ad Analyzer is unusable.
**Mitigation:** "Copy Brief & Start" button is disabled when Bridge is not connected. Clear "Connect Bridge first" warning with a direct link to the Bridge tab. The mode card itself works without Bridge (for uploading and filling the brief), but the final action is blocked.
**Impact:** UX friction — users must connect Bridge before using this mode, unlike other modes that work standalone.

### R2: Long-Running Workflow — No Cancellation (MEDIUM)
**Risk:** The MISSION.md workflow takes 5-15 minutes. Once the user pastes the prompt into Claude Code, there's no way to cancel it from the plugin.
**Mitigation:** Persistent inline notice above the "Copy Brief & Start" button warns: "This workflow takes 5-15 minutes and runs in Claude Code. Once started, it cannot be cancelled from the plugin." The two-step handoff (copy then paste) gives the user a natural decision point.
**Impact:** User may waste Claude Code credits, but the clipboard handoff makes accidental launches unlikely.

### R3: Image Size — Base64 in Clipboard (MEDIUM)
**Risk:** A high-res ad image can produce a large base64 string. Clipboard has practical limits (~5MB of text is fine, beyond that some environments may truncate or lag).
**Mitigation:** Resize image client-side to max 2048px on longest edge before base64 encoding. This keeps most images under 2-3MB base64. For images that still exceed 5MB, show a warning and instruct the user to save the file manually.
**Impact:** Without resize, clipboard may fail silently on very large images.

### R4: Progress Messages — Deferred (LOW)
**Risk:** Without a dedicated `send_ad_analyzer_progress` MCP tool, the plugin cannot show structured phase-by-phase progress (e.g., "Phase 3 of 5 — Image Generation").
**Mitigation:** The Bridge activity log shows all commands firing in real time, so the user sees activity. A generic "Workflow running" indicator plus the command log provides sufficient feedback for v1. A dedicated progress tool can be added in a future iteration.
**Impact:** Cosmetic — user sees commands flowing but not a clean phase indicator. Acceptable for v1.

### R5: place_generated_image Path — Works Today (LOW)
**Risk:** `place_generated_image` reads from disk on the MCP server side and sends base64 via Bridge. This works today but is brittle — if the MCP server and Claude Code run on different machines, the path won't resolve.
**Mitigation:** Document that Claude Code and MCP server must share a filesystem (current local setup). For remote deployments, this becomes a future epic.
**Impact:** None for current local workflow. Blocks remote/cloud deployment.

### R6: Clipboard Handoff — Two-Step UX (LOW)
**Risk:** The user must copy from the plugin AND paste into Claude Code — two manual steps instead of one-click. This is less seamless than a direct launch.
**Mitigation:** This pattern is already familiar from Bridge channel ID usage. The success toast with clear instructions ("Paste into Claude Code to start") reduces confusion. The copy includes everything Claude Code needs — no additional setup.
**Impact:** Minor UX friction. Acceptable tradeoff for architectural simplicity.

---

## Task Breakdown

### Task 1: Update PluginMode Type
**File:** `packages/figmento-core/src/types.ts`
- Add `'ad-analyzer'` to the `PluginMode` union type
- Ensure no downstream type errors

### Task 2: Add Mode Card HTML + CSS
**File:** `figmento/src/ui.html`
- Add 6th `.mode-card` with `data-mode="ad-analyzer"`, target/bullseye SVG icon
- Add `#adAnalyzerFlow` container div (hidden by default) with sections:
  - `.aa-upload-panel` — drop zone + file input + image preview (with dimensions)
  - `.aa-brief-form` — product name, category, platform select, notes
  - `.aa-bridge-status` — green indicator + channel ID when connected; yellow warning + "Go to Bridge" link when disconnected
  - `.aa-launch-section` — persistent inline notice ("This workflow takes 5-15 minutes...") + "Copy Brief & Start" button
  - `.aa-status-panel` (hidden) — "Workflow running" indicator + embedded activity log + inactivity hint area
  - `.aa-report-panel` (hidden) — report content area + "View in Figma" button + "Run Again" button
- Add CSS for all new elements (follow existing mode flow styling patterns)

### Task 3: Wire Mode Selection
**File:** `figmento/src/ui/text-layout.ts`
- Add `'ad-analyzer'` case to `selectPluginMode` switch
- Add to `modeNames` record: `'ad-analyzer': 'Ad Analyzer'`
- Show `adAnalyzerFlow`, hide others

### Task 4: Add Ad Analyzer State
**File:** `figmento/src/ui/state.ts`
- Add `adAnalyzerState` object:
  ```typescript
  export const adAnalyzerState = {
    imageBase64: null as string | null,
    imageMimeType: null as string | null,
    imageWidth: 0,
    imageHeight: 0,
    productName: '',
    productCategory: '',
    platform: 'instagram-4x5' as string,
    notes: '',
    isWatching: false,          // true after "Copy Brief & Start"
    lastActivityTime: 0,        // timestamp of last Bridge command
    report: null as string | null,
    carouselNodeId: null as string | null,
    variantNodeIds: null as string[] | null,
  };
  ```

### Task 5: Export Bridge Getters
**File:** `figmento/src/ui/bridge.ts`
- Add `export function getBridgeChannelId(): string | null` — returns current channel ID
- Add `export function getBridgeConnected(): boolean` — returns connection state

No CustomEvent dispatch, no `sendBridgeMessage` export. The ad-analyzer module reads Bridge state via getters only. Completion signals arrive through the existing command pipeline (sandbox → UI message), not through bridge.ts.

### Task 6: Create Ad Analyzer UI Module
**File:** `figmento/src/ui/ad-analyzer.ts` (NEW)

- `initAdAnalyzer()` — cache DOM refs, set up event listeners, start Bridge state polling
- **Upload handler:**
  - Drag-drop + file input → FileReader → base64
  - **Client-side resize:** Create an offscreen `<canvas>`. If the image's longest edge exceeds 2048px, scale proportionally so the longest edge = 2048px. Draw the resized image on canvas, then call `canvas.toDataURL('image/png')` for the base64 output. Update `adAnalyzerState.imageBase64/Width/Height`.
  - Show image preview with post-resize dimensions
  - Only one image accepted (replace previous)
- **Brief form:**
  - Input listeners on product name, category, notes fields + platform select
  - On any change, call `updateButtonState()`
- **Button state (`updateButtonState()`):**
  - "Copy Brief & Start" button is **disabled** unless ALL three conditions are met:
    1. Image uploaded (`adAnalyzerState.imageBase64 !== null`)
    2. Required brief fields filled (`productName.trim() !== ''` AND `productCategory.trim() !== ''`)
    3. Bridge connected (`getBridgeConnected() === true`)
  - Rechecked on: input events, Bridge state change (polled every 2s via `setInterval`)
- **Clipboard prompt builder (on button click):**
  - Check base64 size: if `imageBase64.length > 5_000_000` (chars, ~3.75MB raw), show warning and omit image from prompt (instruct manual save instead)
  - Otherwise, assemble the full prompt with `<image>` tag containing base64
  - Include: product name, category, platform, notes, channel ID from `getBridgeChannelId()`, instructions to call `start_ad_analyzer`
  - Copy to clipboard using existing `document.execCommand('copy')` pattern from bridge.ts
  - Show success toast: "Copied! Paste into Claude Code to start the analysis."
  - Transition to status panel, set `adAnalyzerState.isWatching = true`
- **Status panel:**
  - Shows "Workflow running — watching for Bridge activity..." message
  - Embeds a local activity log that mirrors Bridge command traffic (subscribe to bridge log entries or duplicate the pattern)
  - **Inactivity detection:** If no Bridge commands arrive within 60s of showing the panel, display hint: "No activity detected. Make sure you pasted the prompt into Claude Code."
  - Track `adAnalyzerState.lastActivityTime` updated on each Bridge command
- **Report panel:**
  - Listen for `ad-analyzer-complete` messages from sandbox (via `window.addEventListener('message', ...)`)
  - Render markdown to HTML (basic: headings, bold, italic, lists, paragraphs, code blocks — regex-based converter, no external library)
  - "View in Figma": `postToSandbox({ type: 'zoom-to-node', nodeId: carouselNodeId })`
  - "Run Again": reset `adAnalyzerState`, show upload panel, hide status/report panels
- **Back navigation:**
  - If `adAnalyzerState.isWatching === false`: return to mode selector directly
  - If `adAnalyzerState.isWatching === true`: show confirmation dialog: "The workflow may still be running in Claude Code. Going back won't stop it. Continue?"

### Task 7: Register in index.ts
**File:** `figmento/src/ui/index.ts`
- Import and call `initAdAnalyzer()` in `initializeApp()`

### Task 8: Create MCP Tools
**File:** `figmento-mcp-server/src/tools/ad-analyzer.ts` (NEW)

- `registerAdAnalyzerTools(server, sendDesignCommand)`

**Tool 1: `start_ad_analyzer`**
- Schema:
  ```typescript
  {
    imageBase64: z.string().describe('Base64-encoded ad image (PNG or JPG)'),
    imageMimeType: z.string().describe('image/png or image/jpeg'),
    productName: z.string(),
    productCategory: z.string(),
    platform: z.string().describe('instagram-4x5 | instagram-1x1 | instagram-story | facebook-feed'),
    channelId: z.string().describe('Bridge channel ID for sending design commands'),
    notes: z.string().optional(),
  }
  ```
- Handler:
  1. Ensure `output/` directory exists
  2. Decode base64 → write to `output/original-ad.png`
  3. Return JSON with: brief params, absolute image path, `CRITICAL_RULES_TEXT` (10 rules from MISSION.md, embedded as a constant string in the module), and instruction to proceed with MISSION.md Phases 2-5
- Critical rules constant: extract rules 1-10 from MISSION.md and embed as a multi-line string. These are stable (battle-tested over 2 real-world sessions) and change rarely.

**Tool 2: `complete_ad_analyzer`**
- Schema:
  ```typescript
  {
    report: z.string().describe('Full design-report.md content as markdown'),
    carouselNodeId: z.string().describe('Root carousel frame nodeId'),
    variantNodeIds: z.array(z.string()).describe('Array of [A, B, C] variant slide nodeIds'),
  }
  ```
- Handler:
  1. Send completion to plugin via Bridge: `await sendDesignCommand('ad-analyzer-complete', { report, carouselNodeId, variantNodeIds })`
  2. Return confirmation text

**Deferred (not in this story):** `send_ad_analyzer_progress` tool for structured phase progress updates. Progress is inferred from Bridge command traffic in v1.

- Register both tools in `figmento-mcp-server/src/server.ts`

### Task 9: Handle New Sandbox Commands
**File:** `figmento/src/code.ts`

Add two new cases to the message/command handler:

```typescript
case 'zoom-to-node': {
  const node = figma.getNodeById(msg.nodeId);
  if (node) figma.viewport.scrollAndZoomIntoView([node]);
  break;
}

case 'ad-analyzer-complete': {
  // Forward to UI iframe — this is a UI-only message, no Figma API action
  figma.ui.postMessage({
    type: 'ad-analyzer-complete',
    report: msg.params.report,
    carouselNodeId: msg.params.carouselNodeId,
    variantNodeIds: msg.params.variantNodeIds,
  });
  break;
}
```

### Task 10: Build & Smoke Test
- Run `npm run build` in `figmento/` and `figmento-mcp-server/`
- Verify no type errors
- Load plugin in Figma dev mode
- Verify mode card appears and navigates to ad-analyzer flow
- Verify upload (drag-drop + click), image preview with resize
- Verify brief form validation enables/disables button
- Verify Bridge status reflects connection state
- Verify "Copy Brief & Start" copies prompt to clipboard (inspect clipboard content)
- Verify status panel shows when watching
- Verify `start_ad_analyzer` tool appears in MCP tool list
- Verify `complete_ad_analyzer` sends Bridge command and plugin shows report panel

---

## Dependencies

- Bridge tab must be functional (already shipped)
- `mcp-image` MCP server must be available to Claude Code (external dependency, not part of this story)
- Claude Code must have MISSION.md accessible (already in `ad-analyzer/` directory)

---

## Criteria of Done

- [x] `PluginMode` type includes `'ad-analyzer'`
- [x] Mode card visible in Modes tab with correct icon and description
- [x] Clicking card navigates to ad-analyzer flow
- [x] Image upload works (drag-drop + click, preview shown, max 2048px canvas resize)
- [x] Brief form validates required fields
- [x] Bridge status correctly reflects connection state
- [x] "Copy Brief & Start" button disabled when image OR brief OR Bridge missing
- [x] "Copy Brief & Start" copies correctly formatted prompt to clipboard
- [x] 5-15 min warning notice visible above button before copy
- [x] Base64 >5MB shows warning and omits image from clipboard
- [x] Status panel shows with Bridge activity log after copy
- [x] 60s inactivity hint appears when no commands detected
- [x] Report panel renders on `ad-analyzer-complete` command
- [x] "View in Figma" zooms to carousel
- [x] "Run Again" resets to upload panel
- [x] Back navigation works with watching-state confirmation
- [x] `start_ad_analyzer` MCP tool registered, saves image, returns rules
- [x] `complete_ad_analyzer` MCP tool registered, sends Bridge command
- [x] `zoom-to-node` and `ad-analyzer-complete` sandbox commands handled
- [x] Builds pass (`figmento/` and `figmento-mcp-server/`)
- [ ] No lint or typecheck errors

---

## File List

| File | Status |
|------|--------|
| `packages/figmento-core/src/types.ts` | [x] Modified |
| `figmento/src/ui.html` | [x] Modified |
| `figmento/src/ui/text-layout.ts` | [x] Modified |
| `figmento/src/ui/state.ts` | [x] Modified |
| `figmento/src/ui/bridge.ts` | [x] Modified |
| `figmento/src/ui/ad-analyzer.ts` | [x] Created |
| `figmento/src/ui/messages.ts` | N/A (not needed — message handled in ad-analyzer.ts directly) |
| `figmento/src/ui/index.ts` | [x] Modified |
| `figmento/src/ui/screenshot.ts` | [x] Modified (back nav guard) |
| `figmento/src/code.ts` | [x] Modified |
| `figmento-mcp-server/src/tools/ad-analyzer.ts` | [x] Created |
| `figmento-mcp-server/src/server.ts` | [x] Modified |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-27 | @architect | Story created (Draft) |
| 2026-02-27 | @po | Conditional GO — F1 (transport gap), F2 (button disable), F3 (pre-launch warning) required |
| 2026-02-27 | @architect | v2: Applied all fixes. F1→clipboard handoff with base64 in prompt. F2→three-condition disable. F3→persistent inline notice. F5→progress deferred. F7→canvas resize technique. Added complete_ad_analyzer tool. Resolved image handoff via base64-in-prompt with 5MB threshold. |
| 2026-02-27 | @po | Re-validated F1/F2/F3 — all resolved. Cleaned up Image Handoff section (removed deliberation, kept final decision). Removed stale `save-ad-image` from File Map. Status: Draft → **Ready**. |
| 2026-02-27 | @dev | Implementation complete. All 10 tasks done. Both esbuild builds pass. Added screenshot.ts for back-nav guard (not in original file map). messages.ts not modified — completion handled via window listener in ad-analyzer.ts. Status: Ready → **InProgress**. |
