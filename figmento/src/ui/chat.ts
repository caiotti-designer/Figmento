/**
 * Figmento Chat Module — AI design agent chat (Anthropic + Gemini + OpenAI).
 * Ported from figmento-plugin/src/ui-app.ts chat sections.
 *
 * Loop logic lives in tool-use-loop.ts. This module owns:
 *  - DOM manipulation (chat bubbles, tool action rows, loading state)
 *  - Conversation history state (per provider)
 *  - Special tool handlers: generate_image, update_memory
 *  - Sandbox bridge (sendCommandToSandbox)
 */

import { chatToolResolver } from './tools-schema';
import { buildSystemPrompt } from './system-prompt';
import { detectBrief, DesignBrief } from './brief-detector';
import {
  runToolUseLoop,
  ToolCallResult,
  AnthropicMessage,
  GeminiContent,
  SCREENSHOT_TOOLS,
  stripBase64FromResult,
  summarizeScreenshotResult,
} from './tool-use-loop';
import { LOCAL_TOOL_HANDLERS } from './local-intelligence';
import { getBridgeChannelId, getBridgeConnected, sendBridgeMessage, setClaudeCodeResultHandler } from './bridge';
import { renderDiffPanel } from './diff-panel';
import { openSettings, closeSettings } from './settings';
import type { CorrectionEntry, LearnedPreference } from '../types';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface PendingCommand {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

interface SelectionNode {
  id: string;
  type: string;
  name: string;
  width: number;
  height: number;
}

export interface ChatSettings {
  anthropicApiKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
  model: string;
  claudeCodeModel: string;
  chatRelayEnabled: boolean;
  chatRelayUrl: string;
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let conversationHistory: AnthropicMessage[] = [];
let geminiHistory: GeminiContent[] = [];
let openaiHistory: Array<Record<string, unknown>> = [];
let claudeCodeHistory: Array<{ role: string; content: string }> = [];
let isProcessing = false;
let chatCommandCounter = 0;
const pendingChatCommands = new Map<string, PendingCommand>();
let memoryEntries: string[] = [];
let currentBrief: DesignBrief | undefined;
// MF-1: Multi-file attachment queue (replaces single pendingAttachment)
interface AttachmentFile {
  id: string;
  name: string;
  type: string;
  dataUri: string;
  size: number;
}
const MAX_ATTACHMENTS = 10;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
let pendingAttachments: AttachmentFile[] = [];
// Legacy alias for backward compat in API paths
let pendingAttachment: string | null = null;

// MF-5: Selection context
interface SelectionContext {
  nodes: Array<{ id: string; name: string; type: string; width: number; height: number }>;
}
let currentSelection: SelectionContext = { nodes: [] };
let selectionIncluded = true; // whether to include selection in next message

// ═══════════════════════════════════════════════════════════════
// CU-1: QUICK ACTION TYPES & REGISTRY
// ═══════════════════════════════════════════════════════════════

interface QuickActionField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'file' | 'textarea';
  required: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  accept?: string; // for file fields
}

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  description: string;
  fields: QuickActionField[];
  buildPrompt: (values: Record<string, string>, attachments: AttachmentFile[]) => string;
}

const quickActionRegistry: QuickAction[] = [];
let activeQuickAction: QuickAction | null = null;
let quickActionValues: Record<string, string> = {};

function registerQuickAction(action: QuickAction): void {
  if (!quickActionRegistry.find(a => a.id === action.id)) {
    quickActionRegistry.push(action);
  }
}

// ═══════════════════════════════════════════════════════════════
// CU-4: DESIGN SETTINGS STATE
// ═══════════════════════════════════════════════════════════════

interface DesignSettingsState {
  imageModel: string;
  imageQuality: string;
  imageStyle: string;
  defaultFont: string;
  brandColors: string[];
  gridEnabled: boolean;
}

const DESIGN_SETTINGS_KEY = 'figmento-design-settings';

function loadDesignSettings(): DesignSettingsState {
  try {
    const raw = localStorage.getItem(DESIGN_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* localStorage unavailable in Figma iframe */ }
  return { imageModel: 'nano-banana-2', imageQuality: '2k', imageStyle: 'auto', defaultFont: 'auto', brandColors: [], gridEnabled: true };
}

function saveDesignSettings(s: DesignSettingsState): void {
  try { localStorage.setItem(DESIGN_SETTINGS_KEY, JSON.stringify(s)); } catch { /* */ }
}

let designSettings: DesignSettingsState = loadDesignSettings();

export function getDesignSettings(): DesignSettingsState { return designSettings; }
let autoDetectEnabled = false; // LC-8: updated when learning-config-loaded arrives
let learnedPreferences: LearnedPreference[] = []; // LC-9: updated each relay turn

function loadPreferencesFromSandbox(): Promise<LearnedPreference[]> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve([]), 2000);
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === 'preferences-loaded') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve((msg.preferences as LearnedPreference[]) || []);
      }
    };
    window.addEventListener('message', handler);
    postToSandbox({ type: 'get-preferences' });
  });
}

function getSelectionSnapshot(): Promise<SelectionNode[]> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve([]), 500);
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === 'selection-snapshot') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve((msg.selection as SelectionNode[]) || []);
      }
    };
    window.addEventListener('message', handler);
    postToSandbox({ type: 'get-selection-snapshot' });
  });
}

// Settings reference — updated from outside via updateChatSettings()
let chatSettings: ChatSettings = {
  anthropicApiKey: '',
  geminiApiKey: '',
  openaiApiKey: '',
  model: 'gemini-3.1-flash-image-preview',
  claudeCodeModel: 'claude-opus-4-6',
  chatRelayEnabled: false,
  chatRelayUrl: 'http://localhost:3055',
};

// ═══════════════════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════════════════

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function postToSandbox(msg: Record<string, unknown>) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function isGeminiModel(model: string): boolean {
  return model.startsWith('gemini-');
}

function isOpenAIModel(model: string): boolean {
  return model.startsWith('gpt-') || model.startsWith('o');
}

function isClaudeCodeModel(model: string): boolean {
  return model === 'claude-code';
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

export function updateChatSettings(s: ChatSettings) {
  chatSettings = s;
  // Sync the toolbar model label when settings are loaded from storage
  syncModelToolbarLabel();
}

function syncModelToolbarLabel() {
  const settingsModelSelect = document.getElementById('settings-model') as HTMLSelectElement | null;
  const modelSelectorLabel = document.getElementById('modelSelectorLabel');
  if (!settingsModelSelect || !modelSelectorLabel) return;

  // Sync the hidden select to match chatSettings.model
  if (chatSettings.model && settingsModelSelect.value !== chatSettings.model) {
    settingsModelSelect.value = chatSettings.model;
  }

  // Update toolbar label from the select's displayed text
  const selectedOpt = settingsModelSelect.selectedOptions[0];
  if (selectedOpt) {
    modelSelectorLabel.textContent = selectedOpt.textContent?.trim() || chatSettings.model;
  }

  // Re-populate dropdown active state
  const modelDropdown = document.getElementById('modelDropdown');
  if (modelDropdown) {
    modelDropdown.querySelectorAll('.dropdown-item').forEach(item => {
      const el = item as HTMLElement;
      el.classList.toggle('active', el.dataset.model === chatSettings.model);
    });
  }
}

export function getChatSettings(): ChatSettings {
  return chatSettings;
}

/** Load memory entries from sandbox into chat state. */
export function loadMemoryEntries(entries: Array<{ entry: string; timestamp: string }>) {
  memoryEntries = entries.map(e => e.entry);
}

/** Resolve a pending chat command (called by message router). */
export function resolveChatCommand(cmdId: string, success: boolean, data: Record<string, unknown>, error?: string) {
  const pending = pendingChatCommands.get(cmdId);
  if (!pending) return;
  pendingChatCommands.delete(cmdId);
  if (success) {
    pending.resolve(data);
  } else {
    pending.reject(new Error(error || 'Command failed'));
  }
}

// ═══════════════════════════════════════════════════════════════
// CHAT TEMPLATES
// ═══════════════════════════════════════════════════════════════

interface ChatTemplate {
  icon: string;
  label: string;
  prompt: string;
}

interface PromptTemplate {
  icon: string;
  label: string;
  prompt: string;
  prefill?: boolean; // if true, prefills input instead of auto-sending
}

const CHAT_TEMPLATES: ChatTemplate[] = [
  { icon: '📸', label: 'Instagram Ad',  prompt: 'Create an Instagram post (1080×1350) for a hippie coffee shop — warm earthy tones, vintage feel, include a CTA' },
  { icon: '💼', label: 'LinkedIn Post', prompt: 'Create a LinkedIn post banner (1200×627) for a SaaS productivity tool — modern, clean, corporate blue' },
  { icon: '🎬', label: 'YouTube Thumb', prompt: 'Create a YouTube thumbnail (1280×720) for a coding tutorial — dark background, bold text, tech feel' },
  { icon: '🌐', label: 'Web Hero',      prompt: 'Create a web hero section (1440×800) for a wellness app — soft greens, organic shapes, minimal' },
  { icon: '📊', label: 'Slide Deck',    prompt: 'Create a presentation title slide (1920×1080) for a startup pitch — bold, modern, dark theme' },
  { icon: '📄', label: 'A4 Flyer',      prompt: 'Create an A4 flyer (2480×3508) for a summer music festival — vibrant, energetic, neon accents' },
];

// CU-5: Prompt templates replacing killed tools (Text to Layout, Template Fill, Presentation, Hero Generator)
const TOOL_REPLACEMENT_TEMPLATES: PromptTemplate[] = [
  { icon: '🎨', label: 'Create a social post', prompt: 'Create a {format: Instagram/Twitter/LinkedIn} post about {topic}. Style: {mood}. Font: {font or "auto"}.', prefill: true },
  { icon: '📋', label: 'Fill a template', prompt: 'Scan the selected frame and fill all #-prefixed placeholders with content about {topic}.', prefill: true },
  { icon: '📊', label: 'Build a presentation', prompt: 'Create a {count}-slide presentation about {topic}. Format: {16:9/A4}. Style: {minimal/vibrant/dark}.', prefill: true },
  { icon: '🖼', label: 'Generate a hero image', prompt: 'Generate a hero image: {subject description}. Position: {center/left/right}. Quality: {2k/4k}.', prefill: true },
];

function renderChatTemplates(): void {
  const chatInput = $('chat-input') as HTMLTextAreaElement;
  const container = document.createElement('div');
  container.className = 'welcome-templates';

  const label = document.createElement('div');
  label.className = 'welcome-templates-label';
  label.textContent = 'Try these prompts:';
  container.appendChild(label);

  for (const tpl of CHAT_TEMPLATES) {
    const card = document.createElement('button');
    card.className = 'template-card';
    card.innerHTML = `<div class="template-card-title">${tpl.label}</div><div class="template-card-desc">${tpl.prompt}</div>`;
    card.addEventListener('click', () => {
      chatInput.value = tpl.prompt;
      chatInput.focus();
      sendMessage();
    });
    container.appendChild(card);
  }

  // CU-5: Tool replacement templates (prefill mode)
  const toolLabel = document.createElement('div');
  toolLabel.className = 'welcome-templates-label';
  toolLabel.textContent = 'Design tools:';
  toolLabel.style.marginTop = '12px';
  container.appendChild(toolLabel);

  for (const tpl of TOOL_REPLACEMENT_TEMPLATES) {
    const card = document.createElement('button');
    card.className = 'template-card template-card-tool';
    card.innerHTML = `<span class="template-card-icon">${tpl.icon}</span><div class="template-card-title">${tpl.label}</div>`;
    card.addEventListener('click', () => {
      chatInput.value = tpl.prompt;
      chatInput.focus();
      // Select first {placeholder} for easy replacement
      const match = tpl.prompt.match(/\{[^}]+\}/);
      if (match) {
        const start = tpl.prompt.indexOf(match[0]);
        chatInput.setSelectionRange(start, start + match[0].length);
      }
    });
    // CU-5 AC11: "Fill a template" needs selection context
    if (tpl.label === 'Fill a template') {
      card.addEventListener('click', () => {
        if (currentSelection.nodes.length === 0) {
          appendChatBubble('assistant', '<span class="chat-warning">Select a frame with #-prefixed layers first, then use this template.</span>');
        }
      });
    }
    container.appendChild(card);
  }

  $('chat-messages').appendChild(container);
}

