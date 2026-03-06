import { AIProvider, PROVIDERS } from '../types';
import {
  dom,
  apiState,
  imageGenState,
  designSettings,
  GOOGLE_FONTS,
  MAX_BRAND_COLORS,
  STORAGE_KEY_PROVIDER,
  STORAGE_KEY_IMAGE_GEN,
  STORAGE_KEY_IMAGE_MODEL,
  STORAGE_KEY_CLAUDE_MODEL,
  STORAGE_KEY_OPENAI_MODEL,
  STORAGE_KEY_DESIGN_OVERRIDES,
} from './state';
import { postMessage, showToast, safeGetItem, safeSetItem } from './utils';
import { validateGeminiKey, validateClaudeKey, validateOpenAIKey } from './api';

// ═══════════════════════════════════════════════════════════════
// LOAD / SAVE SETTINGS
// ═══════════════════════════════════════════════════════════════

export const loadSettings = (): void => {
  try {
    const savedProvider = safeGetItem(STORAGE_KEY_PROVIDER);
    if (savedProvider) {
      apiState.currentProvider = savedProvider as AIProvider;
      const radio = document.querySelector(
        'input[name="provider"][value="' + apiState.currentProvider + '"]'
      ) as HTMLInputElement;
      if (radio) radio.checked = true;
      updateProviderOptionSelection();
    }

    const savedImageGen = safeGetItem(STORAGE_KEY_IMAGE_GEN);
    if (savedImageGen === 'true') {
      imageGenState.enableImageGeneration = true;
      if (dom.enableImageGenCheckbox) dom.enableImageGenCheckbox.checked = true;
    }

    const savedImageModel = safeGetItem(STORAGE_KEY_IMAGE_MODEL);
    if (savedImageModel === 'gemini-3.1-flash-image-preview' || savedImageModel === 'gpt-image-1.5') {
      imageGenState.imageGenModel = savedImageModel;
      if (dom.imageModelSelect) dom.imageModelSelect.value = savedImageModel;
    }

    const savedClaudeModel = safeGetItem(STORAGE_KEY_CLAUDE_MODEL);
    if (savedClaudeModel) {
      apiState.claudeModel = savedClaudeModel;
      if (dom.claudeModelSelect) dom.claudeModelSelect.value = savedClaudeModel;
    }

    const savedOpenaiModel = safeGetItem(STORAGE_KEY_OPENAI_MODEL);
    if (savedOpenaiModel) {
      apiState.openaiModel = savedOpenaiModel;
      if (dom.openaiModelSelect) dom.openaiModelSelect.value = savedOpenaiModel;
    }

    // Show/hide sections based on provider
    updateImageGenVisibility();
    updateModelDropdownVisibility();

    // Load design overrides
    const savedOverrides = safeGetItem(STORAGE_KEY_DESIGN_OVERRIDES);
    if (savedOverrides) {
      try {
        const parsed = JSON.parse(savedOverrides);
        if (parsed.font) designSettings.selectedFontFamily = parsed.font;
        if (Array.isArray(parsed.colors)) designSettings.brandColors = parsed.colors.slice(0, MAX_BRAND_COLORS);
        if (parsed.grid) designSettings.enableGridSystem = true;
        if (parsed.prompt) designSettings.customPrompt = parsed.prompt;
        if (parsed.enabled) {
          // Restore toggle + panel state (deferred to after DOM init)
          setTimeout(() => {
            const toggle = document.getElementById('designSettingsToggle') as HTMLInputElement;
            if (toggle) {
              toggle.checked = true;
              dom.designSettingsPanel?.classList.add('enabled');
              const sw = toggle.nextElementSibling as HTMLElement;
              if (sw) sw.classList.add('active');
            }
          }, 0);
        }

        // Restore UI elements
        if (dom.fontFamilyInput) dom.fontFamilyInput.value = designSettings.selectedFontFamily;
        if (dom.enableGridSystemCheckbox && designSettings.enableGridSystem) {
          dom.enableGridSystemCheckbox.checked = true;
          const sw = dom.enableGridSystemCheckbox.nextElementSibling as HTMLElement;
          if (sw) sw.classList.add('active');
        }
        if (dom.customPromptInput && designSettings.customPrompt) {
          dom.customPromptInput.value = designSettings.customPrompt;
        }
        renderColorChips();
        updateFontValidation(designSettings.selectedFontFamily);
        updateColorCount();
        updateCharCount();
      } catch (_e) {
        // Ignore malformed JSON
      }
    }
  } catch (_e) {
    console.log('localStorage not available, using defaults');
  }
};

