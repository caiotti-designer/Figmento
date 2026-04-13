# CU-3: Ad Analyzer Inline Card

**Epic:** CU — Chat-First Tool Unification
**Status:** Done
**Sprint:** 1
**Effort:** M (Medium)
**Owner:** @dev
**Dependencies:** CU-1 (QuickAction framework), CU-4 (soft — Bridge channel from settings drawer; fallback: read from existing `adAnalyzerState` or prompt user)

---

## Description

Implement the Ad Analyzer as a QuickAction inline card in chat. The card collects: ad image, product name, product category, platform format, and optional notes. Submitting builds a structured prompt and either sends it through the chat flow (direct mode) or initiates the Bridge handoff to Claude Code (bridge mode). Bridge status updates stream into the chat message area.

## Acceptance Criteria

- [x] **AC1:** Quick action registered: `{ id: 'ad-analyzer', label: 'Ad Analyzer', icon: '🎯' }`
- [x] **AC2:** Card shows fields: image drop zone, product name (text), category (text), platform (select: Instagram 4:5, 1:1, Story, Facebook Feed), notes (optional textarea)
- [x] **AC3:** Dropping an ad image shows thumbnail preview in card
- [x] **AC4:** Platform selector defaults to "Instagram 4:5"
- [x] **AC5:** "Analyze" button builds prompt with all metadata and attached image
- [x] **AC6:** If Bridge is connected, triggers `start_ad_analyzer` → `complete_ad_analyzer` flow via MCP tools
- [x] **AC7:** Bridge progress updates render as status messages in the chat stream (not a separate panel)
- [x] **AC8:** If Bridge is not connected, falls back to direct chat analysis with the image
- [x] **AC9:** Card validates: image + product name required before Analyze is enabled
- [x] **AC10:** After submission, card dismisses and analysis progress appears in chat
- [x] **AC11:** If Bridge disconnects mid-analysis, a chat error bubble shows "Bridge connection lost — analysis may be incomplete. Reconnect in Settings and retry." with a retry button
- [x] **AC12:** Bridge channel ID is read from CU-4 settings drawer if available; falls back to existing `adAnalyzerState.channelId` or prompts user to enter one

## Scope

**IN:**
- QuickAction registration for ad-analyzer
- Structured fields card (image + text + select)
- Bridge status integration into chat message stream
- Prompt builder with metadata

**OUT:**
- The old `#adAnalyzerFlow` wizard (removed in CU-6)
- Bridge connection management (stays in settings drawer, CU-4)
- New Bridge protocol — reuse existing `bridge.ts`

## Risks

| Risk | Mitigation |
|------|-----------|
| Bridge disconnects mid-analysis — user sees spinning progress forever | AC11 adds error state with retry. Implement a 120s timeout on Bridge polling — if no update, show timeout error |
| CU-4 not landed yet when CU-3 starts — Bridge channel has no settings home | AC12 fallback chain: settings drawer → existing state → user prompt. CU-3 works without CU-4 |
| Bridge polling in chat bubbles creates many DOM nodes on long analyses | Cap progress messages to last 5, collapse older ones into "... N earlier updates" |

## Technical Notes

- Extract `startBridgePoll()` and `displayReport()` from `ad-analyzer.ts` — adapt to render in chat bubbles
- Bridge channel ID comes from the settings drawer (CU-4) or existing state
- The prompt includes structured metadata: `[AD ANALYSIS]\nProduct: {name}\nCategory: {category}\nPlatform: {platform}\nNotes: {notes}`

## File List

| File | Action | Description |
|------|--------|-------------|
| `figmento/src/ui/chat.ts` | Modify | Register quick action, fields card, Bridge chat integration |
| `figmento/src/ui/ad-analyzer.ts` | Modify | Extract Bridge polling + report into reusable functions |
| `figmento/src/ui.html` | Modify | CSS for multi-field card layout |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm | Story created |
| 2026-03-17 | @po | Validation: Added AC11 (Bridge error state), AC12 (channel fallback), CU-4 soft dependency, Risks section |
| 2026-04-11 | @qa (Quinn) | **QA Gate: PASS.** 12/12 ACs verified. `ad-analyzer` registered at chat.ts:2004. Bridge integration, error handling, fallback chain confirmed. Status: InProgress → Done. |
