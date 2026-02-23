/**
 * @jest-environment jsdom
 */

// Mock state module
jest.mock('../ui/state', () => ({
  apiState: {
    currentProvider: 'gemini',
    abortController: null,
  },
  imageGenState: {
    enableImageGeneration: true,
    imageGenModel: 'imagen-4',
  },
  screenshotState: {
    isProcessing: true,
  },
}));

import {
  collectImageElements,
  generateWithImagen4,
  generateWithGeminiImage,
  generateImagesForPlaceholders,
} from '../ui/images';
import { apiState, imageGenState, screenshotState } from '../ui/state';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
  (apiState as any).currentProvider = 'gemini';
  (apiState as any).abortController = null;
  (imageGenState as any).enableImageGeneration = true;
  (imageGenState as any).imageGenModel = 'imagen-4';
  (screenshotState as any).isProcessing = true;
});

// ═══════════════════════════════════════════════════════════════
// collectImageElements
// ═══════════════════════════════════════════════════════════════

describe('collectImageElements', () => {
  test('returns empty array for empty elements', () => {
    expect(collectImageElements([])).toEqual([]);
  });

  test('returns empty array when no images present', () => {
    const elements = [
      { type: 'frame', children: [] },
      { type: 'text', children: [] },
      { type: 'icon', children: [] },
    ];
    expect(collectImageElements(elements)).toEqual([]);
  });

  test('collects image elements from flat array', () => {
    const elements = [
      { type: 'image', name: 'img1', children: [] },
      { type: 'frame', children: [] },
      { type: 'image', name: 'img2', children: [] },
    ];
    const images = collectImageElements(elements);
    expect(images).toHaveLength(2);
    expect(images[0].name).toBe('img1');
    expect(images[1].name).toBe('img2');
  });

  test('collects image elements from nested structure', () => {
    const elements = [
      {
        type: 'frame',
        children: [
          { type: 'image', name: 'nested-img', children: [] },
          {
            type: 'frame',
            children: [{ type: 'image', name: 'deeply-nested', children: [] }],
          },
        ],
      },
    ];
    const images = collectImageElements(elements);
    expect(images).toHaveLength(2);
    expect(images[0].name).toBe('nested-img');
    expect(images[1].name).toBe('deeply-nested');
  });
});

// ═══════════════════════════════════════════════════════════════
// generateWithImagen4
// ═══════════════════════════════════════════════════════════════

describe('generateWithImagen4', () => {
  test('returns base64 image data on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          predictions: [{ bytesBase64Encoded: 'abc123' }],
        }),
    });

    const result = await generateWithImagen4('test prompt', 'test-key');
    expect(result).toBe('data:image/png;base64,abc123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('imagen-4.0-fast-generate-001'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('returns null on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const result = await generateWithImagen4('test prompt', 'test-key');
    expect(result).toBeNull();
  });

  test('returns null when response has no predictions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await generateWithImagen4('test prompt', 'test-key');
    expect(result).toBeNull();
  });

  test('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await generateWithImagen4('test prompt', 'test-key');
    expect(result).toBeNull();
  });

  test('uses abort signal when available', async () => {
    const abortController = new AbortController();
    (apiState as any).abortController = abortController;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ predictions: [{ bytesBase64Encoded: 'data' }] }),
    });

    await generateWithImagen4('test', 'key');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: abortController.signal })
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// generateWithGeminiImage
// ═══════════════════════════════════════════════════════════════

describe('generateWithGeminiImage', () => {
  test('returns base64 image data on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { data: 'xyz789', mimeType: 'image/jpeg' } }],
              },
            },
          ],
        }),
    });

    const result = await generateWithGeminiImage('test prompt', 'test-key');
    expect(result).toBe('data:image/jpeg;base64,xyz789');
  });

  test('defaults to image/png when mimeType not specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { data: 'abc' } }],
              },
            },
          ],
        }),
    });

    const result = await generateWithGeminiImage('test', 'key');
    expect(result).toBe('data:image/png;base64,abc');
  });

  test('returns null on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const result = await generateWithGeminiImage('test', 'key');
    expect(result).toBeNull();
  });

  test('returns null when no image data in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'no image' }] } }],
        }),
    });

    const result = await generateWithGeminiImage('test', 'key');
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// generateImagesForPlaceholders
// ═══════════════════════════════════════════════════════════════

describe('generateImagesForPlaceholders', () => {
  test('returns analysis unchanged when image generation is disabled', async () => {
    (imageGenState as any).enableImageGeneration = false;

    const analysis = {
      width: 100,
      height: 100,
      backgroundColor: '#FFF',
      elements: [{ type: 'image', name: 'test', children: [] }],
    };
    const progressCallback = jest.fn();

    const result = await generateImagesForPlaceholders(analysis, 'key', progressCallback);
    expect(result).toBe(analysis);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('returns analysis unchanged when provider is not gemini', async () => {
    (apiState as any).currentProvider = 'claude';

    const analysis = {
      width: 100,
      height: 100,
      backgroundColor: '#FFF',
      elements: [{ type: 'image', children: [] }],
    };
    const progressCallback = jest.fn();

    const result = await generateImagesForPlaceholders(analysis, 'key', progressCallback);
    expect(result).toBe(analysis);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('returns analysis unchanged when no image elements', async () => {
    const analysis = {
      width: 100,
      height: 100,
      backgroundColor: '#FFF',
      elements: [{ type: 'frame', children: [] }],
    };
    const progressCallback = jest.fn();

    const result = await generateImagesForPlaceholders(analysis, 'key', progressCallback);
    expect(result).toBe(analysis);
  });

  test('generates images and attaches to elements', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          predictions: [{ bytesBase64Encoded: 'generated-image' }],
        }),
    });

    const analysis = {
      width: 100,
      height: 100,
      backgroundColor: '#FFF',
      elements: [
        { type: 'image', name: 'Photo', imageDescription: 'A sunset', width: 200, height: 100, children: [] },
      ],
    };
    const progressCallback = jest.fn();

    const result = await generateImagesForPlaceholders(analysis, 'test-key', progressCallback);

    expect(result.elements[0].generatedImage).toBe('data:image/png;base64,generated-image');
    expect(progressCallback).toHaveBeenCalled();
  });

  test('limits image generation to 3 images', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          predictions: [{ bytesBase64Encoded: 'img' }],
        }),
    });

    const analysis = {
      width: 100,
      height: 100,
      backgroundColor: '#FFF',
      elements: [
        { type: 'image', name: 'img1', width: 100, height: 100, children: [] },
        { type: 'image', name: 'img2', width: 100, height: 100, children: [] },
        { type: 'image', name: 'img3', width: 100, height: 100, children: [] },
        { type: 'image', name: 'img4', width: 100, height: 100, children: [] },
        { type: 'image', name: 'img5', width: 100, height: 100, children: [] },
      ],
    };
    const progressCallback = jest.fn();

    await generateImagesForPlaceholders(analysis, 'key', progressCallback);

    // Should only generate 3 images (the limit)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test('stops generation when processing is cancelled', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // After first image, simulate cancellation
        (screenshotState as any).isProcessing = false;
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ predictions: [{ bytesBase64Encoded: 'img' }] }),
      });
    });

    const analysis = {
      width: 100,
      height: 100,
      backgroundColor: '#FFF',
      elements: [
        { type: 'image', name: 'img1', width: 100, height: 100, children: [] },
        { type: 'image', name: 'img2', width: 100, height: 100, children: [] },
      ],
    };
    const progressCallback = jest.fn();

    await generateImagesForPlaceholders(analysis, 'key', progressCallback);

    // Should stop after first image due to cancellation
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
