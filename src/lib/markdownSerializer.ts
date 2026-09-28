import type { Block, DocumentState } from "../types";
import { formatBlockTime } from "./dates";
import { NOTEDOWN_VERSION } from "../constants/defaults";

/**
 * Serialize a DocumentState into a .nd.md markdown string.
 */
export function serializeDocument(doc: DocumentState): string {
  const parts: string[] = [];

  // ─── Frontmatter ────────────────────────────────────────────
  parts.push("---");
  parts.push(`notedown: ${NOTEDOWN_VERSION}`);
  parts.push(`title: "${escapeYaml(doc.title)}"`);
  parts.push(`created: "${doc.createdAt}"`);
  parts.push(`updated: "${doc.updatedAt}"`);
  parts.push(`storage: "${doc.settings.storageMode}"`);
  parts.push(`image_max_width: ${doc.settings.imageMaxWidth}`);
  parts.push(`image_quality: ${doc.settings.imageQuality}`);
  parts.push("---");
  parts.push("");

  // ─── Title ──────────────────────────────────────────────────
  parts.push(`# ${doc.title}`);
  parts.push("");

  // ─── Blocks ─────────────────────────────────────────────────
  for (const block of doc.blocks) {
    const time = formatBlockTime(block.createdAt, doc.settings.timezone);
    const typeLabel = block.type === "image" ? "screenshot" : block.type;

    parts.push(
      `<!-- nd:block ${block.id} ${block.type} ${block.createdAt}${block.collapsed ? " collapsed" : ""}${serializeClassification(block)} -->`
    );
    parts.push(`## ${time} · ${typeLabel}`);
    parts.push("");
    parts.push(block.content);
    parts.push("");
    parts.push(`<!-- nd:endblock ${block.id} -->`);
    parts.push("");
  }

  // ─── Data Section (assets) ──────────────────────────────────
  const assetEntries = Object.entries(doc.assets);
  const preservedLines = doc.preservedAssetLines ?? [];
  if (assetEntries.length > 0 || preservedLines.length > 0) {
    parts.push("<!-- nd:data -->");
    parts.push("");
    for (const [id, asset] of assetEntries) {
      parts.push(`[${id}]: data:${asset.mime};base64,${asset.base64}`);
      parts.push("");
    }
    for (const line of preservedLines) {
      parts.push(line);
      parts.push("");
    }
    parts.push("<!-- nd:enddata -->");
  }

  return parts.join("\n");
}

function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"');
}

/**
 * Serialize classification metadata into the block marker's trailing
 * attributes, e.g. `lang=python src=user conf=1.00 cand=javascript,typescript`.
 *
 * Written as plain `key=value` pairs inside the existing HTML comment, so an
 * older Notedown (or any other markdown reader) still sees a valid comment and
 * a newer one can read the metadata back. Nothing here is required for the
 * document to make sense — a block with no metadata is simply unclassified.
 */
function serializeClassification(block: Block): string {
  const classification = block.classification;
  if (!classification) return "";
  const attrs: string[] = [];
  if (classification.language) attrs.push(`lang=${classification.language}`);
  attrs.push(`src=${classification.source}`);
  attrs.push(`conf=${classification.confidence.toFixed(2)}`);
  if (classification.candidates && classification.candidates.length > 0) {
    attrs.push(`cand=${classification.candidates.join(",")}`);
  }
  return attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
}
