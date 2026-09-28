import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import { useDocumentStore } from "../../store/useDocumentStore";
import { dataUri, BLANK_IMAGE_SRC } from "../../lib/imageMime";
import { extractDefinedReferenceIds } from "../../lib/assetIds";
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
    const uri = dataUri(assets[src]);
    // Neutralize the src when the asset's MIME is outside the allowlist:
    // rendering the reference id would emit a broken image instead.
    token.attrSet("src", uri ?? BLANK_IMAGE_SRC);
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

    // Append the definitions this markdown actually lacks. Marker text is not a
    // signal: the system nd:data section is stripped before the preview renders,
    // and a data marker inside a user block would otherwise suppress every real
    // definition and leave the images unresolved.
    const defined = new Set(extractDefinedReferenceIds(markdown));
    let appended = "";
    for (const [id, asset] of Object.entries(doc.assets)) {
      if (defined.has(id)) continue;
      const uri = dataUri(asset);
      if (uri) appended += `[${id}]: ${uri}\n`;
    }
    return appended ? `${markdown}\n\n${appended}` : markdown;
  }, [markdown, doc]);

  const html = useMemo(() => {
    const rendered = md.render(processedMarkdown);
    // Post-process: convert block markers into scrollable anchor divs.
    // With html:false markdown-it escapes the markers (e.g.
    // "&lt;!-- nd:block ... --&gt;"), so a marker alone on its line becomes its
    // own <p>. Match that shape to wrap each block's content in an anchor div.
    // Collapsed blocks get a CSS class that hides their content.
    return rendered
      .replace(
        /<p>&lt;!-- nd:block (\S+) \S+ \S+ collapsed --&gt;<\/p>\s*([\s\S]*?)\s*<p>&lt;!-- nd:endblock \1 --&gt;<\/p>/g,
        '<div id="block-$1" class="nd-block-anchor nd-block-collapsed">$2</div>'
      )
      .replace(
        /<p>&lt;!-- nd:block (\S+) \S+ \S+ --&gt;<\/p>\s*([\s\S]*?)\s*<p>&lt;!-- nd:endblock \1 --&gt;<\/p>/g,
        '<div id="block-$1" class="nd-block-anchor">$2</div>'
      )
      .replace(/<p>&lt;!-- nd:\w+ --&gt;<\/p>\s*/g, "");
  }, [processedMarkdown]);

  return (
    <div
      className="nd-preview p-4 overflow-y-auto h-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
