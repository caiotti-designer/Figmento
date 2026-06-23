// Main entry point for the plugin UI
// Wires together all modules and initializes the application

import { initDomRefs, dom, screenshotState } from './state';
import { postMessage, cleanupAllListeners } from './utils';
import {
  loadSettings,
  setupDesignSettingsListeners,
  openSettings,
  closeSettings,
  selectProvider,
  updateStatusDot,
  updateApiKeyInput,
  validateApiKey,
  updateImageGenVisibility,
  updateImageModelDropdownVisibility,
  updateModelDropdownVisibility,
  onApiKeysLoaded,
  saveSettings,
} from './settings';
import {
  goToStep,
  handleImagePaste,
  handleImageFile,
  showImagePreview,
  setupCropListeners,
  startProcessing,
  cancelProcessing,
  resetToStart,
  handleKeyboardShortcuts,
  setAspectRatio,
  updateProgress,
  toggleCompare,
  submitFeedback,
  resolveScreenshotCommand,
} from './screenshot';
import { initMessageHandler } from './messages';
import { AIProvider } from '../types';
import { apiState, imageGenState } from './state';
import { addToQueue, startBatchProcessing, clearQueue, notifyDesignCreated } from './batch';
import { initChat, resolveChatCommand, loadMemoryEntries, getChatSettings, restoreChatHistory } from './chat';
import { initBridge, handleBridgeCommandResult, autoConnectBridge, restoreBridgeRelayUrl } from './bridge';
import { initChatSettings, loadChatSettings } from './chat-settings';
import { initPreferencesPanel, reloadPreferencesPanel } from './preferences-panel';
import { designSystemState, dsToggleState } from './state';
import { initSkillExport } from './skill-export';
import { initImageStudio } from './image-studio';
import { initRemixStudio } from './remix-studio';
import { initPresets } from './presets';
import type { DesignSystemCache } from '../types';

// ═══════════════════════════════════════════════════════════════
// FN-6: Design System Discovery UI
// ═══════════════════════════════════════════════════════════════

const DS_STALENESS_MS = 60 * 60 * 1000; // 1 hour

function handleDesignSystemScanned(cache: DesignSystemCache | null, error?: string): void {
  designSystemState.isScanning = false;

  const btn = document.getElementById('ds-scan-btn') as HTMLButtonElement | null;
  const summary = document.getElementById('ds-scan-summary');
  const status = document.getElementById('ds-scan-status');

  if (btn) {
    btn.disabled = false;
    btn.textContent = cache ? 'Rescan' : 'Scan Design System';
  }

  if (error) {
    if (status) {
      status.textContent = 'Scan failed: ' + error;
      status.className = 'ds-scan-status error';
    }
    if (summary) summary.textContent = '';
    return;
  }

  designSystemState.cache = cache;

  if (!cache) {
    if (summary) summary.textContent = '';
    if (status) {
      status.textContent = '';
      status.className = 'ds-scan-status';
    }
    return;
  }

  const compCount = cache.components.length;
  const varCount = cache.variables.length;
  const styleCount =
    (cache.paintStyles as unknown[]).length +
    (cache.textStyles as unknown[]).length +
    (cache.effectStyles as unknown[]).length;

  if (compCount === 0 && varCount === 0 && styleCount === 0) {
    if (summary) summary.textContent = 'No design system found in this file';
    if (status) {
      status.textContent = '';
      status.className = 'ds-scan-status';
    }
    return;
  }

  const compLabel = cache.truncated ? `${compCount}+ components (showing first 500)` : `${compCount} components`;
  if (summary) summary.textContent = `Found ${compLabel}, ${varCount} variables, ${styleCount} styles`;

  const scannedTime = new Date(cache.scannedAt).getTime();
  const isStale = Date.now() - scannedTime > DS_STALENESS_MS;

  if (status) {
    if (isStale) {
      status.textContent = 'Cache is stale (>1h) — consider rescanning';
      status.className = 'ds-scan-status warning';
    } else {
      const ago = Math.round((Date.now() - scannedTime) / 60000);
      status.textContent = ago < 1 ? 'Scanned just now' : `Scanned ${ago}m ago`;
      status.className = 'ds-scan-status fresh';
    }
  }

  // FN-16: Update the DS toggle whenever scan state changes
  updateDsToggleUI();
}

function triggerDesignSystemScan(): void {
  designSystemState.isScanning = true;

  const btn = document.getElementById('ds-scan-btn') as HTMLButtonElement | null;
  const status = document.getElementById('ds-scan-status');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Scanning...';
  }
  if (status) {
    status.textContent = 'Scanning design system...';
    status.className = 'ds-scan-status scanning';
  }

  postMessage({ type: 'scan-design-system' });
}

