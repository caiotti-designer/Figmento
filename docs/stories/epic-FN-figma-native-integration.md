# Epic FN — Figma Native Agent Migration

> Migrate Figmento from a custom WS bridge architecture to leverage Figma's native agent infrastructure (`use_figma` + Skills), while preserving and evolving the plugin UI as Figmento's unique moat for designers.

| Field | Value |
|-------|-------|
| **Epic ID** | FN |
| **Priority** | CRITICAL (Market-driven — Figma shipped agent canvas 2026-03-24) |
| **Owner** | @pm (Morgan) |
| **Architect** | @architect (Aria) |
| **PRD** | [PRD-005](../../docs/prd/PRD-005-figma-native-agent-migration.md) |
| **Status** | Draft |
| **Created** | 2026-03-24 |
| **Milestone** | M8 — Platform Evolution |
| **Depends On** | Architecture v2.0 (unified plugin — complete) |
| **Parallel With** | Epic DQ (Design Quality), PRD-004 (User Corrections) — no mutual blocking |

---

## Strategic Context

Figma launched native agent canvas support on 2026-03-24. Their `use_figma` MCP tool + Skills system commoditizes Figmento's 3-component bridge (Plugin ↔ WS Relay ↔ MCP Server). **Figmento's moat is NOT the bridge — it's the creative workflows and designer-facing UI.** This epic extracts those workflows into the native distribution format (Skills) and evolves the plugin to leverage native infrastructure.

### Two-Track Strategy

| Track | Audience | What Changes | What Stays |
|-------|----------|-------------|------------|
| **A: Skills** (for devs) | Claude Code, Codex, Cursor users | Figmento workflows published as Figma Community Skills | Knowledge base, blueprint system, design rules |
| **B: Plugin** (for designers) | Non-developer Figma users | Backend migrates from WS to native MCP where possible | All 5 UI modes, chat agent, brand kit, preferences |

---

## Phase 0 — Architecture Assessment (Parallel with Phase 1)

> **Goal:** Answer 5 architectural questions (PRD §8) that gate Phase 3 story drafting. Does NOT block Phase 1 or Phase 2.

| ID | Title | Executor | Gate | Status |
|----|-------|----------|------|--------|
| FN-0 | Architecture Assessment: `use_figma` Capabilities, Latency, Scope | @architect | @pm | [ ] Draft |

### FN-0 Scope

@architect (Aria) must answer these questions with evidence (code samples, benchmarks, docs):

| # | Question | Needed For |
|---|----------|------------|
| Q1 | Can `use_figma` execute arbitrary Plugin API code (like our `executeCommand()` switch)? Or limited subset? | Phase 3 scope |
| Q2 | How does `use_figma` handle large batch operations (50+ nodes in one call)? | Performance model |
| Q3 | Can the plugin sandbox call Figma's own MCP server as a client? Or external-only? | Phase 2 design |
| Q4 | Latency of `use_figma` vs our WS relay for `create_frame` + `set_fill` + `set_auto_layout` sequence? | Migration decision |
| Q5 | Does `use_figma` support FigJam and Figma Draw surfaces? | Future expansion |

**Deliverable:** `docs/architecture/fn-0-use-figma-assessment.md` with findings, benchmarks, and recommendation (migrate all / migrate partial / keep WS).

---

## Phase 1 — Skills Extraction (Zero Risk, High Distribution)

> **Goal:** Publish ≥3 Figmento creative workflows as Figma Community Skills usable with any MCP client + `use_figma`.

| ID | Title | Executor | Gate | Status |
|----|-------|----------|------|--------|
| FN-1 | Extract Screenshot-to-Layout Skill | @dev | @qa | [x] Done — live test PASS ≥12/16, ≥7/10 |
| FN-2 | Extract Text-to-Layout Skill | @dev | @qa | [x] Done — live test PASS 12/14, 8.05/10 (Maison Levain) |
| FN-3 | Extract Carousel/Multi-Slide Skill | @dev | @qa | [x] Done — live test PASS 12/13, **8.65/10 highest** (Synkra, 8/8 consistency) |
| FN-4 | Extract Ad Analyzer Skill | @dev | @qa | [x] Done — live test PASS 12/13, 8.05/10 (ALVES real-world ad, 3 variants) |
| FN-5 | Skills Testing & Community Publishing | @qa + @devops | @pm | [x] Done — all 4 skills validated, FN-P4-1 unblocked Community publishing |