export const saveSettings = (): void => {
  try {
    safeSetItem(STORAGE_KEY_PROVIDER, apiState.currentProvider);
    safeSetItem(STORAGE_KEY_IMAGE_GEN, imageGenState.enableImageGeneration ? 'true' : 'false');
    safeSetItem(STORAGE_KEY_IMAGE_MODEL, imageGenState.imageGenModel);
    safeSetItem(STORAGE_KEY_CLAUDE_MODEL, apiState.claudeModel);
    safeSetItem(STORAGE_KEY_OPENAI_MODEL, apiState.openaiModel);
  } catch (_e) {
    // Ignore
  }
};

export const saveDesignOverrides = (): void => {
  try {
    const isEnabled = dom.designSettingsPanel?.classList.contains('enabled') || false;
    safeSetItem(STORAGE_KEY_DESIGN_OVERRIDES, JSON.stringify({
      enabled: isEnabled,
      font: designSettings.selectedFontFamily,
      colors: designSettings.brandColors,
      grid: designSettings.enableGridSystem,
      prompt: designSettings.customPrompt,
    }));
  } catch (_e) {
    // Ignore
  }
};

// ═══════════════════════════════════════════════════════════════
// DESIGN SETTINGS
// ═══════════════════════════════════════════════════════════════

const updateFontValidation = (fontName: string): void => {
  if (!dom.fontValidationIndicator) return;
  const trimmed = fontName.trim();
  if (!trimmed || trimmed === 'Inter') {
    dom.fontValidationIndicator.textContent = '';
    dom.fontValidationIndicator.className = 'font-validation-indicator';
    return;
  }
  const isGoogleFont = GOOGLE_FONTS.indexOf(trimmed) !== -1;
  if (isGoogleFont) {
    dom.fontValidationIndicator.textContent = '\u2713 Google Font';
    dom.fontValidationIndicator.className = 'font-validation-indicator valid';
  } else {
    dom.fontValidationIndicator.textContent = '\u26A0 Custom';
    dom.fontValidationIndicator.className = 'font-validation-indicator custom';
  }
};

const updateColorCount = (): void => {
  const el = document.getElementById('colorCount');
  if (el) {
    const count = designSettings.brandColors.length;
    el.textContent = count > 0 ? '(' + count + '/' + MAX_BRAND_COLORS + ')' : '';
  }
};

const updateCharCount = (): void => {
  const el = document.getElementById('promptCharCount');
  if (!el || !dom.customPromptInput) return;
  const len = dom.customPromptInput.value.length;
  if (len > 0) {
    el.textContent = len + '/500';
    el.className = len >= 400 ? 'prompt-char-count near-limit' : 'prompt-char-count';
  } else {
    el.textContent = '';
  }
};

