# PRD-006: One-Click Design System — Brief-to-Figma Pipeline

**Status:** Reviewed — Ready for Epic Creation
**Author:** Product Owner (Human) + Strategic Advisor (Claude)
**Date:** 2026-03-25
**Reviewed by:** @pm (Morgan) — 2026-03-25
**Architecture spike by:** @architect (Aria) — 2026-03-25
**Epic:** ODS — One-Click Design System
**Priority:** High (Owner's #1 requested workflow)
**Target milestone:** M9 — Designer Productivity

---

## 0. Executive Context for @pm (Morgan)

### The Workflow

The product owner described their ideal Figmento workflow:

> "Upload a website project PDF or briefing, add the client's logo to canvas, then with one command Figmento builds a clean, professional, complete design system — all variables set in Figma. Plus a context saving feature: connect to a project folder or create a new one, close the plugin, reopen, select the folder and it has all context of the project."

This is three features fused into one end-to-end pipeline:

1. **Brief Intelligence** — PDF/image upload → AI extracts brand values, colors from logo, typography direction, tone, content structure
2. **Figma-Native DS Generation** — AI creates real Figma variables (color tokens, spacing, radius), text styles, and base components — not visual swatches, actual infrastructure
3. **Project Context Persistence** — Save/load project state across sessions. Close plugin, reopen, pick up where you left off with full context.

### Why Now

Epic FN just shipped — Figmento now has DS awareness (FN-6 through FN-9), auto-batch performance (FN-P3), and color snapping. This PRD builds on that foundation:

- FN-6 (Discovery) scans existing DS → PRD-006 *creates* DS from scratch
- FN-8 (Variable Binding) binds to existing variables → PRD-006 *creates* those variables
- FN-9 (Prompt Context) injects DS into prompts → PRD-006 ensures there's always a DS to inject
- Auto-batch executes 50+ commands in one roundtrip → PRD-006 generates 100+ DS elements efficiently

### Existing Infrastructure

| Capability | Status | Location |
|-----------|--------|----------|
| DS token generation from mood/preset | Working | `figmento-mcp-server/src/tools/design-system/ds-crud.ts` — `create_design_system` |
| 8 pre-built design systems | Working | `knowledge/design-systems/` (payflow, stripe, noir-cafe, flowdesk, linear, mailchimp, etc.) |
| 5 presets (shadcn, material, minimal, luxury, vibrant) | Working | `knowledge/presets/` |
| Component recipes (button, badge, card, divider, avatar) | Working | `knowledge/components/core.yaml` + `web-ui.yaml` |
| Token resolution engine | Working | DS-05 in `design-system/ds-crud.ts` |
| Brand kit CRUD with YAML persistence | Working | `save_brand_kit` / `get_brand_kit` tools |
| Figma variable creation (basic) | **Working** | `create_figma_variables` + `create_variables_from_design_system` in `figma-native.ts` — creates single-collection, single-mode variables |
| Plugin variable handler | **Working** | `handleCreateFigmaVariables` in `figmento/src/handlers/canvas-query.ts` (L553-612) — uses `setValueForMode(modes[0])` |
| Gemini PDF reading | Native | Gemini accepts PDF as base64 in multi-part content |
| Figma text style creation API | Available | `figma.createTextStyle()` — **not yet implemented in Figmento** |
| Figma component creation API | Available | `figma.createComponent()`, `figma.createComponentSet()` — **not yet implemented in Figmento** |
| clientStorage (per-user, per-plugin) | Working | Used by preferences, corrections, DS cache, settings (5+ storage keys across 4 handler files) |

**Gap analysis:** Variable creation infrastructure exists but creates single-collection, single-mode only. The main missing capabilities are: (1) PDF/image upload in plugin chat UI (no chat attachment handler exists), (2) brief→brand analysis AI pipeline, (3) multi-collection variable creation with proper hierarchy, (4) text style creation, (5) component creation, (6) project context persistence as portable YAML.

---

## 1. Problem Statement

Figmento can create designs, but every session starts cold. The designer must:

1. Manually set up a design system in Figma (variables, styles, components)
2. Re-explain brand context every conversation
3. Hope the AI picks appropriate colors, fonts, and spacing
4. Lose all project context when closing the plugin

For a web designer working on 5-10 client projects, this cold-start friction happens dozens of times per week. The design system setup alone takes 30-60 minutes per project when done manually in Figma.

### Evidence

- FN-6 scan found 50 variables + 0 components in test file — the variables were created manually by the designer, not by Figmento
- Every chat test required explicit "use my design system" instructions despite having the DS toggle on
- Brand kit YAML exists but is disconnected from Figma variables — it's metadata, not live infrastructure
- No mechanism to save/restore project context between sessions

---

## 2. Vision

> "Upload your brief and logo. Figmento builds your entire design system in Figma — real variables, real styles, real components. Every design after that is automatically on-brand. Close the plugin, come back tomorrow, pick up exactly where you left off."

### The One-Click Flow

```
1. Designer opens new Figma file
2. Opens Figmento → "New Project" → names it "Gartni"
3. Uploads client PDF brief (project scope, brand values, target audience)
4. Adds client logo to canvas (or uploads as image)
5. Clicks "Generate Design System"
6. AI processes:
   a. Extracts brand values, tone, industry from PDF
   b. Analyzes logo colors → generates primary/secondary/accent palette
   c. Selects typography pairing based on industry + tone
   d. Determines spacing scale, radius, shadow tokens
7. Figmento creates IN FIGMA:
   a. Variable collection "Gartni" with all color tokens (primary, secondary, accent + scales)
   b. Variable collection "Spacing" with spacing tokens (4, 8, 12, 16, 24, 32, 48, 64)
   c. Variable collection "Radius" with radius tokens (0, 4, 8, 12, 16, full)
   d. Text styles (Display, H1, H2, H3, Body Large, Body, Body Small, Caption)
   e. Base components (Button, Card, Badge, Input, Divider) using the tokens
8. DS toggle auto-enables — all subsequent designs use the new system
9. Project saved — brief, DS config, chat history, brand kit, preferences all persisted
10. Tomorrow: Designer opens plugin → selects "Gartni" → full context restored
```

---

## 3. Goals & Non-Goals

### Goals

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | Generate a complete Figma DS from PDF brief + logo in one click | Variables, text styles, and ≥3 components created in **<120 seconds** |
| G2 | Create real Figma variables, not visual swatches | All color/spacing/radius tokens are `figma.variables` bound to named collections |
| G3 | Create real text styles | All typography levels registered as `figma.createTextStyle()` |
| G4a | Create base components (no variants) | Button, Card, Badge created as `figma.createComponent()` with auto-layout + bound variables |
| G4b | Add component variants (Phase D) | Button (primary/secondary/ghost) grouped via `figma.createComponentSet()` |
| G5 | Extract brand intelligence from PDF | AI identifies brand values, tone, industry, target audience from uploaded brief |
| G6 | Extract palette from logo | AI analyzes logo image → generates primary/secondary/accent + full scale (50-950) |
| G7 | Persist project context as portable file | Save/load `figmento-project.yaml` in project folder — DS config, brief, brand kit, preferences, chat summary |
| G8 | Zero cold-start on returning to a project | Select project folder → all context restored → DS toggle enabled → ready to design |

### Non-Goals

| # | Non-Goal | Reason |
|---|----------|--------|
| NG1 | Cloud-based project sync across devices | Project YAML lives in project folder — synced by designer's own tools (Git, Dropbox, etc.). No Figmento backend needed. |
| NG2 | Collaborative DS editing (multiple designers) | Single-author YAML file. Multi-user editing needs conflict resolution. Defer. |
| NG3 | Import existing DS from another file | FN-6 already scans existing DS. This PRD creates DS from scratch. |
| NG4 | Full component library (50+ components) | Start with 3 core components (Button, Card, Badge). Expand based on usage. |
| NG5 | DS versioning / changelog | V1 is create + update. History tracking adds complexity. Defer. |
| NG6 | Light/dark mode theming | Variable mode API supports it (`collection.addModeAsync`), but V1 creates single-mode (Default) only. Multi-mode doubles variable creation work. Defer to V2. |

---

## 4. Feature Breakdown

### Feature 1: Brief Intelligence (PDF + Logo → Brand Analysis)

**What:** Upload a PDF brief and/or logo image. AI extracts brand identity.

**How it works in plugin chat:**
- Designer uploads PDF — plugin sends as base64 to Gemini (native PDF reading) or Claude (document support)
- Designer adds logo on canvas or uploads as image attachment
- AI returns structured brand analysis:
  ```
  Brand: Gartni
  Industry: AgTech / Smart Irrigation
  Tone: Professional, trustworthy, innovative, eco-conscious
  Primary color (from logo): #2AB6BD (teal)
  Secondary color (from logo): #BDB8C1 (cool gray)
  Accent color (derived): #70D445 (green — eco association)
  Typography direction: Modern sans-serif, clean, technical
  Suggested pairing: Manrope (headings) + Inter (body)
  Spacing base: 8px
  Radius: Moderate (8px default, 16px cards)
  Shadow: Subtle, cool-toned
  ```

**Technical implementation:**
- **Plugin UI (ODS-1a):** New file input handler in plugin iframe — accepts PDF + image files, converts to base64, sends alongside chat message. No chat infrastructure exists today; this is net-new plugin UI work.
- **MCP tool (ODS-1b):** `analyze_brief` — accepts PDF base64 + optional logo image base64. AI vision extracts dominant colors from logo, generates harmonious palette. Returns structured brand JSON. Logo color extraction is part of this tool, not a separate tool.
- Builds on existing `knowledge/color-system.yaml` for palette generation and `knowledge/typography.yaml` for font pairing

### Feature 2: Figma-Native DS Generation

**What:** From the brand analysis, create actual Figma infrastructure — not visual documentation.

**What gets created:**

| Figma Artifact | Count | Details |
|---------------|-------|---------|
| Variable Collection: Brand Colors | 1 | primary, secondary, accent + 50/100/300/500/700 scales per color |
| Variable Collection: Neutrals | 1 | 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950 |
| Variable Collection: Spacing | 1 | 4, 8, 12, 16, 24, 32, 48, 64 |
| Variable Collection: Radius | 1 | 0, 4, 8, 12, 16, full (9999) |
| Text Styles | 8 | Display (64), H1 (48), H2 (32), H3 (24), Body Lg (20), Body (16), Body Sm (12), Caption (12) |
| Components | 5+ | Button (3 variants), Card, Badge, Input, Divider — all using bound variables |

**Technical implementation:**
- New sandbox handlers: `create_variable_collection`, `create_variable`, `create_text_style`, `create_component_with_variants`
- New chat tool: `generate_design_system_in_figma` — takes brand analysis JSON, calls sandbox handlers to create everything
- Uses token generation from existing `create_design_system` (DS-01) but outputs to Figma API instead of YAML
- Components use `figma.createComponent()` with auto-layout, bound variables, and proper naming

### Feature 3: Project Context Persistence

**What:** Save and load complete project state across sessions using a portable YAML file in the project folder.

**Project state includes:**
- Project name and metadata
- Brand analysis (from Feature 1)
- DS configuration (token values, font choices, palette)
- Brand kit (extends existing `brand-kit-schema.yaml` with project context fields)
- Learned preferences (from PRD-004)
- Chat history summary (last 10 messages — not full history, just key decisions)
- Figma file key association
- Generated artifact IDs (variable collection IDs, text style IDs, component IDs)

**Storage strategy — file-based, not clientStorage:**
- Project context stored as `figmento-project.yaml` in a user-specified project folder
- Extends brand kit schema with new `project_context` section (brief analysis, generation metadata, session history, artifact IDs)
- `clientStorage` stays for **plugin settings only** (theme, API keys, DS toggle) — NOT project state
- Project folder path remembered in `clientStorage` as a pointer: `{ recentProjects: [{ name, folderPath, lastOpened }] }` (max 20 entries)
- Portable: file lives in project folder, version-controllable (Git), team-shareable

**UX flow:**
- "New Project" → name it → select/create project folder → upload brief → generate DS → `figmento-project.yaml` auto-saved to folder
- "Open Project" → select from recent list OR browse to folder → reads YAML → all context restored → DS toggle auto-enabled
- "Update Project" → any changes auto-save to YAML on significant events (DS generation, brief upload, preference learned)
- "Delete Project" → removes from recent list (YAML file left in folder for user to manage)

---

## 5. Phased Delivery Plan

### Phase A: Brief Intelligence + Logo Analysis (Foundation) — 0.75 sprint

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| ODS-1a | PDF/Image Upload in Plugin Chat UI | Plugin iframe accepts PDF + image file uploads, converts to base64, sends alongside chat message. Net-new plugin UI work — no chat attachment handler exists today. | @dev |
| ODS-1b | Brief Analysis MCP Tool (with Logo Color Extraction) | `analyze_brief` — accepts PDF base64 + optional logo image base64. AI vision extracts brand values, tone, industry from PDF; analyzes logo dominant colors → generates primary/secondary/accent palette with harmony rules. Returns structured brand analysis JSON. Builds on `knowledge/color-system.yaml` + `knowledge/typography.yaml`. | @dev |

> **Note:** Original ODS-2 (Logo Color Extraction) and ODS-3 (Brief Analysis) merged into ODS-1b. Logo color extraction is a prompt engineering task within the brief analysis, not a standalone tool.

### Phase B: Figma-Native DS Generation (Core Value) — 1.5 sprints

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| ODS-4 | Multi-Collection Variable Creator | Extend existing `create_figma_variables` + `handleCreateFigmaVariables` to support **multiple named collections** (Brand Colors, Neutrals, Spacing, Radius) with proper naming hierarchy (`color/primary/500`). Current implementation creates single-collection, single-mode only — needs grouped collection support. Existing code: `figma-native.ts` L106-168, `canvas-query.ts` L553-612. | @dev |
| ODS-5 | Text Style Creator | New sandbox handler for `figma.createTextStyle()`. Creates 8 text styles from DS typography config. Loads fonts via existing 3-tier fallback chain (requested → Regular → keep existing). Sets size/weight/lineHeight/letterSpacing. | @dev |
| ODS-6a | Simple Component Creator | New sandbox handler for `figma.createComponent()`. Creates 3 base components (Button, Card, Badge) — **no variants**. Each uses auto-layout + bound variables from ODS-4. | @dev |
| ODS-7 | One-Click DS Pipeline | `generate_design_system_in_figma` — orchestrates ODS-1b → ODS-4 → ODS-5 → ODS-6a in sequence. Takes brief analysis, creates complete DS in Figma. Uses existing batch system (estimated ~50 commands, well within 200-command limit). Single chat command or UI button. | @dev |

> **Architect finding:** Full DS generation ≈50 commands (16 color vars + 8 spacing + 4 radius + 8 text styles + component creation). Fits in 1 batch roundtrip with DSL `repeat` compression. 30-second batch timeout leaves 20s buffer.

### Phase C: Project Context Persistence (Continuity) — 1.5 sprints

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| ODS-8 | Project Data Model + YAML Storage | Define `FigmentoProject` type extending brand kit schema with `project_context` section. CRUD operations on `figmento-project.yaml` files in project folders. `clientStorage` stores only recent-projects pointer list (max 20 entries with name + folderPath + lastOpened). Auto-save on significant events. | @dev |
| ODS-9 | Project Selector UI | Panel in plugin UI to create/open/delete projects. "New Project" → name + folder selection. "Open Project" → recent list or folder browse → reads YAML → restores context. "Delete" → removes from recent list (YAML left for user). | @dev |
| ODS-10 | Auto-Context Restoration | When project is opened: auto-enable DS toggle, inject brand analysis + DS summary + preferences into system prompt, restore generated artifact IDs, link to Figma file key. Zero manual re-setup. | @dev |
| ODS-11 | Chat Summary Persistence | After each significant chat turn, generate a 2-3 sentence summary of decisions made. Store last 10 summaries in `figmento-project.yaml`. Inject into system prompt on restore. | @dev |

### Phase D: Polish + Integration — 1 sprint

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| ODS-6b | Component Variants | Add `figma.createComponentSet()` support for variant grouping. Button gets 3 variants (primary/secondary/ghost). Requires ODS-6a working first. | @dev |
| ODS-12 | DS Preview Before Commit | After brief analysis, show a preview card (palette swatches, font samples, component wireframes) before creating in Figma. "Looks good?" → one click to generate. | @dev |
| ODS-13 | DS Update Flow | After initial generation, allow "Update Design System" — AI compares current DS state vs new brief, applies changes without destroying existing work. | @dev |

---

## 6. Architecture Impact

### New Sandbox Handlers Required

| Handler | Figma API Used | Complexity | Notes |
|---------|---------------|-----------|-------|
| Extend `handleCreateFigmaVariables` | `createVariableCollection()`, `createVariable()`, `setValueForMode()` | Low | **Already exists** — needs multi-collection + naming hierarchy support |
| `create_text_style` | `figma.createTextStyle()` with `loadFontAsync()` | Medium | Uses existing 3-tier font fallback chain (requested → Regular → existing) |
| `create_component` | `figma.createComponent()` with auto-layout + variable binding | High | Net-new. Most complex handler — full component structure with bound tokens |
| `create_component_set` | `figma.createComponentSet()` for variant grouping | Medium | Phase D only (ODS-6b) |

### Architect Findings (Spike 2026-03-25)

| Topic | Finding | Impact |
|-------|---------|--------|
| **Variable modes** | Current handler uses `modes[0].modeId` only. `collection.addModeAsync('Dark')` available but unused. | Confirms NG6 — single-mode V1 is correct. Mode support is 2-3 lines per variable when ready. |
| **Batch capacity** | MCP: max 50 commands. Plugin: max 200 expanded commands. Chunking at 22 per roundtrip, 30s timeout. | Full DS ≈50 commands — fits in 1 batch. DSL `repeat` can compress color scales (16 vars → 1 repeat). |
| **Font loading** | 3-tier fallback in plugin: requested weight → Regular → keep existing. `getFontStyle(weight)` maps weight→style name. | No changes needed for ODS-5. Reminder: fontWeight 600 causes Inter fallback on non-Inter fonts — use 400/700 only. |
| **Variable naming** | `"color/primary"` creates folder hierarchy in Figma UI — it's naming convention, not API grouping. | Multi-collection approach (separate collections for Colors, Spacing, Radius) is better than single-collection with folders. |
| **Brand kit extension** | Current schema (207 lines) covers colors, typography, logo, voice, social. Clean extension point for `project_context` section. | File-based persistence extends this schema naturally — no new format needed. |

### System Prompt Changes

- Project context injection: when a project is active, inject brand analysis + DS summary + chat decisions into system prompt
- Supersedes raw DS toggle context — project context is richer and includes brief intelligence
- Chat summary (ODS-11) provides continuity without storing full conversation history

### Interaction with Existing Features

| Feature | Interaction |
|---------|-------------|
| FN-6 (DS Discovery) | After ODS-7 generates DS, FN-6 rescans automatically to populate cache |
| FN-7 (Component Matching) | Components created by ODS-6a become matchable in subsequent designs |
| FN-8 (Variable Binding) | Variables created by ODS-4 become bindable immediately |
| FN-9 (Prompt Context) | Project context replaces/enhances DS block injection |
| PRD-004 (Preferences) | Preferences stored per-project in `figmento-project.yaml` (ODS-8) |
| Auto-batch | DS generation uses batch for ~50 elements efficiently (within 200-command limit) |
| Color snapping | Generated variables become the snap targets |
| Brand kit (`save_brand_kit`) | Project YAML extends brand kit schema — existing brand kits are forward-compatible |

---

## 7. Risk Assessment

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | Figma variable API limitations (mode support, nesting) | High | Medium | ODS-4 spike: test all variable operations in sandbox before committing to architecture |
| R2 | Font loading failures during text style creation | Medium | Medium | Fallback chain: requested font → Inter → Roboto → system default. Already proven pattern in plugin. |
| R3 | Component creation complexity (variants, auto-layout, variable binding) | High | Medium | Start with simple components (Button). Iterate complexity. ODS-6 as the hardest story. |
| R4 | File system access from plugin sandbox for YAML read/write | Medium | Low | Plugin communicates via WS relay to MCP server which has full filesystem access. YAML read/write happens server-side, not in sandbox. |
| R5 | PDF extraction quality varies by document format | Medium | Medium | Gemini handles most PDFs well. Fallback: manual brief text input if PDF parsing fails. |
| R6 | Logo color extraction inaccurate | Low | Medium | AI vision is good at dominant colors. Allow designer to override palette before DS generation (ODS-12 preview). |

---

## 8. Architecture Questions — Resolved

| # | Question | Answer (Architect Spike 2026-03-25) |
|---|----------|--------------------------------------|
| Q1 | Can `figma.variables.createVariable()` set values for multiple modes? | **Yes.** `collection.addModeAsync('Dark')` creates a second mode. Then `variable.setValueForMode(darkModeId, value)` sets it. Current code uses `modes[0]` only. **Decision:** V1 = single-mode (NG6). Mode support is a small extension when ready. |
| Q2 | Can `figma.createComponent()` have children with bound variables in one operation? | **No.** Must be sequential: create component → add children (auto-layout frame, text nodes) → bind variables. This is the expected pattern for ODS-6a. |
| Q3 | What's the clientStorage size limit? | **Moot.** Decision changed: project state lives in `figmento-project.yaml` files, not clientStorage. clientStorage only stores recent-project pointers (~1KB). |
| Q4 | Should DS generation use batch_execute or individual commands? | **Batch.** Full DS ≈50 commands, well within 200-command plugin limit. DSL `repeat` compresses color scales. Chunking at 22/roundtrip with 30s timeout gives ample headroom. |
| Q5 | Can a dedicated DS-generation handler bypass batch limits? | **Not needed.** Existing batch system handles the load. A dedicated handler adds complexity without benefit. |
| Q6 | File-based persistence vs clientStorage? | **File-based.** `figmento-project.yaml` extends brand kit schema. Portable, version-controllable, team-shareable. clientStorage for plugin settings only. |
| Q7 | Font availability for text style creation? | **Covered.** Plugin has 3-tier fallback: requested weight → Regular → keep existing. `loadFontAsync()` is async and handled. Avoid fontWeight 600 on non-Inter fonts. |

---

## 9. Success Metrics

| Metric | Baseline (Today) | Target (Post-PRD-006) |
|--------|------------------|----------------------|
| Time to set up a project DS | 30-60 min (manual) | <60 seconds (one-click) |
| Designs using real Figma variables | Only if designer creates them | 100% after DS generation |
| Cold-start time on returning to project | Full re-explanation needed | 0 (auto-restore) |
| Projects with persistent context | 0 | All active projects |
| DS components created by Figmento | 0 | 5+ per project |

---

## 10. Timeline Estimate

| Phase | Stories | Estimated Effort | Dependencies |
|-------|---------|-----------------|--------------|
| Phase A: Brief Intelligence | 2 (ODS-1a, ODS-1b) | 0.75 sprint | None — can start immediately |
| Phase B: DS Generation | 4 (ODS-4, ODS-5, ODS-6a, ODS-7) | 1.5 sprints | Phase A (needs brand analysis output) |
| Phase C: Project Persistence | 4 (ODS-8, ODS-9, ODS-10, ODS-11) | 1.5 sprints | Phase B (needs DS artifacts to save) |
| Phase D: Polish | 3 (ODS-6b, ODS-12, ODS-13) | 1 sprint | Phase B + C complete |
| **Total** | **13 stories (11 unique + 2 split)** | **~4.75 sprints** | |

> Phase A+B = headline "one-click" feature. Phase C = continuity. Phase D = pure polish. A+B can ship independently as the core value delivery.

---

## 11. Action Items — Status

1. ~~**Review this PRD**~~ — ✅ @pm reviewed 2026-03-25. All refinements applied.
2. ~~**Architect spike (Q1-Q7)**~~ — ✅ @architect spike completed 2026-03-25. All questions answered. See §8.
3. **Create Epic ODS** — 🔄 In progress. Using the 4 phases above.
4. **Prioritize Phase A + B** — These deliver the headline feature. Phase C is important but secondary.
5. **Coordinate with PRD-004** — Preference learning stores per-project in `figmento-project.yaml` (Phase C). No conflict.

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-25 | Product Owner + Claude | PRD created. 4-phase delivery with 13 stories. Builds on Epic FN foundation (DS awareness, auto-batch, color snapping). |
| 2026-03-25 | @pm (Morgan) | PRD reviewed. Merged ODS-2/3 into ODS-1b, split ODS-1 (UI/MCP), split ODS-6 (simple/variants). Added NG6 (no dark mode V1). Revised G1 to <120s, G4 split to G4a/G4b. Reduced to 11 unique stories, ~4.75 sprints. |
| 2026-03-25 | @architect (Aria) | Architecture spike completed. Q1-Q7 answered. Variable creation already exists (extend, don't rebuild). Batch capacity confirmed (50 cmds, fits in 1 batch). Font fallback chain validated. File-based persistence decision confirmed (YAML > clientStorage). |

---

*This PRD represents the product owner's #1 requested workflow. It transforms Figmento from "AI design tool" to "AI design system platform."*
