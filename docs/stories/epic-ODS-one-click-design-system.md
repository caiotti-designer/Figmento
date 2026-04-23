# Epic ODS — One-Click Design System

> Upload a PDF brief + logo. Figmento builds a complete Figma design system — real variables, real text styles, real components. Every design after that is automatically on-brand. Close the plugin, come back tomorrow, pick up where you left off.

| Field | Value |
|-------|-------|
| **Epic ID** | ODS |
| **Priority** | HIGH (Owner's #1 requested workflow) |
| **Owner** | @pm (Morgan) |
| **Architect** | @architect (Aria) |
| **PRD** | [PRD-006](../prd/PRD-006-one-click-design-system.md) |
| **Status** | Phase A+B Done — Phase C (project persistence) not drafted |
| **Created** | 2026-03-25 |
| **Milestone** | M9 — Designer Productivity |
| **Depends On** | Epic FN Phase 2 (DS awareness, variable binding, color snapping) — complete |
| **Parallel With** | Epic FN Phase 3 (MCP simplification) — no mutual blocking |

---

## Strategic Context

Epic FN shipped DS awareness (FN-6–FN-9), auto-batch performance, and color snapping. This epic builds on that foundation:

- FN-6 (Discovery) scans existing DS → ODS *creates* DS from scratch
- FN-8 (Variable Binding) binds to existing variables → ODS *creates* those variables
- FN-9 (Prompt Context) injects DS into prompts → ODS ensures there's always a DS to inject
- Auto-batch executes 50+ commands in one roundtrip → ODS generates ~50 DS elements efficiently

### Existing Infrastructure (validated in architect spike)

| Capability | Status | Location |
|-----------|--------|----------|
| Variable creation (single-collection, single-mode) | **Working** | `figma-native.ts` + `canvas-query.ts` L553-612 |
| DS token generation from mood/preset | Working | `design-system/ds-crud.ts` |
| 8 pre-built design systems | Working | `knowledge/design-systems/` |
| Brand kit CRUD with YAML persistence | Working | `save_brand_kit` / `get_brand_kit` |
| Batch execution (200-command limit, 22/chunk) | Working | `batch.ts` + `canvas-batch.ts` |
| Font loading (3-tier fallback) | Working | `canvas-batch.ts`, `canvas-style.ts` |
| clientStorage (plugin settings) | Working | 5+ storage keys across handler files |

### Key Gaps This Epic Fills

1. No PDF/image upload in plugin chat UI
2. No brief → brand analysis AI pipeline
3. Variable creation is single-collection only — needs multi-collection + naming hierarchy
4. No text style creation (`figma.createTextStyle()`)
5. No component creation (`figma.createComponent()`)
6. No project context persistence as portable file

---

## Phase A — Brief Intelligence + Logo Analysis (Foundation)

> **Goal:** Upload a PDF brief and/or logo image. AI extracts structured brand identity. No Figma artifacts created yet — this is the analysis step.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| ODS-1a | Chat Attachment Pipeline Completion | @dev | @qa | — | [x] Done — S (2pt), fast-tracked |
| ODS-1b | Brief Analysis MCP Tool (with Logo Color Extraction) | @dev | @qa | ODS-1a ✅ | [x] Done — L (8pt), 15 tests pass |

### ODS-1a: PDF/Image Upload in Plugin Chat UI

**Scope:** Plugin iframe accepts PDF + image file uploads, converts to base64, sends alongside chat message.

**Acceptance Criteria:**
- [ ] AC1: File input in chat UI accepts `.pdf`, `.png`, `.jpg`, `.svg` files
- [ ] AC2: Selected file converted to base64 and sent as attachment in chat message payload
- [ ] AC3: PDF files up to 10MB accepted (larger files show error)
- [ ] AC4: Image files up to 5MB accepted
- [ ] AC5: Upload progress indicator shown during conversion
- [ ] AC6: Attachment thumbnail/name visible in chat input before sending
- [ ] AC7: Multiple files can be attached to a single message (1 PDF + 1 image minimum)

### ODS-1b: Brief Analysis MCP Tool (with Logo Color Extraction)

**Scope:** `analyze_brief` MCP tool — accepts PDF base64 + optional logo image base64. AI vision extracts brand values from PDF, analyzes logo dominant colors, generates harmonious palette. Returns structured brand analysis JSON.

**Acceptance Criteria:**
- [ ] AC1: `analyze_brief` tool registered in MCP server with PDF base64 + optional image base64 inputs
- [ ] AC2: PDF content extracted and analyzed for: brand name, industry, tone, target audience, brand values
- [ ] AC3: Logo image analyzed for dominant colors (top 3-5 colors extracted)
- [ ] AC4: Color palette generated: primary, secondary, accent + neutral scale, using harmony rules from `knowledge/color-system.yaml`
- [ ] AC5: Typography direction suggested based on industry + tone, using pairings from `knowledge/typography.yaml`
- [ ] AC6: Spacing scale and radius tokens included in output (8px base default)
- [ ] AC7: Output is structured JSON matching the schema expected by ODS-4/5/6a
- [ ] AC8: Graceful fallback: if PDF parsing fails, tool accepts plain text brief input
- [ ] AC9: If no logo provided, palette generated from mood/industry keywords only

> **Note:** Original ODS-2 (Logo Color Extraction) and ODS-3 (Brief Analysis) merged here. Logo extraction is a prompt engineering task within the brief analysis, not a standalone tool.

### Phase A Success Test

> Designer uploads a PDF brief + logo image in plugin chat. AI returns: "Gartni — AgTech / Smart Irrigation. Primary: #2AB6BD (teal, from logo). Heading: Manrope. Body: Inter. Spacing: 8px base." — structured JSON, not prose.

---

## Phase B — Figma-Native DS Generation (Core Value)

> **Goal:** From the brand analysis, create actual Figma infrastructure — real variables, real text styles, real components. Not visual documentation.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| ODS-4 | Multi-Collection Variable Creator | @dev | @qa | ODS-1b ✅ | [x] Done — M (5pt), fast-tracked |
| ODS-5 | Text Style Creator | @dev | @qa | ODS-4 ✅ | [x] Done — M (5pt), fast-tracked |
| ODS-6a | Simple Component Creator | @dev | @qa | ODS-4 ✅, ODS-5 ✅ | [x] Done — L (8pt), fast-tracked |
| ODS-7 | One-Click DS Pipeline | @dev | @qa | ODS-4 ✅, ODS-5 ✅, ODS-6a ✅ | [x] Done — M (5pt), 352 tests pass |

### ODS-4: Multi-Collection Variable Creator

**Scope:** Extend existing `create_figma_variables` + `handleCreateFigmaVariables` to support multiple named collections with proper naming hierarchy. Current implementation creates single-collection, single-mode only.

**Acceptance Criteria:**
- [ ] AC1: `create_figma_variables` accepts `collections` array (not single `collectionName`), each with name + variables
- [ ] AC2: Creates separate Figma Variable Collections: "Brand Colors", "Neutrals", "Spacing", "Radius"
- [ ] AC3: Variables use hierarchy naming: `color/primary/500`, `color/primary/700`, `spacing/md`, `radius/lg`
- [ ] AC4: Color variables include full scale per color (50, 100, 300, 500, 700, 900 minimum)
- [ ] AC5: Neutral scale: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
- [ ] AC6: Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128
- [ ] AC7: Radius scale: 0, 4, 8, 12, 16, 9999 (full)
- [ ] AC8: Backward-compatible — single `collectionName` + `variables` input still works (existing callers don't break)
- [ ] AC9: All variables created in single-mode (Default) per NG6 decision
- [ ] AC10: Returns collection IDs and variable IDs for downstream use (ODS-5, ODS-6a, ODS-8)

**Existing code to extend:** `figma-native.ts` L106-168 (MCP tool), `canvas-query.ts` L553-612 (plugin handler)

### ODS-5: Text Style Creator

**Scope:** New sandbox handler for `figma.createTextStyle()`. Creates 8 text styles from DS typography config.

**Acceptance Criteria:**
- [ ] AC1: New plugin handler `handleCreateTextStyles` using `figma.createTextStyle()`
- [ ] AC2: New MCP tool `create_text_styles` that sends command to plugin
- [ ] AC3: Creates 8 text styles: Display (64px), H1 (48px), H2 (32px), H3 (24px), Body Large (20px), Body (16px), Body Small (14px), Caption (12px)
- [ ] AC4: Font loading uses existing 3-tier fallback: requested weight → Regular → keep existing
- [ ] AC5: Each style sets: fontFamily, fontSize, fontWeight, lineHeight (px, not multiplier), letterSpacing
- [ ] AC6: Heading styles use heading font from brand analysis; body styles use body font
- [ ] AC7: Style names follow convention: `DS/Display`, `DS/H1`, `DS/Body`, etc.
- [ ] AC8: Returns text style IDs for downstream use
- [ ] AC9: fontWeight 600 avoided — uses 400 or 700 only (per known gotcha)

### ODS-6a: Simple Component Creator

**Scope:** New sandbox handler for `figma.createComponent()`. Creates 3 base components (Button, Card, Badge) — **no variants**. Each uses auto-layout + bound variables.

**Acceptance Criteria:**
- [ ] AC1: New plugin handler `handleCreateComponent` using `figma.createComponent()`
- [ ] AC2: New MCP tool `create_ds_component` that sends command to plugin
- [ ] AC3: **Button** component: auto-layout frame (HORIZONTAL), padding from spacing variables, background from primary color variable, text with body font, corner radius from radius variable
- [ ] AC4: **Card** component: auto-layout frame (VERTICAL), padding from spacing variables, background from surface color variable, corner radius from radius variable, optional header text + body text slots
- [ ] AC5: **Badge** component: auto-layout frame (HORIZONTAL), small padding, accent color background, caption-sized text, full corner radius
- [ ] AC6: All components use `figma.variables` binding (not hardcoded hex values) — variables from ODS-4
- [ ] AC7: All text nodes reference text styles from ODS-5 where applicable
- [ ] AC8: Components named with DS prefix: `DS/Button`, `DS/Card`, `DS/Badge`
- [ ] AC9: Components placed on a dedicated "Design System" page or section in the file
- [ ] AC10: Returns component IDs for downstream use

### ODS-7: One-Click DS Pipeline

**Scope:** Orchestrator tool that chains ODS-1b → ODS-4 → ODS-5 → ODS-6a in sequence. Single command or UI button.

**Acceptance Criteria:**
- [ ] AC1: New MCP tool `generate_design_system_in_figma` (or chat UI button)
- [ ] AC2: Accepts brand analysis JSON (from ODS-1b) as input
- [ ] AC3: Executes in sequence: create variables → create text styles → create components
- [ ] AC4: Uses batch execution — estimated ~50 commands, within 200-command plugin limit
- [ ] AC5: Total execution time < 120 seconds (G1)
- [ ] AC6: DS toggle auto-enabled after successful generation
- [ ] AC7: FN-6 (DS Discovery) triggered automatically after generation to populate cache
- [ ] AC8: Returns summary: X variables created, Y text styles, Z components + all artifact IDs
- [ ] AC9: If any step fails, previous steps' artifacts are preserved (no rollback — partial DS is better than none)
- [ ] AC10: Progress feedback sent to plugin UI during generation ("Creating variables...", "Creating text styles...", etc.)

**Architect finding:** Full DS ≈50 commands. DSL `repeat` can compress color scales (16 vars → 1 repeat). 30-second batch timeout with 20s buffer.

### Phase B Success Test

> Designer clicks "Generate Design System" with a brand analysis for Gartni. In <120 seconds, Figma file contains: 4 variable collections (Brand Colors, Neutrals, Spacing, Radius) with ~40 variables, 8 text styles (DS/Display through DS/Caption), and 3 components (DS/Button, DS/Card, DS/Badge) — all using bound variables. DS toggle is on.

---

## Phase C — Project Context Persistence (Continuity)

> **Goal:** Save and load complete project state across sessions using a portable `figmento-project.yaml` file in the project folder.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| ODS-8 | Project Data Model + YAML Storage | @dev | @qa | ODS-7 (needs DS artifacts to save) | [ ] Draft |
| ODS-9 | Project Selector UI | @dev | @qa | ODS-8 | [ ] Draft |
| ODS-10 | Auto-Context Restoration | @dev | @qa | ODS-8, ODS-9 | [ ] Draft |
| ODS-11 | Chat Summary Persistence | @dev | @qa | ODS-8 | [ ] Draft |

### ODS-8: Project Data Model + YAML Storage

**Scope:** Define `FigmentoProject` type extending brand kit schema with `project_context` section. CRUD operations on `figmento-project.yaml` files. `clientStorage` stores only recent-projects pointer list.

**Acceptance Criteria:**
- [ ] AC1: `FigmentoProject` TypeScript type defined, extending brand kit schema with `project_context` section
- [ ] AC2: `project_context` includes: project name, project ID, created/updated dates, Figma file key, source materials metadata, generation metadata, DS artifact IDs, session history
- [ ] AC3: MCP tools: `save_project(folderPath, projectData)`, `load_project(folderPath)`, `list_recent_projects()`
- [ ] AC4: `save_project` writes `figmento-project.yaml` to specified folder path
- [ ] AC5: `load_project` reads and validates `figmento-project.yaml` from folder
- [ ] AC6: `clientStorage` stores recent-projects pointer list only: `[{ name, folderPath, lastOpened }]` — max 20 entries
- [ ] AC7: Auto-save triggered on significant events: DS generation (ODS-7), brief upload, preference learned
- [ ] AC8: YAML file is human-readable and version-control friendly (no binary, no minification)
- [ ] AC9: Forward-compatible with existing brand kit YAML — existing brand kits loadable as partial projects

### ODS-9: Project Selector UI

**Scope:** Panel in plugin UI for project CRUD.

**Acceptance Criteria:**
- [ ] AC1: "New Project" flow: name input → folder selection/creation → initializes empty `figmento-project.yaml`
- [ ] AC2: "Open Project" flow: recent list dropdown OR folder browse → loads YAML → restores context
- [ ] AC3: Recent projects list shows: project name, last opened date, folder path
- [ ] AC4: "Delete" removes from recent list — YAML file left in folder for user to manage
- [ ] AC5: Active project name displayed in plugin header/status area
- [ ] AC6: Project selector accessible from Status Tab (or new Projects Tab)

### ODS-10: Auto-Context Restoration

**Scope:** When project is opened, auto-restore full context with zero manual re-setup.

**Acceptance Criteria:**
- [ ] AC1: DS toggle auto-enabled when project with DS artifacts is opened
- [ ] AC2: Brand analysis injected into AI system prompt
- [ ] AC3: DS summary (variable names, font choices, palette) injected into prompt
- [ ] AC4: Learned preferences restored (from PRD-004 data stored in project YAML)
- [ ] AC5: Chat summary (ODS-11) injected into prompt for conversation continuity
- [ ] AC6: Figma file key matched — warn if current file doesn't match saved file key
- [ ] AC7: Generated artifact IDs validated — warn if variables/styles/components were deleted since last save
- [ ] AC8: Total restoration time < 3 seconds

### ODS-11: Chat Summary Persistence

**Scope:** After each significant chat turn, generate a brief summary of decisions made. Store in project YAML.

**Acceptance Criteria:**
- [ ] AC1: After significant chat turns (DS generation, design creation, preference learned), AI generates 2-3 sentence summary
- [ ] AC2: Last 10 summaries stored in `figmento-project.yaml` under `session_history`
- [ ] AC3: Summaries include: timestamp, action type, key decisions, references to generated artifacts
- [ ] AC4: On project restore, summaries injected into system prompt for continuity
- [ ] AC5: Older summaries (>10) automatically pruned on save
- [ ] AC6: Summaries are append-only — never edited after creation

### Phase C Success Test

> Designer works on Gartni project: generates DS, creates 2 designs, adjusts color preference. Closes plugin. Next day: opens plugin → selects "Gartni" from recent projects → all context restored (DS active, brand analysis in prompt, color preference remembered, chat summary shows yesterday's decisions). Zero re-explanation needed.

---

## Phase D — Polish + Integration

> **Goal:** Component variants, preview before commit, and DS update flow.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| ODS-6b | Component Variants | @dev | @qa | ODS-6a | [ ] Draft |
| ODS-12 | DS Preview Before Commit | @dev | @qa | ODS-1b, ODS-7 | [ ] Draft |
| ODS-13 | DS Update Flow | @dev | @qa | ODS-7, ODS-8 | [ ] Draft |

### ODS-6b: Component Variants

**Scope:** Add `figma.createComponentSet()` for variant grouping. Button gets 3 variants.

**Acceptance Criteria:**
- [ ] AC1: New plugin handler for `figma.createComponentSet()`
- [ ] AC2: Button component extended with 3 variants: Primary, Secondary, Ghost
- [ ] AC3: Primary: brand primary fill, white text
- [ ] AC4: Secondary: transparent fill, primary border, primary text
- [ ] AC5: Ghost: transparent fill, no border, primary text
- [ ] AC6: Variants grouped in a single ComponentSet with `variant` property
- [ ] AC7: All variants use bound variables (not hardcoded colors)

### ODS-12: DS Preview Before Commit

**Scope:** Show visual preview of proposed DS before creating in Figma.

**Acceptance Criteria:**
- [ ] AC1: After brief analysis, preview card shown in plugin chat: palette swatches, font samples, spacing scale, component wireframes
- [ ] AC2: "Looks good? Generate →" button triggers ODS-7 pipeline
- [ ] AC3: "Adjust" option allows editing palette, fonts, or spacing before generation
- [ ] AC4: Preview renders in plugin UI (HTML/CSS), not in Figma canvas

### ODS-13: DS Update Flow

**Scope:** Update existing DS without destroying designer's work.

**Acceptance Criteria:**
- [ ] AC1: "Update Design System" command available when a project is active
- [ ] AC2: AI compares current Figma DS state (via FN-6 scan) against new brief/preferences
- [ ] AC3: Shows diff: "Add 2 new color variables, update heading font from Manrope to Satoshi, no spacing changes"
- [ ] AC4: Designer approves changes before applying
- [ ] AC5: Existing variables updated in-place (not deleted + recreated) — preserves bindings
- [ ] AC6: New variables/styles added alongside existing
- [ ] AC7: Project YAML updated with new state after successful update

### Phase D Success Test

> Designer switches Gartni's heading font from Manrope to Satoshi. "Update Design System" shows diff, designer approves, text styles updated in-place. All existing designs using the heading text style automatically reflect the new font.

---

## Execution Order

```
Sprint N (NOW):     ODS-1a (@dev)  →  ODS-1b (@dev)           ── Phase A
Sprint N+1:         ODS-4 (@dev)   →  ODS-5 (@dev)            ── Phase B (start)
Sprint N+2:         ODS-6a (@dev)  →  ODS-7 (@dev)            ── Phase B (complete)
Sprint N+3:         ODS-8, ODS-11 (@dev, parallel)            ── Phase C (start)
Sprint N+4:         ODS-9 (@dev)   →  ODS-10 (@dev)           ── Phase C (complete)
Sprint N+5:         ODS-6b, ODS-12, ODS-13 (@dev)             ── Phase D
```

**Key constraints:**
- Phase A starts **immediately** — zero architectural dependencies
- Phase B depends on Phase A output (brand analysis JSON schema)
- Phase C depends on Phase B (needs DS artifact IDs to persist)
- Phase D is pure polish — can be deferred or parallelized
- **A+B delivers the headline "one-click" feature** — can ship independently

---

## Risk Register

| # | Risk | Severity | Likelihood | Mitigation | Owner |
|---|------|----------|------------|------------|-------|
| R1 | Figma variable API limitations (mode support, nesting) | High | Medium | V1 = single-mode (NG6). Mode support validated in spike — 2-3 lines when ready. | @architect |
| R2 | Font loading failures during text style creation | Medium | Medium | 3-tier fallback proven in existing code. Avoid fontWeight 600. | @dev |
| R3 | Component creation complexity (auto-layout + variable binding) | High | Medium | Start simple (ODS-6a, no variants). Variants deferred to ODS-6b (Phase D). | @dev |
| R4 | File system access for YAML persistence | Medium | Low | MCP server has full filesystem access. YAML read/write server-side, not in sandbox. | @dev |
| R5 | PDF extraction quality varies by format | Medium | Medium | Gemini handles most PDFs natively. Fallback: plain text brief input (ODS-1b AC8). | @dev |
| R6 | Logo color extraction inaccurate | Low | Medium | AI vision is good at dominant colors. ODS-12 preview allows adjustment before generation. | @dev |
| R7 | Batch timeout on DS generation (30s hard limit) | Low | Low | Full DS ≈50 commands. 30s timeout with 20s buffer. DSL repeat compresses further. | @dev |

---

## Metrics

| Metric | Baseline (Today) | Target (Post-Epic) |
|--------|------------------|----------------------|
| Time to set up a project DS | 30-60 min (manual) | <120 seconds (one-click) |
| Designs using real Figma variables | Only if designer creates them | 100% after DS generation |
| Cold-start time on returning to project | Full re-explanation needed | 0 (auto-restore from YAML) |
| Projects with persistent context | 0 | All active projects |
| DS components created by Figmento | 0 | 3+ per project (5+ with Phase D) |

---

## Decisions Log

| Date | Decision | Rationale | Decided By |
|------|----------|-----------|------------|
| 2026-03-25 | Merge ODS-2/3 into ODS-1b | Logo color extraction is prompt engineering within brief analysis, not a standalone tool | @pm |
| 2026-03-25 | Split ODS-1 into 1a (UI) + 1b (MCP) | No chat attachment handler exists today — plugin UI work is separate from MCP tool | @pm |
| 2026-03-25 | Split ODS-6 into 6a (simple) + 6b (variants) | Component variants add significant complexity. Ship simple components first, variants as polish. | @pm |
| 2026-03-25 | File-based persistence over clientStorage | `figmento-project.yaml` is portable, version-controllable, team-shareable. clientStorage for plugin settings only. | Product Owner + @pm |
| 2026-03-25 | No dark mode V1 (NG6) | Variable mode API supports it, but doubles creation work. Single-mode Default for V1. | @pm + @architect |
| 2026-03-25 | G1 target: <120s (not <60s) | ~50 commands × batch chunking = 5 roundtrips minimum. 60s too aggressive. | @pm + @architect |
| 2026-03-25 | Extend brand kit schema (not new format) | Existing `brand-kit-schema.yaml` covers colors, typography, logo, voice. Natural extension point for `project_context`. | @architect |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-25 | @pm (Morgan) | Epic created from PRD-006 after review + architect spike. 4 phases, 13 stories (11 unique + 2 split), ~4.75 sprints. |
| 2026-03-25 | @sm (River) | Phase A stories drafted: ODS-1a (S, 2pt — pipeline gap-fill) + ODS-1b (L, 8pt — brief analysis tool). ODS-1a scope reduced after discovering CF-1/CF-6 delivered 85% of infrastructure. |
| 2026-03-26 | @dev (Dex) | Phase A+B complete. 7/13 stories Done: ODS-1a, 1b, 4, 5, 6a, 7. New tools: analyze_brief, create_variable_collections, create_text_styles, create_ds_components, generate_design_system_in_figma. 352 tests pass. |

---

*This epic transforms Figmento from "AI design tool" to "AI design system platform." Phase A+B deliver the headline one-click feature. Phase C adds continuity. Phase D adds polish.*
