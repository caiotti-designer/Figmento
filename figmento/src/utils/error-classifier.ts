/// <reference types="@figma/plugin-typings" />

import type { CommandErrorCode } from '../types';

/** Classify an error message into a structured CommandErrorCode */
export function classifyError(message: string): { code: CommandErrorCode; recoverable: boolean } {
  const lower = message.toLowerCase();
  if (lower.includes('node not found') || lower.includes('not found:')) {
    return { code: 'NODE_NOT_FOUND', recoverable: false };
  }
  if (lower.includes('font') && (lower.includes('load') || lower.includes('fail') || lower.includes('timeout'))) {
    return { code: 'FONT_LOAD_FAILED', recoverable: true };
  }
  if (lower.includes('export') && lower.includes('fail')) {
    return { code: 'EXPORT_FAILED', recoverable: true };
  }
  if (lower.includes('cannot have children') || lower.includes('not a frame') || lower.includes('parent')) {
    return { code: 'PARENT_MISMATCH', recoverable: false };
  }
  if (lower.includes('decode') || lower.includes('image data') || lower.includes('createimage')) {
    return { code: 'IMAGE_DECODE_FAILED', recoverable: false };
  }
  if (lower.includes('timeout')) {
    return { code: 'TIMEOUT', recoverable: true };
  }
  if (lower.includes('required') || lower.includes('invalid') || lower.includes('cannot be empty')) {
    return { code: 'INVALID_PARAMS', recoverable: false };
  }
  return { code: 'UNKNOWN', recoverable: false };
}
