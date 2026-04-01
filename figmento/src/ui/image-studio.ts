// IS-2: Image Studio — Reference Slot Manager + Session State
// IS-3: Prompt Box + Generation Integration
// IS-4: @Tag Autocomplete
// IS-5: Auto-Describe (Image Drop → Prompt)
// IS-6: Prompt Enhancement (✨ Enhance)
// IS-7: Generation History Panel
// IS-8: Send to Canvas Integration

import { compressImage } from './utils';
import { apiState } from './state';
import { getBridgeConnected, getBridgeChannelId } from './bridge';
import { getChatSettings } from './chat';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ReferenceType = 'style' | 'character' | 'content';

export interface ImageReference {
  id: string;
  name: string;
  type: ReferenceType;
  data: string;           // base64 (no prefix)
  mimeType: string;
  thumbnailDataUrl: string; // data URL for <img> src
  addedAt: number;
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const MAX_REFERENCES = 14;
const MAX_CHARACTER = 4;
const MAX_STYLE_CONTENT = 10;
const THUMB_SIZE = 48;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

let references: ImageReference[] = [];
let nameCounter = 0;

export function getReferences(): ImageReference[] { return references; }
export function getReferenceById(id: string): ImageReference | undefined {
  return references.find(r => r.id === id);
}
export function getReferenceByName(name: string): ImageReference | undefined {
  return references.find(r => r.name === name);
}

// ═══════════════════════════════════════════════════════════════
// REFERENCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function generateId(): string {
  return 'ref_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function nextName(): string {
  nameCounter++;
  return `img${nameCounter}`;
}

function countByCategory(): { character: number; styleContent: number; total: number } {
  let character = 0;
  let styleContent = 0;
  for (const ref of references) {
    if (ref.type === 'character') character++;
    else styleContent++;
  }
  return { character, styleContent, total: references.length };
}

function canAdd(type: ReferenceType): boolean {
  const counts = countByCategory();
  if (counts.total >= MAX_REFERENCES) return false;
  if (type === 'character' && counts.character >= MAX_CHARACTER) return false;
  if (type !== 'character' && counts.styleContent >= MAX_STYLE_CONTENT) return false;
  return true;
}

/** Compress and create thumbnail from a File */
async function processImageFile(file: File): Promise<{ data: string; mimeType: string; thumbnailDataUrl: string } | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      // Compress to max 2048px, quality 0.85
      const compressed = await compressImage(dataUrl, 2048, 2048, 0.85);
      // Extract base64 data (strip prefix)
      const data = compressed.replace(/^data:image\/\w+;base64,/, '');
      const mimeType = file.type || 'image/jpeg';

      // Generate thumbnail (48x48 center-crop)
      const thumbnailDataUrl = await generateThumbnail(compressed, THUMB_SIZE);

      resolve({ data, mimeType, thumbnailDataUrl });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function generateThumbnail(dataUrl: string, size: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }

      // Center-crop to square
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function addReference(file: File, type: ReferenceType): Promise<ImageReference | null> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    showToast('Only PNG, JPG, and WebP images are supported', 'error');
    return null;
  }
  if (!canAdd(type)) {
    const counts = countByCategory();
    if (type === 'character' && counts.character >= MAX_CHARACTER) {
      showToast(`Character limit reached (${MAX_CHARACTER} max)`, 'error');
    } else if (type !== 'character' && counts.styleContent >= MAX_STYLE_CONTENT) {
      showToast(`Style + Content limit reached (${MAX_STYLE_CONTENT} max)`, 'error');
    } else {
      showToast(`Reference limit reached (${MAX_REFERENCES} max)`, 'error');
    }
    return null;
  }

  const processed = await processImageFile(file);
  if (!processed) {
    showToast('Failed to process image', 'error');
    return null;
  }

  const ref: ImageReference = {
    id: generateId(),
    name: nextName(),
    type,
    data: processed.data,
    mimeType: processed.mimeType,
    thumbnailDataUrl: processed.thumbnailDataUrl,
    addedAt: Date.now(),
  };

  references.push(ref);
  renderReferences();
  return ref;
}

export function removeReference(id: string): void {
  references = references.filter(r => r.id !== id);
  stripRemovedRefTokens(id);
  renderReferences();
}

