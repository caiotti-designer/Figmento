# CU-1: QuickAction Framework & Dropdown

**Epic:** CU — Chat-First Tool Unification
**Status:** Done
**Sprint:** 1
**Effort:** M (Medium)
**Owner:** @dev
**Dependencies:** None

---

## Description

Create the QuickAction system that allows lightweight inline cards to appear in the chat input area. A "+" dropdown in the chat header lets users pick a quick action (Screenshot to Layout, Ad Analyzer). Selecting one renders an inline card above the chat input with the tool's required fields. Submitting the card builds a structured prompt and sends it through the normal chat flow.

This is the **foundation** for CU-2 and CU-3 — it provides the framework, not the specific tool implementations.

## Acceptance Criteria

- [x] **AC1:** `QuickAction` and `QuickActionField` interfaces defined in `chat.ts`
- [x] **AC2:** `registerQuickAction(action: QuickAction)` function adds actions to a registry
- [x] **AC3:** "+" button in chat header opens a dropdown listing registered quick actions with icon + label
- [x] **AC4:** Clicking a quick action renders an inline card above the attachment queue in `.input-area`
- [x] **AC5:** Inline card renders all fields from the action's `fields` array (text inputs, selects, file drop zones)
- [x] **AC6:** Card has "Send" and "Cancel" buttons — Send calls `buildPrompt()` and feeds the result into `sendMessage()`
- [x] **AC7:** Cancel dismisses the card with no side effects
- [x] **AC8:** Only one quick action card can be active at a time — selecting another replaces it
- [x] **AC9:** Card respects existing attachment queue and selection badge (stacks above them)
- [x] **AC10:** Card has enter-animation (slide up, 150ms) and exit-animation (fade out, 100ms)
- [x] **AC11:** If `sendMessage()` is already processing (spinner visible), the card's Send button is disabled with a "Processing..." tooltip — prevents double-submission

## Scope

**IN:**
- QuickAction type system and registry
- Dropdown UI in chat header
- Inline card renderer (generic, field-driven)
- Integration with `sendMessage()` flow
- CSS for card, fields, buttons

**OUT:**
- Specific tool implementations (CU-2, CU-3)
- Settings drawer (CU-4)
- Removal of old tools (CU-6)

## Risks

| Risk | Mitigation |
|------|-----------|
| Card DOM ordering conflicts with MF-1 attachment queue and selection badge | AC9 specifies stacking order: card → selection badge → attachment queue → input. Use consistent `insertBefore` anchoring |
| "+" button reuses `#modeSelectorBtn` slot — old dropdown may still render during Sprint 1 coexistence | Hide old dropdown items when QuickAction is active; full cleanup in CU-6 |

## Technical Notes

- The inline card sits in `.input-area` above `#attachment-queue` and `#selection-badge`
- `buildPrompt()` can also attach files — the card may include a file drop zone that feeds into `pendingAttachments[]`
- The "+" button reuses the existing toolbar icon slot (currently used by the mode dropdown `#modeSelectorBtn`)

## File List

| File | Action | Description |
|------|--------|-------------|
| `figmento/src/ui/chat.ts` | Modify | Add QuickAction types, registry, dropdown, card renderer |
| `figmento/src/ui.html` | Modify | Add "+" button markup, dropdown container, card CSS |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm | Story created |
| 2026-03-17 | @po | Validation: Added AC11 (processing guard), Risks section |
| 2026-04-11 | @qa (Quinn) | **QA Gate: PASS.** 11/11 ACs verified. QuickAction interface, registry, card renderer confirmed in chat.ts:125-1651. Status: InProgress → Done. |
