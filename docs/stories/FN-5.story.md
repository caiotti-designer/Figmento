# FN-5: Skills Testing & Community Publishing

| Field | Value |
|-------|-------|
| **Story ID** | FN-5 |
| **Epic** | FN — Figma Native Agent Migration |
| **Status** | Ready |
| **Author** | @pm (Morgan) |
| **Executor** | @qa + @devops |
| **Gate** | @pm |
| **Created** | 2026-03-24 |
| **Complexity** | M (Medium) |
| **Priority** | HIGH |

---

## Description

Bundle test the remaining three skills (FN-2, FN-3, FN-4) with Claude Code + Figma MCP `use_figma`, then package and publish all four Figmento skills to Figma Community. FN-1 (Screenshot-to-Layout) already passed live testing — FN-2, FN-3, FN-4 follow the same validated pattern.

This is the final story before Epic FN active phases close.

## Acceptance Criteria

- [ ] AC1: FN-2 (Text-to-Layout) passes live end-to-end test using the test plan brief at `docs/qa/fn-phase1-live-test-plan.md`
- [ ] AC2: FN-3 (Carousel) passes live end-to-end test — multi-slide consistency verified
- [ ] AC3: FN-4 (Ad Analyzer) passes live end-to-end test — 5-phase pipeline produces analysis + variants
- [ ] AC4: All 4 skills score ≥12/16 on the self-evaluation checklist
- [ ] AC5: All 4 skill files have README/usage headers suitable for Figma Community
- [ ] AC6: Each skill file reviewed for Community publishing quality — clear language, no internal references, no Figmento-specific tool names
- [ ] AC7: Skills published to Figma Community (or prepared for publishing if Community upload requires manual steps)
- [ ] AC8: Each published skill has a description, category tags, and usage instructions on the Community listing

## Scope

### IN Scope
- Live testing FN-2, FN-3, FN-4 using test plan briefs
- Recording test results in `docs/qa/fn-phase1-live-test-plan.md`
- Final copy editing of all 4 skill files for Community quality
- Publishing to Figma Community (or packaging for manual upload)

### OUT of Scope
- Modifying skill content/knowledge (that was FN-1 through FN-4)
- Modifying plugin code (that was Phase 2 and Phase 4)
- Phase 3 stories

## Dependencies

- FN-1 through FN-4 (all implemented and skill files exist)
- `docs/qa/fn-phase1-live-test-plan.md` (test plan with specific briefs)
- Figma MCP connected environment

## Definition of Done

- [ ] All 4 skills tested end-to-end with Claude Code + `use_figma`
- [ ] Test results recorded in the test plan document
- [ ] All 4 skills published or ready for Community upload
- [ ] Community publishing readiness checklist passed (9 criteria from test plan)

## File List

| File | Action | Description |
|------|--------|-------------|
| `skills/figmento-screenshot-to-layout.md` | REVIEW | Final copy edit for Community |
| `skills/figmento-text-to-layout.md` | REVIEW + TEST | Live test + copy edit |
| `skills/figmento-carousel-multi-slide.md` | REVIEW + TEST | Live test + copy edit |
| `skills/figmento-ad-analyzer.md` | REVIEW + TEST | Live test + copy edit |
| `docs/qa/fn-phase1-live-test-plan.md` | MODIFY | Record test results |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | @pm (Morgan) | Story drafted. Bundled FN-2/FN-3/FN-4 live tests with Community publishing into a single sprint. FN-1 already passed. |
| 2026-03-24 | @qa | AC6 review: All 4 skills reviewed for Community publishing quality. **Issues found and fixed:** (1) FN-2 line 392 referenced "FN-3" internal story ID — replaced with skill name. (2) FN-4 line 190 referenced "FN-1 skill" — removed internal cross-reference. (3) FN-4 line 9 referenced "mcp-image" internal tool — replaced with generic "DALL-E, Midjourney, or similar". (4) FN-4 image placement code example had dead/confusing line — cleaned up. **No issues found:** FN-1 (screenshot-to-layout) and FN-3 (carousel) are clean. All 4 skills pass 9-point Community quality checklist. Token estimates: FN-1 ~4.6K, FN-2 ~5.9K, FN-3 ~5.1K, FN-4 ~3.8K — all well under 15K limit. |
