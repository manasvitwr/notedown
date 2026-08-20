import { useEffect } from "react";
import { useDocumentStore } from "../store/useDocumentStore";
import { processPaste } from "../lib/clipboard";

/**
 * Global paste event listener.
 * Intercepts Ctrl+V, processes clipboard, appends blocks to store.
 */
export function usePasteHandler() {
  const doc = useDocumentStore((s) => s.doc);
  const appendBlocks = useDocumentStore((s) => s.appendBlocks);
  const editorMode = useDocumentStore((s) => s.editorMode);

  useEffect(() => {
    const handler = async (event: ClipboardEvent) => {
      // Only intercept paste when NOT in the markdown editor textarea
      // (let the textarea handle its own paste naturally? — No.
      // We always intercept to create structured blocks.)
      if (!doc) return;

      // If user is editing in the markdown textarea, let native paste work
      const target = event.target as HTMLElement;
      if (
        editorMode === "markdown" &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
      ) {
        return;
      }

      event.preventDefault();

      try {
        const { blocks, assets } = await processPaste(event, doc);
        if (blocks.length > 0) {
          appendBlocks(blocks, assets);
        }
      } catch (err) {
        console.error("Paste processing failed:", err);
      }
    };

    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [doc, appendBlocks, editorMode]);
}
