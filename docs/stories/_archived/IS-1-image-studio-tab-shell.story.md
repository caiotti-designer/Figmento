# Story IS-1: Image Studio Tab Shell + Tab Switching

**Status:** Done
**Priority:** High (P0)
**Complexity:** S (3 points) — UI shell + tab switching, no backend changes
**Epic:** IS — Image Studio
**Depends on:** —
**PRD:** [PRD-008](../prd/PRD-008-image-studio.md) — Phase A

---

## Business Value

This story creates the foundational UI structure for the entire Image Studio feature. Without a dedicated tab, all subsequent stories (reference slots, @tags, auto-describe) have nowhere to live. The tab system also establishes the pattern for future plugin UI expansion.

## Out of Scope

- Reference slot management (IS-2)
- Prompt box and generation (IS-3)
- Any backend/MCP changes
- Settings or configuration for Image Studio

## Risks

- Tab switching may interfere with existing chat state management (mitigated: independent state stores)
- Plugin viewport may be too narrow for tab bar on some setups (mitigated: responsive tab design)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Tab bar renders, switching works, chat state preserved, no visual regressions"
quality_gate_tools: ["esbuild"]
```

---

## Story

**As a** Figmento plugin user,
**I want** to see a tab bar with "Chat" and "Image Studio" tabs,
**so that** I can switch between conversational design and focused image generation workflows.

---

## Description

### Problem

The plugin is a single-panel chat interface. Image generation via chat works but is suboptimal for iterative, reference-heavy workflows. There's no place to add image-specific UI controls.

### Solution

Add a tab bar at the top of the plugin UI (below header, above content). Two tabs: "Chat" (default, current UI) and "Image Studio" (new panel). Switching tabs hides one panel and shows the other while preserving state in both.

### Implementation Approach

1. Wrap existing chat UI in a container div (`#chat-panel`)
2. Create new empty container div (`#image-studio-panel`) with placeholder sections
3. Add tab bar above both panels
4. Tab switching toggles `display: none` on inactive panel (preserves DOM state)
5. Image Studio panel shows skeleton layout: References section, Prompt section, Controls bar, History section

---

## Acceptance Criteria

- [ ] AC1: Tab bar visible at top of plugin below header with "Chat" and "Image Studio" labels
- [ ] AC2: Clicking "Image Studio" shows the Image Studio panel and hides Chat panel
- [ ] AC3: Clicking "Chat" returns to Chat panel with full state preserved (messages, input text, scroll position)
- [ ] AC4: Image Studio panel shows placeholder sections with labels: "References", "Prompt", "Controls", "History"
- [ ] AC5: Tab state persists across interactions (no reset on switching back and forth)
- [ ] AC6: Default active tab is "Chat" on plugin load (backwards compatible)
- [ ] AC7: Active tab has visual indicator matching current dark theme (blue underline or highlight)

---

## Tasks

### Phase 1: Tab Bar HTML + CSS
- [ ] Add tab bar container to `ui.html` below header
- [ ] Style tabs to match existing dark theme (bg, hover, active states)
- [ ] Active tab indicator (bottom border or background change)

### Phase 2: Panel Containers
- [ ] Wrap existing chat content in `#chat-panel` div
- [ ] Create `#image-studio-panel` div with placeholder sections
- [ ] Ensure only one panel visible at a time

### Phase 3: Tab Switching Logic
- [ ] Event listeners on tab buttons
- [ ] Toggle panel visibility via CSS class
- [ ] Preserve chat scroll position on return

### Phase 4: Image Studio Skeleton
- [ ] References section placeholder (empty slots area)
- [ ] Prompt section placeholder (empty textarea area)
- [ ] Controls bar placeholder (buttons area)
- [ ] History section placeholder (empty strip)

### Phase 5: Verification
- [ ] Tab switching works 10+ times without state loss
- [ ] Chat messages, input text, scroll position preserved
- [ ] No visual regressions on existing chat UI
- [ ] Plugin build succeeds (`npm run build` in figmento/)

---

## Dev Notes

- **Do NOT refactor existing chat code** — just wrap it in a container div
- Tab switching should use CSS visibility/display, not DOM removal (preserves event listeners)
- Match the tab bar style to the existing model selector / settings header aesthetic
- Consider using icons alongside text: 💬 Chat, 🖼️ Image Studio (or use Lucide icons if available in the plugin)

---

## File List

### MODIFIED
- `figmento/src/ui.html` — tab bar HTML + Image Studio panel skeleton
- `figmento/src/ui/index.ts` — tab switching event listeners (if JS-driven)

### CREATED
- (none expected — all changes in existing files)

---

## Definition of Done

- [ ] Plugin builds successfully
- [ ] Tab bar renders in both light and dark themes
- [ ] Tab switching preserves chat state completely
- [ ] Image Studio panel shows skeleton layout
- [ ] No console errors on tab switch
- [ ] Existing chat functionality unchanged

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | @sm | Story created from Epic IS Phase A |