// ═══════════════════════════════════════════════════════════════
// CHAT — ATTACHMENT PREVIEW
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// MF-1: MULTI-FILE ATTACHMENT QUEUE
// ═══════════════════════════════════════════════════════════════

function getFileTypeInfo(file: { name: string; type: string }): { icon: string; badge: string; isImage: boolean } {
  if (file.type === 'application/pdf') return { icon: '📄', badge: 'PDF', isImage: false };
  if (file.type === 'text/plain') return { icon: '📝', badge: 'TXT', isImage: false };
  if (file.type === 'image/svg+xml') return { icon: '🎨', badge: 'SVG', isImage: false };
  return { icon: '🖼', badge: 'IMG', isImage: true };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getTotalAttachmentSize(): number {
  return pendingAttachments.reduce((sum, f) => sum + f.size, 0);
}

function addAttachment(name: string, type: string, dataUri: string, size: number): boolean {
  if (pendingAttachments.length >= MAX_ATTACHMENTS) {
    appendChatBubble('assistant', `<span class="chat-error">Max ${MAX_ATTACHMENTS} files allowed</span>`);
    return false;
  }
  if (getTotalAttachmentSize() + size > MAX_TOTAL_SIZE) {
    appendChatBubble('assistant', `<span class="chat-error">Total size exceeds 50MB limit</span>`);
    return false;
  }
  pendingAttachments.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), name, type, dataUri, size });
  // Legacy compat: keep first image as pendingAttachment for API paths
  const firstImage = pendingAttachments.find(f => f.type.startsWith('image/'));
  pendingAttachment = firstImage?.dataUri || null;
  renderAttachmentQueue();
  return true;
}

function removeAttachment(id: string): void {
  pendingAttachments = pendingAttachments.filter(f => f.id !== id);
  const firstImage = pendingAttachments.find(f => f.type.startsWith('image/'));
  pendingAttachment = firstImage?.dataUri || null;
  renderAttachmentQueue();
}

function clearAttachments(): void {
  pendingAttachments = [];
  pendingAttachment = null;
  renderAttachmentQueue();
}

function clearAttachmentUI(): void {
  const existing = document.getElementById('attachment-queue');
  if (existing) existing.remove();
}

function renderAttachmentQueue(): void {
  clearAttachmentUI();
  if (pendingAttachments.length === 0) return;

  const inputArea = document.querySelector('.input-area');
  if (!inputArea) return;

  const queue = document.createElement('div');
  queue.id = 'attachment-queue';
  queue.className = 'attachment-queue';

  for (const file of pendingAttachments) {
    const info = getFileTypeInfo(file);
    const item = document.createElement('div');
    item.className = 'attachment-item';

    if (info.isImage && !file.type.includes('svg')) {
      const thumb = document.createElement('img');
      thumb.className = 'attachment-thumb';
      thumb.src = file.dataUri;
      thumb.alt = file.name;
      item.appendChild(thumb);
    } else {
      const icon = document.createElement('span');
      icon.className = 'attachment-icon';
      icon.textContent = info.icon;
      item.appendChild(icon);
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'attachment-name';
    nameEl.textContent = file.name;
    item.appendChild(nameEl);

    const badge = document.createElement('span');
    badge.className = 'attachment-badge';
    badge.textContent = `${info.badge} · ${formatFileSize(file.size)}`;
    item.appendChild(badge);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'attachment-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove file';
    removeBtn.addEventListener('click', () => removeAttachment(file.id));
    item.appendChild(removeBtn);

    queue.appendChild(item);
  }

  // Footer: count + total size + clear all
  const footer = document.createElement('div');
  footer.className = 'attachment-footer';
  footer.innerHTML = `<span>${pendingAttachments.length} file${pendingAttachments.length > 1 ? 's' : ''} · ${formatFileSize(getTotalAttachmentSize())}</span>`;
  if (pendingAttachments.length >= 2) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'attachment-clear';
    clearBtn.textContent = 'Clear all';
    clearBtn.addEventListener('click', clearAttachments);
    footer.appendChild(clearBtn);
  }
  queue.appendChild(footer);

  inputArea.insertBefore(queue, inputArea.firstChild);
}

// Legacy wrapper for backward compat
function renderAttachmentPreview(dataUri: string): void {
  // Called by old paste/upload handlers — now routes to queue
  // Name is derived from MIME type
  const mime = dataUri.match(/data:([^;]+)/)?.[1] || 'image/png';
  const ext = mime.split('/')[1]?.replace('svg+xml', 'svg') || 'file';
  const name = `pasted-${Date.now()}.${ext}`;
  const size = Math.round(dataUri.length * 0.75); // approximate base64 → bytes
  addAttachment(name, mime, dataUri, size);
}

async function placePastedImage(placeBtn: HTMLButtonElement, attachment: string): Promise<void> {
  placeBtn.disabled = true;
  placeBtn.textContent = '...';

  try {
    // Measure natural dimensions
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const tempImg = new Image();
      tempImg.onload = () => resolve({ w: tempImg.naturalWidth, h: tempImg.naturalHeight });
      tempImg.onerror = () => resolve({ w: 400, h: 300 });
      tempImg.src = attachment;
    });

    // Cap longest side at 800px
    const maxDim = 800;
    const scale = Math.min(1, maxDim / Math.max(dims.w, dims.h, 1));
    const width = Math.round(dims.w * scale);
    const height = Math.round(dims.h * scale);

    await sendCommandToSandbox('create_image', {
      imageData: attachment,
      name: 'Pasted Reference',
      width,
      height,
    });

    placeBtn.textContent = '✓ Placed!';
    setTimeout(() => {
      if (!placeBtn.isConnected) return;
      placeBtn.disabled = false;
      placeBtn.textContent = '→ Figma';
    }, 1500);
  } catch (_err) {
    placeBtn.textContent = 'Failed — connected?';
    setTimeout(() => {
      if (!placeBtn.isConnected) return;
      placeBtn.disabled = false;
      placeBtn.textContent = '→ Figma';
    }, 2000);
  }
}

// ═══════════════════════════════════════════════════════════════
// LEARN FROM MY EDITS — LC Phase 4a
// ═══════════════════════════════════════════════════════════════

function setLearnButtonEnabled(enabled: boolean): void {
  const btn = document.getElementById('chat-learn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = !enabled;
  btn.classList.toggle('active', enabled);
}

function updateLearnButtonState(): void {
  postToSandbox({ type: 'get-snapshot-status' });
}

function handleLearnFromEdits(): void {
  const btn = document.getElementById('chat-learn') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳';
  }
  postToSandbox({ type: 'compare-snapshot' });
}

function handleSnapshotCompared(msg: Record<string, unknown>): void {
  // Restore button icon
  const btn = document.getElementById('chat-learn') as HTMLButtonElement | null;
  if (btn) btn.textContent = '📝';

  const corrections = (msg.corrections as CorrectionEntry[]) || [];

  if (corrections.length === 0) {
    appendChatBubble('assistant', 'No changes detected since the last AI design.');
    updateLearnButtonState();
    return;
  }

  // Remove any existing panel before showing a new one
  const existing = document.getElementById('learn-diff-panel');
  if (existing) existing.remove();

  const panel = renderDiffPanel(
    corrections,
    (confirmed) => {
      postToSandbox({ type: 'save-corrections', corrections: confirmed });
    },
    () => {
      const p = document.getElementById('learn-diff-panel');
      if (p) p.remove();
      updateLearnButtonState();
    },
  );

  $('chat-messages').appendChild(panel);
  $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
}

