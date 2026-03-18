# CU-5: Chat Prompt Templates (Replace Killed Tools)

**Epic:** CU — Chat-First Tool Unification
**Status:** InProgress
**Sprint:** 2
**Effort:** S (Small)
**Owner:** @dev
**Dependencies:** CU-1 (QuickAction framework)

---

## Description

Replace the 4 killed design tools (Text to Layout, Template Fill, Text to Presentation, Hero Generator) with **prompt template cards** on the chat welcome screen. Each card pre-fills the chat input with a well-crafted prompt that triggers the same MCP workflow the old tool wizard would have built. This preserves discoverability without maintaining separate UIs.

## Acceptance Criteria

- [x] **AC1:** Welcome screen shows 4 prompt template cards replacing the killed tools:
  - "Create a social post" (replaces Text to Layout)
  - "Fill a template" (replaces Template Fill)
  - "Build a presentation" (replaces Text to Presentation)
  - "Generate a hero image" (replaces Hero Generator)
- [x] **AC2:** Each card has icon, title, and one-line description matching the old tool
- [x] **AC3:** Clicking a card pre-fills the chat input with a structured prompt template with `{placeholders}` the user fills in
- [x] **AC4:** Template for "Create a social post": `Create a {format: Instagram/Twitter/LinkedIn} post about {topic}. Style: {mood}. Font: {font or "auto"}.`
- [x] **AC5:** Template for "Fill a template": `Scan the selected frame and fill all #-prefixed placeholders with content about {topic}.`
- [x] **AC6:** Template for "Build a presentation": `Create a {count}-slide presentation about {topic}. Format: {16:9/A4}. Style: {minimal/vibrant/dark}.`
- [x] **AC7:** Template for "Generate a hero image": `Generate a hero image: {subject description}. Position: {center/left/right}. Quality: {2k/4k}.`
- [x] **AC8:** Cards also appear in the QuickAction "+" dropdown as a "Templates" section (separate from Quick Actions)
- [x] **AC9:** Prompt templates coexist with existing welcome prompt cards (if any) — don't replace custom ones
- [x] **AC10:** Clicking a card focuses the input with cursor at the first `{placeholder}`
- [x] **AC11:** "Fill a template" card checks for Figma selection context — if no frame is selected, shows a subtle warning: "Select a frame with #-prefixed layers first" and disables the template until selection exists

## Scope

**IN:**
- 4 prompt template definitions
- Welcome screen card rendering
- Input pre-fill with placeholder highlighting
- Integration with "+" dropdown

**OUT:**
- Actual tool execution (chat + MCP handles that)
- Custom template editor (future feature)

## Risks

| Risk | Mitigation |
|------|-----------|
| Users don't discover prompt templates — they miss the old visual tool cards | Templates appear both in welcome screen AND in "+" dropdown "Templates" section (AC8). Two discovery paths |
| `{placeholder}` syntax confuses users who don't know to replace it | AC10 auto-selects the first placeholder so the user naturally types over it. Placeholders use distinct color styling |

## Technical Notes

- Prompt templates are defined as data, not code — easy to add more later
- `{placeholder}` syntax: select the placeholder text so user can type over it
- The templates encode the "best settings" from each killed tool into natural language

## File List

| File | Action | Description |
|------|--------|-------------|
| `figmento/src/ui/chat.ts` | Modify | Prompt template data, card rendering, input pre-fill |
| `figmento/src/ui.html` | Modify | Template card CSS (reuse existing prompt card styles) |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm | Story created |
| 2026-03-17 | @po | Validation: Added AC11 (selection check for template fill), Risks section |
