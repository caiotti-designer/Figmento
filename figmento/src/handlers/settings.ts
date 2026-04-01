/// <reference types="@figma/plugin-typings" />

import type { PluginMessage, AIProvider } from '../types';

// ── Storage keys ──────────────────────────────────────────────────────────────
const API_KEYS_STORAGE_KEY = 'figmento-api-keys';
const VALIDATION_STORAGE_KEY = 'figmento-validated';

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Saves an API key to Figma's client storage
 */
async function saveApiKey(provider: AIProvider, apiKey: string) {
  try {
    const keys = (await figma.clientStorage.getAsync(API_KEYS_STORAGE_KEY)) || {};
    if (apiKey) {
      keys[provider] = apiKey;
    } else {
      delete keys[provider];
    }
    await figma.clientStorage.setAsync(API_KEYS_STORAGE_KEY, keys);
  } catch (error) {
    console.error('Failed to save API key:', error);
  }
}

/**
 * Saves validation status to Figma's client storage
 */
async function saveValidationStatus(provider: AIProvider, isValid: boolean) {
  try {
    const validated = (await figma.clientStorage.getAsync(VALIDATION_STORAGE_KEY)) || {};
    validated[provider] = isValid;
    await figma.clientStorage.setAsync(VALIDATION_STORAGE_KEY, validated);
  } catch (error) {
    console.error('Failed to save validation status:', error);
  }
}

/**
 * Loads saved API keys and validation status from Figma's client storage and sends to UI
 */
export async function loadSavedApiKeys() {
  try {
    const keys = (await figma.clientStorage.getAsync(API_KEYS_STORAGE_KEY)) || {};
    const validated = (await figma.clientStorage.getAsync(VALIDATION_STORAGE_KEY)) || {};
    figma.ui.postMessage({
      type: 'api-keys-loaded',
      keys: keys,
      validated: validated,
    });
  } catch (error) {
    console.error('Failed to load API keys:', error);
    figma.ui.postMessage({
      type: 'api-keys-loaded',
      keys: {},
      validated: {},
    });
  }
}

/**
 * Migrates old flat-key settings format to unified storage
 */
async function migrateOldSettings(keys: Record<string, string>) {
  let migrated = false;

  // Check for old flat key format from figmento-plugin/
  const oldAnthropicKey = await figma.clientStorage.getAsync('anthropicApiKey');
  if (oldAnthropicKey && !keys['claude']) {
    keys['claude'] = oldAnthropicKey;
    migrated = true;
  }

  const oldGeminiKey = await figma.clientStorage.getAsync('geminiApiKey');
  if (oldGeminiKey && !keys['gemini']) {
    keys['gemini'] = oldGeminiKey;
    migrated = true;
  }

  if (migrated) {
    await figma.clientStorage.setAsync(API_KEYS_STORAGE_KEY, keys);
    console.log('Settings migration: copied old flat keys to unified schema');
  }
}

// ── Message Handler ───────────────────────────────────────────────────────────

/**
 * Handles all settings-related messages (API keys, validation, settings, memory, feedback).
 * Returns `true` if the message was handled, `false` otherwise.
 */