function initDesignSystemPanel(): void {
  const btn = document.getElementById('ds-scan-btn');
  if (btn) {
    btn.addEventListener('click', triggerDesignSystemScan);
  }

  // If DS cache already exists (e.g. from a previous scan in this session), populate the UI
  if (designSystemState.cache) {
    handleDesignSystemScanned(designSystemState.cache);
  }
}

// ═══════════════════════════════════════════════════════════════
// FN-16: "Use My Design System" Toggle
// ═══════════════════════════════════════════════════════════════

/**
 * Update the DS toggle UI to reflect current state.
 * Called after scan completes, toggle change, or initial load.
 */
function updateDsToggleUI(): void {
  const pill = document.getElementById('ds-toggle-pill') as HTMLButtonElement | null;
  if (!pill) return;

  const cache = designSystemState.cache;
  const hasCache =
    cache !== null &&
    (cache.components.length > 0 ||
      cache.variables.length > 0 ||
      (cache.paintStyles as unknown[]).length +
        (cache.textStyles as unknown[]).length +
        (cache.effectStyles as unknown[]).length >
        0);

  if (!hasCache) {
    // No DS scanned — hide pill entirely. Scanning lives in Settings → Design System.
    pill.style.display = 'none';
    return;
  }

  pill.style.display = '';

  // Tooltip carries the count summary so the pill itself stays compact
  const compCount = cache.components.length;
  const varCount = cache.variables.length;
  const styleCount =
    (cache.paintStyles as unknown[]).length +
    (cache.textStyles as unknown[]).length +
    (cache.effectStyles as unknown[]).length;
  const parts: string[] = [];
  if (compCount > 0) parts.push(`${compCount} components`);
  if (varCount > 0) parts.push(`${varCount} variables`);
  if (styleCount > 0) parts.push(`${styleCount} styles`);
  const summary = parts.length > 0 ? ` — ${parts.join(', ')}` : '';

  if (dsToggleState.enabled) {
    pill.classList.add('active');
    pill.setAttribute('aria-pressed', 'true');
    pill.title = `Design System ON${summary}`;
  } else {
    pill.classList.remove('active');
    pill.setAttribute('aria-pressed', 'false');
    pill.title = `Design System OFF${summary}`;
  }
}

function initDsToggle(): void {
  const pill = document.getElementById('ds-toggle-pill') as HTMLButtonElement | null;

  if (pill) {
    pill.addEventListener('click', () => {
      dsToggleState.enabled = !dsToggleState.enabled;
      // Persist to clientStorage via sandbox
      postMessage({ type: 'save-ds-toggle', enabled: dsToggleState.enabled });
      // Sync variable binder setting
      postMessage({ type: 'set-auto-bind-variables', enabled: dsToggleState.enabled });
      updateDsToggleUI();
    });
  }

  // Listen for saved toggle state from clientStorage
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;
    if (msg.type === 'ds-toggle-loaded') {
      dsToggleState.enabled = msg.enabled !== false; // default true
      updateDsToggleUI();
    }
  });

  // Load saved toggle state from clientStorage
  postMessage({ type: 'load-ds-toggle' });

  // Initial UI state
  updateDsToggleUI();
}

