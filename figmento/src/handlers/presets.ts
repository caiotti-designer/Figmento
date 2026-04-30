/// <reference types="@figma/plugin-typings" />

/**
 * Frame Presets (UI label: "Templates")
 *
 * One-click frame instantiation. User selects N frames, saves them as a preset,
 * and re-instantiates them at any time around the viewport center.
 *
 * Two scopes:
 *   - 'builtin' — Caiotti presets baked into code, never persisted
 *   - 'user'    — saved by the user, persisted in figma.clientStorage
 *
 * Naming note: this module is `presets` not `templates` because
 * handlers/templates.ts already exists for the legacy AI-fill (#-prefixed
 * placeholder) flow. UI surfaces "Templates" as the user-facing label.
 */

const STORAGE_KEY_USER_PRESETS = 'figmento-user-presets';
const PRESET_GAP = 100; // px gap when instantiating multi-frame presets

export interface PresetFrame {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: { r: number; g: number; b: number }; // optional bg fill (0-1)
  cornerRadius?: number;
}

export interface Preset {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  scope: 'builtin' | 'user';
  createdAt?: number;
  frames: PresetFrame[];
}

// ═══════════════════════════════════════════════════════════════
// BUILT-IN CAIOTTI PRESETS
// ═══════════════════════════════════════════════════════════════

function makeRow(count: number, w: number, h: number, prefix: string): PresetFrame[] {
  const frames: PresetFrame[] = [];
  for (let i = 0; i < count; i++) {
    frames.push({
      name: `${prefix} ${i + 1}`,
      x: i * (w + PRESET_GAP),
      y: 0,
      width: w,
      height: h,
    });
  }
  return frames;
}

function makeGrid(cols: number, rows: number, w: number, h: number, prefix: string): PresetFrame[] {
  const frames: PresetFrame[] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      i += 1;
      frames.push({
        name: `${prefix} ${i}`,
        x: c * (w + PRESET_GAP),
        y: r * (h + PRESET_GAP),
        width: w,
        height: h,
      });
    }
  }
  return frames;
}

const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'caiotti-instagram-carousel-9',
    name: 'Instagram Carousel × 9',
    icon: '📸',
    description: '9 frames · 1080×1350 · horizontal row',
    scope: 'builtin',
    frames: makeRow(9, 1080, 1350, 'Slide'),
  },
  {
    id: 'caiotti-pitch-deck-6',
    name: 'Pitch Deck × 6',
    icon: '📊',
    description: '6 frames · 1920×1080 · horizontal row',
    scope: 'builtin',
    frames: makeRow(6, 1920, 1080, 'Slide'),
  },
  {
    id: 'caiotti-mood-board-3x3',
    name: 'Mood Board 3×3',
    icon: '🎨',
    description: '9 squares · 800×800 · 3×3 grid',
    scope: 'builtin',
    frames: makeGrid(3, 3, 800, 800, 'Tile'),
  },
  {
    id: 'caiotti-web-hero-stack',
    name: 'Web Hero + 3 Sections',
    icon: '🌐',
    description: 'Hero 1440×800 + 3 sections 1440×600 · stacked',
    scope: 'builtin',
    frames: [
      { name: 'Hero', x: 0, y: 0, width: 1440, height: 800 },
      { name: 'Section 1', x: 0, y: 800 + PRESET_GAP, width: 1440, height: 600 },
      { name: 'Section 2', x: 0, y: 800 + (600 + PRESET_GAP) + PRESET_GAP, width: 1440, height: 600 },
      { name: 'Section 3', x: 0, y: 800 + 2 * (600 + PRESET_GAP) + PRESET_GAP, width: 1440, height: 600 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// STORAGE (user presets only)
// ═══════════════════════════════════════════════════════════════

async function loadUserPresets(): Promise<Preset[]> {
  const raw = await figma.clientStorage.getAsync(STORAGE_KEY_USER_PRESETS);
  if (!Array.isArray(raw)) return [];
  return raw as Preset[];
}

async function saveUserPresets(presets: Preset[]): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEY_USER_PRESETS, presets);
}

// ═══════════════════════════════════════════════════════════════
// SELECTION CAPTURE — read top-level selected frames, normalize to (0,0)
// ═══════════════════════════════════════════════════════════════

function captureSelectionAsFrames(): PresetFrame[] | { error: string } {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    return { error: 'Select one or more frames first.' };
  }

  // Filter to frame-like nodes (frames, components, instances, sections)
  const supported = selection.filter(
    (n): n is FrameNode | ComponentNode | InstanceNode | SectionNode =>
      n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE' || n.type === 'SECTION'
  );

  if (supported.length === 0) {
    return { error: 'Select frames, components, or sections (not loose layers).' };
  }

  // Find bounding box origin so positions are relative to (0,0)
  const minX = Math.min(...supported.map((n) => n.x));
  const minY = Math.min(...supported.map((n) => n.y));

  return supported.map((n) => {
    const frame: PresetFrame = {
      name: n.name,
      x: Math.round(n.x - minX),
      y: Math.round(n.y - minY),
      width: Math.round(n.width),
      height: Math.round(n.height),
    };
    // Capture solid bg fill if present (frames only)
    if (n.type === 'FRAME' || n.type === 'COMPONENT') {
      const fills = n.fills;
      if (Array.isArray(fills) && fills.length > 0 && fills[0].type === 'SOLID' && fills[0].visible !== false) {
        const c = (fills[0] as SolidPaint).color;
        frame.fill = { r: c.r, g: c.g, b: c.b };
      }
      if (typeof n.cornerRadius === 'number' && n.cornerRadius > 0) {
        frame.cornerRadius = n.cornerRadius;
      }
    }
    return frame;
  });
}

