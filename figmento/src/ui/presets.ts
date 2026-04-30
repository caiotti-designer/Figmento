/**
 * Frame Presets UI controller (user-facing label: "Templates")
 *
 * Owns the Templates dropdown next to the chat input toolbar:
 *   - Lists user-saved presets (top section)
 *   - Lists Caiotti built-in presets
 *   - Provides "Save Selection as Template…" entry
 *
 * Save flow:
 *   click → ask sandbox to capture selection → on success show name modal →
 *   on submit ask sandbox to persist → refresh menu.
 *
 * Companion: src/handlers/presets.ts (sandbox side)
 */

interface PresetFrame {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: { r: number; g: number; b: number };
  cornerRadius?: number;
}

interface Preset {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  scope: 'builtin' | 'user';
  createdAt?: number;
  frames: PresetFrame[];
}

interface PresetListResult {
  type: 'preset-list-result';
  builtin: Preset[];
  user: Preset[];
}

const post = (msg: unknown) => parent.postMessage({ pluginMessage: msg }, '*');

let cachedBuiltin: Preset[] = [];
let cachedUser: Preset[] = [];
let pendingFrames: PresetFrame[] = []; // frames captured during Save flow, awaiting name

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// ═══════════════════════════════════════════════════════════════
// MENU RENDER
// ═══════════════════════════════════════════════════════════════

function renderTemplatesMenu(): void {
  const dropdown = $('templatesDropdown');
  if (!dropdown) return;

  dropdown.innerHTML = '';

  // ─── My Templates section
  const myLabel = document.createElement('div');
  myLabel.className = 'dropdown-label';
  myLabel.textContent = 'My Templates';
  dropdown.appendChild(myLabel);

  if (cachedUser.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'preset-item-empty';
    empty.textContent = 'Save a selection to start your library.';
    dropdown.appendChild(empty);
  } else {
    for (const p of cachedUser) {
      dropdown.appendChild(buildPresetRow(p, true));
    }
  }

  // ─── Caiotti Presets section
  const divider1 = document.createElement('div');
  divider1.className = 'dropdown-divider';
  dropdown.appendChild(divider1);

  const builtinLabel = document.createElement('div');
  builtinLabel.className = 'dropdown-label';
  builtinLabel.textContent = 'Caiotti Presets';
  dropdown.appendChild(builtinLabel);

  for (const p of cachedBuiltin) {
    dropdown.appendChild(buildPresetRow(p, false));
  }

  // ─── Save Selection action
  const divider2 = document.createElement('div');
  divider2.className = 'dropdown-divider';
  dropdown.appendChild(divider2);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'preset-save-action';
  saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Save Selection as Template…</span>`;
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.remove('open');
    post({ type: 'preset-capture-selection' });
  });
  dropdown.appendChild(saveBtn);
}

function buildPresetRow(p: Preset, isUser: boolean): HTMLElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'preset-item';
  item.dataset.presetId = p.id;
  item.dataset.scope = p.scope;
  item.title = p.description || `${p.name} (${p.frames.length} frames)`;

  const icon = document.createElement('span');
  icon.className = 'preset-item-icon';
  icon.textContent = p.icon || '▢';

  const body = document.createElement('span');
  body.className = 'preset-item-body';
  const name = document.createElement('span');
  name.className = 'preset-item-name';
  name.textContent = p.name;
  const desc = document.createElement('span');
  desc.className = 'preset-item-desc';
  desc.textContent = p.description || `${p.frames.length} frame${p.frames.length === 1 ? '' : 's'}`;
  body.appendChild(name);
  body.appendChild(desc);

  item.appendChild(icon);
  item.appendChild(body);

  if (isUser) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'preset-item-delete';
    del.title = 'Delete template';
    del.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${p.name}"?`)) return;
      post({ type: 'preset-delete', presetId: p.id });
    });
    item.appendChild(del);
  }

  item.addEventListener('click', () => {
    const dropdown = $('templatesDropdown');
    dropdown?.classList.remove('open');
    post({ type: 'preset-instantiate', presetId: p.id, scope: p.scope });
  });

  return item;
}

// ═══════════════════════════════════════════════════════════════
// SAVE MODAL
// ═══════════════════════════════════════════════════════════════

function openSaveModal(frames: PresetFrame[]): void {
  pendingFrames = frames;
  const modal = $('presetSaveModal');
  const hint = $('presetSaveHint');
  const input = $('presetSaveInput') as HTMLInputElement | null;
  const confirm = $('presetSaveConfirm') as HTMLButtonElement | null;
  if (!modal || !input || !confirm) return;

  if (hint) hint.textContent = `Captured ${frames.length} frame${frames.length === 1 ? '' : 's'}`;
  input.value = '';
  confirm.disabled = true;
  modal.classList.add('open');
  setTimeout(() => input.focus(), 50);
}

function closeSaveModal(): void {
  $('presetSaveModal')?.classList.remove('open');
  pendingFrames = [];
}

function initSaveModal(): void {
  const modal = $('presetSaveModal');
  const input = $('presetSaveInput') as HTMLInputElement | null;
  const cancel = $('presetSaveCancel');
  const confirm = $('presetSaveConfirm') as HTMLButtonElement | null;

  if (!modal || !input || !cancel || !confirm) return;

  input.addEventListener('input', () => {
    confirm.disabled = input.value.trim().length === 0;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !confirm.disabled) {
      e.preventDefault();
      confirm.click();
    } else if (e.key === 'Escape') {
      closeSaveModal();
    }
  });

  cancel.addEventListener('click', closeSaveModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSaveModal();
  });

  confirm.addEventListener('click', () => {
    const name = input.value.trim();
    if (!name || pendingFrames.length === 0) return;
    post({ type: 'preset-save', name, frames: pendingFrames });
    closeSaveModal();
  });
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLER (sandbox → UI)
// ═══════════════════════════════════════════════════════════════

function handlePresetMessage(msg: any): void {
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'preset-list-result': {
      const result = msg as PresetListResult;
      cachedBuiltin = result.builtin || [];
      cachedUser = result.user || [];
      renderTemplatesMenu();
      break;
    }
    case 'preset-capture-result':
      openSaveModal(msg.frames || []);
      break;
    case 'preset-capture-error':
      alert(msg.message || 'Could not capture selection.');
      break;
    case 'preset-saved':
      // Refresh list to show the new entry
      post({ type: 'preset-list' });
      break;
    case 'preset-deleted':
      post({ type: 'preset-list' });
      break;
    case 'preset-save-error':
    case 'preset-instantiate-error':
      alert(msg.message || 'Template error.');
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC ENTRY
// ═══════════════════════════════════════════════════════════════

export function initPresets(): void {
  initSaveModal();

  // Listen for sandbox messages
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (msg) handlePresetMessage(msg);
  });

  // Initial fetch
  post({ type: 'preset-list' });
}
