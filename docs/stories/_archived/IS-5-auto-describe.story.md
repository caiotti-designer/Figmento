# Story IS-5: Auto-Describe (Image Drop → Prompt Generation)

**Status:** Done
**Priority:** High (P0)
**Complexity:** M (5 points) — Drag & drop handler, Gemini Flash vision call, prompt population
**Epic:** IS — Image Studio
**Depends on:** IS-3 (prompt box must exist)
**PRD:** [PRD-008](../prd/PRD-008-image-studio.md) — Phase B

---

## Business Value

This is the "instant reverse-engineering" feature. A designer sees an image they love — a competitor's banner, an inspiration photo, a Dribbble shot — and wants to recreate it with AI. Today they'd need to manually describe every detail. Auto-describe does this in < 5 seconds: drop the image, get a professional prompt, hit generate.

## Out of Scope

- Adding the dropped image as a reference (user can do this manually via IS-2)
- Image editing/cropping before analysis
- Multi-image describe (one image at a time)
- Describe from URL (file drop only)

## Risks

- Vision quality varies for abstract/artistic images (mitigated: two modes + always editable)
- Gemini Flash may return over-verbose descriptions (mitigated: system prompt limits output length)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Drop image → prompt appears in < 5s, both modes produce distinct outputs, @tags preserved"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer who found an image I want to recreate,
**I want** to drag it onto the prompt box and get an AI-generated prompt describing it,
**so that** I can quickly generate a similar image without manually writing a detailed description.

---

## Description

### Problem

Writing good image generation prompts requires expertise in photography terms, composition, lighting, and style vocabulary. Most users write vague prompts ("cool banner with tractor") that produce generic results. But they often have a reference image that shows exactly what they want.

### Solution

Drag & drop → AI vision analysis → prompt auto-population.

### Flow

```
1. User drags image file over prompt box
2. Drop zone activates (blue border highlight)
3. User drops image
4. Spinner: "Analyzing image..."
5. Image sent to Gemini Flash (text-only response mode) with describe system prompt
6. Generated prompt appears in prompt box
7. User edits if needed → generates
```

### Two Modes

**Recreate (default):**
System prompt focuses on faithful reproduction — includes subject, composition, lighting, colors, mood, style, camera angle, textures, specific details.

**Inspire:**
System prompt focuses on essence — includes mood, aesthetic direction, key visual themes. Omits precise details to leave creative room.

### System Prompts

**Recreate:**
```
Analyze this image and generate a detailed prompt that could recreate it using an AI image generator. Include:
- Main subject and its position in the frame
- Lighting (direction, quality, color temperature)
- Color palette (dominant colors, accents)
- Mood and atmosphere
- Art style or photography technique
- Camera angle and framing
- Background and environment details
- Notable textures or materials
Return ONLY the prompt text. No explanations, labels, or formatting. Maximum 150 words.
```

**Inspire:**
```
Analyze this image and capture its essence in a creative prompt for an AI image generator. Focus on:
- Overall mood and emotional tone
- Aesthetic direction (editorial, minimal, bold, organic, etc.)
- Key visual elements that define the image
- Color feeling (warm, cool, muted, vibrant)
Do NOT describe specific details — capture the spirit, not the specifics.
Return ONLY the prompt text. No explanations. Maximum 80 words.
```

---

## Acceptance Criteria

- [ ] AC1: Dragging an image file over the prompt box area shows a visual drop zone (blue dashed border + "Drop to describe" label)
- [ ] AC2: Dropping the image shows "Analyzing image..." spinner inside the prompt area
- [ ] AC3: Image sent to Gemini Flash in text-only response mode (NOT image generation model)
- [ ] AC4: Generated prompt populates the prompt box — replaces if empty, appends with newline if existing content
- [ ] AC5: Mode toggle ("Recreate" / "Inspire") visible near prompt box — default is "Recreate"
- [ ] AC6: Recreate mode produces detailed prompt (subject, lighting, colors, composition, camera angle)
- [ ] AC7: Inspire mode produces abstract/mood prompt (tone, aesthetic, feeling)
- [ ] AC8: Analysis completes in < 5 seconds (Gemini Flash typical response time)
- [ ] AC9: Dropped image is NOT automatically added as a reference slot
- [ ] AC10: If prompt box has existing @tags, they are preserved — describe text is appended after them
- [ ] AC11: Error handling: if analysis fails, show "Could not analyze image — try again" with retry button
- [ ] AC12: Supported formats: PNG, JPG, WebP — other formats show "Unsupported image format" message
- [ ] AC13: Max file size: 10MB — larger files show size error
- [ ] AC14: Drop zone deactivates when not dragging (no persistent visual)

---

## Tasks

### Phase 1: Drop Zone
- [ ] Add dragenter/dragover/dragleave/drop listeners to prompt area
- [ ] Visual highlight on dragover (dashed blue border + icon)
- [ ] File type validation (image/* only)
- [ ] Size validation (< 10MB)

### Phase 2: Vision API Integration
- [ ] Convert dropped file to base64
- [ ] Build Gemini Flash request with describe system prompt
- [ ] Route through relay or direct API call (reuse existing Gemini client)
- [ ] Parse text response

### Phase 3: Prompt Population
- [ ] Insert generated text into prompt box
- [ ] Handle existing content (append vs replace logic)
- [ ] Preserve @tag tokens if present
- [ ] Update overlay display (if IS-4 implemented)

### Phase 4: Mode Toggle
- [ ] Toggle UI component (Recreate / Inspire)
- [ ] Swap system prompts based on mode
- [ ] Default to Recreate
- [ ] Mode persists within session

### Phase 5: Error Handling + Loading
- [ ] Spinner in prompt area during analysis
- [ ] Error message with retry on failure
- [ ] Timeout handling (abort after 15s)

---

## Dev Notes

- **API routing (DECISION — S5):** Add a new lightweight relay endpoint `POST /api/image/describe` that accepts `{ imageBase64, mimeType, mode: "recreate"|"inspire" }` and calls Gemini Flash directly (text-only response mode). This is a simple vision→text call — no MCP tool overhead needed, no chat loop. The relay already has the Gemini client configured. Return `{ prompt: string }`. This endpoint is also reused by IS-6 Enhance (`POST /api/image/enhance` with `{ prompt, mode }`).
- **Gemini Flash text-only is cheap:** ~$0.001 per describe call. No cost concern.
- **Append vs replace:** If prompt is empty, replace. If prompt has content, add a newline and append. If prompt has @tags only, insert after the last tag.
- **Image compression:** Compress the dropped image before sending (same pipeline as IS-2 thumbnails but larger — max 1024px longest side for analysis). The model doesn't need full resolution to describe.
- **Cross-story note:** IS-6 (Enhance) should work on auto-described prompts too — the user drops an image, gets a prompt, then clicks Enhance to improve it.

---

## File List

### MODIFIED
- `figmento/src/ui.html` — Drop zone styling, mode toggle HTML
- `figmento/src/ui/image-studio.ts` — Drop handler, vision API call, prompt population

### CREATED
- (none expected)

---

## Definition of Done

- [ ] Plugin builds successfully
- [ ] Dropping a JPG on prompt box generates a prompt in < 5s
- [ ] Recreate and Inspire modes produce distinctly different prompts
- [ ] @tags in prompt preserved when describe text is appended
- [ ] Error state shown on API failure with retry option
- [ ] No console errors

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | @sm | Story created from Epic IS Phase B |
