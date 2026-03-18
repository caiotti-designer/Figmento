# CU-6: Remove Legacy Flows & HTML Cleanup

**Epic:** CU — Chat-First Tool Unification
**Status:** InProgress
**Sprint:** 2
**Effort:** L (Large)
**Owner:** @dev
**Dependencies:** CU-2, CU-3, CU-5 (all replacements must be live first)

---

## Description

Remove the 6 Design Tool flow wizards, the mode selector grid, the `#tab-modes` container, and all associated JS modules. This is the **breaking change** — once done, the plugin has one surface: chat + quick actions + settings drawer. Estimated removal: ~5000 lines of HTML + JS.

## Acceptance Criteria

- [x] **AC1:** `#tab-modes` container and all child flows removed from `ui.html`:
  - `#screenshotFlow`
  - `#textLayoutFlow`
  - `#templateFillFlow`
  - `#presentationFlow`
  - `#heroGeneratorFlow`
  - `#adAnalyzerFlow`
- [x] **AC2:** `#modeSelector` grid (the 6 card grid) removed from `ui.html`
- [x] **AC3:** Mode dropdown in chat header (`#modeSelectorBtn`, `#modeDropdown`) replaced with QuickAction "+" dropdown
- [x] **AC4:** JS modules deleted or gutted:
  - `text-layout.ts` — delete entirely (mode selector + text-to-layout flow)
  - `template.ts` — delete entirely
  - `presentation.ts` — delete entirely
  - `hero-generator.ts` — delete entirely
  - `screenshot.ts` — keep only extracted `openCropModal()` function, delete rest
  - `ad-analyzer.ts` — keep only extracted Bridge functions, delete rest
- [x] **AC5:** State objects removed from `state.ts`:
  - `screenshotState`
  - `templateState`
  - `presentationState`
  - `heroState`
  - `adAnalyzerState`
  - `modeState` (replaced by simple `currentQuickAction` in chat)
- [x] **AC6:** All CSS for `.mode-selector`, `.mode-card`, `.flow`, `.flow-section`, `.format-card`, etc. removed from `ui.html`
- [x] **AC7:** `initModeUI()`, `initModeSelector()`, `selectPluginMode()` removed from initialization chain
- [x] **AC8:** `index.ts` init chain updated — no longer calls deleted module init functions
- [x] **AC9:** Plugin builds successfully with `npm run build`
- [x] **AC10:** Plugin loads, chat works, quick actions work, settings drawer works — no regressions
- [x] **AC11:** Net line reduction is ≥ 3500 lines

## Scope

**IN:**
- Delete/gut 6 flow containers (HTML)
- Delete 4 JS modules, gut 2
- Remove mode state objects
- Remove mode-related CSS (~800 lines estimated)
- Update init chain
- Verify build + no regressions

**OUT:**
- New features (already in CU-1 through CU-5)
- Settings tab refactoring (separate concern)

## Technical Notes

- **Do Sprint 2 ONLY after Sprint 1 is confirmed working** — this is destructive
- Before deleting, grep for any cross-references to deleted functions/elements
- `screenshot.ts` crop logic must already be extracted (CU-2 prerequisite)
- `ad-analyzer.ts` Bridge functions must already be extracted (CU-3 prerequisite)
- The `postToSandbox({ type: 'select-mode' })` message handler in `code.ts` can also be removed

## Risk Mitigation

- Create a git branch `feat/cu-6-legacy-removal` before starting
- Build and test after each major deletion (not all at once)
- Keep deleted code accessible in git history (no squash)

## File List

| File | Action | Description |
|------|--------|-------------|
| `figmento/src/ui.html` | Major modify | Remove ~2000 lines of flow HTML + ~800 lines CSS |
| `figmento/src/ui/text-layout.ts` | Delete | Mode selector + text-to-layout flow |
| `figmento/src/ui/template.ts` | Delete | Template fill flow |
| `figmento/src/ui/presentation.ts` | Delete | Presentation flow |
| `figmento/src/ui/hero-generator.ts` | Delete | Hero generator flow |
| `figmento/src/ui/screenshot.ts` | Major modify | Keep only `openCropModal()`, delete rest |
| `figmento/src/ui/ad-analyzer.ts` | Major modify | Keep only Bridge functions, delete rest |
| `figmento/src/ui/state.ts` | Modify | Remove 5 tool state objects + modeState |
| `figmento/src/ui/index.ts` | Modify | Remove deleted init calls |
| `figmento/src/code.ts` | Modify | Remove `select-mode` handler |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm | Story created |
