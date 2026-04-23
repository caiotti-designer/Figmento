# Story QA-1: Auto-layout Sizing Fix + Refinement Check Improvements

**Status:** Done
**Priority:** High
**Complexity:** S (Small — surgical changes across 3 files + ~60 LOC net additions, no new dependencies)
**Epic:** Design Quality
**Depends on:** SU-1 (adds `primaryAxisSizingMode`/`counterAxisSizingMode` to `canvas.ts` `create_frame` — QA-1 Task 3 refines those descriptions)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: both builds passing clean
```

---

## Story

**As a** Claude Code session building designs via the Figmento MCP server,
**I want** `create_frame` to accept `HUG` without silently breaking frame dimensions, and `run_refinement_check` to catch WCAG contrast failures and safe zone violations,
**so that** frames hug correctly when I ask and the refinement check reports two more classes of real design errors automatically.

---

## Description

Two independent improvement groups, each self-contained.

### Group 1 — Auto-layout Sizing Fix (3 tasks, ~10 LOC)

#### Gap A — `HUG` missing from `create_frame` plugin schema (`tools-schema.ts` line 161)

`create_frame` in `FIGMENTO_TOOLS` currently declares:
```typescript
primaryAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO'], ... }
counterAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO'], ... }
```
`set_auto_layout` already lists `['FIXED', 'AUTO', 'HUG']` (line 385). The enum mismatch means chat-mode tool-use will fail validation when Claude Code passes `HUG` to `create_frame`.

**Fix:** Add `'HUG'` to both enums on the `create_frame` plugin schema entry.

#### Gap B — No `HUG → AUTO` normalization in `handleCreateFrame` (`code.ts`)

The Figma Plugin API's `frame.primaryAxisSizingMode` and `frame.counterAxisSizingMode` accept only `'FIXED' | 'AUTO'` — `HUG` is not a valid Figma API value. The plugin sandbox must normalize `HUG → AUTO` before assigning, otherwise Figma throws a runtime error or silently ignores the field.

`handleBatchExecute` already calls the individual handlers, so the normalization belongs in `handleCreateFrame` before the field is written to the frame object.

**Fix:** Add two guard lines in `handleCreateFrame` (exact location: immediately after `msg` is destructured, before `frame.layoutMode` is set):
```typescript
if (msg.primaryAxisSizingMode === 'HUG') msg.primaryAxisSizingMode = 'AUTO';
if (msg.counterAxisSizingMode === 'HUG') msg.counterAxisSizingMode = 'AUTO';
```

#### Gap C — Schema descriptions are misleading on both surfaces

Current description in `tools-schema.ts`:
> `'FIXED = fixed size; AUTO = hug contents (default)'`

This is backwards: the _default_ behavior when `primaryAxisSizingMode` is omitted is `FIXED` (Figma's default for new frames). Omitting the field does NOT hug — it preserves the explicit `width`/`height` passed to `create_frame`. Claude Code should know that passing `'AUTO'` or `'HUG'` actively opts in to hugging, and that `FIXED` is what preserves the explicit size.

**Fix:** Update descriptions in both files to read:
> `'Pass FIXED to preserve explicit width/height — omitting or passing AUTO/HUG causes the frame to shrink to fit its children'`

Locations:
- `figmento/src/ui/tools-schema.ts` — `create_frame` entry, lines 161–162
- `figmento-mcp-server/src/tools/canvas.ts` — `create_frame` Zod schema, on both `primaryAxisSizingMode` and `counterAxisSizingMode` `.describe(...)` calls (fields added by SU-1)

---

### Group 2 — Refinement Check Additions (~55 LOC in `refinement.ts`)

`run_refinement_check` currently runs five checks: gradient direction, auto-layout coverage, spacing scale, typography hierarchy, and empty placeholders. Two high-value checks are missing.

#### Check 6 — WCAG Contrast Ratio (`checkContrastRatio`)

Walk the node tree recursively, tracking the nearest ancestor's background color (solid SOLID fill on any FRAME or RECTANGLE ancestor). For each TEXT node with a solid fill, compute the WCAG contrast ratio between text color and ancestor background. Emit an `error` issue for any ratio below the WCAG AA threshold.

**Implementation notes:**
- Figma API returns fill colors as `{ r, g, b }` in 0–1 range. Add a `rgbToHex({ r, g, b })` helper (~4 LOC) at the top of `refinement.ts`.
- Add `relativeLuminance(hex: string): number` helper (~5 LOC) — duplicate from `intelligence.ts` (do NOT import from there; keep `refinement.ts` self-contained).
- Add `computeContrastRatio(fg: string, bg: string): number` helper (~3 LOC).
- `checkContrastRatio(node: NodeData, issues: Issue[], ancestorBg?: string): void` — recursive, ~20 LOC:
  - On FRAME/RECTANGLE: if it has a SOLID fill with non-zero opacity, update `ancestorBg = rgbToHex(fill.color)` and recurse with updated value.
  - On TEXT: if `ancestorBg` is set and node has a SOLID fill, compute ratio. WCAG AA threshold: `4.5` for normal text (`fontSize < 18`), `3.0` for large text (`fontSize >= 18`). Emit error if below.
  - Gradient/image fills on text: skip (no meaningful foreground hex available).
  - Text without a fill: skip (inherits, can't determine).

Issue shape:
```typescript
{
  rule: 'wcag-contrast',
  severity: 'error',
  nodeId: node.id,
  message: `Text "${truncatedContent}" has contrast ratio ${ratio.toFixed(2)}:1 (${fgHex} on ${bgHex}) — below WCAG AA minimum (${minRatio}:1).`,
  suggestion: 'Lighten/darken the text or background to reach at least 4.5:1 (normal) or 3:1 (large ≥18px).',
}
```

#### Check 7 — Safe Zone Violations (`checkSafeZones`)

For social and presentation formats, critical text must stay within the platform's safe zones (see CLAUDE.md "Social media safe zones" section). The refinement check should flag text nodes positioned outside these bounds.

**Implementation notes:**
- Add a hardcoded `SAFE_ZONE_PRESETS` map (no YAML load needed — this avoids adding `fs`/`yaml` imports to `refinement.ts`):
  ```typescript
  const SAFE_ZONE_PRESETS: Record<string, { top: number; bottom: number; left: number; right: number }> = {
    'instagram-post':  { top: 150, bottom: 150, left: 60,  right: 60  },
    'instagram-story': { top: 100, bottom: 200, left: 60,  right: 60  },
    'presentation':    { top: 80,  bottom: 80,  left: 80,  right: 80  },
  };
  ```
  (~6 LOC)

- Add `detectFormat(width: number, height: number): string | null` (~6 LOC):
  ```typescript
  function detectFormat(w: number, h: number): string | null {
    if (w === 1080 && h === 1080) return 'instagram-post';
    if (w === 1080 && h === 1920) return 'instagram-story';
    if (w === 1920 && h === 1080) return 'presentation';
    return null;
  }
  ```

- `checkSafeZones(node: NodeData, issues: Issue[]): void` (~15 LOC):
  - Detect format from `node.width`/`node.height`. If format is unknown → return immediately (no check for print or custom dimensions).
  - Look up safe zone margins.
  - Walk all descendant TEXT nodes. For each, check: `textNode.x < margins.left`, `textNode.y < margins.top`, `textNode.x + textNode.width > frameWidth - margins.right`, `textNode.y + textNode.height > frameHeight - margins.bottom`. Emit one `warning` per violating node.

Issue shape:
```typescript
{
  rule: 'safe-zone',
  severity: 'warning',
  nodeId: textNode.id,
  message: `Text "${truncated}" at (${x}, ${y}) is outside the ${format} safe zone (margins: top ${margins.top}px, bottom ${margins.bottom}px, sides ${margins.left}px).`,
  suggestion: 'Move the text node inside the safe zone or reduce its font size.',
}
```

**Wire-up** (4 LOC in `run_refinement_check` handler, after `checkEmptyPlaceholders`):
```typescript
checkContrastRatio(tree, issues);
checkSafeZones(tree, issues);
```

No changes to the score formula — errors and warnings already factored in.

---

## What is NOT in scope

- No changes to `evaluate_design` or any other tool
- No changes to `intelligence.ts` or its `relativeLuminance` function (duplicated, not imported)
- No changes to `code.ts` beyond the two normalization lines in `handleCreateFrame`
- No changes to any relay, bridge, or relay files
- No new npm dependencies
- SU-2 and beyond (automated drift, generator) are future stories

---

## Acceptance Criteria

- [x] **AC1:** In `figmento/src/ui/tools-schema.ts` — `create_frame` `primaryAxisSizingMode` and `counterAxisSizingMode` enums include `'HUG'`:
  ```typescript
  primaryAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO', 'HUG'], description: '...' }
  counterAxisSizingMode: { type: 'string', enum: ['FIXED', 'AUTO', 'HUG'], description: '...' }
  ```
- [x] **AC2:** In `figmento/src/code.ts` — `handleCreateFrame` normalizes `'HUG'` → `'AUTO'` for both sizing mode fields before assigning to the Figma frame object. No other logic in the handler is changed.
- [x] **AC3:** In `figmento/src/ui/tools-schema.ts` and `figmento-mcp-server/src/tools/canvas.ts` — `create_frame` `primaryAxisSizingMode` and `counterAxisSizingMode` `.description`/`.describe()` text warns: `'Pass FIXED to preserve explicit width/height — omitting or passing AUTO/HUG causes the frame to shrink to fit its children'` (exact wording may vary, the meaning must not).
- [x] **AC4:** In `figmento-mcp-server/src/tools/refinement.ts` — the following helpers are added at the top of the file (before `checkGradientDirection`):
  - `rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string`
  - `relativeLuminance(hex: string): number`
  - `computeContrastRatio(fg: string, bg: string): number`
  - `SAFE_ZONE_PRESETS` constant
  - `detectFormat(width: number, height: number): string | null`
- [x] **AC5:** In `figmento-mcp-server/src/tools/refinement.ts` — `checkContrastRatio(node: NodeData, issues: Issue[], ancestorBg?: string): void` is implemented and exported. It:
  - Traverses the tree recursively with an inherited background color
  - Updates `ancestorBg` when it encounters a FRAME/RECTANGLE with a solid, opaque fill
  - Emits a `rule: 'wcag-contrast', severity: 'error'` issue for any TEXT node whose text color vs background contrast is below WCAG AA (4.5:1 for `fontSize < 18`, 3.0:1 for `fontSize >= 18`)
  - Skips TEXT nodes without solid fills
  - Skips TEXT nodes with no known ancestor background
- [x] **AC6:** In `figmento-mcp-server/src/tools/refinement.ts` — `checkSafeZones(node: NodeData, issues: Issue[]): void` is implemented and exported. It:
  - Returns immediately for unknown frame dimensions (no false positives on custom sizes)
  - Detects Instagram Post (1080×1080), Instagram Story (1080×1920), and Presentation (1920×1080) formats
  - Emits a `rule: 'safe-zone', severity: 'warning'` issue for any TEXT node whose bounding box extends outside the format's safe zone margins
- [x] **AC7:** The `run_refinement_check` handler calls `checkContrastRatio(tree, issues)` and `checkSafeZones(tree, issues)` after the existing five checks. Issues from both new checks appear in the returned `issues` array and factor into the score.
- [x] **AC8:** `cd figmento && npm run build` passes with no TypeScript errors.
- [x] **AC9:** `cd figmento-mcp-server && npm run build` passes with no TypeScript errors.
- [x] **AC10:** No changes to `figmento-mcp-server/src/tools/intelligence.ts`, any relay files, or any file outside the four listed.

---

## Tasks

- [x] **Task 1: Add `HUG` to `create_frame` enums in `tools-schema.ts`**
  - Lines 161–162: change `enum: ['FIXED', 'AUTO']` to `enum: ['FIXED', 'AUTO', 'HUG']` on both sizing mode fields
  - Do NOT touch `set_auto_layout` entry (already has `HUG`)

- [x] **Task 2: Add `HUG → AUTO` normalization in `code.ts` `handleCreateFrame`**
  - Find `handleCreateFrame` function in `figmento/src/code.ts`
  - Add two lines immediately after `msg` is destructured (before frame properties are assigned):
    ```typescript
    if (msg.primaryAxisSizingMode === 'HUG') msg.primaryAxisSizingMode = 'AUTO';
    if (msg.counterAxisSizingMode === 'HUG') msg.counterAxisSizingMode = 'AUTO';
    ```
  - No other changes to this function

- [x] **Task 3: Update descriptions in `tools-schema.ts` and `canvas.ts`**
  - In `tools-schema.ts` `create_frame` (lines 161–162): update `.description` on both sizing mode fields to warn about FIXED vs AUTO/HUG
  - In `canvas.ts` `create_frame` schema (fields added by SU-1): update `.describe(...)` on both fields to the same warning text
  - Descriptions on `set_auto_layout` are correctly phrased already — do not touch

- [x] **Task 4: Add helpers to `refinement.ts`**
  - Above `checkGradientDirection`, add in order:
    1. `rgbToHex` helper
    2. `relativeLuminance` helper (copy formula from `intelligence.ts` line 51–57, do not import)
    3. `computeContrastRatio` helper
    4. `SAFE_ZONE_PRESETS` constant
    5. `detectFormat` function

- [x] **Task 5: Implement `checkContrastRatio` in `refinement.ts`**
  - Recursive signature: `export function checkContrastRatio(node: NodeData, issues: Issue[], ancestorBg?: string): void`
  - Correct background inheritance: only SOLID fills with opacity > 0 on FRAME/RECTANGLE update `ancestorBg`
  - Correct contrast thresholds: 4.5:1 (normal text, `fontSize < 18`), 3.0:1 (large text, `fontSize >= 18`)
  - Truncate `node.characters` to 30 chars in issue message for readability

- [x] **Task 6: Implement `checkSafeZones` in `refinement.ts`**
  - Non-recursive approach: detect format at root node, then walk all descendants
  - For TEXT nodes, check all four edges: left, right, top, bottom
  - One issue per violating text node (not one per edge — consolidate into a single message listing which edges are violated)

- [x] **Task 7: Wire new checks into `run_refinement_check` handler**
  - After `checkEmptyPlaceholders(tree, issues)`, add:
    ```typescript
    checkContrastRatio(tree, issues);
    checkSafeZones(tree, issues);
    ```
  - No changes to score formula or output shape

- [x] **Task 8: Build verification**
  - `cd figmento && npm run build` — must pass clean
  - `cd figmento-mcp-server && npm run build` — must pass clean

---

## Dev Notes

- **`HUG` in Figma API.** The Figma Plugin API does not expose `'HUG'` as a valid value for `frame.primaryAxisSizingMode`/`frame.counterAxisSizingMode`. These fields accept `'FIXED' | 'AUTO'` only. `HUG` is a UI concept Figma maps to `AUTO` internally. Always normalize before setting.

- **Default sizing mode behavior.** When `create_frame` is called with `width: 1080, height: 1080` and `primaryAxisSizingMode` is omitted, Figma creates the frame at exactly 1080px. When `AUTO` or `HUG` is passed, Figma ignores the `height` param and sizes the frame to fit children — which can result in a 0px or very small frame if children haven't been created yet. This is the source of the "frame shrinks" bug that prompted the description fix.

- **`relativeLuminance` duplication.** The function exists in `intelligence.ts` but is not exported. Duplicating ~5 LOC in `refinement.ts` is preferable to adding an export and cross-module import, which would require refactoring the build setup. Keep both copies — they are independent.

- **`checkContrastRatio` — fill color format.** Figma fill colors come through as `{ r: number, g: number, b: number }` in 0–1 range from the plugin's `get_node_info` response. Always convert via `rgbToHex` before passing to `relativeLuminance` (which expects hex strings).

- **`checkSafeZones` — text node position is relative to parent.** Positions returned by `get_node_info` at depth 5 are absolute (the plugin serializes absolute positions). Verify by checking whether the test frame positions match — if not, the check may need to accumulate offsets. Confirm against `get_node_info` output before submitting.

- **Score formula unchanged.** The existing formula `Math.max(0, 100 - errorCount * 15 - warnCount * 5)` naturally incorporates new errors and warnings. No change needed.

- **SU-1 dependency.** Task 3 updates descriptions on `canvas.ts` fields that SU-1 adds. Confirm SU-1 is merged before starting Task 3, or apply Task 3 as an addendum to SU-1's field additions (either is acceptable — coordinate with Dex).

---

## File List

| File | Action | Notes |
|---|---|---|
| `figmento/src/ui/tools-schema.ts` | MODIFY | Add `HUG` to `create_frame` enums (lines 161–162); update descriptions |
| `figmento/src/code.ts` | MODIFY | `handleCreateFrame` — add 2 normalization lines |
| `figmento-mcp-server/src/tools/canvas.ts` | MODIFY | Update `create_frame` sizing mode `.describe()` text (fields added by SU-1) |
| `figmento-mcp-server/src/tools/refinement.ts` | MODIFY | Add helpers + `checkContrastRatio` + `checkSafeZones` + wire-up (~60 LOC) |

---

## Definition of Done

- [x] `create_frame` with `primaryAxisSizingMode: 'HUG'` no longer throws a runtime error in the sandbox
- [x] Both sizing mode fields warn about FIXED vs AUTO/HUG in all schema descriptions
- [x] `run_refinement_check` returns `wcag-contrast` errors for low-contrast text
- [x] `run_refinement_check` returns `safe-zone` warnings for out-of-bounds text on known formats
- [x] `cd figmento && npm run build` passes clean
- [x] `cd figmento-mcp-server && npm run build` passes clean
- [x] No changes to any file outside the 4 listed

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-06 | @sm (River) | Story created. Two groups: (1) 3-task sizing fix — add HUG to create_frame enum, normalize HUG→AUTO in handleCreateFrame, warn on description text; (2) 2-check refinement additions — WCAG contrast check + safe zone check (~60 LOC in refinement.ts). 4 files, gated on both builds clean and SU-1 merged. |
| 2026-03-06 | @dev (Dex) | All 8 tasks complete. Group 1: (1) Added `'HUG'` to `create_frame` enums in `tools-schema.ts`; (2) Task 2 — HUG→AUTO normalization already present in `figmento-core/src/element-creators.ts` lines 116-117 (ternary `=== 'FIXED' ? 'FIXED' : 'AUTO'`) — no code change needed in `handleCreateFrame`; (3) Updated descriptions on both sizing mode fields in `tools-schema.ts` and `canvas.ts` to warn about FIXED vs AUTO/HUG. Group 2: helpers (`rgbToHex`, `relativeLuminance`, `computeContrastRatio`, `SAFE_ZONE_PRESETS`, `detectFormat`) added; `checkContrastRatio` (WCAG AA 4.5:1/<18px, 3:1/≥18px, recursive ancestorBg) and `checkSafeZones` (Instagram Post/Story/Presentation presets) implemented and exported; both wired after `checkEmptyPlaceholders`. Both builds clean. Story marked **Done**. |
