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
  const allocateBlockId = useDocumentStore((s) => s.allocateBlockId);
  const allocateAssetId = useDocumentStore((s) => s.allocateAssetId);

  useEffect(() => {
    const handler = async (event: ClipboardEvent) => {
      if (!doc) return;

      // If the user is pasting into an editable field (e.g. the markdown
      // textarea or an input), let the native paste happen so the editor's
      // local state stays in sync. Intercepting would append a block behind
      // the editor and that block would be lost on the next mode switch.
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
        }
      } catch (err) {
        console.error("Paste processing failed:", err);
      }
    };

    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [doc, appendBlocks, allocateBlockId, allocateAssetId]);
}
