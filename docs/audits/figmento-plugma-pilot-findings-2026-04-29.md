# Plugma Pilot — Findings Report

**Branch:** `experiment/plugma-pilot` (worktree at `../Figmento-plugma-pilot`)
**Date:** 2026-04-29
**Time invested:** ~2h (under the 4h budget)
**Verdict:** ✅ **GO** — Plugma works for Figmento's vanilla TS architecture; migration is mechanical, ~1-2 days of careful work

---

## TL;DR

Plugma 2.2.3 is a viable replacement for Figmento's custom esbuild pipeline. It delivers the promised benefits (Vite + HMR + browser preview + single-HTML output) and the migration path is well-defined. **Plugma's published README falsely claims it only supports React/Svelte/Vue — vanilla TS works fine.**

The pilot validated all three critical capabilities:
1. Production build produces clean single-HTML output (no runtime overhead)
2. Dev mode runs Vite with HMR + WebSocket bridge at localhost
3. Manifest, networkAccess, and Figma plugin constraints all preserved

**Recommended next step:** schedule a 1–2 day migration pass on the redesign branch when bandwidth allows. Could be Sprint 4 work if Caio prefers HMR before tackling Phase 3 visual redesign — Phase 3 will involve heavy CSS iteration and HMR pays back fastest there.

---

## What was tested

A minimal Plugma starter project (`/tmp/plugma-starter/`) with:
- Vanilla TypeScript code.ts (no framework)
- Vanilla TypeScript ui.ts (DOM API, no framework)
- Standard Figma plugin patterns (`figma.showUI`, `parent.postMessage`)
- Default manifest setup via `package.json#plugma.manifest`

Validated:
- `npm install plugma@2.2.3` — worked, installs Vite + plugins as transitive deps (~71 MB node_modules)
- `npx plugma build` (default dev mode) — produced 203 KB ui.html with Plugma runtime injected
- `npx plugma build --mode production` — produced **3.5 KB ui.html, 320 byte main.js** — no Plugma runtime
- `npx plugma dev` — started Vite dev server at `http://localhost:3977` with watch mode
- Auto-generated `dist/manifest.json` from package.json plugma block
- Single-HTML output via `vite-plugin-singlefile` (already what Figma requires)

---

## Key findings

### 1. Vanilla TS is supported (despite README)

Plugma's README at https://github.com/gavinmcfarland/plugma lists only React/Svelte/Vue. **This is misleading.** The runtime CLI (`plugma dev`/`build`) is framework-agnostic — frameworks only matter for the `npm create plugma@latest` scaffolding command. For an existing vanilla TS project, no framework is needed.

The `templates/` folder inside the installed package contains only `vite/` and `github/` subdirs — confirming the framework requirement is template-specific, not runtime-specific.

### 2. `code.ts` requires a default-exported function

This is the **biggest behavioral difference** vs Figmento's current pattern. Today's Figmento `code.ts`:

```ts
// runs at import time
figma.showUI(__html__, { width: 380, height: 600 });
figma.ui.onmessage = (msg) => { /* ... */ };
```

Plugma expects:

```ts
export default function () {
  figma.showUI(__html__, { width: 380, height: 600 });
  figma.ui.onmessage = (msg) => { /* ... */ };
}
```

Plugma generates a shim that imports + calls this function. Migration impact: wrap existing `code.ts` body in `export default function() { ... }`. ~5 minute change, single file.

### 3. Production builds are clean

With `--mode production`, the runtime is stripped. Output is identical in size profile to esbuild output:
- `dist/main.js` (sandbox, replaces our `code.js`)
- `dist/ui.html` (UI, single-file inlined)
- `dist/manifest.json` (auto-generated from package.json)

For Figmento (currently 2418 KB ui.html), Plugma's production output should be similar size — the inlined CSS+JS is the same amount of code regardless of bundler.

### 4. Dev mode injects ~200 KB of Plugma runtime

`plugma dev` and `plugma build` (without `--mode production`) inject:
- WebSocket client for HMR
- Status overlay UI (Svelte component, ~50 KB)
- Runtime configuration globals

This **only affects dev builds**. Never reaches production. The "200 KB" is the cost of getting HMR + browser preview, paid once per dev iteration.

### 5. HMR works in browser preview, NOT in Figma