export const setupDesignSettingsListeners = (): void => {
  // Toggle design overrides on/off
  const designSettingsToggle = document.getElementById('designSettingsToggle') as HTMLInputElement;
  const designSettingsSwitch = designSettingsToggle ? (designSettingsToggle.nextElementSibling as HTMLElement) : null;

  if (designSettingsToggle) {
    designSettingsToggle.addEventListener('change', () => {
      if (designSettingsToggle.checked) {
        dom.designSettingsPanel?.classList.add('enabled');
        if (designSettingsSwitch) designSettingsSwitch.classList.add('active');
      } else {
        dom.designSettingsPanel?.classList.remove('enabled');
        if (designSettingsSwitch) designSettingsSwitch.classList.remove('active');
      }
      saveDesignOverrides();
    });
  }

  // Font family autocomplete
  const fontAutocompleteList = document.getElementById('fontAutocompleteList') as HTMLDivElement;
  let fontActiveIndex = -1;

  if (dom.fontFamilyInput && fontAutocompleteList) {
    const fontFamilyInput = dom.fontFamilyInput;

    fontFamilyInput.addEventListener('input', () => {
      const query = fontFamilyInput.value.trim();
      designSettings.selectedFontFamily = query || 'Inter';
      fontActiveIndex = -1;
      updateFontValidation(designSettings.selectedFontFamily);
      saveDesignOverrides();

      if (query.length === 0) {
        fontAutocompleteList.classList.remove('show');
        return;
      }

      const matches = GOOGLE_FONTS.filter((font) => font.toLowerCase().indexOf(query.toLowerCase()) !== -1).slice(0, 8);

      if (matches.length === 0) {
        fontAutocompleteList.classList.remove('show');
        return;
      }

      let html = '';
      const queryLower = query.toLowerCase();
      for (let i = 0; i < matches.length; i++) {
        const font = matches[i];
        const idx = font.toLowerCase().indexOf(queryLower);
        const highlighted =
          font.substring(0, idx) +
          '<span class="font-match">' +
          font.substring(idx, idx + query.length) +
          '</span>' +
          font.substring(idx + query.length);
        html += '<div class="font-autocomplete-item" data-font="' + font + '">' + highlighted + '</div>';
      }
      fontAutocompleteList.innerHTML = html;
      fontAutocompleteList.classList.add('show');
    });

    fontFamilyInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!fontAutocompleteList.classList.contains('show')) return;

      const items = fontAutocompleteList.querySelectorAll('.font-autocomplete-item');
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        fontActiveIndex = Math.min(fontActiveIndex + 1, items.length - 1);
        updateFontActiveItem(items, fontActiveIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        fontActiveIndex = Math.max(fontActiveIndex - 1, 0);
        updateFontActiveItem(items, fontActiveIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (fontActiveIndex >= 0 && items[fontActiveIndex]) {
          selectFont(
            (items[fontActiveIndex] as HTMLElement).getAttribute('data-font') || '',
            fontFamilyInput,
            fontAutocompleteList
          );
        }
        fontAutocompleteList.classList.remove('show');
      } else if (e.key === 'Escape') {
        fontAutocompleteList.classList.remove('show');
      }
    });

    fontAutocompleteList.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.font-autocomplete-item') as HTMLElement;
      if (target) {
        selectFont(target.getAttribute('data-font') || '', fontFamilyInput, fontAutocompleteList);
      }
    });

    fontFamilyInput.addEventListener('blur', () => {
      setTimeout(() => {
        fontAutocompleteList.classList.remove('show');
      }, 150);
    });

    fontFamilyInput.addEventListener('focus', () => {
      if (fontFamilyInput.value.trim().length > 0) {
        fontFamilyInput.dispatchEvent(new Event('input'));
      }
    });
  }

  // Color picker sync
  if (dom.colorPickerInput && dom.colorHexInput) {
    dom.colorPickerInput.addEventListener('input', () => {
      if (dom.colorHexInput && dom.colorPickerInput) {
        dom.colorHexInput.value = dom.colorPickerInput.value.toUpperCase();
      }
    });
  }

  // Add color button
  if (dom.addColorBtn) {
    dom.addColorBtn.addEventListener('click', addBrandColor);
  }

  // Color hex input - add on Enter key
  if (dom.colorHexInput) {
    dom.colorHexInput.addEventListener('keypress', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        addBrandColor();
      }
    });
  }

  // Grid system toggle
  const gridSystemSwitch = dom.enableGridSystemCheckbox
    ? (dom.enableGridSystemCheckbox.nextElementSibling as HTMLElement)
    : null;

  if (dom.enableGridSystemCheckbox) {
    const checkbox = dom.enableGridSystemCheckbox;
    checkbox.addEventListener('change', () => {
      designSettings.enableGridSystem = checkbox.checked;
      if (gridSystemSwitch) {
        if (designSettings.enableGridSystem) {
          gridSystemSwitch.classList.add('active');
        } else {
          gridSystemSwitch.classList.remove('active');
        }
      }
      saveDesignOverrides();
    });
  }

  // Custom prompt input
  if (dom.customPromptInput) {
    dom.customPromptInput.addEventListener('input', () => {
      designSettings.customPrompt = dom.customPromptInput!.value;
      updateCharCount();
      saveDesignOverrides();
    });
  }

  // Initialize indicators
  updateFontValidation(designSettings.selectedFontFamily);
  updateColorCount();
  updateCharCount();
};

const updateFontActiveItem = (items: NodeListOf<Element>, activeIdx: number): void => {
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle('active', i === activeIdx);
  }
};

const selectFont = (
  fontName: string,
  fontFamilyInput: HTMLInputElement,
  fontAutocompleteList: HTMLDivElement
): void => {
  fontFamilyInput.value = fontName;
  designSettings.selectedFontFamily = fontName;
  fontAutocompleteList.classList.remove('show');
  updateFontValidation(fontName);
  saveDesignOverrides();
};

