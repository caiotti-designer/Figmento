import { screenshotState, apiState, dom, MAX_IMAGE_SIZE, MAX_IMAGE_DIMENSION } from './state';
import { postMessage, compressImage, showToast } from './utils';
import { analyzeImageStreaming } from './api';
import { fetchAllIcons } from './icons';
import { generateImagesForPlaceholders } from './images';
import { classifyError, CancelledError } from './errors';
import { generateCacheKey, getCachedResponse, setCachedResponse } from './cache';
import { imageGenState, designSettings } from './state';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface QueueItem {
  id: string;
  imageBase64: string;
  fileName: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMessage?: string;
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const batchState = {
  queue: [] as QueueItem[],
  isProcessing: false,
  currentIndex: -1,
};

// ═══════════════════════════════════════════════════════════════
// DESIGN CREATION COMPLETION CALLBACK
// ═══════════════════════════════════════════════════════════════

let resolveDesignCreated: (() => void) | null = null;

export const notifyDesignCreated = (): void => {
  if (resolveDesignCreated) {
    resolveDesignCreated();
    resolveDesignCreated = null;
  }
};

// ═══════════════════════════════════════════════════════════════
// UNIQUE ID GENERATOR
// ═══════════════════════════════════════════════════════════════

const generateId = (): string => {
  return 'batch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
};

// ═══════════════════════════════════════════════════════════════
// QUEUE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

export const addToQueue = (files: FileList): void => {
  const fileArray = Array.from(files);

  let loaded = 0;

  const onFileLoaded = (): void => {
    loaded++;
    if (loaded === fileArray.length) {
      renderQueueUI();
    }
  };

  for (const file of fileArray) {
    if (!file.type.startsWith('image/')) {
      onFileLoaded();
      continue;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target && (e.target.result as string);
      if (base64) {
        const item: QueueItem = {
          id: generateId(),
          imageBase64: base64,
          fileName: file.name,
          status: 'pending',
        };
        batchState.queue.push(item);
      }
      onFileLoaded();
    };
    reader.onerror = () => {
      onFileLoaded();
    };
    reader.readAsDataURL(file);
  }
};

export const removeFromQueue = (id: string): void => {
  batchState.queue = batchState.queue.filter((item) => item.id !== id);
  renderQueueUI();
};

export const clearQueue = (): void => {
  batchState.queue = [];
  batchState.isProcessing = false;
  batchState.currentIndex = -1;
  renderQueueUI();
};

export const getQueueLength = (): number => {
  return batchState.queue.length;
};

// ═══════════════════════════════════════════════════════════════
// BATCH PROCESSING
// ═══════════════════════════════════════════════════════════════

export const startBatchProcessing = async (): Promise<void> => {
  const apiKey = apiState.savedApiKeys[apiState.currentProvider];
  if (!apiKey) {
    showToast('Please configure your API key first', 'error');
    return;
  }

  const pendingItems = batchState.queue.filter((item) => item.status === 'pending');
  if (pendingItems.length === 0) {
    showToast('No pending items in the queue', 'warning');
    return;
  }

  batchState.isProcessing = true;

  for (let i = 0; i < batchState.queue.length; i++) {
    const item = batchState.queue[i];
    if (item.status !== 'pending') continue;
    if (!batchState.isProcessing) break;

    batchState.currentIndex = i;
    item.status = 'processing';
    renderQueueUI();

    try {
      // Set the current image for processing
      screenshotState.currentImageBase64 = item.imageBase64;
      screenshotState.isProcessing = true;
      apiState.abortController = new AbortController();

      // Compress if needed
      let optimizedBase64 = item.imageBase64;
      const base64Length = item.imageBase64.length * 0.75;
      if (base64Length > MAX_IMAGE_SIZE) {
        optimizedBase64 = await compressImage(item.imageBase64, MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, 0.92);
      }

      if (!batchState.isProcessing) throw new CancelledError();

      // Check cache
      const cacheKey = generateCacheKey(optimizedBase64, apiState.currentProvider, {
        font: designSettings.selectedFontFamily,
        brandColors: designSettings.brandColors,
        grid: designSettings.enableGridSystem,
      });

      let analysis = getCachedResponse(cacheKey);
      if (!analysis) {
        // Analyze image
        analysis = await analyzeImageStreaming(
          optimizedBase64,
          apiState.currentProvider,
          apiKey,
          () => {} // No progress UI for batch items
        );
        if (analysis && analysis.elements) {
          setCachedResponse(cacheKey, analysis);
        }
      }

      if (!batchState.isProcessing) throw new CancelledError();

      if (!analysis || !analysis.elements) {
        throw new Error('Invalid response from AI');
      }

      // Fetch icons
      const analysisWithIcons = await fetchAllIcons(analysis);
      if (!batchState.isProcessing) throw new CancelledError();

      // Generate images if enabled
      let analysisComplete = analysisWithIcons;
      if (imageGenState.enableImageGeneration) {
        analysisComplete = await generateImagesForPlaceholders(
          analysisWithIcons,
          apiKey,
          () => {} // No progress UI for batch items
        );
      }

      if (!batchState.isProcessing) throw new CancelledError();

      // Create design and wait for completion
      await new Promise<void>((resolve) => {
        resolveDesignCreated = resolve;
        postMessage({ type: 'create-design', data: analysisComplete });
      });

      item.status = 'done';
      renderQueueUI();
    } catch (error: unknown) {
      if (!batchState.isProcessing) {
        item.status = 'pending';
        renderQueueUI();
        break;
      }

      const classified = classifyError(error);

      if (classified instanceof CancelledError) {
        item.status = 'pending';
        renderQueueUI();
        break;
      }

      item.status = 'error';
      item.errorMessage = classified.message;
      renderQueueUI();
      // Continue to next item
    }
  }

  batchState.isProcessing = false;
  batchState.currentIndex = -1;
  screenshotState.isProcessing = false;
  apiState.abortController = null;

  const doneCount = batchState.queue.filter((item) => item.status === 'done').length;
  const errorCount = batchState.queue.filter((item) => item.status === 'error').length;

  if (doneCount > 0 || errorCount > 0) {
    const message = 'Batch complete: ' + doneCount + ' done' + (errorCount > 0 ? ', ' + errorCount + ' errors' : '');
    showToast(message, errorCount > 0 ? 'warning' : 'success');
  }
};

export const cancelBatchProcessing = (): void => {
  batchState.isProcessing = false;

  if (apiState.abortController) {
    apiState.abortController.abort();
    apiState.abortController = null;
  }

  screenshotState.isProcessing = false;
  showToast('Batch processing cancelled', 'warning');
  renderQueueUI();
};

// ═══════════════════════════════════════════════════════════════
// QUEUE UI RENDERING
// ═══════════════════════════════════════════════════════════════

export const renderQueueUI = (): void => {
  if (!dom.batchPanel || !dom.batchList || !dom.batchProcessBtn) return;

  if (batchState.queue.length === 0) {
    dom.batchPanel.style.display = 'none';
    return;
  }

  dom.batchPanel.style.display = 'block';

  // Update process button text
  const pendingCount = batchState.queue.filter((item) => item.status === 'pending').length;
  if (batchState.isProcessing) {
    dom.batchProcessBtn.textContent = 'Processing...';
    dom.batchProcessBtn.disabled = true;
  } else {
    dom.batchProcessBtn.textContent = 'Process All (' + pendingCount + ')';
    dom.batchProcessBtn.disabled = pendingCount === 0;
  }

  // Render queue items
  dom.batchList.innerHTML = '';

  for (const item of batchState.queue) {
    const row = document.createElement('div');
    row.style.cssText =
      'display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: var(--color-bg-elevated); border-radius: var(--radius-sm); font-size: 12px;';

    // Thumbnail
    const thumb = document.createElement('img');
    thumb.src = item.imageBase64;
    thumb.style.cssText = 'width: 32px; height: 32px; object-fit: cover; border-radius: 4px; flex-shrink: 0;';
    row.appendChild(thumb);

    // Filename
    const nameEl = document.createElement('span');
    nameEl.textContent = item.fileName;
    nameEl.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-secondary);';
    row.appendChild(nameEl);

    // Status indicator
    const statusEl = document.createElement('span');
    statusEl.style.cssText = 'flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 18px; height: 18px;';

    if (item.status === 'pending') {
      statusEl.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: var(--color-text-tertiary);"></span>';
      statusEl.title = 'Pending';
    } else if (item.status === 'processing') {
      statusEl.innerHTML =
        '<span style="width: 14px; height: 14px; border: 2px solid transparent; border-top-color: var(--color-primary); border-radius: 50; animation: spin 0.8s linear infinite;"></span>';
      statusEl.title = 'Processing';
    } else if (item.status === 'done') {
      statusEl.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      statusEl.title = 'Done';
    } else if (item.status === 'error') {
      statusEl.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      statusEl.title = item.errorMessage || 'Error';
    }

    row.appendChild(statusEl);

    // Remove button (only for pending items)
    if (item.status === 'pending') {
      const removeBtn = document.createElement('button');
      removeBtn.style.cssText =
        'background: none; border: none; cursor: pointer; padding: 2px; opacity: 0.5; display: flex; align-items: center;';
      removeBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      removeBtn.title = 'Remove';
      const itemId = item.id;
      removeBtn.addEventListener('click', () => {
        removeFromQueue(itemId);
      });
      row.appendChild(removeBtn);
    }

    dom.batchList.appendChild(row);
  }
};
