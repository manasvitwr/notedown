/**
 * Layer 1 — deterministic link detection.
 *
 * Runs before any code detection so a URL can never be dragged through the
 * language-detection pipeline just because it contains punctuation. A capture
 * is only a link when it is *essentially* one URL: a prose sentence that happens
 * to contain a link is not a link block.
 */

export type LinkKind = "single-url" | "bare-www" | "markdown-link";

export interface LinkMatch {
  /** The normalized URL to use when rewriting the block content. */
  url: string;
  kind: LinkKind;
}

/** Protocols we treat as a bare link capture. */
const LINK_PROTOCOLS = new Set([
  "http:",
  "https:",
  "ftp:",
  "ftps:",
  "mailto:",
]);

const MD_LINK_RE = /^\[([^\]\n]*)\]\(\s*((?:https?:\/\/|ftp:\/\/|mailto:)[^)\s]+)\s*\)$/;
const BARE_WWW_RE = /^www\.[^\s/$.?#].[^\s]*$/i;
/** Punctuation a human (or a reader) leaves at the end of a copied URL. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

function parseUrl(candidate: string): URL | null {
  try {
    const url = new URL(candidate);
    return LINK_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * A single-line capture that is nothing but a URL. Trailing sentence punctuation
 * is tolerated (people copy "https://example.com." out of prose) but is not
 * part of the URL itself.
 *
 * A Markdown link is deliberately *not* a bare URL: it is already a link, and
 * wrapping it in `[[...]]` would break its own syntax.
 */
export function isBareUrl(content: string): boolean {
  const match = detectLink(content);
  return match !== null && match.kind !== "markdown-link";
}

/**
 * Detect a link capture. Returns null for anything that is not essentially a
 * single URL: empty content, multi-line content, prose with a link inside it,
 * or an unsupported protocol.
 */
export function detectLink(content: string): LinkMatch | null {
  const trimmed = content.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  // Markdown link syntax on its own line: [label](url)
  const md = MD_LINK_RE.exec(trimmed);
  if (md) {
    const url = parseUrl(md[2].replace(TRAILING_PUNCTUATION, ""));
    if (url) return { url: url.href, kind: "markdown-link" };
    return null;
  }

  const withoutTrailing = trimmed.replace(TRAILING_PUNCTUATION, "");
  const parsed = parseUrl(withoutTrailing);
  if (parsed) {
    // Keep the captured text verbatim in the href: no silent normalization
    // (trailing slash added, host lowercased) of something the user copied.
    return { url: withoutTrailing, kind: "single-url" };
  }

  if (BARE_WWW_RE.test(withoutTrailing)) {
    return { url: `https://${withoutTrailing}`, kind: "bare-www" };
  }

  return null;
}
