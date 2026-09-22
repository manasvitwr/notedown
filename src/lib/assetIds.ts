/**
 * Shared id token shape for reference ids. Allows hyphens so imported ids like
 * `my-pic` survive extract, preserve and sweep consistently.
 */
export const ASSET_ID_SOURCE = "[A-Za-z0-9_-]+";

/**
 * Extract asset reference ids from markdown content. Matches only the reference
 * id in reference-style image syntax (`![alt][id]`) — alt text and plain
 * `[word]` tokens are not asset references. Used by the parser, the markdown
 * sync orphan sweep, deleteBlock cleanup and asset-to-block maps.
 */
export function extractAssetIds(content: string): string[] {
  const ids: string[] = [];
  const re = new RegExp(`!\\[[^\\]]*\\]\\[(${ASSET_ID_SOURCE})\\]`, "g");
  let m;
  while ((m = re.exec(content)) !== null) ids.push(m[1]);
  return ids;
}