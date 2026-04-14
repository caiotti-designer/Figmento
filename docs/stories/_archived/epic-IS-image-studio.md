# Epic IS — Image Studio

> A dedicated image generation workspace with reference slots, @tag system, auto-describe, and prompt enhancement — powered by Google Nano Banana 2.

| Field | Value |
|-------|-------|
| **Epic ID** | IS |
| **Priority** | HIGH (Owner's requested feature) |
| **Owner** | @pm (Morgan) |
| **Architect** | @architect (Aria) |
| **PRD** | [PRD-008](../prd/PRD-008-image-studio.md) |
| **Status** | Done — All 8 stories implemented |
| **Created** | 2026-03-27 |
| **Milestone** | M10 — Creative Productivity |
| **Depends On** | image-gen.ts (Nano Banana 2 integration) — complete |
| **Parallel With** | Epic ODS — no mutual blocking |

---

## Strategic Context

Figmento already generates images via Gemini Nano Banana 2 (`image-gen.ts`), but the workflow is chat-based — suboptimal for iterative image generation. This epic adds a dedicated tab that treats image creation as a first-class task-oriented workflow.

### Existing Infrastructure (validated)

| Capability | Status | Location |
|-----------|--------|----------|
| Nano Banana 2 generation | **Working** | `image-gen.ts` — `generateDesignImage()` |
| Reference images (up to 14) | **API confirmed** | 10 object + 4 character via `inlineData` parts |
| Aspect ratio control (14 options) | **Working** | `imageConfig.aspectRatio` |
| Resolution (512/1K/2K/4K) | **Working** | `imageConfig.imageSize` |
| Two-phase generation | **Working** | 512px preview → high-res replacement |
| File upload in plugin UI | **Working** | `#chat-file-upload` handler |
| Gemini Flash for vision analysis | **Working** | Used by `analyze_brief`, chat engine |
| Canvas image placement | **Working** | `place_generated_image`, `create_image` |

### Key Gaps This Epic Fills

1. No dedicated image generation UI (only chat-based)
2. No reference slot management (upload, label, categorize, reuse)
3. No @tag system for precise image referencing in prompts
4. No auto-describe workflow (image → prompt reverse engineering)
5. No prompt enhancement button
6. No generation history with thumbnails

---

## Phase A — Image Studio Shell + Reference Slots (Foundation)

> **Goal:** Tab exists, references can be uploaded and managed, basic generation works from the new UI.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| IS-1 | Image Studio Tab Shell + Tab Switching | @dev | @qa | — | Draft |
| IS-2 | Reference Slot Manager (Upload, Categorize, Rename, Remove) | @dev | @qa | IS-1 | Draft |
| IS-3 | Basic Prompt Box + Generation Integration | @dev | @qa | IS-1 | Draft |

### IS-1: Image Studio Tab Shell + Tab Switching

**Scope:** Add a tab bar to the plugin UI with Chat and Image Studio tabs. Switching tabs preserves state in both panels. Image Studio tab shows empty shell with placeholder sections.

**Acceptance Criteria:**
- [ ] AC1: Tab bar visible at top of plugin with "Chat" and "Image Studio" tabs
- [ ] AC2: Clicking "Image Studio" shows the Image Studio panel, hides Chat panel
- [ ] AC3: Clicking "Chat" returns to Chat panel with full state preserved (messages, input)
- [ ] AC4: Image Studio panel shows placeholder sections: References, Prompt, Controls, History
- [ ] AC5: Tab state persists across interactions (no reset on tab switch)
- [ ] AC6: Default tab is Chat (backwards compatible)
- [ ] AC7: Active tab has visual indicator (underline/highlight matching current dark theme)

### IS-2: Reference Slot Manager

**Scope:** Upload images as references, assign to Style/Character/Content categories, rename, remove, see thumbnails. Counter shows X/14 usage.

**Acceptance Criteria:**
- [ ] AC1: Three pre-defined slot categories: Style, Character, Content — each with distinct icon
- [ ] AC2: "Add" button opens file picker (PNG, JPG, WebP) — image added as Content by default
- [ ] AC3: Drag & drop images onto any slot category to upload and assign
- [ ] AC4: Each uploaded reference shows thumbnail (48×48), editable name, type badge, remove button
- [ ] AC5: Default naming: `@img1`, `@img2`, etc. — user can rename to any alphanumeric name (e.g., `@gabs`)
- [ ] AC6: Counter shows "X/14" at top right of References section
- [ ] AC7: Category limits enforced: max 4 Character, max 10 Style+Content — show warning when limit reached
- [ ] AC8: References stored in session memory (survive tab switches, cleared on plugin close)
- [ ] AC9: Images compressed to max 2MB before storage (maintain visual quality for thumbnails)
- [ ] AC10: Remove button deletes reference and updates counter + any @tags in prompt that reference it

### IS-3: Basic Prompt Box + Generation Integration

**Scope:** Prompt textarea, aspect ratio selector, resolution selector, consistency toggle, generate button. Calls existing `generate_design_image` pipeline.

**Acceptance Criteria:**
- [ ] AC1: Prompt textarea with placeholder "Describe your image..." — min 3 rows, auto-expand
- [ ] AC2: Aspect ratio selector with options: 1:1, 16:9, 9:16, 4:3, 3:4, 4:5, 5:4, 3:2, 2:3, 21:9
- [ ] AC3: Resolution selector: 512 (Preview), 1K, 2K, 4K — default 1K
- [ ] AC4: Consistency toggle (∞ ON/OFF) — when ON, includes all uploaded references in every generation
- [ ] AC5: Generate button triggers generation via existing MCP `generate_design_image` pathway
- [ ] AC6: All uploaded references sent as `referenceImages` in the API request, ordered by type (Style → Character → Content)
- [ ] AC7: Loading state shown during generation (spinner on Generate button, disabled inputs)
- [ ] AC8: Generated image displayed inline below the prompt box as preview
- [ ] AC9: Error states handled gracefully (API failure, rate limit, invalid prompt)
- [ ] AC10: Quantity selector (- 1 +) for future batch support — v1 always generates 1

---

## Phase B — @Tag System + Prompt Intelligence (Core UX)

> **Goal:** @tags work in prompts with autocomplete, auto-describe converts images to prompts, enhance improves prompts with AI.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| IS-4 | @Tag Autocomplete in Prompt Box | @dev | @qa | IS-2, IS-3 | Draft |
| IS-5 | Auto-Describe (Image Drop → Prompt Generation) | @dev | @qa | IS-3 | Draft |
| IS-6 | Prompt Enhancement Button | @dev | @qa | IS-3 | Draft |

### IS-4: @Tag Autocomplete in Prompt Box

**Scope:** Typing `@` in the prompt box opens a dropdown listing all uploaded references with thumbnails, names, and types. Selecting inserts a styled tag chip. Tags are resolved to labeled images when generating.

**Acceptance Criteria:**
- [ ] AC1: Typing `@` in prompt box triggers autocomplete dropdown
- [ ] AC2: Dropdown shows all uploaded references with: thumbnail (24×24), name (@img1), type icon (Style/Character/Content)
- [ ] AC3: Typing after `@` filters results (e.g., `@ga` shows `@gabs`)
- [ ] AC4: Arrow keys navigate dropdown, Enter/click selects
- [ ] AC5: Selected reference inserted as visual tag chip (colored pill with name) — not plain text
- [ ] AC6: Tag chips are deletable (backspace or click X)
- [ ] AC7: Multiple @tags supported in single prompt
- [ ] AC8: When generating, each @tagged image gets a role prefix in the API request:
  - Style: "Use the visual style, color palette, and texture from this reference (@name):"
  - Character: "Maintain this character's appearance consistently (@name):"
  - Content: "Use this image as the base content to transform (@name):"
- [ ] AC9: Images ordered in API request matching prompt order (first @tag = first image part)
- [ ] AC10: Removing a reference from slots also removes its @tag chips from prompt
- [ ] AC11: @tag dropdown closes on Escape or clicking outside
- [ ] AC12: When consistency mode (∞) is OFF, only @tagged references are sent — non-tagged references excluded

### IS-5: Auto-Describe (Image Drop → Prompt Generation)

**Scope:** Dragging an image onto the prompt box area triggers AI vision analysis that generates a recreatable prompt.

**Acceptance Criteria:**
- [ ] AC1: Drag & drop zone activates when dragging image file over prompt box area (visual highlight)
- [ ] AC2: Dropping image triggers "Analyzing image..." spinner in prompt box
- [ ] AC3: Image sent to Gemini Flash (text-only mode) for description — NOT image generation model
- [ ] AC4: Generated prompt populates the prompt box (replaces current content if empty, appends if not)
- [ ] AC5: Two modes via toggle: "Recreate" (detailed, faithful) and "Inspire" (essence, creative latitude)
- [ ] AC6: Recreate mode prompt includes: subject, composition, lighting, color palette, mood, style, camera angle
- [ ] AC7: Inspire mode prompt includes: mood, aesthetic direction, key visual elements — omits precise details
- [ ] AC8: Analysis completes in < 5 seconds (Gemini Flash is fast)
- [ ] AC9: Dropped image is NOT automatically added as reference — user can manually add it if desired
- [ ] AC10: Error handling: if vision fails, show "Could not analyze image" with retry option

### IS-6: Prompt Enhancement Button

**Scope:** ✨ button that sends current prompt to a cheap AI model for improvement, shows diff preview.

**Acceptance Criteria:**
- [ ] AC1: ✨ button visible next to prompt box (or inside it)
- [ ] AC2: Clicking sends current prompt text to Gemini Flash Lite (cheapest available model)
- [ ] AC3: Enhancement adds: lighting, composition terms, atmosphere, photography terms, material details
- [ ] AC4: Original intent preserved — enhancement is additive, not rewriting
- [ ] AC5: UI shows before/after inline diff (original struck-through, additions highlighted)
- [ ] AC6: [Accept] button replaces prompt with enhanced version
- [ ] AC7: [Reject] button keeps original prompt unchanged
- [ ] AC8: Enhancement completes in < 3 seconds
- [ ] AC9: Button disabled while enhancement is loading (prevent double-click)
- [ ] AC10: If prompt is empty, button is disabled with tooltip "Write a prompt first"

---

## Phase C — Polish + History (Complete Experience)

> **Goal:** Generation history with thumbnails, send to canvas, quality of life.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| IS-7 | Generation History Panel | @dev | @qa | IS-3 | Draft |
| IS-8 | Send to Canvas Integration | @dev | @qa | IS-7 | Draft |

### IS-7: Generation History Panel

**Scope:** Scrollable strip of generated image thumbnails. Click to view full size, re-use prompt, or send to canvas.

**Acceptance Criteria:**
- [ ] AC1: History section at bottom of Image Studio tab shows thumbnails (64×64) of generated images
- [ ] AC2: Horizontal scrollable strip — newest on left
- [ ] AC3: Clicking thumbnail shows full-size preview in a modal/overlay
- [ ] AC4: Each history entry stores: generated image (base64), prompt used, references used, aspect ratio, resolution, timestamp
- [ ] AC5: "Re-use prompt" button populates the prompt box with the stored prompt
- [ ] AC6: History persists within session (cleared on plugin close)
- [ ] AC7: Maximum 20 entries in history (oldest dropped when exceeded)
- [ ] AC8: Empty state: "Generated images will appear here"

### IS-8: Send to Canvas Integration

**Scope:** Button on history entries and current generation to place the image on the Figma canvas.

**Acceptance Criteria:**
- [ ] AC1: "Send to Canvas" button on full-size preview modal
- [ ] AC2: "Send to Canvas" button on current generation result
- [ ] AC3: Placing image uses existing `place_generated_image` / `create_image` pipeline
- [ ] AC4: Image placed at current viewport center or next to selection
- [ ] AC5: Frame created with descriptive name (first 40 chars of prompt)
- [ ] AC6: Success feedback: "Image placed on canvas" toast notification

---

## Execution Order

```
IS-1 (Tab Shell)
 ├── IS-2 (Reference Slots) ──┐
 │                              ├── IS-4 (@Tag Autocomplete)
 └── IS-3 (Prompt + Generate) ─┤
                                ├── IS-5 (Auto-Describe)
                                ├── IS-6 (Enhance Prompt)
                                └── IS-7 (History) ── IS-8 (Send to Canvas)
```

Phase A stories (IS-1/2/3) can partially overlap — IS-2 and IS-3 both depend on IS-1 but are independent of each other.

---

## Risk Register

| # | Risk | Severity | Likelihood | Mitigation | Owner |
|---|------|----------|------------|------------|-------|
| R1 | @tag contentEditable complexity | HIGH | MEDIUM | Use textarea + floating chip overlay pattern (proven in Slack/Discord) | @dev |
| R2 | Style conditioning is prompt-engineered, not API-native | MEDIUM | HIGH | Good default prefixes; let users see/edit the final prompt sent to API | @dev |
| R3 | Auto-describe produces vague prompts for abstract images | MEDIUM | MEDIUM | Two modes (Recreate/Inspire); user always edits before generating | @dev |
| R4 | Large reference images slow UI | MEDIUM | MEDIUM | Compress to 2MB; use thumbnail previews; lazy-load base64 | @dev |
| R5 | Tab switching may cause state leaks with chat | LOW | LOW | Independent state stores; no shared mutable state | @dev |
| R6 | Gemini rate limits on rapid describe/enhance calls | LOW | LOW | Cache describe results per image hash; debounce enhance | @dev |

---

## Metrics

| Metric | Baseline (chat) | Target (Image Studio) |
|--------|-----------------|----------------------|
| Steps to generate with references | 5-8 messages | 1 interaction |
| Time to recreate inspiration image | N/A | < 10s (drop + describe + generate) |
| Reference reuse per session | Re-upload each time | Upload once, @tag many |
| Prompt quality (photography terms present) | Rare | Standard (via enhance) |

---

## Decisions Log

| Date | Decision | Rationale | Decided By |
|------|----------|-----------|------------|
| 2026-03-27 | Dedicated tab, not drawer/modal | Reference slots + prompt + history need vertical space; task-oriented workflow differs from conversational chat | @pm + Owner |
| 2026-03-27 | Session-scoped persistence only (v1) | Simplicity; cross-session is ODS-8 territory | Owner |
| 2026-03-27 | @tag via prompt engineering, not API params | Gemini has no native style/character API slots — all images go as inlineData, role defined by prompt text | @pm (API research) |
| 2026-03-27 | Auto-describe does NOT auto-add as reference | Separation of concerns: describe extracts prompt text, user decides if image should be a reference too | @pm |
| 2026-03-27 | Gemini Flash Lite for enhance (cheapest model) | Enhancement is text-only, doesn't need image capabilities — cost optimization | @pm |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | @pm (Morgan) | Epic created from PRD-008 with 8 stories across 3 phases |
