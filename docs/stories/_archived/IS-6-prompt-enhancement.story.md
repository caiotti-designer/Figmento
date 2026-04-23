# Story IS-6: Prompt Enhancement Button (✨ Enhance)

**Status:** Done
**Priority:** High (P0)
**Complexity:** S (3 points) — Simple API call + inline diff UI
**Epic:** IS — Image Studio
**Depends on:** IS-3 (prompt box must exist)
**PRD:** [PRD-008](../prd/PRD-008-image-studio.md) — Phase B

---

## Business Value

Most users write basic prompts. The Enhance button upgrades any prompt with professional photography and composition terminology — resulting in dramatically better image quality. It's a one-click quality multiplier that teaches users better prompting by example (they see what was added).

## Out of Scope

- Multi-round enhancement (enhance once only, no "enhance again")
- Custom enhancement style ("make it more artistic" etc.)
- Enhancement of @tags (tags pass through unchanged)

## Risks

- Enhancement may alter the user's original intent (mitigated: show diff, require accept/reject)
- Cheap model may produce low-quality enhancements (mitigated: specific system prompt with examples)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Enhance produces improved prompt in < 3s, diff shows clearly, accept/reject works, @tags preserved"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** designer who wrote a basic prompt,
**I want** to click a button that improves my prompt with professional terminology,
**so that** the generated image is higher quality without me needing prompt engineering expertise.

---

## Description

### Problem

"A tractor in a field" produces mediocre results. "A red tractor in a golden wheat field, golden hour side lighting, shallow depth of field, rule of thirds composition, warm color palette with amber and ochre tones" produces stunning results. Most users don't know the second vocabulary.

### Solution

✨ button that sends the prompt to a cheap, fast model with a prompt engineering system prompt. Shows before/after diff so the user learns and can accept or reject.

### System Prompt

```
You are a prompt engineer specializing in AI image generation. Improve the given prompt by adding:
- Specific lighting (golden hour, studio, overcast, rim lighting, etc.)
- Composition terms (rule of thirds, leading lines, symmetry, negative space)
- Atmosphere and mood (serene, dramatic, intimate, epic)
- Photography/art terms (shallow DOF, bokeh, wide angle, macro, impasto)
- Material and texture details (matte, glossy, weathered, translucent)
- Color temperature and palette descriptions

Rules:
- Keep the original subject and intent intact
- Add 3-5 specific enhancements, not a wall of text
- Do NOT add text/typography instructions unless the original prompt mentions text
- Preserve any @tag references exactly as written (e.g., @img1, @gabs)
- Return ONLY the improved prompt. No explanations.
- Maximum 200 words.
```

---

## Acceptance Criteria

- [ ] AC1: ✨ button visible inside or adjacent to prompt box
- [ ] AC2: Clicking sends current prompt text to Gemini Flash Lite (cheapest model)
- [ ] AC3: @tag tokens (`{{ref:id}}`) preserved — only surrounding text is enhanced
- [ ] AC4: Response shown as inline diff: original text in muted color, additions highlighted in green/accent
- [ ] AC5: [Accept] button replaces prompt with enhanced version
- [ ] AC6: [Reject] button dismisses diff and keeps original prompt unchanged
- [ ] AC7: Enhancement completes in < 3 seconds
- [ ] AC8: Button disabled + spinner while enhancement is loading
- [ ] AC9: Button disabled with tooltip "Write a prompt first" when prompt is empty
- [ ] AC10: Enhanced prompt preserves line breaks and structure from original
- [ ] AC11: Diff view is dismissible (auto-dismiss after 30s if no action)

---

## Tasks

### Phase 1: Enhance API Call
- [ ] Extract clean prompt text (strip @tag tokens, save positions)
- [ ] Send to Gemini Flash Lite with enhancement system prompt
- [ ] Receive enhanced text
- [ ] Re-insert @tag tokens at original positions (or best-effort match)

### Phase 2: Diff Display
- [ ] Simple diff algorithm: compare original vs enhanced word-by-word
- [ ] Render: removed words in strikethrough/muted, added words in highlighted/green
- [ ] Display inline below the prompt box (overlay or expansion)

### Phase 3: Accept/Reject
- [ ] Accept: replace prompt textarea content with enhanced version (including @tokens)
- [ ] Reject: dismiss diff, no changes
- [ ] Auto-dismiss after 30s timeout

### Phase 4: Edge Cases
- [ ] Empty prompt → button disabled
- [ ] Prompt with only @tags → enhance the space between/around tags
- [ ] Very long prompt (500+ chars) → truncate to 1000 chars before sending
- [ ] API failure → show "Enhancement failed" toast, keep original

---

## Dev Notes

- **Model choice:** Use the cheapest available Gemini model for text-only tasks. `gemini-2.0-flash-lite` or equivalent. This is a text-in/text-out task, no image capabilities needed.
- **@tag preservation:** Before sending to enhance API, replace `{{ref:id}}` tokens with placeholder markers like `[REF_1]`, `[REF_2]`. The model will leave these intact (they look like formatting markers). After response, replace back.
- **Diff algorithm:** Don't need a full diff library. Simple approach: split both texts by words, find additions (words in enhanced not in original). Highlight those. For v1, even just showing "Original: ..." and "Enhanced: ..." side by side is acceptable.
- **Cost:** Gemini Flash Lite is essentially free for text tasks (~$0.0001 per call). No cost concern.

---

## File List

### MODIFIED
- `figmento/src/ui.html` — Enhance button + diff display container
- `figmento/src/ui/image-studio.ts` — Enhance API call, diff logic, accept/reject handlers

### CREATED
- (none expected)

---

## Definition of Done

- [ ] Plugin builds successfully
- [ ] Enhance produces improved prompt in < 3s
- [ ] @tags preserved through enhancement
- [ ] Diff clearly shows what changed
- [ ] Accept replaces prompt, Reject keeps original
- [ ] Button disabled when prompt is empty
- [ ] No console errors

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | @sm | Story created from Epic IS Phase B |
