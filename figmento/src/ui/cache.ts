// Response caching for AI analysis results
// Uses an in-memory LRU cache with configurable max size and TTL

import type { UIAnalysis, AIProvider } from '../types';

interface CacheEntry {
  data: UIAnalysis;
  createdAt: number;
  lastAccessedAt: number;
}

// --- Configuration ---

const DEFAULT_MAX_SIZE = 10;
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

let maxSize = DEFAULT_MAX_SIZE;
let ttlMs = DEFAULT_TTL_MS;

// --- Internal cache store ---

const cache = new Map<string, CacheEntry>();

// --- Hash utility ---

/**
 * Fast non-cryptographic string hash (FNV-1a inspired).
 * Produces a hex string from the input.
 */
function fastHash(input: string): string {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, keep as unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

// --- Public API ---

/**
 * Generate a cache key from the image data, provider, and settings object.
 * The key is a hex hash derived from the concatenation of all inputs.
 */
export function generateCacheKey(
  imageBase64: string,
  provider: AIProvider,
  settings: Record<string, unknown>
): string {
  const settingsStr = JSON.stringify(settings);
  const combined = `${provider}:${settingsStr}:${imageBase64}`;
  return fastHash(combined);
}

/**
 * Retrieve a cached response by key.
 * Returns the cached UIAnalysis if found and not expired, otherwise undefined.
 * Accessing an entry refreshes its LRU position.
 */
export function getCachedResponse(key: string): UIAnalysis | undefined {
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }

  // Check TTL expiration
  const now = Date.now();
  if (now - entry.createdAt > ttlMs) {
    cache.delete(key);
    return undefined;
  }

  // Refresh LRU position: delete and re-insert so this entry moves to the end
  cache.delete(key);
  entry.lastAccessedAt = now;
  cache.set(key, entry);

  return entry.data;
}

/**
 * Store an AI analysis response in the cache.
 * If the cache is full, the least recently used entry is evicted first.
 */
export function setCachedResponse(key: string, data: UIAnalysis): void {
  // If the key already exists, remove it first so re-insertion moves it to the end
  if (cache.has(key)) {
    cache.delete(key);
  }

  // Evict LRU entry if at capacity
  if (cache.size >= maxSize) {
    // Map iterates in insertion order; the first key is the least recently used
    const lruKey = cache.keys().next().value;
    if (lruKey !== undefined) {
      cache.delete(lruKey);
    }
  }

  const now = Date.now();
  cache.set(key, {
    data,
    createdAt: now,
    lastAccessedAt: now,
  });
}

/**
 * Clear all entries from the cache.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get statistics about the current cache state.
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  ttlMs: number;
  keys: string[];
} {
  // Purge expired entries before reporting stats
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > ttlMs) {
      cache.delete(key);
    }
  }

  return {
    size: cache.size,
    maxSize,
    ttlMs,
    keys: Array.from(cache.keys()),
  };
}

/**
 * Reconfigure cache limits. Existing entries that exceed the new max size
 * will be evicted (oldest first).
 */
export function configureCache(options: {
  maxSize?: number;
  ttlMs?: number;
}): void {
  if (options.maxSize !== undefined && options.maxSize > 0) {
    maxSize = options.maxSize;
  }
  if (options.ttlMs !== undefined && options.ttlMs > 0) {
    ttlMs = options.ttlMs;
  }

  // Evict excess entries if new max size is smaller
  while (cache.size > maxSize) {
    const lruKey = cache.keys().next().value;
    if (lruKey !== undefined) {
      cache.delete(lruKey);
    }
  }
}