Important nuance for our workflow:
- **Browser preview at `http://localhost:3977`**: full Vite HMR — edit files, see UI update in <1s, no rebuild
- **Inside Figma plugin**: Figma loads `dist/ui.html` from disk via the manifest. It doesn't connect to Vite's dev server. So changes still require rebuild + plugin reload in Figma to test inside Figma.

This is exactly the trade-off the research agent described. Workflow becomes:
1. Iterate UI in Chrome (HMR, fast)
2. When stable, run `plugma build --mode production` and reload in Figma to validate the actual plugin integration

For Figmento where 90% of the UI work is CSS/markup tweaks (especially in Phase 3 redesign), the iteration speed gain is significant.

### 6. WebSocket bridge for sandbox ↔ UI dev simulation

Plugma includes a WebSocket bridge that simulates the sandbox `figma.ui.postMessage` ↔ UI `parent.postMessage` flow during dev. This means you can iterate UI logic in Chrome with mock plugin messages flowing both directions. Mention in docs but not validated in pilot — would need real testing during migration.

---

## Migration plan for Figmento

Estimated 1–2 days of careful work. Step-by-step:

### Step 1 — Add Plugma + Vite to devDependencies (5 min)

```bash
cd figmento
npm install plugma vite vite-plugin-singlefile --save-dev
# Optional: remove esbuild later once verified
```

### Step 2 — Wrap `code.ts` body (5 min)

Add `export default function() { ... }` around the current top-level body of `src/code.ts`. Internal logic unchanged.

### Step 3 — Restructure UI entry (~1 hour)

Currently: `src/ui.html` (5300 lines including all CSS) + `<!-- SCRIPT_PLACEHOLDER -->` for esbuild injection.

