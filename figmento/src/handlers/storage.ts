/// <reference types="@figma/plugin-typings" />

import { serializeFrame } from '../snapshot-serializer';
import { calculateDiff } from '../diff-calculator';
import { aggregateCorrections } from '../correction-aggregator';
import { findRootFrame } from '../utils/node-utils';
import type { PluginMessage, LearnedPreference, LearningConfig } from '../types';

// ── Storage keys ──────────────────────────────────────────────────────────────
export const SNAPSHOTS_STORAGE_KEY = 'figmento-snapshots';
const SNAPSHOT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SNAPSHOTS = 10;
const SNAPSHOT_DEBOUNCE_MS = 5000; // 5-second debounce per frame
const CORRECTIONS_STORAGE_KEY = 'figmento-corrections';
export const PREFERENCES_STORAGE_KEY = 'figmento-preferences';
const MAX_PREFERENCES = 50;
const LEARNING_CONFIG_STORAGE_KEY = 'figmento-learning-config';
const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  enabled: true,
  autoDetect: false,
  confidenceThreshold: 3,
};

// Commands that modify the canvas and should trigger an auto-snapshot
export const SNAPSHOT_WORTHY_COMMANDS = new Set([
  'create_frame', 'create_text', 'create_rectangle', 'create_ellipse',
  'create_image', 'create_icon', 'set_fill', 'set_text', 'set_auto_layout',
  'resize_node', 'set_effects', 'set_stroke', 'set_corner_radius', 'move_node',
  'batch_execute',
]);

// Debounce tracker: frameId → last snapshot timestamp
const snapshotDebounce = new Map<string, number>();

// ── Auto-Snapshot Helper ──────────────────────────────────────────────────────

/**
 * Fire-and-forget snapshot after a canvas command succeeds.
 * Does NOT await this — caller uses .catch(() => {}) to suppress rejections.
 */
export async function autoSnapshotAfterCommand(
  action: string,
  params: Record<string, unknown>,
  resultData: Record<string, unknown>
): Promise<void> {
  const now = Date.now();
  const frameIds = new Set<string>();

  if (action === 'batch_execute') {
    // Extract nodeIds from batch results
    const results = (resultData.results as Array<Record<string, unknown>>) || [];
    for (const r of results) {
      const nid = (r.nodeId ?? r.id) as string | undefined;
      if (nid) {
        const frame = findRootFrame(nid);
        if (frame) frameIds.add(frame.id);
      }
    }
  } else {
    // Extract nodeId from resultData or params
    const nid = (resultData.nodeId ?? resultData.id ?? params.nodeId ?? params.parentId) as string | undefined;
    if (nid) {
      const frame = findRootFrame(nid);
      if (frame) frameIds.add(frame.id);
    }
  }

  for (const frameId of frameIds) {
    // Debounce: skip if snapshotted within the last 5s
    const lastSnapshot = snapshotDebounce.get(frameId) ?? 0;
    if (now - lastSnapshot < SNAPSHOT_DEBOUNCE_MS) continue;
    snapshotDebounce.set(frameId, now);

    const frame = figma.getNodeById(frameId) as FrameNode | null;
    if (!frame || frame.type !== 'FRAME') continue;

    const snapshot = serializeFrame(frame);
    const store: Record<string, { snapshot: unknown[]; timestamp: number }> =
      (await figma.clientStorage.getAsync(SNAPSHOTS_STORAGE_KEY)) || {};

    // Prune expired
    for (const key of Object.keys(store)) {
      if (now - store[key].timestamp > SNAPSHOT_TTL_MS) delete store[key];
    }

    // FIFO eviction
    const keys = Object.keys(store);
    if (keys.length >= MAX_SNAPSHOTS) {
      const oldest = keys.reduce((a, b) => store[a].timestamp < store[b].timestamp ? a : b);
      delete store[oldest];
    }

    store[frameId] = { snapshot, timestamp: now };
    await figma.clientStorage.setAsync(SNAPSHOTS_STORAGE_KEY, store);
  }
}

