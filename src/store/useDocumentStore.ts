import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  DocumentState,
  Block,
  BlockType,
  Asset,
  EditorMode,
  SaveStatus,
  RecentDoc,
} from "../types";
import { createEmptyDocument, BLOCK_PREFIX, ASSET_PREFIX } from "../constants/defaults";
import { serializeDocument } from "../lib/markdownSerializer";
import {
  captureTypeOf,
  classifyCapture,
  formatCaptureContent,
  parseFence,
  toBlockClassification,
  userClassification,
} from "../lib/classification";
import type { BlockClassification, CodeLanguage } from "../lib/classification";
import { extractLinkedReferenceIds, sweepPreservedAssetLines } from "../lib/assetIds";
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
  reorderBlocks: (orderedIds: string[]) => void;
  toggleBlockCollapse: (blockId: string) => void;

  // ─── Classification ──────────────────────────────────────
  /**
   * User override: force a block's type. Recorded with `source: "user"` so no
   * later automatic pass can undo it.
   */
  setBlockType: (blockId: string, type: BlockType) => void;
  /** User override: force (or clear, with `undefined`) a block's language. */
  setBlockLanguage: (blockId: string, language?: CodeLanguage) => void;
  /**
   * Re-run the classifier on one block. A block the user has taken over is left
   * alone unless `force` is set, which is what makes overrides sticky.
   */
  classifyBlock: (blockId: string, options?: { force?: boolean }) => void;
  /** Classify every block that has no classification yet. */
  reclassifyUnclassified: () => void;

  // ─── Asset Actions ──────────────────────────────────────
  addAsset: (asset: Asset) => void;

  // ─── ID Allocation (atomic, monotonic) ──────────────────
  allocateBlockId: () => string;
  allocateAssetId: () => string;
  allocateBlockIds: (count: number) => string[];
  allocateAssetIds: (count: number) => string[];

  // ─── Editor ─────────────────────────────────────────────
  setEditorMode: (mode: EditorMode) => void;

  // ─── Assets Panel UI (not persisted) ────────────────────
  assetsExpanded: boolean;
  highlightAsset: { assetId: string; nonce: number } | null;
  setAssetsExpanded: (open: boolean) => void;
  requestAssetHighlight: (assetId: string) => void;
  clearAssetHighlight: () => void;

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

/**
 * Return the monotonic ID counters advanced past any ID present in `doc`,
 * without ever moving them backwards from their current value. IDs handed out
 * by allocateBlockId/allocateAssetId are therefore always unique and never
 * reissued after a block/asset is deleted.
 */
function advanceIdCounters(
  doc: DocumentState,
  current: { nextBlockNum: number; nextAssetNum: number }
): { nextBlockNum: number; nextAssetNum: number } {
  const maxBlockNum = doc.blocks.reduce((max, b) => {
    const num = parseInt(b.id.replace(BLOCK_PREFIX, ""), 10);
    return num > max ? num : max;
  }, 0);
  const maxAssetNum = Object.keys(doc.assets).reduce((max, id) => {
    const num = parseInt(id.replace(ASSET_PREFIX, ""), 10);
    return num > max ? num : max;
  }, 0);
  return {
    nextBlockNum: Math.max(current.nextBlockNum, maxBlockNum + 1),
    nextAssetNum: Math.max(current.nextAssetNum, maxAssetNum + 1),
  };
}

/**
 * Classify a block's own content, looking through the fence first.
 *
 * A code block is stored fenced, and the fence would otherwise be the loudest
 * thing in the content — so the body is what gets classified, and the fence is
 * rewritten afterwards from the verdict.
 */
function classifyBlockContent(block: Block) {
  const fenced = parseFence(block.content);
  return classifyCapture(fenced ? fenced.body : block.content, {
    source: "manual",
    blockType: block.type,
    assetIds: block.assetIds,
  });
}

/**
 * Write a classification verdict onto a block: type, markdown form and metadata
 * always move together, so the badge can never contradict the stored content.
 */
