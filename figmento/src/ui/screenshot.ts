import {
  dom,
  screenshotState,
  cropState,
  apiState,
  progressState,
  modeState,
  MAX_IMAGE_SIZE,
  MAX_IMAGE_DIMENSION,
} from './state';
import { postMessage, showToast, compressImage, computeToolCallProgress, toolNameToProgressMessage } from './utils';
import { classifyError, CancelledError } from './errors';
import { openSettings, showValidationStatus, closeSettings } from './settings';
import { buildSystemPrompt } from './system-prompt';
import { FIGMENTO_TOOLS } from './tools-schema';
import {
  runToolUseLoop,
  ToolCallResult,
  AnthropicMessage,
  GeminiContent,
  ContentBlock,
  SCREENSHOT_TOOLS,
  stripBase64FromResult,
  summarizeScreenshotResult,
} from './tool-use-loop';

// ═══════════════════════════════════════════════════════════════
// PENDING-COMMAND BRIDGE  (mirrors chat.ts's sendCommandToSandbox)
// ═══════════════════════════════════════════════════════════════

interface PendingScreenshotCommand {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

let screenshotCommandCounter = 0;
const pendingScreenshotCommands = new Map<string, PendingScreenshotCommand>();

/**
 * Sends a tool command to the Figma sandbox and returns a promise that
 * resolves when the sandbox replies. Uses the 'screenshot-' cmdId prefix
 * so index.ts can route the response to resolveScreenshotCommand.
 */
function sendScreenshotCommand(action: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const cmdId = `screenshot-${++screenshotCommandCounter}-${Date.now()}`;

    const timer = setTimeout(() => {
      pendingScreenshotCommands.delete(cmdId);
      reject(new Error(`Command timeout: ${action}`));
    }, 30000);

    pendingScreenshotCommands.set(cmdId, {
      resolve: (data) => { clearTimeout(timer); resolve(data); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });

    postMessage({
      type: 'execute-command',
      command: {
        type: 'command',
        id: cmdId,
        channel: 'screenshot',
        action,
        params,
      },
    });
  });
}

/**
 * Resolves a pending screenshot command response.
 * Called by index.ts onCommandResult when cmdId starts with 'screenshot-'.
 */
export function resolveScreenshotCommand(
  cmdId: string,
  success: boolean,
  data: Record<string, unknown>,
  error?: string,
): void {
  const pending = pendingScreenshotCommands.get(cmdId);
  if (!pending) return;
  pendingScreenshotCommands.delete(cmdId);
  if (success) {
    pending.resolve(data);
  } else {
    pending.reject(new Error(error || 'Command failed'));
  }
}

// ═══════════════════════════════════════════════════════════════
// SCREENSHOT ANALYSIS — VISION MESSAGE BUILDERS
// ═══════════════════════════════════════════════════════════════

const SCREENSHOT_INSTRUCTION = `You are recreating a UI design in Figma from the provided screenshot.

Analyze the screenshot carefully:
- Identify the overall layout structure (frames, sections, containers)
- Note the color scheme (backgrounds, text colors, accent colors)
- Identify typography (font sizes, weights, text hierarchy)
- Identify key UI elements (buttons, cards, navigation, images, icons)

Then recreate the design using the available tools:
1. Start with the root frame — set appropriate dimensions based on the screenshot layout
2. Add elements top-down, most important first (headlines, containers, then details)
3. Use set_auto_layout for containers whenever possible
4. Match colors as closely as possible using set_fill and set_stroke
5. Recreate text content faithfully with correct font sizes and weights
6. If there are icons, use create_icon with the closest matching Lucide icon name
7. End with run_refinement_check if you created 5 or more elements

Do NOT return any JSON or text description — call the design tools directly to build the design.`;

/**
 * Builds the initial messages array for runToolUseLoop with the screenshot
 * as a vision content block in the correct format for the given provider.
 */
