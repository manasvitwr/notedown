import { IMAGE_EXTENSIONS } from "./config";
import { isAllowedImageMime } from "../imageMime";
import { contextExtension } from "./context";
import type { CaptureContext, ClassificationSignal } from "./types";

/**
 * Layer 1 — image detection.
 *
 * An image is never a content question: it is answered entirely by the asset /
 * mime metadata that already created the block. No language detection, no
 * structural analysis, no confidence guessing — image is a certainty, so it
 * short-circuits the pipeline.
 */

export interface ImageEvidence {
  signals: ClassificationSignal[];
  detail: string;
}

const imageSignal = (kind: string, detail: string): ClassificationSignal => ({
  layer: 1,
  kind,
  group: "structural",
  score: 1,
  detail,
});

/**
 * Return image evidence when the capture context says the content is an image,
 * or null when it says nothing (or says it is not).
 *
 * A MIME type only counts when it is one the app can actually store and render,
 * so an image verdict always implies an asset that will be displayable. A
 * `image/gif` or `image/tiff` capture is not an image block here — it is content
 * we have no way to show.
 *
 * What is deliberately *not* evidence: the block merely mentioning an asset id.
 * `Block.assetIds` is filled in by scanning the text for `[img_…]` references,
 * so a code sample that documents this very syntax has a full set of them — and
 * flipping that to an image block would be worse than useless. A capture that
 * really owns an asset is an image block, which is what `blockType` says.
 */
export function detectImage(context?: CaptureContext): ImageEvidence | null {
  if (!context) return null;

  const mime = context.mimeType;
  if (mime && isAllowedImageMime(mime.toLowerCase())) {
    return {
      signals: [imageSignal("image.mime", `mime ${mime}`)],
      detail: mime,
    };
  }

  if (context.blockType === "image") {
    return {
      signals: [imageSignal("image.block-type", "block typed as image")],
      detail: "block type image",
    };
  }

  const { extension, trusted } = contextExtension(context);
  if (trusted && extension && IMAGE_EXTENSIONS.has(extension)) {
    return {
      signals: [imageSignal("image.extension", `file extension .${extension}`)],
      detail: `.${extension}`,
    };
  }

  return null;
}
