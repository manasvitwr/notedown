import type { Asset, ImageMime } from "../types";

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

/**
 * Build the displayable data URI for an asset, or null when its MIME is not
 * allowlisted. Every render path should go through this helper so the
 * allowlist is enforced consistently at render time.
 */
export function dataUri(asset: Pick<Asset, "mime" | "base64">): string | null {
  if (!isAllowedImageMime(asset.mime)) return null;
  return `data:${asset.mime};base64,${asset.base64}`;
}

/**
 * 1x1 transparent GIF used wherever an asset exists but cannot be rendered
 * (non-allowlisted MIME). Shared by every render path so a blocked asset never
 * falls back to a raw reference id, a relative URL or a src-less img element.
 */
export const BLANK_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";