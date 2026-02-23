/**
 * @jest-environment jsdom
 */

// Mock the state module to avoid pulling in DOM/UI dependencies
jest.mock('../ui/state', () => ({
  dom: { toastContainer: null },
}));

import {
  debounce,
  safeGetItem,
  safeSetItem,
  addCleanableListener,
  cleanupAllListeners,
} from '../ui/utils';

// ═══════════════════════════════════════════════════════════════
// DEBOUNCE
// ═══════════════════════════════════════════════════════════════

describe('debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('calls function after wait period', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 200);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('resets timer on subsequent calls', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 200);

    debounced();
    jest.advanceTimersByTime(100);
    debounced();
    jest.advanceTimersByTime(100);
    debounced();
    jest.advanceTimersByTime(100);

    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('passes arguments through correctly', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced('hello', 42);
    jest.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('hello', 42);
  });

  test('uses correct this context', () => {
    let capturedThis: any;
    const fn = jest.fn(function (this: any) {
      capturedThis = this;
    });
    const debounced = debounce(fn, 100);

    const context = { name: 'test-context' };
    debounced.call(context);
    jest.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(capturedThis).toBe(context);
  });
});

// ═══════════════════════════════════════════════════════════════
// LOCAL STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════

describe('safeGetItem', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => mockStorage[key] || null
    );
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        mockStorage[key] = value;
      }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns value from localStorage', () => {
    mockStorage['theme'] = 'dark';
    expect(safeGetItem('theme')).toBe('dark');
  });

  test('returns null when key does not exist', () => {
    expect(safeGetItem('nonexistent')).toBeNull();
  });

  test('returns null when localStorage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(safeGetItem('anything')).toBeNull();
  });
});

describe('safeSetItem', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => mockStorage[key] || null
    );
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        mockStorage[key] = value;
      }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('stores value in localStorage', () => {
    safeSetItem('lang', 'en');
    expect(mockStorage['lang']).toBe('en');
  });

  test('does not throw when localStorage throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => safeSetItem('key', 'value')).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENER CLEANUP
// ═══════════════════════════════════════════════════════════════

describe('addCleanableListener / cleanupAllListeners', () => {
  beforeEach(() => {
    cleanupAllListeners();
  });

  test('addCleanableListener registers the listener on the target', () => {
    const mockTarget = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    const handler = jest.fn();

    addCleanableListener(mockTarget as unknown as EventTarget, 'click', handler);

    expect(mockTarget.addEventListener).toHaveBeenCalledTimes(1);
    expect(mockTarget.addEventListener).toHaveBeenCalledWith('click', handler, undefined);
  });

  test('cleanupAllListeners removes all registered listeners', () => {
    const mockTarget = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    const handler = jest.fn();

    addCleanableListener(mockTarget as unknown as EventTarget, 'click', handler);
    cleanupAllListeners();

    expect(mockTarget.removeEventListener).toHaveBeenCalledTimes(1);
    expect(mockTarget.removeEventListener).toHaveBeenCalledWith('click', handler, undefined);
  });

  test('cleanupAllListeners clears the registry (calling it twice does not error)', () => {
    const mockTarget = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    const handler = jest.fn();

    addCleanableListener(mockTarget as unknown as EventTarget, 'click', handler);
    cleanupAllListeners();
    cleanupAllListeners();

    // removeEventListener should only have been called once (from the first cleanup)
    expect(mockTarget.removeEventListener).toHaveBeenCalledTimes(1);
  });

  test('multiple listeners can be tracked and cleaned up', () => {
    const mockTarget1 = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    const mockTarget2 = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const handler3 = jest.fn();

    addCleanableListener(mockTarget1 as unknown as EventTarget, 'click', handler1);
    addCleanableListener(mockTarget1 as unknown as EventTarget, 'keydown', handler2, true);
    addCleanableListener(mockTarget2 as unknown as EventTarget, 'scroll', handler3);

    expect(mockTarget1.addEventListener).toHaveBeenCalledTimes(2);
    expect(mockTarget2.addEventListener).toHaveBeenCalledTimes(1);

    cleanupAllListeners();

    expect(mockTarget1.removeEventListener).toHaveBeenCalledTimes(2);
    expect(mockTarget1.removeEventListener).toHaveBeenCalledWith('click', handler1, undefined);
    expect(mockTarget1.removeEventListener).toHaveBeenCalledWith('keydown', handler2, true);
    expect(mockTarget2.removeEventListener).toHaveBeenCalledTimes(1);
    expect(mockTarget2.removeEventListener).toHaveBeenCalledWith('scroll', handler3, undefined);
  });
});
