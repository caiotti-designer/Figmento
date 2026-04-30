# Figmento Redesign Audit — Phase 1 Discovery

**Date:** 2026-04-29
**Author:** Jarvis (Claude Code)
**Scope:** Full plugin audit (UI + tech stack + sandbox constraints) ahead of Caiotti DS v1 redesign
**Branch:** `redesign/caiotti-ds-v1`

---

## TL;DR

Figmento is a healthy plugin with two structural problems and a lot of accumulated noise:

1. **Vanilla TS + 5300-line single ui.html has hit the scaling wall.** 30+ TS modules sharing state via raw DOM + ad-hoc pub/sub. State management is the next failure mode.
2. **Caiotti DS v1 is not applied** — Inter font, generic black accent (#171717), Material blue links, radius scale (6/8/12) misaligned with DS v1 (4/8/14/20).
3. **15+ named UX/UI smells** including 5 unlabeled header icons, two settings entry points, dev/debug data leaking into prod UI, dead-code orphans (tab-bridge duplicate, tab-status never rendered, ad-analyzer.ts unused).

**Recommended path:** Phase 2 (UX cleanup, no visual changes) → Phase 3 (Caiotti DS v1 application). Defer framework migration to a future surface; adopt `nanostores` and `Biome` now as low-risk leverage. Pilot Plugma (Vite + HMR) on a side branch.

---

## 1. Current Tech Stack Snapshot

| Layer | Today | Verdict |
|---|---|---|
| Language | TypeScript 5.3 | ✓ Keep |
| Bundler | esbuild 0.20 | ✓ Keep, but Plugma (Vite + vite-plugin-singlefile) gives HMR + Chrome preview |
| Framework | None (raw DOM + addEventListener) | ⚠ Hitting wall at 5300 lines / 30+ modules. Don't migrate now — stage foundation. |
| State | Ad-hoc pub/sub + module globals (`state.ts`) | 🔴 Replace with `nanostores` (286 bytes, framework-free) |
| Linter | ESLint 9 | ⚠ Replace with Biome 2 (one tool, faster, type-aware) |
| Tests | Jest 30 (no UI tests, manual reload only) | ⚠ Add Playwright Component-style for UI eventually; not blocker |
| Component lib | None (custom CSS) | ✓ Keep custom CSS |
| API | `@figma/plugin-typings` ^1.98 | ✓ Recent (current as of v1.124, March 2026) |

**Bundle output:** Single inlined `dist/ui.html` via esbuild IIFE → injection at `<!-- SCRIPT_PLACEHOLDER -->` marker. Required by Figma manifest (single HTML UI). No CDN runtime allowed except whitelisted domains (Google Fonts, unpkg for Lucide).

---

## 2. Figma Plugin Sandbox Constraints

These are hard constraints that gate any redesign decisions:

### Confirmed limits

- **No `localStorage`.** Plugin iframe uses `data:` URL → `SecurityError` on access. Use `figma.clientStorage.setAsync/getAsync` (5 MB per plugin, sandboxed per user). Already correctly implemented in Figmento.
- **No `WebGPU`.** Null-origin iframe blocks `navigator.gpu`. WebGL works.
- **Single HTML UI.** Manifest's `ui` field points to one `dist/ui.html`. No multi-page navigation, no separate JS files at runtime. Everything must be inlined.
- **Network allowlist.** `manifest.json` `networkAccess.allowedDomains` is strict. Adding a domain = manifest update + Figma re-review. Current allowlist already covers all four AI providers + Venice + relay + Google Fonts + unpkg.
- **No `figma.ui.show()` programmatic resize beyond `figma.ui.resize()`.** Width/height locked at manifest level + runtime resize.
- **CommonJS in sandbox (`code.ts`), ES2020 in UI (`ui/index.ts`).** Already correctly configured in build.js.
- **No service workers.** Plugin iframes can't register them.

### Soft constraints (best practice)

- **Bundle size.** No hard limit, but UIs > 1 MB feel sluggish on cold-load. Figmento today: ~5300-line ui.html minified ~? KB (need to measure). Ship-on-build optimization should be enforced.
- **Memory leaks.** Long-lived plugin sessions (Caio uses Figmento for hours) accumulate listeners. The `cleanupAllListeners` pattern in `utils.ts` is good but not universally applied across modules.
- **Iframe origin.** Default is null-origin (more locked-down). Hosted iframe (your domain) lifts WebGPU/Storage but requires external hosting. Not relevant for Figmento today.

### Recent Figma Plugin API features (2025–2026, applicable to Figmento)

- `figma.buzz` API for asset creation (v1.119, Oct 2025) — not used, may be relevant for future image generation flow
- Pattern fills via `setFillsAsync()` (v1.123, Jan 2026) — could enable richer DS scan output
- Extended variable collections (v1.121, Nov 2025) — relevant for DS scanner if Caio uses Enterprise mode
- `figma.currentPage.focusedNode` (v1.124, March 2026) — could improve "Recreate from Selection" flow

---

## 3. UI Surface Inventory

Eight distinct UI surfaces, four of which have noise/duplication issues.

### Active surfaces

| Surface | ui.html | Module | States covered |
|---|---|---|---|
| Chat panel | 4790–4843 | `chat.ts` | welcome, loading, messages, error |
| Image Studio | 4846–4923 | `image-studio.ts` | refs loaded, prompt active, preview, history |
| Settings sheet | 4927–4937 | `settings.ts`, `chat-settings.ts` | populated dynamically from `tab-settings` |
| Sessions drawer | 4785–4787 | `chat.ts` | empty, list populated |
| Top bar (header) | 4744–4770 | `index.ts` | 5 icon buttons + status dot |
| Tab bar | 4773–4782 | `index.ts` | Chat / Image Studio |

### Dead/orphaned surfaces (PHASE 2 KILL LIST)

| Surface | ui.html | Status |
|---|---|---|
| `tab-chat` (legacy) | line 4940 | `display:none !important`, never populated |
| `tab-status` | 4945–5016 | `display:none`, never rendered. Status card UI fully built but unreachable. |
| `tab-bridge` | 5019–5057 | `display:none`. **Duplicate** of Advanced Bridge section (5264–5299) which IS wired. |
| `tab-settings` | 5060–5299 | `display:none`. Content moved into settingsSheet at runtime — pattern is fine, but the dead `<div>` should be a `<template>`. |
| Mode selector dropdown | comment-removed | All legacy multi-step flows (text-layout, template, presentation, hero generator, ad-analyzer mode UI) were removed but `ad-analyzer.ts` module still imported in `index.ts`. |

---

## 4. Settings Architecture (smell)

Settings has **two entry points** and **eight sub-sections**:

**Entry points:**
- `settingsBtn` (top bar, line 4765)
- `designDrawerBtn` (input toolbar, line 4830) — opens same sheet, no clear distinction

**Sub-sections (all in `tab-settings`, lines 5060–5299):**
1. Chat Model (provider picker + per-provider key fields)
2. Relay Mode (cloud relay toggle + URL field)
3. Image Generation (Gemini key, may differ from chat key)
4. Design System (scan button + summary)
5. Learning (auto-detect corrections)
6. Preferences (panel: list, export/import/clear)
7. Skill Export ("Share My Workflow" button)
8. Advanced: MCP Bridge (collapsible `<details>`)

**Smells:**
- Duplicate entry points (Item #6 in punch list)
- Model selector exists in **both** input toolbar (`modelSelectorBtn`, line 4816) AND settings (`settings-model`, line 5066) — two sources of truth
- Inverted relay toggle UI: hint says "Route chat through cloud relay" but URL field hides when toggle ON (line 5192) — semantics need verification
- Anthropic OAuth section (lines 5122–5140) gated on `clientId = 'TODO_FIGMENTO_ANTHROPIC_CLIENT_ID'` — feature flagged off, dead UI
- Hardcoded inline styles in settings markup (lines 5135, 5164, 5267 use `#22c55e33`, `#4ade80` instead of tokens)

---

## 5. UX/UI Smells (Punch List, Prioritized)

Ranked by (impact × confidence) / effort. P0 = ship before redesign, P1 = part of redesign, P2 = nice to have.

### P0 — High impact, low risk (Phase 2)

1. **Two settings entry points (settingsBtn + designDrawerBtn)** — pick one, remove the other. Settings is one feature, not two.
2. **5 unlabeled header icons** — every icon needs a visible label OR a clear, distinct shape. The current set (chat-new, sessions, learn, theme-toggle, settings) has discoverability collapse.
3. **Theme toggle in main header** — belongs in settings. Caio uses Caiotti DS light by default; a one-click toggle is fine but doesn't deserve top-bar real estate.
4. **`chat-learn` icon disabled by default with no visible explanation** — user doesn't know why. Either explain in tooltip ("Enable in Settings → Learning") or hide until enabled.
5. **Dev/debug "Relay: Connected · figmento-local" in primary UI** (relay-status-bar, line 4791) — dev signal leaking to users. Hide in production, expose only in Settings → Advanced.
6. **Disabled "Use My Design System" toggle row** (line 4803) — when no DS scanned, hide the row entirely. Show a CTA "Scan your design system" only when contextually relevant (e.g., after first generation).
7. **Welcome state burns half the viewport** — F logo + "Figmento" + tagline + "Try these prompts" header + 4 prompt cards on first open. Collapse welcome after first message.
8. **Prompt card text is gray-on-gray** — descriptions barely legible (low contrast, fails WCAG AA likely).
9. **Two redundant "Figmento" wordmarks** — Figma title bar already says "Figmento". The in-panel `top-bar-logo` is redundant. Either kill it, or replace with a smaller, more useful chrome (status, mode indicator).
10. **Bottom bar truncates "Claude Code (M..."** — model picker can't fit its own label. Either widen, abbreviate, or use an icon + tooltip.
11. **Dead code: `tab-bridge` (5019–5057), `tab-status` (4945–5016), `tab-chat` (line 4940), `ad-analyzer.ts` module** — purge before adding new features.
12. **Inline hardcoded hex colors** (lines 5135, 5164, 5267: `#22c55e33`, `#4ade80`) — extract to tokens.
13. **Status dot on settings button** (line 4767) has CSS classes `.connected/.warning/.error` but no DOM toggling visible — verify it actually updates, or remove.
14. **CU-6 comment proliferation** (6+ `// CU-6:` comments across HTML and TS) — feature flag is closed; remove the breadcrumbs.
15. **Anthropic OAuth dead UI** (lines 5122–5140, gated on `TODO_FIGMENTO_ANTHROPIC_CLIENT_ID`) — hide until the feature is real.

### P1 — Visual redesign (Phase 3, applies Caiotti DS v1)

16. **Inter font** — replace with Caiotti DS v1 stack (Geist or Cabinet Grotesk for display, system-ui fallback for body).
17. **Border-radius scale 6/8/12** → Caiotti DS v1 4/8/14/20.
18. **Accent color `#171717` (basically black)** → Caiotti DS v1 olive/cyan (light mode olive primary, dark mode cyan).
19. **Text-link color `#2563EB` (Material blue)** → Caiotti DS accent.
20. **Surface tints** — `#FFFFFF` / `#F9FAFB` / `#F3F4F6` are generic Tailwind. Caiotti DS uses zinc family with olive tints.
21. **Light+dark mode parity check** — both themes complete in tokens, but several inline colors bypass tokens (Item #12). Audit every color reference.
22. **Component restyling** — buttons, inputs, cards, modals, tabs, dropdowns all need DS pass.
23. **Typography hierarchy** — currently 3 weights used (400/500/600). Add 700 for display headlines, 500 for labels. Caiotti DS v1 wants tighter tracking on headlines.
24. **Motion pass** — current `--transition-fast: 0.15s ease` and `--transition-base: 0.25s ease`. Caiotti DS v1 prefers spring-feel curves (`cubic-bezier(0.16, 1, 0.3, 1)`).

### P2 — Future / nice to have

25. **Empty-state illustrations or composed onboarding** — chat welcome, sessions empty, prefs empty currently render as bare text or nothing.
26. **Skeleton loaders** — currently uses generic `.spinner` (line 4798). Skeletons matching layout shape are better.
27. **Streaming chat UI** — tool-loop responses render after completion. Streaming partial tool results would feel more responsive.
28. **Settings search** — 8 sub-sections is on the edge of "needs search field." Add if growth continues.
29. **Keyboard shortcuts panel** — discoverability of `Cmd+K`, `Cmd+/`, etc.

---

## 6. Tech Stack Recommendations (5-Bullet Punch)

1. **Adopt `nanostores` immediately** (1-day change, ~286 bytes, no framework lock-in). Replaces ad-hoc pub/sub across 30 modules and pays back in week one. Lowest-risk highest-leverage change.
2. **Switch ESLint → Biome 2** (1-day change). One tool for lint + format, faster, type-aware. Skip Oxlint for now — Biome's ergonomics suit a solo project.
3. **Pilot Plugma (Vite + vite-plugin-singlefile) on a side branch** before Phase 3. Unlocks HMR + Chrome preview = 10x velocity for vibe-coding UI. Only real risk: re-validating the `data:` URL iframe + `clientStorage` path post-migration.
4. **Don't migrate to a UI framework now.** A 5300-line vanilla HTML works; rewrite is high cost. Trigger to migrate is when a *new* major surface arrives (e.g., a third studio mode), build that surface in **Preact + signals inside Plugma** — coexists with vanilla via island pattern.
5. **Keep custom CSS, extract Caiotti DS v1 tokens to CSS variables.** No component library. Tailwind is overkill for an iframe. Token-based CSS scales fine.
6. **Keep vanilla TS in `code.ts` (sandbox)** — no UI runtime needed there. Framework would be pure overhead.

---

## 7. Open Questions for Caio

Before Phase 2 starts, answer these:

1. **Tech stack scope** — adopt `nanostores` + `Biome 2` in Phase 2, or defer all tech stack changes to a separate sprint? (Recommend: nanostores yes, Biome yes, Plugma defer to dedicated branch experiment.)
2. **Plugma pilot** — green-light a parallel `experiment/plugma-vite-migration` branch to validate before committing? Time box: 4 hours.
3. **Anthropic OAuth dead UI** — is this feature still on the roadmap? If yes, finish it. If no, delete the dead UI and `oauth-flow.ts` Anthropic paths.
4. **`tab-status` (the unreachable status view)** — was this an aborted feature or planned? If planned, restore it. If aborted, delete.
5. **Multi-tenant settings** — currently single global setting state. Is per-project / per-Figma-file settings on the roadmap? (Affects how we structure state with nanostores.)
6. **Skill export entry point** — the "Share My Workflow" button is buried in settings. Should it surface elsewhere (e.g., post-generation toast: "Save your style as a skill")?
7. **Streaming chat priority** — defer to P2, or prioritize alongside the redesign so the new UI is built for streaming from day one?

---

## 8. Phase 2 Plan (UX Cleanup, No Visual Changes)

Goal: every interaction works, but with less noise. Visual identity unchanged. Ship behind feature branch, merge when complete.

**Sprint 1 — Kill the noise** (~1 session)
- Remove `tab-chat`, `tab-status`, `tab-bridge`, `ad-analyzer.ts`
- Remove CU-6 breadcrumbs (6 files)
- Remove Anthropic OAuth dead UI OR finish the feature (gate decision on Q3)
- Hide `relay-status-bar` from main UI; expose only in Settings → Advanced
- Convert hardcoded hex colors in inline styles to tokens

**Sprint 2 — Consolidate entry points** (~1 session)
- Pick ONE settings entry point (recommend: `settingsBtn` only, kill `designDrawerBtn`)
- Pick ONE model selector source of truth (recommend: input toolbar primary, settings shows current selection only)
- Move theme toggle into settings
- Add proper labels to header icons (or replace with text + icon)

**Sprint 3 — Fix first-run UX** (~1 session)
- Welcome state collapses after first message
- "Use My Design System" row hidden until DS scanned
- Empty states defined for: sessions, prefs, image studio history
- Onboarding cue: when no API key, point to settings explicitly with a CTA, not a status dot

**Sprint 4 — State migration** (~1 session, gated on Q1)
- Adopt `nanostores`, refactor `state.ts` and 5–10 most-coupled modules
- Add Biome 2, run formatter, fix any new flags
- Verify production build still single-HTML, manifest valid

---

## 9. Phase 3 Plan (Caiotti DS v1 Redesign)

Goal: full visual identity application. Light + dark, light default. Ship behind same redesign branch, merge when complete.

**Sprint 1 — Token foundation**
- Replace radius scale (6/8/12 → 4/8/14/20)
- Replace accent (`#171717` → DS olive in light, cyan in dark)
- Replace surfaces (Tailwind grays → zinc family with olive tint)
- Audit every color reference, route through tokens

**Sprint 2 — Typography**
- Swap Inter → Geist or Cabinet Grotesk (display) + system-ui (body)
- Tighten heading tracking
- Add weight 700 for display, ensure 500 used for labels
- Update font preload in manifest network allowlist if needed

**Sprint 3 — Component restyling**
- Buttons (icon-btn, send-btn, btn-primary, ds-scan-btn)
- Inputs (chat-input, password fields, custom dropdowns)
- Cards (sessions-list items, prompt-cards, history-strip items)
- Modals (settingsSheet, sessions-drawer)
- Tabs and tab-bar
- Status indicators (statusDot, relay-dot, ds-scan-status)

**Sprint 4 — Motion & polish**
- Replace generic eases with DS spring curves
- Hover states audit (every interactive needs one)
- Active/pressed states (`scale 0.98` or `translateY 1px`)
- Focus ring audit (a11y)
- Skeleton loaders replace spinners

**Sprint 5 — QA**
- Side-by-side compare against Caiotti DS v1 spec
- Run against `figmento-design-taste.md` checklist
- Build prod, load in Figma, verify cold-load + warm-load behavior
- Test light + dark theme switching mid-session

---

## 10. Sources

- Figma plugin samples: https://github.com/figma/plugin-samples
- Create Figma Plugin: https://yuanqing.github.io/create-figma-plugin/
- Plugma: https://next.plugma.dev/ | https://github.com/gavinmcfarland/plugma
- Figma Plugin Manifest: https://developers.figma.com/docs/plugins/manifest/
- Figma Plugin Updates: https://developers.figma.com/docs/plugins/updates/
- Nanostores: https://github.com/nanostores/nanostores
- Biome vs ESLint vs Oxlint 2026: https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026
- OAuth with Plugins: https://developers.figma.com/docs/plugins/oauth-with-plugins/
- Evil Martians on Figma plugins: https://evilmartians.com/chronicles/how-to-make-next-level-figma-plugins-auth-routing-storage-and-more
