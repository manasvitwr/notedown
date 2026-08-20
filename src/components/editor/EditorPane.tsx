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

  // Compute display markdown — strip nd:data section for preview
  const previewMarkdown = useMemo(() => {
    // Remove the nd:data section for cleaner preview
    return serializedMarkdown
      .replace(/<!-- nd:block \S+ \S+ \S+ -->\n/g, "")
      .replace(/<!-- nd:endblock \S+ -->\n?/g, "")
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