export function renameReference(id: string, newName: string): boolean {
  const sanitized = newName.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  if (!sanitized) return false;
  if (references.some(r => r.id !== id && r.name === sanitized)) {
    showToast('Name already in use', 'error');
    return false;
  }
  const ref = references.find(r => r.id === id);
  if (ref) {
    ref.name = sanitized;
    renderReferences();
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// UI RENDERING
// ═══════════════════════════════════════════════════════════════

function showToast(message: string, type: 'error' | 'success' = 'error'): void {
  const existing = document.querySelector('.is-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `is-toast is-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function renderReferences(): void {
  const container = document.getElementById('is-ref-slots');
  const counter = document.getElementById('is-ref-counter');
  if (!container) return;

  // Update counter
  const counts = countByCategory();
  if (counter) counter.textContent = `${counts.total}/${MAX_REFERENCES}`;

  container.innerHTML = '';

  // Render existing references grouped by type
  const typeOrder: ReferenceType[] = ['style', 'character', 'content'];
  for (const type of typeOrder) {
    const refs = references.filter(r => r.type === type);
    for (const ref of refs) {
      container.appendChild(createRefCard(ref));
    }
  }

  // Render category slot buttons
  const slots: { type: ReferenceType; icon: string; label: string }[] = [
    { type: 'style', icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', label: 'Style' },
    { type: 'character', icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', label: 'Character' },
  ];

  for (const slot of slots) {
    if (canAdd(slot.type)) {
      const el = document.createElement('div');
      el.className = 'is-ref-slot';
      el.dataset.type = slot.type;
      el.title = `Add ${slot.label} reference`;
      el.innerHTML = `<svg viewBox="0 0 24 24">${slot.icon}</svg><span>${slot.label}</span>`;
      el.addEventListener('click', () => openFilePicker(slot.type));
      setupSlotDropZone(el, slot.type);
      container.appendChild(el);
    }
  }

  // Always show "Add" (content) slot if under limit
  if (canAdd('content')) {
    const addEl = document.createElement('div');
    addEl.className = 'is-ref-slot';
    addEl.dataset.type = 'add';
    addEl.title = 'Add content reference';
    addEl.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add</span>';
    addEl.addEventListener('click', () => openFilePicker('content'));
    setupSlotDropZone(addEl, 'content');
    container.appendChild(addEl);
  }

  // Enable/disable generate button based on prompt
  updateGenerateState();
}

function createRefCard(ref: ImageReference): HTMLElement {
  const card = document.createElement('div');
  card.className = 'is-ref-card';
  card.dataset.refId = ref.id;

  const typeColors: Record<ReferenceType, string> = {
    style: '#3B82F6',
    character: '#22C55E',
    content: '#A855F7',
  };

  card.innerHTML = `
    <img class="is-ref-thumb" src="${ref.thumbnailDataUrl}" alt="${ref.name}" />
    <span class="is-ref-badge" style="background:${typeColors[ref.type]}20;color:${typeColors[ref.type]}">${ref.type[0].toUpperCase()}</span>
    <span class="is-ref-name" title="Click to rename">@${ref.name}</span>
    <button class="is-ref-remove" title="Remove">×</button>
  `;

  // Rename on click
  const nameEl = card.querySelector('.is-ref-name') as HTMLElement;
  nameEl.addEventListener('click', (e) => {
    e.stopPropagation();
    startInlineRename(ref.id, nameEl);
  });

  // Remove
  const removeBtn = card.querySelector('.is-ref-remove') as HTMLElement;
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeReference(ref.id);
  });

  return card;
}

function startInlineRename(refId: string, nameEl: HTMLElement): void {
  const ref = references.find(r => r.id === refId);
  if (!ref) return;

  const input = document.createElement('input');
  input.className = 'is-ref-rename-input';
  input.value = ref.name;
  input.maxLength = 20;

  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = (save: boolean) => {
    if (save) {
      const newName = input.value.trim();
      if (newName && newName !== ref.name) {
        renameReference(refId, newName);
        return; // renderReferences will rebuild
      }
    }
    // Restore original name display
    renderReferences();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

// ═══════════════════════════════════════════════════════════════
// FILE PICKER + DRAG & DROP
// ═══════════════════════════════════════════════════════════════

let fileInput: HTMLInputElement | null = null;
let pendingType: ReferenceType = 'content';

function openFilePicker(type: ReferenceType): void {
  pendingType = type;
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.png,.jpg,.jpeg,.webp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', handleFileSelect);
  }
  fileInput.value = '';
  fileInput.click();
}

function handleFileSelect(): void {
  if (!fileInput?.files?.length) return;
  const file = fileInput.files[0];
  addReference(file, pendingType);
}

function setupSlotDropZone(el: HTMLElement, type: ReferenceType): void {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('is-ref-slot-dragover');
  });
  el.addEventListener('dragleave', (e) => {
    e.preventDefault();
    el.classList.remove('is-ref-slot-dragover');
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('is-ref-slot-dragover');
    const files = e.dataTransfer?.files;
    if (files?.length) {
      addReference(files[0], type);
    }
  });
}

// Also support drag & drop on the entire references section
function setupReferenceSectionDrop(): void {
  const section = document.getElementById('is-ref-slots')?.parentElement;
  if (!section) return;

  section.addEventListener('dragover', (e) => {
    e.preventDefault();
    section.classList.add('is-section-dragover');
  });
  section.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Only remove if leaving the section entirely
    if (!section.contains(e.relatedTarget as Node)) {
      section.classList.remove('is-section-dragover');
    }
  });
  section.addEventListener('drop', (e) => {
    e.preventDefault();
    section.classList.remove('is-section-dragover');
    const files = e.dataTransfer?.files;
    if (files?.length) {
      addReference(files[0], 'content');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// IS-3: GENERATION
// ═══════════════════════════════════════════════════════════════

let currentAspectRatio = '1:1';
let currentResolution = '1K';
let consistencyMode = true;
let isGenerating = false;

export function getGenerationConfig() {
  return {
    aspectRatio: currentAspectRatio,
    resolution: currentResolution,
    consistencyMode,
    references: consistencyMode ? references : [],
  };
}

function updateGenerateState(): void {
  const btn = document.getElementById('is-generate') as HTMLButtonElement | null;
  const prompt = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  if (btn && prompt) {
    btn.disabled = !prompt.value.trim() || isGenerating;
  }
}

// Aspect ratio options with labels and icons
const ASPECT_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: '1:1',  label: 'Square',             icon: '◻' },
  { value: '16:9', label: 'Widescreen',         icon: '▬' },
  { value: '9:16', label: 'Social story',       icon: '▮' },
  { value: '4:3',  label: 'Classic',            icon: '▭' },
  { value: '3:4',  label: 'Portrait classic',   icon: '▯' },
  { value: '4:5',  label: 'Social post',        icon: '▯' },
  { value: '5:4',  label: 'Landscape post',     icon: '▭' },
  { value: '3:2',  label: 'Photo landscape',    icon: '▬' },
  { value: '2:3',  label: 'Photo portrait',     icon: '▮' },
  { value: '21:9', label: 'Ultrawide',          icon: '━' },
  { value: '1:4',  label: 'Vertical banner',    icon: '▏' },
  { value: '1:8',  label: 'Vertical panoramic', icon: '▏' },
  { value: '8:1',  label: 'Panoramic',          icon: '━' },
  { value: '4:1',  label: 'Banner',             icon: '━' },
];

/** Map aspect ratio + resolution to pixel dimensions */
function getPixelDimensions(aspect: string, resolution: string): { width: number; height: number } {
  const baseSize: Record<string, number> = { '512': 512, '1K': 1024, '2K': 2048, '4K': 4096 };
  const base = baseSize[resolution] || 1024;

  const parts = aspect.split(':').map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { width: base, height: base };

  const [w, h] = parts;
  const ratio = w / h;

  if (ratio >= 1) {
    return { width: base, height: Math.round(base / ratio) };
  } else {
    return { width: Math.round(base * ratio), height: base };
  }
}

function setupControls(): void {
  const controlsContainer = document.getElementById('is-controls');
  if (!controlsContainer) return;

  controlsContainer.innerHTML = '';

  // Aspect ratio dropdown
  const aspectWrapper = document.createElement('div');
  aspectWrapper.className = 'is-dropdown-wrapper';
  aspectWrapper.innerHTML = `
    <button class="is-control-chip" id="is-aspect">
      <span class="is-chip-icon">⬒</span>
      <span class="is-chip-value">${currentAspectRatio}</span>
      <svg class="is-chip-arrow" viewBox="0 0 24 24" width="10" height="10"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="is-dropdown" id="is-aspect-dropdown"></div>
  `;
  controlsContainer.appendChild(aspectWrapper);

  const aspectBtn = aspectWrapper.querySelector('#is-aspect')!;
  const aspectDropdown = aspectWrapper.querySelector('#is-aspect-dropdown') as HTMLElement;

  // Populate dropdown
  aspectDropdown.innerHTML = ASPECT_OPTIONS.map(opt => `
    <div class="is-dropdown-item ${opt.value === currentAspectRatio ? 'is-dropdown-selected' : ''}" data-value="${opt.value}">
      <span class="is-dropdown-icon">${opt.icon}</span>
      <span class="is-dropdown-label">${opt.value}</span>
      <span class="is-dropdown-desc">${opt.label}</span>
    </div>
  `).join('');

  aspectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = aspectDropdown.classList.contains('is-dropdown-open');
    closeAllDropdowns();
    if (!isOpen) aspectDropdown.classList.add('is-dropdown-open');
  });

  aspectDropdown.querySelectorAll('.is-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      currentAspectRatio = (item as HTMLElement).dataset.value!;
      aspectBtn.querySelector('.is-chip-value')!.textContent = currentAspectRatio;
      aspectDropdown.querySelectorAll('.is-dropdown-item').forEach(i => i.classList.remove('is-dropdown-selected'));
      item.classList.add('is-dropdown-selected');
      closeAllDropdowns();
    });
  });

  // Resolution chip (cycle)
  const resChip = createControlChip('is-res', '◫', currentResolution);
  resChip.addEventListener('click', () => {
    const options = ['512', '1K', '2K', '4K'];
    const idx = options.indexOf(currentResolution);
    currentResolution = options[(idx + 1) % options.length];
    resChip.querySelector('.is-chip-value')!.textContent = currentResolution;
  });
  controlsContainer.appendChild(resChip);

  // Consistency toggle
  const consistChip = createControlChip('is-consist', '∞', consistencyMode ? 'ON' : 'OFF');
  consistChip.addEventListener('click', () => {
    consistencyMode = !consistencyMode;
    consistChip.querySelector('.is-chip-value')!.textContent = consistencyMode ? 'ON' : 'OFF';
    consistChip.classList.toggle('is-chip-active', consistencyMode);
  });
  consistChip.classList.toggle('is-chip-active', consistencyMode);
  controlsContainer.appendChild(consistChip);

  // Close dropdowns on outside click
  document.addEventListener('click', closeAllDropdowns);
}

