// ═══════════════════════════════════════════════════════════════
// FIGMA MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════

import { addCleanableListener } from './utils';

export interface MessageCallbacks {
  onSelectedImage: (data: any) => void;
  onProgress: (msg: string, current: number, total: number) => void;
  onApiKeysLoaded: (keys: Record<string, string>, validated: Record<string, boolean>) => void;
  onTemplateScanResult: (result: any, error?: string) => void;
  onTemplateApplyResult: (success: boolean, slidesUpdated: number, errors?: string[]) => void;
  onSlideStyleResult: (style: any, error?: string) => void;
  onAddSlideComplete: () => void;
  onAddSlideError: (error: string) => void;
}

const handleFigmaMessage = (event: MessageEvent, callbacks: MessageCallbacks): void => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === 'selected-image') {
    if (msg.error) {
      console.error(msg.error);
    } else if (msg.imageData) {
      callbacks.onSelectedImage({
        imageData: msg.imageData,
        width: msg.width,
        height: msg.height,
      });
    }
  } else if (msg.type === 'progress') {
    callbacks.onProgress(msg.message, msg.current, msg.total);
  } else if (msg.type === 'api-keys-loaded') {
    callbacks.onApiKeysLoaded(msg.keys || {}, msg.validated || {});
  } else if (msg.type === 'template-scan-result') {
    callbacks.onTemplateScanResult(msg.result, msg.error);
  } else if (msg.type === 'template-apply-result') {
    callbacks.onTemplateApplyResult(msg.success, msg.slidesUpdated, msg.errors);
  } else if (msg.type === 'slide-style-result') {
    callbacks.onSlideStyleResult(msg.style, msg.error);
  } else if (msg.type === 'add-slide-complete') {
    callbacks.onAddSlideComplete();
  } else if (msg.type === 'add-slide-error') {
    callbacks.onAddSlideError(msg.error);
  }
};

/**
 * Registers the Figma message event listener with late-bound callbacks.
 * This avoids circular dependency issues since message handling depends
 * on functions from many other modules.
 */
export const initMessageHandler = (callbacks: MessageCallbacks): void => {
  addCleanableListener(window, 'message', ((event: MessageEvent) => {
    handleFigmaMessage(event, callbacks);
  }) as EventListener);
};
