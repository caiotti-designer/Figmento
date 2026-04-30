# nanostores Migration — Changelog

**Branch:** `redesign/caiotti-ds-v1`
**Date:** 2026-04-29
**Status:** ✅ Complete — typecheck clean, lint 0 errors, production build successful
**Time:** ~45 minutes

---

## TL;DR

Introduced **nanostores 1.3.0** (~286 bytes runtime) as the canonical reactive state layer. Created `src/ui/stores.ts` with atoms for bridge state and design system state. Migrated `bridge.ts` end-to-end: removed all module-level state vars, replaced ad-hoc callback API (`setOnBridgeStateChange`) with atom subscriptions, refactored the header status dot's `notifyRelayStatus()` function into a one-time `$relayState.subscribe()` call.

Used compatibility shims in `state.ts` for `designSystemState` and `dsToggleState` so consumers (chat.ts, index.ts, command-queue.ts, skill-export.ts) keep working without changes — they read/write `designSystemState.cache` syntax but the values flow through `$dsCache` atom internally.

```
Sprint 4.2:  +148 / -88 (net +60 — atoms add a small layer)
Build:       ✅ dist/ui.html 543 KB (was 541 KB; +2 KB from nanostores runtime)
Typecheck:   ✅ clean
Lint:        ✅ 0 errors
```

---

## What changed

### 1. New file: `src/ui/stores.ts`

The canonical reactive state surface. Contains:

**Bridge atoms (replace module vars in bridge.ts):**
- `$bridgeConnected: atom<boolean>` — replaces `let isBridgeConnected`
- `$bridgeChannelId: atom<string | null>` — replaces `let bridgeChannelId`
- `$bridgeCommandCount: atom<number>` — replaces `let bridgeCommandCount`
- `$bridgeErrorCount: atom<number>` — replaces `let bridgeErrorCount`
- `$relayState: atom<'disconnected'|'connecting'|'connected'|'fallback'|'error'>` — drives header status dot

**Design system atoms (replace state.ts objects):**
- `$dsCache: atom<DesignSystemCache | null>` — replaces `designSystemState.cache`
- `$dsScanning: atom<boolean>` — replaces `designSystemState.isScanning`
- `$dsToggleEnabled: atom<boolean>` — replaces `dsToggleState.enabled`

**Computed values (derived state):**
- `$effectiveDsCache: computed([$dsCache, $dsToggleEnabled], ...)` — returns the cache only when toggle is enabled AND the cache has meaningful content
- `$dsToggleActive: computed($effectiveDsCache, ...)` — boolean for gating UI affordances

The file documents usage patterns and migration log so future contributions follow the same shape.

### 2. `bridge.ts` — full atom migration

**Removed:**
- 4 `let` module vars (`isBridgeConnected`, `bridgeChannelId`, `bridgeCommandCount`, `bridgeErrorCount`)
- `onBridgeStateChange` callback variable + `setOnBridgeStateChange` exported API
- `notifyStateChange()` internal function (callback dispatch)
- `notifyRelayStatus(state)` function — replaced with `$relayState.subscribe()` at module load

**Result:**
- All state mutations go through `$atom.set()` / `$atom.get()`
- Header status dot updates automatically when `$relayState` changes (was: explicit `notifyRelayStatus(...)` call at every state transition; 9 call sites collapsed into one subscription at module load)
- External consumers can subscribe to atoms directly. The 4 backward-compat getter functions (`getBridgeConnected()`, etc.) are preserved as thin wrappers around `$atom.get()` so chat.ts and image-studio.ts don't need changes.

**Pattern demonstrated:**
```ts
// Before — push-based, requires every caller to know about the dependency
function notifyRelayStatus(state: string) {
  // ... DOM updates
}
// 9 call sites: notifyRelayStatus('connecting'), notifyRelayStatus('connected'), etc.

// After — subscription, single source of DOM update logic
$relayState.subscribe((state) => {
  // ... DOM updates (same logic, runs whenever atom changes)
});
// Call sites just set the state: $relayState.set('connecting')
```

This is the canonical nanostores win — replacing scattered "remember to call X when Y changes" patterns with a single declarative subscription.

### 3. `state.ts` — compatibility shims

`designSystemState` and `dsToggleState` are now property-getter/setter proxies over the atoms:

