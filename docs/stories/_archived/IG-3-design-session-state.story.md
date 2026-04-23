# Story IG-3: Design Session State

**Status:** Done
**Priority:** High (P1)
**Complexity:** M (3 points) — 1 file, no new APIs, but 5 impl phases: recursive layer builder + TTL session map + tool-result capture + turn-start injection + channel cleanup
**Epic:** IG — Image Generation Pipeline
**Depends on:** IG-2
**PRD:** @pm analysis 2026-03-14 (chat follow-up context amnesia)

---

## Business Value

After the initial design is created, every follow-up message ("flip the gradient", "make the CTA bigger") forces the AI to re-discover the design from scratch: `get_selection` → `get_node_info` → `scan_frame_structure` — 3 tool calls before touching anything. This causes:

- Slow responses (3 wasted iterations per follow-up)
- Wrong layer targeting (AI guesses which gradient to flip → picks the wrong one)
- Duplicate node creation (AI thinks a layer is missing and creates a new one instead of updating)

This story adds a **per-channel design session cache** to the relay. After the AI calls `scan_frame_structure`, the result is cached with the frameId. On the next turn — if the user still has the same frame selected (IG-2) — the layer map is injected directly into the message context. The AI walks into every follow-up already knowing exactly which nodeId is "the gradient overlay", "the CTA button", and "the headline". Zero re-discovery tool calls.

---

## Out of Scope

- Persistence across relay restarts (in-memory only — acceptable, Railway redeploys are infrequent)
- MCP Claude Code path (session state only applies to relay chat turns)
- UI changes to the plugin chat panel
- Session sharing across channels

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Cold cache on turn 1 — first follow-up still calls `scan_frame_structure` | Certain — session is empty until first scan completes | Expected and acceptable: turn 1 pays the discovery cost once, turn 2+ are cache hits. AC1 explicitly requires session is populated after the call. |
| Stale session if user switches to a different frame mid-conversation | Low — IG-2 passes `currentSelection` on every Send; session only injects when frameId matches | Session only injected when `currentSelection.frameId === session.frameId` — mismatch = no injection, no error |
| Layer summary string too long for context window | Low — compact format is ~200–400 chars for typical designs (10–20 layers) | Cap at 50 layers in summary; deeper trees truncated with `[... N more]` |
| `scan_frame_structure` result shape changes | Low | Parse defensively; if shape is unexpected, skip session update (no side effect) |

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento-ws-relay) + follow-up message with matching frame selected does NOT call scan_frame_structure + injected layer map includes nodeIds for all direct children of the frame
```

---

## Story

**As a** user in Figmento chat mode,
**I want** the AI to remember the layer structure of the design it just built,
**so that** follow-up messages like "flip the gradient" or "make the CTA bigger" are instant single-tool operations — not 3-step re-discovery loops.

---

## Description

### Problem

After `scan_frame_structure` runs during an initial design build, the relay throws that data away. The next turn starts blind. Every follow-up triggers the same discovery sequence:

```
User: "flip the gradient overlay"
    ↓
AI calls get_selection → finds frameId
    ↓
AI calls get_node_info → confirms dimensions
    ↓
AI calls scan_frame_structure → builds layer map
    ↓
AI finally calls set_style on the correct nodeId
```

3 wasted iterations, 3 round-trips to the plugin sandbox, and any ambiguity (two gradients, which one?) causes the AI to guess wrong.

### Solution

Cache the `scan_frame_structure` result in memory keyed by `channelId`. On the next turn, if IG-2 reports the same `frameId` in `currentSelection`, inject the cached layer map as a context prefix:

```
User selects "The Grove" frame → types "flip the gradient overlay" → hits Send
    ↓
IG-2: currentSelection = [{ id: "abc123", type: "FRAME", name: "The Grove", ... }]
    ↓
Relay: session cache has entry for channel → frameId matches → buildLayerContext()
    ↓
Message prefix injected:
  "[Layer map for "The Grove" (id: abc123): Background Image [IMAGE id:x1],
   Gradient Overlay [RECT id:x2], Top Gradient Overlay [RECT id:x3],
   Content Zone [FRAME id:x4] > Eyebrow Label [TEXT id:x5], ...]"
    ↓
