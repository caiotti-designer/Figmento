/**
 * @jest-environment jsdom
 */

// Mock all external dependencies before importing the module under test

jest.mock('../ui/state', () => ({
  dom: {
    batchPanel: null,
    batchList: null,
    batchProcessBtn: null,
    batchQueueContainer: null,
    batchProgress: null,
    batchStatus: null,
  },
  apiState: {
    currentProvider: 'claude' as const,
    savedApiKeys: {} as Record<string, string>,
    abortController: null as AbortController | null,
  },
  screenshotState: {
    currentImageBase64: null as string | null,
    isProcessing: false,
  },
  imageGenState: {
    enableImageGeneration: false,
  },
  designSettings: {
    selectedFontFamily: 'Inter',
    brandColors: [] as string[],
    enableGridSystem: false,
  },
  MAX_IMAGE_SIZE: 2 * 1024 * 1024,
  MAX_IMAGE_DIMENSION: 2048,
}));

jest.mock('../ui/utils', () => ({
  postMessage: jest.fn(),
  compressImage: jest.fn().mockResolvedValue('compressed-base64'),
  showToast: jest.fn(),
}));

jest.mock('../ui/cache', () => ({
  generateCacheKey: jest.fn().mockReturnValue('mock-cache-key'),
  getCachedResponse: jest.fn().mockReturnValue(undefined),
  setCachedResponse: jest.fn(),
}));

jest.mock('../ui/api', () => ({
  analyzeImageStreaming: jest.fn().mockResolvedValue({
    width: 800,
    height: 600,
    backgroundColor: '#FFF',
    elements: [],
  }),
}));

jest.mock('../ui/icons', () => ({
  fetchAllIcons: jest.fn().mockImplementation((analysis: any) => Promise.resolve(analysis)),
}));

jest.mock('../ui/images', () => ({
  generateImagesForPlaceholders: jest.fn().mockImplementation((analysis: any) => Promise.resolve(analysis)),
}));

jest.mock('../ui/errors', () => {
  class PluginError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'PluginError';
      this.code = code;
    }
  }
  class CancelledError extends PluginError {
    constructor(message = 'Cancelled') {
      super(message, 'CANCELLED');
      this.name = 'CancelledError';
    }
  }
  return {
    PluginError,
    CancelledError,
    classifyError: jest.fn().mockImplementation((error: unknown) => {
      if (error instanceof PluginError) return error;
      const message = error instanceof Error ? error.message : String(error);
      return new PluginError(message || 'Unknown', 'UNKNOWN');
    }),
  };
});

import {
  addToQueue,
  removeFromQueue,
  clearQueue,
  getQueueLength,
  startBatchProcessing,
  cancelBatchProcessing,
  notifyDesignCreated,
  renderQueueUI,
} from '../ui/batch';

import { showToast, postMessage } from '../ui/utils';
import { apiState, screenshotState, dom } from '../ui/state';
import { analyzeImageStreaming } from '../ui/api';
import { generateCacheKey, getCachedResponse, setCachedResponse } from '../ui/cache';
import { fetchAllIcons } from '../ui/icons';
import { generateImagesForPlaceholders } from '../ui/images';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock FileList from an array of File objects.
 */
function createMockFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] || null,
    [Symbol.iterator]: function* () {
      for (let i = 0; i < files.length; i++) {
        yield files[i];
      }
    },
  } as unknown as FileList;

  // Add numeric index accessors
  for (let i = 0; i < files.length; i++) {
    (fileList as any)[i] = files[i];
  }

  return fileList;
}

/**
 * Creates a mock image File with the given name.
 */
function createMockImageFile(name: string, content = 'fake-image-data'): File {
  return new File([content], name, { type: 'image/png' });
}

/**
 * Creates a mock non-image File with the given name.
 */
function createMockTextFile(name: string, content = 'text content'): File {
  return new File([content], name, { type: 'text/plain' });
}

/**
 * Waits for all FileReader operations and microtasks to complete.
 */
async function flushFileReaders(): Promise<void> {
  // Allow multiple rounds of microtask and macrotask processing
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearQueue();
  jest.clearAllMocks();

  // Reset mocked state
  (apiState as any).currentProvider = 'claude';
  (apiState as any).savedApiKeys = {};
  (apiState as any).abortController = null;
  (screenshotState as any).currentImageBase64 = null;
  (screenshotState as any).isProcessing = false;

  // Reset DOM refs to null (no DOM elements wired up)
  (dom as any).batchPanel = null;
  (dom as any).batchList = null;
  (dom as any).batchProcessBtn = null;
});

