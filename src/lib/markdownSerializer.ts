import type { DocumentState } from "../types";
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
      `<!-- nd:block ${block.id} ${block.type} ${block.createdAt} -->`
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
  if (assetEntries.length > 0) {
    parts.push("<!-- nd:data -->");
    parts.push("");
    for (const [id, asset] of assetEntries) {
      parts.push(`[${id}]: data:${asset.mime};base64,${asset.base64}`);
      parts.push("");
    }
    parts.push("<!-- nd:enddata -->");
  }

  return parts.join("\n");
}

function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"');
}
