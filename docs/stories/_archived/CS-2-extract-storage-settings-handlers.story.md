# Story CS-2: Extract Storage + Settings Handlers from code.ts

**Status:** Done (retroactive — @po audit 2026-04-13)
**Priority:** Medium (P2)
**Complexity:** M (3 points) — 17 message handlers with storage access patterns
**Epic:** CS — Code Split (Plugin Modularization)
**Depends on:** CS-1
**PRD:** Architecture Audit 2026-03-14 (Item 3)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + snapshot/correction/preference/settings flows work identically
```

---

## Story

**As a** Figmento plugin developer,
**I want** storage and settings message handlers extracted from code.ts,
**so that** the snapshot/correction/preference logic is isolated and testable.

---

## Description

Extract 17 `figma.ui.onmessage` case branches from `code.ts` into two handler modules.

### Module 1: `handlers/storage.ts` (~350 lines)

Handles all snapshot, correction, preference, and learning config operations:

| Message Type | Handler |
|-------------|---------|
| `take-snapshot` | Capture frame state via `serializeFrame()` |
| `get-snapshot-status` | List cached snapshots with TTL pruning |
| `compare-snapshot` | Diff current vs saved via `calculateDiff()` |
| `save-corrections` | Append corrections, delete consumed snapshots |
| `aggregate-preferences` | Run `aggregateCorrections()`, trim to max |
| `get-preferences` | Load from storage |
| `save-preferences` | Replace preferences, enforce limit |
| `update-preference` | Patch single preference by ID |
| `delete-preference` | Remove by ID |
| `clear-preferences` | Nuke preference list |
| `get-learning-config` | Load config |
| `save-learning-config` | Save config |

**Shared state to move:** `snapshotDebounce` Map (module-level, only used by storage handlers).

**Storage constants to move:** `SNAPSHOTS_STORAGE_KEY`, `CORRECTIONS_STORAGE_KEY`, `PREFERENCES_STORAGE_KEY`, `LEARNING_CONFIG_STORAGE_KEY`, `SNAPSHOT_TTL_MS`, `MAX_SNAPSHOTS`, `SNAPSHOT_DEBOUNCE_MS`, `DEFAULT_LEARNING_CONFIG`.

### Module 2: `handlers/settings.ts` (~200 lines)

Handles API keys, validation, settings, and memory:

| Message Type | Handler |
|-------------|---------|
| `save-api-key` | Store API key for provider |
| `load-api-keys` | Load and broadcast all keys to UI |
| `save-validation` | Store provider validation status |
| `get-settings` | Load chat model + relay URL |
| `save-settings` | Persist all settings |
| `load-memory` | Load design feedback array |
| `save-memory` | Save design feedback array |
| `save-feedback` | Store feedback entries |

**Functions to move:** `saveApiKey()`, `saveValidationStatus()`, `loadSavedApiKeys()`, `migrateOldSettings()`.

### Integration Pattern

Each module exports a `handleStorageMessage(msg)` / `handleSettingsMessage(msg)` function that takes the message and returns `true` if handled:

```typescript
// handlers/storage.ts
export async function handleStorageMessage(msg: PluginMessage): Promise<boolean> {
  switch (msg.type) {
    case 'take-snapshot': { ... return true; }
    case 'get-snapshot-status': { ... return true; }
    // ...
    default: return false;
  }
}

// code.ts (updated)
figma.ui.onmessage = async (msg) => {
  if (await handleStorageMessage(msg)) return;
  if (await handleSettingsMessage(msg)) return;
  // ... remaining handlers
};
```

---

## Acceptance Criteria

- [ ] AC1: `handlers/storage.ts` created with 12 message handlers
- [ ] AC2: `handlers/settings.ts` created with 8 message handlers + 4 utility functions
- [ ] AC3: `snapshotDebounce` Map moved to `handlers/storage.ts` (not exported — internal state)
- [ ] AC4: All storage constants moved to `handlers/storage.ts`
- [ ] AC5: `code.ts` `figma.ui.onmessage` handler delegates to extracted modules first
- [ ] AC6: `npm run build` clean
- [ ] AC7: Snapshot capture/compare flow works identically
- [ ] AC8: Preferences CRUD works identically
- [ ] AC9: Settings save/load works identically
- [ ] AC10: `code.ts` reduced by ~550 lines

---

## Dev Notes

- **`figma.clientStorage.getAsync/setAsync`** is available globally in the sandbox. No special import needed.
- **`serializeFrame`, `calculateDiff`, `aggregateCorrections`** are already separate modules — `handlers/storage.ts` imports them directly.
- **Message handler pattern:** Current handlers are async IIFEs inside switch cases. Extract as named async functions for clarity.
- **`loadSavedApiKeys()` is called at startup** (outside the message handler). It must be exported from `handlers/settings.ts` and called from `code.ts` initialization.
- **`autoSnapshotAfterCommand()`** stays in `code.ts` for now — it's called from the `execute-command` handler which is part of the command router (CS-3).

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/handlers/storage.ts` | CREATE | 12 message handlers + snapshot state |
| `figmento/src/handlers/settings.ts` | CREATE | 8 message handlers + 4 utility functions |
| `figmento/src/code.ts` | MODIFY | Remove 20 case branches, add delegation calls (~550 lines removed) |

---

## Definition of Done

- [ ] `npm run build` clean
- [ ] All 20 message types handled identically to before
- [ ] code.ts reduced by ~550 lines

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | @pm (Morgan) | Story created from @architect sprint assessment |
| 2026-04-13 | @po (Pax) | **Retroactive Done.** Audit confirms `figmento/src/handlers/storage.ts` and `handlers/settings.ts` exist. Work shipped by @dev outside story workflow. Status: Draft → Done. |
