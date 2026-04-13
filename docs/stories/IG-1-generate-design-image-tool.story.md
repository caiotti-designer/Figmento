# Story IG-1: generate_design_image — Image-First Design Tool

**Status:** Done
**Priority:** High (P1)
**Complexity:** M (3 points) — New MCP tool module, Gemini API integration, frame context resolution
**Epic:** IG — Image Generation Pipeline
**Depends on:** None
**PRD:** @architect + @pm design session 2026-03-14

---

## Business Value

Designers and Claude Code agents currently spend 3–5 tool calls just to get an image into Figma. The image arrives as an afterthought — placed over an already-structured layout — producing designs that look generated, not composed. By making image generation the **first step**, the design is built around the image the way a real designer would work. This reduces the tool call count from 10+ to 6, eliminates the manual file copy step entirely, and produces visually stronger results because the composition is intentional from the start.

---

## Out of Scope

The following is explicitly **not part of this story** and will be addressed in IG-2:

- **Chat mode selection snapshot** — Plugin UI sending `currentSelection` alongside chat messages so the relay's chat engine knows the active frame without Claude calling `get_selection`. This is a separate relay + plugin UI concern.
- Any changes to existing tools (`batch_execute`, `place_generated_image`, `fetch_placeholder_image`)
- Blueprint/reference system modifications
- Design system token changes

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `gemini-3-pro-image-preview` model name is wrong or access-restricted | Medium — name taken from `mcp-image` source, not official docs | Fallback to `fetch_placeholder_image` covers runtime failure. Log `[Figmento] Gemini fallback triggered: {error.message}` on stderr so @dev can diagnose. |
| `IMAGE_OUTPUT_DIR` (`./output`) does not exist on first run | Medium — not created by default on fresh installs | Add `fs.mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true })` before saving image buffer. |
| Gemini image generation latency (3–8s) approaches Railway WS timeout | Low — relay timeout is 30s | No action needed, but @dev should note this if Railway WS timeout is ever reduced. |

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento-mcp-server) + generate_design_image places image in Figma in a single call + CLAUDE.md updated to 6-step workflow
```

---

## Story

**As a** Claude Code agent using Figmento,
**I want** a single `generate_design_image` call to create a composition-aware background image and place it in Figma,
**so that** I can build a complete design in 6 steps without manual image copy steps, file path management, or frame creation boilerplate.

---

## Description

### Problem

The current image generation pipeline requires 3 manual steps:

1. Call external `mcp-image` MCP → saves to `generated-images/`
2. Manually copy file to `./output/`
3. Call `place_generated_image(filePath)`

In practice, Claude also has to run 10+ planning steps (blueprints, references, design systems) before generating anything. The result is slow, error-prone, and over-engineered.

The Figmento design result looks technically correct but not like a designer made it — because the image is placed as an afterthought instead of being the foundation.

### Solution

A new `generate_design_image` tool that acts as the **first creative decision** in every design:

1. **Resolves the target frame** automatically — no manual frame management needed
2. **Builds a composition-aware Gemini prompt** internally — encodes UX/design knowledge about text zones, visual weight, and format constraints
3. **Calls Gemini API directly** via `@google/genai` (already in node_modules via `mcp-image`)
4. **Places the image in Figma immediately** — saves to `IMAGE_OUTPUT_DIR`, places via `create_image` command, returns `nodeId`

One call. No copy steps. No external MCP dependency.

---

### Frame Auto-Resolution Logic

When `frameId` is not passed, the tool resolves the target frame in this priority order:

```
1. frameId param explicitly passed → use it directly
2. Call get_selection() → is result a FRAME type?
     YES → use selected frame id + read its width/height
     NO (group, component, text, empty) → proceed to 3
3. format param provided → look up dimensions from size presets
     → call create_frame(width, height, name, backgroundColor)
     → use newly created frame