function closeAllDropdowns(): void {
  document.querySelectorAll('.is-dropdown-open').forEach(d => d.classList.remove('is-dropdown-open'));
}

function createControlChip(id: string, icon: string, value: string): HTMLElement {
  const chip = document.createElement('button');
  chip.className = 'is-control-chip';
  chip.id = id;
  chip.innerHTML = `<span class="is-chip-icon">${icon}</span><span class="is-chip-value">${value}</span>`;
  return chip;
}

function setupPrompt(): void {
  const prompt = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  if (!prompt) return;
  prompt.disabled = false;
  // Input and keydown handled by setupTagAutocomplete (IS-4)
}

function setupGenerateButton(): void {
  const btn = document.getElementById('is-generate') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = false;
  btn.addEventListener('click', triggerGeneration);
}

async function triggerGeneration(): Promise<void> {
  const prompt = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  const btn = document.getElementById('is-generate') as HTMLButtonElement | null;
  if (!prompt || !btn || isGenerating) return;

  const rawValue = prompt.value.trim();
  if (!rawValue) return;

  isGenerating = true;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm"></div> Generating...';

  // IS-4: Resolve @tags and build proper prompt
  const { prompt: cleanPrompt, taggedRefs } = buildTaggedParts(rawValue);

  // Collect references to send: tagged refs always included
  // In consistency mode, also include non-tagged refs
  let refsToSend: ImageReference[];
  if (consistencyMode) {
    // All refs, but tagged ones first (in prompt order)
    const taggedIds = new Set(taggedRefs.map(r => r.id));
    refsToSend = [...taggedRefs, ...references.filter(r => !taggedIds.has(r.id))];
  } else {
    // Only @tagged refs
    refsToSend = taggedRefs;
  }

  // Build labeled prompt with reference role prefixes
  let labeledPrompt = '';
  const roleLabels: Record<ReferenceType, string> = {
    style: 'Style reference',
    character: 'Character reference',
    content: 'Content reference',
  };
  refsToSend.forEach((ref, i) => {
    const isTagged = taggedRefs.some(r => r.id === ref.id);
    const label = isTagged
      ? `Image ${i + 1} (@${ref.name} — ${roleLabels[ref.type]})`
      : `Image ${i + 1} (Reference image)`;
    labeledPrompt += `${label}:\n`;
  });
  labeledPrompt += cleanPrompt;

  try {
    const result = await callImageGeneration(labeledPrompt, refsToSend, currentAspectRatio, currentResolution);

    if (result?.imageBase64) {
      showGenerationResult(result.imageBase64, result.mimeType || 'image/png');
      addToHistory(result.imageBase64, result.mimeType || 'image/png', rawValue);
    } else {
      showGenerationError('No image returned. Try a different prompt.');
    }
  } catch (err: any) {
    showGenerationError(err.message || 'Generation failed');
  } finally {
    isGenerating = false;
    btn.disabled = false;
    btn.innerHTML = 'Generate <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    updateGenerateState();
  }
}

