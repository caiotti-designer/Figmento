# Figmento — Project Status (Agent Quick-Reference)

> **Last synced:** 2026-04-22 — **Workspace clean, Ready queue empty, 15 commits ahead of remote.** epic-DMD CLOSED. DQ-HF-1 shipped. Skills MCP infrastructure (`list_skills` / `load_skill`) committed. All three packages build clean; 838 tests total pass (450 MCP server + 388 plugin). Awaiting @devops push.
> **Purpose:** Single source of truth for "what's active, what's parked, what's shipped"
> so any agent (@pm, @po, @sm, @dev, @qa, @architect) can orient in one read.
> **Update this file** whenever a story lands, gets blocked, or changes priority.

---

## TL;DR

- **epic-DMD — CLOSED.** Phase A (DMD-1..5) + Phase B (DMD-6..7) all shipped. 7 seeded systems with canonical DESIGN.md files, round-trip PASS, 86/86 ds-md tests green, plugin drag-drop works, CLAUDE.md + authoring guide published at `docs/guides/design-md-authoring.md`.
- **DQ-HF-1 — Done.** Post-showcase contrast + nesting discipline shipped 2026-04-22. CLAUDE.md rules added; `create_frame` now emits a soft warning when a sibling of a recent showcase is created without `parentId`; 12 regression tests + fixture + manual regression note.
- **Skills MCP infrastructure — shipped** (`4208cec`). New tools `list_skills` + `load_skill` expose markdown recipes (with YAML frontmatter) to any MCP client. First recipe: `design-system.md`. Server instructions block added so agents default to the skills-first workflow instead of drifting to Instagram-post output on brand briefs.
- **One Scaffolded story** — `DM-2` (Anthropic OAuth) waiting on external prereqs.
- **6 epics active** — DMD is executing; the other 5 are parked on strategic decisions or external blockers.
- **75 story files + 8 fully-Done epics** archived to `_archived/`.

If you're an agent looking for "what to work on next" — no stories in the active Ready queue. Next activations: DM-2 (external blocker), epic-DQ expansion, epic-MQ drafting, ODS Phase C drafting.
If you want to unblock something, see `## Parked / On-Standby` below for external blockers.

---

## Active Stories (docs/stories/*.story.md)

| Story | Status | Blocker | Owner |
|---|---|---|---|
| [DMD-1 — DESIGN.md Schema Specification](DMD-1-schema-specification.story.md) | **Done** | Committed `6e78c4b`. All 10 ACs accepted by @po 2026-04-15. | @architect (executor), @po (accepted) |
| [DMD-3 — `validate_design_md` MCP Tool](DMD-3-validate-design-md.story.md) | **Done** | Shipped 2026-04-16 — parser + validator + MCP tool + 22 tests. | @dev (shipped) |
| [DMD-2 — `import_design_system_from_md` MCP Tool](DMD-2-import-design-system-from-md.story.md) | **Done** | Shipped 2026-04-16 — irToTokens converter + MCP tool + 18 tests. Full suite 392/392 PASS. | @dev (shipped) |
| [DMD-4 — `export_design_system_to_md` MCP Tool](DMD-4-export-design-system-to-md.story.md) | **Done** | Shipped 2026-04-16 — exporter + renderer + 46 round-trip tests across all 7 systems. 438/438 PASS. | @dev (shipped) |
| [DMD-5 — Re-Seed Validation Gate](DMD-5-reseed-validation-gate.story.md) | **Done** | Shipped 2026-04-22 — seed script + figma/linear/stripe/vercel DESIGN.md files generated via canonical pipeline. Round-trip PASS all 7. Phase A closed. | @dev (shipped) |
| [DMD-6 — Plugin Drag-Drop + createVariables](docs/stories — implemented directly, no story file) | **Done** | Shipped 2026-04-16 (`4fea544`) — drag `.md`/`.markdown` into chat, agent calls `import_design_system_from_md` with `previewInFigma: true` + `createVariables: true`. | @dev (shipped) |
| [DMD-7 — Documentation: CLAUDE.md + Authoring Guide](DMD-7-documentation-claude-md-authoring-guide.story.md) | **Done** | Shipped 2026-04-22 — CLAUDE.md "Starting Any Design" updated with DESIGN.md as first-class path + `docs/guides/design-md-authoring.md` published. Closes epic-DMD. | @dev (shipped) |
| [DQ-HF-1 — Design Agent Showcase Discipline](DQ-HF-1-design-agent-showcase-discipline.story.md) | **Done** | Shipped 2026-04-22 — CLAUDE.md "Post-Showcase Extension Discipline" rules + `showcase-tracker.ts` + soft sibling warning in `create_frame` + fixture + 12 regression tests + manual regression note. | @dev (shipped) |
| [DM-2 — Anthropic OAuth](DM-2-oauth-login.story.md) | **Scaffolded** | External (OAuth app registration + callback page hosting) | @dev |

