# Story IF-1: Contextual Image Fill — Smart Image Generation for Existing Layouts

**Status:** Ready for Review
**Priority:** High (P1)
**Complexity:** L (8 points) — New orchestration tool, Vision analysis, multi-image generation, intelligent frame detection
**Epic:** IF — Contextual Image Fill
**Depends on:** IG-1 (generate_design_image), scan_frame_structure (existing)
**PRD:** @pm analysis 2026-03-19 — Fill selected sections with contextual images matching site purpose

---

## Business Value

Designers building multi-section websites in Figma constantly need placeholder images that match their site's context. Today, they either: (a) manually describe each image one by one, or (b) use generic placeholders that break the design's story. The real workflow is: "I have a timeline section with 3 cards — fill them with images that make sense for this industrial cleaning company." This tool makes that a single command by analyzing the page context, identifying empty image slots, generating contextual images, and placing them — all autonomously.

**Impact:** Reduces 10-15 minutes of manual image sourcing per section to a single ~15s command. Makes the chat agent genuinely useful for rapid prototyping.

---

## Out of Scope

- Replacing existing images (only fills empty/placeholder slots)
- Brand kit auto-detection from page analysis (use existing `get_brand_kit` for that)
- Image editing/cropping after placement
- Video or animated content generation
- Generating more than 6 images per call (budget cap for latency)

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Page screenshot too large for Vision API (many sections) | Medium | Downscale to max 2048px wide before analysis. `get_screenshot` already has adaptive scaling. |
| Vision analysis misidentifies site purpose | Low | User can pass optional `context` override to correct or supplement. Analysis prompt explicitly asks for industry, purpose, and section function. |
| Multiple Gemini image calls cause timeout on Railway relay | Medium | Images generated sequentially with individual placement. Each image is fire-and-forget (async default from IG-1). Max 6 images per call hard cap. |
| Empty frame detection false positives (styled frames that aren't image slots) | Medium | Heuristic: only target FRAME/RECTANGLE children that have (a) no IMAGE fill, (b) no text children, (c) aspect ratio between 0.3 and 3.0 (not thin dividers). User can override with explicit `targetNodeIds`. |

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: @architect
quality_gate_tools: ["esbuild"]
quality_gate_criteria: "Build passes, fill_contextual_images places 3+ images in a multi-card section with contextually relevant prompts derived from page analysis"
```

---

## Story

**As a** designer using Figmento (via chat plugin or Claude Code),
**I want** to select a section and say "fill with images" and have the agent analyze my page, understand what I'm building, and generate + place contextual images in every empty slot,
**so that** I can rapidly prototype realistic layouts without manually describing each image.

---

## Description

### Problem

The current image generation flow is **one image at a time, zero context**:

1. User selects a frame
2. Describes exactly what image they want
3. Agent generates and places it
4. Repeat for every card/slot in the section

For a timeline section with 3 cards on a JHF4X industrial cleaning site, the user has to say:
- "Generate an image of a factory for card 1"
- "Generate an image of a washing machine for card 2"
- "Generate an image of ISO certification for card 3"

The agent has no awareness that this is a cleaning company's history section. It can't infer that "2003 — Fundação" means a founding-era factory photo, or that "2015 — Certificação ISO 9001" means a quality lab.

### Solution

New MCP tool `fill_contextual_images` that orchestrates a 4-phase pipeline:

```
Phase 1: CONTEXT   — Analyze page to understand site purpose
Phase 2: DISCOVER  — Find empty image slots in selected section
Phase 3: GENERATE  — Build contextual prompts per slot, generate images
Phase 4: PLACE     — Place each image in its target frame
```

---

### Phase 1: Context Analysis

**Input:** Page-level screenshot + optional user context string.

**Process:**
1. `get_page_nodes()` → get all top-level frames (sections)
2. `get_screenshot(pageOrRootFrame)` → capture full page visual (downscaled)
3. Send screenshot to Gemini Flash Vision with structured extraction prompt:

```
Analyze this website design. Extract:
1. INDUSTRY: What industry/business is this? (e.g., "industrial cleaning equipment")
2. BRAND: Company name if visible
3. PURPOSE: What is this page for? (e.g., "corporate homepage", "product landing page")
4. TONE: Visual tone (e.g., "corporate professional", "warm artisanal", "tech modern")
5. COLORS: Dominant color palette description
6. SECTIONS: List each visible section with its apparent purpose
```

**Output:** `PageContext` object with industry, brand, purpose, tone, sections[].

**Fallback:** If no screenshot available or Vision fails, use `scan_frame_structure` on the page to extract text content → infer context from text alone (less accurate but functional).

**Cost optimization:** Cache context per page for the session (reuse across multiple `fill_contextual_images` calls on different sections).

---

### Phase 2: Slot Discovery

**Input:** Selected frame (section) + PageContext.

**Process:**
1. `scan_frame_structure(selectedFrameId, depth=3)` → get section tree
2. Walk tree to find **image slot candidates** using heuristics:

```typescript
function isImageSlot(node: ScannedNode): boolean {
  // Must be FRAME or RECTANGLE
  if (!['FRAME', 'RECTANGLE'].includes(node.type)) return false;

  // Must not already have an IMAGE fill
  if (node.fills?.some(f => f.type === 'IMAGE')) return false;

  // Must not contain text children (it's a content frame, not an image slot)
  if (node.children?.some(c => c.type === 'TEXT')) return false;

  // Reasonable aspect ratio (not a thin divider or separator)
  const ratio = node.width / node.height;
  if (ratio < 0.3 || ratio > 3.5) return false;

  // Minimum size (not a tiny icon placeholder)
  if (node.width < 80 || node.height < 80) return false;

  return true;
}
```

3. For each slot, extract **sibling context** — nearby text nodes that describe the slot's purpose:

```typescript
function getSlotContext(slot: ScannedNode, parent: ScannedNode): string {
  // Find text siblings or text in parent's other children
  const textSiblings = parent.children
    .filter(c => c.type === 'TEXT' || hasTextChildren(c))
    .map(c => extractAllText(c))
    .join(' | ');

  return textSiblings; // e.g., "2003 | Fundação da JHF4X | Início da jornada..."
}
```

**Output:** `ImageSlot[]` — each with `{ nodeId, width, height, siblingContext, parentName }`.

**Override:** If user passes `targetNodeIds: string[]`, skip heuristics and use those exact nodes as slots.

---

### Phase 3: Contextual Prompt Generation

**Input:** PageContext + ImageSlot[].

**Process:** For each slot, build a Gemini-optimized image prompt that combines:

```typescript
function buildSlotPrompt(slot: ImageSlot, context: PageContext): string {
  const base = `Professional photograph for a ${context.industry} company website.`;
  const section = `This image is for: ${slot.siblingContext}`;
  const tone = `Visual style: ${context.tone}. Color palette: ${context.colors}.`;
  const technical = `Dimensions: ${slot.width}x${slot.height}px. Clean composition suitable for web card/section use.`;

  return `${base} ${section} ${tone} ${technical}`;
}
```

**Example outputs for JHF4X timeline:**

| Slot | Sibling Context | Generated Prompt |
|------|----------------|-----------------|
| Card 1 | "2003 \| Fundação da JHF4X \| Início da jornada com foco em engenharia nacional" | "Professional photograph for an industrial cleaning equipment company website. This image is for: 2003, founding of JHF4X, beginning of the journey focused on national engineering. Visual style: corporate professional. Clean composition, early 2000s Brazilian factory floor, industrial machinery, workers." |
| Card 2 | "2008 \| Lançamento da 1ª Lavadora \| Inovação que revolucionou o mercado" | "Professional photograph for an industrial cleaning equipment company. First industrial washing machine launch, innovative professional cleaning equipment, product showcase, modern factory setting." |
| Card 3 | "2015 \| Certificação ISO 9001 \| Reconhecimento de excelência em qualidade" | "Professional photograph for an industrial cleaning equipment company. ISO 9001 certification, quality control laboratory, professional inspection, certificates and quality seals." |

**Budget cap:** Max 6 images per call. If more slots found, prioritize by size (larger slots first) and warn user about remaining slots.

---

### Phase 4: Generate & Place

**Process:** For each slot, sequentially:
1. Call Gemini image generation (reusing `generate_design_image` internal logic)
2. Place image in target node via `create_image` command with `scaleMode: 'FILL'`
3. Report progress per image

**Sequential, not parallel** — Gemini rate limits + Railway timeout concerns. Each image ~3-5s.

**Fallback per image:** If Gemini fails for a specific slot → `fetch_placeholder_image` with keywords extracted from the slot's sibling context.

---

### Tool Schema

```typescript
fill_contextual_images({
  // Target section — at least one must be provided
  sectionId?: string,        // Frame ID of the section to fill. If omitted, uses current selection.
  targetNodeIds?: string[],  // Explicit list of node IDs to fill (overrides auto-discovery)

  // Context — usually auto-detected, but user can supplement
  context?: string,          // Optional. Extra context: "This is JHF4X, industrial cleaning equipment company"

  // Generation control
  style?: string,            // Optional. Image style override: "photographic" | "illustration" | "3d-render"
  maxImages?: number,        // Optional. Override budget cap (default 6, max 8)
  awaitImages?: boolean,     // Optional. Wait for all images before returning (default true)

  // Analysis reuse
  skipAnalysis?: boolean,    // Optional. Skip page analysis if context is provided manually
})
```

**Returns:**
```typescript
{
  pageContext: {
    industry: string,
    brand: string,
    purpose: string,
    tone: string,
    colors: string,
    sections: string[],
  },
  slotsFound: number,
  slotsFilled: number,
  slotsSkipped: number,       // over budget cap
  results: Array<{
    nodeId: string,
    width: number,
    height: number,
    prompt: string,           // the generated prompt (transparency)
    siblingContext: string,    // what text was near this slot
    fallbackUsed: boolean,
    success: boolean,
    error?: string,
  }>,
  suggestions?: string[],     // e.g., "3 more slots found but skipped (budget). Call again with those IDs."
}
```

---

### Chat Agent Integration

The tool works identically from both Claude Code (MCP) and the Figmento chat plugin (Gemini). The chat engine routes the call through the same MCP tool pipeline.

**Chat UX examples:**

| User says | Agent does |
|-----------|-----------|
| "gere imagens para essa seção" (section selected) | `fill_contextual_images(sectionId=selection)` |
| "preencha os cards com imagens" (card parent selected) | `fill_contextual_images(sectionId=selection)` |
| "coloca uma imagem aqui" (single card selected) | `fill_contextual_images(targetNodeIds=[selection])` |
| "gere imagens para essa seção, é um site de café artesanal" | `fill_contextual_images(sectionId=selection, context="artisanal coffee shop")` |

**Chat system prompt addition:**
```
When the user asks to "fill images", "generate images for this section", "add images to these cards",
or similar — use fill_contextual_images with the current selection. Analyze the page first for context.
```

---

### Vision Provider Strategy

**Analysis: Gemini Flash (mandatory)**
- Already available via `GEMINI_API_KEY` (same key used for image generation)
- Fast (~1-2s for screenshot analysis)
- Sufficient for context extraction (not generating images)
- No additional API keys required — `ANTHROPIC_API_KEY` is NOT used

**Image generation: Gemini Pro Image (existing)**
- Reuses `generate_design_image` internal Gemini call
- Already proven in IG-1

**Fallback: Text-only analysis**
- If Vision fails, `scan_frame_structure` → extract all text → infer context
- Less accurate but zero-cost

---

## Acceptance Criteria

- [ ] AC1: `fill_contextual_images()` with a section containing 3 empty card frames selected → analyzes page, generates 3 contextual images, places them in the correct cards
- [ ] AC2: Page context analysis extracts industry, brand (if visible), purpose, and tone from a screenshot
- [ ] AC3: Image slot detection correctly identifies FRAME/RECTANGLE nodes without IMAGE fills, ignoring text containers and thin dividers
- [ ] AC4: Generated image prompts include sibling text context (e.g., card titles, descriptions nearby)
- [ ] AC5: Single card selected → fills only that card (not siblings)
- [ ] AC6: `context` parameter supplements auto-detected context (not replaces)
- [ ] AC7: `targetNodeIds` bypasses auto-discovery and fills exactly those nodes
- [ ] AC8: Budget cap (default 6) prevents runaway generation; returns `suggestions` for remaining slots
- [ ] AC9: Gemini failure on one image doesn't abort the batch — fallback per image, other images continue
- [ ] AC10: Response includes all generated prompts for transparency/debugging
- [ ] AC11: `npm run build` clean in `figmento-mcp-server`
- [ ] AC12: Works from both Claude Code (MCP) and Figmento chat plugin (same tool, same behavior)
- [ ] AC13: Page context is cached for the session — second call on different section reuses analysis

---

## Tasks

### Task 1: Page Context Analyzer

- [x] `analyzePageContext(sendDesignCommand, userContext?): Promise<PageContext>`
- [x] Gemini Flash Vision analysis with structured JSON extraction prompt
- [x] Text-only fallback via `scan_frame_structure` when Vision fails
- [x] 30-minute TTL session cache keyed by page ID
- [x] Export `PageContext` type

### Task 2: Image Slot Discovery

- [x] `discoverImageSlots(sectionId, sendDesignCommand): Promise<ImageSlot[]>`
- [x] `isImageSlot()` heuristic (type, fills, children, aspect ratio, min size)
- [x] `getSlotContext()` sibling text extraction
- [x] Sorted by area (largest first)
- [x] All functions exported for testing

### Task 3: Contextual Prompt Builder

- [x] `buildSlotPrompt(slot, context, style?): string`
- [x] Graceful fallback for missing industry/siblingContext/tone
- [x] Exported for testing

### Task 4: Fill Orchestrator Tool

- [x] `fill_contextual_images` MCP tool registered with full Zod schema
- [x] 4-phase orchestration: context → discover → prompt → generate+place
- [x] Selection fallback, budget cap, targetNodeIds override, skipAnalysis
- [x] Per-image Gemini generation with Picsum fallback
- [x] Structured response with prompts, suggestions, error details

### Task 5: Register & Wire Up

- [x] Imported and registered `registerImageFillTools` in `server.ts`
- [x] `npm run build` clean in figmento-mcp-server (168ms)

### Task 6: Chat System Prompt Update

- [x] Added `fill_contextual_images` tool definition in `chat-tools.ts`
- [x] Added to both `PLAN_PHASE_TOOLS` and `BUILD_PHASE_TOOLS` sets
- [x] Added `executeFillContextualImages` composite handler in `chat-engine.ts`
- [x] `npm run build` clean in figmento-ws-relay
- [x] Updated `.claude/CLAUDE.md` with contextual image fill documentation

---

## Testing

### Unit Tests (`figmento-mcp-server/src/tools/__tests__/image-fill.test.ts`)

**`isImageSlot()` heuristic:**
- ✅ FRAME 200×200 no fills, no children → slot
- ✅ RECTANGLE 400×300 solid fill, no children → slot
- ❌ FRAME with IMAGE fill → not a slot (already has image)
- ❌ FRAME with TEXT child → not a slot (content frame)
- ❌ RECTANGLE 800×2 → not a slot (divider, aspect ratio > 3.5)
- ❌ FRAME 40×40 → not a slot (below min size 80px)
- ❌ TEXT node → not a slot (wrong type)
- ❌ ELLIPSE node → not a slot (wrong type)

**`getSlotContext()` sibling extraction:**
- Slot with text siblings → returns joined text
- Slot with nested text in sibling children → extracts recursively
- Slot with no text siblings → returns empty string
- Slot with parent name only → returns parent name as fallback

**`buildSlotPrompt()` composition:**
- Full context + full slot → includes industry, sibling context, tone, dimensions
- Missing industry → graceful fallback ("website" instead of specific industry)
- Missing sibling context → prompt still valid (generic description)
- Style override → includes style in prompt

### Integration Test (manual, with live Figma)

1. Open Figma file with JHF4X timeline section (3 empty card frames + text labels)
2. Select the timeline section frame
3. Call `fill_contextual_images()` with no params
4. Verify: page context extracted (industry = industrial cleaning / equipment)
5. Verify: 3 slots discovered (the card frames, not the text labels or dividers)
6. Verify: 3 images generated with prompts referencing founding/launch/certification
7. Verify: images placed in correct frames with `scaleMode: FILL`

### Test Pattern

- Use `ts-jest` with mocked `sendDesignCommand` for unit tests
- Follow `__dirname` fallback pattern from memory (two-candidate path resolution)
- Export `isImageSlot`, `getSlotContext`, `buildSlotPrompt` for direct testing

---

## Dev Notes

- **Reuse Gemini call from `image-gen.ts`** — extract `callGemini()` and `saveAndPlaceImage()` as exported functions. Don't duplicate.
- **`scan_frame_structure` depth=3 is enough** — cards are rarely nested deeper than section → row → card.
- **Vision analysis uses Gemini Flash, not Pro** — Flash is faster and cheaper for text extraction. Pro is only for image generation.
- **Sequential image generation is intentional** — parallel would hit Gemini rate limits and cause failures. 3-5s per image × 6 max = 18-30s total, well within Railway timeout.
- **Session cache for PageContext** — use a simple `Map<string, { context: PageContext, timestamp: number }>` with 30-minute TTL. Same pattern as IG-3 design session state.
- **The slot heuristic will have false positives** — that's OK. Better to fill a non-image frame (user can undo) than miss a real slot. The `targetNodeIds` override exists for precision.
- **`awaitImages` defaults to true** because user needs to see the result. Unlike `generate_design_image` (which is called mid-workflow), this tool is the final step.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/image-fill.ts` | CREATE | Main orchestrator — 4-phase pipeline: context analysis, slot discovery, prompt builder, fill tool (~380 lines) |
| `figmento-mcp-server/src/server.ts` | MODIFY | Import + register `registerImageFillTools` |
| `figmento-ws-relay/src/chat/chat-tools.ts` | MODIFY | Added `fill_contextual_images` tool definition + plan/build phase sets |
| `figmento-ws-relay/src/chat/chat-engine.ts` | MODIFY | Added `executeFillContextualImages` composite server-side handler (~150 lines) |
| `.claude/CLAUDE.md` | MODIFY | Added Contextual Image Fill documentation section |

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.

---

## Definition of Done

- [ ] `npm run build` clean in `figmento-mcp-server`
- [ ] `fill_contextual_images` with 3-card section → fills all 3 with contextual images
- [ ] Page analysis extracts meaningful context (not generic)
- [ ] Slot discovery ignores text frames, dividers, and already-filled images
- [ ] Generated prompts visibly reference the site's industry/purpose
- [ ] Single-card selection fills only that card
- [ ] Gemini failure on one image doesn't block others
- [ ] Works from chat plugin (Gemini model) and Claude Code (MCP)
- [ ] No existing tools broken

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @pm (Morgan) | Story drafted from user feedback on image fill workflow gaps |
| 2026-03-19 | @po (Pax) | Validation 7.5/10 → CONDITIONAL GO. Fixed: executor assignment format (quality_gate → @architect), committed to Gemini Flash only (removed Claude Sonnet ambiguity), added Testing section with unit test expectations, added CodeRabbit skip notice. Status Draft → Ready |
| 2026-03-19 | @dev (Dex) | Implemented all 6 tasks (YOLO mode). Created image-fill.ts (~380 lines) with 4-phase pipeline. Added chat-engine composite handler (~150 lines). Both builds clean. Status Ready → Ready for Review |