function handleCorrectionsSaved(msg: Record<string, unknown>): void {
  const count = (msg.savedCount as number) || 0;

  // Remove the diff panel
  const panel = document.getElementById('learn-diff-panel');
  if (panel) panel.remove();

  // Success toast in chat
  appendChatBubble('assistant', `✅ Learned ${count} correction${count === 1 ? '' : 's'}. Your preferences have been saved.`);

  // Snapshots consumed — disable button
  setLearnButtonEnabled(false);
}

// ═══════════════════════════════════════════════════════════════
// AUTO-DETECT — LC Phase 4b
// ═══════════════════════════════════════════════════════════════

function handleAutoDetectCompared(msg: Record<string, unknown>): void {
  const corrections = (msg.corrections as CorrectionEntry[]) || [];
  if (corrections.length === 0) return; // silent pass

  const count = corrections.length;
  const notice = document.createElement('div');
  notice.className = 'auto-detect-notice';

  // Header
  const header = document.createElement('div');
  header.className = 'auto-detect-notice-header';

  const summary = document.createElement('span');
  summary.textContent = `Noticed ${count} edit${count === 1 ? '' : 's'} since last design`;

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'auto-detect-toggle-btn';
  toggleBtn.textContent = '▾ Details';

  header.appendChild(summary);
  header.appendChild(toggleBtn);

  // Body (hidden initially)
  const body = document.createElement('div');
  body.className = 'auto-detect-notice-body';
  body.style.display = 'none';

  const list = document.createElement('ul');
  list.className = 'auto-detect-correction-list';
  for (const c of corrections) {
    const li = document.createElement('li');
    const icons: Record<string, string> = { typography: '🔤', color: '🎨', spacing: '↔', shape: '⬜' };
    const icon = icons[c.category] || '•';
    li.textContent = `${icon} ${c.nodeName} — ${c.property}: ${String(c.beforeValue)} → ${String(c.afterValue)}`;
    list.appendChild(li);
  }
  body.appendChild(list);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'auto-detect-notice-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'auto-detect-save-btn';
  saveBtn.textContent = 'Save as corrections';

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'auto-detect-dismiss-btn';
  dismissBtn.textContent = 'Dismiss';

  actions.appendChild(saveBtn);
  actions.appendChild(dismissBtn);
  body.appendChild(actions);

  notice.appendChild(header);
  notice.appendChild(body);

  // Toggle expand/collapse
  toggleBtn.addEventListener('click', () => {
    const expanded = body.style.display !== 'none';
    body.style.display = expanded ? 'none' : 'block';
    toggleBtn.textContent = expanded ? '▾ Details' : '▴ Hide';
  });

  // Save handler
  saveBtn.addEventListener('click', () => {
    saveBtn.disabled = true;
    dismissBtn.disabled = true;
    postToSandbox({ type: 'save-corrections', corrections });
    postToSandbox({ type: 'aggregate-preferences' });

    // Replace action row with saved message
    const savedMsg = document.createElement('div');
    savedMsg.className = 'auto-detect-saved-msg';
    savedMsg.textContent = `Saved ${count} correction${count === 1 ? '' : 's'} ✓`;
    actions.replaceWith(savedMsg);

    // Auto-remove after 3s
    setTimeout(() => { notice.remove(); }, 3000);
  });

  // Dismiss handler
  dismissBtn.addEventListener('click', () => { notice.remove(); });

  // Insert before the last child (user bubble) in chat messages
  const messagesEl = $('chat-messages');
  const lastChild = messagesEl.lastElementChild;
  if (lastChild) {
    messagesEl.insertBefore(notice, lastChild);
  } else {
    messagesEl.appendChild(notice);
  }
}

// ═══════════════════════════════════════════════════════════════
// CHAT — UI
// ═══════════════════════════════════════════════════════════════