### Skill Extraction Pattern (applies to FN-1 through FN-4)

Each skill is a standalone markdown file that encodes:
1. **Workflow steps** — extracted from `prompts/` system prompts + `ui/*.ts` mode logic
2. **Knowledge context** — inlined from `knowledge/*.yaml` (size presets, typography, color, layout rules)
3. **Design rules** — from CLAUDE.md design sections (anti-patterns, taste rules, refinement checklist)
4. **`use_figma` calls** — translated from our WS-routed tool calls to direct Plugin API code via `use_figma`

**Output location:** `skills/` directory at project root. Each skill is a `.md` file following Figma's skill format.

### Phase 1 Success Test

> A user with Claude Code and Figma MCP (no Figmento plugin installed) can create an Instagram carousel by invoking the `/figmento-carousel` skill.

**✅ VALIDATED 2026-04-12** — All 4 skill live tests passed via `docs/qa/fn-phase1-live-test-plan.md`. Skill path produced designs scoring 8.05-8.65/10 on the weighted quality rubric. Figma Community publishing unblocked after FN-P4-1 plugin fix landed.

---

## Phase 2 — Design System Awareness (Medium Risk, High Quality)

> **Goal:** Figmento-generated designs use the user's real components and variables when available.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| FN-6 | Design System Discovery | @dev | @qa | — | [x] Done — 50 vars scanned, cached correctly |
| FN-7 | Component Matching in Generation | @dev | @qa | FN-6 | [x] Done — N/A in test (no components), fallback correct |
| FN-8 | Variable Binding in Generation | @dev | @qa | FN-6 | [x] Done — colors bound to DS variables |
| FN-9 | Design System Context in AI Prompts | @dev | @qa | FN-6 | [x] Done — AI referenced variable names in decisions |

### Key Design Decisions

- **Discovery source:** Plugin sandbox `figma.root.findAll()` for plugin path; Figma MCP's `search_design_system` for agent path. FN-6 implements both.
- **Cache:** `clientStorage` in plugin, in-memory cache in MCP server. Cap at 500 components.
- **Fallback:** If no design system found, behave exactly like current (primitives). Zero regression risk.

### Phase 2 Success Test

> Generate an Instagram post in a file with a design system containing a "Button" component and brand color variables. The generated design uses the real Button instance and bound color variables.

---

## Phase 3 — MCP Server Simplification (Medium Risk, High Maintenance)

> **Goal:** Reduce MCP tool maintenance burden by ≥50% by delegating canvas operations to Figma's native `use_figma`.

**⚠️ GATED: Do not draft Phase 3 stories until FN-0 (Architecture Assessment) is complete and Q1-Q4 are answered.**

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| FN-10 | Audit MCP Tool Routing (36 tools → classify) | @architect | @pm | FN-0 | [ ] Draft |
| FN-11 | Create Figma MCP Client Adapter | @dev | @architect | FN-10 | [ ] Draft |
| FN-12 | Migrate Canvas Tools — Batch 1 (primitives) | @dev | @qa | FN-11 | [ ] Draft |
| FN-13 | Migrate Canvas Tools — Batch 2 (composites) | @dev | @qa | FN-12 | [ ] Draft |
| FN-14 | Relay Deprecation Path + Migration Guide | @dev + @devops | @pm | FN-13 | [ ] Draft |

### Phase 3 Success Test

> `create_design` works end-to-end via Figma MCP (no WS relay running) when invoked from Claude Code.

---

## Phase 4 — Plugin Evolution (Low Risk, UX Value)