**DM-2 activation requires:**
1. Register Figmento at `console.anthropic.com` as an OAuth 2.0 app → obtain `client_id`
2. Host a static callback page (Cloudflare Pages / Vercel / GitHub Pages free)
3. Update `ANTHROPIC_OAUTH_CONFIG` in [oauth-flow.ts:34-40](../../figmento/src/ui/oauth-flow.ts#L34-L40)

Code scaffold is complete: types, storage, validation, Bearer-auth routing in `callAnthropicAPI`, UI gated on `isAnthropicOAuthConfigured()`, handlers mirror the DM-3 Codex pattern 1:1. The UI is invisible to end users until the config sentinel flips.

---

## Active Epics (docs/stories/epic-*.md)

One epic is **executable** (epic-DMD, top of queue). The other 5 are **parked on strategic decisions or external blockers**.

| Epic | State | Why it's still active |
|---|---|---|
| [epic-DMD — DESIGN.md Pipeline](epic-DMD-design-markdown.md) | **CLOSED 2026-04-22** | Both phases shipped. DMD-1..5 delivered the pipeline (schema, validator, importer, exporter, seed gate). DMD-6 shipped plugin drag-drop + `createVariables`. DMD-7 published CLAUDE.md integration + authoring guide. 86/86 ds-md tests green; 7/7 systems have canonical DESIGN.md files on disk. |
| [epic-DQ — Design Quality](epic-DQ-design-quality.md) | Draft, 0 child stories | Strategic bucket — 15 stories across 4 phases are notional, never drafted. Awaiting priority decision before @sm expands. |
| [epic-FN — Figma Native Agent Migration](epic-FN-figma-native-integration.md) | Phase 1+2+4 Done, **Phase 3 Deferred** | Phase 3 (FN-10..14 MCP server migration) depends on Figma's `use_figma` API reaching GA. Not actionable until Figma ships. |
| [epic-KI — Knowledge Injection](epic-KI-knowledge-injection.md) | Phases 1-3 Done, **KI-4 Superseded by AE-1** | Kept active for historical reference — phases 1-3 document what's in the bundled compiled-knowledge pipeline. KI-4 was closed because AE-1 auto-evaluation made the refinement-prompt injection redundant. |
| [epic-MQ — Mode Quality Parity](epic-MQ-mode-quality.md) | Draft, 0 child stories | Strategic bucket — would improve Modes mode post-CU-6 chat unification. Awaiting priority decision. |
| [epic-ODS — One-Click Design System](epic-ODS-one-click-design-system.md) | Phase A+B Done, **Phase C not drafted** | Phase A+B (brief analysis → DS generation pipeline) shipped. Phase C (project persistence — ODS-8/9/10/11) is nice-to-have but never drafted into stories. |

### Strategic epics summary
- **epic-DMD** is the active queue — Phase A Story 1/5 (DMD-1) shipped; next action is @sm `*draft` for DMD-2/3/4 in parallel.
- **epic-DQ** + **epic-MQ** are naked buckets (no child stories drafted). @pm decision needed before investing @sm time.
- **epic-FN** is fully blocked on Figma's API GA — no action possible.
- **epic-KI** is effectively Done (via AE-1 supersession) but kept for historical context.
- **epic-ODS** Phase C is @sm-drafting work whenever Phase C becomes a priority.

---

## Parked / On-Standby

These are things that exist but shouldn't be touched without a reason.

| Item | Parked because | Action when unblocked |
|---|---|---|
| DM-2 Anthropic OAuth | No public OAuth app registration from Anthropic (see story Risks) | Register app, host callback page, edit `ANTHROPIC_OAUTH_CONFIG` |
| FN Phase 3 (FN-10..14) | Figma `use_figma` API not yet GA | Draft FN-10..14 stories once the API is stable |
| epic-DQ / epic-MQ story drafting | No prioritization decision | @pm → @sm `*draft` when priority comes |
| ODS Phase C story drafting | Nice-to-have, no pressure | @sm drafts when project-persistence becomes needed |

---

## Non-Code Items Worth Knowing

- **Memory directory:** `C:/Users/Caio/.claude/projects/c--Users-Caio-Projects-Figmento/memory/` — 5 files (user profile, execution style, verify-status feedback, silent-@dev pattern, story workflow reference).
- **Silent @dev pattern:** @dev (solo developer Caio) regularly ships work without going through @sm draft → @po validate → @dev develop → @qa gate. Documented instances now include HOTFIX-2026-04-12, CS-1..4, TC-1/2/4, AE-1/2, MF-1..5, SU-2.2, SU-2.3, most of SU-2.1 (18 of 26 files). Every ~2-4 weeks, run a reconciliation audit by grepping for story AC markers in code before trusting any Ready/Draft status.
- **Build / test invariants:** `npm run build` clean for figmento, figmento-mcp-server, figmento-ws-relay. `cd figmento && npm test` passes 388/388. Snapshot baseline at [figmento/src/ui/\_\_tests\_\_/\_\_snapshots\_\_/tools-schema.test.ts.snap](../../figmento/src/ui/__tests__/__snapshots__/tools-schema.test.ts.snap) is intentionally committed (regression guard — `.gitignore` has an exception under line 40).

---

## Archive Conventions

Files under [_archived/](_archived/) are **historical**. Don't edit them except to add retrospective notes or fix obvious typos. When referencing them from active stories, use the `_archived/` prefix.

**Archived in this pass (75 stories + 8 epics):**

### Stories by prefix
- **AE** (2): auto-evaluation after batch + remove mandatory quality gate
- **CS** (4): code.ts modularization — utils, storage, command router, design creation
- **CU** (7): chat-first unification — QuickAction, inline cards, settings drawer, templates, legacy removal, polish
- **DM** (2): DM-1 direct mode default, DM-3 Codex OAuth. (DM-2 stays active — scaffolded)
- **DS** (1): design system reference replacement
- **DX** (1): zero-friction connection (relay auto-spawn, fixed channel)
- **FN** (14): Phase 1 skills extraction + Phase 2 DS awareness + Phase 4 status tab, DS toggle, skill export, batch-fills hotfix
- **HOTFIX** (1): 2026-04-12 batch tools + Codex OAuth retroactive doc
- **IF** (1): contextual image fill
- **IG** (4): image generation tool, chat mode snapshot, session state, gradient flip
- **LC** (11): complete learning-from-corrections pipeline (snapshot → diff → aggregate → inject)
- **MA** (1): custom OpenAI-compatible provider (Ollama, LM Studio, OpenRouter, Together)
- **MF** (5): multi-file import pipeline — queue, drag-drop, PDF/TXT, auto-analysis, selection context
- **QA** (1): auto-layout sizing fix + refinement check improvements
- **SP** (8): speed/performance — nano-banana 2 model, resolution auto, batch chunk, structure-first, preview+highres, skip-intermediate-eval, prewarm cache, chat tool batching
- **SU** (4): schema unification — gap close + Zod extraction + generator + snapshot test
- **TC** (4): tool consolidation — safe merges, list_resources, scan_template removal, CLAUDE.md refs
- **UI** (3): design token system, layout restructure, polish pass

### Epics archived
- epic-CU (Chat Unification)
- epic-DX (Developer Experience)
- epic-FIS (Figmento Improvement Sprint)
- epic-IC (Interactive Components)
- epic-IS (Image Studio)
- epic-LC (Learning Corrections)
- epic-MF (Multi-File Import)
- epic-UI (UX Revamp)

### Older archive (already in `_archived/` before this pass)
- CX-*, CR-*, CF-*, FI-*, IC-*, IS-*, ODS-1..7, deploy-*, ad-analyzer-mode, AR-*, PRD-early drafts.

---

## How to Use This File (for agents)

- **Starting a session?** Read this first to know the current state without re-auditing.
- **Reporting to Caio?** Verify every claim here against code before quoting — statuses rot. Run a grep for AC markers if in doubt.
- **Planning next work?** DMD-2/3/4 are **Ready** (@po GO 10/10 on each, 2026-04-15). Recommended implementation order: **DMD-3** first (smallest, creates the shared `ds-md-validator.ts` module + establishes severity definitions), then **DMD-2** (imports the validator unchanged, adds the parser + tool handler + auto-preview hook), then **DMD-4** (exporter + round-trip test suite against all 7 seeded systems — blocks DMD-5). @dev begins with DMD-3 Task 1. DM-2 (Anthropic OAuth) remains Scaffolded-external-blocker.
- **Archiving a new Done story?** `git mv` the file to `_archived/`, add a line under the appropriate prefix above, update "Last synced" date at top.
- **Spotting drift?** If you find an active story that's actually shipped, don't re-implement — mark it Done (retroactive) with a change log entry pointing at the shipped code, then archive it.
- **Keep STATUS.md current.** The single worst failure mode of this file is silent drift. Update the "Last synced" date every time you touch it.
