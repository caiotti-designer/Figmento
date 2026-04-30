# Plugma Migration — Changelog

**Branch:** `redesign/caiotti-ds-v1`
**Date:** 2026-04-29
**Status:** ✅ Complete — typecheck clean, lint 0 errors, production build successful, dev server boots
**Time:** ~1 hour (well under the 1-2 day estimate)

---

## TL;DR

Replaced custom esbuild build pipeline with **Plugma 2.2.3 (Vite 7 + vite-plugin-singlefile)**. Production build output is **~4.4x smaller** (2.39 MB → 529 KB) thanks to Vite's tree-shaking. HMR + browser preview now available at `http://localhost:3231` for fast iteration on Phase 3 redesign.

```
Build output:    dist/ui.html 529 KB (was 2387 KB) — 78% reduction
                 dist/main.js 152 KB (was 1.1 MB)  — 86% reduction
                 dist/manifest.json (auto-generated)
Typecheck:       ✅ clean
Lint:            ✅ 0 errors
Production:      ✅ npm run build
Dev server:      ✅ npm run dev → localhost:3231 with HMR
```

---

## What changed

### 1. Dependencies swapped

**Removed:**
- `esbuild@^0.20.0`

**Added:**
- `plugma@^2.2.3`
- `vite@^7.3.2`
- `vite-plugin-singlefile@^2.3.3`

### 2. `code.ts` — wrapped in default-exported function

**Before:** top-level imperative code (`figma.showUI(...)`, `loadSavedApiKeys()`, `figma.ui.onmessage = ...`, `figma.on(...)`).

**After:** all imperative code wrapped in `export default function () { ... }`. Plugma generates a shim that imports + calls this function. Kept `sanitizeForClone` helper at module scope (it's a pure helper, doesn't need to be inside the entry function).

Files touched: `figmento/src/code.ts`

### 3. `ui.html` restructured for Vite

**Before:** `figmento/src/ui.html` (5300 lines), bundled via esbuild's `<!-- SCRIPT_PLACEHOLDER -->` injection.

**After:** moved to `figmento/index.html` (Vite convention — looks for index.html at project root). Replaced `<!-- SCRIPT_PLACEHOLDER -->` with `<script type="module" src="/src/ui/index.ts"></script>`. Vite's plugin handles bundling + inlining via `vite-plugin-singlefile`.

Files touched:
- `figmento/index.html` (new, copied from old src/ui.html)
- `figmento/src/ui.html` (deleted)

### 4. `package.json` reorganized

```json
{
  "main": "dist/main.js",  // was dist/code.js
  "scripts": {
    "prebuild": "npx tsx ../scripts/generate-tool-schemas.ts && npx tsx scripts/compile-knowledge.ts",
    "build": "plugma build --mode production",  // was "node build.js"
    "build:prod": "plugma build --mode production",
    "watch": "plugma dev",  // was "node build.js --watch"
    "dev": "plugma dev"
  },
  "plugma": {
    "manifest": {
      "main": "src/code.ts",      // SOURCE path, Plugma compiles to dist/main.js
      "ui": "src/ui/index.ts",    // SOURCE path, referenced by index.html script tag
      // ... rest of manifest preserved (networkAccess, permissions, etc.)
    }
  }
}
```

The `prebuild` script chains `generate-tool-schemas` and `compile-knowledge` (both previously baked into `build.js`). Plugma runs this hook automatically before `plugma build`.

### 5. Root `manifest.json` deleted

Plugma generates `dist/manifest.json` on every build, with paths rewritten to point to compiled files (`main: "main.js"`, `ui: "ui.html"` — both relative to `dist/`).

The old root `figmento/manifest.json` was a duplicate source-of-truth pointing to compiled paths (`dist/code.js`, `dist/ui.html`) — only valid AFTER an esbuild build. Plugma's auto-generated `dist/manifest.json` replaces it.

**⚠️ ACTION FOR CAIO:** When loading the plugin in Figma:
- **Old import path:** `figmento/manifest.json` (no longer exists)
- **New import path:** `figmento/dist/manifest.json` (auto-generated)
- Just re-import: Figma → Plugins → Development → Import plugin from manifest → select `figmento/dist/manifest.json`

### 6. `build.js` deleted

The 117-line custom esbuild orchestration script is gone. Plugma replaces it entirely.

---

## What got simpler

