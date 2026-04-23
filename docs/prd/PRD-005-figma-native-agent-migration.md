# PRD-005: Figma Native Agent Migration — Leveraging `use_figma` & Skills

**Status:** Draft — Ready for @pm Review
**Author:** Product Owner (Human) + Strategic Advisor (Claude)
**Date:** 2026-03-24
**Architecture review needed from:** @architect (Aria)
**Epic:** FN — Figma Native Integration
**Priority:** Critical (Market-driven — Figma shipped today)
**Target milestone:** M8 — Platform Evolution

---

## 0. Executive Context for @pm (Morgan)

### What Just Happened

On March 24, 2026, Figma published ["Agents, Meet the Figma Canvas"](https://www.figma.com/blog/the-figma-canvas-is-now-open-to-agents/). They launched:

1. **`use_figma` tool** — via Figma's MCP server, any MCP client (Claude Code, Codex, Cursor, Copilot, Warp, etc.) can now write directly to Figma files using the Plugin API. No custom WebSocket bridge needed.
2. **Skills** — markdown files that instruct agents how to work on the Figma canvas. Design workflows encoded as repeatable instructions. Published on [Figma Community](https://www.figma.com/community/skills).
3. **Native self-healing loops** — agents can screenshot their work, evaluate, and iterate. This is the exact pattern we were building with `export_node_to_file` (S-27).
4. **Design system awareness** — agents get access to user's components, variables, Code Connect mappings through the MCP server.

### Impact on Figmento

**Figmento's 3-component bridge architecture (Plugin ↔ WS Relay ↔ MCP Server) is now partially commoditized.** Figma provides the same MCP-to-canvas pipeline natively, with better reliability, no relay latency, and design system context we don't have.

**However, Figmento's unique value is NOT the bridge — it's the creative workflows and designer-facing UI.** Figma's solution requires a coding agent (Claude Code, Codex, Cursor). Figmento works inside the Figma plugin UI for non-developers.

### Strategic Recommendation

**Don't fight the platform. Build on it.** Migrate Figmento to leverage Figma's native infrastructure where it's stronger, and double down on what only Figmento does: opinionated AI design modes accessible to designers without CLI tools.

---

## 1. Problem Statement

Figmento currently maintains a complex 3-component system to achieve what Figma now offers natively:

| Component | Current Figmento | Figma Native |
|-----------|-----------------|--------------|
| Canvas write access | Plugin sandbox via WS commands | `use_figma` tool via MCP |
| Command routing | WS Relay (Railway) with channel-based routing, 10MB limit, heartbeat, reconnection | Direct MCP-to-Figma — no relay |
| Design system awareness | None — generates from scratch | Full access to components, variables, Code Connect |
| Self-healing | `export_node_to_file` (S-27) — manual pipeline | Native screenshot → evaluate → iterate |
| Distribution | Plugin install + MCP server + relay setup | MCP client connects directly; skills on Community |

**Maintaining the WS relay and custom MCP bridge is now technical debt**, not competitive advantage. Every hour spent on relay reliability, WS reconnection bugs, or payload limits is an hour not spent on Figmento's actual moat: the AI design modes.

### Evidence

- Architecture doc v2.0 lists 4 "remaining work" items, 3 of which relate to the bridge (WS chunking, integration tests for MCP→WS→Plugin pipeline, shared code extraction)
- The relay has deployment dependencies (Railway, env vars, NIXPACKS_NODE_ENV) that add operational burden
- Current MCP server has 36 tools that each route through WS → plugin → response. Every new tool requires changes in 3 places (tool definition, WS handler, plugin case branch)

---

## 2. Vision

> Figmento becomes the premier AI design experience *inside* Figma — combining the power of Figma's native agent infrastructure with opinionated, designer-friendly creative workflows that no CLI-based agent can match.

### Two-Track Strategy

**Track A: MCP/Agent Track (for developers using Claude Code, Codex, etc.)**
- Publish Figmento's creative workflows as **Figma Skills** on Community
- Screenshot-to-layout, carousel generation, text-to-layout, template fill, ad analysis — all as skills
- These leverage Figma's native `use_figma` tool — no Figmento plugin needed
- Massive distribution: any MCP client user gets Figmento workflows

**Track B: Plugin Track (for designers who don't use CLI tools)**
- Keep and evolve the Figma plugin UI (the 5 modes + chat agent)
- Migrate the plugin's backend from custom WS/MCP bridge to Figma's native MCP where possible
- Add design system awareness to generated designs (components, variables)
- This is the moat — no other tool offers AI design creation with an in-Figma UI

---

## 3. Goals & Non-Goals

### Goals

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | Publish ≥3 Figmento skills on Figma Community | Skills are usable with Claude Code + `use_figma` |
| G2 | Eliminate WS Relay dependency for MCP-agent workflows | Relay can be decommissioned for agent path |
| G3 | Add design system awareness to Figmento-generated designs | Generated frames use user's existing components when available |
| G4 | Maintain full plugin UI functionality for designers | All 5 modes + chat agent continue working |
| G5 | Reduce tool maintenance burden by ≥50% | New tools require changes in 1 place, not 3 |
| G6 | Increase distribution surface | Figmento workflows accessible without plugin install (via skills) |

### Non-Goals

| # | Non-Goal | Reason |
|---|----------|--------|
| NG1 | Immediately deprecate the WS relay | Plugin direct-mode (standalone AI calls) still needs it for the chat agent relay path. Phase it out gradually. |
| NG2 | Rewrite the plugin from scratch | Brownfield enhancement, not greenfield. The unified plugin (v2.0) works. Evolve, don't replace. |
| NG3 | Build our own design system indexer | Figma's MCP server already provides `search_design_system`, `get_variable_defs`, Code Connect. Use theirs. |
| NG4 | Compete with Figma Make | Figma Make is their AI design tool. Figmento focuses on specific creative workflows (social media, carousels, ads, presentations) where opinionated output beats generic generation. |
| NG5 | Support non-Figma platforms | Figmento is a Figma plugin. Stay focused. |

---

## 4. Architecture Impact Assessment

### What Changes

| Current Component | Change | Rationale |
|-------------------|--------|-----------|
| `figmento-ws-relay/` | **Phase out for agent path.** Keep for plugin chat relay only (temporary). | Figma's `use_figma` replaces WS-routed canvas commands. |
| `figmento-mcp-server/` | **Refactor.** Canvas tools delegate to Figma's `use_figma`. Server-side-only tools (knowledge, intelligence) stay. | Eliminates 24+ WS-routed tool handlers. |
| `figmento/` (plugin) | **Evolve.** Add design system context fetch. Keep all 5 UI modes. Bridge tab becomes optional. | Core value preserved, backend simplified. |
| `figmento-mcp-server/knowledge/` | **Extract into Skills.** Convert YAML knowledge + prompt logic into Figma Community skill markdown files. | Skills are the native distribution format for agent workflows. |
| `prompts/` | **Extract into Skills.** System prompts for each mode become skill instructions. | Skills encode the same expertise in a format agents natively understand. |

### What Stays the Same

- All 5 plugin UI modes (Screenshot-to-Layout, Text-to-Layout, Carousel, Presentation, Template Fill)
- Plugin direct-mode AI calls (Anthropic, OpenAI, Gemini from plugin UI)
- `packages/figmento-core/` shared types and utilities
- Design quality knowledge (YAML files, blueprints, refinement rules)
- Brand kit system
- User preference learning (PRD-004 pipeline)

### New Capabilities Unlocked

| Capability | How | Impact |
|-----------|-----|--------|
| Design system-aware generation | Figma MCP's `search_design_system` + `get_variable_defs` | Generated designs snap to user's real components instead of creating everything from scratch |
| Code Connect integration | Figma MCP's `get_code_connect_map` | Generated components can be linked to codebase |
| Community distribution | Publish skills on figma.com/community/skills | Reach every MCP client user without plugin install |
| Self-healing for free | Native screenshot → iterate in Figma MCP | Remove S-27's custom export pipeline for agent path |
| Multi-agent compatibility | Works with Claude Code, Codex, Cursor, Copilot, Warp, etc. | Not locked to single MCP client |

---

## 5. Phased Delivery Plan

### Phase 1: Skills Extraction (Low risk, high distribution value)

**Goal:** Publish Figmento's creative workflows as Figma Community skills.

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| FN-1 | Extract Screenshot-to-Layout Skill | Convert `prompts/` + `ui/screenshot.ts` prompt logic + knowledge YAML into a `/figmento-screenshot-to-layout` skill markdown. Must work with `use_figma` tool. | @dev |
| FN-2 | Extract Text-to-Layout Skill | Convert social media post generation workflow into `/figmento-text-to-layout` skill. Include SOCIAL_FORMATS, COLOR_THEMES, FONT_OPTIONS as skill context. | @dev |
| FN-3 | Extract Carousel/Multi-Slide Skill | Convert carousel + presentation creation into `/figmento-carousel` skill. Include slide sequencing logic. | @dev |
| FN-4 | Extract Ad Analyzer Skill | Convert ad analysis workflow into `/figmento-ad-analyzer` skill. Include brief format, gradient rules, safe zones. | @dev |
| FN-5 | Skills Testing & Publishing | Test all skills with Claude Code + Figma MCP. Publish to Figma Community. Write README for each. | @qa + @dev |

**Phase 1 success test:** A user with Claude Code and Figma MCP (no Figmento plugin installed) can create an Instagram carousel by invoking the `/figmento-carousel` skill.

### Phase 2: Design System Awareness (Medium risk, high quality value)

**Goal:** Figmento-generated designs use the user's real components and variables when available.

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| FN-6 | Design System Discovery | Add a plugin UI flow: "Scan your design system" that calls Figma's `search_design_system` (if available via MCP) or uses `figma.root.findAll()` in the plugin sandbox to index available components/styles. Cache results in clientStorage. | @dev |
| FN-7 | Component Matching in Generation | When AI generates a design element (e.g., "button"), check if user has a matching component. If yes, use `createInstance()` instead of building from primitives. Fall back to primitives if no match. | @dev |
| FN-8 | Variable Binding | When AI sets colors/spacing, check if user has matching variables. Bind to variables instead of hardcoding values. This makes generated designs "live" — they update when the design system changes. | @dev |
| FN-9 | Design System Context in Prompts | Inject discovered components/variables summary into the AI system prompt, so the LLM knows what's available and references real component names in its UIAnalysis JSON. | @dev |

**Phase 2 success test:** Generate an Instagram post in a file that has a design system with a "Button" component and brand colors as variables. The generated design uses the real Button instance and bound color variables.

### Phase 3: MCP Server Simplification (Medium risk, high maintenance value)

**Goal:** Reduce MCP server complexity by delegating canvas operations to Figma's native tools.

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| FN-10 | Audit MCP Tool Routing | Catalog all 36 MCP tools. Classify each as: (a) can delegate to `use_figma`, (b) server-side only (knowledge, intelligence), (c) requires WS for plugin-specific features. | @architect |
| FN-11 | Create Figma MCP Client Adapter | In `figmento-mcp-server/`, create a `figma-mcp-client.ts` that connects to Figma's MCP server as a client. This adapter calls `use_figma` and `search_design_system` on behalf of Figmento's tools. | @dev |
| FN-12 | Migrate Canvas Tools (Batch 1) | Migrate `create_frame`, `create_text`, `create_rectangle`, `set_fill`, `set_auto_layout` to use the Figma MCP adapter instead of WS relay. Keep WS as fallback. | @dev |
| FN-13 | Migrate Canvas Tools (Batch 2) | Migrate remaining canvas tools: `create_design`, `create_icon`, `create_carousel`, `create_presentation`, template tools. | @dev |
| FN-14 | Relay Deprecation Path | Make WS relay optional. Plugin works without relay for agent path. Relay only needed for plugin chat agent's relay mode. Document migration guide. | @dev |

**Phase 3 success test:** `create_design` works end-to-end via Figma MCP (no WS relay running) when invoked from Claude Code.

### Phase 4: Plugin Evolution (Low risk, UX value)

**Goal:** Evolve the plugin UI to leverage native capabilities.

| ID | Story | Description | Executor |
|----|-------|-------------|----------|
| FN-15 | Bridge Tab → Status Tab | Replace the Bridge connection UI with a simpler status indicator. Show: (a) MCP connection status (via Figma's native check), (b) design system scan status, (c) learned preferences count. | @dev |
| FN-16 | "Use My Design System" Toggle | Add a toggle in each mode (Screenshot-to-Layout, Text-to-Layout, etc.) that enables design system-aware generation. When off, behaves like current (primitives). When on, uses discovered components/variables. | @dev |
| FN-17 | Skill Export from Plugin | Allow designers to export their current plugin settings (format, style, theme, brand kit) as a Figma Skill markdown file. "Share my workflow as a skill." | @dev |

**Phase 4 success test:** Designer opens plugin, scans design system, enables "Use My Design System" toggle, creates a social media post that uses real brand components.

---

## 6. Risk Assessment

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | Figma's `use_figma` API changes during beta | High | Medium | Keep WS relay as fallback. Don't delete relay code until Figma API is stable/GA. |
| R2 | Figma's `use_figma` doesn't support all Plugin API operations we use | High | Medium | FN-10 audit identifies gaps early. Fall back to WS for unsupported operations. |
| R3 | Skills format changes or Figma removes skill publishing | Medium | Low | Skills are markdown files — worst case, they become documentation. Core value is in the plugin. |
| R4 | Performance of `use_figma` via MCP is slower than direct WS | Medium | Medium | Benchmark in FN-12. If >2x slower, keep WS for batch operations. |
| R5 | Design system discovery overwhelms large files | Medium | Medium | Cap scan to 500 components, paginate. Cache aggressively in clientStorage. |
| R6 | Existing users disrupted by architecture change | Low | Low | All changes are additive. No existing plugin behavior removed. WS relay stays as fallback. |

---

## 7. Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| Figma MCP Server (`use_figma` tool) | External Platform | Beta — free during beta, will be paid API |
| Figma Community Skills publishing | External Platform | Available now — community page live |
| Figmento architecture v2.0 (unified plugin) | Internal | Complete |
| PRD-004 (User corrections) | Internal PRD | In progress — not blocked by this PRD |
| Epic DQ (Design Quality blueprints) | Internal Epic | Complete — blueprints will be embedded in skills |

---

## 8. Open Questions for @architect (Aria)

| # | Question | Impact |
|---|----------|--------|
| Q1 | Can Figma's `use_figma` tool execute arbitrary Plugin API code (like our `executeCommand()` switch)? Or is it limited to a subset of operations? | Determines scope of FN-12/FN-13 migration. |
| Q2 | How does `use_figma` handle large batch operations (e.g., `create_design` that creates 50+ nodes)? Single call or multiple? | Affects performance of migrated tools. |
| Q3 | Can the plugin sandbox call Figma's own MCP server as a client? Or must MCP calls originate from external clients? | Determines if plugin can use `search_design_system` directly or needs a proxy. |
| Q4 | What's the latency of `use_figma` vs our WS relay for a typical `create_frame` + `set_fill` + `set_auto_layout` sequence? | Benchmark needed before committing to migration. |
| Q5 | Does `use_figma` support Figma Draw and FigJam (the blog post mentions these)? Could we extend Figmento to those surfaces? | Future expansion opportunity. |

---

## 9. Competitive Positioning After Migration

| Capability | Figma Make | Generic MCP Agent | Figmento (Post-Migration) |
|-----------|-----------|-------------------|--------------------------|
| In-Figma UI for designers | ✅ | ❌ (CLI only) | ✅ |
| Screenshot-to-Layout | ❌ | ❌ | ✅ |
| Social media format expertise | ❌ | ❌ | ✅ (49 format adapters) |
| Carousel/Presentation generation | ❌ | ❌ | ✅ |
| Ad analysis + recreation | ❌ | ❌ | ✅ |
| Template scanning + filling | ❌ | ❌ | ✅ |
| Design system-aware generation | ✅ | ✅ (via Figma MCP) | ✅ (NEW — Phase 2) |
| Blueprint-based layouts | ❌ | ❌ | ✅ |
| Multi-provider AI (Claude, GPT, Gemini) | ❌ | ❌ | ✅ |
| Brand kit persistence | ❌ | ❌ | ✅ |
| User preference learning | ❌ | ❌ | ✅ (PRD-004) |
| Skill publishing for community | N/A | N/A | ✅ (NEW — Phase 1) |

---

## 10. Timeline Estimate

| Phase | Stories | Estimated Effort | Dependencies |
|-------|---------|-----------------|--------------|
| Phase 1: Skills Extraction | 5 | 1 sprint | None — can start immediately |
| Phase 2: Design System Awareness | 4 | 1.5 sprints | Phase 1 knowledge useful but not blocking |
| Phase 3: MCP Server Simplification | 5 | 2 sprints | Q1-Q4 answered by @architect; Figma API stable |
| Phase 4: Plugin Evolution | 3 | 1 sprint | Phase 2 complete |
| **Total** | **17 stories** | **~5.5 sprints** | |

**Recommended execution order:** Phase 1 → Phase 2 → Phase 4 → Phase 3 (defer Phase 3 until Figma API exits beta).

---

## 11. Action Items for @pm (Morgan)

1. **Review this PRD** and refine goals/non-goals based on product strategy
2. **Create Epic FN** using `*create-epic` with the 4 phases above
3. **Assign @architect** for Q1-Q5 assessment before Phase 3 stories are drafted
4. **Prioritize Phase 1** — skills extraction has zero technical risk and immediate distribution value
5. **Coordinate with Epic DQ** and **PRD-004 (LC)** — both are in flight and can proceed in parallel. FN doesn't block them.
6. **Monitor Figma's beta pricing** — `use_figma` is free during beta but will become paid. Factor into cost model.

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | Product Owner + Claude | PRD created in response to Figma's "Agents, Meet the Canvas" announcement. 4-phase delivery plan with 17 stories. |

---

*This PRD was created as a strategic response to a platform shift. Speed matters — Phase 1 can start today.*
