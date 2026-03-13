# Story LC-11: Preferences UI Panel + Sandbox CRUD Handlers

**Status:** Ready for Review
**Priority:** Medium
**Complexity:** M (Medium) — New Settings sub-panel UI (HTML + CSS + TS event handlers) + 3 new sandbox CRUD handlers. Most complex UI work in Phase 4c.
**Epic:** LC — Learning & Corrections (Phase 4c)
**PRD:** PRD-004 (Learn from User Corrections) §5 US-5
**Depends on:** LC-7 (get-preferences, save-preferences sandbox handlers), LC-6 (LearnedPreference type), LC-8 (Learning section in Settings tab must exist as DOM anchor for this story's Preferences section)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin) + manual UI smoke test in Figma plugin
```

---

## Story

**As a** Figmento user who wants control over what the AI has learned,
**I want** a Preferences panel showing all learned preferences,
**so that** I can review, edit, disable, delete, or export any learned pattern.

---

## Description

Learned preferences are stored and injected (after LC-9), but users have no visibility into them. This story adds a Preferences management panel as a new section within the existing Settings tab.

### UI Structure

The Preferences section lives inside the Settings tab (`#settings-panel`), added after the existing Learning section (the auto-detect toggle added in LC-8).

**Structure:**

```
── Preferences ──────────────────────────────────────
  [No preferences learned yet. Create designs and
   confirm corrections to build your preference profile.]

  OR (when preferences exist):

  ┌──────────────────────────────────────────────────┐
  │ h1 fontSize                          [HIGH] [●]  │
  │ Prefers h1 font size ≥96px                       │
  │ 9 corrections · last seen 2026-03-10       [✕]   │
  └──────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────┐
  │ card cornerRadius                    [MED]  [●]  │
  │ Tends toward larger card corner radius           │
  │ 5 corrections · last seen 2026-03-12       [✕]   │
  └──────────────────────────────────────────────────┘

  [Clear All]           [Export JSON]  [Import JSON]
```

Where `[●]` is a toggle (enabled/disabled state). `[✕]` deletes the preference.

**Scope note:** Inline edit form for preference values (changing the learned value) is **OUT OF SCOPE** — deferred to a follow-up story. The `update-preference` sandbox handler (AC10) is IN scope to support the toggle operation; no separate edit UI is required in this story.

### Interactions

1. **Load on open:** When the Settings panel is shown (tab click), send `get-preferences` to sandbox and render the list.
2. **Toggle:** Flip `enabled` on a preference, save entire updated array via `save-preferences`.
3. **Delete:** Remove a preference from the array, save via `save-preferences`. Show "Deleted" toast.
4. **Clear All:** Confirm dialog → send `clear-preferences` to sandbox. Reload list.
5. **Export:** `JSON.stringify(preferences, null, 2)` → download as `figmento-preferences.json` via `<a download>`.
6. **Import:** File input → parse JSON → validate array shape → send `save-preferences` with merged array (replace). Reload list.

### New Sandbox Handlers (in `figmento/src/code.ts`)

Three new handlers following the LC-7 IIFE pattern:

```typescript
case 'update-preference': (async () => {
  // Receives: { type: 'update-preference', preference: LearnedPreference }
  // Reads figmento-preferences, finds by id, replaces, saves
})(); break;

case 'delete-preference': (async () => {
  // Receives: { type: 'delete-preference', preferenceId: string }
  // Reads figmento-preferences, filters out the id, saves
})(); break;

case 'clear-preferences': (async () => {
  // Receives: { type: 'clear-preferences' }
  // Writes [] to figmento-preferences
})(); break;
```

Each responds with `figma.ui.postMessage({ type: '<handler>-result', success: true })`.

### CSS Classes

Add after existing `.auto-detect-*` rules in `ui.html`:

```
.pref-section            — wrapper for preferences sub-section
.pref-empty              — empty state message
.pref-list               — ul for preference cards
.pref-card               — individual preference li card
.pref-card-header        — flex row: name + confidence badge + toggle
.pref-card-description   — description line
.pref-card-meta          — corrections count + last seen date
.pref-card-delete        — delete button (×)
.pref-confidence-badge   — colored badge: high=green, medium=yellow, low=orange
.pref-toggle             — checkbox styled as toggle (reuse relay-toggle-label pattern)
.pref-actions            — bottom action row: Clear All, Export, Import
.pref-clear-btn          — text-danger style button
.pref-export-btn         — secondary button
.pref-import-btn         — secondary button
```

### Module placement

New file: `figmento/src/ui/preferences-panel.ts`

Export: `export function initPreferencesPanel(): void` — called from `ui.ts` after `initChatSettings()`.

The panel also exports `export function reloadPreferencesPanel(): void` for use when preferences are modified from other panels (optional — the panel re-loads on every Settings tab open).

---

## Acceptance Criteria

- [x] **AC1:** A "Preferences" section appears in the Settings tab, below the Learning toggle section added by LC-8
- [x] **AC2:** On Settings tab open, the plugin loads preferences from sandbox and renders the list
- [x] **AC3:** Empty state message shown when no preferences exist
- [x] **AC4:** Each preference card shows: property name, context, confidence badge (HIGH/MED/LOW), description, correctionCount, lastSeenAt (human-readable date), enabled toggle, delete button
- [x] **AC5:** Toggle (enabled/disabled) saves the updated preference array via `save-preferences` without page reload — card updates visually (opacity or muted style for disabled)
- [x] **AC6:** Delete button removes the preference, saves via `save-preferences`, and removes the card from DOM
- [x] **AC7:** "Clear All" button shows a confirm dialog (`window.confirm` or inline confirm UI). On confirm, sends `clear-preferences` to sandbox, clears the list in UI
- [x] **AC8:** "Export JSON" downloads a file named `figmento-preferences.json` containing the full preferences array as pretty-printed JSON
- [x] **AC9:** "Import JSON" opens a file picker, parses the selected `.json` file, validates it is an array, sends `save-preferences` to sandbox with the parsed array, and reloads the list
- [x] **AC10:** `update-preference` sandbox handler updates a single preference by `id` in clientStorage (full replace of that entry)
- [x] **AC11:** `delete-preference` sandbox handler removes a preference by `id` from clientStorage array
- [x] **AC12:** `clear-preferences` sandbox handler writes `[]` to `figmento-preferences` in clientStorage
- [x] **AC13:** `cd figmento && npm run build` passes clean. No TypeScript errors.

---

## Tasks

### Phase 1 — Sandbox Handlers

- [x] **Task 1:** In `figmento/src/code.ts`, add three new message handlers after the existing `save-preferences` case:

  ```typescript
  case 'update-preference': (async () => {
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
  })(); break;

  case 'delete-preference': (async () => {
    try {
      const preferenceId = (msg as any).preferenceId as string;
      const stored = await figma.clientStorage.getAsync(PREFERENCES_STORAGE_KEY) as LearnedPreference[] | undefined;
      const prefs = (stored || []).filter(p => p.id !== preferenceId);
      await figma.clientStorage.setAsync(PREFERENCES_STORAGE_KEY, prefs);
      figma.ui.postMessage({ type: 'delete-preference-result', success: true });
    } catch (err) {
      figma.ui.postMessage({ type: 'delete-preference-result', success: false, error: String(err) });
    }
  })(); break;

  case 'clear-preferences': (async () => {
    try {
      await figma.clientStorage.setAsync(PREFERENCES_STORAGE_KEY, []);
      figma.ui.postMessage({ type: 'clear-preferences-result', success: true });
    } catch (err) {
      figma.ui.postMessage({ type: 'clear-preferences-result', success: false, error: String(err) });
    }
  })(); break;
  ```

### Phase 2 — HTML Structure

- [x] **Task 2:** In `figmento/src/ui.html`, add after the Learning section (the `settings-auto-detect` checkbox group):

  ```html
  <!-- Preferences Panel (LC-11) -->
  <div class="chat-settings-group pref-section" id="preferences-section">
    <h3>Preferences</h3>
    <div class="pref-empty" id="pref-empty" style="display:none">
      No preferences learned yet. Create designs and confirm corrections to build your preference profile.
    </div>
    <ul class="pref-list" id="pref-list"></ul>
    <div class="pref-actions" id="pref-actions" style="display:none">
      <button class="pref-clear-btn" id="pref-clear-all">Clear All</button>
      <button class="pref-export-btn" id="pref-export">Export JSON</button>
      <button class="pref-import-btn" id="pref-import-trigger">Import JSON</button>
      <input type="file" id="pref-import-input" accept=".json" style="display:none" />
    </div>
  </div>
  ```

  Add CSS after `.auto-detect-saved-msg`:

  ```css
  .pref-section { margin-top: 16px; }
  .pref-empty { font-size: 11px; color: var(--color-text-secondary, #888); padding: 8px 0; }
  .pref-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .pref-card { background: var(--color-bg-secondary, #2a2a2a); border-radius: 6px; padding: 10px 12px; }
  .pref-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .pref-card-name { flex: 1; font-size: 12px; font-weight: 600; color: var(--color-text, #e0e0e0); }
  .pref-confidence-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; }
  .pref-confidence-badge.high { background: #1a4731; color: #4ade80; }
  .pref-confidence-badge.medium { background: #3d2e00; color: #fbbf24; }
  .pref-confidence-badge.low { background: #3d1a00; color: #fb923c; }
  .pref-card-description { font-size: 11px; color: var(--color-text-secondary, #aaa); margin-bottom: 4px; }
  .pref-card-meta { font-size: 10px; color: var(--color-text-tertiary, #666); display: flex; align-items: center; justify-content: space-between; }
  .pref-card-delete { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1; }
  .pref-card-delete:hover { color: #ef4444; }
  .pref-card.disabled { opacity: 0.45; }
  .pref-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .pref-clear-btn { font-size: 11px; padding: 4px 10px; background: none; border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; cursor: pointer; }
  .pref-export-btn, .pref-import-btn { font-size: 11px; padding: 4px 10px; background: none; border: 1px solid #555; color: #aaa; border-radius: 4px; cursor: pointer; }
  .pref-export-btn:hover, .pref-import-btn:hover { border-color: #888; color: #e0e0e0; }
  ```

### Phase 3 — preferences-panel.ts

- [x] **Task 3:** Create `figmento/src/ui/preferences-panel.ts`:

  ```typescript
  import type { LearnedPreference } from '../types';

  let currentPreferences: LearnedPreference[] = [];

  function postToSandbox(msg: Record<string, unknown>) {
    parent.postMessage({ pluginMessage: msg }, '*');
  }

  function formatDate(ts: number): string {
    return new Date(ts).toISOString().split('T')[0];
  }

  function renderPreferences(prefs: LearnedPreference[]): void {
    const list = document.getElementById('pref-list')!;
    const empty = document.getElementById('pref-empty')!;
    const actions = document.getElementById('pref-actions')!;

    list.innerHTML = '';

    if (prefs.length === 0) {
      empty.style.display = 'block';
      actions.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    actions.style.display = 'flex';

    // Sort: high → medium → low, then correctionCount desc
    const sorted = [...prefs].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      const d = order[a.confidence] - order[b.confidence];
      return d !== 0 ? d : b.correctionCount - a.correctionCount;
    });

    for (const pref of sorted) {
      const li = document.createElement('li');
      li.className = `pref-card${pref.enabled === false ? ' disabled' : ''}`;
      li.dataset.id = pref.id;

      const badgeClass = { high: 'high', medium: 'medium', low: 'low' }[pref.confidence];
      const badgeText = { high: 'HIGH', medium: 'MED', low: 'LOW' }[pref.confidence];

      li.innerHTML = `
        <div class="pref-card-header">
          <span class="pref-card-name">${pref.context} ${pref.property}</span>
          <span class="pref-confidence-badge ${badgeClass}">${badgeText}</span>
          <label class="relay-toggle-label" title="${pref.enabled !== false ? 'Enabled' : 'Disabled'}">
            <input type="checkbox" class="pref-toggle" data-id="${pref.id}" ${pref.enabled !== false ? 'checked' : ''} />
          </label>
        </div>
        <div class="pref-card-description">${pref.description}</div>
        <div class="pref-card-meta">
          <span>${pref.correctionCount} correction${pref.correctionCount === 1 ? '' : 's'} · ${formatDate(pref.lastSeenAt)}</span>
          <button class="pref-card-delete" data-id="${pref.id}" title="Delete preference">×</button>
        </div>
      `;
      list.appendChild(li);
    }

    // Toggle event
    list.querySelectorAll<HTMLInputElement>('.pref-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id!;
        const pref = currentPreferences.find(p => p.id === id);
        if (!pref) return;
        pref.enabled = cb.checked;
        cb.closest('.pref-card')?.classList.toggle('disabled', !cb.checked);
        postToSandbox({ type: 'update-preference', preference: pref });
      });
    });

    // Delete event
    list.querySelectorAll<HTMLButtonElement>('.pref-card-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id!;
        currentPreferences = currentPreferences.filter(p => p.id !== id);
        postToSandbox({ type: 'delete-preference', preferenceId: id });
        renderPreferences(currentPreferences);
      });
    });
  }

  function loadPreferences(): void {
    postToSandbox({ type: 'get-preferences' });
  }

  export function initPreferencesPanel(): void {
    // Listen for sandbox responses
    window.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === 'preferences-loaded') {
        currentPreferences = (msg.preferences as LearnedPreference[]) || [];
        renderPreferences(currentPreferences);
      }
    });

    // Clear All
    document.getElementById('pref-clear-all')?.addEventListener('click', () => {
      if (!window.confirm('Clear all learned preferences? This cannot be undone.')) return;
      currentPreferences = [];
      postToSandbox({ type: 'clear-preferences' });
      renderPreferences([]);
    });

    // Export JSON
    document.getElementById('pref-export')?.addEventListener('click', () => {
      const json = JSON.stringify(currentPreferences, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'figmento-preferences.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import JSON
    const importBtn = document.getElementById('pref-import-trigger');
    const importInput = document.getElementById('pref-import-input') as HTMLInputElement;
    importBtn?.addEventListener('click', () => importInput.click());
    importInput?.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (!Array.isArray(parsed)) { alert('Invalid file: expected a JSON array.'); return; }
          currentPreferences = parsed as LearnedPreference[];
          postToSandbox({ type: 'save-preferences', preferences: currentPreferences });
          renderPreferences(currentPreferences);
        } catch { alert('Invalid JSON file.'); }
        importInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  export function reloadPreferencesPanel(): void {
    loadPreferences();
  }
  ```

### Phase 4 — Wire into ui.ts and Settings Tab Trigger

- [x] **Task 4:** In `figmento/src/ui.ts` (or wherever `initChatSettings()` is called from):
  - Add `import { initPreferencesPanel } from './ui/preferences-panel';`
  - Call `initPreferencesPanel();` after `initChatSettings();`

- [x] **Task 5:** Trigger preferences load on Settings tab activation. In `ui.html` or `ui.ts`, find where the settings tab show/hide toggle is handled and add a call to reload preferences when the settings panel becomes visible:
  ```typescript
  // When settings tab is clicked/shown:
  import { reloadPreferencesPanel } from './ui/preferences-panel';
  // inside the settings tab click handler:
  reloadPreferencesPanel();
  ```

### Phase 5 — Build Verification

- [x] **Task 6:** `cd figmento && npm run build` — verify clean. No TypeScript errors. Plugin loads in Figma.

---

## Dev Notes

- **`preferences-loaded` message is shared** with LC-9's `loadPreferencesFromSandbox()` in `chat.ts`. Both register window listeners. They are self-removing (chat.ts removes on first match, preferences-panel.ts persists). This means a single `get-preferences` response will be consumed by whichever listener fires first. To avoid race conditions, `preferences-panel.ts` registers a **persistent** listener (not one-shot), which is fine since it checks the message type explicitly. The chat.ts one-shot listener registers only during a turn, so they should not conflict in normal operation.

- **`PREFERENCES_STORAGE_KEY` constant** is already defined in `code.ts` from LC-7. Use it in the new handlers; do not redeclare.

- **`LearnedPreference` import** in `preferences-panel.ts` comes from `'../types'` (the shared figmento package types). The `figmento/src/ui/` files import from `'../types'` for plugin-side code.

- **`window.confirm`** — available in the Figma plugin iframe (it's a real browser iframe). Acceptable for the clear-all confirmation.

- **Blob download** — `URL.createObjectURL` and `<a download>` work inside Figma plugin iframes. No special handling needed.

- **File input in Figma iframe** — `<input type="file">` works inside Figma plugin iframes. The `FileReader` API is available.

- **Tab activation trigger:** Find the existing settings tab toggle in `ui.html` (look for `#settings-tab` or similar). It may be CSS-only (checkbox toggle) or JS-driven. If CSS-only, `reloadPreferencesPanel()` must be called via a `change` event listener on the tab checkbox. Check `ui.ts` for the existing pattern.

- **Toggle styling:** Reuse `.relay-toggle-label` CSS class already in `ui.html` from LC-8's auto-detect toggle. The `<label>` + `<input type="checkbox">` pattern is already established.

- **XSS risk in renderPreferences():** The Task 3 implementation sets `innerHTML` on the entire `<li>` card including `pref.description`, `pref.context`, and `pref.property`. These fields originate from the aggregation engine which builds them from Figma node names — potential XSS if a node is named `<img onerror=...>`. Fix: set the outer scaffold via innerHTML but write the user-derived text fields (`pref.description`, `pref.context`, `pref.property`, `pref.correctionCount`) via `textContent` after insertion. Do NOT use innerHTML for any field derived from user data or Figma node names.

- **PRD US-5 scope deviation:** PRD US-5 includes "reset (clear correction history)" per preference — meaning clear the raw corrections that produced a preference without deleting the preference itself. This story implements DELETE-preference only (which removes both the preference and its associated correctionIds). A per-preference correction history reset would require modifying `figmento-corrections` to filter by `correctionIds` — deferred to Phase 4d backlog.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/code.ts` | MODIFY | Add `update-preference`, `delete-preference`, `clear-preferences` handlers |
| `figmento/src/ui.html` | MODIFY | Add Preferences section HTML + CSS |
| `figmento/src/ui/preferences-panel.ts` | CREATE | Full panel logic: render, toggle, delete, clear, export, import |
| `figmento/src/ui.ts` | MODIFY | Import + call `initPreferencesPanel()`, call `reloadPreferencesPanel()` on settings tab open |

---

## Definition of Done

- [x] Preferences section visible in Settings tab with list of learned preferences
- [x] Empty state shown when no preferences exist
- [x] Toggle per preference updates `enabled` flag and saves
- [x] Delete removes preference from storage and UI
- [x] Clear All (with confirm) empties the preference list
- [x] Export JSON downloads valid JSON file
- [x] Import JSON reads, validates, saves, and re-renders
- [x] Three new sandbox handlers (`update-preference`, `delete-preference`, `clear-preferences`) work correctly
- [x] `cd figmento && npm run build` passes clean

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | @sm (River) | Story drafted from PRD-004 Phase 4c §5 US-5. New preferences-panel.ts + 3 sandbox CRUD handlers + Settings tab HTML/CSS. |
| 2026-03-13 | @po (Pax) | Validated 7/10. Added LC-8 dependency, explicit OUT OF SCOPE note for edit UI, XSS risk warning in Dev Notes (innerHTML with user-derived fields), PRD US-5 deviation note (delete vs reset deferred). Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Implemented. preferences-panel.ts created with XSS-safe DOM construction (textContent for all user-derived fields). 3 sandbox handlers added to code.ts. HTML+CSS added to ui.html. initPreferencesPanel + reloadPreferencesPanel wired into index.ts (initChatSettings call site + tab click handler). Build clean: 594.7KB code.js, 2179.9KB ui.html. |
