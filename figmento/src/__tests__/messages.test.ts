/**
 * @jest-environment jsdom
 */

// Mock the utils module to intercept addCleanableListener
const mockAddCleanableListener = jest.fn();
jest.mock('../ui/utils', () => ({
  addCleanableListener: mockAddCleanableListener,
}));

import type { MessageCallbacks } from '../ui/messages';
import { initMessageHandler } from '../ui/messages';

function createCallbacks(): MessageCallbacks & { [key: string]: jest.Mock } {
  return {
    onSelectedImage: jest.fn(),
    onProgress: jest.fn(),
    onApiKeysLoaded: jest.fn(),
  };
}

/**
 * Simulate a Figma plugin message by invoking the registered handler directly.
 * initMessageHandler registers via addCleanableListener, so we capture the handler
 * from the mock and invoke it with a synthetic MessageEvent.
 */
function simulateMessage(pluginMessage: any): void {
  const registeredHandler = mockAddCleanableListener.mock.calls[0][2] as (event: MessageEvent) => void;
  const event = new MessageEvent('message', {
    data: { pluginMessage },
  });
  registeredHandler(event);
}

// ═══════════════════════════════════════════════════════════════
// INIT & REGISTRATION
// ═══════════════════════════════════════════════════════════════

describe('initMessageHandler', () => {
  beforeEach(() => {
    mockAddCleanableListener.mockClear();
  });

  test('registers a window message listener via addCleanableListener', () => {
    const callbacks = createCallbacks();
    initMessageHandler(callbacks);

    expect(mockAddCleanableListener).toHaveBeenCalledTimes(1);
    expect(mockAddCleanableListener).toHaveBeenCalledWith(
      window,
      'message',
      expect.any(Function)
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// MESSAGE DISPATCHING
// ═══════════════════════════════════════════════════════════════

describe('message dispatching', () => {
  let callbacks: ReturnType<typeof createCallbacks>;

  beforeEach(() => {
    mockAddCleanableListener.mockClear();
    callbacks = createCallbacks();
    initMessageHandler(callbacks);
  });

  test('ignores events without pluginMessage', () => {
    const handler = mockAddCleanableListener.mock.calls[0][2] as (event: MessageEvent) => void;
    const event = new MessageEvent('message', { data: {} });
    handler(event);

    // None of the callbacks should have been called
    Object.values(callbacks).forEach((fn) => {
      expect(fn).not.toHaveBeenCalled();
    });
  });

  test('ignores events with null pluginMessage', () => {
    const handler = mockAddCleanableListener.mock.calls[0][2] as (event: MessageEvent) => void;
    const event = new MessageEvent('message', { data: { pluginMessage: null } });
    handler(event);

    Object.values(callbacks).forEach((fn) => {
      expect(fn).not.toHaveBeenCalled();
    });
  });

  // --- selected-image ---

  test('dispatches selected-image with imageData to onSelectedImage', () => {
    simulateMessage({
      type: 'selected-image',
      imageData: 'base64data',
      width: 800,
      height: 600,
    });

    expect(callbacks.onSelectedImage).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelectedImage).toHaveBeenCalledWith({
      imageData: 'base64data',
      width: 800,
      height: 600,
    });
  });

  test('selected-image with error does not call onSelectedImage', () => {
    simulateMessage({
      type: 'selected-image',
      error: 'No selection found',
    });

    expect(callbacks.onSelectedImage).not.toHaveBeenCalled();
  });

  // --- progress ---

  test('dispatches progress messages to onProgress', () => {
    simulateMessage({
      type: 'progress',
      message: 'Processing element 3 of 10',
      current: 3,
      total: 10,
    });

    expect(callbacks.onProgress).toHaveBeenCalledTimes(1);
    expect(callbacks.onProgress).toHaveBeenCalledWith('Processing element 3 of 10', 3, 10);
  });

  // --- api-keys-loaded ---

  test('dispatches api-keys-loaded to onApiKeysLoaded', () => {
    const keys = { claude: 'sk-ant-xxx', openai: 'sk-xxx' };
    const validated = { claude: true, openai: false };

    simulateMessage({
      type: 'api-keys-loaded',
      keys,
      validated,
    });

    expect(callbacks.onApiKeysLoaded).toHaveBeenCalledTimes(1);
    expect(callbacks.onApiKeysLoaded).toHaveBeenCalledWith(keys, validated);
  });

  test('api-keys-loaded defaults missing keys and validated to empty objects', () => {
    simulateMessage({ type: 'api-keys-loaded' });

    expect(callbacks.onApiKeysLoaded).toHaveBeenCalledWith({}, {});
  });

  // --- unknown message type ---

  test('unknown message type does not call any callback', () => {
    simulateMessage({ type: 'unknown-type' });

    Object.values(callbacks).forEach((fn) => {
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
