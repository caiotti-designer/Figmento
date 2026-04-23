# CX-1: One-Click Chat Templates — Brownfield Addition

**Status:** Ready for Review
**Epic:** Chat Experience Improvements
**Estimate:** 4 hours
**Priority:** High (Quick Win)

---

## User Story

As a Figmento user,
I want to see one-click prompt templates when I open the chat,
So that I can start designing immediately without thinking of what to type.

---

## Story Context

**Existing System Integration:**
- Integrates with: `figmento/src/ui/chat.ts` — `addChatWelcome()` function and `sendMessage()` flow
- Integrates with: `figmento/src/ui.html` — chat welcome screen HTML
- Technology: TypeScript + vanilla HTML/CSS (no framework)
- Follows pattern: existing `.chat-bubble.user` message rendering
- Touch points: `#chat-messages` container, `#chat-input` textarea, `$('chat-send')` button

**Aria's Technical Notes:**
- Array of `ChatTemplate` objects hardcoded as a constant in `chat.ts`
- Chips rendered in the welcome screen (`addChatWelcome()`)
- On click: populate `#chat-input` with the template prompt text
- Chips disappear after first message is sent (same trigger as welcome screen removal)
- Zero new dependencies, zero storage changes

---

## Acceptance Criteria

**Functional Requirements:**

1. When the chat is in welcome state (no messages), a row of template chips is visible below the welcome message
2. Each chip shows a short label (≤ 25 chars) and an emoji icon
3. Clicking a chip populates `#chat-input` with the full template prompt (does NOT auto-send — user can edit first)
4. At minimum 6 templates cover: Instagram ad, LinkedIn post, YouTube thumbnail, web hero section, presentation slide, and print flyer

**Integration Requirements:**

5. Chips disappear when the first message is sent (same behavior as `.chat-welcome` removal)
6. The `+` (new chat) button restores the chips correctly on reset
7. Existing `sendMessage()` flow is unchanged — chips only pre-fill the textarea

**Quality Requirements:**

8. Chips are horizontally scrollable if they overflow the panel width
9. No regression in existing send / new-chat / history behavior
10. Works in all 4 provider modes (Claude, Gemini, OpenAI, Claude Code)

---

## Suggested Template Set (minimum)

```typescript
const CHAT_TEMPLATES = [
  { icon: '📸', label: 'Instagram Ad',    prompt: 'Create an Instagram post (1080×1350) for a hippie coffee shop — warm earthy tones, vintage feel, include a CTA' },
  { icon: '💼', label: 'LinkedIn Post',   prompt: 'Create a LinkedIn post banner (1200×627) for a SaaS productivity tool — modern, clean, corporate blue' },
  { icon: '🎬', label: 'YouTube Thumb',  prompt: 'Create a YouTube thumbnail (1280×720) for a coding tutorial — dark background, bold text, tech feel' },
  { icon: '🌐', label: 'Web Hero',        prompt: 'Create a web hero section (1440×800) for a wellness app — soft greens, organic shapes, minimal' },
  { icon: '📊', label: 'Slide Deck',      prompt: 'Create a presentation title slide (1920×1080) for a startup pitch — bold, modern, dark theme' },
  { icon: '📄', label: 'A4 Flyer',        prompt: 'Create an A4 flyer (2480×3508) for a summer music festival — vibrant, energetic, neon accents' },
];
```

---

## Technical Notes

- **Integration Approach:** Add `CHAT_TEMPLATES` const and `renderChatTemplates()` function in `chat.ts`. Call it inside `addChatWelcome()`. Each chip gets a click handler that sets `chatInput.value = template.prompt`
- **Existing Pattern Reference:** `addChatWelcome()` in `chat.ts` — already renders HTML into `#chat-messages`
- **Key Constraints:** Keep chips within existing plugin panel width (~340px). Use `overflow-x: auto` on the chip container. Do NOT auto-submit — user must click Send

---

## Definition of Done

- [x] Templates visible in welcome state
- [x] Click pre-fills textarea correctly
- [x] Chips removed on first send (appendChatBubble removes .chat-templates)
- [x] New chat button restores chips (addChatWelcome → renderChatTemplates)
- [ ] Manual test in Figma across all providers
- [x] `npm run build` passes with zero errors

---

## Risk Assessment

- **Primary Risk:** None — purely additive UI, no logic changes
- **Mitigation:** N/A
- **Rollback:** Remove the `CHAT_TEMPLATES` constant and the `renderChatTemplates()` call

---

## File List

- [x] `figmento/src/ui/chat.ts` — CHAT_TEMPLATES const, renderChatTemplates(), addChatWelcome() + appendChatBubble() updated
- [x] `figmento/src/ui.html` — .chat-templates + .chat-template-chip CSS added

---

*— Morgan, planejando o futuro 📊*
