import { IMAGE_EXTENSIONS } from "./config";
import { contextExtension, isImageMime } from "./context";
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
 */
export function detectImage(context?: CaptureContext): ImageEvidence | null {
  if (!context) return null;

  const mime = context.mimeType;
  if (mime && isImageMime(mime)) {
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

  if (context.assetIds && context.assetIds.length > 0) {
    return {
      signals: [imageSignal("image.asset", "capture references an asset")],
      detail: `${context.assetIds.length} asset(s)`,
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
