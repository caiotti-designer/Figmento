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
  const CONF_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sorted = [...prefs].sort((a, b) => {
    const d = (CONF_ORDER[a.confidence] ?? 2) - (CONF_ORDER[b.confidence] ?? 2);
    return d !== 0 ? d : b.correctionCount - a.correctionCount;
  });

  for (const pref of sorted) {
    const li = document.createElement('li');
    li.className = `pref-card${pref.enabled === false ? ' disabled' : ''}`;
    li.dataset.id = pref.id;

    // ── Card header ──────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'pref-card-header';

    const name = document.createElement('span');
    name.className = 'pref-card-name';
    name.textContent = `${pref.context} ${pref.property}`;

    const badgeClass = pref.confidence === 'high' ? 'high' : pref.confidence === 'medium' ? 'medium' : 'low';
    const badgeText = pref.confidence === 'high' ? 'HIGH' : pref.confidence === 'medium' ? 'MED' : 'LOW';
    const badge = document.createElement('span');
    badge.className = `pref-confidence-badge ${badgeClass}`;
    badge.textContent = badgeText;

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'relay-toggle-label';
    toggleLabel.title = pref.enabled !== false ? 'Enabled' : 'Disabled';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.className = 'pref-toggle';
    toggleInput.dataset.id = pref.id;
    toggleInput.checked = pref.enabled !== false;
    toggleLabel.appendChild(toggleInput);

    header.append(name, badge, toggleLabel);

    // ── Description ───────────────────────────────────────────
    const desc = document.createElement('div');
    desc.className = 'pref-card-description';
    desc.textContent = pref.description;

    // ── Meta row ──────────────────────────────────────────────
    const meta = document.createElement('div');
    meta.className = 'pref-card-meta';

    const metaText = document.createElement('span');
    metaText.textContent = `${pref.correctionCount} correction${pref.correctionCount === 1 ? '' : 's'} · ${formatDate(pref.lastSeenAt)}`;

    const delBtn = document.createElement('button');
    delBtn.className = 'pref-card-delete';
    delBtn.dataset.id = pref.id;
    delBtn.title = 'Delete preference';
    delBtn.textContent = '×';

    meta.append(metaText, delBtn);

    li.append(header, desc, meta);
    list.appendChild(li);
  }

  // Toggle events
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

  // Delete events
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
  // Listen for sandbox responses (persistent listener — survives multiple tab opens)
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
        if (!Array.isArray(parsed)) {
          alert('Invalid file: expected a JSON array.');
          return;
        }
        currentPreferences = parsed as LearnedPreference[];
        postToSandbox({ type: 'save-preferences', preferences: currentPreferences });
        renderPreferences(currentPreferences);
      } catch {
        alert('Invalid JSON file.');
      }
      importInput.value = '';
    };
    reader.readAsText(file);
  });
}

export function reloadPreferencesPanel(): void {
  loadPreferences();
}