async function callImageGeneration(
  prompt: string,
  refs: ImageReference[],
  aspectRatio: string,
  resolution: string,
): Promise<{ imageBase64: string; mimeType: string } | null> {
  const geminiKey = getGeminiKey();
  if (!geminiKey) {
    throw new Error('Gemini API key not set. Configure in Settings → Image Generation.');
  }

  // Try relay first if connected, otherwise call Gemini REST API directly
  if (getBridgeConnected() && getChannel()) {
    try {
      return await callViaRelay(prompt, refs, aspectRatio, resolution, geminiKey);
    } catch {
      // Relay failed — fall through to direct API
    }
  }

  return await callGeminiDirect(prompt, refs, aspectRatio, resolution, geminiKey);
}

/** Direct Gemini REST API call — works without relay/bridge */
async function callGeminiDirect(
  prompt: string,
  refs: ImageReference[],
  aspectRatio: string,
  resolution: string,
  apiKey: string,
): Promise<{ imageBase64: string; mimeType: string } | null> {
  const model = 'gemini-3.1-flash-image-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build parts: reference images (labeled) + prompt text
  const parts: any[] = [];
  refs.forEach((ref, i) => {
    parts.push({ text: `Image ${i + 1}:` });
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
  });
  parts.push({ text: prompt });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      ...(aspectRatio && { imageConfig: { aspectRatio } }),
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = 'Gemini API error';
    try {
      const errJson = JSON.parse(errText);
      msg = errJson.error?.message || msg;
    } catch { msg = errText.slice(0, 200); }
    throw new Error(msg);
  }

  const data = await response.json();

  // Extract image from response
  const candidates = data.candidates || [];
  for (const candidate of candidates) {
    const candidateParts = candidate.content?.parts || [];
    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        return {
          imageBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }
  }

  return null;
}

/** Relay-based generation (original path) */
async function callViaRelay(
  prompt: string,
  refs: ImageReference[],
  aspectRatio: string,
  resolution: string,
  apiKey: string,
): Promise<{ imageBase64: string; mimeType: string } | null> {
  const relayUrl = getRelayUrl();
  const channel = getChannel();
  const referenceImages = refs.map(ref => ({ data: ref.data, mimeType: ref.mimeType }));

  const response = await fetch(`${relayUrl}/api/chat/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel,
      provider: 'gemini',
      model: 'gemini-3.1-flash-image-preview',
      mode: 'image-studio',
      message: prompt,
      referenceImages,
      imageConfig: { aspectRatio, imageSize: resolution },
      geminiKey: apiKey,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Relay error: ${text.slice(0, 200)}`);
  }

  return await response.json();
}

function clearPreview(): void {
  const preview = document.getElementById('is-preview');
  if (preview) {
    preview.style.display = 'none';
    preview.innerHTML = '';
  }
}

// Track last generation dimensions for Send to Canvas
let lastGenDimensions = { width: 512, height: 512 };

function showGenerationResult(base64: string, mimeType: string): void {
  lastGenDimensions = getPixelDimensions(currentAspectRatio, currentResolution);
  const preview = document.getElementById('is-preview');
  if (!preview) return;

  const dims = lastGenDimensions;
  preview.innerHTML = `
    <div class="is-preview-image-wrap">
      <img src="data:${mimeType};base64,${base64}" alt="Generated image" />
    </div>
    <div class="is-preview-bar">
      <span class="is-preview-meta">${currentAspectRatio} · ${currentResolution} · ${dims.width}×${dims.height}</span>
      <button class="is-preview-send-btn" id="is-preview-canvas">Send to Canvas</button>
    </div>
  `;
  preview.style.display = 'block';

  // Wire Send to Canvas button
  document.getElementById('is-preview-canvas')?.addEventListener('click', () => {
    const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
    const promptText = textarea ? getCleanPrompt(textarea.value) : 'Image Studio';
    sendToCanvas(base64, mimeType, promptText);
  });
}

function showGenerationError(message: string): void {
  const preview = document.getElementById('is-preview');
  if (!preview) return;
  preview.innerHTML = `<div class="is-preview-error">${message}<button class="is-retry-btn" onclick="document.getElementById('is-generate')?.click()">Retry</button></div>`;
  preview.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// IS-4: @TAG AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════════

// Token format in textarea: {{ref:id}} — overlay renders as colored chips
const TAG_TOKEN_RE = /\{\{ref:([^}]+)\}\}/g;
let autocompleteDropdown: HTMLElement | null = null;
let autocompleteActive = false;
let autocompleteFilter = '';
let autocompleteSelectedIdx = 0;

