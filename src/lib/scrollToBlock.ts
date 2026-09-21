import { useDocumentStore } from "../store/useDocumentStore";
import type { BlockType } from "../types";

/**
 * Whether a block's content can be seen in the raw markdown textarea. Images
 * are stored as base64 data URIs in the file so they can't be "shown" there —
 * they only render in the preview tab.
 */
export function isMarkdownDisplayable(type: BlockType): boolean {
  return type !== "image";
}

/**
 * Navigate to a block when a capture-stack card / rail item is clicked.
 *
 * - Preview mode: every block renders as an anchor div, so scroll straight to
 *   it (works for text and image alike).
 * - Markdown mode: displayable blocks scroll the textarea to that block's
 *   section; images (or anything else that can't render as raw text) switch to
 *   the preview tab and scroll to the image there.
 */
export function scrollToBlock(blockId: string, blockType: BlockType): void {
  const { editorMode, setEditorMode } = useDocumentStore.getState();

  if (editorMode === "preview") {
    scrollPreviewAnchor(blockId);
    return;
  }

  if (!isMarkdownDisplayable(blockType)) {
    setEditorMode("preview");
    requestAnimationFrame(() => scrollPreviewAnchor(blockId));
    return;
  }

  if (editorMode === "markdown") {
    scrollMarkdownTextareaToBlock(blockId);
  }
}

function scrollPreviewAnchor(blockId: string): void {
  document
    .getElementById(`block-${blockId}`)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function scrollMarkdownTextareaToBlock(blockId: string): void {
  const textarea = document.getElementById(
    "markdown-editor"
  ) as HTMLTextAreaElement | null;
  if (!textarea) return;

  const marker = `<!-- nd:block ${blockId} `;
  const start = textarea.value.indexOf(marker);
  if (start === -1) return;

  const lineIndex = textarea.value.slice(0, start).split("\n").length - 1;
  const lineHeight =
    parseFloat(getComputedStyle(textarea).lineHeight) || 21;
  textarea.scrollTop = Math.max(
    0,
    lineIndex * lineHeight - textarea.clientHeight / 2
  );
  try {
    textarea.setSelectionRange(start, start);
  } catch {
    /* ignore */
  }
}