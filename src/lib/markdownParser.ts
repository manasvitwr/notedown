import type { Asset, Block, BlockType, DocumentState, ImageMime, StorageMode } from "../types";
import { DEFAULT_SETTINGS } from "../constants/defaults";
import { nanoid } from "nanoid";

/**
 * Source for the block-section regex, shared with the editor so parsing and
 * free-text extraction always agree on what counts as a real block section.
 *
 * The opening fence requires a trailing newline (the format `serializeDocument`
 * emits). A malformed/inline fence therefore is NOT treated as a block here,
 * which keeps the editor from silently deleting it during a markdown<->preview
 * mode switch.
 */
const BLOCK_SECTION_SOURCE =
  "<!-- nd:block (\\S+) (\\S+) (\\S+)(?: collapsed)? -->\\n([\\s\\S]*?)<!-- nd:endblock \\1 -->";

/**
 * Remove the system-managed nd:data asset section from a raw .nd.md string.
 * Used by the markdown editor so base64 asset data never fills the textarea.
 * The section is regenerated from the store's asset registry on serialize.
 */
export function stripDataSection(raw: string): string {
  return raw.replace(/<!-- nd:data -->[\s\S]*?<!-- nd:enddata -->/g, "");
}

/**
 * Create a fresh global block-section regex. Each caller gets its own regex
 * instance so shared `lastIndex` state can never leak between callers.
 */
export function createBlockSectionRegex(): RegExp {
  return new RegExp(BLOCK_SECTION_SOURCE, "g");
}

/**
 * Parse a .nd.md or plain .md file into a DocumentState.
 */
export function parseNotedownFile(
  raw: string,
  filename: string
): DocumentState {
  // 1. Try to extract frontmatter
  const frontmatter = parseFrontmatter(raw);

  if (!frontmatter || !frontmatter.notedown) {
    // Plain markdown import
    return createPlainImport(raw, filename);
  }

  // 2. Strip frontmatter from content
  const contentAfterFrontmatter = raw.replace(
    /^---\n[\s\S]*?\n---\n*/,
    ""
  );

  // 3. Extract blocks
  const blockRegex = createBlockSectionRegex();
  const blocks: Block[] = [];
  let match;
  while ((match = blockRegex.exec(contentAfterFrontmatter)) !== null) {
    const [, id, type, createdAt, rawContent] = match;
    // Check the original text for the collapsed marker
    const blockStart = match.index;
    const blockMarkerEnd = contentAfterFrontmatter.indexOf("-->", blockStart);
    const blockMarker = contentAfterFrontmatter.slice(blockStart, blockMarkerEnd + 3);
    const isCollapsed = blockMarker.includes("collapsed");
    const content = stripBlockHeading(rawContent.trim());
    blocks.push({
      id,
      type: type as BlockType,
      content,
      createdAt,
      tags: [],
      assetIds: extractAssetRefs(content),
      source: "import",
      collapsed: isCollapsed || undefined,
    });
  }

  // 4. Extract assets from nd:data section. Allowlisted image entries become
  // structured assets; any other reference definitions are preserved verbatim
  // (by line) so a foreign-mime entry in an imported file is never silently
  // dropped on re-export, while never being stored as a renderable asset.
  const assets: Record<string, Asset> = {};
  const preservedAssetLines: string[] = [];
  const dataRegex =
    /<!-- nd:data -->([\s\S]*?)<!-- nd:enddata -->/;
  const dataMatch = dataRegex.exec(raw);
  if (dataMatch) {
    const refRegex =
      /^\[(\w+)\]:\s*data:(image\/(?:webp|jpeg|png));base64,(\S+)$/;
    // Match any reference definition line, with or without whitespace after the
    // colon, so non-allowlisted entries are preserved verbatim.
    const anyRefLineRegex = /^\[[^\]]+\]:\s*\S.*$/;
    for (const rawLine of dataMatch[1].split("\n")) {
      const line = rawLine.trim();
      const refMatch = refRegex.exec(line);
      if (refMatch) {
        const [, id, mime, base64] = refMatch;
        // The regex anchors the mime to the allowlist, so the cast is safe.
        assets[id] = reconstructAsset(id, mime as ImageMime, base64);
        continue;
      }
      if (anyRefLineRegex.test(line)) {
        preservedAssetLines.push(line);
      }
    }
  }

  // 5. Build state
  const title =
    frontmatter.title ??
    filename.replace(/\.nd\.md$|\.md$/, "");

  return {
    id: nanoid(),
    title,
    filename,
    createdAt: frontmatter.created ?? new Date().toISOString(),
    updatedAt: frontmatter.updated ?? new Date().toISOString(),
    blocks,
    assets,
    preservedAssetLines,
    settings: {
      storageMode: (frontmatter.storage as StorageMode | undefined) ?? DEFAULT_SETTINGS.storageMode,
      imageMaxWidth:
        frontmatter.image_max_width ?? DEFAULT_SETTINGS.imageMaxWidth,
      imageQuality:
        frontmatter.image_quality ?? DEFAULT_SETTINGS.imageQuality,
      preferredImageMime: DEFAULT_SETTINGS.preferredImageMime,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}

/**
 * Fallback: import a plain .md file as a single text block.
 */
export function createPlainImport(
  raw: string,
  filename: string
): DocumentState {
  const title = filename.replace(/\.md$/, "");
  const now = new Date().toISOString();

  return {
    id: nanoid(),
    title,
    filename,
    createdAt: now,
    updatedAt: now,
    blocks: [
      {
        id: "b_001",
        type: "text",
        content: raw,
        createdAt: now,
        tags: [],
        assetIds: [],
        source: "import",
      },
    ],
    assets: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

// ─── Helpers ──────────────────────────────────────────────────

interface Frontmatter {
  notedown?: number;
  title?: string;
  created?: string;
  updated?: string;
  storage?: string;
  image_max_width?: number;
  image_quality?: number;
  [key: string]: unknown;
}

function parseFrontmatter(raw: string): Frontmatter | null {
  const fmRegex = /^---\n([\s\S]*?)\n---/;
  const match = fmRegex.exec(raw);
  if (!match) return null;

  const result: Frontmatter = {};
  const lines = match[1].split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: string | number = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    // Parse numbers
    if (/^\d+(\.\d+)?$/.test(String(value))) {
      value = parseFloat(String(value));
    }
    result[key] = value;
  }
  return result;
}

/**
 * Strip the ## heading line from block content.
 * The heading "## 02:41 · text" is generated by the serializer,
 * so we strip it on import to avoid duplication.
 */
function stripBlockHeading(content: string): string {
  // Remove leading "## HH:MM · type\n" pattern
  return content.replace(/^##\s+\d{2}:\d{2}\s+·\s+\S+\s*\n\s*/, "");
}

/**
 * Extract asset reference IDs from markdown content.
 * Matches ![alt][img_001] patterns.
 */
function extractAssetRefs(content: string): string[] {
  const refs: string[] = [];
  const regex = /\[img_\d+\]/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    refs.push(m[0].slice(1, -1)); // strip brackets
  }
  return refs;
}

/**
 * Reconstruct an Asset from parsed base64 data.
 */
function reconstructAsset(
  id: string,
  mime: ImageMime,
  base64: string
): Asset {
  // Estimate dimensions from base64 is not trivial;
  // we store 0 and let the UI re-calculate if needed.
  const sizeBytes = Math.ceil((base64.length * 3) / 4);
  return {
    id,
    kind: "image",
    mime,
    base64,
    width: 0,
    height: 0,
    sizeBytes,
    createdAt: new Date().toISOString(),
    alt: id,
  };
}