export function initChat() {
  const input = $('chat-input') as HTMLTextAreaElement;
  const sendBtn = $('chat-send');

  sendBtn.addEventListener('click', () => sendMessage());
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Paste handler — capture image from clipboard
  input.addEventListener('paste', (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) return;
        if (blob.size > 20 * 1024 * 1024) {
          appendChatBubble('assistant', '<span class="chat-error">File too large (max 20MB)</span>');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          pendingAttachment = reader.result as string;
          renderAttachmentPreview(pendingAttachment);
        };
        reader.readAsDataURL(blob);
        return; // Image handled — don't allow text paste fallthrough
      }
    }
    // No image item found — let normal text paste proceed
  });

  // CF-1: Upload button handler — file picker for images
  $('chat-upload-btn').addEventListener('click', () => {
    ($('chat-file-upload') as HTMLInputElement).click();
  });

  ($('chat-file-upload') as HTMLInputElement).addEventListener('change', (e: Event) => {
    const fileInput = e.target as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf', 'text/plain'];
    if (!validTypes.includes(file.type)) {
      appendChatBubble('assistant', '<span class="chat-error">Unsupported file type. Please upload PNG, JPG, WEBP, SVG, PDF, or TXT.</span>');
      fileInput.value = '';
      return;
    }

    // Validate file size (20MB max)
    if (file.size > 20 * 1024 * 1024) {
      appendChatBubble('assistant', '<span class="chat-error">File too large (max 20MB)</span>');
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      addAttachment(file.name, file.type, reader.result as string, file.size);
    };
    reader.readAsDataURL(file);
    fileInput.value = ''; // Reset so the same file can be re-selected
  });

  $('chat-new').addEventListener('click', () => {
    conversationHistory = [];
    geminiHistory = [];
    openaiHistory = [];
    claudeCodeHistory = [];
    clearAttachments();
    $('chat-messages').innerHTML = '';
    addChatWelcome();
  });

  // ── "Learn from my edits" button (LC Phase 4a) ──────────────────────────────
  const learnBtn = document.getElementById('chat-learn') as HTMLButtonElement | null;
  if (learnBtn) {
    learnBtn.addEventListener('click', () => handleLearnFromEdits());
  }

  // Initialize snapshot status (enable/disable button)
  updateLearnButtonState();

  // LC-8: Load learning config to initialize autoDetectEnabled
  postToSandbox({ type: 'get-learning-config' });

  // Re-check snapshot status every 30s
  setInterval(() => updateLearnButtonState(), 30_000);

  // Handle LC sandbox messages
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;

    switch (msg.type) {
      case 'snapshot-taken':
        // A new snapshot was stored — re-check button state
        updateLearnButtonState();
        break;

      case 'snapshot-status':
        setLearnButtonEnabled(Array.isArray(msg.frames) && msg.frames.length > 0);
        break;

      case 'snapshot-compared':
        if (msg.source === 'auto') {
          handleAutoDetectCompared(msg);
        } else {
          handleSnapshotCompared(msg);
        }
        break;

      case 'learning-config-loaded':
        autoDetectEnabled = (msg.config as Record<string, unknown>)?.autoDetect === true;
        break;

      case 'corrections-saved':
        handleCorrectionsSaved(msg);
        break;

      case 'snapshots-cleared':
        setLearnButtonEnabled(false);
        break;
    }
  });

  // ── Theme toggle wiring ───────────────────────────────────────
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIconSun = document.getElementById('themeIconSun');
  const themeIconMoon = document.getElementById('themeIconMoon');

  function applyTheme(theme: string) {
    document.documentElement.dataset.theme = theme;
    if (themeIconSun && themeIconMoon) {
      themeIconSun.style.display = theme === 'light' ? '' : 'none';
      themeIconMoon.style.display = theme === 'dark' ? '' : 'none';
    }
  }

  themeToggleBtn?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    postToSandbox({ type: 'save-theme', theme: next });
  });

  // Listen for theme loaded from storage on startup
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (msg?.type === 'load-theme' && msg.theme) {
      applyTheme(msg.theme);
    }
  });

  // Request saved theme from sandbox
  postToSandbox({ type: 'get-theme' });

  // ── Migrate settings + bridge content into sheet on init ──────
  const sheetBody = document.getElementById('settingsSheetBody');
  if (sheetBody && sheetBody.children.length === 0) {
    const settingsContent = document.querySelector('#tab-settings .chat-settings-content');
    if (settingsContent) sheetBody.appendChild(settingsContent);
    const bridgeContent = document.querySelector('#tab-bridge .bridge-content');
    if (bridgeContent) {
      const bridgeSection = document.createElement('div');
      bridgeSection.className = 'sheet-section';
      const bridgeTitle = document.createElement('div');
      bridgeTitle.className = 'sheet-section-title';
      bridgeTitle.textContent = 'MCP Bridge';
      bridgeSection.appendChild(bridgeTitle);
      bridgeSection.appendChild(bridgeContent);
      sheetBody.appendChild(bridgeSection);
    }
  }
  // Note: open/close handled by settings.ts via dom.settingsPanel/settingsOverlay (redirected to sheet in state.ts)

  // ── Dropdown wiring (mode & model selectors) ─────────────────
  function setupDropdown(btnId: string, menuId: string) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      // Close all dropdowns first
      document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    });
  }

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  });

  setupDropdown('modelSelectorBtn', 'modelDropdown');
  setupDropdown('quickActionBtn', 'quickActionDropdown');

  // ── Populate model dropdown from settings-model <select> ──────
  const modelDropdown = document.getElementById('modelDropdown');
  const modelSelectorLabel = document.getElementById('modelSelectorLabel');
  const settingsModelSelect = document.getElementById('settings-model') as HTMLSelectElement | null;

  function populateModelDropdown() {
    if (!modelDropdown || !settingsModelSelect) return;
    modelDropdown.innerHTML = '';
    const currentModel = settingsModelSelect.value;

    let lastGroup = '';
    for (const opt of Array.from(settingsModelSelect.options)) {
      const group = opt.parentElement?.tagName === 'OPTGROUP'
        ? (opt.parentElement as HTMLOptGroupElement).label
        : '';
      if (group && group !== lastGroup) {
        if (lastGroup) {
          const div = document.createElement('div');
          div.className = 'dropdown-divider';
          modelDropdown.appendChild(div);
        }
        const label = document.createElement('div');
        label.className = 'dropdown-label';
        label.textContent = group;
        modelDropdown.appendChild(label);
        lastGroup = group;
      }
      const item = document.createElement('div');
      item.className = 'dropdown-item' + (opt.value === currentModel ? ' active' : '');
      item.dataset.model = opt.value;
      item.textContent = opt.textContent?.trim() || opt.value;
      modelDropdown.appendChild(item);
    }

    // Update toolbar label
    const selectedOpt = settingsModelSelect.selectedOptions[0];
    if (modelSelectorLabel && selectedOpt) {
      modelSelectorLabel.textContent = selectedOpt.textContent?.trim() || 'Model';
    }
  }

  populateModelDropdown();

  // ── Model dropdown item click → update settings model ─────────
  modelDropdown?.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement | null;
    if (!item || !item.dataset.model) return;

    // Update the hidden settings select
    if (settingsModelSelect) {
      settingsModelSelect.value = item.dataset.model;
      settingsModelSelect.dispatchEvent(new Event('change'));
    }

    // Update chatSettings
    chatSettings.model = item.dataset.model;

    // Refresh dropdown active state + label
    modelDropdown.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    if (modelSelectorLabel) modelSelectorLabel.textContent = item.textContent?.trim() || 'Model';
    modelDropdown.classList.remove('open');
  });

  // CU-6: Mode dropdown removed — replaced by QuickAction dropdown

  // ── CU-1: Register built-in quick actions ────────────────────
  registerBuiltinQuickActions();

  // ── CU-1: Quick action dropdown wiring ──────────────────────
  const qaDropdown = document.getElementById('quickActionDropdown');
  qaDropdown?.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement | null;
    if (!item || !item.dataset.action) return;
    e.stopPropagation(); // Prevent bubble to parent button which would reopen
    qaDropdown.classList.remove('open');
    activateQuickAction(item.dataset.action);
  });

  // Populate quick action dropdown dynamically
  if (qaDropdown) {
    qaDropdown.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'dropdown-label';
    label.textContent = 'Quick Actions';
    qaDropdown.appendChild(label);
    for (const qa of quickActionRegistry) {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.dataset.action = qa.id;
      item.textContent = `${qa.icon} ${qa.label}`;
      qaDropdown.appendChild(item);
    }
  }

  // ── CU-4: Design drawer toggle ──────────────────────────────
  const designDrawerBtn = document.getElementById('designDrawerBtn');
  designDrawerBtn?.addEventListener('click', () => {
    const drawer = document.getElementById('design-drawer');
    if (drawer?.classList.contains('open')) closeDesignDrawer();
    else openDesignDrawer();
  });

  // ── CU-7: Keyboard shortcuts (expanded) ──────────────────────
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const isCmd = e.metaKey || e.ctrlKey;
    const sheetEl = document.getElementById('settingsSheet');

    // Cmd+, → toggle API settings sheet
    if (isCmd && e.key === ',') {
      e.preventDefault();
      if (sheetEl?.classList.contains('open')) closeSettings();
      else openSettings();
      return;
    }

    // Escape → dismiss layers (quick action → design drawer → settings → dropdowns)
    if (e.key === 'Escape') {
      if (activeQuickAction) { dismissQuickActionCard(); return; }
      const designDrawer = document.getElementById('design-drawer');
      if (designDrawer?.classList.contains('open')) { closeDesignDrawer(); return; }
      if (sheetEl?.classList.contains('open')) { closeSettings(); return; }
      document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
      return;
    }

    // Cmd+K → focus chat input
    if (isCmd && e.key === 'k') {
      e.preventDefault();
      ($('chat-input') as HTMLTextAreaElement).focus();
      return;
    }

    // Cmd+Shift+S → open Screenshot quick action (fallback: Cmd+Alt+S)
    if (isCmd && (e.shiftKey || e.altKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      activateQuickAction('screenshot-to-layout');
      return;
    }

    // Cmd+Shift+A → open Ad Analyzer quick action (fallback: Cmd+Alt+A)
    if (isCmd && (e.shiftKey || e.altKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      activateQuickAction('ad-analyzer');
      return;
    }
  });

  // ── Textarea auto-grow ────────────────────────────────────────
  const chatTextarea = $('chat-input') as HTMLTextAreaElement;
  chatTextarea.addEventListener('input', () => {
    chatTextarea.style.height = 'auto';
    chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 200) + 'px';
  });

  // ── CU-7: Rotating placeholder text ─────────────────────────
  const placeholders = [
    'Describe a design to generate...',
    'Drop a screenshot to convert...',
    'Ask about your Figma selection...',
    'Create a social post, presentation, or hero...',
    'Fill a template with AI content...',
  ];
  let placeholderIndex = 0;
  let placeholderInterval: ReturnType<typeof setInterval> | null = null;

  function startPlaceholderRotation() {
    stopPlaceholderRotation();
    placeholderInterval = setInterval(() => {
      if (document.activeElement === chatTextarea || chatTextarea.value.trim()) return;
      placeholderIndex = (placeholderIndex + 1) % placeholders.length;
      chatTextarea.placeholder = placeholders[placeholderIndex];
    }, 5000);
  }

  function stopPlaceholderRotation() {
    if (placeholderInterval) { clearInterval(placeholderInterval); placeholderInterval = null; }
  }

  chatTextarea.addEventListener('focus', stopPlaceholderRotation);
  chatTextarea.addEventListener('blur', startPlaceholderRotation);
  startPlaceholderRotation();

  // ── MF-5: Selection context listener ──────────────────────────
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (msg?.type === 'selection-changed') {
      currentSelection = { nodes: (msg.selection || []).slice(0, 20) };
      selectionIncluded = true;
      renderSelectionBadge();
      renderSelectionHint();
    }
  });

  // Request initial selection
  postToSandbox({ type: 'get-selection' });

  // ── MF-2: Drag & drop zone ───────────────────────────────────
  const chatSurface = document.querySelector('.chat-surface') as HTMLElement;
  if (chatSurface) {
    let dragCounter = 0;
    const dropOverlay = document.createElement('div');
    dropOverlay.className = 'drop-overlay';
    dropOverlay.innerHTML = `<div class="drop-overlay-content"><svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><div>Drop files here</div><div class="drop-overlay-hint">Images, PDFs, SVGs, text files</div></div>`;
    chatSurface.style.position = 'relative';
    chatSurface.appendChild(dropOverlay);

    chatSurface.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounter++;
        dropOverlay.classList.add('active');
      }
    });

    chatSurface.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dropOverlay.classList.remove('active');
      }
    });

    chatSurface.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    chatSurface.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropOverlay.classList.remove('active');

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf', 'text/plain'];
      for (const file of Array.from(files)) {
        if (!validTypes.includes(file.type)) continue;
        if (file.size > 20 * 1024 * 1024) {
          appendChatBubble('assistant', `<span class="chat-error">${file.name} too large (max 20MB)</span>`);
          continue;
        }
        const reader = new FileReader();
        reader.onload = () => addAttachment(file.name, file.type, reader.result as string, file.size);
        reader.readAsDataURL(file);
      }
    });
  }

  addChatWelcome();
}

// ═══════════════════════════════════════════════════════════════
// MF-5: SELECTION BADGE
// ═══════════════════════════════════════════════════════════════

function renderSelectionBadge(): void {
  const existing = document.getElementById('selection-badge');
  if (existing) existing.remove();

  if (!selectionIncluded || currentSelection.nodes.length === 0) return;

  const inputArea = document.querySelector('.input-area');
  if (!inputArea) return;

  const badge = document.createElement('div');
  badge.id = 'selection-badge';
  badge.className = 'selection-badge';

  const nodes = currentSelection.nodes;
  if (nodes.length === 1) {
    const n = nodes[0];
    badge.innerHTML = `<span class="selection-badge-icon">🔲</span><span class="selection-badge-text">${n.name} <span class="selection-badge-dim">${Math.round(n.width)}×${Math.round(n.height)} ${n.type}</span></span>`;
  } else {
    badge.innerHTML = `<span class="selection-badge-icon">🔲</span><span class="selection-badge-text">${nodes.length} frames selected</span>`;
  }

  const clearBtn = document.createElement('button');
  clearBtn.className = 'selection-badge-clear';
  clearBtn.textContent = '×';
  clearBtn.title = 'Remove selection from message';
  clearBtn.addEventListener('click', () => {
    selectionIncluded = false;
    renderSelectionBadge();
  });
  badge.appendChild(clearBtn);

  // Insert before attachment queue or textarea
  const attachQueue = document.getElementById('attachment-queue');
  inputArea.insertBefore(badge, attachQueue || inputArea.firstChild);
}

// ═══════════════════════════════════════════════════════════════
// CU-7: SELECTION-AWARE SUGGESTION HINT
// ═══════════════════════════════════════════════════════════════

let selectionHintDebounce: ReturnType<typeof setTimeout> | null = null;

