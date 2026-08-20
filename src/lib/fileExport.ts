import type { DocumentState } from "../types";
import { serializeDocument } from "./markdownSerializer";
import { FILE_EXTENSION } from "../constants/defaults";

/**
 * Export a document as a downloadable .nd.md file.
 */
export function exportDocument(doc: DocumentState): void {
  const markdown = serializeDocument(doc);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const slug = doc.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const filename = `${slug}${FILE_EXTENSION}`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Get the serialized markdown string and its byte size.
 */
export function getExportInfo(doc: DocumentState): {
  markdown: string;
  sizeBytes: number;
  filename: string;
} {
  const markdown = serializeDocument(doc);
  const sizeBytes = new Blob([markdown]).size;
  const slug = doc.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    markdown,
    sizeBytes,
    filename: `${slug}${FILE_EXTENSION}`,
  };
}