```

If none of the above resolves, return a clear error: `"No target frame found. Pass frameId, select a frame in Figma, or provide a format."`

---

### Composition-Aware Prompt Builder

The tool encodes graphic design composition knowledge. Given `format + mood`, it infers a `textZone` and appends a composition constraint to the Gemini prompt:

**Format → Default Text Zone mapping:**

| Format | Default textZone | Rationale |
|--------|-----------------|-----------|
| `instagram_portrait`, `story`, `tiktok` | `bottom-40%` | Tall format, CTA lives at bottom |
| `instagram_square`, `facebook_post` | `bottom-30%` | Square, headline at bottom |
| `pinterest` | `bottom-35%` | Pin description zone |
| `hero`, `landing_hero` | `bottom-40%` | Web hero — headline below fold |
| `facebook_cover`, `twitter_header`, `linkedin_banner` | `left-40%` | Wide banner — text on left |
| `landscape`, `youtube_thumbnail` | `bottom-25%` | Short text strip |

**Text Zone → Composition Prompt Suffix:**

| textZone | Appended to Gemini prompt |
|----------|--------------------------|
| `bottom-40%` | `Visual subject and detail fills upper 60% of frame. Lower 40% transitions to dark, softly defocused — clean negative space for headline and CTA text overlay. No busy details or high-contrast elements in the lower portion.` |
| `bottom-35%` | `Subject fills upper 65%. Bottom 35% is dark, low-contrast, slightly blurred — text-friendly negative space.` |
| `bottom-30%` | `Visual interest concentrated in upper 70%. Bottom strip is dark and minimal for text.` |
| `bottom-25%` | `Subject fills most of frame. A thin dark band at the bottom for short headline text.` |
| `left-40%` | `Subject and visual complexity sits in right 60% of frame. Left 40% is dark, minimal, breathable — reserved for headline and body copy.` |

The user (or Claude) can override `textZone` explicitly. If provided, the tool uses that value instead of inferring from format.

---

### Gemini API Integration

- **SDK:** `@google/genai` — already installed as transitive dependency via `mcp-image`. Add as direct dependency in `package.json`.
- **API Key:** `process.env.GEMINI_API_KEY` — already set in `.env`
- **Model:** `gemini-3-pro-image-preview` (same model used by `mcp-image`)
- **Output path:** Save generated image buffer to `IMAGE_OUTPUT_DIR/figmento-generated-{timestamp}.png`
- **Placement:** Call `sendDesignCommand('create_image', { imageData: base64, parentId: frameId, width, height, x: 0, y: 0, scaleMode: 'FILL' })`
- **Fallback:** If Gemini call fails, call `fetch_placeholder_image` with the brief as keywords and place that instead. Never return an error when a fallback image is available.

---

### Tool Schema

```typescript
generate_design_image({
  brief: string,           // Required. Design brief (e.g. "hippie coffee shop warm earthy vintage")
  format?: string,         // Optional. Format name from size presets (e.g. "instagram_portrait")
  mood?: string,           // Optional. Mood hint for color/atmosphere (e.g. "earthy", "luxury", "playful")
  textZone?: string,       // Optional. Override text zone ("bottom-40%", "left-40%", etc.)
  frameId?: string,        // Optional. Target frame nodeId. If omitted, auto-resolved from selection.
  name?: string,           // Optional. Frame name if a new frame is created. Defaults to brief truncated.
})
```

**Returns:**
```typescript
{
  frameId: string,         // The frame that was used or created
  imageNodeId: string,     // The placed image node id
  width: number,
  height: number,
  isNewFrame: boolean,     // true if the tool created the frame, false if it used an existing one
  textZone: string,        // The text zone used (for Claude's awareness when adding text)
  geminiPrompt: string,    // The full prompt sent to Gemini (for debugging/transparency)
}
```

---

### New Default Workflow (CLAUDE.md)

Replace the current 10+ step standard workflow with:

```
1. connect_to_figma (skip if already connected)
2. get_design_guidance(aspect="size") — only if format dimensions are unknown
3. generate_design_image(brief, format, mood) → frameId, imageNodeId, textZone
4. [Optional] set_fill gradient overlay if text contrast needs help
5. batch_execute → headline + subheadline + CTA in one call
6. run_refinement_check → fix any flagged issues → done
```

Steps 1-2 collapse to nothing when: already connected + format is known (e.g. user says "instagram post"). In that case the workflow starts at step 3.

---

## Acceptance Criteria

- [x] AC1: `generate_design_image(brief="coffee shop", format="instagram_portrait")` places an image in a new 1080×1350 frame with no manual steps
- [x] AC2: With a FRAME selected in Figma and no `frameId` passed, the tool uses the selected frame's id and dimensions (not creating a new frame)
- [x] AC3: With nothing selected and no `frameId` passed, the tool creates a new frame using `format` preset dimensions
- [x] AC4: The Gemini prompt includes a composition constraint suffix derived from `format` (or the explicit `textZone` override)
- [x] AC5: `GEMINI_API_KEY` missing → tool returns a clear error: `"GEMINI_API_KEY not set in environment. Add it to .env to use image generation."`
- [x] AC6: Gemini API failure → tool falls back to `fetch_placeholder_image` and still places an image (does not throw)
- [x] AC7: Response includes `textZone` field so Claude knows where to place text without guessing
- [x] AC8: Response includes `geminiPrompt` field for transparency/debugging
- [x] AC9: `npm run build` clean in `figmento-mcp-server`
- [x] AC10: CLAUDE.md default workflow section updated to the 6-step flow
- [x] AC11: When Gemini fails and fallback image is used, response still returns success with `imageNodeId` (no error thrown) and includes `fallbackUsed: true`

---

## Tasks

### Phase 1: Add Direct Dependency

In `figmento-mcp-server/package.json`:
- Add `"@google/genai": "*"` to `dependencies` (use same version already installed transitively)

Run `npm install` in `figmento-mcp-server/`.

---

### Phase 2: Create `image-gen.ts`

Create `figmento-mcp-server/src/tools/image-gen.ts`:

**Section 1 — Composition tables** (static maps, no imports needed):
- `FORMAT_TEXT_ZONE_MAP: Record<string, string>` — format → textZone
- `TEXT_ZONE_SUFFIX_MAP: Record<string, string>` — textZone → Gemini prompt suffix

**Section 2 — `buildGeminiPrompt(brief, mood, textZone): string`**:
```typescript
function buildGeminiPrompt(brief: string, mood?: string, textZone?: string): string {
  const moodClause = mood ? `, ${mood} mood and atmosphere` : '';
  const suffix = textZone ? TEXT_ZONE_SUFFIX_MAP[textZone] ?? '' : '';
  return `High quality photograph or illustration: ${brief}${moodClause}. ${suffix} Professional quality, suitable for social media or digital advertising.`.trim();
}
```

**Section 3 — `resolveFrame(frameId, format, name, sendDesignCommand)`**:
```typescript
async function resolveFrame(...): Promise<{ frameId: string, width: number, height: number, isNewFrame: boolean }>
```
- If `frameId` passed → call `get_node_info` to read width/height, return
- Else call `get_selection` → if result has type FRAME, use it
- Else if `format` provided → look up from size presets via `get_design_guidance` → create frame
- Else throw descriptive error

**Section 4 — `callGemini(prompt, apiKey)`**:
```typescript
async function callGemini(prompt: string, apiKey: string): Promise<Buffer>
```
- Init `GoogleGenAI({ apiKey })`
- Call `models.generateContent` with `responseModalities: ['IMAGE']`
- Extract image buffer from response
- Throws on failure (caller handles fallback)

**Section 5 — `registerImageGenTools(server, sendDesignCommand)`**:
- Register `generate_design_image` tool
- Full orchestration: resolve frame → infer textZone → build prompt → call Gemini → save to IMAGE_OUTPUT_DIR → sendDesignCommand create_image → return result
- Wrap Gemini call in try/catch → on failure call `fetch_placeholder_image` as fallback

---

### Phase 3: Register in Server

In `figmento-mcp-server/src/server.ts`:
- Import `registerImageGenTools` from `./tools/image-gen`
- Add call after existing tool registrations

---

### Phase 4: Update CLAUDE.md

In `.claude/CLAUDE.md`, find the `### Standard Design Workflow` section and replace the 9-step list with the new 6-step workflow. Keep the Blueprint-First and Figma-Native sections below it unchanged — they remain valid for power users.

