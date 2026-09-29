import type { Block, BlockType } from "../../types";
import type {
  BlockClassification,
  CaptureContext,
  CaptureType,
  ClassificationResult,
  CodeLanguage,
} from "./types";
import { LANGUAGE_LABELS, MIN_CONFIDENCE } from "./config";
import { classifyCapture } from "./classifier";
import { detectLink, stripTrailingPunctuation } from "./link";

/**
 * Map a persisted `BlockType` onto the canonical capture taxonomy. `transcript`
 * is an app-level subtype of `text` (it exists in the `.nd.md` format and in
 * existing documents), so it folds back to `text` here rather than becoming a
 * sixth top-level type.
 */
export function captureTypeOf(type: BlockType): CaptureType {
  return type === "transcript" ? "text" : type;
}

/** Human-readable language name, or "Code" when no language was named. */
export function languageLabel(language?: string): string {
  if (!language) return "Code";
  return LANGUAGE_LABELS[language as keyof typeof LANGUAGE_LABELS] ?? "Code";
}

export interface FencedContent {
  /** The code itself, with the fence removed. */
  body: string;
  /** The language written on the opening fence, if any. */
  language?: string;
}

/**
 * Unwrap a fenced code block, or return null when the content is not fenced.
 *
 * Needed whenever a block's classification changes: the fence is *derived*
 * state — it is written from the classification on the way in and removed from
 * it on the way out, so a re-classification can never leave a ```fence behind
 * on a block that is no longer code.
 *
 * An unclosed fence is not a fence: there is nothing to unwrap, so the content
 * is reported as unfenced and left for the classifier to judge as written.
 */
export function parseFence(content: string): FencedContent | null {
  const match = /^```[ \t]*([\w+#-]*)[ \t]*\n([\s\S]*?)\n?```$/.exec(content.trim());
  if (!match) return null;
  const language = match[1].trim();
  return {
    body: match[2].replace(/\s+$/, ""),
    ...(language ? { language } : {}),
  };
}

/** Wrap code in a fence, with the language when one is known. */
export function fenceContent(body: string, language?: string): string {
  const trimmed = body.replace(/\s+$/, "");
  return "```" + (language ?? "") + "\n" + trimmed + "\n```";
}

/**
 * Turn captured text into the markdown that gets stored in the block.
 *
 * The fence is *derived* state, so whatever fence arrived with the capture is
 * dropped here and code is re-fenced from the verdict. That keeps the stored
 * markdown from ever contradicting the classification stored beside it, and
 * gives an incoming ```python fence the same treatment on the way in as
 * `applyClassification` gives it on the way out.
 */
export function formatCaptureContent(
  result: Pick<ClassificationResult, "type" | "language">,
  content: string
): string {
  const fenced = parseFence(content);
  const body = (fenced ? fenced.body : content).trim();
  if (result.type === "link") {
    // A bare URL becomes a markdown link; markdown link syntax the user already
    // captured is left exactly as it is, because wrapping it would break it.
    // The href comes from `detectLink` itself and the label from the same
    // trailing-punctuation strip, so a copied "https://example.com." cannot end
    // up with the full stop inside the URL.
    const match = detectLink(body);
    if (match && match.kind !== "markdown-link") {
      return `[${stripTrailingPunctuation(body)}](${match.url})`;
    }
    return body;
  }
  if (result.type === "code") {
    return fenceContent(body, result.language);
  }
  return body;
}

/**
 * Classify raw captured text and return the markdown to store, in one step.
 *
 * Every capture path — paste, file import, typed text — goes through here, so
 * they cannot drift apart. A fence that arrived *with* the capture is stripped
 * before classification, because a pasted ```python block is code, not text
 * that happens to mention a fence: `JSON.parse("{...}")` fails on the fence
 * lines, and the fence itself reads as an ordinary special token. The same rule
 * `applyClassification` applies when a block is re-classified later.
 */
export function classifyAndFormatCapture(
  content: string,
  context?: CaptureContext
): { result: ClassificationResult; content: string } {
  const fenced = parseFence(content);
  const body = fenced ? fenced.body : content;
  const result = classifyCapture(body, context);
  return { result, content: formatCaptureContent(result, body) };
}

/**
 * Badge text for a block: "Code · Python" when a language was named with
 * enough confidence, plain "Code" when the classifier stayed conservative.
 * Blocks persisted before this feature (no classification metadata) fall back
 * to their type label.
 */
export function describeBlockClassification(block: Block): string {
  const classification: BlockClassification | undefined = block.classification;
  if (block.type !== "code") return block.type;
  return languageLabel(classification?.language);
}

/**
 * Project a classification result onto the metadata persisted with a block.
 *
 * Returns `undefined` below `MIN_CONFIDENCE`: a result that weak carries no
 * information, and writing a low-confidence value to disk would only make the
 * block look classified when it is not.
 */
export function toBlockClassification(
  result: ClassificationResult,
  source: BlockClassification["source"] = "automatic"
): BlockClassification | undefined {
  if (result.confidence < MIN_CONFIDENCE) return undefined;
  const classification: BlockClassification = {
    source: result.userConfirmed ? "user" : source,
    // Two decimals are plenty for display and keep the marker compact.
    confidence: Math.round(result.confidence * 100) / 100,
  };
  if (result.language) classification.language = result.language;
  // Only keep runner-up languages when the classifier declined to pick one —
  // once a language is named, the alternatives are noise.
  else if (result.candidates && result.candidates.length > 1) {
    classification.candidates = result.candidates;
  }
  return classification;
}

/**
 * Build the persisted classification for a user override: certain by
 * definition, and explicitly owned by the user so later automatic passes leave
 * it alone.
 */
export function userClassification(
  language?: CodeLanguage
): BlockClassification {
  const classification: BlockClassification = { source: "user", confidence: 1 };
  if (language) classification.language = language;
  return classification;
}
