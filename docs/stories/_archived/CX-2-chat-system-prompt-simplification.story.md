# CX-2: Chat System Prompt Simplification — Brownfield Addition

**Status:** Ready for Review
**Epic:** Chat Experience Improvements
**Estimate:** 4 hours
**Priority:** High (Quality Fix)

---

## User Story

As a Figmento developer,
I want the chat system prompt to be lean and chat-specific,
So that the AI doesn't attempt to call unavailable tools or follow rules that only apply to the MCP workflow.

---

## Story Context

**Existing System Integration:**
- Integrates with: `figmento-ws-relay/src/chat/system-prompt.ts` — `buildSystemPrompt()` function (relay mode)
- Integrates with: `figmento/src/ui/system-prompt.ts` — `buildSystemPrompt()` function (direct mode)
- Technology: TypeScript, string template literals
- Follows pattern: existing `buildSystemPrompt(brief, memory)` signature — signature does NOT change
- Touch points: called once per chat turn in `handleChatTurn()` / `runToolUseLoop()`

**Aria's Technical Notes:**
Current problems identified:
1. "MANDATORY QUALITY GATE" section references `run_refinement_check` and `evaluate_design` — both excluded from chat tools. The AI calls them and gets errors.
2. "DESIGN KNOWLEDGE TOOLS" section names `get_size_preset`, `get_color_palette`, `get_font_pairing` — the chat uses `lookup_size`, `lookup_palette`, `lookup_fonts` (different names). Causes confusion.
3. Print/A4 layout rules (auto-layout on every frame, page-margin 72px, etc.) are irrelevant for casual chat — they bloat the prompt by ~800 tokens with guidance the user never triggers.
4. No guidance on `analyze_canvas_context` (recently added).

---

## Acceptance Criteria

**Functional Requirements:**

1. The "MANDATORY QUALITY GATE" section is removed from both system prompts (relay + direct). The quality gate only applies to MCP mode where `run_refinement_check` is available
2. The "DESIGN KNOWLEDGE TOOLS" section is updated to use the correct chat tool names: `lookup_size`, `lookup_palette`, `lookup_fonts`, `lookup_blueprint`
3. Print/A4-specific layout rules (page-margin, section-gap, mandatory auto-layout on every print frame) are removed from the chat prompt. A single sentence replaces them: "For print formats, use auto-layout on all container frames with generous padding (72px+)."
4. The existing "CANVAS CONTEXT ANALYSIS" section (added in CX-0 / analyze_canvas_context feature) is kept and positioned correctly after the image generation section
5. Total system prompt token count (no brief, no memory) is ≤ 1800 tokens (down from ~2600)

**Integration Requirements:**

6. `buildSystemPrompt(brief, memory)` signature is unchanged in both files
7. Brief injection (palette, fonts, blueprint) still appended when brief is detected
8. Memory injection still appended when memory entries exist
9. The relay build (`tsc`) and plugin build (`npm run build`) pass with zero errors

**Quality Requirements:**

10. After the change, the AI no longer calls `run_refinement_check` in chat mode
11. After the change, the AI uses correct tool names (`lookup_size` not `get_size_preset`)
12. Spot-check: send "create an instagram post for a coffee shop" — verify AI calls `lookup_palette`, `lookup_fonts`, `lookup_blueprint` correctly

---

## Technical Notes

- **Integration Approach:** Edit the string template in `buildSystemPrompt()` in both `system-prompt.ts` files. The function signature, export, and callers remain untouched
- **Existing Pattern Reference:** `buildRefinementBlock()` private function in relay's `system-prompt.ts` — this function produces the quality gate section. Either delete the function or make it return empty string for chat context
- **Key Constraints:** Both relay and plugin system prompts must be kept in sync. Any change to one must be mirrored to the other

---

## Definition of Done

- [x] Quality gate section removed from both system prompts
- [x] Tool names corrected in both system prompts
- [x] Print-specific rules removed, replaced by single sentence
- [x] Token count verified ≤ 1800 (relay ~700 tokens; plugin ~1600 tokens — both under target)
- [x] `npm run build` (plugin) and `tsc` (relay) pass with zero errors
- [ ] Spot-check: no `run_refinement_check` call in chat mode

---

## Risk Assessment

- **Primary Risk:** Removing rules might cause AI to skip important checks (e.g., overlay direction)
- **Mitigation:** Only remove MCP-specific and print-specific sections. Keep all visual design rules (typography, layout, gradient overlay, canvas analysis)
- **Rollback:** Git revert on both `system-prompt.ts` files

---

## File List

- [x] `figmento-ws-relay/src/chat/system-prompt.ts` — buildRefinementBlock() returns '', tool names updated
- [x] `figmento/src/ui/system-prompt.ts` — buildRefinementBlock() returns '', tool names updated, print rules condensed

---

*— Morgan, planejando o futuro 📊*
