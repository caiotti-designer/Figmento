# Story IS-4: @Tag Autocomplete in Prompt Box

**Status:** Done
**Priority:** High (P0)
**Complexity:** L (8 points) — Custom autocomplete component, tag chip rendering, prompt-to-API mapping
**Epic:** IS — Image Studio
**Depends on:** IS-2 (reference slots), IS-3 (prompt box + generation)
**PRD:** [PRD-008](../prd/PRD-008-image-studio.md) — Phase B

---

## Business Value

The @tag system is the keystone feature of Image Studio. It bridges the gap between "upload reference images" and "use them precisely in prompts." Without it, users can upload references but have no way to tell the model which image is the style, which is the character, and which is the content. Google's own docs recommend "give each image an index" — @tags implement this naturally.

## Out of Scope

- Auto-describe (IS-5) — that populates prompts, this references images
- Prompt enhancement (IS-6) — must preserve @tags when enhancing
- New reference upload from within prompt box
- Multi-turn conversation (single prompt per generation)

## Risks

- contentEditable bugs across browsers (mitigated: use textarea + floating chip overlay pattern instead of contentEditable)
- @tag resolution when references are renamed or removed (mitigated: tags store reference ID, display updates reactively)
- Prompt text extraction complexity — must separate display chips from actual prompt text for API (mitigated: maintain parallel data: display HTML + clean prompt string)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "@tag autocomplete works, tags resolve to labeled images in API request, generation produces contextually correct output"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer writing prompts in Image Studio,
**I want** to type `@` and see a dropdown of my uploaded references, then select one to insert as a tag,
**so that** the AI model knows exactly which reference image I'm referring to in my prompt.

---

## Description

### Problem

When sending multiple reference images to Gemini, the model doesn't inherently know which image is the "style" vs "character" vs "content." Google's docs say the prompt must "clearly describe what each input image contributes." Writing this manually every time is tedious and error-prone.

### Solution

@tag autocomplete system:
1. Typing `@` opens a dropdown listing all uploaded references
2. Each entry shows: thumbnail (24×24), name, type icon
3. Selecting inserts a visual tag chip in the prompt area
4. When generating, the system resolves @tags to labeled images in the API request

### Implementation Pattern: Textarea + Overlay

**Do NOT use contentEditable.** Use a hidden textarea for actual input + a visible overlay div that renders the chip display. This is the pattern used by Slack, Discord, and GitHub mentions.

```
┌─────────────────────────────────────┐
│  Apply @img1 style to @gabs in     │  ← visible overlay (chips rendered)
│  front of @img2                     │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  Apply {{ref:id1}} style to        │  ← hidden textarea (tokens stored)
│  {{ref:id2}} in front of {{ref:id3}}│
└─────────────────────────────────────┘
```

The textarea stores token placeholders (`{{ref:id}}`), the overlay renders them as visual chips. On generation, tokens are resolved to the actual API structure.

### API Request Structure

When the prompt contains @tags, the generation builds this request:

```typescript
// Prompt: "Apply @img1 style to @gabs in front of @img2"
// References: img1 (Style), gabs (Character), img2 (Content)

const parts = [
  { text: "Image 1 (@img1 — Style reference):" },
  { inlineData: { mimeType: "image/jpeg", data: img1Base64 } },
  { text: "Image 2 (@gabs — Character reference):" },
  { inlineData: { mimeType: "image/jpeg", data: gabsBase64 } },
  { text: "Image 3 (@img2 — Content reference):" },
  { inlineData: { mimeType: "image/jpeg", data: img2Base64 } },
  { text: "Apply @img1 style to @gabs in front of @img2" }
];
```

Each image gets a labeled text prefix so the model understands the mapping.

---

## Acceptance Criteria

- [ ] AC1: Typing `@` in prompt box triggers autocomplete dropdown positioned below cursor
- [ ] AC2: Dropdown lists all uploaded references with: thumbnail (24×24), name (e.g., @img1), type icon (✦/👤/📷)
- [ ] AC3: Typing after `@` filters results in real-time (e.g., `@ga` shows only `@gabs`)
- [ ] AC4: Arrow keys navigate dropdown items, Enter or click selects
- [ ] AC5: Selected reference appears as visual tag chip (colored pill: blue for Style, green for Character, purple for Content)
- [ ] AC6: Tag chips show reference name and are deletable via Backspace (when cursor is right after chip) or click on chip's ✕
- [ ] AC7: Multiple @tags supported in a single prompt
- [ ] AC8: When generating, each @tagged reference gets a role-specific prefix in the API parts array:
  - Style: `"Image N (@name — Style reference):"`
  - Character: `"Image N (@name — Character reference):"`
  - Content: `"Image N (@name — Content reference):"`