function buildScreenshotInitialMessages(
  imageBase64: string,
  provider: 'claude' | 'gemini' | 'openai',
): AnthropicMessage[] | GeminiContent[] | Array<Record<string, unknown>> {
  // Extract MIME type and raw base64 from data URL
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match ? match[1] : 'image/png';
  const rawBase64 = match ? match[2] : imageBase64;

  if (provider === 'gemini') {
    const messages: GeminiContent[] = [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: rawBase64 } } as Record<string, unknown> as any,
        { text: SCREENSHOT_INSTRUCTION },
      ],
    }];
    return messages;
  }

  if (provider === 'openai') {
    return [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageBase64 } },
        { type: 'text', text: SCREENSHOT_INSTRUCTION },
      ],
    }];
  }

  // Anthropic (claude)
  const messages: AnthropicMessage[] = [{
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: mimeType, data: rawBase64 },
      } as unknown as ContentBlock,
      { type: 'text', text: SCREENSHOT_INSTRUCTION } as ContentBlock,
    ],
  }];
  return messages;
}

/** Map apiState.currentProvider to runToolUseLoop provider string. */
function getScreenshotProvider(): 'claude' | 'gemini' | 'openai' {
  const p = apiState.currentProvider as string;
  if (p === 'gemini') return 'gemini';
  if (p === 'openai') return 'openai';
  return 'claude';
}

/** Get the active model string for the current provider. */
function getScreenshotModel(): string {
  const p = apiState.currentProvider as string;
  if (p === 'gemini') return apiState.geminiModel;
  if (p === 'openai') return apiState.openaiModel;
  return apiState.claudeModel;
}

// ═══════════════════════════════════════════════════════════════
// STEP NAVIGATION
// ═══════════════════════════════════════════════════════════════

export const goToStep = (step: number): void => {
  const previousStep = screenshotState.currentStep;
  screenshotState.currentStep = step;

  // Update step indicators
  document.querySelectorAll('.step').forEach((stepEl) => {
    const stepNum = parseInt((stepEl as HTMLElement).getAttribute('data-step') || '0');
    stepEl.classList.remove('active', 'completed');
    stepEl.removeAttribute('aria-current');

    if (stepNum < step) {
      stepEl.classList.add('completed');
      // Replace number with checkmark
      const numberEl = stepEl.querySelector('.step-number');
      if (numberEl && !numberEl.querySelector('svg')) {
        numberEl.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
      }
    } else if (stepNum === step) {
      stepEl.classList.add('active');
      stepEl.setAttribute('aria-current', 'step');
      // Restore number
      const numberEl = stepEl.querySelector('.step-number');
      if (numberEl) {
        numberEl.textContent = String(stepNum);
      }
    } else {
      // Restore number for future steps
      const numberEl = stepEl.querySelector('.step-number');
      if (numberEl) {
        numberEl.textContent = String(stepNum);
      }
    }
  });

  // Update step lines
  const stepLines = document.querySelectorAll('.step-line');
  stepLines.forEach((line, index) => {
    if (index < step - 1) {
      line.classList.add('completed');
    } else {
      line.classList.remove('completed');
    }
  });

  // Update step views with transition direction
  const stepViews = ['step-upload', 'step-crop', 'step-processing'];
  stepViews.forEach((viewId, index) => {
    const view = document.getElementById(viewId);
    if (!view) return;

    view.classList.remove('active', 'exit-left');

    if (index + 1 === step) {
      view.classList.add('active');
    } else if (index + 1 < step) {
      view.classList.add('exit-left');
    }
  });

  // Setup crop view when entering step 2
  if (step === 2 && previousStep === 1) {
    setupCropView();
  }

  // Setup processing view when entering step 3
  if (step === 3) {
    setupProcessingView();
  }
};

// ═══════════════════════════════════════════════════════════════
// STEP 1: UPLOAD
// ═══════════════════════════════════════════════════════════════

export const handleImagePaste = (e: ClipboardEvent): void => {
  // Prevent double handling from window and document listeners
  if (screenshotState.pasteHandled) {
    screenshotState.pasteHandled = false;
    return;
  }

  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;

  // Look for image in clipboard
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image/') === 0) {
      const blob = items[i].getAsFile();
      if (blob) {
        screenshotState.pasteHandled = true;
        e.preventDefault();
        e.stopPropagation();

        // Close settings if open and go to step 1
        if (dom.settingsPanel?.classList.contains('open')) {
          closeSettings();
        }
        if (screenshotState.currentStep !== 1) {
          goToStep(1);
        }

        handleImageFile(blob);
      }
      return;
    }
  }

  // If no image found, let the paste happen normally for text
};