AI calls set_style(nodeId: "x2") directly — no get_selection, no scan_frame_structure
```

---

### Part 1 — Session Types

Define a `DesignSession` interface and a module-level session map:

```typescript
interface DesignSession {
  frameId: string;
  frameName: string;
  width: number;
  height: number;
  layerSummary: string;   // compact flat string — see buildLayerSummary()
  updatedAt: number;      // Date.now() — for expiry
}

// Module-level, keyed by channelId
const designSessions = new Map<string, DesignSession>();

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
```

---

### Part 2 — Layer Summary Builder

```typescript
interface LayerNode {
  id: string;
  name: string;
  type: string;
  children?: LayerNode[];
}

function buildLayerSummary(nodes: LayerNode[], depth = 0, maxLayers = 50): { text: string; count: number } {
  const parts: string[] = [];
  let total = 0;

  for (const node of nodes) {
    if (total >= maxLayers) {
      parts.push(`[... more layers]`);
      break;
    }
    const prefix = depth > 0 ? '> '.repeat(depth) : '';
    const childResult = node.children?.length
      ? buildLayerSummary(node.children, depth + 1, maxLayers - total - 1)
      : { text: '', count: 0 };

    parts.push(`${prefix}${node.name} [${node.type} id:${node.id}]${childResult.text ? ` {${childResult.text}}` : ''}`);
    total += 1 + childResult.count;
  }

  return { text: parts.join(', '), count: total };
}
```

---

### Part 3 — Session Context Injector

```typescript
function buildLayerContext(session: DesignSession): string {
  return `[Layer map for "${session.frameName}" (id: ${session.frameId}, ${session.width}×${session.height}px): ${session.layerSummary}. Use these nodeIds to target layers directly — do NOT call scan_frame_structure or get_selection.]`;
}
```

---

### Part 4 — Capture `scan_frame_structure` Result

In `handleToolCall`, after the successful WS response for `scan_frame_structure`:

```typescript
// After: const data = await sendToPlugin(name, args);
// Add:
if (name === 'scan_frame_structure' && !is_error) {
  try {
    // scan_frame_structure result: { frameId, name, width, height, children: LayerNode[] }
    const result = data as Record<string, unknown>;
    const frameId = (result['frameId'] ?? result['id']) as string | undefined;
    const frameName = (result['name']) as string | undefined;
    const width = result['width'] as number | undefined;
    const height = result['height'] as number | undefined;
    const children = (result['children'] ?? result['nodes']) as LayerNode[] | undefined;

    if (frameId && children) {
      const { text: layerSummary } = buildLayerSummary(children);
      designSessions.set(channel, {
        frameId,
        frameName: frameName ?? 'Design Frame',
        width: width ?? 0,
        height: height ?? 0,
        layerSummary,
        updatedAt: Date.now(),
      });
    }
  } catch {
    // Parse failure — skip session update, no side effect
  }
}
```

---

### Part 5 — Inject at Turn Start

In `handleChatTurn`, after the IG-2 selection context is built, add the session context:

```typescript
// After: const selectionContext = buildSelectionContext(request.currentSelection);

const sessionContext = buildSessionContext(channel, request.currentSelection);

const message = [sessionContext, selectionContext, request.message]
  .filter(Boolean)
  .join('\n\n');
