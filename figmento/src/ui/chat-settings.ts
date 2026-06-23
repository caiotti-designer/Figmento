/**
 * Figmento Chat Settings Module — API keys & model selection for Chat tab.
 * Ported from figmento-plugin/src/ui-app.ts settings sections.
 */

import { updateChatSettings, getChatSettings, ChatSettings } from './chat';
import { autoConnectBridge as triggerAutoConnectBridge } from './bridge';
import {
  buildAuthorizationUrl,
  savePkceSession,
  loadPkceSession,
  clearPkceSession,
  exchangeCodeForToken,
  refreshToken,
  isTokenExpired,
  isTokenExpiringSoon,
  CODEX_OAUTH_CONFIG,
  decodeActivationCode,
  type OAuthToken,
} from './oauth-flow';

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

  const veniceRefreshBtn = document.getElementById('settings-venice-refresh');
  if (veniceRefreshBtn) {
    veniceRefreshBtn.addEventListener('click', refreshVeniceModels);
  }

  const relayToggle = document.getElementById('settings-relay-toggle') as HTMLInputElement;
  if (relayToggle) {
    relayToggle.addEventListener('change', () => {
      updateRelaySettingsUI();
    });
  }

  // DM-3: Codex OAuth button wiring
  const codexConnectBtn = document.getElementById('codex-oauth-connect');
  if (codexConnectBtn) {
    codexConnectBtn.addEventListener('click', handleCodexConnect);
  }
  const codexActivateBtn = document.getElementById('codex-activate-btn');
  if (codexActivateBtn) {
    codexActivateBtn.addEventListener('click', handleCodexActivate);
  }
  const codexDisconnectBtn = document.getElementById('codex-oauth-disconnect');
  if (codexDisconnectBtn) {
    codexDisconnectBtn.addEventListener('click', handleCodexDisconnect);
  }

  updateSettingsUI();
  updateRelaySettingsUI();
}

