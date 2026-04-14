# Figmento — Project Status (Agent Quick-Reference)

> **Last synced:** 2026-04-14 — @po audit + full Done-story archive pass
> **Purpose:** Single source of truth for "what's active, what's parked, what's shipped"
> so any agent (@pm, @po, @sm, @dev, @qa, @architect) can orient in one read.
> **Update this file** whenever a story lands, gets blocked, or changes priority.

---

## TL;DR

- **Zero Ready/Draft stories** — active backlog is empty.
- **One Scaffolded story** — `DM-2` (Anthropic OAuth) waiting on external prereqs.
- **5 epics still active** — all parked on strategic decisions or external blockers, not execution work.
- **75 story files + 8 fully-Done epics** archived to `_archived/` in this pass.

If you're an agent looking for "what to work on next" — there is nothing in the queue.
If you want to unblock something, see `## Parked / On-Standby` below for external blockers.

---

## Active Stories (docs/stories/*.story.md)

| Story | Status | Blocker | Owner |
|---|---|---|---|
| [DM-2 — Anthropic OAuth](DM-2-oauth-login.story.md) | **Scaffolded** | External (OAuth app registration + callback page hosting) | @dev |

**DM-2 activation requires:**
1. Register Figmento at `console.anthropic.com` as an OAuth 2.0 app → obtain `client_id`
2. Host a static callback page (Cloudflare Pages / Vercel / GitHub Pages free)
3. Update `ANTHROPIC_OAUTH_CONFIG` in [oauth-flow.ts:34-40](../../figmento/src/ui/oauth-flow.ts#L34-L40)

Code scaffold is complete: types, storage, validation, Bearer-auth routing in `callAnthropicAPI`, UI gated on `isAnthropicOAuthConfigured()`, handlers mirror the DM-3 Codex pattern 1:1. The UI is invisible to end users until the config sentinel flips.

---

## Active Epics (docs/stories/epic-*.md)

All 5 remaining active epics are **parked on strategic decisions or external blockers**, not execution work.

| Epic | State | Why it's still active |
|---|---|---|
| [epic-DQ — Design Quality](epic-DQ-design-quality.md) | Draft, 0 child stories | Strategic bucket — 15 stories across 4 phases are notional, never drafted. Awaiting priority decision before @sm expands. |
| [epic-FN — Figma Native Agent Migration](epic-FN-figma-native-integration.md) | Phase 1+2+4 Done, **Phase 3 Deferred** | Phase 3 (FN-10..14 MCP server migration) depends on Figma's `use_figma` API reaching GA. Not actionable until Figma ships. |
| [epic-KI — Knowledge Injection](epic-KI-knowledge-injection.md) | Phases 1-3 Done, **KI-4 Superseded by AE-1** | Kept active for historical reference — phases 1-3 document what's in the bundled compiled-knowledge pipeline. KI-4 was closed because AE-1 auto-evaluation made the refinement-prompt injection redundant. |
| [epic-MQ — Mode Quality Parity](epic-MQ-mode-quality.md) | Draft, 0 child stories | Strategic bucket — would improve Modes mode post-CU-6 chat unification. Awaiting priority decision. |
| [epic-ODS — One-Click Design System](epic-ODS-one-click-design-system.md) | Phase A+B Done, **Phase C not drafted** | Phase A+B (brief analysis → DS generation pipeline) shipped. Phase C (project persistence — ODS-8/9/10/11) is nice-to-have but never drafted into stories. |

### Strategic epics summary
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
- **Planning next work?** The active queue is DM-2 (scaffolded-external-blocker) only. If more work lands, update the tables above.
- **Archiving a new Done story?** `git mv` the file to `_archived/`, add a line under the appropriate prefix above, update "Last synced" date at top.
- **Spotting drift?** If you find an active story that's actually shipped, don't re-implement — mark it Done (retroactive) with a change log entry pointing at the shipped code, then archive it.
- **Keep STATUS.md current.** The single worst failure mode of this file is silent drift. Update the "Last synced" date every time you touch it.
