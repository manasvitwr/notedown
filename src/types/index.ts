// ─── Block Types ────────────────────────────────────────────
export type BlockType = "text" | "image" | "code" | "transcript" | "link" | "mixed";

// ─── Image Types ────────────────────────────────────────────
export type ImageMime = "image/webp" | "image/jpeg" | "image/png";

// ─── Storage Mode ───────────────────────────────────────────
export type StorageMode = "inline" | "folder" | "hybrid";

// ─── Editor Mode ────────────────────────────────────────────
export type EditorMode = "markdown" | "preview" | "data";

// ─── Save Status ────────────────────────────────────────────
export type SaveStatus = "saved" | "saving" | "error" | "unsaved";

// ─── Block ──────────────────────────────────────────────────
export interface Block {
  id: string;
  type: BlockType;
  content: string;
  createdAt: string;
  updatedAt?: string;
  tags: string[];
  assetIds: string[];
  source?: string;
  collapsed?: boolean;
}

// ─── Asset ──────────────────────────────────────────────────
export interface Asset {
  id: string;
  kind: "image";
  mime: ImageMime;
  base64: string;
  width: number;
  height: number;
  originalWidth?: number;
  originalHeight?: number;
  sizeBytes: number;
  originalSizeBytes?: number;
  createdAt: string;
  alt?: string;
}

// ─── Document Settings ──────────────────────────────────────
export interface DocumentSettings {
  storageMode: StorageMode;
  imageMaxWidth: number;
  imageQuality: number;
  preferredImageMime: ImageMime;
  timezone: string;
}

// ─── Document State ─────────────────────────────────────────
export interface DocumentState {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
  blocks: Block[];
  assets: Record<string, Asset>;
  settings: DocumentSettings;
}

// ─── Outline Item (derived) ─────────────────────────────────
export interface OutlineItem {
  id: string;
  label: string;
  type: BlockType;
  time: string;
}

// ─── Recent Document (summary) ──────────────────────────────
export interface RecentDoc {
  id: string;
  title: string;
  updatedAt: string;
  blockCount: number;
}
