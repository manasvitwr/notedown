import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  DocumentState,
  Block,
  Asset,
  EditorMode,
  SaveStatus,
  RecentDoc,
} from "../types";
import { createEmptyDocument, BLOCK_PREFIX, ASSET_PREFIX } from "../constants/defaults";
import { serializeDocument } from "../lib/markdownSerializer";
import { saveDocument, loadActiveDocument, getRecentDocuments } from "../lib/storage";
import { stringByteSize, calculatePortableScore } from "../lib/size";
import { formatBlockTime } from "../lib/dates";

interface DocumentStore {
  // ─── Document State ─────────────────────────────────────
  doc: DocumentState | null;

  // ─── UI State ───────────────────────────────────────────
  editorMode: EditorMode;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  recentDocs: RecentDoc[];
  serializedMarkdown: string;

  // ─── Monotonic ID counters (never reused after deletion) ─
  nextBlockNum: number;
  nextAssetNum: number;

  // ─── Document Actions ───────────────────────────────────
  newDocument: (title: string) => void;
  setDocument: (doc: DocumentState) => void;

  // ─── Block Actions ──────────────────────────────────────
  appendBlock: (block: Block) => void;
  appendBlocks: (blocks: Block[], assets: Asset[]) => void;
  deleteBlock: (blockId: string) => void;
  moveBlock: (blockId: string, direction: "up" | "down") => void;
  toggleBlockCollapse: (blockId: string) => void;

  // ─── Asset Actions ──────────────────────────────────────
  addAsset: (asset: Asset) => void;

  // ─── ID Allocation (atomic, monotonic) ──────────────────
  allocateBlockId: () => string;
  allocateAssetId: () => string;

  // ─── Editor ─────────────────────────────────────────────
  setEditorMode: (mode: EditorMode) => void;

  // ─── Serialization ──────────────────────────────────────
  reserialize: () => void;

  // ─── Persistence ────────────────────────────────────────
  saveToStorage: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  loadRecentDocs: () => Promise<void>;

  // ─── Derived ────────────────────────────────────────────
  getFileSize: () => number;
  getPortableScore: () => number;
  getOutline: () => Array<{ id: string; label: string; type: string }>;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  doc: null,
  editorMode: "preview",
  saveStatus: "saved",
  lastSavedAt: null,
  recentDocs: [],
  serializedMarkdown: "",
  nextBlockNum: 1,
  nextAssetNum: 1,

  // ─── Document Actions ───────────────────────────────────

  newDocument: (title: string) => {
    const doc = createEmptyDocument(nanoid(), title);
    const md = serializeDocument(doc);
    set({ doc, serializedMarkdown: md, saveStatus: "unsaved", nextBlockNum: 1, nextAssetNum: 1 });
  },

  setDocument: (doc: DocumentState) => {
    const md = serializeDocument(doc);
    // Initialize counters to be beyond any existing IDs
    const maxBlockNum = doc.blocks.reduce((max, b) => {
      const num = parseInt(b.id.replace(BLOCK_PREFIX, ""), 10);
      return num > max ? num : max;
    }, 0);
    const maxAssetNum = Object.keys(doc.assets).reduce((max, id) => {
      const num = parseInt(id.replace(ASSET_PREFIX, ""), 10);
      return num > max ? num : max;
    }, 0);
    set({
      doc,
      serializedMarkdown: md,
      saveStatus: "unsaved",
      nextBlockNum: maxBlockNum + 1,
      nextAssetNum: maxAssetNum + 1,
    });
  },

  // ─── Block Actions ──────────────────────────────────────

  appendBlock: (block: Block) => {
    const { doc } = get();
    if (!doc) return;
    const updated: DocumentState = {
      ...doc,
      blocks: [...doc.blocks, block],
      updatedAt: new Date().toISOString(),
    };
    // Defer serialization — recomputed lazily when needed (export, mode switch, etc.)
    set({ doc: updated, saveStatus: "unsaved" });
  },

  appendBlocks: (blocks: Block[], assets: Asset[]) => {
    const { doc } = get();
    if (!doc) return;
    const newAssets = { ...doc.assets };
    for (const asset of assets) {
      newAssets[asset.id] = asset;
    }
    const updated: DocumentState = {
      ...doc,
      blocks: [...doc.blocks, ...blocks],
      assets: newAssets,
      updatedAt: new Date().toISOString(),
    };
    // Defer serialization — recomputed lazily when needed
    set({ doc: updated, saveStatus: "unsaved" });
  },

  deleteBlock: (blockId: string) => {
    const { doc } = get();
    if (!doc) return;
    const remainingBlocks = doc.blocks.filter((b) => b.id !== blockId);

    // Clean up orphaned assets: remove assets no longer referenced by any block
    const remainingAssetIds = new Set(
      remainingBlocks.flatMap((b) => b.assetIds)
    );
    const cleanedAssets: Record<string, Asset> = {};
    for (const [id, asset] of Object.entries(doc.assets)) {
      if (remainingAssetIds.has(id)) {
        cleanedAssets[id] = asset;
      }
    }

    const updated: DocumentState = {
      ...doc,
      blocks: remainingBlocks,
      assets: cleanedAssets,
      updatedAt: new Date().toISOString(),
    };
    // Defer serialization — recomputed lazily when needed
    set({ doc: updated, saveStatus: "unsaved" });
  },