export function loadChatSettings(saved: Record<string, string>) {
  console.log('[Figmento ChatSettings] loadChatSettings received:', {
    chatRelayEnabled: saved.chatRelayEnabled,
    chatRelayUrl: saved.chatRelayUrl,
  });
  const s = getChatSettings();

  if (saved.anthropicApiKey) {
    s.anthropicApiKey = saved.anthropicApiKey;
    ($('settings-api-key') as HTMLInputElement).value = saved.anthropicApiKey;
  }
  if (saved.model) {
    const select = $('settings-model') as HTMLSelectElement;
    const savedModel = normalizeSavedModel(saved.model);
    // Validate the saved model exists in the dropdown — if not, fall back to default
    const optionExists = Array.from(select.options).some((opt) => opt.value === savedModel);
    if (optionExists) {
      s.model = savedModel;
      select.value = savedModel;
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
  loadProviderSubModel(saved, s);
  if (saved.veniceModel || saved.model?.startsWith('venice:')) {
    s.veniceModel = normalizeVeniceModel(saved.veniceModel || saved.model);
    const veniceModel = document.getElementById('settings-venice-model') as HTMLSelectElement | null;
    if (veniceModel) ensureSelectOption(veniceModel, s.veniceModel, s.veniceModel);
  }

  // MA-1: Custom OpenAI-compatible provider
  if (saved.customBaseUrl) {
    s.customBaseUrl = saved.customBaseUrl;
    const input = document.getElementById('settings-custom-base-url') as HTMLInputElement | null;
    if (input) input.value = saved.customBaseUrl;
  }
  if (saved.customModel) {
    s.customModel = saved.customModel;
    const input = document.getElementById('settings-custom-model') as HTMLInputElement | null;
    if (input) input.value = saved.customModel;
  }
  if (saved.customApiKey) {
    s.customApiKey = saved.customApiKey;
    const input = document.getElementById('settings-custom-api-key') as HTMLInputElement | null;
    if (input) input.value = saved.customApiKey;
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

  // DM-3: Load Codex OAuth token state
  if (saved.codexToken) {
    const token = saved.codexToken as unknown as OAuthToken;
    s.codexToken = token;
    updateCodexOAuthUI(true);

    // Proactive: validate/refresh token in background on load
    (async () => {
      try {
        if (isTokenExpired(token) || isTokenExpiringSoon(token)) {
          if (token.refresh_token) {
            const refreshed = await refreshToken(CODEX_OAUTH_CONFIG, token);
            const latest = getChatSettings();
            latest.codexToken = refreshed;
            updateChatSettings(latest);
            postToSandbox({ type: 'save-codex-token', token: refreshed });
          } else {
            const latest = getChatSettings();
            latest.codexToken = undefined;
            updateChatSettings(latest);
            postToSandbox({ type: 'clear-codex-token' });
            updateCodexOAuthUI(false);
          }
        }
      } catch {
        // Refresh failed — clear token, show disconnected
        const latest = getChatSettings();
        latest.codexToken = undefined;
        updateChatSettings(latest);
        postToSandbox({ type: 'clear-codex-token' });
        updateCodexOAuthUI(false);
      }
    })();
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
  const useGemini = model === 'gemini';
  // DM-3: Check codex BEFORE openai — gpt-5-codex matches both patterns
  const useCodex = model === 'codex';
  const useCustom = model === 'custom'; // MA-1
  const useOpenAI = model === 'openai';
  const useVenice = model === 'venice';
  const useClaudeCode = model === 'claude-code';
  const useAnthropic = model === 'anthropic';
  const useSpecial = useClaudeCode || useCodex || useCustom;

  // Hide ALL API key fields for special providers (Claude Code, Codex OAuth, Custom)
  $('key-gemini-chat').style.display = !useSpecial && useGemini ? 'block' : 'none';
  $('key-anthropic-chat').style.display = !useSpecial && useAnthropic ? 'block' : 'none';
  $('key-openai-chat').style.display = !useSpecial && useOpenAI ? 'block' : 'none';
  $('key-venice-chat').style.display = !useSpecial && useVenice ? 'block' : 'none';

  // MA-1: Custom provider fields
  const customSection = document.getElementById('key-custom-chat');
  if (customSection) customSection.style.display = useCustom ? 'block' : 'none';

  // Claude Code status message
  const ccStatus = document.getElementById('claude-code-status');
  if (ccStatus) ccStatus.style.display = useClaudeCode ? 'block' : 'none';

  // DM-3: Codex OAuth section
  const codexSection = document.getElementById('codex-oauth-section');
  if (codexSection) codexSection.style.display = useCodex ? 'block' : 'none';

  // Image gen: hidden for Claude Code, Codex, and Custom; otherwise normal logic
  const imageGenSection = document.getElementById('section-image-gen');
  if (imageGenSection) imageGenSection.style.display = useSpecial ? 'none' : 'block';
  $('image-gen-separate').style.display = !useSpecial && !useGemini ? 'block' : 'none';
  $('image-gen-shared').style.display = !useSpecial && useGemini ? 'block' : 'none';
}

function saveChatSettings() {
  const model = ($('settings-model') as HTMLSelectElement).value;
  const useGemini = model === 'gemini';

  const relayToggle = $('settings-relay-toggle') as HTMLInputElement;
  const relayUrlInput = $('settings-relay-url') as HTMLInputElement;

  const ccModelSelect = document.getElementById('settings-cc-model') as HTMLSelectElement;
  const veniceModelSelect = document.getElementById('settings-venice-model') as HTMLSelectElement;
  const geminiModelSelect = document.getElementById('settings-gemini-model') as HTMLSelectElement;
  const anthropicModelSelect = document.getElementById('settings-anthropic-model') as HTMLSelectElement;
  const openaiModelSelect = document.getElementById('settings-openai-model') as HTMLSelectElement;
  const codexModelSelect = document.getElementById('settings-codex-model') as HTMLSelectElement;

  // MA-1: Custom provider fields — trim trailing slash on baseUrl to be forgiving
  const customBaseUrlRaw =
    (document.getElementById('settings-custom-base-url') as HTMLInputElement | null)?.value.trim() || '';
  const customBaseUrl = customBaseUrlRaw.replace(/\/+$/, '');
  const customModel = (document.getElementById('settings-custom-model') as HTMLInputElement | null)?.value.trim() || '';
  const customApiKey =
    (document.getElementById('settings-custom-api-key') as HTMLInputElement | null)?.value.trim() || '';

  const currentSettings = getChatSettings();
  const s: ChatSettings = {
    model,
    geminiModel: geminiModelSelect ? geminiModelSelect.value : 'gemini-3.1-flash',
    anthropicModel: anthropicModelSelect ? anthropicModelSelect.value : 'claude-sonnet-4-6',
    openaiModel: openaiModelSelect ? openaiModelSelect.value : 'gpt-5.4',
    veniceModel: veniceModelSelect ? veniceModelSelect.value : 'zai-org-glm-5',
    codexModel: codexModelSelect ? codexModelSelect.value : 'gpt-5.5-codex',
    claudeCodeModel: ccModelSelect ? ccModelSelect.value : 'claude-sonnet-4-6',
    anthropicApiKey: ($('settings-api-key') as HTMLInputElement).value.trim(),
    openaiApiKey: ($('settings-openai-key') as HTMLInputElement).value.trim(),
    veniceApiKey: ($('settings-venice-key') as HTMLInputElement).value.trim(),
    geminiApiKey: '',
    chatRelayEnabled: relayToggle ? relayToggle.checked : false,
    chatRelayUrl: relayUrlInput ? relayUrlInput.value.trim() : currentSettings.chatRelayUrl,
    customBaseUrl: customBaseUrl || undefined,
    customModel: customModel || undefined,
    customApiKey: customApiKey || undefined,
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
      geminiModel: s.geminiModel,
      anthropicModel: s.anthropicModel,
      openaiModel: s.openaiModel,
      veniceModel: s.veniceModel,
      codexModel: s.codexModel,
      claudeCodeModel: s.claudeCodeModel,
      geminiApiKey: s.geminiApiKey,
      openaiApiKey: s.openaiApiKey,
      veniceApiKey: s.veniceApiKey,
      chatRelayEnabled: String(s.chatRelayEnabled),
      chatRelayUrl: s.chatRelayUrl,
      // MA-1: persist custom provider config (optional fields)
      customBaseUrl: s.customBaseUrl || '',
      customModel: s.customModel || '',
      customApiKey: s.customApiKey || '',
    },
  });

  // LC-8: Save learning config
  const autoDetect = (document.getElementById('settings-auto-detect') as HTMLInputElement)?.checked ?? false;
  postToSandbox({ type: 'save-learning-config', config: { enabled: true, autoDetect, confidenceThreshold: 3 } });

  // Trigger auto-connect based on relay setting
  if (s.chatRelayEnabled) {
    triggerAutoConnectBridge(s.chatRelayUrl);
  }

  showSettingsStatus('Settings saved!', false);
}

function updateRelaySettingsUI() {
  const toggle = document.getElementById('settings-relay-toggle') as HTMLInputElement;
  const enabled = toggle ? toggle.checked : getChatSettings().chatRelayEnabled;
  const relayFields = document.getElementById('relay-settings-fields');
  const apiKeyHint = document.getElementById('api-key-relay-hint');
  if (relayFields) {
    relayFields.style.display = enabled ? 'block' : 'none';
  }
  if (apiKeyHint) {
    apiKeyHint.style.display = enabled ? 'block' : 'none';
  }
}

function showSettingsStatus(text: string, isError: boolean) {
  const el = $('settings-status');
  el.textContent = text;
  el.className = 'settings-status ' + (isError ? 'error' : 'success');
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

function isVeniceModel(model: string): boolean {
  return model === 'venice' || model.startsWith('venice:');
}

function normalizeSavedModel(model: string): string {
  if (model === 'anthropic' || model === 'gemini' || model === 'openai' || model === 'codex') return model;
  if (isVeniceModel(model)) return 'venice';
  if (model === 'zai-org-glm-4-7') return 'venice';
  if (model.startsWith('qwen3-') || model.startsWith('zai-org-') || model.startsWith('deepseek-')) return 'venice';
  if (model.startsWith('gemini-')) return 'gemini';
  if (model.includes('-codex')) return 'codex';
  if (model.startsWith('gpt-') || model.startsWith('o')) return 'openai';
  if (model.startsWith('claude-')) return 'anthropic';
  return model;
}

function loadProviderSubModel(saved: Record<string, string>, s: ChatSettings): void {
  const savedModel = saved.model || '';
  const subModels = [
    ['geminiModel', 'settings-gemini-model', saved.geminiModel || (savedModel.startsWith('gemini-') ? savedModel : '')],
    [
      'anthropicModel',
      'settings-anthropic-model',
      saved.anthropicModel || (savedModel.startsWith('claude-') ? savedModel : ''),
    ],
    [
      'openaiModel',
      'settings-openai-model',
      saved.openaiModel || (savedModel.startsWith('gpt-') || savedModel.startsWith('o') ? savedModel : ''),
    ],
    ['codexModel', 'settings-codex-model', saved.codexModel || (savedModel.includes('-codex') ? savedModel : '')],
  ] as const;

  for (const [settingsKey, selectId, value] of subModels) {
    if (!value) continue;
    (s as unknown as Record<string, string>)[settingsKey] = value;
    const select = document.getElementById(selectId) as HTMLSelectElement | null;
    if (select) ensureSelectOption(select, value, value);
  }
}

function normalizeVeniceModel(model: string | undefined): string {
  if (!model) return 'zai-org-glm-5';
  if (model.startsWith('venice:')) return model.slice('venice:'.length);
  if (model === 'zai-org-glm-4-7') return 'zai-org-glm-4.7';
  return model;
}

interface VeniceModelSpec {
  name?: string;
  offline?: boolean;
  availableContextTokens?: number;
  capabilities?: {
    supportsFunctionCalling?: boolean;
    supportsVision?: boolean;
    supportsReasoning?: boolean;
  };
  traits?: string[];
}

interface VeniceModelResponse {
  data?: Array<{
    id?: string;
    type?: string;
    model_spec?: VeniceModelSpec;
  }>;
}

function setVeniceModelStatus(text: string, isError = false): void {
  const status = document.getElementById('settings-venice-model-status');
  if (!status) return;
  status.textContent = text;
  status.style.color = isError ? 'var(--danger)' : 'var(--text-secondary)';
}

function ensureSelectOption(select: HTMLSelectElement, value: string, label: string): void {
  const existing = Array.from(select.options).find((opt) => opt.value === value);
  if (existing) {
    select.value = value;
    return;
  }
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
  select.value = value;
}

async function refreshVeniceModels(): Promise<void> {
  const key = ($('settings-venice-key') as HTMLInputElement).value.trim();
  if (!key) {
    setVeniceModelStatus('Add your Venice API key first.', true);
    return;
  }

  const select = $('settings-venice-model') as HTMLSelectElement;
  const currentValue = select.value;
  const button = document.getElementById('settings-venice-refresh') as HTMLButtonElement | null;
  if (button) button.disabled = true;
  setVeniceModelStatus('Loading Venice models...');

  try {
    const response = await fetch('https://api.venice.ai/api/v1/models?type=text', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      throw new Error(`Venice API error ${response.status}`);
    }

    const result = (await response.json()) as VeniceModelResponse;
    const models = (result.data || [])
      .filter((model) => {
        const spec = model.model_spec;
        return model.id && model.type === 'text' && spec && !spec.offline && spec.capabilities?.supportsFunctionCalling;
      })
      .sort((a, b) => {
        const aRecommended = getVeniceRank(a.id || '');
        const bRecommended = getVeniceRank(b.id || '');
        if (aRecommended !== bRecommended) return aRecommended - bRecommended;
        return (a.model_spec?.name || a.id || '').localeCompare(b.model_spec?.name || b.id || '');
      });

    select.innerHTML = '';
    for (const model of models) {
      const option = document.createElement('option');
      option.value = model.id || '';
      option.textContent = buildVeniceOptionLabel(model.id || '', model.model_spec);
      select.appendChild(option);
    }

    if (Array.from(select.options).some((opt) => opt.value === currentValue)) {
      select.value = currentValue;
    }

    window.dispatchEvent(new CustomEvent('figmento-model-options-changed'));
    updateSettingsUI();
    setVeniceModelStatus(`Loaded ${models.length} Venice text models with function calling.`);
  } catch (err) {
    setVeniceModelStatus((err as Error).message || 'Failed to load Venice models.', true);
  } finally {
    if (button) button.disabled = false;
  }
}

function getVeniceRank(modelId: string): number {
  const preferred = [
    'zai-org-glm-5',
    'zai-org-glm-5-1',
    'kimi-k2-5',
    'qwen3-coder-480b-a35b-instruct',
    'qwen3-vl-235b-a22b',
    'deepseek-v3.2',
    'zai-org-glm-4.7',
    'mistral-31-24b',
  ];
  const index = preferred.indexOf(modelId);
  return index === -1 ? 100 : index;
}

function buildVeniceOptionLabel(id: string, spec?: VeniceModelSpec): string {
  const name = spec?.name || id;
  const capabilities = spec?.capabilities;
  const suffixes = [];
  if (capabilities?.supportsVision) suffixes.push('vision');
  if (capabilities?.supportsReasoning) suffixes.push('reasoning');
  return suffixes.length > 0 ? `${name} (${suffixes.join(', ')})` : name;
}

// ═══════════════════════════════════════════════════════════════
// DM-3: CODEX OAUTH HANDLERS
// ═══════════════════════════════════════════════════════════════

function updateCodexOAuthUI(connected: boolean) {
  const disconnected = document.getElementById('codex-oauth-disconnected');
  const connectedEl = document.getElementById('codex-oauth-connected');
  if (disconnected) disconnected.style.display = connected ? 'none' : 'block';
  if (connectedEl) connectedEl.style.display = connected ? 'block' : 'none';
  // Hide activation input when connected
  const activationSection = document.getElementById('codex-activation-section');
  if (activationSection && connected) activationSection.style.display = 'none';
}

async function handleCodexConnect() {
  try {
    const { url, verifier, state } = await buildAuthorizationUrl(CODEX_OAUTH_CONFIG);
    savePkceSession(verifier, state);

    // Show activation code input
    const activationSection = document.getElementById('codex-activation-section');
    if (activationSection) activationSection.style.display = 'block';

    // Open browser for OAuth
    postToSandbox({ type: 'open-external', url });

    showSettingsStatus('Browser opened — complete login and paste the activation code.', false);
  } catch (err) {
    showSettingsStatus('Failed to start OAuth flow: ' + (err as Error).message, true);
  }
}

async function handleCodexActivate() {
  const input = document.getElementById('codex-activation-input') as HTMLInputElement;
  const rawCode = input?.value?.trim();
  if (!rawCode) {
    showSettingsStatus('Please paste the activation code from the browser.', true);
    return;
  }

  // Decode the activation code (base64 JSON with authorization_code)
  let authCode: string;
  try {
    const decoded = JSON.parse(atob(rawCode));
    authCode = decoded.authorization_code;
    if (!authCode) throw new Error('No authorization_code');
  } catch {
    showSettingsStatus('Invalid activation code. Please try again.', true);
    return;
  }

  // Retrieve stored PKCE verifier
  const pkce = loadPkceSession();
  if (!pkce) {
    showSettingsStatus('PKCE session expired. Please click "Connect with ChatGPT" again.', true);
    return;
  }

  // Exchange authorization code for access token
  showSettingsStatus('Exchanging code for token...', false);
  let token: OAuthToken;
  try {
    token = await exchangeCodeForToken(CODEX_OAUTH_CONFIG, authCode, pkce.verifier);
  } catch (err) {
    showSettingsStatus('Token exchange failed: ' + (err as Error).message, true);
    return;
  }

  clearPkceSession();

  // Save to clientStorage via sandbox
  const s = getChatSettings();
  s.codexToken = token;
  updateChatSettings(s);
  postToSandbox({ type: 'save-codex-token', token });

  updateCodexOAuthUI(true);
  input.value = '';
  showSettingsStatus('Connected via ChatGPT ✓', false);
}

function handleCodexDisconnect() {
  const s = getChatSettings();
  s.codexToken = undefined;
  updateChatSettings(s);
  postToSandbox({ type: 'clear-codex-token' });
  updateCodexOAuthUI(false);
  showSettingsStatus('Disconnected from ChatGPT.', false);
}
