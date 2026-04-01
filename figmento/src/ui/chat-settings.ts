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

  // LC-8: Load learning config to populate auto-detect toggle
  postToSandbox({ type: 'get-learning-config' });

  // LC-8: Listen for learning-config-loaded to update checkbox
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (msg?.type === 'learning-config-loaded') {
      loadLearningConfig(msg.config);
    }
  });

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
    const select = $('settings-model') as HTMLSelectElement;
    // Validate the saved model exists in the dropdown — if not, fall back to default
    const optionExists = Array.from(select.options).some(opt => opt.value === saved.model);
    if (optionExists) {
      s.model = saved.model;
      select.value = saved.model;
    } else {
      console.warn(`[Figmento] Saved model "${saved.model}" not found in dropdown, using default`);
      s.model = select.value; // keep the HTML default (claude-code)
    }
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
  if (saved.veniceApiKey) {
    s.veniceApiKey = saved.veniceApiKey;
    ($('settings-venice-key') as HTMLInputElement).value = saved.veniceApiKey;
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
  if (saved.claudeCodeModel) {
    s.claudeCodeModel = saved.claudeCodeModel;
    const ccModel = document.getElementById('settings-cc-model') as HTMLSelectElement;
    if (ccModel) ccModel.value = saved.claudeCodeModel;
  }

  updateChatSettings(s);
  updateSettingsUI();
  updateRelaySettingsUI();
}

export function loadLearningConfig(config: Record<string, unknown>): void {
  const checkbox = document.getElementById('settings-auto-detect') as HTMLInputElement | null;
  if (checkbox) {
    checkbox.checked = config?.autoDetect === true;
  }
}

// ═══════════════════════════════════════════════════════════════
// INTERNALS
// ═══════════════════════════════════════════════════════════════

function updateSettingsUI() {
  const model = ($('settings-model') as HTMLSelectElement).value;
  const useGemini = model.startsWith('gemini-');
  const useOpenAI = model.startsWith('gpt-') || model.startsWith('o');
  const useVenice = model.startsWith('qwen3-') || model.startsWith('zai-org-') || model.startsWith('deepseek-');
  const useClaudeCode = model === 'claude-code';

  // AC2: Hide ALL API key fields when Claude Code is selected
  $('key-gemini-chat').style.display = (!useClaudeCode && useGemini) ? 'block' : 'none';
  $('key-anthropic-chat').style.display = (!useClaudeCode && !useGemini && !useOpenAI && !useVenice) ? 'block' : 'none';
  $('key-openai-chat').style.display = (!useClaudeCode && useOpenAI) ? 'block' : 'none';
  $('key-venice-chat').style.display = (!useClaudeCode && useVenice) ? 'block' : 'none';

  // Claude Code status message
  const ccStatus = document.getElementById('claude-code-status');
  if (ccStatus) ccStatus.style.display = useClaudeCode ? 'block' : 'none';

  // Image gen: hidden for Claude Code (MCP server handles it), otherwise normal logic
  const imageGenSection = document.getElementById('section-image-gen');
  if (imageGenSection) imageGenSection.style.display = useClaudeCode ? 'none' : 'block';
  $('image-gen-separate').style.display = (!useClaudeCode && !useGemini) ? 'block' : 'none';
  $('image-gen-shared').style.display = (!useClaudeCode && useGemini) ? 'block' : 'none';
}

function saveChatSettings() {
  const model = ($('settings-model') as HTMLSelectElement).value;
  const useGemini = model.startsWith('gemini-');

  const relayToggle = $('settings-relay-toggle') as HTMLInputElement;
  const relayUrlInput = $('settings-relay-url') as HTMLInputElement;

  const ccModelSelect = document.getElementById('settings-cc-model') as HTMLSelectElement;
  const s: ChatSettings = {
    model,
    claudeCodeModel: ccModelSelect ? ccModelSelect.value : 'claude-sonnet-4-6',
    anthropicApiKey: ($('settings-api-key') as HTMLInputElement).value.trim(),
    openaiApiKey: ($('settings-openai-key') as HTMLInputElement).value.trim(),
    veniceApiKey: ($('settings-venice-key') as HTMLInputElement).value.trim(),
    geminiApiKey: '',
    chatRelayEnabled: relayToggle ? relayToggle.checked : false,
    chatRelayUrl: relayUrlInput ? relayUrlInput.value.trim() : 'http://localhost:3055',
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
      claudeCodeModel: s.claudeCodeModel,
      geminiApiKey: s.geminiApiKey,
      openaiApiKey: s.openaiApiKey,
      veniceApiKey: s.veniceApiKey,
      chatRelayEnabled: String(s.chatRelayEnabled),
      chatRelayUrl: s.chatRelayUrl,
    },
  });

  // LC-8: Save learning config
  const autoDetect = (document.getElementById('settings-auto-detect') as HTMLInputElement)?.checked ?? false;
  postToSandbox({ type: 'save-learning-config', config: { enabled: true, autoDetect, confidenceThreshold: 3 } });

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