  moveBlock: (blockId: string, direction: "up" | "down") => {
    const { doc } = get();
    if (!doc) return;
    const idx = doc.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= doc.blocks.length) return;
    const newBlocks = [...doc.blocks];
    [newBlocks[idx], newBlocks[targetIdx]] = [newBlocks[targetIdx], newBlocks[idx]];
    const updated: DocumentState = {
      ...doc,
      blocks: newBlocks,
      updatedAt: new Date().toISOString(),
    };
    // Defer serialization — recomputed lazily when needed
    set({ doc: updated, saveStatus: "unsaved" });
  },

  toggleBlockCollapse: (blockId: string) => {
    const { doc } = get();
    if (!doc) return;
    const updated: DocumentState = {
      ...doc,
      blocks: doc.blocks.map((b) =>
        b.id === blockId ? { ...b, collapsed: !b.collapsed } : b
      ),
      updatedAt: new Date().toISOString(),
    };
    // Defer serialization — recomputed lazily when needed
    set({ doc: updated, saveStatus: "unsaved" });
  },

  // ─── Asset Actions ──────────────────────────────────────

  addAsset: (asset: Asset) => {
    const { doc } = get();
    if (!doc) return;
    const updated: DocumentState = {
      ...doc,
      assets: { ...doc.assets, [asset.id]: asset },
      updatedAt: new Date().toISOString(),
    };
    set({ doc: updated, saveStatus: "unsaved" });
  },

  // ─── ID Allocation (atomic, monotonic) ──────────────────

  allocateBlockId: () => {
    const { nextBlockNum } = get();
    const id = `${BLOCK_PREFIX}${String(nextBlockNum).padStart(3, "0")}`;
    set({ nextBlockNum: nextBlockNum + 1 });
    return id;
  },

  allocateAssetId: () => {
    const { nextAssetNum } = get();
    const id = `${ASSET_PREFIX}${String(nextAssetNum).padStart(3, "0")}`;
    set({ nextAssetNum: nextAssetNum + 1 });
    return id;
  },

  // ─── Editor ─────────────────────────────────────────────

  setEditorMode: (mode: EditorMode) => set({ editorMode: mode }),

  // ─── Serialization ──────────────────────────────────────

  reserialize: () => {
    const { doc } = get();
    if (!doc) return;
    const md = serializeDocument(doc);
    set({ serializedMarkdown: md });
  },

  // ─── Persistence ────────────────────────────────────────

  saveToStorage: async () => {
    const { doc } = get();
    if (!doc) return;
    set({ saveStatus: "saving" });
    try {
      await saveDocument(doc);
      set({ saveStatus: "saved", lastSavedAt: new Date().toISOString() });
    } catch (err) {
      console.error("Save failed:", err);
      set({ saveStatus: "error" });
    }
  },

  loadFromStorage: async () => {
    try {
      const doc = await loadActiveDocument();
      if (doc) {
        const md = serializeDocument(doc);
        set({
          doc,
          serializedMarkdown: md,
          saveStatus: "saved",
          lastSavedAt: doc.updatedAt,
        });
      }
    } catch (err) {
      console.error("Load failed:", err);
    }
  },

  loadRecentDocs: async () => {
    try {
      const recent = await getRecentDocuments();
      set({ recentDocs: recent });
    } catch (err) {
      console.error("Failed to load recent docs:", err);
    }
  },

  // ─── Derived ────────────────────────────────────────────

  getFileSize: () => {
    const { doc, serializedMarkdown } = get();
    // Use cached serializedMarkdown if available, otherwise estimate from doc
    if (serializedMarkdown) return stringByteSize(serializedMarkdown);
    if (!doc) return 0;
    // Quick estimate without full serialization
    return doc.blocks.reduce((sum, b) => sum + b.content.length, 0) +
      Object.values(doc.assets).reduce((sum, a) => sum + a.base64.length, 0);
  },

  getPortableScore: () => {
    const { doc, serializedMarkdown } = get();
    const size = serializedMarkdown
      ? stringByteSize(serializedMarkdown)
      : doc
        ? doc.blocks.reduce((sum, b) => sum + b.content.length, 0) +
          Object.values(doc.assets).reduce((sum, a) => sum + a.base64.length, 0)
        : 0;
    return calculatePortableScore(size);
  },

  getOutline: () => {
    const { doc } = get();
    if (!doc) return [];
    return doc.blocks.map((b) => {
      const time = formatBlockTime(b.createdAt, doc.settings.timezone);
      const typeLabel = b.type === "image" ? "screenshot" : b.type;
      return {
        id: b.id,
        label: `${time} · ${typeLabel}`,
        type: b.type,
      };
    });
  },
}));
