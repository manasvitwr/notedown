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

const BARE_WWW_RE = /^www\.[^\s/$.?#].[^\s]*$/i;
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/**
 * Drop the trailing sentence punctuation a copy leaves on a URL.
 *
 * Exported so the formatter cannot drift from the detector: the href written
 * into the markdown link and the label shown for it must be built from the same
 * stripped text, or "https://example.com." ends up recorded with a full stop in
 * the URL.
 *
 * Brackets are only dropped when they are *unbalanced* — a sentence that ends
 * `.../Foo_(bar))` loses the sentence's bracket, not the URL's, and
 * `.../Foo_(bar)` loses nothing at all.
 */
export function stripTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0) {
    const char = url[end - 1];
    if (CLOSERS[char]) {
      if (isBalanced(url, end)) break;
    } else if (!/[.,;:!?'"]/.test(char)) {
      break;
    }
    end--;
  }
  return url.slice(0, end);
}

/** True when the closers in `text.slice(0, end)` all have a matching opener. */
function isBalanced(text: string, end: number): boolean {
  const counts = { "(": 0, "[": 0, "{": 0, ")": 0, "]": 0, "}": 0 };
  for (let i = 0; i < end; i++) {
    const char = text[i];
    if (char in counts) counts[char as keyof typeof counts]++;
  }
  return counts[")"] <= counts["("] && counts["]"] <= counts["["] && counts["}"] <= counts["{"];
}

/** `[label](href)` with the href read to its matching closing paren. */
function parseMarkdownLink(text: string): { label: string; href: string } | null {
  if (!text.startsWith("[")) return null;
  const labelEnd = text.indexOf("](");
  if (labelEnd < 0) return null;

  let depth = 1;
  for (let i = labelEnd + 2; i < text.length; i++) {
    const char = text[i];
    if (/\s/.test(char)) return null;
    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth === 0) {
        // Nothing but the closing paren may follow.
        return i === text.length - 1
          ? { label: text.slice(1, labelEnd), href: text.slice(labelEnd + 2, i) }
          : null;
      }
    }
  }
  return null;
}

function parseUrl(candidate: string): URL | null {
  try {
    const url = new URL(candidate);
    return LINK_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Detect a link capture. Returns null for anything that is not essentially a
 * single URL: empty content, multi-line content, prose with a link inside it,
 * or an unsupported protocol.
 *
 * A Markdown link is deliberately *not* a bare URL: it is already a link, and
 * wrapping it in another one would break its own syntax. Callers that rewrite
 * the content check `kind` rather than assuming every match needs wrapping.
 */
export function detectLink(content: string): LinkMatch | null {
  const trimmed = content.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  // Markdown link syntax on its own line: [label](url)
  const md = parseMarkdownLink(trimmed);
  if (md) {
    const url = parseUrl(stripTrailingPunctuation(md.href));
    if (url) return { url: url.href, kind: "markdown-link" };
    return null;
  }

  const withoutTrailing = stripTrailingPunctuation(trimmed);
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