function setupEventListeners(): void {
  // Settings panel
  if (dom.settingsBtn) {
    dom.settingsBtn.addEventListener('click', openSettings);
  }
  if (dom.settingsClose) {
    dom.settingsClose.addEventListener('click', closeSettings);
  }
  if (dom.settingsOverlay) {
    dom.settingsOverlay.addEventListener('click', closeSettings);
  }

  // Provider selection
  document.querySelectorAll('input[name="provider"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      selectProvider(target.value as AIProvider);
    });
  });

  // Provider option click (the card)
  document.querySelectorAll('.provider-option').forEach((option) => {
    option.addEventListener('click', () => {
      const provider = (option as HTMLElement).getAttribute('data-provider');
      if (provider) selectProvider(provider as AIProvider);
    });
  });

  // Validate button
  if (dom.validateBtn) {
    dom.validateBtn.addEventListener('click', () => {
      validateApiKey(apiState.currentProvider);
    });
  }

  // API Key input - validate on Enter
  if (dom.apiKeyInput) {
    dom.apiKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        validateApiKey(apiState.currentProvider);
      }
    });
    dom.apiKeyInput.addEventListener('input', () => {
      if (dom.apiKeyInput) {
        apiState.savedApiKeys[apiState.currentProvider] = dom.apiKeyInput.value.trim();
      }
    });
  }

  // Drop zone events (kept for screenshot flow reuse)
  if (dom.dropZone) {
    dom.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.dropZone!.classList.add('drag-over');
    });
    dom.dropZone.addEventListener('dragleave', () => {
      dom.dropZone!.classList.remove('drag-over');
    });
    dom.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.dropZone!.classList.remove('drag-over');
      const files = e.dataTransfer?.files;
      if (files && files[0]) {
        handleImageFile(files[0]);
      }
    });
    dom.dropZone.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.drop-zone-change')) return;
      if (dom.dropZone!.classList.contains('has-image')) return;
      dom.fileInput?.click();
    });
  }

  if (dom.dropZoneChange) {
    dom.dropZoneChange.addEventListener('click', () => {
      dom.fileInput?.click();
    });
  }

  // File input
  if (dom.fileInput) {
    dom.fileInput.addEventListener('change', () => {
      const files = dom.fileInput!.files;
      if (files && files.length > 1) {
        addToQueue(files);
      } else if (files && files.length === 1) {
        handleImageFile(files[0]);
      }
    });
  }

  // Use selection from canvas
  if (dom.useSelectionBtn) {
    dom.useSelectionBtn.addEventListener('click', () => {
      postMessage({ type: 'get-selected-image' });
    });
  }

  // Navigation (screenshot flow steps — kept for crop modal reuse)
  if (dom.nextToCropBtn) {
    dom.nextToCropBtn.addEventListener('click', () => goToStep(2));
  }
  if (dom.backToUploadBtn) {
    dom.backToUploadBtn.addEventListener('click', () => goToStep(1));
  }
  if (dom.startProcessingBtn) {
    dom.startProcessingBtn.addEventListener('click', () => {
      goToStep(3);
      startProcessing();
    });
  }
  if (dom.cancelBtn) {
    dom.cancelBtn.addEventListener('click', cancelProcessing);
  }
  if (dom.newDesignBtn) {
    dom.newDesignBtn.addEventListener('click', resetToStart);
  }
  if (dom.compareBtn) {
    dom.compareBtn.addEventListener('click', toggleCompare);
  }
  if (dom.compareCloseBtn) {
    dom.compareCloseBtn.addEventListener('click', toggleCompare);
  }
  if (dom.feedbackGoodBtn) {
    dom.feedbackGoodBtn.addEventListener('click', () => submitFeedback('good'));
  }
  if (dom.feedbackBadBtn) {
    dom.feedbackBadBtn.addEventListener('click', () => submitFeedback('bad'));
  }

  // Aspect ratio buttons
  document.querySelectorAll('.aspect-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ratio = (btn as HTMLElement).getAttribute('data-ratio');
      if (ratio) setAspectRatio(ratio);
    });
  });

  // Keyboard shortcuts & paste
  window.addEventListener('paste', handleImagePaste);
  document.addEventListener('keydown', handleKeyboardShortcuts);

  // Image generation toggle
  if (dom.enableImageGenCheckbox) {
    dom.enableImageGenCheckbox.addEventListener('change', () => {
      imageGenState.enableImageGeneration = dom.enableImageGenCheckbox!.checked;
      updateImageModelDropdownVisibility();
      saveSettings();
    });
  }

  // Image model selection
  if (dom.imageModelSelect) {
    dom.imageModelSelect.addEventListener('change', () => {
      imageGenState.imageGenModel = dom.imageModelSelect!.value as 'gemini-3.1-flash-image-preview' | 'gpt-image-1.5';
      saveSettings();
    });
  }

  // Model selection per provider
  if (dom.geminiModelSelect) {
    dom.geminiModelSelect.addEventListener('change', () => {
      const model = dom.geminiModelSelect!.value as 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-image-preview';
      apiState.geminiModel = model;
      imageGenState.geminiModel = model;
      saveSettings();
    });
  }
  if (dom.claudeModelSelect) {
    dom.claudeModelSelect.addEventListener('change', () => {
      apiState.claudeModel = dom.claudeModelSelect!.value;
      saveSettings();
    });
  }
  if (dom.openaiModelSelect) {
    dom.openaiModelSelect.addEventListener('change', () => {
      apiState.openaiModel = dom.openaiModelSelect!.value;
      saveSettings();
    });
  }

  // Batch processing buttons
  if (dom.batchProcessBtn) {
    dom.batchProcessBtn.addEventListener('click', startBatchProcessing);
  }
  if (dom.batchClearBtn) {
    dom.batchClearBtn.addEventListener('click', clearQueue);
  }

  // Crop listeners
  setupCropListeners();

  // Load API keys
  postMessage({ type: 'load-api-keys' });

  // Figma message handler
  initMessageHandler({
    onSelectedImage: (data) => {
      if (data.error) {
        console.error(data.error);
      } else if (data.imageData) {
        screenshotState.currentImageBase64 = data.imageData;
        screenshotState.imageWidth = data.width;
        screenshotState.imageHeight = data.height;
        showImagePreview(data.imageData);
      }
    },
    onProgress: (message: string, current: number, total: number) => {
      updateProgress(message, current, total);
      if (message.indexOf('Complete!') === 0) {
        notifyDesignCreated();
      }
    },
    onApiKeysLoaded: onApiKeysLoaded,
    onCommandResult: (response: Record<string, unknown>) => {
      const cmdId = response.id as string;
      if (cmdId && cmdId.startsWith('chat-')) {
        resolveChatCommand(
          cmdId,
          !!response.success,
          (response.data || {}) as Record<string, unknown>,
          response.error as string | undefined
        );
      } else if (cmdId && cmdId.startsWith('screenshot-')) {
        resolveScreenshotCommand(
          cmdId,
          !!response.success,
          (response.data || {}) as Record<string, unknown>,
          response.error as string | undefined
        );
      } else {
        handleBridgeCommandResult(response);
      }
    },
    onSettingsLoaded: (settings: Record<string, string>) => {
      loadChatSettings(settings);

      // CLOUD-1: Restore saved bridge relay URL into dropdowns
      if ((settings as any).bridgeRelayUrl) {
        restoreBridgeRelayUrl((settings as any).bridgeRelayUrl);
      }

      // Auto-connect bridge on plugin open. With pm2 managing the ws-relay,
      // the local relay is always available — no need to gate auto-connect on
      // model selection. Bridge routes MCP tool calls for ALL models.
      const cs = getChatSettings();
      const useClaudeCode = cs.model === 'claude-code';
      const isCodexModel = typeof cs.model === 'string' && cs.model.endsWith('-codex');
      const needsLocalRelay = useClaudeCode || isCodexModel;

      const relayUrl = needsLocalRelay
        ? 'http://localhost:3055'
        : cs.chatRelayEnabled
          ? cs.chatRelayUrl || 'https://figmento-ws-relay.fly.dev'
          : 'http://localhost:3055';
      autoConnectBridge(relayUrl, (settings as any).bridgeChannel || undefined);
    },
    onMemoryLoaded: (entries) => {
      loadMemoryEntries(entries);
    },
    onDesignSystemScanned: (cache, error) => {
      handleDesignSystemScanned(cache, error);
    },
    onChatHistoryLoaded: (data) => {
      restoreChatHistory(data);
    },
  });

  // Load chat memory and chat history from clientStorage
  postMessage({ type: 'load-memory' });
  postMessage({ type: 'load-chat-history' });
}