function renderSelectionHint(): void {
  if (selectionHintDebounce) clearTimeout(selectionHintDebounce);
  selectionHintDebounce = setTimeout(() => {
    const existing = document.getElementById('selection-hint');
    if (existing) existing.remove();

    if (currentSelection.nodes.length === 0 || !selectionIncluded) return;

    const inputArea = document.querySelector('.input-area');
    if (!inputArea) return;

    const hint = document.createElement('div');
    hint.id = 'selection-hint';
    hint.className = 'selection-hint';

    const n = currentSelection.nodes[0];
    const name = n.name.length > 25 ? n.name.slice(0, 22) + '...' : n.name;
    const suggestions = currentSelection.nodes.length === 1
      ? `Try: "redesign ${name}" or "fill template placeholders"`
      : `Try: "redesign these frames" or "make them consistent"`;

    hint.textContent = suggestions;
    inputArea.appendChild(hint);
  }, 300); // 300ms debounce
}

// ═══════════════════════════════════════════════════════════════
// CU-1: QUICK ACTION CARD RENDERER
// ═══════════════════════════════════════════════════════════════

function renderQuickActionCard(): void {
  // Remove existing card DOM without clearing activeQuickAction state
  const existingCard = document.getElementById('quick-action-card');
  if (existingCard) existingCard.remove();
  quickActionValues = {};

  if (!activeQuickAction) return;
  const action = activeQuickAction;

  const inputArea = document.querySelector('.input-area');
  if (!inputArea) return;

  const card = document.createElement('div');
  card.id = 'quick-action-card';
  card.className = 'quick-action-card';

  // Header
  const header = document.createElement('div');
  header.className = 'qa-card-header';
  header.innerHTML = `<span>${action.icon} ${action.label}</span>`;
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'qa-card-cancel';
  cancelBtn.textContent = '×';
  cancelBtn.addEventListener('click', dismissQuickActionCard);
  header.appendChild(cancelBtn);
  card.appendChild(header);

  // Fields
  const fieldsEl = document.createElement('div');
  fieldsEl.className = 'qa-card-fields';

  for (const field of action.fields) {
    const wrapper = document.createElement('div');
    wrapper.className = 'qa-field';

    if (field.type === 'file') {
      // File drop zone
      const dropZone = document.createElement('div');
      dropZone.className = 'qa-file-zone';
      dropZone.id = `qa-field-${field.key}`;
      dropZone.innerHTML = `<span class="qa-file-zone-label">${field.placeholder || 'Drop image here'}</span>`;
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
      dropZone.addEventListener('click', () => {
        const fi = document.createElement('input');
        fi.type = 'file';
        fi.accept = field.accept || 'image/*';
        fi.addEventListener('change', () => {
          const f = fi.files?.[0];
          if (f) handleQuickActionFile(field.key, f, dropZone);
        });
        fi.click();
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const f = e.dataTransfer?.files[0];
        if (f) handleQuickActionFile(field.key, f, dropZone);
      });
      wrapper.appendChild(dropZone);
    } else if (field.type === 'select') {
      const sel = document.createElement('select');
      sel.className = 'qa-select';
      sel.id = `qa-field-${field.key}`;
      for (const opt of field.options || []) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => { quickActionValues[field.key] = sel.value; });
      quickActionValues[field.key] = sel.value;

      const label = document.createElement('label');
      label.className = 'qa-label';
      label.textContent = field.label;
      wrapper.appendChild(label);
      wrapper.appendChild(sel);
    } else if (field.type === 'textarea') {
      const label = document.createElement('label');
      label.className = 'qa-label';
      label.textContent = field.label;
      const ta = document.createElement('textarea');
      ta.className = 'qa-textarea';
      ta.id = `qa-field-${field.key}`;
      ta.placeholder = field.placeholder || '';
      ta.rows = 2;
      ta.addEventListener('input', () => { quickActionValues[field.key] = ta.value; });
      wrapper.appendChild(label);
      wrapper.appendChild(ta);
    } else {
      const label = document.createElement('label');
      label.className = 'qa-label';
      label.textContent = field.label;
      const inp = document.createElement('input');
      inp.className = 'qa-input';
      inp.type = 'text';
      inp.id = `qa-field-${field.key}`;
      inp.placeholder = field.placeholder || '';
      inp.addEventListener('input', () => { quickActionValues[field.key] = inp.value; });
      if (!field.required) quickActionValues[field.key] = '';
      wrapper.appendChild(label);
      wrapper.appendChild(inp);
    }
    fieldsEl.appendChild(wrapper);
  }
  card.appendChild(fieldsEl);

  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.className = 'qa-card-submit';
  submitBtn.id = 'qa-card-submit';
  submitBtn.textContent = action.id === 'ad-analyzer' ? 'Analyze' : 'Generate';
  submitBtn.addEventListener('click', submitQuickAction);
  card.appendChild(submitBtn);

  inputArea.insertBefore(card, inputArea.firstChild);

  // Update submit state
  updateQuickActionSubmitState();
}

function handleQuickActionFile(key: string, file: File, dropZone: HTMLElement): void {
  if (file.size > 20 * 1024 * 1024) {
    appendChatBubble('assistant', `<span class="chat-error">${file.name} too large (max 20MB)</span>`);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUri = reader.result as string;
    quickActionValues[key] = dataUri;
    // Show thumbnail
    if (file.type.startsWith('image/') && !file.type.includes('svg')) {
      dropZone.innerHTML = `<img class="qa-file-thumb" src="${dataUri}" alt="${file.name}">`;
    } else {
      dropZone.innerHTML = `<span class="qa-file-zone-label">${file.name}</span>`;
    }
    dropZone.classList.add('has-file');
    // Also add to attachment queue for sendMessage
    addAttachment(file.name, file.type, dataUri, file.size);
    updateQuickActionSubmitState();
  };
  reader.readAsDataURL(file);
}

function updateQuickActionSubmitState(): void {
  if (!activeQuickAction) return;
  const btn = document.getElementById('qa-card-submit') as HTMLButtonElement | null;
  if (!btn) return;

  const allRequired = activeQuickAction.fields
    .filter(f => f.required)
    .every(f => quickActionValues[f.key]?.trim());

  btn.disabled = !allRequired || isProcessing;
  if (isProcessing) btn.title = 'Processing...';
  else btn.title = '';
}

function submitQuickAction(): void {
  if (!activeQuickAction || isProcessing) return;

  const prompt = activeQuickAction.buildPrompt(quickActionValues, pendingAttachments);
  const chatInput = $('chat-input') as HTMLTextAreaElement;
  chatInput.value = prompt;

  dismissQuickActionCard();
  sendMessage();
}

function dismissQuickActionCard(): void {
  activeQuickAction = null;
  quickActionValues = {};
  const existing = document.getElementById('quick-action-card');
  if (existing) {
    existing.classList.add('qa-card-exit');
    setTimeout(() => existing.remove(), 100);
  }
}

function activateQuickAction(id: string): void {
  const action = quickActionRegistry.find(a => a.id === id);
  if (!action) return;
  activeQuickAction = action;
  quickActionValues = {};
  renderQuickActionCard();
}

// ═══════════════════════════════════════════════════════════════
// CU-4: DESIGN SETTINGS DRAWER
// ═══════════════════════════════════════════════════════════════

