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

/** Deep tree node — opaque to the UI, just shuttled through for save. */
type PresetNode = Record<string, unknown>;

interface Preset {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  scope: 'builtin' | 'user';
  createdAt?: number;
  frames: PresetFrame[];
  nodes?: PresetNode[];
}

interface PresetListResult {
  type: 'preset-list-result';
  builtin: Preset[];
  user: Preset[];
}

const post = (msg: unknown) => parent.postMessage({ pluginMessage: msg }, '*');

let cachedBuiltin: Preset[] = [];
let cachedUser: Preset[] = [];
let pendingFrames: PresetFrame[] = []; // frame summary captured during Save flow
let pendingNodes: PresetNode[] = []; // deep tree captured during Save flow

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
    // v2.5 debug — export JSON to clipboard for repro/sharing
    const exp = document.createElement('button');
    exp.type = 'button';
    exp.className = 'preset-item-export';
    exp.title = 'Copy template JSON (debug)';
    exp.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    exp.addEventListener('click', (e) => {
      e.stopPropagation();
      post({ type: 'preset-export-json', presetId: p.id, scope: p.scope });
    });
    item.appendChild(exp);

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

function countLeafNodes(nodes: PresetNode[]): number {
  let total = 0;
  for (const n of nodes) {
    total += 1;
    const children = n.children;
    if (Array.isArray(children) && children.length > 0) {
      total += countLeafNodes(children as PresetNode[]);
    }
  }
  return total;
}

function openSaveModal(frames: PresetFrame[], nodes: PresetNode[]): void {
  pendingFrames = frames;
  pendingNodes = nodes;
  const modal = $('presetSaveModal');
  const hint = $('presetSaveHint');
  const input = $('presetSaveInput') as HTMLInputElement | null;
  const confirm = $('presetSaveConfirm') as HTMLButtonElement | null;
  if (!modal || !input || !confirm) return;

  const frameCount = frames.length;
  const nodeTotal = countLeafNodes(nodes);
  const layerSummary = nodeTotal > frameCount ? ` · ${nodeTotal} layers` : '';
  if (hint) hint.textContent = `Captured ${frameCount} frame${frameCount === 1 ? '' : 's'}${layerSummary}`;
  input.value = '';
  confirm.disabled = true;
  modal.classList.add('open');
  setTimeout(() => input.focus(), 50);
}

function closeSaveModal(): void {
  $('presetSaveModal')?.classList.remove('open');
  pendingFrames = [];
  pendingNodes = [];
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
    post({ type: 'preset-save', name, frames: pendingFrames, nodes: pendingNodes });
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
      openSaveModal(msg.frames || [], msg.nodes || []);
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
    case 'preset-export-json-result': {
      const json = typeof msg.json === 'string' ? msg.json : null;
      if (!json) {
        alert('Template not found.');
        break;
      }
      void copyToClipboard(json).then((ok) => {
        if (ok) {
          alert(`Template JSON copied to clipboard (${json.length.toLocaleString()} chars). Paste into a bug report or DM.`);
        } else {
          // Plugin iframe sometimes blocks navigator.clipboard — fall back to a textarea
          showJsonModal(json);
        }
      });
      break;
    }
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {/* falls through to legacy */}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function showJsonModal(text: string): void {
  // Minimal fallback — render a textarea the user can manually copy from
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.readOnly = true;
  ta.style.cssText = 'width:100%;height:80%;font-family:ui-monospace,Menlo,monospace;font-size:11px;padding:12px;background:#1a1a1a;color:#e0e0e0;border:1px solid #444;border-radius:6px;';
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.style.cssText = 'margin-top:12px;padding:8px 16px;';
  close.addEventListener('click', () => overlay.remove());
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;width:90%;max-width:720px;height:80%;';
  wrap.appendChild(ta);
  wrap.appendChild(close);
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);
  ta.select();
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
