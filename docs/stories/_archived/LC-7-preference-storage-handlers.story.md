# Story LC-7: Preference Storage Handlers in Plugin Sandbox

**Status:** Done
**Priority:** High
**Complexity:** M (Medium) — 5 new message handlers in code.ts following established IIFE pattern; no new UI
**Epic:** LC — Learning & Corrections (Phase 4b)
**PRD:** PRD-004 (Learn from User Corrections)
**Depends on:** LC-6 (LearnedPreference type + aggregateCorrections must exist), LC-4 (figmento-corrections storage established)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + manual test: save 3+ corrections → aggregate → verify preference in clientStorage
```

---

## Story

**As a** Figmento plugin sandbox,
**I want** handlers to aggregate correction entries into preferences and persist them in clientStorage,
**so that** the UI can read and display learned preferences, and the system can surface them for prompt injection in Phase 4c.

---

## Description

This story adds 5 new message handlers to `code.ts`. They wire the aggregation engine from LC-6 to the plugin's clientStorage layer. All follow the established IIFE async pattern (see `save-memory` at lines 322–338 and the LC-2/LC-4 handlers added in Phase 4a).

### Handlers

1. **`aggregate-preferences`** — Reads `figmento-corrections` (all confirmed entries), calls `aggregateCorrections()` with existing `figmento-preferences` for deduplication, writes the merged result back to `figmento-preferences`, responds with updated preference list.

2. **`get-preferences`** — Reads `figmento-preferences` from clientStorage, returns the array. Returns `[]` if key not set.

3. **`save-preferences`** — Receives a full `LearnedPreference[]` from the UI (after user edits in Phase 4c panel), writes to `figmento-preferences`. Enforces max 50 (FIFO eviction on oldest `createdAt`). Responds with `{ success: true, count }`.

4. **`get-learning-config`** — Reads `figmento-learning-config` from clientStorage. Returns default config `{ enabled: true, autoDetect: false, confidenceThreshold: 3 }` if key not set.

5. **`save-learning-config`** — Receives a `LearningConfig` object from the UI, writes to `figmento-learning-config`. Responds with `{ success: true }`.

### Storage Keys (from PRD-004 §C8 — already defined in code.ts)

| Key | Type | Max |
|-----|------|-----|
| `figmento-corrections` | `CorrectionEntry[]` | 200 (managed by LC-4) |
| `figmento-preferences` | `LearnedPreference[]` | 50 (managed by this story) |
| `figmento-learning-config` | `LearningConfig` | 1 (single object) |

---

## Acceptance Criteria

- [ ] **AC1:** `aggregate-preferences` handler reads all entries from `figmento-corrections` (including unconfirmed), passes the full array to `aggregateCorrections()` — the `confirmed: true` filter is applied internally by that function (LC-6 Task 3 step 1). Result is written to `figmento-preferences`.
- [ ] **AC2:** `aggregate-preferences` reads existing `figmento-preferences` and passes them as `existingPreferences` to `aggregateCorrections()` for correct deduplication (LC-6 AC11)
- [ ] **AC3:** `aggregate-preferences` responds via `figma.ui.postMessage({ type: 'preferences-aggregated', preferences: LearnedPreference[], count: number })`
- [ ] **AC4:** `get-preferences` responds via `figma.ui.postMessage({ type: 'preferences-loaded', preferences: LearnedPreference[] })` — returns `[]` if storage key is unset
- [ ] **AC5:** `save-preferences` enforces max 50 entries — evicts oldest by `createdAt` if over limit before writing
- [ ] **AC6:** `save-preferences` responds via `figma.ui.postMessage({ type: 'preferences-saved', success: true, count: number })`
- [ ] **AC7:** `get-learning-config` responds via `figma.ui.postMessage({ type: 'learning-config-loaded', config: LearningConfig })` — returns `{ enabled: true, autoDetect: false, confidenceThreshold: 3 }` default if key not set
- [ ] **AC8:** `save-learning-config` responds via `figma.ui.postMessage({ type: 'learning-config-saved', success: true })`
- [ ] **AC9:** All 5 handlers use the IIFE async pattern with try/catch and error response on failure: `figma.ui.postMessage({ type: '...-error', error: string })`
- [ ] **AC10:** Plugin build passes (`cd figmento && npm run build`)

---

## Tasks

### Phase 1 — Storage Constants

- [x] **Task 1:** Add storage key constants near existing LC-2 keys in `code.ts`:
  ```typescript
  const PREFERENCES_STORAGE_KEY = 'figmento-preferences';
  const MAX_PREFERENCES = 50;
  const LEARNING_CONFIG_STORAGE_KEY = 'figmento-learning-config';
  const DEFAULT_LEARNING_CONFIG: LearningConfig = {
    enabled: true,
    autoDetect: false,
    confidenceThreshold: 3,
  };
  ```

### Phase 2 — Imports

- [x] **Task 2:** Add import in `code.ts`:
  ```typescript
  import { aggregateCorrections } from './correction-aggregator';
  ```
  Add `LearnedPreference`, `LearningConfig` to the existing types import from `./types`.

### Phase 3 — Message Handlers

- [x] **Task 3:** Add `aggregate-preferences` handler to the message switch (after existing LC-4 handlers):
  ```typescript
  case 'aggregate-preferences':
    (async () => {
      try {
        const rawCorrections = await figma.clientStorage.getAsync(CORRECTIONS_STORAGE_KEY) || [];
        const existing = await figma.clientStorage.getAsync(PREFERENCES_STORAGE_KEY) || [];
        const updated = aggregateCorrections(rawCorrections, existing);
        // Enforce max 50 (sort by createdAt, keep newest)
        const trimmed = updated.length > MAX_PREFERENCES
          ? updated.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_PREFERENCES)
          : updated;
        await figma.clientStorage.setAsync(PREFERENCES_STORAGE_KEY, trimmed);
        figma.ui.postMessage({ type: 'preferences-aggregated', preferences: trimmed, count: trimmed.length });
      } catch (err) {
        figma.ui.postMessage({ type: 'aggregate-preferences-error', error: String(err) });
      }
    })();
    break;
  ```

- [x] **Task 4:** Add `get-preferences` handler:
  ```typescript
  case 'get-preferences':
    (async () => {
      try {
        const prefs = await figma.clientStorage.getAsync(PREFERENCES_STORAGE_KEY) || [];
        figma.ui.postMessage({ type: 'preferences-loaded', preferences: prefs });
      } catch (err) {
        figma.ui.postMessage({ type: 'get-preferences-error', error: String(err) });
      }
    })();
    break;
  ```

- [x] **Task 5:** Add `save-preferences` handler:
  ```typescript
  case 'save-preferences':
    (async () => {
      try {
        const prefs = (msg.preferences as LearnedPreference[]) || [];
        const trimmed = prefs.length > MAX_PREFERENCES
          ? prefs.sort((a, b) => a.createdAt - b.createdAt).slice(prefs.length - MAX_PREFERENCES)
          : prefs;
        await figma.clientStorage.setAsync(PREFERENCES_STORAGE_KEY, trimmed);
        figma.ui.postMessage({ type: 'preferences-saved', success: true, count: trimmed.length });
      } catch (err) {
        figma.ui.postMessage({ type: 'save-preferences-error', error: String(err) });
      }
    })();
    break;
  ```

- [x] **Task 6:** Add `get-learning-config` handler:
  ```typescript
  case 'get-learning-config':
    (async () => {
      try {
        const config = await figma.clientStorage.getAsync(LEARNING_CONFIG_STORAGE_KEY) || DEFAULT_LEARNING_CONFIG;
        figma.ui.postMessage({ type: 'learning-config-loaded', config });
      } catch (err) {
        figma.ui.postMessage({ type: 'get-learning-config-error', error: String(err) });
      }
    })();
    break;
  ```

- [x] **Task 7:** Add `save-learning-config` handler:
  ```typescript
  case 'save-learning-config':
    (async () => {
      try {
        const config = msg.config as LearningConfig;
        await figma.clientStorage.setAsync(LEARNING_CONFIG_STORAGE_KEY, config);
        figma.ui.postMessage({ type: 'learning-config-saved', success: true });
      } catch (err) {
        figma.ui.postMessage({ type: 'save-learning-config-error', error: String(err) });
      }
    })();
    break;
  ```

### Phase 4 — Build Verification

- [x] **Task 8:** Verify `cd figmento && npm run build` passes clean.

---

## Dev Notes

- **Follow the `save-memory` handler pattern exactly.** Wrap async work in IIFE, use try/catch, respond via `figma.ui.postMessage`. See `code.ts` lines 322–338 for the template. LC-4 handlers are also good reference.

- **`CORRECTIONS_STORAGE_KEY` is already defined** as `'figmento-corrections'` in `code.ts` from LC-4. Do not redefine — just reference the existing constant.

- **Max 50 eviction:** Sort by `createdAt` ascending, keep the newest 50. This differs from `figmento-corrections` which uses FIFO (oldest by timestamp). Rationale: most recently reinforced preferences are more valuable.

- **`aggregate-preferences` is additive, not destructive.** It reads both the raw corrections AND the existing preferences, then merges. The existing `correctionIds` in `existingPreferences` tell the aggregator which corrections have already been counted, preventing double-counting. This is handled by LC-6's `aggregateCorrections(corrections, existingPreferences)` signature.

- **`save-learning-config` does NOT validate the config shape.** Trust the UI to send valid `LearningConfig`. Adding validation would be over-engineering for an internal plugin-to-sandbox message.

- **No new storage keys for this story.** All three keys (`figmento-corrections`, `figmento-preferences`, `figmento-learning-config`) are defined here. `figmento-corrections` existed from LC-4.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/code.ts` | MODIFY | Add `PREFERENCES_STORAGE_KEY`, `MAX_PREFERENCES`, `LEARNING_CONFIG_STORAGE_KEY`, `DEFAULT_LEARNING_CONFIG` constants; import `aggregateCorrections`; add 5 message handlers |

