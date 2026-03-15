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
let pendingAttachment: string | null = null;
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

const CHAT_TEMPLATES: ChatTemplate[] = [
  { icon: '📸', label: 'Instagram Ad',  prompt: 'Create an Instagram post (1080×1350) for a hippie coffee shop — warm earthy tones, vintage feel, include a CTA' },
  { icon: '💼', label: 'LinkedIn Post', prompt: 'Create a LinkedIn post banner (1200×627) for a SaaS productivity tool — modern, clean, corporate blue' },
  { icon: '🎬', label: 'YouTube Thumb', prompt: 'Create a YouTube thumbnail (1280×720) for a coding tutorial — dark background, bold text, tech feel' },
  { icon: '🌐', label: 'Web Hero',      prompt: 'Create a web hero section (1440×800) for a wellness app — soft greens, organic shapes, minimal' },
  { icon: '📊', label: 'Slide Deck',    prompt: 'Create a presentation title slide (1920×1080) for a startup pitch — bold, modern, dark theme' },
  { icon: '📄', label: 'A4 Flyer',      prompt: 'Create an A4 flyer (2480×3508) for a summer music festival — vibrant, energetic, neon accents' },
];

function renderChatTemplates(): void {
  const chatInput = $('chat-input') as HTMLTextAreaElement;
  const container = document.createElement('div');
  container.className = 'chat-templates';

  for (const tpl of CHAT_TEMPLATES) {
    const chip = document.createElement('button');
    chip.className = 'chat-template-chip';
    chip.innerHTML = `<span>${tpl.icon}</span><span>${tpl.label}</span>`;
    chip.addEventListener('click', () => {
      chatInput.value = tpl.prompt;
      chatInput.focus();
    });
    container.appendChild(chip);
  }

  $('chat-messages').appendChild(container);
}

// ═══════════════════════════════════════════════════════════════
// CHAT — ATTACHMENT PREVIEW
// ═══════════════════════════════════════════════════════════════

function clearAttachmentUI(): void {
  const existing = document.getElementById('chat-attachment-preview');
  if (existing) existing.remove();
}

function renderAttachmentPreview(dataUri: string): void {
  clearAttachmentUI();
  const chatInput = $('chat-input');
  const preview = document.createElement('div');
  preview.id = 'chat-attachment-preview';
  preview.className = 'chat-attachment-preview';

  const img = document.createElement('img');
  img.className = 'chat-attachment-thumb';
  img.src = dataUri;
  img.alt = 'Attached image';

  const placeBtn = document.createElement('button');
  placeBtn.className = 'chat-attachment-place';
  placeBtn.title = 'Place image on Figma canvas';
  placeBtn.textContent = '→ Figma';
  placeBtn.addEventListener('click', () => {
    if (pendingAttachment) placePastedImage(placeBtn, pendingAttachment);
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'chat-attachment-remove';
  removeBtn.title = 'Remove image';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    pendingAttachment = null;
    clearAttachmentUI();
  });

  preview.appendChild(img);
  preview.appendChild(placeBtn);
  preview.appendChild(removeBtn);
  chatInput.parentElement!.insertBefore(preview, chatInput);
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
        if (blob.size > 4 * 1024 * 1024) {
          appendChatBubble('assistant', '<span class="chat-error">Image too large — please paste a screenshot under 4MB</span>');
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

  $('chat-new').addEventListener('click', () => {
    conversationHistory = [];
    geminiHistory = [];
    openaiHistory = [];
    claudeCodeHistory = [];
    pendingAttachment = null;
    clearAttachmentUI();
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

  addChatWelcome();
}

function addChatWelcome() {
  const messagesEl = $('chat-messages');
  messagesEl.innerHTML = `<div class="chat-welcome">
    <div class="chat-welcome-icon">F</div>
    <div class="chat-welcome-title">Figmento AI</div>
    <div class="chat-welcome-subtitle">AI design agent. Describe what you want to create.</div>
  </div>`;
  renderChatTemplates();
}

function appendChatBubble(role: 'user' | 'assistant', html: string) {
  const messagesEl = $('chat-messages');
  const welcome = messagesEl.querySelector('.chat-welcome');
  if (welcome) welcome.remove();
  const templates = messagesEl.querySelector('.chat-templates');
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
  const text = input.value.trim();
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

  // Capture and clear attachment before the API call
  const capturedAttachment = pendingAttachment;
  pendingAttachment = null;
  clearAttachmentUI();

  input.value = '';

  // Show user bubble with optional attachment indicator
  const userHtml = capturedAttachment
    ? `${escapeHtml(text)}<br><span class="chat-attachment-indicator">📎 image attached</span>`
    : escapeHtml(text);
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
      await runClaudeCodeTurn(text);
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

async function runClaudeCodeTurn(text: string): Promise<void> {
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
  });

  if (!sent) {
    throw new Error('Claude Code requires a local relay. Start with: `cd figmento-ws-relay && npm run dev`');
  }

  // Wait for the result via the bridge's claude-code-turn-result handler
  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      setClaudeCodeResultHandler(null);
      reject(new Error('Claude Code turn timed out (180s). The subprocess may still be running.'));
    }, 185_000); // Slightly longer than server timeout to let server timeout arrive first

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