- [ ] AC9: Images ordered in API request matching their order of appearance in the prompt
- [ ] AC10: When a reference is removed from slots (IS-2), corresponding @tag chips are removed from prompt with visual indication
- [ ] AC11: Dropdown closes on Escape, clicking outside, or when no matches found
- [ ] AC12: When consistency mode (∞) is OFF, only @tagged references sent to API — non-tagged excluded. When ON, all references sent (tagged ones get labels, non-tagged get generic "Reference image:" prefix)
- [ ] AC13: @tag dropdown appears above or below cursor based on available space (flip if near bottom)
- [ ] AC14: Empty references state: @tag dropdown shows "No references uploaded" with link to add

---

## Tasks

### Phase 1: Textarea + Overlay Architecture
- [ ] Create hidden textarea for raw input with token placeholders
- [ ] Create visible overlay div for rendered chip display
- [ ] Synchronize scroll, caret position, and dimensions between the two
- [ ] Ensure keyboard input goes to textarea, visual display comes from overlay

### Phase 2: Autocomplete Dropdown
- [ ] Detect `@` character in textarea input
- [ ] Build dropdown component with reference list
- [ ] Filter logic on subsequent keystrokes
- [ ] Keyboard navigation (arrow keys + Enter)
- [ ] Position dropdown near cursor (absolute positioning)
- [ ] Close on Escape / blur / no matches

### Phase 3: Tag Chip Rendering
- [ ] Define chip HTML template (colored pill with name + type icon + ✕)
- [ ] Color coding: blue (Style), green (Character), purple (Content)
- [ ] Insert token `{{ref:id}}` in textarea on selection
- [ ] Render chip in overlay where token exists
- [ ] Backspace deletion logic (detect when cursor is adjacent to token)

### Phase 4: API Request Builder
- [ ] Extract all `{{ref:id}}` tokens from textarea value
- [ ] Resolve to ImageReference objects from IS-2 store
- [ ] Build labeled parts array with role prefixes
- [ ] Build clean prompt text (replace tokens with @names for the final text part)
- [ ] Handle consistency mode (∞ ON = all refs, OFF = only @tagged)

### Phase 5: Reactive Updates
- [ ] Reference rename in IS-2 → update chip display in overlay
- [ ] Reference remove in IS-2 → remove chip from prompt + show toast
- [ ] New reference added → available in @tag dropdown immediately

---

## Dev Notes

- **Textarea + Overlay pattern** is battle-tested (Slack, Discord, GitHub). The key challenge is synchronizing caret position between hidden textarea and visible overlay. **Do NOT add external libraries** — this is a Figma plugin iframe, dependencies must stay minimal. Calculate caret position from font metrics: create a hidden `<span>` mirror with the same font/size, measure `offsetWidth` up to the caret index. This is ~30 lines of code.
- **Token format `{{ref:id}}`** is safe because users won't type double braces naturally. The overlay regex replaces these with chip HTML.
- **Chip colors** should use existing CSS custom properties from the plugin theme (or define new ones in the Image Studio scope).
- **Performance:** With max 14 references, filtering is trivial — no need for debounce or virtual scrolling.
- **Cross-story concern (IS-6 Enhance):** IS-6 MUST preserve `{{ref:id}}` tokens when enhancing prompts. Before sending to the enhance API, replace tokens with `[REF_1]`/`[REF_2]` placeholders (the model leaves these intact), then restore after response. This is documented in IS-6's Dev Notes.
- **API request structure reference** (move from Description for dev quick access):
  ```typescript
  // Each @tagged image gets a labeled prefix in the parts array:
  { text: "Image 1 (@img1 — Style reference):" },
  { inlineData: { mimeType: "image/jpeg", data: img1Base64 } },
  { text: "Image 2 (@gabs — Character reference):" },
  { inlineData: { mimeType: "image/jpeg", data: gabsBase64 } },
  { text: "Apply @img1 style to @gabs in front of @img2" }  // clean prompt last
  ```

---

## File List

### MODIFIED
- `figmento/src/ui.html` — Updated prompt box structure (textarea + overlay container)
- `figmento/src/ui/image-studio.ts` — @tag logic, autocomplete, API request builder

### CREATED
- (none expected — all logic in image-studio.ts)

---

## Definition of Done

- [ ] Plugin builds successfully
- [ ] @tag dropdown appears on typing `@`, filters correctly
- [ ] Tag chips render with correct colors per type
- [ ] Deleting/renaming references updates prompt chips reactively
- [ ] API request includes labeled images in correct order
- [ ] Consistency mode toggle works (∞ ON = all refs, OFF = @tagged only)
- [ ] Generation with @tags produces contextually correct images (manual visual verification)
- [ ] No console errors, no DOM leaks on repeated tag add/remove

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | @sm | Story created from Epic IS Phase B |
