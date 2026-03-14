/// <reference types="@figma/plugin-typings" />

import type { UIElement } from '../types';

/**
 * Counts total elements recursively for progress tracking
 */
export function countElements(elements: UIElement[]): number {
  let count = 0;
  for (let i = 0; i < elements.length; i++) {
    count++;
    const children = elements[i].children;
    if (children && children.length > 0) {
      count += countElements(children);
    }
  }
  return count;
}

/**
 * Sends progress update to UI
 */
export function sendProgress(message: string, current: number, total: number) {
  figma.ui.postMessage({
    type: 'progress',
    message: message,
    current: current,
    total: total,
  });
}

/**
 * Small delay for visual feedback
 */
export function delay(ms: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}
