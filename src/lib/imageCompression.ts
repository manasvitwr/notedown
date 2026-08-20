import type { Asset, DocumentSettings, ImageMime } from "../types";

interface CompressionResult {
  asset: Asset;
}

/**
 * Compress an image file using Canvas API.
 * Scales down to maxWidth, exports as WebP/JPEG.
 */
export async function compressImage(
  file: File,
  assetId: string,
  settings: DocumentSettings
): Promise<CompressionResult> {
  const { imageMaxWidth, imageQuality, preferredImageMime } = settings;

  // 1. Create bitmap from file
  const bitmap = await createImageBitmap(file);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const originalSizeBytes = file.size;

  // 2. Calculate scaled dimensions (preserve aspect ratio)
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;
  if (originalWidth > imageMaxWidth) {
    const scale = imageMaxWidth / originalWidth;
    targetWidth = imageMaxWidth;
    targetHeight = Math.round(originalHeight * scale);
  }

  // 3. Draw to offscreen canvas
  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas 2d context");
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  // 4. Export as preferred format, fallback to JPEG
  let blob: Blob;
  let mime: ImageMime = preferredImageMime;
  try {
    blob = await canvas.convertToBlob({
      type: preferredImageMime,
      quality: imageQuality,
    });
  } catch {
    // WebP not supported — fallback to JPEG
    mime = "image/jpeg";
    blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: imageQuality,
    });
  }

  // 5. Convert to base64
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // 6. Build asset
  const asset: Asset = {
    id: assetId,
    kind: "image",
    mime,
    base64,
    width: targetWidth,
    height: targetHeight,
    originalWidth,
    originalHeight,
    sizeBytes: blob.size,
    originalSizeBytes,
    createdAt: new Date().toISOString(),
    alt: "screenshot",
  };

  return { asset };
}

/**
 * Build a data URI from an asset for rendering.
 */
export function assetToDataUri(asset: Asset): string {
  return `data:${asset.mime};base64,${asset.base64}`;
}