// ── Message Handler ───────────────────────────────────────────────────────────

/**
 * Handles all storage-related messages (snapshots, corrections, preferences, learning config).
 * Returns `true` if the message was handled, `false` otherwise.
 */
export async function handleStorageMessage(msg: PluginMessage): Promise<boolean> {
  switch ((msg as any).type) {

    case 'take-snapshot': {
      try {
        const frameId = (msg as any).frameId as string;
        const frame = figma.getNodeById(frameId);

        if (!frame || (frame.type !== 'FRAME' && frame.type !== 'COMPONENT')) {
          figma.ui.postMessage({ type: 'snapshot-taken', frameId, nodeCount: 0, success: false, error: 'Frame not found' });
          return true;
        }

        const snapshot = serializeFrame(frame as FrameNode);
        const now = Date.now();

        // Load existing snapshots
        const store: Record<string, { snapshot: unknown[]; timestamp: number }> =
          (await figma.clientStorage.getAsync(SNAPSHOTS_STORAGE_KEY)) || {};

        // Prune expired entries
        for (const key of Object.keys(store)) {
          if (now - store[key].timestamp > SNAPSHOT_TTL_MS) delete store[key];
        }

        // FIFO eviction if at capacity
        const keys = Object.keys(store);
        if (keys.length >= MAX_SNAPSHOTS) {
          const oldest = keys.reduce((a, b) => store[a].timestamp < store[b].timestamp ? a : b);
          delete store[oldest];
        }

        // Store new snapshot
        store[frameId] = { snapshot, timestamp: now };
        await figma.clientStorage.setAsync(SNAPSHOTS_STORAGE_KEY, store);

        figma.ui.postMessage({ type: 'snapshot-taken', frameId, nodeCount: snapshot.length, success: true });
      } catch (e) {
        figma.ui.postMessage({ type: 'snapshot-taken', frameId: (msg as any).frameId, nodeCount: 0, success: false, error: String(e) });
      }
      return true;
    }

    case 'get-snapshot-status': {
      try {
        const store: Record<string, { snapshot: Array<{ id: string; name: string }>; timestamp: number }> =
          (await figma.clientStorage.getAsync(SNAPSHOTS_STORAGE_KEY)) || {};
        const now = Date.now();

        // Prune expired
        let pruned = false;
        for (const key of Object.keys(store)) {
          if (now - store[key].timestamp > SNAPSHOT_TTL_MS) {
            delete store[key];
            pruned = true;
          }
        }
        if (pruned) await figma.clientStorage.setAsync(SNAPSHOTS_STORAGE_KEY, store);

        const frames = Object.entries(store).map(([frameId, entry]) => ({
          frameId,
          frameName: entry.snapshot[0]?.name ?? frameId,
          nodeCount: entry.snapshot.length,
          age: now - entry.timestamp,
        }));

        figma.ui.postMessage({ type: 'snapshot-status', frames });
      } catch (e) {
        figma.ui.postMessage({ type: 'snapshot-status', frames: [] });
      }
      return true;
    }

    case 'compare-snapshot': {
      try {
        const targetFrameId = (msg as any).frameId as string | undefined;
        const store: Record<string, { snapshot: unknown[]; timestamp: number }> =
          (await figma.clientStorage.getAsync(SNAPSHOTS_STORAGE_KEY)) || {};
        const now = Date.now();

        // Prune expired
        for (const key of Object.keys(store)) {
          if (now - store[key].timestamp > SNAPSHOT_TTL_MS) delete store[key];
        }

        // Determine which frames to compare
        const frameIds = targetFrameId
          ? [targetFrameId]
          : Object.keys(store);

        if (frameIds.length === 0 || (targetFrameId && !store[targetFrameId])) {
          figma.ui.postMessage({
            type: 'snapshot-compared',
            corrections: [],
            noSnapshot: true,
            frameId: targetFrameId,
            source: (msg as any).source || 'explicit',
          });
          return true;
        }

        let allCorrections: unknown[] = [];
        let comparedFrameId = targetFrameId;
        let comparedFrameName = '';
        let snapshotAge = 0;
        let nodeCount = 0;

        for (const fid of frameIds) {
          const entry = store[fid];
          if (!entry) continue;

          const frame = figma.getNodeById(fid);
          if (!frame || frame.type !== 'FRAME') {
            if (targetFrameId === fid) {
              figma.ui.postMessage({
                type: 'snapshot-compared',
                corrections: [],
                error: 'Frame not found',
                frameId: fid,
              });
              return true;
            }
            continue;
          }

          const currentSnapshot = serializeFrame(frame as FrameNode);
          const corrections = calculateDiff(
            entry.snapshot as Parameters<typeof calculateDiff>[0],
            currentSnapshot
          );

          allCorrections = allCorrections.concat(corrections);
          comparedFrameId = fid;
          comparedFrameName = (frame as FrameNode).name;
          snapshotAge = now - entry.timestamp;
          nodeCount = currentSnapshot.length;
        }

        figma.ui.postMessage({
          type: 'snapshot-compared',
          corrections: allCorrections,
          frameId: comparedFrameId,
          frameName: comparedFrameName,
          snapshotAge,
          nodeCount,
          source: (msg as any).source || 'explicit',
        });
      } catch (e) {
        figma.ui.postMessage({
          type: 'snapshot-compared',
          corrections: [],
          error: String(e),
          frameId: (msg as any).frameId,
          source: (msg as any).source || 'explicit',
        });
      }
      return true;
    }

    case 'save-corrections': {
      try {
        const incoming = (msg as any).corrections as Array<Record<string, unknown>>;
        const newEntries = incoming.map(c => ({ ...c, confirmed: true }));

        // Append to corrections store
        const existing: unknown[] = (await figma.clientStorage.getAsync(CORRECTIONS_STORAGE_KEY)) || [];
        const combined = [...existing, ...newEntries];
        // FIFO eviction if >200
        if (combined.length > 200) combined.splice(0, combined.length - 200);
        await figma.clientStorage.setAsync(CORRECTIONS_STORAGE_KEY, combined);

        // Delete consumed snapshots
        const store: Record<string, unknown> =
          (await figma.clientStorage.getAsync(SNAPSHOTS_STORAGE_KEY)) || {};
        for (const entry of newEntries) {
          if (entry.frameId) delete store[entry.frameId as string];
        }
        await figma.clientStorage.setAsync(SNAPSHOTS_STORAGE_KEY, store);

        figma.ui.postMessage({
          type: 'corrections-saved',
          count: newEntries.length,
          totalStored: combined.length,
        });
      } catch (e) {
        figma.ui.postMessage({ type: 'corrections-saved', count: 0, error: String(e) });
      }
      return true;
    }

    case 'aggregate-preferences': {
      try {
        const rawCorrections = await figma.clientStorage.getAsync(CORRECTIONS_STORAGE_KEY) || [];
        const existing: LearnedPreference[] = await figma.clientStorage.getAsync(PREFERENCES_STORAGE_KEY) || [];
        const updated = aggregateCorrections(rawCorrections as Parameters<typeof aggregateCorrections>[0], existing);
        const trimmed = updated.length > MAX_PREFERENCES
          ? updated.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_PREFERENCES)
          : updated;
        await figma.clientStorage.setAsync(PREFERENCES_STORAGE_KEY, trimmed);
        figma.ui.postMessage({ type: 'preferences-aggregated', preferences: trimmed, count: trimmed.length });
      } catch (err) {
        figma.ui.postMessage({ type: 'aggregate-preferences-error', error: String(err) });
      }
      return true;
    }

    case 'get-preferences': {
      try {
        const prefs = await figma.clientStorage.getAsync(PREFERENCES_STORAGE_KEY) || [];
        figma.ui.postMessage({ type: 'preferences-loaded', preferences: prefs });
      } catch (err) {
        figma.ui.postMessage({ type: 'get-preferences-error', error: String(err) });
      }
      return true;
    }

    case 'save-preferences': {
      try {
        const prefs = ((msg as any).preferences as LearnedPreference[]) || [];
        const trimmed = prefs.length > MAX_PREFERENCES
          ? prefs.sort((a, b) => a.createdAt - b.createdAt).slice(prefs.length - MAX_PREFERENCES)
          : prefs;
        await figma.clientStorage.setAsync(PREFERENCES_STORAGE_KEY, trimmed);
        figma.ui.postMessage({ type: 'preferences-saved', success: true, count: trimmed.length });
      } catch (err) {
        figma.ui.postMessage({ type: 'save-preferences-error', error: String(err) });
      }
      return true;
    }

    case 'update-preference': {
      try {
        const pref = (msg as any).preference as LearnedPreference;
        const stored = await figma.clientStorage.getAsync(PREFERENCES_STORAGE_KEY) as LearnedPreference[] | undefined;
        const prefs = stored || [];
        const idx = prefs.findIndex(p => p.id === pref.id);
        if (idx !== -1) { prefs[idx] = pref; } else { prefs.push(pref); }
        await figma.clientStorage.setAsync(PREFERENCES_STORAGE_KEY, prefs);
        figma.ui.postMessage({ type: 'update-preference-result', success: true });
      } catch (err) {
        figma.ui.postMessage({ type: 'update-preference-result', success: false, error: String(err) });
      }
      return true;
    }

    case 'delete-preference': {
      try {
        const preferenceId = (msg as any).preferenceId as string;
        const stored = await figma.clientStorage.getAsync(PREFERENCES_STORAGE_KEY) as LearnedPreference[] | undefined;
        const prefs = (stored || []).filter(p => p.id !== preferenceId);
        await figma.clientStorage.setAsync(PREFERENCES_STORAGE_KEY, prefs);
        figma.ui.postMessage({ type: 'delete-preference-result', success: true });
      } catch (err) {
        figma.ui.postMessage({ type: 'delete-preference-result', success: false, error: String(err) });
      }
      return true;
    }

    // FN-17: Brand kit retrieval for skill export
    case 'get-brand-kit': {
      try {
        const brandKit = await figma.clientStorage.getAsync('figmento-brand-kit') || null;
        figma.ui.postMessage({ type: 'brand-kit-loaded', brandKit });
      } catch (err) {
        figma.ui.postMessage({ type: 'get-brand-kit-error', error: String(err) });
      }
      return true;
    }

    case 'get-selection-snapshot': {
      const selection = figma.currentPage.selection
        .filter(node => 'width' in node && 'height' in node)
        .map(node => ({
          id: node.id,
          type: node.type,
          name: node.name,
          width: (node as SceneNode & { width: number }).width,
          height: (node as SceneNode & { height: number }).height,
        }));
      figma.ui.postMessage({ type: 'selection-snapshot', selection });
      return true;
    }

    case 'clear-preferences': {
      try {
        await figma.clientStorage.setAsync(PREFERENCES_STORAGE_KEY, []);
        figma.ui.postMessage({ type: 'clear-preferences-result', success: true });
      } catch (err) {
        figma.ui.postMessage({ type: 'clear-preferences-result', success: false, error: String(err) });
      }
      return true;
    }

    case 'get-learning-config': {
      try {
        const config = await figma.clientStorage.getAsync(LEARNING_CONFIG_STORAGE_KEY) || DEFAULT_LEARNING_CONFIG;
        figma.ui.postMessage({ type: 'learning-config-loaded', config });
      } catch (err) {
        figma.ui.postMessage({ type: 'get-learning-config-error', error: String(err) });
      }
      return true;
    }

    case 'save-learning-config': {
      try {
        const config = (msg as any).config as LearningConfig;
        await figma.clientStorage.setAsync(LEARNING_CONFIG_STORAGE_KEY, config);
        figma.ui.postMessage({ type: 'learning-config-saved', success: true });
      } catch (err) {
        figma.ui.postMessage({ type: 'save-learning-config-error', error: String(err) });
      }
      return true;
    }

    default:
      return false;
  }
}