export const handleImageFile = (file: File | Blob): void => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target && (e.target.result as string);
    if (!base64) return;

    const img = new Image();
    img.onload = () => {
      screenshotState.currentImageBase64 = base64;
      screenshotState.imageWidth = img.width;
      screenshotState.imageHeight = img.height;

      if (base64) showImagePreview(base64);
    };
    img.onerror = () => {
      console.error('Failed to load image');
    };
    img.src = base64;
  };
  reader.onerror = () => {
    console.error('Failed to read file');
  };
  reader.readAsDataURL(file);
};

export const showImagePreview = (base64: string): void => {
  if (!dom.previewImage || !dom.dropZone || !dom.dropZonePreview || !dom.dropZoneChange || !dom.nextToCropBtn) return;

  dom.previewImage.src = base64;
  dom.dropZone.classList.add('has-image');
  dom.dropZonePreview.classList.remove('hidden');
  dom.dropZoneChange.classList.remove('hidden');

  // Hide the upload icon/text
  const icon = dom.dropZone.querySelector('.drop-zone-icon') as HTMLElement;
  const text = dom.dropZone.querySelector('.drop-zone-text') as HTMLElement;
  const hint = dom.dropZone.querySelector('.drop-zone-hint') as HTMLElement;
  if (icon) icon.style.display = 'none';
  if (text) text.style.display = 'none';
  if (hint) hint.style.display = 'none';

  dom.nextToCropBtn.disabled = false;
};

// ═══════════════════════════════════════════════════════════════
// STEP 2: CROP
// ═══════════════════════════════════════════════════════════════

export const setupCropView = (): void => {
  if (!screenshotState.currentImageBase64 || !dom.cropImage) return;

  dom.cropImage.src = screenshotState.currentImageBase64;
  dom.cropImage.onload = () => {
    if (!dom.cropImage) return;

    // Get displayed size
    cropState.displayedImageWidth = dom.cropImage.offsetWidth;
    cropState.displayedImageHeight = dom.cropImage.offsetHeight;

    // Initialize crop selection to full image
    cropState.cropX = 0;
    cropState.cropY = 0;
    cropState.cropWidth = cropState.displayedImageWidth;
    cropState.cropHeight = cropState.displayedImageHeight;

    updateCropSelection();
  };
};

