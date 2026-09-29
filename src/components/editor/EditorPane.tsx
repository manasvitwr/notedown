import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent } from "react";
import { Panel } from "../shared/Panel";
import { ModeToggle } from "./ModeToggle";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { DataView } from "./DataView";
import { AssetSection } from "./AssetSection";
import { StatusBar } from "./StatusBar";
import { useDocumentStore } from "../../store/useDocumentStore";
import { parseNotedownFile, createBlockSectionRegex, stripDataSection } from "../../lib/markdownParser";
import { extractAssetIds, extractLinkedReferenceIds, sweepPreservedAssetLines } from "../../lib/assetIds";
import { serializeDocument } from "../../lib/markdownSerializer";
import { processPaste } from "../../lib/clipboard";
import { classifyAndFormatCapture, toBlockClassification } from "../../lib/classification";
import type { Block, EditorMode } from "../../types";

// Debounce between a raw markdown keystroke and the store round-trip.
const MARKDOWN_SYNC_DEBOUNCE_MS = 400;

/**
 * Extract text that appears outside <!-- nd:block --> / <!-- nd:endblock --> fences
 * in a .nd.md markdown string. This catches content typed/pasted into the
 * markdown editor that wasn't wrapped in block comment markers.
 */
function extractFreeTextOutsideBlocks(md: string): string {
  // Remove frontmatter
  const noFrontmatter = md.replace(/^---\n[\s\S]*?\n---\n*/, "");
  // Remove all block sections using the same fence pattern as the parser, so a
  // section is only stripped when the parser would also recognize it as a block
  // (a malformed inline fence is left as free text rather than silently dropped).
  const noBlocks = noFrontmatter.replace(createBlockSectionRegex(), "");
  // Remove nd:data section through the fence-aware helper, so a data marker
  // living inside a block is treated the same way the editor treats it.
  const noData = stripDataSection(noBlocks);
  // Strip the leading title line (# ...) emitted by the serializer. Start-of-
  // string only, so a user's own "# heading" inside pasted content is preserved.
  const stripped = noData.replace(/^#\s+.+\n?/, "");
  // Strip block heading lines (## HH:MM · type)
  const cleaned = stripped
    .split("\n")
    .filter((line) => !/^##\s+\d{2}:\d{2}\s+·\s+\S+/.test(line))
    .join("\n");

  // Only return if there's meaningful content (not just whitespace)
  return cleaned.trim();
}

export function EditorPane() {
  const doc = useDocumentStore((s) => s.doc);
  const editorMode = useDocumentStore((s) => s.editorMode);
  const setEditorMode = useDocumentStore((s) => s.setEditorMode);
  const serializedMarkdown = useDocumentStore((s) => s.serializedMarkdown);
  const setDocument = useDocumentStore((s) => s.setDocument);
  const reserialize = useDocumentStore((s) => s.reserialize);
  const allocateBlockId = useDocumentStore((s) => s.allocateBlockId);
  const allocateAssetId = useDocumentStore((s) => s.allocateAssetId);
  const appendBlocks = useDocumentStore((s) => s.appendBlocks);

  // Markdown editing buffer. `null` means the textarea mirrors the store
  // serialization; a string means the user is actively typing raw markdown.
  const [draft, setDraft] = useState<string | null>(null);
  const markdownEditorRef = useRef<HTMLTextAreaElement | null>(null);

  // Debounced round-trip of raw markdown edits back into the store.
  const pendingSyncRef = useRef<string | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncMarkdownToStoreRef = useRef<(md: string) => void>(() => {});

  // Sync edited markdown back to structured state.
  const syncMarkdownToStore = useCallback(
    (md: string) => {
      if (!doc) return;
      try {
        const parsed = parseNotedownFile(md, doc.filename);

        // Re-parsing rebuilds blocks from scratch (source becomes "import",
        // tags/updatedAt are dropped). Restore fields that the serializer does
        // not emit so a mode switch never erases that metadata.
        const existingById = new Map(doc.blocks.map((b) => [b.id, b]));
        for (const block of parsed.blocks) {
          const existing = existingById.get(block.id);
          if (existing) {
            block.source = existing.source;
            block.tags = existing.tags;
            block.updatedAt = existing.updatedAt;
            // A user override must never be silently downgraded, so a marker
            // that lost its attributes during a raw edit is restored from the
            // store. An automatic verdict is deliberately NOT restored: the
            // classifier owns those, and re-deriving one is cheap — carrying a
            // stale copy here would give it a second owner.
            if (!block.classification && existing.classification?.source === "user") {
              block.classification = existing.classification;
            }
          }
        }

        // Extract free text outside block fences and wrap into a new block.
        // Only fires when the user actually typed content outside a fence. The
        // id comes from the store's monotonic allocator, never a local max+1.
        // Typed content is classified like any other capture, so a snippet
        // pasted into raw markdown still lands as code with its language.
        const freeText = extractFreeTextOutsideBlocks(md);
        if (freeText.trim()) {
          const { result, content } = classifyAndFormatCapture(freeText, {
            source: "manual",
          });
          const classification = toBlockClassification(result);
          const newBlock: Block = {
            id: allocateBlockId(),
            type: result.blockType,
            content,
            createdAt: new Date().toISOString(),
            tags: [],
            assetIds: extractAssetIds(freeText.trim()),
            source: "edit",
            ...(classification ? { classification } : {}),
          };
          parsed.blocks.push(newBlock);
        }

        // Assets are system-managed and never edited in the textarea (the
        // nd:data section is stripped from the editable value), so preserve
        // them across the round-trip. Keep only assets still referenced by the
        // freshly parsed blocks (mirroring deleteBlock) instead of leaking
        // orphans. References are matched with the shared extractor, which
        // covers reference-style images and links — the parser preserves any
        // `[...]:` definition, so an id kept by either reference style must
        // survive the sweep.
        const referencedAssetIds = new Set(
          parsed.blocks.flatMap((b) => extractLinkedReferenceIds(b.content))
        );
        parsed.assets = Object.fromEntries(
          Object.entries(doc.assets).filter(([id]) =>
            referencedAssetIds.has(id)
          )
        );
        // Preserved raw data-section lines get the same orphan sweep by their
        // own id, so removing a block that referenced one also prunes it.
        parsed.preservedAssetLines = sweepPreservedAssetLines(
          doc.preservedAssetLines ?? [],
          referencedAssetIds
        );

        // Preserve the document ID and settings, merge
        setDocument({
          ...parsed,
          id: doc.id,
          settings: doc.settings,
        });
      } catch (err) {
        console.error("Failed to parse edited markdown:", err);
      }
    },
    [doc, setDocument, allocateBlockId]
  );
  // Keep the latest sync callback available to debounced/flushed timers.
  useEffect(() => {
    syncMarkdownToStoreRef.current = syncMarkdownToStore;
  }, [syncMarkdownToStore]);

  // Commit any pending raw edit immediately (used on blur and on mode switch,
  // so unsynced keystrokes are never lost or orphaned by a subsequent paste).
  const flushPendingSync = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    const pending = pendingSyncRef.current;
    if (pending !== null) {
      pendingSyncRef.current = null;
      syncMarkdownToStoreRef.current(pending);
    }
  }, []);

  const handleMarkdownChange = useCallback((text: string) => {
    setDraft(text);
    pendingSyncRef.current = text;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      const pending = pendingSyncRef.current;
      pendingSyncRef.current = null;
      if (pending !== null) {
        syncMarkdownToStoreRef.current(pending);
      }
    }, MARKDOWN_SYNC_DEBOUNCE_MS);
  }, []);

  // While the markdown textarea is focused, a paste is turned into a proper
  // pasted block (like in preview mode) and the raw view re-syncs. Any pending
  // typed edit is committed first so it is never orphaned by the append.
  const handleMarkdownPaste = useCallback(
    async (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      if (!doc) return;
      flushPendingSync();
      event.preventDefault();
      event.stopPropagation();
      try {
        const { blocks, assets } = await processPaste(event.nativeEvent, doc, {
          allocateBlockId,
          allocateAssetId,
        });
        if (blocks.length > 0) {
          appendBlocks(blocks, assets);
          reserialize();
          setDraft(stripDataSection(useDocumentStore.getState().serializedMarkdown));
        }
      } catch (err) {
        console.error("Paste processing failed:", err);
      }
    },
    [doc, flushPendingSync, allocateBlockId, allocateAssetId, appendBlocks, reserialize]
  );

  const handleMarkdownBlur = useCallback(() => {
    flushPendingSync();
    setDraft(null);
  }, [flushPendingSync]);

  // When switching TO markdown mode, populate local state; when leaving, commit
  // any pending edits (the store is the source of truth — nothing is lost).
  const handleModeChange = useCallback(
    (mode: EditorMode) => {
      if (mode === "markdown" && editorMode !== "markdown") {
        reserialize();
        setDraft(stripDataSection(useDocumentStore.getState().serializedMarkdown));
      } else if (editorMode === "markdown" && mode !== "markdown") {
        flushPendingSync();
        setDraft(null);
      }
      setEditorMode(mode);
    },
    [editorMode, flushPendingSync, setEditorMode, reserialize]
  );

  // Keep the markdown textarea focused while in markdown mode so pasting always
  // happens in the editor context (and is turned into a block accordingly).
  useEffect(() => {
    if (editorMode !== "markdown") return;
    const timer = setTimeout(() => markdownEditorRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [editorMode]);

  // Mirror the store's serialization into the raw view whenever it changes and
  // the user is not mid-edit. This reflects appended pasted blocks, own syncs
  // and autosaves without clobbering in-flight keystrokes.
  useEffect(() => {
    if (editorMode !== "markdown") return;
    if (pendingSyncRef.current !== null) return;
    setDraft(stripDataSection(serializedMarkdown));
  }, [editorMode, serializedMarkdown]);

  // Compute display markdown fresh from the live store (never the stale cache)
  // so pastes and assets stay in sync instantly in all views. Only the actual
  // block content is rendered: frontmatter, the generated title line, the data
  // section and the generated per-block "## HH:MM · type" headings are removed
  // so nothing that wasn't written by the user shows up in the preview. The
  // data section is removed with the same fence-aware helper the editor uses,
  // so a marker inside a block isn't stripped out from under the user.
  const previewMarkdown = useMemo(() => {
    if (!doc) return "";
    return stripDataSection(
      serializeDocument(doc)
        .replace(/^---\n[\s\S]*?\n---\n*/, "")
        .replace(/^#\s+.+\n?/, "")
    ).replace(/^##\s+\d{2}:\d{2}\s+·\s+\S+\s*$/gm, "");
  }, [doc]);

  return (
    <Panel className="flex flex-col h-full overflow-hidden">
      {/* Mode Toggle */}
      <div className="flex justify-center py-3 border-b border-border">
        <ModeToggle mode={editorMode} onChange={handleModeChange} />
      </div>

      {/* Editor / Preview / Data */}
      <div className="flex-1 overflow-hidden">
        {editorMode === "markdown" && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-hidden min-h-0">
              <MarkdownEditor
                value={draft ?? stripDataSection(serializedMarkdown)}
                onChange={handleMarkdownChange}
                onPaste={handleMarkdownPaste}
                onBlur={handleMarkdownBlur}
                editorRef={markdownEditorRef}
              />
            </div>
            <AssetSection />
          </div>
        )}
        {editorMode === "preview" && (
          <MarkdownPreview markdown={previewMarkdown} />
        )}
        {editorMode === "data" && <DataView />}
      </div>

      {/* Status Bar */}
      <StatusBar />
    </Panel>
  );
}