function renderDesignDrawer(): void {
  if (document.getElementById('design-drawer')) return;

  const backdrop = document.createElement('div');
  backdrop.id = 'design-drawer-backdrop';
  backdrop.className = 'design-drawer-backdrop';
  backdrop.addEventListener('click', closeDesignDrawer);

  const drawer = document.createElement('aside');
  drawer.id = 'design-drawer';
  drawer.className = 'design-drawer';

  drawer.innerHTML = `
    <div class="drawer-header">
      <span class="drawer-title">Design Settings</span>
      <button class="icon-btn" id="drawerClose">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="drawer-body">
      <div class="drawer-section">
        <div class="drawer-section-title">Generation</div>
        <label class="drawer-label">Image Model</label>
        <select class="drawer-select" id="ds-image-model">
          <option value="nano-banana-2">Nano Banana 2</option>
          <option value="gemini-imagen">Gemini Imagen</option>
          <option value="dall-e-3">DALL-E 3</option>
        </select>
        <label class="drawer-label">Quality</label>
        <div class="drawer-radio-group" id="ds-quality">
          <label class="drawer-radio"><input type="radio" name="ds-quality" value="1k"> 1k</label>
          <label class="drawer-radio"><input type="radio" name="ds-quality" value="2k" checked> 2k</label>
          <label class="drawer-radio"><input type="radio" name="ds-quality" value="4k"> 4k</label>
        </div>
        <label class="drawer-label">Style</label>
        <select class="drawer-select" id="ds-style">
          <option value="auto">Auto</option>
          <option value="photographic">Photographic</option>
          <option value="illustration">Illustration</option>
          <option value="artistic">Artistic</option>
        </select>
      </div>
      <div class="drawer-section">
        <div class="drawer-section-title">Design Defaults</div>
        <label class="drawer-label">Default Font</label>
        <select class="drawer-select" id="ds-font">
          <option value="auto">Auto (from brief)</option>
          <option value="Inter">Inter</option>
          <option value="Playfair Display">Playfair Display</option>
          <option value="Space Grotesk">Space Grotesk</option>
          <option value="DM Sans">DM Sans</option>
          <option value="Cormorant Garamond">Cormorant Garamond</option>
        </select>
        <label class="drawer-label">Brand Colors</label>
        <div class="drawer-colors" id="ds-colors"></div>
        <label class="drawer-label">8px Grid</label>
        <label class="drawer-toggle"><input type="checkbox" id="ds-grid" checked> Enabled</label>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  // Bind close button
  drawer.querySelector('#drawerClose')?.addEventListener('click', closeDesignDrawer);

  // Load saved values
  const s = designSettings;
  (drawer.querySelector('#ds-image-model') as HTMLSelectElement).value = s.imageModel;
  (drawer.querySelector('#ds-style') as HTMLSelectElement).value = s.imageStyle;
  (drawer.querySelector('#ds-font') as HTMLSelectElement).value = s.defaultFont;
  (drawer.querySelector('#ds-grid') as HTMLInputElement).checked = s.gridEnabled;
  const qualityRadio = drawer.querySelector(`input[name="ds-quality"][value="${s.imageQuality}"]`) as HTMLInputElement | null;
  if (qualityRadio) qualityRadio.checked = true;

  // Render color chips
  renderColorChips();

  // Bind change events
  drawer.querySelector('#ds-image-model')?.addEventListener('change', (e) => { designSettings.imageModel = (e.target as HTMLSelectElement).value; saveDesignSettings(designSettings); });
  drawer.querySelector('#ds-style')?.addEventListener('change', (e) => { designSettings.imageStyle = (e.target as HTMLSelectElement).value; saveDesignSettings(designSettings); });
  drawer.querySelector('#ds-font')?.addEventListener('change', (e) => { designSettings.defaultFont = (e.target as HTMLSelectElement).value; saveDesignSettings(designSettings); });
  drawer.querySelector('#ds-grid')?.addEventListener('change', (e) => { designSettings.gridEnabled = (e.target as HTMLInputElement).checked; saveDesignSettings(designSettings); });
  drawer.querySelectorAll('input[name="ds-quality"]').forEach(r => r.addEventListener('change', (e) => { designSettings.imageQuality = (e.target as HTMLInputElement).value; saveDesignSettings(designSettings); }));
}

function renderColorChips(): void {
  const container = document.getElementById('ds-colors');
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < designSettings.brandColors.length; i++) {
    const hex = designSettings.brandColors[i];
    const chip = document.createElement('span');
    chip.className = 'color-chip';
    chip.style.background = hex;
    chip.title = hex;
    chip.addEventListener('click', () => {
      designSettings.brandColors.splice(i, 1);
      saveDesignSettings(designSettings);
      renderColorChips();
    });
    container.appendChild(chip);
  }

  if (designSettings.brandColors.length < 6) {
    const addBtn = document.createElement('button');
    addBtn.className = 'color-chip-add';
    addBtn.textContent = '+';
    addBtn.title = 'Add brand color';
    addBtn.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.addEventListener('input', () => {
        designSettings.brandColors.push(inp.value);
        saveDesignSettings(designSettings);
        renderColorChips();
      });
      inp.click();
    });
    container.appendChild(addBtn);
  }
}

function openDesignDrawer(): void {
  renderDesignDrawer();
  requestAnimationFrame(() => {
    document.getElementById('design-drawer')?.classList.add('open');
    document.getElementById('design-drawer-backdrop')?.classList.add('open');
  });
}

function closeDesignDrawer(): void {
  document.getElementById('design-drawer')?.classList.remove('open');
  document.getElementById('design-drawer-backdrop')?.classList.remove('open');
}

// ═══════════════════════════════════════════════════════════════
// CU-2 & CU-3: QUICK ACTION REGISTRATIONS
// ═══════════════════════════════════════════════════════════════

function registerBuiltinQuickActions(): void {
  // CU-2: Screenshot to Layout
  registerQuickAction({
    id: 'screenshot-to-layout',
    label: 'Screenshot to Layout',
    icon: '📸',
    description: 'Convert screenshots into Figma designs',
    fields: [
      { key: 'image', label: 'Screenshot', type: 'file', required: true, placeholder: 'Drop screenshot here or click to upload', accept: '.png,.jpg,.jpeg,.webp' },
      { key: 'format', label: 'Format', type: 'select', required: false, options: [
        { value: 'auto', label: 'Auto-detect' },
        { value: '1080x1350', label: 'Instagram (1080×1350)' },
        { value: '1200x627', label: 'LinkedIn (1200×627)' },
        { value: '1280x720', label: 'YouTube (1280×720)' },
        { value: '1440x800', label: 'Web Hero (1440×800)' },
        { value: '1920x1080', label: 'Presentation (1920×1080)' },
      ]},
    ],
    buildPrompt: (values) => {
      const fmt = values.format && values.format !== 'auto' ? ` Target format: ${values.format}.` : '';
      return `Convert this screenshot to an editable Figma layout. Recreate the exact design with proper auto-layout, text nodes, and styling.${fmt}`;
    },
  });

  // CU-3: Ad Analyzer
  registerQuickAction({
    id: 'ad-analyzer',
    label: 'Ad Analyzer',
    icon: '🎯',
    description: 'Analyze ads and build 3 redesigned variants',
    fields: [
      { key: 'image', label: 'Ad Image', type: 'file', required: true, placeholder: 'Drop ad image here', accept: '.png,.jpg,.jpeg,.webp' },
      { key: 'product', label: 'Product Name', type: 'text', required: true, placeholder: 'e.g. Café Noir Premium Blend' },
      { key: 'category', label: 'Category', type: 'text', required: false, placeholder: 'e.g. Coffee, SaaS, Fashion' },
      { key: 'platform', label: 'Platform', type: 'select', required: false, options: [
        { value: 'instagram-4x5', label: 'Instagram 4:5' },
        { value: 'instagram-1x1', label: 'Instagram 1:1' },
        { value: 'instagram-story', label: 'Instagram Story' },
        { value: 'facebook-feed', label: 'Facebook Feed' },
      ]},
      { key: 'notes', label: 'Notes', type: 'textarea', required: false, placeholder: 'Additional context or requirements...' },
    ],
    buildPrompt: (values) => {
      const parts = [`Analyze this ad image and create 3 redesigned variants.`];
      parts.push(`Product: ${values.product}`);
      if (values.category) parts.push(`Category: ${values.category}`);
      if (values.platform) parts.push(`Platform: ${values.platform}`);
      if (values.notes) parts.push(`Notes: ${values.notes}`);
      parts.push(`Use start_ad_analyzer to begin the analysis, then complete_ad_analyzer for each variant.`);
      return parts.join('\n');
    },
  });
}

function addChatWelcome() {
  const messagesEl = $('chat-messages');
  messagesEl.innerHTML = `<div class="welcome-state">
    <div class="welcome-logo">F</div>
    <div class="welcome-title">Figmento</div>
    <div class="welcome-subtitle">Your AI design assistant. Describe what you want to create.</div>
  </div>`;
  renderChatTemplates();
}

function appendChatBubble(role: 'user' | 'assistant', html: string) {
  const messagesEl = $('chat-messages');
  const welcome = messagesEl.querySelector('.welcome-state');
  if (welcome) welcome.remove();
  const templates = messagesEl.querySelector('.welcome-templates');
  if (templates) templates.remove();

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.innerHTML = html;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendToolAction(name: string, summary: string, isError: boolean = false) {
  const messagesEl = $('chat-messages');
  const action = document.createElement('div');
  action.className = 'tool-action' + (isError ? ' error' : '');
  action.innerHTML = `<span class="tool-icon">${isError ? '!' : '>'}</span>
    <span class="tool-name">${escapeHtml(name)}</span>
    <span class="tool-summary">${escapeHtml(summary)}</span>`;
  messagesEl.appendChild(action);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setProcessing(processing: boolean) {
  isProcessing = processing;
  ($('chat-send') as HTMLButtonElement).disabled = processing;
  ($('chat-input') as HTMLTextAreaElement).disabled = processing;
  $('chat-loading').style.display = processing ? 'flex' : 'none';
}

// ═══════════════════════════════════════════════════════════════
// CHAT — MESSAGE SENDING
// ═══════════════════════════════════════════════════════════════

async function sendMessage() {
  const input = $('chat-input') as HTMLTextAreaElement;
  let text = input.value.trim();
  if (!text || isProcessing) return;

  const useGemini = isGeminiModel(chatSettings.model);
  const useOpenAI = isOpenAIModel(chatSettings.model);
  const useClaudeCode = isClaudeCodeModel(chatSettings.model);

  // API keys required for both relay mode (sent to server) and direct mode
  // Claude Code uses Max subscription — no API key needed
  if (!useClaudeCode) {
    if (useGemini && !chatSettings.geminiApiKey) {
      appendChatBubble('assistant', '<span class="chat-error">Set your Gemini API key in Settings first.</span>');
      return;
    }
    if (useOpenAI && !chatSettings.openaiApiKey) {
      appendChatBubble('assistant', '<span class="chat-error">Set your OpenAI API key in Settings first.</span>');
      return;
    }
    if (!useGemini && !useOpenAI && !chatSettings.anthropicApiKey) {
      appendChatBubble('assistant', '<span class="chat-error">Set your Anthropic API key in Settings first.</span>');
      return;
    }
  }

  // Capture and clear attachments before the API call
  const capturedAttachments = [...pendingAttachments];
  const capturedAttachment = pendingAttachment; // legacy compat: first image
  clearAttachments();

  // MF-5: Capture selection context at send time
  const capturedSelection = selectionIncluded && currentSelection.nodes.length > 0
    ? { ...currentSelection } : null;

  // MF-4: Build file analysis instructions if attachments present
  if (capturedAttachments.length > 0) {
    const fileList = capturedAttachments.map(f => {
      const info = getFileTypeInfo(f);
      return `- ${f.name} (${info.badge}, ${formatFileSize(f.size)})`;
    }).join('\n');
    text += `\n\n[ATTACHED FILES]\n${fileList}\nAnalyze each file by type: images visually, PDFs via store_temp_file→import_pdf, SVGs as brand assets, text as context.`;
  }

  // MF-5: Inject selection context
  if (capturedSelection && capturedSelection.nodes.length > 0) {
    const nodes = capturedSelection.nodes.slice(0, 20);
    const nodeList = nodes.map(n => `- nodeId: "${n.id}", name: "${n.name}", type: ${n.type}, size: ${n.width}×${n.height}`).join('\n');
    const extra = capturedSelection.nodes.length > 20 ? `\n...and ${capturedSelection.nodes.length - 20} more nodes` : '';
    text += `\n\n[FIGMA SELECTION CONTEXT]\nSelected nodes (use these nodeIds for edits):\n${nodeList}${extra}`;
  }

  input.value = '';

  // Show user bubble with optional attachment/selection indicators
  const badges: string[] = [];
  if (capturedAttachments.length > 0) badges.push(`📎 ${capturedAttachments.length} file${capturedAttachments.length > 1 ? 's' : ''} attached`);
  if (capturedSelection) badges.push(`🔲 ${capturedSelection.nodes.length} frame${capturedSelection.nodes.length > 1 ? 's' : ''} selected`);
  const badgeHtml = badges.length > 0 ? `<br><span class="chat-attachment-indicator">${badges.join(' · ')}</span>` : '';
  const userHtml = escapeHtml(text.split('\n\n[ATTACHED FILES]')[0].split('\n\n[FIGMA SELECTION')[0]) + badgeHtml;
  appendChatBubble('user', userHtml);

  // Detect design brief from the user's message (KI-2)
  currentBrief = detectBrief(text);

  setProcessing(true);

  // LC-8: Auto-detect corrections before each AI turn (fire-and-forget)
  if (autoDetectEnabled) {
    postToSandbox({ type: 'compare-snapshot', source: 'auto' });
  }

  const relayEnabled = chatSettings.chatRelayEnabled;
  const bridgeConnected = getBridgeConnected();
  const channelId = getBridgeChannelId();
  console.log(`[Figmento Chat] sendMessage path: relayEnabled=${relayEnabled} bridgeConnected=${bridgeConnected} channelId=${channelId} model=${chatSettings.model} relayUrl=${chatSettings.chatRelayUrl}`);

  try {
    // Claude Code: always routes through local relay WS
    if (useClaudeCode) {
      if (!bridgeConnected) {
        throw new Error('Claude Code requires a local relay. Start with: `cd figmento-ws-relay && npm run dev`');
      }
      console.log('[Figmento Chat] → CLAUDE CODE path (WS)');
      await runClaudeCodeTurn(text, capturedAttachment);
    // Route through relay if enabled and bridge is connected
    } else if (relayEnabled && bridgeConnected) {
      console.log('[Figmento Chat] → RELAY path');
      await runRelayTurn(text, useGemini, useOpenAI, capturedAttachment);
    } else if (relayEnabled && !bridgeConnected) {
      // Fallback to direct API — relay is enabled but bridge is unreachable
      console.log('[Figmento Chat] → FALLBACK path (relay enabled but bridge not connected)');
      updateRelayStatus('fallback');
      await runDirectLoop(text, useGemini, useOpenAI, capturedAttachment);
    } else {
      console.log('[Figmento Chat] → DIRECT path (relay disabled)');
      await runDirectLoop(text, useGemini, useOpenAI, capturedAttachment);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    appendChatBubble('assistant', `<span class="chat-error">Error: ${escapeHtml(msg)}</span>`);
  } finally {
    setProcessing(false);
  }
}

// ═══════════════════════════════════════════════════════════════
// CHAT — RELAY STATUS
// ═══════════════════════════════════════════════════════════════

export type RelayConnectionState = 'disconnected' | 'connecting' | 'connected' | 'fallback' | 'error';

let relayConnectionState: RelayConnectionState = 'disconnected';

export function getRelayConnectionState(): RelayConnectionState {
  return relayConnectionState;
}

function updateRelayStatus(state: RelayConnectionState) {
  relayConnectionState = state;
  const dot = document.getElementById('relay-status-dot');
  const label = document.getElementById('relay-status-label');
  if (!dot || !label) return;

  dot.className = 'relay-dot ' + state;
  const labels: Record<RelayConnectionState, string> = {
    disconnected: 'Relay: Off',
    connecting: 'Relay: Connecting...',
    connected: 'Relay: Connected',
    fallback: 'Relay: Fallback (direct)',
    error: 'Relay: Error',
  };
  label.textContent = labels[state];
}

// ═══════════════════════════════════════════════════════════════
// CHAT — RELAY TURN (POST /chat/turn)
// ═══════════════════════════════════════════════════════════════

async function runRelayTurn(text: string, useGemini: boolean, useOpenAI: boolean, attachment: string | null): Promise<void> {
  const channelId = getBridgeChannelId();
  if (!channelId) {
    throw new Error('Bridge channel not available. Falling back to direct API.');
  }

  // LC-9: Load latest preferences before each relay turn (max 2s wait)
  learnedPreferences = await loadPreferencesFromSandbox();

  // IG-2: Snapshot current Figma selection (500ms timeout, graceful degradation)
  const selectionSnapshot = await getSelectionSnapshot();

  const provider = useGemini ? 'gemini' : useOpenAI ? 'openai' : 'claude';
  const apiKey = useGemini ? chatSettings.geminiApiKey
    : useOpenAI ? chatSettings.openaiApiKey
    : chatSettings.anthropicApiKey;
  const history = useGemini ? geminiHistory : useOpenAI ? openaiHistory : conversationHistory;

  const url = chatSettings.chatRelayUrl.replace(/\/+$/, '') + '/api/chat/turn';

  const body: Record<string, unknown> = {
    message: text,
    channel: channelId,
    provider,
    apiKey,
    model: chatSettings.model,
    history,
    memory: memoryEntries,
    preferences: learnedPreferences,
    geminiApiKey: chatSettings.geminiApiKey || undefined,
    ...(attachment && { attachmentBase64: attachment }),
    ...(selectionSnapshot.length > 0 && { currentSelection: selectionSnapshot }),
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let errMsg: string;
    try {
      errMsg = JSON.parse(errText).error || errText;
    } catch {
      errMsg = errText;
    }
    throw new Error(`Relay error ${resp.status}: ${errMsg}`);
  }

  const result = await resp.json();

  // Update conversation history from relay response
  if (useGemini) {
    geminiHistory.length = 0;
    geminiHistory.push(...(result.history || []));
  } else if (useOpenAI) {
    openaiHistory.length = 0;
    openaiHistory.push(...(result.history || []));
  } else {
    conversationHistory.length = 0;
    conversationHistory.push(...(result.history || []));
  }

  // Display tool calls
  if (result.toolCalls) {
    for (const tc of result.toolCalls) {
      appendToolAction(tc.name, tc.success ? 'Done' : 'Failed', !tc.success);
    }
  }

  // Display assistant text
  if (result.text) {
    appendChatBubble('assistant', formatMarkdown(result.text));
  }

  // Update local memory with new entries from server
  if (result.newMemoryEntries) {
    for (const entry of result.newMemoryEntries) {
      memoryEntries.push(entry);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CHAT — CLAUDE CODE TURN (WS → local relay → SDK subprocess)
// ═══════════════════════════════════════════════════════════════

async function runClaudeCodeTurn(text: string, attachment?: string | null): Promise<void> {
  const channelId = getBridgeChannelId();
  if (!channelId) {
    throw new Error('Bridge channel not available. Connect to the local relay first.');
  }

  // Send claude-code-turn message through the bridge WS
  const sent = sendBridgeMessage({
    type: 'claude-code-turn',
    channel: channelId,
    message: text,
    history: claudeCodeHistory,
    memory: memoryEntries,
    model: chatSettings.claudeCodeModel || undefined,
    ...(attachment && { attachmentBase64: attachment }),
  });

  if (!sent) {
    throw new Error('Claude Code requires a local relay. Start with: `cd figmento-ws-relay && npm run dev`');
  }

  // Wait for the result via the bridge's claude-code-turn-result handler
  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      setClaudeCodeResultHandler(null);
      reject(new Error('Claude Code turn timed out (10 min). The subprocess may still be running.'));
    }, 605_000); // Slightly longer than server timeout (600s) to let server timeout arrive first

    setClaudeCodeResultHandler((msg) => {
      clearTimeout(timeout);
      setClaudeCodeResultHandler(null);
      resolve(msg);
    });
  });

  // Handle error response
  if (result.error) {
    throw new Error(result.error as string);
  }

  // AC7: Render identically to relay turn responses
  // Update conversation history
  if (result.history) {
    claudeCodeHistory = result.history as Array<{ role: string; content: string }>;
  }

  // Display tool calls
  if (result.toolCalls) {
    for (const tc of result.toolCalls as Array<{ name: string; success: boolean }>) {
      appendToolAction(tc.name, tc.success ? 'Done' : 'Failed', !tc.success);
    }
  }

  // Display assistant text
  if (result.text) {
    appendChatBubble('assistant', formatMarkdown(result.text as string));
  }
}

/** Direct API path — used when relay is disabled or as fallback. */
async function runDirectLoop(text: string, useGemini: boolean, useOpenAI: boolean, attachment: string | null): Promise<void> {
  if (useGemini) {
    if (attachment) {
      const base64 = attachment.replace(/^data:image\/\w+;base64,/, '');
      const mimeMatch = attachment.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeMatch?.[1] || 'image/png';
      geminiHistory.push({
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } } as unknown as { text: string },
          { text },
        ],
      });
    } else {
      geminiHistory.push({ role: 'user', parts: [{ text }] });
    }
    await runGeminiLoop();
  } else if (useOpenAI) {
    if (attachment && (chatSettings.model.startsWith('gpt-4') || chatSettings.model.includes('gpt-4o'))) {
      openaiHistory.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: attachment } },
          { type: 'text', text },
        ],
      });
    } else {
      openaiHistory.push({ role: 'user', content: text });
    }
    await runOpenAILoop();
  } else {
    if (attachment) {
      const base64 = attachment.replace(/^data:image\/\w+;base64,/, '');
      const mimeMatch = attachment.match(/^data:(image\/\w+);base64,/);
      const mediaType = (mimeMatch?.[1] || 'image/png') as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
      conversationHistory.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text },
        ] as unknown as string,
      });
    } else {
      conversationHistory.push({ role: 'user', content: text });
    }
    await runAnthropicLoop();
  }
}

// ═══════════════════════════════════════════════════════════════
// CHAT — PROVIDER LOOP WRAPPERS (delegate to runToolUseLoop)
// ═══════════════════════════════════════════════════════════════

async function runAnthropicLoop(): Promise<void> {
  await runToolUseLoop({
    provider: 'claude',
    apiKey: chatSettings.anthropicApiKey,
    model: chatSettings.model,
    systemPrompt: buildSystemPrompt(currentBrief, memoryEntries, learnedPreferences),
    tools: chatToolResolver(),
    messages: conversationHistory,
    onToolCall: buildToolCallHandler(),
    onProgress: () => { /* progress reserved for future mode UI */ },
    onTextChunk: (text) => appendChatBubble('assistant', formatMarkdown(text)),
  });
}

async function runGeminiLoop(): Promise<void> {
  await runToolUseLoop({
    provider: 'gemini',
    apiKey: chatSettings.geminiApiKey,
    model: chatSettings.model,
    systemPrompt: buildSystemPrompt(currentBrief, memoryEntries, learnedPreferences),
    tools: chatToolResolver(),
    messages: geminiHistory,
    onToolCall: buildToolCallHandler(),
    onProgress: () => { /* progress reserved for future mode UI */ },
    onTextChunk: (text) => appendChatBubble('assistant', formatMarkdown(text)),
  });
}

async function runOpenAILoop(): Promise<void> {
  await runToolUseLoop({
    provider: 'openai',
    apiKey: chatSettings.openaiApiKey,
    model: chatSettings.model,
    systemPrompt: buildSystemPrompt(currentBrief, memoryEntries, learnedPreferences),
    tools: chatToolResolver(),
    messages: openaiHistory,
    onToolCall: buildToolCallHandler(),
    onProgress: () => { /* progress reserved for future mode UI */ },
    onTextChunk: (text) => appendChatBubble('assistant', formatMarkdown(text)),
  });
}

// ═══════════════════════════════════════════════════════════════
// CHAT — TOOL CALL HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Returns the unified onToolCall callback used by all three provider loops.
 * Handles special tools (generate_image, update_memory) and routes all
 * other tools through the sandbox bridge.
 *
 * Returned `content` is a sanitized string (base64 stripped, screenshot
 * summarized) ready for insertion into provider-specific message history.
 * Error messages do NOT include an "Error: " prefix — the loop adds it
 * where required by the provider protocol.
 */
function buildToolCallHandler(): (name: string, args: Record<string, unknown>) => Promise<ToolCallResult> {
  return async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
    if (name === 'generate_image') {
      return executeGenerateImage(args);
    }

    if (name === 'update_memory') {
      return executeUpdateMemory(args);
    }

    if (name === 'analyze_canvas_context') {
      return executeAnalyzeCanvasContext(args);
    }

    // Local intelligence tools — resolved from bundled knowledge, no network
    if (name in LOCAL_TOOL_HANDLERS) {
      const result = LOCAL_TOOL_HANDLERS[name](args);
      const content = JSON.stringify(result);
      appendToolAction(name, typeof result === 'object' && result !== null && 'error' in result ? (result as Record<string, string>).error : 'Done');
      return { content, is_error: false };
    }

    try {
      const data = await sendCommandToSandbox(name, args);
      const summary = formatToolSummary(name, data);
      appendToolAction(name, summary);

      const content = SCREENSHOT_TOOLS.has(name)
        ? summarizeScreenshotResult(name, data)
        : JSON.stringify(stripBase64FromResult(data));

      return { content, is_error: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      appendToolAction(name, msg, true);
      return { content: msg, is_error: true };
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// CHAT — SANDBOX BRIDGE
// ═══════════════════════════════════════════════════════════════

function sendCommandToSandbox(action: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const cmdId = `chat-${++chatCommandCounter}-${Date.now()}`;

    const timer = setTimeout(() => {
      pendingChatCommands.delete(cmdId);
      reject(new Error(`Command timeout: ${action}`));
    }, 30000);

    pendingChatCommands.set(cmdId, {
      resolve: (data) => { clearTimeout(timer); resolve(data); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });

    postToSandbox({
      type: 'execute-command',
      command: {
        type: 'command',
        id: cmdId,
        channel: 'chat',
        action,
        params,
      },
    });
  });
}

function formatToolSummary(name: string, data: Record<string, unknown>): string {
  if (data.nodeId && data.name) return `${data.name} (${data.nodeId})`;
  if (data.nodeId) return `Node ${data.nodeId}`;
  if (data.deleted) return `Deleted: ${data.name || 'node'}`;
  if (data.count !== undefined) return `${data.count} nodes`;
  return 'Done';
}

// ═══════════════════════════════════════════════════════════════
// SPECIAL TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════

async function executeAnalyzeCanvasContext(args: Record<string, unknown>): Promise<ToolCallResult> {
  appendToolAction('analyze_canvas_context', 'Analyzing canvas...');
  try {
    let nodeId = args.nodeId as string | undefined;

    if (!nodeId) {
      const selection = await sendCommandToSandbox('get_selection', {});
      const selNodes = (selection.nodes as Array<Record<string, unknown>>) || [];
      if (selNodes.length > 0) nodeId = selNodes[0].nodeId as string;
    }

    if (!nodeId) {
      const pageResult = await sendCommandToSandbox('get_page_nodes', {});
      const pageNodes = (pageResult.nodes as Array<Record<string, unknown>>) || [];
      const firstFrame = pageNodes.find((n: Record<string, unknown>) => n.type === 'FRAME') || pageNodes[0];
      if (firstFrame) nodeId = firstFrame.nodeId as string;
    }

    if (!nodeId) {
      appendToolAction('analyze_canvas_context', 'No frames found on canvas', true);
      return { content: 'No frames found on the canvas to analyze.', is_error: true };
    }

    const nodeInfo = await sendCommandToSandbox('get_node_info', { nodeId });

    const fills = (nodeInfo.fills as Array<Record<string, unknown>>) || [];
    const dominantColors = fills
      .filter(f => f.type === 'SOLID' && f.color)
      .map(f => f.color as string)
      .slice(0, 4);

    const children = (nodeInfo.children as Array<Record<string, unknown>>) || [];
    const textContent = children
      .filter(c => c.type === 'TEXT' && c.characters)
      .map(c => c.characters as string)
      .slice(0, 6);

    const context = {
      nodeId,
      name: nodeInfo.name || 'frame',
      dimensions: `${nodeInfo.width ?? '?'}x${nodeInfo.height ?? '?'}`,
      dominantColors,
      textContent,
      childCount: children.length,
      note: 'Use the colors and text above to infer the design mood and style for image generation.',
    };

    appendToolAction('analyze_canvas_context', `Analyzed "${context.name}" — ${dominantColors.length} colors, ${textContent.length} text elements`);
    return { content: JSON.stringify(context), is_error: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    appendToolAction('analyze_canvas_context', msg, true);
    return { content: `analyze_canvas_context failed: ${msg}`, is_error: true };
  }
}

async function executeGenerateImage(input: Record<string, unknown>): Promise<ToolCallResult> {
  const prompt = input.prompt as string;

  if (!chatSettings.geminiApiKey) {
    appendToolAction('generate_image', 'No Gemini API key set', true);
    return {
      content: 'Gemini API key not configured. Ask the user to add it in Settings.',
      is_error: true,
    };
  }

  try {
    appendToolAction('generate_image', `Generating: "${prompt.substring(0, 60)}..."`);

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${chatSettings.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );

    if (!resp.ok) {
      throw new Error(`Gemini API error ${resp.status}`);
    }

    const result = await resp.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p: Record<string, unknown>) => p.inlineData);
    const base64 = imgPart?.inlineData?.data;
    if (!base64) throw new Error('No image returned from Gemini');

    const imageData = `data:image/png;base64,${base64}`;
    const createParams: Record<string, unknown> = {
      imageData,
      name: (input.name as string) || 'AI Generated Image',
    };
    if (input.width) createParams.width = input.width;
    if (input.height) createParams.height = input.height;
    if (!input.parentId && !createParams.width) createParams.width = 400;
    if (!input.parentId && !createParams.height) createParams.height = 400;
    if (input.x !== undefined) createParams.x = input.x;
    if (input.y !== undefined) createParams.y = input.y;
    if (input.parentId) createParams.parentId = input.parentId;

    const data = await sendCommandToSandbox('create_image', createParams);
    appendToolAction('generate_image', `Placed image: ${data.name} (${data.nodeId})`);

    // Return lightweight placeholder — the full base64 was already sent to
    // the sandbox via create_image. Storing it in conversation history would
    // bloat every subsequent API call and trigger rate limits.
    const summary = JSON.stringify({
      nodeId: data.nodeId,
      name: data.name,
      note: 'Image generated and placed on canvas successfully.',
    });
    return { content: summary, is_error: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    appendToolAction('generate_image', msg, true);
    return { content: msg, is_error: true };
  }
}

async function executeUpdateMemory(input: Record<string, unknown>): Promise<ToolCallResult> {
  const entry = (input.entry as string) || '';
  if (!entry) {
    return { content: 'entry is required', is_error: true };
  }

  // Save to clientStorage via sandbox
  postToSandbox({ type: 'save-memory', entry });

  // Also update local state so it's available immediately
  memoryEntries.push(entry);

  appendToolAction('update_memory', `Saved: "${entry.substring(0, 60)}${entry.length > 60 ? '...' : ''}"`);

  return { content: JSON.stringify({ saved: true, entry }), is_error: false };
}

// ═══════════════════════════════════════════════════════════════
// MARKDOWN (minimal)
// ═══════════════════════════════════════════════════════════════

function formatMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
