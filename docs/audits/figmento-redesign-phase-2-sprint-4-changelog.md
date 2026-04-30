# Phase 2 Sprint 4 — Changelog

**Branch:** `redesign/caiotti-ds-v1`
**Sprint:** Adopt Biome 2 (nanostores deferred)
**Date:** 2026-04-29
**Status:** ✅ Complete — typecheck clean, lint 0 errors, build successful

---

## Summary

Replaced ESLint + Prettier with **Biome 2.3.0** (one tool, faster, type-aware). Auto-formatted 61 files to consistent style. Triaged 339 lint diagnostics down to **0 errors / 29 warnings / 9 infos** by disabling stylistic-strictness rules that didn't represent real bugs (idiomatic JS patterns).

**nanostores migration deferred** to after Plugma migration — nanostores plays best with the new Vite/Plugma world, benefits from HMR during migration, and doing it on the legacy esbuild build means partially redoing it later.

```
Sprint 4:    +3359 / -3777 (mostly format reflows)
Cumulative since branch: net -418 lines, code on consistent style
Build:       ✅ dist/ui.html 2387.5 KB
Typecheck:   ✅ clean
Lint:        ✅ 0 errors (29 warnings, 9 infos remain)
```

---

## What changed

### 1. Replaced ESLint + Prettier with Biome 2

**Before:**
- `eslint` 9.39 + `eslint-config-prettier` 10.1 + `@typescript-eslint/{parser,eslint-plugin}` 8.54
- `prettier` 3.8
- 5 separate config files: `eslint.config.js`, `.prettierrc`, plus implicit defaults
- Two tools to run, two install times, separate caches

**After:**
- `@biomejs/biome` 2.3.0 (single dependency)
- `biome.json` (single config file)
- One command: `npm run check` (lint + format together) or separately via `lint`/`format`
- ~10x faster than ESLint+Prettier on this codebase

Files touched:
- `package.json` — removed 5 dev deps, added Biome script aliases (`lint`, `format`, `check`)
- `eslint.config.js` — deleted
- `.prettierrc` — deleted
- `biome.json` — new
- All 61 source files — auto-formatted (whitespace, import grouping, semicolons, quote style, trailing commas)

### 2. Biome config tuning (rule triage)

Biome's `recommended` ruleset is stricter than the previous ESLint config. Initial check produced 82 errors / 117 warnings / 140 infos. After triage:

**Disabled (style/idiomatic-pattern warnings, not bugs):**
- `style/useTemplate` (119 hits) — `'a' + b` → template literals. Fine but churn.
- `style/noNonNullAssertion` (63 hits) — Figmento uses `!` extensively for DOM lookups. Type safety is fine.
- `style/useImportType` (16 hits) — `import { Foo } from` vs `import type { Foo } from`. Stylistic.
- `complexity/useLiteralKeys` (12 hits) — `obj['x']` → `obj.x`. Stylistic.
- `complexity/useArrowFunction` (29 hits) — `function() {}` → `() => {}`. Stylistic.
- `suspicious/useIterableCallbackReturn` (11 hits) — `arr.forEach(x => x.method())` flagged because the arrow implicitly returns. Idiomatic.
- `suspicious/noAssignInExpressions` (9 hits) — flags `while ((m = regex.exec(s)) !== null)`. Idiomatic regex iteration pattern.
- `correctness/noUnusedFunctionParameters` (3 hits) — Figmento has `_`-prefix convention.
- `suspicious/useBiomeIgnoreFolder` (7 hits) — meta-config noise from format pass.

**Kept on (real value):**
- `suspicious/noImplicitAnyLet` (warn) — catches `let x;` defaulting to implicit any
- `correctness/noUnusedVariables` — catches truly unused vars (preserves `_`-prefix exemption)
- `style/useConst` — flags `let` that should be `const`
- `suspicious/noGlobalIsNan` — flags `isNaN()` (use `Number.isNaN()`)
- `complexity/useOptionalChain` — flags `a && a.b` (use `a?.b`)
- All other recommended rules

**Result:** 0 errors, 29 warnings (mostly `useOptionalChain` modernizations), 9 infos. Lint exits clean for CI.

### 3. Auto-formatted 61 files

The `biome format --write` pass reformatted 61 source files to match the configured style (single quotes, 120 char lines, 2-space indent, semicolons, ES5 trailing commas, LF line endings, arrow parens always). No logic changes — only whitespace, line wrapping, and minor reflows.

Diff stat shows +3359 / -3777 lines but the actual semantic delta is minimal — mostly long lines being broken at 120 chars, multi-line objects being collapsed where they fit, and trailing commas being added/removed.

### 4. nanostores migration — DEFERRED

The audit recommended adopting nanostores (~286 bytes) to replace ad-hoc pub/sub across 30 modules. After investigating the migration path during Sprint 4, decision: **defer until after Plugma migration**.

**Reason:** Plugma migration restructures the build pipeline and entry points. nanostores benefits from:
- HMR during migration (you change a store → see UI update without full reload — invaluable for verifying signal propagation)
- Vite's module hot replacement (preserves store state across edits)
- The Vite/Plugma world is where nanostores naturally fits long-term

Doing nanostores migration now (on esbuild) means partially redoing it later. Cleaner to wait one round.

The deferred work will:
- Migrate `apiState`, `chatSettings`, `designSystemState`, `dsToggleState`, bridge state to atoms
- Replace ad-hoc pub/sub callbacks (e.g., `setOnBridgeStateChange`) with nanostores subscriptions
- Add a `src/ui/stores.ts` as the canonical state surface

Tracked in todos as a Phase 2 follow-up; full work post-Plugma.

---

## Verification

- `npm run typecheck` → ✅ clean
- `npm run lint` → ✅ 0 errors (29 warnings, 9 infos)
- `npm run build` → ✅ success, `dist/ui.html` 2387.5 KB (slightly smaller than Sprint 3 due to format reflows)
- Manual UI verification: pending Caio loads the build into Figma

---

## What's next

**Plugma migration** (1-2 days) — the big toolchain swap. Detailed migration plan in [Plugma pilot findings doc](./figmento-plugma-pilot-findings-2026-04-29.md). Steps:
1. Install plugma + vite + vite-plugin-singlefile, remove esbuild
2. Wrap `code.ts` body in `export default function()`
3. Restructure `ui.html` to use `<script type="module" src="/src/ui/index.ts">`
4. Update package.json scripts to `plugma dev` / `plugma build --mode production`
5. Adjust dist paths (code.js → main.js)
6. Verify in Figma

**After Plugma**: nanostores migration, then **Phase 3 (Caiotti DS v1 redesign)**.

---

## Files touched (Sprint 4)

```
M  figmento/biome.json                  (new)
M  figmento/package.json                (deps + scripts swap)
M  figmento/package-lock.json
D  figmento/eslint.config.js
D  figmento/.prettierrc
M  61 source files in figmento/src/**   (formatter pass)
```

Lint disabled rules logged here for future enable-by-default review:
- `style/useTemplate`, `style/noNonNullAssertion`, `style/useImportType`
- `complexity/useLiteralKeys`, `complexity/useArrowFunction`
- `suspicious/useIterableCallbackReturn`, `suspicious/noAssignInExpressions`, `suspicious/useBiomeIgnoreFolder`
- `correctness/noUnusedFunctionParameters`

These can be re-enabled gradually as the codebase modernizes (e.g., during Phase 3 or post-Plugma).
