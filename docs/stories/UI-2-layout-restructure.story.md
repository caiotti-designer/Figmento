# Story UI-2: Layout Restructure — Single-Surface Chat

**Status:** Done
**Priority:** Critical (P0)
**Complexity:** L (8 points) — 1 file major rewrite (ui.html HTML + CSS), 1 file moderate modify (chat.ts)
**Epic:** UI — Plugin UX/UI Revamp
**Depends on:** UI-1 (design tokens must be in place)
**PRD:** UX audit 2026-03-17 — Aesthetron AI reference layout

---

## Business Value

The current plugin has 4 tabs (Chat, Modes, Bridge, Settings) that fragment the experience and hide the chat — the most important surface — behind a tab. The Aesthetron AI reference shows a single-surface design where chat IS the app, with settings contextually accessible via a gear icon. This restructure makes chat the primary (and only) surface, dramatically simplifying the UX.

## Out of Scope

- Design token changes (done in UI-1)
- Dark mode toggle UI (UI-3)
- Multi-file upload (MF-1 — separate epic)
- New prompt template content (use existing templates, just restyle)

## Risks

- **Breaking existing mode flows** — Screenshot-to-layout, text-to-layout, template fill, presentation, hero generator, ad analyzer flows must still work. They move from the Modes tab into a mode dropdown or prompt templates.
- **Settings panel regression** — Moving from tab to sheet overlay may lose some settings sections if not carefully migrated.
- **Chat.ts DOM manipulation** — chat.ts directly manipulates DOM elements by ID. Changing IDs or structure requires updating chat.ts references.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, chat works end-to-end, all 6 modes accessible via dropdown, settings sheet opens/closes, bridge config accessible in settings"
quality_gate_tools: ["esbuild", "manual Figma plugin test"]
```

---

## Story

**As a** designer using Figmento,
**I want** the plugin to open directly to a clean chat interface with contextual access to settings and modes,
**so that** I can start designing immediately without navigating tabs.

---

## Description

### Problem

4-tab layout wastes vertical space (tab bar ~36px), forces users to switch contexts, and hides the chat. The Modes tab shows 6 cards that create decision paralysis. Bridge and Settings tabs are rarely used but always visible.

### Solution

#### New Layout Structure

```html
<body data-theme="light">
  <!-- Top Bar (40px) -->
  <header class="top-bar">
    <div class="top-bar-left">
      <span class="logo">◆ Figmento</span>
    </div>
    <div class="top-bar-right">
      <button class="icon-btn" id="newChatBtn" title="New chat">
        <!-- + icon -->
      </button>
      <button class="icon-btn" id="historyBtn" title="Chat history">
        <!-- clock icon -->
      </button>
      <button class="icon-btn" id="settingsBtn" title="Settings">
        <!-- gear icon + status dot -->
      </button>
    </div>
  </header>

  <!-- Main Chat Area (flex: 1) -->
  <main class="chat-surface">
    <!-- Messages scroll area -->
    <div id="chat-messages" class="chat-messages">
      <!-- Empty state: welcome + prompt templates -->
      <!-- Active state: message bubbles -->
    </div>

    <!-- Loading indicator -->
    <div id="chat-loading" class="chat-loading">...</div>

    <!-- Attachment preview (future: multi-file) -->
    <div id="attachment-preview" class="attachment-preview"></div>

    <!-- Input Area -->
    <div class="input-area">
      <textarea id="chat-input" placeholder="Describe a design to generate..." rows="1"></textarea>
      <div class="input-toolbar">
        <div class="input-toolbar-left">
          <button class="toolbar-select" id="modelSelector">
            <!-- Model name + chevron -->
          </button>
          <button class="toolbar-select" id="modeSelector">
            <!-- Mode name + chevron -->
          </button>
        </div>
        <div class="input-toolbar-right">
          <button class="icon-btn" id="uploadBtn" title="Attach files">
            <!-- paperclip icon -->
          </button>
          <button class="send-btn" id="sendBtn">
            <!-- arrow-up icon (circular) -->
          </button>
        </div>
      </div>
    </div>
  </main>

  <!-- Settings Sheet (overlay, hidden by default) -->
  <div class="sheet-overlay" id="settingsOverlay">
    <div class="sheet" id="settingsSheet">
      <!-- Settings content: API keys, model, bridge, theme toggle -->
    </div>
  </div>

  <!-- Mode-specific flow containers (hidden, shown on mode activation) -->
  <div id="screenshotFlow" class="mode-flow hidden">...</div>
  <div id="textFlow" class="mode-flow hidden">...</div>
  <!-- etc. -->
