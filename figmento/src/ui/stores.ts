/**
 * Figmento store layer (nanostores)
 *
 * This file is the canonical surface for plugin state. Anything that needs
 * to be observed across modules lives here as an atom or computed value.
 *
 * Why nanostores:
 *   - 286 bytes, framework-free
 *   - Replaces ad-hoc pub/sub callbacks (e.g. setOnBridgeStateChange)
 *   - Atoms support .get(), .set(), .subscribe(callback)
 *   - Computed values for derived state
 *
 * Usage patterns:
 *
 *   // Read current value (replaces getter functions like getBridgeConnected())
 *   const connected = $bridgeConnected.get();
 *
 *   // Subscribe to changes (replaces setOnBridgeStateChange callback)
 *   $bridgeConnected.subscribe((connected) => {
 *     console.log('bridge state:', connected);
 *   });
 *
 *   // Update value (replaces direct property mutation like state.cache = x)
 *   $bridgeConnected.set(true);
 *
 * Naming: store atoms are prefixed with `$` to distinguish from regular vars.
 *
 * Migration log:
 *   - 2026-04-29: Added bridge state atoms (replaces module-level vars in bridge.ts)
 *   - 2026-04-29: Added DS state atoms (replaces designSystemState + dsToggleState in state.ts)
 *
 * Future migrations (in order of impact):
 *   - chatSettings (chat.ts) — currently uses getChatSettings()/updateChatSettings() pattern
 *   - apiState (state.ts) — provider, validated keys, models
 *   - imageGenState, modeState, designSettings, screenshotState, cropState (state.ts)
 *   - statusTabState — already removed in Sprint 1, no migration needed
 */

import { atom, computed } from 'nanostores';
import type { DesignSystemCache } from '../types';

// ═══════════════════════════════════════════════════════════════
// BRIDGE STATE
// ═══════════════════════════════════════════════════════════════
// Replaces module-level vars + getter functions in bridge.ts.
// Subscribers (e.g. status dot updates) now listen directly to atoms.

/** Whether the WebSocket bridge is currently connected to the relay. */
export const $bridgeConnected = atom<boolean>(false);

/** Active relay channel ID (e.g. 'figmento-local') or null when disconnected. */
export const $bridgeChannelId = atom<string | null>(null);

/** Number of MCP commands handled this session. */
export const $bridgeCommandCount = atom<number>(0);

/** Number of bridge errors this session. */
export const $bridgeErrorCount = atom<number>(0);

/** Relay connection lifecycle state. Drives the header status dot color. */
export const $relayState = atom<'disconnected' | 'connecting' | 'connected' | 'fallback' | 'error'>('disconnected');

// ═══════════════════════════════════════════════════════════════
// DESIGN SYSTEM STATE
// ═══════════════════════════════════════════════════════════════
// Replaces designSystemState and dsToggleState from state.ts.

/** Cached design system from the last scan, or null if no scan has run. */
export const $dsCache = atom<DesignSystemCache | null>(null);

/** True while a DS scan is in progress (drives Scan button busy state). */
export const $dsScanning = atom<boolean>(false);

/** User toggle for "Use My Design System" — defaults ON, but UI hides until cache exists. */
export const $dsToggleEnabled = atom<boolean>(true);

/**
 * Computed: the effective DS cache that should be passed to AI prompts.
 * Returns the cache only when both (1) a scan has produced a cache AND
 * (2) the user has the toggle enabled. Otherwise null.
 *
 * Use this in buildSystemPrompt() and matchComponent() call sites instead
 * of reading $dsCache + $dsToggleEnabled separately.
 */
export const $effectiveDsCache = computed([$dsCache, $dsToggleEnabled], (cache, enabled) => {
  if (!enabled || !cache) return null;
  const hasContent =
    cache.components.length > 0 ||
    cache.variables.length > 0 ||
    (cache.paintStyles as unknown[]).length +
      (cache.textStyles as unknown[]).length +
      (cache.effectStyles as unknown[]).length >
      0;
  return hasContent ? cache : null;
});

/**
 * Computed: true when the user wants DS awareness AND a meaningful scan exists.
 * Use this for gating UI affordances (e.g. the DS toggle row visibility).
 */
export const $dsToggleActive = computed($effectiveDsCache, (cache) => cache !== null);
