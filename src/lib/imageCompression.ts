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

  // 4. Detect codec support and choose target format
  let targetMime: ImageMime = preferredImageMime;
  if (!(await isCodecSupported(preferredImageMime))) {
    // Preferred codec not supported — try JPEG, then PNG
    if (await isCodecSupported("image/jpeg")) {
      targetMime = "image/jpeg";
    } else {
      targetMime = "image/png";
    }
  }

  // 5. Encode to chosen format
  const blob = await canvas.convertToBlob({
    type: targetMime,
    quality: imageQuality,
  });
  // Use the actual blob type (may differ from requested if browser fell back)
  const mime = (blob.type || targetMime) as ImageMime;

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

/**
 * Detect whether the browser can encode a given image MIME type
 * using OffscreenCanvas. Returns false for unsupported codecs.
 */
async function isCodecSupported(mime: string): Promise<boolean> {
  try {
    const canvas = new OffscreenCanvas(1, 1);
    const blob = await canvas.convertToBlob({ type: mime, quality: 0.5 });
    // If the returned blob type doesn't match, the browser fell back
    return blob.type === mime;
  } catch {
    return false;
  }
}
