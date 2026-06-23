import { seedChatDraft, sendCommandToSandbox, type AttachmentFile } from './chat';

const STORAGE_KEY = 'figmento-remix-studio-v1';
const MAX_REFS = 3;

interface RemixReference extends Omit<AttachmentFile, 'id'> {
  id: string;
}

interface RemixPreview {
  id: string;
  nodeId: string;
  name: string;
  dataUri: string;
  width: number;
  height: number;
}

interface RemixState {
  brandId: string;
  promptPrefix: string;
  negativePrompt: string;
  references: RemixReference[];
  previews: RemixPreview[];
}

const state: RemixState = {
  brandId: 'carmelus',
  promptPrefix:
    'Delicate Catholic devotional watercolor illustration, blue ink linework, soft cream paper background, airy sacred composition, elegant editorial religious art, gentle light, refined minimal palette.',
  negativePrompt:
    'photorealistic, harsh contrast, neon colors, cartoon, 3D render, messy background, modern streetwear, distorted hands, extra limbs.',
  references: [],
  previews: [],
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Reference images can be large; failing persistence should not break the tab.
  }
}

function loadState(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<RemixState>;
    if (typeof parsed.brandId === 'string') state.brandId = parsed.brandId;
    if (typeof parsed.promptPrefix === 'string') state.promptPrefix = parsed.promptPrefix;
    if (typeof parsed.negativePrompt === 'string') state.negativePrompt = parsed.negativePrompt;
    if (Array.isArray(parsed.references)) state.references = parsed.references.slice(0, MAX_REFS) as RemixReference[];
    if (Array.isArray(parsed.previews)) state.previews = parsed.previews as RemixPreview[];
  } catch {
    // Ignore malformed saved state.
  }
}

function syncFieldsFromState(): void {
  ($('remix-brand-id') as HTMLInputElement).value = state.brandId;
  ($('remix-prompt-prefix') as HTMLTextAreaElement).value = state.promptPrefix;
  ($('remix-negative-prompt') as HTMLTextAreaElement).value = state.negativePrompt;
}

function syncStateFromFields(): void {
  state.brandId = (($('remix-brand-id') as HTMLInputElement).value || 'carmelus').trim();
  state.promptPrefix = ($('remix-prompt-prefix') as HTMLTextAreaElement).value.trim();
  state.negativePrompt = ($('remix-negative-prompt') as HTMLTextAreaElement).value.trim();
  saveState();
}

function renderReferences(): void {
  const grid = $('remix-ref-grid');
  grid.innerHTML = '';
  $('remix-ref-counter').textContent = `${state.references.length}/${MAX_REFS}`;

  if (state.references.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'remix-empty';
    empty.textContent = 'Add 2-3 cropped images from the manual Carmelus style.';
    grid.appendChild(empty);
    return;
  }

  for (const ref of state.references) {
    const card = document.createElement('div');
    card.className = 'remix-ref-card';

    const img = document.createElement('img');
    img.src = ref.dataUri;
    img.alt = ref.name;
    card.appendChild(img);

    const remove = document.createElement('button');
    remove.className = 'remix-ref-remove';
    remove.type = 'button';
    remove.textContent = 'x';
    remove.title = 'Remove reference';
    remove.addEventListener('click', () => {
      state.references = state.references.filter((r) => r.id !== ref.id);
      saveState();
      renderReferences();
    });
    card.appendChild(remove);

    const meta = document.createElement('div');
    meta.className = 'remix-ref-meta';
    meta.textContent = `${ref.name} · ${formatBytes(ref.size)}`;
    card.appendChild(meta);

    grid.appendChild(card);
  }
}

function renderPreviews(): void {
  const grid = $('remix-preview-grid');
  grid.innerHTML = '';

  if (state.previews.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'remix-empty';
    empty.textContent = 'Select generated slide frames on the canvas, then capture them here.';
    grid.appendChild(empty);
    return;
  }

  for (let i = 0; i < state.previews.length; i++) {
    const preview = state.previews[i];
    const card = document.createElement('div');
    card.className = 'remix-preview-card';

    const img = document.createElement('img');
    img.src = preview.dataUri;
    img.alt = preview.name;
    card.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'remix-preview-meta';
    meta.innerHTML = `Slide ${i + 1}<span>${preview.name}</span>`;
    card.appendChild(meta);

    grid.appendChild(card);
  }
}

