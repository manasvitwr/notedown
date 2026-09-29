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
 * Transcript-ish only when at least two *different lines* look like transcript
 * lines.
 *
 * Counting patterns is not the same as counting lines: "Moderator: hi" matches
 * both the speaker pattern and the generic "Name: ..." pattern, so a single chat
 * message would satisfy a two-pattern threshold on its own and turn a one-line
 * note into a transcript block. A real transcript is a conversation — it has
 * more than one turn on the page.
 */
export function isTranscript(prepared: PreparedContent): boolean {
  return transcriptLines(prepared).length >= 2;
}

/** Indexes of the distinct lines at least one transcript pattern matched. */
function transcriptLines(prepared: PreparedContent): number[] {
  const matched: number[] = [];
  prepared.text.split("\n").forEach((line, index) => {
    if (TRANSCRIPT_PATTERNS.some((pattern) => pattern.re.test(line))) {
      matched.push(index);
    }
  });
  return matched;
}

/** Which patterns fired — reported as classification signals. */
export function transcriptSignalKinds(prepared: PreparedContent): string[] {
  return TRANSCRIPT_PATTERNS.filter((pattern) => pattern.re.test(prepared.text)).map(
    (pattern) => pattern.kind
  );
}