```

Where `buildSessionContext`:

```typescript
function buildSessionContext(
  channel: string,
  selection?: ChatTurnRequest['currentSelection'],
): string {
  // Expire stale sessions
  const session = designSessions.get(channel);
  if (!session) return '';
  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    designSessions.delete(channel);
    return '';
  }

  // Only inject when the selected frame matches the cached session
  if (!selection?.some(n => n.id === session.frameId)) return '';

  return buildLayerContext(session);
}
```

---

### Part 6 — Session Cleanup on Channel Disconnect

In `handleChatTurn`, if the relay throws "No plugin connected" (channel gone), delete the session:

```typescript
if (!relay.hasClientsInChannel(channel)) {
  designSessions.delete(channel);
  throw new Error(`No plugin connected to channel "${channel}". ...`);
}
```

---

## Acceptance Criteria

- [ ] AC1: After `scan_frame_structure` runs during a turn, the relay stores the layer summary for that channel
- [ ] AC2: On the next turn, if `currentSelection` includes the cached `frameId`, the layer map is prepended to the message text
- [ ] AC3: The injected layer map includes `nodeId` for every direct child of the frame (and their children, up to 50 nodes)
- [ ] AC4: When `currentSelection` is absent or contains a different `frameId`, no layer map is injected (no stale context)
- [ ] AC5: Sessions expire after 30 minutes of inactivity — expired sessions are not injected
- [ ] AC6: When the channel disconnects (no plugin connected), the session for that channel is deleted
- [ ] AC7: `scan_frame_structure` parse failure does not throw — session update is silently skipped
- [ ] AC8: `npm run build` clean in `figmento-ws-relay`

---

## Tasks

### Phase 1: Session Types + Map

- [x] Added `DesignSession` interface
- [x] Added `LayerNode` interface
- [x] Added module-level `designSessions` Map and `SESSION_TTL_MS` constant

---

### Phase 2: Layer Summary Builder

- [x] Added `buildLayerSummary(nodes, depth, remaining)` — recursive, 50-node cap via shared counter object
- [x] Added `buildLayerContext(session)` — formats compact context string
- [x] Added `buildSessionContext(channel, selection)` — TTL check + frameId match guard

---

### Phase 3: Capture `scan_frame_structure` Result

- [x] Added capture block after `sendToPlugin` succeeds for `scan_frame_structure`
- [x] Wrapped in try/catch — parse failure is silent

---

### Phase 4: Inject at Turn Start

- [x] `buildSessionContext()` called before message assembly
- [x] Message assembled as `[sessionContext, selectionContext, request.message].filter(Boolean).join('\n\n')`
- [x] `designSessions.delete(channel)` added on channel-not-found error

---

### Phase 5: Build Verification

```bash
cd figmento-ws-relay && npm run build
```

Must complete without errors.

---

## Dev Notes

- **`scan_frame_structure` result shape**: Call `scan_frame_structure` once manually in Figma and `console.log` the result to confirm the exact field names (`frameId` vs `id`, `children` vs `nodes`, etc.). The capture code uses both variants with `??` as fallback — if neither resolves, session update is skipped.
- **`layerSummary` is a flat string, not JSON** — injecting JSON into the message context adds token overhead and makes the AI treat it as structured data to parse. The compact string format is faster and more readable for the model.
- **Order of context prefixes**: session context first (most specific), then selection context (frame identity), then raw message. This gives the AI the layer map before it reads the user's request.
- **Do NOT cache `generate_design_image` results** — that tool runs in MCP mode, not relay chat. In relay chat mode, `scan_frame_structure` is the canonical layer discovery call.
- **Session key is `channelId`, not `frameId`** — one channel = one active design at a time. If the user switches to a different frame and `scan_frame_structure` runs on it, the session is overwritten for that channel.
- **The `buildLayerSummary` depth format** — use `> ` prefix per depth level in the text, not actual nesting. This keeps the summary on one line and avoids multi-line strings in the message prefix.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-ws-relay/src/chat/chat-engine.ts` | MODIFY | All changes — session map, capture, inject, cleanup |

---

## Definition of Done

- [x] `npm run build` clean in `figmento-ws-relay`
- [x] Follow-up turn with matching frame selected does NOT call `scan_frame_structure`
- [x] Layer map injected into message includes nodeIds for all direct children
- [x] Stale sessions (30 min) are not injected
- [x] No regression on turns without a frame selected

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @sm (River) | Story drafted from @pm analysis of chat follow-up context amnesia |
| 2026-03-14 | @po (Pax) | Validation 9/10 → GO. Fixed: S → M complexity (5 impl phases). Added cold-cache risk (turn 1 always pays discovery cost). Status Draft → Ready |
| 2026-03-14 | @dev (Dex) | Implemented all 5 phases. Single file change: chat-engine.ts. Counter-object pattern for 50-node cap (avoids closure mutation). Build clean. Status → Ready for Review |
| 2026-04-12 | @qa (Quinn) | **QA Gate: PASS.** All DoD items verified. `designSessions` Map at chat-engine.ts:213, session injection at :1411-1929, channel cleanup confirmed. **Note:** AC checkboxes were never updated by dev (process gap) but code matches all 8 ACs. Status: Ready for Review → Done. |
