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
  goBackToHome,
  handleKeyboardShortcuts,
  setAspectRatio,
  updateProgress,
  setResetTemplateFillCallback,
  setCanLeaveAdAnalyzerCallback,
  toggleCompare,
  submitFeedback,
} from './screenshot';
import {
  initModeUI,
  initModeSelector,
  selectPluginMode,
  setupModeListeners,
  setupTextFlowScrollSpy,
  getSavedMode,
} from './text-layout';
import { initTemplateFillUI, handleTemplateScanResult, handleTemplateApplyResult, resetTemplateFill } from './template';
import {
  initPresentationFlowUI,
  setupPresentationFlowListeners,
  setupAddSlideListeners,
  setupPresFontAutocomplete,
  setupPresentationScrollSpy,
  handleSlideStyleResult,
  handleAddSlideComplete,
  handleAddSlideError,
} from './presentation';
import { initMessageHandler } from './messages';
import { initHeroUI, setupHeroListeners } from './hero-generator';
import { AIProvider } from '../types';
import { apiState, imageGenState } from './state';
import { addToQueue, startBatchProcessing, clearQueue, notifyDesignCreated } from './batch';
import { initChat, resolveChatCommand, loadMemoryEntries } from './chat';
import { initBridge, handleBridgeCommandResult } from './bridge';
import { initChatSettings, loadChatSettings } from './chat-settings';
import { initAdAnalyzer, canLeaveAdAnalyzer } from './ad-analyzer';

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

  // Drop zone events
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

  // Navigation
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

  // Navigation buttons
  if (dom.backToHomeBtn) {
    dom.backToHomeBtn.addEventListener('click', goBackToHome);
  }
  if (dom.breadcrumbBack) {
    dom.breadcrumbBack.addEventListener('click', goBackToHome);
  }
  if (dom.breadcrumbHome) {
    dom.breadcrumbHome.addEventListener('click', goBackToHome);
  }
  if (dom.logoBtn) {
    dom.logoBtn.addEventListener('click', goBackToHome);
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
    onTemplateScanResult: handleTemplateScanResult,
    onTemplateApplyResult: handleTemplateApplyResult,
    onSlideStyleResult: handleSlideStyleResult,
    onAddSlideComplete: handleAddSlideComplete,
    onAddSlideError: handleAddSlideError,
    onCommandResult: (response: Record<string, unknown>) => {
      const cmdId = response.id as string;
      if (cmdId && cmdId.startsWith('chat-')) {
        resolveChatCommand(cmdId, !!response.success, (response.data || {}) as Record<string, unknown>, response.error as string | undefined);
      } else {
        handleBridgeCommandResult(response);
      }
    },
    onSettingsLoaded: (settings: Record<string, string>) => {
      loadChatSettings(settings);
    },
    onMemoryLoaded: (entries) => {
      loadMemoryEntries(entries);
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

  // 5. Initialize mode-specific UI
  initModeUI();
  initModeSelector();
  setupModeListeners();
  setupTextFlowScrollSpy();

  // 6. Initialize template fill
  initTemplateFillUI();

  // 7. Initialize presentation
  initPresentationFlowUI();
  setupPresentationFlowListeners();
  setupAddSlideListeners();
  setupPresFontAutocomplete();
  setupPresentationScrollSpy();

  // 8. Initialize hero generator
  initHeroUI();
  setupHeroListeners();

  // 9. Wire cross-module callbacks
  setResetTemplateFillCallback(resetTemplateFill);
  setCanLeaveAdAnalyzerCallback(canLeaveAdAnalyzer);

  // 9b. Initialize ad analyzer
  initAdAnalyzer();

  // 10. Initialize unified tabs (Chat, Modes, Bridge, Settings)
  initUnifiedTabs();
  initChat();
  initBridge();
  initChatSettings();

  // 11. Restore saved mode or show mode selector
  const savedMode = getSavedMode();
  if (savedMode) {
    selectPluginMode(savedMode);
  } else {
    const modeSelectorEl = document.getElementById('modeSelector');
    if (modeSelectorEl) modeSelectorEl.classList.remove('hidden');
  }

  // 12. Focus drop zone for paste
  setTimeout(() => {
    dom.dropZone?.focus();
  }, 100);
}

/** Initialize the unified 4-tab layout (Chat, Modes, Bridge, Settings). */
function initUnifiedTabs() {
  document.querySelectorAll('.unified-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab!;
      document.querySelectorAll('.unified-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.unified-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tabEl = document.getElementById(tab);
      if (tabEl) tabEl.classList.add('active');
    });
  });
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
