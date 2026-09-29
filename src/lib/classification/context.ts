import { FILE_EXTENSION_LANGUAGES } from "./config";
import type { CaptureContext, CodeLanguage } from "./types";

/**
 * Layer 1 helpers for reading the metadata a capture arrives with: file
 * extension, mime type, existing block type. Metadata is the cheapest and
 * strongest signal available, so it is resolved here — before any content
 * inspection — and cached in the pipeline's content-hash memo afterwards.
 */

/** Normalize "config.JSON" / ".json" / "JSON" to "json". */
export function normalizeExtension(value?: string): string | undefined {
  if (!value) return undefined;
  const ext = value.trim().toLowerCase().replace(/^\.+/, "");
  return ext || undefined;
}

/** Extract the extension from a filename, if it has one. */
export function extensionOf(filename?: string): string | undefined {
  if (!filename) return undefined;
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return normalizeExtension(base.slice(dot + 1));
}

/**
 * The extension to trust, plus whether it is trustworthy at all. An explicit
 * `fileExtension` (the caller knows where the content came from) and any
 * filename attached to an `import` are deliberate choices; a filename riding
 * along with pasted text is not.
 */
export function contextExtension(context?: CaptureContext): {
  extension?: string;
  trusted: boolean;
} {
  if (!context) return { trusted: false };
  const explicit = normalizeExtension(context.fileExtension);
  if (explicit) return { extension: explicit, trusted: true };
  const fromName = extensionOf(context.filename);
  return {
    extension: fromName,
    trusted: fromName !== undefined && context.source === "import",
  };
}

/** The language a trusted extension implies, if any. */
export function languageFromExtension(context?: CaptureContext): CodeLanguage | undefined {
  const { extension, trusted } = contextExtension(context);
  if (!trusted || !extension) return undefined;
  return FILE_EXTENSION_LANGUAGES[extension];
}
