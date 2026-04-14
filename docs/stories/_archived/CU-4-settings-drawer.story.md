# CU-4: Settings Drawer (Generation Config & Design Defaults)

**Epic:** CU — Chat-First Tool Unification
**Status:** Done
**Sprint:** 1
**Effort:** M (Medium)
**Owner:** @dev
**Dependencies:** None (parallel to CU-1)

---

## Description

Create a persistent settings drawer accessible from the chat header's ⚙ icon. The drawer consolidates all generation and design configuration that was previously scattered across 6 tool flows: image generation model (Nano Banana Pro selector), quality presets, default font, brand colors, grid toggle, and Bridge connection status. This replaces per-tool settings with one unified config surface.

## Acceptance Criteria

- [x] **AC1:** ⚙ button in chat header toggles a slide-in drawer from the right (280px wide)
- [x] **AC2:** Drawer has sections: **Generation**, **Design Defaults**, **Connection**
- [x] **AC3:** Generation section: Image model selector (dropdown: Nano Banana 2, Gemini Imagen, DALL-E), quality selector (1k / 2k / 4k radio), style preset (Auto / Photographic / Illustration / Artistic)
- [x] **AC4:** Design Defaults section: default font family (dropdown from typography knowledge), brand color chips (add/remove hex values), 8px grid toggle (on/off)
- [x] **AC5:** Connection section: Figma connection status, Bridge channel ID + status, relay URL display
- [x] **AC6:** All settings persist to `localStorage` under `figmento-settings` key
- [x] **AC7:** Settings load on plugin init and are accessible via `getSettings()` function
- [x] **AC8:** Drawer closes on click outside, Escape key, or ⚙ button toggle
- [x] **AC9:** Keyboard shortcut `Cmd/Ctrl+,` opens the drawer (matches IDE convention)
- [x] **AC10:** Drawer has smooth slide-in/out animation (200ms ease)
- [x] **AC11:** Settings drawer is a **new surface** distinct from the existing Settings tab — the existing Settings tab (API keys, provider config) remains unchanged. The drawer ⚙ icon is placed in the chat header toolbar (right side), separate from the Settings tab icon in the plugin sidebar

## Scope

**IN:**
- Drawer component (HTML + CSS + JS)
- Generation settings (model, quality, style)
- Design defaults (font, colors, grid)
- Connection status display
- localStorage persistence
- Keyboard shortcut

**OUT:**
- API key management (stays in existing Settings tab)
- Provider selection (stays in chat header dropdown)
- Per-tool custom instructions (killed with the tools)

## Risks

| Risk | Mitigation |
|------|-----------|
| Two ⚙ icons (sidebar Settings tab + chat header drawer) confuse users | AC11 clarifies they are distinct: sidebar = API keys/provider, drawer = design/generation config. Use a different icon for the drawer (e.g., sliders icon ⚡ or 🎛️) if testing reveals confusion |
| Settings drift: user changes font in drawer but old tool flow had different font saved | Drawer is the single source of truth for design defaults. Old per-tool settings are ignored once drawer is live. CU-6 removes old state objects |
| `localStorage` quota exceeded with brand color data | Brand colors are max 6 hex strings (~50 bytes total). No risk in practice |

## Technical Notes

- The drawer overlays the chat surface, doesn't push it — uses `position: fixed` or `absolute` within the plugin frame
- `getSettings()` returns a typed object used by `sendMessage()` to inject generation preferences into prompts
- The image model selector is the **primary reason** this drawer exists — users switch models per-task
- Brand color chips: max 6 colors, hex input with color picker, stored as array

## File List

| File | Action | Description |
|------|--------|-------------|
| `figmento/src/ui/chat.ts` | Modify | Settings drawer toggle, `getSettings()` export, keyboard shortcut |
| `figmento/src/ui/state.ts` | Modify | Add `SettingsState` type, localStorage load/save |
| `figmento/src/ui.html` | Modify | Drawer HTML structure + CSS |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm | Story created |
| 2026-03-17 | @po | Validation: Added AC11 (drawer vs Settings tab distinction), Risks section (dual ⚙ icon confusion) |
| 2026-04-11 | @qa (Quinn) | **QA Gate: PASS.** 11/11 ACs verified. Settings drawer, persistence, keyboard shortcut confirmed. Status: InProgress → Done. |
