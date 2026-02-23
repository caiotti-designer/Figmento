/**
 * @jest-environment jsdom
 */

import {
  collectIconNames,
  fetchLucideIcon,
  fetchAllIcons,
  setIconProgress,
} from '../ui/icons';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
});

// ═══════════════════════════════════════════════════════════════
// collectIconNames
// ═══════════════════════════════════════════════════════════════

describe('collectIconNames', () => {
  test('returns empty array for empty elements', () => {
    expect(collectIconNames([])).toEqual([]);
  });

  test('returns empty array when no icons present', () => {
    const elements = [
      { type: 'frame', children: [] },
      { type: 'text', children: [] },
    ];
    expect(collectIconNames(elements)).toEqual([]);
  });

  test('collects icon names from flat elements', () => {
    const elements = [
      { type: 'icon', lucideIcon: 'heart', children: [] },
      { type: 'icon', lucideIcon: 'star', children: [] },
    ];
    expect(collectIconNames(elements)).toEqual(['heart', 'star']);
  });

  test('collects icon names from nested elements', () => {
    const elements = [
      {
        type: 'frame',
        children: [
          { type: 'icon', lucideIcon: 'search', children: [] },
          {
            type: 'frame',
            children: [{ type: 'icon', lucideIcon: 'settings', children: [] }],
          },
        ],
      },
    ];
    expect(collectIconNames(elements)).toEqual(['search', 'settings']);
  });

  test('deduplicates icon names', () => {
    const elements = [
      { type: 'icon', lucideIcon: 'heart', children: [] },
      { type: 'icon', lucideIcon: 'heart', children: [] },
      { type: 'icon', lucideIcon: 'star', children: [] },
    ];
    expect(collectIconNames(elements)).toEqual(['heart', 'star']);
  });

  test('ignores icon elements without lucideIcon property', () => {
    const elements = [
      { type: 'icon', children: [] },
      { type: 'icon', lucideIcon: 'check', children: [] },
    ];
    expect(collectIconNames(elements)).toEqual(['check']);
  });
});

// ═══════════════════════════════════════════════════════════════
// fetchLucideIcon
// ═══════════════════════════════════════════════════════════════

describe('fetchLucideIcon', () => {
  test('fetches and parses SVG path elements', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<svg><path d="M10 10L20 20"/></svg>'),
    });

    const paths = await fetchLucideIcon('test-icon');
    expect(paths).toEqual(['M10 10L20 20']);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://unpkg.com/lucide-static@latest/icons/test-icon.svg'
    );
  });

  test('parses line elements into paths', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<svg><line x1="1" y1="2" x2="3" y2="4"/></svg>'),
    });

    const paths = await fetchLucideIcon('line-icon');
    expect(paths).toEqual(['M 1 2 L 3 4']);
  });

  test('parses polyline elements into paths', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<svg><polyline points="0 0 10 10 20 0"/></svg>'),
    });

    const paths = await fetchLucideIcon('polyline-icon');
    expect(paths).toEqual(['M 0 0 L 10 10 L 20 0']);
  });

  test('parses polygon elements into closed paths', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<svg><polygon points="0 0 10 10 20 0"/></svg>'),
    });

    const paths = await fetchLucideIcon('polygon-icon');
    expect(paths).toEqual(['M 0 0 L 10 10 L 20 0 Z']);
  });

  test('parses rect elements into paths', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<svg><rect x="0" y="0" width="10" height="10"/></svg>'),
    });

    const paths = await fetchLucideIcon('rect-icon');
    expect(paths).toEqual(['M 0 0 L 10 0 L 10 10 L 0 10 Z']);
  });

  test('returns cached result on second call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<svg><path d="M1 1"/></svg>'),
    });

    // First call - should fetch
    await fetchLucideIcon('cached-icon');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    const paths = await fetchLucideIcon('cached-icon');
    expect(paths).toEqual(['M1 1']);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Still only 1 call
  });

  test('returns empty array when fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const paths = await fetchLucideIcon('missing-icon');
    expect(paths).toEqual([]);
  });

  test('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const paths = await fetchLucideIcon('error-icon');
    expect(paths).toEqual([]);
  });

  test('returns empty array for empty SVG', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(''),
    });

    const paths = await fetchLucideIcon('empty-icon');
    expect(paths).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// fetchAllIcons
// ═══════════════════════════════════════════════════════════════

describe('fetchAllIcons', () => {
  test('returns analysis unchanged when no icons', async () => {
    const analysis = {
      width: 100,
      height: 100,
      backgroundColor: '#FFF',
      elements: [{ type: 'frame', children: [] }],
    };

    const result = await fetchAllIcons(analysis);
    expect(result).toBe(analysis);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('fetches icons and attaches svgPaths to elements', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<svg><path d="M5 5"/></svg>'),
    });

    const analysis = {
      width: 100,
      height: 100,
      backgroundColor: '#FFF',
      elements: [{ type: 'icon', lucideIcon: 'heart', children: [] }],
    };

    const result = await fetchAllIcons(analysis);
    expect(result.elements[0].svgPaths).toEqual(['M5 5']);
  });

  test('calls progress callback during fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<svg><path d="M1 1"/></svg>'),
    });

    const progressCallback = jest.fn();
    setIconProgress(progressCallback);

    const analysis = {
      width: 100,
      height: 100,
      backgroundColor: '#FFF',
      elements: [
        { type: 'icon', lucideIcon: 'icon1', children: [] },
        { type: 'icon', lucideIcon: 'icon2', children: [] },
      ],
    };

    await fetchAllIcons(analysis);

    expect(progressCallback).toHaveBeenCalled();
    // Progress should be between 60% and 75%
    const calls = progressCallback.mock.calls;
    calls.forEach((call: any[]) => {
      expect(call[0]).toBeGreaterThanOrEqual(60);
      expect(call[0]).toBeLessThanOrEqual(75);
    });

    // Cleanup
    setIconProgress(() => {});
  });
});
