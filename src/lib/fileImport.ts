import type { DocumentState } from "../types";
import { parseNotedownFile } from "./markdownParser";

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
      `Parse error: ${err instanceof Error ? err.message : "Unknown error"}. Imported as plain text.`
    );
    doc = parseNotedownFile(text, file.name);
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
 * Open a file picker and return the selected file.
 */
export function openFilePicker(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.nd.md,text/markdown";
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}
