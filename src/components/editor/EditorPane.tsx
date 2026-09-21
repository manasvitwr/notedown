import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Panel } from "../shared/Panel";
import { ModeToggle } from "./ModeToggle";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { DataView } from "./DataView";
import { StatusBar } from "./StatusBar";
import { useDocumentStore } from "../../store/useDocumentStore";
import { parseNotedownFile } from "../../lib/markdownParser";
import { BLOCK_PREFIX } from "../../constants/defaults";
import type { Block, EditorMode } from "../../types";

/**
 * Extract text that appears outside <!-- nd:block --> / <!-- nd:endblock --> fences
 * in a .nd.md markdown string. This catches content pasted in markdown mode
 * that wasn't wrapped in block comment markers.
 */
function extractFreeTextOutsideBlocks(md: string): string {
  // Remove frontmatter
  const noFrontmatter = md.replace(/^---\n[\s\S]*?\n---\n*/, "");
  // Remove all nd:block...nd:endblock sections. Capture the block id so each
  // section is terminated by its own closing fence (`\1`), and accept the
  // optional ` collapsed` marker emitted for collapsed blocks.
  const blockSectionRegex =
    /<!-- nd:block (\S+) \S+ \S+(?: collapsed)? -->[\s\S]*?<!-- nd:endblock \1 -->/g;
  const noBlocks = noFrontmatter.replace(blockSectionRegex, "");
  // Remove nd:data section
  const noData = noBlocks.replace(
    /<!-- nd:data -->[\s\S]*?<!-- nd:enddata -->/g,
    ""
  );
  // Strip the title line (# ...)
  const stripped = noData.replace(/^#\s+.+\n?/m, "");
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

  // Local editor state — only used in markdown mode
  const [localMarkdown, setLocalMarkdown] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const markdownEditorRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep the markdown textarea focused while in markdown mode so paste always
  // lands in the editor instead of being intercepted by the global paste handler.
  useEffect(() => {
    if (editorMode !== "markdown") return;
    const timer = setTimeout(() => markdownEditorRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [editorMode]);

  // Sync edited markdown back to structured state
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
          }
        }

        // Extract free text outside block fences and wrap into a new block.
        // This only fires when the user actually typed content outside a fence,
        // so switching modes with no edits is a no-op.
        const freeText = extractFreeTextOutsideBlocks(md);
        if (freeText.trim()) {
          const now = new Date().toISOString();
          const maxBlockNum = parsed.blocks.reduce((max, b) => {
            const num = parseInt(b.id.replace(BLOCK_PREFIX, ""), 10);
            return num > max ? num : max;
          }, 0);
          const newBlock: Block = {
            id: `${BLOCK_PREFIX}${String(maxBlockNum + 1).padStart(3, "0")}`,
            type: "text",
            content: freeText.trim(),
            createdAt: now,
            tags: [],
            assetIds: [],
            source: "edit",
          };
          parsed.blocks.push(newBlock);
        }

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
    [doc, setDocument]
  );

  // When switching TO markdown mode, populate local state
  const handleModeChange = useCallback(
    (mode: EditorMode) => {
      if (mode === "markdown" && editorMode !== "markdown") {
        // Entering markdown edit mode: reserialize and populate from serialized
        reserialize();
        const freshMd = useDocumentStore.getState().serializedMarkdown;
        setLocalMarkdown(freshMd);
        setIsEditing(true);
      } else if (editorMode === "markdown" && mode !== "markdown" && isEditing) {
        // Leaving markdown edit mode: sync back to store
        syncMarkdownToStore(localMarkdown);
        setIsEditing(false);
      }
      setEditorMode(mode);
    },
    [editorMode, localMarkdown, isEditing, setEditorMode, reserialize, syncMarkdownToStore]
  );

  // Compute display markdown — preserve block markers for scroll anchors,
  // strip nd:data section for cleaner preview
  const previewMarkdown = useMemo(() => {
    return serializedMarkdown
      .replace(/<!-- nd:data -->[\s\S]*?<!-- nd:enddata -->/g, "");
  }, [serializedMarkdown]);

  return (
    <Panel className="flex flex-col h-full overflow-hidden">
      {/* Mode Toggle */}
      <div className="flex justify-center py-3 border-b border-border">
        <ModeToggle mode={editorMode} onChange={handleModeChange} />
      </div>

      {/* Editor / Preview / Data */}
      <div className="flex-1 overflow-hidden">
        {editorMode === "markdown" && (
          <MarkdownEditor
            value={isEditing ? localMarkdown : serializedMarkdown}
            onChange={setLocalMarkdown}
            editorRef={markdownEditorRef}
          />
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
