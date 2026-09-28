import { MAX_DETECT_LENGTH, MAX_INSPECTED_LINES } from "./config";

/**
 * Shared, normalized view of a capture that every layer inspects. Prepared once
 * per classification (and memoized) so the rules below can stay simple regex
 * checks instead of each re-parsing the string.
 */
export interface PreparedContent {
  /** Trimmed content, length-capped. */
  text: string;
  /** Content with URLs blanked out, so URL punctuation never reads as syntax. */
  textNoUrls: string;
  /** Significant (non-blank) lines, capped at MAX_INSPECTED_LINES. */
  lines: string[];
  /** Significant line count before the cap. */
  lineCount: number;
  /** Word-ish token count of the whole capture. */
  wordCount: number;
  /** Hits from a small English stopword list — a prose signal. */
  proseHits: number;
}

const URL_RE = /https?:\/\/\S+/g;
const WORD_RE = /[A-Za-z']+/g;
const PROSE_WORDS = new Set([
  "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at",
  "back", "be", "because", "been", "before", "being", "but", "by", "can",
  "could", "did", "do", "does", "each", "for", "from", "get", "had", "has",
  "have", "he", "her", "here", "him", "his", "how", "i", "if", "in", "into",
  "is", "it", "its", "just", "know", "like", "look", "make", "me", "more",
  "most", "my", "need", "no", "not", "now", "of", "on", "one", "only", "or",
  "other", "our", "out", "over", "people", "should", "so", "some", "such",
  "than", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "those", "to", "too", "up", "use", "very", "was", "way", "we",
  "well", "were", "what", "when", "where", "which", "who", "why", "will",
  "with", "would", "you", "your",
]);

/** Blank out URLs so `https://x.com/a;b` never contributes a semicolon signal. */
export function stripUrls(text: string): string {
  return text.replace(URL_RE, " ");
}

export function countProseWords(text: string): {
  wordCount: number;
  proseHits: number;
} {
  const words = text.match(WORD_RE) ?? [];
  let proseHits = 0;
  for (const word of words) {
    if (PROSE_WORDS.has(word.toLowerCase())) proseHits += 1;
  }
  return { wordCount: words.length, proseHits };
}

export function prepareContent(content: string): PreparedContent {
  const text = content.trim().slice(0, MAX_DETECT_LENGTH);
  const allLines = text.split("\n");
  const significant = allLines.filter((line) => line.trim().length > 0);
  const { wordCount, proseHits } = countProseWords(stripUrls(text));
  return {
    text,
    textNoUrls: stripUrls(text),
    lines: significant.slice(0, MAX_INSPECTED_LINES),
    lineCount: significant.length,
    wordCount,
    proseHits,
  };
}