async function addReferenceFiles(files: FileList | null): Promise<void> {
  if (!files || files.length === 0) return;
  const room = MAX_REFS - state.references.length;
  const selected = Array.from(files).slice(0, room);

  for (const file of selected) {
    if (!file.type.startsWith('image/')) continue;
    const dataUri = await readFileAsDataUri(file);
    state.references.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      type: file.type || 'image/png',
      dataUri,
      size: file.size,
    });
  }

  saveState();
  renderReferences();
}

function switchToChat(): void {
  const chatTab = document.getElementById('tab-btn-chat') as HTMLButtonElement | null;
  chatTab?.click();
}

function sendStylePromptToChat(): void {
  syncStateFromFields();
  const brandId = state.brandId || 'carmelus';
  const referenceImages = state.references.map((ref) => ({
    filename: ref.name,
    dataUri: ref.dataUri,
  }));
  const prompt = [
    `Save remix image style for @${brandId}.`,
    '',
    `Brand id: ${brandId}.`,
    'Use the attached/reference images as style references for this brand kit.',
    '',
    'Image style prompt prefix:',
    state.promptPrefix || '[describe the desired visual style]',
    '',
    'Negative prompt:',
    state.negativePrompt || '[describe what to avoid]',
    '',
    'After saving, tell me which reference images were stored and confirm the brand kit is ready for @' + brandId + ' carousel remix.',
    referenceImages.length > 0
      ? `\n[REMIX REFERENCE IMAGE DATA]\nUse this exact array as save_brand_kit_remix.referenceImages:\n${JSON.stringify(referenceImages)}`
      : '',
  ].join('\n');

  const attachments = state.references.map(({ id: _id, ...file }) => file);
  seedChatDraft(prompt, attachments);
  switchToChat();
}

function nodeIdOf(node: Record<string, unknown>): string | null {
  const raw = node.nodeId || node.id;
  return typeof raw === 'string' ? raw : null;
}

async function captureSelectedFrames(): Promise<void> {
  const button = $('remix-capture-selected') as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'Capturing...';

  try {
    const selection = await sendCommandToSandbox('get_selection', {});
    const nodes = Array.isArray(selection.nodes) ? (selection.nodes as Array<Record<string, unknown>>) : [];
    const frames = nodes
      .filter((node) => node.type === 'FRAME')
      .sort((a, b) => {
        const ay = typeof a.y === 'number' ? a.y : 0;
        const by = typeof b.y === 'number' ? b.y : 0;
        const ax = typeof a.x === 'number' ? a.x : 0;
        const bx = typeof b.x === 'number' ? b.x : 0;
        return Math.abs(ay - by) < 50 ? ax - bx : ay - by;
      });

    const previews: RemixPreview[] = [];
    for (const frame of frames) {
      const nodeId = nodeIdOf(frame);
      if (!nodeId) continue;
      const shot = await sendCommandToSandbox('get_screenshot', { nodeId, scale: 0.5 });
      if (typeof shot.base64 !== 'string') continue;
      const format = String(shot.format || 'JPG').toLowerCase() === 'png' ? 'png' : 'jpeg';
      previews.push({
        id: `${nodeId}-${Date.now()}`,
        nodeId,
        name: String(shot.name || frame.name || nodeId),
        dataUri: `data:image/${format};base64,${shot.base64}`,
        width: Number(shot.width || frame.width || 0),
        height: Number(shot.height || frame.height || 0),
      });
    }

    state.previews = previews;
    saveState();
    renderPreviews();
  } catch (error) {
    state.previews = [];
    renderPreviews();
    const grid = $('remix-preview-grid');
    grid.innerHTML = `<div class="remix-empty">Could not capture selected frames: ${
      error instanceof Error ? error.message : 'unknown error'
    }</div>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Capture selected frames';
  }
}

export function initRemixStudio(): void {
  const panel = document.getElementById('remix-panel');
  if (!panel) return;

  loadState();
  syncFieldsFromState();
  renderReferences();
  renderPreviews();

  $('remix-add-ref').addEventListener('click', () => {
    ($('remix-ref-upload') as HTMLInputElement).click();
  });

  $('remix-ref-upload').addEventListener('change', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    void addReferenceFiles(input.files);
    input.value = '';
  });

  $('remix-send-to-chat').addEventListener('click', sendStylePromptToChat);
  $('remix-capture-selected').addEventListener('click', () => void captureSelectedFrames());

  for (const id of ['remix-brand-id', 'remix-prompt-prefix', 'remix-negative-prompt']) {
    $(id).addEventListener('input', syncStateFromFields);
  }
}
