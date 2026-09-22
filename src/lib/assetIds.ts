/**
 * Extract reference-style ids from markdown content using the same bracket
 * token shape the parser accepts for asset definitions (`\w+` ids). Widens
 * coverage beyond prefixed ids (img_) so non-prefixed ids from imported files
 * are captured consistently everywhere block.assetIds is consumed: the parser,
 * the markdown sync orphan sweep, deleteBlock cleanup and asset-to-block maps.
 */
export function extractAssetIds(content: string): string[] {
  const ids: string[] = [];
  const re = /\[(\w+)\]/g;
  let m;
  while ((m = re.exec(content)) !== null) ids.push(m[1]);
  return ids;
}