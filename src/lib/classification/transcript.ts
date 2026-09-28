import type { PreparedContent } from "./content";

/**
 * Legacy app subtype: `transcript`.
 *
 * Kept because it is a `BlockType` in the `.nd.md` format, in the badge config
 * and in documents created before the taxonomy was pinned down. It is *not* a
 * sixth top-level capture type — `captureTypeOf("transcript")` is `text` — and
 * it never outranks code detection.
 */

const TRANSCRIPT_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: "transcript.timestamp", re: /\[\d{1,2}:\d{2}(?::\d{2})?\]/ },
  { kind: "transcript.clock", re: /^\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[–-]\s*\d{1,2}:\d{2}(?::\d{2})?)?\s+(?=\S)/m },
  { kind: "transcript.speaker", re: /^(?:Speaker \d+|Host|Guest|Interviewer|Moderator)\s*:/im },
  { kind: "transcript.name-colon", re: /^[A-Z][a-z]{1,20}\s*:\s+\S/m },
];

/**
 * Transcript-ish only when at least two independent patterns match, so a
 * single capitalised "Name: ..." line in a note is not a transcript.
 */
export function isTranscript(prepared: PreparedContent): boolean {
  const matched = TRANSCRIPT_PATTERNS.filter((pattern) => pattern.re.test(prepared.text));
  return matched.length >= 2;
}

/** Which patterns fired — reported as classification signals. */
export function transcriptSignalKinds(prepared: PreparedContent): string[] {
  return TRANSCRIPT_PATTERNS.filter((pattern) => pattern.re.test(prepared.text)).map(
    (pattern) => pattern.kind
  );
}
