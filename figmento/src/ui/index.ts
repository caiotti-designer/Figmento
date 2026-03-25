// Main entry point for the plugin UI
// Wires together all modules and initializes the application
// CU-6: Removed legacy tool flows (text-layout, template, presentation, hero-generator, ad-analyzer mode UI)

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
import { initChat, resolveChatCommand, loadMemoryEntries, getChatSettings } from './chat';
import { initBridge, handleBridgeCommandResult, autoConnectBridge, getBridgeConnected, getBridgeChannelId, getBridgeCommandCount, getBridgeErrorCount, setOnBridgeStateChange } from './bridge';
import { initChatSettings, loadChatSettings } from './chat-settings';
import { initPreferencesPanel, reloadPreferencesPanel } from './preferences-panel';
import { designSystemState, statusTabState, dsToggleState, STORAGE_KEY_USE_DESIGN_SYSTEM } from './state';
import { initSkillExport } from './skill-export';
import type { DesignSystemCache } from '../types';

// ═══════════════════════════════════════════════════════════════
// FN-6: Design System Discovery UI
// ═══════════════════════════════════════════════════════════════

const DS_STALENESS_MS = 60 * 60 * 1000; // 1 hour

function handleDesignSystemScanned(cache: DesignSystemCache | null, error?: string): void {
  designSystemState.isScanning = false;

  // Settings panel elements
  const btn = document.getElementById('ds-scan-btn') as HTMLButtonElement | null;
  const summary = document.getElementById('ds-scan-summary');
  const status = document.getElementById('ds-scan-status');

  // Status Tab elements (FN-15)
  const statusScanBtn = document.getElementById('status-ds-scan-btn') as HTMLButtonElement | null;
  const statusScanned = document.getElementById('status-ds-scanned');
  const statusEmpty = document.getElementById('status-ds-empty');
  const statusComps = document.getElementById('status-ds-components');
  const statusVars = document.getElementById('status-ds-variables');
  const statusStyles = document.getElementById('status-ds-styles');
  const statusStaleness = document.getElementById('status-ds-staleness');

  if (btn) {
    btn.disabled = false;
    btn.textContent = cache ? 'Rescan' : 'Scan Design System';
  }
  if (statusScanBtn) {
    statusScanBtn.disabled = false;
    statusScanBtn.textContent = cache ? 'Rescan' : 'Scan';
  }

  if (error) {
    if (status) {
      status.textContent = 'Scan failed: ' + error;
      status.className = 'ds-scan-status error';
    }
    if (summary) summary.textContent = '';
    if (statusStaleness) {
      statusStaleness.textContent = 'Scan failed: ' + error;
      statusStaleness.className = 'status-staleness warning';
    }
    return;
  }

  designSystemState.cache = cache;

  if (!cache) {
    if (summary) summary.textContent = '';
    if (status) { status.textContent = ''; status.className = 'ds-scan-status'; }
    if (statusScanned) statusScanned.style.display = 'none';
    if (statusEmpty) statusEmpty.style.display = '';
    return;
  }

  const compCount = cache.components.length;
  const varCount = cache.variables.length;
  const styleCount = (cache.paintStyles as unknown[]).length + (cache.textStyles as unknown[]).length + (cache.effectStyles as unknown[]).length;

  if (compCount === 0 && varCount === 0 && styleCount === 0) {
    if (summary) summary.textContent = 'No design system found in this file';
    if (status) { status.textContent = ''; status.className = 'ds-scan-status'; }
    if (statusScanned) statusScanned.style.display = 'none';
    if (statusEmpty) {
      statusEmpty.style.display = '';
      const emptyText = statusEmpty.querySelector('.status-card-empty');
      if (emptyText) emptyText.textContent = 'No design system found in this file';
    }
    return;
  }

  const compLabel = cache.truncated ? `${compCount}+ components (showing first 500)` : `${compCount} components`;
  if (summary) summary.textContent = `Found ${compLabel}, ${varCount} variables, ${styleCount} styles`;

  // Update Status Tab DS card
  if (statusScanned) statusScanned.style.display = '';
  if (statusEmpty) statusEmpty.style.display = 'none';
  if (statusComps) statusComps.textContent = cache.truncated ? `${compCount}+` : String(compCount);
  if (statusVars) statusVars.textContent = String(varCount);
  if (statusStyles) statusStyles.textContent = String(styleCount);

  // Staleness check
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

  if (statusStaleness) {
    if (isStale) {
      statusStaleness.textContent = 'Stale (>1h) — consider rescanning';
      statusStaleness.className = 'status-staleness warning';
    } else {
      const ago = Math.round((Date.now() - scannedTime) / 60000);
      statusStaleness.textContent = ago < 1 ? 'Scanned just now' : `Scanned ${ago}m ago`;
      statusStaleness.className = 'status-staleness fresh';
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

  // FN-15: Also update Status Tab scan button
  const statusScanBtn = document.getElementById('status-ds-scan-btn') as HTMLButtonElement | null;
  if (statusScanBtn) {
    statusScanBtn.disabled = true;
    statusScanBtn.textContent = 'Scanning...';
  }
  const statusStaleness = document.getElementById('status-ds-staleness');
  if (statusStaleness) {
    statusStaleness.textContent = 'Scanning design system...';
    statusStaleness.className = 'status-staleness scanning';
  }

  postMessage({ type: 'scan-design-system' });
}

function initDesignSystemPanel(): void {
  const btn = document.getElementById('ds-scan-btn');
  if (btn) {
    btn.addEventListener('click', triggerDesignSystemScan);
  }
  // FN-15: Status Tab scan button
  const statusScanBtn = document.getElementById('status-ds-scan-btn');
  if (statusScanBtn) {
    statusScanBtn.addEventListener('click', triggerDesignSystemScan);
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
  const toggleRow = document.getElementById('ds-toggle-row');
  const toggleInput = document.getElementById('ds-toggle') as HTMLInputElement | null;
  const summary = document.getElementById('ds-toggle-summary');
  const hint = document.getElementById('ds-toggle-hint');

  if (!toggleRow || !toggleInput) return;

  const cache = designSystemState.cache;
  const hasCache = cache !== null &&
    (cache.components.length > 0 || cache.variables.length > 0 ||
     (cache.paintStyles as unknown[]).length + (cache.textStyles as unknown[]).length + (cache.effectStyles as unknown[]).length > 0);

  if (!hasCache) {
    // No DS scanned — disable toggle, show hint
    toggleRow.classList.add('disabled');
    toggleRow.classList.remove('active');
    toggleInput.disabled = true;
    toggleInput.checked = dsToggleState.enabled; // preserve stored preference
    if (hint) hint.style.display = 'inline';
    if (summary) summary.textContent = '';
  } else if (dsToggleState.enabled) {
    // DS scanned + toggle ON
    toggleRow.classList.remove('disabled');
    toggleRow.classList.add('active');
    toggleInput.disabled = false;
    toggleInput.checked = true;
    if (hint) hint.style.display = 'none';
    if (summary) {
      const compCount = cache.components.length;
      const varCount = cache.variables.length;
      const styleCount = (cache.paintStyles as unknown[]).length + (cache.textStyles as unknown[]).length + (cache.effectStyles as unknown[]).length;
      const parts: string[] = [];
      if (compCount > 0) parts.push(`${compCount} components`);
      if (varCount > 0) parts.push(`${varCount} variables`);
      if (styleCount > 0) parts.push(`${styleCount} styles`);
      summary.textContent = parts.length > 0 ? `(${parts.join(', ')})` : '';
    }
  } else {
    // DS scanned + toggle OFF
    toggleRow.classList.remove('disabled');
    toggleRow.classList.remove('active');
    toggleInput.disabled = false;
    toggleInput.checked = false;
    if (hint) hint.style.display = 'none';
    if (summary) summary.textContent = '';
  }
}

function initDsToggle(): void {
  const toggleInput = document.getElementById('ds-toggle') as HTMLInputElement | null;
  const scanLink = document.getElementById('ds-toggle-scan-link');

  if (toggleInput) {
    toggleInput.addEventListener('change', () => {
      dsToggleState.enabled = toggleInput.checked;
      // Persist to clientStorage via sandbox
      postMessage({ type: 'save-ds-toggle', enabled: dsToggleState.enabled });
      // Sync variable binder setting
      postMessage({ type: 'set-auto-bind-variables', enabled: dsToggleState.enabled });
      updateDsToggleUI();
    });
  }

  if (scanLink) {
    scanLink.addEventListener('click', (e) => {
      e.preventDefault();
      triggerDesignSystemScan();
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

// ═══════════════════════════════════════════════════════════════
// FN-15: Status Tab
// ═══════════════════════════════════════════════════════════════

function updateStatusTabMcp(connected: boolean, channelId: string | null, cmds: number, errs: number): void {
  const dot = document.getElementById('status-mcp-dot');
  const connectedDiv = document.getElementById('status-mcp-connected');
  const disconnectedDiv = document.getElementById('status-mcp-disconnected');
  const channelEl = document.getElementById('status-mcp-channel');
  const cmdsEl = document.getElementById('status-mcp-cmds');
  const errsEl = document.getElementById('status-mcp-errs');

  if (dot) {
    dot.className = 'status-dot-indicator ' + (connected ? 'connected' : 'disconnected');
  }
  if (connectedDiv) connectedDiv.style.display = connected ? '' : 'none';
  if (disconnectedDiv) disconnectedDiv.style.display = connected ? 'none' : '';
  if (channelEl) channelEl.textContent = channelId || '---';
  if (cmdsEl) cmdsEl.textContent = String(cmds);
  if (errsEl) errsEl.textContent = String(errs);
}

function updateStatusTabPreferences(count: number): void {
  statusTabState.preferencesCount = count;
  const text = document.getElementById('status-prefs-count-text');
  const viewBtn = document.getElementById('status-prefs-view');
  if (text) {
    text.textContent = count > 0 ? `${count} preference${count !== 1 ? 's' : ''} learned` : 'No preferences learned yet';
  }
  if (viewBtn) {
    viewBtn.style.display = count > 0 ? '' : 'none';
  }
}

function initStatusTab(): void {
  // Wire bridge state changes to Status Tab MCP card
  setOnBridgeStateChange(updateStatusTabMcp);
  // Set initial state
  updateStatusTabMcp(getBridgeConnected(), getBridgeChannelId(), getBridgeCommandCount(), getBridgeErrorCount());

  // "Configure" link opens Settings sheet and scrolls to Advanced section
  const configureBtn = document.getElementById('status-mcp-configure');
  if (configureBtn) {
    configureBtn.addEventListener('click', () => {
      openSettings();
      // Wait for sheet animation, then scroll to Advanced section
      setTimeout(() => {
        const advSection = document.getElementById('bridge-advanced-section');
        if (advSection) {
          advSection.open = true;
          advSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 200);
    });
  }

  // "View" link opens Settings sheet and scrolls to Preferences section
  const viewPrefsBtn = document.getElementById('status-prefs-view');
  if (viewPrefsBtn) {
    viewPrefsBtn.addEventListener('click', () => {
      openSettings();
      setTimeout(() => {
        const prefSection = document.getElementById('preferences-section');
        if (prefSection) {
          prefSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 200);
    });
  }

  // Listen for preferences-loaded to update count
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;
    if (msg.type === 'preferences-loaded') {
      const prefs = (msg.preferences as unknown[]) || [];
      updateStatusTabPreferences(prefs.length);
    }
  });

  // Request initial preferences count
  postMessage({ type: 'get-preferences' });

  // If DS cache already exists (e.g. from a previous scan in this session), populate the card
  if (designSystemState.cache) {
    handleDesignSystemScanned(designSystemState.cache);
  }
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
    // CU-6: Removed template/presentation/slide handlers
    onTemplateScanResult: () => {},
    onTemplateApplyResult: () => {},
    onSlideStyleResult: () => {},
    onAddSlideComplete: () => {},
    onAddSlideError: () => {},
    onCommandResult: (response: Record<string, unknown>) => {
      const cmdId = response.id as string;
      if (cmdId && cmdId.startsWith('chat-')) {
        resolveChatCommand(cmdId, !!response.success, (response.data || {}) as Record<string, unknown>, response.error as string | undefined);
      } else if (cmdId && cmdId.startsWith('screenshot-')) {
        resolveScreenshotCommand(cmdId, !!response.success, (response.data || {}) as Record<string, unknown>, response.error as string | undefined);
      } else {
        handleBridgeCommandResult(response);
      }
    },
    onSettingsLoaded: (settings: Record<string, string>) => {
      loadChatSettings(settings);

      // Auto-connect bridge when relay mode is enabled (CR-3)
      const cs = getChatSettings();
      const relayBar = document.getElementById('relay-status-bar');
      if (cs.chatRelayEnabled) {
        if (relayBar) relayBar.style.display = 'flex';
        autoConnectBridge(cs.chatRelayUrl);
      } else {
        if (relayBar) relayBar.style.display = 'none';
      }
    },
    onMemoryLoaded: (entries) => {
      loadMemoryEntries(entries);
    },
    onDesignSystemScanned: (cache, error) => {
      handleDesignSystemScanned(cache, error);
    },
  });

  // Load chat memory from clientStorage
  postMessage({ type: 'load-memory' });
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

  // CU-6: Steps 5-9 removed (mode UI, template fill, presentation, hero generator, ad analyzer)

  // 10. Initialize unified tabs (Chat, Settings)
  initUnifiedTabs();
  initChat();
  initBridge();
  initChatSettings();
  initPreferencesPanel();
  initDesignSystemPanel();
  initDsToggle();
  initStatusTab();
  initSkillExport();

  // CU-6: Steps 11-12 removed (saved mode restore, drop zone focus)
}

/** Initialize the unified tab layout. */
function initUnifiedTabs() {
  document.querySelectorAll('.unified-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab!;
      document.querySelectorAll('.unified-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.unified-tab-content').forEach(c => c.classList.remove('active'));
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

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