function applyClassification(
  block: Block,
  result: ReturnType<typeof classifyCapture>,
  source: BlockClassification["source"]
): Block {
  const fenced = parseFence(block.content);
  const body = fenced ? fenced.body : block.content;
  const classification = toBlockClassification(result, source);
  return {
    ...block,
    type: result.blockType,
    content: formatCaptureContent(result, body),
    ...(classification ? { classification } : { classification: undefined }),
  };
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
  assetsExpanded: false,
  highlightAsset: null,

  // ─── Document Actions ───────────────────────────────────

  newDocument: (title: string) => {
    const doc = createEmptyDocument(nanoid(), title);
    const md = serializeDocument(doc);
    set({ doc, serializedMarkdown: md, saveStatus: "unsaved", nextBlockNum: 1, nextAssetNum: 1 });
  },

  setDocument: (doc: DocumentState) => {
    const md = serializeDocument(doc);
    set({
      doc,
      serializedMarkdown: md,
      saveStatus: "unsaved",
      ...advanceIdCounters(doc, get()),
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

    // Clean up orphaned assets: remove assets no longer referenced by any block.
    // Ids are derived from the surviving blocks' content with the same extractor
    // the markdown sync sweep uses, so both deletion paths agree and a stale
    // block.assetIds (image refs only) can't drop a still-referenced asset.
    const remainingAssetIds = new Set(
      remainingBlocks.flatMap((b) => extractLinkedReferenceIds(b.content))
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
      // Same orphan rule the markdown sync sweep uses, so deleting a block
      // prunes the preserved data-section lines it referenced in either mode.
      preservedAssetLines: sweepPreservedAssetLines(
        doc.preservedAssetLines ?? [],
        remainingAssetIds
      ),
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

  reorderBlocks: (orderedIds: string[]) => {
    const { doc } = get();
    if (!doc) return;
    if (orderedIds.length !== doc.blocks.length) return;
    const idSet = new Set(doc.blocks.map((b) => b.id));
    if (orderedIds.length !== new Set(orderedIds).size) return;
    if (!orderedIds.every((id) => idSet.has(id))) return;
    const byId = new Map(doc.blocks.map((b) => [b.id, b]));
    const updated: DocumentState = {
      ...doc,
      blocks: orderedIds
        .map((id) => byId.get(id))
        .filter((b): b is Block => Boolean(b)),
      updatedAt: new Date().toISOString(),
    };
    // Defer serialization — recomputed lazily when needed
    set({ doc: updated, saveStatus: "unsaved" });
  },

  // ─── Classification ──────────────────────────────────────

  setBlockType: (blockId: string, type: BlockType) => {
    const { doc } = get();
    if (!doc) return;
    const updated: DocumentState = {
      ...doc,
      blocks: doc.blocks.map((b) => {
        if (b.id !== blockId) return b;
        // The user's chosen type *is* the verdict here, so the stored markdown
        // is shaped by the same formatter the capture paths use rather than by
        // a second copy of the unwrap/fence rule. Naming a language is the other
        // half of that verdict, and `setBlockLanguage` covers it.
        const content = formatCaptureContent(
          {
            type: captureTypeOf(type),
            language: type === "code" ? b.classification?.language : undefined,
          },
          b.content
        );
        const next: Block = {
          ...b,
          type,
          content,
          updatedAt: new Date().toISOString(),
        };
        // A user override is explicit and final: `confidence: 1` records that
        // this was not a guess, and `source: "user"` makes later automatic
        // passes skip the block.
        next.classification =
          type === "code"
            ? userClassification(b.classification?.language)
            : { source: "user", confidence: 1 };
        return next;
      }),
      updatedAt: new Date().toISOString(),
    };
    set({ doc: updated, saveStatus: "unsaved" });
    get().reserialize();
  },

  setBlockLanguage: (blockId: string, language?: CodeLanguage) => {
    const { doc } = get();
    if (!doc) return;
    const updated: DocumentState = {
      ...doc,
      blocks: doc.blocks.map((b) => {
        if (b.id !== blockId) return b;
        // Naming a language implies the block is code, so the fence and the
        // type follow the choice instead of contradicting it.
        const next: Block = {
          ...b,
          type: "code",
          content: formatCaptureContent({ type: "code", language }, b.content),
          classification: userClassification(language),
          updatedAt: new Date().toISOString(),
        };
        return next;
      }),
      updatedAt: new Date().toISOString(),
    };
    set({ doc: updated, saveStatus: "unsaved" });
    get().reserialize();
  },

  classifyBlock: (blockId: string, options) => {
    const { doc } = get();
    if (!doc) return;
    const force = options?.force ?? false;
    const updated: DocumentState = {
      ...doc,
      blocks: doc.blocks.map((b) => {
        if (b.id !== blockId) return b;
        if (b.classification?.source === "user" && !force) return b;
        return applyClassification(b, classifyBlockContent(b), "automatic");
      }),
      updatedAt: new Date().toISOString(),
    };
    set({ doc: updated, saveStatus: "unsaved" });
    get().reserialize();
  },

  reclassifyUnclassified: () => {
    const { doc } = get();
    if (!doc) return;
    let changed = false;
    const updated: DocumentState = {
      ...doc,
      blocks: doc.blocks.map((b) => {
        if (b.classification) return b;
        changed = true;
        return applyClassification(b, classifyBlockContent(b), "automatic");
      }),
      updatedAt: new Date().toISOString(),
    };
    if (!changed) return;
    set({ doc: updated, saveStatus: "unsaved" });
    get().reserialize();
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

  allocateBlockIds: (count: number) => {
    const { nextBlockNum } = get();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(`${BLOCK_PREFIX}${String(nextBlockNum + i).padStart(3, "0")}`);
    }
    set({ nextBlockNum: nextBlockNum + count });
    return ids;
  },

  allocateAssetIds: (count: number) => {
    const { nextAssetNum } = get();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(`${ASSET_PREFIX}${String(nextAssetNum + i).padStart(3, "0")}`);
    }
    set({ nextAssetNum: nextAssetNum + count });
    return ids;
  },

  // ─── Editor ─────────────────────────────────────────────

  setEditorMode: (mode: EditorMode) => {
    // Entering markdown always reads the freshest serialization. Appends defer
    // serialization, so a tab switch (incl. scrollToBlock's) must resync; the
    // pending draft itself is flushed by the textarea blur before the switch.
    if (mode === "markdown") get().reserialize();
    set({ editorMode: mode });
  },

  // ─── Assets Panel UI (not persisted) ────────────────────

  setAssetsExpanded: (open: boolean) => set({ assetsExpanded: open }),

  requestAssetHighlight: (assetId: string) =>
    set((state) => {
      // Only expand/highlight when the asset actually exists — a dangling
      // reference must not force the panel open or burn a stale highlight.
      if (!state.doc?.assets[assetId]) {
        return { highlightAsset: null };
      }
      return {
        assetsExpanded: true,
        highlightAsset: { assetId, nonce: Date.now() },
      };
    }),

  clearAssetHighlight: () => set({ highlightAsset: null }),

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
          ...advanceIdCounters(doc, get()),
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
