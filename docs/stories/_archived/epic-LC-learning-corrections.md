# Epic LC — Learning from User Corrections

> Figmento learns from what you do, not just what you say. After 3 consistent corrections in the same direction, the AI adapts — automatically using your preferred font sizes, color choices, and spacing patterns.

| Field | Value |
|-------|-------|
| **Epic ID** | LC |
| **Priority** | HIGH (Power user retention — #1 friction source) |
| **Owner** | @pm (Morgan) |
| **Architect** | @architect (Aria) |
| **PRD** | [PRD-004](../prd/PRD-004-learn-from-user-corrections.md) |
| **Status** | Done |
| **Created** | 2026-03-12 |
| **Milestone** | M7 — Intelligence Phase 4 |
| **Depends On** | None — self-contained within plugin sandbox + existing clientStorage |
| **Parallel With** | Epic MF (Multi-File Import) — no mutual blocking; Epic ODS Phase C (project persistence) shares storage patterns |

---

## Strategic Context

Figmento repeats the same design choices every session. When a user manually edits AI-generated output — adjusting font sizes, swapping colors, changing spacing — those corrections are lost. The next design session starts from zero.

This epic closes the loop: **snapshot** (what AI created) → **diff** (what user changed) → **aggregate** (is this a pattern?) → **inject** (tell the AI next time).

### Architectural Constraints (from @architect — locked)

- **C1:** Snapshot-based detection only (Figma has no change event API)
- **C2:** Depth-1 snapshots (root frame + direct children only)
- **C3:** 10-minute expiry on snapshots, reset on page change
- **C4:** Minimum delta thresholds (8px position, 2px font size, ΔE≥30 color, etc.)
- **C5:** Opt-in only — never silently learn. Auto-detect toggle OFF by default
- **C6:** N≥3 consistent corrections required before preference created
- **C7:** Preferences scoped to property + context pairs (typography per hierarchy level, color per role, spacing per element type)
- **C8:** All storage in `figma.clientStorage` (snapshots, corrections, preferences, config)

Full constraints: PRD-004 §4.

---

## Phased Delivery

### Phase 4a — Snapshot & Diff Pipeline (Foundation)

> **Goal:** Capture before/after snapshots and detect meaningful edits.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| LC-1 | Snapshot Types & Diff Calculator | @dev | @qa | None | Ready for Review |
| LC-2 | Snapshot Capture & Storage | @dev | @qa | LC-1 | Ready for Review |
| LC-3 | Auto-Snapshot After AI Commands | @dev | @qa | LC-2 | Ready for Review |
| LC-4 | Compare Snapshots & Save Corrections | @dev | @qa | LC-1, LC-2 | Ready for Review |
| LC-5 | "Learn from My Edits" Button & Diff UI | @dev | @qa | LC-4 | Ready for Review |

**Phase 4a Success Test:**
> User creates a design, manually changes the headline from 48px to 72px, clicks "Learn from my edits" — plugin shows the diff: "fontSize: 48 → 72" with a confirm button.

### Phase 4b — Aggregation & Auto-Detect

> **Goal:** Aggregate corrections into durable preferences and enable automatic detection.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| LC-6 | Preference Types & Aggregation Engine | @dev | @qa | LC-1 | Ready for Review |
| LC-7 | Preference Storage Handlers | @dev | @qa | LC-6, LC-4 | Ready for Review |
| LC-8 | Auto-Detect Toggle & Notification | @dev | @qa | LC-7, LC-5 | Ready for Review |

**Phase 4b Success Test:**
> After 3 designs where the user consistently increases headline font size, a preference is created: "Typography / display: fontSize ≥72px (confidence: HIGH)". The "Auto-detect corrections" toggle works and shows "Noticed N edits" notification.

### Phase 4c — AI Integration & Transparency

> **Goal:** Inject learned preferences into the AI system prompt and provide a management UI.

| ID | Title | Executor | Gate | Depends On | Status |
|----|-------|----------|------|------------|--------|
| LC-9 | Preference Injection into System Prompt | @dev | @qa | LC-7, LC-6 | Ready for Review |
| LC-10 | `get_learned_preferences` MCP Tool | @dev | @qa | LC-7, LC-6 | Ready for Review |
| LC-11 | Preferences UI Panel | @dev | @qa | LC-7, LC-6, LC-8 | Ready for Review |

**Phase 4c Success Test:**
> System prompt includes "LEARNED PREFERENCES: User prefers headlines ≥72px on social posts". Preferences panel in Settings shows all learned preferences with delete/reset controls.

---

## Dependency Graph

```
LC-1 (types + diff) ─────┬──→ LC-2 (capture) ──→ LC-3 (auto-snapshot)
                          │                    ↘
                          │                     LC-4 (compare + save) ──→ LC-5 (UI button)
                          │                                            ↘
                          └──→ LC-6 (aggregation) ──→ LC-7 (storage) ──→ LC-8 (auto-detect)
                                                   ↘                  ↘
                                                    LC-9 (prompt)      LC-11 (panel)
                                                    LC-10 (MCP tool)
```

---

## Implementation Status

All 11 stories have been **implemented by @dev** and **gated by @qa** with PASS verdict.

| Phase | Stories | Implemented | QA Gated | Tests |
|-------|---------|-------------|----------|-------|
| 4a | LC-1 through LC-5 | 5/5 | 5/5 ✅ | 70+ unit tests (LC-1), 371 integration tests pass |
| 4b | LC-6 through LC-8 | 3/3 | 3/3 ✅ | 25 unit tests (LC-6), 396 total pass |
| 4c | LC-9 through LC-11 | 3/3 | 3/3 ✅ | All builds clean |
| **Total** | **11** | **11/11** | **11/11** | **396 tests passing** |

**Key Implementation Artifacts:**
- `packages/figmento-core/src/types.ts` — `NodeSnapshot`, `CorrectionEntry`, `ConfidenceLevel`, `LearnedPreference` types
- `figmento/src/handlers/storage.ts` — Snapshot, correction, preference clientStorage handlers
- `figmento/src/utils/diff-calculator.ts` — Diff calculator with threshold table
- `figmento/src/utils/correction-aggregator.ts` — Aggregation engine with confidence scoring
- `figmento/src/handlers/learning.ts` — MCP tool registration (`get_learned_preferences`)
- `figmento/src/ui/system-prompt.ts` — Preference injection into `buildSystemPrompt()`

---

## Cross-Epic Dependencies

| Epic | Relationship | Details |
|------|-------------|---------|
| **MF** (Multi-File Import) | Parallel | No blocking. MF adds input surface, LC adds learning surface. Independent. |
| **ODS** (One-Click Design System) | Shares storage patterns | ODS Phase C (project persistence) will need to include learned preferences in the project YAML. Not blocking. |
| **FN** Phase 2 | LC-9 enhances | FN-9's `buildSystemPrompt()` already accepts preferences param — LC-9 populates it with real data. |
| **FN-17** (Skill Export) | LC enhances | Exported skill files include learned preferences section (already implemented). |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| False positive preferences from accidental edits | Medium | High | C4 threshold table + C6 N≥3 requirement. Extensive threshold tuning in LC-1 tests. |
| Stale snapshots produce meaningless diffs | Low | Medium | C3 10-minute expiry. Snapshots cleared on page change. |
| System prompt inflation from too many preferences | Low | Medium | Max 50 preferences (C8). Compact format in injection (~200 tokens for 10 preferences). |
| User trust erosion from unexpected learned behavior | Medium | High | C5 opt-in only. Full transparency via LC-11 panel. Delete/reset controls. |

---

## Next Actions

1. ~~**@qa (Quinn):** Run QA gate on LC-1 through LC-11~~ — **DONE 2026-04-12. All 11 PASS.**
2. **@devops (Gage):** Push after QA gates pass.
3. ~~**@pm (Morgan):** Update this epic status to Done after all gates pass.~~ — **DONE 2026-04-12.**

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | @pm (Morgan) | PRD-004 authored. LC stories drafted by @sm, validated by @po. |
| 2026-03-13 | @dev (Dex) | All 11 stories implemented (LC-1 through LC-11). 396 tests passing. Status: Ready for Review. |
| 2026-04-11 | @pm (Morgan) | Epic document created. Formalizes dependency chain, phases, implementation status, and cross-epic relationships. All 11 stories confirmed at Ready for Review. |
| 2026-04-12 | @qa (Quinn) | **Batch QA gate: 11/11 PASS.** Phase 4a (LC-1–5), Phase 4b (LC-6–8), Phase 4c (LC-9–11) all gated. All code evidence verified against source files. 396 tests passing. Epic status: InProgress → Done. |