/** Extract @tag tokens from raw textarea value, return ref IDs in order */
export function extractTaggedRefIds(rawValue: string): string[] {
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(TAG_TOKEN_RE.source, 'g');
  while ((match = re.exec(rawValue)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

/** Build the display HTML from raw textarea value (tokens → chips) */
function renderOverlay(rawValue: string): string {
  const typeColors: Record<ReferenceType, string> = {
    style: '#3B82F6',
    character: '#22C55E',
    content: '#A855F7',
  };
  return rawValue.replace(TAG_TOKEN_RE, (_, id) => {
    const ref = getReferenceById(id);
    if (!ref) return '⚠️';
    const color = typeColors[ref.type];
    return `<span class="is-tag-chip" style="background:${color}20;color:${color};border:1px solid ${color}40">@${ref.name}</span>`;
  });
}

/** Get clean prompt text for API (tokens replaced with @names) */
function getCleanPrompt(rawValue: string): string {
  return rawValue.replace(TAG_TOKEN_RE, (_, id) => {
    const ref = getReferenceById(id);
    return ref ? `@${ref.name}` : '';
  }).trim();
}

/** Build labeled API parts from @tagged references */
export function buildTaggedParts(rawValue: string): { prompt: string; taggedRefs: ImageReference[] } {
  const ids = extractTaggedRefIds(rawValue);
  const taggedRefs: ImageReference[] = [];
  for (const id of ids) {
    const ref = getReferenceById(id);
    if (ref && !taggedRefs.some(r => r.id === ref.id)) {
      taggedRefs.push(ref);
    }
  }
  return { prompt: getCleanPrompt(rawValue), taggedRefs };
}

function setupTagAutocomplete(): void {
  const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  const overlay = document.getElementById('is-prompt-overlay');
  if (!textarea || !overlay) return;

  // Sync overlay on every input
  textarea.addEventListener('input', () => {
    syncOverlay();
    checkForAtTrigger();
    updateGenerateState();
  });

  // Keyboard navigation for autocomplete
  textarea.addEventListener('keydown', (e) => {
    if (autocompleteActive) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveAutocomplete(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveAutocomplete(-1); return; }
      if (e.key === 'Enter') { e.preventDefault(); selectAutocomplete(); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeAutocomplete(); return; }
    }
    // Ctrl+Enter still generates
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      triggerGeneration();
    }
  });

  // Close autocomplete on blur
  textarea.addEventListener('blur', () => {
    setTimeout(closeAutocomplete, 150); // delay so click on dropdown registers
  });

  // Sync scroll
  textarea.addEventListener('scroll', () => {
    overlay.scrollTop = textarea.scrollTop;
  });
}

function syncOverlay(): void {
  const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  const overlay = document.getElementById('is-prompt-overlay');
  if (!textarea || !overlay) return;

  // Render tokens as chips, escape HTML for rest
  const raw = textarea.value;
  let html = '';
  let lastIdx = 0;
  const re = new RegExp(TAG_TOKEN_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(raw)) !== null) {
    // Escape the text before the token
    html += escapeHtml(raw.slice(lastIdx, match.index));
    // Render chip
    const ref = getReferenceById(match[1]);
    if (ref) {
      const typeColors: Record<ReferenceType, string> = { style: '#3B82F6', character: '#22C55E', content: '#A855F7' };
      const color = typeColors[ref.type];
      html += `<span class="is-tag-chip" style="background:${color}20;color:${color};border:1px solid ${color}40">@${ref.name}</span>`;
    } else {
      html += escapeHtml(match[0]);
    }
    lastIdx = match.index + match[0].length;
  }
  html += escapeHtml(raw.slice(lastIdx));

  // Add trailing space so the overlay sizing matches
  if (html.endsWith('\n') || html === '') html += '\n';

  overlay.innerHTML = html;
  overlay.scrollTop = textarea.scrollTop;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function checkForAtTrigger(): void {
  const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  if (!textarea) return;

  const pos = textarea.selectionStart;
  const value = textarea.value;

  // Check if we're inside a token — if so, don't trigger
  const re = new RegExp(TAG_TOKEN_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    if (pos > match.index && pos <= match.index + match[0].length) return;
  }

  // Find the @ before cursor that isn't inside a token
  const beforeCursor = value.slice(0, pos);
  const atMatch = beforeCursor.match(/@([a-zA-Z0-9_]*)$/);

  if (atMatch) {
    autocompleteFilter = atMatch[1].toLowerCase();
    showAutocomplete(atMatch.index!);
  } else {
    closeAutocomplete();
  }
}

function showAutocomplete(atPos: number): void {
  const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  if (!textarea || references.length === 0) {
    closeAutocomplete();
    return;
  }

  const filtered = references.filter(r =>
    r.name.toLowerCase().includes(autocompleteFilter)
  );

  if (filtered.length === 0) {
    closeAutocomplete();
    return;
  }

  if (!autocompleteDropdown) {
    autocompleteDropdown = document.createElement('div');
    autocompleteDropdown.className = 'is-autocomplete';
    textarea.parentElement!.appendChild(autocompleteDropdown);
  }

  autocompleteActive = true;
  autocompleteSelectedIdx = 0;

  const typeIcons: Record<ReferenceType, string> = {
    style: '✦',
    character: '👤',
    content: '📷',
  };

  autocompleteDropdown.innerHTML = filtered.map((ref, i) => `
    <div class="is-ac-item ${i === 0 ? 'is-ac-selected' : ''}" data-ref-id="${ref.id}" data-at-pos="${atPos}">
      <img class="is-ac-thumb" src="${ref.thumbnailDataUrl}" alt="" />
      <span class="is-ac-name">@${ref.name}</span>
      <span class="is-ac-type">${typeIcons[ref.type]}</span>
    </div>
  `).join('');

  // Position dropdown above the textarea
  autocompleteDropdown.style.display = 'block';

  // Click handler on items
  autocompleteDropdown.querySelectorAll('.is-ac-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const refId = (item as HTMLElement).dataset.refId!;
      const ap = parseInt((item as HTMLElement).dataset.atPos!, 10);
      insertTag(refId, ap);
    });
  });
}

function moveAutocomplete(dir: number): void {
  if (!autocompleteDropdown) return;
  const items = autocompleteDropdown.querySelectorAll('.is-ac-item');
  if (items.length === 0) return;

  items[autocompleteSelectedIdx]?.classList.remove('is-ac-selected');
  autocompleteSelectedIdx = (autocompleteSelectedIdx + dir + items.length) % items.length;
  items[autocompleteSelectedIdx]?.classList.add('is-ac-selected');
}

function selectAutocomplete(): void {
  if (!autocompleteDropdown) return;
  const selected = autocompleteDropdown.querySelector('.is-ac-selected') as HTMLElement | null;
  if (!selected) return;

  const refId = selected.dataset.refId!;
  const atPos = parseInt(selected.dataset.atPos!, 10);
  insertTag(refId, atPos);
}

function insertTag(refId: string, atPos: number): void {
  const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  if (!textarea) return;

  const pos = textarea.selectionStart;
  const value = textarea.value;
  const token = `{{ref:${refId}}}`;

  // Replace from @ position to cursor
  const before = value.slice(0, atPos);
  const after = value.slice(pos);
  textarea.value = before + token + ' ' + after;

  // Set cursor after the token + space
  const newPos = atPos + token.length + 1;
  textarea.selectionStart = textarea.selectionEnd = newPos;
  textarea.focus();

  closeAutocomplete();
  syncOverlay();
  updateGenerateState();
}

