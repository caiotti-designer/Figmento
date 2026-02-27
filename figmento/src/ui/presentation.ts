import {
  PresentationInput,
  PresentationAnalysis,
  UIAnalysis,
  UIElement,
  PRESENTATION_FORMATS,
  DesignStylePreset,
  PresentationContentType,
  PageOrientation,
  ExtractedSlideStyle,
  PRESENTATION_COLOR_THEMES,
} from '../types';
import { presentationState, addSlideState, apiState, imageGenState, GOOGLE_FONTS } from './state';
import { postMessage, showToast, debounce, escapeHtml } from './utils';
import { fetchAllIcons } from './icons';
import { validateAndFixAnalysis } from './api';
import { openSettings } from './settings';

// ═══════════════════════════════════════════════════════════════
// PRESENTATION FLOW UI
// ═══════════════════════════════════════════════════════════════

let generatePresentationBtnRef: HTMLButtonElement | null = null;

export const initPresentationFlowUI = (): void => {
  setupPresentationFlowListeners();
  updateSlideEstimate();
};

export const setupPresentationFlowListeners = (): void => {
  // Format category tabs
  const categoryBtns = document.querySelectorAll('.format-category-btn');
  categoryBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      categoryBtns.forEach((b) => {
        b.classList.remove('selected');
      });
      btn.classList.add('selected');
      const category = (btn as HTMLElement).getAttribute('data-category');
      showFormatOptions(category as 'presentation' | 'paper' | 'custom');
    });
  });

  // Presentation format cards
  const presFormatCards = document.querySelectorAll(
    '#presentationFormats .pres-format-card, #paperFormats .pres-format-card'
  );
  presFormatCards.forEach((card) => {
    card.addEventListener('click', () => {
      presFormatCards.forEach((c) => {
        c.classList.remove('selected');
      });
      card.classList.add('selected');
      const formatId = (card as HTMLElement).getAttribute('data-format');
      const format = PRESENTATION_FORMATS.find((f) => f.id === formatId);
      if (format) {
        presentationState.format = format;
        updateSlideEstimate();
      }
    });
  });

  // Orientation toggle
  const orientationBtns = document.querySelectorAll('.orientation-btn');
  orientationBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      orientationBtns.forEach((b) => {
        b.classList.remove('selected');
      });
      btn.classList.add('selected');
      presentationState.orientation = (btn as HTMLElement).getAttribute('data-orientation') as PageOrientation;
    });
  });

  // Custom dimensions
  const customWidthInput = document.getElementById('customWidthInput') as HTMLInputElement;
  const customHeightInput = document.getElementById('customHeightInput') as HTMLInputElement;
  if (customWidthInput) {
    customWidthInput.addEventListener('input', () => {
      presentationState.customWidth = parseInt(customWidthInput.value) || 1920;
    });
  }
  if (customHeightInput) {
    customHeightInput.addEventListener('input', () => {
      presentationState.customHeight = parseInt(customHeightInput.value) || 1080;
    });
  }

  // Slide count selector
  const slideCountBtns = document.querySelectorAll('#presSlideCountSelector .slide-count-btn');
  slideCountBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      slideCountBtns.forEach((b) => {
        b.classList.remove('selected');
      });
      btn.classList.add('selected');
      const count = (btn as HTMLElement).getAttribute('data-count');
      presentationState.slideCount = count === 'auto' ? 'auto' : parseInt(count || '5');
      updateSlideEstimate();
    });
  });

  // Syntax toggle
  const syntaxToggle = document.getElementById('syntaxToggle');
  const syntaxContent = document.getElementById('syntaxContent');
  if (syntaxToggle && syntaxContent) {
    syntaxToggle.addEventListener('click', () => {
      syntaxToggle!.classList.toggle('expanded');
      syntaxContent!.classList.toggle('show');
      syntaxToggle!.setAttribute('aria-expanded',
        String(syntaxToggle!.classList.contains('expanded')));
    });
  }

  // Content input - live slide estimation
  const presentationContentInput = document.getElementById('presentationContentInput') as HTMLTextAreaElement;
  if (presentationContentInput) {
    presentationContentInput.addEventListener('input', debounce(updateSlideEstimate, 300));
  }

  // Design style grid
  const styleCards = document.querySelectorAll('.design-style-card');
  styleCards.forEach((card) => {
    card.addEventListener('click', () => {
      styleCards.forEach((c) => {
        c.classList.remove('selected');
      });
      card.classList.add('selected');
      presentationState.designStyle = (card as HTMLElement).getAttribute('data-style') as DesignStylePreset;
    });
  });

  // Font autocomplete for presentation
  setupPresFontAutocomplete();

  // Color presets
  const presColorPresets = document.querySelectorAll('#presColorPresets .pres-color-preset');
  presColorPresets.forEach((preset) => {
    preset.addEventListener('click', () => {
      presColorPresets.forEach((p) => {
        p.classList.remove('selected');
      });
      preset.classList.add('selected');
      const themeId = (preset as HTMLElement).getAttribute('data-theme');
      if (themeId === 'auto') {
        presentationState.colorTheme = null;
      } else {
        presentationState.colorTheme = PRESENTATION_COLOR_THEMES.find((t) => t.id === themeId) || null;
      }
    });
  });

  // Custom hex input
  const presCustomHexInput = document.getElementById('presCustomHex') as HTMLInputElement;
  if (presCustomHexInput) {
    presCustomHexInput.addEventListener('input', () => {
      presentationState.customHex = presCustomHexInput.value;
    });
  }

  // Content type selector
  const contentTypeBtns = document.querySelectorAll('.content-type-btn');
  contentTypeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      contentTypeBtns.forEach((b) => {
        b.classList.remove('selected');
      });
      btn.classList.add('selected');
      presentationState.contentType = (btn as HTMLElement).getAttribute('data-type') as PresentationContentType;
    });
  });

  // Slide numbers toggle
  const showSlideNumbersCheckbox = document.getElementById('showSlideNumbers') as HTMLInputElement;
  if (showSlideNumbersCheckbox) {
    showSlideNumbersCheckbox.addEventListener('change', () => {
      presentationState.showSlideNumbers = showSlideNumbersCheckbox.checked;
    });
  }

  // Generate button
  generatePresentationBtnRef = document.getElementById('generatePresentationBtn') as HTMLButtonElement;
  if (generatePresentationBtnRef) {
    generatePresentationBtnRef.addEventListener('click', handleGeneratePresentation);
  }

  // Cancel button
  const presCancelBtn = document.getElementById('presentationCancelBtn');
  if (presCancelBtn) {
    presCancelBtn.addEventListener('click', cancelPresentationProcessing);
  }

  // New design button
  const presNewDesignBtn = document.getElementById('presentationNewDesignBtn');
  if (presNewDesignBtn) {
    presNewDesignBtn.addEventListener('click', resetPresentationFlow);
  }

  // Add Slide section listeners
  setupAddSlideListeners();

  // Setup scroll spy for presentation flow
  setupPresentationScrollSpy();
};