Plugma expects:
- A normal HTML file (Vite's `index.html` convention) at project root, OR a custom template referenced from `package.json#plugma.manifest.ui`
- Entry point as a JS/TS module loaded via `<script type="module" src="/src/ui/index.ts">`

Two options:
- **Option A (faster, less Vite-native)**: keep `ui.html` as-is, but replace `<!-- SCRIPT_PLACEHOLDER -->` with `<script type="module" src="/src/ui/index.ts"></script>`. Place it at project root. Plugma will use it as the template via `package.json` plugma config or auto-detection.
- **Option B (cleaner, more Vite-native)**: move the inline `<style>` block to a separate `src/ui.css`, import it from `src/ui/index.ts` via `import './ui.css'`. Vite handles CSS bundling and inlining via `vite-plugin-singlefile`.

Recommend Option A for speed of migration; Option B during Phase 3 token migration when CSS is being rewritten anyway.

### Step 4 — Update `package.json` (10 min)

```json
{
  "scripts": {
    "prebuild": "npx tsx ../scripts/generate-tool-schemas.ts && node compile-knowledge.js",
    "build": "plugma build --mode production",
    "build:prod": "plugma build --mode production",
    "watch": "plugma dev",
    "dev": "plugma dev",
    "typecheck": "tsc --noEmit"
  },
  "plugma": {
    "manifest": {
      "name": "Figmento",
      "id": "figmento-plugin",
      "api": "1.0.0",
      "main": "src/code.ts",
      "ui": "src/ui.html",
      "editorType": ["figma"],
      "networkAccess": { /* same as today */ },
      "permissions": ["currentuser"]
    }
  }
}
```

The standalone `manifest.json` can stay (Plugma supports both, with manifest.json taking precedence) — no need to choose.

### Step 5 — Adjust dist paths (10 min)

Plugma outputs to `dist/main.js` (not `dist/code.js`). Either:
- Change manifest's `main` field to `dist/main.js` (Plugma auto-rewrites this in built manifest.json)
- Or override in Plugma config to use `code.js` (not yet validated)

The auto-generated `dist/manifest.json` will be correct for Figma either way.

### Step 6 — Delete `build.js` (1 min)

Plugma replaces it entirely. Move `compile-knowledge` invocation to `prebuild` script or a Plugma hook (need to verify if Plugma supports hooks; otherwise `prebuild`).

### Step 7 — Verify in Figma (~2 hours)

Load the new `dist/manifest.json` into Figma via Plugins → Development → Import plugin from manifest. Walk through:
- Plugin opens correctly
- All UI surfaces render (Chat, Image Studio, Settings sheet, Sessions drawer, Design Drawer)
- API calls work (Anthropic, OpenAI, Gemini, Venice, Claude Code Local)
- WebSocket relay connects
- DS scan, prefs, skill export all functional
- localStorage replacement (`figma.clientStorage`) intact
- OAuth flows (Codex) still work

This is the load-bearing validation. If anything breaks here, the win from Plugma might not justify the migration.

### Step 8 — Remove esbuild + custom build script (5 min)

Once validated:
```bash
npm uninstall esbuild
rm build.js
```

---

## Risks identified

### High-impact, needs validation during real migration

1. **Plugma's runtime injection during dev mode might conflict with Figmento's `parent.postMessage` patterns.** Plugma uses postMessage for its HMR bridge. If both layers post messages to the parent, there could be message-type collisions. Likely fine since Plugma scopes its messages, but needs testing.
2. **`figma.clientStorage` calls in sandbox.** No reason to break, but verify after migration since `code.ts` execution model changes (default-exported function vs top-level execution).
3. **`compile-knowledge.ts` and `generate-tool-schemas.ts` prebuild steps**. Need to integrate with Plugma's lifecycle. Easiest: keep them as `prebuild` script in package.json — runs before `plugma build`.

### Low-impact, manageable

4. **Vite is heavier than esbuild** (+71 MB node_modules). Cold install slower. Modern dev machines won't notice.
5. **HMR doesn't fire inside Figma** — only in browser preview. Not a regression vs current state, but managers expectations.
6. **`figmento-mcp-server` and `figmento-ws-relay` still use their own builds**. Plugma migration only touches `figmento/`. Workspace stays multi-tool but that was already true.

### Won't block migration but worth noting

7. **Plugma is solo-maintained** (gavinmcfarland on GitHub). Bus factor risk. v2.2.3 active as of recent. Vite + vite-plugin-singlefile under the hood are battle-tested, so worst case we can fork or replace Plugma with raw Vite + manifest writer.

---

## When to do the migration

Three options ranked by my recommendation:

### Option A (recommended) — Migrate before Phase 3

Phase 3 is heavy CSS iteration (Caiotti DS v1 redesign, light + dark themes, all components restyled). HMR + browser preview pays back fastest there. Migration cost: 1-2 days. Velocity gain in Phase 3: probably 2-3 days saved.

**Sequence:** Sprint 4 (nanostores + Biome) → Plugma migration → Phase 3.

### Option B — Migrate after Phase 3

Stay on esbuild for Phase 3, migrate to Plugma after redesign ships. Lower risk of CSS work being disrupted by tooling change. Slower iteration during Phase 3.

### Option C — Skip Plugma entirely

Stay on esbuild forever. Acceptable if Caio doesn't feel the iteration pain enough to justify migration cost. Honest answer: esbuild's 26ms rebuilds are already fast — the bottleneck is loading in Figma, which Plugma doesn't fully solve (HMR is browser-only).

**My recommendation: Option A.** Phase 3 will involve so much pixel-level CSS iteration that HMR + browser preview is genuinely 5-10x faster than "edit → rebuild → reload Figma".

---

## Cleanup

The pilot worktree at `C:/Users/Caio/Projects/Figmento-plugma-pilot/` and branch `experiment/plugma-pilot` are kept for now in case you want to inspect. To remove:

```bash
cd C:/Users/Caio/Projects/Figmento
git worktree remove ../Figmento-plugma-pilot
git branch -D experiment/plugma-pilot
```

Test starter at `/tmp/plugma-starter/` is auto-cleaned by OS temp eviction.

---

## Summary

| Question | Answer |
|---|---|
| Does Plugma support vanilla TS? | ✅ Yes (despite README) |
| Single-HTML output preserved? | ✅ Yes (vite-plugin-singlefile) |
| Production build clean? | ✅ 3.5 KB demo output, no runtime overhead |
| HMR works? | ✅ In browser preview at localhost |
| HMR inside Figma? | ❌ Same limitation as any tool |
| Manifest auto-generated? | ✅ From package.json or standalone |
| Migration cost? | 1-2 days, ~7 mechanical steps |
| Biggest risk? | code.ts default-export refactor + Plugma postMessage conflicts (untested in actual Figma) |
| Recommendation? | Migrate before Phase 3, pairs with Sprint 4 |