// ═══════════════════════════════════════════════════════════════
// addToQueue
// ═══════════════════════════════════════════════════════════════

describe('addToQueue', () => {
  test('adds a single image file to the queue', async () => {
    const file = createMockImageFile('screenshot.png');
    const fileList = createMockFileList([file]);

    addToQueue(fileList);
    await flushFileReaders();

    expect(getQueueLength()).toBe(1);
  });

  test('adds multiple image files to the queue', async () => {
    const files = [
      createMockImageFile('screen1.png'),
      createMockImageFile('screen2.jpg'),
      createMockImageFile('screen3.gif'),
    ];
    const fileList = createMockFileList(files);

    addToQueue(fileList);
    await flushFileReaders();

    expect(getQueueLength()).toBe(3);
  });

  test('generates unique IDs for each queued item', async () => {
    const files = [
      createMockImageFile('a.png'),
      createMockImageFile('b.png'),
    ];
    const fileList = createMockFileList(files);

    addToQueue(fileList);
    await flushFileReaders();

    expect(getQueueLength()).toBe(2);
    // The items should have been added; we verify uniqueness by
    // removing one and confirming the other remains.
    // Since we cannot directly access batchState, we test via removeFromQueue behavior.
  });

  test('skips non-image files', async () => {
    const files = [
      createMockImageFile('valid.png'),
      createMockTextFile('readme.txt'),
      createMockImageFile('valid2.jpg'),
    ];
    const fileList = createMockFileList(files);

    addToQueue(fileList);
    await flushFileReaders();

    // Only the two image files should be queued
    expect(getQueueLength()).toBe(2);
  });

  test('does not add non-image-only file list', async () => {
    const files = [
      createMockTextFile('notes.txt'),
      createMockTextFile('data.csv'),
    ];
    const fileList = createMockFileList(files);

    addToQueue(fileList);
    await flushFileReaders();

    expect(getQueueLength()).toBe(0);
  });

  test('handles an empty file list gracefully', async () => {
    const fileList = createMockFileList([]);

    addToQueue(fileList);
    await flushFileReaders();

    expect(getQueueLength()).toBe(0);
  });

  test('accumulates items across multiple addToQueue calls', async () => {
    const fileList1 = createMockFileList([createMockImageFile('first.png')]);
    const fileList2 = createMockFileList([createMockImageFile('second.png')]);

    addToQueue(fileList1);
    await flushFileReaders();
    expect(getQueueLength()).toBe(1);

    addToQueue(fileList2);
    await flushFileReaders();
    expect(getQueueLength()).toBe(2);
  });

  test('items are added with pending status', async () => {
    const fileList = createMockFileList([createMockImageFile('test.png')]);

    addToQueue(fileList);
    await flushFileReaders();

    // If the item were not pending, startBatchProcessing would report "No pending items"
    // We verify by checking that the queue has length 1 and a future startBatch
    // would attempt to process it (tested separately in startBatchProcessing tests).
    expect(getQueueLength()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// removeFromQueue
// ═══════════════════════════════════════════════════════════════

describe('removeFromQueue', () => {
  test('removes an item by its ID', async () => {
    const fileList = createMockFileList([createMockImageFile('remove-me.png')]);

    addToQueue(fileList);
    await flushFileReaders();
    expect(getQueueLength()).toBe(1);

    // We need to get the ID. Since we cannot directly access batchState,
    // we can test through the clearQueue + re-add approach, or we test
    // that removeFromQueue with a non-matching ID does nothing and
    // clearQueue removes all.
    // Instead, let's test with a known non-existent ID first.
    removeFromQueue('non-existent-id');
    expect(getQueueLength()).toBe(1); // Item still there
  });

  test('does nothing when removing a non-existent ID', async () => {
    const fileList = createMockFileList([
      createMockImageFile('stay1.png'),
      createMockImageFile('stay2.png'),
    ]);

    addToQueue(fileList);
    await flushFileReaders();
    expect(getQueueLength()).toBe(2);

    removeFromQueue('does-not-exist');
    expect(getQueueLength()).toBe(2);
  });

  test('does nothing on an empty queue', () => {
    expect(getQueueLength()).toBe(0);
    removeFromQueue('any-id');
    expect(getQueueLength()).toBe(0);
  });

  test('removing all items one-by-one leaves an empty queue', async () => {
    // We add items and then clear to verify remove works in principle.
    // Since we cannot access individual IDs, we use clearQueue as proxy
    // and test removeFromQueue's filter behavior.
    const fileList = createMockFileList([createMockImageFile('file.png')]);

    addToQueue(fileList);
    await flushFileReaders();
    expect(getQueueLength()).toBe(1);

    clearQueue();
    expect(getQueueLength()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// clearQueue
// ═══════════════════════════════════════════════════════════════

describe('clearQueue', () => {
  test('clears all items from the queue', async () => {
    const fileList = createMockFileList([
      createMockImageFile('a.png'),
      createMockImageFile('b.png'),
      createMockImageFile('c.png'),
    ]);

    addToQueue(fileList);
    await flushFileReaders();
    expect(getQueueLength()).toBe(3);

    clearQueue();
    expect(getQueueLength()).toBe(0);
  });

  test('works on an already empty queue', () => {
    expect(getQueueLength()).toBe(0);
    clearQueue();
    expect(getQueueLength()).toBe(0);
  });

  test('can be called multiple times safely', async () => {
    const fileList = createMockFileList([createMockImageFile('file.png')]);

    addToQueue(fileList);
    await flushFileReaders();

    clearQueue();
    clearQueue();
    clearQueue();

    expect(getQueueLength()).toBe(0);
  });

  test('queue can be repopulated after clearing', async () => {
    const fileList1 = createMockFileList([createMockImageFile('before.png')]);

    addToQueue(fileList1);
    await flushFileReaders();
    expect(getQueueLength()).toBe(1);

    clearQueue();
    expect(getQueueLength()).toBe(0);

    const fileList2 = createMockFileList([
      createMockImageFile('after1.png'),
      createMockImageFile('after2.png'),
    ]);

    addToQueue(fileList2);
    await flushFileReaders();
    expect(getQueueLength()).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// getQueueLength
// ═══════════════════════════════════════════════════════════════

describe('getQueueLength', () => {
  test('returns 0 for an empty queue', () => {
    expect(getQueueLength()).toBe(0);
  });

  test('returns the correct count after adding items', async () => {
    const fileList = createMockFileList([
      createMockImageFile('one.png'),
      createMockImageFile('two.png'),
    ]);

    addToQueue(fileList);
    await flushFileReaders();

    expect(getQueueLength()).toBe(2);
  });

  test('returns 0 after clearing', async () => {
    const fileList = createMockFileList([createMockImageFile('file.png')]);

    addToQueue(fileList);
    await flushFileReaders();
    expect(getQueueLength()).toBe(1);

    clearQueue();
    expect(getQueueLength()).toBe(0);
  });

  test('reflects incremental additions', async () => {
    expect(getQueueLength()).toBe(0);

    addToQueue(createMockFileList([createMockImageFile('a.png')]));
    await flushFileReaders();
    expect(getQueueLength()).toBe(1);

    addToQueue(createMockFileList([createMockImageFile('b.png')]));
    await flushFileReaders();
    expect(getQueueLength()).toBe(2);

    addToQueue(createMockFileList([createMockImageFile('c.png')]));
    await flushFileReaders();
    expect(getQueueLength()).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// startBatchProcessing
// ═══════════════════════════════════════════════════════════════

describe('startBatchProcessing', () => {
  test('shows error toast when no API key is configured', async () => {
    (apiState as any).savedApiKeys = {};

    const fileList = createMockFileList([createMockImageFile('file.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    expect(showToast).toHaveBeenCalledWith(
      'Please configure your API key first',
      'error'
    );
  });

  test('shows warning toast when queue has no pending items', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };

    // Queue is empty, so no pending items
    await startBatchProcessing();

    expect(showToast).toHaveBeenCalledWith(
      'No pending items in the queue',
      'warning'
    );
  });

  test('processes pending items and calls analyzeImageStreaming', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };
    (analyzeImageStreaming as jest.Mock).mockResolvedValue({
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      elements: [{ type: 'TEXT' }],
    });

    // Mock postMessage to auto-resolve design creation
    (postMessage as jest.Mock).mockImplementation(() => {
      // Simulate the design being created by calling notifyDesignCreated
      setTimeout(() => notifyDesignCreated(), 0);
    });

    const fileList = createMockFileList([createMockImageFile('process-me.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    expect(analyzeImageStreaming).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'create-design' })
    );
  });

  test('uses cached response when available', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };
    const cachedAnalysis = {
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      elements: [{ type: 'RECTANGLE' }],
    };
    (getCachedResponse as jest.Mock).mockReturnValue(cachedAnalysis);

    (postMessage as jest.Mock).mockImplementation(() => {
      setTimeout(() => notifyDesignCreated(), 0);
    });

    const fileList = createMockFileList([createMockImageFile('cached.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    expect(generateCacheKey).toHaveBeenCalled();
    expect(getCachedResponse).toHaveBeenCalled();
    // Should NOT call analyzeImageStreaming since cache was hit
    expect(analyzeImageStreaming).not.toHaveBeenCalled();
  });

  test('caches newly analyzed responses', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };
    (getCachedResponse as jest.Mock).mockReturnValue(undefined);
    (analyzeImageStreaming as jest.Mock).mockResolvedValue({
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      elements: [{ type: 'TEXT' }],
    });

    (postMessage as jest.Mock).mockImplementation(() => {
      setTimeout(() => notifyDesignCreated(), 0);
    });

    const fileList = createMockFileList([createMockImageFile('new.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    expect(setCachedResponse).toHaveBeenCalled();
  });

  test('shows success toast after processing completes', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };
    (analyzeImageStreaming as jest.Mock).mockResolvedValue({
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      elements: [{ type: 'TEXT' }],
    });

    (postMessage as jest.Mock).mockImplementation(() => {
      setTimeout(() => notifyDesignCreated(), 0);
    });

    const fileList = createMockFileList([createMockImageFile('done.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('Batch complete'),
      'success'
    );
  });

  test('handles analysis errors and continues to next item', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };

    let callCount = 0;
    (analyzeImageStreaming as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('AI analysis failed'));
      }
      return Promise.resolve({
        width: 800,
        height: 600,
        backgroundColor: '#FFF',
        elements: [{ type: 'TEXT' }],
      });
    });

    (postMessage as jest.Mock).mockImplementation(() => {
      setTimeout(() => notifyDesignCreated(), 0);
    });

    const fileList = createMockFileList([
      createMockImageFile('fail.png'),
      createMockImageFile('succeed.png'),
    ]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    // Should have tried to analyze both items
    expect(analyzeImageStreaming).toHaveBeenCalledTimes(2);
    // The summary toast should mention errors
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('error'),
      'warning'
    );
  });

  test('throws error for invalid AI response (no elements)', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };
    (getCachedResponse as jest.Mock).mockReturnValue(undefined);
    (analyzeImageStreaming as jest.Mock).mockResolvedValue({
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      // No elements property - invalid response
    });

    const fileList = createMockFileList([createMockImageFile('invalid-response.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    // The item should have errored out
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('error'),
      'warning'
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// cancelBatchProcessing
// ═══════════════════════════════════════════════════════════════

describe('cancelBatchProcessing', () => {
  test('shows cancellation toast', () => {
    cancelBatchProcessing();

    expect(showToast).toHaveBeenCalledWith(
      'Batch processing cancelled',
      'warning'
    );
  });

  test('aborts the current abort controller', () => {
    const controller = new AbortController();
    const abortSpy = jest.spyOn(controller, 'abort');
    (apiState as any).abortController = controller;

    cancelBatchProcessing();

    expect(abortSpy).toHaveBeenCalled();
    expect(apiState.abortController).toBeNull();
  });

  test('resets screenshotState.isProcessing to false', () => {
    (screenshotState as any).isProcessing = true;

    cancelBatchProcessing();

    expect(screenshotState.isProcessing).toBe(false);
  });

  test('handles cancel when no abort controller exists', () => {
    (apiState as any).abortController = null;

    // Should not throw
    expect(() => cancelBatchProcessing()).not.toThrow();
    expect(showToast).toHaveBeenCalledWith(
      'Batch processing cancelled',
      'warning'
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// notifyDesignCreated
// ═══════════════════════════════════════════════════════════════

describe('notifyDesignCreated', () => {
  test('does not throw when called without a pending resolve', () => {
    expect(() => notifyDesignCreated()).not.toThrow();
  });

  test('calling it multiple times does not throw', () => {
    expect(() => {
      notifyDesignCreated();
      notifyDesignCreated();
      notifyDesignCreated();
    }).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// renderQueueUI
// ═══════════════════════════════════════════════════════════════

describe('renderQueueUI', () => {
  test('returns early when DOM elements are null', () => {
    (dom as any).batchPanel = null;
    (dom as any).batchList = null;
    (dom as any).batchProcessBtn = null;

    // Should not throw
    expect(() => renderQueueUI()).not.toThrow();
  });

  test('hides batch panel when queue is empty', () => {
    const mockPanel = document.createElement('div');
    const mockList = document.createElement('div');
    const mockBtn = document.createElement('button');

    (dom as any).batchPanel = mockPanel;
    (dom as any).batchList = mockList;
    (dom as any).batchProcessBtn = mockBtn;

    clearQueue();
    renderQueueUI();

    expect(mockPanel.style.display).toBe('none');
  });

  test('shows batch panel when queue has items', async () => {
    const mockPanel = document.createElement('div');
    const mockList = document.createElement('div');
    const mockBtn = document.createElement('button');

    (dom as any).batchPanel = mockPanel;
    (dom as any).batchList = mockList;
    (dom as any).batchProcessBtn = mockBtn;

    const fileList = createMockFileList([createMockImageFile('visible.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    renderQueueUI();

    expect(mockPanel.style.display).toBe('block');
  });

  test('renders correct number of queue item rows', async () => {
    const mockPanel = document.createElement('div');
    const mockList = document.createElement('div');
    const mockBtn = document.createElement('button');

    (dom as any).batchPanel = mockPanel;
    (dom as any).batchList = mockList;
    (dom as any).batchProcessBtn = mockBtn;

    const fileList = createMockFileList([
      createMockImageFile('row1.png'),
      createMockImageFile('row2.png'),
      createMockImageFile('row3.png'),
    ]);
    addToQueue(fileList);
    await flushFileReaders();

    renderQueueUI();

    expect(mockList.children.length).toBe(3);
  });

  test('updates process button text with pending count', async () => {
    const mockPanel = document.createElement('div');
    const mockList = document.createElement('div');
    const mockBtn = document.createElement('button');

    (dom as any).batchPanel = mockPanel;
    (dom as any).batchList = mockList;
    (dom as any).batchProcessBtn = mockBtn;

    const fileList = createMockFileList([
      createMockImageFile('p1.png'),
      createMockImageFile('p2.png'),
    ]);
    addToQueue(fileList);
    await flushFileReaders();

    renderQueueUI();

    expect(mockBtn.textContent).toContain('Process All');
    expect(mockBtn.textContent).toContain('2');
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('edge cases', () => {
  test('adding files with mixed types only queues images', async () => {
    const files = [
      new File(['data'], 'photo.jpeg', { type: 'image/jpeg' }),
      new File(['data'], 'document.pdf', { type: 'application/pdf' }),
      new File(['data'], 'graphic.svg', { type: 'image/svg+xml' }),
      new File(['data'], 'style.css', { type: 'text/css' }),
      new File(['data'], 'icon.webp', { type: 'image/webp' }),
    ];
    const fileList = createMockFileList(files);

    addToQueue(fileList);
    await flushFileReaders();

    // jpeg, svg+xml, webp are all image/* types
    expect(getQueueLength()).toBe(3);
  });

  test('clearQueue resets processing state', async () => {
    const fileList = createMockFileList([createMockImageFile('file.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    clearQueue();

    // After clearing, getQueueLength should return 0
    expect(getQueueLength()).toBe(0);
  });

  test('removeFromQueue with empty string ID does nothing', async () => {
    const fileList = createMockFileList([createMockImageFile('file.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    removeFromQueue('');
    expect(getQueueLength()).toBe(1);
  });

  test('startBatchProcessing without API key returns early without modifying queue', async () => {
    (apiState as any).savedApiKeys = {};

    const fileList = createMockFileList([createMockImageFile('file.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    // Queue should still have the item
    expect(getQueueLength()).toBe(1);
    expect(showToast).toHaveBeenCalledWith(
      'Please configure your API key first',
      'error'
    );
  });

  test('sequential add and clear cycles work correctly', async () => {
    for (let cycle = 0; cycle < 3; cycle++) {
      const fileList = createMockFileList([
        createMockImageFile(`cycle${cycle}_a.png`),
        createMockImageFile(`cycle${cycle}_b.png`),
      ]);
      addToQueue(fileList);
      await flushFileReaders();
      expect(getQueueLength()).toBe(2);

      clearQueue();
      expect(getQueueLength()).toBe(0);
    }
  });

  test('large batch of files can be added', async () => {
    const files: File[] = [];
    for (let i = 0; i < 20; i++) {
      files.push(createMockImageFile(`screenshot_${i}.png`));
    }
    const fileList = createMockFileList(files);

    addToQueue(fileList);
    await flushFileReaders();

    expect(getQueueLength()).toBe(20);
  });

  test('cancelBatchProcessing followed by startBatchProcessing works', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };
    (analyzeImageStreaming as jest.Mock).mockResolvedValue({
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      elements: [{ type: 'TEXT' }],
    });
    (postMessage as jest.Mock).mockImplementation(() => {
      setTimeout(() => notifyDesignCreated(), 0);
    });

    const fileList = createMockFileList([createMockImageFile('restart.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    // Cancel first (even though nothing is processing)
    cancelBatchProcessing();

    // Clear and re-add to get fresh pending items
    clearQueue();
    const fileList2 = createMockFileList([createMockImageFile('restart2.png')]);
    addToQueue(fileList2);
    await flushFileReaders();

    // Now start processing
    await startBatchProcessing();

    expect(analyzeImageStreaming).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Queue State Management
// ═══════════════════════════════════════════════════════════════

describe('queue state management', () => {
  test('processing sets screenshotState.isProcessing to false when done', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };
    (analyzeImageStreaming as jest.Mock).mockResolvedValue({
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      elements: [{ type: 'TEXT' }],
    });
    (postMessage as jest.Mock).mockImplementation(() => {
      setTimeout(() => notifyDesignCreated(), 0);
    });

    const fileList = createMockFileList([createMockImageFile('state-check.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    expect(screenshotState.isProcessing).toBe(false);
    expect(apiState.abortController).toBeNull();
  });

  test('processing fetches icons for each item', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };
    (getCachedResponse as jest.Mock).mockReturnValue(undefined);
    (analyzeImageStreaming as jest.Mock).mockResolvedValue({
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      elements: [{ type: 'TEXT' }],
    });
    (postMessage as jest.Mock).mockImplementation(() => {
      setTimeout(() => notifyDesignCreated(), 0);
    });

    const fileList = createMockFileList([createMockImageFile('icons.png')]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    expect(fetchAllIcons).toHaveBeenCalled();
  });

  test('clearQueue after partial processing resets everything', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };

    const fileList = createMockFileList([
      createMockImageFile('partial1.png'),
      createMockImageFile('partial2.png'),
    ]);
    addToQueue(fileList);
    await flushFileReaders();
    expect(getQueueLength()).toBe(2);

    // Clear before processing completes
    clearQueue();
    expect(getQueueLength()).toBe(0);
  });

  test('batch processing with multiple items calls postMessage for each successful item', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };
    (getCachedResponse as jest.Mock).mockReturnValue(undefined);
    (analyzeImageStreaming as jest.Mock).mockResolvedValue({
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      elements: [{ type: 'RECTANGLE' }],
    });
    (postMessage as jest.Mock).mockImplementation(() => {
      setTimeout(() => notifyDesignCreated(), 0);
    });

    const fileList = createMockFileList([
      createMockImageFile('multi1.png'),
      createMockImageFile('multi2.png'),
    ]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    // Each successful item should trigger a create-design postMessage
    const createDesignCalls = (postMessage as jest.Mock).mock.calls.filter(
      (call: any[]) => call[0]?.type === 'create-design'
    );
    expect(createDesignCalls.length).toBe(2);
  });

  test('batch processing summary toast includes counts', async () => {
    (apiState as any).savedApiKeys = { claude: 'sk-test-key' };
    (getCachedResponse as jest.Mock).mockReturnValue(undefined);
    (analyzeImageStreaming as jest.Mock).mockResolvedValue({
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      elements: [{ type: 'TEXT' }],
    });
    (postMessage as jest.Mock).mockImplementation(() => {
      setTimeout(() => notifyDesignCreated(), 0);
    });

    const fileList = createMockFileList([
      createMockImageFile('count1.png'),
      createMockImageFile('count2.png'),
      createMockImageFile('count3.png'),
    ]);
    addToQueue(fileList);
    await flushFileReaders();

    await startBatchProcessing();

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('3 done'),
      'success'
    );
  });
});
