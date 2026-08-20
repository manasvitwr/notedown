import { PORTABLE_SCORE_MIN_BYTES, PORTABLE_SCORE_MAX_BYTES } from "../constants/defaults";

/**
 * Format byte count to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Calculate portable score (0-100).
 * 100 = tiny file (<50KB), 0 = huge file (>20MB).
 */
export function calculatePortableScore(totalBytes: number): number {
  if (totalBytes <= PORTABLE_SCORE_MIN_BYTES) return 100;
  if (totalBytes >= PORTABLE_SCORE_MAX_BYTES) return 0;
  return Math.round(
    100 - ((totalBytes - PORTABLE_SCORE_MIN_BYTES) / (PORTABLE_SCORE_MAX_BYTES - PORTABLE_SCORE_MIN_BYTES)) * 100
  );
}

/**
 * Estimate the byte size of a string (UTF-8).
 */
export function stringByteSize(str: string): number {
  return new Blob([str]).size;
}