export const setupAddSlideListeners = (): void => {
  // Scan slide style button
  const scanSlideStyleBtn = document.getElementById('scanSlideStyleBtn');
  if (scanSlideStyleBtn) {
    scanSlideStyleBtn.addEventListener('click', () => {
      parent.postMessage({ pluginMessage: { type: 'scan-slide-style' } }, '*');
    });
  }

  // Add slide content textarea - enable/disable button based on content and style
  const addSlideContent = document.getElementById('addSlideContent') as HTMLTextAreaElement;
  const addSlideBtn = document.getElementById('addSlideBtn') as HTMLButtonElement;
  if (addSlideContent && addSlideBtn) {
    addSlideContent.addEventListener('input', () => {
      const hasContent = addSlideContent.value.trim().length > 0;
      const hasStyle = addSlideState.extractedStyle !== null;
      addSlideBtn.disabled = !hasContent || !hasStyle;
    });
  }

  // Add slide button
  if (addSlideBtn) {
    addSlideBtn.addEventListener('click', handleAddSlide);
  }
};

// ═══════════════════════════════════════════════════════════════
// FONT AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════════

export const setupPresFontAutocomplete = (): void => {
  const fontInput = document.getElementById('presFontInput') as HTMLInputElement;
  const autocompleteList = document.getElementById('presFontAutocompleteList') as HTMLDivElement;
  if (!fontInput || !autocompleteList) return;

  let activeIndex = -1;

  const updateActiveItem = (items: NodeListOf<Element>, index: number): void => {
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  };

  fontInput.addEventListener('input', () => {
    const query = fontInput.value.trim().toLowerCase();
    autocompleteList.innerHTML = '';
    activeIndex = -1;

    if (query.length < 1) {
      autocompleteList.classList.remove('show');
      return;
    }

    const matches = GOOGLE_FONTS.filter((font) => font.toLowerCase().includes(query)).slice(0, 8);

    if (matches.length === 0) {
      autocompleteList.classList.remove('show');
      return;
    }

    matches.forEach((font, index) => {
      const item = document.createElement('div');
      item.className = 'font-autocomplete-item';
      item.setAttribute('data-index', String(index));

      const regex = new RegExp('(' + query + ')', 'gi');
      item.innerHTML = font.replace(regex, '<span class="font-match">$1</span>');

      item.addEventListener('click', () => {
        fontInput.value = font;
        presentationState.font = font;
        autocompleteList.classList.remove('show');
      });

      autocompleteList.appendChild(item);
    });

    autocompleteList.classList.add('show');
  });

  fontInput.addEventListener('keydown', (e) => {
    const items = autocompleteList.querySelectorAll('.font-autocomplete-item');
    if (!autocompleteList.classList.contains('show') || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActiveItem(items, activeIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveItem(items, activeIndex);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const activeItem = items[activeIndex] as HTMLElement;
      const font = activeItem.textContent || '';
      fontInput.value = font;
      presentationState.font = font;
      autocompleteList.classList.remove('show');
    } else if (e.key === 'Escape') {
      autocompleteList.classList.remove('show');
    }
  });

  fontInput.addEventListener('blur', () => {
    setTimeout(() => {
      autocompleteList.classList.remove('show');
    }, 150);
  });
};

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

export const showFormatOptions = (category: 'presentation' | 'paper' | 'custom'): void => {
  const presentationFormats = document.getElementById('presentationFormats');
  const paperFormats = document.getElementById('paperFormats');
  const customOptions = document.getElementById('customFormatOptions');

  if (presentationFormats) presentationFormats.classList.add('hidden');
  if (paperFormats) paperFormats.classList.add('hidden');
  if (customOptions) customOptions.classList.add('hidden');

  if (category === 'presentation') {
    if (presentationFormats) presentationFormats.classList.remove('hidden');
  } else if (category === 'paper') {
    if (paperFormats) paperFormats.classList.remove('hidden');
  } else if (category === 'custom') {
    if (customOptions) customOptions.classList.remove('hidden');
  }
};

export const updateSlideEstimate = (): void => {
  const presentationContentInput = document.getElementById('presentationContentInput') as HTMLTextAreaElement;
  const estimatedSlideCountEl = document.getElementById('estimatedSlideCount') as HTMLSpanElement;
  const elementCountEl = document.getElementById('elementCount') as HTMLSpanElement;
  if (!presentationContentInput || !estimatedSlideCountEl) return;

  const content = presentationContentInput.value;
  const estimated = estimateSlideCount(content);
  const elements = countElements(content);

  if (presentationState.slideCount !== 'auto') {
    estimatedSlideCountEl.textContent = String(presentationState.slideCount);
  } else {
    estimatedSlideCountEl.textContent = '~' + estimated;
  }

  if (elementCountEl) {
    elementCountEl.textContent = String(elements);
  }
};

export const estimateSlideCount = (content: string): number => {
  if (!content.trim()) return 0;

  // Count slide markers
  const slideBreaks = (content.match(/^---$/gm) || []).length;
  const h1Count = (content.match(/^h1:/gm) || []).length;

  // Estimate based on content
  if (slideBreaks > 0) {
    return slideBreaks + 1;
  } else if (h1Count > 1) {
    return h1Count;
  }

  // Rough estimation based on content length and structure
  const h2Count = (content.match(/^h2:/gm) || []).length;
  const imgCount = (content.match(/^img:/gm) || []).length;
  const estimated = Math.max(h1Count + h2Count, Math.ceil((h2Count + imgCount) / 2), 3);
  return Math.min(Math.max(estimated, 3), 20);
};

export const countElements = (content: string): number => {
  const patterns = [
    /^h1:/gm,
    /^h2:/gm,
    /^h3:/gm,
    /^p:/gm,
    /^quote:/gm,
    /^stat:/gm,
    /^cta:/gm,
    /^link:/gm,
    /^tag:/gm,
    /^caption:/gm,
    /^img:/gm,
    /^- /gm,
    /^\d+\. /gm,
  ];
  let count = 0;
  patterns.forEach((pattern) => {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  });
  return count;
};

export const setupPresentationScrollSpy = (): void => {
  const flowScroll = document.getElementById('presentationFlowScroll');
  const steps = document.querySelectorAll('#presentationFlow .text-flow-step');
  const sections = document.querySelectorAll('#presentationFlow .text-section');

  if (!flowScroll || steps.length === 0 || sections.length === 0) return;

  flowScroll.addEventListener('scroll', () => {
    const scrollTop = flowScroll!.scrollTop;
    let activeSection = 'format';

    sections.forEach((section) => {
      const el = section as HTMLElement;
      if (el.offsetTop <= scrollTop + 60) {
        activeSection = el.getAttribute('data-section') || 'format';
      }
    });

    steps.forEach((step) => {
      const stepSection = (step as HTMLElement).getAttribute('data-section');
      if (stepSection === activeSection) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });
  });
};

// ═══════════════════════════════════════════════════════════════
// PROGRESS
// ═══════════════════════════════════════════════════════════════

export const setPresentationProgress = (percent: number, status: string): void => {
  const processingBar = document.getElementById('presentationProcessingBar');
  const processingStatus = document.getElementById('presentationProcessingStatus');
  if (processingBar) processingBar.style.width = percent + '%';
  if (processingStatus) processingStatus.innerHTML = '<span>' + escapeHtml(status) + ' ' + percent + '%</span>';
};

export const simulatePresentationProgress = (startPercent: number, endPercent: number, duration: number): void => {
  const start = Date.now();
  presentationState.progressInterval = window.setInterval(() => {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const percent = Math.floor(startPercent + (endPercent - startPercent) * eased);
    setPresentationProgress(percent, 'Generating presentation...');
    if (progress >= 1 && presentationState.progressInterval) {
      clearInterval(presentationState.progressInterval);
      presentationState.progressInterval = null;
    }
  }, 100) as unknown as number;
};

export const stopPresentationSimulation = (): void => {
  if (presentationState.progressInterval) {
    clearInterval(presentationState.progressInterval);
    presentationState.progressInterval = null;
  }
};

// ═══════════════════════════════════════════════════════════════
// MAIN FLOW
// ═══════════════════════════════════════════════════════════════

export const handleGeneratePresentation = async (): Promise<void> => {
  const presentationContentInput = document.getElementById('presentationContentInput') as HTMLTextAreaElement;
  const content = presentationContentInput ? presentationContentInput.value.trim() : '';

  if (!content) {
    showToast('Please enter presentation content', 'warning');
    return;
  }

  const apiKey = apiState.savedApiKeys[apiState.currentProvider];
  if (!apiKey) {
    showToast('Please configure your API key in Settings', 'warning');
    openSettings();
    return;
  }

  // Determine final dimensions
  let finalWidth: number;
  let finalHeight: number;

  if (presentationState.format.category === 'custom') {
    finalWidth = presentationState.customWidth;
    finalHeight = presentationState.customHeight;
  } else if (presentationState.format.supportsOrientation) {
    if (presentationState.orientation === 'landscape') {
      finalWidth = presentationState.format.height;
      finalHeight = presentationState.format.width;
    } else {
      finalWidth = presentationState.format.width;
      finalHeight = presentationState.format.height;
    }
  } else {
    finalWidth = presentationState.format.width;
    finalHeight = presentationState.format.height;
  }

  // Show processing UI
  presentationState.isProcessing = true;
  presentationState.abortController = new AbortController();
  if (generatePresentationBtnRef) generatePresentationBtnRef.disabled = true;

  const formContainer = document.getElementById('presentationFormContainer');
  const processingContainer = document.getElementById('presentationProcessingContainer');
  const successContainer = document.getElementById('presentationSuccessContainer');

  if (formContainer) formContainer.classList.add('hidden');
  if (processingContainer) processingContainer.classList.remove('hidden');
  if (successContainer) successContainer.classList.add('hidden');

  // Prepare input
  const input: PresentationInput = {
    content: content,
    format: {
      ...presentationState.format,
      width: finalWidth,
      height: finalHeight,
    },
    orientation: presentationState.orientation,
    font: presentationState.font,
    colorTheme: presentationState.colorTheme,
    customHex: presentationState.customHex || undefined,
    designStyle: presentationState.designStyle,
    contentType: presentationState.contentType,
    slideCount: presentationState.slideCount,
    showSlideNumbers: presentationState.showSlideNumbers,
  };

  setPresentationProgress(0, 'Analyzing content structure...');

  // Small delay before starting the async work
  await new Promise<void>((resolve) => setTimeout(resolve, 100));

  if (!presentationState.isProcessing) return;

  setPresentationProgress(5, 'Parsing content for slides...');
  simulatePresentationProgress(10, 55, 30000);

  try {
    const result = await analyzePresentationDesign(input, apiKey);

    if (!presentationState.isProcessing) return;

    stopPresentationSimulation();
    setPresentationProgress(60, 'Validating slides...');

    const validatedSlides: UIAnalysis[] = [];
    for (let s = 0; s < result.slides.length; s++) {
      const slide = result.slides[s];
      if (!slide.backgroundColor) slide.backgroundColor = '#FFFFFF';
      if (!slide.width) slide.width = input.format.width;
      if (!slide.height) slide.height = input.format.height;
      if (!Array.isArray(slide.elements)) slide.elements = [];
      const validatedSlide = validateAndFixAnalysis(slide);
      enforcePresentationFont(validatedSlide, input.font);
      validatedSlides.push(validatedSlide);
    }

    setPresentationProgress(70, 'Fetching icons...');
    const finalSlides = await Promise.all(validatedSlides.map((slide) => fetchAllIcons(slide)));

    if (!presentationState.isProcessing) return;

    setPresentationProgress(90, 'Creating presentation...');

    postMessage({
      type: 'create-presentation',
      data: {
        slides: finalSlides,
        font: presentationState.font,
        format: presentationState.format,
      },
    });

    // Show success
    const presSuccessDetails = document.getElementById('presSuccessDetails');
    if (presSuccessDetails) {
      presSuccessDetails.textContent = finalSlides.length + ' slides generated';
    }
    showPresentationSuccess();
  } catch (error: any) {
    if (error.message === 'Cancelled') return;
    console.error('Presentation generation error:', error);
    showToast('Generation failed: ' + error.message, 'error', 4000, () => handleGeneratePresentation());
    if (generatePresentationBtnRef) generatePresentationBtnRef.disabled = false;
    resetPresentationFlow();
  }
};

export const enforcePresentationFont = (analysis: UIAnalysis, font: string): void => {
  if (!font) return;

  const setFontRecursive = (elements: UIElement[]): void => {
    elements.forEach((el) => {
      if (el.text) {
        el.text.fontFamily = font;
      }
      if (el.children && el.children.length > 0) {
        setFontRecursive(el.children);
      }
    });
  };

  setFontRecursive(analysis.elements);
};

export const showPresentationSuccess = (): void => {
  const processingContainer = document.getElementById('presentationProcessingContainer');
  const successContainer = document.getElementById('presentationSuccessContainer');

  if (processingContainer) processingContainer.classList.add('hidden');
  if (successContainer) successContainer.classList.remove('hidden');

  presentationState.isProcessing = false;
};

export const cancelPresentationProcessing = (): void => {
  presentationState.isProcessing = false;
  if (presentationState.abortController) {
    presentationState.abortController.abort();
    presentationState.abortController = null;
  }
  stopPresentationSimulation();
  resetPresentationFlow();
  showToast('Generation cancelled', 'warning');
};

export const resetPresentationFlow = (): void => {
  presentationState.isProcessing = false;

  const formContainer = document.getElementById('presentationFormContainer');
  const processingContainer = document.getElementById('presentationProcessingContainer');
  const successContainer = document.getElementById('presentationSuccessContainer');

  if (formContainer) formContainer.classList.remove('hidden');
  if (processingContainer) processingContainer.classList.add('hidden');
  if (successContainer) successContainer.classList.add('hidden');
};

// ═══════════════════════════════════════════════════════════════
// ADD SLIDE TO EXISTING PRESENTATION
// ═══════════════════════════════════════════════════════════════

export const handleSlideStyleResult = (style: ExtractedSlideStyle | null, error?: string): void => {
  const scannedStyleInfo = document.getElementById('scannedStyleInfo');
  const scannedStyleColors = document.getElementById('scannedStyleColors');
  const scannedStyleText = document.getElementById('scannedStyleText');
  const addSlideBtn = document.getElementById('addSlideBtn') as HTMLButtonElement;
  const addSlideContent = document.getElementById('addSlideContent') as HTMLTextAreaElement;

  if (error || !style) {
    showToast(error || 'Failed to scan slide style', 'error');
    addSlideState.extractedStyle = null;
    if (scannedStyleInfo) scannedStyleInfo.classList.remove('visible');
    if (addSlideBtn) addSlideBtn.disabled = true;
    return;
  }

  addSlideState.extractedStyle = style;

  // Show the scanned style info
  if (scannedStyleInfo) scannedStyleInfo.classList.add('visible');

  // Display color swatches
  if (scannedStyleColors) {
    scannedStyleColors.innerHTML = [style.backgroundColor, style.primaryColor, style.accentColor, style.textColor]
      .filter((c, i, arr) => arr.indexOf(c) === i) // unique colors
      .slice(0, 4)
      .map((color) => {
        const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(color) ? color : '#CCCCCC';
        return '<div class="scanned-color-swatch" style="background: ' + safeColor + '"></div>';
      })
      .join('');
  }

  // Display style info text
  if (scannedStyleText) {
    scannedStyleText.innerHTML =
      '<strong>' + escapeHtml(style.frameName) + '</strong> · ' + style.width + '×' + style.height + ' · ' + escapeHtml(style.fontFamily);
  }

  // Enable/disable add slide button based on content
  if (addSlideBtn && addSlideContent) {
    const hasContent = addSlideContent.value.trim().length > 0;
    addSlideBtn.disabled = !hasContent;
  }

  showToast('Style scanned from "' + style.frameName + '"', 'success');
};

export const handleAddSlide = async (): Promise<void> => {
  if (!addSlideState.extractedStyle || addSlideState.isProcessing) return;

  const addSlideContent = document.getElementById('addSlideContent') as HTMLTextAreaElement;
  const content = addSlideContent ? addSlideContent.value.trim() : '';

  if (!content) {
    showToast('Please enter content for the slide', 'warning');
    return;
  }

  // Get API key
  const apiKey = apiState.savedApiKeys[apiState.currentProvider];
  if (!apiKey) {
    showToast('Please configure your API key in settings', 'error');
    return;
  }

  addSlideState.isProcessing = true;

  // Show loading state
  const addSlideLoading = document.getElementById('addSlideLoading');
  const addSlideBtn = document.getElementById('addSlideBtn') as HTMLButtonElement;
  if (addSlideLoading) addSlideLoading.classList.add('visible');
  if (addSlideBtn) addSlideBtn.disabled = true;

  try {
    // Generate the slide using AI
    const slideAnalysis = await generateSingleSlide(content, addSlideState.extractedStyle, apiKey);

    // Send to sandbox to create the slide
    parent.postMessage(
      {
        pluginMessage: {
          type: 'add-slide',
          data: {
            slide: slideAnalysis,
            afterFrameId: addSlideState.extractedStyle!.frameId,
            font: addSlideState.extractedStyle!.fontFamily,
          },
        },
      },
      '*'
    );
  } catch (error: any) {
    handleAddSlideError(error.message || 'Failed to generate slide');
  }
};

export const handleAddSlideComplete = (): void => {
  addSlideState.isProcessing = false;

  const addSlideLoading = document.getElementById('addSlideLoading');
  const addSlideBtn = document.getElementById('addSlideBtn') as HTMLButtonElement;
  const addSlideContent = document.getElementById('addSlideContent') as HTMLTextAreaElement;

  if (addSlideLoading) addSlideLoading.classList.remove('visible');
  if (addSlideBtn) addSlideBtn.disabled = false;
  if (addSlideContent) addSlideContent.value = '';

  showToast('Slide added successfully!', 'success');
};

export const handleAddSlideError = (error: string): void => {
  addSlideState.isProcessing = false;

  const addSlideLoading = document.getElementById('addSlideLoading');
  const addSlideBtn = document.getElementById('addSlideBtn') as HTMLButtonElement;

  if (addSlideLoading) addSlideLoading.classList.remove('visible');
  if (addSlideBtn && addSlideState.extractedStyle) addSlideBtn.disabled = false;

  showToast('Error: ' + error, 'error');
};

export const generateSingleSlide = async (
  content: string,
  style: ExtractedSlideStyle,
  apiKey: string
): Promise<UIAnalysis> => {
  const prompt = getSingleSlidePrompt(content, style);

  if (apiState.currentProvider === 'claude') {
    return generateSingleSlideWithClaude(prompt, apiKey);
  } else if (apiState.currentProvider === 'gemini') {
    return generateSingleSlideWithGemini(prompt, apiKey);
  } else {
    return generateSingleSlideWithOpenAI(prompt, apiKey);
  }
};

export const getSingleSlidePrompt = (content: string, style: ExtractedSlideStyle): string => {
  return [
    'You are an expert presentation designer. Generate a SINGLE slide that matches the existing presentation style.',
    '',
    '# EXISTING SLIDE STYLE (MUST MATCH EXACTLY)',
    'Dimensions: ' + style.width + ' x ' + style.height + ' pixels',
    'Background Color: ' + style.backgroundColor,
    'Primary Color: ' + style.primaryColor,
    'Secondary Color: ' + style.secondaryColor,
    'Accent Color: ' + style.accentColor,
    'Text Color: ' + style.textColor,
    'Font Family: ' + style.fontFamily,
    '',
    '# OUTPUT FORMAT',
    'Return ONLY valid JSON (no markdown, no explanation) with this structure:',
    '{',
    '  "width": ' + style.width + ',',
    '  "height": ' + style.height + ',',
    '  "backgroundColor": "' + style.backgroundColor + '",',
    '  "elements": [',
    '    {',
    '      "type": "text" | "rectangle" | "image",',
    '      "name": "element-name",',
    '      "x": number,',
    '      "y": number,',
    '      "width": number,',
    '      "height": number,',
    '      "text": "string (for text elements)",',
    '      "fontSize": number,',
    '      "fontWeight": 400 | 500 | 600 | 700,',
    '      "fontFamily": "' + style.fontFamily + '",',
    '      "textAlign": "left" | "center" | "right",',
    '      "fill": "#hex",',
    '      "cornerRadius": number (optional)',
    '    }',
    '  ]',
    '}',
    '',
    '# CONTENT SYNTAX',
    'Parse these prefixes:',
    '- h1: Main heading (large, bold)',
    '- h2: Section heading (medium)',
    '- h3: Subheading (smaller)',
    '- p: Paragraph text',
    '- quote: Pull quote / callout',
    '- stat: Large statistic/number',
    '- cta: Call-to-action button',
    '- tag: Small label/badge',
    '- img: Image placeholder (create gray rectangle with dashed border)',
    '- Bullet points (- item)',
    '',
    '# DESIGN RULES',
    '- Use ONLY the colors from the existing style',
    '- Use ONLY "' + style.fontFamily + '" as the font family',
    '- Maintain generous whitespace and clean layout',
    '- Keep text readable (minimum 14px for body text)',
    '- Center important content visually',
    '',
    '# USER CONTENT FOR THIS SLIDE',
    content,
  ].join('\n');
};

export const generateSingleSlideWithClaude = async (prompt: string, apiKey: string): Promise<UIAnalysis> => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: apiState.claudeModel,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error('API request failed');
  const data = await response.json();
  const text = data.content[0].text;
  return parseSingleSlideResponse(text);
};