function closeAutocomplete(): void {
  autocompleteActive = false;
  if (autocompleteDropdown) {
    autocompleteDropdown.style.display = 'none';
  }
}

/** When a reference is removed, strip its tokens from the prompt */
function stripRemovedRefTokens(refId: string): void {
  const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  if (!textarea) return;
  const token = `{{ref:${refId}}}`;
  if (textarea.value.includes(token)) {
    textarea.value = textarea.value.replace(new RegExp(token.replace(/[{}]/g, '\\$&') + '\\s?', 'g'), '');
    syncOverlay();
  }
}

// ═══════════════════════════════════════════════════════════════
// IS-5: AUTO-DESCRIBE (Image Drop → Prompt)
// ═══════════════════════════════════════════════════════════════

let describeMode: 'recreate' | 'inspire' = 'recreate';
let isDescribing = false;

const DESCRIBE_PROMPTS = {
  recreate: `Analyze this image and generate a detailed prompt that could recreate it using an AI image generator. Include:
- Main subject and its position in the frame
- Lighting (direction, quality, color temperature)
- Color palette (dominant colors, accents)
- Mood and atmosphere
- Art style or photography technique
- Camera angle and framing
- Background and environment details
- Notable textures or materials
Return ONLY the prompt text. No explanations, labels, or formatting. Maximum 150 words.`,
  inspire: `Analyze this image and capture its essence in a creative prompt for an AI image generator. Focus on:
- Overall mood and emotional tone
- Aesthetic direction (editorial, minimal, bold, organic, etc.)
- Key visual elements that define the image
- Color feeling (warm, cool, muted, vibrant)
Do NOT describe specific details — capture the spirit, not the specifics.
Return ONLY the prompt text. No explanations. Maximum 80 words.`,
};

function setupAutoDescribe(): void {
  const promptArea = document.querySelector('.is-prompt-area');
  const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  if (!promptArea || !textarea) return;

  // Drop zone — listen on BOTH the area and the textarea (textarea eats drag events)
  const targets = [promptArea, textarea];
  for (const target of targets) {
    target.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isDescribing) return;
      promptArea.classList.add('is-prompt-dragover');
    });
    target.addEventListener('dragleave', (e) => {
      e.preventDefault();
      const related = (e as DragEvent).relatedTarget as Node | null;
      // Only remove highlight if truly leaving the prompt area
      if (!promptArea.contains(related)) {
        promptArea.classList.remove('is-prompt-dragover');
      }
    });
    target.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      promptArea.classList.remove('is-prompt-dragover');
      const files = (e as DragEvent).dataTransfer?.files;
      if (files?.length && files[0].type.startsWith('image/')) {
        describeImage(files[0]);
      }
    });
  }

  // Paste handling: prompt focused → describe, unfocused → add as reference
  setupPasteHandler();
}

function setupPasteHandler(): void {
  const studioPanel = document.getElementById('image-studio-panel');
  if (!studioPanel) return;

  document.addEventListener('paste', (e: ClipboardEvent) => {
    // Only handle paste when Image Studio tab is visible
    if (!studioPanel.classList.contains('active')) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    let imageFile: File | null = null;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        imageFile = item.getAsFile();
        break;
      }
    }
    if (!imageFile) return;

    e.preventDefault();

    const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
    const promptFocused = textarea && document.activeElement === textarea;

    if (promptFocused) {
      // Prompt is focused → auto-describe the pasted image
      describeImage(imageFile);
    } else {
      // Prompt not focused → add as content reference
      addReference(imageFile, 'content');
    }
  });
}

