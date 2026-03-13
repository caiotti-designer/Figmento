/**
 * diff-panel.ts
 *
 * Renders the "Learn from my edits" diff summary panel in the chat area.
 * Shows detected corrections with confirm/dismiss per-entry checkboxes.
 *
 * Depends on: LC-4 (compare-snapshot + save-corrections sandbox handlers)
 */

import type { CorrectionEntry } from '../types';

// ── Category icons ────────────────────────────────────────────────────────────

export function getCategoryIcon(category: string): string {
  switch (category) {
    case 'typography': return '🔤';
    case 'color':      return '🎨';
    case 'spacing':    return '📐';
    case 'shape':      return '⬜';
    default:           return '✏️';
  }
}

// ── Value formatting ──────────────────────────────────────────────────────────

export function formatValue(property: string, value: unknown): string {
  if (value === null || value === undefined) return '—';

  const numericPxProps = new Set([
    'width', 'height', 'x', 'y', 'fontSize', 'cornerRadius',
    'itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'lineHeight', 'strokeWeight',
  ]);

  if (numericPxProps.has(property)) {
    return `${Math.round(value as number)}px`;
  }
  if (property === 'opacity') {
    return `${Math.round((value as number) * 100)}%`;
  }
  if (property === 'fontWeight') {
    return String(value);
  }
  if (property === 'letterSpacing') {
    return `${((value as number) * 1000) / 10}%`;
  }
  if (typeof value === 'string') return value;
  return String(value);
}

// ── Color swatch ─────────────────────────────────────────────────────────────

export function renderColorSwatch(hex: string): HTMLElement {
  const swatch = document.createElement('span');
  swatch.className = 'diff-swatch';
  swatch.style.backgroundColor = hex;
  swatch.title = hex;
  return swatch;
}

// ── Panel renderer ────────────────────────────────────────────────────────────

/**
 * Renders the diff summary panel for a set of corrections.
 * Returns an HTMLElement with the panel + save/dismiss buttons.
 * Calls `onSave(confirmedEntries)` and `onDismiss()` as callbacks.
 */
export function renderDiffPanel(
  corrections: CorrectionEntry[],
  onSave: (confirmed: CorrectionEntry[]) => void,
  onDismiss: () => void
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'diff-panel';
  panel.id = 'learn-diff-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'diff-panel-header';
  header.textContent = `🔍 Detected ${corrections.length} change${corrections.length === 1 ? '' : 's'}`;
  panel.appendChild(header);

  // Track which entries are checked
  const checkedState = new Map<string, boolean>(corrections.map(c => [c.id, true]));

  // Save button ref (updated dynamically)
  let saveBtn: HTMLButtonElement;

  function updateSaveLabel() {
    const count = [...checkedState.values()].filter(Boolean).length;
    if (saveBtn) saveBtn.textContent = `Save ${count} correction${count === 1 ? '' : 's'}`;
  }

  // Entries
  const entriesContainer = document.createElement('div');
  for (const entry of corrections) {
    const row = document.createElement('div');
    row.className = 'diff-entry';

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      checkedState.set(entry.id, checkbox.checked);
      updateSaveLabel();
    });
    row.appendChild(checkbox);

    // Info
    const info = document.createElement('div');
    info.className = 'diff-entry-info';

    const nodeName = document.createElement('div');
    nodeName.className = 'diff-entry-node';
    nodeName.textContent = `${getCategoryIcon(entry.category)} ${entry.nodeName}`;
    info.appendChild(nodeName);

    const change = document.createElement('div');
    change.className = 'diff-entry-change';

    // For color entries, show swatches
    if (entry.category === 'color' && entry.property === 'fills') {
      const bHex = String(entry.beforeValue);
      const aHex = String(entry.afterValue);
      if (bHex.startsWith('#')) change.appendChild(renderColorSwatch(bHex));
      const arrow = document.createElement('span');
      arrow.textContent = ` ${bHex} → `;
      change.appendChild(arrow);
      if (aHex.startsWith('#')) change.appendChild(renderColorSwatch(aHex));
      const after = document.createElement('span');
      after.textContent = aHex;
      change.appendChild(after);
    } else {
      const label = document.createElement('span');
      label.textContent = `${entry.property}: ${formatValue(entry.property, entry.beforeValue)} → ${formatValue(entry.property, entry.afterValue)}`;
      change.appendChild(label);
    }

    info.appendChild(change);
    row.appendChild(info);
    entriesContainer.appendChild(row);
  }
  panel.appendChild(entriesContainer);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'diff-panel-actions';

  saveBtn = document.createElement('button');
  saveBtn.className = 'diff-save-btn';
  updateSaveLabel();
  saveBtn.addEventListener('click', () => {
    const confirmed = corrections.filter(c => checkedState.get(c.id) === true);
    onSave(confirmed);
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'diff-dismiss-btn';
  dismissBtn.textContent = 'Dismiss all';
  dismissBtn.addEventListener('click', () => onDismiss());

  actions.appendChild(saveBtn);
  actions.appendChild(dismissBtn);
  panel.appendChild(actions);

  return panel;
}
