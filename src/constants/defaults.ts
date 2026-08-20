import type { DocumentSettings, DocumentState } from "../types";

// ─── Default Settings ───────────────────────────────────────
export const DEFAULT_SETTINGS: DocumentSettings = {
  storageMode: "inline",
  imageMaxWidth: 1200,
  imageQuality: 0.72,
  preferredImageMime: "image/webp",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// ─── Notedown Format Version ────────────────────────────────
export const NOTEDOWN_VERSION = 1;

// ─── File Extension ─────────────────────────────────────────
export const FILE_EXTENSION = ".nd.md";

// ─── ID Prefixes ────────────────────────────────────────────
export const BLOCK_PREFIX = "b_";
export const ASSET_PREFIX = "img_";

// ─── Autosave Debounce ──────────────────────────────────────
export const AUTOSAVE_DEBOUNCE_MS = 500;

// ─── File Size Thresholds ───────────────────────────────────
export const FILE_SIZE_WARN_BYTES = 5 * 1024 * 1024;  // 5 MB
export const PORTABLE_SCORE_MIN_BYTES = 50_000;        // 50 KB = score 100
export const PORTABLE_SCORE_MAX_BYTES = 20_000_000;    // 20 MB = score 0

// ─── Factory ────────────────────────────────────────────────
export function createEmptyDocument(id: string, title: string): DocumentState {
  const now = new Date().toISOString();
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    id,
    title,
    filename: `${slug}${FILE_EXTENSION}`,
    createdAt: now,
    updatedAt: now,
    blocks: [],
    assets: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}
