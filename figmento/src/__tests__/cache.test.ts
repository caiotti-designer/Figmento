// Mock the state module to avoid DOM dependencies
jest.mock('../ui/state', () => ({
  dom: {},
}));

import {
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
  clearCache,
  getCacheStats,
  configureCache,
} from '../ui/cache';
import type { UIAnalysis } from '../types';

const mockAnalysis: UIAnalysis = {
  width: 800,
  height: 600,
  backgroundColor: '#FFF',
  elements: [],
};

beforeEach(() => {
  clearCache();
  configureCache({ maxSize: 10, ttlMs: 30 * 60 * 1000 });
});

// ---------------------------------------------------------------------------
// generateCacheKey
// ---------------------------------------------------------------------------

describe('generateCacheKey', () => {
  test('same inputs produce the same key', () => {
    const key1 = generateCacheKey('abc123', 'claude', { quality: 'high' });
    const key2 = generateCacheKey('abc123', 'claude', { quality: 'high' });
    expect(key1).toBe(key2);
  });

  test('different image data produces a different key', () => {
    const key1 = generateCacheKey('imageA', 'claude', { quality: 'high' });
    const key2 = generateCacheKey('imageB', 'claude', { quality: 'high' });
    expect(key1).not.toBe(key2);
  });

  test('different provider produces a different key', () => {
    const key1 = generateCacheKey('img', 'claude', { quality: 'high' });
    const key2 = generateCacheKey('img', 'openai', { quality: 'high' });
    expect(key1).not.toBe(key2);
  });

  test('different settings produce a different key', () => {
    const key1 = generateCacheKey('img', 'claude', { quality: 'high' });
    const key2 = generateCacheKey('img', 'claude', { quality: 'low' });
    expect(key1).not.toBe(key2);
  });

  test('key is an 8-character hex string', () => {
    const key = generateCacheKey('data', 'gemini', { mode: 'fast' });
    expect(key).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// setCachedResponse + getCachedResponse
// ---------------------------------------------------------------------------

describe('setCachedResponse + getCachedResponse', () => {
  test('stores and retrieves a cached response', () => {
    setCachedResponse('key1', mockAnalysis);
    const result = getCachedResponse('key1');
    expect(result).toEqual(mockAnalysis);
  });

  test('returns undefined for a missing key', () => {
    const result = getCachedResponse('nonexistent');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// LRU eviction
// ---------------------------------------------------------------------------

describe('LRU eviction', () => {
  beforeEach(() => {
    configureCache({ maxSize: 3 });
  });

  test('evicts the oldest entry when the cache is full', () => {
    setCachedResponse('a', mockAnalysis);
    setCachedResponse('b', mockAnalysis);
    setCachedResponse('c', mockAnalysis);

    // Cache is now full (3/3). Inserting a fourth should evict 'a'.
    setCachedResponse('d', mockAnalysis);

    expect(getCachedResponse('a')).toBeUndefined();
    expect(getCachedResponse('b')).toBeDefined();
    expect(getCachedResponse('c')).toBeDefined();
    expect(getCachedResponse('d')).toBeDefined();
  });

  test('evicts entries in insertion order (FIFO for untouched entries)', () => {
    setCachedResponse('x', mockAnalysis);
    setCachedResponse('y', mockAnalysis);
    setCachedResponse('z', mockAnalysis);

    // Inserting two more should evict 'x' then 'y'
    setCachedResponse('w1', mockAnalysis);
    setCachedResponse('w2', mockAnalysis);

    expect(getCachedResponse('x')).toBeUndefined();
    expect(getCachedResponse('y')).toBeUndefined();
    expect(getCachedResponse('z')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// LRU refresh on access
// ---------------------------------------------------------------------------

describe('LRU refresh on access', () => {
  beforeEach(() => {
    configureCache({ maxSize: 3 });
  });

  test('accessing an entry prevents it from being evicted', () => {
    setCachedResponse('a', mockAnalysis);
    setCachedResponse('b', mockAnalysis);
    setCachedResponse('c', mockAnalysis);

    // Access 'a' so it becomes the most recently used
    getCachedResponse('a');

    // Insert a new entry; 'b' should be evicted (it is now the LRU)
    setCachedResponse('d', mockAnalysis);

    expect(getCachedResponse('a')).toBeDefined();
    expect(getCachedResponse('b')).toBeUndefined();
    expect(getCachedResponse('c')).toBeDefined();
    expect(getCachedResponse('d')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TTL expiry
// ---------------------------------------------------------------------------

describe('TTL expiry', () => {
  test('returns undefined for an expired entry', () => {
    configureCache({ ttlMs: 1000 }); // 1 second TTL

    const realDateNow = Date.now;
    let currentTime = realDateNow.call(Date);

    const spy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

    setCachedResponse('ttl-key', mockAnalysis);

    // Still within TTL
    expect(getCachedResponse('ttl-key')).toEqual(mockAnalysis);

    // Advance time past TTL
    currentTime += 2000;

    expect(getCachedResponse('ttl-key')).toBeUndefined();

    spy.mockRestore();
  });

  test('entry is still available before TTL expires', () => {
    configureCache({ ttlMs: 5000 });

    const realDateNow = Date.now;
    let currentTime = realDateNow.call(Date);

    const spy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

    setCachedResponse('fresh-key', mockAnalysis);

    // Advance time but stay within TTL
    currentTime += 3000;

    expect(getCachedResponse('fresh-key')).toEqual(mockAnalysis);

    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// clearCache
// ---------------------------------------------------------------------------

describe('clearCache', () => {
  test('removes all entries from the cache', () => {
    setCachedResponse('a', mockAnalysis);
    setCachedResponse('b', mockAnalysis);
    setCachedResponse('c', mockAnalysis);

    clearCache();

    expect(getCacheStats().size).toBe(0);
    expect(getCachedResponse('a')).toBeUndefined();
    expect(getCachedResponse('b')).toBeUndefined();
    expect(getCachedResponse('c')).toBeUndefined();
  });

  test('keys array is empty after clearing', () => {
    setCachedResponse('x', mockAnalysis);
    clearCache();
    expect(getCacheStats().keys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getCacheStats
// ---------------------------------------------------------------------------

describe('getCacheStats', () => {
  test('returns correct size and keys', () => {
    setCachedResponse('s1', mockAnalysis);
    setCachedResponse('s2', mockAnalysis);

    const stats = getCacheStats();
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(10);
    expect(stats.ttlMs).toBe(30 * 60 * 1000);
    expect(stats.keys).toContain('s1');
    expect(stats.keys).toContain('s2');
    expect(stats.keys).toHaveLength(2);
  });

  test('reports size 0 for an empty cache', () => {
    const stats = getCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.keys).toEqual([]);
  });

  test('purges expired entries when reporting stats', () => {
    configureCache({ ttlMs: 1000 });

    const realDateNow = Date.now;
    let currentTime = realDateNow.call(Date);

    const spy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

    setCachedResponse('alive', mockAnalysis);

    // Advance time past TTL
    currentTime += 2000;

    const stats = getCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.keys).not.toContain('alive');

    spy.mockRestore();
  });

  test('only purges expired entries, keeps valid ones', () => {
    configureCache({ ttlMs: 5000 });

    const realDateNow = Date.now;
    let currentTime = realDateNow.call(Date);

    const spy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

    setCachedResponse('early', mockAnalysis);

    // Advance time but not past TTL
    currentTime += 3000;

    setCachedResponse('late', mockAnalysis);

    // Advance further so 'early' expires (total 6000ms) but 'late' is still valid (3000ms)
    currentTime += 3000;

    const stats = getCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.keys).toContain('late');
    expect(stats.keys).not.toContain('early');

    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// configureCache
// ---------------------------------------------------------------------------

describe('configureCache', () => {
  test('reducing maxSize evicts excess entries (oldest first)', () => {
    setCachedResponse('a', mockAnalysis);
    setCachedResponse('b', mockAnalysis);
    setCachedResponse('c', mockAnalysis);
    setCachedResponse('d', mockAnalysis);
    setCachedResponse('e', mockAnalysis);

    configureCache({ maxSize: 2 });

    const stats = getCacheStats();
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(2);

    // The oldest entries ('a', 'b', 'c') should have been evicted
    expect(getCachedResponse('a')).toBeUndefined();
    expect(getCachedResponse('b')).toBeUndefined();
    expect(getCachedResponse('c')).toBeUndefined();

    // The newest entries ('d', 'e') should remain
    expect(getCachedResponse('d')).toBeDefined();
    expect(getCachedResponse('e')).toBeDefined();
  });

  test('ignores maxSize of 0', () => {
    setCachedResponse('keep', mockAnalysis);

    configureCache({ maxSize: 0 });

    const stats = getCacheStats();
    // maxSize should remain at the previous value (10 from beforeEach)
    expect(stats.maxSize).toBe(10);
    expect(stats.size).toBe(1);
  });

  test('ignores negative maxSize', () => {
    configureCache({ maxSize: 5 });
    configureCache({ maxSize: -3 });

    const stats = getCacheStats();
    expect(stats.maxSize).toBe(5);
  });

  test('ignores ttlMs of 0', () => {
    configureCache({ ttlMs: 0 });

    const stats = getCacheStats();
    expect(stats.ttlMs).toBe(30 * 60 * 1000);
  });

  test('ignores negative ttlMs', () => {
    configureCache({ ttlMs: -100 });

    const stats = getCacheStats();
    expect(stats.ttlMs).toBe(30 * 60 * 1000);
  });

  test('updates ttlMs when valid', () => {
    configureCache({ ttlMs: 60000 });

    const stats = getCacheStats();
    expect(stats.ttlMs).toBe(60000);
  });
});

// ---------------------------------------------------------------------------
// Re-storing same key
// ---------------------------------------------------------------------------

describe('re-storing same key', () => {
  test('updating an existing key does not increase cache size', () => {
    const updatedAnalysis: UIAnalysis = {
      width: 1024,
      height: 768,
      backgroundColor: '#000',
      elements: [],
    };

    setCachedResponse('dup', mockAnalysis);
    setCachedResponse('dup', updatedAnalysis);

    const stats = getCacheStats();
    expect(stats.size).toBe(1);

    const result = getCachedResponse('dup');
    expect(result).toEqual(updatedAnalysis);
  });

  test('re-storing refreshes the entry to the most recent position', () => {
    configureCache({ maxSize: 3 });

    setCachedResponse('first', mockAnalysis);
    setCachedResponse('second', mockAnalysis);
    setCachedResponse('third', mockAnalysis);

    // Re-store 'first' so it moves to the end (most recent)
    setCachedResponse('first', mockAnalysis);

    // Insert a new entry; 'second' should now be the LRU and get evicted
    setCachedResponse('fourth', mockAnalysis);

    expect(getCachedResponse('first')).toBeDefined();
    expect(getCachedResponse('second')).toBeUndefined();
    expect(getCachedResponse('third')).toBeDefined();
    expect(getCachedResponse('fourth')).toBeDefined();
  });
});