async function describeImage(file: File): Promise<void> {
  if (isDescribing) return;
  if (!ACCEPTED_TYPES.includes(file.type)) {
    showToast('Unsupported image format', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('Image too large (max 10MB)', 'error');
    return;
  }

  const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  if (!textarea) return;

  isDescribing = true;
  const originalPlaceholder = textarea.placeholder;
  textarea.placeholder = 'Analyzing image...';
  textarea.disabled = true;

  try {
    // Read and compress for analysis (1024px max)
    const dataUrl = await readFileAsDataUrl(file);
    const compressed = await compressImage(dataUrl, 1024, 1024, 0.8);
    const base64 = compressed.replace(/^data:image\/\w+;base64,/, '');

    const prompt = await callDescribeApi(base64, file.type, describeMode);

    if (prompt) {
      // Append or replace
      if (textarea.value.trim()) {
        textarea.value += '\n' + prompt;
      } else {
        textarea.value = prompt;
      }
      syncOverlay();
      updateGenerateState();
    }
  } catch (err: any) {
    showToast(err.message || 'Could not analyze image', 'error');
  } finally {
    isDescribing = false;
    textarea.disabled = false;
    textarea.placeholder = originalPlaceholder;
    textarea.focus();
  }
}

async function callDescribeApi(base64: string, mimeType: string, mode: 'recreate' | 'inspire'): Promise<string> {
  const geminiKey = getGeminiKey();
  if (!geminiKey) throw new Error('Gemini API key required');

  // Direct Gemini API call for vision → text (cheap, fast)
  const model = 'gemini-3.1-flash-lite-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: DESCRIBE_PROMPTS[mode] },
        ],
      }],
      generationConfig: { responseModalities: ['TEXT'] },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Describe failed: ${err.slice(0, 150)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════
// IS-6: PROMPT ENHANCEMENT (✨ Enhance)
// ═══════════════════════════════════════════════════════════════

let isEnhancing = false;

const ENHANCE_SYSTEM_PROMPT = `You are a prompt engineer for AI image generation. Improve the given prompt by adding:
- Specific lighting (golden hour, studio, overcast, rim lighting, etc.)
- Composition terms (rule of thirds, leading lines, symmetry, negative space)
- Atmosphere and mood (serene, dramatic, intimate, epic)
- Photography/art terms (shallow DOF, bokeh, wide angle, macro, impasto)
- Material and texture details (matte, glossy, weathered, translucent)
- Color temperature and palette descriptions

Rules:
- Keep the original subject and intent intact
- Add 3-5 specific enhancements, not a wall of text
- Do NOT add text/typography instructions unless the original prompt mentions text
- Preserve any [REF_N] markers exactly as written
- Return ONLY the improved prompt. No explanations.
- Maximum 200 words.`;

function setupEnhanceButton(): void {
  const btn = document.getElementById('is-enhance');
  if (!btn) return;
  btn.addEventListener('click', enhancePrompt);
}

async function enhancePrompt(): Promise<void> {
  const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  const btn = document.getElementById('is-enhance') as HTMLButtonElement | null;
  if (!textarea || !btn || isEnhancing) return;

  const rawValue = textarea.value.trim();
  if (!rawValue) {
    showToast('Write a prompt first', 'error');
    return;
  }

  isEnhancing = true;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm"></div>';

  try {
    // Replace tag tokens with placeholders so the model preserves them
    let promptToEnhance = rawValue;
    const tokenMap: { placeholder: string; token: string }[] = [];
    let refIdx = 0;
    promptToEnhance = rawValue.replace(TAG_TOKEN_RE, (fullMatch) => {
      const placeholder = `[REF_${++refIdx}]`;
      tokenMap.push({ placeholder, token: fullMatch });
      return placeholder;
    });

    const enhanced = await callEnhanceApi(promptToEnhance);

    if (enhanced) {
      // Restore tag tokens from placeholders
      let restoredEnhanced = enhanced;
      for (const { placeholder, token } of tokenMap) {
        restoredEnhanced = restoredEnhanced.replace(placeholder, token);
      }

      // Show diff UI
      showEnhanceDiff(rawValue, restoredEnhanced);
    }
  } catch (err: any) {
    showToast(err.message || 'Enhancement failed', 'error');
  } finally {
    isEnhancing = false;
    btn.disabled = false;
    btn.innerHTML = '✨';
  }
}

async function callEnhanceApi(prompt: string): Promise<string> {
  const geminiKey = getGeminiKey();
  if (!geminiKey) throw new Error('Gemini API key required');

  // Direct Gemini API call (text-only, cheapest model)
  const model = 'gemini-3.1-flash-lite-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${ENHANCE_SYSTEM_PROMPT}\n\nPrompt to improve:\n${prompt}` }],
      }],
      generationConfig: { responseModalities: ['TEXT'] },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Enhance failed: ${err.slice(0, 150)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

function showEnhanceDiff(original: string, enhanced: string): void {
  const container = document.getElementById('is-enhance-diff');
  if (!container) return;

  // Simple word-level diff
  const origWords = original.split(/\s+/);
  const enhWords = enhanced.split(/\s+/);
  const origSet = new Set(origWords.map(w => w.toLowerCase()));

  const diffHtml = enhWords.map(word => {
    if (!origSet.has(word.toLowerCase())) {
      return `<span class="is-diff-added">${escapeHtml(word)}</span>`;
    }
    return escapeHtml(word);
  }).join(' ');

  container.innerHTML = `
    <div class="is-diff-content">${diffHtml}</div>
    <div class="is-diff-actions">
      <button class="is-diff-accept" id="is-diff-accept">Accept</button>
      <button class="is-diff-reject" id="is-diff-reject">Reject</button>
    </div>
  `;
  container.style.display = 'block';

  document.getElementById('is-diff-accept')?.addEventListener('click', () => {
    const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
    if (textarea) {
      textarea.value = enhanced;
      syncOverlay();
      updateGenerateState();
    }
    container.style.display = 'none';
  });

  document.getElementById('is-diff-reject')?.addEventListener('click', () => {
    container.style.display = 'none';
  });

  // Auto-dismiss after 30s
  setTimeout(() => { container.style.display = 'none'; }, 30000);
}

// ═══════════════════════════════════════════════════════════════
// IS-7: GENERATION HISTORY
// ═══════════════════════════════════════════════════════════════

interface HistoryEntry {
  id: string;
  imageBase64: string;
  mimeType: string;
  thumbnailDataUrl: string;
  rawPrompt: string;       // with {{ref:id}} tokens
  aspectRatio: string;
  resolution: string;
  timestamp: number;
}

const MAX_HISTORY = 20;
const HISTORY_THUMB_SIZE = 64;
let history: HistoryEntry[] = [];

async function addToHistory(imageBase64: string, mimeType: string, rawPrompt: string): Promise<void> {
  const thumbDataUrl = await generateThumbnail(
    `data:${mimeType};base64,${imageBase64}`,
    HISTORY_THUMB_SIZE
  );

  const entry: HistoryEntry = {
    id: 'hist_' + Date.now().toString(36),
    imageBase64,
    mimeType,
    thumbnailDataUrl: thumbDataUrl,
    rawPrompt,
    aspectRatio: currentAspectRatio,
    resolution: currentResolution,
    timestamp: Date.now(),
  };

  // Add to front (newest first)
  history.unshift(entry);

  // Evict oldest if over limit
  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }

  renderHistory();
}

function renderHistory(): void {
  const strip = document.getElementById('is-history-strip');
  if (!strip) return;

  if (history.length === 0) {
    strip.innerHTML = '<span class="is-history-empty">Generated images will appear here</span>';
    return;
  }

  strip.innerHTML = history.map(entry => `
    <div class="is-history-thumb" data-hist-id="${entry.id}" title="${new Date(entry.timestamp).toLocaleTimeString()}">
      <img src="${entry.thumbnailDataUrl}" alt="Generated" />
    </div>
  `).join('');

  // Click to open modal
  strip.querySelectorAll('.is-history-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const id = (thumb as HTMLElement).dataset.histId!;
      const entry = history.find(h => h.id === id);
      if (entry) openHistoryModal(entry);
    });
  });
}

