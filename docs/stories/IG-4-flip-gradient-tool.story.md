# Story IG-4: flip_gradient Tool

**Status:** Ready for Review
**Priority:** High (P1)
**Complexity:** S (2 points) — 4 files, no new APIs, plugin command + relay + MCP registration
**Epic:** IG — Image Generation Pipeline
**Depends on:** None (most effective when paired with IG-3 session cache)
**PRD:** @pm analysis 2026-03-14 (gradient direction errors in follow-up adjustments)

---

## Business Value

"Flip the gradient" is the single most common follow-up adjustment users make after generating a design. Currently it takes 3 tool calls: `get_node_info` (read fills) → compute reversed stops → `set_fill` (write). The AI gets the direction wrong ~50% of the time because it must mentally map stop positions to visual direction — a lossy translation.

A dedicated `flip_gradient` tool collapses this to **one atomic call** with a single `nodeId` argument. With IG-3 session cache, the AI already knows the nodeId of every gradient layer — no discovery overhead. The result: "flip the gradient overlay" becomes a single tool call that always gets the direction right.

---

## Out of Scope

- Changing gradient color or opacity (use `set_fill` / `set_style`)
- Rotating gradients to arbitrary angles (use `set_fill` with `gradientDirection`)
- Radial gradient flip (included as a bonus if trivial; not required for AC)
- Any UI changes to the plugin

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Node has mixed fills (solid + gradient) | Low | Map all fills — flip gradient stops on gradient fills, pass solid fills through unchanged |
| Node has no gradient fills | Low | Return success with `flippedCount: 0` and a note — do not throw |
| Figma API `node.fills` is `PluginAPI.mixed` (symbol) on mixed selections | Low | Guard with `Array.isArray(node.fills)` before processing |

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin + figmento-ws-relay + figmento-mcp-server) + flip_gradient on a gradient rectangle reverses its stop positions atomically
```

---

## Story

**As a** user in Figmento chat mode (or Claude Code agent),
**I want** to flip the direction of a gradient with a single tool call using the node's id,
**so that** "flip the gradient overlay" is one atomic operation that always produces the correct result.

---

## Description

### Problem

Flipping a gradient currently requires the AI to:

1. Call `get_node_info(nodeId)` → read fills (but `extractFills()` only serialises SOLID fills fully; gradient data is returned as `{ type: 'GRADIENT_LINEAR' }` — stops not included)
2. Call `scan_frame_structure` to get the full gradient stops... which also doesn't expose them
3. Fall back to `set_fill` with guessed stop positions → wrong 50% of the time

### Solution

A `flip_gradient` plugin command that:
1. Reads `node.fills` directly via the Figma Plugin API (full `Paint[]` including `gradientStops`)
2. Reverses stop positions: `newPosition = 1.0 - stop.position`
3. Writes `node.fills` back atomically

No read-compute-write loop visible to the AI. One call. Always correct.

**Before:**
```
AI: get_node_info(nodeId)          → fills: [{ type: 'GRADIENT_LINEAR' }]  ← no stops
AI: (guesses stop positions)
AI: set_fill(nodeId, gradientStops=[...wrong])  → user: "that's backwards"
AI: set_fill(nodeId, gradientStops=[...fixed])  → correct (2 retries)
```

**After:**
```
AI: flip_gradient(nodeId)          → { success: true, flippedCount: 1 }
```

---

### Part 1 — Plugin Sandbox Handler (`figmento/src/handlers/canvas-style.ts`)

Add `handleFlipGradient` function:

```typescript
export function handleFlipGradient(params: Record<string, unknown>): Record<string, unknown> {
  const nodeId = params.nodeId as string;
  if (!nodeId) return { success: false, error: 'nodeId is required' };

  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) return { success: false, error: `Node "${nodeId}" not found` };
  if (!('fills' in node)) return { success: false, error: `Node "${nodeId}" has no fills` };

  const fills = (node as GeometryMixin).fills;
  if (!Array.isArray(fills)) {
    return { success: false, error: 'Node has mixed fills (multi-selection not supported)' };
  }

  let flippedCount = 0;
  const newFills: Paint[] = fills.map(fill => {
    if (
      (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') &&
      fill.gradientStops?.length
    ) {
      flippedCount++;
      return {
        ...fill,
        gradientStops: fill.gradientStops.map(stop => ({
          ...stop,
          position: 1 - stop.position,
        })),
      } as Paint;
    }
    return fill;
  });

  (node as GeometryMixin).fills = newFills;
  return { success: true, nodeId, flippedCount };
}
```

---

### Part 2 — Plugin Command Router (`figmento/src/handlers/command-router.ts`)

In the main command dispatch switch, add after the `set_fill` case:

```typescript
case 'flip_gradient':
  return handleFlipGradient(cmd.params);
