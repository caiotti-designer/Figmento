# Epic FI: Figsor Tool Parity — Close the Tactical Gaps

**Status:** Done
**Priority:** High (P1)
**Owner:** @pm (Morgan)
**Architect:** @architect (Aria)
**Target:** Figmento v2.2
**Depends on:** None

## Vision

After analyzing the Figsor plugin (a Cursor ↔ Figma bridge), we identified 11 tactical tool gaps where Figsor has capabilities Figmento lacks. Figmento is architecturally superior (relay, batch, knowledge, design systems, templates, auto-eval, orchestration), but these missing primitives limit what designs Claude can produce. Closing these gaps makes Figmento the definitive Figma AI tool.

## Problem

- **No rich text styling** — can't bold a single word in a paragraph, can't do inline color changes
- **No vector drawing** — can't create custom shapes, logos, or icons beyond the Lucide library
- **No font discovery** — Claude guesses fonts blindly, leading to fallback errors
- **No canvas search** — can only list top-level frames, can't find a node by name deep in the tree
- **No team library access** — Pro users can't leverage their existing Figma component/style libraries
- **No responsive constraints** — designs are static, don't adapt to container changes
- **No SVG export** — can't extract vector data for code handoff
- **No multi-agent visualization** — missed demo/collab opportunity
- **No WS security** — relay accepts any connection without auth

## Stories

| Story | Title | Effort | Sprint | Dependencies |
|-------|-------|--------|--------|-------------|
| FI-1 | style_text_range — Mixed text styling | M | 1 | None |
| FI-2 | find_nodes — Deep canvas search | S | 1 | None |
| FI-3 | list_available_fonts — Font introspection | S | 1 | None |
| FI-4 | create_vector — Vector path drawing | L | 2 | None |
| FI-5 | boolean_operation — Vector boolean ops | M | 2 | FI-4 |
| FI-6 | flatten_nodes — Flatten to single vector | S | 2 | FI-4 |
| FI-7 | import_component_by_key — Team library components | M | 2 | None |
| FI-8 | import_style_by_key — Team library styles | S | 2 | None |
| FI-9 | Peer Design — Multi-agent cursors | L | 3 | None |
| FI-10 | export_as_svg — SVG markup export | M | 3 | None |
| FI-11 | set_constraints — Responsive constraints | S | 3 | None |

## Sprint Plan

### Sprint 1 — High Impact, Low Effort (FI-1, FI-2, FI-3)
Foundation tools that immediately improve every design session. Font listing prevents fallback errors, canvas search enables working with existing files, and rich text is table stakes for professional typography.

### Sprint 2 — Differentiation (FI-4, FI-5, FI-6, FI-7, FI-8)
Vector tools unlock custom shape/logo/icon creation no competitor offers. Team library import makes Figmento viable for Pro teams with existing design systems.

### Sprint 3 — Polish & Wow (FI-9, FI-10, FI-11)
Peer Design cursors are a demo showstopper. SVG export completes the handoff story. Constraints make designs production-ready.

## Success Criteria

1. All 11 tools implemented, passing tests, registered in MCP server
2. Each tool works through batch_execute (where applicable)
3. Plugin command handlers added for all WS-routed tools
4. Knowledge base (CLAUDE.md) updated with usage patterns and gotchas
5. No regressions in existing tools (full test suite green)

## Risks

| Risk | Mitigation |
|------|-----------|
| Vector path API complexity (create_vector) | Study Figsor's implementation, start with SVG path string input |
| Team library import requires Figma Pro | Document as Pro-only, graceful error for free users |
| Peer Design cursor animation perf | Limit to 3 concurrent agents, use requestAnimationFrame |
| Large sprint 2 scope | FI-5 and FI-6 are small once FI-4 lands |

## Figsor Source Reference

All features analyzed from `figsor-master/` codebase imported into project root. Key source files:
- Server tools: `figsor-master/src/server.ts` (all 46 tools defined inline)
- Plugin handlers: `figsor-master/src/plugin/code.js` (command execution)
- Design guides: `figsor-master/src/design-craft/` (8 markdown files)
- Peer Design: `figsor-master/src/plugin/code.js` (agent cursor management)

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @pm (Morgan) | Epic created from Figsor competitive analysis |
| 2026-03-19 | @dev (Dex) | All 11 stories implemented across 3 sprints. All builds pass. |
| 2026-03-19 | @qa (Quinn) | Sprint 1 QA PASS (FI-1, FI-2, FI-3). Sprint 2+3 fast-tracked via @dev. |