export const setupCropListeners = (): void => {
  if (!dom.cropSelection) return;

  // Handle drag on selection box (move)
  dom.cropSelection.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).classList.contains('crop-handle')) return;

    cropState.isDragging = true;
    cropState.dragType = 'move';
    cropState.dragStartX = e.clientX;
    cropState.dragStartY = e.clientY;
    cropState.dragStartCropX = cropState.cropX;
    cropState.dragStartCropY = cropState.cropY;
    e.preventDefault();
  });

  // Handle drag on handles (resize)
  dom.cropSelection.querySelectorAll('.crop-handle').forEach((handle) => {
    handle.addEventListener('mousedown', (e) => {
      const mouseEvent = e as MouseEvent;
      cropState.isDragging = true;
      cropState.dragType = (handle as HTMLElement).getAttribute('data-handle');
      cropState.dragStartX = mouseEvent.clientX;
      cropState.dragStartY = mouseEvent.clientY;
      cropState.dragStartCropX = cropState.cropX;
      cropState.dragStartCropY = cropState.cropY;
      cropState.dragStartCropW = cropState.cropWidth;
      cropState.dragStartCropH = cropState.cropHeight;
      e.preventDefault();
      e.stopPropagation();
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (!cropState.isDragging || !cropState.dragType) return;

    const dx = e.clientX - cropState.dragStartX;
    const dy = e.clientY - cropState.dragStartY;
    const minSize = 20;

    if (cropState.dragType === 'move') {
      cropState.cropX = Math.max(
        0,
        Math.min(cropState.displayedImageWidth - cropState.cropWidth, cropState.dragStartCropX + dx)
      );
      cropState.cropY = Math.max(
        0,
        Math.min(cropState.displayedImageHeight - cropState.cropHeight, cropState.dragStartCropY + dy)
      );
    } else {
      // Handle resize based on which handle
      if (cropState.dragType.indexOf('n') !== -1) {
        const newY = cropState.dragStartCropY + dy;
        const newH = cropState.dragStartCropH - dy;
        if (newH >= minSize && newY >= 0) {
          cropState.cropY = newY;
          cropState.cropHeight = newH;
        }
      }
      if (cropState.dragType.indexOf('s') !== -1) {
        const newH = cropState.dragStartCropH + dy;
        if (newH >= minSize && cropState.cropY + newH <= cropState.displayedImageHeight) {
          cropState.cropHeight = newH;
        }
      }
      if (cropState.dragType.indexOf('w') !== -1) {
        const newX = cropState.dragStartCropX + dx;
        const newW = cropState.dragStartCropW - dx;
        if (newW >= minSize && newX >= 0) {
          cropState.cropX = newX;
          cropState.cropWidth = newW;
        }
      }
      if (cropState.dragType.indexOf('e') !== -1) {
        const newW = cropState.dragStartCropW + dx;
        if (newW >= minSize && cropState.cropX + newW <= cropState.displayedImageWidth) {
          cropState.cropWidth = newW;
        }
      }
    }

    updateCropSelection();
  });

  document.addEventListener('mouseup', () => {
    cropState.isDragging = false;
    cropState.dragType = null;
  });
};

export const updateCropSelection = (): void => {
  if (!dom.cropSelection || !dom.cropDimensions) return;

  dom.cropSelection.style.left = cropState.cropX + 'px';
  dom.cropSelection.style.top = cropState.cropY + 'px';
  dom.cropSelection.style.width = cropState.cropWidth + 'px';
  dom.cropSelection.style.height = cropState.cropHeight + 'px';

  // Calculate actual image dimensions
  const scaleX = screenshotState.imageWidth / cropState.displayedImageWidth;
  const scaleY = screenshotState.imageHeight / cropState.displayedImageHeight;
  const actualWidth = Math.round(cropState.cropWidth * scaleX);
  const actualHeight = Math.round(cropState.cropHeight * scaleY);

  dom.cropDimensions.textContent = actualWidth + ' \u00d7 ' + actualHeight;
};

export const getCroppedImage = (): Promise<string> => {
  return new Promise((resolve) => {
    if (!screenshotState.currentImageBase64) {
      resolve(screenshotState.currentImageBase64 || '');
      return;
    }

    // If crop is full image, return original
    if (
      cropState.cropX === 0 &&
      cropState.cropY === 0 &&
      cropState.cropWidth >= cropState.displayedImageWidth - 1 &&
      cropState.cropHeight >= cropState.displayedImageHeight - 1
    ) {
      resolve(screenshotState.currentImageBase64);
      return;
    }

    // Calculate actual crop coordinates
    const scaleX = screenshotState.imageWidth / cropState.displayedImageWidth;
    const scaleY = screenshotState.imageHeight / cropState.displayedImageHeight;
    const actualX = Math.round(cropState.cropX * scaleX);
    const actualY = Math.round(cropState.cropY * scaleY);
    const actualW = Math.round(cropState.cropWidth * scaleX);
    const actualH = Math.round(cropState.cropHeight * scaleY);

    // Create canvas and crop
    const canvas = document.createElement('canvas');
    canvas.width = actualW;
    canvas.height = actualH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(screenshotState.currentImageBase64);
      return;
    }

    const img = new Image();
    img.onload = () => {
      ctx!.drawImage(img, actualX, actualY, actualW, actualH, 0, 0, actualW, actualH);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      resolve(screenshotState.currentImageBase64 || '');
    };
    img.src = screenshotState.currentImageBase64;
  });
};

