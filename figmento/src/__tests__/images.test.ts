/**
 * @jest-environment jsdom
 */

// Mock state module
jest.mock('../ui/state', () => ({
  apiState: {
    currentProvider: 'gemini',
    abortController: null,
    savedApiKeys: { gemini: 'test-gemini-key' },
  },
  imageGenState: {
    enableImageGeneration: true,
    imageGenModel: 'gemini-3.1-flash-image-preview',
  },
  screenshotState: {
    isProcessing: true,
  },
}));

import {
  collectImageElements,
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
  (apiState as any).savedApiKeys = { gemini: 'test-gemini-key' };
  (imageGenState as any).enableImageGeneration = true;
  (imageGenState as any).imageGenModel = 'gemini-3.1-flash-image-preview';
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

  test('returns analysis unchanged when no gemini API key is saved', async () => {
    (apiState as any).savedApiKeys = {};

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
          candidates: [{ content: { parts: [{ inlineData: { data: 'generated-image', mimeType: 'image/png' } }] } }],
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

  test('limits image generation to 4 images', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ inlineData: { data: 'img', mimeType: 'image/png' } }] } }],
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

    // Should only generate 4 images (the limit)
    expect(mockFetch).toHaveBeenCalledTimes(4);
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
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ inlineData: { data: 'img', mimeType: 'image/png' } }] } }] }),
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
