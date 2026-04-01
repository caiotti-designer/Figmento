# PRD-008: Image Studio — AI Image Generation Hub with Reference Conditioning

**Status:** Draft — Ready for Review
**Author:** Product Owner (Human) + Strategic Advisor (Claude)
**Date:** 2026-03-27
**Epic:** IS — Image Studio
**Priority:** High (Owner's requested feature)
**Target milestone:** M10 — Creative Productivity

---

## 0. Executive Context for @pm (Morgan)

### The Feature

The product owner wants a dedicated image generation workspace inside the Figmento plugin, focused on Google Nano Banana 2 (gemini-3.1-flash-image-preview). The core UX is inspired by professional image generation tools:

> "I want reference slots for Style, Character, and Content images. A prompt box where I can @tag any uploaded reference by name. Drag & drop an image into the prompt box and it auto-describes it into a recreatable prompt. Plus a button to enhance any prompt with AI."

This is four capabilities fused into one tab:

1. **Image Studio Tab** — Dedicated UI panel with reference slots, prompt box, generation controls, and history
2. **Reference Slots with @tag System** — Upload images as Style/Character/Content references, @mention them in prompts for precise conditioning
3. **Auto-Describe (Drop → Prompt)** — Drag any image onto the prompt box → AI vision generates a descriptive prompt to recreate it
4. **Prompt Enhancement** — One-click AI-powered prompt improvement with diff preview

### Why Now

- **Nano Banana 2 is already integrated** in `image-gen.ts` with full reference image support (up to 14 inputs)
- **Image upload already works** in the chat UI (PNG, JPG, WebP, PDF)
- **The API supports the exact workflow** — images go as `inlineData` parts, the prompt describes each image's role
- **No UI exists for image-first workflows** — current path is chat-only, which is conversational but not optimized for iterative image generation

### Existing Infrastructure

| Capability | Status | Location |
|-----------|--------|----------|
| Gemini Nano Banana 2 integration | **Working** | `figmento-mcp-server/src/tools/image-gen.ts` |
| Reference image handling (base64 inlineData) | **Working** | `image-gen.ts` — `referenceImages` parameter |
| Up to 14 reference images per request | **API confirmed** | 10 object fidelity + 4 character consistency |
| Aspect ratio control (14 options) | **Working** | 1:1, 16:9, 9:16, 4:3, 3:2, 4:5, 5:4, 21:9, etc. |
| Resolution control (512, 1K, 2K, 4K) | **Working** | `imageConfig.imageSize` parameter |
| Two-phase generation (preview → high-res) | **Working** | 512px fast preview + target resolution replacement |
| Image placement on canvas | **Working** | `place_generated_image`, `create_image` |
| File upload in plugin UI | **Working** | `#chat-file-upload` accepts images |
| Gemini Flash for vision/text analysis | **Working** | Used by `analyze_brief`, chat engine |

**Gap analysis:** All backend infrastructure exists. The gaps are purely UI/UX:
1. No dedicated image generation panel (only chat-based flow)
2. No reference slot management (upload, label, categorize)
3. No @tag autocomplete system in prompt input
4. No auto-describe (image → prompt) workflow
5. No prompt enhancement button
6. No generation history with thumbnails

---

## 1. Problem Statement

Figmento can generate images via chat, but the workflow is suboptimal for iterative image creation:

1. **No visual reference management** — Users must re-upload images every time or describe them in text
2. **No precision** — When using multiple reference images, the model doesn't know which image is "the style" vs "the character" vs "the content" — it's guessing from context
3. **Prompt crafting is hard** — Users write vague prompts ("make a cool banner") instead of detailed ones with lighting, composition, and technical terms
4. **No reverse engineering** — When a user sees an image they like, they can't easily generate a prompt to recreate it
5. **Chat is wrong paradigm** — Image generation is task-oriented (configure → generate → iterate), not conversational

### Evidence

- Gemini docs explicitly recommend: "give each image an index" and "your prompt needs to clearly describe what each input image contributes"
- The @tag system directly implements Google's best practice of labeling reference images
- Current `generate_design_image` tool accepts `referenceImages` array but has no UI for managing them
- Image generation knowledge base (`image-generation.yaml`) already defines prompt building strategies but users can't leverage them without manual effort

---

## 2. Vision

> "A dedicated Image Studio tab where I upload my references once, @tag them by name in natural language prompts, and iterate on generations with one click. Drop any inspiration image and instantly get a prompt to recreate it."

### The Workflow

```
1. Switch to Image Studio tab
2. Upload references → assign to Style/Character/Content slots
3. Write prompt using @tags: "Apply the palette from @img1 to @gabs in front of @img2"
4. Set aspect ratio (16:9) and resolution (2K)
5. Generate → see result in history
6. Iterate: adjust prompt → regenerate
   OR: drop an inspiration image → auto-describe → edit → generate
```

---

## 3. Goals & Non-Goals

### Goals

| # | Goal | Metric |
|---|------|--------|
| G1 | Dedicated image generation UX optimized for iterative workflows | Tab switch available, not buried in menus |
| G2 | Precise reference conditioning via @tags | User can reference any uploaded image by name in prompt |
| G3 | Instant prompt from any image (auto-describe) | < 5s from drop to prompt populated |
| G4 | One-click prompt improvement | Enhancement uses cheap model (Flash), < 3s response |
| G5 | Session-scoped reference persistence | References survive tab switches, cleared on plugin close |

### Non-Goals

| # | Non-Goal | Reason |
|---|----------|--------|
| NG1 | Design System integration in Image Studio | Separate workflow — DS-aware image gen stays in chat mode |
| NG2 | Cross-session reference persistence | v1 is session-scoped; project persistence is ODS-8 territory |
| NG3 | Image editing/inpainting UI | Out of scope — this is generation, not editing |
| NG4 | Batch generation (multiple variations at once) | Future enhancement — v1 generates one at a time |
| NG5 | Custom model selection beyond Gemini | v1 is Nano Banana 2 only; model selector can be added later |

---

## 4. Feature Breakdown

### Feature 1: Image Studio Tab + Reference Slots

**What:** A new tab in the plugin UI alongside the existing Chat tab. Contains:
- **Reference Slots** — Three categories: Style, Character, Content (+ generic "Add" slot)
- **Slot Management** — Upload via click or drag & drop, rename, remove, see thumbnail
- **Counter** — Shows "X/14" reference usage (respects API limits: 10 object + 4 character)
- **Generation History** — Scrollable thumbnail strip of past generations in this session

**UI Layout:**
```
┌─────────────────────────────────────┐
│  [💬 Chat]  [🖼️ Image Studio]       │  ← tab bar
├─────────────────────────────────────┤
│  MODEL                              │
│  [G] Google Nano Banana 2  [⚙] [▾] │
│                                     │
│  REFERENCES                  X/14   │
│  [✦ Style] [👤 Character]          │
│  [📷 img1] [📷 img2]    [+ Add]    │
│                                     │
│  PROMPT                             │
│  ┌─────────────────────────────┐    │
│  │ "Apply @img1 style to       │    │
│  │  @gabs standing in @img2"   │    │
│  │                             │    │
│  │  [🤖 AI prompt]  [✨] [✕]  │    │
│  └─────────────────────────────┘    │
│                                     │
│  [- 1 +] [📐 16:9] [📏 2K] [∞ ON] │
│                                     │
│  [ ▶ Generate ]                [✦]  │
│                                     │
│  HISTORY                            │
│  [thumb1] [thumb2] [thumb3] ...     │
└─────────────────────────────────────┘
```

### Feature 2: @Tag Reference System

**What:** Typing `@` in the prompt box opens an autocomplete dropdown listing all uploaded references with their thumbnails, names, and types (Style/Character/Content).

**Behavior:**
- `@` triggers dropdown with all references
- Typing filters: `@ga` → shows `@gabs`
- Selecting inserts a styled tag chip in the prompt (not plain text)
- Tags are visually distinct (colored pill with thumbnail)
- When generating, the system:
  1. Collects all @tagged images in prompt order
  2. Prepends role context per image type:
     - Style: *"Use the visual style, color palette, and texture from this reference:"*
     - Character: *"Maintain this character's appearance consistently:"*
     - Content: *"Use this image as the base content to transform:"*
  3. Builds the `parts` array: `[text_prompt, ...reference_images_in_order]`
  4. Sends to Gemini API

**Image Indexing (per Google best practice):**
Each image in the API request gets a text prefix: `"Image 1 (@img1 — Style reference):"` followed by the inlineData. This helps the model understand which image maps to which @tag in the prompt.

### Feature 3: Auto-Describe (Drop → Prompt)

**What:** Dragging an image onto the prompt box area triggers an automatic "describe" flow.

**Flow:**
1. User drops image on prompt box (or dedicated drop zone)
2. UI shows spinner: "Analyzing image..."
3. System sends image to Gemini Flash (text-only mode, cheap & fast) with prompt:
   ```
   Analyze this image and generate a detailed prompt that could recreate it
   using an AI image generator. Include: subject, composition, lighting,
   color palette, mood, style, camera angle, and any notable details.
   Return ONLY the prompt text, no explanations.
   ```
4. Response populates the prompt box (replacing or appending to existing content)
5. User can edit the auto-generated prompt before generating

**Two modes (selectable via toggle):**
- **Recreate** (default) — Detailed prompt focused on faithful reproduction
- **Inspire** — Captures essence and mood, leaves creative latitude

**The dropped image is NOT automatically added as a reference.** It's analyzed for prompt text only. User can manually add it as a Content reference if desired.

### Feature 4: Prompt Enhancement

**What:** A button (✨) that sends the current prompt to a cheap AI model for improvement.

**Flow:**
1. User writes or auto-generates a prompt
2. Clicks [✨ Enhance] button
3. System sends to Gemini Flash with system prompt:
   ```
   You are a prompt engineer for AI image generation. Improve this prompt by adding:
   - Specific lighting descriptions (golden hour, studio lighting, etc.)
   - Composition terms (rule of thirds, leading lines, etc.)
   - Atmosphere and mood enhancers
   - Technical photography terms (depth of field, bokeh, etc.)
   - Material and texture details
   Keep the original intent intact. Return ONLY the improved prompt.
   ```
4. UI shows inline diff (original vs enhanced) with [Accept] / [Reject] buttons
5. Accepting replaces the prompt; rejecting keeps the original

**Cost control:** Uses `gemini-2.0-flash-lite` or equivalent cheapest model for enhancement — this is a text-only task, no need for image capabilities.

---

## 5. Phased Delivery Plan

### Phase A — Image Studio Shell + Reference Slots (Foundation)

> **Goal:** Tab exists, references can be uploaded/managed, basic generation works from the new UI.

| Story ID | Title | Executor | Complexity | Depends On |
|----------|-------|----------|------------|------------|
| IS-1 | Image Studio Tab Shell + Tab Switching | @dev | S (3pt) | — |
| IS-2 | Reference Slot Manager (Upload, Categorize, Rename, Remove) | @dev | M (5pt) | IS-1 |
| IS-3 | Basic Prompt Box + Generation Integration | @dev | M (5pt) | IS-1 |

### Phase B — @Tag System + Prompt Intelligence (Core UX)

> **Goal:** @tags work in prompts, auto-describe and enhance are functional.

| Story ID | Title | Executor | Complexity | Depends On |
|----------|-------|----------|------------|------------|
| IS-4 | @Tag Autocomplete in Prompt Box | @dev | L (8pt) | IS-2, IS-3 |
| IS-5 | Auto-Describe (Image Drop → Prompt Generation) | @dev | M (5pt) | IS-3 |
| IS-6 | Prompt Enhancement Button (✨ Enhance) | @dev | S (3pt) | IS-3 |

### Phase C — Polish + History (Complete Experience)

> **Goal:** Generation history, Send to Canvas, quality-of-life improvements.

| Story ID | Title | Executor | Complexity | Depends On |
|----------|-------|----------|------------|------------|
| IS-7 | Generation History Panel (Thumbnails + Re-use) | @dev | M (5pt) | IS-3 |
| IS-8 | Send to Canvas Integration | @dev | S (3pt) | IS-7 |

**Total estimated effort:** 37 points across 8 stories (3 phases)

---

## 6. Architecture Impact

### Plugin UI (`figmento/src/ui.html` + `figmento/src/ui/`)

- New tab system (Chat ↔ Image Studio switching)
- New UI module: `figmento/src/ui/image-studio.ts`
- Reference slot state management
- @tag autocomplete component (contentEditable or textarea + overlay)
- Drag & drop handler on prompt area
- Generation history thumbnail strip

### MCP Server (`figmento-mcp-server/src/tools/`)

- Existing `image-gen.ts` handles generation — minimal changes needed
- New tool or endpoint: `describe_image` — sends image to Gemini Flash for prompt extraction
- New tool or endpoint: `enhance_prompt` — sends prompt text to cheap model for improvement
- Reference image ordering/labeling logic (prepend role context per slot type)

### Relay (`figmento-ws-relay/`)

- New HTTP endpoint or message type for describe/enhance (lightweight, no tool-use loop needed)
- OR: these can be direct Gemini API calls from the MCP server, no relay involvement

### No changes needed to:
- Plugin sandbox (`figmento/src/code.ts`)
- WebSocket relay core
- Figma native handlers
- Design system infrastructure

---

## 7. Risk Assessment

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | @tag parsing complexity — contentEditable is notoriously buggy | HIGH | MEDIUM | Use proven pattern: textarea + floating chip overlay (like Slack mentions) |
| R2 | Style conditioning is prompt-engineered, not API-native — inconsistent results | MEDIUM | HIGH | Document limitations clearly; provide good default role prefixes; let users customize prefix |
| R3 | Auto-describe quality varies — some images produce vague prompts | MEDIUM | MEDIUM | Show "Recreate" vs "Inspire" modes; let user always edit before generating |
| R4 | 14 reference limit may confuse users who upload too many | LOW | LOW | Show X/14 counter; disable "Add" when full; show breakdown (10 obj + 4 char) |
| R5 | Gemini Flash rate limits on describe/enhance calls | LOW | LOW | Cache describe results per image hash; debounce enhance calls |
| R6 | Large base64 images slow down the UI | MEDIUM | MEDIUM | Thumbnail previews in slots; compress to max 2MB before sending to API |
| R7 | Tab switching loses chat context | LOW | LOW | Both tabs maintain independent state; no data shared |

---

## 8. API Research Summary

### Gemini Nano Banana 2 (gemini-3.1-flash-image-preview) — Confirmed Capabilities

| Feature | Support | Details |
|---------|---------|---------|
| Multi-image input | ✅ Up to 14 | 10 object fidelity + 4 character consistency |
| Style transfer | ✅ Via prompt | "Apply the style from image X to..." — no native `styleReference` parameter |
| Character consistency | ✅ Via reference | Upload character photos, model preserves features across generations |
| Content manipulation | ✅ Via prompt | Send base image + transformation instruction (e.g., X-ray effect) |
| Aspect ratios | ✅ 14 options | 1:1, 16:9, 9:16, 4:3, 3:2, 4:5, 5:4, 21:9, 1:4, 4:1, 1:8, 8:1, 3:4 |
| Resolution | ✅ 4 tiers | 512 (preview), 1K, 2K, 4K (new in Nano Banana 2) |
| Text rendering | ✅ Improved | Legible text in generated images |
| Multi-turn editing | ✅ | Supports conversational editing with `thoughtSignature` |

### Key Implementation Detail

**No native "slot type" API parameter exists.** Style/Character/Content differentiation is 100% prompt engineering. The API receives images as `inlineData` parts and interprets their role from the text prompt.

**Best practice from Google docs:** "Give each image an index before the image" and "your prompt needs to clearly describe what each input image contributes."

Our @tag system implements this perfectly — each @tag maps to a labeled image in the API request.

---

## 9. Success Metrics

| Metric | Baseline (chat-only) | Target (Image Studio) |
|--------|---------------------|----------------------|
| Steps to generate with 2+ references | 5-8 chat messages | 1 (upload refs + prompt + generate) |
| Time to recreate an inspiration image | N/A (manual prompt writing) | < 10s (drop + auto-describe + generate) |
| Prompt quality (subjective) | User-written, often vague | Enhanced prompts with technical terms |
| Reference reuse across generations | Re-upload every time | Upload once, @tag many times |

---

## 10. Timeline Estimate

| Phase | Stories | Points | Estimated Effort |
|-------|---------|--------|-----------------|
| A — Shell + Slots | IS-1, IS-2, IS-3 | 13 | 2-3 sessions |
| B — @Tags + Intelligence | IS-4, IS-5, IS-6 | 16 | 3-4 sessions |
| C — History + Canvas | IS-7, IS-8 | 8 | 1-2 sessions |
| **Total** | **8 stories** | **37** | **6-9 sessions** |

---

## 11. Action Items

| # | Action | Owner | Status |
|---|--------|-------|--------|
| A1 | Review PRD and approve scope | @po | Pending |
| A2 | Create Epic IS with phased stories | @pm | Pending |
| A3 | Draft stories IS-1 through IS-8 | @sm | Pending |
| A4 | Validate story drafts | @po | Pending |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | @pm + Owner | Initial PRD draft based on owner's vision + API research |
