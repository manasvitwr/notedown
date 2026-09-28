import type { DocumentState } from "../types";
import { parseNotedownFile, createPlainImport } from "./markdownParser";

export interface ImportResult {
  doc: DocumentState;
  blockCount: number;
  assetCount: number;
  warnings: string[];
  isNotedownFormat: boolean;
}

/**
 * Read a File object and parse it into a DocumentState.
 */
export async function importFile(file: File): Promise<ImportResult> {
  const warnings: string[] = [];

  const text = await file.text();

  let doc: DocumentState;
  let isNotedownFormat = false;

  try {
    doc = parseNotedownFile(text, file.name);
    isNotedownFormat = text.includes("notedown:");
  } catch (err) {
    warnings.push(
      `Parse warning: ${err instanceof Error ? err.message : "Unknown error"}. Imported as plain text.`
    );
    doc = createPlainImport(text, file.name);
  }

  if (!isNotedownFormat) {
    warnings.push("No Notedown metadata found. Imported as plain markdown.");
  }

  return {
    doc,
    blockCount: doc.blocks.length,
    assetCount: Object.keys(doc.assets).length,
    warnings,
    isNotedownFormat,
  };
}

/**
 * Extensions the import picker offers. Anything the classifier can name is
 * worth importing: the extension is real context, and a file the user chose
 * deliberately is classified from its content *and* its name.
 */
const IMPORT_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".js",
  ".mjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".sql",
  ".sh",
  ".bash",
  ".css",
  ".html",
  ".htm",
  ".xml",
  ".svg",
];

/**
 * Open a file picker and return the selected file.
 */
export function openFilePicker(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = [
      ...IMPORT_EXTENSIONS,
      "text/markdown",
      "text/plain",
      "application/json",
    ].join(",");
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}
