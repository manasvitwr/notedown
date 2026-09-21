import { useEffect } from "react";
import { useDocumentStore } from "../store/useDocumentStore";
import { processPaste } from "../lib/clipboard";

/**
 * Global paste event listener.
 * Intercepts Ctrl+V outside editable fields, processes clipboard and appends
 * blocks to the store. In markdown mode this keeps preview and the raw view in
 * sync because the appended blocks are immediately re-serialized.
 */
export function usePasteHandler() {
  const doc = useDocumentStore((s) => s.doc);
  const appendBlocks = useDocumentStore((s) => s.appendBlocks);
  const allocateBlockId = useDocumentStore((s) => s.allocateBlockId);
  const allocateAssetId = useDocumentStore((s) => s.allocateAssetId);
  const editorMode = useDocumentStore((s) => s.editorMode);
  const reserialize = useDocumentStore((s) => s.reserialize);

  useEffect(() => {
    const handler = async (event: ClipboardEvent) => {
      if (!doc) return;

      // Pasting into an editable field (markdown textarea, modal inputs) is
      // handled by the field itself — the markdown textarea turns the paste
      // into a proper pasted block. Don't intercept those here.
      const target = event.target as HTMLElement;
      if (
        target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT" ||
        target.isContentEditable
      ) {
        return;
      }

      event.preventDefault();

      try {
        const { blocks, assets } = await processPaste(event, doc, {
          allocateBlockId,
          allocateAssetId,
        });
        if (blocks.length > 0) {
          appendBlocks(blocks, assets);
          // In markdown mode the raw view is a mirror of the serialization, so
          // refresh it right away to show the just-pasted card.
          if (editorMode === "markdown") {
            reserialize();
          }
        }
      } catch (err) {
        console.error("Paste processing failed:", err);
      }
    };

    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [doc, appendBlocks, allocateBlockId, allocateAssetId, editorMode, reserialize]);
}