export const generateSingleSlideWithGemini = async (prompt: string, apiKey: string): Promise<UIAnalysis> => {
  const model = imageGenState.geminiModel || 'gemini-3.1-pro-preview';
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    }
  );

  if (!response.ok) throw new Error('API request failed');
  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return parseSingleSlideResponse(text);
};

export const generateSingleSlideWithOpenAI = async (prompt: string, apiKey: string): Promise<UIAnalysis> => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: apiState.openaiModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
    }),
  });

  if (!response.ok) throw new Error('API request failed');
  const data = await response.json();
  const text = data.choices[0].message.content;
  return parseSingleSlideResponse(text);
};

export const parseSingleSlideResponse = (text: string): UIAnalysis => {
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No valid JSON found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!parsed.width || !parsed.height || !Array.isArray(parsed.elements)) {
    throw new Error('Invalid slide format');
  }

  return parsed as UIAnalysis;
};

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-PRESENTATION: AI PROMPT
// ═══════════════════════════════════════════════════════════════

export const PRESENTATION_PROMPT = [
  'You are an expert presentation designer creating professional, visually stunning multi-slide presentations.',
  'Generate Figma-compatible JSON layouts that are immediately usable as presentation slides.',
  '',
  '# OUTPUT FORMAT',
  'Return ONLY valid JSON with this structure:',
  '{',
  '  "designSystem": {',
  '    "primaryColor": "#hex",',
  '    "secondaryColor": "#hex",',
  '    "accentColor": "#hex",',
  '    "backgroundColor": "#hex",',
  '    "textColor": "#hex",',
  '    "fontFamily": "font-name"',
  '  },',
  '  "detectedContentType": "presentation|ebook|document|card-deck",',
  '  "slides": [',
  '    {"width": number, "height": number, "backgroundColor": "#hex", "elements": [...]},',
  '    ...',
  '  ]',
  '}',
  '',
  '# ELEMENT SCHEMA',
  'Each element in the elements array:',
  '{',
  '  "id": "unique-id",',
  '  "type": "frame|rectangle|text|image|icon|ellipse",',
  '  "name": "descriptive-name",',
  '  "x": number, "y": number, "width": number, "height": number,',
  '  "fills": [{"type": "SOLID", "color": "#hex"}],',
  '  "cornerRadius": number,',
  '  "text": { "content": "text", "fontSize": number, "fontWeight": number, "fontFamily": "font", "color": "#hex", "textAlign": "LEFT|CENTER|RIGHT" },',
  '  "children": [...],',
  '  "imageDescription": "description for image placeholders",',
  '  "lucideIcon": "icon-name",',
  '  "layoutMode": "HORIZONTAL|VERTICAL|NONE",',
  '  "itemSpacing": number,',
  '  "paddingTop": number, "paddingRight": number, "paddingBottom": number, "paddingLeft": number',
  '}',
  '',
  '# PRESENTATION RULES',
  '1. TITLE SLIDE: First slide should be impactful with clear visual hierarchy',
  '2. CONTENT DENSITY: Each slide should have ONE main idea - never overcrowd',
  '3. BULLET LISTS: Maximum 5-6 points per slide',
  '4. WHITE SPACE: Generous margins (at least 60px on all sides)',
  '5. TYPOGRAPHY: Use large, readable font sizes (headlines 48-72px, body 24-32px)',
  '6. CONSISTENCY: All slides MUST use the same design system',
  '7. IMAGE PLACEHOLDERS: Use type "image" with imageDescription for suggested images',
  '8. CLOSING SLIDE: End with clear CTA or "Thank You" slide',
  '',
  '# CONTENT SYNTAX',
  'Parse user content using these prefixes:',
  '- h1: = Primary heading (large, bold)',
  '- h2: = Section header',
  '- h3: = Subsection',
  '- p: = Body paragraph',
  '- quote: = Pull quote / callout',
  '- stat: = Large statistic display',
  '- cta: = Call-to-action button',
  '- link: = Text link',
  '- tag: = Small label/badge',
  '- caption: = Image caption',
  '- img: = Image placeholder with description',
  '- "---" = Slide break',
  '- "- item" = Bullet list',
  '- "1. item" = Numbered list',
  '',
  'IMPORTANT: Return ONLY valid JSON. No markdown, no explanations.',
].join('\n');