// ═══════════════════════════════════════════════════════════════
// INSTANTIATE — drop frames around viewport center
// ═══════════════════════════════════════════════════════════════

function instantiatePreset(preset: Preset): SceneNode[] {
  const center = figma.viewport.center;
  // Compute preset bounding box so we can center the whole group
  const maxX = Math.max(...preset.frames.map((f) => f.x + f.width));
  const maxY = Math.max(...preset.frames.map((f) => f.y + f.height));
  const offsetX = center.x - maxX / 2;
  const offsetY = center.y - maxY / 2;

  const created: SceneNode[] = [];
  for (const f of preset.frames) {
    const node = figma.createFrame();
    node.name = f.name;
    node.resize(f.width, f.height);
    node.x = offsetX + f.x;
    node.y = offsetY + f.y;
    if (f.fill) {
      node.fills = [{ type: 'SOLID', color: f.fill }];
    }
    if (typeof f.cornerRadius === 'number') {
      node.cornerRadius = f.cornerRadius;
    }
    figma.currentPage.appendChild(node);
    created.push(node);
  }

  if (created.length > 0) {
    figma.currentPage.selection = created;
    figma.viewport.scrollAndZoomIntoView(created);
  }

  return created;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════

interface PresetMessage {
  type: string;
  presetId?: string;
  scope?: 'builtin' | 'user';
  name?: string;
  icon?: string;
  description?: string;
  frames?: PresetFrame[];
}

/**
 * Handles preset-* messages. Returns true if message was handled.
 */
export async function handlePresetMessage(msg: PresetMessage): Promise<boolean> {
  switch (msg.type) {
    case 'preset-list': {
      const userPresets = await loadUserPresets();
      figma.ui.postMessage({
        type: 'preset-list-result',
        builtin: BUILTIN_PRESETS,
        user: userPresets,
      });
      return true;
    }

    case 'preset-capture-selection': {
      const result = captureSelectionAsFrames();
      if ('error' in result) {
        figma.ui.postMessage({ type: 'preset-capture-error', message: result.error });
      } else {
        figma.ui.postMessage({ type: 'preset-capture-result', frames: result });
      }
      return true;
    }

    case 'preset-save': {
      if (!msg.name || !Array.isArray(msg.frames) || msg.frames.length === 0) {
        figma.ui.postMessage({ type: 'preset-save-error', message: 'Missing name or frames.' });
        return true;
      }
      const userPresets = await loadUserPresets();
      const preset: Preset = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: msg.name.trim().slice(0, 80),
        icon: msg.icon,
        description: msg.description,
        scope: 'user',
        createdAt: Date.now(),
        frames: msg.frames,
      };
      userPresets.unshift(preset);
      await saveUserPresets(userPresets);
      figma.ui.postMessage({ type: 'preset-saved', preset });
      figma.notify(`Saved "${preset.name}"`);
      return true;
    }

    case 'preset-instantiate': {
      let preset: Preset | undefined;
      if (msg.scope === 'builtin') {
        preset = BUILTIN_PRESETS.find((p) => p.id === msg.presetId);
      } else if (msg.scope === 'user') {
        const userPresets = await loadUserPresets();
        preset = userPresets.find((p) => p.id === msg.presetId);
      }
      if (!preset) {
        figma.ui.postMessage({ type: 'preset-instantiate-error', message: 'Preset not found.' });
        return true;
      }
      const created = instantiatePreset(preset);
      figma.ui.postMessage({
        type: 'preset-instantiated',
        presetId: preset.id,
        nodeIds: created.map((n) => n.id),
      });
      figma.notify(`Inserted "${preset.name}" (${created.length} frame${created.length === 1 ? '' : 's'})`);
      return true;
    }

    case 'preset-delete': {
      if (!msg.presetId) return true;
      const userPresets = await loadUserPresets();
      const next = userPresets.filter((p) => p.id !== msg.presetId);
      await saveUserPresets(next);
      figma.ui.postMessage({ type: 'preset-deleted', presetId: msg.presetId });
      return true;
    }
  }
  return false;
}
