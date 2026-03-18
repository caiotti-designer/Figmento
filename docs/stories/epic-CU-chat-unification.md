# Epic CU: Chat-First Tool Unification

**Status:** Draft
**Priority:** High (P1)
**Owner:** @pm (Morgan)
**Architect:** @architect (Aria)
**Target:** Figmento Plugin v3.0
**Depends on:** Epic MF (Done) — multi-file attachment queue, Epic UI (Done) — chat layout

---

## Vision

Merge the 6 separate Design Tool flows into the chat interface as the single primary interaction surface. Chat becomes king — the only place users interact with Figmento. Tools that add no value over chat are killed; tools that need structured input become lightweight inline cards; generation settings move to a persistent drawer.

## Problem

The plugin currently maintains **two parallel interfaces** that compete for the same job — telling the AI what to design:

1. **Chat** — free-form text + attachments, conversation-based, iterative, reliable
2. **6 Design Tool Wizards** — structured forms (format cards, dropdowns, textareas), each with custom state, animations, and bugs

The tools are essentially **prompt builders with a GUI**. They collect format, content, and style, then construct a prompt that does the same thing chat does natively. This creates:

- **State fragmentation** — 6 separate state objects (`screenshotState`, `templateState`, `presentationState`, `heroState`, `adAnalyzerState`, `modeState`)
- **UX confusion** — users switch between two interfaces that do the same thing
- **Maintenance burden** — ~4000 lines of flow HTML + per-tool JS modules
- **No iteration** — tool output drops into Figma but can't be refined conversationally
- **Bugs** — mode switching, animation edge cases, state leaks between flows

## Architecture (from @architect)

### Three-Tier Strategy

| Tier | Action | Tools Affected |
|------|--------|---------------|
| **1. Kill** | Remove entirely — chat replaces them | Text to Layout, Template Fill, Text to Presentation, Hero Generator |
| **2. Quick Actions** | Keep as inline cards in chat input area | Screenshot to Layout, Ad Analyzer |
| **3. Settings Drawer** | Persistent config accessible from header | Image gen model, quality, style, design defaults |

### Why Kill 4 Tools?

| Tool | Why Chat Replaces It |
|------|---------------------|
| Text to Layout | "Create an Instagram post for X" = same thing, but chat iterates |
| Template Fill | `scan_template` + `apply_template_text/image` are MCP tools chat invokes naturally |
| Text to Presentation | `create_presentation` is one MCP call — "Create a 10-slide deck about X" |
| Hero Generator | "Generate a hero image of woman in blazer, studio lighting" = chat message |

### Why Keep 2 as Quick Actions?

| Tool | Why It Needs UI |
|------|----------------|
| Screenshot to Layout | Needs image upload + optional crop — specific structured input |
| Ad Analyzer | Needs image + product name + category + platform — then Bridge handles rest |

### QuickAction Data Model

```typescript
interface QuickAction {
  id: string;
  label: string;
  icon: string;
  fields: QuickActionField[];
  buildPrompt: (values: Record<string, string>, attachments: AttachmentFile[]) => string;
}

interface QuickActionField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'file';
  required: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}
```

## Stories

| Story | Title | Effort | Sprint | Dependencies |
|-------|-------|--------|--------|-------------|
| CU-1 | QuickAction framework & dropdown | M | 1 | None |
| CU-2 | Screenshot to Layout inline card | M | 1 | CU-1 |
| CU-3 | Ad Analyzer inline card | M | 1 | CU-1 |
| CU-4 | Settings drawer (generation config) | M | 1 | None (parallel) |
| CU-5 | Chat prompt templates (replace killed tools) | S | 2 | CU-1 |
| CU-6 | Remove legacy flows & HTML cleanup | L | 2 | CU-2, CU-3, CU-5 |
| CU-7 | Polish pass & keyboard shortcuts | S | 3 | CU-6 |

### Sprint Plan

**Sprint 1 — Foundation (non-breaking):**
CU-1 + CU-2 + CU-3 + CU-4 — new system runs alongside old tools

**Sprint 2 — Kill the flows (breaking):**
CU-5 + CU-6 — remove old code, convert tool settings into prompt templates

**Sprint 3 — Polish:**
CU-7 — keyboard shortcuts, animations, suggested prompts from selection

## Lines of Code Impact (Estimated)

| Action | Files | Lines Removed | Lines Added |
|--------|-------|---------------|-------------|
| Kill tool flows (HTML) | ui.html | ~2000 | 0 |
| Kill tool modules | text-layout.ts, template.ts, presentation.ts, hero-generator.ts | ~3000 | 0 |
| Kill tool state | state.ts | ~120 | 0 |
| QuickAction system | chat.ts (new section) | 0 | ~300 |
| Inline cards (2) | chat.ts | 0 | ~250 |
| Settings drawer | chat.ts + ui.html | 0 | ~400 |
| Prompt templates | chat.ts | 0 | ~100 |
| **Net** | | **~5120** | **~1050** |

**Net reduction: ~4000 lines.** The plugin gets dramatically simpler.

## Success Criteria

1. Chat is the only interaction surface — no mode selector, no flow wizards
2. Screenshot to Layout works as inline card → attach image → optional crop → send → design appears
3. Ad Analyzer works as inline card → attach ad → fill metadata → send → Bridge orchestrates
4. Settings drawer controls image gen model (Nano Banana Pro), quality, default fonts/colors
5. Welcome screen shows prompt templates replacing killed tools (e.g., "Create a social post", "Fill a template", "Build a presentation")
6. All existing MCP tool capabilities remain accessible through chat
7. Plugin loads faster (fewer modules, less HTML)
8. Zero regression in design output quality

## Risks

| Risk | Mitigation |
|------|-----------|
| Users miss the visual tool cards | Prompt templates in welcome screen provide same discoverability |
| Screenshot crop UX is hard to inline | Keep crop as modal overlay triggered from inline card |
| Ad Analyzer Bridge polling is complex | Extract Bridge status into reusable component, embed in chat message stream |
| Large HTML deletion breaks things | Sprint 1 is additive — old tools remain until Sprint 2 confirms parity |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm (Morgan) | Epic created from @architect (Aria) unification proposal |