function initializeApp(): void {
  // 0. Clean up any previously registered listeners (prevents duplicates on re-init)
  cleanupAllListeners();

  // 1. Initialize DOM references
  initDomRefs();

  // 2. Load saved settings
  loadSettings();

  // 3. Set up core event listeners
  setupEventListeners();
  setupDesignSettingsListeners();

  // 4. Update initial UI state
  updateStatusDot();
  updateApiKeyInput();
  updateImageGenVisibility();
  updateModelDropdownVisibility();

  // Initialize tabs and feature modules
  initUnifiedTabs();
  initMainTabs();
  initChat();
  initBridge();
  initChatSettings();
  initPreferencesPanel();
  initDesignSystemPanel();
  initDsToggle();
  initSkillExport();
  initImageStudio();
  initRemixStudio();
  initPresets();
}

/** Initialize the unified tab layout. */
function initUnifiedTabs() {
  document.querySelectorAll('.unified-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab!;
      document.querySelectorAll('.unified-tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.unified-tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tabEl = document.getElementById(tab);
      if (tabEl) tabEl.classList.add('active');
      // Reload preferences list whenever the Settings tab is opened
      if (tab === 'tab-settings') {
        reloadPreferencesPanel();
      }
    });
  });
}

/** IS-1/BKR-2: Initialize main tab switching (Chat ↔ Image Studio ↔ Remix) */
function initMainTabs(): void {
  const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-bar-btn');
  const chatPanel = document.querySelector<HTMLElement>('.chat-surface');
  const studioPanel = document.getElementById('image-studio-panel');
  const remixPanel = document.getElementById('remix-panel');

  if (!chatPanel || !studioPanel || !remixPanel) return;

  // Store chat scroll position for restoration
  let chatScrollTop = 0;
  const chatMessages = document.getElementById('chat-messages');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;

      // Update button states
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (tab === 'chat') {
        chatPanel.style.display = '';
        studioPanel.classList.remove('active');
        remixPanel.classList.remove('active');
        // Restore chat scroll position
        if (chatMessages) chatMessages.scrollTop = chatScrollTop;
      } else if (tab === 'image-studio') {
        // Save chat scroll position before hiding
        if (chatMessages) chatScrollTop = chatMessages.scrollTop;
        chatPanel.style.display = 'none';
        studioPanel.classList.add('active');
        remixPanel.classList.remove('active');
      } else if (tab === 'remix') {
        if (chatMessages) chatScrollTop = chatMessages.scrollTop;
        chatPanel.style.display = 'none';
        studioPanel.classList.remove('active');
        remixPanel.classList.add('active');
      }
    });
  });
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