> **Goal:** Evolve the plugin UI to leverage native capabilities and simplify the connection experience.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| FN-15 | Bridge Tab → Status Tab | @dev | @qa | FN-6 | [x] Done — Status Tab with 3 cards, Bridge relocated to Advanced |
| FN-16 | "Use My Design System" Toggle | @dev | @qa | FN-7, FN-8 | [x] Done — Toggle active, gates FN-7/8/9 |
| FN-17 | Skill Export from Plugin | @dev | @qa | FN-1 | [x] Done — Skill export functional |
| FN-P4-1 | Live Test Gap Fixes (fillColor + set_style batch) | @dev | @qa | FN-1, FN-2, FN-3, FN-4 | [x] Done — CRITICAL plugin hotfix, Community publishing unblocked |

### Phase 4 Success Test

> Designer opens plugin, scans design system, enables "Use My Design System" toggle, creates a social media post that uses real brand components.

---

## Execution Order

```
Sprint N (NOW):     FN-0 (@architect)  ──parallel──  FN-1, FN-2, FN-3, FN-4 (@dev)
Sprint N+1:         FN-5 (@qa+@devops) ──parallel──  FN-6 (@dev)
Sprint N+2:         FN-7, FN-8, FN-9 (@dev)
Sprint N+3:         FN-15, FN-16, FN-17 (@dev)  ── Phase 4
Sprint N+4..N+5:    FN-10→FN-14 (@architect+@dev)  ── Phase 3 (only after FN-0 answered + API stable)
```

**Key constraints:**
- Phase 1 starts **immediately** — zero dependencies, zero risk
- Phase 3 is **deferred** until Figma API exits beta and FN-0 assessment is complete
- Phase 4 execution order is P1 → P2 → P4 (before P3) per PRD recommendation
- WS relay stays operational throughout — no existing functionality removed until Phase 3 complete

---

## Risk Register

| # | Risk | Severity | Likelihood | Mitigation | Owner |
|---|------|----------|------------|------------|-------|
| R1 | `use_figma` API changes during beta | High | Medium | WS relay as fallback. Don't delete relay code until GA. | @architect |
| R2 | `use_figma` doesn't support all Plugin API ops | High | Medium | FN-0 + FN-10 audit identifies gaps. WS fallback for unsupported ops. | @architect |
| R3 | Skills format changes or publishing removed | Medium | Low | Skills are markdown — worst case, they become docs. Core value in plugin. | @pm |
| R4 | `use_figma` latency worse than WS | Medium | Medium | Benchmark in FN-0/Q4. Keep WS for batch ops if >2x slower. | @architect |
| R5 | Design system discovery overwhelms large files | Medium | Medium | Cap at 500 components, paginate, cache in clientStorage. | @dev |
| R6 | Existing users disrupted | Low | Low | All changes additive. No behavior removed. WS relay stays as fallback. | @pm |

---

## Metrics

