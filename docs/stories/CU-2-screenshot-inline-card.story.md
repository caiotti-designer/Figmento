# CU-2: Screenshot to Layout Inline Card

**Epic:** CU — Chat-First Tool Unification
**Status:** InProgress
**Sprint:** 1
**Effort:** M (Medium)
**Owner:** @dev
**Dependencies:** CU-1 (QuickAction framework)

---

## Description

Implement the Screenshot to Layout tool as a QuickAction inline card in chat. The card provides an image drop zone, optional format selector, and a "Generate" button. Submitting builds a prompt with the screenshot attached and sends it through chat. The existing crop modal can be triggered from the card if the user wants to crop before sending.

## Acceptance Criteria

- [x] **AC1:** Quick action registered: `{ id: 'screenshot-to-layout', label: 'Screenshot to Layout', icon: '📸' }`
- [x] **AC2:** Card shows a file drop zone that accepts PNG/JPG/WEBP images
- [x] **AC3:** Dropping/pasting an image shows a thumbnail preview in the card
- [x] **AC4:** Optional "Crop" button opens the existing crop modal overlay — cropped result replaces the preview
- [x] **AC5:** Optional format selector (Auto, Instagram, Twitter, LinkedIn, etc.) — defaults to Auto
- [x] **AC6:** "Generate" button builds prompt: `"Convert this screenshot to a Figma layout. Format: {format}."` with the image attached
- [x] **AC7:** Prompt + attachment flows through `sendMessage()` — response streams in chat
- [x] **AC8:** Card validates: image required before Generate is enabled
- [x] **AC9:** After submission, card dismisses and chat shows the user message with attachment badge
- [x] **AC10:** Image size limit enforced: max 20MB per file (consistent with MF-1 queue limits), error toast on oversized file

## Scope

**IN:**
- QuickAction registration for screenshot-to-layout
- Image drop zone in card
- Crop modal reuse (extract from `screenshot.ts`)
- Format selector dropdown
- Prompt builder

**OUT:**
- The old `#screenshotFlow` wizard (removed in CU-6)
- New crop implementation — reuse existing

## Risks

| Risk | Mitigation |
|------|-----------|
| Extracting `openCropModal()` from `screenshot.ts` breaks the old `#screenshotFlow` during Sprint 1 coexistence | Extraction must be a pure refactor — old flow calls the same extracted function. Test both paths before merging |
| Large screenshots (4K+) may be slow to render as thumbnail in the inline card | Resize preview to max 200px width client-side before displaying; full-res image still sent to API |

## Technical Notes

- Extract the crop overlay logic from `screenshot.ts` into a reusable `openCropModal(imageDataUri): Promise<string>` function
- The card's file drop zone should also accept paste events
- Format options come from `get_design_guidance(aspect="size")` presets or hardcoded common formats

## File List

| File | Action | Description |
|------|--------|-------------|
| `figmento/src/ui/chat.ts` | Modify | Register quick action, image drop zone, prompt builder |
| `figmento/src/ui/screenshot.ts` | Modify | Extract crop modal into reusable function |
| `figmento/src/ui.html` | Modify | CSS for image drop zone in card |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm | Story created |
| 2026-03-17 | @po | Validation: Added AC10 (size limit), Risks section (crop extraction compat) |
