import { useState, useCallback, useMemo } from "react";
import { Panel } from "../shared/Panel";
import { ModeToggle } from "./ModeToggle";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { DataView } from "./DataView";
import { StatusBar } from "./StatusBar";
import { useDocumentStore } from "../../store/useDocumentStore";
import { parseNotedownFile } from "../../lib/markdownParser";
import type { EditorMode } from "../../types";

/**
 * Extract text that appears outside <!-- nd:block --> / <!-- nd:endblock --> fences
 * in a .nd.md markdown string. This catches content pasted in markdown mode
 * that wasn't wrapped in block comment markers.
 */
function extractFreeTextOutsideBlocks(
  md: string,
  existingBlockCount: number
): string {
  // Remove frontmatter
  const noFrontmatter = md.replace(/^---\n[\s\S]*?\n---\n*/, "");
  // Remove all nd:block...nd:endblock sections
  const noBlocks = noFrontmatter.replace(
    /<!-- nd:block \S+ \S+ \S+ -->[\s\S]*?<!-- nd:endblock \1 -->/g,
    ""
  );
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

  // Local editor state — only used in markdown mode
  const [localMarkdown, setLocalMarkdown] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // When switching TO markdown mode, populate local state
  const handleModeChange = useCallback(
    (mode: EditorMode) => {
      if (mode === "markdown" && editorMode !== "markdown") {
        // Entering markdown edit mode: populate from serialized
        setLocalMarkdown(serializedMarkdown);
        setIsEditing(true);
      } else if (editorMode === "markdown" && mode !== "markdown" && isEditing) {
        // Leaving markdown edit mode: sync back to store
        syncMarkdownToStore(localMarkdown);
        setIsEditing(false);
      }
      setEditorMode(mode);
    },
    [editorMode, serializedMarkdown, localMarkdown, isEditing, setEditorMode]
  );

  // Sync edited markdown back to structured state
  const syncMarkdownToStore = useCallback(
    (md: string) => {
      if (!doc) return;
      try {
        const parsed = parseNotedownFile(md, doc.filename);

        // Extract free text outside block fences and wrap into new blocks
        const freeText = extractFreeTextOutsideBlocks(md, parsed.blocks.length);
        if (freeText.trim()) {
          const now = new Date().toISOString();
          const maxBlockNum = parsed.blocks.reduce((max, b) => {
            const num = parseInt(b.id.replace("b_", ""), 10);
            return num > max ? num : max;
          }, 0);
          const newBlock = {
            id: `b_${String(maxBlockNum + 1).padStart(3, "0")}`,
            type: "text" as const,
            content: freeText.trim(),
            createdAt: now,
            tags: [],
            assetIds: [],
            source: "edit" as const,
          };
          parsed.blocks.push(newBlock);
        }

        // Preserve the document ID and merge
        setDocument({
          ...parsed,
          id: doc.id,
        });
      } catch (err) {
        console.error("Failed to parse edited markdown:", err);
      }
    },
    [doc, setDocument]
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
