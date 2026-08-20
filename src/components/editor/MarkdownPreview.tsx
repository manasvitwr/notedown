import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import { useDocumentStore } from "../../store/useDocumentStore";
import type { Asset } from "../../types";

// Initialize markdown-it with highlight.js
const md = MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  highlight: (str: string, lang: string) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch {
        /* fallthrough */
      }
    }
    // Auto-detect
    try {
      return hljs.highlightAuto(str).value;
    } catch {
      /* fallthrough */
    }
    return "";
  },
});

// Custom renderer: resolve [img_xxx] reference-style links to inline data URIs
const defaultRender =
  md.renderer.rules.image ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const src = token.attrGet("src") ?? "";

  // If src is a reference ID like "img_001", resolve from assets
  const assets = (env as { assets?: Record<string, Asset> } | undefined)?.assets;
  if (assets && src in assets) {
    const asset = assets[src];
    token.attrSet("src", `data:${asset.mime};base64,${asset.base64}`);
  }

  return defaultRender(tokens, idx, options, env, self);
};

interface MarkdownPreviewProps {
  markdown: string;
}

export function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  const doc = useDocumentStore((s) => s.doc);

  // Pre-process: convert reference-style images to inline
  // The .nd.md format uses [img_001]: data:... at the bottom
  // We need to include these reference definitions for markdown-it to resolve them
  const processedMarkdown = useMemo(() => {
    if (!doc) return markdown;

    // Append reference definitions so markdown-it can resolve them
    let result = markdown;
    const assetEntries = Object.entries(doc.assets);
    if (assetEntries.length > 0) {
      const alreadyHasRefs = markdown.includes("<!-- nd:data -->");
      if (!alreadyHasRefs) {
        result += "\n\n";
        for (const [id, asset] of assetEntries) {
          result += `[${id}]: data:${asset.mime};base64,${asset.base64}\n`;
        }
      }
    }

    return result;
  }, [markdown, doc]);

  const html = useMemo(
    () => md.render(processedMarkdown),
    [processedMarkdown]
  );

  return (
    <div
      className="nd-preview p-4 overflow-y-auto h-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
