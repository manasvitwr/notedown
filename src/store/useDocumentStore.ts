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
import { createEmptyDocument } from "../constants/defaults";
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

  // ─── Document Actions ───────────────────────────────────
  newDocument: (title: string) => void;
  setDocument: (doc: DocumentState) => void;

  // ─── Block Actions ──────────────────────────────────────
  appendBlock: (block: Block) => void;
  appendBlocks: (blocks: Block[], assets: Asset[]) => void;
  deleteBlock: (blockId: string) => void;

  // ─── Asset Actions ──────────────────────────────────────
  addAsset: (asset: Asset) => void;

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

  // ─── Document Actions ───────────────────────────────────

  newDocument: (title: string) => {
    const doc = createEmptyDocument(nanoid(), title);
    const md = serializeDocument(doc);
    set({ doc, serializedMarkdown: md, saveStatus: "unsaved" });
  },

  setDocument: (doc: DocumentState) => {
    const md = serializeDocument(doc);
    set({ doc, serializedMarkdown: md, saveStatus: "unsaved" });
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
    const md = serializeDocument(updated);
    set({ doc: updated, serializedMarkdown: md, saveStatus: "unsaved" });
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
    const md = serializeDocument(updated);
    set({ doc: updated, serializedMarkdown: md, saveStatus: "unsaved" });
  },

  deleteBlock: (blockId: string) => {
    const { doc } = get();
    if (!doc) return;
    const updated: DocumentState = {
      ...doc,
      blocks: doc.blocks.filter((b) => b.id !== blockId),
      updatedAt: new Date().toISOString(),
    };
    const md = serializeDocument(updated);
    set({ doc: updated, serializedMarkdown: md, saveStatus: "unsaved" });
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
    const { serializedMarkdown } = get();
    return stringByteSize(serializedMarkdown);
  },

  getPortableScore: () => {
    const { serializedMarkdown } = get();
    return calculatePortableScore(stringByteSize(serializedMarkdown));
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
