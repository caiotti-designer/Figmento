# Epic DMD — DESIGN.md Pipeline

> Author a complete Figmento design system in plain markdown — one `DESIGN.md` file, nine sections, drop it into the plugin or the MCP server's `knowledge/design-systems/` folder, and Figmento treats it as a first-class design system. Bidirectional: export any Figmento design system back to `DESIGN.md` for sharing with Cursor, Claude Desktop, and the rest of the awesome-design-md ecosystem.

| Field | Value |
|-------|-------|
| **Epic ID** | DMD |
| **Priority** | **NEXT** — active backlog queue, user direction 2026-04-15 |
| **Owner** | @pm (Morgan) |
| **Architect** | @architect (Aria) |
| **Status** | Draft — awaiting @po validation |
| **Created** | 2026-04-15 |
| **Milestone** | M9 — Designer Productivity |
| **Depends On** | None — can start immediately |
| **Parallel With** | Epic ODS Phase C (project persistence) — complementary, no mutual blocking |
| **References** | [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (9-section schema) |

---

## Strategic Context

Figmento's design system runtime is already mature: 7 seeded systems, 14 MCP tools covering CRUD / format / analysis / components / extraction, automatic variable + style + component generation via `ODS` Phase B. The runtime format is `tokens.yaml` — validated, deterministic, consumed by every design tool. That's the right runtime format and it stays.

**What's missing is the *authoring* format.** Today, users have three ways to create a design system:

1. `generate_design_system_from_url` — extracts CSS from a public site. Best-effort, often wrong on JS-rendered sites ([ds-extraction.ts:51-80](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts#L51-L80)).
2. `analyze_brief` (ODS-1b) — PDF brief + logo upload. Great for brand-new brands, overkill for "I already know my tokens".
3. Hand-write `tokens.yaml`. Works but nobody enjoys it, and the file isn't shareable outside Figmento.

There is a fourth format the ecosystem has converged on: **DESIGN.md** — plain markdown with 9 canonical sections, parsed by LLMs, no special tooling. VoltAgent's [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) curates 50+ real-world systems in this format (Notion, Stripe, Linear, Vercel, Claude, Figma — all of which Figmento already ingested *manually* based on the `source:` field in those tokens.yaml files). Cursor, Claude Desktop, Cline, and Google Stitch all treat DESIGN.md as the de-facto interchange format.

This epic makes Figmento a first-class citizen of that ecosystem — **import any DESIGN.md, export any Figmento system as DESIGN.md** — without disturbing a single existing MCP tool.

### Relationship to Epic ODS

ODS takes a **PDF brief + logo** → AI analysis → tokens.yaml → Figma variables/styles/components. DMD takes a **markdown DESIGN.md** → deterministic parse → tokens.yaml → same Figma pipeline. Different front-door, shared backbone. ODS answers *"I have no design system yet"*; DMD answers *"I already have one, or I want to hand-craft one"*.

### Existing Infrastructure (validated in research pass)

| Capability | Status | Location |
|-----------|--------|----------|
| `tokens.yaml` schema (colors/type/spacing/radius/shadows/elevation/constraints) | **Working** | [knowledge/design-systems/*/tokens.yaml](../../figmento-mcp-server/knowledge/design-systems/) |
| 7 seeded design systems — aurelia, claude, figma, linear, notion, stripe, vercel | Working | same |
| `design_system_preview` — renders tokens.yaml to a Figma preview frame | Working | [ds-analysis.ts:48](../../figmento-mcp-server/src/tools/design-system/ds-analysis.ts#L48) |
| `saveDesignSystem` CRUD callback pattern | Working | [ds-crud.ts](../../figmento-mcp-server/src/tools/design-system/ds-crud.ts), wired via [index.ts:33](../../figmento-mcp-server/src/tools/design-system/index.ts#L33) |
| `get_design_system` / `list_resources(type="design-systems")` | Working | ds-crud.ts |
| `bind_variable` / `apply_style` — consume tokens at design time | Working | figma-native.ts |
| YAML parsing (`js-yaml`) | Working | already imported across ds-*.ts modules |
| Vision-based palette extraction (drafts + refine) | Working | [ds-extraction.ts](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts) |
| `analyze_brief` — PDF → brand JSON | Working | ODS-1b, shipped |

### Key Gaps This Epic Fills

1. No DESIGN.md parser — cannot ingest any of the 50+ awesome-design-md files without manual LLM translation.
2. No DESIGN.md exporter — Figmento systems are trapped in yaml; cannot be shared with Cursor/Claude Desktop/Cline.
3. No validation tool — users hand-editing tokens.yaml have no pre-commit safety check for contrast, font availability, hex validity, token references.
4. No Figmento extensions to the DESIGN.md spec — missing frontmatter (name/version/figma_key), missing format variants (Instagram ≠ A4 ≠ hero), missing structured constraint categories.
5. No round-trip guarantee — edit-preview-reimport cycle cannot exist without it.
6. No plugin-side upload path — users can't drop a DESIGN.md onto Figmento's chat UI the way they drop PDFs (ODS-1a).

---

## Format Decision — Why Hybrid

Figmento uses **two formats in lockstep**:

| Format | Role | Audience | Owned by |
|---|---|---|---|
| **DESIGN.md** | Human-authoring + ecosystem interchange | Humans, other AI tools | This epic |
| **tokens.yaml** | Runtime — read by every MCP tool | Figmento internals | Already exists |

The parser (DMD-2) converts DESIGN.md → tokens.yaml on import. The exporter (DMD-4) converts tokens.yaml → DESIGN.md for sharing. Every existing MCP tool stays untouched.

### Figmento's DESIGN.md extensions (improvements over plain awesome-design-md)

1. **YAML frontmatter** — machine-readable metadata at the top of the file:
   ```yaml
   ---
   name: aurelia
   version: 1.0.0
   source_url: https://aurelia-restaurant.com
   figma_file_key: null
   preset_used: luxury-editorial
   created: 2026-04-15
   ---
   ```
   Makes the file self-describing, removes filename-as-ID guesswork, enables versioning.

2. **Fenced blocks with language hints** for machine-parseable data. **Nine languages**, expanded from the original four after @architect's audit of all 7 existing `tokens.yaml` files (DMD-1 Task 1, 2026-04-15):

   | Language | Purpose | Shape | Pattern |
   |---|---|---|---|
   | ` ```color` | Palette entries | open map `string → CSS color` | Canonical 15 keys (primary, on_surface, etc.) recommended; additional freely-named extras allowed (systems range from 0 to 18 extras) |
   | ` ```font-family` | Typography families + weights + OpenType features | structured per-role (heading/body/mono) | Each role: `{family, figma_fallback?, fallback?, weights[]}`. Siblings: `opentype_features[]`, `tabular_features[]` |
   | ` ```type-scale` | Role → px number | open numeric map | Canonical keys (display, h1–h3, heading, body_lg/sm, caption, label) recommended; extras (micro, tiny, nano, overline) allowed |
   | ` ```letter-spacing` | Role → px string or `normal` | open string map | Same canonical keys as type-scale; extras like `body_semibold`, `mono_label`, `badge` allowed |
   | ` ```spacing` | Spacing scale | fixed-key numeric map | Always `unit, xs, sm, md, lg, xl, 2xl, 3xl` (8 keys) |
   | ` ```radius` | Border radius scale | fixed-key numeric map | Always `none, sm, md, lg, xl, full` (6 keys) |
   | ` ```shadow` | Structured 3-level shadow tokens | fixed `sm/md/lg` map of structured `{x, y, blur, spread, color, opacity}` objects | Always 3 levels, always 6 fields per level |
   | ` ```elevation` | Semantic elevation layers | open map `string → {shadow, background?, border?}` | **Opaque CSS pass-through** — values are raw CSS strings (e.g. `'rgba(23,23,23,0.06) 0px 3px 6px'` or multi-layer composites). See "Deliberate trade-off: elevation as opaque CSS" below |
   | ` ```gradient` | Gradient definition | structured object | `{enabled: boolean, direction?, colors?: string[], note?: string}`. When `enabled: false`, only `enabled` is required |

   **LLMs emit these reliably, humans read them naturally, `marked`'s lexer surfaces each as `{type: 'code', lang: '<language>', text: '<yaml body>'}` — the parser does not need custom syntax or regex.**

   **Deliberate trade-off: elevation as opaque CSS.** The `​```elevation` block is the one place where Figmento accepts *structural ambiguity in exchange for round-trip fidelity*. Existing `tokens.yaml` files store elevation as raw CSS shadow expressions — often multi-layer composites like `'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px'`. Parsing these into structured shadow-layer arrays would be fragile (exotic CSS like `inset`, ring shadows `0px 0px 0px 1px #fafafa`, percent spreads, comma-in-color-function edge cases) and would block DMD-5's round-trip requirement on day one. Instead, the parser treats elevation values as strings the runtime reads without structural parsing. The trade-off is explicit: `​```elevation` blocks do not get contrast validation, color-token-reference validation, or spacing-grid validation. They are pass-through. If a future epic needs structured elevation (e.g. to rebind shadow colors to design-system tokens automatically), a schema v2 can introduce a second, structured elevation representation alongside the pass-through one.

3. **Format Variants section** (Figmento-unique) — per-target-format overrides:
   ```markdown
   ## Format Variants
   - **instagram_post**: min_font_size: 32, margin: 80
   - **a4_brochure**: min_font_size: 10, margin: 48
   - **landing_hero**: headline_scale: 1.5x
   ```
   None of the 50+ existing DESIGN.md files think multi-format — this is Figmento's moat.

4. **Structured Do's and Don'ts** with category tags — `typography:`, `color:`, `layout:`, `motion:` — so constraints map cleanly to `tokens.yaml.constraints.do/dont` without NLP.

5. **Validation pass** — parser runs contrast / font / hex / reference checks and reports before committing to tokens.yaml.

6. **Round-trip fidelity guarantee** — export → import → export yields byte-identical output. Enables the edit cycle.

---

## Phase A — Pipeline + Validation Gate

> **Goal:** Ship the four MCP tools that move data between DESIGN.md and tokens.yaml, then prove the schema survives production content by re-seeding the 7 existing systems through it. This is the technical phase — if A passes, the format is real.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| DMD-1 | Figmento DESIGN.md Schema Specification | @architect → @pm | @po | — | [x] **Done** 2026-04-15 |
| DMD-2 | `import_design_system_from_md` MCP Tool (+ auto-preview hook) | @dev | @qa | DMD-1 ✅ | [ ] **Ready** (@po GO 2026-04-15, recommended ship order #2) |
| DMD-3 | `validate_design_md` MCP Tool | @dev | @qa | DMD-1 ✅ | [ ] **Ready** (@po GO 2026-04-15, recommended ship order #1 — smallest, creates shared validator module) |
| DMD-4 | `export_design_system_to_md` MCP Tool | @dev | @qa | DMD-1 ✅ | [ ] **Ready** (@po GO 2026-04-15, recommended ship order #3 — round-trip tests need DMD-2 first) |
| DMD-5 | Re-seed 7 Design Systems — Round-Trip Verification | @dev | @qa | DMD-2, DMD-4 | [ ] Draft |

### DMD-1: Figmento DESIGN.md Schema Specification

**Scope:** Define the canonical Figmento DESIGN.md format as a written spec + JSON Schema + three reference DESIGN.md files (one hand-written, one round-tripped from an existing tokens.yaml, one imported from awesome-design-md upstream).

**Acceptance Criteria:**
- [x] AC1: Spec document [`docs/architecture/DESIGN-MD-SPEC.md`](../architecture/DESIGN-MD-SPEC.md) lists every section, every fenced block language, every frontmatter field, with one paragraph of rationale per decision. **Shipped 2026-04-15 — 13 sections, 800+ lines.**
- [x] AC2: JSON Schema [`figmento-mcp-server/schemas/design-md.schema.json`](../../figmento-mcp-server/schemas/design-md.schema.json) validates frontmatter + section presence + fenced-block content types. **Shipped 2026-04-15 — draft-07, ajv strict-clean, 14 edge-case tests PASS.**
- [x] AC3: Sample file [`knowledge/design-systems/notion/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/notion/DESIGN.md) — round-tripped from the existing `notion/tokens.yaml`, manually verified to render identically. **Shipped 2026-04-15 — 22/22 coverage.**
- [x] AC4: Sample file [`knowledge/design-systems/aurelia/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/aurelia/DESIGN.md) — hand-written from the brand brief, proves the authoring ergonomics. **Shipped 2026-04-15 — 15/15 coverage + 8 authoring-friction notes for DMD-7.**
- [x] AC5: Sample file [`knowledge/design-systems/claude/DESIGN.md`](../../figmento-mcp-server/knowledge/design-systems/claude/DESIGN.md) — imported from the upstream awesome-design-md/claude file, proves ecosystem compatibility. **Shipped 2026-04-15 — source traced through getdesign npm package after repo restructure, 22/22 coverage, 13 divergences documented in [`UPSTREAM-DIFF.md`](../../figmento-mcp-server/knowledge/design-systems/claude/UPSTREAM-DIFF.md).**
- [x] AC6: Every mandatory field in `tokens.yaml` has a documented location in DESIGN.md. **Shipped 2026-04-15 — spec §8 coverage table, 27 rows, 100% coverage across all 7 seeded systems.**
- [x] AC7: Spec explicitly documents what is **not** representable in DESIGN.md (if anything) and why. **Shipped 2026-04-15 — spec §9, zero fields non-representable.**
- [x] AC8 (added during story, Task 7): All 3 sample files validate against the JSON Schema via `ajv` with zero CRITICAL errors. **Shipped 2026-04-15 — validated via [`scripts/validate-design-md-sample.js`](../../figmento-mcp-server/scripts/validate-design-md-sample.js).**
- [x] AC9 (added during story, Task 2 elevation trade-off): Spec contains a dedicated subsection documenting the `​```elevation` opaque-CSS pass-through trade-off, including what validation is skipped and the v2 upgrade path. **Shipped 2026-04-15 — spec §7.1.**
- [x] AC10 (added during story, Task 3 schema build): JSON Schema marks `source`, `elevation`, `gradients`, `constraints` as optional at top-level; aurelia (thinnest system) validates without errors. **Shipped 2026-04-15 — proven via aurelia/DESIGN.md validation.**

### DMD-2: `import_design_system_from_md` MCP Tool (+ auto-preview hook)

**Scope:** New tool that reads a DESIGN.md file (path or inline string), parses it per DMD-1 schema, emits `tokens.yaml`, and saves to `knowledge/design-systems/{name}/` via the existing `saveDesignSystem` CRUD callback. No canvas side-effects by default. Accepts optional `previewInFigma: boolean` that auto-invokes [design_system_preview](../../figmento-mcp-server/src/tools/design-system/ds-analysis.ts#L48) after save — gated on Figma being connected (warns + skips rather than fails when not).

**Acceptance Criteria:**
- [ ] AC1: Tool registered in [ds-extraction.ts](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts) alongside `generate_design_system_from_url` and `refine_design_system`; wired through [index.ts](../../figmento-mcp-server/src/tools/design-system/index.ts) with the same `saveDesignSystem` callback pattern.
- [ ] AC2: Accepts `{ path: string }` OR `{ content: string, name: string }` — path mode reads the file, content mode takes inline markdown.
- [ ] AC3: Parses frontmatter via `js-yaml` (already in deps), parses sections via `marked@^12` lexer. **Parser decision locked**: marked over unified/remark because (a) extraction-only use case, no transformation pipeline; (b) ~40KB bundle vs ~200KB for unified+remark-parse+mdast-util-\*; (c) synchronous lexer fits existing [ds-extraction.ts](../../figmento-mcp-server/src/tools/design-system/ds-extraction.ts) sync pattern; (d) flat token list is easier than tree walk for the "find H2 → walk to next fenced block" access pattern; (e) CommonMark + GFM native, fenced-block language hints supported out of the box, zero plugins needed.
- [ ] AC4: All 9 canonical sections + frontmatter successfully mapped to the `tokens.yaml` schema documented in DMD-1.
- [ ] AC5: Runs `validate_design_md` internally before writing; refuses to save if validation returns `CRITICAL` errors. Returns structured error report instead.
- [ ] AC6: On success, returns `{ systemName, tokensPath, preview?: previewResult }`.
- [ ] AC7: Accepts optional `previewInFigma: boolean`. When true and Figma connected, auto-calls `design_system_preview` and returns the preview result. When true and Figma NOT connected, succeeds with `warning: "Figma not connected — skipping preview"`.
- [ ] AC8: Preview frame positioned 200px right of any existing top-level frames (per CLAUDE.md canvas spacing rule).
- [ ] AC9: Round-trip test: importing a DESIGN.md that was exported from `notion/tokens.yaml` produces a tokens.yaml byte-identical to the original (DMD-4 dependency — validated in DMD-5).
- [ ] AC10: Unit tests cover: valid frontmatter, missing section, malformed color block, invalid hex, unknown font, duplicate name collision.
- [ ] AC11: Successfully imports all 3 sample files from DMD-1 (notion, aurelia, claude).

### DMD-3: `validate_design_md` MCP Tool

**Scope:** Standalone validator — zero side-effects, zero file writes. Takes a DESIGN.md file or content, returns a structured report of issues. Used internally by DMD-2 and externally by users who want to pre-check a hand-written file.

**Acceptance Criteria:**
- [ ] AC1: Tool registered in ds-extraction.ts.
- [ ] AC2: Accepts `{ path }` or `{ content }`, never writes.
- [ ] AC3: Validates frontmatter schema (required fields, types, known preset names).
- [ ] AC4: Validates each section's presence and fenced-block content per DMD-1 schema.
- [ ] AC5: Semantic checks:
  - Hex colors are valid 6- or 8-digit hex.
  - Contrast ratio on/surface >= 4.5:1, on/primary >= 4.5:1 (WCAG AA) — flagged as `HIGH` if below.
  - Font families either in the bundled font list OR documented as Google Fonts.
  - Spacing values snap to the 8px grid (4, 8, 12, 16, 20, 24, 32, ...) — `MEDIUM` warning if not.
  - Token references (e.g. `on_surface` referencing a color that exists) resolve.
- [ ] AC6: Returns `{ verdict: PASS|CONCERNS|FAIL, issues: [{severity, category, line?, message, suggestion}] }`.
- [ ] AC7: Verdict `FAIL` if any `CRITICAL` issue, `CONCERNS` if any `HIGH`/`MEDIUM`, `PASS` otherwise.
- [ ] AC8: Unit tests per severity class.

### DMD-4: `export_design_system_to_md` MCP Tool

**Scope:** New tool that reads `knowledge/design-systems/{name}/tokens.yaml`, emits a conformant Figmento DESIGN.md, optionally writes it back to the same folder as `DESIGN.md` next to the tokens file.

**Acceptance Criteria:**
- [ ] AC1: Tool registered in ds-extraction.ts.
- [ ] AC2: Accepts `{ name: string, outputPath?: string }`. If `outputPath` omitted, writes to `knowledge/design-systems/{name}/DESIGN.md`.
- [ ] AC3: Emits frontmatter with `name`, `version` (from tokens.yaml or default `1.0.0`), `source_url` (preserved from tokens.yaml `source` field), `preset_used`, `created`.
- [ ] AC4: All 9 canonical sections emitted, even when the underlying field is empty (emits `_not specified_` placeholder rather than omitting the heading — ensures round-trip fidelity).
- [ ] AC5: Fenced blocks for color / type-scale / spacing / shadow generated per DMD-1 schema.
- [ ] AC6: Constraints section emits `do:` and `dont:` items grouped by category tag.
- [ ] AC7: Round-trip test: `tokens.yaml → DESIGN.md → tokens.yaml` produces a byte-identical yaml file (after canonical key ordering).
- [ ] AC8: Returns `{ markdown: string, outputPath?: string }`.
- [ ] AC9: Unit tests cover each of the 7 existing design systems — all round-trip cleanly.

---

### DMD-5: Re-seed 7 Design Systems — Round-Trip Verification

**Scope:** For every existing system in `knowledge/design-systems/` (aurelia, claude, figma, linear, notion, stripe, vercel), emit a `DESIGN.md` via DMD-4 and commit it alongside the `tokens.yaml`. Verify byte-identical round-trip (yaml → md → yaml) for all 7. For each system with an upstream match in [awesome-design-md](https://github.com/VoltAgent/awesome-design-md), also import the upstream file via DMD-2 and diff against Figmento's version to catch schema drift. **This story is the validation gate for Phase A** — if the schema cannot losslessly represent production content, Phase A is not shippable.

**Acceptance Criteria:**
- [ ] AC1: Each of the 7 systems has a `DESIGN.md` file next to `tokens.yaml`.
- [ ] AC2: Round-trip verified for all 7 (yaml → md → yaml byte-identical after canonical key ordering).
- [ ] AC3: For each system with an upstream match in awesome-design-md (notion, linear, stripe, vercel, figma, claude confirmed per tokens.yaml `source:` fields), a `UPSTREAM-DIFF.md` file documents any intentional divergence or confirms parity.
- [ ] AC4: `list_resources(type="design-systems")` continues to list all 7 systems correctly.
- [ ] AC5: `design_system_preview` still works for all 7.
- [ ] AC6: No existing MCP tool regresses (full design-system test suite passes).
- [ ] AC7: If any system fails round-trip, the failure is surfaced as a **blocker** (escalated to @architect) — per user direction, schema iteration is preferred over schema compromise.
- [ ] AC8: Phase A cannot be marked Done until AC1–AC6 pass on all 7 systems.

---

## Phase B — User-Facing

> **Goal:** Expose DESIGN.md to end-users via the plugin chat UI and ship the authoring documentation. Deferrable as a unit if Phase A reveals the schema needs a second iteration.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| DMD-6 | Plugin Chat: Drag-Drop DESIGN.md Upload | @dev | @qa | DMD-2, Phase A complete | [ ] Draft |
| DMD-7 | Documentation — CLAUDE.md + Authoring Guide | @dev | @po | DMD-1..6 | [ ] Draft |

### DMD-6: Plugin Chat: Drag-Drop DESIGN.md Upload

**Scope:** Extend the existing plugin chat attachment pipeline (shipped by ODS-1a / MF-1) to accept `.md` files and auto-route them to `import_design_system_from_md`. The attachment queue, thumbnail UI, spinner, badges, and `readAsDataURL` path are all reused — only two diffs are needed: widen the `accept` / `validTypes` lists, and add a `.md` detection branch in the send handler that invokes the import tool deterministically instead of stuffing the content into chat context for LLM interpretation.

**Existing infrastructure (verified in research pass):**
- [ui.html:4824](../../figmento/src/ui.html#L4824) — file input currently accepts `.png,.jpg,.jpeg,.webp,.svg,.pdf,.txt`
- [chat.ts:1211,1637](../../figmento/src/ui/chat.ts#L1211) — `validTypes` whitelist (two locations — drop handler + paste handler)
- [chat.ts:785](../../figmento/src/ui/chat.ts#L785) — `buildClientFileContext` already extracts text from non-image attachments
- [chat.ts:107](../../figmento/src/ui/chat.ts#L107) — MF-1 multi-file `AttachmentFile[]` queue ready

**Acceptance Criteria:**
- [ ] AC1: File input in chat UI accepts `.md,.markdown` files up to 1MB (in addition to existing types).
- [ ] AC2: `validTypes` whitelist (both locations) includes `text/markdown`, `text/x-markdown`, and `text/plain` filtered by `.md` extension.
- [ ] AC3: Dropped `.md` file shown as attachment thumbnail with filename + `MD` badge.
- [ ] AC4: On send, handler detects `.md` extension and routes to `import_design_system_from_md({ content, name: inferFromFilename })` **instead of** the default `buildClientFileContext` text-injection path. This is deterministic routing, not LLM discretion.
- [ ] AC5: `previewInFigma: true` passed by default so the user sees the preview materialize in Figma on import.
- [ ] AC6: Validation errors surfaced in chat UI with clickable line references (reuses the existing error-rendering path).
- [ ] AC7: Duplicate name prompts inline: overwrite / rename / cancel.
- [ ] AC8: E2E test: drag `notion/DESIGN.md` onto chat → imported system + preview frame visible in Figma within 5s.

### DMD-7: Documentation — CLAUDE.md + Authoring Guide

**Scope:** Update project CLAUDE.md Design System Workflow section with the new DESIGN.md authoring path, create standalone `docs/guides/design-md-authoring.md` with the full spec reference + examples + common patterns.

**Acceptance Criteria:**
- [ ] AC1: CLAUDE.md "Starting Any Design" checklist includes the DESIGN.md upload option as a first-class authoring path alongside the PDF-brief (ODS) and URL-extraction paths.
- [ ] AC2: New `docs/guides/design-md-authoring.md` covers: frontmatter fields, the 9 sections, fenced block syntax, format variants, validation, round-trip editing.
- [ ] AC3: Guide includes 3 worked examples: luxury brand (aurelia), SaaS product (linear), editorial magazine (custom).
- [ ] AC4: Links added to `docs/stories/STATUS.md` epic index.

---

## Out of Scope

- **CSS/Tailwind config emission from DESIGN.md** — tokens.yaml already has format emitters (ds-formats.ts); no DMD-specific path needed.
- **Live collaborative editing** of DESIGN.md in Figmento plugin — markdown is authored in whatever editor the user prefers, Figmento is import/export only.
- **Versioning / migration** across DESIGN.md schema versions — `version` is captured in frontmatter but migration tooling is deferred until we have a v2 schema.
- **Component recipe DSL** inside DESIGN.md — component definitions stay in `ds-components.ts` for now; DESIGN.md only captures *styling* intent for components, not their structural recipe.
- **Neuform.ai integration** — their spec was not accessible during research; revisit if they publish docs.

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Markdown parsing ambiguity for fenced blocks | HIGH | Strict language-hint requirement + JSON Schema validation + reject unknown languages |
| Round-trip fidelity drift across edits | HIGH | Byte-identical round-trip test in CI against all 7 seeded systems (DMD-5 AC2) |
| Users hand-write invalid color hex or unknown fonts | MEDIUM | DMD-3 validator catches before save; error report points to exact line |
| Divergence from upstream awesome-design-md schema | MEDIUM | Import path tolerates *both* plain upstream DESIGN.md AND Figmento-extended format (extensions are optional) |
| Tool name collision — 55+ visible MCP tools already | LOW | Keep DMD tools hidden from visible surface; expose via batch_execute DSL like other specialized flows |

---

## Success Metrics

- **Ecosystem interop**: 100% of the 50+ upstream [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) systems import without `CRITICAL` validation errors.
- **Round-trip fidelity**: 100% of Figmento's seeded systems survive yaml→md→yaml byte-identical.
- **Authoring ergonomics**: a new user can write a valid DESIGN.md from scratch in <15 minutes using the guide (DMD-8).
- **Zero regression**: every existing design-system MCP tool test passes unchanged.

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-15 | @pm (Morgan) | Epic drafted from research + user conversation |
| 2026-04-15 | @pm (Morgan) | Phase restructure: 3 phases → 2. Absorbed DMD-6 (auto-preview) into DMD-2 as a parameter. Moved DMD-5 (re-seed) into Phase A as the validation gate. Renumbered old DMD-7→DMD-6, DMD-8→DMD-7. Added ODS-1a infrastructure findings to the new DMD-6 (plugin upload) scope. Priority set to "next thing" per user direction. |
| 2026-04-15 | @pm (Morgan) | DMD-2 AC3 parser decision locked: `marked@^12` (not unified/remark). Rationale captured in-place on the AC. Removes the architect-spike follow-up. |
| 2026-04-15 | @pm (Morgan) | **Epic amendment — fenced-block expansion 4 → 9.** Based on @architect's Task 1 audit of all 7 existing `tokens.yaml` files, the fenced-block language surface grows to: `color`, `font-family`, `type-scale`, `letter-spacing`, `spacing`, `radius`, `shadow`, `elevation`, `gradient`. Three patterns documented: fixed-key blocks (spacing, radius, shadow), open-map blocks (color, type-scale, letter-spacing), structured-conditional blocks (font-family, gradient). **Deliberate trade-off documented:** elevation accepted as opaque CSS pass-through rather than structured shadow-layer parsing — rationale: existing tokens.yaml files store raw multi-layer CSS composites, structural parsing would be fragile and block DMD-5 round-trip validation on day one. Zero fields are non-representable (AC7 outcome). aurelia identified as thinnest system (missing elevation/gradients/constraints/source) — all four fields confirmed optional in the schema to preserve aurelia compatibility. |
| 2026-04-15 | @architect (Aria) → @pm (Morgan) | **DMD-1 SHIPPED.** Phase A's first story is Done. Deliverables: `docs/architecture/DESIGN-MD-SPEC.md` (13 sections) + `figmento-mcp-server/schemas/design-md.schema.json` (draft-07, 9 fenced-block sub-schemas, 4 reusable type refs) + 3 reference DESIGN.md files (notion 22/22, aurelia 15/15 AC10 proof, claude 22/22) + `claude/UPSTREAM-DIFF.md` (13 intentional divergences documented) + `scripts/validate-design-md-sample.js` (mini-parser utility that DMD-2 mirrors). All 10 ACs green. 20 total validation exercises ran (6 synthetic + 3 samples + 14 edge cases) — zero schema bugs. Phase A Story 1/5 complete; DMD-2 (parser) and DMD-3 (validator) are now unblocked and can begin in parallel. DMD-4 (exporter) can also start since the round-trip contract is locked. DMD-5 (re-seed validation gate) must wait for DMD-2 + DMD-4. |
| 2026-04-15 | @sm (River) → @po (Pax) | **DMD-2, DMD-3, DMD-4 drafted by @sm, all validated GO by @po (10/10 each).** DMD-2 (parser, L, 5-8pt) absorbs auto-preview hook + validates internally. DMD-3 (validator, S, 2-3pt) is the zero-side-effect wrapper and the authoritative source for severity definitions + verdict mapping. DMD-4 (exporter, M, 3-5pt) owns the byte-identical round-trip contract for 6/7 systems (aurelia is semantic-only by policy). All three statuses: Draft → **Ready**. Recommended implementation order: **DMD-3 → DMD-2 → DMD-4** because (a) DMD-3 is smallest and creates the shared `ds-md-validator.ts` module, (b) DMD-2 imports the validator unchanged, (c) DMD-4's round-trip tests need DMD-2's parser to exist end-to-end. Phase A story inventory: DMD-1 Done, DMD-2/3/4 Ready, DMD-5 blocked on DMD-2 + DMD-4. |