</body>
```

#### Key Layout Decisions

1. **Tab bar removed** — No more `unified-tab-bar` element
2. **Top bar** — 40px fixed header with logo, + New, history, settings gear
3. **Chat surface** — Single flex column taking remaining space
4. **Input area** — Fixed bottom: textarea + toolbar row (model dropdown, mode dropdown, upload, send)
5. **Settings sheet** — Slide-from-right overlay triggered by gear icon, contains ALL settings (API keys, model selection, bridge config, theme toggle)
6. **Mode flows** — Existing screenshot/text/template flows remain as hidden containers, activated when user selects a mode from the dropdown or clicks a prompt template
7. **Prompt template cards** — Replace the small chips with full-width cards (title + description), shown in empty chat state

#### Welcome / Empty State

```
┌─────────────────────────────────┐
│                                 │
│         ◆                       │
│    Figmento                     │
│    Your AI design assistant     │
│                                 │
│  Try these prompts:             │
│                                 │
│  ┌─────────────────────────┐    │
│  │ Login UI                │    │
│  │ Create a modern login..│    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ Product Card            │    │
│  │ Create a product card.. │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ Dashboard               │    │
│  │ Create a high-fidelity..│    │
│  └─────────────────────────┘    │
│                                 │
└─────────────────────────────────┘
```

#### Mode Selector Dropdown

The bottom-bar mode selector replaces the Modes tab. Available modes:
- **Design** (default) — Chat-based design generation
- **Screenshot to Layout** — Opens screenshot flow overlay
- **Text to Layout** — Opens text-to-layout flow
- **Template Fill** — Opens template fill flow
- **Presentation** — Opens presentation flow
- **Hero Generator** — Opens hero flow
- **Ad Analyzer** — Opens ad analyzer flow

Selecting a non-chat mode opens the corresponding flow container as an overlay on top of the chat surface.

#### Settings Sheet Sections

1. **API Keys** — Anthropic, Gemini, OpenAI (migrated from current Settings tab)
2. **Model** — Dropdown for each provider (migrated from current Chat Settings tab)
3. **Bridge** — Relay URL, channel ID, connect/disconnect (migrated from Bridge tab)
4. **Appearance** — Theme toggle (light/dark), prepared for UI-3

---

## Acceptance Criteria

- [ ] **AC1:** Tab bar (`unified-tab-bar`) is removed from the HTML
- [ ] **AC2:** Top bar renders with logo, + New button, history button, settings gear with status dot
- [ ] **AC3:** Chat messages area takes full available height between top bar and input area
- [ ] **AC4:** Input area is fixed at the bottom with textarea + toolbar row
- [ ] **AC5:** Model selector dropdown in toolbar shows current model and allows switching
- [ ] **AC6:** Mode selector dropdown in toolbar shows current mode and allows switching
- [ ] **AC7:** Clicking settings gear opens a slide-from-right sheet overlay
- [ ] **AC8:** Settings sheet contains API keys, model selection, bridge config, and theme placeholder
- [ ] **AC9:** Clicking sheet overlay backdrop or close button closes the sheet
- [ ] **AC10:** Empty chat state shows welcome message + prompt template cards (full-width)
- [ ] **AC11:** Clicking a prompt template card populates the chat input and sends the message
- [ ] **AC12:** Selecting a non-chat mode (e.g., Screenshot to Layout) from the dropdown opens the existing flow overlay
- [ ] **AC13:** All 6 existing modes remain functional and accessible
- [ ] **AC14:** Send button is circular with arrow-up icon, uses `--accent` background
- [ ] **AC15:** `npm run build` succeeds in `figmento/`
- [ ] **AC16:** Chat end-to-end works (send message → receive response → tool actions shown)

---

## Tasks

### Phase 1: HTML Restructure (AC1, AC2, AC3, AC4)

- [ ] Remove `unified-tab-bar` and `unified-tab-content` wrapper divs
- [ ] Create top bar HTML: `header.top-bar` with logo + icon buttons
- [ ] Create `main.chat-surface` wrapper containing messages + loading + input
- [ ] Restructure input area: textarea above, toolbar row below (model dropdown, mode dropdown, upload btn, send btn)
- [ ] Style top bar: height 40px, flex row, `--bg-primary` background, `--border` bottom border
- [ ] Style chat surface: flex column, `flex: 1`, overflow hidden
- [ ] Style input area: fixed bottom, `--bg-primary` background, `--border` top border

### Phase 2: Settings Sheet (AC7, AC8, AC9)

- [ ] Create sheet overlay HTML: backdrop + slide-in panel
- [ ] Migrate API key fields from current Settings tab into sheet
- [ ] Migrate model dropdowns from current Chat Settings tab into sheet
- [ ] Migrate bridge config from current Bridge tab into sheet
- [ ] Add theme toggle placeholder section (functional in UI-3)
- [ ] Style sheet: `position: fixed`, `right: 0`, `width: 320px`, slide transition
- [ ] Wire gear icon click → open sheet, backdrop click → close sheet
- [ ] Wire close button → close sheet

### Phase 3: Prompt Template Cards (AC10, AC11)

- [ ] Create welcome state HTML in chat-messages: logo icon + title + subtitle
- [ ] Create template card components: full-width, `--bg-secondary` background, `--border`, `--radius-lg`
- [ ] Each card: bold title (14px semibold) + description (12px secondary, truncated 2 lines)
- [ ] Wire click handler: populate `chat-input` textarea + trigger send
- [ ] Hide welcome state when first message is sent
- [ ] Migrate existing template chip content to new card format

### Phase 4: Mode & Model Dropdowns (AC5, AC6, AC12, AC13)

- [ ] Create model selector dropdown in input toolbar
- [ ] Populate with available models based on configured API keys
- [ ] Create mode selector dropdown with all 7 modes (Design + 6 legacy)
- [ ] Style dropdowns: shadcn-inspired popover, `--bg-primary` background, `--border`, `--radius-md`
- [ ] Wire mode selection → activate corresponding flow container as overlay
- [ ] Ensure mode flows can return to chat (back button / close)

### Phase 5: Icon Buttons (AC2, AC14)

- [ ] Create `.icon-btn` component: 32px square, transparent bg, `--border` on hover, `--radius-md`
- [ ] + New button: plus icon, resets chat state
- [ ] History button: clock icon (placeholder, no functionality yet)
- [ ] Settings button: gear icon + colored status dot (connection indicator)
- [ ] Upload button: paperclip icon (reuses existing upload logic from chat.ts)
- [ ] Send button: circular, 32px, `--accent` background, white arrow-up icon

### Phase 6: chat.ts DOM Reference Updates (AC16)

- [ ] Update any `document.getElementById` calls that reference renamed/moved elements
- [ ] Ensure `chat-messages`, `chat-input`, `chat-send`, `chat-upload-btn`, `chat-file-upload` IDs are preserved or remapped
- [ ] Verify `renderAttachmentPreview()` still finds its container
- [ ] Verify `renderWelcome()` works with new welcome state structure
- [ ] Verify tool action rows render correctly in new layout

### Phase 7: Build & Verify (AC15)

- [ ] Run `npm run build` in `figmento/`
- [ ] Test in Figma: open plugin → see welcome state
- [ ] Test: send a chat message → see response
- [ ] Test: open settings sheet → configure API key → close
- [ ] Test: switch mode → screenshot flow opens → back to chat
- [ ] Test: click prompt template → sends message

---

## Dev Notes

- **Preserve element IDs** where possible. `chat.ts` uses `getElementById` for: `chat-messages`, `chat-input`, `chat-send`, `chat-loading`, `chat-upload-btn`, `chat-file-upload`, `chat-new`, `chat-learn`, `relay-status-bar`, `relay-status-dot`, `relay-status-label`, `relay-channel-display`.
- **The settings sheet replaces 3 containers:** current `tab-settings` content, `tab-bridge` content, and the chat settings within `tab-chat`. Merge them into one sheet.
- **Mode flows** (`screenshotFlow`, `textFlow`, etc.) currently live inside `tab-modes`. They need to be siblings of `main.chat-surface`, shown as overlays when activated.
- **The `renderWelcome()` function** in chat.ts (around line 170-220) creates the welcome state dynamically. Update it to create the new card-style templates instead of chip pills.
- **Model selector** needs to read from settings state (which API keys are configured) to show available models. This logic exists in the current chat settings tab — reuse it.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui.html` | MODIFY | HTML restructure (remove tabs, add top bar, sheet, new layout) + new CSS |
| `figmento/src/ui/chat.ts` | MODIFY | Update DOM references, renderWelcome() for card templates, wire new buttons |

---

## Definition of Done

- [ ] No tab bar visible
- [ ] Single-surface chat layout renders
- [ ] Top bar with logo + icons works
- [ ] Settings sheet opens/closes
- [ ] All 6 legacy modes accessible via dropdown
- [ ] Prompt template cards visible and clickable
- [ ] Chat end-to-end functional
- [ ] Plugin builds

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @sm (River) | Initial draft from UX audit |
| 2026-03-17 | @ux-design-expert (Uma) | Layout architecture approved, Aesthetron reference matched |
| 2026-03-17 | @po (Pax) | Validation GO (10/10). Status Draft → Ready |