---

## Definition of Done

- [x] `aggregate-preferences` runs aggregation, stores result, responds correctly
- [x] `get-preferences` returns stored preferences (or `[]`)
- [x] `save-preferences` writes preferences with max-50 enforcement
- [x] `get-learning-config` returns stored config (or default)
- [x] `save-learning-config` persists the config
- [x] All handlers use IIFE + try/catch pattern
- [x] Build passes clean
- [x] No existing functionality affected

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | @sm (River) | Story drafted from PRD-004 Phase 4b. Sandbox layer — 5 preference/config handlers following LC-2/LC-4 patterns. |
| 2026-03-13 | @po (Pax) | Validated: 9/10. Fixed: AC1 wording clarified — confirmed filter is applied inside aggregateCorrections(), not by the handler. Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Implemented: PREFERENCES_STORAGE_KEY, MAX_PREFERENCES, LEARNING_CONFIG_STORAGE_KEY, DEFAULT_LEARNING_CONFIG constants added. aggregateCorrections + LearnedPreference + LearningConfig imported. 5 handlers added (aggregate-preferences, get-preferences, save-preferences, get-learning-config, save-learning-config). compare-snapshot echoes source field. Also updated save-corrections to use CORRECTIONS_STORAGE_KEY constant. Build clean, 396 tests pass. Status → Ready for Review. |
| 2026-04-12 | @qa (Quinn) | **QA Gate: PASS.** 10/10 ACs verified. All 5 handlers confirmed in storage.ts:294-413. Max 50 preferences FIFO eviction enforced. Default config returns on unset key. Status: Ready for Review → Done. |