export const setAspectRatio = (ratio: string): void => {
  cropState.currentAspectRatio = ratio;

  // Update button states
  document.querySelectorAll('.aspect-btn').forEach((btn) => {
    const btnRatio = (btn as HTMLElement).getAttribute('data-ratio');
    if (btnRatio === ratio) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Apply aspect ratio to crop selection
  if (ratio === 'free' || !cropState.displayedImageWidth || !cropState.displayedImageHeight) {
    return;
  }

  let ratioValue = 1;
  if (ratio === '16:9') ratioValue = 16 / 9;
  else if (ratio === '9:16') ratioValue = 9 / 16;
  else if (ratio === '1:1') ratioValue = 1;
  else if (ratio === '4:3') ratioValue = 4 / 3;
  else if (ratio === '3:4') ratioValue = 3 / 4;

  // Calculate new crop dimensions maintaining ratio
  let newWidth = cropState.cropWidth;
  let newHeight = cropState.cropWidth / ratioValue;

  if (newHeight > cropState.displayedImageHeight) {
    newHeight = cropState.displayedImageHeight;
    newWidth = newHeight * ratioValue;
  }

  if (newWidth > cropState.displayedImageWidth) {
    newWidth = cropState.displayedImageWidth;
    newHeight = newWidth / ratioValue;
  }

  // Center the crop
  cropState.cropX = Math.max(0, (cropState.displayedImageWidth - newWidth) / 2);
  cropState.cropY = Math.max(0, (cropState.displayedImageHeight - newHeight) / 2);
  cropState.cropWidth = newWidth;
  cropState.cropHeight = newHeight;

  updateCropSelection();
};

// ═══════════════════════════════════════════════════════════════
// STEP 3: PROCESSING
// ═══════════════════════════════════════════════════════════════

export const setupProcessingView = async (): Promise<void> => {
  if (
    !dom.processingSuccess ||
    !dom.processingContainer ||
    !dom.processingProgressBar ||
    !dom.processingPercent ||
    !dom.processingImage
  )
    return;

  dom.processingSuccess.classList.remove('show');
  dom.processingContainer.style.display = 'flex';
  dom.processingProgressBar.style.width = '0%';
  dom.processingPercent.textContent = '0.00';

  const croppedBase64 = await getCroppedImage();
  dom.processingImage.src = croppedBase64;
};

export const startProcessing = async (): Promise<void> => {
  const provider = getScreenshotProvider();
  const apiKey = apiState.savedApiKeys[apiState.currentProvider];
  if (!apiKey) {
    openSettings();
    showValidationStatus('Please configure your API key', 'error');
    showToast('Please configure your API key first', 'error');
    goToStep(1);
    return;
  }

  screenshotState.isProcessing = true;
  apiState.abortController = new AbortController();
  progressState.currentProgress = 0;
  if (dom.startProcessingBtn) dom.startProcessingBtn.disabled = true;

  try {
    // Step 1: Preparing image (0% -> 5%)
    setProgress(0, 'Preparing image...');

    const croppedBase64 = await getCroppedImage();
    if (!screenshotState.isProcessing) throw new CancelledError();

    // Step 2: Optimizing image size (5% -> 10%)
    setProgress(5, 'Optimizing image size...');
    const base64Length = croppedBase64.length * 0.75;
    let optimizedBase64 = croppedBase64;
    if (base64Length > MAX_IMAGE_SIZE) {
      optimizedBase64 = await compressImage(croppedBase64, MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, 0.92);
    }
    if (!screenshotState.isProcessing) throw new CancelledError();

    // Step 3: AI recreates design tool-by-tool (10% -> 100%)
    setProgress(10, 'Analyzing screenshot...');

    const model = getScreenshotModel();
    const messages = buildScreenshotInitialMessages(optimizedBase64, provider);
    let toolCallCount = 0;

    await runToolUseLoop({
      provider,
      apiKey,
      model,
      systemPrompt: buildSystemPrompt(),
      tools: FIGMENTO_TOOLS,
      messages,
      onToolCall: async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
        try {
          const data = await sendScreenshotCommand(name, args);
          const content = SCREENSHOT_TOOLS.has(name)
            ? summarizeScreenshotResult(name, data)
            : JSON.stringify(stripBase64FromResult(data));
          return { content, is_error: false };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          return { content: msg, is_error: true };
        }
      },
      onProgress: (_message: string, toolName?: string) => {
        if (toolName) {
          toolCallCount++;
          const percent = computeToolCallProgress(toolCallCount);
          setProgress(percent, toolNameToProgressMessage(toolName, 'screenshot'));
        }
      },
      onTextChunk: () => { /* screenshot mode has no text output UI */ },
    });

    if (!screenshotState.isProcessing) return;

    setProgress(100, 'Complete!');
    setTimeout(() => showSuccess(), 500);

  } catch (error: unknown) {
    if (!screenshotState.isProcessing) return;

    const classified = classifyError(error);

    // Don't show toast for user-initiated cancellations
    if (classified instanceof CancelledError) {
      return;
    }

    stopSimulation();

    const retry = () => { goToStep(3); startProcessing(); };

    if (classified.code === 'TIMEOUT') {
      showToast(classified.message, 'error', 8000, retry);
    } else if (classified.code === 'PARSE_ERROR') {
      showToast(classified.message, 'error', 8000, retry);
    } else if (classified.code === 'TOKEN_LIMIT') {
      showToast(classified.message, 'error', 8000);
    } else if (classified.code === 'RATE_LIMIT') {
      showToast(classified.message, 'warning', 6000);
    } else {
      showToast(classified.message, 'error', 4000, retry);
    }
    console.error('Processing error:', classified.message);

    screenshotState.isProcessing = false;
    apiState.abortController = null;
    if (dom.startProcessingBtn) dom.startProcessingBtn.disabled = false;
    goToStep(2);
  }
};

export const setProgress = (percent: number, message?: string): void => {
  if (!dom.processingProgressBar || !dom.processingPercent || !dom.processingStatus) return;

  progressState.currentProgress = percent;
  dom.processingProgressBar.style.width = percent + '%';
  dom.processingPercent.textContent = percent.toFixed(2);

  if (message) {
    const statusText = dom.processingStatus.querySelector('.processing-message') as HTMLSpanElement;
    if (statusText) {
      statusText.textContent = message;
    }
  }
};

export const stopSimulation = (): void => {
  if (progressState.progressInterval !== null) {
    clearInterval(progressState.progressInterval);
    progressState.progressInterval = null;
  }
};

export const updateProcessingStatus = (message: string): void => {
  if (!dom.processingStatus) return;

  const statusText = dom.processingStatus.querySelector('.processing-message') as HTMLSpanElement;
  if (statusText) {
    statusText.textContent = message;
  }
};

export const cancelProcessing = (): void => {
  screenshotState.isProcessing = false;

  // Stop progress simulation
  stopSimulation();

  // Abort any pending fetch requests
  if (apiState.abortController) {
    apiState.abortController.abort();
    apiState.abortController = null;
  }

  showToast('Processing cancelled', 'warning');
  goToStep(2);
};

export const showSuccess = (): void => {
  if (!dom.processingContainer || !dom.processingSuccess) return;

  dom.processingContainer.style.display = 'none';
  dom.processingSuccess.classList.add('show');

  // Reset compare and feedback panels
  if (dom.comparePanel) dom.comparePanel.style.display = 'none';
  if (dom.feedbackGoodBtn) dom.feedbackGoodBtn.style.display = '';
  if (dom.feedbackBadBtn) dom.feedbackBadBtn.style.display = '';
  if (dom.feedbackThanks) dom.feedbackThanks.style.display = 'none';
};

export const toggleCompare = (): void => {
  if (!dom.comparePanel || !dom.compareImage) return;

  const isVisible = dom.comparePanel.style.display !== 'none';
  if (isVisible) {
    dom.comparePanel.style.display = 'none';
  } else {
    if (screenshotState.currentImageBase64) {
      dom.compareImage.src = screenshotState.currentImageBase64;
    }
    dom.comparePanel.style.display = 'block';
  }
};

export const submitFeedback = (rating: 'good' | 'bad'): void => {
  // Store feedback via Figma's clientStorage
  postMessage({
    type: 'save-feedback',
    data: {
      rating,
      provider: apiState.currentProvider,
      timestamp: Date.now(),
    },
  });

  // Show thank you message, hide buttons
  if (dom.feedbackGoodBtn) dom.feedbackGoodBtn.style.display = 'none';
  if (dom.feedbackBadBtn) dom.feedbackBadBtn.style.display = 'none';
  if (dom.feedbackThanks) dom.feedbackThanks.style.display = 'block';
};

export const resetToStart = (): void => {
  screenshotState.currentImageBase64 = null;
  screenshotState.imageWidth = 0;
  screenshotState.imageHeight = 0;
  screenshotState.isProcessing = false;

  if (
    !dom.dropZone ||
    !dom.dropZonePreview ||
    !dom.dropZoneChange ||
    !dom.previewImage ||
    !dom.nextToCropBtn ||
    !dom.fileInput
  )
    return;

  // Reset drop zone
  dom.dropZone.classList.remove('has-image');
  dom.dropZonePreview.classList.add('hidden');
  dom.dropZoneChange.classList.add('hidden');
  dom.previewImage.src = '';

  const icon = dom.dropZone.querySelector('.drop-zone-icon') as HTMLElement;
  const text = dom.dropZone.querySelector('.drop-zone-text') as HTMLElement;
  const hint = dom.dropZone.querySelector('.drop-zone-hint') as HTMLElement;
  if (icon) icon.style.display = '';
  if (text) text.style.display = '';
  if (hint) hint.style.display = '';

  dom.nextToCropBtn.disabled = true;
  dom.fileInput.value = '';

  goToStep(1);
};

/**
 * Callback for resetting template fill state.
 * Set this from the template module to avoid circular dependencies.
 */
export let onResetTemplateFill: (() => void) | null = null;
export let onCanLeaveAdAnalyzer: (() => boolean) | null = null;

export const setResetTemplateFillCallback = (callback: () => void): void => {
  onResetTemplateFill = callback;
};

export const setCanLeaveAdAnalyzerCallback = (callback: () => boolean): void => {
  onCanLeaveAdAnalyzer = callback;
};

export const goBackToHome = (): void => {
  if (screenshotState.isProcessing) {
    showToast('Cancel processing before navigating away', 'warning');
    return;
  }

  let activeFlow: HTMLElement | null;
  if (modeState.currentMode === 'screenshot-to-layout') {
    activeFlow = dom.screenshotFlow!;
  } else if (modeState.currentMode === 'text-to-layout') {
    activeFlow = dom.textLayoutFlow!;
  } else if (modeState.currentMode === 'text-to-presentation') {
    activeFlow = document.getElementById('presentationFlow') as HTMLDivElement;
  } else if (modeState.currentMode === 'hero-generator') {
    activeFlow = document.getElementById('heroGeneratorFlow') as HTMLDivElement;
  } else if (modeState.currentMode === 'ad-analyzer') {
    if (onCanLeaveAdAnalyzer && !onCanLeaveAdAnalyzer()) return;
    activeFlow = document.getElementById('adAnalyzerFlow') as HTMLDivElement;
  } else {
    activeFlow = document.getElementById('templateFillFlow') as HTMLDivElement;
  }

  if (!activeFlow) return;

  activeFlow.classList.add('flow-exit-reverse');

  setTimeout(() => {
    activeFlow.classList.add('hidden');
    activeFlow.classList.remove('flow-exit-reverse');

    resetToStart();
    if (modeState.currentMode === 'template-fill' && onResetTemplateFill) {
      onResetTemplateFill();
    }

    if (dom.modeSelector) {
      dom.modeSelector.classList.remove('hidden');
      dom.modeSelector.classList.add('mode-entrance');

      setTimeout(() => {
        dom.modeSelector!.classList.remove('mode-entrance');
      }, 300);
    }

    if (dom.backToHomeBtn) dom.backToHomeBtn.classList.add('hidden');
    if (dom.breadcrumb) dom.breadcrumb.classList.add('hidden');
  }, 200);
};

export const updateProgress = (message: string, current: number, total: number): void => {
  // This function receives progress from Figma sandbox for element creation
  // Map 0-100 from Figma to our 95-100 range
  let percent = 95;
  if (total > 0) {
    percent = 95 + (current / total) * 5;
  }

  if (message.indexOf('Complete!') === 0) {
    percent = 100;
    setProgress(100, 'Complete!');
    setTimeout(() => {
      showSuccess();
    }, 500);
  } else {
    setProgress(percent, 'Creating Figma elements (' + current + '/' + total + ')...');
  }
};

export const handleKeyboardShortcuts = (e: KeyboardEvent): void => {
  // Don't handle shortcuts when typing in input fields
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
    return;
  }

  // Escape - close settings or go back
  if (e.key === 'Escape') {
    if (dom.settingsPanel?.classList.contains('open')) {
      closeSettings();
    } else if (screenshotState.currentStep === 2) {
      goToStep(1);
    } else if (screenshotState.currentStep === 3 && screenshotState.isProcessing) {
      cancelProcessing();
    } else if (dom.modeSelector?.classList.contains('hidden') && screenshotState.currentStep === 1) {
      goBackToHome();
    }
    e.preventDefault();
  }

  // Enter - proceed to next step
  if (e.key === 'Enter') {
    if (
      screenshotState.currentStep === 1 &&
      screenshotState.currentImageBase64 &&
      dom.nextToCropBtn &&
      !dom.nextToCropBtn.disabled
    ) {
      goToStep(2);
      e.preventDefault();
    } else if (screenshotState.currentStep === 2) {
      goToStep(3);
      startProcessing();
      e.preventDefault();
    }
  }
};
