# Manual Regressions — Figmento

> **Purpose:** Institutional memory for visual / behavioral bugs that were observed, diagnosed, fixed, and need to stay fixed. Each entry is a mini post-mortem with enough detail that a future refactor can re-verify the regression in minutes.
>
> **Policy:** Add an entry here whenever a bug surfaces that cannot be covered by automated tests alone (UI rendering, Figma canvas output, contrast perception, layout correctness). Do not delete entries — they are evidence of what once broke.

---

## 2026-04-16 — Coral de Dois showcase extension: dark panels + escaping Brand Quote frame

**Trigger:** Running `generate_design_system_in_figma` on the Coral de Dois brand brief (Portuguese quinta / editorial luxury / deep forest green primary `#1F3A2E`, near-black surfaces, aged-brass accent `#B8860B`).

**What broke:**

1. **Dark section header panels with inverted contrast.** The LLM agent, extending the baseline showcase with custom `batch_execute` calls, placed dark-filled "SECTION HEADER" rectangles above each major showcase section (Paleta, Tipografia, Componentes, Iconos de Marca, Escala, Frase de Marca) and rendered the section titles in `on_surface` (`#151917`) on top. Result: 1.07:1 contrast ratio, visually invisible.

2. **Sibling-positioned Brand Quote frame.** The agent created a 1248×320 "Brand Quote" frame containing the brand tagline and placed it at the canvas root as a **sibling** of the main showcase, not nested inside it. Result: the quote read as a detached artifact next to the showcase rather than part of it.

**Root cause:**
- `create_ds_showcase` baseline rendered correctly — the bugs were introduced by *agent extensions* on top.
- No rule in `CLAUDE.md` told the agent (a) to use contrast-aware color selection when creating new fill-backed panels, or (b) to nest supplementary frames inside the showcase root via `parentId`.

**Fix (two commits):**

1. **`f509bf5` (2026-04-16)** — `fix(ds-showcase): contrast-aware text`. Added luminance-delta check + contrast-safe fallback (`#FFFFFF` / `#1A202C`) in [figmento/src/handlers/ds-showcase.ts](../../figmento/src/handlers/ds-showcase.ts). Protects the baseline showcase.

2. **DQ-HF-1 (2026-04-22)** — documented the discipline rules in [.claude/CLAUDE.md](../../.claude/CLAUDE.md) "Post-Showcase Extension Discipline" section + added a soft sibling-warning in the `create_frame` MCP handler via [figmento-mcp-server/src/tools/design-system/showcase-tracker.ts](../../figmento-mcp-server/src/tools/design-system/showcase-tracker.ts). The warning fires when a new frame is created at canvas root with the same width as a showcase created within the last 60 seconds — informational, never blocks.

**How to reproduce (if you need to verify the fix hasn't regressed):**

1. Run `generate_design_system_in_figma` with the fixture at [figmento-mcp-server/tests/fixtures/dark-theme-brief.json](../../figmento-mcp-server/tests/fixtures/dark-theme-brief.json) (or any brand with `primary` close to `on_surface`).
2. Expect: a **single clean showcase frame** with readable section titles (white text on dark panels, or dark text on light panels — never same-luminance pairs).
3. Expect: any supplementary frames the agent creates afterward either nest inside the showcase (via `parentId`) OR — if siblings — the `create_frame` response carries a `warning` field citing the showcase's rootFrameId.
4. Failure mode (legacy bug): invisible section headings, detached Brand Quote panel next to showcase.

**Automated regression tests:**
- [figmento-mcp-server/tests/dq-hf-1-showcase-discipline.test.ts](../../figmento-mcp-server/tests/dq-hf-1-showcase-discipline.test.ts) — 12 tests covering contrast math (reproduces 1.07:1 bug; verifies 10:1+ fix) and the sibling-warning tracker (expiry, parentId bypass, width mismatch).

**Related:**
- [DQ-HF-1 story](../stories/DQ-HF-1-design-agent-showcase-discipline.story.md)
- [epic-DQ — Design Quality](../stories/epic-DQ-design-quality.md)

---
