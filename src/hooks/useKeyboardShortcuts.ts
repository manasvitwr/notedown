import { useEffect } from "react";
import { useDocumentStore } from "../store/useDocumentStore";
import { exportDocument } from "../lib/fileExport";

interface ShortcutActions {
  onNew: () => void;
  onImport: () => void;
}

/**
 * Register global keyboard shortcuts.
 */
export function useKeyboardShortcuts({ onNew, onImport }: ShortcutActions) {
  const doc = useDocumentStore((s) => s.doc);
  const editorMode = useDocumentStore((s) => s.editorMode);
  const setEditorMode = useDocumentStore((s) => s.setEditorMode);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      switch (e.key.toLowerCase()) {
        case "s":
          e.preventDefault();
          if (doc) exportDocument(doc);
          break;

        case "o":
          e.preventDefault();
          onImport();
          break;

        case "n":
          e.preventDefault();
          onNew();
          break;

        case "e":
          e.preventDefault();
          setEditorMode(editorMode === "markdown" ? "preview" : "markdown");
          break;

        case "d":
          if (e.shiftKey) {
            e.preventDefault();
            setEditorMode("data");
          }
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [doc, editorMode, setEditorMode, onNew, onImport]);
}