function openHistoryModal(entry: HistoryEntry): void {
  // Remove existing modal if any
  closeHistoryModal();

  const modal = document.createElement('div');
  modal.className = 'is-modal-backdrop';
  modal.id = 'is-history-modal';

  const cleanPrompt = getCleanPrompt(entry.rawPrompt);
  const truncatedPrompt = cleanPrompt.length > 80 ? cleanPrompt.slice(0, 80) + '…' : cleanPrompt;

  modal.innerHTML = `
    <div class="is-modal-content">
      <button class="is-modal-close" id="is-modal-close-btn">×</button>
      <img class="is-modal-image" src="data:${entry.mimeType};base64,${entry.imageBase64}" alt="Generated" />
      <div class="is-modal-info">
        <span class="is-modal-prompt">${escapeHtml(truncatedPrompt)}</span>
        <span class="is-modal-meta">${entry.aspectRatio} · ${entry.resolution}</span>
      </div>
      <div class="is-modal-actions">
        <button class="is-modal-btn is-modal-btn-secondary" id="is-modal-reuse">Re-use Prompt</button>
        <button class="is-modal-btn is-modal-btn-primary" id="is-modal-canvas">Send to Canvas</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close handlers
  document.getElementById('is-modal-close-btn')?.addEventListener('click', closeHistoryModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeHistoryModal();
  });
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closeHistoryModal(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);

  // Re-use prompt
  document.getElementById('is-modal-reuse')?.addEventListener('click', () => {
    reusePrompt(entry.rawPrompt);
    closeHistoryModal();
  });

  // Send to canvas
  document.getElementById('is-modal-canvas')?.addEventListener('click', () => {
    sendToCanvas(entry.imageBase64, entry.mimeType, getCleanPrompt(entry.rawPrompt));
  });
}

function closeHistoryModal(): void {
  const modal = document.getElementById('is-history-modal');
  if (modal) modal.remove();
}

function reusePrompt(rawPrompt: string): void {
  const textarea = document.getElementById('is-prompt') as HTMLTextAreaElement | null;
  if (!textarea) return;

  // Validate @tag tokens — strip ones referencing deleted refs
  let validatedPrompt = rawPrompt;
  let strippedCount = 0;
  const re = new RegExp(TAG_TOKEN_RE.source, 'g');
  validatedPrompt = rawPrompt.replace(re, (fullMatch, id) => {
    if (getReferenceById(id)) return fullMatch;
    strippedCount++;
    return '';
  });

  // Clean up extra spaces from stripped tokens
  validatedPrompt = validatedPrompt.replace(/\s{2,}/g, ' ').trim();

  textarea.value = validatedPrompt;
  syncOverlay();
  updateGenerateState();

  if (strippedCount > 0) {
    showToast(`Prompt loaded — ${strippedCount} invalid reference(s) removed`, 'success');
  } else {
    showToast('Prompt loaded', 'success');
  }
}

// ═══════════════════════════════════════════════════════════════
// IS-8: SEND TO CANVAS
// ═══════════════════════════════════════════════════════════════

async function sendToCanvas(imageBase64: string, mimeType: string, promptText: string): Promise<void> {
  // Disable buttons while placing
  const modalBtn = document.getElementById('is-modal-canvas') as HTMLButtonElement | null;
  const previewBtn = document.getElementById('is-preview-canvas') as HTMLButtonElement | null;
  if (modalBtn) { modalBtn.disabled = true; modalBtn.textContent = 'Placing...'; }
  if (previewBtn) { previewBtn.disabled = true; previewBtn.textContent = 'Placing...'; }

  const frameName = (promptText.slice(0, 40).replace(/[^\w\s-]/g, '').trim() || 'Image Studio') + ' — Image Studio';

  // Use tracked dimensions from generation, or compute from current settings
  const dims = lastGenDimensions.width > 0 ? lastGenDimensions : getPixelDimensions(currentAspectRatio, currentResolution);

  // Direct postMessage to plugin sandbox — no relay needed
  parent.postMessage({ pluginMessage: {
    type: 'place-studio-image',
    imageBase64,
    mimeType,
    name: frameName,
    width: dims.width,
    height: dims.height,
  }}, '*');

  // Listen for response
  const handler = (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;
    if (msg.type === 'studio-image-placed') {
      showToast('Image placed on canvas', 'success');
      clearPreview();
      closeHistoryModal();
      cleanup();
    } else if (msg.type === 'studio-image-error') {
      showToast(msg.error || 'Failed to place image', 'error');
      cleanup();
    }
  };

  const cleanup = () => {
    window.removeEventListener('message', handler);
    if (modalBtn) { modalBtn.disabled = false; modalBtn.textContent = 'Send to Canvas'; }
    if (previewBtn) { previewBtn.disabled = false; previewBtn.textContent = 'Send to Canvas'; }
  };

  window.addEventListener('message', handler);
  // Timeout safety
  setTimeout(() => { cleanup(); }, 10000);
}

// Send to Canvas button is now wired directly in showGenerationResult

// ═══════════════════════════════════════════════════════════════
// HELPERS (relay connection info — reads from existing state)
// ═══════════════════════════════════════════════════════════════

function getRelayUrl(): string {
  const cs = getChatSettings();
  return (cs.chatRelayUrl || 'http://localhost:3055').replace(/\/+$/, '');
}

function getChannel(): string | null {
  return getBridgeChannelId();
}

function getGeminiKey(): string | null {
  return apiState.savedApiKeys['gemini'] || null;
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

export function initImageStudio(): void {
  renderReferences();
  setupReferenceSectionDrop();
  setupControls();
  setupPrompt();
  setupTagAutocomplete();
  setupAutoDescribe();
  setupEnhanceButton();
  setupDescribeModeToggle();
  setupGenerateButton();
  renderHistory();
}

function setupDescribeModeToggle(): void {
  const toggle = document.getElementById('is-describe-mode');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    describeMode = describeMode === 'recreate' ? 'inspire' : 'recreate';
    toggle.textContent = describeMode === 'recreate' ? 'Recreate' : 'Inspire';
    toggle.title = describeMode === 'recreate'
      ? 'Detailed prompt for faithful reproduction'
      : 'Abstract prompt capturing mood and essence';
  });
}