export const getPresentationPrompt = (input: PresentationInput): string => {
  const parts: string[] = [PRESENTATION_PROMPT];

  parts.push('');
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('# USER REQUIREMENTS');
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('');

  // Format
  parts.push('## FORMAT');
  parts.push('Slide dimensions: ' + input.format.width + ' x ' + input.format.height + ' px');
  parts.push('Every slide JSON "width" MUST be ' + input.format.width + ' and "height" MUST be ' + input.format.height);
  parts.push('');

  // Slide count
  if (input.slideCount && input.slideCount !== 'auto') {
    parts.push('## SLIDE COUNT (MANDATORY)');
    parts.push('Create EXACTLY ' + input.slideCount + ' slides.');
  } else {
    parts.push('## SLIDE COUNT');
    parts.push('Determine optimal number based on content (typically 5-15 slides).');
  }
  parts.push('');

  // Design style
  parts.push('## DESIGN STYLE');
  if (input.designStyle === 'auto') {
    parts.push('Analyze the content and choose the most appropriate style.');
  } else {
    parts.push('Use a ' + input.designStyle.toUpperCase() + ' design style:');
    switch (input.designStyle) {
      case 'minimal':
        parts.push('- Lots of white space, clean typography, subtle colors, minimal decoration');
        break;
      case 'corporate':
        parts.push('- Professional, structured layout, formal typography, blue/navy palette');
        break;
      case 'bold':
        parts.push('- High contrast colors, large impactful headlines, dark backgrounds with bright accents');
        break;
      case 'creative':
        parts.push('- Playful asymmetric layouts, varied typography, vibrant unexpected colors');
        break;
    }
  }
  parts.push('');

  // Font
  if (input.font) {
    parts.push('## FONT (MANDATORY)');
    parts.push('ALL text MUST use fontFamily: "' + input.font + '"');
  }
  parts.push('');

  // Colors
  if (input.colorTheme) {
    parts.push('## COLORS (MANDATORY)');
    parts.push('Use this color theme:');
    parts.push('- Primary: ' + input.colorTheme.primary);
    parts.push('- Secondary: ' + input.colorTheme.secondary);
    parts.push('- Accent: ' + input.colorTheme.accent);
    parts.push('- Background: ' + input.colorTheme.background);
    parts.push('- Text: ' + input.colorTheme.text);
  } else if (input.customHex) {
    parts.push('## COLORS');
    parts.push('User primary color: ' + input.customHex);
    parts.push('Derive a professional palette from this color.');
  } else {
    parts.push('## COLORS');
    parts.push('Choose a professional color palette that matches the design style and content tone.');
  }
  parts.push('');

  // Content type
  if (input.contentType !== 'auto') {
    parts.push('## CONTENT TYPE');
    parts.push('Treat this as a ' + input.contentType.toUpperCase() + ' format.');
  }
  parts.push('');

  // Slide numbers
  if (input.showSlideNumbers) {
    parts.push('## SLIDE NUMBERS');
    parts.push('Include subtle slide numbers in bottom-right corner of each slide.');
  }
  parts.push('');

  // User content
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('# CONTENT TO DESIGN');
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('');
  parts.push(input.content);
  parts.push('');
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('IMPORTANT: Return ONLY valid JSON. No markdown, no explanations.');
  parts.push('═══════════════════════════════════════════════════════════════');

  return parts.join('\n');
};