export async function handleSettingsMessage(msg: PluginMessage): Promise<boolean> {
  switch ((msg as any).type) {

    case 'save-api-key': {
      await saveApiKey((msg as any).provider, (msg as any).apiKey);
      return true;
    }

    case 'load-api-keys': {
      await loadSavedApiKeys();
      return true;
    }

    case 'save-validation': {
      await saveValidationStatus((msg as any).provider, (msg as any).isValid);
      return true;
    }

    case 'get-settings': {
      try {
        // Load from unified storage and map to chat-settings flat format
        const keys = (await figma.clientStorage.getAsync(API_KEYS_STORAGE_KEY)) || {};
        const chatModel = (await figma.clientStorage.getAsync('figmento-chat-model')) || '';

        // Migration: check for old figmento-plugin/ flat keys
        await migrateOldSettings(keys);

        const chatRelayEnabled = (await figma.clientStorage.getAsync('figmento-chat-relay-enabled')) || '';
        const chatRelayUrl = (await figma.clientStorage.getAsync('figmento-chat-relay-url')) || '';
        console.log('[Figmento Sandbox] get-settings relay:', { enabled: chatRelayEnabled, url: chatRelayUrl });

        figma.ui.postMessage({
          type: 'settings-loaded',
          settings: {
            anthropicApiKey: keys['claude'] || '',
            geminiApiKey: keys['gemini'] || '',
            openaiApiKey: keys['openai'] || '',
            model: chatModel,
            chatRelayEnabled: chatRelayEnabled,
            chatRelayUrl: chatRelayUrl,
          },
        });
      } catch (error) {
        console.error('Failed to load settings:', error);
        figma.ui.postMessage({
          type: 'settings-loaded',
          settings: {},
        });
      }
      return true;
    }

    case 'save-settings': {
      const s = (msg as any).settings as Record<string, unknown>;
      console.log('[Figmento Sandbox] save-settings relay:', { chatRelayEnabled: s?.chatRelayEnabled, chatRelayUrl: s?.chatRelayUrl });
      if (s) {
        // Store API keys into the unified storage object (same as Settings tab)
        const keys = (await figma.clientStorage.getAsync(API_KEYS_STORAGE_KEY)) || {};
        if (s.geminiApiKey) keys['gemini'] = s.geminiApiKey;
        if (s.anthropicApiKey) keys['claude'] = s.anthropicApiKey;
        if (s.openaiApiKey) keys['openai'] = s.openaiApiKey;
        await figma.clientStorage.setAsync(API_KEYS_STORAGE_KEY, keys);

        // Store chat model preference separately
        if (s.model) {
          await figma.clientStorage.setAsync('figmento-chat-model', s.model);
        }

        // Store relay settings
        if (s.chatRelayEnabled !== undefined) {
          await figma.clientStorage.setAsync('figmento-chat-relay-enabled', String(s.chatRelayEnabled));
        }
        if (s.chatRelayUrl) {
          await figma.clientStorage.setAsync('figmento-chat-relay-url', s.chatRelayUrl);
        }
      }
      return true;
    }

    case 'load-memory': {
      try {
        const memory = (await figma.clientStorage.getAsync('figmento-memory')) || [];
        figma.ui.postMessage({ type: 'memory-loaded', entries: memory });
      } catch (_e) {
        figma.ui.postMessage({ type: 'memory-loaded', entries: [] });
      }
      return true;
    }

    case 'save-memory': {
      try {
        const entries = (await figma.clientStorage.getAsync('figmento-memory')) || [];
        entries.push({
          entry: (msg as any).entry as string,
          timestamp: new Date().toISOString(),
        });
        // Keep only the last 50 entries
        if (entries.length > 50) entries.splice(0, entries.length - 50);
        await figma.clientStorage.setAsync('figmento-memory', entries);
        figma.ui.postMessage({ type: 'memory-saved', success: true });
      } catch (_e) {
        figma.ui.postMessage({ type: 'memory-saved', success: false });
      }
      return true;
    }

    // ── Chat History Persistence ────────────────────────────────
    case 'save-chat-history': {
      try {
        await figma.clientStorage.setAsync('figmento-chat-history', (msg as any).data);
      } catch (_e) {
        // Best-effort
      }
      return true;
    }

    case 'load-chat-history': {
      try {
        const data = await figma.clientStorage.getAsync('figmento-chat-history');
        figma.ui.postMessage({ type: 'chat-history-loaded', data: data || null });
      } catch (_e) {
        figma.ui.postMessage({ type: 'chat-history-loaded', data: null });
      }
      return true;
    }

    case 'clear-chat-history': {
      try {
        await figma.clientStorage.setAsync('figmento-chat-history', null);
      } catch (_e) {
        // Best-effort
      }
      return true;
    }

    case 'save-feedback': {
      try {
        const existing = (await figma.clientStorage.getAsync('design-feedback')) || [];
        existing.push((msg as any).data);
        // Keep only the last 100 feedback entries
        if (existing.length > 100) existing.splice(0, existing.length - 100);
        await figma.clientStorage.setAsync('design-feedback', existing);
      } catch (_e) {
        // Feedback storage is best-effort
      }
      return true;
    }

    default:
      return false;
  }
}
