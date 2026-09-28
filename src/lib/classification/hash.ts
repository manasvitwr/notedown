import { CACHE_LIMIT } from "./config";
import type { CaptureContext } from "./types";

/**
 * Bounded memo cache for classification results.
 *
 * Classification is a pure function of (content, context), so results are
 * cached by content hash. This keeps repeated work — re-saving, re-parsing, a
 * preview re-render — free without ever letting memory grow without bound.
 */

const cache = new Map<string, unknown>();

/** FNV-1a, 32-bit. Fast, dependency-free, and only used as a cache key. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Cache key for a classification. Context is part of the key because metadata
 * (a filename, a mime type) changes the answer, not just the content.
 */
export function classificationKey(
  content: string,
  context?: CaptureContext
): string {
  const contextKey = context
    ? [
        context.source ?? "",
        context.filename ?? "",
        context.fileExtension ?? "",
        context.mimeType ?? "",
        context.blockType ?? "",
        (context.assetIds ?? []).join(","),
      ].join("|")
    : "";
  return `${fnv1a(content)}:${content.length}:${fnv1a(contextKey)}`;
}

export function readCache<T>(key: string): T | undefined {
  if (!cache.has(key)) return undefined;
  // Refresh recency for the LRU eviction order.
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value as T;
}

export function writeCache(key: string, value: unknown): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/** Drop all memoized results (tests, and any future "force reclassify"). */
export function clearClassificationCache(): void {
  cache.clear();
}