- **Build script:** 117 lines (build.js) → 0 lines (Plugma handles everything)
- **Bundle size:** -78% UI, -86% sandbox (Vite tree-shaking)
- **Dev iteration:** edit → save → browser preview updates via HMR (was: edit → save → wait 26ms rebuild → reload Figma plugin manually). Note: HMR works in browser preview only; Figma still needs manual reload after `plugma build`.
- **Manifest maintenance:** dual manifest (root + intent for Figma) → single source-of-truth in `package.json#plugma.manifest`
- **Configuration files:** -1 file (build.js gone)

---

## What still needs to happen

### Critical: Caio verifies in Figma

**This is the load-bearing step.** Build artifacts and typecheck pass, but the actual integration in Figma's iframe sandbox is the only true validation.

**Steps:**
1. Open Figma desktop app
2. Plugins → Development → Import plugin from manifest
3. Select `C:\Users\Caio\Projects\Figmento\figmento\dist\manifest.json` (NOT the old root path)
4. Run plugin, walk through:
   - Plugin opens at 450×820
   - Chat tab loads, can send a message
   - Image Studio tab loads
   - Settings sheet opens (gear icon in header)
   - Theme toggle in Settings → Appearance works
   - Status dot in header reflects relay state (green/red/grey)
   - Claude Code Local connects via relay
   - DS scan still works
   - OAuth (Codex) flow still works

**Likely issues to watch for:**
- **postMessage conflicts:** Plugma's runtime uses `parent.postMessage` for HMR/dev bridge. In production mode the runtime is stripped, but Figmento also uses `parent.postMessage` heavily. If anything breaks message handling, this is the suspect.
- **`__html__` injection:** Plugma should set this up so `figma.showUI(__html__)` works. If Figma plugin opens blank, this is the suspect.
- **clientStorage migration:** Should be unaffected (sandbox API), but verify settings persist after reload.

### After Caio confirms

1. Clean up old uncommitted artifacts (the deleted `figmento/manifest.json`, the old worktree at `../Figmento-plugma-pilot/`)
2. **nanostores migration** — replace ad-hoc pub/sub state with atoms in 30 modules
3. **Phase 3** — Caiotti DS v1 visual redesign with HMR-driven iteration

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Plugma postMessage conflict with Figmento sandbox messages | Low | Plugma scopes its messages with type prefixes; production builds strip the runtime |
| `__html__` injection issue | Low | Standard pattern, Plugma test verified |
| Figma can't load `dist/manifest.json` | Very low | Manifest output is valid Figma plugin format, identical to esbuild's output structure |
| HMR doesn't work | Low | Validated in pilot starter and dev server boot here |
| Bundle size regression in some flow | Possible | Verify by walking through all features after Figma load |

If anything breaks, rollback path:
```bash
git stash    # save uncommitted state
# Restore from a known-good commit OR
# Re-checkout previous build pipeline from history
```

---

## Files touched (Plugma migration)

```
M  figmento/package.json              # scripts + plugma config + main path
D  figmento/manifest.json             # Plugma auto-generates dist/manifest.json
M  figmento/src/code.ts               # default-exported function
A  figmento/index.html                # new, was src/ui.html
D  figmento/src/ui.html               # moved to root
D  figmento/build.js                  # replaced by Plugma
M  figmento/package-lock.json
```

---

## Sprint scoreboard (Phase 2 + tooling complete)

| Sprint/Step | Status | Output |
|---|---|---|
| Sprint 1 — Kill the noise | ✅ | -853 lines dead code |
| Sprint 2 — Consolidate entry points | ✅ | Theme → Settings, designDrawerBtn icon, chat-learn UX |
| Sprint 3 — Fix first-run UX | ✅ | Welcome density, prompt contrast, DS toggle gating |
| Sprint 4 — Biome 2 | ✅ | ESLint+Prettier → Biome (10x faster) |
| Plugma pilot | ✅ | GO verdict |
| **Plugma migration** | ✅ | -78% UI, -86% sandbox, HMR enabled |
| nanostores migration | ⏳ | Next, gated on Figma verify |
| **Phase 3 — Caiotti DS v1** | ⏳ | After nanostores |

---

## Quick command reference

```bash
# Build for Figma load
npm run build       # production, single-HTML, no Plugma runtime

# Dev with HMR + browser preview
npm run dev         # localhost:3231

# Quality
npm run typecheck   # tsc --noEmit
npm run lint        # biome lint
npm run format      # biome format --write
npm run check       # biome check (lint + format together)
```