export const analyzePresentationDesign = async (
  input: PresentationInput,
  apiKey: string
): Promise<PresentationAnalysis> => {
  const prompt = getPresentationPrompt(input);

  if (apiState.currentProvider === 'claude') {
    return analyzePresentationWithClaude(prompt, apiKey);
  } else if (apiState.currentProvider === 'gemini') {
    return analyzePresentationWithGemini(prompt, apiKey);
  } else {
    return analyzePresentationWithOpenAI(prompt, apiKey);
  }
};

export const analyzePresentationWithClaude = async (prompt: string, apiKey: string): Promise<PresentationAnalysis> => {
  const content: any[] = [{ type: 'text', text: prompt }];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: apiState.claudeModel,
      max_tokens: 16000,
      messages: [{ role: 'user', content: content }],
    }),
    signal: presentationState.abortController?.signal,
  });

  if (!response.ok) throw new Error('API request failed: ' + response.status);
  const data: any = await response.json();
  const textContent = data.content.find((c: any) => c.type === 'text');
  if (!textContent) throw new Error('No text response from API');
  return parsePresentationResponse(textContent.text);
};

export const analyzePresentationWithGemini = async (prompt: string, apiKey: string): Promise<PresentationAnalysis> => {
  const model = imageGenState.geminiModel || 'gemini-3.1-pro-preview';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 65536,
        responseMimeType: 'application/json',
        temperature: 0,
      },
    }),
    signal: presentationState.abortController?.signal,
  });

  if (!response.ok) throw new Error('API request failed: ' + response.status);
  const data: any = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No text response from API');
  return parsePresentationResponse(text);
};

export const analyzePresentationWithOpenAI = async (prompt: string, apiKey: string): Promise<PresentationAnalysis> => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: apiState.openaiModel,
      max_tokens: 16000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: presentationState.abortController?.signal,
  });

  if (!response.ok) throw new Error('API request failed: ' + response.status);
  const data: any = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No text response from API');
  return parsePresentationResponse(text);
};

export const parsePresentationResponse = (responseText: string): PresentationAnalysis => {
  // Try to extract JSON from potential markdown code blocks
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonStr = jsonMatch ? jsonMatch[1].trim() : responseText;

  // Find the JSON object
  const startIdx = jsonStr.indexOf('{');
  const endIdx = jsonStr.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('No valid JSON found in response');
  }

  jsonStr = jsonStr.substring(startIdx, endIdx + 1);
  const parsed = JSON.parse(jsonStr);

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    throw new Error('Invalid presentation structure: missing slides array');
  }

  return parsed as PresentationAnalysis;
};