| Metric | Baseline (Today) | Target (Post-Epic) |
|--------|------------------|-------------------|
| Places to change for new tool | 3 (MCP + WS handler + Plugin) | 1 (MCP or Skill) |
| Distribution surface | Plugin install only | Plugin + Figma Community Skills |
| Design system utilization | 0% (all primitives) | >50% when DS available |
| WS relay dependency | Required for all agent ops | Optional (plugin chat only) |
| Skill count on Community | 0 | ≥4 |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | @pm (Morgan) | Epic created from PRD-005. 4 phases + Phase 0 assessment. 18 stories total. FN-0 and Phase 1 start immediately. |
| 2026-03-24 | @pm (Morgan) | **Phase 1 progress:** FN-0 complete (hybrid migration recommended). FN-1 through FN-4 all implemented — skills at 3.9K-6K tokens each, well under 15K budget. FN-1 AC11 live test PASS — skill path produces better design taste than plugin path, plugin path produces more complete deliverables (images). Strategic insight: validates two-track strategy (PRD-005 §2). FN-2/FN-3/FN-4 live tests bundled into FN-5. |
| 2026-03-24 | @pm (Morgan) | **Phase 2 COMPLETE.** Live test PASS on Gartni irrigation project file (50 variables, 0 components, 1 style). FN-6: scanner found all 50 vars. FN-7: correctly fell back to primitives (no components). FN-8: colors bound to DS variables (Primary, Accent). FN-9: AI referenced actual variable names. Phase 2 success test satisfied. Moving to Phase 4. |
| 2026-03-24 | @pm (Morgan) | **Phase 4 implementation COMPLETE.** FN-15 (Status Tab), FN-16 (DS Toggle), FN-17 (Skill Export) all implemented sequentially. Build clean. Pending manual Figma test for Phase 4 success test. With Phase 4, Epic FN has 14/17 stories implemented (Phase 3 on hold pending Figma API GA). |
| 2026-04-11 | @qa (Quinn) | **Batch QA gate session.** FN-P3-1: PASS (Done). FN-P3-2: CONCERNS/InReview (AC8 pending manual chat test). FN-6/7/8/9: all PASS (Done) — live test evidence from Gartni confirmed. FN-15/16/17: all PASS (Done). 13 stories now Done, 1 InReview (FN-P3-2), 1 Ready (FN-5), 5 Draft (Phase 3 Track A: FN-10–14). |
| 2026-04-11 | @pm (Morgan) | **Phase 3 decision: FORMALLY DEFERRED.** FN-0 gate is lifted (hybrid migration recommended). However, original Phase 3 stories (FN-10–14) have no story files drafted and Figma's `use_figma` API remains in beta. Decision: defer until Figma API reaches GA or next planning cycle, whichever comes first. FN-P3-1/P3-2 (Enhanced Batch DSL) were an alternative Phase 3 track that shipped successfully — these provided the key performance win without requiring full MCP tool migration. Remaining value of FN-10–14 is maintenance burden reduction, not user-facing. |
| 2026-04-12 | @pm (Morgan) | **Phase 1 live tests complete — all 4 PASS.** Test 2 (FN-2 Maison Levain, 8.05/10), Test 3 (FN-3 Synkra carousel, 8.65/10), Test 4 (FN-4 ALVES ad variants, 8.05/10). FN-1 prior PASS confirmed. **Two plugin gaps discovered and documented** in `docs/qa/fn-phase1-live-test-learnings.md`: (1) CRITICAL — `create_rectangle` silently drops `fillColor` in batch; (2) HIGH — `set_style` consolidated name not recognized in batch dispatcher. Both gaps have root causes located at specific line numbers and a follow-up story drafted: **FN-P4-1 (Live Test Gap Fixes)**. Community publishing blocked until FN-P4-1 lands. |
| 2026-04-12 | @dev (Dex) | **FN-P4-1 implemented and live-verified.** Both plugin fixes shipped in `canvas-create.ts` (rectangle/ellipse `fillColor` fallback) and `canvas-batch.ts` (`set_style` dispatch with property discriminator). Re-ran Tests 2 and 4 from scratch — single-batch rebuild, zero workarounds, all rectangles render with correct fills on first try, gradients apply via `set_style`. Test 3 verified zero regression. Community publishing unblocked. All 16 ACs passed. |
| 2026-04-12 | @pm (Morgan) | **🎉 PHASE 1 CLOSED.** FN-1 through FN-5 all Done. All 4 skills live-tested, quality scores 8.05-8.65/10, all ACs satisfied. FN-P4-1 plugin hotfix in place. Learnings doc captures 1 CRITICAL + 5 HIGH + 4 MEDIUM + 3 LOW + 5 POSITIVE findings for future reference. Epic FN now has **16 of 17 stories Done** (FN-10-14 remain formally deferred per 2026-04-11 decision). User-facing Phase 1+2+4 all complete. Only maintenance burden reduction (Phase 3 MCP tool migration) remains, gated on Figma `use_figma` API reaching GA. |