---

## Dev Notes

- **`@google/genai` is already installed** as a transitive dep of `mcp-image`. Adding it to `package.json` just makes the dependency explicit — no new download.
- **`IMAGE_OUTPUT_DIR`** is defined in `canvas.ts` as `process.env.IMAGE_OUTPUT_DIR || path.join(process.cwd(), 'output')`. Import and reuse it — do not redefine.
- **Frame dimensions for new frame creation** — do NOT call `get_design_guidance` via `sendDesignCommand`. `get_design_guidance` is a server-side intelligence tool that reads YAML directly — it is not a plugin command and will time out if sent to the plugin. Instead: hard-code common format dimensions directly in `FORMAT_TEXT_ZONE_MAP` by extending it to a `FORMAT_MAP` with `{ textZone, width, height }` per format key. For unknown formats, fall back to `1080×1080` (square default) and log a warning.
- **Model name is `gemini-3-pro-image-preview`** — same as `mcp-image`'s `geminiClient.js` line 75. Do not change it.
- **The `textZone` return value is critical** — Claude needs it to know where to position text in the next `batch_execute` call. Always include it in the response even when `frameId` was passed explicitly.
- **`scaleMode: 'FILL'`** for placement — image should fill the frame edge to edge. The composition constraint ensures the image was generated with that assumption.
- **Fallback placement** — `fetch_placeholder_image` returns `{ base64, width, height }`. Pass `base64` directly to `create_image`. The fallback should be silent — just place it without Claude knowing it failed (unless Claude explicitly checks).
- **Do not use `place_generated_image`** — that tool validates file paths within IMAGE_OUTPUT_DIR and requires disk I/O. For the Gemini path, call `sendDesignCommand('create_image', ...)` directly with the base64 buffer after saving. For the fallback path, same direct approach.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/image-gen.ts` | CREATE | New tool module — full implementation |
| `figmento-mcp-server/src/server.ts` | MODIFY | Import + register `registerImageGenTools` |
| `figmento-mcp-server/package.json` | MODIFY | Add `@google/genai` as direct dependency |
| `.claude/CLAUDE.md` | MODIFY | Replace Standard Design Workflow with 6-step flow |

---

## Definition of Done

- [x] `npm run build` clean in `figmento-mcp-server`
- [x] `generate_design_image(brief, format)` places image in Figma in a single call
- [x] Selected frame auto-resolution works (no `frameId` needed when frame is selected)
- [x] New frame creation works when nothing is selected + format provided
- [x] Gemini fallback to placeholder image works silently
- [x] `textZone` present in every response
- [x] CLAUDE.md standard workflow updated to 6 steps
- [x] No existing tools broken (backwards compatible)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @sm (River) | Story drafted from @architect + @pm design session |
| 2026-03-14 | @po (Pax) | Validation 7.5/10 → CONDITIONAL GO. Added: Business Value, Out of Scope, Risks sections. Fixed critical Dev Note re: get_design_guidance not callable via sendDesignCommand. Added AC11 (fallbackUsed). Status Draft → Ready |
| 2026-03-14 | @dev (Dex) | Implemented all 4 phases. Created image-gen.ts (~210 lines), registered in server.ts, added @google/genai ^1.42.0, updated CLAUDE.md 6-step workflow. Build clean 151ms. Status → Ready for Review |
| 2026-04-12 | @qa (Quinn) | **QA Gate: PASS.** 11/11 ACs verified (all checked). `generate_design_image` registered at image-gen.ts:466 via `registerImageGenTools`. Status: Ready for Review → Done. |
