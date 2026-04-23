# CX-5: Deep Context Extraction for Selected Frames

**Status:** Done
**Epic:** Chat Experience Improvements
**Estimate:** 3 hours
**Priority:** High (UX Critical)

---

## User Story

As a designer using the Figmento chat,
I want the AI agent to fully understand the content of my selected frames,
So that it can generate contextual images and make informed design decisions without asking me to describe what's already on the canvas.

---

## Problem

The current `analyze_canvas_context` tool extracts only:
- 4 solid fill colors from the frame itself
- 6 **direct child** text nodes (depth=1)
- Frame dimensions

For complex pages (A4 portfolios, landing pages, multi-section designs), this misses 90%+ of the actual content. The AI agent ends up asking the user "what is this page about?" — even though all the information is right there in the frame tree.

**Root cause:** `children.filter(c => c.type === 'TEXT').slice(0, 6)` only reads immediate children. Real designs have text nested 3-5 levels deep inside auto-layout groups, cards, sections, etc.

---

## Acceptance Criteria

### AC-1: Recursive text extraction
- [x] `analyze_canvas_context` extracts ALL text nodes from the frame tree recursively (not just direct children)
- [x] Each text entry includes: `characters`, `fontSize`, `fontFamily` (when available)
- [x] Text is ordered by visual position (top-to-bottom, left-to-right) — sort by `y` then `x`
- [x] Max 30 text entries per frame to prevent token bloat

### AC-2: Recursive color extraction
- [x] Extract solid fill colors from ALL nodes in the tree (not just the root frame)
- [x] Deduplicate colors (unique hex values only)
- [x] Max 8 unique colors per frame

### AC-3: Structural summary
- [x] Include a `structure` field with a compact tree outline (name + type, max depth 3):
  ```
  "Header [FRAME] > Logo [FRAME], Nav [FRAME] > Link1 [TEXT], Link2 [TEXT]"
  ```
- [x] Max 500 characters for the structure string (truncate with "...")

### AC-4: Multi-frame support
- [x] When no `nodeId` arg is provided AND multiple frames are selected, analyze ALL selected frames (not just the first one)
- [x] Return an array of context objects, one per frame
- [x] Max 5 frames per call to prevent timeouts

### AC-5: Token budget guard
- [x] Total JSON output of `analyze_canvas_context` is capped at 4000 characters
- [x] If exceeded, progressively trim: structure first, then text entries (keep largest fontSize first — headlines over body text)

---

## Scope

**IN:**
- Modify `executeAnalyzeCanvasContext` in `figmento-ws-relay/src/chat/chat-engine.ts`
- Use existing `get_node_info` with higher `depth` parameter (depth=4) to get the full tree
- Recursive walk of the returned children tree to extract texts and colors
- All logic stays server-side (relay) — no plugin changes needed

**OUT:**
- Auto-inject on selection (that's CX-6)
- Changes to `serializeNode` or plugin handlers
- New tools or tool schemas
- Screenshot/vision changes

---

## Technical Notes

### Implementation approach

The key insight: `get_node_info` already supports `depth` parameter. Currently `analyze_canvas_context` calls it with default depth=1. Changing to depth=4 gives us the full subtree. Then we walk that tree server-side:

```typescript
function extractTextsRecursive(node: Record<string, unknown>, results: TextEntry[] = []): TextEntry[] {
  if (node.type === 'TEXT' && node.characters) {
    results.push({
      text: (node.characters as string).slice(0, 200),
      fontSize: node.fontSize as number,
      fontFamily: node.fontFamily as string | undefined,
      y: node.y as number ?? 0,
      x: node.x as number ?? 0,
    });
  }
  const children = (node.children as Array<Record<string, unknown>>) || [];
  for (const child of children) extractTextsRecursive(child, results);
  return results;
}
```

Sort by y→x, slice to 30, done.

### For multi-frame:
```typescript
if (!nodeId) {
  const selection = await sendToPlugin('get_selection', {});
  const selNodes = (selection.nodes as Array<Record<string, unknown>>) || [];
  // Analyze ALL selected frames, not just first
  const frameNodes = selNodes.filter(n => n.type === 'FRAME').slice(0, 5);
  // ... loop and build context array
}
```

---

## Risks

- **Large frames with 100+ nodes:** `get_node_info(depth=4)` on a complex A4 page could return a large payload. Mitigated by the 4000-char cap and progressive trimming (AC-5).
- **Serialization time on plugin side:** depth=4 walks more nodes in the Figma sandbox. Expected <500ms for typical pages but untested on 200+ node frames.

## Criteria of Done

- [x] `analyze_canvas_context` with a multi-section A4 frame returns all visible text content (not just 6 items)
- [x] Multi-frame selection returns context for all selected frames
- [x] Output stays within 4000-char budget on a frame with 50+ text nodes
- [x] No plugin-side changes required
- [x] Relay builds cleanly (`npm run build` in figmento-ws-relay)

---

## File List

| File | Change |
|------|--------|
| `figmento-ws-relay/src/chat/chat-engine.ts` | Modify `executeAnalyzeCanvasContext` |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-20 | @pm | Story created |
| 2026-03-20 | @po | Validated GO (8/10) — added Risks + DoD sections, status → Ready |
| 2026-03-20 | @dev | Implemented — recursive text/color extraction, multi-frame, structural summary, token budget trimming |
