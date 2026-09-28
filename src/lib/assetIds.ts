import type { Block } from "../types";

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

const PRESERVED_LINE_ID_RE = /^\[([^\]]+)\]:/;

/**
 * Drop raw nd:data lines whose reference id is no longer referenced by any
 * surviving block. Owned here so the markdown sync sweep and deleteBlock prune
 * unreferenced preserved lines by the same rule and the same id token shape.
 * The id is captured as permissively as the parser collects it, so a line the
 * parser kept (e.g. an id containing a space) can still be matched and kept.
 */
export function sweepPreservedAssetLines(
  lines: string[],
  referencedIds: ReadonlySet<string>
): string[] {
  return lines.filter((line) => {
    const id = line.match(PRESERVED_LINE_ID_RE)?.[1];
    return !!id && referencedIds.has(id);
  });
}

/**
 * Extract ids referenced by reference-style links or images (`[text][id]`,
 * `![alt][id]`). Broader than extractAssetIds on purpose: the parser preserves
 * ANY `[...]:` reference definition it meets, so a preserved line may be
 * referenced by a plain link and the orphan sweep must not drop it. The id
 * token is as permissive as the parser's own collection rule.
 */
export function extractLinkedReferenceIds(content: string): string[] {
  const ids: string[] = [];
  const re = /!?\[[^\]]*\]\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(content)) !== null) ids.push(m[1]);
  return ids;
}

/**
 * Map every referenced asset id to the first block that references it, for the
 * asset panels' "jump to block" navigation. Built from block content with
 * extractLinkedReferenceIds — the same source the orphan sweeps use — so both
 * panels agree, and an asset kept alive by a link reference is navigable just
 * like an image reference instead of being silently unmapped by the narrower
 * block.assetIds field.
 */
export function buildAssetToBlockId(blocks: Block[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const block of blocks) {
    for (const id of extractLinkedReferenceIds(block.content)) {
      if (!map[id]) map[id] = block.id;
    }
  }
  return map;
}