```ts
export const designSystemState = {
  get cache() { return $dsCache.get(); },
  set cache(v) { $dsCache.set(v); },
  get isScanning() { return $dsScanning.get(); },
  set isScanning(v) { $dsScanning.set(v); },
};
```

Existing consumers (`designSystemState.cache = newCache`) keep working unchanged. They can migrate to `$dsCache.set(newCache)` incrementally during Phase 3 or later.

`isDesignSystemToggleOn()` and `getEffectiveDsCache()` now delegate to `$effectiveDsCache.get()` (the computed) instead of the original duplicated logic. Single source of truth.

---

## What was preserved (intentional debt)

- **`getBridgeConnected()`, `getBridgeChannelId()`, `getBridgeCommandCount()`, `getBridgeErrorCount()`** — 4 backward-compat getter functions. Used by chat.ts (3 call sites for `getBridgeConnected`, 3 for `getBridgeChannelId`) and image-studio.ts (2 call sites). Keeping the function API means those files don't need changes. Migration path: `getBridgeConnected()` → `$bridgeConnected.get()` (or subscribe for reactivity).
- **`designSystemState.*` / `dsToggleState.*`** property syntax — supported via the proxy shim in state.ts. Consumers migrate when convenient.
- **`isDesignSystemToggleOn()` / `getEffectiveDsCache()`** — wrappers around `$effectiveDsCache.get()`. Same external API, but internally use the computed.

These shims make the migration **non-breaking**. ~10 consumer call sites would otherwise need updates. Keeping them stable lets us defer to Phase 3 when state changes drive UI rerenders for theming.

---

## Verification

- `npm run typecheck` → ✅ clean
- `npm run lint` → ✅ 0 errors (29 warnings, 9 infos — same as Sprint 4.1, all minor style suggestions)
- `npm run build` → ✅ success, `dist/ui.html` 543.72 KB (+2 KB vs Sprint 4.1 — the nanostores runtime cost)
- Manual UI verification: pending Caio reloads in Figma

---

## Risks and what to watch for

### Module-load timing of `$relayState.subscribe()`

The subscription is set up at `bridge.ts` module load. nanostores fires the callback synchronously with the current value when `subscribe` is called (initial state: `'disconnected'`). At that moment, the DOM may not be ready yet — but the subscriber checks `if (!dot) return` and bails gracefully. Subsequent atom changes happen after DOM is ready, so the dot updates correctly.

**If Caio sees the status dot stuck at "off" after reloading**: the subscription fired at the wrong time. Fix: re-trigger by calling `$relayState.set($relayState.get())` once after `initBridge()` runs, or move the subscription into `initBridge()`.

### Compatibility shim performance

Property getters/setters on `designSystemState` and `dsToggleState` add a tiny overhead vs. plain property access. nanostores `.get()` is O(1) and has no allocations. Negligible for our use cases (DS scan is once-per-session, toggle is once-per-click).

### Dual writes during transition

Currently the bridge has **only atoms** as state (no parallel module vars). The DS state has **only atoms** + property shims. No dual-write hazard.

---

## Migration roadmap (deferred to future sessions)

These are still on the legacy state-shape pattern but don't need atoms today:
- `chatSettings` (chat.ts) — uses `getChatSettings()/updateChatSettings()` already, ~half-migrated
- `apiState` (state.ts) — provider, validated keys, models
- `imageGenState`, `modeState`, `designSettings`, `screenshotState`, `cropState` (state.ts)

When Phase 3 introduces theme-reactive UI updates and "Use My Design System" gating drives multiple surfaces, these will benefit from atom subscriptions. Until then, plain mutable objects work fine.

---

## Files touched

```
A  figmento/src/ui/stores.ts          # new — canonical store surface
M  figmento/src/ui/bridge.ts          # full atom migration
M  figmento/src/ui/state.ts           # DS shims
M  figmento/package.json              # added nanostores dep
M  figmento/package-lock.json
```

---

## Recommendation for Caio

**Reload the plugin in Figma** (`figmento/dist/manifest.json`) and verify:

1. Status dot still reflects relay state (should turn green when relay connects)
2. Settings → Design System → Scan still works
3. After scan, the "Use My Design System" toggle appears and toggles correctly
4. Chat send → relay-routed Claude Code message still works
5. Bridge counts increment in Settings → Advanced → MCP Bridge

If everything works, you're cleared for **Phase 3 — Caiotti DS v1 redesign**. The reactive foundation is now in place to support theme switching and dynamic UI updates without manual DOM-update plumbing.
