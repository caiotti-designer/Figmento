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
  const useGemini = model.startsWith('gemini-');
  // DM-3: Check codex BEFORE openai — gpt-5-codex matches both patterns
  const useCodex = model.includes('-codex');
  const useCustom = model === 'custom'; // MA-1
  const useOpenAI = !useCodex && !useCustom && (model.startsWith('gpt-') || model.startsWith('o'));
  const useVenice = model.startsWith('qwen3-') || model.startsWith('zai-org-') || model.startsWith('deepseek-');
  const useClaudeCode = model === 'claude-code';
  const useSpecial = useClaudeCode || useCodex || useCustom;

  // Hide ALL API key fields for special providers (Claude Code, Codex OAuth, Custom)
  $('key-gemini-chat').style.display = (!useSpecial && useGemini) ? 'block' : 'none';
  $('key-anthropic-chat').style.display = (!useSpecial && !useGemini && !useOpenAI && !useVenice) ? 'block' : 'none';
  $('key-openai-chat').style.display = (!useSpecial && useOpenAI) ? 'block' : 'none';
  $('key-venice-chat').style.display = (!useSpecial && useVenice) ? 'block' : 'none';

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
  $('image-gen-separate').style.display = (!useSpecial && !useGemini) ? 'block' : 'none';
  $('image-gen-shared').style.display = (!useSpecial && useGemini) ? 'block' : 'none';
}

function saveChatSettings() {
  const model = ($('settings-model') as HTMLSelectElement).value;
  const useGemini = model.startsWith('gemini-');

  const relayToggle = $('settings-relay-toggle') as HTMLInputElement;
  const relayUrlInput = $('settings-relay-url') as HTMLInputElement;

  const ccModelSelect = document.getElementById('settings-cc-model') as HTMLSelectElement;

  // MA-1: Custom provider fields — trim trailing slash on baseUrl to be forgiving
  const customBaseUrlRaw = (document.getElementById('settings-custom-base-url') as HTMLInputElement | null)?.value.trim() || '';
  const customBaseUrl = customBaseUrlRaw.replace(/\/+$/, '');
  const customModel = (document.getElementById('settings-custom-model') as HTMLInputElement | null)?.value.trim() || '';
  const customApiKey = (document.getElementById('settings-custom-api-key') as HTMLInputElement | null)?.value.trim() || '';

  const currentSettings = getChatSettings();
  const s: ChatSettings = {
    model,
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
