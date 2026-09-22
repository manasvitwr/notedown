import type { ImageMime } from "../types";

/**
 * The only image MIME types Notedown accepts. Base64 assets carry their MIME
 * inline in the serialized file (`data:<mime>;base64,...`) and can be rendered
 * directly as data URIs, so anything outside this allowlist must never be
 * reconstructed, stored, or rendered.
 */
export const IMAGE_MIME_ALLOWLIST: readonly ImageMime[] = [
  "image/webp",
  "image/jpeg",
  "image/png",
];

export function isAllowedImageMime(mime: string): mime is ImageMime {
  return (IMAGE_MIME_ALLOWLIST as readonly string[]).includes(mime);
}