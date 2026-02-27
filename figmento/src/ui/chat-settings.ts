/**
 * Figmento Chat Settings Module — API keys & model selection for Chat tab.
 * Ported from figmento-plugin/src/ui-app.ts settings sections.
 */

import { updateChatSettings, getChatSettings, ChatSettings } from './chat';

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
  updateSettingsUI();
}

export function loadChatSettings(saved: Record<string, string>) {
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

  updateChatSettings(s);
  updateSettingsUI();
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

  const s: ChatSettings = {
    model,
    anthropicApiKey: ($('settings-api-key') as HTMLInputElement).value.trim(),
    openaiApiKey: ($('settings-openai-key') as HTMLInputElement).value.trim(),
    geminiApiKey: '',
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
    },
  });

  showSettingsStatus('Settings saved!', false);
}

function showSettingsStatus(text: string, isError: boolean) {
  const el = $('settings-status');
  el.textContent = text;
  el.className = 'settings-status ' + (isError ? 'error' : 'success');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}