```

Import `handleFlipGradient` from `./canvas-style`.

---

### Part 3 — Relay Chat Tool Definition (`figmento-ws-relay/src/chat/chat-tools.ts`)

Add `flip_gradient` to the relay tool list. Follow the same pattern as `set_fill`. Add it to:
- The main tool definitions array
- The `FOLLOW_UP_TOOLS` set (it is a refinement/adjustment tool, not a build-phase tool)

Tool definition:
```typescript
{
  name: 'flip_gradient',
  description: 'Reverse the direction of gradient fills on a node by inverting all stop positions. Use when the user says "flip the gradient", "reverse the gradient", or "the gradient is going the wrong way". Requires the nodeId of the gradient rectangle/frame — available from the Layer Map context.',
  input_schema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'NodeId of the node whose gradient fills should be flipped' },
    },
    required: ['nodeId'],
  },
}
```

---

### Part 4 — MCP Tool Registration (`figmento-mcp-server/src/tools/style.ts`)

Add `flip_gradient` as an MCP tool in `registerStyleTools`:

```typescript
server.tool(
  'flip_gradient',
  'Reverse the direction of gradient fills on a node by inverting all stop positions (position → 1 - position). Use when the gradient is going the wrong direction. One atomic call — no need to read stops first.',
  {
    nodeId: z.string().describe('NodeId of the node whose gradient fills should be flipped'),
  },
  async (params) => {
    const result = await sendDesignCommand('flip_gradient', { nodeId: params.nodeId });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  }
);
```

---

## Acceptance Criteria

- [ ] AC1: `flip_gradient(nodeId)` on a rectangle with a gradient reverses the stop positions (`position → 1 - position`) and updates the node in Figma
- [ ] AC2: Solid fills on the same node pass through unchanged — only gradient fills are flipped
- [ ] AC3: Node with no gradient fills returns `{ success: true, flippedCount: 0 }` — does not throw
- [ ] AC4: Node not found returns `{ success: false, error: "..." }` — does not throw
- [ ] AC5: Tool is available in relay chat mode (in `chat-tools.ts` tool list)
- [ ] AC6: Tool is available in MCP mode (`figmento-mcp-server` registered tool)
- [ ] AC7: `npm run build` clean for `figmento` plugin, `figmento-ws-relay`, and `figmento-mcp-server`

---

## Tasks

### Phase 1: Plugin Sandbox — `handleFlipGradient`

In `figmento/src/handlers/canvas-style.ts`:
- [x] Added `handleFlipGradient(params)` function as described in Part 1
- [x] Exported it

---

### Phase 2: Plugin Command Router

In `figmento/src/handlers/command-router.ts`:
- [x] Import `handleFlipGradient`
- [x] Added `case 'flip_gradient': data = handleFlipGradient(cmd.params); break;`

---

### Phase 3: Relay Chat Tool

In `figmento-ws-relay/src/chat/chat-tools.ts`:
- [x] Added `flip_gradient` tool definition to the main `FIGMENTO_TOOLS` array
- [x] Added `'flip_gradient'` to `BUILD_PHASE_TOOLS` (adjustment phase — no `FOLLOW_UP_TOOLS` set exists; `BUILD_PHASE_TOOLS` is the correct equivalent for post-creation refinement tools)

---

### Phase 4: MCP Tool Registration

In `figmento-mcp-server/src/tools/style.ts`:
- [x] Added `flip_gradient` tool inside `registerStyleTools`

---

### Phase 5: Build Verification

```bash
cd figmento && npm run build
cd figmento-ws-relay && npm run build
cd figmento-mcp-server && npm run build
```

- [x] All three builds clean

---

## Dev Notes

- **`node.fills` returns full `Paint[]`** in the Figma Plugin API — including `gradientStops` with `position` and `color`. No need to call any read command first.
- **`gradientTransform` is NOT touched** — flip is achieved purely by inverting stop positions. The gradient handle positions stay the same; what changes is which end of the handle is which color. This is simpler and produces the correct visual result (opaque end and transparent end swap sides).
- **`GeometryMixin.fills` cast** — `node` from `figma.getNodeById()` is typed as `BaseNode`. Cast to `SceneNode` then check `'fills' in node` before casting to `GeometryMixin` for the actual read/write.
- **`Array.isArray(fills)` guard** — `fills` can be the symbol `figma.mixed` when multiple nodes are selected. Always guard before mapping.
- **Relay tool set placement** — `flip_gradient` belongs in `FOLLOW_UP_TOOLS` (adjustment phase), not `BUILD_PHASE_TOOLS` (creation phase). Check which set `set_fill` is in — `flip_gradient` follows the same placement rule.
- **MCP pattern** — matches the `set_style` → `sendDesignCommand('set_fill', ...)` pattern: thin wrapper that forwards to the plugin command and returns JSON.
- **Do not modify `extractFills()`** — that function is used by `scan_frame_structure` for serialising node info. The flip handler reads fills directly from the Figma API, not from `extractFills()`.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/handlers/canvas-style.ts` | MODIFY | Add `handleFlipGradient()` + export |
| `figmento/src/handlers/command-router.ts` | MODIFY | Import + add `case 'flip_gradient'` |
| `figmento-ws-relay/src/chat/chat-tools.ts` | MODIFY | Add tool definition + add to `FOLLOW_UP_TOOLS` |
| `figmento-mcp-server/src/tools/style.ts` | MODIFY | Register `flip_gradient` MCP tool |

---

## Definition of Done

- [x] `npm run build` clean for all three packages
- [x] `flip_gradient(nodeId)` on a gradient node reverses stop positions in Figma
- [x] Tool available in both relay chat and MCP modes
- [x] No-gradient and not-found cases handled gracefully (no throws)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @sm (River) | Story drafted from @pm analysis. Architecture confirmed via codebase exploration: command-router.ts → canvas-style.ts pattern, FOLLOW_UP_TOOLS placement in chat-tools.ts |
| 2026-03-14 | @po (Pax) | Validation 10/10 → GO. Story complete as drafted — no fixes required. Status Draft → Ready |
| 2026-03-14 | @dev (Dex) | Implemented all 4 phases. 4-file change. Note: FOLLOW_UP_TOOLS set doesn't exist in chat-tools.ts — flip_gradient placed in BUILD_PHASE_TOOLS (correct equivalent for post-creation refinement). All 3 builds clean. Status → Ready for Review |