export const addBrandColor = (): void => {
  if (!dom.colorHexInput) return;
  let hexValue = dom.colorHexInput.value.trim();

  // Validate hex color
  if (!hexValue) return;

  // Add # if missing
  if (!hexValue.startsWith('#')) {
    hexValue = '#' + hexValue;
  }

  // Validate format (3 or 6 hex digits)
  if (!/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(hexValue)) {
    showToast('Invalid HEX color. Use format like #FF5733', 'error');
    return;
  }

  // Check limit
  if (designSettings.brandColors.length >= MAX_BRAND_COLORS) {
    showToast('Maximum ' + MAX_BRAND_COLORS + ' brand colors allowed', 'warning');
    return;
  }

  // Don't add duplicates
  if (designSettings.brandColors.indexOf(hexValue.toUpperCase()) !== -1) {
    showToast('Color already added', 'warning');
    return;
  }

  // Add to array
  designSettings.brandColors.push(hexValue.toUpperCase());

  // Render and persist
  renderColorChips();
  updateColorCount();
  saveDesignOverrides();

  // Clear input
  dom.colorHexInput.value = '';
};

export const renderColorChips = (): void => {
  if (!dom.colorChipsContainer) return;

  dom.colorChipsContainer.innerHTML = '';

  for (let i = 0; i < designSettings.brandColors.length; i++) {
    const color = designSettings.brandColors[i];
    const chip = document.createElement('div');
    chip.className = 'color-chip';
    chip.style.backgroundColor = color;
    chip.title = color;
    chip.setAttribute('data-color', color);

    // Add remove button
    const removeBtn = document.createElement('div');
    removeBtn.className = 'remove-color';
    removeBtn.innerHTML =
      '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    removeBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      const chipEl = (e.target as HTMLElement).closest('.color-chip') as HTMLElement;
      const colorToRemove = chipEl.getAttribute('data-color');
      if (colorToRemove) {
        const idx = designSettings.brandColors.indexOf(colorToRemove);
        if (idx !== -1) {
          designSettings.brandColors.splice(idx, 1);
          renderColorChips();
          updateColorCount();
          saveDesignOverrides();
        }
      }
    });

    chip.appendChild(removeBtn);
    dom.colorChipsContainer.appendChild(chip);
  }
};

// ═══════════════════════════════════════════════════════════════
// SETTINGS PANEL
// ═══════════════════════════════════════════════════════════════

export const openSettings = (): void => {
  dom.settingsOverlay?.classList.add('open');
  dom.settingsPanel?.classList.add('open');
  dom.settingsBtn?.setAttribute('aria-expanded', 'true');
};

export const closeSettings = (): void => {
  dom.settingsOverlay?.classList.remove('open');
  dom.settingsPanel?.classList.remove('open');
  dom.settingsBtn?.setAttribute('aria-expanded', 'false');
};

export const selectProvider = (provider: AIProvider): void => {
  apiState.currentProvider = provider;

  // Update radio
  const radio = document.querySelector('input[name="provider"][value="' + provider + '"]') as HTMLInputElement;
  if (radio) radio.checked = true;

  updateProviderOptionSelection();
  updateApiKeyInput();
  updateStatusDot();
  updateImageGenVisibility();
  updateModelDropdownVisibility();
  saveSettings();
};

export const updateProviderOptionSelection = (): void => {
  document.querySelectorAll('.provider-option').forEach((option) => {
    const provider = (option as HTMLElement).getAttribute('data-provider');
    if (provider === apiState.currentProvider) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });
};

export const updateApiKeyInput = (): void => {
  if (!dom.apiKeyInput || !dom.getKeyLink || !dom.validationStatus) return;

  const key = apiState.savedApiKeys[apiState.currentProvider] || '';
  dom.apiKeyInput.value = key;
  dom.apiKeyInput.placeholder = PROVIDERS[apiState.currentProvider].placeholder;
  dom.getKeyLink.href = PROVIDERS[apiState.currentProvider].docsUrl;

  // Show saved validation status
  if (key && apiState.validatedKeys[apiState.currentProvider]) {
    showValidationStatus('API key saved & verified', 'saved');
  } else if (key) {
    showValidationStatus('API key saved (not verified)', 'warning');
  } else {
    dom.validationStatus.classList.remove('show');
  }
};

export const updateStatusDot = (): void => {
  if (!dom.statusDot) return;

  // Clear all classes
  dom.statusDot.classList.remove('connected', 'warning', 'error');

  if (apiState.validatedKeys[apiState.currentProvider]) {
    dom.statusDot.classList.add('connected');
    if (dom.settingsBtn) dom.settingsBtn.setAttribute('data-tooltip', 'API key: verified');
  } else if (apiState.savedApiKeys[apiState.currentProvider]) {
    dom.statusDot.classList.add('warning');
    if (dom.settingsBtn) dom.settingsBtn.setAttribute('data-tooltip', 'API key: not verified');
  } else {
    if (dom.settingsBtn) dom.settingsBtn.setAttribute('data-tooltip', 'API key: not configured');
  }

  // Update provider status dots in settings
  (['gemini', 'claude', 'openai'] as AIProvider[]).forEach((provider) => {
    const dot = document.getElementById('providerStatus-' + provider);
    if (dot) {
      dot.classList.remove('connected', 'warning', 'error');
      if (apiState.validatedKeys[provider]) {
        dot.classList.add('connected');
      } else if (apiState.savedApiKeys[provider]) {
        dot.classList.add('warning');
      }
    }
  });
};

