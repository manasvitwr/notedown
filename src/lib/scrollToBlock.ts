import { useDocumentStore } from "../store/useDocumentStore";
import type { BlockType } from "../types";

/**
 * Whether a block's content can be seen in the raw markdown textarea. Images
 * are stored as base64 data URIs in the file so they can't be "shown" there —
 * they render in the preview tab and, from markdown mode, in the Assets panel.
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
 *   section; images expand the Assets panel and highlight the matching asset,
 *   keeping Markdown Mode in Markdown Mode.
 * - Data mode: same destinations as markdown mode, but the editor has to
 *   switch tabs first, so the scroll waits for the destination to mount.
 */
export function scrollToBlock(
  blockId: string,
  blockType: BlockType,
  assetId?: string
): void {
  const { editorMode, setEditorMode } = useDocumentStore.getState();

  if (editorMode === "preview") {
    scrollPreviewAnchorWhenReady(blockId);
    return;
  }

  if (editorMode === "markdown") {
    if (isMarkdownDisplayable(blockType)) {
      scrollMarkdownTextareaToBlockWhenReady(blockId);
    } else {
      // Images don't render as raw markdown. Open the Assets panel and
      // highlight the asset instead of switching tabs. Prefer the explicitly
      // requested asset so a Block-button jump from an asset card lands back
      // on the clicked asset rather than always the block's first one.
      const target =
        assetId ??
        useDocumentStore
          .getState()
          .doc?.blocks.find((b) => b.id === blockId)?.assetIds[0];
      if (target) {
        useDocumentStore.getState().requestAssetHighlight(target);
      }
    }
    return;
  }

  // Non-displayable blocks in data mode need a tab switch first, then a scroll
  // once the destination mounts.
  const destination = isMarkdownDisplayable(blockType) ? "markdown" : "preview";
  setEditorMode(destination);
  if (destination === "markdown") {
    scrollMarkdownTextareaToBlockWhenReady(blockId);
  } else {
    scrollPreviewAnchorWhenReady(blockId);
  }
}

/**
 * Smoothly scroll to an element once it exists, bounding the retry window.
 * A tab switch only commits the target anchor to the DOM after React has
 * re-rendered, so a single frame is not enough — keep retrying until it mounts.
 */
function whenReady<T extends HTMLElement>(
  find: () => T | null,
  scroll: (el: T) => void,
  attemptsLeft = 12
): void {
  const el = find();
  if (el) {
    scroll(el);
    return;
  }
  if (attemptsLeft <= 0) return;
  requestAnimationFrame(() => whenReady(find, scroll, attemptsLeft - 1));
}

function scrollPreviewAnchorWhenReady(blockId: string): void {
  whenReady(
    () => document.getElementById(`block-${blockId}`),
    (el) => el.scrollIntoView({ behavior: "smooth", block: "center" })
  );
}

function scrollMarkdownTextareaToBlockWhenReady(blockId: string): void {
  whenReady(
    () => document.getElementById("markdown-editor") as HTMLTextAreaElement | null,
    (textarea) => scrollMarkdownTextareaToBlock(textarea, blockId)
  );
}

function scrollMarkdownTextareaToBlock(
  textarea: HTMLTextAreaElement,
  blockId: string
): void {
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