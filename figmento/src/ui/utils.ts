import { dom } from './state';

// ═══════════════════════════════════════════════════════════════
// MESSAGING
// ═══════════════════════════════════════════════════════════════

export function postMessage(message: any): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

// ═══════════════════════════════════════════════════════════════
// HTML ESCAPING
// ═══════════════════════════════════════════════════════════════

export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

export function showToast(
  message: string,
  type: 'error' | 'success' | 'warning' = 'error',
  duration = 4000,
  retryCallback?: () => void
): void {
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;

  let iconSvg = '';
  if (type === 'error') {
    iconSvg =
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else if (type === 'success') {
    iconSvg =
      '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  } else {
    iconSvg =
      '<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  }

  toast.innerHTML =
    '<span class="toast-icon">' +
    iconSvg +
    '</span>' +
    '<span class="toast-message">' +
    escapeHtml(message) +
    '</span>' +
    '<button class="toast-close"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';

  if (dom.toastContainer) {
    dom.toastContainer.appendChild(toast);
  }

  if (retryCallback && type === 'error') {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'toast-retry';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => { hideToast(toast); retryCallback(); });
    toast.appendChild(retryBtn);
  }

  const closeBtn = toast.querySelector('.toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => hideToast(toast));
  }

  setTimeout(() => hideToast(toast), retryCallback ? 8000 : duration);
}

export function hideToast(toast: HTMLElement): void {
  toast.classList.add('hiding');
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 200);
}

// ═══════════════════════════════════════════════════════════════
// IMAGE COMPRESSION
// ═══════════════════════════════════════════════════════════════

export function compressImage(base64: string, maxWidth: number, maxHeight: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      console.warn('Image compression failed, using original');
      resolve(base64);
    };
    img.src = base64;
  });
}

// ═══════════════════════════════════════════════════════════════
// FETCH WITH RETRY
// ═══════════════════════════════════════════════════════════════

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  timeoutMs = 120000
): Promise<Response> {
  const userSignal = options.signal || null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    if (userSignal) {
      if (userSignal.aborted) {
        clearTimeout(timeoutId);
        throw new DOMException('Aborted', 'AbortError');
      }
      userSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        timeoutController.abort();
      });
    }

    const fetchOpts = Object.assign({}, options, { signal: timeoutController.signal });

    try {
      const response = await fetch(url, fetchOpts);
      clearTimeout(timeoutId);

      if (!response.ok && attempt < maxRetries && response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        showToast('Request failed, retrying in ' + delay / 1000 + 's...', 'warning', delay);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError' && userSignal && userSignal.aborted) {
        throw error;
      }

      if (error.name === 'AbortError') {
        if (attempt < maxRetries) {
          showToast('Request timed out, retrying (attempt ' + attempt + '/' + maxRetries + ')...', 'warning', 3000);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw new Error(
          'Request timed out after ' +
            timeoutMs / 1000 +
            ' seconds. The image may be too complex — try cropping to a smaller area.'
        );
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        showToast('Network error, retrying in ' + delay / 1000 + 's...', 'warning', delay);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw error;
    }
  }

  // Should never reach here, but TypeScript needs a return
  throw new Error('fetchWithRetry: all attempts exhausted');
}

// ═══════════════════════════════════════════════════════════════
// DEBOUNCE
// ═══════════════════════════════════════════════════════════════

export function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  return function (this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      func.apply(this, args);
    }, wait) as unknown as number;
  };
}

// ═══════════════════════════════════════════════════════════════
// LOCAL STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage not available in Figma iframe
  }
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENER CLEANUP
// ═══════════════════════════════════════════════════════════════

interface TrackedListener {
  target: EventTarget;
  event: string;
  handler: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}

const trackedListeners: TrackedListener[] = [];

/**
 * Registers an event listener and tracks it for later cleanup.
 * Use this for listeners that should be removed when the plugin
 * re-initializes, to prevent duplicate handlers and memory leaks.
 */
export function addCleanableListener(
  target: EventTarget,
  event: string,
  handler: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
): void {
  target.addEventListener(event, handler, options);
  trackedListeners.push({ target, event, handler, options });
}

/**
 * Removes all tracked event listeners and clears the registry.
 * Call this before re-initializing the plugin to avoid duplicate
 * listeners and memory leaks.
 */
export function cleanupAllListeners(): void {
  for (const entry of trackedListeners) {
    entry.target.removeEventListener(entry.event, entry.handler, entry.options);
  }
  trackedListeners.length = 0;
}
