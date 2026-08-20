import type { DocumentState } from "../types";
import { BLOCK_PREFIX, ASSET_PREFIX } from "../constants/defaults";

/**
 * Generate next sequential block ID: b_001, b_002, ...
 */
export function nextBlockId(doc: DocumentState): string {
  const nums = doc.blocks
    .map((b) => parseInt(b.id.replace(BLOCK_PREFIX, ""), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${BLOCK_PREFIX}${String(max + 1).padStart(3, "0")}`;
}

/**
 * Generate next sequential asset ID: img_001, img_002, ...
 */
export function nextAssetId(doc: DocumentState): string {
  const nums = Object.keys(doc.assets)
    .map((id) => parseInt(id.replace(ASSET_PREFIX, ""), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${ASSET_PREFIX}${String(max + 1).padStart(3, "0")}`;
}