export const updateImageGenVisibility = (): void => {
  if (!dom.imageGenSection) return;

  // Only show image generation option for Gemini
  if (apiState.currentProvider === 'gemini') {
    dom.imageGenSection.style.display = 'block';
    updateImageModelDropdownVisibility();
  } else {
    dom.imageGenSection.style.display = 'none';
  }
};

export const updateImageModelDropdownVisibility = (): void => {
  if (!dom.imageModelSelectWrapper) return;

  // Show dropdown only when image generation is enabled
  if (imageGenState.enableImageGeneration) {
    dom.imageModelSelectWrapper.style.display = 'block';
  } else {
    dom.imageModelSelectWrapper.style.display = 'none';
  }
};

export const updateModelDropdownVisibility = (): void => {
  if (dom.geminiModelSelectWrapper) {
    dom.geminiModelSelectWrapper.style.display = apiState.currentProvider === 'gemini' ? 'block' : 'none';
  }
  if (dom.claudeModelSelectWrapper) {
    dom.claudeModelSelectWrapper.style.display = apiState.currentProvider === 'claude' ? 'block' : 'none';
  }
  if (dom.openaiModelSelectWrapper) {
    dom.openaiModelSelectWrapper.style.display = apiState.currentProvider === 'openai' ? 'block' : 'none';
  }
};


// ═══════════════════════════════════════════════════════════════
// API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════

export const saveApiKeyToStorage = (provider: AIProvider, apiKey: string): void => {
  apiState.savedApiKeys[provider] = apiKey;
  postMessage({
    type: 'save-api-key',
    provider,
    apiKey,
  });
};

export const saveValidationToStorage = (provider: AIProvider, isValid: boolean): void => {
  apiState.validatedKeys[provider] = isValid;
  postMessage({
    type: 'save-validation',
    provider,
    isValid,
  });
};

export const onApiKeysLoaded = (keys: Record<string, string>, validated: Record<string, boolean>): void => {
  apiState.savedApiKeys = keys || {};
  apiState.validatedKeys = validated || {};
  updateApiKeyInput();
  updateStatusDot();
};

export const validateApiKey = async (provider: AIProvider): Promise<void> => {
  if (!dom.apiKeyInput || !dom.validateBtn) return;

  const apiKey = dom.apiKeyInput.value.trim();
  if (!apiKey) {
    showValidationStatus('Please enter an API key', 'error');
    return;
  }

  apiState.savedApiKeys[provider] = apiKey;

  dom.validateBtn.disabled = true;
  dom.validateBtn.textContent = 'Validating...';
  dom.validateBtn.classList.add('validating');
  showValidationStatus('Validating API key...', 'validating');

  let validateFn: (key: string) => Promise<boolean>;
  if (provider === 'gemini') {
    validateFn = validateGeminiKey;
  } else if (provider === 'claude') {
    validateFn = validateClaudeKey;
  } else {
    validateFn = validateOpenAIKey;
  }

  try {
    const isValid = await validateFn(apiKey);

    dom.validateBtn.disabled = false;
    dom.validateBtn.textContent = 'Validate';
    dom.validateBtn.classList.remove('validating');

    if (isValid) {
      saveApiKeyToStorage(provider, apiKey);
      saveValidationToStorage(provider, true);
      showValidationStatus('API key is valid!', 'success');
    } else {
      saveValidationToStorage(provider, false);
      showValidationStatus('Invalid API key', 'error');
    }
    updateStatusDot();
  } catch (error: unknown) {
    dom.validateBtn.disabled = false;
    dom.validateBtn.textContent = 'Validate';
    dom.validateBtn.classList.remove('validating');
    saveValidationToStorage(provider, false);
    const message = error instanceof Error ? error.message : 'Validation failed';
    showValidationStatus(message, 'error');
    updateStatusDot();
  }
};

export const showValidationStatus = (message: string, type: string): void => {
  if (!dom.validationStatus) return;

  dom.validationStatus.textContent = message;
  dom.validationStatus.className = 'validation-status show ' + type;

  if (type === 'success') {
    setTimeout(() => {
      showValidationStatus('API key saved & verified', 'saved');
    }, 3000);
  }
};
