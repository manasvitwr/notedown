import type { CodeLanguage } from "./types";

/**
 * Every tunable number in the classifier lives here so the behaviour can be
 * retuned from one file (and asserted against in tests) instead of being
 * scattered magic values across the pipeline.
 */

/**
 * Evidence weights, applied to the three independent families:
 *
 *   final = structural*0.45 + highlight*0.35 + syntaxValidation*0.20
 *
 * Weights are renormalized over the families that are actually available — a
 * family with no evidence is omitted and its weight is redistributed, never
 * replaced by an invented score. Structural evidence leads because it is
 * deterministic; `highlight.js` follows but is never trusted alone.
 */
export const CLASSIFIER_WEIGHTS = {
  structural: 0.45,
  highlight: 0.35,
  syntax: 0.2,
} as const;

/** `type: "code"` needs at least this much confidence. */
export const CODE_TYPE_THRESHOLD = 0.7;

/** Naming a specific language needs more confidence than saying "code". */
export const LANGUAGE_THRESHOLD = 0.85;

/** Below this the pipeline reports "insufficient" and falls back to text. */
export const MIN_CONFIDENCE = 0.55;

/**
 * Best minus runner-up must be at least this to name a language. Keeps
 * JavaScript/TypeScript and YAML/prose from producing a confident wrong answer:
 * the result stays `code`, the UI just says "Code".
 */
export const AMBIGUITY_MARGIN = 0.1;

/** Confidence bands, for the dev inspector and for documentation. */
export const CONFIDENCE_BANDS = {
  certain: 0.9,
  strong: 0.75,
  probable: MIN_CONFIDENCE,
} as const;

/** Deterministic proof (valid JSON, matching file extension) lands here. */
export const DETERMINISTIC_CONFIDENCE = 0.95;

/** Below this many characters a "code candidate" is just a short string. */
export const MIN_CODE_LENGTH = 12;

/**
 * Structural score a capture must reach before it is worth running language
 * detection on. Tuned so a single incidental brace or keyword in prose is never
 * enough, while a real (even short) snippet is.
 */
export const CODE_CANDIDATE_THRESHOLD = 0.45;

/** At most this many significant lines are inspected by the structure gate. */
export const MAX_INSPECTED_LINES = 400;

/** Content longer than this is truncated before language detection. */
export const MAX_DETECT_LENGTH = 20_000;

/**
 * Grammars registered on `highlight.js/lib/core`. The common build is
 * deliberately NOT used: 9 grammars cover Notedown's captures at a fraction of
 * the bundle, and auto-detection over a small, relevant set is more reliable
 * than over 190.
 */
export const HIGHLIGHT_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "json",
  "yaml",
  "sql",
  "xml",
  "css",
  "bash",
] as const;

/** Relevance at/above this is treated as a saturated (perfect) hint. */
export const HIGHLIGHT_RELEVANCE_CEILING = 60;

/** Minimum `highlight.js` relevance to count as evidence at all. */
export const MIN_HIGHLIGHT_RELEVANCE = 1;

/**
 * A `highlight.js` verdict only joins the evidence when it is this convincing.
 * A barely-decisive detection (e.g. CSS over YAML) is *uninformative*, and
 * uninformative evidence is omitted rather than averaged in as a low score.
 */
export const HIGHLIGHT_MIN_EVIDENCE = 0.5;

/**
 * A deterministic recognizer at this confidence is itself proof that the
 * content is code, even when generic structural evidence is thin — SQL and
 * YAML have no braces for the structural layer to see. The type score inherits
 * RECOGNIZER_CODE_WEIGHT of that confidence.
 */
export const RECOGNIZER_CODE_FLOOR = 0.75;
export const RECOGNIZER_CODE_WEIGHT = 0.9;

/** Bounded memo cache for classification results, keyed by content hash. */
export const CACHE_LIMIT = 128;

/**
 * Imported-file extensions win over content: the user explicitly handed us a
 * `.py` file, so the extension is a deliberate choice, not a guess. Applies to
 * `source: "import"` only — never to clipboard prose that happens to end in a
 * filename.
 */
export const FILE_EXTENSION_LANGUAGES: Record<string, CodeLanguage> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  py: "python",
  pyi: "python",
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
  html: "html",
  htm: "html",
  xhtml: "html",
  xml: "html",
  svg: "html",
  vue: "html",
  css: "css",
  scss: "css",
  less: "css",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  // NOTE: `md`/`markdown` are deliberately absent. Markdown is Notedown's own
  // document format, so a `.md` file carries no evidence at all — trusting the
  // extension would turn every imported note into "code / markdown".
};

/**
 * Image extensions, used only when an import carries no mime type.
 *
 * `svg` is deliberately absent even though it is an image format: it is also
 * text markup we can store, and an image-typed block with no stored asset is a
 * dead end. Imported SVGs are classified as `html` instead, which is what they
 * are.
 */
export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "avif",
]);

/** Display names for the language picker. */
export const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  json: "JSON",
  yaml: "YAML",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  bash: "Shell",
  markdown: "Markdown",
  plaintext: "Plain text",
};

/** Languages offered in the "change language" picker, in display order. */
export const LANGUAGE_PICKER_ORDER: CodeLanguage[] = [
  "javascript",
  "typescript",
  "python",
  "json",
  "yaml",
  "sql",
  "html",
  "css",
  "bash",
  "markdown",
  "plaintext",
];
