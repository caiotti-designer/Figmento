# Story IS-3: Basic Prompt Box + Generation Integration

**Status:** Done
**Priority:** High (P0)
**Complexity:** M (5 points) — Prompt UI, Gemini API integration, loading states
**Epic:** IS — Image Studio
**Depends on:** IS-1 (Image Studio tab must exist)
**PRD:** [PRD-008](../prd/PRD-008-image-studio.md) — Phase A

---

## Business Value

This connects the Image Studio UI to the existing Gemini Nano Banana 2 generation pipeline. Without it, the tab is visual-only. This story makes Image Studio functional — users can type a prompt, configure aspect ratio and resolution, and generate images.

## Out of Scope

- @tag system (IS-4)
- Auto-describe (IS-5)
- Prompt enhancement (IS-6)
- Generation history (IS-7)
- Reference role prefixes in prompt (IS-4 handles this)

## Risks

- Direct Gemini API calls from plugin may need relay routing (mitigated: reuse existing `image-gen.ts` MCP tool path)
- Generated image display may not fit well in constrained plugin viewport (mitigated: responsive preview with max-height)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Prompt + Generate produces an image inline, all controls functional, error states handled"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer in Image Studio,
**I want** to type a prompt, set aspect ratio and resolution, and generate an image,
**so that** I can create AI images from the dedicated Image Studio interface.

---

## Description

### Problem

Image Studio tab exists (IS-1) but can't generate anything. Users need the core generation loop: prompt → configure → generate → see result.

### Solution

1. Prompt textarea with auto-expand
2. Controls bar: aspect ratio selector, resolution selector, quantity (locked to 1 for v1), consistency toggle
3. Generate button that triggers the MCP `generate_design_image` pipeline
4. Inline preview of the generated image
5. Loading state during generation
6. Error handling for API failures

### Generation Flow

```
User types prompt → clicks Generate
  → Plugin collects: prompt, referenceImages (from IS-2 store), aspectRatio, resolution
  → Sends to relay or MCP server via existing image generation pathway
  → Receives generated image (base64)
  → Displays inline preview below prompt box
```

---

## Acceptance Criteria

- [ ] AC1: Prompt textarea visible in Image Studio with placeholder "Describe your image..."
- [ ] AC2: Textarea auto-expands vertically (min 3 rows, max 8 rows)
- [ ] AC3: Aspect ratio selector with options: 1:1, 16:9, 9:16, 4:3, 3:4, 4:5, 5:4, 3:2, 2:3, 21:9 — default 1:1
- [ ] AC4: Resolution selector: 512 (Preview), 1K, 2K, 4K — default 1K
- [ ] AC5: Consistency toggle (∞) — when ON, all references from IS-2 store included in generation request
- [ ] AC6: Generate button triggers generation using existing image gen pipeline
- [ ] AC7: All references from IS-2 store sent as `referenceImages` array (base64 + mimeType), ordered: Style → Character → Content
- [ ] AC8: Loading spinner on Generate button during generation; all inputs disabled
- [ ] AC9: Generated image shown as inline preview (max-width: 100%, max-height: 300px, centered)
- [ ] AC10: API errors shown as inline error message with retry button
- [ ] AC11: Quantity selector shows "1" (disabled for v1 — future batch support placeholder)
- [ ] AC12: Keyboard shortcut: Ctrl+Enter / Cmd+Enter triggers generation

---

## Tasks

### Phase 1: Prompt Textarea
- [ ] HTML structure in Image Studio panel
- [ ] Auto-expand logic (adjust height on input)
- [ ] Styling matching dark theme

### Phase 2: Controls Bar
- [ ] Aspect ratio dropdown/button group
- [ ] Resolution dropdown/button group
- [ ] Consistency toggle (∞)
- [ ] Quantity display (static "1")
- [ ] Generate button with icon

### Phase 3: Generation Pipeline Integration
- [ ] Collect prompt + references + config
- [ ] Route to existing `generate_design_image` tool via relay HTTP endpoint or direct MCP call
- [ ] Handle response (base64 image or error)

### Phase 4: Result Display
- [ ] Inline image preview container
- [ ] Image rendering from base64
- [ ] Loading state (spinner + disabled controls)
- [ ] Error state (message + retry button)

### Phase 5: Keyboard Shortcuts + Polish
- [ ] Ctrl+Enter / Cmd+Enter to generate
- [ ] Disable generate when prompt is empty
- [ ] Visual feedback on generate click

---

## Dev Notes

- **Generation routing (DECISION — S4):** Use the relay's existing chat endpoint (`POST /api/chat/turn`) with a special flag `mode: "image-studio"`. The relay detects this flag and routes directly to the `generate_design_image` MCP tool without entering the full chat tool-use loop. This avoids creating a new endpoint while keeping the routing clean. The request payload: `{ channel, provider: "gemini", mode: "image-studio", prompt, referenceImages, aspectRatio, resolution }`. The relay returns `{ imageBase64, mimeType }` directly.
- **Reference ordering:** Style images first (establishes visual language), Character next (preserves identity), Content last (the base material). This matches the prompt structure.
- **Aspect ratio buttons:** Consider a compact button group (like the screenshot: `📐 16:9`) rather than a full dropdown — saves vertical space.
- **Preview sizing:** Use `object-fit: contain` so the preview respects the generated aspect ratio.

---

## File List

### MODIFIED
- `figmento/src/ui.html` — Prompt box + controls HTML in Image Studio panel
- `figmento/src/ui/image-studio.ts` — Generation logic, controls state

### CREATED
- (none expected)

---

## Definition of Done

- [ ] Plugin builds successfully
- [ ] Typing prompt + clicking Generate produces an image inline
- [ ] Aspect ratio and resolution controls affect the generated image
- [ ] Consistency toggle includes/excludes references
- [ ] Loading state shows during generation
- [ ] Error state shows on API failure with retry option
- [ ] Ctrl+Enter triggers generation

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | @sm | Story created from Epic IS Phase A |
