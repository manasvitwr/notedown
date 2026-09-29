import type { BlockType } from "../../types";

/**
 * The canonical capture taxonomy. Deliberately small: language is metadata, not
 * a type. New capture categories must become a `CodeLanguage` (or a
 * `ClassificationSignal`), never a new entry here.
 */
export const CAPTURE_TYPES = [
  "text",
  "code",
  "image",
  "link",
  "mixed",
] as const;
export type CaptureType = (typeof CAPTURE_TYPES)[number];

/**
 * Languages the classifier can name. `html` covers XML/JSX/SVG markup
 * (`highlight.js` calls that grammar `xml`), `bash` is the shell grammar.
 * Anything not on this list is reported as plain `code` with no language.
 */
export const CODE_LANGUAGES = [
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
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

/** Which pipeline layer produced a signal. */
export type SignalLayer = 1 | 2 | 3 | 4 | 5;

/** The three independent evidence families the scorer combines. */
export type SignalGroup = "structural" | "highlight" | "syntax";

/**
 * One piece of evidence, recorded so a classification can be explained in tests
 * and in the dev-only inspector. Never rendered in the normal UI.
 */
export interface ClassificationSignal {
  layer: SignalLayer;
  /** Stable id, e.g. `url.single`, `json.parse-ok`. */
  kind: string;
  /** Which evidence family this signal contributes to. */
  group: SignalGroup;
  /** 0..1 strength of this single signal. */
  score: number;
  /** Short human-readable explanation. Debug surface only. */
  detail?: string;
}

/** Optional context that makes classification cheaper and more certain. */
export interface CaptureContext {
  source?: "clipboard" | "manual" | "browser" | "import";
  filename?: string;
  fileExtension?: string;
  mimeType?: string;
  /** Type the capture already has, e.g. an asset-backed image block. */
  blockType?: BlockType;
}

export interface ClassificationResult {
  /** Canonical type. The only thing the main UI branches on. */
  type: CaptureType;
  /**
   * What to persist as `Block.type`. Differs from `type` only for the legacy
   * `transcript` app subtype of `text` (see `captureTypeOf`).
   */
  blockType: BlockType;
  /** Only set above `LANGUAGE_THRESHOLD` and outside the ambiguity margin. */
  language?: CodeLanguage;
  /** 0..1 confidence in `type` + `language` together. */
  confidence: number;
  /** Full evidence trail, for tests and the dev inspector. */
  signals: ClassificationSignal[];
  /** True when the user, not the classifier, owns this decision. */
  userConfirmed?: boolean;
  /** Runner-up languages, kept for the ambiguity rule and debugging. */
  candidates?: CodeLanguage[];
}

/** Persisted per-block classification metadata (optional, backward compatible). */
export interface BlockClassification {
  source: "automatic" | "user";
  confidence: number;
  language?: CodeLanguage;
  /** Competing languages when the classifier refused to pick one. */
  candidates?: string[];
}
