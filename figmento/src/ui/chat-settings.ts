/**
 * Figmento Chat Settings Module — API keys & model selection for Chat tab.
 * Ported from figmento-plugin/src/ui-app.ts settings sections.
 */

import { updateChatSettings, getChatSettings, ChatSettings } from './chat';
import { autoConnectBridge as triggerAutoConnectBridge } from './bridge';

// ═══════════════════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════════════════

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function postToSandbox(msg: Record<string, unknown>) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

export function initChatSettings() {
  // Request saved settings from sandbox
  postToSandbox({ type: 'get-settings' });

  $('settings-save').addEventListener('click', saveChatSettings);

  const modelSelect = $('settings-model') as HTMLSelectElement;
  modelSelect.addEventListener('change', updateSettingsUI);

  const relayToggle = document.getElementById('settings-relay-toggle') as HTMLInputElement;
  if (relayToggle) {
    relayToggle.addEventListener('change', () => {
      updateRelaySettingsUI();
    });
  }

  updateSettingsUI();
  updateRelaySettingsUI();
}

export function loadChatSettings(saved: Record<string, string>) {
  console.log('[Figmento ChatSettings] loadChatSettings received:', { chatRelayEnabled: saved.chatRelayEnabled, chatRelayUrl: saved.chatRelayUrl });
  const s = getChatSettings();

  if (saved.anthropicApiKey) {
    s.anthropicApiKey = saved.anthropicApiKey;
    ($('settings-api-key') as HTMLInputElement).value = saved.anthropicApiKey;
  }
  if (saved.model) {
    s.model = saved.model;
    ($('settings-model') as HTMLSelectElement).value = saved.model;
  }
  if (saved.geminiApiKey) {
    s.geminiApiKey = saved.geminiApiKey;
    ($('settings-gemini-key') as HTMLInputElement).value = saved.geminiApiKey;
    ($('settings-gemini-key-alt') as HTMLInputElement).value = saved.geminiApiKey;
  }
  if (saved.openaiApiKey) {
    s.openaiApiKey = saved.openaiApiKey;
    ($('settings-openai-key') as HTMLInputElement).value = saved.openaiApiKey;
  }

  // Relay settings
  if (saved.chatRelayEnabled !== undefined) {
    s.chatRelayEnabled = saved.chatRelayEnabled === 'true';
    const toggle = $('settings-relay-toggle') as HTMLInputElement;
    if (toggle) toggle.checked = s.chatRelayEnabled;
  }
  if (saved.chatRelayUrl) {
    s.chatRelayUrl = saved.chatRelayUrl;
    const urlInput = $('settings-relay-url') as HTMLInputElement;
    if (urlInput) urlInput.value = saved.chatRelayUrl;
  }

  updateChatSettings(s);
  updateSettingsUI();
  updateRelaySettingsUI();
}

// ═══════════════════════════════════════════════════════════════
// INTERNALS
// ═══════════════════════════════════════════════════════════════

function updateSettingsUI() {
  const model = ($('settings-model') as HTMLSelectElement).value;
  const useGemini = model.startsWith('gemini-');
  const useOpenAI = model.startsWith('gpt-') || model.startsWith('o');

  $('key-gemini-chat').style.display = useGemini ? 'block' : 'none';
  $('key-anthropic-chat').style.display = (!useGemini && !useOpenAI) ? 'block' : 'none';
  $('key-openai-chat').style.display = useOpenAI ? 'block' : 'none';

  // Image gen: Gemini uses same key; Claude/OpenAI need a separate Gemini key
  $('image-gen-separate').style.display = useGemini ? 'none' : 'block';
  $('image-gen-shared').style.display = useGemini ? 'block' : 'none';
}

function saveChatSettings() {
  const model = ($('settings-model') as HTMLSelectElement).value;
  const useGemini = model.startsWith('gemini-');

  const relayToggle = $('settings-relay-toggle') as HTMLInputElement;
  const relayUrlInput = $('settings-relay-url') as HTMLInputElement;

  const s: ChatSettings = {
    model,
    anthropicApiKey: ($('settings-api-key') as HTMLInputElement).value.trim(),
    openaiApiKey: ($('settings-openai-key') as HTMLInputElement).value.trim(),
    geminiApiKey: '',
    chatRelayEnabled: relayToggle ? relayToggle.checked : false,
    chatRelayUrl: relayUrlInput ? relayUrlInput.value.trim() : 'https://figmento-production.up.railway.app',
  };

  if (useGemini) {
    s.geminiApiKey = ($('settings-gemini-key') as HTMLInputElement).value.trim();
  } else {
    const altKey = ($('settings-gemini-key-alt') as HTMLInputElement).value.trim();
    if (altKey) s.geminiApiKey = altKey;
    const mainKey = ($('settings-gemini-key') as HTMLInputElement).value.trim();
    if (mainKey && !altKey) s.geminiApiKey = mainKey;
  }

  updateChatSettings(s);

  postToSandbox({
    type: 'save-settings',
    settings: {
      anthropicApiKey: s.anthropicApiKey,
      model: s.model,
      geminiApiKey: s.geminiApiKey,
      openaiApiKey: s.openaiApiKey,
      chatRelayEnabled: String(s.chatRelayEnabled),
      chatRelayUrl: s.chatRelayUrl,
    },
  });

  // Trigger auto-connect/disconnect based on relay setting
  const relayBar = document.getElementById('relay-status-bar');
  if (s.chatRelayEnabled) {
    if (relayBar) relayBar.style.display = 'flex';
    triggerAutoConnectBridge(s.chatRelayUrl);
  } else {
    if (relayBar) relayBar.style.display = 'none';
  }

  showSettingsStatus('Settings saved!', false);
}

function updateRelaySettingsUI() {
  const toggle = document.getElementById('settings-relay-toggle') as HTMLInputElement;
  const enabled = toggle ? toggle.checked : getChatSettings().chatRelayEnabled;
  const relayFields = document.getElementById('relay-settings-fields');
  const apiKeyHint = document.getElementById('api-key-relay-hint');
  const relayBar = document.getElementById('relay-status-bar');
  if (relayFields) {
    relayFields.style.display = enabled ? 'block' : 'none';
  }
  if (apiKeyHint) {
    apiKeyHint.style.display = enabled ? 'block' : 'none';
  }
  if (relayBar) {
    relayBar.style.display = enabled ? 'flex' : 'none';
  }
}

function showSettingsStatus(text: string, isError: boolean) {
  const el = $('settings-status');
  el.textContent = text;
  el.className = 'settings-status ' + (isError ? 'error' : 'success');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}
